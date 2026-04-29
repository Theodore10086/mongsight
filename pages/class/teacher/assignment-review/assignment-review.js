const { getClassPageLayout } = require('../../../../utils/classLayout.js')
const {
  readAssignmentsForClass,
  studentStorageKeyForClass,
  readSubmissions,
  readProgress
} = require('../teacher-scope.js')

/** 教师批改决定的存储 key（与学生提交记录分开存） */
function reviewStorageKey(assignmentId) {
  return `assignment_reviews_${assignmentId || 'unknown'}`
}

function readReviews(assignmentId) {
  try {
    const raw = wx.getStorageSync(reviewStorageKey(assignmentId))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch (e) {
    return {}
  }
}

function saveReviews(assignmentId, reviews) {
  try {
    wx.setStorageSync(reviewStorageKey(assignmentId), reviews)
  } catch (e) {
    console.warn('[review] saveReviews', e)
  }
}

const STATUS_LABEL = {
  pending: '待批改',
  passed: '已通过',
  rejected: '已驳回',
  unsubmitted: '未提交'
}

Page({
  data: {
    layoutClass: '',
    assignmentTitle: '',
    submittedCount: 0,
    totalCount: 0,
    pendingCount: 0,
    passedCount: 0,
    submissionList: [],
    statusLabel: STATUS_LABEL
  },

  _assignmentId: '',
  _classId: '',
  _reviews: {},

  onLoad(options) {
    this.setData(getClassPageLayout())
    const assignmentId = (options.assignmentId || '').trim()
    const classId = (options.classId || '').trim()
    this._assignmentId = assignmentId
    this._classId = classId

    // 读取作业信息
    let assignmentTitle = '作业批改'
    if (classId && assignmentId) {
      const assignments = readAssignmentsForClass(classId)
      const assignment = assignments.find((a) => a && a.id === assignmentId)
      if (assignment) {
        assignmentTitle = assignment.title || '作业批改'
      }
    }
    wx.setNavigationBarTitle({ title: assignmentTitle })

    // 读取班级学生列表
    let students = []
    if (classId) {
      try {
        const raw = wx.getStorageSync(studentStorageKeyForClass(classId))
        students = Array.isArray(raw) ? raw : []
      } catch (e) {
        students = []
      }
    }

    // 读取教师批改决定
    const reviews = readReviews(assignmentId)
    this._reviews = reviews

    // 读取学生真实提交记录（由学生端 canvas.js 写入）
    const submissions = readSubmissions(assignmentId)

    // 构建提交列表：仅当学生 isFinal=true（全部页通关）才视为「已交卷」
    // studentKey 双向兼容：学生端可能用 student.id 或 studentNo 存储
    const list = students.map((s) => {
      const sub = submissions[s.id] || submissions[s.studentNo] || null
      const rev = reviews[s.id] || reviews[s.studentNo] || {}

      const progress =
        readProgress(assignmentId, s.id) ||
        readProgress(assignmentId, s.studentNo)
      const hasSubmitted = !!(progress && progress.isFinal)

      // 教师可手动覆盖状态（批改决定优先）
      let status
      if (rev.status) {
        status = rev.status
      } else if (hasSubmitted) {
        status = 'pending'
      } else {
        status = 'unsubmitted'
      }

      const aiScore = sub && hasSubmitted ? (sub.aiScore != null ? sub.aiScore : 0) : 0
      const imageUrl = rev.imageUrl || (sub && hasSubmitted ? (sub.savedFilePath || '') : '')

      return {
        id: s.id,
        studentName: s.name || sub && sub.studentName || '未知',
        studentNo: s.studentNo || '',
        aiScore,
        status,
        imageUrl
      }
    })

    this._refreshStats(list, assignmentTitle)
  },

  onShow() {
    this.setData(getClassPageLayout())
  },

  /** 刷新头部统计并更新列表 */
  _refreshStats(list, title) {
    const submittedCount = list.filter((s) => s.status !== 'unsubmitted').length
    const pendingCount = list.filter((s) => s.status === 'pending').length
    const passedCount = list.filter((s) => s.status === 'passed').length
    this.setData({
      assignmentTitle: title != null ? title : this.data.assignmentTitle,
      totalCount: list.length,
      submittedCount,
      pendingCount,
      passedCount,
      submissionList: list
    })
  },

  /** 点击缩略图大图预览 */
  previewImage(e) {
    const url = e.currentTarget.dataset.url
    const status = e.currentTarget.dataset.status
    if (status === 'unsubmitted') return
    if (!url) {
      wx.showToast({ title: '暂无作业图片', icon: 'none' })
      return
    }
    wx.previewImage({ urls: [url], current: url })
  },

  /** 单条通过 / 驳回 */
  handleReview(e) {
    const { id, action } = e.currentTarget.dataset
    const list = this.data.submissionList
    const idx = list.findIndex((s) => s.id === id)
    if (idx < 0) return

    const newStatus = action === 'pass' ? 'passed' : 'rejected'
    const newList = list.slice()
    newList[idx] = { ...newList[idx], status: newStatus }

    this._reviews[id] = { ...(this._reviews[id] || {}), status: newStatus }
    saveReviews(this._assignmentId, this._reviews)

    wx.showToast({
      title: action === 'pass' ? '已通过' : '已驳回',
      icon: 'success',
      duration: 1000
    })

    this._refreshStats(newList)
  },

  /** 一键全部通过 */
  handlePassAll() {
    const list = this.data.submissionList
    const pendingItems = list.filter((s) => s.status === 'pending')
    if (pendingItems.length === 0) {
      wx.showToast({ title: '没有待批改项', icon: 'none' })
      return
    }
    wx.showModal({
      title: '一键全部通过',
      content: `将 ${pendingItems.length} 份「待批改」作业全部标记为通过，确认操作？`,
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        const newList = list.map((s) => {
          if (s.status !== 'pending') return s
          this._reviews[s.id] = { ...(this._reviews[s.id] || {}), status: 'passed' }
          return { ...s, status: 'passed' }
        })
        saveReviews(this._assignmentId, this._reviews)
        wx.showToast({ title: '操作成功', icon: 'success' })
        this._refreshStats(newList)
      }
    })
  },

  /** 把所有「已通过」作业的图片串行保存到教师本机相册 */
  handleExportAll() {
    const targets = (this.data.submissionList || []).filter(
      (s) => s.status === 'passed' && s.imageUrl
    )
    if (targets.length === 0) {
      wx.showToast({ title: '没有已通过的作业图片', icon: 'none' })
      return
    }

    wx.showModal({
      title: '保存到相册',
      content: `将 ${targets.length} 份「已通过」作业图片保存到您的手机相册，确认继续？`,
      confirmText: '开始保存',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this._ensureAlbumScope(() => this._saveAlbumSerial(targets))
      }
    })
  },

  /** 保证已拿到 writePhotosAlbum 权限，否则引导到设置页 */
  _ensureAlbumScope(onReady) {
    wx.getSetting({
      success: (res) => {
        const authed = res.authSetting && res.authSetting['scope.writePhotosAlbum']
        if (authed === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许「保存到相册」，否则无法导出作业图片。',
            confirmText: '去设置',
            cancelText: '取消',
            success: (r) => {
              if (!r.confirm) return
              wx.openSetting({
                success: (s) => {
                  if (s.authSetting && s.authSetting['scope.writePhotosAlbum']) {
                    onReady()
                  }
                }
              })
            }
          })
          return
        }
        onReady()
      },
      fail: () => onReady()
    })
  },

  /** 串行保存，避免相册写入被系统限流 */
  _saveAlbumSerial(targets) {
    const total = targets.length
    let okCount = 0
    let failCount = 0
    let i = 0

    wx.showLoading({ title: `保存中 0/${total}`, mask: true })

    const next = () => {
      if (i >= total) {
        wx.hideLoading()
        wx.showModal({
          title: '保存完成',
          content: `成功 ${okCount} 张，失败 ${failCount} 张。`,
          showCancel: false,
          confirmText: '我知道了'
        })
        return
      }
      const item = targets[i++]
      wx.showLoading({ title: `保存中 ${i}/${total}`, mask: true })
      wx.saveImageToPhotosAlbum({
        filePath: item.imageUrl,
        success: () => {
          okCount++
          next()
        },
        fail: (err) => {
          failCount++
          console.warn('[review] saveImageToPhotosAlbum fail', item.id, err)
          next()
        }
      })
    }

    next()
  }
})
