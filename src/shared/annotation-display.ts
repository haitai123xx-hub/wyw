import type { Annotation, AnnotationDetail } from './models'

export function annotationDetailLines(detail: AnnotationDetail): string[] {
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
  const lines = annotationDetailLines(annotation.detail)
  return lines[0] || annotation.note || ''
}

export function annotationInlineText(annotation: Pick<Annotation, 'detail'>): string {
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
  return [annotation.target.text, ...annotationDetailLines(annotation.detail), annotation.note].join(' ')
}
