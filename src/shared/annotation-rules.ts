/** 字、词、句与批注类型之间的业务规则，前端和后端共同使用。 */
import type { AnnotationTargetKind, AnnotationType } from './models'

// Record 要求 character、word、sentence 三个键一个都不能缺少。
export const ALLOWED_ANNOTATION_TYPES: Record<AnnotationTargetKind, readonly AnnotationType[]> = {
  character: ['definition', 'polysemy', 'ancient-modern', 'word-class', 'phonetic-loan', 'function-word', 'pronunciation'],
  word: ['definition', 'polysemy', 'ancient-modern', 'word-class'],
  sentence: ['definition', 'special-sentence'],
}

export function isAnnotationTypeAllowed(kind: AnnotationTargetKind, type: AnnotationType): boolean {
  // readonly 数组只用于查询，避免运行期间意外改写全局规则。
  return ALLOWED_ANNOTATION_TYPES[kind].includes(type)
}
