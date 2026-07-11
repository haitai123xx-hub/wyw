export const IPC_CHANNEL = 'wenyan-notes:invoke' as const

export interface ApiErrorPayload {
  code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'IO_ERROR' | 'INTERNAL_ERROR'
  message: string
  details?: unknown
}

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: ApiErrorPayload }

export class NotesApiError extends Error {
  readonly code: ApiErrorPayload['code']
  readonly details?: unknown

  constructor(error: ApiErrorPayload) {
    super(error.message)
    this.name = 'NotesApiError'
    this.code = error.code
    this.details = error.details
  }
}
