/**
 * 字帖作业按文字类型调整评分与预处理参数。
 * uighur：宽笔画范字、适合描红，沿用较紧的命中判定。
 * mongolian / manchu / chinese：细笔写字为主，扩大范字掩膜容差、放宽「笔迹落在范字带内」的权重。
 */

/** 与教师端发布页 picker 顺序一致：蒙、回鹘、满、汉 */
const SCRIPT_TYPES = ['mongolian', 'uighur', 'manchu', 'chinese']

/** 未标注的旧作业：沿用原先偏「描红」的紧算法，避免已发布作业分数突变 */
const DEFAULT_SCRIPT = 'uighur'

function normalizeScriptType(raw) {
  if (raw === undefined || raw === null) {
    return DEFAULT_SCRIPT
  }
  const s = String(raw)
    .trim()
    .toLowerCase()
  if (!s) {
    return DEFAULT_SCRIPT
  }
  if (SCRIPT_TYPES.indexOf(s) >= 0) {
    return s
  }
  if (s === 'uyghur' || s === 'old_uighur' || s === 'olduyghur') {
    return 'uighur'
  }
  if (s === 'han' || s === 'zh' || s === 'hans' || s === 'hant') {
    return 'chinese'
  }
  if (s === 'mongol' || s === 'mn') {
    return 'mongolian'
  }
  if (s === 'mnc' || s === 'qing') {
    return 'manchu'
  }
  return DEFAULT_SCRIPT
}

/**
 * 回鹘文（算法 A，像素精确匹配）参数：
 *   dilatePasses          — 模板掩膜膨胀次数（容差带宽）
 *   templateLumaThreshold — 亮度阈值，低于此视为模板笔画
 *   precisionWeight       — 精确率权重
 *   coverageWeight        — 覆盖率权重
 *   minStudentInkPx       — 最少有效书写像素
 *   coverageBoost         — 覆盖率固定加成
 *   useGridScoring        — false（走像素算法）
 *
 * 蒙文/满文/汉字（算法 B，格网空间匹配）参数：
 *   templateLumaThreshold — 同上（用于离屏掩膜采样）
 *   dilatePasses          — 同上（仍需建掩膜，但评分不用）
 *   useGridScoring        — true（走格网算法）
 *   gridSize              — N×N 格网边长（蒙/满 20，汉字 24）
 *   gridDilateTemplate    — 模板格网膨胀次数（格级容差，1 = 相邻 1 格）
 *   minStudentGridCells   — 最少有效格点数
 *   precisionWeight       — 精确率权重（学生格点落在容差带内的比例）
 *   coverageWeight        — 覆盖率权重（模板格点被学生覆盖的比例）
 *
 * @param {string} scriptType
 */
function getCopybookScoreParams(scriptType) {
  const t = normalizeScriptType(scriptType)

  // ── 算法 A：回鹘文（宽笔画描红，像素精确匹配）──────────────────────
  // 仅在权重层面强调墨迹质量：
  // - coverage：模板是否被填满
  // - precision：墨迹是否溢出到模板外
  // 不调整公共算法本身
  if (t === 'uighur') {
    return {
      useGridScoring: false,
      dilatePasses: 1,
      templateLumaThreshold: 232,
      precisionWeight: 0.5,
      coverageWeight: 0.5,
      minStudentInkPx: 160,
      coverageBoost: 0
    }
  }

  // ── 算法 B：蒙文（细笔竖排，格网空间匹配 + IoU + 重心偏移惩罚）────────────
  // gridDilateTemplate:0 = 不做格网膨胀（像素层 dilatePasses:3 已给容差）
  // useIoU:true = 用 IoU 替代 F₁，对偏移的双向惩罚更直接
  // centroidPenaltyMax:0.20 = 整体平移超过 15% 画布时最多扣 20 分
  if (t === 'mongolian') {
    return {
      useGridScoring: true,
      dilatePasses: 3,
      templateLumaThreshold: 222,
      gridSize: 24,
      gridDilateTemplate: 0,
      minStudentGridCells: 3,
      scoreMult: 1.1,
      useIoU: true,
      centroidPenaltyMax: 0.20,
      centroidTolerance: 0.03
    }
  }

  // ── 算法 B：满文（与蒙文相近，笔画更细）──────────────────────────
  if (t === 'manchu') {
    return {
      useGridScoring: true,
      dilatePasses: 3,
      templateLumaThreshold: 224,
      gridSize: 20,
      gridDilateTemplate: 1,
      minStudentGridCells: 2,
      scoreMult: 1.15
    }
  }

  // ── 算法 B：汉字（结构性强，容差适中）────────────────────────────
  if (t === 'chinese') {
    return {
      useGridScoring: true,
      dilatePasses: 4,
      templateLumaThreshold: 228,
      gridSize: 24,
      gridDilateTemplate: 1,
      minStudentGridCells: 2,
      scoreMult: 1.1
    }
  }

  // 后备（未知文字类型）：与蒙文相同
  return {
    useGridScoring: true,
    dilatePasses: 3,
    templateLumaThreshold: 222,
    gridSize: 20,
    gridDilateTemplate: 1,
    minStudentGridCells: 2,
    scoreMult: 1.15
  }
}

module.exports = {
  SCRIPT_TYPES,
  DEFAULT_SCRIPT,
  normalizeScriptType,
  getCopybookScoreParams
}
