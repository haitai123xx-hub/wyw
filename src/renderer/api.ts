/**
 * React 使用的统一数据访问层。
 *
 * Electron 中通过 window.notesApi 调用主进程；单独在普通浏览器预览界面时没有
 * preload，因此使用 localStorage 模拟同一套行为。组件不需要知道当前是哪种环境。
 */
import { DEFAULT_STYLES } from './constants';
import type { NotesApi } from '@shared/api';
import { isAnnotationTypeAllowed } from '@shared/annotation-rules';
import { migrateAnnotationsForTextChange } from '@shared/text-migration';
import type {
  Annotation,
  AnnotationStyle,
  AnnotationType,
  Group,
  Library,
  Project,
  ProjectCreateInput,
  ProjectSummary,
} from './types';

type NotesBridge = NotesApi;

const STORAGE_KEY = 'mojian-browser-preview-v3';

function getBridge(): NotesBridge | null {
  // 正式 Electron 页面会被 preload 注入 notesApi，普通浏览器则返回 null。
  return ((window as unknown as { notesApi?: NotesBridge }).notesApi ?? null);
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

interface PreviewStore {
  projects: Project[];
  groups: Group[];
  userStyles: Record<AnnotationType, AnnotationStyle>;
}

function emptyStore(): PreviewStore {
  return { projects: [], groups: [], userStyles: structuredClone(DEFAULT_STYLES) };
}

function readPreviewStore(): PreviewStore {
  // 预览数据损坏时退回空仓库，避免调试页面完全无法打开。
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<PreviewStore>;
    const latestProject = [...(parsed.projects ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const userStyles = structuredClone(parsed.userStyles ?? latestProject?.styles ?? DEFAULT_STYLES);
    return {
      projects: (parsed.projects ?? []).map((project) => ({ ...project, styles: structuredClone(userStyles) })),
      groups: parsed.groups ?? [],
      userStyles,
    };
  } catch {
    return emptyStore();
  }
}

function writePreviewStore(store: PreviewStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function summaryOf(project: Project): ProjectSummary {
  // 左侧列表只需要摘要，不需要重复保存完整正文与批注数组。
  return {
    id: project.id,
    metadata: project.metadata,
    groupId: project.groupId,
    annotationCount: project.annotations.length,
    excerpt: project.originalText.replace(/\s+/g, '').slice(0, 50),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function requireProject(store: PreviewStore, id: string) {
  const project = store.projects.find((item) => item.id === id);
  if (!project) throw new Error('项目不存在或已被删除');
  return project;
}

async function bridgeOrPreview<T>(runBridge: (bridge: NotesBridge) => Promise<T>, runPreview: () => T | Promise<T>): Promise<T> {
  // 泛型 T 保证两条分支必须返回同一种结果，调用组件无需写环境判断。
  const bridge = getBridge();
  if (bridge) return runBridge(bridge);
  return runPreview();
}

export const notesRepository = {
  // 仅用于界面判断是否能够打开 Electron 原生文件对话框等能力。
  isElectron: () => Boolean(getBridge()),

  async getLibrary(): Promise<Library> {
    return bridgeOrPreview(
      (bridge) => bridge.getLibrary(),
      () => {
        const store = readPreviewStore();
        const timestamp = now();
        return { schemaVersion: 2, stylePreferencesVersion: 1, projects: store.projects.map(summaryOf), groups: store.groups, defaultStyles: structuredClone(store.userStyles), createdAt: timestamp, updatedAt: timestamp };
      },
    );
  },

  async getProject(id: string): Promise<Project> {
    return bridgeOrPreview((bridge) => bridge.getProject(id), () => structuredClone(requireProject(readPreviewStore(), id)));
  },

  async createProject(input: ProjectCreateInput): Promise<Project> {
    return bridgeOrPreview((bridge) => bridge.createProject(input), () => {
      const store = readPreviewStore();
      const timestamp = now();
      const project: Project = {
        schemaVersion: 2,
        id: uuid(),
        ...input,
        groupId: input.groupId ?? null,
        annotations: [],
        styles: structuredClone(store.userStyles),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      // structuredClone 防止组件意外直接修改“仓库内部”对象引用。
      store.projects.unshift(project);
      writePreviewStore(store);
      return structuredClone(project);
    });
  },

  async updateProject(id: string, patch: Partial<ProjectCreateInput>): Promise<Project> {
    return bridgeOrPreview((bridge) => bridge.updateProject(id, patch), () => {
      const store = readPreviewStore();
      const project = requireProject(store, id);
      if (patch.metadata) project.metadata = { ...project.metadata, ...patch.metadata };
      if (patch.originalText !== undefined) {
        // 浏览器预览也复用正式后端的坐标迁移算法，保证两种环境表现一致。
        project.annotations = migrateAnnotationsForTextChange(
          project.annotations,
          project.originalText,
          patch.originalText,
          now(),
        ).annotations;
        project.originalText = patch.originalText;
      }
      if ('groupId' in patch) project.groupId = patch.groupId ?? null;
      project.updatedAt = now();
      writePreviewStore(store);
      return structuredClone(project);
    });
  },

  async deleteProject(id: string): Promise<void> {
    return bridgeOrPreview(async (bridge) => { await bridge.deleteProject(id); }, () => {
      const store = readPreviewStore();
      store.projects = store.projects.filter((item) => item.id !== id);
      writePreviewStore(store);
    });
  },

  async createGroup(input: { name: string; color?: string; description?: string }): Promise<Group> {
    return bridgeOrPreview((bridge) => bridge.createGroup(input), () => {
      const store = readPreviewStore();
      const timestamp = now();
      const group: Group = { id: uuid(), name: input.name, color: input.color ?? '#9f5545', description: input.description ?? '', createdAt: timestamp, updatedAt: timestamp };
      store.groups.push(group);
      writePreviewStore(store);
      return group;
    });
  },

  async updateGroup(id: string, patch: Partial<Pick<Group, 'name' | 'color' | 'description'>>): Promise<Group> {
    return bridgeOrPreview((bridge) => bridge.updateGroup(id, patch), () => {
      const store = readPreviewStore();
      const group = store.groups.find((item) => item.id === id);
      if (!group) throw new Error('分组不存在');
      Object.assign(group, patch, { updatedAt: now() });
      writePreviewStore(store);
      return structuredClone(group);
    });
  },

  async deleteGroup(id: string): Promise<void> {
    return bridgeOrPreview(async (bridge) => { await bridge.deleteGroup(id); }, () => {
      const store = readPreviewStore();
      store.groups = store.groups.filter((item) => item.id !== id);
      // 删除分组时保留文章，并把它们归入未分组。
      store.projects.forEach((item) => { if (item.groupId === id) item.groupId = null; });
      writePreviewStore(store);
    });
  },

  async createAnnotation(projectId: string, input: Pick<Annotation, 'type' | 'target' | 'detail' | 'note'>): Promise<Project> {
    return bridgeOrPreview(async (bridge) => {
      // 主进程的创建接口返回单条批注；随后重取项目，让 React 一次获得最新完整状态。
      await bridge.createAnnotation(projectId, input);
      return bridge.getProject(projectId);
    }, () => {
      const store = readPreviewStore();
      const project = requireProject(store, projectId);
      if (!isAnnotationTypeAllowed(input.target.kind, input.type)) throw new Error('所选批注类型不适用于当前粒度');
      const timestamp = now();
      project.annotations.push({ id: uuid(), ...input, target: { ...input.target, status: 'valid' }, createdAt: timestamp, updatedAt: timestamp });
      project.updatedAt = timestamp;
      writePreviewStore(store);
      return structuredClone(project);
    });
  },

  async updateAnnotation(projectId: string, annotationId: string, patch: Partial<Pick<Annotation, 'type' | 'target' | 'detail' | 'note'>>): Promise<Project> {
    return bridgeOrPreview(async (bridge) => {
      await bridge.updateAnnotation(projectId, annotationId, patch);
      return bridge.getProject(projectId);
    }, () => {
      const store = readPreviewStore();
      const project = requireProject(store, projectId);
      const annotation = project.annotations.find((item) => item.id === annotationId);
      if (!annotation) throw new Error('批注不存在');
      const nextKind = patch.target?.kind ?? annotation.target.kind;
      const nextType = patch.type ?? annotation.type;
      if (!isAnnotationTypeAllowed(nextKind, nextType)) throw new Error('所选批注类型不适用于当前粒度');
      Object.assign(annotation, patch, { updatedAt: now() });
      project.updatedAt = now();
      writePreviewStore(store);
      return structuredClone(project);
    });
  },

  async deleteAnnotation(projectId: string, annotationId: string): Promise<Project> {
    return bridgeOrPreview(async (bridge) => {
      await bridge.deleteAnnotation(projectId, annotationId);
      return bridge.getProject(projectId);
    }, () => {
      const store = readPreviewStore();
      const project = requireProject(store, projectId);
      project.annotations = project.annotations.filter((item) => item.id !== annotationId);
      project.updatedAt = now();
      writePreviewStore(store);
      return structuredClone(project);
    });
  },

  async updateStyles(projectId: string, patch: Partial<Record<AnnotationType, AnnotationStyle>>): Promise<Project> {
    return bridgeOrPreview(async (bridge) => {
      await bridge.updateStyles(projectId, patch);
      return bridge.getProject(projectId);
    }, () => {
      const store = readPreviewStore();
      const project = requireProject(store, projectId);
      const styles = { ...store.userStyles };
      Object.entries(patch).forEach(([type, style]) => {
        // Object.entries 会把键推宽成 string，这里恢复成 AnnotationType 后再索引样式表。
        styles[type as AnnotationType] = { ...styles[type as AnnotationType], ...style };
      });
      store.userStyles = styles;
      store.projects.forEach((item) => { item.styles = structuredClone(styles); });
      writePreviewStore(store);
      return structuredClone(project);
    });
  },

  async importProject(): Promise<Project | null> {
    return bridgeOrPreview(async (bridge) => {
      const result = await bridge.importProject();
      return result.cancelled ? null : result.project;
    }, () => null);
  },

  async exportProject(projectId: string) {
    return bridgeOrPreview((bridge) => bridge.exportProject(projectId), () => {
      const store = readPreviewStore();
      const project = requireProject(store, projectId);
      const group = store.groups.find((item) => item.id === project.groupId) ?? null;
      const { styles: _localStyles, ...sharedProject } = project;
      const sharePackage = {
        format: 'wenyan-notes-project',
        formatVersion: 3,
        appVersion: 'browser-preview',
        exportedAt: now(),
        project: sharedProject,
        group,
      };
      const blob = new Blob([JSON.stringify(sharePackage, null, 2)], { type: 'application/json' });
      // 浏览器没有 Electron 保存对话框，因此临时创建下载链接模拟导出。
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.metadata.title || '文言笔记'}.wyw.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      return { cancelled: false as const, filePath: anchor.download };
    });
  },
};
