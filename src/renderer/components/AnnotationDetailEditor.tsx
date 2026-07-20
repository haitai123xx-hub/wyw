/** 根据批注类型渲染不同的结构化内容表单。 */
import { FUNCTION_WORD_PRESETS, SPECIAL_SENTENCE_PRESETS, WORD_CLASS_USAGES } from '@shared/annotation-presets';
import type { AnnotationDetail, AnnotationTargetKind, AnnotationType } from '@shared/models';
import { PlusIcon, TrashIcon } from '../icons';

export function createEmptyDetail(type: AnnotationType, text: string): AnnotationDetail {
  // switch 覆盖全部 AnnotationType；返回值的 kind 与外层 type 始终一致。
  switch (type) {
    case 'definition': return { kind: type, meaning: '' };
    case 'polysemy': return { kind: type, contextualMeaning: '', otherMeanings: [] };
    case 'ancient-modern': return { kind: type, ancientMeaning: '', modernMeaning: '' };
    case 'word-class': return { kind: type, usage: '', meaning: '' };
    case 'phonetic-loan': return { kind: type, standardCharacter: '', meaning: '', pronunciation: '' };
    case 'function-word': return { kind: type, character: [...text][0] ?? '', usageCode: '', partOfSpeech: '', usage: '', translation: '' };
    case 'special-sentence': return { kind: type, patterns: [], restoredText: '' };
    case 'pronunciation': return { kind: type, pinyin: '' };
  }
}

export function isDetailComplete(detail: AnnotationDetail): boolean {
  // 前端只检查能否提交；后端仍会用 Zod 再做一次可信校验。
  switch (detail.kind) {
    case 'definition': return Boolean(detail.meaning.trim());
    case 'polysemy': return Boolean(detail.contextualMeaning.trim());
    case 'ancient-modern': return Boolean(detail.ancientMeaning.trim() && detail.modernMeaning.trim());
    case 'word-class': return Boolean(detail.usage.trim() && detail.meaning.trim());
    case 'phonetic-loan': return [...detail.standardCharacter].length === 1 && Boolean(detail.meaning.trim());
    case 'function-word': return Boolean(detail.usageCode && detail.partOfSpeech && detail.usage);
    case 'special-sentence': return detail.patterns.length > 0;
    case 'pronunciation': return Boolean(detail.pinyin.trim());
  }
}

interface Props {
  detail: AnnotationDetail;
  targetText: string;
  targetKind: AnnotationTargetKind;
  onChange: (detail: AnnotationDetail) => void;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="detail-field"><span>{label}</span>{children}</label>;

export function AnnotationDetailEditor({ detail, targetText, targetKind, onChange }: Props) {
  // detail.kind 是可辨识联合的标志，进入分支后 TS 会自动提供该类型专属字段。
  if (detail.kind === 'definition') return <Field label={targetKind === 'sentence' ? '句意／译文' : '释义'}><textarea value={detail.meaning} onChange={(event) => onChange({ ...detail, meaning: event.target.value })} placeholder="填写这处原文的含义" autoFocus /></Field>;

  if (detail.kind === 'polysemy') return <div className="detail-fields">
    <Field label="本句义"><input value={detail.contextualMeaning} onChange={(event) => onChange({ ...detail, contextualMeaning: event.target.value })} placeholder="这个字或词在本句中的意思" autoFocus /></Field>
    <div className="repeat-field"><div className="repeat-field-title"><span>其他义项（可选）</span><button onClick={() => onChange({ ...detail, otherMeanings: [...detail.otherMeanings, { meaning: '', example: '' }] })}><PlusIcon size={13} />添加</button></div>
      {detail.otherMeanings.map((item, index) => <div className="meaning-row" key={index}><input value={item.meaning} onChange={(event) => onChange({ ...detail, otherMeanings: detail.otherMeanings.map((value, itemIndex) => itemIndex === index ? { ...value, meaning: event.target.value } : value) })} placeholder="义项" /><input value={item.example} onChange={(event) => onChange({ ...detail, otherMeanings: detail.otherMeanings.map((value, itemIndex) => itemIndex === index ? { ...value, example: event.target.value } : value) })} placeholder="例句（可选）" /><button title="删除义项" onClick={() => onChange({ ...detail, otherMeanings: detail.otherMeanings.filter((_, itemIndex) => itemIndex !== index) })}><TrashIcon size={13} /></button></div>)}
    </div>
  </div>;

  if (detail.kind === 'ancient-modern') return <div className="detail-fields two-columns"><Field label="古义"><textarea value={detail.ancientMeaning} onChange={(event) => onChange({ ...detail, ancientMeaning: event.target.value })} placeholder="古代汉语中的意思" autoFocus /></Field><Field label="今义"><textarea value={detail.modernMeaning} onChange={(event) => onChange({ ...detail, modernMeaning: event.target.value })} placeholder="现代汉语中的意思" /></Field></div>;

  if (detail.kind === 'word-class') return <div className="detail-fields"><span className="detail-label">活用方式</span><div className="choice-grid">{WORD_CLASS_USAGES.map(([id, label]) => <button key={id} className={detail.usage === label ? 'active' : ''} onClick={() => onChange({ ...detail, usage: label })}>{label}</button>)}</div><Field label="句中意思"><input value={detail.meaning} onChange={(event) => onChange({ ...detail, meaning: event.target.value })} placeholder="例如：使……劳累" /></Field></div>;

  if (detail.kind === 'phonetic-loan') return <div className="detail-fields two-columns"><Field label={`“${targetText}”通`}><input value={detail.standardCharacter} maxLength={2} onChange={(event) => onChange({ ...detail, standardCharacter: [...event.target.value][0] ?? '' })} placeholder="本字" autoFocus /></Field><Field label="读音（可选）"><input value={detail.pronunciation} onChange={(event) => onChange({ ...detail, pronunciation: event.target.value })} placeholder="如 yuè" /></Field><div className="span-two"><Field label="句中意思"><input value={detail.meaning} onChange={(event) => onChange({ ...detail, meaning: event.target.value })} placeholder="填写通假后的意思" /></Field></div></div>;

  if (detail.kind === 'function-word') {
    // 选中的字若属于常见虚词就给出预设，否则展示自由输入表单。
    const presets = FUNCTION_WORD_PRESETS[targetText] ?? [];
    const custom = detail.usageCode === 'custom' || presets.length === 0;
    return <div className="detail-fields"><div className="function-word-heading"><b>{targetText}</b><span>{presets.length ? '选择本句中的用法即可保存' : '不在常见十八虚词中，可自定义用法'}</span></div>{presets.length > 0 && <div className="usage-groups">{[...new Set(presets.map((item) => item.partOfSpeech))].map((part) => <section key={part}><span>{part}</span><div>{presets.filter((item) => item.partOfSpeech === part).map((item) => <button key={item.id} className={detail.usageCode === item.id ? 'active' : ''} onClick={() => onChange({ kind: 'function-word', character: targetText, usageCode: item.id, partOfSpeech: item.partOfSpeech, usage: item.usage, translation: item.translation })}><b>{item.usage}</b><small>{item.translation}</small></button>)}</div></section>)}<button className={custom ? 'custom-usage active' : 'custom-usage'} onClick={() => onChange({ kind: 'function-word', character: targetText, usageCode: 'custom', partOfSpeech: '', usage: '', translation: '' })}>其他用法</button></div>}{custom && <div className="detail-fields two-columns"><Field label="词性"><input value={detail.partOfSpeech} onChange={(event) => onChange({ ...detail, partOfSpeech: event.target.value })} placeholder="如：助词" /></Field><Field label="具体用法"><input value={detail.usage} onChange={(event) => onChange({ ...detail, usage: event.target.value })} placeholder="如：取消句子独立性" /></Field><div className="span-two"><Field label="本句译法（可选）"><input value={detail.translation} onChange={(event) => onChange({ ...detail, translation: event.target.value })} placeholder="无实义时可以留空" /></Field></div></div>}</div>;
  }

  if (detail.kind === 'special-sentence') return <div className="detail-fields sentence-choices"><span className="detail-label">句式类型（可以多选）</span>{SPECIAL_SENTENCE_PRESETS.map((group) => <section key={group.category}><span>{group.categoryLabel}</span><div>{group.options.map(([subtype, label]) => { const selected = detail.patterns.some((item) => item.category === group.category && item.subtype === subtype); return <button key={subtype} className={selected ? 'active' : ''} onClick={() => onChange({ ...detail, patterns: selected ? detail.patterns.filter((item) => !(item.category === group.category && item.subtype === subtype)) : [...detail.patterns, { category: group.category, categoryLabel: group.categoryLabel, subtype, label }] })}>{label}</button>; })}</div></section>)}<Field label="还原／补全后的句子（可选）"><textarea value={detail.restoredText} onChange={(event) => onChange({ ...detail, restoredText: event.target.value })} placeholder="例如还原倒装语序或补出省略成分" /></Field></div>;

  // 前面七个分支均已 return，剩余类型只能是 pronunciation。
  const setTone = (tone: number) => onChange({ ...detail, pinyin: `${detail.pinyin.replace(/[1-5]$/, '')}${tone}` });
  return <div className="detail-fields pronunciation-fields"><Field label={`“${targetText}”的拼音`}><input value={detail.pinyin} onChange={(event) => onChange({ ...detail, pinyin: event.target.value })} placeholder="如 xué 或 xue2" autoFocus /></Field><div><span className="detail-label">声调</span><div className="tone-buttons">{[1,2,3,4,5].map((tone) => <button key={tone} className={detail.pinyin.endsWith(String(tone)) ? 'active' : ''} onClick={() => setTone(tone)}>{tone === 5 ? '轻声' : `${tone} 声`}</button>)}</div></div><p>支持直接输入带声调拼音，也可以输入拼音后选择声调。</p></div>;
}
