/**
 * 学生端会话缓存（仅缓存身份展示信息；权限以云端 openId 绑定为准）
 */

const STORAGE_STUDENT_SESSION = 'classStudentSession'

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
  } catch (e) {
    console.warn('[classStudentAuth] setStudentSession', e)
  }
}

function clearStudentSession() {
  try {
    wx.removeStorageSync(STORAGE_STUDENT_SESSION)
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
  } catch (e) {
    console.warn('[classStudentAuth] setTeacherSession', e)
  }
}

function clearTeacherSession() {
  try {
    wx.removeStorageSync(STORAGE_TEACHER_SESSION)
  } catch (e) {}
}

module.exports = {
  STORAGE_STUDENT_SESSION,
  STORAGE_TEACHER_SESSION,
  getStudentSession,
  setStudentSession,
  clearStudentSession,
  getTeacherSession,
  setTeacherSession,
  clearTeacherSession
}
