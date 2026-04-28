const {
  getStudentSession
} = require('../../../../utils/classStudentAuth.js')
const {
  readAssignmentsForClass,
  readSubmissions,
  readProgress
} = require('../../teacher/teacher-scope.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

/**
 * 三种状态：
 *   pending     —— 没有任何提交，没有任何进度（首次进入）
 *   inprogress  —— 有进度但未完成全部页（多页字帖才有此状态）
 *   completed   —— 全部页通关，等待教师批阅
 */
function mapAssignmentsForDashboard(records, studentKey) {
  if (!Array.isArray(records) || records.length === 0) {
    return []
  }
  return records.map((a) => {
    const progress = studentKey ? readProgress(a.id, studentKey) : null
    const subs = readSubmissions(a.id)
    const mySub = studentKey ? (subs[studentKey] || null) : null

    let status = 'pending'
    let progressText = ''

    if (progress && progress.isFinal) {
      status = 'completed'
    } else if (progress && Array.isArray(progress.successByPage) && progress.successByPage.length) {
      const total = progress.totalPages || progress.successByPage.length
      // 估算「已完成页数」：当前页之前的均视为达标
      const cur = Math.max(1, Math.min(total, progress.currentPage || 1))
      status = 'inprogress'
      progressText = `进行中 ${cur - 1}/${total}`
    }

    const score = mySub && mySub.aiScore != null ? mySub.aiScore : null

    return {
      id: a.id,
      title: a.title || '作业',
      date: a.date || '',
      status,
      score,
      progressText
    }
  })
}

Page({
  data: {
    layoutClass: '',
    studentName: '',
    className: '',
    assignmentList: []
  },

  onLoad() {
    this.setData(getClassPageLayout())
    const session = getStudentSession()
    if (!session) {
      wx.redirectTo({
        url: '/pages/class/login/login'
      })
      return
    }
    this.applySession(session)
  },

  onResize() {
    this.setData(getClassPageLayout())
  },

  onShow() {
    this.setData(getClassPageLayout())
    const session = getStudentSession()
    if (!session) {
      wx.redirectTo({
        url: '/pages/class/login/login'
      })
      return
    }
    this.applySession(session)
  },

  applySession(session) {
    const raw = readAssignmentsForClass(session.classId)
    const studentKey = session.studentId || session.studentNo || ''
    const assignmentList = mapAssignmentsForDashboard(raw, studentKey)
    this.setData({
      studentName: session.name || '同学',
      className: session.className || '班级',
      assignmentList
    })
  },

  goToAssignment(e) {
    const { id, status } = e.currentTarget.dataset
    if (!id) {
      return
    }

    // 已完成 —— 拦截跳转，弹窗提示等待批阅
    if (status === 'completed') {
      wx.showModal({
        title: '作业已完成',
        content: '本作业已经完成，等待教师批阅，结果会在批阅后通知。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }

    // 未开始或进行中：进入作业页（练习模式自动恢复进度）
    wx.navigateTo({
      url: `/pages/class/student/canvas/canvas?id=${encodeURIComponent(id)}`
    })
  }
})
