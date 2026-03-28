const RECOGNITION_WORDS = [
  {
    wordKey: 'narasu',
    legacyKey: 'songshu',
    chinese: '\u677e\u6811',
    transliteration: 'narasu',
    mongolian: '\u1828\u1820\u1821\u1824',
    title: '\u677e\u6811 (narasu)',
    bgImage: '/assets/images/songshu.jpg',
    audioSrc: '/assets/audio/narasu.m4a',
    localTrajectoryPath: 'C:\\Users\\31013\\Downloads\\stroke_data_handwriting_1773643547825.json',
    localTemplateImagePath: 'assets/images/songshu.jpg',
    aliases: ['\u677e\u6811', 'narasu', '\u1828\u1820\u1821\u1824', 'songshu']
  },
  {
    wordKey: 'huch',
    chinese: '\u529b\u91cf',
    transliteration: 'huch',
    mongolian: '\u182c\u1826\u1834\u1826',
    title: '\u529b\u91cf (huch)',
    bgImage: '/assets/images/huch.jpg',
    audioSrc: '/assets/audio/huch.m4a',
    localTrajectoryPath: 'C:\\Users\\31013\\Downloads\\stroke_data_handwriting_1773643751715.json',
    localTemplateImagePath: 'assets/images/huch.jpg',
    aliases: ['\u529b\u91cf', 'huch', '\u182c\u1826\u1834\u1826']
  },
  {
    wordKey: 'hair',
    chinese: '\u7231',
    transliteration: 'hair',
    mongolian: '\u182c\u1820\u1822\u1837',
    title: '\u7231 (hair)',
    bgImage: '/assets/images/hair.jpg',
    audioSrc: '/assets/audio/hair.m4a',
    localTrajectoryPath: 'C:\\Users\\31013\\Downloads\\stroke_data_handwriting_1773643683354.json',
    localTemplateImagePath: 'assets/images/hair.jpg',
    aliases: ['\u7231', 'hair', '\u182c\u1820\u1822\u1837']
  }
];

function normalizeMatchText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\r\n\t,.;:!?()[\]{}"'`~_\-\\/|]+/g, '');
}

function buildAliasSet(word) {
  const aliases = new Set(word.aliases || []);
  aliases.add(word.wordKey);
  aliases.add(word.chinese);
  aliases.add(word.transliteration);
  aliases.add(word.mongolian);
  if (word.legacyKey) {
    aliases.add(word.legacyKey);
  }
  return Array.from(aliases).filter(Boolean);
}

const RECOGNITION_WORD_MAP = RECOGNITION_WORDS.reduce((accumulator, word) => {
  accumulator[word.wordKey] = {
    ...word,
    aliases: buildAliasSet(word)
  };
  return accumulator;
}, {});

const LEGACY_WORD_KEY_MAP = RECOGNITION_WORDS.reduce((accumulator, word) => {
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

function matchRecognitionText(rawText) {
  const normalizedRawText = normalizeMatchText(rawText);
  if (!normalizedRawText) {
    return null;
  }

  return RECOGNITION_WORDS.find((word) => {
    return buildAliasSet(word).some((alias) => {
      const normalizedAlias = normalizeMatchText(alias);
      return normalizedAlias && normalizedRawText.includes(normalizedAlias);
    });
  }) || null;
}

module.exports = {
  RECOGNITION_WORDS,
  RECOGNITION_WORD_MAP,
  LEGACY_WORD_KEY_MAP,
  getWordByKey,
  matchRecognitionText,
  normalizeMatchText
};
