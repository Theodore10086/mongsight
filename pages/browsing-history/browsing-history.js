const HISTORY_KEY = 'browsingHistory'

Page({
  data: {
    history: [],
    loaded: false
  },

  onLoad() {
    this.loadHistory()
  },

  onShow() {
    this.loadHistory()
  },

  loadHistory() {
    try {
      let raw = wx.getStorageSync(HISTORY_KEY)
      if (!Array.isArray(raw)) raw = []
      const history = raw.map((item) => ({
        ...item,
        visitedAtStr: this.formatTime(item.visitedAt)
      }))
      this.setData({ history, loaded: true })
    } catch (e) {
      this.setData({ history: [], loaded: true })
    }
  },

  onGoToPost(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` })
  },

  onClearAll() {
    wx.showModal({
      title: '清空历史',
      content: '确定要清空所有浏览记录吗？',
      confirmText: '清空',
      confirmColor: '#ff4b4b',
      success: (res) => {
        if (!res.confirm) return
        wx.removeStorageSync(HISTORY_KEY)
        this.setData({ history: [] })
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 60 * 1000) return '刚刚'
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
    const m = d.getMonth() + 1
    const day = d.getDate()
    return `${m}-${day}`
  }
})
