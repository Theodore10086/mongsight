/**
 * 班级详情 — 综合管理（学生 / 作业）
 * 模拟数据见 ./class-detail.mock.js，便于后续替换为云接口层
 */

const { mockStudents } = require('./class-detail.mock.js')
const {
  readTeacherClassList,
  studentStorageKeyForClass,
  readAssignmentsForClass,
  removeAssignmentForClass,
  readProgress
} = require('../teacher-scope.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

function genStudentRowId() {
  return `stu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function maskPassword(pwd) {
  const s = String(pwd || '')
  if (!s) return '—'
  if (s.length <= 2) return '••'
  return `${s.slice(0, 1)}${'•'.repeat(Math.min(6, s.length - 1))}`
}

function decorateStudents(list) {
  return list.map((item) => ({
    ...item,
    maskPassword: maskPassword(item.password),
    selected: false
  }))
}

function resolveClassName(classId) {
  if (!classId) {
    return '班级'
  }
  try {
    const arr = readTeacherClassList()
    const found = arr.find((c) => c.id === classId)
    if (found && found.name) {
      return found.name
    }
  } catch (e) {
    console.warn('[class-detail] resolveClassName', e)
  }
  return '班级'
}

function loadAssignmentList(classId) {
  const list = readAssignmentsForClass(classId)
  if (!Array.isArray(list)) return []

  // 实时计算 submitCount / totalCount，避免依赖发布时的静态值
  let students = []
  if (classId) {
    try {
      const raw = wx.getStorageSync(studentStorageKeyForClass(classId))
      students = Array.isArray(raw) ? raw : []
    } catch (e) {
      students = []
    }
  }

  return list.map((a) => {
    const totalCount = students.length
    let submitCount = 0
    students.forEach((s) => {
      // 双 key 兼容：学生端可能用 student.id 或 studentNo 存储
      const progress =
        readProgress(a.id, s.id) ||
        readProgress(a.id, s.studentNo)
      if (progress && progress.isFinal) {
        submitCount += 1
      }
    })
    return Object.assign({}, a, { submitCount, totalCount })
  })
}

function loadStoredStudents(classId) {
  if (!classId) {
    return null
  }
  try {
    const raw = wx.getStorageSync(studentStorageKeyForClass(classId))
    if (raw === '' || raw === undefined || raw === null) {
      return null
    }
    return Array.isArray(raw) ? raw : null
  } catch (e) {
    return null
  }
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
    assignmentList: []
  },

  onLoad(options) {
    const classId = (options.id || options.classId || '').trim()
    const className = resolveClassName(classId)

    const stored = loadStoredStudents(classId)
    const baseList = stored !== null ? stored : mockStudents(classId)
    const studentList = decorateStudents(baseList)
    const assignmentList = loadAssignmentList(classId)

    wx.setNavigationBarTitle({
      title: className
    })

    this.setData({
      ...getClassPageLayout(),
      classId,
      className,
      studentList,
      assignmentList,
      batchSelectedCount: 0
    })
  },

  onShow() {
    const classId = (this.data.classId || '').trim()
    if (!classId) {
      return
    }
    this.setData({
      assignmentList: loadAssignmentList(classId)
    })
  },

  persistStudents(nextList) {
    const classId = this.data.classId
    if (!classId) {
      return
    }
    const plain = nextList.map(({ id, name, studentNo, password }) => ({
      id,
      name,
      studentNo,
      password
    }))
    try {
      wx.setStorageSync(studentStorageKeyForClass(classId), plain)
    } catch (e) {
      console.warn('[class-detail] persistStudents', e)
    }
  },

  syncBatchSelectedCount(studentList, batchMode) {
    const n =
      batchMode && Array.isArray(studentList)
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
      selected: false
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

  parseBatchStudents() {
    const raw = this.data.batchImportText || ''
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')
    const added = []
    let invalid = 0

    lines.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }
      const parts = trimmed.split(/\s+/).filter(Boolean)
      if (parts.length === 3) {
        added.push({
          id: genStudentRowId(),
          name: parts[0],
          studentNo: parts[1],
          password: parts[2]
        })
      } else {
        invalid += 1
      }
    })

    if (added.length === 0 && invalid === 0) {
      wx.showToast({ title: '请粘贴名单', icon: 'none' })
      return
    }

    const existingNos = new Set(this.data.studentList.map((s) => s.studentNo))
    const merged = []
    let dup = 0
    added.forEach((row) => {
      if (existingNos.has(row.studentNo)) {
        dup += 1
        return
      }
      existingNos.add(row.studentNo)
      merged.push(row)
    })

    const nextRaw = [...this.data.studentList.map(({ id, name, studentNo, password }) => ({ id, name, studentNo, password })), ...merged]
    const studentList = decorateStudents(nextRaw)

    this.setData({
      studentList,
      batchImportText: '',
      showStudentImport: false
    })
    this.persistStudents(studentList)
    this.syncBatchSelectedCount(studentList, this.data.batchMode)

    let msg = `已添加 ${merged.length} 人`
    if (dup > 0) {
      msg += `，跳过重复 ${dup}`
    }
    if (invalid > 0) {
      msg += `，忽略 ${invalid} 行`
    }
    wx.showToast({ title: msg, icon: 'none', duration: 2200 })
  },

  toggleBatchMode() {
    const next = !this.data.batchMode
    const studentList = this.data.studentList.map((s) => ({
      ...s,
      selected: next ? s.selected : false
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
      title: '批量删除',
      content: `确定删除选中的 ${selected.length} 名学生吗？`,
      confirmColor: '#5c4033',
      success: (res) => {
        if (!res.confirm) {
          return
        }
        const removeSet = new Set(selected.map((s) => s.id))
        const nextList = this.data.studentList.filter((s) => !removeSet.has(s.id))
        const studentList = nextList.map((s) => ({ ...s, selected: false }))
        this.setData({
          studentList,
          batchMode: false,
          batchSelectedCount: 0
        })
        this.persistStudents(studentList)
        wx.showToast({ title: '已删除', icon: 'success' })
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
      content: '将删除该作业记录（本地），确定吗？',
      confirmText: '删除',
      confirmColor: '#a05040',
      success: (res) => {
        if (!res.confirm) {
          return
        }
        removeAssignmentForClass(classId, assignmentId)
        this.setData({
          assignmentList: loadAssignmentList(classId)
        })
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  }
})
