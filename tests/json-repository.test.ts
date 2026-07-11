import { randomUUID } from 'node:crypto'
import { readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonRepository } from '../src/main/storage'
import {
  LibrarySchema,
  ProjectDocumentSchema,
  createDefaultAnnotationStyles,
  type ProjectMetadata,
} from '../src/shared/models'

const TEST_DATA_ROOT = path.resolve(process.cwd(), '.test-data')

const metadata = (title: string): ProjectMetadata => ({
  title,
  author: '佚名',
  dynasty: '先秦',
  source: '集成测试',
  description: `${title}测试项目`,
  tags: ['测试'],
})

describe('JsonRepository', () => {
  let testDirectory: string

  beforeEach(() => {
    testDirectory = path.join(TEST_DATA_ROOT, randomUUID())
  })

  afterEach(async () => {
    const relativePath = path.relative(TEST_DATA_ROOT, testDirectory)
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`拒绝清理测试根目录之外的路径：${testDirectory}`)
    }
    await rm(testDirectory, { recursive: true, force: true })
  })

  async function initializedRepository(): Promise<JsonRepository> {
    const repository = new JsonRepository(testDirectory)
    await repository.initialize()
    return repository
  }

  it('初始化有效的空索引和项目目录，且重复初始化不会覆盖数据', async () => {
    const repository = new JsonRepository(testDirectory)

    await repository.initialize()

    expect((await stat(repository.projectsDirectory)).isDirectory()).toBe(true)
    const firstLibrary = LibrarySchema.parse(
      JSON.parse(await readFile(repository.libraryFile, 'utf8')),
    )
    expect(firstLibrary.groups).toEqual([])
    expect(firstLibrary.projects).toEqual([])
    expect(firstLibrary.defaultStyles).toEqual(createDefaultAnnotationStyles())

    await repository.initialize()

    const secondLibrary = LibrarySchema.parse(
      JSON.parse(await readFile(repository.libraryFile, 'utf8')),
    )
    expect(secondLibrary).toEqual(firstLibrary)
  })

  it('将分组保存在索引中，并将每个项目持久化为互相独立的 JSON 文件', async () => {
    const repository = await initializedRepository()
    const classics = await repository.createGroup({
      name: '经部',
      color: '#7C3AED',
      description: '经书项目',
    })
    const history = await repository.createGroup({ name: '史部' })
    const analects = await repository.createProject({
      metadata: metadata('《论语》选段'),
      originalText: '学而时习之，不亦说乎？',
      groupId: classics.id,
    })
    const records = await repository.createProject({
      metadata: metadata('《史记》选段'),
      originalText: '燕雀安知鸿鹄之志哉！',
      groupId: history.id,
    })

    const libraryOnDisk = LibrarySchema.parse(
      JSON.parse(await readFile(repository.libraryFile, 'utf8')),
    )
    expect(libraryOnDisk.groups.map((group) => group.id)).toEqual([classics.id, history.id])
    expect(libraryOnDisk.projects.map((project) => project.id)).toEqual([analects.id, records.id])
    expect(libraryOnDisk.projects.every((project) => !('originalText' in project))).toBe(true)

    const analectsFile = path.join(repository.projectsDirectory, `${analects.id}.json`)
    const recordsFile = path.join(repository.projectsDirectory, `${records.id}.json`)
    const analectsOnDisk = ProjectDocumentSchema.parse(
      JSON.parse(await readFile(analectsFile, 'utf8')),
    )
    const recordsOnDisk = ProjectDocumentSchema.parse(
      JSON.parse(await readFile(recordsFile, 'utf8')),
    )
    expect(analectsOnDisk).toEqual(analects)
    expect(recordsOnDisk).toEqual(records)
    expect(analectsOnDisk.id).not.toBe(recordsOnDisk.id)

    const reopened = new JsonRepository(testDirectory)
    await reopened.initialize()
    expect(await reopened.getProject(analects.id)).toEqual(analects)
    expect(await reopened.getProject(records.id)).toEqual(records)
  })

  it('接受与原文坐标一致的字、词和句批注', async () => {
    const repository = await initializedRepository()
    const firstSentence = '学而时习之，不亦说乎？'
    const originalText = `${firstSentence}\n有朋自远方来，不亦乐乎？`
    const project = await repository.createProject({
      metadata: metadata('字词句批注'),
      originalText,
    })
    const wordStart = originalText.indexOf('时习之')

    const character = await repository.createAnnotation(project.id, {
      type: 'definition',
      target: { kind: 'character', start: 0, end: 1, text: '学' },
      content: '学习。',
    })
    const word = await repository.createAnnotation(project.id, {
      type: 'word-class',
      target: { kind: 'word', start: wordStart, end: wordStart + 3, text: '时习之' },
      content: '按时温习它。',
    })
    const sentence = await repository.createAnnotation(project.id, {
      type: 'special-sentence',
      target: { kind: 'sentence', start: 0, end: firstSentence.length, text: firstSentence },
      content: '反问句。',
    })

    const persisted = await repository.getProject(project.id)
    expect(persisted.annotations).toEqual([character, word, sentence])
    expect(persisted.annotations.map((annotation) => annotation.target.kind)).toEqual([
      'character',
      'word',
      'sentence',
    ])
    expect((await repository.listProjects()).find((item) => item.id === project.id)?.annotationCount).toBe(3)
  })

  it('拒绝倒置、越界或与原文不匹配的批注范围，并保持项目不变', async () => {
    const repository = await initializedRepository()
    const originalText = '学而时习之'
    const project = await repository.createProject({
      metadata: metadata('非法范围测试'),
      originalText,
    })

    await expect(
      repository.createAnnotation(project.id, {
        type: 'definition',
        target: { kind: 'word', start: 2, end: 1, text: '而' },
        content: '倒置坐标。',
      }),
    ).rejects.toMatchObject({ name: 'AppError', code: 'VALIDATION' })

    await expect(
      repository.createAnnotation(project.id, {
        type: 'definition',
        target: { kind: 'word', start: 0, end: originalText.length + 1, text: originalText },
        content: '越界坐标。',
      }),
    ).rejects.toMatchObject({ name: 'AppError', code: 'VALIDATION' })

    await expect(
      repository.createAnnotation(project.id, {
        type: 'definition',
        target: { kind: 'word', start: 0, end: 1, text: '而' },
        content: '原文不匹配。',
      }),
    ).rejects.toMatchObject({ name: 'AppError', code: 'VALIDATION' })

    expect((await repository.getProject(project.id)).annotations).toEqual([])
    expect((await repository.listProjects()).find((item) => item.id === project.id)?.annotationCount).toBe(0)
  })

  it('按批注类型更新自定义显示样式并持久化部分补丁', async () => {
    const repository = await initializedRepository()
    const project = await repository.createProject({
      metadata: metadata('样式测试'),
      originalText: '知之为知之，不知为不知，是知也。',
    })
    const previousPolysemy = structuredClone(project.styles.polysemy)

    const updated = await repository.updateStyles(project.id, {
      definition: {
        fontColor: '#123456',
        backgroundColor: 'transparent',
        fontFamily: 'SimSun, serif',
        fontSize: 24,
        bold: true,
        underline: true,
      },
    })

    expect(updated.styles.definition).toMatchObject({
      fontColor: '#123456',
      backgroundColor: 'transparent',
      fontFamily: 'SimSun, serif',
      fontSize: 24,
      bold: true,
      underline: true,
    })
    expect(updated.styles.definition.italic).toBe(project.styles.definition.italic)
    expect(updated.styles.polysemy).toEqual(previousPolysemy)

    const onDisk = ProjectDocumentSchema.parse(
      JSON.parse(
        await readFile(path.join(repository.projectsDirectory, `${project.id}.json`), 'utf8'),
      ),
    )
    expect(onDisk.styles).toEqual(updated.styles)
  })

  it('在新增、更新和删除批注后持续同步项目摘要计数', async () => {
    const repository = await initializedRepository()
    const project = await repository.createProject({
      metadata: metadata('摘要计数测试'),
      originalText: '人不知而不愠，不亦君子乎？',
    })
    const first = await repository.createAnnotation(project.id, {
      type: 'definition',
      target: { kind: 'character', start: 0, end: 1, text: '人' },
      content: '别人。',
    })
    const secondStart = project.originalText.indexOf('不愠')
    const second = await repository.createAnnotation(project.id, {
      type: 'ancient-modern',
      target: { kind: 'word', start: secondStart, end: secondStart + 2, text: '不愠' },
      content: '不恼怒。',
    })

    expect((await repository.getLibrary()).projects[0].annotationCount).toBe(2)

    await repository.updateAnnotation(project.id, second.id, { content: '不生气。' })
    expect((await repository.getLibrary()).projects[0].annotationCount).toBe(2)

    await repository.deleteAnnotation(project.id, first.id)
    const libraryOnDisk = LibrarySchema.parse(
      JSON.parse(await readFile(repository.libraryFile, 'utf8')),
    )
    expect(libraryOnDisk.projects[0].annotationCount).toBe(1)
  })

  it('导出后再导入同 ID 分享包时创建安全副本，并保留原项目', async () => {
    const repository = await initializedRepository()
    const group = await repository.createGroup({ name: '分享分组', color: '#0F766E' })
    const project = await repository.createProject({
      metadata: metadata('可分享项目'),
      originalText: '三人行，必有我师焉。',
      groupId: group.id,
    })
    await repository.createAnnotation(project.id, {
      type: 'function-word',
      target: {
        kind: 'character',
        start: project.originalText.indexOf('焉'),
        end: project.originalText.indexOf('焉') + 1,
        text: '焉',
      },
      content: '兼词，于此。',
    })
    await repository.updateStyles(project.id, {
      'function-word': { fontColor: '#334455', bold: true },
    })
    const originalBeforeImport = await repository.getProject(project.id)
    const sharePackage = await repository.createSharePackage(project.id, '0.1.0-test')
    const shareFile = path.join(testDirectory, 'exports', '可分享项目.wyw.json')

    await repository.writeShareFile(shareFile, sharePackage)
    const imported = await repository.importSharePackage(await repository.readShareFile(shareFile))

    expect(imported.idChanged).toBe(true)
    expect(imported.groupCreated).toBe(false)
    expect(imported.project.id).not.toBe(project.id)
    expect(imported.project.groupId).toBe(group.id)
    expect(imported.project.metadata).toEqual(originalBeforeImport.metadata)
    expect(imported.project.originalText).toBe(originalBeforeImport.originalText)
    expect(imported.project.annotations).toEqual(originalBeforeImport.annotations)
    expect(imported.project.styles).toEqual(originalBeforeImport.styles)
    expect(await repository.getProject(project.id)).toEqual(originalBeforeImport)

    const library = await repository.getLibrary()
    expect(new Set(library.projects.map((item) => item.id))).toEqual(
      new Set([project.id, imported.project.id]),
    )
    const importedOnDisk = ProjectDocumentSchema.parse(
      JSON.parse(
        await readFile(
          path.join(repository.projectsDirectory, `${imported.project.id}.json`),
          'utf8',
        ),
      ),
    )
    expect(importedOnDisk).toEqual(imported.project)
  })

  it('删除分组时将组内项目自动归入未分组并同步磁盘文件', async () => {
    const repository = await initializedRepository()
    const group = await repository.createGroup({ name: '待删除分组' })
    const first = await repository.createProject({
      metadata: metadata('第一篇'),
      originalText: '逝者如斯夫，不舍昼夜。',
      groupId: group.id,
    })
    const second = await repository.createProject({
      metadata: metadata('第二篇'),
      originalText: '岁寒，然后知松柏之后凋也。',
      groupId: group.id,
    })

    const result = await repository.deleteGroup(group.id)

    expect(new Set(result.reassignedProjectIds)).toEqual(new Set([first.id, second.id]))
    const library = await repository.getLibrary()
    expect(library.groups.some((item) => item.id === group.id)).toBe(false)
    expect(library.projects.map((item) => item.groupId)).toEqual([null, null])
    expect((await repository.getProject(first.id)).groupId).toBeNull()
    expect((await repository.getProject(second.id)).groupId).toBeNull()

    const reopened = new JsonRepository(testDirectory)
    await reopened.initialize()
    expect((await reopened.getProject(first.id)).groupId).toBeNull()
    expect((await reopened.getProject(second.id)).groupId).toBeNull()
  })
})
