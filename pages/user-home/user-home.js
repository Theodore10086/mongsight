const { callCommunity, normalizePosts } = require('../../utils/community-cloud.js')

Page({
  data: {
    openId: '',
    profile: null,
    stats: null,
    isFollowing: false,
    posts: [],
    currentPage: 1,
    hasMore: true,
    loaded: false,
    loadingMore: false,
    followLoading: false
  },

  onLoad(options) {
    const openId = (options.openId || '').trim()
    if (!openId) {
      wx.showToast({ title: '缺少用户标识', icon: 'none' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200)
      return
    }
    this.setData({ openId })
    this.loadAll()
  },

  async loadAll() {
    wx.showLoading({ title: '加载中', mask: true })
    try {
      const [userData, postsData] = await Promise.all([
        callCommunity('getUserInfo', { targetOpenId: this.data.openId }),
        callCommunity('getUserPosts', { targetOpenId: this.data.openId, limit: 20, skip: 0 })
      ])

      const normalized = normalizePosts(postsData.posts || [])

      this.setData({
        profile: userData.profile,
        stats: userData.stats,
        isFollowing: !!userData.isFollowing,
        posts: normalized,
        currentPage: 1,
        hasMore: normalized.length >= 20,
        loaded: true
      })

      const name = userData.profile ? (userData.profile.nickName || '用户') : '用户'
      wx.setNavigationBarTitle({ title: `${name}的主页` })
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1500)
    } finally {
      wx.hideLoading()
    }
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh())
  },

  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.setData({ loadingMore: true })
    const nextPage = this.data.currentPage + 1
    const skip = (nextPage - 1) * 20

    try {
      const data = await callCommunity('getUserPosts', { targetOpenId: this.data.openId, limit: 20, skip })
      const newPosts = normalizePosts(data.posts || [])
      this.setData({
        posts: [...this.data.posts, ...newPosts],
        currentPage: nextPage,
        hasMore: newPosts.length >= 20,
        loadingMore: false
      })
    } catch (err) {
      this.setData({ loadingMore: false })
    }
  },

  async onToggleFollow() {
    if (this.data.followLoading) return
    this.setData({ followLoading: true })
    try {
      const data = await callCommunity('toggleFollow', { targetOpenId: this.data.openId })
      const wasFollowing = this.data.isFollowing
      const nextFollowing = !!data.following
      this.setData({ isFollowing: nextFollowing })

      const stats = { ...this.data.stats }
      stats.followersCount = Math.max(0, (stats.followersCount || 0) + (nextFollowing ? 1 : -1))
      this.setData({ stats })

      wx.showToast({ title: nextFollowing ? '已关注' : '已取消关注', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    } finally {
      this.setData({ followLoading: false })
    }
  },

  onGoToPost(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` })
  }
})
