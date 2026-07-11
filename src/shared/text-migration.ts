import type { Annotation } from './models'

export interface TextMigrationResult {
  annotations: Annotation[]
  reviewCount: number
}

/** 将一次修改归纳为共同前缀、修改区、共同后缀，并迁移不受影响的批注。 */
export function migrateAnnotationsForTextChange(
  annotations: Annotation[],
  previousText: string,
  nextText: string,
  updatedAt: string,
): TextMigrationResult {
  if (previousText === nextText) {
    return {
      annotations,
      reviewCount: annotations.filter((annotation) => annotation.target.status === 'needs-review').length,
    }
  }

  let prefixLength = 0
  const prefixLimit = Math.min(previousText.length, nextText.length)
  while (prefixLength < prefixLimit && previousText[prefixLength] === nextText[prefixLength]) {
    prefixLength += 1
  }

  let suffixLength = 0
  const suffixLimit = Math.min(previousText.length - prefixLength, nextText.length - prefixLength)
  while (
    suffixLength < suffixLimit &&
    previousText[previousText.length - 1 - suffixLength] === nextText[nextText.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  const previousChangedEnd = previousText.length - suffixLength
  const delta = nextText.length - previousText.length
  let reviewCount = 0

  const migrated = annotations.map((annotation): Annotation => {
    if (annotation.target.status === 'needs-review') {
      reviewCount += 1
      return annotation
    }

    const { start, end } = annotation.target
    if (end <= prefixLength) return annotation

    if (start >= previousChangedEnd) {
      return {
        ...annotation,
        target: { ...annotation.target, start: start + delta, end: end + delta },
        updatedAt,
      }
    }

    reviewCount += 1
    return {
      ...annotation,
      target: { ...annotation.target, status: 'needs-review' },
      updatedAt,
    }
  })

  return { annotations: migrated, reviewCount }
}
