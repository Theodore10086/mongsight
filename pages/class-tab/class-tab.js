const TEACHER_DASHBOARD = '/pages/class/teacher/dashboard/dashboard'
const STUDENT_DASHBOARD = '/pages/class/student/dashboard/dashboard'
const CLASS_LOGIN = '/pages/class/login/login'

const { callClassService } = require('../../utils/classCloud.js')
const {
  getStudentSession,
  getTeacherSession,
  setStudentSession,
  setTeacherSession,
  clearStudentSession,
  clearTeacherSession,
  getLastClassRole,
  getClassAccountHistory
} = require('../../utils/classStudentAuth.js')

Page({
  data: {
    hasSession: false,
    role: '',
    roleText: '',
    accountName: '',
    accountList: [],
    switchingKey: ''
  },

  onShow() {
    this.refreshSessionState()
  },

  refreshSessionState() {
    const student = getStudentSession()
    const teacher = getTeacherSession()
    const lastRole = getLastClassRole()
    const role = lastRole || (student ? 'student' : (teacher ? 'teacher' : ''))
    const session = role === 'teacher' ? teacher : (role === 'student' ? student : null)

    this.setData({
      hasSession: !!(role && session),
      role: role && session ? role : '',
      roleText: role === 'teacher' ? '教师工作台' : (role === 'student' ? '学生作业' : ''),
      accountName: session ? (session.name || session.studentNo || '') : '',
      accountList: getClassAccountHistory().map((item) => ({
        key: item.key,
        role: item.role,
        name: item.name || item.studentNo || '',
        studentNo: item.studentNo || '',
        roleText: item.role === 'teacher' ? '教师' : '学生',
        active: !!(role && session && item.role === role && (
          item.role === 'teacher'
            ? item.name === session.name
            : item.studentNo === session.studentNo
        ))
      }))
    })
  },

  routeToActiveSession() {
    const student = getStudentSession()
    const teacher = getTeacherSession()
    const lastRole = getLastClassRole()

    if (lastRole === 'teacher' && teacher) {
      wx.navigateTo({ url: TEACHER_DASHBOARD })
      return true
    }
    if (lastRole === 'student' && student) {
      wx.navigateTo({ url: STUDENT_DASHBOARD })
      return true
    }
    if (student) {
      wx.navigateTo({ url: STUDENT_DASHBOARD })
      return true
    }
    if (teacher) {
      wx.navigateTo({ url: TEACHER_DASHBOARD })
      return true
    }
    return false
  },

  onGoToClassLogin() {
    if (this.routeToActiveSession()) {
      return
    }
    wx.navigateTo({ url: CLASS_LOGIN })
  },

  onSwitchAccount() {
    clearStudentSession()
    clearTeacherSession()
    this.refreshSessionState()
    wx.navigateTo({ url: CLASS_LOGIN })
  },

  async onUseHistoryAccount(e) {
    const key = e.currentTarget.dataset.key
    if (!key || this.data.switchingKey) return
    const account = getClassAccountHistory().find((item) => item.key === key)
    if (!account) {
      this.refreshSessionState()
      return
    }
    if (!account.password) {
      wx.showToast({ title: '请重新登录一次', icon: 'none' })
      wx.navigateTo({ url: CLASS_LOGIN })
      return
    }

    this.setData({ switchingKey: key })
    wx.showLoading({ title: '切换中', mask: true })
    try {
      if (account.role === 'teacher') {
        const data = await callClassService('registerOrLoginTeacher', {
          name: account.name,
          password: account.password
        })
        clearStudentSession()
        setTeacherSession({
          teacherDocId: data.teacherDocId,
          name: data.name,
          password: account.password
        })
        wx.hideLoading()
        this.refreshSessionState()
        wx.navigateTo({ url: TEACHER_DASHBOARD })
        return
      }

      const data = await callClassService('loginStudent', {
        name: account.name,
        studentNo: account.studentNo,
        password: account.password
      })
      clearTeacherSession()
      setStudentSession({
        studentDocId: data.studentDocId,
        name: data.name,
        studentNo: data.studentNo,
        password: account.password
      })
      wx.hideLoading()
      this.refreshSessionState()
      wx.navigateTo({ url: STUDENT_DASHBOARD })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '切换失败', icon: 'none' })
    } finally {
      this.setData({ switchingKey: '' })
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新输入账号信息才能进入班级。',
      confirmText: '退出',
      confirmColor: '#a05040',
      success: (res) => {
        if (!res.confirm) return
        clearStudentSession()
        clearTeacherSession()
        const app = getApp()
        if (app && app.globalData) {
          app.globalData.classRole = ''
          app.globalData.classTeacher = null
          app.globalData.classStudent = null
        }
        this.refreshSessionState()
      }
    })
  }
})
