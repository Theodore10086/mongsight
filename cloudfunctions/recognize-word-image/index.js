const cloud = require('wx-server-sdk');
const Jimp = require('jimp');
const {
  buildFeaturesFromTrajectoryPayload,
  extractShapeSignatureFromPixels,
  buildSignatureProfile
} = require('./feature-utils.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
let recognitionCatalogCache = null;
let recognitionCatalogPromise = null;

const WORDS = [
  { wordKey: 'narasu', chinese: '松树', transliteration: 'narasu', mongolian: 'ᠨᠠᠱᠤ' },
  { wordKey: 'huch', chinese: '力量', transliteration: 'huch', mongolian: 'ᠬᠦᠴᠦ' },
  { wordKey: 'hair', chinese: '爱', transliteration: 'hair', mongolian: 'ᠬᠠᠢᠷ' }
];

function rgbaAt(image, x, y) {
  return Jimp.intToRGBA(image.getPixelColor(x, y));
}

function classifyInkPixel(red, green, blue) {
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const brightness = (red + green + blue) / 3;
  const saturation = maxChannel - minChannel;
  const blueInk = blue > green + 12 && blue > red + 15 && brightness < 210;
  const neutralDarkInk = brightness < 120 && saturation < 70;
  const deepDarkInk = maxChannel < 105;
  return blueInk || neutralDarkInk || deepDarkInk;
}

function createInkMask(image) {
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  const mask = Array.from({ length: height }, () => Array(width).fill(0));
  const rowCounts = Array(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { r, g, b } = rgbaAt(image, x, y);
      if (classifyInkPixel(r, g, b)) {
        mask[y][x] = 1;
        rowCounts[y] += 1;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    if (rowCounts[y] > width * 0.55) {
      for (let x = 0; x < width; x += 1) {
        mask[y][x] = 0;
      }
    }
  }

  return mask;
}

function findComponents(mask) {
  const height = mask.length;
  const width = height ? mask[0].length : 0;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const components = [];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y][x] || visited[y][x]) {
        continue;
      }

      const queue = [[x, y]];
      visited[y][x] = true;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let size = 0;
      let sumX = 0;

      while (queue.length) {
        const [currentX, currentY] = queue.pop();
        size += 1;
        sumX += currentX;
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);

        directions.forEach(([dx, dy]) => {
          const nextX = currentX + dx;
          const nextY = currentY + dy;
          if (
            nextX >= 0 &&
            nextY >= 0 &&
            nextX < width &&
            nextY < height &&
            mask[nextY][nextX] &&
            !visited[nextY][nextX]
          ) {
            visited[nextY][nextX] = true;
            queue.push([nextX, nextY]);
          }
        });
      }

      components.push({
        size,
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        centerX: sumX / size
      });
    }
  }

  return components.filter((component) => component.size >= 18);
}

function chooseMainInkRegion(components, width, height) {
  if (!components.length) {
    return {
      minX: Math.floor(width * 0.24),
      maxX: Math.floor(width * 0.76),
      minY: Math.floor(height * 0.08),
      maxY: Math.floor(height * 0.92)
    };
  }

  const ranked = components
    .map((component) => {
      const centerPenalty = Math.abs(component.centerX - width / 2) / Math.max(width, 1);
      const tallBonus = component.height / Math.max(component.width, 1);
      const score = component.size * 1.2 + component.height * 0.6 + tallBonus * 18 - centerPenalty * 140;
      return { ...component, score };
    })
    .sort((left, right) => right.score - left.score);

  const anchor = ranked[0];
  const related = ranked.filter((component) => {
    const sameColumn = Math.abs(component.centerX - anchor.centerX) <= width * 0.18;
    const enoughSize = component.size >= anchor.size * 0.12;
    return sameColumn && enoughSize;
  });

  const union = related.reduce((box, component) => ({
    minX: Math.min(box.minX, component.minX),
    maxX: Math.max(box.maxX, component.maxX),
    minY: Math.min(box.minY, component.minY),
    maxY: Math.max(box.maxY, component.maxY)
  }), {
    minX: anchor.minX,
    maxX: anchor.maxX,
    minY: anchor.minY,
    maxY: anchor.maxY
  });

  const marginX = Math.max(Math.round((union.maxX - union.minX + 1) * 0.42), 12);
  const marginY = Math.max(Math.round((union.maxY - union.minY + 1) * 0.1), 16);

  return {
    minX: Math.max(0, union.minX - marginX),
    maxX: Math.min(width - 1, union.maxX + marginX),
    minY: Math.max(0, union.minY - marginY),
    maxY: Math.min(height - 1, union.maxY + marginY)
  };
}

async function preprocessPhotoForMatching(buffer) {
  const source = await Jimp.read(buffer);
  source.scaleToFit(420, 760);

  const mask = createInkMask(source);
  const components = findComponents(mask);
  const region = chooseMainInkRegion(components, source.bitmap.width, source.bitmap.height);
  const cropWidth = Math.max(region.maxX - region.minX + 1, 32);
  const cropHeight = Math.max(region.maxY - region.minY + 1, 32);
  const cropped = source.clone().crop(region.minX, region.minY, cropWidth, cropHeight);
  const croppedMask = createInkMask(cropped);

  const pixels = Array.from({ length: 64 }, () => Array(64).fill(0));
  const scale = Math.min(42 / Math.max(cropWidth, 1), 56 / Math.max(cropHeight, 1));
  const targetWidth = Math.max(Math.round(cropWidth * scale), 1);
  const targetHeight = Math.max(Math.round(cropHeight * scale), 1);
  const offsetX = Math.round((64 - targetWidth) / 2);
  const offsetY = Math.round((64 - targetHeight) / 2);

  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      if (!croppedMask[y][x]) {
        continue;
      }
      const mappedX = Math.min(63, Math.max(0, offsetX + Math.round((x / cropWidth) * Math.max(targetWidth - 1, 0))));
      const mappedY = Math.min(63, Math.max(0, offsetY + Math.round((y / cropHeight) * Math.max(targetHeight - 1, 0))));
      pixels[mappedY][mappedX] = 1;
      if (mappedX + 1 < 64) {
        pixels[mappedY][mappedX + 1] = 1;
      }
    }
  }

  return pixels;
}

function averageAbsoluteDifference(left = [], right = []) {
  const length = Math.max(left.length, right.length, 1);
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += Math.abs(Number(left[index] || 0) - Number(right[index] || 0));
  }
  return total / length;
}

function compareShapeSignature(left, right) {
  const centerGap = averageAbsoluteDifference(left.centerSeries, right.centerSeries);
  const spreadGap = averageAbsoluteDifference(left.spreadSeries, right.spreadSeries);
  const densityGap = averageAbsoluteDifference(left.densitySeries, right.densitySeries);
  const segmentGap = averageAbsoluteDifference(left.segmentDensity, right.segmentDensity);
  const slopeGap = averageAbsoluteDifference(left.slopeSeries, right.slopeSeries);
  const columnGap = averageAbsoluteDifference(left.columnDensity, right.columnDensity);
  const occupiedGap = Math.abs(left.occupiedRatio - right.occupiedRatio);
  const topGap = Math.abs(left.topAnchor - right.topAnchor);
  const bottomGap = Math.abs(left.bottomAnchor - right.bottomAnchor);
  const turnGap = Math.min(Math.abs(left.turnCount - right.turnCount) / 6, 1);

  const weightedGap = (
    centerGap * 0.26 +
    spreadGap * 0.17 +
    densityGap * 0.1 +
    segmentGap * 0.14 +
    slopeGap * 0.16 +
    columnGap * 0.09 +
    occupiedGap * 0.06 +
    topGap * 0.04 +
    bottomGap * 0.04 +
    turnGap * 0.04
  );

  return Math.max(0, Math.min(1, 1 - weightedGap));
}

function compareProfile(leftProfile, rightProfile) {
  const gaps = [
    Math.abs(leftProfile.topCenter - rightProfile.topCenter) * 0.12,
    Math.abs(leftProfile.midCenter - rightProfile.midCenter) * 0.2,
    Math.abs(leftProfile.bottomCenter - rightProfile.bottomCenter) * 0.08,
    Math.abs(leftProfile.topSpread - rightProfile.topSpread) * 0.12,
    Math.abs(leftProfile.midSpread - rightProfile.midSpread) * 0.08,
    Math.abs(leftProfile.lowSpread - rightProfile.lowSpread) * 0.15,
    Math.abs(leftProfile.bottomSpread - rightProfile.bottomSpread) * 0.2,
    Math.abs(leftProfile.topSegments - rightProfile.topSegments) * 0.06,
    Math.abs(leftProfile.midSegments - rightProfile.midSegments) * 0.04,
    Math.abs(leftProfile.lowSegments - rightProfile.lowSegments) * 0.08,
    Math.abs(leftProfile.bottomSegments - rightProfile.bottomSegments) * 0.1,
    Math.abs(leftProfile.centerDrop - rightProfile.centerDrop) * 0.1,
    Math.abs(leftProfile.centerLift - rightProfile.centerLift) * 0.07
  ];

  const totalGap = gaps.reduce((sum, value) => sum + value, 0);
  return Math.max(0, Math.min(1, 1 - totalGap));
}

async function loadRecognitionCatalog() {
  const response = await db.collection('recognition_words').get();
  const documents = response.data || [];

  return Promise.all(documents.map(async (document) => {
    let signature = document.templateSignature || null;
    let profile = document.templateProfile || null;
    let strokeCount = Number(document.strokeCount || 0);

    if ((!signature || !profile) && document.trajectoryFileID) {
      const trajectoryDownloaded = await cloud.downloadFile({
        fileID: document.trajectoryFileID
      });
      const standardTrajectory = JSON.parse(trajectoryDownloaded.fileContent.toString('utf8'));
      const features = buildFeaturesFromTrajectoryPayload(standardTrajectory);
      signature = features.signature;
      profile = features.profile;
      strokeCount = features.strokeCount;
    }

    return {
      ...document,
      templateSignature: signature,
      templateProfile: profile,
      strokeCount
    };
  }));
}

async function getRecognitionCatalog() {
  if (recognitionCatalogCache) {
    return recognitionCatalogCache;
  }

  if (!recognitionCatalogPromise) {
    recognitionCatalogPromise = loadRecognitionCatalog()
      .then((catalog) => {
        recognitionCatalogCache = catalog;
        return catalog;
      })
      .finally(() => {
        recognitionCatalogPromise = null;
      });
  }

  return recognitionCatalogPromise;
}

async function computeImageScores(inputFileID, recognitionCatalog) {
  if (!inputFileID) {
    return { imageScores: {}, confidence: 0 };
  }

  const inputDownloaded = await cloud.downloadFile({ fileID: inputFileID });
  const inputPixels = await preprocessPhotoForMatching(inputDownloaded.fileContent);
  const inputSignature = extractShapeSignatureFromPixels(inputPixels);
  const inputProfile = buildSignatureProfile(inputSignature);
  const imageScores = {};

  for (const document of recognitionCatalog) {
    const signature = document.templateSignature;
    const profile = document.templateProfile;

    if (!signature || !profile) {
      imageScores[document.wordKey] = 0;
      continue;
    }

    const shapeScore = compareShapeSignature(inputSignature, signature);
    const profileScore = compareProfile(inputProfile, profile);
    const score = Math.max(
      0,
      Math.min(1, profileScore * 0.6 + shapeScore * 0.4)
    );
    imageScores[document.wordKey] = Number(score.toFixed(4));
  }

  const orderedScores = Object.values(imageScores).sort((left, right) => right - left);
  const confidence = orderedScores.length >= 2
    ? Math.max(0, Math.min(1, orderedScores[0] - orderedScores[1] + orderedScores[0] * 0.35))
    : Number(orderedScores[0] || 0);

  return {
    imageScores,
    confidence: Number(confidence.toFixed(4))
  };
}

async function updateLatestRecognition(openId, payload) {
  const collection = db.collection('user_latest_recognition');
  const existing = await collection.where({ _openid: openId }).limit(1).get();

  if (existing.data && existing.data[0]) {
    await collection.doc(existing.data[0]._id).update({ data: payload });
    return existing.data[0]._id;
  }

  const result = await collection.add({
    data: {
      _openid: openId,
      ...payload
    }
  });
  return result._id;
}

function pickBestWord(imageScores) {
  const ranked = WORDS.map((word) => {
    const imageScore = imageScores[word.wordKey] || 0;
    return {
      ...word,
      imageScore,
      totalScore: imageScore
    };
  }).sort((left, right) => right.totalScore - left.totalScore);

  return {
    bestWord: ranked[0],
    ranked
  };
}

function toCandidate(word) {
  return {
    wordKey: word.wordKey,
    chinese: word.chinese,
    transliteration: word.transliteration,
    mongolian: word.mongolian,
    score: Number((word.totalScore || 0).toFixed(4)),
    imageScore: Number((word.imageScore || 0).toFixed(4))
  };
}

async function getWordResult(wordKey, recognitionCatalog) {
  const word = WORDS.find((item) => item.wordKey === wordKey);
  const trajectoryDocument = recognitionCatalog.find((item) => item.wordKey === wordKey);
  if (!word || !trajectoryDocument || !trajectoryDocument.trajectoryFileID) {
    throw new Error('matched word missing trajectory');
  }

  if (trajectoryDocument.standardTrajectory) {
    return {
      word,
      standardTrajectory: trajectoryDocument.standardTrajectory
    };
  }

  const downloaded = await cloud.downloadFile({
    fileID: trajectoryDocument.trajectoryFileID
  });
  const standardTrajectory = JSON.parse(downloaded.fileContent.toString('utf8'));
  trajectoryDocument.standardTrajectory = standardTrajectory;

  return {
    word,
    standardTrajectory
  };
}

exports.main = async (event) => {
  const { fileID, wordKey } = event;
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  if (!fileID && !wordKey) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: 'missing fileID'
    };
  }

  try {
    const recognitionCatalog = await getRecognitionCatalog();
    if (!recognitionCatalog.length) {
      return {
        success: false,
        code: 'CATALOG_EMPTY',
        message: 'recognition catalog is empty'
      };
    }

    const scoreResult = fileID
      ? await computeImageScores(fileID, recognitionCatalog)
      : { imageScores: {}, confidence: 1 };
    const rankedResult = pickBestWord(scoreResult.imageScores);
    const chosenWordKey = wordKey || rankedResult.bestWord.wordKey;
    const { word, standardTrajectory } = await getWordResult(chosenWordKey, recognitionCatalog);
    const candidates = rankedResult.ranked.map(toCandidate);

    await updateLatestRecognition(openId, {
      imageFileID: fileID || '',
      recognizedWordKey: word.wordKey,
      recognizedWordChinese: word.chinese,
      recognizedWordMongolian: word.mongolian,
      recognitionStatus: wordKey ? 'manual-selected' : 'matched',
      imageScores: scoreResult.imageScores,
      confidence: scoreResult.confidence,
      bestImageScore: rankedResult.bestWord?.imageScore || 0,
      candidates,
      updatedAt: db.serverDate()
    });

    return {
      success: true,
      data: {
        word: {
          wordKey: word.wordKey,
          chinese: word.chinese,
          transliteration: word.transliteration,
          mongolian: word.mongolian
        },
        candidates,
        imageFileID: fileID || '',
        recognizedAt: Date.now(),
        confidence: scoreResult.confidence,
        scores: {
          imageScores: scoreResult.imageScores,
          imageScore: rankedResult.bestWord?.imageScore || 0,
          totalScore: rankedResult.bestWord?.totalScore || 0
        },
        standardTrajectory
      }
    };
  } catch (error) {
    console.error('[recognize-word-image] failed:', error);
    return {
      success: false,
      code: 'INTERNAL_ERROR',
      message: error.message || 'recognition failed'
    };
  }
};
