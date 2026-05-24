const ARCHIVE_DICT_LINES = [
  'a=a ax',
  'ai=a az ix',
  'ainstEn=a az iz iz az s d w ax',
  'aiGgwri=a az iz iz ng gz o r ix',
  'aibagar=a az iz iz bos bax gz az rx',
  'aibwgwhan=a az iz iz bos box gz o az az az ax',
  'aigag=a az iz iz gz az hx',
  'aimag=a az iz iz mz az hx',
  'aimaglan=a az iz iz mz az az az lz az ax',
  'aimwrwn=a az iz iz mz o r o ax',
  'ail=a az iz iz lx',
  'ailad=a az iz iz lz az o ax',
  'aidas=a az iz iz d az sx',
  'aijam=a az iz iz jz az mx',
  'aijim=a az iz iz jz iz mx',
  'airag=a az iz iz r az hx',
  'airoport=a az iz iz r o pos box r t si',
  'an=a az ax',
  'anai=a az nz az ix',
  'anabad=a az nz az bos bax o ax',
  'analiZ=a az nz az lz iz z si',
  'anadag=a az nz az d az hx',
  'anar=a az nz az rx',
  'anin=a az nz iz ax'
];

const ASCII_TO_UNICODE = {
  '-': '\u202F',
  '!': '\u180D',
  '*': '\u200D',
  '^': '\u180B',
  _: '\u180E',
  '~': '\u180C',
  a: '\u1820',
  b: '\u182A',
  c: '\u1834',
  d: '\u1833',
  e: '\u1821',
  E: '\u1827',
  f: '\u1839',
  g: '\u182D',
  G: '\u1829',
  h: '\u182C',
  H: '\u183E',
  i: '\u1822',
  j: '\u1835',
  k: '\u183A',
  K: '\u183B',
  l: '\u182F',
  L: '\u1840',
  m: '\u182E',
  n: '\u1828',
  o: '\u1823',
  p: '\u182B',
  r: '\u1837',
  R: '\u183F',
  s: '\u1830',
  S: '\u1842',
  t: '\u1832',
  u: '\u1826',
  v: '\u1825',
  w: '\u1824',
  W: '\u1838',
  x: '\u1831',
  X: '\u1841',
  y: '\u1836',
  z: '\u183C',
  Z: '\u183D'
};

function transliterationToUnicode(text) {
  return String(text || '')
    .split('')
    .map((char) => ASCII_TO_UNICODE[char] || char)
    .join('');
}

function buildWordKey(rawWord) {
  return String(rawWord || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildArchiveWord(line, index) {
  const [rawWord, rawCode = ''] = String(line || '').split('=');
  const transliteration = String(rawWord || '').trim();
  const graphemeCode = String(rawCode || '').trim();
  const mongolian = transliterationToUnicode(transliteration);
  const wordKey = buildWordKey(transliteration);

  return {
    id: wordKey,
    wordKey,
    chinese: mongolian || transliteration,
    transliteration,
    mongolian,
    title: `${transliteration} · 高频词`,
    definition: '来自 dict.txt 的高频基础词，已导入首批教学词库，可直接加入复习并联动练写。',
    explanation: `字素编码：${graphemeCode}。先认转写，再观察真实字形的竖写结构。`,
    example: `archive/dict.txt starter batch #${index + 1}`,
    memoryTip: `把 ${transliteration} 当作高频视觉词，按“识读 - 复习 - 练写”重复几轮。`,
    bgImage: '/assets/images/knowledge/study-note-bg.png',
    audioSrc: '',
    framePrefix: 'frame_archive_',
    tips: `先慢写 ${transliteration} 的整体纵向节奏，再对照字素编码检查连接位置。`,
    guides: [],
    aliases: [transliteration, mongolian, wordKey],
    graphemeCode,
    source: 'archive-dict',
    isRecognitionReady: false
  };
}

const ARCHIVE_LEARNABLE_WORDS = ARCHIVE_DICT_LINES.map(buildArchiveWord);

module.exports = {
  ARCHIVE_DICT_LINES,
  ARCHIVE_LEARNABLE_WORDS,
  transliterationToUnicode
};
