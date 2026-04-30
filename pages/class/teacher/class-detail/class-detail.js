/**
 * 班级详情 — 综合管理（学生 / 作业），全部走云端
 */

const { callClassService } = require('../../../../utils/classCloud.js')
const { getTeacherSession } = require('../../../../utils/classStudentAuth.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

const DEFAULT_STUDENT_PASSWORD = 'mgcs123456'

function maskPassword(pwd) {
  const s = String(pwd || '')
  if (!s) return '—'
  if (s.length <= 2) return '••'
  return `${s.slice(0, 1)}${'•'.repeat(Math.min(6, s.length - 1))}`
}

function decorateStudents(list) {
  return (list || []).map((item) => ({
    id: item.id,
    studentDocId: item.studentDocId,
    name: item.name,
    studentNo: item.studentNo,
    password: item.password,
    maskPassword: maskPassword(item.password),
    bound: !!item.bound,
    selected: false,
    passwordVisible: false
  }))
}

Page({
  data: {
    layoutClass: '',
    classId: '',
    className: '班级',
    currentTab: 'students',
    batchMode: false,
    batchSelectedCount: 0,
    showStudentImport: false,
    batchImportText: '',
    studentList: [],
    assignmentList: [],
    loaded: false
  },

  onLoad(options) {
    this.setData(getClassPageLayout())
    if (!getTeacherSession()) {
      wx.redirectTo({ url: '/pages/class/login/login' })
      return
    }
    const classId = (options.id || options.classId || '').trim()
    if (!classId) {
      wx.showToast({ title: '缺少班级 id', icon: 'none' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200)
      return
    }
    this.setData({ classId })
    this.loadDetail()
  },

  onShow() {
    this.setData(getClassPageLayout())
    if (!this.data.classId) return
    if (!this.data.loaded) return
    this.loadDetail({ silent: true })
  },

  async loadDetail(opts) {
    const silent = opts && opts.silent
    if (!silent) {
      wx.showLoading({ title: '加载中', mask: true })
    }
    try {
      const data = await callClassService('getClassDetail', { classId: this.data.classId })
      if (!silent) wx.hideLoading()
      const className = (data.classInfo && data.classInfo.name) || '班级'
      wx.setNavigationBarTitle({ title: className })
      this.setData({
        className,
        studentList: decorateStudents(data.studentList || []),
        assignmentList: data.assignmentList || [],
        batchMode: false,
        batchSelectedCount: 0,
        loaded: true
      })
    } catch (err) {
      if (!silent) wx.hideLoading()
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  syncBatchSelectedCount(studentList, batchMode) {
    const n = batchMode && Array.isArray(studentList)
      ? studentList.filter((s) => s.selected).length
      : 0
    this.setData({ batchSelectedCount: n })
  },

  switchMainTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || (tab !== 'students' && tab !== 'assignments')) {
      return
    }
    if (tab === this.data.currentTab) {
      return
    }
    const cleared = this.data.studentList.map((s) => ({
      ...s,
      selected: false,
      passwordVisible: false
    }))
    this.setData({
      currentTab: tab,
      batchMode: false,
      showStudentImport: false,
      studentList: cleared,
      batchSelectedCount: 0
    })
  },

  toggleStudentImport() {
    this.setData({
      showStudentImport: !this.data.showStudentImport
    })
  },

  onBatchImportInput(e) {
    this.setData({ batchImportText: e.detail.value })
  },

  async parseBatchStudents() {
    const raw = this.data.batchImportText || ''
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')
    const added = []
    const seen = new Set()
    let invalid = 0

    lines.forEach((line) => {
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
        invalid += 1
        return
      }
      if (seen.has(studentNo)) {
        return
      }
      seen.add(studentNo)
      added.push({ name, studentNo, password })
    })

    if (added.length === 0 && invalid === 0) {
      wx.showToast({ title: '请粘贴名单', icon: 'none' })
      return
    }
    if (added.length === 0) {
      wx.showToast({ title: '请检查名单格式', icon: 'none' })
      return
    }

    wx.showLoading({ title: '导入中', mask: true })
    try {
      const result = await callClassService('appendStudents', {
        classId: this.data.classId,
        students: added
      })
      wx.hideLoading()
      const tips = []
      if (result.added) tips.push(`新增 ${result.added}`)
      if (result.reused) tips.push(`复用 ${result.reused}`)
      if (result.duplicated) tips.push(`跳过重复 ${result.duplicated}`)
      if (invalid) tips.push(`忽略 ${invalid} 行`)
      wx.showToast({
        title: tips.length > 0 ? tips.join('，') : '已导入',
        icon: 'none',
        duration: 2200
      })
      this.setData({ batchImportText: '', showStudentImport: false })
      this.loadDetail({ silent: true })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '导入失败', icon: 'none' })
    }
  },

  toggleBatchMode() {
    const next = !this.data.batchMode
    const studentList = this.data.studentList.map((s) => ({
      ...s,
      selected: next ? s.selected : false,
      passwordVisible: false
    }))
    this.setData({
      batchMode: next,
      studentList
    })
    this.syncBatchSelectedCount(studentList, next)
  },

  toggleStudentSelect(e) {
    if (!this.data.batchMode) {
      return
    }
    const id = e.currentTarget.dataset.id
    if (!id) {
      return
    }
    const studentList = this.data.studentList.map((s) =>
      s.id === id ? { ...s, selected: !s.selected } : s
    )
    this.setData({ studentList })
    this.syncBatchSelectedCount(studentList, true)
  },

  togglePasswordVisible(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const studentList = this.data.studentList.map((s) =>
      s.id === id ? { ...s, passwordVisible: !s.passwordVisible } : s
    )
    this.setData({ studentList })
  },

  onChangeStudentPassword(e) {
    const studentNo = e.currentTarget.dataset.no
    const studentName = e.currentTarget.dataset.name || ''
    if (!studentNo) return
    wx.showModal({
      title: `修改 ${studentName} 的密码`,
      editable: true,
      placeholderText: '请输入新密码（至少 6 位）',
      confirmText: '保存',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        const newPassword = (res.content || '').trim()
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
          await callClassService('teacherSetStudentPassword', {
            studentNo,
            newPassword
          })
          wx.hideLoading()
          wx.showToast({ title: '已更新', icon: 'success' })
          this.loadDetail({ silent: true })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '保存失败', icon: 'none' })
        }
      }
    })
  },

  batchDeleteStudents() {
    if (!this.data.batchMode) {
      return
    }
    const selected = this.data.studentList.filter((s) => s.selected)
    if (selected.length === 0) {
      wx.showToast({ title: '请先勾选学生', icon: 'none' })
      return
    }
    wx.showModal({
      title: '批量移出班级',
      content: `将从本班移出选中的 ${selected.length} 名学生（学生账号本身保留）。`,
      confirmColor: '#5c4033',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        const studentNos = selected.map((s) => s.studentNo)
        wx.showLoading({ title: '处理中', mask: true })
        try {
          await callClassService('deleteStudents', {
            classId: this.data.classId,
            studentNos
          })
          wx.hideLoading()
          wx.showToast({ title: '已移出', icon: 'success' })
          this.loadDetail({ silent: true })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '操作失败', icon: 'none' })
        }
      }
    })
  },

  goAssignmentReview(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      return
    }
    const classId = this.data.classId || ''
    wx.navigateTo({
      url: `/pages/class/teacher/assignment-review/assignment-review?assignmentId=${encodeURIComponent(id)}&classId=${encodeURIComponent(classId)}`
    })
  },

  goPublishAssignment() {
    const q = this.data.classId
      ? `?classId=${encodeURIComponent(this.data.classId)}`
      : ''
    wx.navigateTo({
      url: `/pages/class/teacher/assignment-create/assignment-create${q}`
    })
  },

  onDeleteAssignment(e) {
    const assignmentId = e.currentTarget.dataset.id
    if (!assignmentId) {
      return
    }
    const classId = (this.data.classId || '').trim()
    if (!classId) {
      return
    }
    wx.showModal({
      title: '删除作业',
      content: '将删除该作业及所有学生的提交记录、批改决定，确定吗？',
      confirmText: '删除',
      confirmColor: '#a05040',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await callClassService('deleteAssignment', { classId, assignmentId })
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'none' })
          this.loadDetail({ silent: true })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      }
    })
  }
})
