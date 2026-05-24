const { callCommunity, normalizePosts } = require('../../utils/community-cloud.js')

const PAGE_SIZE = 20

Page({
  data: {
    posts: [],
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

    callCommunity('getMyPosts', { limit: PAGE_SIZE, skip })
      .then((data) => {
        const newPosts = normalizePosts(data.posts || [])
        this.setData({
          posts: [...this.data.posts, ...newPosts],
          currentPage: nextPage,
          hasMore: newPosts.length >= PAGE_SIZE,
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
      const data = await callCommunity('getMyPosts', { limit: PAGE_SIZE, skip: 0 })
      const posts = normalizePosts(data.posts || [])
      this.setData({
        posts,
        currentPage: 1,
        hasMore: posts.length >= PAGE_SIZE,
        loaded: true
      })
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onGoToPost(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` })
  },

  onDeletePost(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    const post = this.data.posts.find((p) => p._id === id)
    if (!post) return

    wx.showModal({
      title: '删除帖子',
      content: '确定要删除这条帖子吗？',
      confirmText: '删除',
      confirmColor: '#ff4b4b',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await callCommunity('deletePost', { postId: post._id })
          const posts = this.data.posts.filter((p) => p._id !== id)
          this.setData({ posts })
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      }
    })
  }
})
