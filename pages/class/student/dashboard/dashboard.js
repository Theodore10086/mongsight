const { callClassService } = require('../../../../utils/classCloud.js')
const {
  getStudentSession,
  setStudentSession,
  clearStudentSession
} = require('../../../../utils/classStudentAuth.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

Page({
  data: {
    layoutClass: '',
    studentName: '',
    studentNo: '',
    classList: [],
    loaded: false
  },

  onLoad() {
    this.setData(getClassPageLayout())
    if (!getStudentSession()) {
      wx.redirectTo({ url: '/pages/class/login/login' })
      return
    }
    this.refresh()
  },

  onShow() {
    this.setData(getClassPageLayout())
    if (!getStudentSession()) {
      wx.redirectTo({ url: '/pages/class/login/login' })
      return
    }
    this.refresh({ silent: true })
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
      const data = await callClassService('getMyJoinedClasses')
      if (!silent) wx.hideLoading()
      const session = getStudentSession() || {}
      // 同步姓名（云端为准）
      if (data.studentName && data.studentName !== session.name) {
        setStudentSession({ ...session, name: data.studentName })
      }
      this.setData({
        studentName: data.studentName || session.name || '',
        studentNo: session.studentNo || '',
        classList: data.classes || [],
        loaded: true
      })
    } catch (err) {
      if (!silent) wx.hideLoading()
      const msg = err && err.message ? err.message : ''
      if (/未登录/.test(msg)) {
        clearStudentSession()
        wx.redirectTo({ url: '/pages/class/login/login' })
        return
      }
      console.warn('[student-dashboard] refresh', err)
      wx.showToast({ title: msg || '加载失败', icon: 'none' })
      this.setData({ loaded: true })
    }
  },

  goToClass(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    if (!id) {
      return
    }
    wx.navigateTo({
      url: `/pages/class/student/class-home/class-home?classId=${encodeURIComponent(id)}&className=${encodeURIComponent(name)}`
    })
  },

  onChangePassword() {
    wx.showModal({
      title: '修改密码 · 第 1 步',
      editable: true,
      placeholderText: '请输入当前密码',
      confirmText: '下一步',
      cancelText: '取消',
      success: (resOld) => {
        if (!resOld.confirm) return
        const oldPassword = (resOld.content || '').trim()
        if (!oldPassword) {
          wx.showToast({ title: '请输入当前密码', icon: 'none' })
          return
        }
        wx.showModal({
          title: '修改密码 · 第 2 步',
          editable: true,
          placeholderText: '请输入新密码（至少 6 位）',
          confirmText: '保存',
          cancelText: '取消',
          success: async (resNew) => {
            if (!resNew.confirm) return
            const newPassword = (resNew.content || '').trim()
            if (!newPassword) {
              wx.showToast({ title: '请输入新密码', icon: 'none' })
              return
            }
            if (newPassword.length < 6) {
              wx.showToast({ title: '密码至少 6 位', icon: 'none' })
              return
            }
            wx.showLoading({ title: '保存中', mask: true })
            try {
              await callClassService('changeStudentPassword', { oldPassword, newPassword })
              wx.hideLoading()
              wx.showToast({ title: '已更新', icon: 'success' })
            } catch (err) {
              wx.hideLoading()
              wx.showToast({ title: err.message || '保存失败', icon: 'none' })
            }
          }
        })
      }
    })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前学生账号吗？',
      confirmText: '退出',
      confirmColor: '#a05040',
      success: (res) => {
        if (!res.confirm) return
        clearStudentSession()
        const app = getApp()
        if (app && app.globalData) {
          app.globalData.classRole = ''
          app.globalData.classStudent = null
        }
        wx.redirectTo({ url: '/pages/class/login/login' })
      }
    })
  }
})
