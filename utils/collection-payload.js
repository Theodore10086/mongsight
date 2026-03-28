const SCRIPT_TYPE_LABELS = {
  mongolian: '蒙古文',
  uyghur: '回鹘文',
  manchu: '满文'
};

const ROLE_LABELS = {
  expert: '专家样本',
  participant: '普通样本',
  admin: '管理员'
};

function normalizeScriptType(scriptType) {
  return SCRIPT_TYPE_LABELS[scriptType] ? scriptType : 'mongolian';
}

function normalizeRole(role) {
  return ROLE_LABELS[role] ? role : 'participant';
}

function flattenStrokePoints(strokes = []) {
  const normalized = [];
  strokes.forEach((stroke, strokeIndex) => {
    const points = Array.isArray(stroke?.points) ? stroke.points : stroke;
    if (!Array.isArray(points)) {
      return;
    }
    points.forEach((point, pointIndex) => {
      const previous = pointIndex > 0 ? points[pointIndex - 1] : null;
      const dx = previous ? Number(point.x || 0) - Number(previous.x || 0) : 0;
      const dy = previous ? Number(point.y || 0) - Number(previous.y || 0) : 0;
      const dt = previous ? Math.max(1, Number(point.t || 0) - Number(previous.t || 0)) : 1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      normalized.push({
        x: round2(point.x || 0),
        y: round2(point.y || 0),
        t: Number(point.t || 0),
        p: point.f !== undefined ? round2(point.f) : point.pressure !== undefined ? round2(point.pressure) : 0.5,
        speed: round2(distance / dt),
        strokeIndex,
        pointIndex
      });
    });
  });
  return normalized;
}

function summarizeStrokes(strokes = []) {
  const points = flattenStrokePoints(strokes);
  if (!points.length) {
    return {
      strokeCount: 0,
      pointCount: 0,
      durationMs: 0,
      avgPressure: 0,
      avgSpeed: 0,
      boundingBox: null
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let pressureSum = 0;
  let speedSum = 0;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    pressureSum += Number(point.p || 0);
    speedSum += Number(point.speed || 0);
  });

  return {
    strokeCount: strokes.length,
    pointCount: points.length,
    durationMs: Math.max(0, Number(points[points.length - 1].t || 0) - Number(points[0].t || 0)),
    avgPressure: round2(pressureSum / points.length),
    avgSpeed: round2(speedSum / points.length),
    boundingBox: {
      minX: round2(minX),
      minY: round2(minY),
      maxX: round2(maxX),
      maxY: round2(maxY),
      width: round2(maxX - minX),
      height: round2(maxY - minY)
    }
  };
}

function buildResearchExportPayload({
  strokes = [],
  currentLesson = {},
  collectionConfig = {},
  userProfile = {},
  systemInfo = {},
  previewFileID = '',
  previewCloudPath = ''
} = {}) {
  const summary = summarizeStrokes(strokes);
  const normalizedScriptType = normalizeScriptType(collectionConfig.scriptType);
  const normalizedRole = normalizeRole(collectionConfig.role);
  const now = new Date();

  return {
    version: 'research-sample.v1',
    exportTime: now.toISOString(),
    project: {
      projectId: collectionConfig.projectId || 'mengge-lab',
      projectName: collectionConfig.projectName || '文字轨迹采集计划'
    },
    task: {
      taskId: collectionConfig.taskId || `${normalizedScriptType}-${currentLesson.id || 'freewrite'}`,
      taskLabel: collectionConfig.taskLabel || currentLesson.title || '自由书写',
      scriptType: normalizedScriptType,
      scriptTypeLabel: SCRIPT_TYPE_LABELS[normalizedScriptType],
      contentLabel: collectionConfig.contentLabel || currentLesson.title || '',
      targetRole: normalizedRole
    },
    participant: {
      role: normalizedRole,
      roleLabel: ROLE_LABELS[normalizedRole],
      nickname: userProfile.nickName || userProfile.nickname || '未命名用户',
      avatar: userProfile.avatarUrl || userProfile.avatar || '',
      level: userProfile.level || 1
    },
    device: {
      brand: systemInfo.brand || '',
      model: systemInfo.model || '',
      platform: systemInfo.platform || '',
      system: systemInfo.system || '',
      language: systemInfo.language || '',
      pixelRatio: systemInfo.pixelRatio || 1,
      screenWidth: systemInfo.screenWidth || 0,
      screenHeight: systemInfo.screenHeight || 0
    },
    sample: {
      sampleLocalId: `${Date.now()}`,
      isStandardSample: normalizedRole === 'expert',
      previewFileID,
      previewCloudPath,
      summary
    },
    strokes: strokes.map((stroke, strokeIndex) => {
      const points = Array.isArray(stroke?.points) ? stroke.points : stroke;
      return {
        strokeIndex,
        points: (points || []).map((point, pointIndex) => ({
          x: round2(point.x || 0),
          y: round2(point.y || 0),
          t: Number(point.t || 0),
          p: point.f !== undefined ? round2(point.f) : point.pressure !== undefined ? round2(point.pressure) : 0.5,
          pointIndex
        }))
      };
    })
  };
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

module.exports = {
  SCRIPT_TYPE_LABELS,
  ROLE_LABELS,
  normalizeScriptType,
  normalizeRole,
  flattenStrokePoints,
  summarizeStrokes,
  buildResearchExportPayload
};
