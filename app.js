// app.js
App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV,
        traceUser: true
      })
    }

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 隐私协议弹窗处理（微信 2023-09 起强制要求）
    wx.onNeedPrivacyAuthorization((resolve) => {
      wx.showModal({
        title: '隐私保护提示',
        content:
          '蒙格穿梭需要收集你的头像、昵称用于创建书法档案，收集手写轨迹用于书法识别与评分；班级功能从相册选取您确认的字帖图片用于发布作业。详见《隐私政策》。',
        confirmText: '同意',
        cancelText: '拒绝',
        success: (res) => {
          if (res.confirm) {
            resolve({ event: 'agree' })
          } else {
            resolve({ event: 'disagree' })
          }
        }
      })
    })
  },
  globalData: {
    userInfo: null
  }
})
