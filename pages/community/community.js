// const PAGE_SIZE = 20
//
// Page({
//   data: {
//     communityPosts: [],
//     isLoadingPosts: false,
//     hasMorePosts: true,
//     currentPage: 1,
//
//     // 评论
//     showCommentModal: false,
//     currentPostId: '',
//     currentComments: [],
//     commentText: '',
//
//     // 发帖
//     showPostModal: false,
//     postContent: '',
//     postImages: [],
//
//     userProfile: {}
//   },
//
//   onLoad() {
//     this.refreshUserProfile()
//     this.loadFirstPage()
//   },
//
//   onShow() {
//     this.refreshUserProfile()
//   },
//
//   refreshUserProfile() {
//     const userProfile = wx.getStorageSync('userProfile') || wx.getStorageSync('userInfo') || {}
//     this.setData({ userProfile })
//   },
//
//   /* ──────────────── Cloud Function 封装 ──────────────── */
//   async callCommunityFunction(action, payload = {}) {
//     const response = await wx.cloud.callFunction({
//       name: 'community',
//       data: { action, ...payload }
//     })
//     const result = response?.result || {}
//     if (!result.success) {
//       throw new Error(result.message || `community.${action} failed`)
//     }
//     return result.data || {}
//   },
//
//   /* ──────────────── 帖子列表 ──────────────── */
//   async loadFirstPage() {
//     this.setData({ isLoadingPosts: true })
//     try {
//       const data = await this.callCommunityFunction('list', {
//         limit: PAGE_SIZE,
//         skip: 0
//       })
//       const posts = this.normalizePosts(data.posts || [])
//       this.setData({
//         communityPosts: posts,
//         currentPage: 1,
//         hasMorePosts: posts.length >= PAGE_SIZE,
//         isLoadingPosts: false
//       })
//     } catch (error) {
//       console.error('[community] list failed', error)
//       this.setData({ isLoadingPosts: false })
//     }
//   },
//
//   async onPullDownRefresh() {
//     try {
//       const data = await this.callCommunityFunction('list', {
//         limit: PAGE_SIZE,
//         skip: 0
//       })
//       const posts = this.normalizePosts(data.posts || [])
//       this.setData({
//         communityPosts: posts,
//         currentPage: 1,
//         hasMorePosts: posts.length >= PAGE_SIZE
//       })
//     } catch (error) {
//       console.error('[community] refresh failed', error)
//     } finally {
//       wx.stopPullDownRefresh()
//     }
//   },
//
//   async onReachBottom() {
//     if (this.data.isLoadingPosts || !this.data.hasMorePosts) return
//     this.setData({ isLoadingPosts: true })
//     const nextPage = this.data.currentPage + 1
//     const skip = (nextPage - 1) * PAGE_SIZE
//
//     try {
//       const data = await this.callCommunityFunction('list', {
//         limit: PAGE_SIZE,
//         skip
//       })
//       const newPosts = this.normalizePosts(data.posts || [])
//       this.setData({
//         communityPosts: [...this.data.communityPosts, ...newPosts],
//         currentPage: nextPage,
//         hasMorePosts: newPosts.length >= PAGE_SIZE,
//         isLoadingPosts: false
//       })
//     } catch (error) {
//       console.error('[community] load more failed', error)
//       this.setData({ isLoadingPosts: false })
//     }
//   },
//
//   normalizePosts(posts) {
//     return posts.map((post) => {
//       const id = post.id || post._id
//       const avatar = post.avatarUrl || post.avatar || ''
//       const avatarIsImage = typeof avatar === 'string' && /^(https?:|wxfile:|cloud:|\/)/i.test(avatar)
//       return {
//         ...post,
//         id,
//         avatarText: avatarIsImage ? '' : avatar,
//         avatarIsImage,
//         avatarUrl: avatarIsImage ? avatar : '',
//         likes: Number(post.likes || 0),
//         comments: Number(post.comments || 0),
//         liked: !!post.liked,
//         isFavorited: !!post.isFavorited,
//         commentsList: (post.commentsList || []).slice(0, 2)
//       }
//     })
//   },
//
//   /* ──────────────── 点赞 ──────────────── */
//   async onLikePost(e) {
//     const { id } = e.currentTarget.dataset
//     const target = this.data.communityPosts.find((p) => p.id === id)
//     if (!target || !target._id) return
//
//     try {
//       const data = await this.callCommunityFunction('toggleLike', { postId: target._id })
//       const liked = !!data.liked
//       const likes = Number(data.likes || 0)
//       const posts = this.data.communityPosts.map((p) =>
//         p.id === id ? { ...p, liked, likes } : p
//       )
//       this.setData({ communityPosts: posts })
//       wx.vibrateShort({ type: 'light' })
//     } catch (error) {
//       console.error('[community] toggleLike failed', error)
//     }
//   },
//
//   /* ──────────────── 收藏 ──────────────── */
//   async onToggleFavorite(e) {
//     const { id } = e.currentTarget.dataset
//     const target = this.data.communityPosts.find((p) => p.id === id)
//     if (!target || !target._id) return
//
//     try {
//       const data = await this.callCommunityFunction('toggleFavorite', { postId: target._id })
//       const isFavorited = !!data.isFavorited
//       const posts = this.data.communityPosts.map((p) =>
//         p.id === id ? { ...p, isFavorited } : p
//       )
//       this.setData({ communityPosts: posts })
//       wx.showToast({
//         title: isFavorited ? '已收藏' : '已取消收藏',
//         icon: 'none'
//       })
//     } catch (error) {
//       console.error('[community] toggleFavorite failed', error)
//     }
//   },
//
//   /* ──────────────── 评论 ──────────────── */
//   onOpenComment(e) {
//     const { id } = e.currentTarget.dataset
//     const target = this.data.communityPosts.find((p) => p.id === id)
//     this.setData({
//       showCommentModal: true,
//       currentPostId: id,
//       currentComments: target?.commentsList || [],
//       commentText: ''
//     })
//   },
//
//   onCloseCommentModal() {
//     this.setData({ showCommentModal: false, commentText: '' })
//   },
//
//   onCommentInput(e) {
//     this.setData({ commentText: e.detail.value })
//   },
//
//   async onSendComment() {
//     const text = this.data.commentText.trim()
//     if (!text) {
//       wx.showToast({ title: '请输入评论内容', icon: 'none' })
//       return
//     }
//     const target = this.data.communityPosts.find((p) => p.id === this.data.currentPostId)
//     if (!target || !target._id) {
//       wx.showToast({ title: '该帖子还未接入云端', icon: 'none' })
//       return
//     }
//
//     try {
//       const data = await this.callCommunityFunction('addComment', {
//         postId: target._id,
//         content: text,
//         ...this.getCommunityProfile()
//       })
//       const savedComment = data.comment || {
//         id: Date.now().toString(),
//         nickname: this.getCommunityProfile().nickname,
//         content: text
//       }
//       const posts = this.data.communityPosts.map((p) => {
//         if (p.id !== this.data.currentPostId) return p
//         return {
//           ...p,
//           comments: (p.comments || 0) + 1,
//           commentsList: [...(p.commentsList || []), savedComment].slice(-2)
//         }
//       })
//       this.setData({
//         communityPosts: posts,
//         currentComments: [...this.data.currentComments, savedComment],
//         commentText: ''
//       })
//       wx.vibrateShort({ type: 'light' })
//     } catch (error) {
//       console.error('[community] addComment failed', error)
//       wx.showToast({ title: '评论失败', icon: 'none' })
//     }
//   },
//
//   /* ──────────────── 发帖 ──────────────── */
//   onOpenPostModal() {
//     this.setData({ showPostModal: true, postContent: '', postImages: [] })
//   },
//
//   onClosePostModal() {
//     this.setData({ showPostModal: false })
//   },
//
//   onPostContentInput(e) {
//     this.setData({ postContent: e.detail.value })
//   },
//
//   onAddPostImage() {
//     const remaining = 9 - this.data.postImages.length
//     if (remaining <= 0) return
//     wx.chooseImage({
//       count: remaining,
//       sizeType: ['compressed'],
//       sourceType: ['album', 'camera'],
//       success: (res) => {
//         this.setData({
//           postImages: [...this.data.postImages, ...res.tempFilePaths]
//         })
//       }
//     })
//   },
//
//   onRemovePostImage(e) {
//     const { index } = e.currentTarget.dataset
//     const imgs = [...this.data.postImages]
//     imgs.splice(Number(index), 1)
//     this.setData({ postImages: imgs })
//   },
//
//   async onSubmitPost() {
//     if (!this.data.postContent.trim() && this.data.postImages.length === 0) {
//       wx.showToast({ title: '请输入内容或添加图片', icon: 'none' })
//       return
//     }
//
//     wx.showLoading({ title: '发布中...', mask: true })
//     try {
//       const imageFileIDs = []
//       for (let i = 0; i < this.data.postImages.length; i += 1) {
//         const tempPath = this.data.postImages[i]
//         const ext = tempPath.split('.').pop() || 'jpg'
//         const cloudPath = `posts/${Date.now()}_${i}.${ext}`
//         const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath })
//         imageFileIDs.push(uploadRes.fileID)
//       }
//
//       const data = await this.callCommunityFunction('createPost', {
//         content: this.data.postContent,
//         imageFileIDs,
//         ...this.getCommunityProfile()
//       })
//
//       const newPost = data.post ? this.normalizePosts([data.post])[0] : null
//       this.setData({
//         communityPosts: newPost
//           ? [newPost, ...this.data.communityPosts]
//           : this.data.communityPosts,
//         showPostModal: false,
//         postContent: '',
//         postImages: []
//       })
//       wx.showToast({ title: '发布成功', icon: 'success' })
//     } catch (error) {
//       console.error('[community] createPost failed', error)
//       wx.showToast({ title: '发布失败', icon: 'none' })
//     } finally {
//       wx.hideLoading()
//     }
//   },
//
//   /* ──────────────── 图片预览 ──────────────── */
//   onPreviewImage(e) {
//     const { src, list } = e.currentTarget.dataset
//     if (!src) return
//     wx.previewImage({
//       current: src,
//       urls: Array.isArray(list) && list.length ? list : [src]
//     })
//   },
//
//   /* ──────────────── 公共 ──────────────── */
//   getCommunityProfile() {
//     const profile = this.data.userProfile || {}
//     return {
//       avatar: profile.avatarUrl || profile.avatar || '🙂',
//       avatarUrl: profile.avatarUrl || '',
//       nickname: profile.nickName || profile.nickname || '游客'
//     }
//   }
// })