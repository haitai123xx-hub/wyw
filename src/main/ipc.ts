import { app, dialog, ipcMain } from 'electron'
import { ApiRequestSchema, IPC_CHANNEL, type ApiEnvelope } from '../shared/api'
import type { ProjectDocument } from '../shared/models'
import { errorPayload } from './errors'
import type { JsonRepository } from './storage'

function ok<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data }
}

function safeFileName(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '').trim()
  return (sanitized || '未命名项目').slice(0, 100)
}

export function registerIpcHandlers(repository: JsonRepository): void {
  ipcMain.removeHandler(IPC_CHANNEL)
  ipcMain.handle(IPC_CHANNEL, async (_event, rawRequest: unknown): Promise<ApiEnvelope<unknown>> => {
    const parsedRequest = ApiRequestSchema.safeParse(rawRequest)
    if (!parsedRequest.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: '请求参数不正确',
          details: parsedRequest.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      }
    }

    const request = parsedRequest.data
    try {
      switch (request.method) {
        case 'getLibrary':
          return ok(await repository.getLibrary())
        case 'listProjects':
          return ok(await repository.listProjects())
        case 'getProject':
          return ok(await repository.getProject(request.payload.id))
        case 'createProject':
          return ok(await repository.createProject(request.payload.input))
        case 'updateProject':
          return ok(await repository.updateProject(request.payload.id, request.payload.patch))
        case 'deleteProject':
          return ok(await repository.deleteProject(request.payload.id))
        case 'createGroup':
          return ok(await repository.createGroup(request.payload.input))
        case 'updateGroup':
          return ok(await repository.updateGroup(request.payload.id, request.payload.patch))
        case 'deleteGroup':
          return ok(await repository.deleteGroup(request.payload.id))
        case 'createAnnotation':
          return ok(await repository.createAnnotation(request.payload.projectId, request.payload.input))
        case 'updateAnnotation':
          return ok(
            await repository.updateAnnotation(
              request.payload.projectId,
              request.payload.annotationId,
              request.payload.patch,
            ),
          )
        case 'deleteAnnotation':
          return ok(await repository.deleteAnnotation(request.payload.projectId, request.payload.annotationId))
        case 'updateStyles':
          return ok(await repository.updateStyles(request.payload.projectId, request.payload.patch))
        case 'importProject': {
          const selection = await dialog.showOpenDialog({
            title: '导入文言笔记项目',
            properties: ['openFile'],
            filters: [
              { name: '文言笔记分享包', extensions: ['json'] },
              { name: '所有文件', extensions: ['*'] },
            ],
          })
          if (selection.canceled || selection.filePaths.length === 0) return ok({ cancelled: true as const })
          const rawPackage = await repository.readShareFile(selection.filePaths[0])
          const result = await repository.importSharePackage(rawPackage)
          return ok({ cancelled: false as const, ...result })
        }
        case 'exportProject': {
          const project: ProjectDocument = await repository.getProject(request.payload.projectId)
          const selection = await dialog.showSaveDialog({
            title: '导出文言笔记项目',
            defaultPath: `${safeFileName(project.metadata.title)}.wyw.json`,
            filters: [{ name: '文言笔记分享包', extensions: ['json'] }],
          })
          if (selection.canceled || !selection.filePath) return ok({ cancelled: true as const })
          const sharePackage = await repository.createSharePackage(request.payload.projectId, app.getVersion())
          await repository.writeShareFile(selection.filePath, sharePackage)
          return ok({ cancelled: false as const, filePath: selection.filePath })
        }
      }
    } catch (error) {
      return { ok: false, error: errorPayload(error) }
    }
  })
}

export function unregisterIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNEL)
}
