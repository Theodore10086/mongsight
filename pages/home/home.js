const DAILY_TIPS = [
  '坚持每天练习15分钟，比一次写一小时更有效。',
  '握笔放松，让笔尖自由舞动，结构自然就稳了。',
  '先看准笔顺，再下笔；蒙古文从上到下，一气呵成。',
  '完成今日目标，连击就不会断哦~',
  '把不熟的字加入收藏，每天复习更高效。',
  '蒙宝AI 评分能帮你看清结构、流畅、笔韵的薄弱点。'
]

const DEFAULT_DAILY_GOAL_XP = 50
const DEFAULT_WRITING_TOTAL = 12
const DEFAULT_RECOGNITION_TOTAL = 36

Page({
  data: {
    streakDays: 0,
    todayXp: 0,
    dailyGoalXp: DEFAULT_DAILY_GOAL_XP,
    goalPercent: 0,
    goalSubtitle: '坚持就是胜利，加油！',
    totalXp: 0,
    inkJades: 0,

    todayReviewWords: 0,
    recognitionTotal: DEFAULT_RECOGNITION_TOTAL,
    myWorksCount: 0,

    writingProgress: { completed: 0, total: DEFAULT_WRITING_TOTAL },

    dailyTip: DAILY_TIPS[0]
  },

  onLoad() {
    this.refreshOverview()
  },

  onShow() {
    this.refreshOverview()
  },

  onPullDownRefresh() {
    this.refreshOverview()
    wx.stopPullDownRefresh()
  },

  refreshOverview() {
    const profile = wx.getStorageSync('userProfile') || wx.getStorageSync('userInfo') || {}

    const storedReview = Number(wx.getStorageSync('todayReviewWords'))
    const fallbackReview = Math.max(0, 6 - Number(profile.level || 1))
    const todayReviewWords = Number.isFinite(storedReview) && storedReview >= 0
      ? storedReview
      : fallbackReview

    const todayXp = this.readNumber('todayXp', 0)
    const dailyGoalXp = this.readNumber('dailyGoalXp', DEFAULT_DAILY_GOAL_XP)
    const totalXp = this.readNumber('totalXp', Math.max(Number(profile.xp || 0), 0))
    const myWorks = wx.getStorageSync('myWorks') || []
    const writingCompleted = this.readNumber('writingCompleted', 0)

    const safeGoal = dailyGoalXp > 0 ? dailyGoalXp : DEFAULT_DAILY_GOAL_XP
    const goalPercent = Math.min(100, Math.round((todayXp / safeGoal) * 100))

    this.setData({
      streakDays: Number(profile.streak || 0),
      todayXp,
      dailyGoalXp: safeGoal,
      goalPercent,
      goalSubtitle: this.computeGoalSubtitle(goalPercent),
      totalXp,
      inkJades: Number(profile.inkJades || 0),

      todayReviewWords,
      recognitionTotal: this.readNumber('recognitionTotal', DEFAULT_RECOGNITION_TOTAL),
      myWorksCount: Array.isArray(myWorks) ? myWorks.length : 0,

      writingProgress: {
        completed: writingCompleted,
        total: this.readNumber('writingTotal', DEFAULT_WRITING_TOTAL)
      },

      dailyTip: this.pickDailyTip()
    })
  },

  readNumber(key, fallback) {
    const raw = Number(wx.getStorageSync(key))
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback
  },

  computeGoalSubtitle(percent) {
    if (percent >= 100) return '太棒了！今日目标已达成 🎉'
    if (percent >= 60) return '只差一点点，再练一笔！'
    if (percent >= 30) return '继续加油，保持节奏~'
    return '今日还没动笔，开练吧！'
  },

  pickDailyTip() {
    const dayKey = new Date().getDate()
    return DAILY_TIPS[dayKey % DAILY_TIPS.length]
  },

  onTapDailyGoal() {
    wx.showToast({
      title: this.data.goalPercent >= 100 ? '今日目标已完成 🎉' : '完成书写练习获取 XP',
      icon: 'none'
    })
  },

  onGoToWriting() {
    wx.navigateTo({ url: '/pages/writing-practice/writing-practice' })
  },

  onGoToRecognition() {
    wx.navigateTo({ url: '/pages/word-recognition/word-recognition' })
  },

  onGoToMengbao() {
    wx.showToast({ title: '蒙宝AI 即将上线', icon: 'none' })
  },

  onGoToChallenge() {
    wx.showToast({ title: '前往每日试炼', icon: 'none' })
  },

  onGoToWorks() {
    wx.switchTab({
      url: '/pages/profile/profile',
      fail: () => {
        wx.showToast({ title: '我的作品在「我」中查看', icon: 'none' })
      }
    })
  }
})
