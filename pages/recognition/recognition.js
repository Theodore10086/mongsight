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
    ocrRawText: '',
    recognizedWord: null,
    recognizedAtText: '',
    hasTrajectory: false,
    animationStatus: '等待播放'
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
        const compressedImagePath = await this.compressImage(originalPath);
        this.stopPlayback();
        this.setData({
          imageTempPath: compressedImagePath,
          compressedImagePath,
          imageFileID: '',
          errorMessage: '',
          ocrRawText: '',
          recognizedWord: null,
          recognizedAtText: '',
          hasTrajectory: false,
          animationStatus: '等待播放'
        });
      }
    });
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

  async onRecognize() {
    if (!this.data.compressedImagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }

    this.setData({
      isRecognizing: true,
      errorMessage: '',
      ocrRawText: '',
      recognizedWord: null,
      hasTrajectory: false,
      animationStatus: '识别中'
    });

    try {
      const fileID = await this.ensureImageUploaded();
      const response = await wx.cloud.callFunction({
        name: 'recognize-word-image',
        data: {
          fileID
        }
      });

      const result = response?.result || {};
      if (!result.success) {
        this.setData({
          errorMessage: result.message || '未识别到受支持词汇',
          ocrRawText: result.ocr?.rawText || ''
        });
        return;
      }

      const recognizedWord = getWordByKey(result.data?.word?.wordKey);
      const normalizedTrajectory = normalizeTrajectoryPayload(result.data?.standardTrajectory);
      const recognizedAtText = this.formatRecognitionTime(result.data?.recognizedAt || Date.now());

      this.playbackPayload = {
        word: result.data.word,
        imageFileID: result.data.imageFileID,
        ocr: result.data.ocr,
        standardTrajectory: result.data.standardTrajectory
      };

      this.normalizedTrajectory = normalizedTrajectory;
      this.setData({
        recognizedWord,
        recognizedAtText,
        hasTrajectory: normalizedTrajectory.length > 0,
        animationStatus: normalizedTrajectory.length > 0 ? '自动播放中' : '无可播放轨迹',
        ocrRawText: result.data?.ocr?.rawText || ''
      });

      if (normalizedTrajectory.length > 0) {
        this.startPlayback(normalizedTrajectory);
      }
    } catch (error) {
      console.error('[Recognition] recognize failed:', error);
      this.setData({
        errorMessage: '识别请求失败，请稍后再试'
      });
    } finally {
      this.setData({ isRecognizing: false });
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

  startPlayback(strokes) {
    this.stopPlayback();
    const context = wx.createCanvasContext('recognitionPlayback', this);
    const { width, height } = this.getCanvasSize();
    const segments = this.flattenStrokes(strokes);
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

  flattenStrokes(strokes) {
    const { width, height } = this.getCanvasSize();
    const allPoints = [];
    strokes.forEach((stroke) => {
      stroke.points.forEach((point) => allPoints.push(point));
    });

    const xs = allPoints.map((point) => point.x);
    const ys = allPoints.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sourceWidth = Math.max(maxX - minX, 1);
    const sourceHeight = Math.max(maxY - minY, 1);
    const scale = Math.min((width - 48) / sourceWidth, (height - 48) / sourceHeight);
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

  getCanvasSize() {
    return { width: 702, height: 420 };
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
      ocrRawText: '',
      recognizedWord: null,
      recognizedAtText: '',
      hasTrajectory: false,
      animationStatus: '等待播放'
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
