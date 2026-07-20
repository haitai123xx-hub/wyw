/** renderer 类型入口：复用 shared 数据类型，并补充只在界面中存在的临时状态。 */
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

// 选区只存在于当前页面内；保存批注时会被转换成 AnnotationTarget。
export interface TextSelection {
  start: number;
  end: number;
  text: string;
}

export interface ToastMessage {
  // id 用作 React 列表 key；tone 决定提示条颜色和图标。
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
}
