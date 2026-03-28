


const UpgradeConfig = {
  sound: {
    levelUp: '/assets/audio/level_up.m4a',
    materialUpgrade: '/assets/audio/material_upgrade.m4a',
    achievement: '/assets/audio/achievement.m4a'
  }
}

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    fromMaterial: {
      type: String,
      value: 'bronze'
    },
    toMaterial: {
      type: String,
      value: 'silver'
    },
    levelName: {
      type: String,
      value: ''
    },
    showCharacter: {
      type: Boolean,
      value: true
    },
    showShare: {
      type: Boolean,
      value: true
    },
    confirmText: {
      type: String,
      value: '继续书写'
    }
  },

  data: {
    animationClass: '',
    particles: [],
    fromMaterialName: '',
    toMaterialName: '',
    materialEmoji: '',
    characterAvatar: '',
    characterMessage: '',
    character: 'mengbao'
  },

  observers: {
    'visible': function(visible) {
      if (visible) {
        this._prepareCelebration()
      } else {
        this._resetState()
      }
    }
  },

  lifetimes: {
    attached() {
      this._generateParticles()
    }
  },

  methods: {
    _prepareCelebration() {
      const fromConfig = MaterialConfig[this.data.fromMaterial] || MaterialConfig.bronze
      const toConfig = MaterialConfig[this.data.toMaterial] || MaterialConfig.silver

      const messages = CharacterMessages[toConfig.character] || CharacterMessages.mengbao
      const randomMessage = messages[Math.floor(Math.random() * messages.length)]

      const characterAvatars = {
        mengbao: '/assets/images/mengbao.jpg',
        altan: '/assets/images/altan.jpg'
      }

      this.setData({
        animationClass: 'animation-enter',
        fromMaterialName: fromConfig.name,
        toMaterialName: toConfig.name,
        materialEmoji: toConfig.emoji,
        character: toConfig.character,
        characterAvatar: characterAvatars[toConfig.character] || characterAvatars.mengbao,
        characterMessage: randomMessage
      })

      this._playCelebrationSound()
      this._triggerVibration()
    },

    _generateParticles() {
      const particles = []
      const types = ['gold', 'silver', 'iron']

      for (let i = 0; i < 30; i++) {
        particles.push({
          x: Math.random() * 100,
          y: Math.random() * 50,
          type: types[Math.floor(Math.random() * types.length)],
          delay: Math.random() * 0.5
        })
      }

      this.setData({ particles })
    },

    _resetState() {
      this.setData({
        animationClass: ''
      })
    },

    _playCelebrationSound() {
      const app = getApp()
      if (app && app.playSound) {
        app.playSound('material_upgrade')
      }
    },

    _triggerVibration() {
      wx.vibrateShort({
        type: 'heavy',
        success: () => {
          setTimeout(() => {
            wx.vibrateShort({ type: 'medium' })
          }, 200)
        }
      })
    },

    handleConfirm() {
      this._triggerHaptic()
      this.triggerEvent('confirm')
      this._hide()
    },

    handleShare() {
      this._triggerHaptic()
      this.triggerEvent('share')
    },

    handleClose() {
      this._hide()
    },

    _hide() {
      this.setData({
        visible: false
      })
    },

    _triggerHaptic() {
      wx.vibrateShort({ type: 'light' })
    },

    preventTouch() {
      // 阻止事件穿透
    }
  }
})
