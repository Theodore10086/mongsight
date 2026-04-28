/**
 * 教师端本地数据按「当前登录教师」隔离（同机多教师模拟用 classTeacherName）
 * 正式环境可改为 openId
 */

const STORAGE_TEACHER_NAME = 'classTeacherName'
const LEGACY_CLASS_LIST_KEY = 'teacherClassList'

function getTeacherDisplayName() {
  return (wx.getStorageSync(STORAGE_TEACHER_NAME) || '').trim() || ''
}

/**
 * 用于拼 storage 的 key 段，避免特殊字符问题
 */
function getTeacherScopeSegment() {
  const name = getTeacherDisplayName()
  if (!name) {
    return '_unbound'
  }
  try {
    return encodeURIComponent(name).replace(/%/g, '_')
  } catch (e) {
    return String(name).replace(/[^\w\u4e00-\u9fa5-]/g, '_')
  }
}

function teacherClassListStorageKey() {
  return `teacherClassList__${getTeacherScopeSegment()}`
}

function studentStorageKeyForClass(classId) {
  return `class_students_${classId || 'default'}`
}

function assignmentStorageKeyForClass(classId) {
  return `class_assignments_${classId || 'default'}`
}

/**
 * 某班级的作业列表（本地缓存，与发布页写入一致）
 * @returns {Array<{id:string,title:string,type:string,scriptType?:string,submitCount:number,totalCount:number,date:string,requirements?:string,imageList?:Array}>}
 */
function readAssignmentsForClass(classId) {
  if (!classId) {
    return []
  }
  try {
    const raw = wx.getStorageSync(assignmentStorageKeyForClass(classId))
    return Array.isArray(raw) ? raw : []
  } catch (e) {
    return []
  }
}

function appendAssignmentForClass(classId, record) {
  if (!classId || !record || !record.id) {
    return
  }
  const list = readAssignmentsForClass(classId)
  list.unshift(record)
  try {
    wx.setStorageSync(assignmentStorageKeyForClass(classId), list)
  } catch (e) {
    console.warn('[teacher-scope] appendAssignmentForClass', e)
  }
}

const TEACHER_CLASS_LIST_TOUCHED_SUFFIX = '__touched'

function teacherClassListTouchedKey() {
  return `${teacherClassListStorageKey()}${TEACHER_CLASS_LIST_TOUCHED_SUFFIX}`
}

function markTeacherClassListTouched() {
  try {
    wx.setStorageSync(teacherClassListTouchedKey(), '1')
  } catch (e) {
    console.warn('[teacher-scope] markTeacherClassListTouched', e)
  }
}

/**
 * 读取当前教师的班级数组；若为空则尝试从旧全局 key 迁移一次
 */
function readTeacherClassList() {
  const key = teacherClassListStorageKey()
  let stored = []
  try {
    const raw = wx.getStorageSync(key)
    stored = Array.isArray(raw) ? raw : []
  } catch (e) {
    stored = []
  }

  if (stored.length === 0) {
    try {
      const legacy = wx.getStorageSync(LEGACY_CLASS_LIST_KEY)
      if (Array.isArray(legacy) && legacy.length > 0) {
        wx.setStorageSync(key, legacy)
        wx.removeStorageSync(LEGACY_CLASS_LIST_KEY)
        stored = legacy
      }
    } catch (e2) {}
  }

  if (stored.length > 0) {
    markTeacherClassListTouched()
  }

  return stored
}

function writeTeacherClassList(list) {
  markTeacherClassListTouched()
  try {
    wx.setStorageSync(teacherClassListStorageKey(), Array.isArray(list) ? list : [])
  } catch (e) {
    console.warn('[teacher-scope] writeTeacherClassList', e)
  }
}

/**
 * 从教师班级列表中移除班级，并删除该班学生名单、作业列表缓存。
 */
function deleteClassById(classId) {
  if (!classId) {
    return
  }
  const list = readTeacherClassList().filter((c) => c && c.id !== classId)
  writeTeacherClassList(list)
  try {
    wx.removeStorageSync(assignmentStorageKeyForClass(classId))
    wx.removeStorageSync(studentStorageKeyForClass(classId))
  } catch (e) {
    console.warn('[teacher-scope] deleteClassById storage', e)
  }
}

function removeAssignmentForClass(classId, assignmentId) {
  if (!classId || !assignmentId) {
    return
  }
  const list = readAssignmentsForClass(classId).filter((a) => a && a.id !== assignmentId)
  try {
    wx.setStorageSync(assignmentStorageKeyForClass(classId), list)
  } catch (e) {
    console.warn('[teacher-scope] removeAssignmentForClass', e)
  }
}

function hasTeacherClassListEverBeenSaved() {
  try {
    return wx.getStorageSync(teacherClassListTouchedKey()) === '1'
  } catch (e) {
    return false
  }
}

/* ── 学生提交记录（存于设备本地，教师与学生同机时可共享） ─────────── */

function submissionStorageKey(assignmentId) {
  return `assignment_submissions_${assignmentId || 'unknown'}`
}

/**
 * 读取某作业的所有学生提交记录
 * @returns {{ [studentId: string]: { studentId, studentName, studentNo, aiScore, savedFilePath, submittedAt } }}
 */
function readSubmissions(assignmentId) {
  try {
    const raw = wx.getStorageSync(submissionStorageKey(assignmentId))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch (e) {
    return {}
  }
}

/**
 * 写入/更新一条学生提交记录
 * @param {string} assignmentId
 * @param {string} studentId
 * @param {{ studentName?, studentNo?, aiScore?, savedFilePath?, submittedAt? }} record
 */
function saveSubmission(assignmentId, studentId, record) {
  if (!assignmentId || !studentId) return
  const all = readSubmissions(assignmentId)
  all[studentId] = Object.assign({}, all[studentId] || {}, record, { studentId })
  try {
    wx.setStorageSync(submissionStorageKey(assignmentId), all)
  } catch (e) {
    console.warn('[teacher-scope] saveSubmission', e)
  }
}

/* ── 学生作业进度（多页字帖逐页练习的实时进度） ────────────────────── */

function progressStorageKey(assignmentId, studentKey) {
  return `assignment_progress_${assignmentId || 'unknown'}_${studentKey || 'anon'}`
}

/**
 * 读取学生在某作业上的进度
 * @returns {{
 *   successByPage: number[],
 *   currentPage: number,
 *   totalPages: number,
 *   isFinal: boolean,
 *   updatedAt?: string
 * } | null}
 */
function readProgress(assignmentId, studentKey) {
  if (!assignmentId || !studentKey) return null
  try {
    const raw = wx.getStorageSync(progressStorageKey(assignmentId, studentKey))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
  } catch (e) {
    return null
  }
}

function saveProgress(assignmentId, studentKey, payload) {
  if (!assignmentId || !studentKey) return
  try {
    wx.setStorageSync(
      progressStorageKey(assignmentId, studentKey),
      Object.assign({}, payload, { updatedAt: new Date().toISOString() })
    )
  } catch (e) {
    console.warn('[teacher-scope] saveProgress', e)
  }
}

module.exports = {
  STORAGE_TEACHER_NAME,
  LEGACY_CLASS_LIST_KEY,
  getTeacherDisplayName,
  teacherClassListStorageKey,
  studentStorageKeyForClass,
  assignmentStorageKeyForClass,
  readAssignmentsForClass,
  appendAssignmentForClass,
  readTeacherClassList,
  writeTeacherClassList,
  deleteClassById,
  removeAssignmentForClass,
  hasTeacherClassListEverBeenSaved,
  readSubmissions,
  saveSubmission,
  readProgress,
  saveProgress
}
