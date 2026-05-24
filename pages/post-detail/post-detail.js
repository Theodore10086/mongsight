const { callCommunity, normalizePosts } = require('../../utils/community-cloud.js')

const HISTORY_KEY = 'browsingHistory'
const MAX_HISTORY = 50

Page({
  data: {
    postId: '',
    post: null,
    loaded: false,
    commentText: '',
    submitting: false,

    userProfile: {}
  },

  onLoad(options) {
    const id = (options.id || '').trim()
    if (!id) {
      wx.showToast({ title: '缺少帖子 id', icon: 'none' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200)
      return
    }
    this.setData({ postId: id })
    this.refreshUserProfile()
    this.loadPost()
  },

  refreshUserProfile() {
    const p = wx.getStorageSync('userProfile') || wx.getStorageSync('userInfo') || {}
    this.setData({ userProfile: p })
  },

  async loadPost() {
    wx.showLoading({ title: '加载中', mask: true })
    try {
      const data = await callCommunity('getPost', { postId: this.data.postId })
      const posts = normalizePosts([data.post])
      const post = posts[0]
      this.setData({ post, loaded: true })
      wx.setNavigationBarTitle({ title: post.nickname ? `${post.nickname}的帖子` : '帖子详情' })
      this.recordHistory(post)
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1500)
    } finally {
      wx.hideLoading()
    }
  },

  recordHistory(post) {
    try {
      let history = wx.getStorageSync(HISTORY_KEY) || []
      if (!Array.isArray(history)) history = []

      history = history.filter((h) => h._id !== post._id && h.id !== post.id)
      history.unshift({
        _id: post._id || post.id,
        id: post.id || post._id,
        nickname: post.nickname || '游客',
        content: (post.content || '').slice(0, 100),
        create_time_str: post.create_time_str || '',
        visitedAt: Date.now()
      })
      if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY)
      wx.setStorageSync(HISTORY_KEY, history)
    } catch (e) {
      // silent
    }
  },

  async onLike() {
    const post = this.data.post
    if (!post || !post._id) return
    try {
      const data = await callCommunity('toggleLike', { postId: post._id })
      this.setData({
        post: { ...post, liked: !!data.liked, likes: Number(data.likes || 0) }
      })
      wx.vibrateShort({ type: 'light' })
    } catch (err) {
      console.warn('[post-detail] like failed', err)
    }
  },

  async onFavorite() {
    const post = this.data.post
    if (!post || !post._id) return
    try {
      const data = await callCommunity('toggleFavorite', { postId: post._id })
      this.setData({
        post: { ...post, isFavorited: !!data.isFavorited }
      })
      wx.showToast({ title: data.isFavorited ? '已收藏' : '已取消收藏', icon: 'none' })
    } catch (err) {
      console.warn('[post-detail] favorite failed', err)
    }
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  async onSendComment() {
    const text = (this.data.commentText || '').trim()
    if (!text) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' })
      return
    }
    const post = this.data.post
    if (!post || !post._id || this.data.submitting) return

    const profile = this.data.userProfile || {}
    this.setData({ submitting: true })
    try {
      const data = await callCommunity('addComment', {
        postId: post._id,
        content: text,
        avatar: profile.avatarUrl || profile.avatar || '🙂',
        nickname: profile.nickName || profile.nickname || '游客'
      })
      const newComment = data.comment || {
        id: Date.now().toString(),
        nickname: profile.nickName || profile.nickname || '游客',
        content: text,
        create_time_str: '刚刚'
      }
      const commentsList = [...(post.commentsList || []), newComment]
      this.setData({
        post: { ...post, commentsList, comments: (post.comments || 0) + 1 },
        commentText: ''
      })
      wx.vibrateShort({ type: 'light' })
    } catch (err) {
      wx.showToast({ title: '评论失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onPreviewImage(e) {
    const { src, list } = e.currentTarget.dataset
    if (!src) return
    wx.previewImage({
      current: src,
      urls: Array.isArray(list) && list.length ? list : [src]
    })
  },

  onGoToUser(e) {
    const openId = e.currentTarget.dataset.openid
    if (!openId) return
    wx.navigateTo({ url: `/pages/user-home/user-home?openId=${encodeURIComponent(openId)}` })
  }
})
