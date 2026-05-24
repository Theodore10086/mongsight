const fs = require('fs');
const path = require('path');
const cloud = require('wx-server-sdk');
const { CURATED_RECOGNITION_WORDS } = require('../utils/recognition-catalog.js');
const { buildFeaturesFromTrajectoryPayload } = require('../utils/recognition-feature-utils.js');

const cloudEnv = process.env.CLOUD_ENV || 'cloud1-6g6qzrswbfeff910';

cloud.init({
  env: cloudEnv
});

const db = cloud.database();

async function upsertWordDocument(document) {
  const collection = db.collection('recognition_words');
  const existing = await collection.where({
    wordKey: document.wordKey
  }).limit(1).get();

  if (existing.data && existing.data[0]) {
    await collection.doc(existing.data[0]._id).update({
      data: document
    });
    return existing.data[0]._id;
  }

  const result = await collection.add({
    data: document
  });
  return result._id;
}

async function uploadWordAssets(word) {
  const absoluteTrajectoryPath = path.resolve(word.localTrajectoryPath);
  const absoluteTemplateImagePath = path.resolve(word.localTemplateImagePath);

  if (!fs.existsSync(absoluteTrajectoryPath)) {
    throw new Error(`trajectory file missing: ${absoluteTrajectoryPath}`);
  }

  if (!fs.existsSync(absoluteTemplateImagePath)) {
    throw new Error(`template image missing: ${absoluteTemplateImagePath}`);
  }

  const trajectoryContent = fs.readFileSync(absoluteTrajectoryPath);
  const trajectoryPayload = JSON.parse(trajectoryContent.toString('utf8'));
  const features = buildFeaturesFromTrajectoryPayload(trajectoryPayload);
  const trajectoryCloudPath = `standard-trajectories/${word.wordKey}/${path.basename(absoluteTrajectoryPath)}`;
  const trajectoryUploadResult = await cloud.uploadFile({
    cloudPath: trajectoryCloudPath,
    fileContent: trajectoryContent
  });

  const templateImageContent = fs.readFileSync(absoluteTemplateImagePath);
  const templateImageCloudPath = `recognition-templates/${word.wordKey}/${path.basename(absoluteTemplateImagePath)}`;
  const templateUploadResult = await cloud.uploadFile({
    cloudPath: templateImageCloudPath,
    fileContent: templateImageContent
  });

  const document = {
    wordKey: word.wordKey,
    legacyKey: word.legacyKey || '',
    chinese: word.chinese,
    transliteration: word.transliteration,
    mongolian: word.mongolian,
    trajectoryFileID: trajectoryUploadResult.fileID,
    trajectoryCloudPath,
    templateImageFileID: templateUploadResult.fileID,
    templateImageCloudPath,
    strokeCount: features.strokeCount,
    templateSignature: features.signature,
    templateProfile: features.profile,
    recognitionFeatureVersion: 2,
    localTrajectoryPath: absoluteTrajectoryPath,
    localTemplateImagePath: absoluteTemplateImagePath,
    updatedAt: db.serverDate()
  };

  const documentId = await upsertWordDocument(document);
  console.log(`[init-recognition-catalog] synced ${word.wordKey}: ${documentId}`);
}

async function main() {
  for (const word of CURATED_RECOGNITION_WORDS) {
    await uploadWordAssets(word);
  }
  console.log('[init-recognition-catalog] done');
}

main().catch((error) => {
  console.error('[init-recognition-catalog] failed:', error);
  process.exitCode = 1;
});
