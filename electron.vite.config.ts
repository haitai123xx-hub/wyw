/**
 * electron-vite 的总构建配置。
 *
 * Electron 应用实际上由三个相互隔离的程序组成：
 * - main：拥有 Node.js 和系统权限的主进程；
 * - preload：连接主进程与页面的受控桥梁；
 * - renderer：运行 React 的浏览器页面。
 *
 * electron-vite 会分别编译这三部分，开发模式下还会为 renderer 提供热更新。
 */
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 主进程不需要把 node_modules 中的依赖重复打包进去。
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  // preload 同样运行在 Electron/Node 环境，使用和 main 相同的依赖处理方式。
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  // renderer 是浏览器环境；React 插件负责转换 JSX，并支持开发时热更新。
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
