const {
  getReviewQueue,
  getReviewSummary,
  getNextRecommendedWord,
  markWordReviewed,
  syncTodayReviewCount
} = require('../../utils/review-manager.js');
const {
  getWordByKey,
  getArchiveStarterWords
} = require('../../utils/recognition-catalog.js');
const { storePendingRecognitionPlayback } = require('../../utils/trajectory-utils.js');
const {
  ARCHIVE_DATASET_FACTS,
  ARCHIVE_KNOWLEDGE_CARDS,
  ARCHIVE_SOURCE_ASSETS
} = require('../../utils/archive-knowledge.js');

function formatDateLabel(timestamp) {
  if (!timestamp) {
    return 'Today';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(timestamp);
  const diffDays = Math.round((timestamp - today.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Tomorrow';
  }
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

Page({
  data: {
    filter: 'all',
    reviewList: [],
    displayedList: [],
    dueCount: 0,
    totalCount: 0,
    completedTodayCount: 0,
    recommendedWord: null,
    starterWords: [],
    datasetFacts: ARCHIVE_DATASET_FACTS,
    knowledgeCards: ARCHIVE_KNOWLEDGE_CARDS,
    reviewHeroImage: ARCHIVE_SOURCE_ASSETS.reviewHero,
    graphemeChartImage: ARCHIVE_SOURCE_ASSETS.graphemeChart
  },

  onLoad() {
    this.refreshReviewList();
  },

  onShow() {
    this.refreshReviewList();
  },

  onPullDownRefresh() {
    this.refreshReviewList();
    wx.stopPullDownRefresh();
  },

  refreshReviewList() {
    syncTodayReviewCount();
    const summary = getReviewSummary();
    const now = Date.now();
    const reviewList = getReviewQueue().map((item) => ({
      ...item,
      dueText: formatDateLabel(item.nextDueAt),
      isDue: Number(item.nextDueAt || 0) <= now,
      reviewedToday: this.isReviewedToday(item.lastReviewedAt)
    }));

    const recommendedWord = getNextRecommendedWord();
    const starterWords = this.buildStarterWords(reviewList);
    this.setData({
      reviewList,
      dueCount: summary.dueCount,
      totalCount: summary.total,
      completedTodayCount: summary.completedTodayCount,
      starterWords,
      recommendedWord: recommendedWord
        ? {
            ...recommendedWord,
            dueText: formatDateLabel(recommendedWord.nextDueAt)
          }
        : null
    }, () => this.applyFilter());
  },

  isReviewedToday(timestamp) {
    if (!timestamp) {
      return false;
    }
    const date = new Date(timestamp);
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  },

  buildStarterWords(reviewList = []) {
    const existingKeys = new Set((reviewList || []).map((item) => item.wordKey));
    return getArchiveStarterWords(12).filter((item) => !existingKeys.has(item.wordKey));
  },

  buildPracticePayload(wordKey) {
    const word = getWordByKey(wordKey);
    if (!word) {
      return null;
    }

    return {
      word: {
        wordKey: word.wordKey,
        id: word.id,
        chinese: word.chinese,
        transliteration: word.transliteration,
        mongolian: word.mongolian
      },
      source: 'review'
    };
  },

  applyFilter() {
    const { filter, reviewList } = this.data;
    let displayedList = reviewList;

    if (filter === 'due') {
      displayedList = reviewList.filter((item) => item.isDue);
    } else if (filter === 'done') {
      displayedList = reviewList.filter((item) => item.reviewedToday);
    }

    this.setData({ displayedList });
  },

  onChangeFilter(e) {
    const { filter } = e.currentTarget.dataset;
    this.setData({ filter }, () => this.applyFilter());
  },

  onMarkReviewed(e) {
    const { wordKey } = e.currentTarget.dataset;
    const item = markWordReviewed(wordKey);
    if (!item) {
      wx.showToast({ title: 'Word not found', icon: 'none' });
      return;
    }

    this.refreshReviewList();
    wx.showModal({
      title: 'Review completed',
      content: `You finished one review of ${item.chinese}. Practice writing now while the shape is still fresh.`,
      confirmText: 'Practice',
      cancelText: 'Stay here',
      success: (res) => {
        if (res.confirm) {
          this.goToWritingPractice(item.wordKey);
        }
      }
    });
  },

  onAddStarterWord(e) {
    const { wordKey } = e.currentTarget.dataset;
    const { addWordToReview } = require('../../utils/review-manager.js');
    const word = getWordByKey(wordKey);
    if (!word) {
      wx.showToast({ title: 'Word not found', icon: 'none' });
      return;
    }

    const result = addWordToReview(word);
    syncTodayReviewCount();
    this.refreshReviewList();
    wx.showToast({
      title: result.added ? 'Added to review' : 'Already in review',
      icon: 'none'
    });
  },

  onGoToRecognition() {
    wx.navigateTo({
      url: '/pages/word-recognition/word-recognition'
    });
  },

  onGoToWriting(e) {
    const { wordKey } = e?.currentTarget?.dataset || {};
    this.goToWritingPractice(wordKey || this.data.recommendedWord?.wordKey);
  },

  goToWritingPractice(wordKey) {
    const practicePayload = this.buildPracticePayload(wordKey);
    if (practicePayload) {
      storePendingRecognitionPlayback(practicePayload);
    }
    wx.navigateTo({
      url: '/pages/writing-practice/writing-practice'
    });
  }
});
