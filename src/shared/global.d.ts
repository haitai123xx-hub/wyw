import type { NotesApi } from './api'

declare global {
  interface Window {
    notesApi: NotesApi
  }
}

export {}
