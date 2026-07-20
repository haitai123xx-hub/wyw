/**
 * renderer 与 main 之间的安全桥。
 *
 * 页面只能调用这里明确列出的 notesApi，不能直接使用 ipcRenderer、fs 或其他
 * Node.js 能力。这样即使界面代码出现问题，也不会自然获得整个电脑的文件权限。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { NotesApi } from '../shared/api'
import { IPC_CHANNEL, NotesApiError, type ApiEnvelope } from '../shared/transport'

async function invoke<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  // ipcRenderer.invoke 像一次异步函数调用：等待主进程 handler 返回结果。
  const response = await ipcRenderer.invoke(IPC_CHANNEL, { method, payload }) as ApiEnvelope<T>
  if (!response || typeof response !== 'object' || !('ok' in response)) {
    throw new NotesApiError({ code: 'INTERNAL_ERROR', message: '主进程返回了无效结果' })
  }
  if (!response.ok) throw new NotesApiError(response.error)
  return response.data
}

const notesApi: NotesApi = {
  // 这些薄封装只负责组织 method/payload；真正的业务和文件写入在主进程完成。
  getLibrary: () => invoke('getLibrary', {}),
  listProjects: () => invoke('listProjects', {}),
  getProject: (id) => invoke('getProject', { id }),
  createProject: (input) => invoke('createProject', { input }),
  updateProject: (id, patch) => invoke('updateProject', { id, patch }),
  deleteProject: (id) => invoke('deleteProject', { id }),
  createGroup: (input) => invoke('createGroup', { input }),
  updateGroup: (id, patch) => invoke('updateGroup', { id, patch }),
  deleteGroup: (id) => invoke('deleteGroup', { id }),
  createAnnotation: (projectId, input) => invoke('createAnnotation', { projectId, input }),
  updateAnnotation: (projectId, annotationId, patch) =>
    invoke('updateAnnotation', { projectId, annotationId, patch }),
  deleteAnnotation: (projectId, annotationId) => invoke('deleteAnnotation', { projectId, annotationId }),
  updateStyles: (projectId, patch) => invoke('updateStyles', { projectId, patch }),
  importProject: () => invoke('importProject', {}),
  exportProject: (projectId) => invoke('exportProject', { projectId }),
}

// 在隔离环境中把只读 API 暴露为 window.notesApi，供 React 页面调用。
contextBridge.exposeInMainWorld('notesApi', Object.freeze(notesApi))
