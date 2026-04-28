/**
 * 班级详情页 — 模拟数据（后续可替换为云接口）
 * @param {string} classId 班级 ID（可按班级区分演示数据）
 */

function mockStudents(classId) {
  const suffix = classId ? String(classId).slice(-4) : ''
  return [
    {
      id: `stu_${suffix}_1`,
      name: '阿古拉',
      studentNo: `2025${suffix || '0001'}001`,
      password: 'pwd001'
    },
    {
      id: `stu_${suffix}_2`,
      name: '娜仁',
      studentNo: `2025${suffix || '0001'}002`,
      password: 'pwd002'
    },
    {
      id: `stu_${suffix}_3`,
      name: '巴特尔',
      studentNo: `2025${suffix || '0001'}003`,
      password: 'pwd003'
    },
    {
      id: `stu_${suffix}_4`,
      name: '苏布达',
      studentNo: `2025${suffix || '0001'}004`,
      password: 'pwd004'
    },
    {
      id: `stu_${suffix}_5`,
      name: '朝鲁',
      studentNo: `2025${suffix || '0001'}005`,
      password: 'pwd005'
    }
  ]
}

function mockAssignments(classId) {
  const tag = classId ? String(classId).slice(-6) : 'demo'
  return [
    {
      id: `asg_${tag}_1`,
      title: '临摹 · 字头「爱」',
      type: '字帖作业',
      submitCount: 32,
      totalCount: 40,
      date: '2026-04-18'
    },
    {
      id: `asg_${tag}_2`,
      title: '章法练习 · 四字横幅',
      type: '创作作业',
      submitCount: 18,
      totalCount: 40,
      date: '2026-04-12'
    },
    {
      id: `asg_${tag}_3`,
      title: '笔画测验 · 竖与撇',
      type: '测验',
      submitCount: 40,
      totalCount: 40,
      date: '2026-04-05'
    }
  ]
}

module.exports = {
  mockStudents,
  mockAssignments
}
