import type {
  Annotation as SharedAnnotation,
  AnnotationStyle as SharedAnnotationStyle,
  AnnotationType as SharedAnnotationType,
  CreateProjectInput,
  Library as SharedLibrary,
  ProjectDocument,
  ProjectGroup,
  ProjectMetadata as SharedProjectMetadata,
  ProjectSummary as SharedProjectSummary,
  AnnotationTarget as SharedAnnotationTarget,
  AnnotationTargetKind,
} from '@shared/models';

export type AnnotationType = SharedAnnotationType;
export type TargetKind = AnnotationTargetKind;
export type AnnotationTarget = SharedAnnotationTarget;
export type Annotation = SharedAnnotation;
export type AnnotationStyle = SharedAnnotationStyle;
export type ProjectMetadata = SharedProjectMetadata;
export type Project = ProjectDocument;
export type ProjectSummary = SharedProjectSummary;
export type Group = ProjectGroup;
export type Library = SharedLibrary;
export type ProjectCreateInput = CreateProjectInput;

export interface TextSelection {
  start: number;
  end: number;
  text: string;
}

export interface ToastMessage {
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
}

