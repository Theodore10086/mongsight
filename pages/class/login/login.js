const TEACHER_DASHBOARD = '/pages/class/teacher/dashboard/dashboard'
const STUDENT_DASHBOARD = '/pages/class/student/dashboard/dashboard'

const { callClassService } = require('../../../utils/classCloud.js')
const {
  setStudentSession,
  setTeacherSession
} = require('../../../utils/classStudentAuth.js')
const { getClassPageLayout } = require('../../../utils/classLayout.js')

Page({
  data: {
    currentRole: 'teacher',
    teacherForm: {
      name: '',
      password: ''
    },
    studentForm: {
      name: '',
      studentNo: '',
      password: ''
    },
    layoutClass: '',
    cursorSpacing: 28,
    submitting: false
  },

  onLoad() {
    this.setData(getClassPageLayout())
  },

  onResize() {
    this.setData(getClassPageLayout())
  },

  switchRole(e) {
    const role = e.currentTarget.dataset.role
    if (!role || (role !== 'teacher' && role !== 'student')) {
      return
    }
    if (role === this.data.currentRole) {
      return
    }
    this.setData({
      currentRole: role
    })
  },

  handleInput(e) {
    const role = e.currentTarget.dataset.role
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    if (!role || !field) {
      return
    }
    if (role === 'teacher') {
      this.setData({
        [`teacherForm.${field}`]: value
      })
    } else if (role === 'student') {
      this.setData({
        [`studentForm.${field}`]: value
      })
    }
  },

  async handleLogin() {
    if (this.data.submitting) {
      return
    }
    const { currentRole, teacherForm, studentForm } = this.data

    if (currentRole === 'teacher') {
      const name = (teacherForm.name || '').trim()
      const password = (teacherForm.password || '').trim()
      if (!name) {
        wx.showToast({ title: '请输入教师姓名', icon: 'none' })
        return
      }
      if (!password) {
        wx.showToast({ title: '请输入登录密码', icon: 'none' })
        return
      }
      this.setData({ submitting: true })
      wx.showLoading({ title: '登录中', mask: true })
      try {
        const data = await callClassService('registerOrLoginTeacher', { name, password })
        setTeacherSession({
          teacherDocId: data.teacherDocId,
          name: data.name
        })
        const app = getApp()
        if (app && app.globalData) {
          app.globalData.classRole = 'teacher'
          app.globalData.classTeacher = { teacherDocId: data.teacherDocId, name: data.name }
          app.globalData.classStudent = null
        }
        wx.hideLoading()
        wx.showToast({
          title: data.isNew ? '账号已创建' : '登录成功',
          icon: 'success',
          duration: 800
        })
        setTimeout(() => {
          wx.redirectTo({
            url: `${TEACHER_DASHBOARD}?name=${encodeURIComponent(data.name)}`
          })
        }, 600)
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: err.message || '登录失败', icon: 'none' })
      } finally {
        this.setData({ submitting: false })
      }
      return
    }

    if (currentRole === 'student') {
      const name = (studentForm.name || '').trim()
      const studentNo = (studentForm.studentNo || '').trim()
      const password = (studentForm.password || '').trim()
      if (!name || !studentNo || !password) {
        wx.showToast({ title: '请填写姓名、学号与密码', icon: 'none' })
        return
      }
      this.setData({ submitting: true })
      wx.showLoading({ title: '登录中', mask: true })
      try {
        const data = await callClassService('loginStudent', { name, studentNo, password })
        setStudentSession({
          studentDocId: data.studentDocId,
          name: data.name,
          studentNo: data.studentNo
        })
        const app = getApp()
        if (app && app.globalData) {
          app.globalData.classRole = 'student'
          app.globalData.classStudent = {
            studentDocId: data.studentDocId,
            name: data.name,
            studentNo: data.studentNo
          }
          app.globalData.classTeacher = null
        }
        wx.hideLoading()
        wx.showToast({ title: '登录成功', icon: 'success', duration: 800 })
        setTimeout(() => {
          wx.redirectTo({ url: STUDENT_DASHBOARD })
        }, 600)
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: err.message || '登录失败', icon: 'none' })
      } finally {
        this.setData({ submitting: false })
      }
    }
  }
})
