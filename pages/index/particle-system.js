class Particle {
  constructor(x, y, options = {}) {
    this.x = x
    this.y = y
    this.vx = options.vx || 0
    this.vy = options.vy || 0
    this.life = options.life || 1.0
    this.decay = options.decay || 0.02
    this.size = options.size || 8
    this.color = options.color || '212, 175, 55'
    this.alpha = options.alpha || 1.0
    this.glow = options.glow || 0
    this.rotation = options.rotation || 0
    this.rotationSpeed = options.rotationSpeed || 0
  }

  update() {
    this.x += this.vx
    this.y += this.vy
    this.life -= this.decay
    this.alpha = Math.max(0, this.life)
    this.rotation += this.rotationSpeed
    this.vx *= 0.98
    this.vy *= 0.98
  }

  isDead() {
    return this.life <= 0
  }

  draw(ctx) {
    if (this.life <= 0) return

    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)

    if (this.glow > 0) {
      ctx.shadowBlur = this.glow
      ctx.shadowColor = `rgba(${this.color}, ${this.alpha * 0.5})`
    }

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size)
    gradient.addColorStop(0, `rgba(${this.color}, ${this.alpha})`)
    gradient.addColorStop(0.4, `rgba(${this.color}, ${this.alpha * 0.6})`)
    gradient.addColorStop(1, `rgba(${this.color}, 0)`)

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(0, 0, this.size, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }
}

class ParticleSystem {
  constructor(options = {}) {
    this.ctx = options.ctx || null
    this.canvas = options.canvas || null
    this.particles = []
    this.isActive = false
    this.animationFrame = null
    this.onComplete = options.onComplete || (() => {})
    
    this.config = {
      particleCount: 30,
      burstRadius: 80,
      minSpeed: 1,
      maxSpeed: 4,
      minSize: 4,
      maxSize: 12,
      duration: 1500,
      colors: {
        gold: '212, 175, 55',
        amber: '255, 191, 0',
        jade: '0, 168, 120',
        cyan: '0, 200, 200',
        white: '255, 255, 255',
        mist: '200, 220, 240'
      }
    }
  }

  setContext(ctx, canvas) {
    this.ctx = ctx
    this.canvas = canvas
  }

  _randomColor(feature) {
    const colorKeys = Object.keys(this.config.colors)
    
    if (!feature) {
      return this.config.colors.gold
    }

    const { velocity, pressure, intensity } = feature

    if (intensity > 0.7) {
      return this.config.colors.gold
    } else if (intensity > 0.4) {
      return velocity > 0.5 
        ? this.config.colors.amber 
        : this.config.colors.jade
    } else {
      return pressure > 0.5 
        ? this.config.colors.cyan 
        : this.config.colors.mist
    }
  }

  _createBurstParticles(centerX, centerY, feature) {
    const particles = []
    const count = this.config.particleCount

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
      const speed = this.config.minSpeed + 
        Math.random() * (this.config.maxSpeed - this.config.minSpeed)
      
      const distance = Math.random() * this.config.burstRadius * 0.5
      
      const particle = new Particle(
        centerX + Math.cos(angle) * distance * 0.3,
        centerY + Math.sin(angle) * distance * 0.3,
        {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          life: 1.0,
          decay: 0.008 + Math.random() * 0.012,
          size: this.config.minSize + Math.random() * (this.config.maxSize - this.config.minSize),
          color: this._randomColor(feature),
          alpha: 0.8 + Math.random() * 0.2,
          glow: 10 + Math.random() * 20,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.1
        }
      )
      
      particles.push(particle)
    }

    const ringCount = 3
    for (let r = 0; r < ringCount; r++) {
      const ringAngle = (Math.PI * 2 * r) / ringCount
      const ringParticle = new Particle(
        centerX,
        centerY,
        {
          vx: Math.cos(ringAngle) * 2,
          vy: Math.sin(ringAngle) * 2,
          life: 1.0,
          decay: 0.015,
          size: 20 + r * 5,
          color: this._randomColor(feature),
          alpha: 0.6,
          glow: 30,
          rotation: 0,
          rotationSpeed: 0
        }
      )
      particles.push(ringParticle)
    }

    return particles
  }

  emit(centerX, centerY, feature) {
    if (this.isActive) {
      this.stop()
    }

    this.isActive = true
    this.particles = this._createBurstParticles(centerX, centerY, feature)

    const startTime = Date.now()
    const { duration } = this.config

    const animate = () => {
      if (!this.isActive || !this.ctx || !this.canvas) {
        return
      }

      const elapsed = Date.now() - startTime
      const progress = elapsed / duration

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

      this.particles.forEach(particle => {
        particle.update()
        particle.draw(this.ctx)
      })

      this.particles = this.particles.filter(p => !p.isDead())

      if (progress < 1 && this.particles.length > 0) {
        this.animationFrame = requestAnimationFrame(animate)
      } else {
        this.isActive = false
        this.onComplete()
      }
    }

    animate()
  }

  stop() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    this.isActive = false
    this.particles = []
  }

  isEmitting() {
    return this.isActive
  }
}

module.exports = { ParticleSystem, Particle }
