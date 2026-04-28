const MAX_IMAGES = 9
const {
  studentStorageKeyForClass,
  appendAssignmentForClass
} = require('../teacher-scope.js')
const { getClassPageLayout } = require('../../../../utils/classLayout.js')
const { SCRIPT_TYPES } = require('../../../../utils/copybookScoreProfile.js')

function countStudentsInClass(classId) {
  if (!classId) {
    return 0
  }
  try {
    const raw = wx.getStorageSync(studentStorageKeyForClass(classId))
    return Array.isArray(raw) ? raw.length : 0
  } catch (e) {
    return 0
  }
}

function todayYMD() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 将选图产生的临时路径转为本地用户目录下的持久路径，便于学生端读取同一作业字帖。
 * 已是持久路径或网络路径则原样返回。
 */
function persistCopybookImageList(items) {
  const fs = wx.getFileSystemManager()
  return (items || []).map((item) => {
    const count = Math.max(1, Number(item.count) || 1)
    let url = item.url
    if (!url || typeof url !== 'string') {
      return { url: '', count }
    }
    const lower = url.toLowerCase()
    if (lower.indexOf('http://') === 0 || lower.indexOf('https://') === 0) {
      return { url, count }
    }
    if (lower.indexOf('cloud://') === 0) {
      return { url, count }
    }
    try {
      const saved = fs.saveFileSync(url)
      return { url: saved || url, count }
    } catch (e) {
      console.warn('[assignment-create] saveFile 字帖图失败，保留原路径', e)
      return { url, count }
    }
  })
}

const SCRIPT_LABELS = ['蒙文（细笔写字）', '回鹘文（宽笔描红）', '满文', '汉字']

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
    scriptIndex: 0
  },

  onLoad(options) {
    this.setData(getClassPageLayout())
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
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
    const trimmed = String(raw ?? '').trim()
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
    if (v < 1) {
      v = 1
    }
    if (v > 999) {
      v = 999
    }
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

  submitAssignment() {
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
    const imageList = persistCopybookImageList(
      this.data.imageList.map((item) => ({
        url: item.url,
        count: Math.max(1, Math.min(999, parseInt(String(item.count).trim(), 10) || 1))
      }))
    )

    const types = this.data.scriptTypes || SCRIPT_TYPES
    const idx = Math.max(0, Math.min(types.length - 1, Number(this.data.scriptIndex) || 0))
    const scriptType = types[idx]

    const record = {
      id: `asg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      title,
      type: '字帖作业',
      scriptType,
      submitCount: 0,
      totalCount: countStudentsInClass(classId),
      date: todayYMD(),
      requirements,
      imageList
    }

    appendAssignmentForClass(classId, record)

    const payload = { classId, title, requirements, imageList }
    console.log('[assignment-create] 发布作业', payload)

    wx.showToast({
      title: '发布成功',
      icon: 'success',
      duration: 1500
    })

    setTimeout(() => {
      wx.navigateBack({
        delta: 1
      })
    }, 1500)
  }
})
