// app.js
App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV,
        traceUser: true
      })
    }

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 隐私协议弹窗处理（微信 2023-09 起强制要求）
    wx.onNeedPrivacyAuthorization((resolve) => {
      wx.showModal({
        title: '隐私保护提示',
        content: '蒙格穿梭需要收集你的头像、昵称用于创建书法档案，收集手写轨迹用于书法识别与评分。详见《隐私政策》。',
        confirmText: '同意',
        cancelText: '拒绝',
        success: (res) => {
          if (res.confirm) {
            resolve({ event: 'agree' })
          } else {
            resolve({ event: 'disagree' })
          }
        }
      })
    })
  },
  globalData: {
    userInfo: null,
    bgMusicManager: null,
    bgMusicEnabled: true,
    currentMusicIndex: 0,
    musicList: [
      { name: '轻快', src: 'cloud://cloud1-6g6qzrswbfeff910.636c-cloud1-6g6qzrswbfeff910-1404694297/Kinetic_Bloom.mp3', epname: 'Kinetic Bloom' },
      { name: '悲壮', src: 'cloud://cloud1-6g6qzrswbfeff910.636c-cloud1-6g6qzrswbfeff910-1404694297/Echoes_of_the_Ancient_Star.mp3', epname: 'Echoes of the Ancient Star' }
    ]
  },
  async _resolveAudioSrc(src) {
    if (!src.startsWith('cloud://')) return src;
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [src] });
      return res.fileList[0].tempFileURL;
    } catch (e) {
      console.error('[BgMusic] getTempFileURL failed:', e);
      return src;
    }
  },
  async playBgMusic(musicIndex) {
    const app = this;
    const idx = musicIndex !== undefined ? musicIndex : app.globalData.currentMusicIndex;
    const music = app.globalData.musicList[idx];

    console.log('[BgMusic] playBgMusic called, enabled:', app.globalData.bgMusicEnabled, 'music:', music.name);

    if (app.globalData.bgMusicEnabled && music) {
      app.globalData.currentMusicIndex = idx;
      wx.setStorageSync('currentMusicIndex', idx);

      if (!app.globalData.bgMusicManager) {
        app.globalData.bgMusicManager = wx.getBackgroundAudioManager();

        app.globalData.bgMusicManager.onPlay(() => {
          console.log('[BgMusic] Playing...');
        });
        app.globalData.bgMusicManager.onError((err) => {
          console.error('[BgMusic] Error:', err);
        });
      }

      const resolvedSrc = await app._resolveAudioSrc(music.src);
      app.globalData.bgMusicManager.title = music.name;
      app.globalData.bgMusicManager.epname = music.epname;
      app.globalData.bgMusicManager.src = resolvedSrc;
      app.globalData.bgMusicManager.loop = true;

      app.globalData.bgMusicManager.play();
      console.log('[BgMusic] Starting with src:', resolvedSrc);
    }
  },
  async playGuideMusic() {
    const app = this;
    const guideMusic = app.globalData.musicList[1];

    console.log('[BgMusic] playGuideMusic called, music:', guideMusic.name);

    if (guideMusic) {
      if (!app.globalData.bgMusicManager) {
        app.globalData.bgMusicManager = wx.getBackgroundAudioManager();

        app.globalData.bgMusicManager.onPlay(() => {
          console.log('[GuideMusic] Playing...');
        });
        app.globalData.bgMusicManager.onError((err) => {
          console.error('[GuideMusic] Error:', err);
        });
      }

      const resolvedSrc = await app._resolveAudioSrc(guideMusic.src);
      app.globalData.bgMusicManager.title = guideMusic.name;
      app.globalData.bgMusicManager.epname = guideMusic.epname;
      app.globalData.bgMusicManager.src = resolvedSrc;
      app.globalData.bgMusicManager.loop = true;

      app.globalData.bgMusicManager.play();
      console.log('[GuideMusic] Starting with src:', resolvedSrc);
    }
  },
  stopBgMusic() {
    const app = this;
    if (app.globalData.bgMusicManager) {
      app.globalData.bgMusicManager.stop();
    }
  },
  toggleBgMusic(enabled, musicIndex) {
    console.log('[BgMusic] toggleBgMusic:', enabled, 'musicIndex:', musicIndex);
    const app = this;
    app.globalData.bgMusicEnabled = enabled;
    wx.setStorageSync('bgMusicEnabled', enabled);
    if (enabled) {
      if (musicIndex !== undefined) {
        app.playBgMusic(musicIndex);
      } else {
        app.playBgMusic();
      }
    } else if (app.globalData.bgMusicManager) {
      app.globalData.bgMusicManager.pause();
    }
  },
  initBgMusic() {
    const app = this;
    const enabled = wx.getStorageSync('bgMusicEnabled');
    const savedIndex = wx.getStorageSync('currentMusicIndex');
    if (savedIndex !== null) {
      app.globalData.currentMusicIndex = savedIndex;
    }
    if (enabled !== false) {
      app.globalData.bgMusicEnabled = true;
      app.playBgMusic();
    }
  },
  getMusicList() {
    return this.globalData.musicList || [];
  },
  getCurrentMusicIndex() {
    return this.globalData.currentMusicIndex || 0;
  }
})
