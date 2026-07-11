import { z } from 'zod'
import {
  AnnotationStylesPatchSchema,
  CreateAnnotationInputSchema,
  CreateGroupInputSchema,
  CreateProjectInputSchema,
  UpdateAnnotationInputSchema,
  UpdateGroupInputSchema,
  UpdateProjectInputSchema,
  type Annotation,
  type AnnotationStylesPatch,
  type CreateAnnotationInput,
  type CreateGroupInput,
  type CreateProjectInput,
  type Library,
  type ProjectDocument,
  type ProjectGroup,
  type ProjectSummary,
  type UpdateAnnotationInput,
  type UpdateGroupInput,
  type UpdateProjectInput,
} from './models'
export { IPC_CHANNEL, NotesApiError } from './transport'
export type { ApiEnvelope, ApiErrorPayload } from './transport'

const IdSchema = z.string().uuid()
const EmptyPayloadSchema = z.object({}).strict()

export const ApiRequestSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('getLibrary'), payload: EmptyPayloadSchema }).strict(),
  z.object({ method: z.literal('listProjects'), payload: EmptyPayloadSchema }).strict(),
  z.object({ method: z.literal('getProject'), payload: z.object({ id: IdSchema }).strict() }).strict(),
  z
    .object({
      method: z.literal('createProject'),
      payload: z.object({ input: CreateProjectInputSchema }).strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal('updateProject'),
      payload: z.object({ id: IdSchema, patch: UpdateProjectInputSchema }).strict(),
    })
    .strict(),
  z.object({ method: z.literal('deleteProject'), payload: z.object({ id: IdSchema }).strict() }).strict(),
  z
    .object({ method: z.literal('createGroup'), payload: z.object({ input: CreateGroupInputSchema }).strict() })
    .strict(),
  z
    .object({
      method: z.literal('updateGroup'),
      payload: z.object({ id: IdSchema, patch: UpdateGroupInputSchema }).strict(),
    })
    .strict(),
  z.object({ method: z.literal('deleteGroup'), payload: z.object({ id: IdSchema }).strict() }).strict(),
  z
    .object({
      method: z.literal('createAnnotation'),
      payload: z.object({ projectId: IdSchema, input: CreateAnnotationInputSchema }).strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal('updateAnnotation'),
      payload: z
        .object({ projectId: IdSchema, annotationId: IdSchema, patch: UpdateAnnotationInputSchema })
        .strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal('deleteAnnotation'),
      payload: z.object({ projectId: IdSchema, annotationId: IdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal('updateStyles'),
      payload: z.object({ projectId: IdSchema, patch: AnnotationStylesPatchSchema }).strict(),
    })
    .strict(),
  z.object({ method: z.literal('importProject'), payload: EmptyPayloadSchema }).strict(),
  z.object({ method: z.literal('exportProject'), payload: z.object({ projectId: IdSchema }).strict() }).strict(),
])

export type ApiRequest = z.infer<typeof ApiRequestSchema>
export type ApiMethod = ApiRequest['method']

export type ImportProjectResult =
  | { cancelled: true }
  | {
      cancelled: false
      project: ProjectDocument
      groupCreated: boolean
      idChanged: boolean
    }

export type ExportProjectResult = { cancelled: true } | { cancelled: false; filePath: string }

export interface NotesApi {
  getLibrary(): Promise<Library>
  listProjects(): Promise<ProjectSummary[]>
  getProject(id: string): Promise<ProjectDocument>
  createProject(input: CreateProjectInput): Promise<ProjectDocument>
  updateProject(id: string, patch: UpdateProjectInput): Promise<ProjectDocument>
  deleteProject(id: string): Promise<{ id: string }>
  createGroup(input: CreateGroupInput): Promise<ProjectGroup>
  updateGroup(id: string, patch: UpdateGroupInput): Promise<ProjectGroup>
  deleteGroup(id: string): Promise<{ id: string; reassignedProjectIds: string[] }>
  createAnnotation(projectId: string, input: CreateAnnotationInput): Promise<Annotation>
  updateAnnotation(
    projectId: string,
    annotationId: string,
    patch: UpdateAnnotationInput,
  ): Promise<Annotation>
  deleteAnnotation(projectId: string, annotationId: string): Promise<{ id: string }>
  updateStyles(projectId: string, patch: AnnotationStylesPatch): Promise<ProjectDocument>
  importProject(): Promise<ImportProjectResult>
  exportProject(projectId: string): Promise<ExportProjectResult>
}
