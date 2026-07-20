/** Vitest 配置：目前只在 Node 环境测试 JSON 数据仓库，不启动 Electron 窗口。 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 测试文件可以直接使用 Node 的临时目录和文件系统 API。
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html']
    }
  }
})
