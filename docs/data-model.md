# 本地 JSON 数据模型

本文说明初版（`schemaVersion = 1`、`formatVersion = 1`）的数据边界。实现与 Zod 校验规则以 [`src/shared/models.ts`](../src/shared/models.ts) 为准，前后端接口以 [`src/shared/api.ts`](../src/shared/api.ts) 为准。

## 设计原则

- **一篇文章一个项目文件**：正文、批注和该项目的显示样式一起保存，便于独立管理。
- **索引与正文分离**：项目列表只读取轻量的 `library.json`，打开项目时才读取完整正文。
- **本地优先**：主进程只在 Electron 的用户数据目录读写；页面进程不直接接触文件系统。
- **先校验后写入**：运行时文件、IPC 参数和外部分享包都通过严格 Zod Schema 校验；未知字段也会被拒绝。
- **格式可演进**：运行时数据使用 `schemaVersion`，对外分享包另用 `format` 与 `formatVersion`。

## 存储布局

```text
app.getPath('userData')/
└─ data/
   ├─ library.json
   └─ projects/
      ├─ <project-id>.json
      └─ <project-id>.json
```

`project-id` 是 UUID。不要依赖 `userData` 在 Windows 上的绝对路径；它由 Electron 按应用标识和当前用户计算。程序运行时也不要手工修改这些文件，分享和备份应优先使用导出功能。

## 对象关系

```text
Library
├─ groups[]: ProjectGroup
├─ projects[]: ProjectSummary ── id ──> projects/<id>.json
└─ defaultStyles

ProjectDocument
├─ metadata
├─ originalText
├─ groupId ──> Library.groups[].id（也可以为 null）
├─ annotations[] ── target.start/end ──> originalText
└─ styles（七种批注类型各一套）
```

## `library.json`

资料库文件保存分组、项目摘要和新项目的默认样式：

```ts
interface Library {
  schemaVersion: 1
  groups: ProjectGroup[]
  projects: ProjectSummary[]
  defaultStyles: AnnotationStyles
  createdAt: string
  updatedAt: string
}

interface ProjectGroup {
  id: string
  name: string
  color: string
  description: string
  createdAt: string
  updatedAt: string
}

interface ProjectSummary {
  id: string
  metadata: {
    title: string
    author: string
    dynasty: string
    source: string
    description: string
    tags: string[]
  }
  groupId: string | null
  annotationCount: number
  excerpt: string
  createdAt: string
  updatedAt: string
}
```

项目摘要由完整项目计算而来：`metadata` 是项目元数据快照，`annotationCount` 是批注数，`excerpt` 是合并空白后的原文前 160 个 UTF-16 代码单元。摘要不是第二份可独立编辑的项目数据。

资料库必须满足：分组 ID 不重复、项目 ID 不重复，且非空的 `groupId` 必须指向现存分组。删除分组时，初版会保留组内项目并将它们调整为未分组。

## 项目文件

每个 `projects/<uuid>.json` 都是一个完整的 `ProjectDocument`：

```ts
interface ProjectDocument {
  schemaVersion: 1
  id: string
  metadata: {
    title: string
    author: string
    dynasty: string
    source: string
    description: string
    tags: string[]
  }
  originalText: string
  groupId: string | null
  annotations: Annotation[]
  styles: AnnotationStyles
  createdAt: string
  updatedAt: string
}
```

除 `title` 和 `originalText` 必须有内容外，其他元数据可以用空字符串或空数组表示“未填写”；键本身仍会写入文件。项目时间和下文所有时间均为带时区的 ISO 8601 字符串，例如 `2026-07-11T06:30:00.000Z`。

### 批注与选区

```ts
interface Annotation {
  id: string
  type: AnnotationType
  target: {
    kind: 'character' | 'word' | 'sentence'
    start: number
    end: number
    text: string
  }
  content: string
  createdAt: string
  updatedAt: string
}

type AnnotationType =
  | 'definition'        // 释义
  | 'polysemy'          // 一词多义
  | 'ancient-modern'    // 古今异义
  | 'word-class'        // 词类活用
  | 'phonetic-loan'     // 通假字
  | 'function-word'     // 文言虚词
  | 'special-sentence'  // 特殊句式
```

选区采用左闭右开区间 `[start, end)`：

- `start`、`end` 是 JavaScript 字符串的 UTF-16 索引，与 `originalText.slice(start, end)` 一致。
- 必须满足 `0 <= start < end <= originalText.length`。
- `target.text` 必须与 `originalText.slice(start, end)` 完全相同。
- `kind = 'character'` 时，`Array.from(target.text).length` 必须等于 1。
- 一个项目内的批注 ID 不得重复。数据层允许多个批注指向相同或交叠的选区。

因此，正文一旦已有批注，修改正文必须同步重算受影响批注的范围；否则整个项目会因选区与原文不匹配而校验失败。初版界面把“原文”和“批注”视为关联数据，不应绕过应用直接改 JSON。

### 显示样式

`AnnotationStyles` 必须同时包含七个批注类型，每个类型的结构相同：

```ts
interface AnnotationStyle {
  fontColor: string
  backgroundColor: string
  fontFamily: string
  fontSize: number
  bold: boolean
  underline: boolean
  italic: boolean
}
```

- `fontColor` 必须是 `#RRGGBB`。
- `backgroundColor` 可以是 `#RRGGBB` 或 `transparent`。
- `fontFamily` 为 1～120 个字符。
- `fontSize` 为 10～36 的整数。
- 粗体、下划线和斜体均使用布尔值。

`Library.defaultStyles` 是新项目默认值，`ProjectDocument.styles` 是项目自己的样式快照；修改某个项目不会连带改变其他项目。

## 分享文件

桌面版导出扩展名为 `.wyw.json` 的单项目分享包。它不是运行时项目文件的简单复制，而是带格式标识的封装：

```ts
interface SharePackage {
  format: 'wenyan-notes-project'
  formatVersion: 1
  appVersion: string
  exportedAt: string
  project: ProjectDocument
  group: ProjectGroup | null
  styles: AnnotationStyles
}
```

- `project` 包含正文、元数据、全部批注和项目样式。
- `group` 让接收者可以保留原项目的分组信息；未分组项目为 `null`。
- `styles` 是分享时的显式样式快照。版本 1 导出器使用项目当前样式。
- `appVersion` 记录导出应用版本，`exportedAt` 记录导出时间；兼容性判断以 `formatVersion` 为准。

### 导入校验与冲突处理

导入不是覆盖操作，流程如下：

1. 用户主动选择 `.wyw.json` 文件。
2. 完整解析 JSON，并按 `SharePackageSchema` 严格校验格式版本、UUID、时间、正文范围、批注和样式。
3. 若资料库已有同名分组，优先复用该分组。
4. 若导入分组的 ID 已被不同分组占用，则为导入分组生成新 UUID。
5. 若项目 ID 已存在，则为导入项目生成新 UUID，避免覆盖本地项目。
6. 写入项目文件并更新资料库摘要。

导入结果会返回 `groupCreated` 和 `idChanged`，界面可据此提示是否新建了分组、是否因冲突更换了项目 ID。格式不符或正文选区已损坏时，导入失败且不会把未校验对象交给页面使用。

## 字段限制

| 字段 | 限制 |
| --- | --- |
| 项目标题 | 1～200 字符（去除两端空白后） |
| 作者 | 最多 100 字符 |
| 朝代 | 最多 50 字符 |
| 来源 | 最多 300 字符 |
| 项目说明 | 最多 2,000 字符 |
| 标签 | 最多 30 个，每个 1～40 字符 |
| 原文 | 1～2,000,000 个 UTF-16 代码单元 |
| 单条批注内容 | 1～20,000 字符 |
| 单项目批注数量 | 最多 100,000 条 |
| 分组名称 | 1～100 字符 |
| 分组说明 | 最多 500 字符 |

所有对象均为严格结构，不能随意添加未声明字段。需要扩展格式时，应提升版本号、增加迁移函数和回归测试，而不是让旧版本静默忽略新数据。

## 备份与恢复

- 分享单篇笔记：使用项目导出，接收方再导入。
- 完整本地备份：退出应用后复制整个 `<userData>/data/` 目录。
- 恢复完整备份：应在应用退出状态下操作，并确保 `library.json` 与 `projects/` 来自同一次备份。
- 不建议只复制 `library.json`：它只是索引，不含完整正文与批注。

初版不提供云端备份和历史版本。重要资料应保留额外备份副本。
