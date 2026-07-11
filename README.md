# 墨笺

一个面向文言文学习的本地桌面批注工具。初版以 Windows 为目标平台，使用 Electron、React、TypeScript 与 Vite 构建；文章、批注、分组和显示样式都保存在用户电脑上的 JSON 文件中。

## 初版已经支持

- 一篇文章对应一个独立项目，可粘贴原文或读取 `.txt` / `.md` 文件，并填写标题、作者、朝代、来源、说明和标签。
- 创建多个项目，并用带颜色的分组整理项目。
- 选中文本后，按“字 / 词 / 句”记录批注对象。
- 七类批注：释义、一词多义、古今异义、词类活用、通假字、文言虚词、特殊句式。
- 为每类批注分别设置文字颜色、背景颜色、字体、字号、粗体、下划线和斜体。
- 编辑、删除批注，以及导入、导出单个项目的分享文件。
- 本地离线存储，不要求注册账号，也不会主动把文章上传到服务器。

## 技术架构

应用采用前后端分离的桌面架构：

- `src/renderer/`：React 前端，负责项目管理、阅读、选区批注和样式设置。
- `src/preload/`：受控桥接层，只向页面暴露约定好的笔记 API。
- `src/main/`：Electron 主进程，负责窗口、文件读写、系统文件对话框和数据校验。
- `src/shared/`：前后端共用的数据模型、校验规则和 API 类型。

渲染页面不直接访问文件系统。所有持久化操作都通过 preload 暴露的 IPC 接口交给主进程完成。

## Windows 开发环境

建议准备：

- Windows 10/11 64 位
- Node.js 22.12 或更高版本
- npm（随 Node.js 安装）

在项目根目录执行：

```powershell
npm install
npm run dev
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Electron 开发模式与热更新 |
| `npm run typecheck` | 检查主进程和前端 TypeScript 类型 |
| `npm test` | 运行一次测试 |
| `npm run test:watch` | 以监听模式运行测试 |
| `npm run build` | 类型检查并生成生产代码到 `out/` |
| `npm run preview` | 预览已构建的 Electron 应用 |
| `npm run dist:win` | 构建 Windows x64 NSIS 安装包到 `release/` |

`out/` 和 `release/` 都是生成目录，不应作为业务源代码修改。

## 数据位置与隐私

桌面版把数据写在 Electron 的 `app.getPath('userData')` 目录中，而不是源码目录：

```text
<userData>/
└─ data/
   ├─ library.json
   └─ projects/
      └─ <项目 UUID>.json
```

- `library.json` 保存轻量项目索引和分组。
- `projects/<uuid>.json` 保存某篇文章的完整正文、批注和样式。
- 分享文件只有在用户主动导出时才写入用户选择的位置；只有在用户主动导入时才读取。
- 初版没有账号、云同步、遥测或自动联网分享功能。卸载前如需保留笔记，请先导出重要项目或备份上述数据目录。

具体字段、文本区间规则和导入冲突处理见 [数据模型说明](docs/data-model.md)。

## 目录结构

```text
.
├─ src/
│  ├─ main/             Electron 主进程、JSON 仓库和 IPC
│  ├─ preload/          安全桥接 API
│  ├─ renderer/         React 界面与交互
│  └─ shared/           共用模型、Schema 与 API 类型
├─ docs/
│  └─ data-model.md     数据文件与分享格式说明
├─ electron.vite.config.ts
├─ package.json
├─ tsconfig*.json
└─ vitest.config.ts
```

## 初版边界

当前版本用于验证“项目管理 → 原文选区 → 分类批注 → 自定义显示 → 分享文件”的完整流程。暂不包含账号与云同步、多人实时协作、富文本/图片排版、OCR、自动翻译或 AI 批注、版本历史，以及 Android、iOS、macOS 安装包。

## 后续跨平台演进

数据模型和业务规则位于 `src/shared/`，不绑定 Windows 路径；UI 与文件持久化之间通过类型化 API 隔离。后续可在保持分享格式兼容的前提下：

1. 先验证 Electron 的 macOS 构建与签名，并补充平台相关文件对话框测试。
2. 将共享模型和业务逻辑抽成独立包，供桌面端和移动端共同使用。
3. 移动端采用 React Native、Capacitor 或其他容器实现新的存储适配层。
4. 若增加同步服务，保留本地优先能力，并另行设计加密、冲突合并、账号删除和隐私策略。

分享包通过 `format` 和 `formatVersion` 标识格式。后续字段变化应增加兼容迁移，不应直接破坏旧文件。
