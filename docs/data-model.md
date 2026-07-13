# 墨笺 Beta 0.3 数据模型

Beta 0.3 使用 `schemaVersion: 2`，数据目录为应用用户目录下的 `data-v2`。它不读取 Beta 0.1.x 数据，也不会删除旧目录。

## 项目

每篇文章仍是一个独立 JSON 项目：

```ts
interface ProjectDocument {
  schemaVersion: 2
  id: string
  metadata: ProjectMetadata
  originalText: string
  groupId: string | null
  annotations: Annotation[]
  styles: Record<AnnotationType, AnnotationStyle>
  createdAt: string
  updatedAt: string
}
```

## 批注

批注不再共用一个 `content` 字符串。`detail.kind` 必须和外层 `type` 相同，`note` 只保存可选的补充说明。

```ts
interface Annotation {
  id: string
  type: AnnotationType
  target: {
    kind: 'character' | 'word' | 'sentence'
    start: number
    end: number
    text: string
    status: 'valid' | 'needs-review'
  }
  detail: AnnotationDetail
  note: string
  createdAt: string
  updatedAt: string
}
```

结构化内容包括：

- `definition`：释义或句意。
- `polysemy`：本句义和可重复添加的其他义项。
- `ancient-modern`：古义、今义。
- `word-class`：活用方式、句中意思。
- `phonetic-loan`：所通本字、意思、可选读音。
- `function-word`：虚词、词性、预制用法、常见译法。
- `special-sentence`：一个或多个句式选项、可选还原文本。
- `pronunciation`：单字拼音。

## 粒度规则

```ts
character: 释义、一词多义、古今异义、词类活用、通假字、文言虚词、注音
word:      释义、一词多义、古今异义、词类活用
sentence:  释义、特殊句式
```

“字”及“注音”都必须精确对应一个 Unicode 字符。

## 显示样式

每种批注样式包含字体颜色、背景颜色、字体、字号、加粗、下划线、斜体，以及：

- `mark`：文字色、背景、实线、虚线、波浪线、字下圆点或组合。
- `backgroundOpacity`：背景透明度。
- `visible`：是否默认显示。
- `priority`：重叠时的主要样式优先级。
- `notePosition`：结构化批注内容显示在原文上方、下方或在正文中隐藏。
- `noteFontSize`：行间批注文字大小。

“标注”模式会把结构化批注摘要直接绘制在对应字词的上方或下方。行间文字由 CSS 伪元素生成，不会混入原文文本，也不会破坏选区坐标和复制内容。

正文排版和当前阅读模式属于本机偏好，不写入分享项目；批注类型样式随项目导出。

## 分享包

Beta 0.3 分享包使用 `formatVersion: 2`，只接受相同格式版本。
