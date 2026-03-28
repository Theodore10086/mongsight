class WritingTestManager {
  constructor(options = {}) {
    this.page = options.page || null
    this.ctx = null
    this.canvas = null
    
    this.inkCuring = null
    this.particleSystem = null
    
    this.onTransitionComplete = options.onTransitionComplete || (() => {})
    this.onVibrate = options.onVibrate || (() => {})
    this.onShowBubble = options.onShowBubble || (() => {})
    
    this.isProcessing = false
    this.currentStrokeData = null
    
    this.welcomeMessage = '我看到了草原的风，请收下这块腰牌。'
  }

  init(pageContext, ctx, canvas) {
    this.page = pageContext
    this.ctx = ctx
    this.canvas = canvas
    
    const InkCuringManager = require('./ink-curing-manager.js').InkCuringManager
    const ParticleSystem = require('./particle-system.js').ParticleSystem
    
    this.inkCuring = new InkCuringManager({
      ctx,
      canvas,
      onCureComplete: this.handleCureComplete.bind(this)
    })
    
    this.particleSystem = new ParticleSystem({
      ctx,
      canvas,
      onComplete: this.handleParticleComplete.bind(this)
    })
    
    console.log('[WritingTestManager] Initialized')
  }

  updateContext(ctx, canvas) {
    this.ctx = ctx
    this.canvas = canvas
    
    if (this.inkCuring) {
      this.inkCuring.setContext(ctx, canvas)
    }
    
    if (this.particleSystem) {
      this.particleSystem.setContext(ctx, canvas)
    }
  }

  async handleStrokeComplete(strokes) {
    if (this.isProcessing || !strokes || strokes.length === 0) {
      return
    }

    this.isProcessing = true
    
    const lastStroke = strokes[strokes.length - 1]
    this.currentStrokeData = {
      strokes: strokes,
      lastStroke: lastStroke
    }

    console.log('[WritingTestManager] Processing stroke, capturing...')
    
    this.inkCuring.captureStrokes(strokes)
    
    const cureResult = await this.inkCuring.cure()
    
    console.log('[WritingTestManager] Cure complete, result:', cureResult)
  }

  async handleCureComplete(result) {
    if (!result || !result.center) {
      this.isProcessing = false
      return
    }

    const { center, feature } = result
    
    console.log('[WritingTestManager] Triggering particle burst at:', center)
    
    this.particleSystem.emit(center.x, center.y, feature)
  }

  handleParticleComplete() {
    console.log('[WritingTestManager] Particle animation complete')
    
    this._triggerTransition()
  }

  _triggerTransition() {
    console.log('[WritingTestManager] Triggering transition...')
    
    wx.vibrateShort({
      type: 'heavy',
      success: () => {
        console.log('[WritingTestManager] Vibration triggered')
      }
    })
    
    this.onVibrate()
    
    setTimeout(() => {
      this.onShowBubble({
        name: '蒙宝',
        message: this.welcomeMessage,
        avatar: '/assets/images/mengbao.jpg'
      })
      
      this.onTransitionComplete({
        success: true,
        message: this.welcomeMessage
      })
      
      this.isProcessing = false
    }, 300)
  }

  getWelcomeMessage() {
    return this.welcomeMessage
  }

  setWelcomeMessage(message) {
    this.welcomeMessage = message
  }

  isAnimating() {
    return this.isProcessing || 
           (this.inkCuring && this.inkCuring.isCuring) || 
           (this.particleSystem && this.particleSystem.isEmitting())
  }

  reset() {
    if (this.inkCuring) {
      this.inkCuring.reset()
    }
    if (this.particleSystem) {
      this.particleSystem.stop()
    }
    this.isProcessing = false
    this.currentStrokeData = null
  }

  destroy() {
    this.reset()
    this.inkCuring = null
    this.particleSystem = null
    this.ctx = null
    this.canvas = null
    this.page = null
  }
}

module.exports = { WritingTestManager }
