const { callClassService } = require('../../../../utils/classCloud.js')
const { getTeacherSession } = require('../../../../utils/classStudentAuth.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

const DEFAULT_STUDENT_PASSWORD = 'mgcs123456'

function genStudentRowId() {
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function maskPwd(pwd) {
  const s = String(pwd || '')
  if (!s) {
    return '—'
  }
  if (s.length <= 2) {
    return '••'
  }
  return `${s.slice(0, 1)}${'•'.repeat(Math.min(6, s.length - 1))}`
}

Page({
  data: {
    layoutClass: '',
    cursorSpacing: 32,
    className: '',
    classDesc: '',
    showBatchImport: false,
    batchRawText: '',
    students: [],
    parseWarnings: [],
    submitting: false
  },

  onLoad() {
    this.setData(getClassPageLayout())
    if (!getTeacherSession()) {
      wx.redirectTo({ url: '/pages/class/login/login' })
    }
  },

  onBasicInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    if (!field) {
      return
    }
    const patch = {}
    patch[field] = value
    this.setData(patch)
  },

  onBatchRawInput(e) {
    this.setData({
      batchRawText: e.detail.value
    })
  },

  toggleBatchImport() {
    this.setData({
      showBatchImport: !this.data.showBatchImport
    })
  },

  parseStudentData() {
    const raw = this.data.batchRawText || ''
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')
    const nextStudents = []
    const warnings = []
    const seenNo = new Set()

    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }
      const parts = trimmed.split(/\s+/).filter(Boolean)
      let name = ''
      let studentNo = ''
      let password = DEFAULT_STUDENT_PASSWORD
      if (parts.length === 3) {
        name = parts[0]
        studentNo = parts[1]
        password = parts[2]
      } else if (parts.length === 2) {
        name = parts[0]
        studentNo = parts[1]
      } else {
        warnings.push(`第 ${index + 1} 行格式不正确（需姓名+学号，或追加密码）`)
        return
      }
      if (seenNo.has(studentNo)) {
        warnings.push(`第 ${index + 1} 行学号 ${studentNo} 重复，已忽略`)
        return
      }
      seenNo.add(studentNo)
      nextStudents.push({
        id: genStudentRowId(),
        name,
        studentNo,
        password,
        maskPassword: maskPwd(password)
      })
    })

    this.setData({
      students: nextStudents,
      parseWarnings: warnings
    })

    if (nextStudents.length === 0 && warnings.length === 0) {
      wx.showToast({ title: '未解析到有效行', icon: 'none' })
      return
    }

    if (nextStudents.length > 0) {
      wx.showToast({
        title: `已解析 ${nextStudents.length} 人`,
        icon: 'success'
      })
    } else if (warnings.length > 0) {
      wx.showToast({ title: '请检查名单格式', icon: 'none' })
    }
  },

  deleteStudent(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      return
    }
    const students = this.data.students.filter((item) => item.id !== id)
    this.setData({ students })
  },

  async confirmCreate() {
    if (this.data.submitting) {
      return
    }
    const className = (this.data.className || '').trim()
    if (!className) {
      wx.showToast({ title: '请填写班级名称', icon: 'none' })
      return
    }
    const classDesc = (this.data.classDesc || '').trim()
    const students = this.data.students.map(({ name, studentNo, password }) => ({
      name,
      studentNo,
      password
    }))

    this.setData({ submitting: true })
    wx.showLoading({ title: '创建中', mask: true })
    try {
      const result = await callClassService('createClass', {
        name: className,
        desc: classDesc,
        students
      })
      wx.hideLoading()
      const tips = []
      if (result.added) tips.push(`新增账号 ${result.added}`)
      if (result.reused) tips.push(`复用 ${result.reused}`)
      if (result.duplicated) tips.push(`跳过重复 ${result.duplicated}`)
      const summary = tips.length > 0 ? `（${tips.join('，')}）` : ''
      wx.showToast({
        title: `创建成功${summary}`,
        icon: 'success',
        duration: 1800
      })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/class/teacher/dashboard/dashboard' })
      }, 1500)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '创建失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
