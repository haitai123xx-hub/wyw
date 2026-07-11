import { useMemo, useState } from 'react';
import { BookIcon, ChevronIcon, ExportIcon, FolderIcon, ImportIcon, MoreIcon, PlusIcon, SearchIcon, SettingsIcon, TrashIcon } from '../icons';
import type { Group, ProjectSummary } from '../types';

type GroupFilter = 'all' | 'ungrouped' | string;

interface SidebarProps {
  projects: ProjectSummary[];
  groups: Group[];
  selectedProjectId: string | null;
  activeGroup: GroupFilter;
  onActiveGroupChange: (group: GroupFilter) => void;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onImportProject: () => void;
  onNewGroup: () => void;
  onEditGroup: (group: Group) => void;
  onDeleteGroup: (group: Group) => void;
  onEditProject: (id: string) => void;
  onExportProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onHide: () => void;
  hidden?: boolean;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const dayMs = 86_400_000;
  const delta = Math.floor((today.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / dayMs);
  if (delta === 0) return '今天';
  if (delta === 1) return '昨天';
  if (delta > 1 && delta < 7) return `${delta} 天前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function Sidebar({
  projects,
  groups,
  selectedProjectId,
  activeGroup,
  onActiveGroupChange,
  onSelectProject,
  onNewProject,
  onImportProject,
  onNewGroup,
  onEditGroup,
  onDeleteGroup,
  onEditProject,
  onExportProject,
  onDeleteProject,
  onHide,
  hidden = false,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: projects.length, ungrouped: 0 };
    projects.forEach((project) => {
      if (project.groupId) result[project.groupId] = (result[project.groupId] ?? 0) + 1;
      else result.ungrouped += 1;
    });
    return result;
  }, [projects]);

  const visibleProjects = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return projects.filter((project) => {
      if (activeGroup === 'ungrouped' && project.groupId) return false;
      if (activeGroup !== 'all' && activeGroup !== 'ungrouped' && project.groupId !== activeGroup) return false;
      if (!keyword) return true;
      const metadata = project.metadata;
      return [metadata.title, metadata.author, metadata.dynasty, ...(metadata.tags ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(keyword));
    });
  }, [activeGroup, projects, query]);

  return (
    <aside className={`sidebar ${hidden ? 'is-pane-hidden' : ''}`}>
      <header className="brand-block">
        <div className="brand-seal">墨</div>
        <div>
          <div className="brand-name">墨笺</div>
          <div className="brand-subtitle">文言文批注笔记</div>
        </div>
        <button className="brand-collapse" onClick={onHide} title="隐藏篇目区域" aria-label="隐藏篇目区域"><ChevronIcon size={15} /></button>
      </header>

      <div className="sidebar-actions">
        <button className="primary-action" onClick={onNewProject}><PlusIcon size={17} />新建文章</button>
        <button className="icon-action" onClick={onImportProject} title="导入分享笔记" aria-label="导入分享笔记"><ImportIcon size={17} /></button>
      </div>

      <label className="search-box">
        <SearchIcon size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索篇目、作者或标签" />
        {query && <button onClick={() => setQuery('')} aria-label="清空搜索">×</button>}
      </label>

      <div className="sidebar-scroll">
        <section className="nav-section">
          <div className="section-heading">
            <span>文集</span>
            <button onClick={onNewGroup} title="新建分组"><PlusIcon size={15} /></button>
          </div>
          <button className={`group-row ${activeGroup === 'all' ? 'active' : ''}`} onClick={() => onActiveGroupChange('all')}>
            <span className="group-icon all"><BookIcon size={16} /></span><span className="group-name">全部篇目</span><span className="group-count">{counts.all}</span>
          </button>
          {groups.map((group) => (
            <div className={`group-row-wrap ${activeGroup === group.id ? 'active' : ''}`} key={group.id}>
              <button className="group-row" onClick={() => onActiveGroupChange(group.id)}>
                <span className="group-dot" style={{ background: group.color || '#8b6b55' }} />
                <span className="group-name">{group.name}</span>
                <span className="group-count">{counts[group.id] ?? 0}</span>
              </button>
              <button className="group-settings" title="分组设置" onClick={() => onEditGroup(group)}><SettingsIcon size={14} /></button>
              <button className="group-delete" title="删除分组" onClick={() => onDeleteGroup(group)}><TrashIcon size={14} /></button>
            </div>
          ))}
          <button className={`group-row ${activeGroup === 'ungrouped' ? 'active' : ''}`} onClick={() => onActiveGroupChange('ungrouped')}>
            <span className="group-icon"><FolderIcon size={16} /></span><span className="group-name">未分组</span><span className="group-count">{counts.ungrouped}</span>
          </button>
        </section>

        <section className="nav-section project-section">
          <div className="section-heading">
            <span>{activeGroup === 'all' ? '最近篇目' : '分组篇目'}</span>
            <span className="result-count">{visibleProjects.length} 篇</span>
          </div>
          <div className="project-list">
            {visibleProjects.map((project) => {
              const group = groups.find((item) => item.id === project.groupId);
              return (
                <button
                  key={project.id}
                  className={`project-card ${selectedProjectId === project.id ? 'active' : ''}`}
                  onClick={() => { onSelectProject(project.id); setOpenMenu(null); }}
                >
                  <span className="project-accent" style={{ background: group?.color || '#b48b6a' }} />
                  <span className="project-card-content">
                    <span className="project-title-row">
                      <strong>{project.metadata.title || '未命名篇目'}</strong>
                      <span
                        className="project-more"
                        role="button"
                        tabIndex={0}
                        title="项目操作"
                        onClick={(event) => { event.stopPropagation(); setOpenMenu(openMenu === project.id ? null : project.id); }}
                      ><MoreIcon size={17} /></span>
                    </span>
                    <span className="project-byline">
                      {[project.metadata.dynasty, project.metadata.author].filter(Boolean).join(' · ') || group?.name || '未填写作者'}
                    </span>
                    <span className="project-meta-row">
                      <span>{project.annotationCount} 条批注</span><span>{formatDate(project.updatedAt)}</span>
                    </span>
                  </span>
                  {openMenu === project.id && (
                    <span className="project-menu" onClick={(event) => event.stopPropagation()}>
                      <span role="button" tabIndex={0} onClick={() => { setOpenMenu(null); onEditProject(project.id); }}><SettingsIcon size={15} />篇目设置</span>
                      <span role="button" tabIndex={0} onClick={() => { setOpenMenu(null); onExportProject(project.id); }}><ExportIcon size={15} />导出分享</span>
                      <span className="danger" role="button" tabIndex={0} onClick={() => { setOpenMenu(null); onDeleteProject(project.id); }}><TrashIcon size={15} />删除篇目</span>
                    </span>
                  )}
                </button>
              );
            })}
            {!visibleProjects.length && (
              <div className="small-empty">
                <span className="empty-glyph">简</span>
                <p>{query ? '没有找到匹配的篇目' : '这个文集中还没有篇目'}</p>
                {!query && <button onClick={onNewProject}>新建一篇</button>}
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="sidebar-footer">
        <span className="storage-indicator"><i />本地资料库</span>
        <span>Beta 0.1.2</span>
      </footer>
    </aside>
  );
}
