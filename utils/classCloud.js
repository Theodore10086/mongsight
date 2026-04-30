/**
 * 班级云端服务统一调用入口
 * 所有班级相关读写都走 class-service 云函数。
 */

const CLASS_SERVICE = 'class-service'

/**
 * 调用 class-service 云函数
 * @param {string} action
 * @param {object} [payload]
 * @returns {Promise<any>} 云函数返回的 data 字段
 */
function callClassService(action, payload) {
  return new Promise((resolve, reject) => {
    if (!wx || !wx.cloud) {
      reject(new Error('云开发未初始化'))
      return
    }
    wx.cloud.callFunction({
      name: CLASS_SERVICE,
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
        console.warn('[classCloud] callFunction fail', action, err)
        reject(new Error((err && err.errMsg) || '网络错误'))
      }
    })
  })
}

/**
 * 把云存储 fileID 转为 https 临时 URL（带缓存避免重复请求）
 * @param {string|string[]} fileIDs
 * @returns {Promise<{ [fileID:string]: string }>}
 */
const _tempUrlCache = new Map()
const TEMP_URL_TTL_MS = 60 * 60 * 1000  // 1 小时

function getTempFileURL(fileIDs) {
  const list = Array.isArray(fileIDs) ? fileIDs : [fileIDs]
  const valid = list.filter((id) => typeof id === 'string' && id.indexOf('cloud://') === 0)
  if (valid.length === 0) {
    return Promise.resolve({})
  }
  const now = Date.now()
  const result = {}
  const need = []
  valid.forEach((id) => {
    const cached = _tempUrlCache.get(id)
    if (cached && cached.expires > now) {
      result[id] = cached.url
    } else {
      need.push(id)
    }
  })
  if (need.length === 0) {
    return Promise.resolve(result)
  }
  return new Promise((resolve, reject) => {
    wx.cloud.getTempFileURL({
      fileList: need,
      success(res) {
        ;(res.fileList || []).forEach((item) => {
          if (item.status === 0 && item.tempFileURL) {
            _tempUrlCache.set(item.fileID, {
              url: item.tempFileURL,
              expires: now + TEMP_URL_TTL_MS
            })
            result[item.fileID] = item.tempFileURL
          }
        })
        resolve(result)
      },
      fail(err) {
        console.warn('[classCloud] getTempFileURL fail', err)
        reject(new Error((err && err.errMsg) || '获取临时链接失败'))
      }
    })
  })
}

/**
 * 上传本地图片到云存储
 * @param {string} localPath 临时路径或本地文件路径
 * @param {string} cloudPath 云存储目标路径，如 class/copybooks/{classId}/xxx.jpg
 * @returns {Promise<string>} fileID
 */
function uploadFile(localPath, cloudPath) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      filePath: localPath,
      cloudPath,
      success(res) {
        if (res && res.fileID) {
          resolve(res.fileID)
        } else {
          reject(new Error('上传失败'))
        }
      },
      fail(err) {
        console.warn('[classCloud] uploadFile fail', err)
        reject(new Error((err && err.errMsg) || '上传失败'))
      }
    })
  })
}

module.exports = {
  callClassService,
  getTempFileURL,
  uploadFile
}
