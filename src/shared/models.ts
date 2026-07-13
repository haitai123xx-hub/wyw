import { z } from 'zod'
import { isAnnotationTypeAllowed } from './annotation-rules'

export const DATA_SCHEMA_VERSION = 2 as const
export const SHARE_FORMAT_VERSION = 2 as const
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
  return AnnotationStylesSchema.parse(DEFAULT_ANNOTATION_STYLES)
}

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

export const ProjectDocumentSchema = z
  .object({
    schemaVersion: z.literal(DATA_SCHEMA_VERSION),
    id: IdSchema,
    metadata: ProjectMetadataSchema,
    originalText: z.string().min(1, '原文不能为空').max(2_000_000),
    groupId: IdSchema.nullable(),
    annotations: z.array(AnnotationSchema).max(100_000),
    styles: AnnotationStylesSchema,
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .strict()
  .superRefine((project, context) => {
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
  })

export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>

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

export const LibrarySchema = z
  .object({
    schemaVersion: z.literal(DATA_SCHEMA_VERSION),
    groups: z.array(ProjectGroupSchema),
    projects: z.array(ProjectSummarySchema),
    defaultStyles: AnnotationStylesSchema,
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .strict()
  .superRefine((library, context) => {
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

export const SharePackageSchema = z
  .object({
    format: z.literal(SHARE_FORMAT),
    formatVersion: z.literal(SHARE_FORMAT_VERSION),
    appVersion: z.string().min(1).max(50),
    exportedAt: IsoDateSchema,
    project: ProjectDocumentSchema,
    group: ProjectGroupSchema.nullable(),
    styles: AnnotationStylesSchema,
  })
  .strict()

export type SharePackage = z.infer<typeof SharePackageSchema>

export const CreateProjectInputSchema = z
  .object({
    metadata: ProjectMetadataSchema,
    originalText: z.string().min(1, '原文不能为空').max(2_000_000),
    groupId: IdSchema.nullable().optional(),
  })
  .strict()

export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>

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
