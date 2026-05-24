/**
 * 社区云函数统一调用入口
 * 所有社区相关读写都走 community 云函数
 */

function callCommunity(action, payload) {
  return new Promise((resolve, reject) => {
    if (!wx || !wx.cloud) {
      reject(new Error('云开发未初始化'))
      return
    }
    wx.cloud.callFunction({
      name: 'community',
      data: Object.assign({ action }, payload || {}),
      success(res) {
        const result = res && res.result
        if (result && result.success) {
          resolve(result.data)
        } else {
          const msg = (result && result.message) || '请求失败'
          reject(new Error(msg))
        }
      },
      fail(err) {
        console.warn('[community-cloud] call fail', action, err)
        reject(new Error((err && err.errMsg) || '网络错误'))
      }
    })
  })
}

function normalizePosts(posts) {
  return posts.map((post) => {
    const id = post.id || post._id
    const avatar = post.avatarUrl || post.avatar || ''
    const avatarIsImage = typeof avatar === 'string' && /^(https?:|wxfile:|cloud:|\/)/i.test(avatar)
    return {
      ...post,
      id,
      avatarText: avatarIsImage ? '' : avatar,
      avatarIsImage,
      avatarUrl: avatarIsImage ? avatar : '',
      likes: Number(post.likes || 0),
      comments: Number(post.comments || 0),
      liked: !!post.liked,
      isFavorited: !!post.isFavorited,
      commentsList: (post.commentsList || []).slice(0, 2)
    }
  })
}

module.exports = {
  callCommunity,
  normalizePosts
}
