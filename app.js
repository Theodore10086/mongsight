const CLASS_MIGRATION_KEY = 'classCloudMigration_v1'

/**
 * 一次性清理 v1 之前本地班级缓存（账号化改造后所有班级数据走云端）
 */
function migrateClearLegacyClassStorage() {
  try {
    if (wx.getStorageSync(CLASS_MIGRATION_KEY)) {
      return
    }
    const info = wx.getStorageInfoSync()
    const keys = info.keys || []
    keys.forEach((k) => {
      if (
        k === 'classTeacherName' ||
        k === 'classStudentSession' ||
        k === 'teacherClassList' ||
        k.indexOf('teacherClassList__') === 0 ||
        k.indexOf('class_students_') === 0 ||
        k.indexOf('class_assignments_') === 0 ||
        k.indexOf('assignment_submissions_') === 0 ||
        k.indexOf('assignment_progress_') === 0 ||
        k.indexOf('assignment_reviews_') === 0
      ) {
        try {
          wx.removeStorageSync(k)
        } catch (e2) {}
      }
    })
    wx.setStorageSync(CLASS_MIGRATION_KEY, '1')
  } catch (e) {
    console.warn('[migration] clear legacy class storage', e)
  }
}

App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV,
        traceUser: true
      })
    }

    migrateClearLegacyClassStorage()

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 隐私协议弹窗处理（微信 2023-09 起强制要求）
    wx.onNeedPrivacyAuthorization((resolve) => {
      wx.showModal({
        title: '隐私保护提示',
        content:
          '蒙格穿梭仅在你主动填写头像、昵称后将其用于建立书法档案；手写轨迹用于书法识别与评分；班级功能会将姓名、学号、班级密码、作业图片上传到腾讯云数据库与云存储，仅供你所在班级的教师查看。详见《隐私政策》。',
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
    userInfo: null,
    classRole: '',
    classTeacher: null,
    classStudent: null
  }
})
