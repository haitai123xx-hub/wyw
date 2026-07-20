/** renderer 的展示元数据、默认样式和内置示例；业务数据类型仍以 shared 为准。 */
import type { AnnotationStyle, AnnotationType, TargetKind } from './types';

// id 是持久化值，label/hint 只用于中文界面。
export const ANNOTATION_TYPES: Array<{
  id: AnnotationType;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
}> = [
  { id: 'definition', label: '释义', shortLabel: '释', description: '字词或语句的含义', color: '#2f6f5e' },
  { id: 'polysemy', label: '一词多义', shortLabel: '多', description: '同一词语的不同义项', color: '#91622d' },
  { id: 'ancient-modern', label: '古今异义', shortLabel: '古', description: '古今词义的差异', color: '#8a4b53' },
  { id: 'word-class', label: '词类活用', shortLabel: '活', description: '词性的临时转化', color: '#5a568d' },
  { id: 'phonetic-loan', label: '通假字', shortLabel: '通', description: '借用同音或近音字', color: '#a14f35' },
  { id: 'function-word', label: '文言虚词', shortLabel: '虚', description: '虚词的意义与用法', color: '#356c8a' },
  { id: 'special-sentence', label: '特殊句式', shortLabel: '句', description: '判断、倒装、省略等句式', color: '#6a7240' },
  { id: 'pronunciation', label: '注音', shortLabel: '音', description: '为单字标注拼音和声调', color: '#7c3aed' },
];

export const TARGET_KINDS: Array<{ id: TargetKind; label: string; hint: string }> = [
  { id: 'character', label: '字', hint: '单字' },
  { id: 'word', label: '词', hint: '词语' },
  { id: 'sentence', label: '句', hint: '句子' },
];

const DISPLAY_DEFAULTS = { mark: 'combined' as const, backgroundOpacity: 18, visible: true, priority: 10, notePosition: 'below' as const, noteFontSize: 9 };

// 浏览器预览需要一份 renderer 默认样式；Electron 正式数据由 shared/models 创建。
export const DEFAULT_STYLES: Record<AnnotationType, AnnotationStyle> = {
  definition: { ...DISPLAY_DEFAULTS, priority: 10, fontColor: '#245f50', backgroundColor: '#e3f0e9', bold: false, underline: true, italic: false, fontFamily: 'serif', fontSize: 18 },
  polysemy: { ...DISPLAY_DEFAULTS, priority: 30, notePosition: 'above', fontColor: '#7d511f', backgroundColor: '#f4ead7', bold: false, underline: true, italic: false, fontFamily: 'serif', fontSize: 18 },
  'ancient-modern': { ...DISPLAY_DEFAULTS, mark: 'dashed', priority: 60, fontColor: '#7b3c48', backgroundColor: '#f3e1e4', bold: false, underline: true, italic: false, fontFamily: 'serif', fontSize: 18 },
  'word-class': { ...DISPLAY_DEFAULTS, priority: 50, notePosition: 'above', fontColor: '#514b82', backgroundColor: '#e8e5f3', bold: false, underline: true, italic: false, fontFamily: 'serif', fontSize: 18 },
  'phonetic-loan': { ...DISPLAY_DEFAULTS, mark: 'dot', priority: 70, notePosition: 'above', fontColor: '#93442d', backgroundColor: '#f5e1da', bold: true, underline: true, italic: false, fontFamily: 'serif', fontSize: 18 },
  'function-word': { ...DISPLAY_DEFAULTS, mark: 'dot', priority: 40, fontColor: '#2d6680', backgroundColor: '#deedf3', bold: false, underline: true, italic: false, fontFamily: 'serif', fontSize: 18 },
  'special-sentence': { ...DISPLAY_DEFAULTS, mark: 'background', priority: 20, backgroundOpacity: 10, fontColor: '#5f6835', backgroundColor: '#ebefd8', bold: false, underline: true, italic: false, fontFamily: 'serif', fontSize: 18 },
  pronunciation: { fontColor: '#7c3aed', backgroundColor: 'transparent', bold: false, underline: false, italic: false, fontFamily: 'serif', fontSize: 18, mark: 'dot', backgroundOpacity: 0, visible: true, priority: 80, notePosition: 'above', noteFontSize: 8 },
};

export const GROUP_COLORS = ['#9f5545', '#356b5f', '#4e628d', '#8a6a35', '#725786', '#587382'];

export const SAMPLE_TEXT = `晋太元中，武陵人捕鱼为业。缘溪行，忘路之远近。忽逢桃花林，夹岸数百步，中无杂树，芳草鲜美，落英缤纷。渔人甚异之，复前行，欲穷其林。\n\n林尽水源，便得一山，山有小口，仿佛若有光。便舍船，从口入。初极狭，才通人。复行数十步，豁然开朗。土地平旷，屋舍俨然，有良田、美池、桑竹之属。阡陌交通，鸡犬相闻。`;

export function annotationTypeMeta(type: AnnotationType) {
  // 正常数据一定能找到；兜底项让损坏数据也不会使整个页面崩溃。
  return ANNOTATION_TYPES.find((item) => item.id === type) ?? ANNOTATION_TYPES[0];
}
