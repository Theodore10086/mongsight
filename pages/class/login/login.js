const TEACHER_DASHBOARD = '/pages/class/teacher/dashboard/dashboard'
const STUDENT_DASHBOARD = '/pages/class/student/dashboard/dashboard'
const {
  findImportedStudent,
  resolveClassNameByClassId,
  setStudentSession
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
    cursorSpacing: 28
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

  handleLogin() {
    const { currentRole, teacherForm, studentForm } = this.data

    if (currentRole === 'teacher') {
      const name = (teacherForm.name || '').trim()
      const password = teacherForm.password || ''
      if (password === '123456' && name !== '') {
        try {
          wx.setStorageSync('classTeacherName', name)
        } catch (err) {
          console.warn('[login] setStorageSync classTeacherName', err)
        }
        const q = encodeURIComponent(name)
        wx.redirectTo({
          url: `${TEACHER_DASHBOARD}?name=${q}`
        })
      } else {
        wx.showToast({
          title: '姓名或密码错误',
          icon: 'none'
        })
      }
      return
    }

    if (currentRole === 'student') {
      const name = (studentForm.name || '').trim()
      const studentNo = (studentForm.studentNo || '').trim()
      const password = (studentForm.password || '').trim()
      if (!name || !studentNo || !password) {
        wx.showToast({
          title: '请填写姓名、学号与密码',
          icon: 'none'
        })
        return
      }

      const hit = findImportedStudent(name, studentNo, password)
      if (!hit) {
        wx.showToast({
          title: '账号或密码错误',
          icon: 'none'
        })
        return
      }

      const className = resolveClassNameByClassId(hit.classId)
      setStudentSession({
        studentId: hit.student.id,
        name: hit.student.name,
        studentNo: hit.student.studentNo,
        classId: hit.classId,
        className
      })

      wx.redirectTo({
        url: STUDENT_DASHBOARD
      })
    }
  }
})
