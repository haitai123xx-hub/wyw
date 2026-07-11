import { useMemo, useRef } from 'react';
import { ANNOTATION_TYPES, annotationTypeMeta } from '../constants';
import { EditIcon, ExportIcon, InfoIcon, NoteIcon } from '../icons';
import type { Annotation, AnnotationStyle, Project, TextSelection } from '../types';

interface DocumentViewProps {
  project: Project;
  activeAnnotationId: string | null;
  selection: TextSelection | null;
  onSelectText: (selection: TextSelection) => void;
  onAnnotationClick: (annotation: Annotation) => void;
  onEditProject: () => void;
  onExportProject: () => void;
}

interface Segment {
  start: number;
  end: number;
  text: string;
  annotations: Annotation[];
}

function makeSegments(project: Project): Segment[] {
  const valid = project.annotations.filter((annotation) => (
    annotation.target.start >= 0
    && annotation.target.end > annotation.target.start
    && annotation.target.end <= project.originalText.length
  ));
  const boundaries = new Set([0, project.originalText.length]);
  valid.forEach((annotation) => {
    boundaries.add(annotation.target.start);
    boundaries.add(annotation.target.end);
  });
  const sorted = [...boundaries].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((start, index) => {
    const end = sorted[index + 1];
    return {
      start,
      end,
      text: project.originalText.slice(start, end),
      annotations: valid.filter((annotation) => annotation.target.start <= start && annotation.target.end >= end),
    };
  });
}

function segmentStyle(annotation: Annotation | undefined, styles: Project['styles']): React.CSSProperties | undefined {
  if (!annotation) return undefined;
  const style: AnnotationStyle | undefined = styles[annotation.type];
  if (!style) return undefined;
  return {
    color: style.fontColor,
    backgroundColor: style.backgroundColor,
    fontWeight: style.bold ? 700 : 400,
    textDecoration: style.underline ? 'underline' : 'none',
    textDecorationThickness: style.underline ? '1px' : undefined,
    textUnderlineOffset: style.underline ? '5px' : undefined,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSize}px`,
  };
}

export function DocumentView({ project, activeAnnotationId, selection, onSelectText, onAnnotationClick, onEditProject, onExportProject }: DocumentViewProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => makeSegments(project), [project]);
  const counts = useMemo(() => {
    const result = Object.fromEntries(ANNOTATION_TYPES.map((type) => [type.id, 0])) as Record<string, number>;
    project.annotations.forEach((annotation) => { result[annotation.type] += 1; });
    return result;
  }, [project.annotations]);

  const captureSelection = () => {
    const root = textRef.current;
    const browserSelection = window.getSelection();
    if (!root || !browserSelection || browserSelection.isCollapsed || browserSelection.rangeCount === 0) return;
    const range = browserSelection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;

    const prefix = document.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset);
    const suffix = document.createRange();
    suffix.selectNodeContents(root);
    suffix.setEnd(range.endContainer, range.endOffset);
    let start = prefix.toString().length;
    let end = suffix.toString().length;
    if (start > end) [start, end] = [end, start];
    while (start < end && /\s/.test(project.originalText[start])) start += 1;
    while (end > start && /\s/.test(project.originalText[end - 1])) end -= 1;
    if (end <= start) return;
    onSelectText({ start, end, text: project.originalText.slice(start, end) });
  };

  const selectAnnotation = (event: React.MouseEvent, annotations: Annotation[]) => {
    if (!window.getSelection()?.isCollapsed) return;
    event.stopPropagation();
    const chosen = annotations.find((item) => item.id === activeAnnotationId) ?? annotations[annotations.length - 1];
    if (chosen) onAnnotationClick(chosen);
  };

  const authorLine = [project.metadata.dynasty, project.metadata.author].filter(Boolean).join(' · ');

  return (
    <main className="document-pane">
      <header className="document-toolbar">
        <div className="breadcrumb"><span>我的文集</span><b>／</b><strong>{project.metadata.title}</strong></div>
        <div className="toolbar-actions">
          <button onClick={onEditProject}><EditIcon size={16} />篇目设置</button>
          <button onClick={onExportProject}><ExportIcon size={16} />导出</button>
        </div>
      </header>

      <div className="document-scroll">
        <div className="paper-wrap">
          {selection && (
            <div className="selection-notice">
              <span><i />已选择 <strong>{selection.text.length}</strong> 个字符</span>
              <span className="selection-preview">“{selection.text.length > 18 ? `${selection.text.slice(0, 18)}…` : selection.text}”</span>
              <span>请在右侧添加批注</span>
            </div>
          )}
          <article className="paper">
            <div className="paper-topmark"><span>原文</span><i /></div>
            <header className="article-heading">
              <div className="article-kicker">{project.metadata.source || '古文研读'}</div>
              <h1>{project.metadata.title}</h1>
              {authorLine && <p className="article-author">〔{authorLine}〕</p>}
              {project.metadata.tags?.length ? (
                <div className="article-tags">{project.metadata.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
              ) : null}
              <div className="heading-rule"><i /><span>◆</span><i /></div>
            </header>

            <div
              ref={textRef}
              className="classical-text"
              onMouseUp={captureSelection}
              onKeyUp={captureSelection}
              role="document"
              aria-label={`${project.metadata.title}原文`}
            >
              {segments.map((segment) => {
                const active = segment.annotations.find((item) => item.id === activeAnnotationId) ?? segment.annotations.at(-1);
                if (!active) return <span key={`${segment.start}-${segment.end}`}>{segment.text}</span>;
                const labels = segment.annotations.map((annotation) => annotationTypeMeta(annotation.type).label).join('、');
                return (
                  <span
                    key={`${segment.start}-${segment.end}`}
                    className={`annotated-text ${segment.annotations.some((item) => item.id === activeAnnotationId) ? 'is-active' : ''} ${segment.annotations.length > 1 ? 'is-stacked' : ''}`}
                    style={segmentStyle(active, project.styles)}
                    data-note-count={segment.annotations.length > 1 ? segment.annotations.length : undefined}
                    title={`${labels}：点击查看批注`}
                    onClick={(event) => selectAnnotation(event, segment.annotations)}
                  >{segment.text}</span>
                );
              })}
            </div>

            {project.metadata.description && (
              <aside className="article-description"><InfoIcon size={16} /><p>{project.metadata.description}</p></aside>
            )}

            <footer className="paper-footer">
              <span>全文 {project.originalText.replace(/\s/g, '').length} 字</span>
              <span className="footer-seal">笺</span>
              <span>{project.annotations.length} 条批注</span>
            </footer>
          </article>

          <section className="annotation-legend">
            <div className="legend-title"><NoteIcon size={16} /><span>批注图例</span><small>选择原文中的字、词或句即可添加批注</small></div>
            <div className="legend-items">
              {ANNOTATION_TYPES.map((type) => (
                <span key={type.id} className={counts[type.id] ? 'has-notes' : ''}>
                  <i style={{ background: project.styles[type.id]?.backgroundColor, borderColor: project.styles[type.id]?.fontColor }} />
                  {type.label}<b>{counts[type.id] || ''}</b>
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

