import { DEFAULT_STYLES } from './constants';
import type { NotesApi } from '@shared/api';
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

const STORAGE_KEY = 'mojian-browser-preview-v1';

function getBridge(): NotesBridge | null {
  return ((window as unknown as { notesApi?: NotesBridge }).notesApi ?? null);
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function emptyStore(): { projects: Project[]; groups: Group[] } {
  return { projects: [], groups: [] };
}

function readPreviewStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReturnType<typeof emptyStore>) : emptyStore();
  } catch {
    return emptyStore();
  }
}

function writePreviewStore(store: ReturnType<typeof emptyStore>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function summaryOf(project: Project): ProjectSummary {
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

function requireProject(store: ReturnType<typeof emptyStore>, id: string) {
  const project = store.projects.find((item) => item.id === id);
  if (!project) throw new Error('项目不存在或已被删除');
  return project;
}

async function bridgeOrPreview<T>(runBridge: (bridge: NotesBridge) => Promise<T>, runPreview: () => T | Promise<T>): Promise<T> {
  const bridge = getBridge();
  if (bridge) return runBridge(bridge);
  return runPreview();
}

export const notesRepository = {
  isElectron: () => Boolean(getBridge()),

  async getLibrary(): Promise<Library> {
    return bridgeOrPreview(
      (bridge) => bridge.getLibrary(),
      () => {
        const store = readPreviewStore();
        const timestamp = now();
        return { schemaVersion: 1, projects: store.projects.map(summaryOf), groups: store.groups, defaultStyles: structuredClone(DEFAULT_STYLES), createdAt: timestamp, updatedAt: timestamp };
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
        schemaVersion: 1,
        id: uuid(),
        ...input,
        groupId: input.groupId ?? null,
        annotations: [],
        styles: structuredClone(DEFAULT_STYLES),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
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
      if (patch.originalText !== undefined) project.originalText = patch.originalText;
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
      store.projects.forEach((item) => { if (item.groupId === id) item.groupId = null; });
      writePreviewStore(store);
    });
  },

  async createAnnotation(projectId: string, input: Pick<Annotation, 'type' | 'target' | 'content'>): Promise<Project> {
    return bridgeOrPreview(async (bridge) => {
      await bridge.createAnnotation(projectId, input);
      return bridge.getProject(projectId);
    }, () => {
      const store = readPreviewStore();
      const project = requireProject(store, projectId);
      const timestamp = now();
      project.annotations.push({ id: uuid(), ...input, createdAt: timestamp, updatedAt: timestamp });
      project.updatedAt = timestamp;
      writePreviewStore(store);
      return structuredClone(project);
    });
  },

  async updateAnnotation(projectId: string, annotationId: string, patch: Partial<Pick<Annotation, 'type' | 'target' | 'content'>>): Promise<Project> {
    return bridgeOrPreview(async (bridge) => {
      await bridge.updateAnnotation(projectId, annotationId, patch);
      return bridge.getProject(projectId);
    }, () => {
      const store = readPreviewStore();
      const project = requireProject(store, projectId);
      const annotation = project.annotations.find((item) => item.id === annotationId);
      if (!annotation) throw new Error('批注不存在');
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
      project.styles = { ...project.styles };
      Object.entries(patch).forEach(([type, style]) => {
        project.styles[type as AnnotationType] = { ...project.styles[type as AnnotationType], ...style };
      });
      project.updatedAt = now();
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
      const sharePackage = {
        format: 'wenyan-notes-project',
        formatVersion: 1,
        appVersion: 'browser-preview',
        exportedAt: now(),
        project,
        group,
        styles: project.styles,
      };
      const blob = new Blob([JSON.stringify(sharePackage, null, 2)], { type: 'application/json' });
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
