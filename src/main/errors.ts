/** 把 Zod、Node 文件系统和未知异常统一成前端可理解的错误结构。 */
import { ZodError } from 'zod'
import type { ApiErrorPayload } from '../shared/api'

export type AppErrorCode = ApiErrorPayload['code']

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly details?: unknown

  constructor(code: AppErrorCode, message: string, details?: unknown, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
}

function zodDetails(error: ZodError): unknown {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

export function normalizeError(error: unknown): AppError {
  // 业务层主动抛出的 AppError 已经带有正确错误码，直接保留。
  if (error instanceof AppError) return error

  if (error instanceof ZodError) {
    return new AppError('VALIDATION', '数据校验失败', zodDetails(error), { cause: error })
  }

  if (error instanceof SyntaxError) {
    return new AppError('VALIDATION', 'JSON 文件格式不正确', undefined, { cause: error })
  }

  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      return new AppError('NOT_FOUND', '所需的文件不存在', undefined, { cause: error })
    }
    if (nodeError.code) {
      return new AppError(
        'IO_ERROR',
        '文件读写失败，请检查存储空间或文件权限',
        { systemCode: nodeError.code },
        { cause: error },
      )
    }
    return new AppError('INTERNAL_ERROR', '应用内部发生了错误', undefined, { cause: error })
  }

  return new AppError('INTERNAL_ERROR', '发生了未知错误')
}

export function errorPayload(error: unknown): ApiErrorPayload {
  // Error 对象不能完整跨 IPC 传输，因此这里只返回普通对象。
  const normalized = normalizeError(error)
  return {
    code: normalized.code,
    message: normalized.message,
    ...(normalized.details === undefined ? {} : { details: normalized.details }),
  }
}
