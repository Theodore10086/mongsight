/**
 * 视觉打分核心算法: 漏斗式"闯关"模型 [cite: 1]
 * 整合功能：矢量拦截、空间归一化、多维评分、墨量惩罚 [cite: 5, 17, 30, 50]
 */
class MongolVisualScorer {
  constructor(matrixSize = 200) {
    this.N = matrixSize; // 标准矩阵尺寸 N*N [cite: 26]
    this.Tolerance = 1.5; // 人性化宽容度系数 [cite: 62]
  }

  /**
   * 关卡一：矢量轨迹拦截 [cite: 5]
   * 目标：利用几何特征瞬间拦截无效滑动 [cite: 6]
   */
  validateStrokes(strokes) {
    if (!strokes || strokes.length === 0) return { passed: false };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let L = 0; // 笔画总真实长度 [cite: 11]

    strokes.forEach(stroke => {
      // 获取笔画点数据，兼容 stroke.points 和 stroke 两种格式
      const points = stroke.points || stroke || [];
      if (!points || points.length === 0) return;

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
        
        // 提取包围盒 [cite: 7, 8]
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        
        // 计算相邻点欧氏距离之和 [cite: 12, 13]
        if (i > 0) {
          const prev = points[i - 1];
          if (prev && typeof prev.x === 'number' && typeof prev.y === 'number') {
            L += Math.sqrt(Math.pow(p.x - prev.x, 2) + Math.pow(p.y - prev.y, 2));
          }
        }
      }
    });

    // 检查是否有有效数据
    if (minX === Infinity) return { passed: false };

    const Du = Math.sqrt(Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2)); // 对角线长度 [cite: 9, 10]
    const C = L / Math.max(1, Du); // 笔迹复杂度 [cite: 14, 15]

    return {
      passed: C >= 1.2, // 判定规则: C < 1.2 为无效 [cite: 16]
      bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
      complexity: C
    };
  }

  /**
   * 关卡二：空间归一化投影
   * 将底图和用户轨迹投影到标准矩阵
   */
  projectToMatrix(bounds, canvas, ctx, scaleRatio = 1) {
    const { minX, maxX, minY, maxY, width, height } = bounds;
    
    // 计算缩放比例和平移量
    const scaleX = this.N / Math.max(1, width);
    const scaleY = this.N / Math.max(1, height);
    const scale = Math.min(scaleX, scaleY) * 0.9; // 留10%边距
    
    const offsetX = (this.N - width * scale) / 2;
    const offsetY = (this.N - height * scale) / 2;

    ctx.save();
    ctx.scale(scaleRatio, scaleRatio);
    ctx.translate(offsetX - minX * scale, offsetY - minY * scale);
    ctx.scale(scale, scale);
    
    return { scale, offsetX, offsetY };
  }

  /**
   * 渲染底图到矩阵 - 确保彻底分离
   */
  renderTemplateToMatrix(templateImage, templateBounds, canvas, ctx) {
    // 再次确保画布完全清空
    ctx.clearRect(0, 0, this.N, this.N);
    
    // 设置纯白背景
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, this.N, this.N);
    
    const projection = this.projectToMatrix(templateBounds, canvas, ctx);
    
    // 渲染底图（黑色字迹在白色背景上）
    ctx.drawImage(templateImage, 0, 0);
    ctx.restore();
    
    return projection;
  }

  /**
   * 渲染用户轨迹到矩阵 - 确保彻底分离
   */
  renderUserToMatrix(strokes, userBounds, canvas, ctx) {
    // 再次确保画布完全清空
    ctx.clearRect(0, 0, this.N, this.N);
    
    // 设置透明背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0)';
    ctx.fillRect(0, 0, this.N, this.N);
    
    const projection = this.projectToMatrix(userBounds, canvas, ctx);
    
    // 设置用户轨迹样式
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 15;
    ctx.strokeStyle = 'black';
    ctx.fillStyle = 'black';

    strokes.forEach(stroke => {
      const points = stroke.points || stroke || [];
      if (!points || points.length === 0) return;

      // 验证第一个点
      if (!points[0] || typeof points[0].x !== 'number' || typeof points[0].y !== 'number') return;
      
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      
      for (let i = 1; i < points.length; i++) {
        if (!points[i] || typeof points[i].x !== 'number' || typeof points[i].y !== 'number') continue;
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    });
    
    ctx.restore();
    return projection;
  }

  /**
   * 图像二值化处理 - 改进版本确保彻底分离
   */
  binarizeImageData(imageData) {
    const binaryData = new Uint8ClampedArray(imageData.length);
    
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const a = imageData[i + 3];
      
      // 计算灰度值
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      
      // 改进的二值化逻辑：
      // 1. 如果Alpha通道接近透明（<10），认为是背景
      // 2. 如果灰度值较暗（<128），认为是黑色像素
      // 3. 否则认为是白色背景
      const isBlack = a < 10 ? false : gray < 128;
      
      // 二值化：黑色像素设为255（白色），白色背景设为0（黑色）
      // 这样在计算交集时更容易处理
      const value = isBlack ? 255 : 0;
      
      binaryData[i] = value;     // R
      binaryData[i + 1] = value; // G
      binaryData[i + 2] = value; // B
      binaryData[i + 3] = 255;   // A（完全不透明）
    }
    
    return binaryData;
  }

  /**
   * 关卡三 & 四：核心评分与惩罚机制 [cite: 30, 50]
   * @param {Uint8ClampedArray} targetData 底图二值化像素 (200x200)
   * @param {Uint8ClampedArray} userData 用户轨迹二值化像素 (200x200)
   * @param {Object} targetBounds 底图包围盒数据 [cite: 45]
   * @param {Object} userBounds 用户轨迹包围盒数据 [cite: 46]
   */
  calculateFinalScore(targetData, userData, targetBounds, userBounds) {
    let areaT = 0, areaU = 0, areaInt = 0;
    let sumXt = 0, sumYt = 0, sumXu = 0, sumYu = 0;

    // 像素级多维阅卷 [cite: 30] - 使用改进的二值化数据
    for (let i = 0; i < targetData.length; i += 4) {
      // 新的二值化逻辑：黑色像素为255（白色），白色背景为0（黑色）
      // 所以我们需要反转逻辑：值>128的是黑色像素，值<=128的是白色背景
      const isT = targetData[i] > 128; // 底图黑色像素 [cite: 31]
      const isU = userData[i] > 128;   // 用户黑色像素 [cite: 32]
      
      const pixelIndex = i / 4;
      const x = pixelIndex % this.N;
      const y = Math.floor(pixelIndex / this.N);

      if (isT) { areaT++; sumXt += x; sumYt += y; }
      if (isU) { areaU++; sumXu += x; sumYu += y; }
      if (isT && isU) { areaInt++; } // 重合像素 (交集) [cite: 33]
    }

    if (areaT === 0) return { score: 0, error: '底图无可识别字迹' };
    if (areaU === 0) return { score: 0, error: '未检测到书写轨迹' };

    // 1. 覆盖率 (35%): 考核有没有写全 [cite: 35, 36]
    const scoreCov = (areaInt / areaT) * 100;

    // 2. 重合度 (35%): 考核有没有乱涂 [cite: 37, 38]
    const scoreAcc = (areaInt / Math.max(1, areaU)) * 100;

    // 3. 重心偏移 (15%): 考核字形骨架 [cite: 39, 40]
    const dist = Math.sqrt(
      Math.pow((sumXt / areaT) - (sumXu / Math.max(1, areaU)), 2) +
      Math.pow((sumYt / areaT) - (sumYu / Math.max(1, areaU)), 2)
    );
    const Dmax = this.N * 0.2; // 最大容忍距离 20% [cite: 42]
    const scoreCen = Math.max(0, (1 - dist / Dmax) * 100); // [cite: 43]

    // 4. 宽高比拟合 (15%): 考核字形胖瘦 [cite: 44]
    // 修复：使用实际有像素的区域计算宽高比，而不是整个包围盒
    const { targetPixelBounds, userPixelBounds } = this._calculatePixelBounds(targetData, userData, this.N);
    
    const Rt = targetPixelBounds.width / (targetPixelBounds.height || 1); // 底图实际字迹宽高比
    const Ru = userPixelBounds.width / (userPixelBounds.height || 1);     // 用户实际字迹宽高比
    
    // 修复评分逻辑：宽高比越接近，得分越高
    const ratioSimilarity = Math.min(Rt, Ru) / Math.max(Rt, Ru);
    const scoreRatio = ratioSimilarity * 100; // [cite: 47]

    // 计算原始总分 [cite: 48, 49]
    const scoreRaw = (scoreCov * 0.35) + (scoreAcc * 0.35) + (scoreCen * 0.15) + (scoreRatio * 0.15);

    // 关卡四：墨量动态惩罚 [cite: 50, 52]
    const Rink = areaU / areaT; // [cite: 53]
    let penalty = 0;
    if (Rink < 0.3) {
      penalty = (0.3 - Rink) * 100; // 过细惩罚 [cite: 55, 56]
    } else if (Rink > 3.0) {
      penalty = (Rink - 3.0) * 30; // 过粗/涂黑惩罚 [cite: 57, 58]
    }

    // 最终得分修正 [cite: 61, 63]
    let finalScore = (scoreRaw - penalty) * this.Tolerance;
    
    // 限制 0-100 之间 [cite: 64, 65]
    finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

    return {
      score: finalScore,
      details: {
        coverage: scoreCov.toFixed(1),
        accuracy: scoreAcc.toFixed(1),
        centroid: scoreCen.toFixed(1),
        aspectRatio: scoreRatio.toFixed(1),
        inkRatio: Rink.toFixed(2),
        penalty: penalty.toFixed(1)
      }
    };
  }

  /**
   * 计算实际有像素的区域包围盒
   */
  _calculatePixelBounds(binaryTemplate, binaryUser, size) {
    let tMinX = size, tMaxX = 0, tMinY = size, tMaxY = 0;
    let uMinX = size, uMaxX = 0, uMinY = size, uMaxY = 0;
    
    // 扫描底图像素，找到实际有像素的区域
    for (let i = 0; i < binaryTemplate.length; i += 4) {
      const pixelIndex = i / 4;
      const x = pixelIndex % size;
      const y = Math.floor(pixelIndex / size);
      
      // 如果是黑色像素（值>128）
      if (binaryTemplate[i] > 128) {
        tMinX = Math.min(tMinX, x); tMaxX = Math.max(tMaxX, x);
        tMinY = Math.min(tMinY, y); tMaxY = Math.max(tMaxY, y);
      }
    }
    
    // 扫描用户像素，找到实际有像素的区域
    for (let i = 0; i < binaryUser.length; i += 4) {
      const pixelIndex = i / 4;
      const x = pixelIndex % size;
      const y = Math.floor(pixelIndex / size);
      
      // 如果是黑色像素（值>128）
      if (binaryUser[i] > 128) {
        uMinX = Math.min(uMinX, x); uMaxX = Math.max(uMaxX, x);
        uMinY = Math.min(uMinY, y); uMaxY = Math.max(uMaxY, y);
      }
    }
    
    // 如果没有检测到像素，使用默认值避免除零错误
    const targetPixelBounds = {
      minX: tMinX === size ? 0 : tMinX,
      maxX: tMaxX === 0 ? size : tMaxX,
      minY: tMinY === size ? 0 : tMinY,
      maxY: tMaxY === 0 ? size : tMaxY,
      width: tMaxX === 0 ? size : Math.max(1, tMaxX - tMinX),
      height: tMaxY === 0 ? size : Math.max(1, tMaxY - tMinY)
    };
    
    const userPixelBounds = {
      minX: uMinX === size ? 0 : uMinX,
      maxX: uMaxX === 0 ? size : uMaxX,
      minY: uMinY === size ? 0 : uMinY,
      maxY: uMaxY === 0 ? size : uMaxY,
      width: uMaxX === 0 ? size : Math.max(1, uMaxX - uMinX),
      height: uMaxY === 0 ? size : Math.max(1, uMaxY - uMinY)
    };
    
    return { targetPixelBounds, userPixelBounds };
  }

  /**
   * 完整打分流程 - 彻底分离Canvas数据提取
   */
  async scoreCalligraphy(strokes, templateImage, templateBounds) {
    // 关卡一：矢量轨迹拦截
    const validation = this.validateStrokes(strokes);
    if (!validation.passed) {
      return { score: 0, error: '笔迹过于简单，请认真书写' };
    }

    const userBounds = validation.bounds;

    // 阶段一：底图渲染和数据提取（完全独立）
    const templateCanvas = wx.createOffscreenCanvas({ type: '2d', width: this.N, height: this.N });
    const tCtx = templateCanvas.getContext('2d');
    
    // 彻底清空底图画布
    tCtx.clearRect(0, 0, this.N, this.N);
    
    // 渲染底图
    this.renderTemplateToMatrix(templateImage, templateBounds, templateCanvas, tCtx);
    
    // 立即提取底图数据（避免任何污染）
    const templateImageData = tCtx.getImageData(0, 0, this.N, this.N).data;
    const binaryTemplate = this.binarizeImageData(templateImageData);

    // 阶段二：用户轨迹渲染和数据提取（完全独立）
    const userCanvas = wx.createOffscreenCanvas({ type: '2d', width: this.N, height: this.N });
    const uCtx = userCanvas.getContext('2d');
    
    // 彻底清空用户画布
    uCtx.clearRect(0, 0, this.N, this.N);
    
    // 渲染用户轨迹
    this.renderUserToMatrix(strokes, userBounds, userCanvas, uCtx);
    
    // 立即提取用户数据（避免任何污染）
    const userImageData = uCtx.getImageData(0, 0, this.N, this.N).data;
    const binaryUser = this.binarizeImageData(userImageData);

    // 阶段三：计算最终得分
    return this.calculateFinalScore(binaryTemplate, binaryUser, templateBounds, userBounds);
  }
}

module.exports = MongolVisualScorer;