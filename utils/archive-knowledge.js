const ARCHIVE_DATASET_FACTS = [
  { label: 'MOLHW样本', value: '164,631' },
  { label: '覆盖词数', value: '40,605' },
  { label: '书写者', value: '200' },
  { label: '字素编码', value: '51' }
];

const ARCHIVE_KNOWLEDGE_CARDS = [
  {
    title: 'Unicode 与 Grapheme',
    body: 'archive 里的资料说明，同一份轨迹可以同时按 Unicode 标签和 grapheme 标签理解。前者更像字符序列，后者更像教学里更细的字形单元。'
  },
  {
    title: '为什么要做预处理',
    body: 'MOLHW 同时提供原始坐标和标准化坐标。标准化的价值在于把不同手机、不同屏幕大小下的笔迹统一到同一尺度，便于训练和比较。'
  },
  {
    title: '为什么复习很重要',
    body: '论文提取稿里提到，蒙古文词汇量很大、字母形态会随位置变化。对学习者来说，反复回看“词义 + 字形 + 轨迹”比只识别一次更有效。'
  }
];

const ARCHIVE_PRIMER_POINTS = [
  'MOLHW 是手机触屏采集的蒙古文在线手写数据集，适合教学演示和轨迹回放。',
  '传统蒙古文词形会随词首、词中、词尾发生变化，识别后最好立刻结合字形再看一遍。',
  'archive 中的 ASCII2Unicode 对照表说明，拉丁转写只是中间层，最终还是要回到真实蒙古文字形。'
];

const ARCHIVE_SOURCE_ASSETS = {
  graphemeChart: '/assets/images/knowledge/grapheme-code.png',
  reviewHero: '/assets/images/knowledge/review-hero-bg.png',
  studyNote: '/assets/images/knowledge/study-note-bg.png'
};

module.exports = {
  ARCHIVE_DATASET_FACTS,
  ARCHIVE_KNOWLEDGE_CARDS,
  ARCHIVE_PRIMER_POINTS,
  ARCHIVE_SOURCE_ASSETS
};
