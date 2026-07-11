import { useEffect, useMemo, useState } from 'react';
import { ANNOTATION_TYPES, TARGET_KINDS, annotationTypeMeta } from '../constants';
import { CheckIcon, CloseIcon, ListIcon, NoteIcon, SearchIcon, SparkleIcon, StyleIcon, TrashIcon } from '../icons';
import type { Annotation, AnnotationStyle, AnnotationType, Project, TargetKind, TextSelection } from '../types';

type InspectorTab = 'editor' | 'list' | 'style';

interface AnnotationInput {
  type: AnnotationType;
  target: {
    kind: TargetKind;
    start: number;
    end: number;
    text: string;
  };
  content: string;
}

interface InspectorProps {
  project: Project;
  selection: TextSelection | null;
  activeAnnotation: Annotation | null;
  onClearSelection: () => void;
  onOpenAnnotation: (annotation: Annotation) => void;
  onCreateAnnotation: (input: AnnotationInput) => Promise<void>;
  onUpdateAnnotation: (id: string, input: AnnotationInput) => Promise<void>;
  onDeleteAnnotation: (id: string) => Promise<void>;
  onUpdateStyle: (type: AnnotationType, style: AnnotationStyle) => Promise<void>;
}

function inferKind(text: string): TargetKind {
  if ([...text].length === 1) return 'character';
  if (/[。！？；]$/.test(text) || text.length > 12) return 'sentence';
  return 'word';
}

export function Inspector({
  project,
  selection,
  activeAnnotation,
  onClearSelection,
  onOpenAnnotation,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onUpdateStyle,
}: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('editor');
  const [type, setType] = useState<AnnotationType>('definition');
  const [kind, setKind] = useState<TargetKind>('word');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [listType, setListType] = useState<AnnotationType | 'all'>('all');
  const [styleType, setStyleType] = useState<AnnotationType>('definition');
  const [styleDraft, setStyleDraft] = useState<AnnotationStyle>(project.styles.definition);
  const [styleSaving, setStyleSaving] = useState(false);

  useEffect(() => {
    if (activeAnnotation) {
      setTab('editor');
      setType(activeAnnotation.type);
      setKind(activeAnnotation.target.kind);
      setContent(activeAnnotation.content);
    } else if (selection) {
      setTab('editor');
      setType('definition');
      setKind(inferKind(selection.text));
      setContent('');
    }
  }, [activeAnnotation, selection]);

  useEffect(() => {
    setStyleDraft(project.styles[styleType]);
  }, [project.id, project.styles, styleType]);

  const target = activeAnnotation?.target ?? (selection ? { ...selection, kind } : null);
  const filteredAnnotations = useMemo(() => {
    const keyword = listQuery.trim().toLocaleLowerCase();
    return [...project.annotations]
      .filter((annotation) => listType === 'all' || annotation.type === listType)
      .filter((annotation) => !keyword || annotation.target.text.toLocaleLowerCase().includes(keyword) || annotation.content.toLocaleLowerCase().includes(keyword))
      .sort((a, b) => a.target.start - b.target.start);
  }, [listQuery, listType, project.annotations]);

  const submit = async () => {
    if (!target || !content.trim() || saving) return;
    setSaving(true);
    const input: AnnotationInput = {
      type,
      target: { kind, start: target.start, end: target.end, text: target.text },
      content: content.trim(),
    };
    try {
      if (activeAnnotation) await onUpdateAnnotation(activeAnnotation.id, input);
      else await onCreateAnnotation(input);
      setContent('');
    } catch {
      // App 层统一展示持久化错误；此处保留草稿供用户重试。
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!activeAnnotation || saving) return;
    setSaving(true);
    try {
      await onDeleteAnnotation(activeAnnotation.id);
    } catch {
      // 保留当前批注，错误提示由 App 层统一处理。
    } finally {
      setSaving(false);
    }
  };

  const saveStyle = async () => {
    if (styleSaving) return;
    setStyleSaving(true);
    try {
      await onUpdateStyle(styleType, styleDraft);
    } catch {
      // 保留未保存的样式草稿，方便再次提交。
    } finally {
      setStyleSaving(false);
    }
  };

  return (
    <aside className="inspector">
      <nav className="inspector-tabs">
        <button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}><NoteIcon size={16} />批注</button>
        <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}><ListIcon size={16} />目录<span>{project.annotations.length}</span></button>
        <button className={tab === 'style' ? 'active' : ''} onClick={() => setTab('style')}><StyleIcon size={16} />样式</button>
      </nav>

      {tab === 'editor' && (
        <div className="inspector-content editor-panel">
          {target ? (
            <>
              <header className="panel-title-row">
                <div><span className="eyebrow">{activeAnnotation ? '编辑批注' : '新建批注'}</span><h2>{activeAnnotation ? annotationTypeMeta(activeAnnotation.type).label : '为所选原文作注'}</h2></div>
                <button className="plain-icon" onClick={onClearSelection} title="关闭"><CloseIcon size={18} /></button>
              </header>

              <blockquote className="selected-quote">
                <span>“</span><p>{target.text}</p><span>”</span>
                <footer>第 {target.start + 1}–{target.end} 字 · 共 {[...target.text].length} 字</footer>
              </blockquote>

              <div className="form-section">
                <label className="field-label">标注范围</label>
                <div className="segmented-control">
                  {TARGET_KINDS.map((item) => (
                    <button
                      key={item.id}
                      className={kind === item.id ? 'active' : ''}
                      onClick={() => setKind(item.id)}
                      title={item.id === 'character' && [...target.text].length !== 1 ? '“字”批注需要精确选择一个字' : item.hint}
                      disabled={item.id === 'character' && [...target.text].length !== 1}
                    >{item.label}</button>
                  ))}
                </div>
                <p className="field-help">范围索引已精确记录，切换粒度不会改变所选文字。</p>
              </div>

              <div className="form-section">
                <label className="field-label">批注类型</label>
                <div className="annotation-type-grid">
                  {ANNOTATION_TYPES.map((item) => (
                    <button
                      key={item.id}
                      className={type === item.id ? 'active' : ''}
                      onClick={() => setType(item.id)}
                      style={{ '--type-color': project.styles[item.id]?.fontColor, '--type-bg': project.styles[item.id]?.backgroundColor } as React.CSSProperties}
                    >
                      <span>{item.shortLabel}</span><b>{item.label}</b>{type === item.id && <CheckIcon size={13} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-section grow">
                <label className="field-label" htmlFor="annotation-content">批注内容</label>
                <div className="textarea-wrap">
                  <textarea
                    id="annotation-content"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder={`写下${annotationTypeMeta(type).description}……`}
                    autoFocus={!activeAnnotation}
                    maxLength={2000}
                  />
                  <span>{content.length}/2000</span>
                </div>
                <div className="writing-hint"><SparkleIcon size={14} /><span>可记录释义、例句、辨析或自己的理解</span></div>
              </div>

              <div className="editor-actions">
                {activeAnnotation && <button className="danger-button" onClick={remove} disabled={saving}><TrashIcon size={16} />删除</button>}
                <button className="save-button" onClick={submit} disabled={!content.trim() || saving}>{saving ? '保存中…' : activeAnnotation ? '保存修改' : '添加批注'}</button>
              </div>
            </>
          ) : (
            <div className="inspector-empty">
              <div className="empty-orbit"><span>注</span><i /><i /><i /></div>
              <h2>从原文中选取内容</h2>
              <p>用鼠标选中一个字、词语或句子，即可在这里添加详细批注。</p>
              <ol>
                <li><b>01</b><span>拖动鼠标选择原文</span></li>
                <li><b>02</b><span>选择批注类型与粒度</span></li>
                <li><b>03</b><span>写下理解并保存</span></li>
              </ol>
              {project.annotations.length > 0 && <button onClick={() => setTab('list')}>查看已有 {project.annotations.length} 条批注</button>}
            </div>
          )}
        </div>
      )}

      {tab === 'list' && (
        <div className="inspector-content list-panel">
          <header className="panel-title-row compact"><div><span className="eyebrow">批注目录</span><h2>研读札记</h2></div><strong>{project.annotations.length}</strong></header>
          <label className="inspector-search"><SearchIcon size={15} /><input value={listQuery} onChange={(event) => setListQuery(event.target.value)} placeholder="搜索原文或批注" /></label>
          <div className="type-filter-row">
            <button className={listType === 'all' ? 'active' : ''} onClick={() => setListType('all')}>全部</button>
            {ANNOTATION_TYPES.map((item) => <button key={item.id} className={listType === item.id ? 'active' : ''} onClick={() => setListType(item.id)}>{item.shortLabel}</button>)}
          </div>
          <div className="annotation-list">
            {filteredAnnotations.map((annotation, index) => {
              const meta = annotationTypeMeta(annotation.type);
              const style = project.styles[annotation.type];
              return (
                <button key={annotation.id} className={`annotation-card ${activeAnnotation?.id === annotation.id ? 'active' : ''}`} onClick={() => onOpenAnnotation(annotation)}>
                  <span className="annotation-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="annotation-card-main">
                    <span className="annotation-card-head"><b style={{ color: style.fontColor, background: style.backgroundColor }}>{meta.label}</b><small>{annotation.target.kind === 'character' ? '字' : annotation.target.kind === 'word' ? '词' : '句'} · {annotation.target.start + 1}–{annotation.target.end}</small></span>
                    <strong className="annotation-quote">“{annotation.target.text}”</strong>
                    <span className="annotation-content-preview">{annotation.content}</span>
                  </span>
                </button>
              );
            })}
            {!filteredAnnotations.length && <div className="list-empty"><NoteIcon size={25} /><p>{project.annotations.length ? '没有匹配的批注' : '还没有批注'}</p><span>{project.annotations.length ? '试试其他关键词或类型' : '选择原文，写下第一条札记'}</span></div>}
          </div>
        </div>
      )}

      {tab === 'style' && (
        <div className="inspector-content style-panel">
          <header className="panel-title-row compact"><div><span className="eyebrow">显示设置</span><h2>批注样式</h2></div></header>
          <p className="panel-intro">为每种批注分别设置字体与标记方式，修改后会立即应用到全文。</p>
          <div className="style-type-list">
            {ANNOTATION_TYPES.map((item) => (
              <button key={item.id} className={styleType === item.id ? 'active' : ''} onClick={() => setStyleType(item.id)}>
                <i style={{ color: project.styles[item.id].fontColor, background: project.styles[item.id].backgroundColor }}>{item.shortLabel}</i>
                <span><b>{item.label}</b><small>{item.description}</small></span>
                {styleType === item.id && <CheckIcon size={15} />}
              </button>
            ))}
          </div>

          <div className="style-preview-card">
            <span>样式预览</span>
            <p>学而时习之，不亦<span style={{
              color: styleDraft.fontColor,
              background: styleDraft.backgroundColor,
              fontWeight: styleDraft.bold ? 700 : 400,
              textDecoration: styleDraft.underline ? 'underline' : 'none',
              textUnderlineOffset: '5px',
              fontStyle: styleDraft.italic ? 'italic' : 'normal',
              fontFamily: styleDraft.fontFamily,
              fontSize: `${styleDraft.fontSize}px`,
            }}>说</span>乎？</p>
          </div>

          <div className="style-form">
            <div className="color-fields">
              <label><span>字体颜色</span><span className="color-input"><input type="color" value={styleDraft.fontColor} onChange={(event) => setStyleDraft({ ...styleDraft, fontColor: event.target.value })} /><b>{styleDraft.fontColor.toUpperCase()}</b></span></label>
              <label><span>背景颜色</span><span className="color-input"><input type="color" value={styleDraft.backgroundColor} onChange={(event) => setStyleDraft({ ...styleDraft, backgroundColor: event.target.value })} /><b>{styleDraft.backgroundColor.toUpperCase()}</b></span></label>
            </div>
            <label className="select-field"><span>字体</span><select value={styleDraft.fontFamily} onChange={(event) => setStyleDraft({ ...styleDraft, fontFamily: event.target.value })}><option value="serif">系统宋体</option><option value="KaiTi, STKaiti, serif">楷体</option><option value="FangSong, STFangsong, serif">仿宋</option><option value="Microsoft YaHei, sans-serif">微软雅黑</option></select></label>
            <label className="range-field"><span>字号 <b>{styleDraft.fontSize}px</b></span><input type="range" min="15" max="26" step="1" value={styleDraft.fontSize} onChange={(event) => setStyleDraft({ ...styleDraft, fontSize: Number(event.target.value) })} /></label>
            <div className="toggle-fields">
              <button className={styleDraft.bold ? 'active' : ''} onClick={() => setStyleDraft({ ...styleDraft, bold: !styleDraft.bold })}><b>B</b>加粗</button>
              <button className={styleDraft.underline ? 'active' : ''} onClick={() => setStyleDraft({ ...styleDraft, underline: !styleDraft.underline })}><u>U</u>下划线</button>
              <button className={styleDraft.italic ? 'active' : ''} onClick={() => setStyleDraft({ ...styleDraft, italic: !styleDraft.italic })}><i>I</i>斜体</button>
            </div>
          </div>
          <button className="save-button style-save" onClick={saveStyle} disabled={styleSaving}>{styleSaving ? '应用中…' : `应用到「${annotationTypeMeta(styleType).label}」`}</button>
        </div>
      )}
    </aside>
  );
}
