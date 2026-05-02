const PEN_THIN = 3
const PEN_MID = 5
const PEN_THICK = 10

const INK_ALPHA_MIN = 50

const {
  getCopybookScoreParams,
  normalizeScriptType
} = require('../../../../utils/copybookScoreProfile.js')
const { getStudentSession } = require('../../../../utils/classStudentAuth.js')
const { callClassService, getTempFileURL, uploadFile } = require('../../../../utils/classCloud.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')

/**
 * 二值膨胀（容差带，减轻抗锯齿导致的不命中）
 */
function dilateMaskBinary(mask, w, h) {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let dy = -1; dy <= 1 && !v; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy
          const nx = x + dx
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
          if (mask[ny * w + nx]) {
            v = 1
            break
          }
        }
      }
      out[y * w + x] = v
    }
  }
  return out
}

function runDilate(mask, w, h, passes) {
  let m = mask
  for (let p = 0; p < passes; p++) {
    m = dilateMaskBinary(m, w, h)
  }
  return m
}

function isTemplateStrokePixel(r, g, b, a, lumaThreshold) {
  if (a < 8) {
    return false
  }
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum < lumaThreshold
}

/**
 * 学生笔迹
 */
function isStudentInk(r, g, b, a) {
  if (a <= INK_ALPHA_MIN) {
    return false
  }
  const avg = (r + g + b) / 3
  if (a > 100) {
    return avg < 235
  }
  return avg < 248
}

function buildTargetMasksFromImageData(imageData, scoreParams) {
  const p =
    scoreParams ||
    getCopybookScoreParams('uighur')
  const w = imageData.width
  const h = imageData.height
  const data = imageData.data
  const mask = new Uint8Array(w * h)
  let targetTotal = 0
  const th = p.templateLumaThreshold
  for (let i = 0, px = 0; px < w * h; px++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (isTemplateStrokePixel(r, g, b, a, th)) {
      mask[px] = 1
      targetTotal++
    } else {
      mask[px] = 0
    }
    i += 4
  }
  const dilated = runDilate(mask, w, h, p.dilatePasses)
  return { w, h, mask, dilated, targetTotal }
}

/**
 * 无字帖图时：在底层画浅色纸 + 深灰条作为模拟范字（要求调用前已 setTransform(dpr)）
 */
function drawFallbackTargetTemplate(ctx, lw, lh) {
  ctx.fillStyle = '#f4efe6'
  ctx.fillRect(0, 0, lw, lh)
  const padX = Math.max(12, Math.floor(lw * 0.07))
  const padY = Math.max(12, Math.floor(lh * 0.07))
  ctx.strokeStyle = 'rgba(92, 64, 51, 0.18)'
  ctx.lineWidth = Math.max(1, Math.floor(Math.min(lw, lh) * 0.004))
  ctx.strokeRect(padX, padY, Math.max(1, lw - padX * 2), Math.max(1, lh - padY * 2))
  const ax = Math.floor(lw * 0.2)
  const ay = Math.floor(lh * 0.35)
  const aw = Math.floor(lw * 0.6)
  const ah = Math.floor(lh * 0.12)
  ctx.fillStyle = '#2a2a2a'
  ctx.fillRect(ax, ay, aw, ah)
  ctx.fillRect(
    Math.floor(lw * 0.3),
    Math.floor(lh * 0.55),
    Math.floor(lw * 0.4),
    Math.floor(lh * 0.1)
  )
}

function drawImageContain(ctx, img, destW, destH) {
  const srcW = img.width || destW || 1
  const srcH = img.height || destH || 1
  const scale = Math.min(destW / srcW, destH / srcH)
  const drawW = Math.max(1, Math.round(srcW * scale))
  const drawH = Math.max(1, Math.round(srcH * scale))
  const dx = Math.round((destW - drawW) / 2)
  const dy = Math.round((destH - drawH) / 2)
  ctx.drawImage(img, dx, dy, drawW, drawH)
}

function paintOrientedImage(ctx, img, destW, destH, orientation) {
  const o = String(orientation || '').toLowerCase()
  const needRotate = o === 'left' || o === 'right' || o === 'left-mirrored' || o === 'right-mirrored' || o === 'up-mirrored' || o === 'down-mirrored' || o === '90' || o === '270' || o === '6' || o === '8' || o === '5' || o === '7'
  if (!needRotate) {
    drawImageContain(ctx, img, destW, destH)
    return
  }

  ctx.save()
  switch (o) {
    case 'left':
    case '270':
    case '8':
      ctx.translate(0, destH)
      ctx.rotate(-Math.PI / 2)
      drawImageContain(ctx, img, destH, destW)
      break
    case 'right':
    case '90':
    case '6':
      ctx.translate(destW, 0)
      ctx.rotate(Math.PI / 2)
      drawImageContain(ctx, img, destH, destW)
      break
    case 'down-mirrored':
    case '5':
      ctx.translate(destW, destH)
      ctx.scale(-1, -1)
      drawImageContain(ctx, img, destW, destH)
      break
    case 'left-mirrored':
    case '7':
      ctx.translate(destW, destH)
      ctx.rotate(Math.PI / 2)
      ctx.scale(-1, 1)
      drawImageContain(ctx, img, destH, destW)
      break
    case 'right-mirrored':
      ctx.translate(destW, destH)
      ctx.rotate(-Math.PI / 2)
      ctx.scale(-1, 1)
      drawImageContain(ctx, img, destH, destW)
      break
    case 'up-mirrored':
      ctx.translate(destW, 0)
      ctx.scale(-1, 1)
      drawImageContain(ctx, img, destW, destH)
      break
    default:
      drawImageContain(ctx, img, destW, destH)
  }
  ctx.restore()
}

function buildSlideList(imageList) {
  const slides = []
  ;(imageList || []).forEach((it) => {
    if (!it) return
    const fileID = String(it.fileID || '').trim()
    const tempFileURL = String(it.tempFileURL || '').trim()
    const legacyUrl = String(it.url || '').trim()
    const u = tempFileURL || fileID || legacyUrl
    if (!u) {
      return
    }
    const targetCount = Math.max(1, Number(it.count) || 1)
    slides.push({ url: u, fileID, tempFileURL, legacyUrl, targetCount })
  })
  return slides
}

// ════════════════════════════════════════════════════════════════════
//  算法 A：像素精确匹配（回鹘文专用，宽笔画描红）
//  不修改此函数！
// ════════════════════════════════════════════════════════════════════
/**
 * precision = 学生原始笔迹 ∩ 膨胀模板 / 学生笔迹总量
 * coverage  = 学生原始笔迹 ∩ 膨胀模板 / 原始模板总量
 */
function scorePixelsAgainstMask(
  writeCtx, writeCanvas,
  dilated, rawMask, targetTotal, mw, mh,
  scoreParams
) {
  const p = scoreParams || getCopybookScoreParams('uighur')
  let img
  try {
    img = writeCtx.getImageData(0, 0, writeCanvas.width, writeCanvas.height)
  } catch (e) {
    console.warn('[canvas] getImageData write', e)
    return 0
  }
  if (!img || !img.data || img.data.length < 4) return 0
  const w = img.width
  const h = img.height
  const d = img.data
  let hitCount = 0
  let missCount = 0
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = py * w + px
      const i = idx * 4
      if (!isStudentInk(d[i], d[i + 1], d[i + 2], d[i + 3])) continue
      if (idx < dilated.length && dilated[idx]) hitCount++
      else missCount++
    }
  }
  const totalInk = hitCount + missCount
  if (totalInk < p.minStudentInkPx) return 0
  const precision = hitCount / totalInk
  const denomT = targetTotal > 0 ? targetTotal : 1
  let coverage = targetTotal > 0 ? hitCount / denomT : 0
  if (p.coverageBoost > 0) coverage = Math.min(1, coverage + p.coverageBoost)
  const score = (precision * p.precisionWeight + coverage * p.coverageWeight) * 100
  return Math.round(Math.max(0, Math.min(100, score)))
}

// ════════════════════════════════════════════════════════════════════
//  字帖灰度显示（描红效果，仅影响视觉，不影响评分掩膜）
// ════════════════════════════════════════════════════════════════════
/**
 * 把字帖底图以灰色渲染到目标 canvas 上下文（描红模式）
 * alpha 始终保持 255，只改 RGB，不与背景混色，不触发 iOS 合成层 bug。
 * 评分掩膜必须在独立的离屏画布上从原图计算，不受此函数影响。
 *
 * @param {CanvasRenderingContext2D} targetCtx 显示用 canvas 上下文
 * @param {Image|Canvas} templateImg           字帖原图（黑字白底）
 * @param {number} w  渲染宽度（CSS px，已乘 dpr 前的逻辑尺寸）
 * @param {number} h  渲染高度
 * @param {Object} [opts]
 * @param {number} [opts.grayLevel=185]      笔画灰色深度，0=纯黑 255=白
 * @param {number} [opts.lumaThreshold=200]  判定为「字」的亮度上限
 */
function drawTemplateAsGray(targetCtx, templateImg, w, h, opts) {
  opts = opts || {}
  const grayLevel = opts.grayLevel != null ? opts.grayLevel : 185
  const lumaThreshold = opts.lumaThreshold != null ? opts.lumaThreshold : 200

  let off, octx
  if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
    // 物理像素尺寸与 targetCtx 的画布物理尺寸一致才能 1:1 对应
    const physW = Math.round(w * (targetCtx.canvas && targetCtx.canvas.width / w || 1))
    const physH = Math.round(h * (targetCtx.canvas && targetCtx.canvas.height / h || 1))
    off = wx.createOffscreenCanvas({ type: '2d', width: physW || w, height: physH || h })
    octx = off.getContext('2d')
  } else {
    // 兜底浏览器环境
    off = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(w, h)
      : (function () { const c = document.createElement('canvas'); c.width = w; c.height = h; return c })()
    octx = off.getContext('2d')
  }

  if (!octx) {
    // 拿不到离屏上下文就直接画原图（不崩溃）
    try { targetCtx.drawImage(templateImg, 0, 0, w, h) } catch (e) {}
    return
  }

  paintOrientedImage(octx, templateImg, off.width, off.height, templateImg.__orientation)
  let imgData
  try {
    imgData = octx.getImageData(0, 0, off.width, off.height)
  } catch (e) {
    console.warn('[gray-template] getImageData fail', e)
    try { targetCtx.drawImage(templateImg, 0, 0, w, h) } catch (e2) {}
    return
  }

  const d = imgData.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue                   // 完全透明像素跳过
    const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    if (luma < lumaThreshold) {
      // 是笔画：把 RGB 替换为目标灰色，alpha 保持不变
      d[i] = grayLevel
      d[i + 1] = grayLevel
      d[i + 2] = grayLevel
    }
    // 背景色（白/米色）：保持原样
  }
  octx.putImageData(imgData, 0, 0)
  try { targetCtx.drawImage(off, 0, 0, w, h) } catch (e) {
    console.warn('[gray-template] drawImage off fail', e)
  }
}

// ════════════════════════════════════════════════════════════════════
//  算法 B：格网空间匹配（蒙文 / 满文 / 汉字）
//  核心思路：把画布下采样为 N×N 粗格，每格只问"有没有墨"。
//  笔画宽细不再影响得分——只要写在正确的格区，粗笔细笔均可过关。
// ════════════════════════════════════════════════════════════════════
/**
 * 建模板格网：rawMask（物理像素二值数组）→ N×N Uint8Array
 */
function buildTemplateGrid(rawMask, mw, mh, gn) {
  const grid = new Uint8Array(gn * gn)
  const cellW = mw / gn
  const cellH = mh / gn
  for (let gy = 0; gy < gn; gy++) {
    const y0 = Math.floor(gy * cellH)
    const y1 = Math.min(mh, Math.ceil((gy + 1) * cellH))
    for (let gx = 0; gx < gn; gx++) {
      const x0 = Math.floor(gx * cellW)
      const x1 = Math.min(mw, Math.ceil((gx + 1) * cellW))
      let has = 0
      for (let py = y0; py < y1 && !has; py++) {
        for (let px = x0; px < x1; px++) {
          if (rawMask[py * mw + px]) { has = 1; break }
        }
      }
      grid[gy * gn + gx] = has
    }
  }
  return grid
}

/**
 * 膨胀格网（格级容差，1 次 = 相邻 1 格容差）
 */
function dilateGrid(grid, gn, passes) {
  let g = grid
  for (let p = 0; p < passes; p++) {
    const out = new Uint8Array(gn * gn)
    for (let gy = 0; gy < gn; gy++) {
      for (let gx = 0; gx < gn; gx++) {
        let v = 0
        for (let dy = -1; dy <= 1 && !v; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = gy + dy, nx = gx + dx
            if (ny < 0 || ny >= gn || nx < 0 || nx >= gn) continue
            if (g[ny * gn + nx]) { v = 1; break }
          }
        }
        out[gy * gn + gx] = v
      }
    }
    g = out
  }
  return g
}

/**
 * 建学生格网：writeCtx getImageData → N×N Uint8Array
 */
function buildStudentGrid(d, iw, ih, gn) {
  const grid = new Uint8Array(gn * gn)
  const cellW = iw / gn
  const cellH = ih / gn
  for (let py = 0; py < ih; py++) {
    const gy = Math.min(gn - 1, Math.floor(py / cellH))
    for (let px = 0; px < iw; px++) {
      const ii = (py * iw + px) * 4
      if (!isStudentInk(d[ii], d[ii + 1], d[ii + 2], d[ii + 3])) continue
      const gx = Math.min(gn - 1, Math.floor(px / cellW))
      grid[gy * gn + gx] = 1
    }
  }
  return grid
}

/**
 * 格网空间匹配评分（蒙文/满文/汉字）
 *
 * 支持两种评分模式（由 params.useIoU 切换）：
 *   IoU  模式：matched / (tCells + sExtra)，对偏移双向惩罚，区分度更高
 *   F₁   模式：调和均值，兼容旧逻辑
 *
 * 额外叠加重心偏移惩罚（params.centroidPenaltyMax），
 * 专门捕捉「笔形正确但整体平移」型错误。
 */
function scoreWithCellGrid(writeCtx, writeCanvas, rawMask, mw, mh, params) {
  if (!rawMask || !mw || !mh) return 0
  let img
  try {
    img = writeCtx.getImageData(0, 0, writeCanvas.width, writeCanvas.height)
  } catch (e) {
    console.warn('[canvas] getImageData write (grid)', e)
    return 0
  }
  if (!img || !img.data || img.data.length < 4) return 0

  const gn = params.gridSize || 24
  const gd = params.gridDilateTemplate != null ? params.gridDilateTemplate : 0
  const minCells = params.minStudentGridCells || 3

  // 建格网
  const tGrid = buildTemplateGrid(rawMask, mw, mh, gn)
  const tGridTol = gd > 0 ? dilateGrid(tGrid, gn, gd) : tGrid
  const sGrid = buildStudentGrid(img.data, img.width, img.height, gn)

  // 统计 + 同时求两个重心（用于检测整体平移偏移）
  let tCells = 0, matched = 0, sExtra = 0
  let tSumX = 0, tSumY = 0
  let sSumX = 0, sSumY = 0
  let sCellCount = 0
  for (let gy = 0; gy < gn; gy++) {
    for (let gx = 0; gx < gn; gx++) {
      const i = gy * gn + gx
      if (tGrid[i]) {
        tCells++
        tSumX += gx; tSumY += gy
      }
      if (sGrid[i]) {
        sCellCount++
        sSumX += gx; sSumY += gy
        if (tGridTol[i]) matched++
        else sExtra++
      }
    }
  }

  const sCells = matched + sExtra
  if (tCells === 0 || sCells < minCells) return 0

  // ── 评分基数：IoU 或 F₁ ──────────────────────────────────────────
  // IoU = matched / (tCells + sExtra) = 交集 / 并集
  // 偏移笔迹同时产生「漏写的模板格」和「越界的学生格」，IoU 双向惩罚；
  // F₁ 对 sExtra 惩罚是"软"的，容差大时偏移可绕过。
  let baseScore
  if (params.useIoU) {
    const union = tCells + sExtra
    baseScore = union > 0 ? matched / union : 0
  } else {
    const coverage = matched / tCells
    const precision = matched / sCells
    baseScore = (precision + coverage > 0)
      ? 2 * precision * coverage / (precision + coverage)
      : 0
  }

  // ── 重心偏移惩罚 ──────────────────────────────────────────────────
  // 专抓「整体平移型偏移」——笔形相似但写错位置时 IoU 仍可能偏高，
  // 重心对比立刻暴露偏移量。
  const tCx = tSumX / tCells
  const tCy = tSumY / tCells
  const sCx = sSumX / sCellCount
  const sCy = sSumY / sCellCount
  const dx = (sCx - tCx) / gn          // 归一化为占画布比例
  const dy = (sCy - tCy) / gn
  const centroidShift = Math.sqrt(dx * dx + dy * dy)

  const cTol = params.centroidTolerance || 0.03
  const cMax = params.centroidPenaltyMax || 0.20
  let centroidPenalty = 0
  if (centroidShift > cTol) {
    // 线性扣分：偏移 3% 不扣，偏移 15% 扣满 cMax
    const t = Math.min(1, (centroidShift - cTol) / (0.15 - cTol))
    centroidPenalty = t * cMax
  }

  // ── 合成最终分数 ──────────────────────────────────────────────────
  const mult = params.scoreMult || 1.0
  const finalScore = baseScore * (1 - centroidPenalty) * mult

  console.log('[score]', {
    tCells, matched, sExtra,
    IoU: baseScore.toFixed(3),
    centroidShift: centroidShift.toFixed(3),
    centroidPenalty: centroidPenalty.toFixed(3),
    finalScore: Math.round(finalScore * 100)
  })

  return Math.round(Math.max(0, Math.min(100, finalScore * 100)))
}

Page({
  data: {
    currentTool: 'pen',
    lineWidth: PEN_MID,
    penThin: PEN_THIN,
    penMid: PEN_MID,
    penThick: PEN_THICK,
    showPenMenu: false,
    currentPage: 1,
    totalPages: 10,
    templateSkin: 1,
    assignmentId: '',
    assignmentTitle: '',
    scriptType: 'mongolian',
    slideList: [],
    successByPage: [],
    displaySuccess: 0,
    displayTarget: 5,
    templateSrc: '',
    defaultTotalPages: 10,
    defaultTargetCount: 5,
    layoutClass: ''
  },

  targetCanvasNode: null,
  targetCtx: null,
  writeCanvasNode: null,
  _writeCtx: null,
  _targetMask: null,
  _targetDilated: null,
  _targetStrokeCount: 0,
  _maskW: 0,
  _maskH: 0,
  _targetMaskReady: false,
  _scoreParams: null,
  _strokeHistory: null,
  _strokeDraft: null,
  dpr: 1,
  drawing: false,
  lastX: 0,
  lastY: 0,
  canvasW: 0,
  canvasH: 0,

  async onLoad(options) {
    this.setData(getClassPageLayout())
    const id = (options.id || '').trim()
    const mode = (options.mode || '').trim()

    if (mode === 'review') {
      wx.setNavigationBarTitle({ title: '作业回看' })
    } else if (mode === 'retry') {
      wx.setNavigationBarTitle({ title: '重新完成' })
    }

    if (!id) {
      const n = this.data.defaultTotalPages
      this._scoreParams = getCopybookScoreParams('mongolian')
      this._strokeHistory = []
      this._strokeDraft = null
      this.setData({
        slideList: [],
        successByPage: new Array(n).fill(0),
        templateSrc: '',
        totalPages: n,
        currentPage: 1,
        displaySuccess: 0,
        displayTarget: this.data.defaultTargetCount,
        scriptType: 'mongolian'
      })
      return
    }

    const session = getStudentSession()
    if (!session) {
      wx.showToast({ title: '请先登录学生账号', icon: 'none' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/class/login/login' })
      }, 1600)
      return
    }

    wx.showLoading({ title: '加载中', mask: true })
    let data
    try {
      data = await callClassService('getAssignmentForStudent', { assignmentId: id })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '未找到该作业', icon: 'none' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1500)
      return
    }
    wx.hideLoading()
    const assignment = data.assignment
    if (!assignment) {
      wx.showToast({ title: '未找到该作业', icon: 'none' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1500)
      return
    }

    const reviewStatus = data.submission ? String(data.submission.reviewStatus || '') : ''
    const resubmitted = !!(data.submission && data.submission.resubmitted)
    const hasSubmitted = !!data.submission || !!(data.progress && data.progress.isFinal)
    const isRetryMode = mode === 'retry'
    if (reviewStatus === 'passed') {
      wx.showModal({
        title: '作业已通过',
        content: '这份作业已经通过，无需再次修改。',
        showCancel: false,
        confirmText: '知道了',
        success: () => wx.navigateBack({ delta: 1 })
      })
      return
    }
    if (reviewStatus === 'pending' && !isRetryMode) {
      wx.showModal({
        title: '已提交',
        content: '作业已提交，正在等待教师批改，暂不能修改。',
        showCancel: false,
        confirmText: '知道了',
        success: () => wx.navigateBack({ delta: 1 })
      })
      return
    }
    if (reviewStatus === 'rejected' && !isRetryMode && hasSubmitted && !resubmitted) {
      wx.showModal({
        title: '已驳回',
        content: '作业已被驳回，请点击“重做”后再次提交。',
        showCancel: false,
        confirmText: '知道了',
        success: () => wx.navigateBack({ delta: 1 })
      })
      return
    }

    const slideList = buildSlideList(assignment.imageList)
    console.log('[canvas] slideList', JSON.stringify(slideList))
    const hasImg = slideList.length > 0
    const totalPages = hasImg ? slideList.length : this.data.defaultTotalPages
    let successByPage = new Array(totalPages).fill(0)
    let restoredPage = 1

    if (mode !== 'review' && mode !== 'retry' && data.progress) {
      const saved = data.progress
      if (saved.totalPages === totalPages && Array.isArray(saved.successByPage)) {
        for (let i = 0; i < totalPages; i++) {
          successByPage[i] = Number(saved.successByPage[i] || 0)
        }
        if (saved.currentPage >= 1 && saved.currentPage <= totalPages) {
          restoredPage = saved.currentPage
        }
      }
    }
    if (mode === 'retry') {
      successByPage = new Array(totalPages).fill(0)
      restoredPage = 1
    }

    const templateSrc = hasImg ? slideList[restoredPage - 1].url : ''
    const displayTarget = hasImg
      ? slideList[restoredPage - 1].targetCount
      : this.data.defaultTargetCount
    const displaySuccess = successByPage[restoredPage - 1] || 0
    console.log('[canvas] page init', {
      hasImg,
      totalPages,
      restoredPage,
      templateSrc,
      displayTarget,
      displaySuccess,
      reviewStatus
    })

    const titleText = assignment.title ? String(assignment.title) : '书写练习'
    if (mode !== 'review') {
      wx.setNavigationBarTitle({ title: titleText.length > 10 ? `${titleText.slice(0, 10)}…` : titleText })
    }

    const scriptType = normalizeScriptType(assignment.scriptType)
    this._scoreParams = getCopybookScoreParams(scriptType)
    this._strokeHistory = []
    this._strokeDraft = null

    this.setData({
      assignmentId: id,
      assignmentTitle: assignment.title || '',
      scriptType,
      slideList,
      successByPage,
      templateSrc,
      totalPages,
      currentPage: restoredPage,
      displaySuccess,
      displayTarget,
      templateSkin: ((restoredPage - 1) % 2) + 1,
      reviewStatus
    }, () => {
      console.log('[canvas] setData ready', {
        templateSrc: this.data.templateSrc,
        slideCount: (this.data.slideList || []).length,
        currentPage: this.data.currentPage
      })
      if (this.targetCtx && this.targetCanvasNode) {
        this._drawTargetAndRebuildMask()
      }
    })
  },

  _syncProgressDisplay() {
    const slides = this.data.slideList || []
    const page = this.data.currentPage
    const idx = page - 1
    let displayTarget = this.data.defaultTargetCount
    let displaySuccess = 0
    const arr = this.data.successByPage || []

    if (slides.length > 0 && idx >= 0 && idx < slides.length) {
      displayTarget = slides[idx].targetCount
      displaySuccess = arr[idx] || 0
    } else if (!slides.length) {
      displayTarget = this.data.defaultTargetCount
      displaySuccess = idx >= 0 && idx < arr.length ? arr[idx] || 0 : 0
    }

    this.setData({ displaySuccess, displayTarget })
  },

  onShow() {
    this.setData(getClassPageLayout())
  },

  onResize() {
    this.setData(getClassPageLayout())
  },

  onReady() {
    this._initBothCanvases(0)
  },

  _initBothCanvases(attempt) {
    const q = wx.createSelectorQuery()
    q.select('#targetCanvas').fields({ node: true, size: true })
    q.select('#writeCanvas').fields({ node: true, size: true })
    q.exec((res) => {
      const r0 = res && res[0]
      const r1 = res && res[1]
      if (!r0 || !r0.node || !r1 || !r1.node) {
        if (attempt < 12) {
          setTimeout(() => this._initBothCanvases(attempt + 1), 120)
        }
        return
      }
      const w = r0.width || r1.width || 0
      const h = r0.height || r1.height || 0
      this._templateOrientation = 1
      console.log('[canvas] canvas nodes ready', { hasTarget: !!(r0 && r0.node), hasWrite: !!(r1 && r1.node), w, h })
      if (!w || !h) {
        if (attempt < 12) {
          setTimeout(() => this._initBothCanvases(attempt + 1), 120)
        }
        return
      }

      const dpr = wx.getSystemInfoSync().pixelRatio || 1
      this.dpr = dpr
      this.canvasW = w
      this.canvasH = h
      const pw = Math.floor(w * dpr)
      const ph = Math.floor(h * dpr)

      const tCanvas = r0.node
      const wCanvas = r1.node
      const tCtx = tCanvas.getContext('2d')
      const wrCtx = wCanvas.getContext('2d')
      console.log('[canvas] canvas contexts ready', { hasTargetCtx: !!tCtx, hasWriteCtx: !!wrCtx })
      this.targetCanvasNode = tCanvas
      this.targetCtx = tCtx
      this.writeCanvasNode = wCanvas
      this._writeCtx = wrCtx

      tCanvas.width = pw
      tCanvas.height = ph
      tCtx.imageSmoothingEnabled = true
      tCtx.imageSmoothingQuality = 'high'

      wCanvas.width = pw
      wCanvas.height = ph
      wrCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      wrCtx.clearRect(0, 0, w, h)
      wrCtx.lineCap = 'round'
      wrCtx.lineJoin = 'round'

      this.targetCanvasNode = tCanvas
      this.targetCtx = tCtx
      this.writeCanvasNode = wCanvas
      this._writeCtx = wrCtx
      this._targetMaskReady = false

      console.log('[canvas] init draw start', { templateSrc: this.data.templateSrc, slideCount: (this.data.slideList || []).length })
      this._drawTargetAndRebuildMask()
    })
  },

  /**
   * 用 wx.createOffscreenCanvas 独立采样建掩膜，不干扰任何可见画布。
   * 若平台不支持则跳过（评分返回 0，但显示不受影响）。
   */
  _buildMaskOffscreen(imgNode, pw, ph, lw, lh, dprVal, params) {
    try {
      if (typeof wx.createOffscreenCanvas !== 'function') {
        return null
      }
      const oc = wx.createOffscreenCanvas({ type: '2d', width: pw, height: ph })
      const ox = oc.getContext('2d')
      if (!ox) {
        return null
      }
      if (imgNode) {
        ox.fillStyle = '#f4efe6'
        ox.fillRect(0, 0, pw, ph)
        paintOrientedImage(ox, imgNode, pw, ph, imgNode.__orientation)
      } else {
        ox.setTransform(dprVal, 0, 0, dprVal, 0, 0)
        drawFallbackTargetTemplate(ox, lw, lh)
        ox.setTransform(1, 0, 0, 1, 0, 0)
      }
      const id = ox.getImageData(0, 0, pw, ph)
      return buildTargetMasksFromImageData(id, params)
    } catch (e) {
      console.warn('[canvas] buildMaskOffscreen', e)
      return null
    }
  },

  _applyBuiltMask(built) {
    if (!built) {
      this._targetMask = null
      this._targetDilated = null
      this._maskW = 0
      this._maskH = 0
      this._targetStrokeCount = 0
      this._targetMaskReady = false
      return
    }
    this._targetMask = built.mask
    this._targetDilated = built.dilated
    this._maskW = built.w
    this._maskH = built.h
    this._targetStrokeCount = built.targetTotal
    this._targetMaskReady = true
  },

  _drawTargetAndRebuildMask(cb) {
    const tCtx = this.targetCtx
    const tCanvas = this.targetCanvasNode
    if (!tCtx || !tCanvas) {
      if (cb) { cb() }
      return
    }
    const lw = this.canvasW
    const lh = this.canvasH
    const src = (this.data.templateSrc || '').trim()
    console.log('[canvas] drawTarget src', src)
    const params = this._scoreParams || getCopybookScoreParams('mongolian')
    const dpr = this.dpr
    const pw = tCanvas.width
    const ph = tCanvas.height
    const self = this

    // 字帖以灰色渲染（描红效果）：只改 RGB，alpha 保持 255，
    // 不使用 globalAlpha / CSS opacity 避免 iOS WebView 合成层 bug。
    // 评分掩膜在 _buildMaskOffscreen 中从原图独立计算，不受此影响。
    const paintOpaque = (imgNode) => {
      tCtx.setTransform(1, 0, 0, 1, 0, 0)
      tCtx.clearRect(0, 0, pw, ph)
      tCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      tCtx.fillStyle = '#f4efe6'
      tCtx.fillRect(0, 0, lw, lh)
      tCtx.imageSmoothingEnabled = true
      tCtx.imageSmoothingQuality = 'high'
      tCtx.strokeStyle = 'rgba(92, 64, 51, 0.16)'
      tCtx.lineWidth = Math.max(1, Math.floor(Math.min(lw, lh) * 0.004))
      const safePadX = Math.max(14, Math.floor(lw * 0.06))
      const safePadY = Math.max(14, Math.floor(lh * 0.06))
      tCtx.strokeRect(safePadX, safePadY, Math.max(1, lw - safePadX * 2), Math.max(1, lh - safePadY * 2))
      if (imgNode) {
        drawTemplateAsGray(tCtx, imgNode, lw, lh, { grayLevel: 185 })
      } else {
        drawFallbackTargetTemplate(tCtx, lw, lh)
      }
    }

    // 延迟在离屏 Canvas 建掩膜，不干扰可见画布渲染帧。
    const buildMaskLater = (imgNode) => {
      setTimeout(() => {
        const built = self._buildMaskOffscreen(imgNode, pw, ph, lw, lh, dpr, params)
        self._applyBuiltMask(built)
        if (cb) { cb() }
      }, 32)
    }

    const drawFallback = (reason) => {
      console.warn('[canvas] drawFallback', reason || 'unknown')
      paintOpaque(null)
      buildMaskLater(null)
    }

    if (!src) {
      console.warn('[canvas] empty template src')
      drawFallback('empty-src')
      return
    }

    const loadAndDraw = (path) => {
      console.log('[canvas] loadAndDraw', path)
      const img = tCanvas.createImage()
      img.onload = function () {
        console.log('[canvas] img load ok', path, img.width, img.height)
        img.__orientation = self._templateOrientation || 1
        paintOpaque(img)
        buildMaskLater(img)
        console.log('[canvas] draw success', { path, width: img.width, height: img.height })
      }
      img.onerror = function (err) {
        console.warn('[canvas] img load fail', err, path)
        drawFallback('img-onerror')
      }
      img.__orientation = self._templateOrientation || 1
      img.src = path
    }

    const downloadHttp = (url) => {
      wx.downloadFile({
        url,
        success(res) {
          console.log('[canvas] downloadFile response', { url, statusCode: res.statusCode, tempFilePath: res.tempFilePath })
          if (res.statusCode === 200 && res.tempFilePath) {
            console.log('[canvas] downloadFile ok', url, res.tempFilePath)
            loadAndDraw(res.tempFilePath)
          } else {
            console.warn('[canvas] downloadFile non-200', res.statusCode, url)
            drawFallback('download-non200')
          }
        },
        fail(err) {
          console.warn('[canvas] downloadFile fail', err, url)
          drawFallback('download-fail')
        }
      })
    }

    const loadByFileID = (fileID) => {
      console.log('[canvas] loadByFileID', fileID)
      getTempFileURL(fileID).then((map) => {
        const httpsUrl = map[fileID]
        if (httpsUrl) {
          console.log('[canvas] temp url ok', fileID, httpsUrl)
          loadAndDraw(httpsUrl)
        } else {
          console.warn('[canvas] no temp url for fileID', fileID)
          drawFallback('no-temp-url')
        }
      }).catch((err) => {
        console.warn('[canvas] getTempFileURL fail', err)
        drawFallback('get-temp-url-fail')
      })
    }

    if (/^cloud:\/\//.test(src)) {
      // 云存储 fileID：先取临时 URL，再下载本地缓存供 canvas 使用
      loadByFileID(src)
    } else if (/^https?:\/\//.test(src)) {
      downloadHttp(src)
    } else if (/^wxfile:\/\//.test(src) || /^file:\/\//.test(src)) {
      loadAndDraw(src)
    } else {
      // 其他情况也按云端 fileID 处理，避免直接回落到本地路径逻辑
      loadByFileID(src)
    }
  },

  _syncTemplateSkin() {
    const p = this.data.currentPage
    const skin = ((p - 1) % 3) + 1
    if (skin !== this.data.templateSkin) {
      this.setData({ templateSkin: skin })
    }
  },

  onPenToolTap() {
    this.setData({
      currentTool: 'pen',
      showPenMenu: !this.data.showPenMenu
    })
  },

  selectLineWidth(e) {
    const w = Number(e.currentTarget.dataset.width)
    if (!w || Number.isNaN(w)) {
      return
    }
    this.setData({ lineWidth: w, currentTool: 'pen' })
  },

  selectEraser() {
    this.setData({ currentTool: 'eraser', showPenMenu: false })
  },

  clearCanvas() {
    const wCtx = this._writeCtx
    const wCan = this.writeCanvasNode
    if (!wCtx || !wCan) {
      return
    }
    wCtx.setTransform(1, 0, 0, 1, 0, 0)
    wCtx.clearRect(0, 0, wCan.width, wCan.height)
    wCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    wCtx.lineCap = 'round'
    wCtx.lineJoin = 'round'
    this._strokeHistory = []
    this._strokeDraft = null
  },

  undoLastStroke() {
    const list = this._strokeHistory
    if (!list || !list.length || !this._writeCtx || !this.writeCanvasNode) {
      wx.showToast({ title: '没有可撤回的笔迹', icon: 'none' })
      return
    }
    list.pop()
    this._replayStrokesFromHistory()
  },

  _replayStrokesFromHistory() {
    const wCtx = this._writeCtx
    const wCan = this.writeCanvasNode
    if (!wCtx || !wCan) {
      return
    }
    wCtx.setTransform(1, 0, 0, 1, 0, 0)
    wCtx.clearRect(0, 0, wCan.width, wCan.height)
    wCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    wCtx.lineCap = 'round'
    wCtx.lineJoin = 'round'
    const hist = this._strokeHistory || []
    hist.forEach((seg) => {
      const pts = seg.points
      if (!pts || pts.length < 2) {
        return
      }
      const tool = seg.tool
      const lw = seg.lineWidth
      wCtx.save()
      if (tool === 'eraser') {
        wCtx.globalCompositeOperation = 'destination-out'
        wCtx.strokeStyle = 'rgba(0,0,0,1)'
      } else {
        wCtx.globalCompositeOperation = 'source-over'
        wCtx.strokeStyle = '#262626'
      }
      wCtx.lineWidth = lw
      wCtx.beginPath()
      wCtx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        wCtx.lineTo(pts[i].x, pts[i].y)
      }
      wCtx.stroke()
      wCtx.restore()
    })
  },

  _applyPageTemplate(pageIndex1) {
    const slides = this.data.slideList || []
    console.log('[canvas] _applyPageTemplate start', { pageIndex1, slidesLen: slides.length })
    if (!slides.length) {
      this.setData({ templateSrc: '' }, () => {
        console.log('[canvas] _applyPageTemplate empty slides')
        this._drawTargetAndRebuildMask()
      })
      this._syncProgressDisplay()
      return
    }
    const idx = Math.max(0, Math.min(slides.length - 1, pageIndex1 - 1))
    const row = slides[idx]
    console.log('[canvas] _applyPageTemplate row', { idx, row })
    this.setData(
      { templateSrc: row && row.url ? row.url : '' },
      () => {
        console.log('[canvas] _applyPageTemplate setData done', this.data.templateSrc)
        this._drawTargetAndRebuildMask()
      }
    )
    this._syncProgressDisplay()
  },

  prevPage() {
    if (this.data.currentPage <= 1) {
      return
    }
    const next = this.data.currentPage - 1
    this.setData({ currentPage: next })
    this._syncTemplateSkin()
    this.clearCanvas()
    this._applyPageTemplate(next)
  },

  nextPage() {
    if (this.data.currentPage >= this.data.totalPages) {
      return
    }
    const next = this.data.currentPage + 1
    this.setData({ currentPage: next })
    this._syncTemplateSkin()
    this.clearCanvas()
    this._applyPageTemplate(next)
  },

  onTouchStart(e) {
    if (!this._writeCtx) {
      return
    }
    const t = e.touches[0]
    if (!t) {
      return
    }
    this.drawing = true
    this.lastX = t.x
    this.lastY = t.y
    const tool = this.data.currentTool
    const lw =
      tool === 'eraser'
        ? Math.max(this.data.lineWidth * 5, 24)
        : this.data.lineWidth
    this._strokeDraft = {
      tool,
      lineWidth: lw,
      points: [{ x: t.x, y: t.y }]
    }
  },

  onTouchMove(e) {
    if (!this.drawing || !this._writeCtx) {
      return
    }
    const t = e.touches[0]
    if (!t) {
      return
    }
    const draft = this._strokeDraft
    if (!draft) {
      return
    }
    const x = t.x
    const y = t.y
    const ctx = this._writeCtx
    const tool = draft.tool
    const lw = draft.lineWidth

    ctx.save()
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#262626'
    }
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(this.lastX, this.lastY)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.restore()
    this.lastX = x
    this.lastY = y
    if (draft.points) {
      draft.points.push({ x, y })
    }
  },

  onTouchEnd() {
    if (
      this._strokeDraft &&
      this._strokeDraft.points &&
      this._strokeDraft.points.length >= 2
    ) {
      if (!this._strokeHistory) {
        this._strokeHistory = []
      }
      this._strokeHistory.push(this._strokeDraft)
    }
    this._strokeDraft = null
    this.drawing = false
  },

  preventClose() {},

  calculateVisualScore() {
    const wCtx = this._writeCtx
    const wCan = this.writeCanvasNode
    if (!wCtx || !wCan || !this._targetMaskReady) return 0
    const params = this._scoreParams || getCopybookScoreParams('mongolian')

    if (params.useGridScoring) {
      // 算法 B：格网空间匹配（蒙文/满文/汉字）
      if (!this._targetMask || !this._maskW || !this._maskH) return 0
      return scoreWithCellGrid(
        wCtx, wCan,
        this._targetMask, this._maskW, this._maskH,
        params
      )
    }

    // 算法 A：像素精确匹配（回鹘文）
    if (!this._targetDilated) return 0
    return scorePixelsAgainstMask(
      wCtx, wCan,
      this._targetDilated, this._targetMask,
      this._targetStrokeCount,
      this._maskW, this._maskH,
      params
    )
  },

  submitWork() {
    if (this._submitting) {
      return
    }
    const wCan = this.writeCanvasNode
    if (!wCan || !this._writeCtx) {
      wx.showToast({ title: '画板未就绪', icon: 'none' })
      return
    }
    const score = this.calculateVisualScore()

    wx.canvasToTempFilePath({
      canvas: wCan,
      fileType: 'png',
      quality: 1,
      success: (res) => {
        this._handleSubmit(score, res.tempFilePath)
      },
      fail: (err) => {
        console.warn('[canvas] canvasToTempFilePath fail', err)
        wx.showToast({ title: '导出图片失败', icon: 'none' })
      }
    })
  },

  /**
   * 计算分数 → 上传图片到云存储 → 调云函数提交（progress + submission）
   */
  async _handleSubmit(score, tempPath) {
    if (score < 90) {
      wx.showModal({
        title: '提交结果',
        content: `分数：${score}分。提交失败，再接再厉哦～`,
        showCancel: false,
        confirmText: '继续练习'
      })
      return
    }

    const page = this.data.currentPage
    const slides = this.data.slideList || []
    const idx = page - 1
    const successByPage = [...(this.data.successByPage || [])]
    while (successByPage.length < this.data.totalPages) {
      successByPage.push(0)
    }
    successByPage[idx] = (successByPage[idx] || 0) + 1

    let targetNeed = this.data.defaultTargetCount
    if (slides.length > 0 && slides[idx]) {
      targetNeed = slides[idx].targetCount
    }
    const reachedPageGoal = successByPage[idx] >= targetNeed
    const isLastPage = page >= this.data.totalPages
    const isFinal = reachedPageGoal && isLastPage

    const session = getStudentSession()
    const assignmentId = this.data.assignmentId
    if (!session || !assignmentId) {
      wx.showToast({ title: '会话失效，请重新登录', icon: 'none' })
      return
    }

    this._submitting = true
    wx.showLoading({ title: '上传中', mask: true })

    let imageFileID = ''
    try {
      if (tempPath) {
        const cloudPath = `class/submissions/${assignmentId}/${session.studentNo}_p${page}_${Date.now()}.png`
        try {
          imageFileID = await uploadFile(tempPath, cloudPath)
        } catch (uploadErr) {
          console.warn('[canvas] uploadFile fail', uploadErr)
          // 上传失败不阻塞进度上报，但提交记录会缺图
        }
      }

      wx.showLoading({ title: '提交中', mask: true })
      await callClassService('submitWork', {
        assignmentId,
        aiScore: score,
        imageFileID,
        successByPage,
        currentPage: page,
        totalPages: this.data.totalPages,
        isFinal
      })

      this.setData({ successByPage })
      this._syncProgressDisplay()
      this.clearCanvas()
      wx.hideLoading()

      wx.showModal({
        title: '提交结果',
        content: `分数：${score}分。恭喜您提交成功！`,
        showCancel: false,
        confirmText: '知道了',
        success: async () => {
          if (!reachedPageGoal) {
            return
          }
          if (!isLastPage) {
            const nextP = page + 1
            this.setData({ currentPage: nextP })
            this._syncTemplateSkin()
            this._applyPageTemplate(nextP)
            this.clearCanvas()
            // 翻页后将 currentPage 同步给云端
            try {
              await callClassService('submitWork', {
                assignmentId,
                aiScore: 0,
                imageFileID: '',
                successByPage,
                currentPage: nextP,
                totalPages: this.data.totalPages,
                isFinal: false
              })
            } catch (e) {
              console.warn('[canvas] sync nextPage fail', e)
            }
            wx.showToast({ title: '已进入下一页字帖', icon: 'none', duration: 2000 })
            return
          }
          wx.showModal({
            title: '作业完成',
            content: '恭喜您已完成作业，等待教师批阅！',
            showCancel: false,
            confirmText: '返回',
            success: () => {
              wx.navigateBack({ delta: 1 })
            }
          })
        }
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally {
      this._submitting = false
    }
  }
})
