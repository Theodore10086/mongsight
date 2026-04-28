/**
 * 蒙古文视觉打分算法 v2（漏斗式闭环）
 * ─────────────────────────────────────────────────────────────────
 *  v1 → v2 主要改动：
 *    1. 矩阵分辨率 200 → 256（细笔抗锯齿更稳）
 *    2. 字帖 ROI 自动裁切（去除原图周围空白，避免稀释）
 *    3. 模板 / 笔迹双向 ±1 像素膨胀容差
 *    4. 主轴角度 (PCA) 替代 W/H 比 —— 对蒙文竖排倾斜友好
 *    5. 墨量高斯衰减替代固定区间惩罚
 *    6. 真三维子分独立计算（不再由总分扰动伪造）
 *    7. 几何平均合成总分，单维过低无法被高分项掩盖
 *    8. 取消固定 ×1.48 放大；改用温和幂曲线 pow(geo, 0.78)
 */

class MongolVisualScorer {
  constructor(matrixSize = 256) {
    this.N = matrixSize;
  }

  // ════════════════════════════════════════════════════════════════
  //  关卡一：矢量轨迹拦截
  //  以包围盒对角线 Du 为基准，复杂度 C = L / Du
  //  正常书写 C ≥ 1.5；直线滑动接近 1.0
  // ════════════════════════════════════════════════════════════════
  validateStrokes(strokes) {
    if (!strokes || strokes.length === 0) return { passed: false };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let L = 0;

    strokes.forEach((stroke) => {
      const points = stroke.points || stroke || [];
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (i > 0) {
          const prev = points[i - 1];
          if (prev && typeof prev.x === 'number' && typeof prev.y === 'number') {
            L += Math.sqrt((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2);
          }
        }
      }
    });

    if (minX === Infinity) return { passed: false };
    const Du = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
    const C = L / Math.max(1, Du);

    return {
      passed: C >= 1.4,
      bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
      complexity: C
    };
  }

  // ════════════════════════════════════════════════════════════════
  //  关卡二：归一化投影
  //  把任意 bounds 等比缩放到 N×N 矩阵中央，留 8% 边距
  // ════════════════════════════════════════════════════════════════
  projectToMatrix(bounds, ctx) {
    const { minX, minY, width, height } = bounds;
    const scale = Math.min(this.N / Math.max(1, width), this.N / Math.max(1, height)) * 0.92;
    const offsetX = (this.N - width * scale) / 2;
    const offsetY = (this.N - height * scale) / 2;
    ctx.save();
    ctx.translate(offsetX - minX * scale, offsetY - minY * scale);
    ctx.scale(scale, scale);
  }

  renderTemplate(templateImage, roi, srcW, srcH, ctx) {
    ctx.clearRect(0, 0, this.N, this.N);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, this.N, this.N);
    this.projectToMatrix(roi, ctx);
    // 画 srcW × srcH 的原图区域；roi 之外自动裁掉
    try { ctx.drawImage(templateImage, 0, 0, srcW, srcH); } catch (e) {
      console.warn('[VisualScorer] template drawImage', e);
    }
    ctx.restore();
  }

  renderUser(strokes, userBounds, ctx) {
    ctx.clearRect(0, 0, this.N, this.N);
    this.projectToMatrix(userBounds, ctx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 笔宽随分辨率自适应（约 1/16 N，保证细笔不会断线）
    ctx.lineWidth = Math.max(2, Math.round(this.N / 16));
    ctx.strokeStyle = 'black';

    strokes.forEach((stroke) => {
      const points = stroke.points || stroke || [];
      if (points.length === 0) return;
      const p0 = points[0];
      if (!p0 || typeof p0.x !== 'number' || typeof p0.y !== 'number') return;

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════
  //  RGBA → 单通道二值（1=ink, 0=bg）
  //  阈值统一：透明 / 灰度 ≥128 视为背景
  // ════════════════════════════════════════════════════════════════
  toBinary(rgba) {
    const out = new Uint8Array(rgba.length / 4);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
      const a = rgba[i + 3];
      const lum = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
      out[j] = a >= 10 && lum < 128 ? 1 : 0;
    }
    return out;
  }

  // 3×3 邻域膨胀（一次 = ±1 像素容差）
  dilate(bin, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let dy = -1; dy <= 1 && !v; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
            if (bin[ny * w + nx]) { v = 1; break; }
          }
        }
        out[y * w + x] = v;
      }
    }
    return out;
  }

  // PCA 主轴角度（弧度），用于评估字形朝向相似度
  pcaAngle(bin, w, h, count) {
    if (count < 8) return 0;
    let sx = 0, sy = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (bin[y * w + x]) { sx += x; sy += y; }
      }
    }
    const cx = sx / count, cy = sy / count;
    let sxx = 0, syy = 0, sxy = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (bin[y * w + x]) {
          const dx = x - cx, dy = y - cy;
          sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
        }
      }
    }
    return 0.5 * Math.atan2(2 * sxy, sxx - syy);
  }

  // ════════════════════════════════════════════════════════════════
  //  字帖 ROI 自动检测：在缩略图中找出真实字迹包围盒，padding 5%
  //  避免把整张图（含周围空白）当 bounds，导致评分被稀释
  // ════════════════════════════════════════════════════════════════
  detectTemplateRoi(templateImage, srcW, srcH) {
    const maxDim = 256;
    const ratio = Math.min(maxDim / srcW, maxDim / srcH, 1);
    const dW = Math.max(32, Math.round(srcW * ratio));
    const dH = Math.max(32, Math.round(srcH * ratio));
    const canvas = wx.createOffscreenCanvas({ type: '2d', width: dW, height: dH });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, dW, dH);
    ctx.drawImage(templateImage, 0, 0, dW, dH);
    const data = ctx.getImageData(0, 0, dW, dH).data;

    let minX = dW, maxX = 0, minY = dH, maxY = 0;
    for (let y = 0; y < dH; y++) {
      for (let x = 0; x < dW; x++) {
        const i = (y * dW + x) * 4;
        const a = data[i + 3];
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        if (a >= 10 && lum < 180) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      return { minX: 0, minY: 0, maxX: srcW, maxY: srcH, width: srcW, height: srcH };
    }
    const inv = 1 / ratio;
    const padX = (maxX - minX) * 0.05;
    const padY = (maxY - minY) * 0.05;
    const x0 = Math.max(0, (minX - padX) * inv);
    const y0 = Math.max(0, (minY - padY) * inv);
    const x1 = Math.min(srcW, (maxX + padX) * inv);
    const y1 = Math.min(srcH, (maxY + padY) * inv);
    return { minX: x0, minY: y0, maxX: x1, maxY: y1, width: x1 - x0, height: y1 - y0 };
  }

  // ════════════════════════════════════════════════════════════════
  //  关卡三 + 四：核心评分（真三维子分 + 几何均值合成）
  // ════════════════════════════════════════════════════════════════
  calculateFinalScore(targetRgba, userRgba, complexity) {
    const N = this.N;
    const tBin = this.toBinary(targetRgba);
    const uBin = this.toBinary(userRgba);
    const tDil = this.dilate(tBin, N, N);
    const uDil = this.dilate(uBin, N, N);

    let areaT = 0, areaU = 0;
    let matchedU = 0;   // 用户像素落在膨胀模板里
    let matchedT = 0;   // 模板像素落在膨胀用户里
    let sumXt = 0, sumYt = 0, sumXu = 0, sumYu = 0;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (tBin[i]) {
          areaT++; sumXt += x; sumYt += y;
          if (uDil[i]) matchedT++;
        }
        if (uBin[i]) {
          areaU++; sumXu += x; sumYu += y;
          if (tDil[i]) matchedU++;
        }
      }
    }

    if (areaT === 0) return { score: 0, error: '底图无可识别字迹' };
    if (areaU === 0) return { score: 0, error: '未检测到书写轨迹' };

    // 五项原始指标 ---------------------------------------------------
    const coverage = matchedT / areaT;          // 模板被覆盖率
    const precision = matchedU / areaU;         // 笔迹落点精度

    const cxT = sumXt / areaT, cyT = sumYt / areaT;
    const cxU = sumXu / areaU, cyU = sumYu / areaU;
    const cdist = Math.sqrt((cxT - cxU) ** 2 + (cyT - cyU) ** 2);
    const Dmax = N * 0.14;                       // 适度放宽，小偏移不过分扣分
    const centroidSim = Math.max(0, 1 - cdist / Dmax);

    const angleT = this.pcaAngle(tBin, N, N, areaT);
    const angleU = this.pcaAngle(uBin, N, N, areaU);
    let dAngle = Math.abs(angleT - angleU);
    if (dAngle > Math.PI / 2) dAngle = Math.PI - dAngle;
    const angleSim = Math.max(0, 1 - dAngle / (Math.PI / 4));

    // 墨量比 → 高斯衰减（µ=1, σ=0.6 in log space，v2.1 放宽）
    // R=1 → 1.00   R=0.5 → 0.68   R=2.0 → 0.68   R=0.33 → 0.41
    const Rink = areaU / areaT;
    const sigma = 0.6;
    const lr = Math.log(Math.max(0.05, Rink));
    const inkBalance = Math.exp(-lr * lr / (2 * sigma * sigma));

    // 复杂度得分：C=1.0 → 0；C=2.5 → 1.0
    const complexityScore = Math.min(1, Math.max(0, (complexity - 1.0) / 1.5));

    // 真三维子分 ---------------------------------------------------
    const structure = (coverage * 0.55 + centroidSim * 0.30 + angleSim * 0.15) * 100;
    const fluency = (precision * 0.55 + complexityScore * 0.30 + inkBalance * 0.15) * 100;
    const rhythm = (
      Math.min(coverage, precision) * 0.45 +
      inkBalance * 0.40 +
      angleSim * 0.15
    ) * 100;

    // 总分：几何平均 + 温和幂曲线（v2.1 适度放宽）
    // geo  0.60 → 71     0.70 → 78     0.80 → 86     0.88 → 91     0.95 → 96
    const sNorm = Math.max(0.01, structure / 100);
    const fNorm = Math.max(0.01, fluency / 100);
    const rNorm = Math.max(0.01, rhythm / 100);
    const geo = Math.pow(sNorm * fNorm * rNorm, 1 / 3);
    const totalRaw = Math.pow(geo, 0.70) * 100;
    const finalScore = Math.max(0, Math.min(100, Math.round(totalRaw)));

    return {
      score: finalScore,
      subScores: {
        structure: Math.round(structure * 10) / 10,
        fluency: Math.round(fluency * 10) / 10,
        rhythm: Math.round(rhythm * 10) / 10
      },
      details: {
        coverage: (coverage * 100).toFixed(1),
        precision: (precision * 100).toFixed(1),
        centroid: (centroidSim * 100).toFixed(1),
        angle: (angleSim * 100).toFixed(1),
        complexity: complexity.toFixed(2),
        inkRatio: Rink.toFixed(2),
        inkBalance: (inkBalance * 100).toFixed(1)
      }
    };
  }

  // ════════════════════════════════════════════════════════════════
  //  完整评分入口
  // ════════════════════════════════════════════════════════════════
  async scoreCalligraphy(strokes, templateImage, templateBounds) {
    const validation = this.validateStrokes(strokes);
    if (!validation.passed) {
      return { score: 0, error: '笔迹过于简单，请认真书写' };
    }
    const userBounds = validation.bounds;

    const srcW = (templateBounds && templateBounds.width) || (templateImage && templateImage.width) || 0;
    const srcH = (templateBounds && templateBounds.height) || (templateImage && templateImage.height) || 0;
    if (!srcW || !srcH) {
      return { score: 0, error: '字帖尺寸无效' };
    }

    // 字帖 ROI（自动裁切真实字迹包围盒）
    let roi;
    try {
      roi = this.detectTemplateRoi(templateImage, srcW, srcH);
    } catch (e) {
      console.warn('[VisualScorer] detectRoi fail, fallback to full bounds', e);
      roi = { minX: 0, minY: 0, maxX: srcW, maxY: srcH, width: srcW, height: srcH };
    }

    // 渲染底图 → 离屏 → 提取像素
    const tCanvas = wx.createOffscreenCanvas({ type: '2d', width: this.N, height: this.N });
    const tCtx = tCanvas.getContext('2d');
    this.renderTemplate(templateImage, roi, srcW, srcH, tCtx);
    const tRgba = tCtx.getImageData(0, 0, this.N, this.N).data;

    // 渲染用户笔迹 → 离屏 → 提取像素
    const uCanvas = wx.createOffscreenCanvas({ type: '2d', width: this.N, height: this.N });
    const uCtx = uCanvas.getContext('2d');
    this.renderUser(strokes, userBounds, uCtx);
    const uRgba = uCtx.getImageData(0, 0, this.N, this.N).data;

    return this.calculateFinalScore(tRgba, uRgba, validation.complexity);
  }
}

module.exports = MongolVisualScorer;
