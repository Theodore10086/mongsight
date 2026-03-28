/**
 * 微信云函数 - 获取社区帖子列表
 * 文件: cloudfunctions/get-community-posts/index.js
 * 功能: 分页获取社区帖子列表，支持筛选和排序
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 云函数入口
 * @param {object} event - 请求参数
 * @param {number} event.page - 页码，默认 1
 * @param {number} event.pageSize - 每页数量，默认 10
 * @param {string} event.sortBy - 排序方式: latest/popular
 * @param {string} event.userId - 筛选特定用户的帖子 (可选)
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  
  const { 
    page = 1, 
    pageSize = 10,
    sortBy = 'latest',
    userId = null
  } = event;
  
  console.log('[GetCommunityPosts] Page:', page, 'PageSize:', pageSize, 'SortBy:', sortBy);
  
  try {
    // 构建查询条件
    let query = {};
    if (userId) {
      query._openid = userId;
    }
    
    // 构建排序条件
    let orderField = 'create_time';
    let orderDirection = 'desc';
    
    if (sortBy === 'popular') {
      orderField = 'likes';
      orderDirection = 'desc';
    }
    
    // 查询总数
    const countResult = await db.collection('posts').where(query).count();
    const total = countResult.total;
    
    // 分页查询
    const skip = (page - 1) * pageSize;
    const postsQuery = db.collection('posts')
      .where(query)
      .orderBy(orderField, orderDirection)
      .skip(skip)
      .limit(pageSize)
      .get();
    
    const postsResult = await postsQuery;
    let posts = postsResult.data || [];
    
    // 获取用户信息 (发表者)
    if (posts.length > 0) {
      const openIds = [...new Set(posts.map(p => p._openid))];
      
      // 批量查询用户信息
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        
        try {
          const userQuery = await db.collection('users').where({
            _openid: post._openid
          }).get();
          
          if (userQuery.data && userQuery.data.length > 0) {
            post.userInfo = {
              nickname: userQuery.data[0].nickname,
              avatar: userQuery.data[0].avatar,
              level: userQuery.data[0].level
            };
          } else {
            post.userInfo = {
              nickname: '匿名用户',
              avatar: '',
              level: 1
            };
          }
        } catch (userError) {
          post.userInfo = {
            nickname: '匿名用户',
            avatar: '',
            level: 1
          };
        }
        
        // 格式化时间
        if (post.create_time) {
          post.create_time_str = formatTime(post.create_time);
        }
      }
    }
    
    // 计算分页信息
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;
    
    return {
      success: true,
      data: {
        posts: posts,
        pagination: {
          page: page,
          pageSize: pageSize,
          total: total,
          totalPages: totalPages,
          hasMore: hasMore
        }
      }
    };
    
  } catch (error) {
    console.error('[GetCommunityPosts] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 格式化时间为可读字符串
 */
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  
  if (diff < minute) {
    return '刚刚';
  } else if (diff < hour) {
    return Math.floor(diff / minute) + '分钟前';
  } else if (diff < day) {
    return Math.floor(diff / hour) + '小时前';
  } else if (diff < 7 * day) {
    return Math.floor(diff / day) + '天前';
  } else {
    return `${date.getMonth() + 1}-${date.getDate()}`;
  }
}
