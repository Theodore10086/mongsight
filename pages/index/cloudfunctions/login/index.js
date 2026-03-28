/**
 * 微信云函数 - 用户登录
 * 文件: cloudfunctions/login/index.js
 * 功能: 获取 OpenID，更新/创建用户记录
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  
  console.log('[Login] User openId:', openId);
  
  if (!openId) {
    return {
      success: false,
      error: '无法获取用户 OpenID'
    };
  }
  
  try {
    // 查询用户是否已存在
    const userQuery = await db.collection('users').where({
      _openid: openId
    }).get();
    
    let userInfo;
    
    if (userQuery.data && userQuery.data.length > 0) {
      // 用户已存在，更新登录信息
      userInfo = userQuery.data[0];
      await db.collection('users').doc(userInfo._id).update({
        data: {
          last_login_time: db.serverDate(),
          login_count: userInfo.login_count ? userInfo.login_count + 1 : 1
        }
      });
      console.log('[Login] User updated:', userInfo._id);
    } else {
      // 新用户，创建记录
      const newUser = {
        _openid: openId,
        nickname: event.userInfo?.nickName || '新用户',
        avatar: event.userInfo?.avatarUrl || '',
        total_score: 0,
        level: 1,
        experience: 0,
        created_at: db.serverDate(),
        last_login_time: db.serverDate(),
        login_count: 1,
        favorite_words: [],
        completed_words: []
      };
      
      const addResult = await db.collection('users').add({
        data: newUser
      });
      userInfo = { ...newUser, _id: addResult._id };
      console.log('[Login] New user created:', addResult._id);
    }
    
    return {
      success: true,
      data: {
        openId: openId,
        userId: userInfo._id,
        nickname: userInfo.nickname,
        avatar: userInfo.avatar,
        totalScore: userInfo.total_score,
        level: userInfo.level,
        experience: userInfo.experience
      }
    };
    
  } catch (error) {
    console.error('[Login] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
