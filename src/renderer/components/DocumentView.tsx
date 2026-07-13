import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { annotationDetailLines, annotationInlineText, annotationSummary } from '@shared/annotation-display';
import { ANNOTATION_TYPES, annotationTypeMeta } from '../constants';
import { CloseIcon, EditIcon, ExportIcon, InfoIcon, NoteIcon, StyleIcon } from '../icons';
import type { Annotation, AnnotationStyle, AnnotationType, Project, TextSelection } from '../types';

type ReadingMode = 'clean' | 'marked' | 'expanded';

interface DocumentViewProps {
  project: Project;
  activeAnnotationId: string | null;
  selection: TextSelection | null;
  onSelectText: (selection: TextSelection) => void;
  onAnnotationClick: (annotation: Annotation) => void;
  onEditProject: () => void;
  onExportProject: () => void;
}

interface Segment { start: number; end: number; text: string; annotations: Annotation[] }
interface NotePopup { annotations: Annotation[]; x: number; y: number }
interface ReaderSettings { fontFamily: string; fontSize: number; lineHeight: number; width: number; align: 'left' | 'justify' }

const DEFAULT_READER_SETTINGS: ReaderSettings = { fontFamily: 'Songti SC, SimSun, STSong, serif', fontSize: 18, lineHeight: 3.4, width: 760, align: 'justify' };

function readReaderSettings(): ReaderSettings {
  try { const value = { ...DEFAULT_READER_SETTINGS, ...JSON.parse(localStorage.getItem('mojian-reader-settings') ?? '{}') }; return { ...value, lineHeight: Math.max(2.8, value.lineHeight) }; }
  catch { return DEFAULT_READER_SETTINGS; }
}

const KIND_PRIORITY = { sentence: 1, word: 2, character: 3 } as const;

function makeSegments(project: Project): Segment[] {
  const valid = project.annotations.filter((annotation) => annotation.target.status !== 'needs-review' && annotation.target.start >= 0 && annotation.target.end > annotation.target.start && annotation.target.end <= project.originalText.length);
  const boundaries = new Set([0, project.originalText.length]);
  valid.forEach((annotation) => { boundaries.add(annotation.target.start); boundaries.add(annotation.target.end); });
  const sorted = [...boundaries].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((start, index) => {
    const end = sorted[index + 1];
    return { start, end, text: project.originalText.slice(start, end), annotations: valid.filter((annotation) => annotation.target.start <= start && annotation.target.end >= end) };
  });
}

function choosePrimary(annotations: Annotation[], styles: Project['styles']): Annotation | undefined {
  return [...annotations].sort((a, b) => {
    const kindDifference = KIND_PRIORITY[b.target.kind] - KIND_PRIORITY[a.target.kind];
    return kindDifference || styles[b.type].priority - styles[a.type].priority;
  })[0];
}

function withAlpha(color: string, opacity: number) {
  if (color === 'transparent') return 'transparent';
  return `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
}

function segmentStyle(annotation: Annotation | undefined, annotations: Annotation[], styles: Project['styles']): React.CSSProperties | undefined {
  if (!annotation) return undefined;
  const style: AnnotationStyle = styles[annotation.type];
  const mark = style.mark;
  const underline = style.underline || ['underline', 'dashed', 'wavy', 'combined'].includes(mark);
  const colors = annotations.slice(0, 3).map((item) => styles[item.type].fontColor);
  const stops = colors.map((color, index) => `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`).join(',');
  return {
    color: ['color', 'combined'].includes(mark) ? style.fontColor : undefined,
    backgroundColor: ['background', 'combined'].includes(mark) ? withAlpha(style.backgroundColor, style.backgroundOpacity) : undefined,
    fontWeight: style.bold ? 700 : 400,
    textDecorationLine: underline ? 'underline' : 'none',
    textDecorationStyle: mark === 'dashed' ? 'dashed' : mark === 'wavy' ? 'wavy' : 'solid',
    textDecorationColor: style.fontColor,
    textDecorationThickness: underline ? '1.5px' : undefined,
    textUnderlineOffset: underline ? '5px' : undefined,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSize}px`,
    textEmphasisStyle: mark === 'dot' ? 'filled dot' : undefined,
    textEmphasisPosition: mark === 'dot' ? 'under' : undefined,
    textEmphasisColor: mark === 'dot' ? style.fontColor : undefined,
    backgroundImage: annotations.length > 1 ? `linear-gradient(90deg, ${stops})` : undefined,
    backgroundSize: annotations.length > 1 ? '100% 2px' : undefined,
    backgroundPosition: annotations.length > 1 ? 'left bottom' : undefined,
    backgroundRepeat: annotations.length > 1 ? 'no-repeat' : undefined,
  };
}

function inlineNoteData(segment: Segment, annotations: Annotation[], styles: Project['styles']) {
  const above = annotations.filter((annotation) => styles[annotation.type].notePosition === 'above' && annotation.target.start === segment.start);
  const below = annotations.filter((annotation) => styles[annotation.type].notePosition === 'below' && annotation.target.end === segment.end);
  const aboveStyle = above.length ? styles[choosePrimary(above, styles)!.type] : undefined;
  const belowStyle = below.length ? styles[choosePrimary(below, styles)!.type] : undefined;
  return {
    aboveText: above.map(annotationInlineText).join(' ｜ '),
    belowText: below.map(annotationInlineText).join(' ｜ '),
    variables: {
      '--note-above-color': aboveStyle?.fontColor,
      '--note-above-size': aboveStyle ? `${aboveStyle.noteFontSize}px` : undefined,
      '--note-above-font': aboveStyle?.fontFamily,
      '--note-below-color': belowStyle?.fontColor,
      '--note-below-size': belowStyle ? `${belowStyle.noteFontSize}px` : undefined,
      '--note-below-font': belowStyle?.fontFamily,
    } as CSSProperties,
  };
}

function paragraphGroups(project: Project, visible: Set<AnnotationType>) {
  const ranges: Array<{ start: number; end: number; index: number }> = [];
  let start = 0;
  const matches = [...project.originalText.matchAll(/\n\s*\n/g)];
  matches.forEach((match, index) => { ranges.push({ start, end: match.index ?? start, index: index + 1 }); start = (match.index ?? start) + match[0].length; });
  ranges.push({ start, end: project.originalText.length, index: ranges.length + 1 });
  return ranges.map((range) => ({ ...range, annotations: project.annotations.filter((annotation) => visible.has(annotation.type) && annotation.target.start >= range.start && annotation.target.start < range.end).sort((a, b) => a.target.start - b.target.start) })).filter((group) => group.annotations.length);
}

export function DocumentView({ project, activeAnnotationId, selection, onSelectText, onAnnotationClick, onEditProject, onExportProject }: DocumentViewProps) {
  const paneRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [legendVisible, setLegendVisible] = useState(true);
  const [mode, setMode] = useState<ReadingMode>(() => (localStorage.getItem('mojian-reading-mode') as ReadingMode) || 'marked');
  const [hiddenTypes, setHiddenTypes] = useState<Set<AnnotationType>>(new Set());
  const [popup, setPopup] = useState<NotePopup | null>(null);
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(readReaderSettings);
  const segments = useMemo(() => makeSegments(project), [project]);
  const visibleTypes = useMemo(() => new Set(ANNOTATION_TYPES.filter((item) => project.styles[item.id].visible && !hiddenTypes.has(item.id)).map((item) => item.id)), [hiddenTypes, project.styles]);
  const expandedGroups = useMemo(() => paragraphGroups(project, visibleTypes), [project, visibleTypes]);
  const counts = useMemo(() => {
    const result = Object.fromEntries(ANNOTATION_TYPES.map((type) => [type.id, 0])) as Record<string, number>;
    project.annotations.forEach((annotation) => { result[annotation.type] += 1; });
    return result;
  }, [project.annotations]);

  const changeMode = (next: ReadingMode) => { setMode(next); setPopup(null); localStorage.setItem('mojian-reading-mode', next); };
  const toggleType = (type: AnnotationType) => setHiddenTypes((current) => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next; });
  const updateReaderSettings = (patch: Partial<ReaderSettings>) => setReaderSettings((current) => { const next = { ...current, ...patch }; localStorage.setItem('mojian-reader-settings', JSON.stringify(next)); return next; });

  const captureSelection = () => {
    const root = textRef.current;
    const browserSelection = window.getSelection();
    if (!root || !browserSelection || browserSelection.isCollapsed || browserSelection.rangeCount === 0) return;
    const range = browserSelection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const prefix = document.createRange(); prefix.selectNodeContents(root); prefix.setEnd(range.startContainer, range.startOffset);
    const suffix = document.createRange(); suffix.selectNodeContents(root); suffix.setEnd(range.endContainer, range.endOffset);
    let start = prefix.toString().length; let end = suffix.toString().length;
    if (start > end) [start, end] = [end, start];
    while (start < end && /\s/.test(project.originalText[start])) start += 1;
    while (end > start && /\s/.test(project.originalText[end - 1])) end -= 1;
    if (end > start) onSelectText({ start, end, text: project.originalText.slice(start, end) });
  };

  const showAnnotations = (event: React.MouseEvent, annotations: Annotation[]) => {
    if (!window.getSelection()?.isCollapsed || mode === 'clean') return;
    event.stopPropagation();
    const pane = paneRef.current?.getBoundingClientRect();
    const x = pane ? Math.min(Math.max(18, event.clientX - pane.left), Math.max(18, pane.width - 330)) : 20;
    const y = pane ? Math.min(Math.max(64, event.clientY - pane.top + 16), Math.max(64, pane.height - 330)) : 80;
    setPopup({ annotations, x, y });
  };

  const authorLine = [project.metadata.dynasty, project.metadata.author].filter(Boolean).join(' · ');

  const readerVariables = { '--reader-width': `${readerSettings.width}px`, '--reader-font': readerSettings.fontFamily, '--reader-size': `${readerSettings.fontSize}px`, '--reader-line-height': readerSettings.lineHeight, '--reader-align': readerSettings.align } as CSSProperties;

  return <main ref={paneRef} className={`document-pane reading-${mode}`} style={readerVariables} onClick={() => { setPopup(null); setReaderSettingsOpen(false); }}>
    <header className="document-toolbar">
      <div className="breadcrumb"><span>我的文集</span><b>／</b><strong>{project.metadata.title}</strong></div>
      <div className="reading-mode-switch" aria-label="阅读模式">
        <button className={mode === 'clean' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); changeMode('clean'); }}>净读</button>
        <button className={mode === 'marked' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); changeMode('marked'); }}>标注</button>
        <button className={mode === 'expanded' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); changeMode('expanded'); }}>展开</button>
      </div>
      <div className="toolbar-actions"><button onClick={(event) => { event.stopPropagation(); setReaderSettingsOpen((open) => !open); }}><StyleIcon size={16} />排版</button><button onClick={onEditProject}><EditIcon size={16} />篇目设置</button><button onClick={onExportProject}><ExportIcon size={16} />导出</button></div>
    </header>

    {readerSettingsOpen && <aside className="reader-settings" onClick={(event) => event.stopPropagation()}><header><span>正文排版</span><button onClick={() => setReaderSettingsOpen(false)}><CloseIcon size={14} /></button></header><label><span>正文字体</span><select value={readerSettings.fontFamily} onChange={(event) => updateReaderSettings({ fontFamily: event.target.value })}><option value="Songti SC, SimSun, STSong, serif">宋体</option><option value="KaiTi, STKaiti, serif">楷体</option><option value="FangSong, STFangsong, serif">仿宋</option><option value="Microsoft YaHei, sans-serif">微软雅黑</option></select></label><label><span>字号 <b>{readerSettings.fontSize}px</b></span><input type="range" min="16" max="28" value={readerSettings.fontSize} onChange={(event) => updateReaderSettings({ fontSize: Number(event.target.value) })} /></label><label><span>行间批注空间 <b>{readerSettings.lineHeight.toFixed(1)}</b></span><input type="range" min="2.8" max="4.8" step="0.1" value={readerSettings.lineHeight} onChange={(event) => updateReaderSettings({ lineHeight: Number(event.target.value) })} /></label><label><span>正文宽度 <b>{readerSettings.width}px</b></span><input type="range" min="560" max="980" step="20" value={readerSettings.width} onChange={(event) => updateReaderSettings({ width: Number(event.target.value) })} /></label><div className="reader-align"><button className={readerSettings.align === 'left' ? 'active' : ''} onClick={() => updateReaderSettings({ align: 'left' })}>左对齐</button><button className={readerSettings.align === 'justify' ? 'active' : ''} onClick={() => updateReaderSettings({ align: 'justify' })}>两端对齐</button></div><button className="reader-reset" onClick={() => updateReaderSettings(DEFAULT_READER_SETTINGS)}>恢复默认排版</button></aside>}

    {selection && <div className="selection-dock"><span><i />已选择 <strong>{selection.text.length}</strong> 个字符</span><span className="selection-preview">“{selection.text.length > 28 ? `${selection.text.slice(0, 28)}…` : selection.text}”</span></div>}

    <div className="document-scroll"><div className="reading-column"><article className="article-content">
      <header className="article-heading">{project.metadata.source && <div className="article-kicker">{project.metadata.source}</div>}<h1>{project.metadata.title}</h1>{authorLine && <p className="article-author">〔{authorLine}〕</p>}{project.metadata.tags?.length ? <div className="article-tags">{project.metadata.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}<div className="heading-rule"><i /><i /></div></header>
      <div ref={textRef} className="classical-text" onMouseUp={captureSelection} onKeyUp={captureSelection} role="document" aria-label={`${project.metadata.title}原文`}>
        {segments.map((segment) => {
          const annotations = mode === 'clean' ? [] : segment.annotations.filter((annotation) => visibleTypes.has(annotation.type));
          const primary = choosePrimary(annotations, project.styles);
          if (!primary) return <span key={`${segment.start}-${segment.end}`}>{segment.text}</span>;
          const labels = annotations.map((annotation) => `${annotationTypeMeta(annotation.type).label}：${annotationSummary(annotation)}`).join('\n');
          const inlineNotes = inlineNoteData(segment, annotations, project.styles);
          return <span key={`${segment.start}-${segment.end}`} className={`annotated-text ${annotations.some((item) => item.id === activeAnnotationId) ? 'is-active' : ''} ${annotations.length > 1 ? 'is-stacked' : ''} ${inlineNotes.aboveText || inlineNotes.belowText ? 'has-inline-note' : ''}`} style={{ ...segmentStyle(primary, annotations, project.styles), ...inlineNotes.variables }} data-note-above={inlineNotes.aboveText || undefined} data-note-below={inlineNotes.belowText || undefined} title={labels} onClick={(event) => showAnnotations(event, annotations)}>{segment.text}</span>;
        })}
      </div>
      {mode === 'expanded' && <section className="expanded-annotations"><header><NoteIcon size={16} /><span>逐段批注</span></header>{expandedGroups.map((group) => <div className="expanded-group" key={group.index}><b>第 {group.index} 段</b><div>{group.annotations.map((annotation) => <button key={annotation.id} onClick={(event) => { event.stopPropagation(); onAnnotationClick(annotation); }}><span style={{ color: project.styles[annotation.type].fontColor }}>{annotationTypeMeta(annotation.type).label}</span><strong>“{annotation.target.text}”</strong><p>{annotationDetailLines(annotation.detail).map((line) => <span key={line}>{line}</span>)}</p>{annotation.note && <small>{annotation.note}</small>}</button>)}</div></div>)}</section>}
      {project.metadata.description && <aside className="article-description"><InfoIcon size={16} /><p>{project.metadata.description}</p></aside>}
      <footer className="article-footer"><span>全文 {project.originalText.replace(/\s/g, '').length} 字</span><span className="footer-seal">笺</span><span>{project.annotations.length} 条批注</span></footer>
    </article></div></div>

    {popup && <aside className="inline-note-card" style={{ left: popup.x, top: popup.y }} onClick={(event) => event.stopPropagation()}><header><div><span>原文批注</span><strong>“{popup.annotations[0]?.target.text}”</strong></div><button onClick={() => setPopup(null)}><CloseIcon size={15} /></button></header><div className="inline-note-list">{popup.annotations.map((annotation) => <section key={annotation.id}><div><b style={{ color: project.styles[annotation.type].fontColor, background: withAlpha(project.styles[annotation.type].backgroundColor, 28) }}>{annotationTypeMeta(annotation.type).label}</b><button onClick={() => { onAnnotationClick(annotation); setPopup(null); }}><EditIcon size={13} />编辑</button></div>{annotationDetailLines(annotation.detail).map((line) => <p key={line}>{line}</p>)}{annotation.note && <small>{annotation.note}</small>}</section>)}</div></aside>}

    {mode !== 'clean' && (legendVisible ? <section className="annotation-legend" onClick={(event) => event.stopPropagation()}><div className="legend-title"><NoteIcon size={15} /><span>批注图例</span><small>点击类型可临时隐藏</small><button onClick={() => setLegendVisible(false)} title="隐藏图例"><CloseIcon size={14} /></button></div><div className="legend-items">{ANNOTATION_TYPES.map((type) => <button key={type.id} className={`${counts[type.id] ? 'has-notes' : ''} ${hiddenTypes.has(type.id) ? 'is-hidden' : ''}`} onClick={() => toggleType(type.id)}><i style={{ background: project.styles[type.id].backgroundColor, borderColor: project.styles[type.id].fontColor }} />{type.label}<b>{hiddenTypes.has(type.id) ? '×' : counts[type.id] || ''}</b></button>)}</div></section> : <button className="legend-toggle" onClick={(event) => { event.stopPropagation(); setLegendVisible(true); }}><NoteIcon size={15} />图例</button>)}
  </main>;
}
