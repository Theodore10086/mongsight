class ScoreManager {
  constructor(options = {}) {
    this.dtw = options.dtw || null
    this.levelSystem = options.levelSystem || null
    this.page = options.page || null
    this.onScoreUpdate = options.onScoreUpdate || (() => {})
    this.onLevelUp = options.onLevelUp || (() => {})
    this.onMaterialUpgrade = options.onMaterialUpgrade || (() => {})
    this._initModules()
  }

  _initModules() {
    if (!this.dtw) {
      const DTWAlgorithm = require('./dtw-algorithm.js').DTWAlgorithm
      this.dtw = new DTWAlgorithm()
    }

    if (!this.levelSystem) {
      const LevelSystem = require('./level-system.js').LevelSystem
      this.levelSystem = new LevelSystem({
        onLevelUp: this.handleLevelUp.bind(this),
        onMaterialUpgrade: this.handleMaterialUpgrade.bind(this)
      })
    }
  }

  init(pageContext) {
    this.page = pageContext
    this.levelSystem.init()
    console.log('[ScoreManager] Initialized')
    return this
  }

  async evaluateWriting(userStrokes, templateStrokes) {
    if (!userStrokes || userStrokes.length === 0) {
      return { success: false, error: 'No strokes to evaluate', score: 0 }
    }

    console.log('[ScoreManager] Evaluating strokes...')

    const similarityResult = this.dtw.computeSimilarityScore(userStrokes, templateStrokes)

    const score = this.levelSystem.calculateScore(
      similarityResult.similarity,
      similarityResult.details.isComplete
    )

    const result = await this.levelSystem.addScore(score)

    const evaluationResult = {
      success: true,
      score,
      totalScore: this.levelSystem.totalScore,
      currentScore: this.levelSystem.currentScore,
      similarity: similarityResult.similarity,
      similarityScore: similarityResult.score,
      details: similarityResult.details,
      level: result.info,
      levelUp: result.levelUp,
      materialUpgrade: result.materialUpgrade,
      streak: this.levelSystem.streak
    }

    this.onScoreUpdate(evaluationResult)
    console.log('[ScoreManager] Evaluation complete:', evaluationResult)
    return evaluationResult
  }

  async evaluateWithTemplate(userStrokes, lessonId) {
    const templateStrokes = this._getTemplateStrokes(lessonId)
    return this.evaluateWriting(userStrokes, templateStrokes)
  }

  _getTemplateStrokes(lessonId) {
    const templates = {
      songshu: [
        { points: [{ x: 50, y: 100, t: 0, w: 5 }, { x: 80, y: 60, t: 100, w: 5 }, { x: 120, y: 60, t: 200, w: 5 }, { x: 150, y: 100, t: 300, w: 5 }] },
        { points: [{ x: 70, y: 60, t: 0, w: 4 }, { x: 110, y: 60, t: 80, w: 3 }] }
      ],
      hair: [
        { points: [{ x: 50, y: 80, t: 0, w: 5 }, { x: 100, y: 80, t: 100, w: 5 }, { x: 150, y: 120, t: 200, w: 5 }] },
        { points: [{ x: 60, y: 100, t: 0, w: 4 }, { x: 100, y: 100, t: 80, w: 4 }, { x: 140, y: 120, t: 160, w: 3 }] }
      ]
    }
    return templates[lessonId] || []
  }

  handleLevelUp(data) {
    console.log('[ScoreManager] Level up!', data)
    this.onLevelUp(data)
  }

  handleMaterialUpgrade(data) {
    console.log('[ScoreManager] Material upgraded!', data)
    this.onMaterialUpgrade(data)
  }

  getLevelInfo() {
    return this.levelSystem.getLevelInfo()
  }

  getCurrentScore() {
    return { current: this.levelSystem.currentScore, total: this.levelSystem.totalScore, streak: this.levelSystem.streak }
  }

  shouldShowUpgradeCelebration() {
    return this.levelSystem.currentLevel?.id !== 'shepherd'
  }

  reset() {
    this.levelSystem.reset()
  }
}

module.exports = { ScoreManager }
