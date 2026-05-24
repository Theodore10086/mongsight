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

    callCommunity('getPostsLikedByMe', { limit: PAGE_SIZE, skip })
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
      const data = await callCommunity('getPostsLikedByMe', { limit: PAGE_SIZE, skip: 0 })
      const posts = normalizePosts(data.posts || [])
      this.setData({ posts, currentPage: 1, hasMore: posts.length >= PAGE_SIZE, loaded: true })
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

  async onUnlike(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    const post = this.data.posts.find((p) => p._id === id)
    if (!post) return
    try {
      await callCommunity('toggleLike', { postId: post._id })
      const posts = this.data.posts.filter((p) => p._id !== id)
      this.setData({ posts })
      wx.showToast({ title: '已取消点赞', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }
})
