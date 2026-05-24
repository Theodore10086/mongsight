const REVIEW_QUEUE_KEY = 'reviewQueueWords';
const REVIEW_DAILY_COUNT_KEY = 'todayReviewWords';
const DAY_MS = 24 * 60 * 60 * 1000;

function readQueue() {
  const queue = wx.getStorageSync(REVIEW_QUEUE_KEY);
  return Array.isArray(queue) ? queue : [];
}

function writeQueue(queue) {
  wx.setStorageSync(REVIEW_QUEUE_KEY, queue);
}

function normalizeWordPayload(word = {}) {
  return {
    wordKey: String(word.wordKey || '').trim(),
    id: String(word.id || word.wordKey || '').trim(),
    chinese: String(word.chinese || '').trim(),
    transliteration: String(word.transliteration || '').trim(),
    mongolian: String(word.mongolian || '').trim(),
    title: String(word.title || '').trim(),
    definition: String(word.definition || '').trim(),
    explanation: String(word.explanation || '').trim(),
    example: String(word.example || '').trim(),
    memoryTip: String(word.memoryTip || '').trim(),
    tips: String(word.tips || '').trim(),
    graphemeCode: String(word.graphemeCode || '').trim(),
    source: String(word.source || '').trim(),
    audioSrc: String(word.audioSrc || '').trim(),
    bgImage: String(word.bgImage || '').trim()
  };
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function endOfToday() {
  return startOfToday() + DAY_MS - 1;
}

function computeNextDueAt(reviewCount) {
  const safeReviewCount = Math.max(0, Number(reviewCount) || 0);
  const intervalDays = Math.min(7, Math.max(1, safeReviewCount + 1));
  return startOfToday() + intervalDays * DAY_MS;
}

function addWordToReview(word) {
  const normalizedWord = normalizeWordPayload(word);
  if (!normalizedWord.wordKey) {
    return { added: false, reason: 'missing-word-key' };
  }

  const queue = readQueue();
  const existingIndex = queue.findIndex((item) => item.wordKey === normalizedWord.wordKey);
  const now = Date.now();

  if (existingIndex >= 0) {
    queue[existingIndex] = {
      ...queue[existingIndex],
      ...normalizedWord,
      updatedAt: now
    };
    writeQueue(queue);
    return { added: false, item: queue[existingIndex] };
  }

  const item = {
    ...normalizedWord,
    createdAt: now,
    updatedAt: now,
    reviewCount: 0,
    lastReviewedAt: 0,
    nextDueAt: startOfToday(),
    source: 'recognition'
  };
  queue.unshift(item);
  writeQueue(queue);
  return { added: true, item };
}

function isWordInReview(wordKey) {
  if (!wordKey) {
    return false;
  }
  return readQueue().some((item) => item.wordKey === wordKey);
}

function getReviewQueue() {
  return readQueue()
    .slice()
    .sort((left, right) => {
      const dueGap = Number(left.nextDueAt || 0) - Number(right.nextDueAt || 0);
      if (dueGap !== 0) {
        return dueGap;
      }
      return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
    });
}

function getDueReviewQueue(now = Date.now()) {
  return getReviewQueue().filter((item) => Number(item.nextDueAt || 0) <= now);
}

function getReviewSummary() {
  const queue = getReviewQueue();
  const dueQueue = getDueReviewQueue();
  const completedTodayCount = getReviewedTodayQueue().length;
  return {
    total: queue.length,
    dueCount: dueQueue.length,
    completedTodayCount
  };
}

function getReviewedTodayQueue() {
  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  return getReviewQueue().filter((item) => {
    const reviewedAt = Number(item.lastReviewedAt || 0);
    return reviewedAt >= todayStart && reviewedAt <= todayEnd;
  });
}

function getNextRecommendedWord() {
  const dueQueue = getDueReviewQueue();
  if (dueQueue.length > 0) {
    return dueQueue[0];
  }

  const queue = getReviewQueue();
  return queue.length > 0 ? queue[0] : null;
}

function markWordReviewed(wordKey) {
  if (!wordKey) {
    return null;
  }

  const queue = readQueue();
  const index = queue.findIndex((item) => item.wordKey === wordKey);
  if (index < 0) {
    return null;
  }

  const now = Date.now();
  const current = queue[index];
  const reviewCount = Math.max(0, Number(current.reviewCount) || 0) + 1;
  const nextItem = {
    ...current,
    reviewCount,
    lastReviewedAt: now,
    nextDueAt: computeNextDueAt(reviewCount),
    updatedAt: now
  };
  queue[index] = nextItem;
  writeQueue(queue);
  wx.setStorageSync(REVIEW_DAILY_COUNT_KEY, getDueReviewQueue().length);
  return nextItem;
}

function syncTodayReviewCount() {
  const dueCount = getDueReviewQueue().length;
  wx.setStorageSync(REVIEW_DAILY_COUNT_KEY, dueCount);
  return dueCount;
}

module.exports = {
  addWordToReview,
  getReviewQueue,
  getDueReviewQueue,
  getReviewedTodayQueue,
  getReviewSummary,
  getNextRecommendedWord,
  isWordInReview,
  markWordReviewed,
  syncTodayReviewCount
};
