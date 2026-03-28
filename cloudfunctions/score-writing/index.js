const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function normalizePoint(point) {
  return {
    x: Number(point.x || 0),
    y: Number(point.y || 0),
    t: Number(point.t || 0),
    w: Number(point.w || point.pressure || point.f || 1),
    pressure: Number(point.pressure || point.f || 1),
    speed: Number(point.speed || point.v || 0)
  };
}

function normalizeStrokeSet(strokes) {
  return (strokes || [])
    .map((stroke) => {
      const points = Array.isArray(stroke?.points) ? stroke.points : stroke;
      return {
        points: (points || []).map(normalizePoint)
      };
    })
    .filter((stroke) => stroke.points.length > 0);
}

function getBounds(strokes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  strokes.forEach((stroke) => {
    stroke.points.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });
  });

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1)
  };
}

function normalizeGlobally(strokes) {
  if (!strokes.length) {
    return [];
  }

  const bounds = getBounds(strokes);
  const scale = Math.max(bounds.width, bounds.height, 1);
  return strokes.map((stroke) => ({
    points: stroke.points.map((point) => ({
      ...point,
      x: (point.x - bounds.minX) / scale,
      y: (point.y - bounds.minY) / scale,
      w: point.w / scale
    }))
  }));
}

function resamplePoints(points, count = 32) {
  if (!points.length) {
    return [];
  }
  if (points.length === 1) {
    return Array.from({ length: count }, () => ({ ...points[0] }));
  }

  const cumulative = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index].x - points[index - 1].x;
    const dy = points[index].y - points[index - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
    cumulative.push(total);
  }

  if (total === 0) {
    return Array.from({ length: count }, (_, index) => ({ ...points[Math.min(index, points.length - 1)] }));
  }

  const samples = [];
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
    const target = (sampleIndex / (count - 1)) * total;
    let segmentIndex = 1;
    while (segmentIndex < cumulative.length && cumulative[segmentIndex] < target) {
      segmentIndex += 1;
    }

    const previousIndex = Math.max(segmentIndex - 1, 0);
    const segmentLength = cumulative[segmentIndex] - cumulative[previousIndex] || 1;
    const ratio = (target - cumulative[previousIndex]) / segmentLength;
    const start = points[previousIndex];
    const end = points[Math.min(segmentIndex, points.length - 1)];

    samples.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
      w: start.w + (end.w - start.w) * ratio,
      pressure: start.pressure + (end.pressure - start.pressure) * ratio,
      speed: start.speed + (end.speed - start.speed) * ratio,
      t: start.t + (end.t - start.t) * ratio
    });
  }

  return samples;
}

function pointDistance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dw = (left.w || 0) - (right.w || 0);
  return Math.sqrt(dx * dx + dy * dy + dw * dw);
}

function dtwDistance(sequenceA, sequenceB) {
  const n = sequenceA.length;
  const m = sequenceB.length;
  const matrix = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  matrix[0][0] = 0;

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = pointDistance(sequenceA[i - 1], sequenceB[j - 1]);
      matrix[i][j] = cost + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
    }
  }

  return matrix[n][m] / Math.max(n, m, 1);
}

function distanceToScore(distance, factor = 3.2) {
  return Math.max(0, Math.min(100, 100 * Math.exp(-distance * factor)));
}

function flattenStrokes(strokes) {
  return strokes.flatMap((stroke) => stroke.points);
}

function buildSpeedSequence(strokes, count = 48) {
  const points = resamplePoints(flattenStrokes(strokes), count);
  return points.map((point, index) => {
    if (index === 0) {
      return { x: 0, y: point.speed || 0, w: point.pressure || 1 };
    }

    const prev = points[index - 1];
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const dt = Math.max(point.t - prev.t, 1);
    const speed = Math.sqrt(dx * dx + dy * dy) / dt;
    return {
      x: index / Math.max(points.length - 1, 1),
      y: speed,
      w: point.pressure || 1
    };
  });
}

function computeStrokeAccuracy(userStrokes, standardStrokes) {
  const count = Math.max(userStrokes.length, standardStrokes.length);
  if (!count) {
    return { score: 0, details: [] };
  }

  const details = [];
  let total = 0;

  for (let index = 0; index < count; index += 1) {
    const userStroke = userStrokes[index];
    const standardStroke = standardStrokes[index];

    if (!userStroke || !standardStroke) {
      details.push({ index, score: 0, distance: 1 });
      continue;
    }

    const userPoints = resamplePoints(userStroke.points, 24);
    const standardPoints = resamplePoints(standardStroke.points, 24);
    const distance = dtwDistance(userPoints, standardPoints);
    const score = distanceToScore(distance, 4);

    details.push({ index, score, distance });
    total += score;
  }

  const strokeCountPenalty = Math.abs(userStrokes.length - standardStrokes.length) * 5;
  const rawScore = Math.max(0, total / count - strokeCountPenalty);
  return {
    score: Math.max(52, Math.min(100, rawScore * 0.72 + 24)),
    details
  };
}

function computeShapeFeatures(strokes) {
  const bounds = getBounds(strokes);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    width: bounds.width,
    height: bounds.height,
    centerX,
    centerY,
    aspectRatio: bounds.width / Math.max(bounds.height, 1)
  };
}

function computeStructureScore(userStrokes, standardStrokes) {
  const userNormalized = normalizeGlobally(userStrokes);
  const standardNormalized = normalizeGlobally(standardStrokes);
  const userPoints = resamplePoints(flattenStrokes(userNormalized), 72);
  const standardPoints = resamplePoints(flattenStrokes(standardNormalized), 72);
  const distance = dtwDistance(userPoints, standardPoints);
  const userShape = computeShapeFeatures(userNormalized);
  const standardShape = computeShapeFeatures(standardNormalized);
  const aspectGap = Math.abs(userShape.aspectRatio - standardShape.aspectRatio);
  const centerGap = Math.sqrt(
    Math.pow(userShape.centerX - standardShape.centerX, 2) +
    Math.pow(userShape.centerY - standardShape.centerY, 2)
  );
  const widthGap = Math.abs(userShape.width - standardShape.width);
  const heightGap = Math.abs(userShape.height - standardShape.height);
  const boxScore = Math.max(
    0,
    100 - (aspectGap * 36 + centerGap * 90 + widthGap * 30 + heightGap * 30)
  );
  const shapeScore = distanceToScore(distance, 1.45);

  return {
    score: Math.max(70, Math.min(100, shapeScore * 0.55 + boxScore * 0.45)),
    distance
  };
}

function computeFluencyScore(userStrokes, standardStrokes) {
  const userSequence = buildSpeedSequence(normalizeGlobally(userStrokes));
  const standardSequence = buildSpeedSequence(normalizeGlobally(standardStrokes));
  const distance = dtwDistance(userSequence, standardSequence);

  const rawScore = distanceToScore(distance, 2.1);
  return {
    score: Math.max(50, Math.min(100, rawScore * 0.74 + 22)),
    distance
  };
}

function countPoints(strokes) {
  return flattenStrokes(strokes).length;
}

function buildFeedback(totalScore, metrics) {
  if (totalScore >= 90) {
    return '蒙宝点评：这次写得很稳，笔顺和结构都在线。';
  }
  if (metrics.strokeAccuracy < 70) {
    return '蒙宝点评：先盯住笔顺，顺序一稳，整体分数会涨得很快。';
  }
  if (metrics.structureOverlap < 70) {
    return '蒙宝点评：结构还能再收一收，注意整体重心和字形轮廓。';
  }
  if (metrics.fluency < 70) {
    return '蒙宝点评：线条有了，接下来多练连贯度，出笔会更顺。';
  }
  return '蒙宝点评：已经很有模样了，再多写几遍会更漂亮。';
}

async function fetchStandardTrajectory(wordKey) {
  const response = await db.collection('recognition_words').where({ wordKey }).limit(1).get();
  const document = response.data && response.data[0];
  if (!document || !document.trajectoryFileID) {
    throw new Error('standard trajectory not found');
  }

  const downloadResult = await cloud.downloadFile({ fileID: document.trajectoryFileID });
  const parsed = JSON.parse(downloadResult.fileContent.toString('utf8'));
  return normalizeStrokeSet(parsed.strokes || []);
}

exports.main = async (event) => {
  const wordKey = event.wordKey;
  const userStrokes = normalizeStrokeSet(event.strokes || []);

  if (!wordKey) {
    return { success: false, message: 'missing wordKey' };
  }
  if (!userStrokes.length) {
    return { success: false, message: 'missing user strokes' };
  }

  try {
    const standardStrokes = await fetchStandardTrajectory(wordKey);
    const strokeAccuracy = computeStrokeAccuracy(userStrokes, standardStrokes);
    const structureOverlap = computeStructureScore(userStrokes, standardStrokes);
    const fluency = computeFluencyScore(userStrokes, standardStrokes);
    const completionRatio = Math.min(userStrokes.length, standardStrokes.length) / Math.max(userStrokes.length, standardStrokes.length, 1);
    const userPointCount = countPoints(userStrokes);
    const isOneStrokeMessy = userStrokes.length <= 1 && standardStrokes.length >= 2;

    if (isOneStrokeMessy) {
      strokeAccuracy.score = Math.min(strokeAccuracy.score, 50);
      structureOverlap.score = Math.min(structureOverlap.score, 56);
      fluency.score = Math.min(fluency.score, 52);
    } else if (completionRatio >= 0.9) {
      strokeAccuracy.score = Math.min(100, strokeAccuracy.score + 10);
      structureOverlap.score = Math.min(100, structureOverlap.score + 8);
      fluency.score = Math.min(100, fluency.score + (userPointCount >= 25 ? 10 : 6));
    } else if (completionRatio >= 0.75) {
      strokeAccuracy.score = Math.min(100, strokeAccuracy.score + 6);
      structureOverlap.score = Math.min(100, structureOverlap.score + 5);
      fluency.score = Math.min(100, fluency.score + 4);
    }

    const weightedScore = (
      strokeAccuracy.score * 0.5 +
      structureOverlap.score * 0.3 +
      fluency.score * 0.2
    );
    let totalScore = Math.min(100, weightedScore * 0.72 + 20);
    if (isOneStrokeMessy) {
      totalScore = Math.min(58, weightedScore * 0.72);
    } else if (completionRatio >= 0.9) {
      totalScore = Math.min(98, weightedScore + (userPointCount >= 25 ? 6 : 3));
    } else if (completionRatio >= 0.75) {
      totalScore = Math.min(92, weightedScore * 0.9 + 8);
    }

    return {
      success: true,
      result: {
        totalScore: Number(totalScore.toFixed(1)),
        strokeAccuracy: Number(strokeAccuracy.score.toFixed(1)),
        structureOverlap: Number(structureOverlap.score.toFixed(1)),
        fluency: Number(fluency.score.toFixed(1)),
        feedback: buildFeedback(totalScore, {
          strokeAccuracy: strokeAccuracy.score,
          structureOverlap: structureOverlap.score,
          fluency: fluency.score
        }),
        weights: {
          strokeAccuracy: 50,
          structureOverlap: 30,
          fluency: 20
        },
        diagnostics: {
          strokeDistances: strokeAccuracy.details,
          structureDistance: Number(structureOverlap.distance.toFixed(4)),
          fluencyDistance: Number(fluency.distance.toFixed(4)),
          userStrokeCount: userStrokes.length,
          standardStrokeCount: standardStrokes.length
        }
      }
    };
  } catch (error) {
    console.error('[score-writing] failed:', error);
    return {
      success: false,
      message: error.message || 'score failed'
    };
  }
};
