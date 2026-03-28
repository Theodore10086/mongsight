class DTWAlgorithm {
  constructor(options = {}) {
    this.options = {
      distanceMetric: options.distanceMetric || 'euclidean',
      windowSize: options.windowSize || null,
      ...options
    }
  }

  euclideanDistance(p1, p2) {
    const dx = p1.x - p2.x
    const dy = p1.y - p2.y
    const dw = (p1.w || 0) - (p2.w || 0)
    return Math.sqrt(dx * dx + dy * dy + dw * dw)
  }

  manhattanDistance(p1, p2) {
    const dx = Math.abs((p1.x || 0) - (p2.x || 0))
    const dy = Math.abs((p1.y || 0) - (p2.y || 0))
    const dw = Math.abs((p1.w || 0) - (p2.w || 0))
    return dx + dy + dw
  }

  getDistance(p1, p2) {
    if (this.options.distanceMetric === 'manhattan') {
      return this.manhattanDistance(p1, p2)
    }
    return this.euclideanDistance(p1, p2)
  }

  normalizeStrokes(strokes) {
    if (!strokes || strokes.length === 0) return []

    const normalized = []

    strokes.forEach(stroke => {
      const points = stroke.points || stroke
      if (!points || points.length === 0) return

      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity

      points.forEach(p => {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      })

      const width = maxX - minX || 1
      const height = maxY - minY || 1
      const scale = Math.max(width, height) || 1

      const normalizedPoints = points.map(p => ({
        x: (p.x - minX) / scale,
        y: (p.y - minY) / scale,
        t: p.t || 0,
        w: (p.w || 3) / scale
      }))

      normalized.push({
        ...stroke,
        points: normalizedPoints,
        _originalBounds: { minX, minY, width, height, scale }
      })
    })

    return normalized
  }

  computeDTW(sequence1, sequence2) {
    const n = sequence1.length
    const m = sequence2.length

    if (n === 0 || m === 0) {
      return { distance: Infinity, path: [] }
    }

    const windowSize = this.options.windowSize || Math.max(n, m)
    const dtwMatrix = []
    const pathMatrix = []

    for (let i = 0; i < n; i++) {
      dtwMatrix[i] = []
      pathMatrix[i] = []
      for (let j = 0; j < m; j++) {
        dtwMatrix[i][j] = Infinity
        pathMatrix[i][j] = null
      }
    }

    dtwMatrix[0][0] = this.getDistance(sequence1[0], sequence2[0])

    for (let i = 1; i < n; i++) {
      for (let j = Math.max(0, i - windowSize); j < Math.min(m, i + windowSize + 1); j++) {
        const cost = this.getDistance(sequence1[i], sequence2[j])

        let minCost = dtwMatrix[i - 1][j]
        let direction = 'vertical'

        if (j > 0) {
          const diagonal = dtwMatrix[i - 1][j - 1]
          const horizontal = dtwMatrix[i][j - 1]

          if (diagonal < minCost) {
            minCost = diagonal
            direction = 'diagonal'
          }
          if (horizontal < minCost) {
            minCost = horizontal
            direction = 'horizontal'
          }
        }

        dtwMatrix[i][j] = cost + minCost
        pathMatrix[i][j] = direction
      }
    }

    const path = this.backtrackPath(pathMatrix, n - 1, m - 1)

    return {
      distance: dtwMatrix[n - 1][m - 1],
      normalizedDistance: dtwMatrix[n - 1][m - 1] / Math.max(n, m),
      path,
      matrix: dtwMatrix
    }
  }

  backtrackPath(pathMatrix, i, j) {
    const path = [[i, j]]

    while (i > 0 || j > 0) {
      if (i === 0) {
        j--
      } else if (j === 0) {
        i--
      } else {
        const direction = pathMatrix[i][j]
        if (direction === 'diagonal') {
          i--
          j--
        } else if (direction === 'horizontal') {
          j--
        } else {
          i--
        }
      }
      path.push([i, j])
    }

    return path.reverse()
  }

  computeMultiStrokeDTW(userStrokes, templateStrokes) {
    const userNorm = this.normalizeStrokes(userStrokes)
    const templateNorm = this.normalizeStrokes(templateStrokes)

    if (userNorm.length === 0 || templateNorm.length === 0) {
      return {
        distance: Infinity,
        similarity: 0,
        strokeScores: []
      }
    }

    const strokeScores = []
    let totalDistance = 0
    let matchedStrokes = 0

    const maxStrokes = Math.max(userNorm.length, templateNorm.length)

    for (let i = 0; i < maxStrokes; i++) {
      const userStroke = userNorm[i % userNorm.length]
      const templateStroke = templateNorm[i % templateNorm.length]

      if (!userStroke || !templateStroke) continue

      const userPoints = userStroke.points
      const templatePoints = templateStroke.points

      if (userPoints.length === 0 || templatePoints.length === 0) continue

      const result = this.computeDTW(userPoints, templatePoints)

      strokeScores.push({
        strokeIndex: i,
        distance: result.distance,
        normalizedDistance: result.normalizedDistance,
        similarity: Math.max(0, 1 - result.normalizedDistance)
      })

      totalDistance += result.normalizedDistance
      matchedStrokes++
    }

    const avgDistance = matchedStrokes > 0 ? totalDistance / matchedStrokes : Infinity
    const similarity = avgDistance === Infinity ? 0 : Math.max(0, Math.min(1, 1 - avgDistance))

    return {
      distance: totalDistance,
      normalizedDistance: avgDistance,
      similarity,
      strokeScores,
      matchedStrokes,
      totalUserStrokes: userNorm.length,
      totalTemplateStrokes: templateNorm.length
    }
  }

  computeSimilarityScore(userStrokes, templateStrokes) {
    const result = this.computeMultiStrokeDTW(userStrokes, templateStrokes)

    const baseScore = result.similarity * 100

    const strokeBonus = result.strokeScores.length > 0
      ? result.strokeScores.reduce((sum, s) => sum + s.similarity, 0) / result.strokeScores.length * 20
      : 0

    const completenessBonus = result.totalUserStrokes >= result.totalTemplateStrokes ? 10 : 0

    const finalScore = Math.round(baseScore + strokeBonus + completenessBonus)

    return {
      score: Math.min(100, Math.max(0, finalScore)),
      similarity: result.similarity,
      details: {
        baseScore: Math.round(baseScore),
        strokeBonus: Math.round(strokeBonus),
        completenessBonus,
        strokeCount: result.strokeScores.length,
        isComplete: result.totalUserStrokes >= result.totalTemplateStrokes
      }
    }
  }
}

module.exports = { DTWAlgorithm }
