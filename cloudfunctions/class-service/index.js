/**
 * 班级云端服务
 * 设计要点：
 *   1. 教师 / 学生账号分别落到 teachers / students；班级成员关系落到 class_memberships
 *   2. 唯一约束（教师名、学号、班级名、作业名）由控制台索引兜底，业务层做友好错误提示
 *   3. 登录后将当前 openId 追加到 boundOpenIds，支持多端登录
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_STUDENT_PASSWORD = 'mgcs123456'

const COLL = {
  teachers: 'teachers',
  students: 'students',
  classes: 'classes',
  memberships: 'class_memberships',
  assignments: 'class_assignments',
  submissions: 'class_submissions',
  progress: 'class_progress',
  reviews: 'class_reviews'
}

/* ───────── 工具 ───────── */

function nowDate() {
  return db.serverDate()
}

function ensureOpenId(openId) {
  if (!openId) {
    throw new Error('missing openid')
  }
}

function trimStr(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeFileID(value) {
  const v = trimStr(value)
  return v || ''
}

async function resolveCloudFileURLs(imageList) {
  const rows = Array.isArray(imageList) ? imageList : []
  const fileIDs = rows.map((it) => normalizeFileID(it && (it.fileID || it.url))).filter(Boolean)
  if (fileIDs.length === 0) {
    return rows.map((it) => ({
      fileID: normalizeFileID(it && (it.fileID || it.url)),
      count: Math.max(1, Math.min(999, Number(it && it.count) || 1)),
      tempFileURL: ''
    }))
  }
  const res = await cloud.getTempFileURL({ fileList: fileIDs })
  const map = new Map()
  ;(res.fileList || []).forEach((item) => {
    if (item.status === 0 && item.tempFileURL) {
      map.set(item.fileID, item.tempFileURL)
    }
  })
  return rows.map((it) => {
    const fileID = normalizeFileID(it && (it.fileID || it.url))
    return {
      fileID,
      count: Math.max(1, Math.min(999, Number(it && it.count) || 1)),
      tempFileURL: map.get(fileID) || ''
    }
  })
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function normalizeReviewStatus(submissionStatus, teacherStatus) {
  const sub = trimStr(submissionStatus)
  const rev = trimStr(teacherStatus)
  if (sub === 'passed' || rev === 'passed') return 'passed'
  if (sub === 'rejected' || rev === 'rejected') return 'rejected'
  if (sub === 'pending' || rev === 'pending') return 'pending'
  return ''
}

function resolveStudentAssignmentStatus(options) {
  const {
    hasSubmission,
    submissionStatus,
    teacherStatus,
    resubmitted,
    hasProgress
  } = options || {}

  const reviewStatus = normalizeReviewStatus(submissionStatus, teacherStatus)

  if (!hasSubmission && !reviewStatus && !hasProgress) {
    return { status: 'pending_submit', reviewStatus: '' }
  }
  if (reviewStatus === 'passed') {
    return { status: 'passed', reviewStatus }
  }
  if (reviewStatus === 'rejected') {
    return { status: resubmitted ? 'pending_review' : 'rejected', reviewStatus }
  }
  if (reviewStatus === 'pending') {
    return { status: 'pending_review', reviewStatus }
  }
  return { status: hasSubmission || hasProgress ? 'pending_review' : 'pending_submit', reviewStatus: reviewStatus || '' }
}

function resolveTeacherAssignmentStatus(options) {
  const {
    hasSubmission,
    submissionStatus,
    teacherStatus,
    resubmitted
  } = options || {}

  const reviewStatus = normalizeReviewStatus(submissionStatus, teacherStatus)
  if (!hasSubmission) {
    return { status: 'pending_submit', reviewStatus }
  }
  if (reviewStatus === 'passed') {
    return { status: 'passed', reviewStatus }
  }
  if (reviewStatus === 'rejected') {
    return { status: resubmitted ? 'pending_review' : 'rejected', reviewStatus }
  }
  if (reviewStatus === 'pending') {
    return { status: 'pending_review', reviewStatus }
  }
  return { status: 'pending_review', reviewStatus }
}

/**
 * 把 boundOpenIds 中加入当前 openId（去重）
 */
async function bindOpenIdToDoc(collectionName, docId, openId) {
  await db.collection(collectionName).doc(docId).update({
    data: {
      boundOpenIds: _.addToSet(openId),
      lastLoginAt: nowDate()
    }
  })
}

/**
 * 通过 openId 反查教师档案；找不到则抛错（前端应引导回登录）
 */
async function resolveTeacherByOpenId(openId) {
  ensureOpenId(openId)
  const res = await db.collection(COLL.teachers)
    .where({ boundOpenIds: _.in([openId]) })
    .limit(1)
    .get()
  const doc = res.data && res.data[0]
  if (!doc) {
    throw new Error('教师身份未登录')
  }
  return doc
}

/**
 * 通过 openId 反查学生档案
 */
async function resolveStudentByOpenId(openId) {
  ensureOpenId(openId)
  const res = await db.collection(COLL.students)
    .where({ boundOpenIds: _.in([openId]) })
    .limit(1)
    .get()
  const doc = res.data && res.data[0]
  if (!doc) {
    throw new Error('学生身份未登录')
  }
  return doc
}

/**
 * 校验班级归属当前教师，返回班级文档
 */
async function requireOwnedClass(classId, teacherDoc) {
  if (!classId) {
    throw new Error('缺少班级 id')
  }
  const cls = await db.collection(COLL.classes).doc(classId).get().catch(() => null)
  if (!cls || !cls.data) {
    throw new Error('班级不存在')
  }
  if (cls.data.teacherDocId !== teacherDoc._id) {
    throw new Error('无权访问该班级')
  }
  return cls.data
}

/* ───────── 教师注册/登录 ───────── */

async function registerOrLoginTeacher(openId, event) {
  ensureOpenId(openId)
  const name = trimStr(event.name)
  const password = trimStr(event.password)
  if (!name) {
    throw new Error('请输入姓名')
  }
  if (!password) {
    throw new Error('请输入密码')
  }

  const exists = await db.collection(COLL.teachers).where({ name }).limit(1).get()
  const existed = exists.data && exists.data[0]

  if (existed) {
    if (existed.password !== password) {
      throw new Error('名称已占用')
    }
    await bindOpenIdToDoc(COLL.teachers, existed._id, openId)
    return {
      teacherDocId: existed._id,
      name: existed.name,
      isNew: false
    }
  }

  const addRes = await db.collection(COLL.teachers).add({
    data: {
      name,
      password,
      boundOpenIds: [openId],
      createdAt: nowDate(),
      lastLoginAt: nowDate()
    }
  }).catch((err) => {
    if (/duplicate/i.test(err.errMsg || '') || err.errCode === 11000) {
      throw new Error('名称已占用')
    }
    throw err
  })

  return {
    teacherDocId: addRes._id,
    name,
    isNew: true
  }
}

async function getMyTeacherProfile(openId) {
  const teacher = await resolveTeacherByOpenId(openId)
  return {
    teacherDocId: teacher._id,
    name: teacher.name
  }
}

/* ───────── 学生登录 / 改密 ───────── */

async function loginStudent(openId, event) {
  ensureOpenId(openId)
  const name = trimStr(event.name)
  const studentNo = trimStr(event.studentNo)
  const password = trimStr(event.password)
  if (!name || !studentNo || !password) {
    throw new Error('请填写姓名、学号与密码')
  }

  const res = await db.collection(COLL.students).where({ studentNo }).limit(1).get()
  const stu = res.data && res.data[0]
  if (!stu) {
    throw new Error('账号或密码错误')
  }
  if (stu.name !== name || stu.password !== password) {
    throw new Error('账号或密码错误')
  }

  await bindOpenIdToDoc(COLL.students, stu._id, openId)

  return {
    studentDocId: stu._id,
    studentNo: stu.studentNo,
    name: stu.name
  }
}

async function getMyStudentProfile(openId) {
  const stu = await resolveStudentByOpenId(openId)
  return {
    studentDocId: stu._id,
    studentNo: stu.studentNo,
    name: stu.name
  }
}

async function changeStudentPassword(openId, event) {
  const stu = await resolveStudentByOpenId(openId)
  const oldPassword = trimStr(event.oldPassword)
  const newPassword = trimStr(event.newPassword)
  if (!newPassword) {
    throw new Error('请输入新密码')
  }
  if (newPassword.length < 6) {
    throw new Error('新密码至少 6 位')
  }
  if (stu.password !== oldPassword) {
    throw new Error('原密码不正确')
  }
  await db.collection(COLL.students).doc(stu._id).update({
    data: { password: newPassword, passwordUpdatedAt: nowDate() }
  })
  return { ok: true }
}

async function teacherSetStudentPassword(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const studentNo = trimStr(event.studentNo)
  const newPassword = trimStr(event.newPassword)
  if (!studentNo || !newPassword) {
    throw new Error('参数缺失')
  }
  if (newPassword.length < 6) {
    throw new Error('密码至少 6 位')
  }
  const stuRes = await db.collection(COLL.students).where({ studentNo }).limit(1).get()
  const stu = stuRes.data && stuRes.data[0]
  if (!stu) {
    throw new Error('未找到该学生')
  }

  // 校验该学生确实在当前教师所属的某个班级里
  const myClasses = await db.collection(COLL.classes).where({ teacherDocId: teacher._id }).get()
  const myClassIds = (myClasses.data || []).map((c) => c._id)
  if (myClassIds.length === 0) {
    throw new Error('无权修改')
  }
  const overlap = await db.collection(COLL.memberships)
    .where({ classId: _.in(myClassIds), studentNo })
    .limit(1)
    .get()
  if (!overlap.data || overlap.data.length === 0) {
    throw new Error('无权修改该学生密码')
  }

  await db.collection(COLL.students).doc(stu._id).update({
    data: { password: newPassword, passwordUpdatedAt: nowDate() }
  })
  return { ok: true }
}

/* ───────── 教师班级管理 ───────── */

async function getMyClasses(openId) {
  const teacher = await resolveTeacherByOpenId(openId)
  const res = await db.collection(COLL.classes)
    .where({ teacherDocId: teacher._id })
    .orderBy('createdAt', 'desc')
    .get()
  const classes = res.data || []
  if (classes.length === 0) {
    return { classes: [] }
  }

  const classIds = classes.map((c) => c._id)
  const memberRes = await db.collection(COLL.memberships)
    .where({ classId: _.in(classIds) })
    .get()
  const counter = {}
  ;(memberRes.data || []).forEach((m) => {
    counter[m.classId] = (counter[m.classId] || 0) + 1
  })

  return {
    classes: classes.map((c) => ({
      id: c._id,
      name: c.name,
      desc: c.desc || '',
      studentCount: counter[c._id] || 0
    }))
  }
}

/**
 * 创建班级 + 批量导入学生（新学号则创建账号，已存在则只建关系）
 */
async function createClass(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const name = trimStr(event.name)
  const desc = trimStr(event.desc)
  const students = Array.isArray(event.students) ? event.students : []
  if (!name) {
    throw new Error('请填写班级名称')
  }

  const dup = await db.collection(COLL.classes)
    .where({ teacherDocId: teacher._id, name })
    .limit(1).get()
  if (dup.data && dup.data.length > 0) {
    throw new Error('名称已被占用')
  }

  const addRes = await db.collection(COLL.classes).add({
    data: {
      teacherDocId: teacher._id,
      teacherName: teacher.name,
      name,
      desc,
      createdAt: nowDate()
    }
  }).catch((err) => {
    if (/duplicate/i.test(err.errMsg || '') || err.errCode === 11000) {
      throw new Error('名称已被占用')
    }
    throw err
  })
  const classId = addRes._id

  const result = await ingestStudents(classId, students)
  return { classId, ...result }
}

async function deleteClass(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const classId = trimStr(event.classId)
  await requireOwnedClass(classId, teacher)

  const memberships = await db.collection(COLL.memberships).where({ classId }).get()
  const memberIds = (memberships.data || []).map((m) => m._id)

  const assignmentRes = await db.collection(COLL.assignments).where({ classId }).get()
  const assignmentIds = (assignmentRes.data || []).map((a) => a._id)

  const ops = []
  memberIds.forEach((id) => ops.push(db.collection(COLL.memberships).doc(id).remove()))
  assignmentIds.forEach((id) => ops.push(db.collection(COLL.assignments).doc(id).remove()))
  if (assignmentIds.length > 0) {
    ops.push(db.collection(COLL.submissions).where({ assignmentId: _.in(assignmentIds) }).remove())
    ops.push(db.collection(COLL.progress).where({ assignmentId: _.in(assignmentIds) }).remove())
    ops.push(db.collection(COLL.reviews).where({ assignmentId: _.in(assignmentIds) }).remove())
  }
  ops.push(db.collection(COLL.classes).doc(classId).remove())

  await Promise.all(ops.map((p) => p.catch((e) => console.warn('[deleteClass] partial fail', e))))

  return { ok: true }
}

/**
 * 班级详情：班级 + 学生（含密码） + 作业（带提交统计）
 */
async function getClassDetail(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const classId = trimStr(event.classId)
  const cls = await requireOwnedClass(classId, teacher)

  // 名单：memberships 拿 studentNo，再批量查 students
  const memberRes = await db.collection(COLL.memberships)
    .where({ classId })
    .orderBy('joinedAt', 'asc')
    .get()
  const members = memberRes.data || []
  const studentNos = members.map((m) => m.studentNo)

  let students = []
  if (studentNos.length > 0) {
    const sRes = await db.collection(COLL.students)
      .where({ studentNo: _.in(studentNos) })
      .get()
    students = sRes.data || []
  }
  const stuMap = new Map()
  students.forEach((s) => stuMap.set(s.studentNo, s))

  const studentList = members.map((m) => {
    const s = stuMap.get(m.studentNo) || {}
    return {
      id: m._id,
      studentDocId: s._id || '',
      name: s.name || '',
      studentNo: m.studentNo,
      password: s.password || '',
      bound: Array.isArray(s.boundOpenIds) && s.boundOpenIds.length > 0
    }
  })

  // 作业列表（带提交计数）
  const aRes = await db.collection(COLL.assignments)
    .where({ classId })
    .orderBy('createdAt', 'desc')
    .get()
  const assignments = aRes.data || []
  const assignmentIds = assignments.map((a) => a._id)

  let progressList = []
  if (assignmentIds.length > 0) {
    const pRes = await db.collection(COLL.progress)
      .where({ assignmentId: _.in(assignmentIds), isFinal: true })
      .get()
    progressList = pRes.data || []
  }
  const submitCounter = {}
  progressList.forEach((p) => {
    submitCounter[p.assignmentId] = (submitCounter[p.assignmentId] || 0) + 1
  })

  const totalCount = studentList.length

  return {
    classInfo: {
      id: cls._id,
      name: cls.name,
      desc: cls.desc || ''
    },
    studentList,
    assignmentList: assignments.map((a) => ({
      id: a._id,
      title: a.title,
      type: a.type || '字帖作业',
      scriptType: a.scriptType || 'mongolian',
      requirements: a.requirements || '',
      imageList: a.imageList || [],
      date: a.date || '',
      submitCount: submitCounter[a._id] || 0,
      totalCount
    }))
  }
}

/**
 * 内部：将一批 { name, studentNo } 学生写入 students + class_memberships
 * - 学号已存在 → 复用现有学生账号（不动密码、不动姓名）
 * - 学号未存在 → 新建账号，密码默认 mgcs123456
 * - 班级里已存在该学号 → 跳过（duplicate）
 */
async function ingestStudents(classId, rawList) {
  const sanitized = []
  const seen = new Set()
  ;(rawList || []).forEach((row) => {
    const name = trimStr(row && row.name)
    const studentNo = trimStr(row && row.studentNo)
    const password = trimStr(row && row.password)
    if (!name || !studentNo) return
    if (seen.has(studentNo)) return
    seen.add(studentNo)
    sanitized.push({
      name,
      studentNo,
      password: password || DEFAULT_STUDENT_PASSWORD
    })
  })
  if (sanitized.length === 0) {
    return { added: 0, reused: 0, duplicated: 0 }
  }

  const studentNos = sanitized.map((s) => s.studentNo)
  const existRes = await db.collection(COLL.students)
    .where({ studentNo: _.in(studentNos) })
    .get()
  const existMap = new Map()
  ;(existRes.data || []).forEach((s) => existMap.set(s.studentNo, s))

  // 过滤已在该班的成员
  const memRes = await db.collection(COLL.memberships)
    .where({ classId, studentNo: _.in(studentNos) })
    .get()
  const existedInClass = new Set((memRes.data || []).map((m) => m.studentNo))

  let added = 0
  let reused = 0
  let duplicated = 0

  for (const row of sanitized) {
    if (existedInClass.has(row.studentNo)) {
      duplicated += 1
      continue
    }
    const existing = existMap.get(row.studentNo)
    if (!existing) {
      try {
        await db.collection(COLL.students).add({
          data: {
            studentNo: row.studentNo,
            name: row.name,
            password: row.password,
            boundOpenIds: [],
            createdAt: nowDate()
          }
        })
        added += 1
      } catch (e) {
        if (/duplicate/i.test(e.errMsg || '') || e.errCode === 11000) {
          // 极少数并发：当作复用
          reused += 1
        } else {
          throw e
        }
      }
    } else {
      reused += 1
    }
    try {
      await db.collection(COLL.memberships).add({
        data: {
          classId,
          studentNo: row.studentNo,
          joinedAt: nowDate()
        }
      })
    } catch (e) {
      if (/duplicate/i.test(e.errMsg || '') || e.errCode === 11000) {
        duplicated += 1
      } else {
        throw e
      }
    }
  }

  return { added, reused, duplicated }
}

async function appendStudents(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const classId = trimStr(event.classId)
  await requireOwnedClass(classId, teacher)
  const result = await ingestStudents(classId, event.students || [])
  return result
}

async function deleteStudents(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const classId = trimStr(event.classId)
  await requireOwnedClass(classId, teacher)
  const studentNos = Array.isArray(event.studentNos) ? event.studentNos.filter(Boolean) : []
  if (studentNos.length === 0) {
    return { removed: 0 }
  }
  const removeRes = await db.collection(COLL.memberships)
    .where({ classId, studentNo: _.in(studentNos) })
    .remove()
  return { removed: removeRes.stats ? removeRes.stats.removed : studentNos.length }
}

/* ───────── 作业 ───────── */

async function createAssignment(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const classId = trimStr(event.classId)
  await requireOwnedClass(classId, teacher)

  const title = trimStr(event.title)
  const requirements = trimStr(event.requirements)
  const scriptType = trimStr(event.scriptType) || 'mongolian'
  const imageList = Array.isArray(event.imageList) ? event.imageList : []
  if (!title) {
    throw new Error('请填写作业名称')
  }
  if (imageList.length === 0) {
    throw new Error('请至少添加一张字帖图')
  }

  const dup = await db.collection(COLL.assignments)
    .where({ classId, title })
    .limit(1).get()
  if (dup.data && dup.data.length > 0) {
    throw new Error('名称已被占用')
  }

  const today = (function () {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  })()

  const safeImageList = imageList.map((it) => ({
    fileID: trimStr(it && it.fileID),
    count: Math.max(1, Math.min(999, Number(it && it.count) || 1))
  })).filter((it) => !!it.fileID)
  if (safeImageList.length === 0) {
    throw new Error('字帖图未上传成功')
  }

  const addRes = await db.collection(COLL.assignments).add({
    data: {
      classId,
      title,
      type: '字帖作业',
      scriptType,
      requirements,
      imageList: safeImageList,
      date: today,
      createdAt: nowDate()
    }
  }).catch((err) => {
    if (/duplicate/i.test(err.errMsg || '') || err.errCode === 11000) {
      throw new Error('名称已被占用')
    }
    throw err
  })

  return { assignmentId: addRes._id }
}

async function deleteAssignment(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const classId = trimStr(event.classId)
  const assignmentId = trimStr(event.assignmentId)
  await requireOwnedClass(classId, teacher)
  if (!assignmentId) {
    throw new Error('缺少作业 id')
  }
  const a = await db.collection(COLL.assignments).doc(assignmentId).get().catch(() => null)
  if (!a || !a.data || a.data.classId !== classId) {
    throw new Error('作业不存在')
  }

  await Promise.all([
    db.collection(COLL.assignments).doc(assignmentId).remove(),
    db.collection(COLL.submissions).where({ assignmentId }).remove(),
    db.collection(COLL.progress).where({ assignmentId }).remove(),
    db.collection(COLL.reviews).where({ assignmentId }).remove()
  ].map((p) => p.catch((e) => console.warn('[deleteAssignment] partial fail', e))))

  return { ok: true }
}

/**
 * 教师批改页：作业信息 + 班级所有学生 + 各自的提交、进度、批改决定
 */
async function getAssignmentReview(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const assignmentId = trimStr(event.assignmentId)
  if (!assignmentId) {
    throw new Error('缺少作业 id')
  }
  const aRes = await db.collection(COLL.assignments).doc(assignmentId).get().catch(() => null)
  if (!aRes || !aRes.data) {
    throw new Error('作业不存在')
  }
  const assignment = aRes.data
  await requireOwnedClass(assignment.classId, teacher)

  const memberRes = await db.collection(COLL.memberships)
    .where({ classId: assignment.classId })
    .get()
  const members = memberRes.data || []
  const studentNos = members.map((m) => m.studentNo)

  let students = []
  if (studentNos.length > 0) {
    const sRes = await db.collection(COLL.students)
      .where({ studentNo: _.in(studentNos) })
      .get()
    students = sRes.data || []
  }
  const stuMap = new Map()
  students.forEach((s) => stuMap.set(s.studentNo, s))

  const [progressRes, submissionRes, reviewRes] = await Promise.all([
    db.collection(COLL.progress).where({ assignmentId }).get(),
    db.collection(COLL.submissions).where({ assignmentId }).get(),
    db.collection(COLL.reviews).where({ assignmentId }).get()
  ])
  const progMap = new Map()
  ;(progressRes.data || []).forEach((p) => progMap.set(p.studentNo, p))
  const subMap = new Map()
  ;(submissionRes.data || []).forEach((s) => subMap.set(s.studentNo, s))
  const revMap = new Map()
  ;(reviewRes.data || []).forEach((r) => revMap.set(r.studentNo, r))

  const submissionList = members.map((m) => {
    const stu = stuMap.get(m.studentNo) || {}
    const prog = progMap.get(m.studentNo)
    const sub = subMap.get(m.studentNo)
    const rev = revMap.get(m.studentNo)
    const hasFinal = !!(prog && prog.isFinal)
    const hasSubmission = !!sub || hasFinal
    const submissionReviewStatus = sub ? String(sub.reviewStatus || '') : ''
    const teacherReviewStatus = rev ? String(rev.status || '') : ''
    const resubmitted = !!(sub && sub.resubmitted)

    const resolved = resolveTeacherAssignmentStatus({
      hasSubmission,
      submissionStatus: submissionReviewStatus,
      teacherStatus: teacherReviewStatus,
      resubmitted
    })

    return {
      id: m._id,
      studentNo: m.studentNo,
      studentName: stu.name || '',
      aiScore: sub && hasFinal ? (sub.aiScore != null ? sub.aiScore : 0) : 0,
      status: resolved.status,
      reviewStatus: resolved.reviewStatus,
      resubmitted,
      imageFileID: sub && hasFinal ? (sub.imageFileID || '') : ''
    }
  })

  return {
    assignmentTitle: assignment.title || '',
    submissionList
  }
}

async function setReviewStatus(openId, event) {
  const teacher = await resolveTeacherByOpenId(openId)
  const assignmentId = trimStr(event.assignmentId)
  const status = trimStr(event.status)
  const studentNos = Array.isArray(event.studentNos) ? event.studentNos.filter(Boolean) : []
  if (!assignmentId || !status || studentNos.length === 0) {
    throw new Error('参数缺失')
  }
  if (status !== 'passed' && status !== 'rejected' && status !== 'pending') {
    throw new Error('非法状态')
  }
  const aRes = await db.collection(COLL.assignments).doc(assignmentId).get().catch(() => null)
  if (!aRes || !aRes.data) {
    throw new Error('作业不存在')
  }
  await requireOwnedClass(aRes.data.classId, teacher)

  // 逐条 upsert，并统计真正写入成功的数量
  let updated = 0
  for (const studentNo of studentNos) {
    const reviewExist = await db.collection(COLL.reviews)
      .where({ assignmentId, studentNo })
      .limit(1).get()
    const submissionExist = await db.collection(COLL.submissions)
      .where({ assignmentId, studentNo })
      .limit(1).get()
    const reviewData = {
      status,
      teacherDocId: teacher._id,
      reviewedAt: nowDate()
    }
    const submissionReviewData = {
      reviewStatus: status,
      submittedAt: nowDate(),
      resubmitted: !!(submissionExist.data && submissionExist.data[0] && submissionExist.data[0].resubmitted)
    }
    if (reviewExist.data && reviewExist.data[0]) {
      await db.collection(COLL.reviews).doc(reviewExist.data[0]._id).update({ data: reviewData })
    } else {
      await db.collection(COLL.reviews).add({
        data: Object.assign({ assignmentId, studentNo }, reviewData)
      })
    }
    if (submissionExist.data && submissionExist.data[0]) {
      await db.collection(COLL.submissions).doc(submissionExist.data[0]._id).update({ data: submissionReviewData })
    }

    const verify = await db.collection(COLL.reviews)
      .where({ assignmentId, studentNo })
      .limit(1).get()
    if (verify.data && verify.data[0] && verify.data[0].status === status) {
      updated += 1
    }
  }

  if (updated === 0) {
    throw new Error('批改结果未写入云端，请检查数据库权限或索引')
  }

  return { updated }
}

/* ───────── 学生端读 / 写 ───────── */

async function getMyJoinedClasses(openId) {
  const stu = await resolveStudentByOpenId(openId)
  const memRes = await db.collection(COLL.memberships)
    .where({ studentNo: stu.studentNo })
    .orderBy('joinedAt', 'desc')
    .get()
  const memberships = memRes.data || []
  if (memberships.length === 0) {
    return { studentName: stu.name, classes: [] }
  }
  const classIds = memberships.map((m) => m.classId)
  const cRes = await db.collection(COLL.classes)
    .where({ _id: _.in(classIds) })
    .get()
  const cMap = new Map()
  ;(cRes.data || []).forEach((c) => cMap.set(c._id, c))

  // 顺便每班拉作业总数 / 已完成数
  const aRes = await db.collection(COLL.assignments)
    .where({ classId: _.in(classIds) })
    .get()
  const totalByClass = {}
  const allAssignmentIds = []
  ;(aRes.data || []).forEach((a) => {
    totalByClass[a.classId] = (totalByClass[a.classId] || 0) + 1
    allAssignmentIds.push(a._id)
  })

  let myProgress = []
  if (allAssignmentIds.length > 0) {
    const pRes = await db.collection(COLL.progress)
      .where({ assignmentId: _.in(allAssignmentIds), studentNo: stu.studentNo, isFinal: true })
      .get()
    myProgress = pRes.data || []
  }
  // 把 finalCount 按 classId 聚合
  const finalByAssignment = new Set(myProgress.map((p) => p.assignmentId))
  const finalByClass = {}
  ;(aRes.data || []).forEach((a) => {
    if (finalByAssignment.has(a._id)) {
      finalByClass[a.classId] = (finalByClass[a.classId] || 0) + 1
    }
  })

  return {
    studentName: stu.name,
    classes: memberships
      .filter((m) => cMap.has(m.classId))
      .map((m) => {
        const c = cMap.get(m.classId)
        return {
          id: c._id,
          name: c.name,
          desc: c.desc || '',
          teacherName: c.teacherName || '',
          totalAssignments: totalByClass[c._id] || 0,
          finalAssignments: finalByClass[c._id] || 0
        }
      })
  }
}

async function getClassAssignments(openId, event) {
  const stu = await resolveStudentByOpenId(openId)
  const classId = trimStr(event.classId)
  if (!classId) {
    throw new Error('缺少班级 id')
  }
  // 校验该学生在该班级
  const memRes = await db.collection(COLL.memberships)
    .where({ classId, studentNo: stu.studentNo })
    .limit(1).get()
  if (!memRes.data || memRes.data.length === 0) {
    throw new Error('您不在该班级')
  }
  const cRes = await db.collection(COLL.classes).doc(classId).get().catch(() => null)
  if (!cRes || !cRes.data) {
    throw new Error('班级不存在')
  }

  const aRes = await db.collection(COLL.assignments)
    .where({ classId })
    .orderBy('createdAt', 'desc')
    .get()
  const assignments = aRes.data || []
  if (assignments.length === 0) {
    return { className: cRes.data.name, assignmentList: [] }
  }
  const assignmentIds = assignments.map((a) => a._id)

  const [progRes, subRes, revRes] = await Promise.all([
    db.collection(COLL.progress)
      .where({ assignmentId: _.in(assignmentIds), studentNo: stu.studentNo })
      .get(),
    db.collection(COLL.submissions)
      .where({ assignmentId: _.in(assignmentIds), studentNo: stu.studentNo })
      .get(),
    db.collection(COLL.reviews)
      .where({ assignmentId: _.in(assignmentIds), studentNo: stu.studentNo })
      .get()
  ])
  const progMap = new Map()
  ;(progRes.data || []).forEach((p) => progMap.set(p.assignmentId, p))
  const subMap = new Map()
  ;(subRes.data || []).forEach((s) => subMap.set(s.assignmentId, s))
  const revMap = new Map()
  ;(revRes.data || []).forEach((r) => revMap.set(r.assignmentId, r))

  const assignmentList = assignments.map((a) => {
    const prog = progMap.get(a._id)
    const sub = subMap.get(a._id)
    const rev = revMap.get(a._id)
    const hasProgress = !!(prog && Array.isArray(prog.successByPage) && prog.successByPage.length)
    const hasSubmitted = !!sub || !!(prog && prog.isFinal)
    const reviewStatus = rev ? String(rev.status || '') : ''
    const submissionReviewStatus = sub ? String(sub.reviewStatus || '') : ''
    const resubmitted = !!(sub && sub.resubmitted)
    const resolved = resolveStudentAssignmentStatus({
      hasSubmission: hasSubmitted,
      submissionStatus: submissionReviewStatus,
      teacherStatus: reviewStatus,
      resubmitted,
      hasProgress
    })

    let progressText = '待提交'
    if (resolved.status === 'passed') {
      progressText = '已通过'
    } else if (resolved.status === 'rejected') {
      progressText = '已驳回，待重做'
    } else if (resolved.status === 'pending_review') {
      progressText = resubmitted ? '已重新提交，待批改' : '已提交，待批改'
    }

    return {
      id: a._id,
      title: a.title || '作业',
      date: a.date || '',
      status: resolved.status,
      progressText,
      score: sub && sub.aiScore != null ? sub.aiScore : null,
      reviewStatus: resolved.reviewStatus,
      resubmitted,
      requirements: a.requirements || '',
      scriptType: a.scriptType || 'mongolian',
      imageList: a.imageList || []
    }
  })

  return {
    className: cRes.data.name,
    assignmentList
  }
}

async function getAssignmentForStudent(openId, event) {
  const stu = await resolveStudentByOpenId(openId)
  const assignmentId = trimStr(event.assignmentId)
  if (!assignmentId) {
    throw new Error('缺少作业 id')
  }
  const aRes = await db.collection(COLL.assignments).doc(assignmentId).get().catch(() => null)
  if (!aRes || !aRes.data) {
    throw new Error('作业不存在')
  }
  const assignment = aRes.data
  // 校验在班
  const memRes = await db.collection(COLL.memberships)
    .where({ classId: assignment.classId, studentNo: stu.studentNo })
    .limit(1).get()
  if (!memRes.data || memRes.data.length === 0) {
    throw new Error('您不在该班级')
  }

  const [progRes, subRes, revRes] = await Promise.all([
    db.collection(COLL.progress).where({ assignmentId, studentNo: stu.studentNo }).limit(1).get(),
    db.collection(COLL.submissions).where({ assignmentId, studentNo: stu.studentNo }).limit(1).get(),
    db.collection(COLL.reviews).where({ assignmentId, studentNo: stu.studentNo }).limit(1).get()
  ])
  const prog = progRes.data && progRes.data[0]
  const sub = subRes.data && subRes.data[0]
  const rev = revRes.data && revRes.data[0]

  const cloudImageList = await resolveCloudFileURLs(assignment.imageList || [])
  const submissionReviewStatus = sub ? String(sub.reviewStatus || '') : ''
  const reviewStatus = rev ? String(rev.status || '') : ''
  const resubmitted = !!(sub && sub.resubmitted)
  const resolved = resolveStudentAssignmentStatus({
    hasSubmission: !!sub || !!(prog && prog.isFinal),
    submissionStatus: submissionReviewStatus,
    teacherStatus: reviewStatus,
    resubmitted,
    hasProgress: !!prog
  })
  console.log('[getAssignmentForStudent] assignmentId=', assignmentId)
  console.log('[getAssignmentForStudent] imageList=', JSON.stringify(cloudImageList))
  return {
    assignment: {
      id: assignment._id,
      title: assignment.title || '',
      requirements: assignment.requirements || '',
      scriptType: assignment.scriptType || 'mongolian',
      imageList: cloudImageList
    },
    progress: prog ? {
      successByPage: prog.successByPage || [],
      currentPage: prog.currentPage || 1,
      totalPages: prog.totalPages || 1,
      isFinal: !!prog.isFinal
    } : null,
    submission: sub ? {
      aiScore: sub.aiScore || 0,
      imageFileID: sub.imageFileID || '',
      submittedAt: sub.submittedAt || null,
      reviewStatus: resolved.reviewStatus,
      status: resolved.status,
      resubmitted
    } : null
  }
}

async function submitWork(openId, event) {
  const stu = await resolveStudentByOpenId(openId)
  const assignmentId = trimStr(event.assignmentId)
  if (!assignmentId) {
    throw new Error('缺少作业 id')
  }
  const aRes = await db.collection(COLL.assignments).doc(assignmentId).get().catch(() => null)
  if (!aRes || !aRes.data) {
    throw new Error('作业不存在')
  }
  const assignment = aRes.data
  // 校验在班
  const memRes = await db.collection(COLL.memberships)
    .where({ classId: assignment.classId, studentNo: stu.studentNo })
    .limit(1).get()
  if (!memRes.data || memRes.data.length === 0) {
    throw new Error('您不在该班级')
  }

  const aiScore = Number(event.aiScore) || 0
  const imageFileID = trimStr(event.imageFileID)
  const successByPage = Array.isArray(event.successByPage) ? event.successByPage.map((n) => Number(n) || 0) : []
  const currentPage = Number(event.currentPage) || 1
  const totalPages = Number(event.totalPages) || 1
  const isFinal = !!event.isFinal

  const existSub = await db.collection(COLL.submissions)
    .where({ assignmentId, studentNo: stu.studentNo })
    .limit(1).get()
  const prevSub = existSub.data && existSub.data[0]
  const hadReviewedBefore = !!(prevSub && prevSub.reviewStatus && prevSub.reviewStatus !== 'pending')
  const reviewStatus = 'pending'

  // upsert progress
  const existProg = await db.collection(COLL.progress)
    .where({ assignmentId, studentNo: stu.studentNo })
    .limit(1).get()
  const progData = {
    classId: assignment.classId,
    studentNo: stu.studentNo,
    studentDocId: stu._id,
    successByPage,
    currentPage,
    totalPages,
    isFinal,
    updatedAt: nowDate()
  }
  if (existProg.data && existProg.data[0]) {
    await db.collection(COLL.progress).doc(existProg.data[0]._id).update({ data: progData })
  } else {
    await db.collection(COLL.progress).add({ data: Object.assign({ assignmentId }, progData) })
  }

  // 只要提交过一次，就保存提交记录；重做再次提交时把状态重置为 pending
  if (isFinal || imageFileID || prevSub) {
    const subData = {
      classId: assignment.classId,
      studentNo: stu.studentNo,
      studentDocId: stu._id,
      studentName: stu.name,
      aiScore,
      imageFileID,
      submittedAt: nowDate(),
      reviewStatus,
      resubmitted: hadReviewedBefore
    }
    if (prevSub) {
      await db.collection(COLL.submissions).doc(prevSub._id).update({ data: subData })
    } else {
      await db.collection(COLL.submissions).add({ data: Object.assign({ assignmentId }, subData) })
    }
  }

  return { ok: true }
}

/* ───────── 入口 ───────── */

exports.main = async (event) => {
  const action = event.action
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID

  try {
    switch (action) {
      case 'registerOrLoginTeacher':
        return { success: true, data: await registerOrLoginTeacher(openId, event) }
      case 'getMyTeacherProfile':
        return { success: true, data: await getMyTeacherProfile(openId) }
      case 'loginStudent':
        return { success: true, data: await loginStudent(openId, event) }
      case 'getMyStudentProfile':
        return { success: true, data: await getMyStudentProfile(openId) }
      case 'changeStudentPassword':
        return { success: true, data: await changeStudentPassword(openId, event) }
      case 'teacherSetStudentPassword':
        return { success: true, data: await teacherSetStudentPassword(openId, event) }
      case 'getMyClasses':
        return { success: true, data: await getMyClasses(openId) }
      case 'createClass':
        return { success: true, data: await createClass(openId, event) }
      case 'deleteClass':
        return { success: true, data: await deleteClass(openId, event) }
      case 'getClassDetail':
        return { success: true, data: await getClassDetail(openId, event) }
      case 'appendStudents':
        return { success: true, data: await appendStudents(openId, event) }
      case 'deleteStudents':
        return { success: true, data: await deleteStudents(openId, event) }
      case 'createAssignment':
        return { success: true, data: await createAssignment(openId, event) }
      case 'deleteAssignment':
        return { success: true, data: await deleteAssignment(openId, event) }
      case 'getAssignmentReview':
        return { success: true, data: await getAssignmentReview(openId, event) }
      case 'setReviewStatus':
        return { success: true, data: await setReviewStatus(openId, event) }
      case 'getMyJoinedClasses':
        return { success: true, data: await getMyJoinedClasses(openId) }
      case 'getClassAssignments':
        return { success: true, data: await getClassAssignments(openId, event) }
      case 'getAssignmentForStudent':
        return { success: true, data: await getAssignmentForStudent(openId, event) }
      case 'submitWork':
        return { success: true, data: await submitWork(openId, event) }
      default:
        return { success: false, message: 'unsupported action' }
    }
  } catch (err) {
    console.error('[class-service] failed', action, err)
    return {
      success: false,
      message: (err && err.message) || 'class-service failed'
    }
  }
}
