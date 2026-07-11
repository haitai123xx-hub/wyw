import { contextBridge, ipcRenderer } from 'electron'
import type { NotesApi } from '../shared/api'
import { IPC_CHANNEL, NotesApiError, type ApiEnvelope } from '../shared/transport'

async function invoke<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await ipcRenderer.invoke(IPC_CHANNEL, { method, payload }) as ApiEnvelope<T>
  if (!response || typeof response !== 'object' || !('ok' in response)) {
    throw new NotesApiError({ code: 'INTERNAL_ERROR', message: '主进程返回了无效结果' })
  }
  if (!response.ok) throw new NotesApiError(response.error)
  return response.data
}

const notesApi: NotesApi = {
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

contextBridge.exposeInMainWorld('notesApi', Object.freeze(notesApi))
