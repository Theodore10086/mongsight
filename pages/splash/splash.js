const STORAGE_KEY_ONBOARDING = 'hasCompletedOnboarding'
const STORAGE_KEY_HAS_GUIDED = 'hasGuided'
const STORAGE_KEY_USER_INFO = 'userInfo'

Page({
  data: {
    showSplash: false,
    showGuideChoice: false
  },

  onLoad() {
    if (this.alreadyOnboarded()) {
      this.proceedToHome()
      return
    }
    this.setData({ showSplash: true })
  },

  onShow() {
    if (this.alreadyOnboarded() && this.data.showSplash) {
      this.proceedToHome()
    }
  },

  alreadyOnboarded() {
    return !!(wx.getStorageSync(STORAGE_KEY_ONBOARDING) || wx.getStorageSync(STORAGE_KEY_HAS_GUIDED))
  },

  onAuthTap() {
    this.setData({ showGuideChoice: true })
  },

  onSkipGuide() {
    this.completeAndProceed()
  },

  onStartGuide() {
    this.completeAndProceed()
  },

  completeAndProceed() {
    wx.setStorageSync(STORAGE_KEY_ONBOARDING, true)
    wx.setStorageSync(STORAGE_KEY_HAS_GUIDED, true)
    if (!wx.getStorageSync(STORAGE_KEY_USER_INFO)) {
      const guestInfo = {
        nickName: '墨客',
        nickname: '墨客',
        avatarUrl: '',
        avatar: '🎨',
        level: 1,
        title: '牧羊人',
        inkJades: 0,
        streak: 0,
        isGuest: true,
        authTime: Date.now()
      }
      wx.setStorageSync(STORAGE_KEY_USER_INFO, guestInfo)
      wx.setStorageSync('userProfile', guestInfo)
    }
    this.proceedToHome()
  },

  proceedToHome() {
    wx.reLaunch({
      url: '/pages/home/home'
    })
  }
})
