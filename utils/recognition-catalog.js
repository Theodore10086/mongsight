const { ARCHIVE_LEARNABLE_WORDS } = require('./archive-dict-words.js');

const CURATED_RECOGNITION_WORDS = [
  {
    id: 'narasu',
    wordKey: 'narasu',
    legacyKey: 'songshu',
    chinese: '松树',
    transliteration: 'narasu',
    mongolian: 'ᠨᠠᠱᠤ',
    title: '松树 (narasu)',
    definition: '松树，常用于自然、四季与草原景物表达。',
    explanation: '这个词适合初学者观察纵向结构与收笔节奏。识别后可以先看标准字形，再跟着轨迹慢速临摹。',
    example: '可以把它理解成“草原上的松树”这一类自然意象词。',
    memoryTip: '记忆时先抓住整体高挑轮廓，再注意中段的连接变化。',
    bgImage: '/assets/images/songshu.jpg',
    audioSrc: '/assets/audio/narasu.m4a',
    framePrefix: 'frame_songshu_',
    tips: '起笔逆锋，转折处提笔换锋，收笔回锋。',
    guides: [],
    source: 'curated',
    isRecognitionReady: true,
    localTrajectoryPath: 'C:\\Users\\31013\\Downloads\\stroke_data_handwriting_1773643547825.json',
    localTemplateImagePath: 'assets/images/songshu.jpg',
    aliases: ['松树', 'narasu', 'ᠨᠠᠱᠤ', 'songshu']
  },
  {
    id: 'huch',
    wordKey: 'huch',
    chinese: '力量',
    transliteration: 'huch',
    mongolian: 'ᠬᠦᠴᠦ',
    title: '力量 (huch)',
    definition: '力量，常用于表达精神、意志和能量。',
    explanation: '这个词更适合用来训练笔画力度控制。临摹时要注意线条稳定，不要只追求快。',
    example: '在鼓励性表达里，经常会出现“力量、勇气、坚持”这一类词汇。',
    memoryTip: '先稳住起笔，再观察每一段转折是否写得够干净。',
    bgImage: '/assets/images/huch.jpg',
    audioSrc: '/assets/audio/huch.m4a',
    framePrefix: 'frame_huch_',
    tips: '笔力递进，起落分明，重按轻提。',
    guides: [],
    source: 'curated',
    isRecognitionReady: true,
    localTrajectoryPath: 'C:\\Users\\31013\\Downloads\\stroke_data_handwriting_1773643751715.json',
    localTemplateImagePath: 'assets/images/huch.jpg',
    aliases: ['力量', 'huch', 'ᠬᠦᠴᠦ']
  },
  {
    id: 'hair',
    wordKey: 'hair',
    chinese: '爱',
    transliteration: 'hair',
    mongolian: 'ᠬᠠᠢᠷ',
    title: '爱 (hair)',
    definition: '爱，常用于人物情感、祝福和价值表达。',
    explanation: '这个词适合拿来练习细节辨识。识别后建议先读义，再对照轨迹看每个局部的形态差异。',
    example: '在文化表达和日常教学里，“爱”是非常高频的基础词。',
    memoryTip: '把它当作高频基础词反复复习，比一次写很多生词更有效。',
    bgImage: '/assets/images/hair.jpg',
    audioSrc: '/assets/audio/hair.m4a',
    framePrefix: 'frame_hair_',
    tips: '运笔如行云流水，笔画圆润流畅。',
    guides: [],
    source: 'curated',
    isRecognitionReady: true,
    localTrajectoryPath: 'C:\\Users\\31013\\Downloads\\stroke_data_handwriting_1773643683354.json',
    localTemplateImagePath: 'assets/images/hair.jpg',
    aliases: ['爱', 'hair', 'ᠬᠠᠢᠷ']
  }
];

const LEARNABLE_WORDS = [...CURATED_RECOGNITION_WORDS, ...ARCHIVE_LEARNABLE_WORDS];

function normalizeMatchText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\r\n\t,.;:!?()[\]{}"'`~_\-\\/|]+/g, '');
}

function buildAliasSet(word) {
  const aliases = new Set(word.aliases || []);
  aliases.add(word.wordKey);
  aliases.add(word.id);
  aliases.add(word.chinese);
  aliases.add(word.transliteration);
  aliases.add(word.mongolian);
  if (word.legacyKey) {
    aliases.add(word.legacyKey);
  }
  return Array.from(aliases).filter(Boolean);
}

const RECOGNITION_WORD_MAP = LEARNABLE_WORDS.reduce((accumulator, word) => {
  accumulator[word.wordKey] = {
    ...word,
    aliases: buildAliasSet(word)
  };
  return accumulator;
}, {});

const LEGACY_WORD_KEY_MAP = CURATED_RECOGNITION_WORDS.reduce((accumulator, word) => {
  if (word.legacyKey) {
    accumulator[word.legacyKey] = word.wordKey;
  }
  return accumulator;
}, {});

function getWordByKey(wordKey) {
  if (!wordKey) {
    return null;
  }
  const normalizedKey = LEGACY_WORD_KEY_MAP[wordKey] || wordKey;
  return RECOGNITION_WORD_MAP[normalizedKey] || null;
}

function getArchiveStarterWords(limit = 8) {
  return ARCHIVE_LEARNABLE_WORDS.slice(0, Math.max(0, limit));
}

function matchRecognitionText(rawText) {
  const normalizedRawText = normalizeMatchText(rawText);
  if (!normalizedRawText) {
    return null;
  }

  return LEARNABLE_WORDS.find((word) => {
    return buildAliasSet(word).some((alias) => {
      const normalizedAlias = normalizeMatchText(alias);
      return normalizedAlias && normalizedRawText.includes(normalizedAlias);
    });
  }) || null;
}

module.exports = {
  CURATED_RECOGNITION_WORDS,
  ARCHIVE_LEARNABLE_WORDS,
  LEARNABLE_WORDS,
  RECOGNITION_WORDS: LEARNABLE_WORDS,
  RECOGNITION_WORD_MAP,
  LEGACY_WORD_KEY_MAP,
  getWordByKey,
  getArchiveStarterWords,
  matchRecognitionText,
  normalizeMatchText
};
