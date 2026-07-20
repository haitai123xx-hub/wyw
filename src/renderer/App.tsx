/**
 * React 应用的总协调组件。
 *
 * App 保存当前资料库、项目、选区和弹窗等共享状态；子组件负责显示，并通过回调
 * 把用户操作传回 App。真正的持久化仍由 notesRepository 完成。
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { notesRepository } from './api';
import { DEFAULT_STYLES, SAMPLE_TEXT } from './constants';
import { BookIcon, ChevronIcon, ImportIcon, PlusIcon, SparkleIcon } from './icons';
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

function readStoredNumber(key: string, fallback: number, minimum: number, maximum: number) {
  // localStorage 是字符串存储；读取后转换为数字并限制在安全范围内。
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function readStoredVisibility(key: string) {
  return localStorage.getItem(key) !== 'false';
}

function ensureProject(project: Project): Project {
  // 为可能缺少新字段的数据补默认值，让组件只处理稳定的完整结构。
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
    annotations: (project.annotations ?? []).map((annotation) => ({
      ...annotation,
      target: { ...annotation.target, status: annotation.target.status ?? 'valid' },
    })),
    styles: Object.fromEntries(Object.entries(DEFAULT_STYLES).map(([type, style]) => [type, { ...style, ...(project.styles?.[type as AnnotationType] ?? {}) }])) as Project['styles'],
  };
}

export default function App() {
  // 数据状态：library 用于左侧摘要列表，project 是当前打开的完整文章。
  const [library, setLibrary] = useState<Library>({ schemaVersion: 2, stylePreferencesVersion: 1, projects: [], groups: [], defaultStyles: DEFAULT_STYLES, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupFilter>('all');
  // 交互状态：正文选区、正在编辑的批注以及重新定位中的批注。
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [relinkAnnotationId, setRelinkAnnotationId] = useState<string | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingProject, setLoadingProject] = useState(false);
  const [fatalError, setFatalError] = useState('');
  // 弹窗和临时反馈状态不会写入项目 JSON。
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // 布局偏好只属于本机，通过 localStorage 记忆，不跟随项目导出。
  const [sidebarVisible, setSidebarVisible] = useState(() => readStoredVisibility('mojian-sidebar-visible'));
  const [inspectorVisible, setInspectorVisible] = useState(() => readStoredVisibility('mojian-inspector-visible'));
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredNumber('mojian-sidebar-width', 278, 220, 420));
  const [inspectorWidth, setInspectorWidth] = useState(() => readStoredNumber('mojian-inspector-width', 354, 300, 520));

  const toast = useCallback((message: string, tone: ToastMessage['tone'] = 'success') => {
    // 使用函数式 setState，确保连续出现多条提示时不会丢失前一条。
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
    // 依赖数组中的任意布局值改变后，立即保存本机偏好。
    localStorage.setItem('mojian-sidebar-visible', String(sidebarVisible));
    localStorage.setItem('mojian-inspector-visible', String(inspectorVisible));
    localStorage.setItem('mojian-sidebar-width', String(sidebarWidth));
    localStorage.setItem('mojian-inspector-width', String(inspectorWidth));
  }, [inspectorVisible, inspectorWidth, sidebarVisible, sidebarWidth]);

  const startResize = useCallback((side: 'sidebar' | 'inspector', event: ReactPointerEvent<HTMLDivElement>) => {
    // pointermove 挂到 window，即使鼠标离开窄分隔条也能继续拖动。
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === 'sidebar' ? sidebarWidth : inspectorWidth;
    document.body.classList.add('is-resizing-pane');

    const onMove = (moveEvent: PointerEvent) => {
      const delta = side === 'sidebar' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const otherWidth = side === 'sidebar' && inspectorVisible
        ? inspectorWidth
        : side === 'inspector' && sidebarVisible ? sidebarWidth : 0;
      const maximum = Math.max(side === 'sidebar' ? 220 : 300, Math.min(side === 'sidebar' ? 420 : 520, window.innerWidth - otherWidth - 430));
      const nextWidth = Math.round(Math.min(maximum, Math.max(side === 'sidebar' ? 220 : 300, startWidth + delta)));
      if (side === 'sidebar') setSidebarWidth(nextWidth);
      else setInspectorWidth(nextWidth);
    };
    const onEnd = () => {
      // 拖动结束必须移除所有全局监听，避免以后每次移动鼠标仍触发旧函数。
      document.body.classList.remove('is-resizing-pane');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('blur', onEnd);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd, { once: true });
    window.addEventListener('pointercancel', onEnd, { once: true });
    window.addEventListener('blur', onEnd, { once: true });
  }, [inspectorVisible, inspectorWidth, sidebarVisible, sidebarWidth]);

  useEffect(() => {
    // 首次挂载时只加载一次资料库，并优先恢复上次打开的项目。
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
    // selectedProjectId 改变时异步读取完整项目，同时清空属于旧项目的临时选区。
    if (!selectedProjectId) {
      setProject(null);
      return;
    }
    // cleanup 会把 alive 设为 false，防止较慢的旧请求覆盖后来选择的新项目。
    let alive = true;
    setLoadingProject(true);
    setProject(null);
    setSelection(null);
    setActiveAnnotationId(null);
    setRelinkAnnotationId(null);
    localStorage.setItem('mojian-last-project', selectedProjectId);
    void notesRepository.getProject(selectedProjectId)
      .then((next) => { if (alive) setProject(ensureProject(next)); })
      .catch((reason) => { if (alive) toast(reason instanceof Error ? reason.message : '篇目加载失败', 'error'); })
      .finally(() => { if (alive) setLoadingProject(false); });
    return () => { alive = false; };
  }, [selectedProjectId, toast]);

  const activeAnnotation = useMemo(() => project?.annotations.find((item) => item.id === activeAnnotationId) ?? null, [activeAnnotationId, project]);

  const applyProject = useCallback((next: Project) => {
    // 写操作返回新项目后更新正文，同时刷新左侧摘要中的时间和批注数。
    setProject(ensureProject(next));
    void refreshLibrary().catch(() => undefined);
  }, [refreshLibrary]);

  const createProject = async (input: ProjectCreateInput) => {
    // await 保证创建、刷新列表、选中新项目按顺序完成。
    const created = await notesRepository.createProject(input);
    await refreshLibrary();
    setSelectedProjectId(created.id);
    setProject(ensureProject(created));
    toast(`已创建《${created.metadata.title}》`);
  };

  const updateProject = async (input: ProjectCreateInput) => {
    if (!editingProject) return;
    const updated = await notesRepository.updateProject(editingProject.id, {
      metadata: input.metadata,
      originalText: input.originalText,
      groupId: input.groupId ?? null,
    });
    await refreshLibrary();
    if (updated.id === selectedProjectId) setProject(ensureProject(updated));
    setSelection(null);
    setActiveAnnotationId(null);
    setRelinkAnnotationId(null);
    const reviewCount = updated.annotations.filter((annotation) => annotation.target.status === 'needs-review').length;
    // 原文修改区与旧批注相交时，提醒用户这些批注需要重新选位置。
    toast(reviewCount ? `篇目已保存，${reviewCount} 条批注需要重新定位` : '篇目设置已保存', reviewCount ? 'info' : 'success');
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
    // 示例先创建文章，再用正常仓库接口添加四种批注，因此也验证了完整数据流程。
    try {
      const created = await notesRepository.createProject({
        metadata: { title: '桃花源记', author: '陶渊明', dynasty: '东晋', source: '示例篇目', description: '这是一篇内置示例。拖动选择原文，即可开始添加批注。', tags: ['示例', '古文'] },
        originalText: SAMPLE_TEXT,
        groupId: null,
      });
      await refreshLibrary();
      setSelectedProjectId(created.id);
      setProject(ensureProject(created));
      let demonstrated = await notesRepository.createAnnotation(created.id, {
        type: 'pronunciation', target: { kind: 'character', start: 0, end: 1, text: '晋', status: 'valid' },
        detail: { kind: 'pronunciation', pinyin: 'jìn' }, note: '',
      });
      demonstrated = await notesRepository.createAnnotation(created.id, {
        type: 'definition', target: { kind: 'word', start: 1, end: 3, text: '太元', status: 'valid' },
        detail: { kind: 'definition', meaning: '东晋孝武帝年号' }, note: '',
      });
      const functionWordStart = SAMPLE_TEXT.indexOf('之');
      demonstrated = await notesRepository.createAnnotation(created.id, {
        type: 'function-word', target: { kind: 'character', start: functionWordStart, end: functionWordStart + 1, text: '之', status: 'valid' },
        detail: { kind: 'function-word', character: '之', usageCode: 'possessive', partOfSpeech: '助词', usage: '结构助词', translation: '的' }, note: '',
      });
      const ancientModernStart = SAMPLE_TEXT.indexOf('交通');
      demonstrated = await notesRepository.createAnnotation(created.id, {
        type: 'ancient-modern', target: { kind: 'word', start: ancientModernStart, end: ancientModernStart + 2, text: '交通', status: 'valid' },
        detail: { kind: 'ancient-modern', ancientMeaning: '交错相通', modernMeaning: '运输事业' }, note: '',
      });
      setProject(ensureProject(demonstrated));
      await refreshLibrary();
      toast('已创建带有行间批注的《桃花源记》示例');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '示例创建失败', 'error');
    }
  };

  const clearSelection = () => {
    // React 状态与浏览器原生 Selection 是两套数据，两边都要清空。
    setSelection(null);
    setActiveAnnotationId(null);
    setRelinkAnnotationId(null);
    window.getSelection()?.removeAllRanges();
  };

  const createAnnotation = async (input: Pick<Annotation, 'type' | 'target' | 'detail' | 'note'>) => {
    if (!project) return;
    try {
      const updated = await notesRepository.createAnnotation(project.id, input);
      // 仓库返回包含新批注的完整项目，交给 applyProject 统一更新。
      applyProject(updated);
      setActiveAnnotationId(null);
      setRelinkAnnotationId(null);
      toast('批注已添加，可继续为同一段原文添加其他批注');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : '批注保存失败', 'error');
      throw reason;
    }
  };

  const updateAnnotation = async (id: string, input: Pick<Annotation, 'type' | 'target' | 'detail' | 'note'>) => {
    if (!project) return;
    try {
      const updated = await notesRepository.updateAnnotation(project.id, id, input);
      applyProject(updated);
      setActiveAnnotationId(id);
      setRelinkAnnotationId(null);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
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
      toast(`「${type === 'definition' ? '释义' : '批注'}」已保存为本机显示预设`);
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
    // 同一个确认弹窗通过 kind 区分“删除项目”和“删除分组”两条流程。
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
    // 资料库无法初始化时不渲染正常界面，避免用户继续操作半初始化状态。
    return <div className="fatal-screen"><div className="brand-seal">墨</div><h1>资料库暂时无法打开</h1><p>{fatalError}</p><button onClick={() => window.location.reload()}>重新加载</button></div>;
  }

  const layoutStyle = {
    // CSS 自定义属性把 React 中的可见性和宽度传给三栏布局。
    '--sidebar-width': sidebarVisible ? `${sidebarWidth}px` : '0px',
    '--sidebar-divider': sidebarVisible ? '6px' : '0px',
    '--inspector-width': project && inspectorVisible ? `${inspectorWidth}px` : '0px',
    '--inspector-divider': project && inspectorVisible ? '6px' : '0px',
  } as CSSProperties;

  return (
    // App 只组合组件和传递数据/回调；具体布局由各组件及 styles.css 完成。
    <div className={`app-shell ${sidebarVisible ? '' : 'sidebar-hidden'} ${project && !inspectorVisible ? 'inspector-hidden' : ''}`} style={layoutStyle}>
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
          onHide={() => setSidebarVisible(false)}
          hidden={!sidebarVisible}
        />
      {sidebarVisible && <div className="pane-resizer sidebar-resizer" onPointerDown={(event) => startResize('sidebar', event)} onDoubleClick={() => setSidebarWidth(278)} title="拖动调整篇目区域宽度；双击恢复默认" />}
      {!sidebarVisible && <button className="pane-reveal pane-reveal-left" onClick={() => setSidebarVisible(true)} title="显示篇目区域" aria-label="显示篇目区域"><ChevronIcon size={17} /></button>}

      {loadingLibrary || loadingProject ? (
        <div className="workspace-loading"><div className="loading-paper"><i /><i /><i /><i /></div><span>展卷中……</span></div>
      ) : project ? (
        <>
          <DocumentView
            project={project}
            selection={selection}
            activeAnnotationId={activeAnnotationId}
            onSelectText={(next) => { setSelection(next); if (!relinkAnnotationId) setActiveAnnotationId(null); }}
            onAnnotationClick={(annotation) => { setActiveAnnotationId(annotation.id); setRelinkAnnotationId(null); setSelection(null); window.getSelection()?.removeAllRanges(); }}
            onEditProject={() => void openProjectSettings(project.id)}
            onExportProject={() => void exportProject(project.id)}
          />
          {inspectorVisible && <div className="pane-resizer inspector-resizer" onPointerDown={(event) => startResize('inspector', event)} onDoubleClick={() => setInspectorWidth(354)} title="拖动调整批注区域宽度；双击恢复默认" />}
          <Inspector
            project={project}
            selection={selection}
            activeAnnotation={activeAnnotation}
            onClearSelection={clearSelection}
            onOpenAnnotation={(annotation) => { setActiveAnnotationId(annotation.id); setRelinkAnnotationId(null); setSelection(null); }}
            onCreateAnnotation={createAnnotation}
            onUpdateAnnotation={updateAnnotation}
            onDeleteAnnotation={deleteAnnotation}
            onUpdateStyle={updateStyle}
            isRelinking={relinkAnnotationId !== null}
            onStartRelink={(id) => { setActiveAnnotationId(id); setRelinkAnnotationId(id); setSelection(null); toast('请在正文中选择这条批注的新位置', 'info'); }}
            onHide={() => setInspectorVisible(false)}
            hidden={!inspectorVisible}
          />
          {!inspectorVisible && <button className="pane-reveal pane-reveal-right" onClick={() => setInspectorVisible(true)} title="显示批注区域" aria-label="显示批注区域"><ChevronIcon size={17} /></button>}
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
  // 没有选中项目时显示纯展示型欢迎页，所有动作仍交回 App 处理。
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
