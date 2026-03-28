class CardGenerator {
  constructor(options = {}) {
    this.canvas = options.canvas || null
    this.ctx = options.ctx || null
    this.width = options.width || 375
    this.height = options.height || 600
    this.dpr = options.dpr || wx.getSystemInfoSync().pixelRatio
    
    this.config = {
      cardSize: { width: 300, height: 420 },
      cornerRadius: 16,
      avatarSize: 64,
      texturePath: {
        iron: '/assets/images/iron_texture.png',
        gold: '/assets/images/gold_texture.png',
        silver: '/assets/images/silver_texture.png',
        bronze: '/assets/images/bronze_texture.png'
      },
      iconPath: {
        cloud: '/assets/images/cloud_icon.png',
        defaultAvatar: '/assets/images/default_avatar.png'
      }
    }
    
    this.cardData = {
      material: 'silver',
      fluency: 0,
      accuracy: 0,
      userInfo: null,
      strokeData: null,
      seed: 0,
      cloudPositions: [],
      level: '牧羊人·墨客'
    }
    
    this._loadedImages = {}
  }

  setContext(ctx, canvas, width, height) {
    this.ctx = ctx
    this.canvas = canvas
    if (width) this.width = width
    if (height) this.height = height
  }

  async preloadImages() {
    const imageUrls = Object.values(this.config.texturePath).concat(
      Object.values(this.config.iconPath)
    )
    
    const loadImage = (src) => {
      return new Promise((resolve, reject) => {
        const img = this.canvas.createImage()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
      })
    }
    
    const promises = imageUrls.map(async (url) => {
      try {
        const img = await loadImage(url)
        this._loadedImages[url] = img
      } catch (e) {
        console.warn(`[CardGenerator] Failed to load image: ${url}`)
      }
    })
    
    await Promise.allSettled(promises)
    console.log('[CardGenerator] Images preloaded')
  }

  calculateStrokeFeature(strokes) {
    if (!strokes || strokes.length === 0) {
      return { fluency: 0.5, accuracy: 0.5 }
    }

    const lastStroke = strokes[strokes.length - 1]
    const points = lastStroke.points || lastStroke
    
    if (!points || points.length < 2) {
      return { fluency: 0.5, accuracy: 0.5 }
    }

    let totalVelocity = 0
    let totalPressure = 0
    let pointCount = 0

    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x
      const dy = points[i].y - points[i - 1].y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const time = points[i].t - points[i - 1].t

      if (time > 0) {
        totalVelocity += distance / time
        pointCount++
      }

      if (points[i].w) {
        totalPressure += points[i].w
      }
    }

    const avgVelocity = pointCount > 0 ? totalVelocity / pointCount : 0
    const avgPressure = pointCount > 0 ? totalPressure / pointCount : 0

    const normalizedVelocity = Math.min(Math.max(avgVelocity / 8, 0), 1)
    const normalizedPressure = Math.min(Math.max(avgPressure / 10, 0), 1)

    const fluency = (normalizedVelocity * 0.6 + normalizedPressure * 0.4)
    const accuracy = (1 - normalizedVelocity * 0.3 + normalizedPressure * 0.7)

    return {
      fluency: Math.min(Math.max(fluency, 0), 1),
      accuracy: Math.min(Math.max(accuracy, 0), 1)
    }
  }

  generateSeed(strokes) {
    if (!strokes || strokes.length === 0) {
      return Math.random() * 10000
    }

    const lastStroke = strokes[strokes.length - 1]
    const points = lastStroke.points || lastStroke

    if (!points || points.length === 0) {
      return Math.random() * 10000
    }

    let seed = 0
    points.forEach((point, index) => {
      seed += (point.x || 0) * (index + 1) * 31
      seed += (point.y || 0) * (index + 1) * 17
      seed += (point.t || 0) % 1000
      if (point.w) seed += point.w * (index + 1)
    })

    return Math.abs(seed % 10000)
  }

  seededRandom(seed) {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }

  determineMaterial(fluency, accuracy) {
    if (fluency > 0.8) {
      return 'iron'
    } else if (accuracy > 0.8) {
      return 'gold'
    } else if (fluency + accuracy > 1.2) {
      return 'silver'
    } else {
      return 'bronze'
    }
  }

  generateCloudPositions(seed, count = 5) {
    const positions = []
    const random = (offset = 0) => this.seededRandom(seed + offset)

    for (let i = 0; i < count; i++) {
      positions.push({
        x: 30 + random(i * 3) * 240,
        y: 30 + random(i * 3 + 1) * 360,
        scale: 0.5 + random(i * 3 + 2) * 0.8,
        rotation: random(i * 3 + 3) * Math.PI * 2,
        opacity: 0.1 + random(i * 3 + 4) * 0.3
      })
    }

    return positions
  }

  async generate(options = {}) {
    const { strokes = [], userInfo = {}, level = '牧羊人·墨客' } = options

    const feature = this.calculateStrokeFeature(strokes)
    const seed = this.generateSeed(strokes)
    const material = this.determineMaterial(feature.fluency, feature.accuracy)
    const cloudPositions = this.generateCloudPositions(seed, 5)

    this.cardData = {
      material,
      fluency: feature.fluency,
      accuracy: feature.accuracy,
      userInfo,
      strokeData: strokes.length > 0 ? strokes[strokes.length - 1] : null,
      seed,
      cloudPositions,
      level
    }

    await this._renderCard()

    return {
      success: true,
      material,
      fluency: feature.fluency,
      accuracy: feature.accuracy,
      seed
    }
  }

  async _renderCard() {
    const ctx = this.ctx
    const { width, height } = this.config.cardSize
    const x = (this.width - width) / 2
    const y = (this.height - height) / 2

    ctx.save()
    ctx.translate(x, y)

    this._drawCardBackground(ctx, width, height)
    this._drawClouds(ctx, width, height)
    this._drawStrokeReplica(ctx, width, height)
    await this._drawAvatar(ctx, width, height)
    this._drawNickname(ctx, width, height)
    this._drawLevel(ctx, width, height)
    this._drawBorder(ctx, width, height)

    ctx.restore()
  }

  _drawCardBackground(ctx, width, height) {
    const { material } = this.cardData
    const textureKey = this.config.texturePath[material]
    const textureImg = this._loadedImages[textureKey]

    ctx.beginPath()
    this._roundRect(ctx, 0, 0, width, height, this.config.cornerRadius)

    if (textureImg) {
      ctx.save()
      ctx.clip()
      ctx.drawImage(textureImg, 0, 0, width, height)
      ctx.restore()
    } else {
      const gradients = {
        iron: { start: '#3a3a3a', end: '#1a1a1a' },
        gold: { start: '#d4af37', end: '#8b6914' },
        silver: { start: '#c0c0c0', end: '#808080' },
        bronze: { start: '#cd7f32', end: '#8b4513' }
      }

      const gradient = ctx.createLinearGradient(0, 0, width, height)
      const colors = gradients[material] || gradients.silver
      gradient.addColorStop(0, colors.start)
      gradient.addColorStop(1, colors.end)

      ctx.fillStyle = gradient
      ctx.fill()
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 20
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 8
  }

  _drawClouds(ctx, width, height) {
    const { cloudPositions } = this.cardData
    const cloudImg = this._loadedImages[this.config.iconPath.cloud]

    cloudPositions.forEach((pos) => {
      ctx.save()
      ctx.globalAlpha = pos.opacity
      ctx.translate(pos.x, pos.y)
      ctx.rotate(pos.rotation)
      ctx.scale(pos.scale, pos.scale)

      if (cloudImg) {
        ctx.drawImage(cloudImg, -25, -15, 50, 30)
      } else {
        ctx.beginPath()
        ctx.arc(0, 0, 20, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.fill()
      }

      ctx.restore()
    })
  }

  _drawStrokeReplica(ctx, width, height) {
    const { strokeData } = this.cardData
    if (!strokeData) return

    const points = strokeData.points || strokeData
    if (!points || points.length === 0) return

    const padding = 40
    const cardWidth = width - padding * 2
    const cardHeight = height * 0.4
    const startX = padding
    const startY = height * 0.55

    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity

    points.forEach(p => {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    })

    const strokeWidth = maxX - minX || 1
    const strokeHeight = maxY - minY || 1
    const scaleX = cardWidth / strokeWidth
    const scaleY = cardHeight / strokeHeight
    const scale = Math.min(scaleX, scaleY, 2)

    const offsetX = (cardWidth - strokeWidth * scale) / 2
    const offsetY = (cardHeight - strokeHeight * scale) / 2

    ctx.save()
    ctx.translate(startX + offsetX, startY + offsetY)
    ctx.scale(scale, scale)
    ctx.translate(-minX, -minY)

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.lineWidth = 2 / scale
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (points.length === 1) {
      const p = points[0]
      ctx.arc(p.x, p.y, p.w || 3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.fill()
    } else {
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y)
      }
      ctx.stroke()
    }

    ctx.restore()
  }

  async _drawAvatar(ctx, width, height) {
    const { userInfo } = this.cardData
    const avatarSize = this.config.avatarSize
    const centerX = width / 2
    const avatarY = 80

    const avatarUrl = userInfo.avatarUrl || userInfo.avatar || this.config.iconPath.defaultAvatar

    try {
      const avatarImg = await this._loadImage(avatarUrl)
      
      ctx.save()
      ctx.beginPath()
      ctx.arc(centerX, avatarY, avatarSize / 2, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()

      ctx.drawImage(
        avatarImg,
        centerX - avatarSize / 2,
        avatarY - avatarSize / 2,
        avatarSize,
        avatarSize
      )

      ctx.restore()

      ctx.beginPath()
      ctx.arc(centerX, avatarY, avatarSize / 2 + 3, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.8)'
      ctx.lineWidth = 3
      ctx.stroke()
    } catch (e) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(centerX, avatarY, avatarSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(200, 200, 200, 0.5)'
      ctx.fill()
      ctx.restore()
    }
  }

  _loadImage(src) {
    return new Promise((resolve, reject) => {
      if (this._loadedImages[src]) {
        resolve(this._loadedImages[src])
        return
      }

      const img = this.canvas.createImage()
      img.onload = () => {
        this._loadedImages[src] = img
        resolve(img)
      }
      img.onerror = reject
      img.src = src
    })
  }

  _drawNickname(ctx, width, height) {
    const { userInfo } = this.cardData
    const nickname = userInfo.nickName || userInfo.nickname || '墨客'
    const centerX = width / 2
    const textY = 180

    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1

    ctx.fillStyle = '#ffffff'
    ctx.fillText(nickname, centerX, textY)

    ctx.shadowColor = 'transparent'
  }

  _drawLevel(ctx, width, height) {
    const { level } = this.cardData
    const centerX = width / 2
    const bottomY = height - 40

    ctx.font = '14px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.fillStyle = 'rgba(212, 175, 55, 0.9)'
    ctx.fillText(level, centerX, bottomY)
  }

  _drawBorder(ctx, width, height) {
    const { material } = this.cardData
    
    const borderColors = {
      iron: 'rgba(180, 180, 180, 0.6)',
      gold: 'rgba(255, 215, 0, 0.8)',
      silver: 'rgba(192, 192, 192, 0.6)',
      bronze: 'rgba(205, 127, 50, 0.6)'
    }

    ctx.beginPath()
    this._roundRect(ctx, 0, 0, width, height, this.config.cornerRadius)
    ctx.strokeStyle = borderColors[material] || borderColors.silver
    ctx.lineWidth = 2
    ctx.stroke()
  }

  _roundRect(ctx, x, y, width, height, radius) {
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  async saveToImage(options = {}) {
    const { quality = 1.0, fileType = 'png' } = options

    return new Promise((resolve, reject) => {
      if (!this.canvas) {
        reject(new Error('Canvas not initialized'))
        return
      }

      wx.canvasToTempFilePath({
        canvas: this.canvas,
        x: (this.width - this.config.cardSize.width) / 2,
        y: (this.height - this.config.cardSize.height) / 2,
        width: this.config.cardSize.width,
        height: this.config.cardSize.height,
        destWidth: this.config.cardSize.width * this.dpr * quality,
        destHeight: this.config.cardSize.height * this.dpr * quality,
        fileType,
        success: (res) => {
          console.log('[CardGenerator] Image saved:', res.tempFilePath)
          resolve(res.tempFilePath)
        },
        fail: (err) => {
          console.error('[CardGenerator] Save failed:', err)
          reject(err)
        }
      })
    })
  }

  getCardData() {
    return { ...this.cardData }
  }

  reset() {
    this.cardData = {
      material: 'silver',
      fluency: 0,
      accuracy: 0,
      userInfo: null,
      strokeData: null,
      seed: 0,
      cloudPositions: [],
      level: '牧羊人·墨客'
    }
  }
}

module.exports = { CardGenerator }
