/**
 * 班级相关页面共用的多终端布局：iOS / Android、手机 / 平板、安全区
 */

function getWindowMetrics() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      return wx.getWindowInfo()
    }
  } catch (e) {}
  return wx.getSystemInfoSync()
}

function computeIsTablet(windowWidthPx, windowHeightPx, model) {
  const w = windowWidthPx || 0
  const h = windowHeightPx || 0
  const shortSide = Math.min(w, h)
  const longSide = Math.max(w, h)
  const m = String(model || '')
  if (/iPad|Tablet|\bPad\b|PadPro|MatePad|小米平板|平板|SM-T\d|Tab[\s\S]?[A-Z]/i.test(m)) {
    return true
  }
  if (w >= 600) {
    return true
  }
  if (shortSide >= 520 && longSide / shortSide < 1.8) {
    return true
  }
  return false
}

/**
 * @returns {{ layoutClass: string, cursorSpacing: number, isTablet: boolean, isIOS: boolean, isAndroid: boolean, windowWidthPx: number }}
 */
function getClassPageLayout() {
  const win = getWindowMetrics()
  const sys = wx.getSystemInfoSync()
  const wPx = win.windowWidth || sys.windowWidth || 375
  const hPx = win.windowHeight || sys.windowHeight || 667
  const platform = String(sys.platform || '').toLowerCase()
  const model = sys.model || ''

  const isIOS = platform === 'ios'
  const isAndroid = platform === 'android'
  const isTablet = computeIsTablet(wPx, hPx, model)

  const cls = []
  if (isTablet) {
    cls.push('page--tablet')
  }
  if (isIOS) {
    cls.push('page--ios')
  }
  if (isAndroid) {
    cls.push('page--android')
  }

  let cursorSpacing = 28
  if (isTablet) {
    cursorSpacing = 52
  } else if (isAndroid) {
    cursorSpacing = 36
  } else if (isIOS) {
    cursorSpacing = 32
  }

  return {
    layoutClass: cls.join(' '),
    cursorSpacing,
    isTablet,
    isIOS,
    isAndroid,
    windowWidthPx: wPx
  }
}

module.exports = {
  getWindowMetrics,
  computeIsTablet,
  getClassPageLayout
}
