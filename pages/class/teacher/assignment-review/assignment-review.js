const { callClassService, getTempFileURL } = require('../../../../utils/classCloud.js')
const { getTeacherSession } = require('../../../../utils/classStudentAuth.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

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

  onLoad(options) {
    this.setData(getClassPageLayout())
    if (!getTeacherSession()) {
      wx.redirectTo({ url: '/pages/class/login/login' })
      return
    }
    const assignmentId = (options.assignmentId || '').trim()
    const classId = (options.classId || '').trim()
    this._assignmentId = assignmentId
    this._classId = classId
    if (!assignmentId) {
      wx.showToast({ title: '缺少作业 id', icon: 'none' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200)
      return
    }
    this.loadReview()
  },

  onShow() {
    this.setData(getClassPageLayout())
  },

  async loadReview() {
    wx.showLoading({ title: '加载中', mask: true })
    try {
      const data = await callClassService('getAssignmentReview', {
        assignmentId: this._assignmentId
      })
      wx.setNavigationBarTitle({ title: data.assignmentTitle || '作业批改' })

      const list = (data.submissionList || []).map((s) => ({
        id: s.studentNo,
        studentNo: s.studentNo,
        studentName: s.studentName || '',
        aiScore: s.aiScore || 0,
        status: s.status,
        imageFileID: s.imageFileID || '',
        imageUrl: ''
      }))

      // 解析图片临时链接
      const fileIDs = list.map((s) => s.imageFileID).filter(Boolean)
      let urlMap = {}
      if (fileIDs.length > 0) {
        try {
          urlMap = await getTempFileURL(fileIDs)
        } catch (e) {
          console.warn('[review] getTempFileURL fail', e)
        }
      }
      list.forEach((s) => {
        if (s.imageFileID && urlMap[s.imageFileID]) {
          s.imageUrl = urlMap[s.imageFileID]
        }
      })

      wx.hideLoading()
      this._refreshStats(list, data.assignmentTitle)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

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

  async handleReview(e) {
    const { id, action } = e.currentTarget.dataset
    if (!id) return
    const newStatus = action === 'pass' ? 'passed' : 'rejected'
    wx.showLoading({ title: '保存中', mask: true })
    try {
      await callClassService('setReviewStatus', {
        assignmentId: this._assignmentId,
        studentNos: [id],
        status: newStatus
      })
      wx.hideLoading()
      const list = this.data.submissionList.slice()
      const idx = list.findIndex((s) => s.studentNo === id)
      if (idx >= 0) {
        list[idx] = { ...list[idx], status: newStatus }
      }
      this._refreshStats(list)
      wx.showToast({
        title: action === 'pass' ? '已通过' : '已驳回',
        icon: 'success',
        duration: 800
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  },

  handlePassAll() {
    const list = this.data.submissionList || []
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
      success: async (res) => {
        if (!res.confirm) return
        const studentNos = pendingItems.map((s) => s.studentNo)
        wx.showLoading({ title: '保存中', mask: true })
        try {
          await callClassService('setReviewStatus', {
            assignmentId: this._assignmentId,
            studentNos,
            status: 'passed'
          })
          wx.hideLoading()
          const newList = list.map((s) =>
            s.status === 'pending' ? { ...s, status: 'passed' } : s
          )
          this._refreshStats(newList)
          wx.showToast({ title: '操作成功', icon: 'success' })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '操作失败', icon: 'none' })
        }
      }
    })
  },

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

  /**
   * 串行：先 downloadFile（云存储 https）→ saveImageToPhotosAlbum
   */
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
      wx.downloadFile({
        url: item.imageUrl,
        success: (dl) => {
          if (dl.statusCode !== 200 || !dl.tempFilePath) {
            failCount++
            console.warn('[review] downloadFile non-200', item.studentNo)
            return next()
          }
          wx.saveImageToPhotosAlbum({
            filePath: dl.tempFilePath,
            success: () => {
              okCount++
              next()
            },
            fail: (err) => {
              failCount++
              console.warn('[review] saveImageToPhotosAlbum fail', item.studentNo, err)
              next()
            }
          })
        },
        fail: (err) => {
          failCount++
          console.warn('[review] downloadFile fail', item.studentNo, err)
          next()
        }
      })
    }

    next()
  }
})
