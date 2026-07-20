/** 修改原文后迁移批注坐标，避免简单增删文字导致全部批注失效。 */
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
  // 从左向右寻找新旧文本完全相同的公共前缀。
  const prefixLimit = Math.min(previousText.length, nextText.length)
  while (prefixLength < prefixLimit && previousText[prefixLength] === nextText[prefixLength]) {
    prefixLength += 1
  }

  let suffixLength = 0
  // 再从右向左寻找公共后缀；中间剩余部分被视为本次修改区域。
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
    // 修改区之前的批注位置完全不变。
    if (end <= prefixLength) return annotation

    if (start >= previousChangedEnd) {
      // 修改区之后的批注整体平移新旧文本长度差。
      return {
        ...annotation,
        target: { ...annotation.target, start: start + delta, end: end + delta },
        updatedAt,
      }
    }

    reviewCount += 1
    // 与修改区相交时无法可靠猜测新位置，保留批注并等待用户重新定位。
    return {
      ...annotation,
      target: { ...annotation.target, status: 'needs-review' },
      updatedAt,
    }
  })

  return { annotations: migrated, reviewCount }
}
