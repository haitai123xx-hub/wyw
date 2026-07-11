import { useCallback, useEffect, useMemo, useState } from 'react';
import { notesRepository } from './api';
import { DEFAULT_STYLES, SAMPLE_TEXT } from './constants';
import { BookIcon, ImportIcon, PlusIcon, SparkleIcon } from './icons';
import { DocumentView } from './components/DocumentView';
import { Inspector } from './components/Inspector';
import { Sidebar } from './components/Sidebar';
import { ConfirmModal, GroupModal, ProjectModal } from './components/ProjectModal';
import type { Annotation, AnnotationStyle, AnnotationType, Group, Library, Project, ProjectCreateInput, TextSelection, ToastMessage } from './types';

type GroupFilter = 'all' | 'ungrouped' | string;
type Confirmation =
  | { kind: 'project'; id: string; name: string }
  | { kind: 'group'; id: string; name: string }
  | null;

function ensureProject(project: Project): Project {
  return {
    ...project,
    metadata: {
      title: project.metadata.title,
      author: project.metadata.author ?? '',
      dynasty: project.metadata.dynasty ?? '',
      source: project.metadata.source ?? '',
      description: project.metadata.description ?? '',
      tags: project.metadata.tags ?? [],
    },
    groupId: project.groupId ?? null,
    annotations: project.annotations ?? [],
    styles: Object.fromEntries(Object.entries(DEFAULT_STYLES).map(([type, style]) => [type, { ...style, ...(project.styles?.[type as AnnotationType] ?? {}) }])) as Project['styles'],
  };
}

export default function App() {
  const [library, setLibrary] = useState<Library>({ schemaVersion: 1, projects: [], groups: [], defaultStyles: DEFAULT_STYLES, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupFilter>('all');
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingProject, setLoadingProject] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((message: string, tone: ToastMessage['tone'] = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
  }, []);

  const refreshLibrary = useCallback(async () => {
    const next = await notesRepository.getLibrary();
    setLibrary(next);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const next = await notesRepository.getLibrary();
        if (!alive) return;
        setLibrary(next);
        const previous = localStorage.getItem('mojian-last-project');
        const initial = next.projects.find((item) => item.id === previous)?.id ?? next.projects[0]?.id ?? null;
        setSelectedProjectId(initial);
      } catch (reason) {
        if (alive) setFatalError(reason instanceof Error ? reason.message : '资料库加载失败');
      } finally {
        if (alive) setLoadingLibrary(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setProject(null);
      return;
    }
    let alive = true;
    setLoadingProject(true);
    setProject(null);
    setSelection(null);
    setActiveAnnotationId(null);
    localStorage.setItem('mojian-last-project', selectedProjectId);
    void notesRepository.getProject(selectedProjectId)
      .then((next) => { if (alive) setProject(ensureProject(next)); })
      .catch((reason) => { if (alive) toast(reason instanceof Error ? reason.message : '篇目加载失败', 'error'); })
      .finally(() => { if (alive) setLoadingProject(false); });
    return () => { alive = false; };
  }, [selectedProjectId, toast]);

  const activeAnnotation = useMemo(() => project?.annotations.find((item) => item.id === activeAnnotationId) ?? null, [activeAnnotationId, project]);

  const applyProject = useCallback((next: Project) => {
    setProject(ensureProject(next));
    void refreshLibrary().catch(() => undefined);
  }, [refreshLibrary]);

  const createProject = async (input: ProjectCreateInput) => {
    const created = await notesRepository.createProject(input);
    await refreshLibrary();
    setSelectedProjectId(created.id);
    setProject(ensureProject(created));
    toast(`已创建《${created.metadata.title}》`);
  };

  const updateProject = async (input: ProjectCreateInput) => {
    if (!editingProject) return;
    const updated = await notesRepository.updateProject(editingProject.id, { metadata: input.metadata, groupId: input.groupId ?? null });
    await refreshLibrary();
    if (updated.id === selectedProjectId) setProject(ensureProject(updated));
    toast('篇目设置已保存');
  };

  const openProjectSettings = async (id: string) => {
    try {
      const target = project?.id === id ? project : ensureProject(await notesRepository.getProject(id));
      setEditingProject(target);
      setProjectModalOpen(true);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '无法打开篇目设置', 'error');
    }
  };

  const importProject = async () => {
    try {
      const imported = await notesRepository.importProject();
      if (!imported) return;
      await refreshLibrary();
      setSelectedProjectId(imported.id);
      setProject(ensureProject(imported));
      toast(`已导入《${imported.metadata.title}》`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '导入失败，请检查文件格式', 'error');
    }
  };

  const exportProject = async (id: string) => {
    try {
      const result = await notesRepository.exportProject(id);
      if (!result?.cancelled) toast('笔记已导出，可分享给其他用户');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '导出失败', 'error');
    }
  };

  const createSample = async () => {
    try {
      await createProject({
        metadata: { title: '桃花源记', author: '陶渊明', dynasty: '东晋', source: '示例篇目', description: '这是一篇内置示例。拖动选择原文，即可开始添加批注。', tags: ['示例', '古文'] },
        originalText: SAMPLE_TEXT,
        groupId: null,
      });
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '示例创建失败', 'error');
    }
  };

  const clearSelection = () => {
    setSelection(null);
    setActiveAnnotationId(null);
    window.getSelection()?.removeAllRanges();
  };

  const createAnnotation = async (input: Pick<Annotation, 'type' | 'target' | 'content'>) => {
    if (!project) return;
    try {
      const updated = await notesRepository.createAnnotation(project.id, input);
      applyProject(updated);
      clearSelection();
      toast('批注已添加');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '批注保存失败', 'error');
      throw reason;
    }
  };

  const updateAnnotation = async (id: string, input: Pick<Annotation, 'type' | 'target' | 'content'>) => {
    if (!project) return;
    try {
      const updated = await notesRepository.updateAnnotation(project.id, id, input);
      applyProject(updated);
      setActiveAnnotationId(id);
      toast('批注已更新');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '批注更新失败', 'error');
      throw reason;
    }
  };

  const deleteAnnotation = async (id: string) => {
    if (!project) return;
    try {
      const updated = await notesRepository.deleteAnnotation(project.id, id);
      applyProject(updated);
      clearSelection();
      toast('批注已删除', 'info');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '批注删除失败', 'error');
      throw reason;
    }
  };

  const updateStyle = async (type: AnnotationType, style: AnnotationStyle) => {
    if (!project) return;
    try {
      const updated = await notesRepository.updateStyles(project.id, { [type]: style });
      applyProject(updated);
      toast(`「${type === 'definition' ? '释义' : '批注'}」样式已应用`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '样式保存失败', 'error');
      throw reason;
    }
  };

  const submitGroup = async (input: { name: string; color: string; description: string }) => {
    if (editingGroup) await notesRepository.updateGroup(editingGroup.id, input);
    else await notesRepository.createGroup(input);
    await refreshLibrary();
    toast(editingGroup ? '文集设置已保存' : `已创建文集「${input.name}」`);
  };

  const confirmDelete = async () => {
    if (!confirmation) return;
    if (confirmation.kind === 'project') {
      await notesRepository.deleteProject(confirmation.id);
      const next = await refreshLibrary();
      if (selectedProjectId === confirmation.id) {
        setSelectedProjectId(next.projects[0]?.id ?? null);
        setProject(null);
      }
      toast(`《${confirmation.name}》已删除`, 'info');
    } else {
      await notesRepository.deleteGroup(confirmation.id);
      await refreshLibrary();
      if (activeGroup === confirmation.id) setActiveGroup('all');
      if (project?.groupId === confirmation.id) setProject({ ...project, groupId: null });
      toast(`文集「${confirmation.name}」已删除，篇目已移至未分组`, 'info');
    }
  };

  if (fatalError) {
    return <div className="fatal-screen"><div className="brand-seal">墨</div><h1>资料库暂时无法打开</h1><p>{fatalError}</p><button onClick={() => window.location.reload()}>重新加载</button></div>;
  }

  return (
    <div className="app-shell">
      <Sidebar
        projects={library.projects}
        groups={library.groups}
        selectedProjectId={selectedProjectId}
        activeGroup={activeGroup}
        onActiveGroupChange={setActiveGroup}
        onSelectProject={setSelectedProjectId}
        onNewProject={() => { setEditingProject(null); setProjectModalOpen(true); }}
        onImportProject={() => void importProject()}
        onNewGroup={() => { setEditingGroup(null); setGroupModalOpen(true); }}
        onEditGroup={(group) => { setEditingGroup(group); setGroupModalOpen(true); }}
        onDeleteGroup={(group) => setConfirmation({ kind: 'group', id: group.id, name: group.name })}
        onEditProject={(id) => void openProjectSettings(id)}
        onExportProject={(id) => void exportProject(id)}
        onDeleteProject={(id) => { const summary = library.projects.find((item) => item.id === id); setConfirmation({ kind: 'project', id, name: summary?.metadata.title ?? '该篇目' }); }}
      />

      {loadingLibrary || loadingProject ? (
        <div className="workspace-loading"><div className="loading-paper"><i /><i /><i /><i /></div><span>展卷中……</span></div>
      ) : project ? (
        <>
          <DocumentView
            project={project}
            selection={selection}
            activeAnnotationId={activeAnnotationId}
            onSelectText={(next) => { setSelection(next); setActiveAnnotationId(null); }}
            onAnnotationClick={(annotation) => { setActiveAnnotationId(annotation.id); setSelection(null); window.getSelection()?.removeAllRanges(); }}
            onEditProject={() => void openProjectSettings(project.id)}
            onExportProject={() => void exportProject(project.id)}
          />
          <Inspector
            project={project}
            selection={selection}
            activeAnnotation={activeAnnotation}
            onClearSelection={clearSelection}
            onOpenAnnotation={(annotation) => { setActiveAnnotationId(annotation.id); setSelection(null); }}
            onCreateAnnotation={createAnnotation}
            onUpdateAnnotation={updateAnnotation}
            onDeleteAnnotation={deleteAnnotation}
            onUpdateStyle={updateStyle}
          />
        </>
      ) : (
        <WelcomePane onNew={() => { setEditingProject(null); setProjectModalOpen(true); }} onImport={() => void importProject()} onSample={() => void createSample()} />
      )}

      <ProjectModal open={projectModalOpen} project={editingProject} groups={library.groups} onClose={() => setProjectModalOpen(false)} onSubmit={editingProject ? updateProject : createProject} />
      <GroupModal open={groupModalOpen} group={editingGroup} onClose={() => setGroupModalOpen(false)} onSubmit={submitGroup} />
      <ConfirmModal
        open={Boolean(confirmation)}
        title={confirmation?.kind === 'group' ? `删除文集「${confirmation.name}」？` : `删除《${confirmation?.name ?? ''}》？`}
        description={confirmation?.kind === 'group' ? '文集内的篇目不会被删除，它们将移至“未分组”。' : '篇目原文、全部批注和样式设置都会一并删除，此操作无法撤销。'}
        onClose={() => setConfirmation(null)}
        onConfirm={confirmDelete}
      />

      <div className="toast-stack" aria-live="polite">{toasts.map((item) => <div key={item.id} className={`toast ${item.tone}`}><i>{item.tone === 'success' ? '✓' : item.tone === 'error' ? '!' : 'i'}</i><span>{item.message}</span></div>)}</div>
    </div>
  );
}

function WelcomePane({ onNew, onImport, onSample }: { onNew: () => void; onImport: () => void; onSample: () => void }) {
  return (
    <main className="welcome-pane">
      <div className="welcome-pattern" />
      <div className="welcome-content">
        <div className="welcome-illustration">
          <div className="book-sheet back" /><div className="book-sheet mid" />
          <div className="book-sheet front"><span>学而时习之</span><span>不亦说乎</span><i>注</i></div>
          <div className="ink-circle"><BookIcon size={31} /></div>
        </div>
        <span className="welcome-eyebrow">WELCOME TO MOJIAN</span>
        <h1>以笺注古文，<br /><em>与先贤相逢</em></h1>
        <p>导入一篇文言文，从字、词、句开始精读。你的释义、辨析与心得都会妥善保存在本地。</p>
        <div className="welcome-actions"><button className="welcome-primary" onClick={onNew}><PlusIcon size={18} />新建第一篇</button><button onClick={onImport}><ImportIcon size={18} />导入分享笔记</button></div>
        <button className="sample-link" onClick={onSample}><SparkleIcon size={15} />还没准备好文章？打开《桃花源记》示例</button>
        <div className="welcome-features"><span><b>字</b><i>精确到单字</i></span><span><b>词</b><i>七类知识批注</i></span><span><b>句</b><i>自定义显示样式</i></span></div>
      </div>
    </main>
  );
}
