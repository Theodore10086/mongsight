const { callClassService } = require('../../../../utils/classCloud.js')
const { getStudentSession } = require('../../../../utils/classStudentAuth.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

function safeDecode(str) {
  if (!str || typeof str !== 'string') return ''
  try { return decodeURIComponent(str) } catch (e) { return str }
}

Page({
  data: {
    layoutClass: '',
    classId: '',
    className: '',
    assignmentList: []
  },

  onLoad(options) {
    this.setData(getClassPageLayout())
    if (!getStudentSession()) {
      wx.redirectTo({ url: '/pages/class/login/login' })
      return
    }
    const classId = (options.classId || '').trim()
    if (!classId) {
      wx.showToast({ title: '缺少班级 id', icon: 'none' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200)
      return
    }
    const className = safeDecode(options.className || '')
    this.setData({ classId, className })
    if (className) {
      wx.setNavigationBarTitle({ title: className })
    }
    this.refresh()
  },

  onShow() {
    this.setData(getClassPageLayout())
    if (this.data.classId) {
      this.refresh({ silent: true })
    }
  },

  onResize() {
    this.setData(getClassPageLayout())
  },

  async refresh(opts) {
    const silent = opts && opts.silent
    if (!silent) {
      wx.showLoading({ title: '加载中', mask: true })
    }
    try {
      const data = await callClassService('getClassAssignments', {
        classId: this.data.classId
      })
      if (!silent) wx.hideLoading()
      const className = data.className || this.data.className
      wx.setNavigationBarTitle({ title: className || '班级作业' })
      this.setData({
        className,
        assignmentList: data.assignmentList || []
      })
    } catch (err) {
      if (!silent) wx.hideLoading()
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  goToAssignment(e) {
    const { id, status } = e.currentTarget.dataset
    if (!id) {
      return
    }
    if (status === 'completed') {
      wx.showModal({
        title: '作业已通过',
        content: '这份作业已经通过，无需再次提交。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    if (status === 'rejected') {
      wx.showModal({
        title: '作业已驳回',
        content: '这份作业需要重新完成后再提交，点击确认进入重做。',
        confirmText: '重新完成',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) return
          wx.navigateTo({
            url: `/pages/class/student/canvas/canvas?id=${encodeURIComponent(id)}&mode=retry`
          })
        }
      })
      return
    }
    wx.navigateTo({
      url: `/pages/class/student/canvas/canvas?id=${encodeURIComponent(id)}`
    })
  }
})
