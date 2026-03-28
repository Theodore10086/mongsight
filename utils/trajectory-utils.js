const PENDING_PLAYBACK_KEY = 'pendingRecognitionPlayback';

function normalizePoint(point, pointIndex) {
  const pressure = typeof point.pressure === 'number'
    ? point.pressure
    : (typeof point.f === 'number' ? point.f : 1);
  const speed = typeof point.speed === 'number'
    ? point.speed
    : (typeof point.v === 'number' ? point.v : 0);

  return {
    x: Number(point.x || 0),
    y: Number(point.y || 0),
    t: Number(point.t || pointIndex || 0),
    f: pressure,
    v: speed,
    w: Number(point.w || (1 + pressure * 4))
  };
}

function normalizeStroke(stroke) {
  const points = Array.isArray(stroke?.points) ? stroke.points : stroke;
  if (!Array.isArray(points)) {
    return { points: [], color: '#1a1a1a' };
  }

  return {
    points: points.map((point, index) => normalizePoint(point, index)),
    color: stroke?.color || '#1a1a1a'
  };
}

function normalizeTrajectoryPayload(payload) {
  const strokes = Array.isArray(payload?.strokes) ? payload.strokes : payload;
  if (!Array.isArray(strokes)) {
    return [];
  }

  return strokes
    .map((stroke) => normalizeStroke(stroke))
    .filter((stroke) => stroke.points.length > 0);
}

function storePendingRecognitionPlayback(payload) {
  wx.setStorageSync(PENDING_PLAYBACK_KEY, payload);
}

function getPendingRecognitionPlayback() {
  return wx.getStorageSync(PENDING_PLAYBACK_KEY) || null;
}

function clearPendingRecognitionPlayback() {
  wx.removeStorageSync(PENDING_PLAYBACK_KEY);
}

module.exports = {
  normalizeTrajectoryPayload,
  storePendingRecognitionPlayback,
  getPendingRecognitionPlayback,
  clearPendingRecognitionPlayback
};
