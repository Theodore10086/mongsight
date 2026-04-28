/**
 * 学生端：与教师导入名单（class_students_*）对齐的登录校验与本地会话
 */

const STORAGE_STUDENT_SESSION = 'classStudentSession'
const LEGACY_TEACHER_LIST = 'teacherClassList'
const STUDENT_PREFIX = 'class_students_'
const TEACHER_LIST_PREFIX = 'teacherClassList__'

function getStudentSession() {
  try {
    const raw = wx.getStorageSync(STORAGE_STUDENT_SESSION)
    if (!raw || typeof raw !== 'object') {
      return null
    }
    if (!(raw.classId && raw.studentNo)) {
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

/**
 * 在所有已落库的班级名单中查找与姓名、学号、密码一致的记录（与教师批量导入格式一致）
 * @returns {{ student: object, classId: string } | null}
 */
function findImportedStudent(name, studentNo, password) {
  const n = (name || '').trim()
  const no = (studentNo || '').trim()
  const pwd = String(password || '').trim()
  if (!n || !no || !pwd) {
    return null
  }
  try {
    const info = wx.getStorageInfoSync()
    const keys = (info.keys || []).filter((k) => k.indexOf(STUDENT_PREFIX) === 0)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const classId = key.slice(STUDENT_PREFIX.length)
      if (!classId) {
        continue
      }
      const list = wx.getStorageSync(key)
      if (!Array.isArray(list)) {
        continue
      }
      const student = list.find((s) => {
        if (!s) {
          return false
        }
        const sn = String(s.studentNo || '').trim()
        const pw = String(s.password || '').trim()
        const nm = (s.name || '').trim()
        return nm === n && sn === no && pw === pwd
      })
      if (student) {
        return { student, classId }
      }
    }
  } catch (e) {
    console.warn('[classStudentAuth] findImportedStudent', e)
  }
  return null
}

/**
 * 根据班级 id 解析名称（遍历各教师的 teacherClassList__* 及旧版 key）
 */
function resolveClassNameByClassId(classId) {
  if (!classId) {
    return '班级'
  }
  try {
    const info = wx.getStorageInfoSync()
    const keys = info.keys || []
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (key.indexOf(TEACHER_LIST_PREFIX) !== 0) {
        continue
      }
      const list = wx.getStorageSync(key)
      if (!Array.isArray(list)) {
        continue
      }
      const found = list.find((c) => c && c.id === classId)
      if (found && found.name) {
        return found.name
      }
    }
    try {
      const legacy = wx.getStorageSync(LEGACY_TEACHER_LIST)
      if (Array.isArray(legacy)) {
        const found = legacy.find((c) => c && c.id === classId)
        if (found && found.name) {
          return found.name
        }
      }
    } catch (e2) {}
  } catch (e) {
    console.warn('[classStudentAuth] resolveClassNameByClassId', e)
  }
  return '班级'
}

module.exports = {
  STORAGE_STUDENT_SESSION,
  findImportedStudent,
  resolveClassNameByClassId,
  getStudentSession,
  setStudentSession,
  clearStudentSession
}
