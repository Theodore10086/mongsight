const { getReviewSummary, getReviewQueue, syncTodayReviewCount } = require('../../utils/review-manager.js');
const { LEARNABLE_WORDS } = require('../../utils/recognition-catalog.js');

Page({
  data: {
    catalogTotal: 0,
    inReview: 0,
    dueToday: 0,
    completedToday: 0,
    streakDays: 0,
    totalXp: 0,
    masteryNew: 0,
    masteryLearning: 0,
    masteryProficient: 0,
    masteryMastered: 0,
    reviewQueuePreview: []
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    syncTodayReviewCount();
    const summary = getReviewSummary();
    const queue = getReviewQueue();
    const profile = wx.getStorageSync('userProfile') || wx.getStorageSync('userInfo') || {};

    let masteryNew = 0, masteryLearning = 0, masteryProficient = 0, masteryMastered = 0;
    queue.forEach(function (item) {
      const rc = Number(item.reviewCount || 0);
      if (rc === 0) masteryNew++;
      else if (rc <= 2) masteryLearning++;
      else if (rc <= 5) masteryProficient++;
      else masteryMastered++;
    });

    this.setData({
      catalogTotal: LEARNABLE_WORDS.length,
      inReview: summary.total,
      dueToday: summary.dueCount,
      completedToday: summary.completedTodayCount,
      streakDays: Number(profile.streak || 0),
      totalXp: Number(profile.xp || 0),
      masteryNew,
      masteryLearning,
      masteryProficient,
      masteryMastered,
      reviewQueuePreview: queue.slice(0, 5)
    });
  },

  onGoToReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  }
});
