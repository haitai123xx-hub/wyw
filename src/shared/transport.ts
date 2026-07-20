/** 定义 IPC 最底层的通道名、响应信封和可跨进程传递的错误格式。 */
export const IPC_CHANNEL = 'wenyan-notes:invoke' as const

export interface ApiErrorPayload {
  code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'IO_ERROR' | 'INTERNAL_ERROR'
  message: string
  details?: unknown
}

// 可辨识联合：ok 为 true 时一定有 data，为 false 时一定有 error。
export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: ApiErrorPayload }

/** renderer 收到失败信封后，把普通错误数据还原成可 throw/catch 的 Error。 */
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
