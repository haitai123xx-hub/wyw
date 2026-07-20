/**
 * 右侧检查器：在“批注编辑、批注列表、显示样式”三个标签之间切换。
 * 表单状态先保存在本组件中，点击保存后才通过 App 回调写入后端。
 */
import { useEffect, useMemo, useState } from 'react';
import { ALLOWED_ANNOTATION_TYPES, isAnnotationTypeAllowed } from '@shared/annotation-rules';
import { annotationSearchText, annotationSummary } from '@shared/annotation-display';
import { ANNOTATION_TYPES, TARGET_KINDS, annotationTypeMeta } from '../constants';
import { CheckIcon, ChevronIcon, CloseIcon, ListIcon, NoteIcon, PlusIcon, SearchIcon, SparkleIcon, StyleIcon, TrashIcon } from '../icons';
import type { AnnotationDetail } from '@shared/models';
import type { Annotation, AnnotationStyle, AnnotationType, Project, TargetKind, TextSelection } from '../types';
import { AnnotationDetailEditor, createEmptyDetail, isDetailComplete } from './AnnotationDetailEditor';

type InspectorTab = 'editor' | 'list' | 'style';

const FONT_COLOR_PRESETS = ['#292723', '#7F3C32', '#1D4ED8', '#6D28D9', '#047857', '#B45309', '#0E7490', '#9D174D'];
const BACKGROUND_COLOR_PRESETS: AnnotationStyle['backgroundColor'][] = ['transparent', '#FFF7ED', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#EDE9FE', '#FFE4E6', '#FCE7F3'];

function readCustomPalette(key: string): string[] {
  // localStorage 可能被手动改坏，因此只接受 #RRGGBB 字符串数组。
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && /^#[\dA-F]{6}$/i.test(item)) : [];
  } catch {
    return [];
  }
}

interface AnnotationInput {
  type: AnnotationType;
  target: {
    kind: TargetKind;
    start: number;
    end: number;
    text: string;
    status: 'valid' | 'needs-review';
  };
  detail: AnnotationDetail;
  note: string;
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
  isRelinking: boolean;
  onStartRelink: (id: string) => void;
  onHide: () => void;
  hidden?: boolean;
}

function inferKind(text: string): TargetKind {
  // 新选区只做方便用户的初步推断，用户仍可在界面中改为字、词或句。
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
  isRelinking,
  onStartRelink,
  onHide,
  hidden = false,
}: InspectorProps) {
  // editor 页的草稿状态。
  const [tab, setTab] = useState<InspectorTab>('editor');
  const [type, setType] = useState<AnnotationType>('definition');
  const [kind, setKind] = useState<TargetKind>('word');
  const [detail, setDetail] = useState<AnnotationDetail>(() => createEmptyDetail('definition', ''));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [listType, setListType] = useState<AnnotationType | 'all'>('all');
  const [styleType, setStyleType] = useState<AnnotationType>('definition');
  const [styleDraft, setStyleDraft] = useState<AnnotationStyle>(project.styles.definition);
  const [styleSaving, setStyleSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [customFontColors, setCustomFontColors] = useState(() => readCustomPalette('mojian-font-palette'));
  const [customBackgroundColors, setCustomBackgroundColors] = useState(() => readCustomPalette('mojian-background-palette'));

  useEffect(() => {
    // 打开已有批注时载入原值；创建新批注时根据选区生成空白表单。
    if (activeAnnotation) {
      setTab('editor');
      setType(activeAnnotation.type);
      setKind(activeAnnotation.target.kind);
      setDetail(activeAnnotation.detail);
      setNote(activeAnnotation.note);
      setSaveError('');
    } else if (selection) {
      setTab('editor');
      setType('definition');
      setKind(inferKind(selection.text));
      setDetail(createEmptyDetail('definition', selection.text));
      setNote('');
      setSaveError('');
    }
  }, [activeAnnotation, selection]);

  useEffect(() => {
    // 切换项目或样式类型后，用已保存样式重置草稿。
    setStyleDraft(project.styles[styleType]);
  }, [project.id, project.styles, styleType]);

  useEffect(() => {
    // 用户扩充的色卡是全局界面偏好，不进入单篇项目 JSON。
    localStorage.setItem('mojian-font-palette', JSON.stringify(customFontColors));
    localStorage.setItem('mojian-background-palette', JSON.stringify(customBackgroundColors));
  }, [customBackgroundColors, customFontColors]);

  useEffect(() => {
    // 粒度改变后若当前类型不再合法，自动退回所有粒度都支持的“释义”。
    if (!isAnnotationTypeAllowed(kind, type)) {
      setType('definition');
      setDetail(createEmptyDetail('definition', selection?.text ?? activeAnnotation?.target.text ?? ''));
    }
  }, [kind, type]);

  useEffect(() => {
    if (isRelinking && selection && kind === 'character' && [...selection.text].length !== 1) {
      setKind(inferKind(selection.text));
    }
  }, [isRelinking, kind, selection]);

  const target = isRelinking && selection
    // 重新定位时保留批注内容，但用新选区替换 target 坐标。
    ? { ...selection, kind, status: 'valid' as const }
    : activeAnnotation?.target ?? (selection ? { ...selection, kind, status: 'valid' as const } : null);
  const allowedTypes = ALLOWED_ANNOTATION_TYPES[kind];
  const fontColorOptions = [...new Set([...FONT_COLOR_PRESETS, ...customFontColors, styleDraft.fontColor])];
  const backgroundColorOptions = [...new Set([...BACKGROUND_COLOR_PRESETS, ...customBackgroundColors, styleDraft.backgroundColor])];
  const selectType = (nextType: AnnotationType) => {
    setType(nextType);
    setDetail(createEmptyDetail(nextType, target?.text ?? ''));
    setNote('');
  };

  const addCustomColor = (target: 'font' | 'background', color: string) => {
    // 统一保存为大写十六进制，并用 includes 避免重复色卡。
    const normalized = color.toUpperCase();
    if (target === 'font') {
      setCustomFontColors((colors) => colors.includes(normalized) ? colors : [...colors, normalized]);
      setStyleDraft((style) => ({ ...style, fontColor: normalized }));
    } else {
      setCustomBackgroundColors((colors) => colors.includes(normalized) ? colors : [...colors, normalized]);
      setStyleDraft((style) => ({ ...style, backgroundColor: normalized }));
    }
  };
  const filteredAnnotations = useMemo(() => {
    // 搜索文本由 shared/annotation-display 统一生成，涵盖原文、结构化内容和笔记。
    const keyword = listQuery.trim().toLocaleLowerCase();
    return [...project.annotations]
      .filter((annotation) => listType === 'all' || annotation.type === listType)
      .filter((annotation) => !keyword || annotationSearchText(annotation).toLocaleLowerCase().includes(keyword))
      .sort((a, b) => a.target.start - b.target.start);
  }, [listQuery, listType, project.annotations]);

  const submit = async () => {
    // 保存条件集中在入口判断，防止重复点击或必填内容不完整时发出请求。
    if (!target || !isDetailComplete(detail) || saving || (isRelinking && !selection)) return;
    setSaving(true);
    setSaveError('');
    const input: AnnotationInput = {
      type,
      target: { kind, start: target.start, end: target.end, text: target.text, status: target.status },
      detail,
      note: note.trim(),
    };
    try {
      // 同一表单通过 activeAnnotation 判断当前是创建还是更新。
      if (activeAnnotation) await onUpdateAnnotation(activeAnnotation.id, input);
      else await onCreateAnnotation(input);
      setDetail(createEmptyDetail(type, target.text));
      setNote('');
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : '批注保存失败，请重试');
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
    // styleDraft 是可撤销草稿，只有这里成功后才进入本机用户预设。
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
    <aside className={`inspector ${hidden ? 'is-pane-hidden' : ''}`}>
      <nav className="inspector-tabs">
        <button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}><NoteIcon size={16} />批注</button>
        <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}><ListIcon size={16} />目录<span>{project.annotations.length}</span></button>
        <button className={tab === 'style' ? 'active' : ''} onClick={() => setTab('style')}><StyleIcon size={16} />样式</button>
        <button className="inspector-collapse" onClick={onHide} title="隐藏批注区域" aria-label="隐藏批注区域"><ChevronIcon size={15} /></button>
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

              {activeAnnotation?.target.status === 'needs-review' && !isRelinking && (
                <div className="location-warning">
                  <div><strong>这条批注需要重新定位</strong><span>原文修改与原标注范围相交，批注内容已安全保留。</span></div>
                  <button onClick={() => onStartRelink(activeAnnotation.id)}>重新定位</button>
                </div>
              )}
              {isRelinking && (
                <div className={`location-warning relinking ${selection ? 'ready' : ''}`}>
                  <div><strong>{selection ? '已选择新的位置' : '请在正文中重新选择'}</strong><span>{selection ? '确认粒度后点击保存修改。' : '批注内容不会丢失，选择后再保存即可。'}</span></div>
                </div>
              )}

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
                  {ANNOTATION_TYPES.filter((item) => allowedTypes.includes(item.id)).map((item) => (
                    <button
                      key={item.id}
                      className={type === item.id ? 'active' : ''}
                      onClick={() => selectType(item.id)}
                      style={{ '--type-color': project.styles[item.id]?.fontColor, '--type-bg': project.styles[item.id]?.backgroundColor } as React.CSSProperties}
                    >
                      <span>{item.shortLabel}</span><b>{item.label}</b>{type === item.id && <CheckIcon size={13} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-section grow structured-editor">
                <label className="field-label">{annotationTypeMeta(type).label}内容</label>
                <AnnotationDetailEditor detail={detail} targetText={target.text} targetKind={kind} onChange={setDetail} />
                <details className="optional-note" open={Boolean(note)}>
                  <summary><SparkleIcon size={14} />添加补充说明（可选）</summary>
                  <div className="textarea-wrap"><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录例句、辨析或自己的理解" maxLength={2000} /><span>{note.length}/2000</span></div>
                </details>
              </div>

              <div className="editor-actions">
                {activeAnnotation && <button className="danger-button" onClick={remove} disabled={saving}><TrashIcon size={16} />删除</button>}
                <button className="save-button" onClick={submit} disabled={!isDetailComplete(detail) || saving || (isRelinking && !selection)}>{saving ? '保存中…' : isRelinking ? '保存新位置' : activeAnnotation ? '保存修改' : '添加批注'}</button>
              </div>
              {saveError && <div className="form-error annotation-save-error">{saveError}</div>}
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
                <button key={annotation.id} className={`annotation-card ${activeAnnotation?.id === annotation.id ? 'active' : ''} ${annotation.target.status === 'needs-review' ? 'needs-review' : ''}`} onClick={() => onOpenAnnotation(annotation)}>
                  <span className="annotation-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="annotation-card-main">
                    <span className="annotation-card-head"><b style={{ color: style.fontColor, background: style.backgroundColor }}>{meta.label}</b><small>{annotation.target.status === 'needs-review' ? '待重新定位' : `${annotation.target.kind === 'character' ? '字' : annotation.target.kind === 'word' ? '词' : '句'} · ${annotation.target.start + 1}–${annotation.target.end}`}</small></span>
                    <strong className="annotation-quote">“{annotation.target.text}”</strong>
                    <span className="annotation-content-preview">{annotationSummary(annotation)}</span>
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
          <header className="panel-title-row compact"><div><span className="eyebrow">本机显示设置</span><h2>我的批注预设</h2></div></header>
          <p className="panel-intro">预设会应用到本机的所有文章和新导入笔记，不会写入或导出到分享文件。</p>
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
              background: styleDraft.mark === 'background' || styleDraft.mark === 'combined' ? `color-mix(in srgb, ${styleDraft.backgroundColor} ${styleDraft.backgroundOpacity}%, transparent)` : 'transparent',
              fontWeight: styleDraft.bold ? 700 : 400,
              textDecorationLine: styleDraft.underline || ['underline', 'dashed', 'wavy', 'combined'].includes(styleDraft.mark) ? 'underline' : 'none',
              textDecorationStyle: styleDraft.mark === 'dashed' ? 'dashed' : styleDraft.mark === 'wavy' ? 'wavy' : 'solid',
              textDecorationColor: styleDraft.fontColor,
              textUnderlineOffset: '5px',
              fontStyle: styleDraft.italic ? 'italic' : 'normal',
              fontFamily: styleDraft.fontFamily,
              fontSize: `${styleDraft.fontSize}px`,
              textEmphasisStyle: styleDraft.mark === 'dot' ? 'filled dot' : undefined,
              textEmphasisPosition: styleDraft.mark === 'dot' ? 'under' : undefined,
              '--preview-note-color': styleDraft.fontColor,
              '--preview-note-size': `${styleDraft.noteFontSize}px`,
              '--preview-note-font': styleDraft.fontFamily,
            } as React.CSSProperties} className="style-preview-target" data-preview-above={styleDraft.notePosition === 'above' ? `${annotationTypeMeta(styleType).shortLabel}：批注内容` : undefined} data-preview-below={styleDraft.notePosition === 'below' ? `${annotationTypeMeta(styleType).shortLabel}：批注内容` : undefined}>说</span>乎？</p>
          </div>

          <div className="style-form">
            <div className="palette-field">
              <span>字体颜色</span>
              <div className="color-swatches">
                {fontColorOptions.map((color) => <button key={color} className={styleDraft.fontColor.toUpperCase() === color.toUpperCase() ? 'active' : ''} style={{ background: color }} onClick={() => setStyleDraft({ ...styleDraft, fontColor: color })} title={color} aria-label={`字体颜色 ${color}`} />)}
                <label className="color-add" title="添加字体颜色"><PlusIcon size={14} /><input type="color" defaultValue="#7F3C32" onChange={(event) => addCustomColor('font', event.target.value)} /></label>
              </div>
            </div>
            <div className="palette-field">
              <span>背景颜色</span>
              <div className="color-swatches">
                {backgroundColorOptions.map((color) => <button key={color} className={`${styleDraft.backgroundColor.toUpperCase() === color.toUpperCase() ? 'active' : ''} ${color === 'transparent' ? 'transparent-swatch' : ''}`} style={{ background: color === 'transparent' ? undefined : color }} onClick={() => setStyleDraft({ ...styleDraft, backgroundColor: color })} title={color === 'transparent' ? '无背景' : color} aria-label={color === 'transparent' ? '无背景颜色' : `背景颜色 ${color}`} />)}
                <label className="color-add" title="添加背景颜色"><PlusIcon size={14} /><input type="color" defaultValue="#FFF7ED" onChange={(event) => addCustomColor('background', event.target.value)} /></label>
              </div>
            </div>
            <label className="select-field"><span>标记方式</span><select value={styleDraft.mark} onChange={(event) => setStyleDraft({ ...styleDraft, mark: event.target.value as AnnotationStyle['mark'] })}><option value="combined">文字颜色＋下划线＋浅底色</option><option value="color">仅改变文字颜色</option><option value="background">浅色背景</option><option value="underline">实线下划线</option><option value="dashed">虚线下划线</option><option value="wavy">波浪线</option><option value="dot">字下圆点</option></select></label>
            <label className="select-field"><span>批注内容位置</span><select value={styleDraft.notePosition} onChange={(event) => setStyleDraft({ ...styleDraft, notePosition: event.target.value as AnnotationStyle['notePosition'] })}><option value="above">显示在原文上方</option><option value="below">显示在原文下方</option><option value="hidden">正文中隐藏内容</option></select></label>
            <label className="range-field"><span>批注文字大小 <b>{styleDraft.noteFontSize}px</b></span><input type="range" min="7" max="18" step="1" value={styleDraft.noteFontSize} onChange={(event) => setStyleDraft({ ...styleDraft, noteFontSize: Number(event.target.value) })} /></label>
            <label className="range-field"><span>背景透明度 <b>{styleDraft.backgroundOpacity}%</b></span><input type="range" min="0" max="60" step="2" value={styleDraft.backgroundOpacity} onChange={(event) => setStyleDraft({ ...styleDraft, backgroundOpacity: Number(event.target.value) })} /></label>
            <label className="select-field"><span>字体</span><select value={styleDraft.fontFamily} onChange={(event) => setStyleDraft({ ...styleDraft, fontFamily: event.target.value })}><option value="serif">系统宋体</option><option value="KaiTi, STKaiti, serif">楷体</option><option value="FangSong, STFangsong, serif">仿宋</option><option value="Microsoft YaHei, sans-serif">微软雅黑</option></select></label>
            <label className="range-field"><span>字号 <b>{styleDraft.fontSize}px</b></span><input type="range" min="15" max="26" step="1" value={styleDraft.fontSize} onChange={(event) => setStyleDraft({ ...styleDraft, fontSize: Number(event.target.value) })} /></label>
            <label className="range-field"><span>重叠显示优先级 <b>{styleDraft.priority}</b></span><input type="range" min="1" max="99" step="1" value={styleDraft.priority} onChange={(event) => setStyleDraft({ ...styleDraft, priority: Number(event.target.value) })} /></label>
            <div className="toggle-fields">
              <button className={styleDraft.bold ? 'active' : ''} onClick={() => setStyleDraft({ ...styleDraft, bold: !styleDraft.bold })}><b>B</b>加粗</button>
              <button className={styleDraft.underline ? 'active' : ''} onClick={() => setStyleDraft({ ...styleDraft, underline: !styleDraft.underline })}><u>U</u>下划线</button>
              <button className={styleDraft.italic ? 'active' : ''} onClick={() => setStyleDraft({ ...styleDraft, italic: !styleDraft.italic })}><i>I</i>斜体</button>
              <button className={styleDraft.visible ? 'active' : ''} onClick={() => setStyleDraft({ ...styleDraft, visible: !styleDraft.visible })}>{styleDraft.visible ? <CheckIcon size={12} /> : <CloseIcon size={12} />}默认显示</button>
            </div>
          </div>
          <button className="save-button style-save" onClick={saveStyle} disabled={styleSaving}>{styleSaving ? '保存中…' : `保存「${annotationTypeMeta(styleType).label}」本机预设`}</button>
        </div>
      )}
    </aside>
  );
}
