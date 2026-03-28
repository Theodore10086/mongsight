const { ParticleSystem } = require('../particle-system.js')

Component({
  properties: {
    width: {
      type: Number,
      value: 375
    },
    height: {
      type: Number,
      value: 667
    }
  },

  data: {
    ctx: null,
    canvas: null,
    particleSystem: null,
    isEmitting: false
  },

  lifetimes: {
    attached() {
      this._initCanvas()
    },

    detached() {
      if (this.data.particleSystem) {
        this.data.particleSystem.stop()
      }
    }
  },

  methods: {
    _initCanvas() {
      const query = wx.createSelectorQuery()
      query.select('#particleCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0]) return

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')

          canvas.width = this.data.width * wx.getSystemInfoSync().pixelRatio
          canvas.height = this.data.height * wx.getSystemInfoSync().pixelRatio
          ctx.scale(wx.getSystemInfoSync().pixelRatio, wx.getSystemInfoSync().pixelRatio)

          const particleSystem = new ParticleSystem({
            ctx,
            canvas,
            onComplete: () => {
              this.setData({ isEmitting: false })
              this.triggerEvent('complete')
            }
          })

          this.setData({
            ctx,
            canvas,
            particleSystem
          })

          console.log('[ParticleCanvas] Initialized')
        })
    },

    emit(x, y, feature) {
      if (!this.data.particleSystem) {
        console.warn('[ParticleCanvas] Particle system not ready')
        return
      }

      this.setData({ isEmitting: true })
      this.data.particleSystem.emit(x, y, feature)
    },

    stop() {
      if (this.data.particleSystem) {
        this.data.particleSystem.stop()
        this.setData({ isEmitting: false })
      }
    },

    isEmitting() {
      return this.data.isEmitting
    }
  }
})
