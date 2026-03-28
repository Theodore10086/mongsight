const LevelConfig = {
  LEVELS: [
    {
      id: 'shepherd',
      name: '牧羊人',
      title: '墨客',
      minScore: 0,
      maxScore: 100,
      material: 'bronze',
      badge: 'shepherd',
      description: '刚刚踏上书法之路的新手'
    },
    {
      id: 'baihuzhang',
      name: '百户长',
      title: '书吏',
      minScore: 101,
      maxScore: 500,
      material: 'silver',
      badge: 'baihuzhang',
      description: '已掌握基础笔法的学者'
    },
    {
      id: 'noyan',
      name: '诺颜',
      title: '翰墨',
      minScore: 501,
      maxScore: Infinity,
      material: 'gold',
      badge: 'noyan',
      description: '精通书法艺术的大家'
    },
    {
      id: 'hanlin',
      name: '翰林',
      title: '宗师',
      minScore: 2001,
      maxScore: Infinity,
      material: 'iron',
      badge: 'hanlin',
      description: '书法艺术的巅峰存在'
    }
  ],
  
  MATERIALS: {
    bronze: { name: '青铜', color: '#cd7f32', upgradeTo: 'silver', level: 1 },
    silver: { name: '白银', color: '#c0c0c0', upgradeTo: 'gold', level: 2 },
    gold: { name: '黄金', color: '#d4af37', upgradeTo: 'iron', level: 3 },
    iron: { name: '玄铁', color: '#3a3a3a', upgradeTo: 'iron', level: 4 }
  },

  STORAGE_KEY: 'user_level_data',
  STREAK_KEY: 'writing_streak'
}

class LevelSystem {
  constructor(options = {}) {
    this.currentLevel = null
    this.currentScore = 0
    this.totalScore = 0
    this.materialLevel = 1
    this.streak = 0
    this.lastWriteDate = null
    this.onLevelUp = options.onLevelUp || (() => {})
    this.onMaterialUpgrade = options.onMaterialUpgrade || (() => {})
  }

  init() {
    this._loadFromStorage()
    this._updateCurrentLevel()
    console.log('[LevelSystem] Initialized:', this.getLevelInfo())
    return this
  }

  _loadFromStorage() {
    try {
      const levelData = wx.getStorageSync(LevelConfig.STORAGE_KEY)
      if (levelData) {
        this.currentScore = levelData.currentScore || 0
        this.totalScore = levelData.totalScore || 0
        this.materialLevel = levelData.materialLevel || 1
        this.streak = levelData.streak || 0
        this.lastWriteDate = levelData.lastWriteDate || null
      }
    } catch (e) {
      console.warn('[LevelSystem] Load failed:', e)
    }

    try {
      const streakData = wx.getStorageSync(LevelConfig.STREAK_KEY)
      if (streakData) {
        const today = this._getDateString(new Date())
        const lastDate = streakData.lastDate
        const daysDiff = this._getDaysDifference(lastDate, today)
        if (daysDiff > 1) {
          this.streak = 0
        }
      }
    } catch (e) {
      console.warn('[LevelSystem] Streak load failed:', e)
    }
  }

  _saveToStorage() {
    try {
      wx.setStorageSync(LevelConfig.STORAGE_KEY, {
        currentScore: this.currentScore,
        totalScore: this.totalScore,
        materialLevel: this.materialLevel,
        streak: this.streak,
        lastWriteDate: this.lastWriteDate
      })
    } catch (e) {
      console.warn('[LevelSystem] Save failed:', e)
    }
  }

  _getDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  _getDaysDifference(date1, date2) {
    if (!date1 || !date2) return 0
    const d1 = new Date(date1)
    const d2 = new Date(date2)
    const diffTime = Math.abs(d2 - d1)
    return Math.floor(diffTime / (1000 * 60 * 60 * 24))
  }

  _updateCurrentLevel() {
    for (const level of LevelConfig.LEVELS) {
      if (this.totalScore >= level.minScore && this.totalScore <= level.maxScore) {
        this.currentLevel = level
        return
      }
    }
    this.currentLevel = LevelConfig.LEVELS[LevelConfig.LEVELS.length - 1]
  }

  getLevelInfo() {
    return {
      level: this.currentLevel?.name || '牧羊人',
      title: this.currentLevel?.title || '墨客',
      material: this.currentLevel?.material || 'bronze',
      score: this.currentScore,
      totalScore: this.totalScore,
      progress: this._getProgress(),
      streak: this.streak,
      nextLevel: this._getNextLevel()
    }
  }

  _getProgress() {
    if (!this.currentLevel) return 0
    const minScore = this.currentLevel.minScore
    const maxScore = this.currentLevel.maxScore
    if (maxScore === Infinity) return 1
    const levelRange = maxScore - minScore
    const currentProgress = this.totalScore - minScore
    return Math.min(1, currentProgress / levelRange)
  }

  _getNextLevel() {
    const currentIndex = LevelConfig.LEVELS.findIndex(l => l.id === this.currentLevel?.id)
    if (currentIndex < LevelConfig.LEVELS.length - 1) {
      const next = LevelConfig.LEVELS[currentIndex + 1]
      return { name: next.name, title: next.title, requiredScore: next.minScore, remaining: next.minScore - this.totalScore }
    }
    return null
  }

  async addScore(score) {
    const oldLevel = this.currentLevel
    const oldMaterial = this.currentLevel?.material
    this.currentScore += score
    this.totalScore += score
    this._updateStreak()
    this._updateCurrentLevel()
    this._saveToStorage()

    const result = {
      addedScore: score,
      totalScore: this.totalScore,
      currentScore: this.currentScore,
      levelUp: false,
      materialUpgrade: false,
      level: this.currentLevel,
      info: this.getLevelInfo()
    }

    if (this.currentLevel?.id !== oldLevel?.id) {
      result.levelUp = true
      result.previousLevel = oldLevel
      this.onLevelUp({ from: oldLevel, to: this.currentLevel, totalScore: this.totalScore })
    }

    const newMaterial = this.currentLevel?.material
    if (newMaterial && newMaterial !== oldMaterial) {
      result.materialUpgrade = true
      result.previousMaterial = oldMaterial
      result.newMaterial = newMaterial
      const materialInfo = LevelConfig.MATERIALS[newMaterial]
      this.materialLevel = materialInfo?.level || 1
      this.onMaterialUpgrade({ from: oldMaterial, to: newMaterial, level: this.materialLevel, info: materialInfo })
    }

    console.log('[LevelSystem] Score added:', result)
    return result
  }

  _updateStreak() {
    const today = this._getDateString(new Date())
    if (this.lastWriteDate === today) return
    const yesterday = this._getDateString(new Date(Date.now() - 86400000))
    if (this.lastWriteDate === yesterday) {
      this.streak++
    } else if (this.lastWriteDate !== today) {
      this.streak = 1
    }
    this.lastWriteDate = today
    try {
      wx.setStorageSync(LevelConfig.STREAK_KEY, { lastDate: today, streak: this.streak })
    } catch (e) {
      console.warn('[LevelSystem] Streak save failed:', e)
    }
  }

  getMaterialForScore(score) {
    if (score >= 2000) return 'iron'
    if (score >= 500) return 'gold'
    if (score >= 100) return 'silver'
    return 'bronze'
  }

  shouldUpgradeMaterial(oldScore, newScore) {
    const oldMaterial = this.getMaterialForScore(oldScore)
    const newMaterial = this.getMaterialForScore(newScore)
    return oldMaterial !== newMaterial
  }

  calculateScore(similarity, isComplete = true) {
    let baseScore = Math.round(similarity * 50)
    const completionBonus = isComplete ? 20 : 0
    const streakBonus = Math.min(this.streak * 2, 20)
    const totalScore = baseScore + completionBonus + streakBonus
    return Math.min(100, totalScore)
  }

  reset() {
    this.currentScore = 0
    this.totalScore = 0
    this.materialLevel = 1
    this.streak = 0
    this.lastWriteDate = null
    this._updateCurrentLevel()
    this._saveToStorage()
  }
}

module.exports = { LevelSystem, LevelConfig }
