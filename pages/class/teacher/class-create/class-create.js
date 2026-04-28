function genStudentId() {
  return `stu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const { writeTeacherClassList, readTeacherClassList, studentStorageKeyForClass } = require('../teacher-scope.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

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
    parseWarnings: []
  },

  onLoad() {
    this.setData(getClassPageLayout())
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

    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }
      const parts = trimmed.split(/\s+/).filter(Boolean)
      if (parts.length === 3) {
        const password = parts[2]
        nextStudents.push({
          id: genStudentId(),
          name: parts[0],
          studentNo: parts[1],
          password,
          maskPassword: maskPwd(password)
        })
      } else {
        warnings.push(`第 ${index + 1} 行格式不正确（需姓名、学号、密码三项，空格分隔）`)
      }
    })

    this.setData({
      students: nextStudents,
      parseWarnings: warnings
    })

    if (nextStudents.length === 0 && warnings.length === 0) {
      wx.showToast({
        title: '未解析到有效行',
        icon: 'none'
      })
      return
    }

    if (nextStudents.length > 0) {
      wx.showToast({
        title: `已解析 ${nextStudents.length} 人`,
        icon: 'success'
      })
    } else if (warnings.length > 0) {
      wx.showToast({
        title: '请检查名单格式',
        icon: 'none'
      })
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

  confirmCreate() {
    const className = (this.data.className || '').trim()
    if (!className) {
      wx.showToast({
        title: '请填写班级名称',
        icon: 'none'
      })
      return
    }

    const payload = {
      className,
      classDesc: (this.data.classDesc || '').trim(),
      students: this.data.students.map(({ name, studentNo, password }) => ({
        name,
        studentNo,
        password
      }))
    }

    console.log('[class-create] 确认创建', payload)

    const classId = `cls_${Date.now()}`

    try {
      const list = readTeacherClassList()
      list.unshift({
        id: classId,
        name: payload.className,
        desc: payload.classDesc || '暂无简介',
        studentCount: payload.students.length
      })
      writeTeacherClassList(list)
    } catch (err) {
      console.warn('[class-create] 保存班级列表失败', err)
    }

    try {
      const rows = payload.students.map((s) => ({
        id: genStudentId(),
        name: s.name,
        studentNo: s.studentNo,
        password: s.password
      }))
      wx.setStorageSync(studentStorageKeyForClass(classId), rows)
    } catch (err2) {
      console.warn('[class-create] 保存班级学生失败', err2)
    }

    wx.showToast({
      title: '创建成功',
      icon: 'success',
      duration: 1500
    })
    setTimeout(() => {
      wx.redirectTo({
        url: '/pages/class/teacher/dashboard/dashboard'
      })
    }, 1500)
  }
})
