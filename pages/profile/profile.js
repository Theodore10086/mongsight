const AVATAR_OPTIONS = ['🎨', '🐑', '🦌', '🌾', '🪕', '🏹', '🦊', '🐎', '🌅', '✒️']

const STORAGE_KEYS = {
  PROFILE: 'userProfile',
  USER_INFO: 'userInfo',
  CHECKIN_DATE: 'lastCheckinDate',
  WORKS: 'myWorks'
}

Page({
  data: {
    userProfile: {},
    avatarIsImage: false,

    avatarOptions: AVATAR_OPTIONS,
    selectedAvatar: '',
    selectedAvatarIsImage: false,

    tempNickname: '',

    myWorksCount: 0,
    myPostCount: 0,
    myLikesCount: 0,

    hasCheckedIn: false,

    // 弹窗
    showEditAvatar: false,
    showEditNickname: false,
    showSettingsModal: false
  },

  onLoad() {
    this.refreshAll()
  },

  onShow() {
    this.refreshAll()
  },

  onPullDownRefresh() {
    this.refreshAll()
    wx.stopPullDownRefresh()
  },

  /* ──────────────── 数据载入 ──────────────── */
  refreshAll() {
    this.loadUserProfile()
    this.loadLocalCounters()
    this.refreshCheckinState()
    this.loadCloudCounters()
  },

  loadUserProfile() {
    const userProfile =
      wx.getStorageSync(STORAGE_KEYS.PROFILE) ||
      wx.getStorageSync(STORAGE_KEYS.USER_INFO) ||
      {}
    const avatarIsImage = this.isImageUrl(userProfile.avatarUrl)
    this.setData({ userProfile, avatarIsImage })
  },

  loadLocalCounters() {
    const works = wx.getStorageSync(STORAGE_KEYS.WORKS) || []
    this.setData({
      myWorksCount: Array.isArray(works) ? works.length : 0
    })
  },

  refreshCheckinState() {
    const today = new Date().toDateString()
    const last = wx.getStorageSync(STORAGE_KEYS.CHECKIN_DATE)
    this.setData({ hasCheckedIn: last === today })
  },

  async loadCloudCounters() {
    try {
      const profile = this.data.userProfile
      if (!profile || profile.isGuest) return

      const data = await this.callCommunityFunction('getProfile', {})
      const cloudProfile = data.profile
      if (!cloudProfile) return

      const merged = {
        ...profile,
        avatarUrl: cloudProfile.avatarUrl || profile.avatarUrl,
        nickName: cloudProfile.nickName || cloudProfile.nickname || profile.nickName,
        nickname: cloudProfile.nickname || cloudProfile.nickName || profile.nickname,
        followers: Number(cloudProfile.followers || profile.followers || 0),
        following: Number(cloudProfile.following || profile.following || 0)
      }
      this.persistProfile(merged)

      // 帖子/点赞计数（容错处理）
      try {
        const postsData = await this.callCommunityFunction('getMyPosts', { limit: 1, skip: 0 })
        if (typeof postsData.total === 'number') {
          this.setData({ myPostCount: postsData.total })
        } else if (Array.isArray(postsData.posts)) {
          this.setData({ myPostCount: postsData.posts.length })
        }
      } catch (e) { /* ignore */ }

      try {
        const likesData = await this.callCommunityFunction('getPostsLikedByMe', { limit: 1, skip: 0 })
        if (typeof likesData.total === 'number') {
          this.setData({ myLikesCount: likesData.total })
        } else if (Array.isArray(likesData.posts)) {
          this.setData({ myLikesCount: likesData.posts.length })
        }
      } catch (e) { /* ignore */ }
    } catch (error) {
      console.warn('[profile] loadCloudCounters skipped', error?.message || error)
    }
  },

  async callCommunityFunction(action, payload = {}) {
    const response = await wx.cloud.callFunction({
      name: 'community',
      data: { action, ...payload }
    })
    const result = response?.result || {}
    if (!result.success) throw new Error(result.message || `community.${action} failed`)
    return result.data || {}
  },

  /* ──────────────── 编辑头像 ──────────────── */
  onEditAvatar() {
    const currentAvatar = this.data.userProfile.avatarUrl || this.data.userProfile.avatar || ''
    this.setData({
      showEditAvatar: true,
      selectedAvatar: currentAvatar,
      selectedAvatarIsImage: this.isImageUrl(currentAvatar)
    })
  },

  onCloseEditAvatar() {
    this.setData({ showEditAvatar: false })
  },

  onSelectAvatar(e) {
    const { avatar } = e.currentTarget.dataset
    this.setData({
      selectedAvatar: avatar,
      selectedAvatarIsImage: false
    })
  },

  onUploadAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFilePaths[0]
        this.setData({
          selectedAvatar: tempPath,
          selectedAvatarIsImage: true
        })
      }
    })
  },

  async onConfirmAvatar() {
    const next = this.data.selectedAvatar
    if (!next) {
      wx.showToast({ title: '请选择一个头像', icon: 'none' })
      return
    }

    let avatarUrl = next
    if (this.data.selectedAvatarIsImage && /^wxfile:|^http:|file:/.test(next) === false) {
      // tempfile path → upload to cloud
      try {
        const cloudPath = `avatars/${Date.now()}.${(next.split('.').pop() || 'png')}`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: next })
        avatarUrl = uploadRes.fileID
      } catch (err) {
        console.warn('[profile] upload avatar failed, fallback to local path', err)
      }
    }

    const newProfile = {
      ...this.data.userProfile,
      avatarUrl: this.isImageUrl(avatarUrl) ? avatarUrl : '',
      avatar: this.isImageUrl(avatarUrl) ? this.data.userProfile.avatar : avatarUrl
    }
    this.persistProfile(newProfile)
    this.setData({
      showEditAvatar: false,
      avatarIsImage: this.isImageUrl(newProfile.avatarUrl)
    })
    this.saveProfileToCloud(newProfile)
    wx.showToast({ title: '头像已更新', icon: 'success' })
  },

  /* ──────────────── 编辑昵称 ──────────────── */
  onEditNickname() {
    this.setData({
      showEditNickname: true,
      tempNickname: this.data.userProfile.nickName || this.data.userProfile.nickname || ''
    })
  },

  onCloseEditNickname() {
    this.setData({ showEditNickname: false })
  },

  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value })
  },

  onConfirmNickname() {
    const next = (this.data.tempNickname || '').trim()
    if (!next) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    const newProfile = {
      ...this.data.userProfile,
      nickName: next,
      nickname: next
    }
    this.persistProfile(newProfile)
    this.setData({ showEditNickname: false })
    this.saveProfileToCloud(newProfile)
    wx.showToast({ title: '昵称已更新', icon: 'success' })
  },

  /* ──────────────── 签到 ──────────────── */
  onDailyCheckin() {
    if (this.data.hasCheckedIn) {
      wx.showToast({ title: '今日已签到', icon: 'none' })
      return
    }
    const today = new Date().toDateString()
    wx.setStorageSync(STORAGE_KEYS.CHECKIN_DATE, today)

    const profile = this.data.userProfile || {}
    const newProfile = {
      ...profile,
      streak: Number(profile.streak || 0) + 1,
      inkJades: Number(profile.inkJades || 0) + 5
    }
    this.persistProfile(newProfile)
    this.setData({ hasCheckedIn: true })
    wx.showToast({ title: '签到成功 +5 墨玉', icon: 'success' })
    wx.vibrateShort({ type: 'light' })
  },

  /* ──────────────── 菜单跳转（部分功能尚未实现 → toast） ──────────────── */
  onGoToMyWorks() {
    wx.showToast({ title: '我的作品 即将上线', icon: 'none' })
  },
  onGoToMyPosts() {
    wx.showToast({ title: '我的帖子 即将上线', icon: 'none' })
  },
  onGoToMyLikes() {
    wx.showToast({ title: '我的点赞 即将上线', icon: 'none' })
  },
  onGoToMyCollections() {
    wx.showToast({ title: '我的收藏 即将上线', icon: 'none' })
  },
  onGoToFollows() {
    wx.showToast({ title: '我的关注 即将上线', icon: 'none' })
  },
  onGoToFollowers() {
    wx.showToast({ title: '我的粉丝 即将上线', icon: 'none' })
  },
  onGoToAchievements() {
    wx.showToast({ title: '成就中心 即将上线', icon: 'none' })
  },

  /* ──────────────── 设置 ──────────────── */
  onGoToSettings() {
    this.setData({ showSettingsModal: true })
  },

  onCloseSettingsModal() {
    this.setData({ showSettingsModal: false })
  },

  /* ──────────────── 工具方法 ──────────────── */
  persistProfile(profile) {
    this.setData({ userProfile: profile })
    wx.setStorageSync(STORAGE_KEYS.PROFILE, profile)
    wx.setStorageSync(STORAGE_KEYS.USER_INFO, profile)
  },

  async saveProfileToCloud(profile) {
    try {
      if (!profile || profile.isGuest) return
      await this.callCommunityFunction('updateProfile', {
        avatarUrl: profile.avatarUrl || '',
        nickName: profile.nickName || profile.nickname || '墨客'
      })
    } catch (error) {
      console.warn('[profile] saveProfileToCloud skipped', error?.message || error)
    }
  },

  isImageUrl(value) {
    return typeof value === 'string' && /^(https?:|wxfile:|cloud:|\/)/i.test(value)
  }
})
