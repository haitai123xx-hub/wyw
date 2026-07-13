export const WORD_CLASS_USAGES = [
  ['noun-as-verb', '名词作动词'],
  ['noun-as-adverbial', '名词作状语'],
  ['verb-as-noun', '动词作名词'],
  ['adjective-as-noun', '形容词作名词'],
  ['adjective-as-verb', '形容词作动词'],
  ['numeral-as-verb', '数词作动词'],
  ['causative', '使动用法'],
  ['yidong', '意动用法'],
  ['benefactive', '为动用法'],
  ['other', '其他'],
] as const

export const SPECIAL_SENTENCE_PRESETS = [
  { category: 'judgment', categoryLabel: '判断句', options: [
    ['zhe-ye', '……者，……也'], ['zheye', '……者也'], ['ye', '……也'],
    ['judgment-word', '乃、则、即、皆、诚、为等判断词'], ['unmarked-judgment', '无明显标志'],
  ] },
  { category: 'passive', categoryLabel: '被动句', options: [
    ['wei-suo', '为……所……'], ['weisuo', '为所……'], ['jian-yu', '见……于……'],
    ['jian', '见……'], ['yu-passive', '于……'], ['bei', '被……'], ['unmarked-passive', '无明显标志'],
  ] },
  { category: 'omission', categoryLabel: '省略句', options: [
    ['subject-omitted', '省略主语'], ['predicate-omitted', '省略谓语'], ['object-omitted', '省略宾语'],
    ['preposition-omitted', '省略介词'], ['complement-omitted', '省略兼语'], ['other-omitted', '其他省略'],
  ] },
  { category: 'inversion', categoryLabel: '倒装句', options: [
    ['object-preposed', '宾语前置'], ['attribute-postposed', '定语后置'],
    ['adverbial-postposed', '状语后置／介词结构后置'], ['subject-predicate-inverted', '主谓倒装'],
  ] },
  { category: 'fixed', categoryLabel: '固定句式', options: [
    ['fixed-question', '疑问句式'], ['fixed-rhetorical', '反问句式'], ['fixed-comparison', '比较／选择句式'],
    ['fixed-exclamation', '感叹句式'], ['fixed-other', '其他固定句式'],
  ] },
] as const

export interface FunctionWordUsagePreset {
  id: string
  partOfSpeech: string
  usage: string
  translation: string
}

const p = (id: string, partOfSpeech: string, usage: string, translation: string): FunctionWordUsagePreset => ({ id, partOfSpeech, usage, translation })

export const FUNCTION_WORD_PRESETS: Record<string, FunctionWordUsagePreset[]> = {
  而: [p('parallel','连词','表并列','又、并且'),p('progressive','连词','表递进','而且、并且'),p('sequence','连词','表承接','然后、就'),p('contrast','连词','表转折','但是、却'),p('modifier','连词','表修饰','着、地，通常不译'),p('hypothesis','连词','表假设','如果、假如'),p('cause','连词','表因果','因而、所以'),p('purpose','连词','表目的','来、用来')],
  何: [p('what','疑问代词','问事物','什么'),p('where','疑问代词','问处所','哪里'),p('why','疑问副词','问原因','为什么'),p('how','疑问副词','问方式','怎么'),p('degree','副词','表程度','多么'),p('heru','固定结构','何如／若何','怎么样'),p('naihe','固定结构','奈何','怎么办'),p('heyi','固定结构','何以','凭什么、为什么')],
  乎: [p('question','语气词','表疑问','吗、呢'),p('rhetorical','语气词','表反问','吗、呢'),p('guess','语气词','表推测','吧'),p('exclaim','语气词','表感叹','啊、呀'),p('as-yu','介词','相当于“于”','在、对、比'),p('suffix','助词','形容词词尾','……的样子')],
  乃: [p('sequence','副词','表承接','于是、就'),p('only-then','副词','表条件结果','才'),p('unexpected','副词','出乎意料','竟、竟然'),p('contrast','副词','表转折','却、反而'),p('limit','副词','表限制','只、仅仅'),p('judgment','副词','表判断','是、就是'),p('second-person','代词','第二人称','你、你的')],
  其: [p('possessive','代词','第三人称领属','他的、它的'),p('third-person','代词','第三人称','他、它、他们'),p('reflexive','代词','反身','自己、自己的'),p('demonstrative','指示代词','指远','那、那些'),p('among','指示代词','其中','其中的'),p('guess','副词','表推测','大概、恐怕'),p('rhetorical','副词','表反问','难道'),p('wish','副词','表祈使或期望','可要、一定'),p('hypothesis','连词','表假设','如果')],
  且: [p('parallel','连词','表并列','又、并且'),p('progressive','连词','表递进','而且、况且'),p('concession','连词','表让步','尚且'),p('temporary','副词','表暂时','暂且、姑且'),p('soon','副词','将要','将要'),p('nearly','副词','接近数量','将近')],
  若: [p('hypothesis','连词','表假设','如果、假如'),p('second-person','代词','第二人称','你、你的'),p('such','指示代词','指示','这样、如此'),p('ruofu','固定结构','若夫／至若','至于'),p('ruohe','固定结构','若何','怎么样、怎么办')],
  所: [p('nominalizer','助词','所字结构','所……的人、事物或地方'),p('passive','助词','与“为”构成被动','为……所……'),p('reason','固定结构','所以表原因','……的原因'),p('means','固定结构','所以表凭借','用来……的、凭借……的'),p('you-wu-suo','固定结构','有所／无所','有……的、没有……的')],
  为: [p('for','介词','表对象','给、替'),p('toward','介词','表涉及','对、向'),p('purpose','介词','表目的','为了'),p('cause','介词','表原因','因为'),p('passive','介词','表被动','被'),p('question','语气词','表疑问或反问','呢')],
  焉: [p('third-person','代词','第三人称','他、它、这件事'),p('where','疑问代词','问处所','哪里'),p('yu-zhi','兼词','相当于“于之”','在那里、对它'),p('yu-ci','兼词','相当于“于此”','在这里、在这件事上'),p('statement','语气词','表陈述','了、啊'),p('question','语气词','表疑问或反问','呢'),p('suffix','助词','形容词词尾','……的样子')],
  也: [p('judgment','语气词','表判断','是、就是'),p('statement','语气词','表陈述','了，或不译'),p('question','语气词','表疑问','吗、呢'),p('rhetorical','语气词','表反问','吗、呢'),p('exclaim','语气词','表感叹','啊、呀'),p('pause','语气词','句中停顿','不译')],
  以: [p('tool','介词','表工具','用、拿'),p('basis','介词','表凭借','凭借、依据'),p('object','介词','表对象','把'),p('cause-prep','介词','表原因','因为、由于'),p('place-time','介词','表时间处所','在、从'),p('purpose','连词','表目的','来、用来'),p('cause','连词','表因果','因为、所以'),p('parallel','连词','表并列','而、又'),p('sequence','连词','表承接','然后'),p('modifier','连词','表修饰','着、地，通常不译'),p('shiyi','固定结构','是以','因此'),p('wuyi','固定结构','无以','没有用来……的办法'),p('youyi','固定结构','有以','有用来……的办法')],
  因: [p('basis','介词','表凭借','凭借、依靠'),p('chance','介词','表条件','趁着'),p('route','介词','表方式','通过、经由'),p('cause','介词','表原因','因为、由于'),p('according','介词','表依据','依照、顺着'),p('sequence','副词','表承接','于是、就')],
  于: [p('place','介词','表处所','在、到、从'),p('object','介词','表对象','对、向、给'),p('compare','介词','表比较','比'),p('passive','介词','表被动','被'),p('cause','介词','表原因','由于、因为'),p('relation','介词','表关联','与、同、跟'),p('scope','介词','引出对象','对于、在……方面')],
  与: [p('together-prep','介词','表对象','和、跟、同'),p('parallel','连词','表并列','和、与'),p('yu-question','语气词','通“欤”','吗、呢')],
  则: [p('sequence','连词','表承接','就、便、那么'),p('condition','连词','表条件','如果……就……'),p('contrast','连词','表转折','却、反而'),p('comparison','连词','表并列或对比','就、则'),p('judgment','副词','表判断','就是'),p('either','固定结构','非……则……','不是……就是……')],
  者: [p('nominalizer','助词','者字结构','……的人、事物或情况'),p('judgment-topic','助词','判断句提示主语','……者，……也'),p('attribute-postposed','助词','定语后置标志','不译'),p('time','助词','放在时间词后','不译'),p('pause','助词','表停顿','不译'),p('counter','助词','放在数词后','个、种、件')],
  之: [p('third-person','代词','第三人称','他、它、他们、它们'),p('demonstrative','代词','指示','这、这件事'),p('possessive','助词','结构助词','的'),p('cancel-independence','助词','取消句子独立性','不译'),p('object-preposed','助词','宾语前置标志','不译'),p('attribute-postposed','助词','定语后置标志','不译'),p('syllable','助词','补足音节','不译')],
}

export const COMMON_FUNCTION_WORDS = Object.keys(FUNCTION_WORD_PRESETS)
