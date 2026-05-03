/**
 * 学生端会话缓存（仅缓存身份展示信息；权限以云端 openId 绑定为准）
 */

const STORAGE_STUDENT_SESSION = 'classStudentSession'
const STORAGE_CLASS_LAST_ROLE = 'classLastRole'
const STORAGE_CLASS_ACCOUNT_HISTORY = 'classAccountHistory'
const MAX_HISTORY_COUNT = 8

function getClassAccountHistory() {
  try {
    const raw = wx.getStorageSync(STORAGE_CLASS_ACCOUNT_HISTORY)
    return Array.isArray(raw) ? raw.filter((item) => item && item.role && item.key) : []
  } catch (e) {
    return []
  }
}

function setClassAccountHistory(list) {
  try {
    wx.setStorageSync(STORAGE_CLASS_ACCOUNT_HISTORY, (Array.isArray(list) ? list : []).slice(0, MAX_HISTORY_COUNT))
  } catch (e) {}
}

function rememberClassAccount(account) {
  if (!account || !account.role || !account.key) {
    return
  }
  const now = Date.now()
  const nextAccount = Object.assign({}, account, { updatedAt: now })
  const rest = getClassAccountHistory().filter((item) => item.key !== nextAccount.key)
  setClassAccountHistory([nextAccount].concat(rest))
}

function getStudentSession() {
  try {
    const raw = wx.getStorageSync(STORAGE_STUDENT_SESSION)
    if (!raw || typeof raw !== 'object') {
      return null
    }
    if (!raw.studentNo) {
      return null
    }
    return raw
  } catch (e) {
    return null
  }
}

function setStudentSession(payload) {
  try {
    wx.setStorageSync(STORAGE_STUDENT_SESSION, payload)
    wx.setStorageSync(STORAGE_CLASS_LAST_ROLE, 'student')
    rememberClassAccount({
      role: 'student',
      key: `student:${payload.studentNo}`,
      name: payload.name || '',
      studentNo: payload.studentNo || '',
      password: payload.password || ''
    })
  } catch (e) {
    console.warn('[classStudentAuth] setStudentSession', e)
  }
}

function clearStudentSession() {
  try {
    wx.removeStorageSync(STORAGE_STUDENT_SESSION)
    if (getLastClassRole() === 'student') {
      wx.removeStorageSync(STORAGE_CLASS_LAST_ROLE)
    }
  } catch (e) {}
}

const STORAGE_TEACHER_SESSION = 'classTeacherSession'

function getTeacherSession() {
  try {
    const raw = wx.getStorageSync(STORAGE_TEACHER_SESSION)
    if (!raw || typeof raw !== 'object') {
      return null
    }
    if (!raw.teacherDocId || !raw.name) {
      return null
    }
    return raw
  } catch (e) {
    return null
  }
}

function setTeacherSession(payload) {
  try {
    wx.setStorageSync(STORAGE_TEACHER_SESSION, payload)
    wx.setStorageSync(STORAGE_CLASS_LAST_ROLE, 'teacher')
    rememberClassAccount({
      role: 'teacher',
      key: `teacher:${payload.name}`,
      name: payload.name || '',
      password: payload.password || ''
    })
  } catch (e) {
    console.warn('[classStudentAuth] setTeacherSession', e)
  }
}

function clearTeacherSession() {
  try {
    wx.removeStorageSync(STORAGE_TEACHER_SESSION)
    if (getLastClassRole() === 'teacher') {
      wx.removeStorageSync(STORAGE_CLASS_LAST_ROLE)
    }
  } catch (e) {}
}

function getLastClassRole() {
  try {
    const role = wx.getStorageSync(STORAGE_CLASS_LAST_ROLE)
    return role === 'teacher' || role === 'student' ? role : ''
  } catch (e) {
    return ''
  }
}

module.exports = {
  STORAGE_STUDENT_SESSION,
  STORAGE_TEACHER_SESSION,
  STORAGE_CLASS_LAST_ROLE,
  STORAGE_CLASS_ACCOUNT_HISTORY,
  getStudentSession,
  setStudentSession,
  clearStudentSession,
  getTeacherSession,
  setTeacherSession,
  clearTeacherSession,
  getLastClassRole,
  getClassAccountHistory,
  rememberClassAccount
}
