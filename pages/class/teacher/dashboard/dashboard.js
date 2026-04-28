const STORAGE_TEACHER_NAME = 'classTeacherName'
const {
  readTeacherClassList,
  studentStorageKeyForClass,
  deleteClassById,
  hasTeacherClassListEverBeenSaved
} = require('../teacher-scope.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

/** 从本地学生名单实时计算某班级的学生人数 */
function countStudentsInClass(classId) {
  if (!classId) return 0
  try {
    const raw = wx.getStorageSync(studentStorageKeyForClass(classId))
    return Array.isArray(raw) ? raw.length : 0
  } catch (e) {
    return 0
  }
}

const MOCK_CLASSES = [
  {
    id: 'c1',
    name: '高一 · 蒙古文书法入门',
    desc: '本学期学习基础笔画与常用字头结构，配合字帖临摹与每日打卡。',
    studentCount: 40
  },
  {
    id: 'c2',
    name: '社团 · 草原笔墨社',
    desc: '面向全校开放，每周一次集中练习与作品点评。',
    studentCount: 28
  },
  {
    id: 'c3',
    name: '暑期集训班',
    desc: '短期强化班，侧重章法与作品创作，含结业展。',
    studentCount: 16
  }
]

function mergeClassList() {
  const stored = readTeacherClassList()
  if (stored.length > 0) {
    // 实时刷新每个班级的学生人数（学生增减后立即反映）
    return stored.map((c) => Object.assign({}, c, {
      studentCount: countStudentsInClass(c.id)
    }))
  }
  if (hasTeacherClassListEverBeenSaved()) {
    return []
  }
  return MOCK_CLASSES
}

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
    classList: []
  },

  onLoad(options) {
    this.setData(getClassPageLayout())
    const fromQuery =
      safeDecode(options.name) ||
      safeDecode(options.teacherName) ||
      ''
    const fromStorage = wx.getStorageSync(STORAGE_TEACHER_NAME) || ''
    const name = (fromQuery || fromStorage || '').trim()
    if (name) {
      wx.setStorageSync(STORAGE_TEACHER_NAME, name)
    }

    const teacherDisplayName = name || '老师'

    this.setData({
      teacherDisplayName
    })
    this.refreshClassList()
  },

  onShow() {
    this.setData(getClassPageLayout())
    this.refreshClassList()
  },

  onResize() {
    this.setData(getClassPageLayout())
  },

  refreshClassList() {
    this.setData({
      classList: mergeClassList()
    })
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
      content: '将删除本班及学生名单、作业记录（本地数据），确定吗？',
      confirmText: '删除',
      confirmColor: '#a05040',
      success: (res) => {
        if (!res.confirm) {
          return
        }
        deleteClassById(id)
        this.refreshClassList()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  }
})
