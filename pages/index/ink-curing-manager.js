class InkCuringManager {
  constructor(options = {}) {
    this.ctx = options.ctx || null
    this.canvas = options.canvas || null
    this.originalStrokes = []
    this.curedStrokes = []
    this.isCuring = false
    this.onCureComplete = options.onCureComplete || (() => {})
    this.animationFrame = null
    
    this.config = {
      duration: 1200,
      opacityStart: 1.0,
      opacityEnd: 0.85,
      grayscaleStart: 0,
      grayscaleEnd: 35,
      easing: 'ease-out'
    }
  }

  setContext(ctx, canvas) {
    this.ctx = ctx
    this.canvas = canvas
  }

  captureStrokes(strokes) {
    this.originalStrokes = JSON.parse(JSON.stringify(strokes || []))
    this.curedStrokes = JSON.parse(JSON.stringify(this.originalStrokes))
    return this.curedStrokes
  }

  getStrokeCenter(stroke) {
    if (!stroke || stroke.length === 0) return null

    let sumX = 0, sumY = 0
    stroke.forEach(point => {
      sumX += point.x
      sumY += point.y
    })

    return {
      x: sumX / stroke.length,
      y: sumY / stroke.length
    }
  }

  getStrokeFeature(stroke) {
    if (!stroke || stroke.length < 2) {
      return { velocity: 0.5, pressure: 0.5, intensity: 0.5 }
    }

    let totalDistance = 0
    let totalTime = 0
    let pressures = []

    for (let i = 1; i < stroke.length; i++) {
      const dx = stroke[i].x - stroke[i - 1].x
      const dy = stroke[i].y - stroke[i - 1].y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const time = stroke[i].t - stroke[i - 1].t

      totalDistance += distance
      totalTime += time

      if (stroke[i].w) pressures.push(stroke[i].w)
    }

    const avgVelocity = totalTime > 0 ? (totalDistance / totalTime) : 0
    const avgPressure = pressures.length > 0 
      ? pressures.reduce((a, b) => a + b, 0) / pressures.length 
      : 0.5

    const normalizedVelocity = Math.min(Math.max(avgVelocity / 10, 0), 1)
    const normalizedPressure = Math.min(Math.max(avgPressure, 0), 1)

    return {
      velocity: normalizedVelocity,
      pressure: normalizedPressure,
      intensity: (normalizedVelocity + normalizedPressure) / 2
    }
  }

  async cure() {
    if (this.isCuring || this.originalStrokes.length === 0) {
      return null
    }

    this.isCuring = true
    const startTime = Date.now()
    const { duration } = this.config

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        const easedProgress = this._easeOutCubic(progress)
        
        const currentOpacity = this.config.opacityStart + 
          (this.config.opacityEnd - this.config.opacityStart) * easedProgress
        
        const currentGrayscale = this.config.grayscaleStart + 
          (this.config.grayscaleEnd - this.config.grayscaleStart) * easedProgress

        this._renderCuredStrokes(currentOpacity, currentGrayscale)

        if (progress < 1) {
          this.animationFrame = requestAnimationFrame(animate)
        } else {
          this.isCuring = false
          const lastStroke = this.originalStrokes[this.originalStrokes.length - 1]
          const center = this.getStrokeCenter(lastStroke?.points || [])
          const feature = this.getStrokeFeature(lastStroke?.points || [])
          
          resolve({
            center,
            feature,
            strokes: this.curedStrokes
          })
        }
      }

      animate()
    })
  }

  _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3)
  }

  _renderCuredStrokes(opacity, grayscale) {
    if (!this.ctx || !this.canvas) return

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    this.curedStrokes.forEach(stroke => {
      if (!stroke.points || stroke.points.length === 0) return

      this.ctx.save()
      this.ctx.globalAlpha = opacity
      this.ctx.filter = `grayscale(${grayscale}%)`

      const color = stroke.color || '#2c2c2c'
      this.ctx.strokeStyle = color
      this.ctx.lineCap = 'round'
      this.ctx.lineJoin = 'round'

      this.ctx.beginPath()
      
      const points = stroke.points
      if (points.length === 1) {
        const p = points[0]
        this.ctx.arc(p.x, p.y, (p.w || 3), 0, Math.PI * 2)
        this.ctx.fill()
      } else {
        this.ctx.moveTo(points[0].x, points[0].y)
        
        for (let i = 1; i < points.length; i++) {
          const p0 = points[i - 1]
          const p1 = points[i]
          
          const midX = (p0.x + p1.x) / 2
          const midY = (p0.y + p1.y) / 2
          
          this.ctx.quadraticCurveTo(p0.x, p0.y, midX, midY)
          
          this.ctx.lineWidth = p1.w || p0.w || 3
          this.ctx.stroke()
          this.ctx.beginPath()
          this.ctx.moveTo(midX, midY)
        }
        
        const lastPoint = points[points.length - 1]
        this.ctx.lineTo(lastPoint.x, lastPoint.y)
        this.ctx.stroke()
      }

      this.ctx.restore()
    })
  }

  stop() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    this.isCuring = false
  }

  reset() {
    this.stop()
    this.originalStrokes = []
    this.curedStrokes = []
  }
}

module.exports = { InkCuringManager }
