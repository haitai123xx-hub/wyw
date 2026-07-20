/** 把结构化批注转换为详情、行间摘要和搜索文本。 */
import type { Annotation, AnnotationDetail } from './models'

export function annotationDetailLines(detail: AnnotationDetail): string[] {
  // detail.kind 是辨识字段；每个 case 中 TypeScript 都知道该类型拥有哪些字段。
  switch (detail.kind) {
    case 'definition': return [detail.meaning]
    case 'polysemy': return [
      `本句义：${detail.contextualMeaning}`,
      ...detail.otherMeanings.map((item) => `其他义项：${item.meaning}${item.example ? `（${item.example}）` : ''}`),
    ]
    case 'ancient-modern': return [`古义：${detail.ancientMeaning}`, `今义：${detail.modernMeaning}`]
    case 'word-class': return [`${detail.usage} · ${detail.meaning}`]
    case 'phonetic-loan': return [`通“${detail.standardCharacter}”${detail.pronunciation ? `，读 ${detail.pronunciation}` : ''}`, detail.meaning]
    case 'function-word': return [`${detail.partOfSpeech} · ${detail.usage}`, detail.translation || '通常不译']
    case 'special-sentence': return [
      detail.patterns.map((item) => `${item.categoryLabel} · ${item.label}`).join('；'),
      ...(detail.restoredText ? [`还原：${detail.restoredText}`] : []),
    ]
    case 'pronunciation': return [`读音：${detail.pinyin}`]
  }
}

export function annotationSummary(annotation: Pick<Annotation, 'detail' | 'note'>): string {
  // Pick 表示这里只需要 Annotation 的 detail 和 note 两个字段。
  const lines = annotationDetailLines(annotation.detail)
  return lines[0] || annotation.note || ''
}

export function annotationInlineText(annotation: Pick<Annotation, 'detail'>): string {
  // 行间空间有限，因此这里使用比详情卡片更短的表达。
  const detail = annotation.detail
  switch (detail.kind) {
    case 'definition': return `释：${detail.meaning}`
    case 'polysemy': return `本句义：${detail.contextualMeaning}`
    case 'ancient-modern': return `古：${detail.ancientMeaning}；今：${detail.modernMeaning}`
    case 'word-class': return `${detail.usage}：${detail.meaning}`
    case 'phonetic-loan': return `通“${detail.standardCharacter}”：${detail.meaning}`
    case 'function-word': return `${detail.partOfSpeech}·${detail.usage}${detail.translation ? `：${detail.translation}` : ''}`
    case 'special-sentence': return detail.patterns.map((item) => `${item.categoryLabel}·${item.label}`).join('；')
    case 'pronunciation': return detail.pinyin
  }
}

export function annotationSearchText(annotation: Pick<Annotation, 'target' | 'detail' | 'note'>): string {
  // 把原文、结构化内容和补充笔记拼接，供右侧列表进行一次字符串搜索。
  return [annotation.target.text, ...annotationDetailLines(annotation.detail), annotation.note].join(' ')
}
