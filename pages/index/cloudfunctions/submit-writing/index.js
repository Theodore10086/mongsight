/**
 * 微信云函数 - 提交书写作品
 * 文件: cloudfunctions/submit-writing/index.js
 * 功能: 
 *  1. 接收小程序上传的笔迹数据和图片
 *  2. 调用 AI 服务获取评分
 *  3. (可选) 调用 AI 服务生成艺术图
 *  4. 将数据存入云数据库
 *  5. 返回结果
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const aiService = require('../utils/aiService');

/**
 * 云函数入口
 * @param {object} event - 小程序传递的事件参数
 * @param {string} event.wordId - 词汇 ID
 * @param {Array} event.userCoords - 用户书写坐标 [{x, y, t}, ...]
 * @param {string} event.imageBase64 - 书写图片 Base64 (可选)
 * @param {string} event.standardCoords - 标准笔顺坐标 (可选，用于离线评测)
 * @param {boolean} event.generateArtwork - 是否生成艺术图
 * @param {string} event.artworkStyle - 艺术图风格
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  
  const { 
    wordId, 
    userCoords, 
    imageBase64, 
    standardCoords,
    generateArtwork = false,
    artworkStyle = 'traditional_mongol'
  } = event;
  
  console.log('[SubmitWriting] Start, wordId:', wordId);
  console.log('[SubmitWriting] User openId:', openId);
  
  // 参数校验
  if (!wordId) {
    return { success: false, error: '缺少 wordId 参数' };
  }
  if (!userCoords || !Array.isArray(userCoords) || userCoords.length === 0) {
    return { success: false, error: '无效的用户坐标数据' };
  }
  
  try {
    // 第一步: 获取标准笔顺数据
    let stdCoords = standardCoords;
    
    if (!stdCoords) {
      // 从云数据库获取标准笔顺 (这里假设标准数据已导入)
      // 实际项目中可以查询 standard_trajectories 表或从缓存获取
      console.log('[SubmitWriting] Fetching standard coords for:', wordId);
      stdCoords = getStandardCoords(wordId); // 模拟函数
    }
    
    if (!stdCoords || stdCoords.length === 0) {
      return { success: false, error: '未找到该词汇的标准笔顺数据' };
    }
    
    // 第二步: 调用 AI 服务进行评估
    console.log('[SubmitWriting] Calling AI evaluate service...');
    let aiResult;
    
    try {
      aiResult = await aiService.evaluateHandwriting(userCoords, stdCoords);
      console.log('[SubmitWriting] AI evaluation result:', aiResult);
    } catch (aiError) {
      console.error('[SubmitWriting] AI service error:', aiError.message);
      // AI 服务失败时返回默认评分
      aiResult = {
        score: 0,
        dtw_distance: -1,
        advice: 'AI 评分服务暂时不可用',
        stroke_scores: []
      };
    }
    
    // 第三步: (可选) 生成艺术图
    let artworkResult = null;
    if (generateArtwork && imageBase64) {
      console.log('[SubmitWriting] Generating artwork...');
      try {
        artworkResult = await aiService.generateArtwork(imageBase64, artworkStyle, 0.8);
      } catch (artError) {
        console.error('[SubmitWriting] Artwork generation error:', artError.message);
      }
    }
    
    // 第四步: 上传图片到云存储 (如果有)
    let artworkUrl = null;
    if (artworkResult && artworkResult.artwork_base64) {
      try {
        // 注意: 这里需要先将 Base64 转为临时文件
        // 实际实现需要用到 模块写 fs临时文件
        console.log('[SubmitWriting] Artwork generated (Base64 length):', artworkResult.artwork_base64.length);
        // artworkUrl = await uploadArtworkToCloudStorage(artworkResult.artwork_base64);
      } catch (uploadError) {
        console.error('[SubmitWriting] Upload error:', uploadError.message);
      }
    }
    
    // 第五步: 保存用户作品到云数据库
    const userWork = {
      _openid: openId,
      word_id: wordId,
      user_coordinates: userCoords,
      standard_coordinates: stdCoords,
      ai_feedback: {
        score: aiResult.score,
        dtw_distance: aiResult.dtw_distance,
        advice: aiResult.advice,
        stroke_scores: aiResult.stroke_scores || []
      },
      score: aiResult.score,
      artwork_url: artworkUrl,
      artwork_base64: artworkResult?.artwork_base64 || null,
      image_base64: imageBase64,
      create_time: db.serverDate(),
      update_time: db.serverDate()
    };
    
    const addResult = await db.collection('user_works').add({
      data: userWork
    });
    
    console.log('[SubmitWriting] Work saved, id:', addResult._id);
    
    // 第六步: 更新用户积分和经验
    await updateUserStats(openId, aiResult.score);
    
    return {
      success: true,
      data: {
        workId: addResult._id,
        wordId: wordId,
        score: aiResult.score,
        dtwDistance: aiResult.dtw_distance,
        advice: aiResult.advice,
        strokeScores: aiResult.stroke_scores || [],
        artworkBase64: artworkResult?.artwork_base64 || null,
        artworkUrl: artworkUrl
      }
    };
    
  } catch (error) {
    console.error('[SubmitWriting] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 获取标准笔顺坐标
 * 实际项目中应从 MySQL 或云数据库查询
 */
function getStandardCoords(wordId) {
  // 模拟数据 - 实际应从数据库查询
  const standardData = {
    'word_001': [
      { x: 100, y: 200, t: 0, stroke_id: 1 },
      { x: 120, y: 180, t: 50, stroke_id: 1 },
      { x: 150, y: 150, t: 100, stroke_id: 1 },
      { x: 180, y: 200, t: 150, stroke_id: 2 },
      { x: 200, y: 250, t: 200, stroke_id: 2 }
    ],
    'word_002': [
      { x: 80, y: 150, t: 0, stroke_id: 1 },
      { x: 100, y: 130, t: 40, stroke_id: 1 },
      { x: 130, y: 120, t: 80, stroke_id: 1 },
      { x: 160, y: 150, t: 120, stroke_id: 2 },
      { x: 180, y: 200, t: 160, stroke_id: 2 }
    ]
  };
  
  return standardData[wordId] || null;
}

/**
 * 更新用户统计信息
 */
async function updateUserStats(openId, score) {
  try {
    const userQuery = await db.collection('users').where({
      _openid: openId
    }).get();
    
    if (userQuery.data && userQuery.data.length > 0) {
      const user = userQuery.data[0];
      const newTotalScore = (user.total_score || 0) + score;
      const newExperience = (user.experience || 0) + score;
      
      // 计算新等级 (每 1000 经验升一级)
      const newLevel = Math.floor(newExperience / 1000) + 1;
      
      await db.collection('users').doc(user._id).update({
        data: {
          total_score: newTotalScore,
          experience: newExperience,
          level: newLevel
        }
      });
      
      console.log('[SubmitWriting] User stats updated, new level:', newLevel);
    }
  } catch (error) {
    console.error('[SubmitWriting] Update user stats error:', error.message);
  }
}
