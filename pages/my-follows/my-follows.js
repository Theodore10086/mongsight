const { callCommunity } = require('../../utils/community-cloud.js')

const PAGE_SIZE = 20

Page({
  data: {
    users: [],
    currentPage: 1,
    hasMore: true,
    loaded: false,
    loadingMore: false
  },

  onLoad() {
    this.loadFirst()
  },

  onPullDownRefresh() {
    this.loadFirst().finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.setData({ loadingMore: true })
    const nextPage = this.data.currentPage + 1
    const skip = (nextPage - 1) * PAGE_SIZE

    callCommunity('getMyFollows', { limit: PAGE_SIZE, skip })
      .then((data) => {
        const users = (data.follows || []).map((f) => ({
          openId: f.targetOpenId,
          nickName: f.targetNickname || '用户',
          avatar: f.targetAvatar || ''
        }))
        this.setData({
          users: [...this.data.users, ...users],
          currentPage: nextPage,
          hasMore: users.length >= PAGE_SIZE,
          loadingMore: false
        })
      })
      .catch((err) => {
        this.setData({ loadingMore: false })
        wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      })
  },

  async loadFirst() {
    wx.showLoading({ title: '加载中', mask: true })
    try {
      const data = await callCommunity('getMyFollows', { limit: PAGE_SIZE, skip: 0 })
      const users = (data.follows || []).map((f) => ({
        openId: f.targetOpenId,
        nickName: f.targetNickname || '用户',
        avatar: f.targetAvatar || ''
      }))
      this.setData({ users, currentPage: 1, hasMore: users.length >= PAGE_SIZE, loaded: true })
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onGoToUser(e) {
    const openId = e.currentTarget.dataset.openid
    if (!openId) return
    wx.navigateTo({ url: `/pages/user-home/user-home?openId=${encodeURIComponent(openId)}` })
  },

  async onUnfollow(e) {
    const { openid } = e.currentTarget.dataset
    if (!openid) return
    wx.showModal({
      title: '取消关注',
      content: '确定要取消关注吗？',
      confirmText: '确定',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await callCommunity('toggleFollow', { targetOpenId: openid })
          const users = this.data.users.filter((u) => u.openId !== openid)
          this.setData({ users })
          wx.showToast({ title: '已取消关注', icon: 'none' })
        } catch (err) {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' })
        }
      }
    })
  }
})
