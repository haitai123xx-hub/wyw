/**
 * 墨笺的核心数据模型与运行时校验规则。
 *
 * TypeScript 类型只能在开发/编译阶段发现错误，程序运行时会被删除；Zod Schema
 * 则会真实检查 IPC、JSON 和导入文件。这里用 z.infer 从 Schema 推导类型，确保
 * “编译时理解的数据”与“运行时接受的数据”始终来自同一份定义。
 */
import { z } from 'zod'
import { isAnnotationTypeAllowed } from './annotation-rules'

export const DATA_SCHEMA_VERSION = 2 as const
// 分享格式第 3 版不再携带任何用户显示样式。
export const SHARE_FORMAT_VERSION = 3 as const
export const SHARE_FORMAT = 'wenyan-notes-project' as const

export const ANNOTATION_TYPES = [
  'definition',
  'polysemy',
  'ancient-modern',
  'word-class',
  'phonetic-loan',
  'function-word',
  'special-sentence',
  'pronunciation',
] as const

// z.enum 在运行时限制取值；z.infer 在编译时得到八个字符串组成的联合类型。
export const AnnotationTypeSchema = z.enum(ANNOTATION_TYPES)
export type AnnotationType = z.infer<typeof AnnotationTypeSchema>

export const ANNOTATION_TYPE_LABELS: Record<AnnotationType, string> = {
  definition: '释义',
  polysemy: '一词多义',
  'ancient-modern': '古今异义',
  'word-class': '词类活用',
  'phonetic-loan': '通假字',
  'function-word': '文言虚词',
  'special-sentence': '特殊句式',
  pronunciation: '注音',
}

export const TARGET_KINDS = ['character', 'word', 'sentence'] as const
export const AnnotationTargetKindSchema = z.enum(TARGET_KINDS)
export type AnnotationTargetKind = z.infer<typeof AnnotationTargetKindSchema>

export const TARGET_KIND_LABELS: Record<AnnotationTargetKind, string> = {
  character: '字',
  word: '词',
  sentence: '句',
}

const IdSchema = z.string().uuid()
const IsoDateSchema = z.string().datetime({ offset: true })
const HexColorSchema = z.string().regex(/^#[\da-f]{6}$/i, '颜色必须是 #RRGGBB 格式')
const BackgroundColorSchema = z.union([HexColorSchema, z.literal('transparent')])

// 单一批注类型的完整视觉样式；strict() 会拒绝未声明的额外字段。
export const AnnotationStyleSchema = z
  .object({
    fontColor: HexColorSchema,
    backgroundColor: BackgroundColorSchema,
    fontFamily: z.string().trim().min(1).max(120),
    fontSize: z.number().int().min(10).max(36),
    bold: z.boolean(),
    underline: z.boolean(),
    italic: z.boolean(),
    mark: z.enum(['color', 'background', 'underline', 'dashed', 'wavy', 'dot', 'combined']),
    backgroundOpacity: z.number().int().min(0).max(100),
    visible: z.boolean(),
    priority: z.number().int().min(1).max(99),
    notePosition: z.enum(['above', 'below', 'hidden']).default('below'),
    noteFontSize: z.number().int().min(7).max(18).default(9),
  })
  .strict()

export type AnnotationStyle = z.infer<typeof AnnotationStyleSchema>

export const AnnotationStylesSchema = z
  .object({
    definition: AnnotationStyleSchema,
    polysemy: AnnotationStyleSchema,
    'ancient-modern': AnnotationStyleSchema,
    'word-class': AnnotationStyleSchema,
    'phonetic-loan': AnnotationStyleSchema,
    'function-word': AnnotationStyleSchema,
    'special-sentence': AnnotationStyleSchema,
    pronunciation: AnnotationStyleSchema,
  })
  .strict()

export type AnnotationStyles = z.infer<typeof AnnotationStylesSchema>

const baseStyle: Omit<AnnotationStyle, 'fontColor' | 'backgroundColor'> = {
  // 公共默认值只写一遍，各类型再用对象展开覆盖颜色、优先级等差异。
  fontFamily: 'Microsoft YaHei, sans-serif',
  fontSize: 18,
  bold: false,
  underline: false,
  italic: false,
  mark: 'combined',
  backgroundOpacity: 18,
  visible: true,
  priority: 10,
  notePosition: 'below',
  noteFontSize: 9,
}

export const DEFAULT_ANNOTATION_STYLES: AnnotationStyles = {
  definition: { ...baseStyle, priority: 10, fontColor: '#1D4ED8', backgroundColor: '#DBEAFE' },
  polysemy: { ...baseStyle, priority: 30, notePosition: 'above', fontColor: '#6D28D9', backgroundColor: '#EDE9FE' },
  'ancient-modern': { ...baseStyle, mark: 'dashed', priority: 60, fontColor: '#BE123C', backgroundColor: '#FFE4E6' },
  'word-class': { ...baseStyle, priority: 50, notePosition: 'above', fontColor: '#047857', backgroundColor: '#D1FAE5' },
  'phonetic-loan': { ...baseStyle, mark: 'dot', priority: 70, notePosition: 'above', fontColor: '#B45309', backgroundColor: '#FEF3C7' },
  'function-word': { ...baseStyle, mark: 'dot', priority: 40, fontColor: '#0E7490', backgroundColor: '#CFFAFE' },
  'special-sentence': { ...baseStyle, mark: 'background', backgroundOpacity: 10, priority: 20, fontColor: '#9D174D', backgroundColor: '#FCE7F3' },
  pronunciation: { ...baseStyle, fontColor: '#7C3AED', backgroundColor: 'transparent', mark: 'dot', priority: 80, notePosition: 'above', noteFontSize: 8 },
}

export function createDefaultAnnotationStyles(): AnnotationStyles {
  // parse 会返回通过校验的新数据，避免调用方直接共享并改写默认常量。
  return AnnotationStylesSchema.parse(DEFAULT_ANNOTATION_STYLES)
}

// 文章基本信息独立成 Schema，可在项目、摘要和创建表单中重复使用。
export const ProjectMetadataSchema = z
  .object({
    title: z.string().trim().min(1, '项目标题不能为空').max(200),
    author: z.string().trim().max(100),
    dynasty: z.string().trim().max(50),
    source: z.string().trim().max(300),
    description: z.string().trim().max(2_000),
    tags: z.array(z.string().trim().min(1).max(40)).max(30),
  })
  .strict()

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>

export const AnnotationTargetSchema = z
  .object({
    kind: AnnotationTargetKindSchema,
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    text: z.string().min(1).max(20_000),
    status: z.enum(['valid', 'needs-review']).default('valid'),
  })
  .strict()
  .superRefine((target, context) => {
    // superRefine 适合检查多个字段之间的关系，普通 min/max 无法表达这种规则。
    if (target.end <= target.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: 'end 必须大于 start',
      })
    }

    if (target.kind === 'character' && Array.from(target.text).length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['text'],
        message: '“字”类型的批注必须精确选中一个字符',
      })
    }
  })

export type AnnotationTarget = z.infer<typeof AnnotationTargetSchema>

const ShortTextSchema = z.string().trim().max(2_000)
const RequiredTextSchema = ShortTextSchema.min(1, '请填写必要内容')

// 每一种批注有不同内容字段；kind 让 Zod 和 TypeScript 判断当前是哪一种结构。
export const AnnotationDetailSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('definition'), meaning: RequiredTextSchema }).strict(),
  z.object({
    kind: z.literal('polysemy'),
    contextualMeaning: RequiredTextSchema,
    otherMeanings: z.array(z.object({ meaning: RequiredTextSchema, example: ShortTextSchema }).strict()).max(30),
  }).strict(),
  z.object({ kind: z.literal('ancient-modern'), ancientMeaning: RequiredTextSchema, modernMeaning: RequiredTextSchema }).strict(),
  z.object({ kind: z.literal('word-class'), usage: RequiredTextSchema, meaning: RequiredTextSchema }).strict(),
  z.object({
    kind: z.literal('phonetic-loan'),
    standardCharacter: RequiredTextSchema.refine((value) => Array.from(value).length === 1, '本字必须是一个字'),
    meaning: RequiredTextSchema,
    pronunciation: ShortTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('function-word'),
    character: RequiredTextSchema.refine((value) => Array.from(value).length === 1, '虚词必须是一个字'),
    usageCode: RequiredTextSchema,
    partOfSpeech: RequiredTextSchema,
    usage: RequiredTextSchema,
    translation: ShortTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('special-sentence'),
    patterns: z.array(z.object({ category: RequiredTextSchema, categoryLabel: RequiredTextSchema, subtype: RequiredTextSchema, label: RequiredTextSchema }).strict()).min(1).max(12),
    restoredText: ShortTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('pronunciation'),
    pinyin: RequiredTextSchema.regex(/^[a-zA-ZüÜvVāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ\s'’-]+[1-5]?$/, '请输入拼音，如 xué 或 xue2'),
  }).strict(),
])

export type AnnotationDetail = z.infer<typeof AnnotationDetailSchema>

const AnnotationBaseSchema = z
  .object({
    id: IdSchema,
    type: AnnotationTypeSchema,
    target: AnnotationTargetSchema,
    detail: AnnotationDetailSchema,
    note: z.string().trim().max(20_000).default(''),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .strict()

function validateAnnotationShape(annotation: { type: AnnotationType; target: AnnotationTarget; detail: AnnotationDetail }, context: z.RefinementCtx) {
  // 外层 type 与 detail.kind 必须同步，否则显示器不知道应该按哪种结构读取字段。
  if (annotation.type !== annotation.detail.kind) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['detail', 'kind'], message: '批注类型和内容结构不一致' })
  }
  if (annotation.type === 'pronunciation' && annotation.target.kind !== 'character') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['target', 'kind'], message: '注音只能用于单字' })
  }
}

export const AnnotationSchema = AnnotationBaseSchema
  .superRefine((annotation, context) => {
    validateAnnotationShape(annotation, context)
  })

export type Annotation = z.infer<typeof AnnotationSchema>

const ProjectContentShape = {
  schemaVersion: z.literal(DATA_SCHEMA_VERSION),
  id: IdSchema,
  metadata: ProjectMetadataSchema,
  originalText: z.string().min(1, '原文不能为空').max(2_000_000),
  groupId: IdSchema.nullable(),
  annotations: z.array(AnnotationSchema).max(100_000),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
}

function validateProjectContent(
  project: { originalText: string; annotations: Annotation[] },
  context: z.RefinementCtx,
): void {
  // Set 用于检测同一项目内重复的批注 UUID。
  const ids = new Set<string>()

  project.annotations.forEach((annotation, index) => {
    if (ids.has(annotation.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['annotations', index, 'id'],
        message: '批注 ID 重复',
      })
    }
    ids.add(annotation.id)

    const { start, end, text, status } = annotation.target
    // 待重新定位的批注允许暂时不匹配；正常批注必须严格对应原文切片。
    if (status === 'needs-review') return
    if (end > project.originalText.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['annotations', index, 'target', 'end'],
        message: '批注范围超出原文长度',
      })
    } else if (project.originalText.slice(start, end) !== text) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['annotations', index, 'target', 'text'],
        message: '批注文本与原文范围不匹配',
      })
    }
  })
}

export const ProjectDocumentSchema = z
  .object({ ...ProjectContentShape, styles: AnnotationStylesSchema })
  .strict()
  .superRefine(validateProjectContent)

export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>

// 分组是资料库级数据，项目通过可空 groupId 引用它。
export const ProjectGroupSchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1, '分组名称不能为空').max(100),
    color: HexColorSchema,
    description: z.string().trim().max(500),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .strict()

export type ProjectGroup = z.infer<typeof ProjectGroupSchema>

export const ProjectSummarySchema = z
  .object({
    id: IdSchema,
    metadata: ProjectMetadataSchema,
    groupId: IdSchema.nullable(),
    annotationCount: z.number().int().nonnegative(),
    excerpt: z.string().max(160),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .strict()

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>

// 资料库只存摘要而不存完整正文，因此左侧列表加载速度不随全文长度线性增加。
export const LibrarySchema = z
  .object({
    schemaVersion: z.literal(DATA_SCHEMA_VERSION),
    // 标记旧“逐项目样式”是否已经迁移成本机全局预设。
    stylePreferencesVersion: z.literal(1).optional(),
    groups: z.array(ProjectGroupSchema),
    projects: z.array(ProjectSummarySchema),
    defaultStyles: AnnotationStylesSchema,
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .strict()
  .superRefine((library, context) => {
    // 在单个索引文件内部保证分组 ID、项目 ID 唯一，并检查项目引用的分组存在。
    const groupIds = new Set<string>()
    const projectIds = new Set<string>()

    library.groups.forEach((group, index) => {
      if (groupIds.has(group.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['groups', index, 'id'],
          message: '分组 ID 重复',
        })
      }
      groupIds.add(group.id)
    })

    library.projects.forEach((project, index) => {
      if (projectIds.has(project.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['projects', index, 'id'],
          message: '项目 ID 重复',
        })
      }
      projectIds.add(project.id)

      if (project.groupId && !groupIds.has(project.groupId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['projects', index, 'groupId'],
          message: '项目引用了不存在的分组',
        })
      }
    })
  })

export type Library = z.infer<typeof LibrarySchema>

// 分享项目只包含文章内容与批注，明确排除属于接收者本机的 styles。
export const SharedProjectDocumentSchema = z
  .object(ProjectContentShape)
  .strict()
  .superRefine(validateProjectContent)

export type SharedProjectDocument = z.infer<typeof SharedProjectDocumentSchema>

// 分享包用固定 format/formatVersion 区分普通 JSON 和不兼容的旧版结构。
export const SharePackageSchema = z
  .object({
    format: z.literal(SHARE_FORMAT),
    formatVersion: z.literal(SHARE_FORMAT_VERSION),
    appVersion: z.string().min(1).max(50),
    exportedAt: IsoDateSchema,
    project: SharedProjectDocumentSchema,
    group: ProjectGroupSchema.nullable(),
  })
  .strict()

export type SharePackage = z.infer<typeof SharePackageSchema>

// “创建输入”不包含 id 和时间等后端生成字段，只包含用户真正能够提交的内容。
export const CreateProjectInputSchema = z
  .object({
    metadata: ProjectMetadataSchema,
    originalText: z.string().min(1, '原文不能为空').max(2_000_000),
    groupId: IdSchema.nullable().optional(),
  })
  .strict()

export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>

// partial/optional 让更新请求只发送发生变化的字段。
export const UpdateProjectInputSchema = z
  .object({
    metadata: ProjectMetadataSchema.partial().optional(),
    originalText: z.string().min(1).max(2_000_000).optional(),
    groupId: IdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少要更新一个字段')

export type UpdateProjectInput = z.input<typeof UpdateProjectInputSchema>

export const CreateGroupInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    color: HexColorSchema.optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict()

export type CreateGroupInput = z.input<typeof CreateGroupInputSchema>

export const UpdateGroupInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    color: HexColorSchema.optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少要更新一个字段')

export type UpdateGroupInput = z.input<typeof UpdateGroupInputSchema>

export const CreateAnnotationInputSchema = AnnotationBaseSchema.omit({
  // omit 删除仓库负责生成的字段，保留批注业务字段和完整校验。
  id: true,
  createdAt: true,
  updatedAt: true,
}).superRefine((annotation, context) => {
  validateAnnotationShape(annotation, context)
  if (!isAnnotationTypeAllowed(annotation.target.kind, annotation.type)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['type'],
      message: `“${TARGET_KIND_LABELS[annotation.target.kind]}”批注不支持“${ANNOTATION_TYPE_LABELS[annotation.type]}”类型`,
    })
  }
})

export type CreateAnnotationInput = z.input<typeof CreateAnnotationInputSchema>

export const UpdateAnnotationInputSchema = z
  .object({
    type: AnnotationTypeSchema.optional(),
    target: AnnotationTargetSchema.optional(),
    detail: AnnotationDetailSchema.optional(),
    note: z.string().trim().max(20_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少要更新一个字段')

export type UpdateAnnotationInput = z.input<typeof UpdateAnnotationInputSchema>

const AnnotationStylePatchSchema = AnnotationStyleSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  '样式修改不能为空',
)

export const AnnotationStylesPatchSchema = z
  .object({
    definition: AnnotationStylePatchSchema.optional(),
    polysemy: AnnotationStylePatchSchema.optional(),
    'ancient-modern': AnnotationStylePatchSchema.optional(),
    'word-class': AnnotationStylePatchSchema.optional(),
    'phonetic-loan': AnnotationStylePatchSchema.optional(),
    'function-word': AnnotationStylePatchSchema.optional(),
    'special-sentence': AnnotationStylePatchSchema.optional(),
    pronunciation: AnnotationStylePatchSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少要更新一类批注样式')

export type AnnotationStylesPatch = z.input<typeof AnnotationStylesPatchSchema>

export function createProjectSummary(project: ProjectDocument): ProjectSummary {
  // 摘要只取清理空白后的前 160 个字符，不复制整篇正文和批注内容。
  const compactText = project.originalText.replace(/\s+/g, ' ').trim()
  return ProjectSummarySchema.parse({
    id: project.id,
    metadata: project.metadata,
    groupId: project.groupId,
    annotationCount: project.annotations.length,
    excerpt: compactText.slice(0, 160),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  })
}
