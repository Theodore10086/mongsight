const { callClassService } = require('../../../../utils/classCloud.js')
const { getTeacherSession, setTeacherSession, clearTeacherSession } = require('../../../../utils/classStudentAuth.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

function safeDecode(str) {
  if (!str || typeof str !== 'string') {
    return ''
  }
  try {
    return decodeURIComponent(str)
  } catch (e) {
    return str
  }
}

Page({
  data: {
    layoutClass: '',
    teacherDisplayName: '老师',
    classList: [],
    loaded: false
  },

  onLoad(options) {
    this.setData(getClassPageLayout())
    const fromQuery = safeDecode(options.name) || safeDecode(options.teacherName) || ''
    const session = getTeacherSession()
    const name = (fromQuery || (session && session.name) || '').trim()

    this.setData({
      teacherDisplayName: name || '老师'
    })
    this.refreshClassList()
  },

  onShow() {
    this.setData(getClassPageLayout())
    if (!getTeacherSession()) {
      this._redirectToLogin()
      return
    }
    this.refreshClassList()
  },

  onResize() {
    this.setData(getClassPageLayout())
  },

  _redirectToLogin() {
    wx.redirectTo({ url: '/pages/class/login/login' })
  },

  async refreshClassList() {
    try {
      const data = await callClassService('getMyClasses')
      this.setData({
        classList: (data && data.classes) || [],
        loaded: true
      })
    } catch (err) {
      const msg = err && err.message ? err.message : ''
      if (/未登录/.test(msg)) {
        clearTeacherSession()
        this._redirectToLogin()
        return
      }
      console.warn('[teacher-dashboard] refreshClassList', err)
      wx.showToast({ title: msg || '加载班级失败', icon: 'none' })
      this.setData({ loaded: true })
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      return
    }
    wx.navigateTo({
      url: `/pages/class/teacher/class-detail/class-detail?id=${id}`
    })
  },

  goToCreate() {
    wx.navigateTo({
      url: '/pages/class/teacher/class-create/class-create'
    })
  },

  onDeleteClass(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      return
    }
    wx.showModal({
      title: '删除班级',
      content: '将删除本班及学生名单、作业记录，确定吗？',
      confirmText: '删除',
      confirmColor: '#a05040',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await callClassService('deleteClass', { classId: id })
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'none' })
          this.refreshClassList()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      }
    })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前教师账号吗？',
      confirmText: '退出',
      confirmColor: '#a05040',
      success: (res) => {
        if (!res.confirm) {
          return
        }
        clearTeacherSession()
        const app = getApp()
        if (app && app.globalData) {
          app.globalData.classRole = ''
          app.globalData.classTeacher = null
        }
        this._redirectToLogin()
      }
    })
  }
})
