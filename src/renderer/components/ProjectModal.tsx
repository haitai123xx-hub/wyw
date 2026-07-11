import { useEffect, useRef, useState } from 'react';
import { GROUP_COLORS, SAMPLE_TEXT } from '../constants';
import { CloseIcon, FileIcon, ImportIcon, SparkleIcon } from '../icons';
import type { Group, Project, ProjectCreateInput } from '../types';

interface ProjectModalProps {
  open: boolean;
  project?: Project | null;
  groups: Group[];
  onClose: () => void;
  onSubmit: (input: ProjectCreateInput) => Promise<void>;
}

const EMPTY_FORM = {
  title: '', author: '', dynasty: '', source: '', description: '', tags: '', originalText: '', groupId: '',
};

export function ProjectModal({ open, project, groups, onClose, onSubmit }: ProjectModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (project) {
      setForm({
        title: project.metadata.title,
        author: project.metadata.author ?? '',
        dynasty: project.metadata.dynasty ?? '',
        source: project.metadata.source ?? '',
        description: project.metadata.description ?? '',
        tags: (project.metadata.tags ?? []).join('，'),
        originalText: project.originalText,
        groupId: project.groupId ?? '',
      });
    } else setForm(EMPTY_FORM);
    setError('');
  }, [open, project]);

  if (!open) return null;

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const chooseFile = async (file?: File) => {
    if (!file) return;
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      setError('请选择 .txt 或 .md 文本文件');
      return;
    }
    const text = await file.text();
    const inferredTitle = file.name.replace(/\.(txt|md|markdown)$/i, '').trim();
    setForm((current) => ({ ...current, originalText: text.replace(/^\uFEFF/, ''), title: current.title || inferredTitle }));
    setError('');
  };

  const submit = async () => {
    const title = form.title.trim();
    const originalText = form.originalText.trim();
    if (!title) return setError('请填写篇目标题');
    if (!originalText) return setError('请粘贴原文或选择文本文件');
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        metadata: {
          title,
          author: form.author.trim(),
          dynasty: form.dynasty.trim(),
          source: form.source.trim(),
          description: form.description.trim(),
          tags: form.tags.split(/[，,、]/).map((item) => item.trim()).filter(Boolean).slice(0, 30),
        },
        originalText,
        groupId: form.groupId || null,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存篇目失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal project-modal" role="dialog" aria-modal="true" aria-label={project ? '篇目设置' : '新建篇目'}>
        <header className="modal-header">
          <div className="modal-mark">{project ? '改' : '录'}</div>
          <div><span>{project ? 'PROJECT SETTINGS' : 'NEW READING'}</span><h2>{project ? '篇目设置' : '新建研读篇目'}</h2></div>
          <button onClick={onClose}><CloseIcon size={19} /></button>
        </header>
        <div className="modal-body">
          <div className="project-form-grid">
            <label className="wide"><span>篇目标题 <b>*</b></span><input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="例如：桃花源记" autoFocus /></label>
            <label><span>作者</span><input value={form.author} onChange={(event) => update('author', event.target.value)} placeholder="例如：陶渊明" /></label>
            <label><span>朝代</span><input value={form.dynasty} onChange={(event) => update('dynasty', event.target.value)} placeholder="例如：东晋" /></label>
            <label><span>所属分组</span><select value={form.groupId} onChange={(event) => update('groupId', event.target.value)}><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
            <label><span>来源</span><input value={form.source} onChange={(event) => update('source', event.target.value)} placeholder="课本、书目或出处" /></label>
            <label className="wide"><span>标签</span><input value={form.tags} onChange={(event) => update('tags', event.target.value)} placeholder="山水，初中文言文（用逗号分隔）" /></label>
            <label className="wide"><span>篇目说明</span><input value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="可选：写下选篇原因或阅读目标" /></label>
          </div>

          {!project && (
            <div className="source-divider"><span>录入原文</span><i /></div>
          )}

          <label className={`article-input ${project ? 'locked' : ''}`}>
            <span className="article-input-head">
              <span>原文内容 {!project && <b>*</b>}</span>
              {!project && <span className="article-input-tools">
                <button type="button" onClick={(event) => { event.preventDefault(); fileRef.current?.click(); }}><ImportIcon size={15} />选择 .txt / .md</button>
                <button type="button" onClick={(event) => { event.preventDefault(); setForm((current) => ({ ...current, title: current.title || '桃花源记', author: current.author || '陶渊明', dynasty: current.dynasty || '东晋', originalText: SAMPLE_TEXT, tags: current.tags || '示例，古文' })); }}><SparkleIcon size={15} />填入示例</button>
              </span>}
            </span>
            <textarea
              value={form.originalText}
              onChange={(event) => update('originalText', event.target.value)}
              placeholder="在这里粘贴文言文原文，或选择本地文本文件……"
              readOnly={Boolean(project)}
            />
            <span className="article-input-footer"><span><FileIcon size={14} />{project ? '为确保已有批注位置准确，编辑模式下原文不可修改' : '支持纯文本与 Markdown 文本'}</span><b>{form.originalText.replace(/\s/g, '').length.toLocaleString()} 字</b></span>
          </label>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
          {error && <div className="form-error">{error}</div>}
        </div>
        <footer className="modal-footer"><button className="cancel-button" onClick={onClose}>取消</button><button className="save-button" onClick={submit} disabled={saving}>{saving ? '保存中…' : project ? '保存设置' : '创建篇目'}</button></footer>
      </section>
    </div>
  );
}

interface GroupModalProps {
  open: boolean;
  group?: Group | null;
  onClose: () => void;
  onSubmit: (input: { name: string; color: string; description: string }) => Promise<void>;
}

export function GroupModal({ open, group, onClose, onSubmit }: GroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(GROUP_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(group?.name ?? '');
      setDescription(group?.description ?? '');
      setColor(group?.color ?? GROUP_COLORS[0]);
      setError('');
    }
  }, [group, open]);

  if (!open) return null;
  const submit = async () => {
    if (!name.trim()) return setError('请输入分组名称');
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), color, description: description.trim() });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存分组失败');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal group-modal" role="dialog" aria-modal="true">
        <header className="modal-header"><div className="modal-mark">集</div><div><span>COLLECTION</span><h2>{group ? '编辑文集' : '新建文集'}</h2></div><button onClick={onClose}><CloseIcon size={19} /></button></header>
        <div className="modal-body">
          <label className="stacked-field"><span>文集名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：高中必修上" autoFocus /></label>
          <label className="stacked-field"><span>文集说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选：记录这个文集的用途" /></label>
          <div className="stacked-field"><span>标识颜色</span><div className="group-color-row">{GROUP_COLORS.map((item) => <button key={item} className={color === item ? 'active' : ''} style={{ background: item }} onClick={() => setColor(item)}>{color === item && <span>✓</span>}</button>)}</div></div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <footer className="modal-footer"><button className="cancel-button" onClick={onClose}>取消</button><button className="save-button" onClick={submit} disabled={saving}>{saving ? '保存中…' : group ? '保存修改' : '创建文集'}</button></footer>
      </section>
    </div>
  );
}

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmModal({ open, title, description, confirmText = '确认删除', onClose, onConfirm }: ConfirmModalProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setError('');
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <section className="modal confirm-modal" role="alertdialog" aria-modal="true">
        <div className="danger-mark">删</div><h2>{title}</h2><p>{description}</p>
        {error && <div className="form-error confirm-error">{error}</div>}
        <footer><button className="cancel-button" onClick={onClose}>取消</button><button className="confirm-danger" disabled={working} onClick={async () => {
          setWorking(true);
          setError('');
          try {
            await onConfirm();
            onClose();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : '操作失败，请稍后重试');
          } finally {
            setWorking(false);
          }
        }}>{working ? '处理中…' : confirmText}</button></footer>
      </section>
    </div>
  );
}
