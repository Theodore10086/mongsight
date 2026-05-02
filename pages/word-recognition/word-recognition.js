const { getWordByKey } = require('../../utils/recognition-catalog.js');
const {
  normalizeTrajectoryPayload,
  storePendingRecognitionPlayback
} = require('../../utils/trajectory-utils.js');

Page({
  data: {
    imageTempPath: '',
    imageFileID: '',
    compressedImagePath: '',
    isRecognizing: false,
    errorMessage: '',
    recognizedWord: null,
    candidateWords: [],
    recognizedAtText: '',
    hasTrajectory: false,
    animationStatus: '等待播放',
    confidenceText: '',
    scoreRows: []
  },

  async getCanvasSize() {
    if (this.canvasSize) {
      return this.canvasSize;
    }

    return new Promise((resolve) => {
      const query = wx.createSelectorQuery().in(this);
      query.select('.player-canvas').boundingClientRect((rect) => {
        this.canvasSize = {
          width: Math.max(Math.round(rect?.width || 300), 300),
          height: Math.max(Math.round(rect?.height || 220), 220)
        };
        resolve(this.canvasSize);
      }).exec();
    });
  },

  onUnload() {
    this.stopPlayback();
  },

  onChooseFromCamera() {
    this.chooseImage(['camera']);
  },

  onChooseFromAlbum() {
    this.chooseImage(['album']);
  },

  chooseImage(sourceType) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType,
      success: async (result) => {
        const originalPath = result.tempFilePaths[0];
        const compressedImagePath = await this.prepareRecognitionImage(originalPath);
        this.stopPlayback();
        this.playbackPayload = null;
        this.normalizedTrajectory = null;
        this.setData({
          imageTempPath: compressedImagePath,
          compressedImagePath,
          imageFileID: '',
          errorMessage: '',
          recognizedWord: null,
          candidateWords: [],
          recognizedAtText: '',
          hasTrajectory: false,
          animationStatus: '等待播放',
          confidenceText: '',
          scoreRows: []
        });
      }
    });
  },

  async prepareRecognitionImage(filePath) {
    const compressedPath = await this.compressImage(filePath);
    const croppedPath = await this.cropRecognitionImage(compressedPath);
    return croppedPath || compressedPath;
  },

  compressImage(filePath) {
    return new Promise((resolve) => {
      wx.compressImage({
        src: filePath,
        quality: 70,
        success: (result) => resolve(result.tempFilePath || filePath),
        fail: () => resolve(filePath)
      });
    });
  },

  cropRecognitionImage(filePath) {
    return new Promise((resolve) => {
      wx.getImageInfo({
        src: filePath,
        success: (imageInfo) => {
          const sourceWidth = imageInfo.width || 0;
          const sourceHeight = imageInfo.height || 0;
          if (!sourceWidth || !sourceHeight) {
            resolve(filePath);
            return;
          }

          const cropWidth = Math.round(sourceWidth * 0.58);
          const cropHeight = Math.round(sourceHeight * 0.88);
          const cropX = Math.max(Math.round((sourceWidth - cropWidth) / 2), 0);
          const cropY = Math.max(Math.round(sourceHeight * 0.04), 0);
          const destWidth = 540;
          const destHeight = Math.max(Math.round((cropHeight / Math.max(cropWidth, 1)) * destWidth), 720);
          const ctx = wx.createCanvasContext('cropCanvas', this);

          ctx.setFillStyle('#ffffff');
          ctx.fillRect(0, 0, destWidth, destHeight);
          ctx.drawImage(filePath, cropX, cropY, cropWidth, cropHeight, 0, 0, destWidth, destHeight);
          ctx.draw(false, () => {
            wx.canvasToTempFilePath({
              canvasId: 'cropCanvas',
              x: 0,
              y: 0,
              width: destWidth,
              height: destHeight,
              destWidth,
              destHeight,
              fileType: 'jpg',
              quality: 0.92,
              success: (result) => resolve(result.tempFilePath || filePath),
              fail: () => resolve(filePath)
            }, this);
          });
        },
        fail: () => resolve(filePath)
      });
    });
  },

  async onRecognize() {
    if (!this.data.compressedImagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }

    this.setData({
      isRecognizing: true,
      errorMessage: '',
      recognizedWord: null,
      candidateWords: [],
      hasTrajectory: false,
      animationStatus: '识别中...',
      confidenceText: '',
      scoreRows: []
    });

    try {
      const fileID = await this.ensureImageUploaded();
      const response = await wx.cloud.callFunction({
        name: 'recognize-word-image',
        data: { fileID }
      });
      const result = response?.result || {};

      if (!result.success) {
        this.setData({
          errorMessage: '自动识别未判稳，我先给你三个候选，你点一个就直接播放。',
          candidateWords: this.getDefaultCandidates()
        });
        return;
      }

      const resultData = result.data || {};
      const candidates = Array.isArray(resultData.candidates) ? resultData.candidates : [];
      const scoreRows = this.formatScoreRows(candidates);
      const confidenceText = this.formatConfidence(resultData.confidence);

      if (this.shouldAutoSelect(resultData)) {
        this.applyRecognitionResult(resultData, { scoreRows, confidenceText });
        return;
      }

      this.setData({
        candidateWords: this.mapCandidates(candidates),
        scoreRows,
        confidenceText,
        errorMessage: '自动识别未判稳，我先给你三个候选，你点一个就直接播放。'
      });
    } catch (error) {
      console.error('[Recognition] recognize failed:', error);
      this.setData({
        errorMessage: '识别请求失败，我先给你三个候选，你点一个就直接播放。',
        candidateWords: this.getDefaultCandidates()
      });
    } finally {
      this.setData({ isRecognizing: false });
    }
  },

  mapCandidates(candidates = []) {
    if (!Array.isArray(candidates) || !candidates.length) {
      return this.getDefaultCandidates();
    }

    return candidates
      .map((item) => {
        const word = getWordByKey(item.wordKey);
        if (!word) {
          return null;
        }
        return {
          ...word,
          scoreText: `${Math.round(Number(item.score || 0) * 100)}%`
        };
      })
      .filter(Boolean);
  },

  formatScoreRows(candidates = []) {
    return candidates.map((item) => ({
      wordKey: item.wordKey,
      label: `${item.chinese} ${item.transliteration}`,
      scoreText: `${Math.round(Number(item.score || 0) * 100)}%`
    }));
  },

  formatConfidence(confidence) {
    const value = Math.round(Number(confidence || 0) * 100);
    if (value >= 75) {
      return `识别置信度高（${value}%）`;
    }
    if (value >= 45) {
      return `识别置信度中等（${value}%）`;
    }
    return `识别置信度偏低（${value}%）`;
  },

  shouldAutoSelect(resultData = {}) {
    const candidates = Array.isArray(resultData.candidates) ? resultData.candidates : [];
    if (!candidates.length) {
      return false;
    }

    const [first, second] = candidates;
    const firstScore = Number(first?.score || 0);
    const secondScore = Number(second?.score || 0);
    const confidence = Number(resultData.confidence || 0);

    if (confidence >= 0.22) {
      return true;
    }

    if (!second) {
      return firstScore > 0;
    }

    return firstScore >= 0.42 || (firstScore - secondScore) >= 0.06;
  },

  getDefaultCandidates() {
    return ['narasu', 'huch', 'hair']
      .map((wordKey) => getWordByKey(wordKey))
      .filter(Boolean);
  },

  async onSelectCandidate(e) {
    const { wordKey } = e.currentTarget.dataset;
    this.setData({
      isRecognizing: true,
      errorMessage: ''
    });

    try {
      const response = await wx.cloud.callFunction({
        name: 'recognize-word-image',
        data: { wordKey }
      });
      const result = response?.result || {};
      if (!result.success) {
        this.setData({
          errorMessage: '这个词加载失败了，请再点一次。'
        });
        return;
      }

      const candidates = Array.isArray(result.data?.candidates) ? result.data.candidates : [];
      this.applyRecognitionResult(result.data, {
        scoreRows: this.formatScoreRows(candidates),
        confidenceText: this.formatConfidence(result.data?.confidence)
      });
    } catch (error) {
      console.error('[Recognition] manual select failed:', error);
      this.setData({
        errorMessage: '这个词加载失败了，请再点一次。'
      });
    } finally {
      this.setData({ isRecognizing: false });
    }
  },

  applyRecognitionResult(data, extras = {}) {
    const recognizedWord = getWordByKey(data?.word?.wordKey);
    const normalizedTrajectory = normalizeTrajectoryPayload(data?.standardTrajectory);
    const recognizedAtText = this.formatRecognitionTime(data?.recognizedAt || Date.now());

    this.playbackPayload = {
      word: data.word,
      imageFileID: data.imageFileID || '',
      standardTrajectory: data.standardTrajectory
    };

    this.normalizedTrajectory = normalizedTrajectory;
    this.setData({
      errorMessage: '',
      recognizedWord,
      candidateWords: [],
      recognizedAtText,
      hasTrajectory: normalizedTrajectory.length > 0,
      animationStatus: normalizedTrajectory.length > 0 ? '自动播放中' : '无可播放轨迹',
      confidenceText: extras.confidenceText || this.formatConfidence(data?.confidence),
      scoreRows: extras.scoreRows || this.formatScoreRows(data?.candidates || [])
    });

    if (normalizedTrajectory.length > 0) {
      this.startPlayback(normalizedTrajectory);
    }
  },

  async ensureImageUploaded() {
    if (this.data.imageFileID) {
      return this.data.imageFileID;
    }

    const extension = (this.data.compressedImagePath.split('.').pop() || 'jpg').toLowerCase();
    const cloudPath = `recognition-inputs/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const uploadResult = await wx.cloud.uploadFile({
      cloudPath,
      filePath: this.data.compressedImagePath
    });

    this.setData({
      imageFileID: uploadResult.fileID
    });

    return uploadResult.fileID;
  },

  async startPlayback(strokes) {
    this.stopPlayback();
    const context = wx.createCanvasContext('recognitionPlayback', this);
    const { width, height } = await this.getCanvasSize();
    const segments = this.flattenStrokes(strokes, { width, height });
    let index = 0;

    const redraw = () => {
      context.setFillStyle('#fffdfa');
      context.fillRect(0, 0, width, height);
      context.setStrokeStyle('#5f3d23');
      context.setLineCap('round');
      context.setLineJoin('round');

      for (let currentIndex = 0; currentIndex < index; currentIndex += 1) {
        const segment = segments[currentIndex];
        context.setLineWidth(segment.width);
        context.beginPath();
        context.moveTo(segment.from.x, segment.from.y);
        context.lineTo(segment.to.x, segment.to.y);
        context.stroke();
      }

      context.draw();
      index += 1;

      if (index > segments.length) {
        this.setData({ animationStatus: '播放完成' });
        this.stopPlayback();
      }
    };

    this.setData({ animationStatus: '自动播放中' });
    redraw();
    this.playbackTimer = setInterval(redraw, 24);
  },

  flattenStrokes(strokes, canvasSize) {
    const { width, height } = canvasSize || this.canvasSize || { width: 300, height: 220 };
    const allPoints = [];
    strokes.forEach((stroke) => {
      stroke.points.forEach((point) => allPoints.push(point));
    });

    if (!allPoints.length) {
      return [];
    }

    const xs = allPoints.map((point) => point.x);
    const ys = allPoints.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sourceWidth = Math.max(maxX - minX, 1);
    const sourceHeight = Math.max(maxY - minY, 1);
    const paddingX = width * 0.12;
    const paddingY = height * 0.1;
    const scale = Math.min(
      Math.max((width - paddingX * 2) / sourceWidth, 0.1),
      Math.max((height - paddingY * 2) / sourceHeight, 0.1)
    );
    const offsetX = (width - sourceWidth * scale) / 2;
    const offsetY = (height - sourceHeight * scale) / 2;

    const segments = [];
    strokes.forEach((stroke) => {
      for (let index = 1; index < stroke.points.length; index += 1) {
        const previous = stroke.points[index - 1];
        const current = stroke.points[index];
        segments.push({
          from: {
            x: (previous.x - minX) * scale + offsetX,
            y: (previous.y - minY) * scale + offsetY
          },
          to: {
            x: (current.x - minX) * scale + offsetX,
            y: (current.y - minY) * scale + offsetY
          },
          width: Math.max(current.w || 3, 2)
        });
      }
    });

    return segments;
  },

  stopPlayback() {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  },

  onReplay() {
    if (this.normalizedTrajectory?.length) {
      this.startPlayback(this.normalizedTrajectory);
    }
  },

  onGoToHomePlayback() {
    if (!this.playbackPayload) {
      return;
    }

    storePendingRecognitionPlayback(this.playbackPayload);
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }

    wx.navigateTo({
      url: '/pages/index/index'
    });
  },

  onReset() {
    this.stopPlayback();
    this.playbackPayload = null;
    this.normalizedTrajectory = null;
    this.setData({
      imageTempPath: '',
      imageFileID: '',
      compressedImagePath: '',
      isRecognizing: false,
      errorMessage: '',
      recognizedWord: null,
      candidateWords: [],
      recognizedAtText: '',
      hasTrajectory: false,
      animationStatus: '等待播放',
      confidenceText: '',
      scoreRows: []
    });
  },

  formatRecognitionTime(timestamp) {
    const date = new Date(timestamp);
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  }
});
