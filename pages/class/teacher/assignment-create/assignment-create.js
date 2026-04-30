const MAX_IMAGES = 9
const { callClassService, uploadFile } = require('../../../../utils/classCloud.js')
const { getTeacherSession } = require('../../../../utils/classStudentAuth.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')
const { SCRIPT_TYPES } = require('../../../../utils/copybookScoreProfile.js')

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
    case 'left': case '270': case '8':
      ctx.translate(0, destH)
      ctx.rotate(-Math.PI / 2)
      drawImageContain(ctx, img, destH, destW)
      break
    case 'right': case '90': case '6':
      ctx.translate(destW, 0)
      ctx.rotate(Math.PI / 2)
      drawImageContain(ctx, img, destH, destW)
      break
    case 'down-mirrored': case '5':
      ctx.translate(destW, destH)
      ctx.scale(-1, -1)
      drawImageContain(ctx, img, destW, destH)
      break
    case 'left-mirrored': case '7':
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

function normalizeImagePath(localPath) {
  return Promise.resolve(localPath)
}

const SCRIPT_LABELS = ['蒙文（细笔写字）', '回鹘文（宽笔描红）', '满文', '汉字']

function genImageRowId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

Page({
  data: {
    layoutClass: '',
    cursorSpacing: 32,
    classId: '',
    title: '',
    requirements: '',
    imageList: [],
    scriptTypes: SCRIPT_TYPES,
    scriptLabels: SCRIPT_LABELS,
    scriptIndex: 0,
    submitting: false
  },

  onLoad(options) {
    this.setData(getClassPageLayout())
    if (!getTeacherSession()) {
      wx.redirectTo({ url: '/pages/class/login/login' })
      return
    }
    const classId = (options.classId || '').trim()
    if (classId) {
      this.setData({ classId })
    }
  },

  onScriptPick(e) {
    const i = Number(e.detail.value)
    if (Number.isNaN(i) || i < 0) {
      return
    }
    const types = this.data.scriptTypes || SCRIPT_TYPES
    if (i >= types.length) {
      return
    }
    this.setData({ scriptIndex: i })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onRequirementsInput(e) {
    this.setData({ requirements: e.detail.value })
  },

  chooseImage() {
    const remain = MAX_IMAGES - this.data.imageList.length
    if (remain <= 0) {
      wx.showToast({ title: `最多添加${MAX_IMAGES}张`, icon: 'none' })
      return
    }

    wx.showModal({
      title: '相册访问',
      content:
        '发布作业需要从相册中选择字帖图片。仅会在您确认后打开图片选择界面，无法访问您未主动选中的照片。',
      confirmText: '去选择',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) {
          return
        }
        const open = () => this._openAlbumPicker(remain)
        if (typeof wx.requirePrivacyAuthorize === 'function') {
          wx.requirePrivacyAuthorize({
            success: open,
            fail: () => {
              wx.showToast({ title: '请先同意隐私保护指引后再选图', icon: 'none' })
            }
          })
        } else {
          open()
        }
      }
    })
  },

  _openAlbumPicker(remain) {
    const done = (paths) => {
      if (!paths || !paths.length) {
        return
      }
      const next = this.data.imageList.concat(
        paths.map((url) => ({
          id: genImageRowId(),
          url,
          count: 1
        }))
      )
      this.setData({ imageList: next })
    }

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: ['album'],
        success: (res) => {
          const files = res.tempFiles || []
          const paths = files.map((f) => f.tempFilePath).filter(Boolean)
          done(paths)
        },
        fail: (err) => {
          console.warn('[assignment-create] chooseMedia fail', err)
          this._chooseImageLegacy(remain, done)
        }
      })
    } else {
      this._chooseImageLegacy(remain, done)
    }
  },

  _chooseImageLegacy(remain, done) {
    wx.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        done(res.tempFilePaths || [])
      },
      fail: (err) => {
        console.warn('[assignment-create] chooseImage fail', err)
        wx.showToast({ title: '选择图片失败', icon: 'none' })
      }
    })
  },

  handleCountChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index) || index < 0) {
      return
    }
    const raw = e.detail.value
    const trimmed = String(raw === undefined || raw === null ? '' : raw).trim()
    if (trimmed === '') {
      const list = this.data.imageList.map((item, i) =>
        i === index ? { ...item, count: '' } : item
      )
      this.setData({ imageList: list })
      return
    }
    let v = parseInt(trimmed, 10)
    if (Number.isNaN(v)) {
      const list = this.data.imageList.map((item, i) =>
        i === index ? { ...item, count: '' } : item
      )
      this.setData({ imageList: list })
      return
    }
    if (v < 1) v = 1
    if (v > 999) v = 999
    const list = this.data.imageList.map((item, i) =>
      i === index ? { ...item, count: v } : item
    )
    this.setData({ imageList: list })
  },

  deleteImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index) || index < 0) {
      return
    }
    const list = [...this.data.imageList]
    list.splice(index, 1)
    this.setData({ imageList: list })
  },

  async submitAssignment() {
    if (this.data.submitting) {
      return
    }
    const title = (this.data.title || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写作业名称', icon: 'none' })
      return
    }
    if (!this.data.imageList.length) {
      wx.showToast({ title: '请至少添加一张字帖图', icon: 'none' })
      return
    }

    for (let i = 0; i < this.data.imageList.length; i++) {
      const row = this.data.imageList[i]
      const t = String(row && row.count !== undefined && row.count !== null ? row.count : '').trim()
      if (t === '' || Number.isNaN(parseInt(t, 10))) {
        wx.showToast({ title: '请输入书写次数', icon: 'none' })
        return
      }
      const n = parseInt(t, 10)
      if (n < 1 || n > 999) {
        wx.showToast({ title: '书写次数需在 1～999', icon: 'none' })
        return
      }
    }

    const classId = (this.data.classId || '').trim()
    if (!classId) {
      wx.showToast({ title: '缺少班级信息，请从班级详情进入', icon: 'none' })
      return
    }
    const requirements = (this.data.requirements || '').trim()
    const types = this.data.scriptTypes || SCRIPT_TYPES
    const idx = Math.max(0, Math.min(types.length - 1, Number(this.data.scriptIndex) || 0))
    const scriptType = types[idx]

    this.setData({ submitting: true })

    try {
      // 1. 逐张上传到云存储
      wx.showLoading({ title: '上传图片 0/' + this.data.imageList.length, mask: true })
      const uploadedList = []
      for (let i = 0; i < this.data.imageList.length; i++) {
        const item = this.data.imageList[i]
        wx.showLoading({ title: `上传图片 ${i + 1}/${this.data.imageList.length}`, mask: true })
        const ext = (() => {
          const m = String(item.url || '').match(/\.([a-zA-Z0-9]+)$/)
          return m ? m[1].toLowerCase() : 'jpg'
        })()
        const cloudPath = `class/copybooks/${classId}/${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}.${ext}`
        const normalizedPath = await normalizeImagePath(item.url)
        const fileID = await uploadFile(normalizedPath || item.url, cloudPath)
        uploadedList.push({
          fileID,
          count: Math.max(1, Math.min(999, parseInt(String(item.count).trim(), 10) || 1))
        })
      }

      // 2. 写作业记录（命中重名时云端会返回 '名称已被占用'）
      wx.showLoading({ title: '发布中', mask: true })
      await callClassService('createAssignment', {
        classId,
        title,
        requirements,
        scriptType,
        imageList: uploadedList
      })
      wx.hideLoading()
      wx.showToast({ title: '发布成功', icon: 'success', duration: 1500 })
      setTimeout(() => {
        wx.navigateBack({ delta: 1 })
      }, 1300)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '发布失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
