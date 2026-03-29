const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const ADMIN_CODE = '123456';

function isAdminAuthorized(event = {}) {
  return String(event.adminCode || '') === ADMIN_CODE;
}

async function upsertParticipant(openId, profile = {}, collectionConfig = {}) {
  const collection = db.collection('trajectory_participants');
  const existing = await collection.where({ openid: openId }).limit(1).get();
  const role = collectionConfig.role || 'participant';
  const scriptFocus = collectionConfig.scriptType || 'mongolian';
  const payload = {
    nickname: profile.nickname || profile.nickName || '未命名用户',
    avatar: profile.avatar || profile.avatarUrl || '',
    role,
    scriptFocus,
    lastActiveAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  if (existing.data && existing.data[0]) {
    await collection.doc(existing.data[0]._id).update({ data: payload });
    return existing.data[0]._id;
  }

  const created = await collection.add({
    data: {
      openid: openId,
      createTime: db.serverDate(),
      ...payload
    }
  });
  return created._id;
}

async function createSession(openId, event = {}) {
  const participantId = await upsertParticipant(openId, event.profile, event.collectionConfig);
  const sessions = db.collection('trajectory_sessions');
  const created = await sessions.add({
    data: {
      openid: openId,
      participantId,
      projectId: event.payload?.project?.projectId || event.collectionConfig?.projectId || 'mengge-lab',
      projectName: event.payload?.project?.projectName || event.collectionConfig?.projectName || '文字轨迹采集计划',
      taskId: event.payload?.task?.taskId || event.collectionConfig?.taskId || '',
      taskLabel: event.payload?.task?.taskLabel || event.collectionConfig?.taskLabel || '',
      scriptType: event.payload?.task?.scriptType || event.collectionConfig?.scriptType || 'mongolian',
      role: event.payload?.participant?.role || event.collectionConfig?.role || 'participant',
      device: event.payload?.device || {},
      appVersion: event.appVersion || '',
      createTime: db.serverDate(),
      startedAt: db.serverDate()
    }
  });
  return {
    participantId,
    sessionId: created._id
  };
}

async function submitSample(openId, event = {}) {
  if (!openId) {
    throw new Error('missing openid');
  }
  const payload = event.payload || {};
  if (!payload.strokes || !payload.strokes.length) {
    throw new Error('empty strokes');
  }

  const sessionInfo = await createSession(openId, event);
  const samples = db.collection('trajectory_samples');
  const sampleSummary = payload.sample?.summary || {};

  const created = await samples.add({
    data: {
      openid: openId,
      participantId: sessionInfo.participantId,
      sessionId: sessionInfo.sessionId,
      projectId: payload.project?.projectId || 'mengge-lab',
      projectName: payload.project?.projectName || '文字轨迹采集计划',
      taskId: payload.task?.taskId || '',
      taskLabel: payload.task?.taskLabel || '',
      scriptType: payload.task?.scriptType || 'mongolian',
      contentLabel: payload.task?.contentLabel || '',
      role: payload.participant?.role || 'participant',
      isStandardSample: !!payload.sample?.isStandardSample,
      participantSnapshot: payload.participant || {},
      device: payload.device || {},
      strokes: payload.strokes,
      summary: sampleSummary,
      finalImageFileID: payload.sample?.previewFileID || '',
      finalImageCloudPath: payload.sample?.previewCloudPath || '',
      qualityStatus: event.qualityStatus || 'pending',
      reviewStatus: 'pending',
      tags: Array.isArray(event.tags) ? event.tags : [],
      notes: String(event.notes || ''),
      clientExportVersion: payload.version || 'research-sample.v1',
      submittedAt: db.serverDate(),
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  return {
    sampleId: created._id,
    sessionId: sessionInfo.sessionId,
    participantId: sessionInfo.participantId,
    qualityStatus: event.qualityStatus || 'pending'
  };
}

async function listMySamples(openId, event = {}) {
  if (!openId) {
    throw new Error('missing openid');
  }
  const limit = Math.min(Number(event.limit) || 20, 100);
  const result = await db.collection('trajectory_samples')
    .where(isAdminAuthorized(event) ? {} : { openid: openId })
    .orderBy('submittedAt', 'desc')
    .limit(limit)
    .get();

  return {
    samples: (result.data || []).map((item) => ({
      id: item._id,
      taskLabel: item.taskLabel,
      taskId: item.taskId,
      projectId: item.projectId,
      projectName: item.projectName,
      scriptType: item.scriptType,
      contentLabel: item.contentLabel,
      role: item.role,
      qualityStatus: item.qualityStatus,
      reviewStatus: item.reviewStatus,
      pointCount: item.summary?.pointCount || 0,
      strokeCount: item.summary?.strokeCount || 0,
      durationMs: item.summary?.durationMs || 0,
      deviceBrand: item.device?.brand || '',
      deviceModel: item.device?.model || '',
      participantId: item.participantId,
      sessionId: item.sessionId,
      submittedAt: item.submittedAt,
      notes: item.notes || '',
      isStandardSample: !!item.isStandardSample,
      hasPreview: !!item.finalImageFileID
    }))
  };
}

async function getSampleDetail(openId, event = {}) {
  const sampleId = String(event.sampleId || '');
  if (!sampleId) {
    throw new Error('missing sampleId');
  }

  const sample = await db.collection('trajectory_samples').doc(sampleId).get();
  const data = sample.data;
  if (!data) {
    throw new Error('sample not found');
  }

  if (data.openid !== openId && !isAdminAuthorized(event)) {
    throw new Error('forbidden');
  }

  return {
    id: data._id,
    taskLabel: data.taskLabel,
    taskId: data.taskId,
    projectId: data.projectId,
    projectName: data.projectName,
    scriptType: data.scriptType,
    contentLabel: data.contentLabel || '',
    role: data.role,
    qualityStatus: data.qualityStatus || 'pending',
    reviewStatus: data.reviewStatus || 'pending',
    pointCount: data.summary?.pointCount || 0,
    strokeCount: data.summary?.strokeCount || 0,
    durationMs: data.summary?.durationMs || 0,
    deviceBrand: data.device?.brand || '',
    deviceModel: data.device?.model || '',
    participantId: data.participantId,
    sessionId: data.sessionId,
    submittedAt: data.submittedAt,
    notes: data.notes || '',
    isStandardSample: !!data.isStandardSample,
    participantSnapshot: data.participantSnapshot || {},
    device: data.device || {},
    summary: data.summary || {},
    strokes: data.strokes || [],
    finalImageFileID: data.finalImageFileID || '',
    finalImageCloudPath: data.finalImageCloudPath || '',
    clientExportVersion: data.clientExportVersion || 'research-sample.v1',
    tags: Array.isArray(data.tags) ? data.tags : []
  };
}

async function updateReviewStatus(openId, event = {}) {
  const sampleId = String(event.sampleId || '');
  const reviewStatus = String(event.reviewStatus || 'pending');
  if (!sampleId) {
    throw new Error('missing sampleId');
  }

  if (!['pending', 'approved', 'rejected'].includes(reviewStatus)) {
    throw new Error('invalid reviewStatus');
  }

  const samples = db.collection('trajectory_samples');
  const target = await samples.doc(sampleId).get();
  if (!target.data) {
    throw new Error('sample not found');
  }

  if (target.data.openid !== openId && !isAdminAuthorized(event)) {
    throw new Error('forbidden');
  }

  await samples.doc(sampleId).update({
    data: {
      reviewStatus,
      qualityStatus: reviewStatus === 'approved' ? 'reviewed' : target.data.qualityStatus || 'pending',
      notes: typeof event.notes === 'string' ? event.notes : (target.data.notes || ''),
      updatedAt: db.serverDate()
    }
  });

  return {
    sampleId,
    reviewStatus
  };
}

async function batchReview(event = {}) {
  if (!isAdminAuthorized(event)) {
    throw new Error('admin auth required');
  }

  const reviewStatus = String(event.reviewStatus || 'approved');
  const sampleIds = Array.isArray(event.sampleIds) ? event.sampleIds.filter(Boolean) : [];
  if (!sampleIds.length) {
    throw new Error('missing sampleIds');
  }

  for (const sampleId of sampleIds) {
    await db.collection('trajectory_samples').doc(sampleId).update({
      data: {
        reviewStatus,
        qualityStatus: reviewStatus === 'approved' ? 'reviewed' : 'pending',
        updatedAt: db.serverDate()
      }
    });
  }

  return {
    count: sampleIds.length,
    reviewStatus
  };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'submitSample';

  try {
    switch (action) {
      case 'submitSample':
        return { success: true, data: await submitSample(OPENID, event) };
      case 'listMySamples':
        return { success: true, data: await listMySamples(OPENID, event) };
      case 'getSampleDetail':
        return { success: true, data: await getSampleDetail(OPENID, event) };
      case 'upsertParticipant':
        return {
          success: true,
          data: {
            participantId: await upsertParticipant(OPENID, event.profile, event.collectionConfig)
          }
        };
      case 'updateReviewStatus':
        return { success: true, data: await updateReviewStatus(OPENID, event) };
      case 'batchReview':
        return { success: true, data: await batchReview(event) };
      default:
        return { success: false, error: `unsupported action: ${action}` };
    }
  } catch (error) {
    console.error('[trajectory-collection] failed:', error);
    return {
      success: false,
      error: error.message || 'trajectory collection failed'
    };
  }
};
