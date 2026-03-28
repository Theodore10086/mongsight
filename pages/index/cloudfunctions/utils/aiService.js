/**
 * 微信云函数 - 公共工具模块
 * 文件: cloudfunctions/utils/aiService.js
 * 功能: 封装对 AutoDL AI 服务的 HTTP 请求
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const AI_SERVICE_BASE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_API_KEY = process.env.AI_API_KEY || 'mengge_secret_key_2024';
const MAX_RETRY_TIMES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * 发送 HTTP 请求到 AI 服务
 * @param {string} endpoint - API 端点路径 (如 /api/v1/evaluate)
 * @param {object} data - 请求数据
 * @param {number} retryTimes - 当前重试次数
 * @returns {Promise<object>} 响应数据
 */
async function requestAIService(endpoint, data, retryTimes = 0) {
  const url = `${AI_SERVICE_BASE_URL}${endpoint}`;
  
  console.log(`[AI Service] Request to: ${url}`);
  console.log(`[AI Service] Payload:`, JSON.stringify(data).substring(0, 200));
  
  try {
    const response = await cloud.fetch({
      url: url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'X-API-Key': AI_API_KEY
      },
      data: data
    });
    
    if (response.statusCode === 200) {
      console.log(`[AI Service] Success:`, JSON.stringify(response.data).substring(0, 200));
      return response.data;
    } else if (response.statusCode === 401) {
      throw new Error('AI 服务 API Key 验证失败');
    } else {
      throw new Error(`AI 服务返回错误: ${response.statusCode} - ${response.data?.detail || '未知错误'}`);
    }
  } catch (error) {
    console.error(`[AI Service] Error (retry ${retryTimes}):`, error.message);
    
    // 重试逻辑
    if (retryTimes < MAX_RETRY_TIMES) {
      console.log(`[AI Service] Retrying in ${RETRY_DELAY_MS}ms...`);
      await sleep(RETRY_DELAY_MS);
      return requestAIService(endpoint, data, retryTimes + 1);
    }
    
    throw error;
  }
}

/**
 * 调用笔迹复原 API
 * @param {string} imageBase64 - 图片 Base64 编码
 * @param {string} wordId - 词汇 ID (可选)
 * @returns {Promise<object>} 笔顺坐标数据
 */
async function recoverHandwriting(imageBase64, wordId = null) {
  const data = {
    image_base64: imageBase64,
    word_id: wordId
  };
  
  return await requestAIService('/api/v1/recover', data);
}

/**
 * 调用书写评估 API
 * @param {Array} userCoords - 用户书写坐标 [{x, y, t}, ...]
 * @param {Array} standardCoords - 标准笔顺坐标 [{x, y, t}, ...]
 * @returns {Promise<object>} 评估结果 {score, dtw_distance, advice, stroke_scores}
 */
async function evaluateHandwriting(userCoords, standardCoords) {
  const data = {
    user_coords: userCoords,
    standard_coords: standardCoords
  };
  
  return await requestAIService('/api/v1/evaluate', data);
}

/**
 * 调用艺术图生成 API
 * @param {string} userImageBase64 - 用户笔迹图 Base64
 * @param {string} style - 风格 (traditional_mongol/modern/ink)
 * @param {number} strength - 风格强度 0-1
 * @returns {Promise<object>} 生成结果 {artwork_base64, artwork_url}
 */
async function generateArtwork(userImageBase64, style = 'traditional_mongol', strength = 0.8) {
  const data = {
    user_image_base64: userImageBase64,
    style: style,
    strength: strength
  };
  
  return await requestAIService('/api/v1/generate', data);
}

/**
 * 休眠函数
 * @param {number} ms - 毫秒
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 上传文件到云存储
 * @param {string} filePath - 本地临时文件路径
 * @param {string} cloudPath - 云存储路径
 * @returns {Promise<string>} 文件 ID
 */
async function uploadToCloudStorage(filePath, cloudPath) {
  try {
    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath
    });
    return uploadResult.fileID;
  } catch (error) {
    console.error('[Cloud Storage] Upload error:', error);
    throw error;
  }
}

/**
 * 从云存储下载文件
 * @param {string} fileID - 文件 ID
 * @returns {Promise<Buffer>} 文件内容
 */
async function downloadFromCloudStorage(fileID) {
  try {
    const downloadResult = await cloud.downloadFile({
      fileID: fileID
    });
    return downloadResult.fileContent;
  } catch (error) {
    console.error('[Cloud Storage] Download error:', error);
    throw error;
  }
}

module.exports = {
  requestAIService,
  recoverHandwriting,
  evaluateHandwriting,
  generateArtwork,
  uploadToCloudStorage,
  downloadFromCloudStorage,
  AI_SERVICE_BASE_URL,
  AI_API_KEY
};
