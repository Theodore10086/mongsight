function normalizeTrajectoryStrokes(trajectoryPayload) {
  const strokes = trajectoryPayload?.strokes || trajectoryPayload || [];
  return strokes
    .map((stroke) => {
      const points = Array.isArray(stroke?.points) ? stroke.points : stroke;
      return {
        points: (points || []).map((point) => ({
          x: Number(point.x || 0),
          y: Number(point.y || 0),
          w: Number(point.w || point.pressure || 3)
        }))
      };
    })
    .filter((stroke) => stroke.points.length > 0);
}

function getTrajectoryBounds(strokes) {
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
    minX: Number.isFinite(minX) ? minX : 0,
    maxX: Number.isFinite(maxX) ? maxX : 1,
    minY: Number.isFinite(minY) ? minY : 0,
    maxY: Number.isFinite(maxY) ? maxY : 1
  };
}

function createEmptyPixels(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function plotPoint(pixels, x, y, radius) {
  const size = pixels.length;
  for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radius * radius) {
        continue;
      }
      const px = x + offsetX;
      const py = y + offsetY;
      if (px >= 0 && py >= 0 && px < size && py < size) {
        pixels[py][px] = 1;
      }
    }
  }
}

function rasterizeTrajectory(strokes, size = 64) {
  const pixels = createEmptyPixels(size);
  if (!Array.isArray(strokes) || !strokes.length) {
    return pixels;
  }

  const bounds = getTrajectoryBounds(strokes);
  const sourceWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const sourceHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((size * 0.58) / sourceWidth, (size * 0.84) / sourceHeight);
  const offsetX = (size - sourceWidth * scale) / 2;
  const offsetY = (size - sourceHeight * scale) / 2;

  strokes.forEach((stroke) => {
    for (let index = 1; index < stroke.points.length; index += 1) {
      const previous = stroke.points[index - 1];
      const current = stroke.points[index];
      const fromX = Math.round((previous.x - bounds.minX) * scale + offsetX);
      const fromY = Math.round((previous.y - bounds.minY) * scale + offsetY);
      const toX = Math.round((current.x - bounds.minX) * scale + offsetX);
      const toY = Math.round((current.y - bounds.minY) * scale + offsetY);
      const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY), 1);
      const width = Math.max(Math.round((current.w || 3) * 0.45), 1);

      for (let step = 0; step <= steps; step += 1) {
        const ratio = step / steps;
        const x = Math.round(fromX + (toX - fromX) * ratio);
        const y = Math.round(fromY + (toY - fromY) * ratio);
        plotPoint(pixels, x, y, width);
      }
    }
  });

  return pixels;
}

function sampleSeries(series, targetLength) {
  if (!Array.isArray(series) || !series.length) {
    return Array(targetLength).fill(0);
  }

  if (series.length === targetLength) {
    return series.slice();
  }

  const sampled = [];
  for (let index = 0; index < targetLength; index += 1) {
    const start = Math.floor((index / targetLength) * series.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / targetLength) * series.length));
    let sum = 0;
    let count = 0;
    for (let cursor = start; cursor < end && cursor < series.length; cursor += 1) {
      sum += Number(series[cursor] || 0);
      count += 1;
    }
    sampled.push(count ? sum / count : 0);
  }
  return sampled;
}

function extractShapeSignatureFromPixels(pixels) {
  const height = pixels.length;
  const width = height ? pixels[0].length : 0;
  let blackCount = 0;
  const rows = [];
  const columns = Array(width).fill(0);
  const segmentSeries = [];

  for (let y = 0; y < height; y += 1) {
    let count = 0;
    let minX = width;
    let maxX = -1;
    let weightedX = 0;
    let segmentCount = 0;
    let previousFilled = false;

    for (let x = 0; x < width; x += 1) {
      const filled = Boolean(pixels[y][x]);
      if (!filled) {
        previousFilled = false;
        continue;
      }

      if (!previousFilled) {
        segmentCount += 1;
      }
      previousFilled = true;
      blackCount += 1;
      count += 1;
      columns[x] += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      weightedX += x;
    }

    const occupied = count > 0;
    rows.push({
      occupied,
      density: count / Math.max(width, 1),
      center: occupied ? (weightedX / count) / Math.max(width - 1, 1) : 0.5,
      spread: occupied ? (maxX - minX + 1) / Math.max(width, 1) : 0
    });
    segmentSeries.push(segmentCount);
  }

  const occupiedRows = rows.filter((row) => row.occupied);
  const firstOccupied = rows.findIndex((row) => row.occupied);
  const lastOccupied = (() => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index].occupied) {
        return index;
      }
    }
    return -1;
  })();

  const centerSeries = sampleSeries(rows.map((row) => row.center), 24);
  const spreadSeries = sampleSeries(rows.map((row) => row.spread), 24);
  const densitySeries = sampleSeries(rows.map((row) => row.density), 24);
  const segmentDensity = sampleSeries(segmentSeries.map((count) => count / 4), 24);
  const slopeSeries = centerSeries.slice(1).map((value, index) => value - centerSeries[index]);
  const columnDensity = sampleSeries(columns.map((count) => count / Math.max(height, 1)), 16);
  const occupiedRatio = occupiedRows.length / Math.max(height, 1);
  const topAnchor = firstOccupied >= 0 ? firstOccupied / Math.max(height - 1, 1) : 0;
  const bottomAnchor = lastOccupied >= 0 ? lastOccupied / Math.max(height - 1, 1) : 1;

  let turnCount = 0;
  for (let index = 1; index < slopeSeries.length; index += 1) {
    const previous = slopeSeries[index - 1];
    const current = slopeSeries[index];
    if (Math.abs(previous) > 0.01 && Math.abs(current) > 0.01 && previous * current < 0) {
      turnCount += 1;
    }
  }

  return {
    blackCount,
    occupiedRatio,
    topAnchor,
    bottomAnchor,
    turnCount,
    centerSeries,
    spreadSeries,
    densitySeries,
    segmentDensity,
    slopeSeries,
    columnDensity
  };
}

function averageRange(series = [], start, end) {
  const slice = series.slice(start, end);
  if (!slice.length) {
    return 0;
  }
  const total = slice.reduce((sum, value) => sum + Number(value || 0), 0);
  return total / slice.length;
}

function buildSignatureProfile(signature) {
  const topCenter = averageRange(signature.centerSeries, 1, 6);
  const midCenter = averageRange(signature.centerSeries, 9, 15);
  const bottomCenter = averageRange(signature.centerSeries, 18, 24);
  const topSpread = averageRange(signature.spreadSeries, 1, 6);
  const midSpread = averageRange(signature.spreadSeries, 9, 15);
  const lowSpread = averageRange(signature.spreadSeries, 16, 21);
  const bottomSpread = averageRange(signature.spreadSeries, 20, 24);
  const topSegments = averageRange(signature.segmentDensity, 1, 6);
  const midSegments = averageRange(signature.segmentDensity, 9, 15);
  const lowSegments = averageRange(signature.segmentDensity, 16, 21);
  const bottomSegments = averageRange(signature.segmentDensity, 20, 24);

  return {
    topCenter,
    midCenter,
    bottomCenter,
    topSpread,
    midSpread,
    lowSpread,
    bottomSpread,
    topSegments,
    midSegments,
    lowSegments,
    bottomSegments,
    centerDrop: topCenter - midCenter,
    centerLift: bottomCenter - midCenter
  };
}

function buildFeaturesFromTrajectoryPayload(payload) {
  const strokes = normalizeTrajectoryStrokes(payload);
  const pixels = rasterizeTrajectory(strokes, 64);
  const signature = extractShapeSignatureFromPixels(pixels);
  const profile = buildSignatureProfile(signature);
  return {
    strokeCount: strokes.length,
    signature,
    profile
  };
}

module.exports = {
  buildFeaturesFromTrajectoryPayload,
  extractShapeSignatureFromPixels,
  buildSignatureProfile
};
