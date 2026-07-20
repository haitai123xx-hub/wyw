/**
 * Electron 主进程入口。
 *
 * 这个文件负责应用生命周期和窗口，不负责绘制具体界面。React 页面运行在另一个
 * renderer 进程中；需要访问文件系统时，页面必须通过 preload 和 IPC 请求主进程。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc'
import { JsonRepository } from './storage'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
// 整个应用只保留一个主窗口引用；窗口关闭后把引用清空，避免使用失效对象。
let mainWindow: BrowserWindow | null = null

/** 只允许把 http/https 链接交给系统浏览器，拒绝 file: 等危险协议。 */
function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#F6F3EA',
    title: '墨笺 · 文言文批注笔记',
    webPreferences: {
      // preload 是页面唯一可以使用的桌面能力入口。
      preload: path.join(currentDirectory, '../preload/index.mjs'),
      // 下面三项共同隔离网页与 Node.js，降低页面代码获得系统权限的风险。
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  window.setMenuBarVisibility(false)

  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    // 墨笺是单页本地应用，不允许当前窗口被导航到任意网页。
    const currentUrl = window.webContents.getURL()
    if (url !== currentUrl) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    // 开发模式：加载 Vite 开发服务器，因此修改 React 后可以热更新。
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // 生产模式：加载 electron-vite 构建到 out/renderer 的静态页面。
    void window.loadFile(path.join(currentDirectory, '../renderer/index.html'))
  }

  return window
}

async function startApplication(): Promise<void> {
  Menu.setApplicationMenu(null)
  // Beta 0.3 使用独立的 data-v2 目录，项目数据不写进源码目录。
  const repository = new JsonRepository(path.join(app.getPath('userData'), 'data-v2'))
  await repository.initialize()
  registerIpcHandlers(repository)
  mainWindow = createMainWindow()
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  // 已经有一个墨笺实例时，第二个进程直接退出。
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(startApplication).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('应用初始化失败:', message)
    app.quit()
  })

  app.on('activate', () => {
    // macOS 常见行为：关闭窗口但不退出应用，点击 Dock 图标时重新建窗。
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
  })

  app.on('before-quit', unregisterIpcHandlers)
  app.on('window-all-closed', () => {
    // Windows/Linux 关闭全部窗口即退出；macOS 通常继续驻留。
    if (process.platform !== 'darwin') app.quit()
  })
}
