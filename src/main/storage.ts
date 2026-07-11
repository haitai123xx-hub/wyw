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
const MAX_IMPORT_BYTES = 25 * 1024 * 1024

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
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  const contents = `${JSON.stringify(value, null, 2)}\n`
  let handle: Awaited<ReturnType<typeof open>> | undefined

  try {
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
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private projectFile(projectId: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new AppError('VALIDATION', '项目 ID 格式不正确')
    }
    return path.join(this.projectsDirectory, `${projectId}.json`)
  }

  async initialize(): Promise<void> {
    return this.enqueue(async () => {
      await mkdir(this.projectsDirectory, { recursive: true })
      if (await pathExists(this.libraryFile)) {
        await this.readLibraryUnlocked()
        return
      }

      const now = nowIso()
      const library = LibrarySchema.parse({
        schemaVersion: DATA_SCHEMA_VERSION,
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
    return this.enqueue(() => this.readLibraryUnlocked()).catch((error) => {
      throw normalizeError(error)
    })
  }

  listProjects(): Promise<ProjectSummary[]> {
    return this.enqueue(async () => {
      const library = await this.readLibraryUnlocked()
      return [...library.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  getProject(projectId: string): Promise<ProjectDocument> {
    return this.enqueue(async () => {
      const library = await this.readLibraryUnlocked()
      if (!library.projects.some((project) => project.id === projectId)) {
        throw new AppError('NOT_FOUND', '项目不存在')
      }
      return this.readProjectUnlocked(projectId)
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  createProject(input: CreateProjectInput): Promise<ProjectDocument> {
    return this.enqueue(async () => {
      const validatedInput = CreateProjectInputSchema.parse(input)
      const library = await this.readLibraryUnlocked()
      const groupId = validatedInput.groupId ?? null
      this.assertGroupExists(library, groupId)

      let projectId = randomUUID()
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
        updatedAt: now,
      })

      await this.persistUpdatedProject(previous, project, library)
      return project
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  deleteProject(projectId: string): Promise<{ id: string }> {
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
    return this.enqueue(async () => {
      const validatedPatch = AnnotationStylesPatchSchema.parse(patch)
      const library = await this.readLibraryUnlocked()
      const previous = await this.requireProjectUnlocked(library, projectId)
      const styles = { ...previous.styles }
      for (const type of Object.keys(validatedPatch) as Array<keyof AnnotationStylesPatch>) {
        const stylePatch = validatedPatch[type]
        if (stylePatch) styles[type] = { ...styles[type], ...stylePatch }
      }
      const project = ProjectDocumentSchema.parse({ ...previous, styles, updatedAt: nowIso() })
      await this.persistUpdatedProject(previous, project, library)
      return project
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  createSharePackage(projectId: string, appVersion: string): Promise<SharePackage> {
    return this.enqueue(async () => {
      const library = await this.readLibraryUnlocked()
      const project = await this.requireProjectUnlocked(library, projectId)
      const group = project.groupId
        ? (library.groups.find((candidate) => candidate.id === project.groupId) ?? null)
        : null
      return SharePackageSchema.parse({
        format: SHARE_FORMAT,
        formatVersion: SHARE_FORMAT_VERSION,
        appVersion,
        exportedAt: nowIso(),
        project,
        group,
        styles: project.styles,
      })
    }).catch((error) => {
      throw normalizeError(error)
    })
  }

  importSharePackage(value: unknown): Promise<ImportResult> {
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
      while (library.projects.some((project) => project.id === projectId) || (await pathExists(this.projectFile(projectId)))) {
        projectId = randomUUID()
      }
      const project = ProjectDocumentSchema.parse({
        ...sharePackage.project,
        id: projectId,
        groupId,
        styles: sharePackage.styles,
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
