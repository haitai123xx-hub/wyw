import type { AnnotationTargetKind, AnnotationType } from './models'

export const ALLOWED_ANNOTATION_TYPES: Record<AnnotationTargetKind, readonly AnnotationType[]> = {
  character: ['definition', 'polysemy', 'ancient-modern', 'word-class', 'phonetic-loan', 'function-word', 'pronunciation'],
  word: ['definition', 'polysemy', 'ancient-modern', 'word-class'],
  sentence: ['definition', 'special-sentence'],
}

export function isAnnotationTypeAllowed(kind: AnnotationTargetKind, type: AnnotationType): boolean {
  return ALLOWED_ANNOTATION_TYPES[kind].includes(type)
}
