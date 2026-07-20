/**
 * 基于 JSON 文件的后端数据仓库。
 *
 * library.json 只保存分组和项目摘要；每篇文章则独立保存在 projects/<UUID>.json。
 * 所有公开写操作都遵循“校验输入 → 生成新对象 → 原子写盘 → 更新索引”的顺序。
 * 这个类不依赖 Electron，因此可以直接在 Vitest 的 Node 环境中测试。
 */
import { randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import path from 'node:path'
import type { ZodType, ZodTypeDef } from 'zod'
import {
  AnnotationSchema,
  AnnotationStylesPatchSchema,
  CreateAnnotationInputSchema,
  CreateGroupInputSchema,
  CreateProjectInputSchema,
  DATA_SCHEMA_VERSION,
  LibrarySchema,
  ProjectDocumentSchema,
  ProjectGroupSchema,
  SHARE_FORMAT,
  SHARE_FORMAT_VERSION,
  SharePackageSchema,
  UpdateAnnotationInputSchema,
  UpdateGroupInputSchema,
  UpdateProjectInputSchema,
  createDefaultAnnotationStyles,
  createProjectSummary,
  type Annotation,
  type AnnotationStylesPatch,
  type CreateAnnotationInput,
  type CreateGroupInput,
  type CreateProjectInput,
  type Library,
  type ProjectDocument,
  type ProjectGroup,
  type ProjectSummary,
  type SharePackage,
  type UpdateAnnotationInput,
  type UpdateGroupInput,
  type UpdateProjectInput,
} from '../shared/models'
import { isAnnotationTypeAllowed } from '../shared/annotation-rules'
import { AppError, normalizeError } from './errors'
import { migrateAnnotationsForTextChange } from '../shared/text-migration'

const DEFAULT_GROUP_COLOR = '#64748B'
// 防止误选特别大的文件后占用过多内存；当前分享包上限为 25 MB。
const MAX_IMPORT_BYTES = 25 * 1024 * 1024

/** 判断文件是否存在；只有“不存在”返回 false，权限等其他错误仍向上抛出。 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') return false
    throw error
  }
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  // 先写同目录临时文件，成功后再 rename 覆盖目标文件，可避免中途崩溃留下半截 JSON。
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  const contents = `${JSON.stringify(value, null, 2)}\n`
  let handle: Awaited<ReturnType<typeof open>> | undefined

  try {
    // wx 表示只创建新文件；0o600 表示只允许当前用户读写临时文件。
    handle = await open(temporaryPath, 'wx', 0o600)
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporaryPath, filePath)
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function readValidatedJson<T>(
  filePath: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  description: string,
): Promise<T> {
  // 磁盘内容先作为 unknown 读取，解析后必须通过对应 Zod Schema 才能返回 T。
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError('VALIDATION', `${description}不是有效的 JSON`, undefined, { cause: error })
    }
    throw error
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new AppError(
      'VALIDATION',
      `${description}的数据结构不正确`,
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }
  return result.data
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('zh-CN')
}

export interface ImportResult {
  project: ProjectDocument
  groupCreated: boolean
  idChanged: boolean
}

export class JsonRepository {
  readonly dataDirectory: string
  readonly projectsDirectory: string
  readonly libraryFile: string
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(dataDirectory: string) {
    this.dataDirectory = path.resolve(dataDirectory)
    this.projectsDirectory = path.join(this.dataDirectory, 'projects')
    this.libraryFile = path.join(this.dataDirectory, 'library.json')
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    // 把读写串行化，防止两个点击同时改写 library.json 时互相覆盖。
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private projectFile(projectId: string): string {
    // ID 必须是 UUID，既保证数据合法，也阻止通过 ../ 逃离 projects 目录。
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new AppError('VALIDATION', '项目 ID 格式不正确')
    }
    return path.join(this.projectsDirectory, `${projectId}.json`)
  }

  async initialize(): Promise<void> {
    // 第一次启动创建空资料库；已经存在时只校验，绝不覆盖用户数据。
    return this.enqueue(async () => {
      await mkdir(this.projectsDirectory, { recursive: true })
      if (await pathExists(this.libraryFile)) {
        const library = await this.readLibraryUnlocked()
        if (library.stylePreferencesVersion !== 1) {
          // 旧版每篇文章各存一份样式：以最近编辑文章作为用户全局预设，只迁移一次。
          const latestProject = [...library.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
          const defaultStyles = latestProject
            ? (await this.readProjectUnlocked(latestProject.id)).styles
            : library.defaultStyles
          await atomicWriteJson(this.libraryFile, LibrarySchema.parse({
            ...library,
            stylePreferencesVersion: 1,
            defaultStyles,
            updatedAt: nowIso(),
          }))
        }
        return
      }

      const now = nowIso()
      const library = LibrarySchema.parse({
        schemaVersion: DATA_SCHEMA_VERSION,
        stylePreferencesVersion: 1,
        groups: [],
        projects: [],
        defaultStyles: createDefaultAnnotationStyles(),
        createdAt: now,
        updatedAt: now,
      })
      await atomicWriteJson(this.libraryFile, library)
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  private readLibraryUnlocked(): Promise<Library> {
    return readValidatedJson(this.libraryFile, LibrarySchema, '项目索引')
  }

  private readProjectUnlocked(projectId: string): Promise<ProjectDocument> {
    return readValidatedJson(this.projectFile(projectId), ProjectDocumentSchema, '项目文件')
  }

  getLibrary(): Promise<Library> {
    // 返回轻量索引，首页无需一次读入所有文章正文。
    return this.enqueue(() => this.readLibraryUnlocked()).catch((error) => {
      throw normalizeError(error)
    })
  }

  listProjects(): Promise<ProjectSummary[]> {
    // 复制后排序，避免直接修改 library.projects 原数组。
    return this.enqueue(async () => {
      const library = await this.readLibraryUnlocked()
      return [...library.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  getProject(projectId: string): Promise<ProjectDocument> {
    // 先检查索引，再读取独立项目文件；显示样式始终使用本机资料库预设。
    return this.enqueue(async () => {
      const library = await this.readLibraryUnlocked()
      if (!library.projects.some((project) => project.id === projectId)) {
        throw new AppError('NOT_FOUND', '项目不存在')
      }
      const project = await this.readProjectUnlocked(projectId)
      return ProjectDocumentSchema.parse({ ...project, styles: library.defaultStyles })
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  createProject(input: CreateProjectInput): Promise<ProjectDocument> {
    // 创建项目时同时产生项目文件和 library.json 摘要，两者必须保持一致。
    return this.enqueue(async () => {
      const validatedInput = CreateProjectInputSchema.parse(input)
      const library = await this.readLibraryUnlocked()
      const groupId = validatedInput.groupId ?? null
      this.assertGroupExists(library, groupId)

      let projectId = randomUUID()
      // UUID 冲突概率极低，但仍显式检查索引和磁盘，保证不会覆盖已有项目。
      while (library.projects.some((project) => project.id === projectId) || (await pathExists(this.projectFile(projectId)))) {
        projectId = randomUUID()
      }

      const now = nowIso()
      const project = ProjectDocumentSchema.parse({
        schemaVersion: DATA_SCHEMA_VERSION,
        id: projectId,
        metadata: validatedInput.metadata,
        originalText: validatedInput.originalText,
        groupId,
        annotations: [],
        styles: library.defaultStyles,
        createdAt: now,
        updatedAt: now,
      })
      const nextLibrary = LibrarySchema.parse({
        ...library,
        projects: [...library.projects, createProjectSummary(project)],
        updatedAt: now,
      })

      await this.writeNewProjectAndLibrary(project, nextLibrary)
      return project
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  updateProject(projectId: string, patch: UpdateProjectInput): Promise<ProjectDocument> {
    // patch 只含发生变化的字段；原文改变时还要迁移所有批注坐标。
    return this.enqueue(async () => {
      const validatedPatch = UpdateProjectInputSchema.parse(patch)
      const library = await this.readLibraryUnlocked()
      const previous = await this.requireProjectUnlocked(library, projectId)
      const groupId = validatedPatch.groupId === undefined ? previous.groupId : validatedPatch.groupId
      this.assertGroupExists(library, groupId)
      const now = nowIso()
      const originalText = validatedPatch.originalText ?? previous.originalText
      const annotations = validatedPatch.originalText === undefined
        ? previous.annotations
        : migrateAnnotationsForTextChange(previous.annotations, previous.originalText, originalText, now).annotations
      const project = ProjectDocumentSchema.parse({
        ...previous,
        metadata: { ...previous.metadata, ...validatedPatch.metadata },
        originalText,
        annotations,
        groupId,
        // 项目文件中的旧样式仅用于兼容，当前本机预设始终覆盖它。
        styles: library.defaultStyles,
        updatedAt: now,
      })

      await this.persistUpdatedProject(previous, project, library)
      return project
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  deleteProject(projectId: string): Promise<{ id: string }> {
    // 先把项目文件改名为墓碑文件；若索引写入失败，还可以恢复原文件。
    return this.enqueue(async () => {
      const library = await this.readLibraryUnlocked()
      await this.requireProjectUnlocked(library, projectId)
      const projectFile = this.projectFile(projectId)
      const tombstone = path.join(this.projectsDirectory, `.${projectId}.${randomUUID()}.deleting`)
      const nextLibrary = LibrarySchema.parse({
        ...library,
        projects: library.projects.filter((project) => project.id !== projectId),
        updatedAt: nowIso(),
      })

      await rename(projectFile, tombstone)
      try {
        await atomicWriteJson(this.libraryFile, nextLibrary)
      } catch (error) {
        await rename(tombstone, projectFile).catch(() => undefined)
        throw error
      }
      await rm(tombstone, { force: true }).catch(() => undefined)
      return { id: projectId }
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  createGroup(input: CreateGroupInput): Promise<ProjectGroup> {
    // 分组只存在于 library.json，名称比较时忽略首尾空格和大小写差异。
    return this.enqueue(async () => {
      const validatedInput = CreateGroupInputSchema.parse(input)
      const library = await this.readLibraryUnlocked()
      if (library.groups.some((group) => normalizeName(group.name) === normalizeName(validatedInput.name))) {
        throw new AppError('CONFLICT', '已存在同名分组')
      }
      const now = nowIso()
      let groupId = randomUUID()
      while (library.groups.some((group) => group.id === groupId)) groupId = randomUUID()
      const group = ProjectGroupSchema.parse({
        id: groupId,
        name: validatedInput.name,
        color: validatedInput.color ?? DEFAULT_GROUP_COLOR,
        description: validatedInput.description ?? '',
        createdAt: now,
        updatedAt: now,
      })
      const nextLibrary = LibrarySchema.parse({
        ...library,
        groups: [...library.groups, group],
        updatedAt: now,
      })
      await atomicWriteJson(this.libraryFile, nextLibrary)
      return group
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  updateGroup(groupId: string, patch: UpdateGroupInput): Promise<ProjectGroup> {
    // 新名称不能与其他分组重名，但允许分组继续使用自己的旧名称。
    return this.enqueue(async () => {
      const validatedPatch = UpdateGroupInputSchema.parse(patch)
      const library = await this.readLibraryUnlocked()
      const index = library.groups.findIndex((group) => group.id === groupId)
      if (index < 0) throw new AppError('NOT_FOUND', '分组不存在')
      if (
        validatedPatch.name &&
        library.groups.some(
          (group) => group.id !== groupId && normalizeName(group.name) === normalizeName(validatedPatch.name!),
        )
      ) {
        throw new AppError('CONFLICT', '已存在同名分组')
      }

      const group = ProjectGroupSchema.parse({
        ...library.groups[index],
        ...validatedPatch,
        updatedAt: nowIso(),
      })
      const groups = [...library.groups]
      groups[index] = group
      await atomicWriteJson(
        this.libraryFile,
        LibrarySchema.parse({ ...library, groups, updatedAt: group.updatedAt }),
      )
      return group
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  deleteGroup(groupId: string): Promise<{ id: string; reassignedProjectIds: string[] }> {
    // 删除分组不删除文章，而是把该组所有项目的 groupId 改为 null。
    return this.enqueue(async () => {
      const library = await this.readLibraryUnlocked()
      if (!library.groups.some((group) => group.id === groupId)) {
        throw new AppError('NOT_FOUND', '分组不存在')
      }

      const affectedSummaries = library.projects.filter((project) => project.groupId === groupId)
      const previousProjects: ProjectDocument[] = []
      const updatedProjects: ProjectDocument[] = []
      const now = nowIso()
      for (const summary of affectedSummaries) {
        const previous = await this.readProjectUnlocked(summary.id)
        previousProjects.push(previous)
        updatedProjects.push(ProjectDocumentSchema.parse({ ...previous, groupId: null, updatedAt: now }))
      }

      const written: number[] = []
      try {
        // 多个项目逐个写盘，并记录完成位置；失败时用 previousProjects 回滚。
        for (let index = 0; index < updatedProjects.length; index += 1) {
          await atomicWriteJson(this.projectFile(updatedProjects[index].id), updatedProjects[index])
          written.push(index)
        }

        const summariesById = new Map(updatedProjects.map((project) => [project.id, createProjectSummary(project)]))
        const nextLibrary = LibrarySchema.parse({
          ...library,
          groups: library.groups.filter((group) => group.id !== groupId),
          projects: library.projects.map((summary) => summariesById.get(summary.id) ?? summary),
          updatedAt: now,
        })
        await atomicWriteJson(this.libraryFile, nextLibrary)
      } catch (error) {
        await Promise.allSettled(
          written.map((index) => atomicWriteJson(this.projectFile(previousProjects[index].id), previousProjects[index])),
        )
        throw error
      }

      return { id: groupId, reassignedProjectIds: updatedProjects.map((project) => project.id) }
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  createAnnotation(projectId: string, input: CreateAnnotationInput): Promise<Annotation> {
    // 除 Zod 结构校验外，还要执行“字/词/句允许哪些批注类型”的业务校验。
    return this.enqueue(async () => {
      const validatedInput = CreateAnnotationInputSchema.parse(input)
      const library = await this.readLibraryUnlocked()
      const previous = await this.requireProjectUnlocked(library, projectId)
      this.assertAnnotationType(validatedInput.target.kind, validatedInput.type)
      const now = nowIso()
      let annotationId = randomUUID()
      while (previous.annotations.some((annotation) => annotation.id === annotationId)) annotationId = randomUUID()
      const annotation = AnnotationSchema.parse({
        id: annotationId,
        ...validatedInput,
        target: { ...validatedInput.target, status: 'valid' },
        createdAt: now,
        updatedAt: now,
      })
      const project = ProjectDocumentSchema.parse({
        ...previous,
        annotations: [...previous.annotations, annotation],
        updatedAt: now,
      })
      await this.persistUpdatedProject(previous, project, library)
      return annotation
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  updateAnnotation(
    projectId: string,
    annotationId: string,
    patch: UpdateAnnotationInput,
  ): Promise<Annotation> {
    // 用旧批注加 patch 组成完整新批注，再整体校验，避免产生半合法状态。
    return this.enqueue(async () => {
      const validatedPatch = UpdateAnnotationInputSchema.parse(patch)
      const library = await this.readLibraryUnlocked()
      const previous = await this.requireProjectUnlocked(library, projectId)
      const annotationIndex = previous.annotations.findIndex((annotation) => annotation.id === annotationId)
      if (annotationIndex < 0) throw new AppError('NOT_FOUND', '批注不存在')

      const annotation = AnnotationSchema.parse({
        ...previous.annotations[annotationIndex],
        ...validatedPatch,
        updatedAt: nowIso(),
      })
      this.assertAnnotationType(annotation.target.kind, annotation.type)
      const annotations = [...previous.annotations]
      annotations[annotationIndex] = annotation
      const project = ProjectDocumentSchema.parse({ ...previous, annotations, updatedAt: annotation.updatedAt })
      await this.persistUpdatedProject(previous, project, library)
      return annotation
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  deleteAnnotation(projectId: string, annotationId: string): Promise<{ id: string }> {
    // filter 创建新数组，找不到 ID 时明确返回 NOT_FOUND。
    return this.enqueue(async () => {
      const library = await this.readLibraryUnlocked()
      const previous = await this.requireProjectUnlocked(library, projectId)
      if (!previous.annotations.some((annotation) => annotation.id === annotationId)) {
        throw new AppError('NOT_FOUND', '批注不存在')
      }
      const project = ProjectDocumentSchema.parse({
        ...previous,
        annotations: previous.annotations.filter((annotation) => annotation.id !== annotationId),
        updatedAt: nowIso(),
      })
      await this.persistUpdatedProject(previous, project, library)
      return { id: annotationId }
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  updateStyles(projectId: string, patch: AnnotationStylesPatch): Promise<ProjectDocument> {
    // 样式属于本机用户：更新 library.defaultStyles，而不是某一篇文章的分享内容。
    return this.enqueue(async () => {
      const validatedPatch = AnnotationStylesPatchSchema.parse(patch)
      const library = await this.readLibraryUnlocked()
      const project = await this.requireProjectUnlocked(library, projectId)
      const styles = { ...library.defaultStyles }
      for (const type of Object.keys(validatedPatch) as Array<keyof AnnotationStylesPatch>) {
        const stylePatch = validatedPatch[type]
        if (stylePatch) styles[type] = { ...styles[type], ...stylePatch }
      }
      const nextLibrary = LibrarySchema.parse({
        ...library,
        defaultStyles: styles,
        updatedAt: nowIso(),
      })
      await atomicWriteJson(this.libraryFile, nextLibrary)
      return ProjectDocumentSchema.parse({ ...project, styles })
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  createSharePackage(projectId: string, appVersion: string): Promise<SharePackage> {
    // 导出包携带文章和批注，但主动剥离本机显示样式。
    return this.enqueue(async () => {
      const library = await this.readLibraryUnlocked()
      const project = await this.requireProjectUnlocked(library, projectId)
      const { styles: _localStyles, ...sharedProject } = project
      const group = project.groupId
        ? (library.groups.find((candidate) => candidate.id === project.groupId) ?? null)
        : null
      return SharePackageSchema.parse({
        format: SHARE_FORMAT,
        formatVersion: SHARE_FORMAT_VERSION,
        appVersion,
        exportedAt: nowIso(),
        project: sharedProject,
        group,
      })
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  importSharePackage(value: unknown): Promise<ImportResult> {
    // 导入内容一律视为不可信 unknown，必须先通过 SharePackageSchema。
    return this.enqueue(async () => {
      const sharePackage = SharePackageSchema.parse(value)
      sharePackage.project.annotations.forEach((annotation) => {
        this.assertAnnotationType(annotation.target.kind, annotation.type)
      })
      const library = await this.readLibraryUnlocked()
      const now = nowIso()
      let groupId: string | null = null
      let groupCreated = false
      let groups = [...library.groups]

      if (sharePackage.group) {
        // 同名分组直接复用；ID 冲突但名称不同则生成新 ID。
        const sameName = groups.find(
          (group) => normalizeName(group.name) === normalizeName(sharePackage.group!.name),
        )
        if (sameName) {
          groupId = sameName.id
        } else {
          const idInUse = groups.some((group) => group.id === sharePackage.group!.id)
          let importedGroupId = sharePackage.group.id
          if (idInUse) {
            importedGroupId = randomUUID()
            while (groups.some((group) => group.id === importedGroupId)) importedGroupId = randomUUID()
          }
          const importedGroup = ProjectGroupSchema.parse({
            ...sharePackage.group,
            id: importedGroupId,
            updatedAt: now,
          })
          groups.push(importedGroup)
          groupId = importedGroup.id
          groupCreated = true
        }
      }

      const originalProjectId = sharePackage.project.id
      let projectId = originalProjectId
      // 同 ID 项目不覆盖，改用新 UUID 保存为安全副本。
      while (library.projects.some((project) => project.id === projectId) || (await pathExists(this.projectFile(projectId)))) {
        projectId = randomUUID()
      }
      const project = ProjectDocumentSchema.parse({
        ...sharePackage.project,
        id: projectId,
        groupId,
        // 接收者看到的颜色、字体和标记完全由自己的资料库预设决定。
        styles: library.defaultStyles,
        updatedAt: now,
      })
      const nextLibrary = LibrarySchema.parse({
        ...library,
        groups,
        projects: [...library.projects, createProjectSummary(project)],
        updatedAt: now,
      })
      await this.writeNewProjectAndLibrary(project, nextLibrary)
      return { project, groupCreated, idChanged: projectId !== originalProjectId }
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  async readShareFile(filePath: string): Promise<unknown> {
    // 此处只负责大小限制和 JSON 解析，具体字段由 importSharePackage 校验。
    try {
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) throw new AppError('VALIDATION', '选中的路径不是文件')
      if (fileStat.size > MAX_IMPORT_BYTES) {
        throw new AppError('VALIDATION', '导入文件超过 25 MB 限制')
      }
      return JSON.parse(await readFile(filePath, 'utf8'))
    } catch (error) {
      throw normalizeError(error)
    }
  }

  async writeShareFile(filePath: string, sharePackage: SharePackage): Promise<void> {
    // 即使数据来自内部也再次校验，避免导出损坏的分享包。
    try {
      const validatedPackage = SharePackageSchema.parse(sharePackage)
      await atomicWriteJson(filePath, validatedPackage)
    } catch (error) {
      throw normalizeError(error)
    }
  }

  private assertGroupExists(library: Library, groupId: string | null): void {
    if (groupId && !library.groups.some((group) => group.id === groupId)) {
      throw new AppError('NOT_FOUND', '所选分组不存在')
    }
  }

  private assertAnnotationType(
    kind: Annotation['target']['kind'],
    type: Annotation['type'],
  ): void {
    if (!isAnnotationTypeAllowed(kind, type)) {
      throw new AppError('VALIDATION', '所选批注类型不适用于当前的字、词或句粒度')
    }
  }

  private async requireProjectUnlocked(library: Library, projectId: string): Promise<ProjectDocument> {
    if (!library.projects.some((project) => project.id === projectId)) {
      throw new AppError('NOT_FOUND', '项目不存在')
    }
    return this.readProjectUnlocked(projectId)
  }

  private async writeNewProjectAndLibrary(project: ProjectDocument, library: Library): Promise<void> {
    // 项目文件成功但索引失败时删除新项目，防止留下不可见的孤立文件。
    const filePath = this.projectFile(project.id)
    if (await pathExists(filePath)) throw new AppError('CONFLICT', '项目 ID 已存在')
    await atomicWriteJson(filePath, project)
    try {
      await atomicWriteJson(this.libraryFile, library)
    } catch (error) {
      await rm(filePath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async persistUpdatedProject(
    previous: ProjectDocument,
    project: ProjectDocument,
    library: Library,
  ): Promise<void> {
    // 项目写入成功但索引写入失败时恢复 previous，保证两个文件看到同一版本。
    const index = library.projects.findIndex((summary) => summary.id === project.id)
    if (index < 0) throw new AppError('NOT_FOUND', '项目不存在')
    const projects = [...library.projects]
    projects[index] = createProjectSummary(project)
    const nextLibrary = LibrarySchema.parse({ ...library, projects, updatedAt: project.updatedAt })
    const filePath = this.projectFile(project.id)
    await atomicWriteJson(filePath, project)
    try {
      await atomicWriteJson(this.libraryFile, nextLibrary)
    } catch (error) {
      await atomicWriteJson(filePath, previous).catch(() => undefined)
      throw error
    }
  }
}
