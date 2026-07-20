/** 为 preload 注入的 window.notesApi 补充全局 TypeScript 类型。 */
import type { NotesApi } from './api'

declare global {
  interface Window {
    // 浏览器原生 Window 没有 notesApi；声明后 renderer 才能安全调用它。
    notesApi: NotesApi
  }
}

// 保留 export 让本文件成为模块，避免 declare global 污染方式不符合预期。
export {}
