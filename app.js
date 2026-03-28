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

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })
  },
  globalData: {
    userInfo: null,
    bgMusicManager: null,
    bgMusicEnabled: true,
    currentMusicIndex: 0,
    musicList: [
      { name: '轻快', src: 'assets/audio/Kinetic_Bloom.mp3', epname: 'Kinetic Bloom' },
      { name: '悲壮', src: 'assets/audio/Echoes_of_the_Ancient_Star.mp3', epname: 'Echoes of the Ancient Star' }
    ]
  },
  playBgMusic(musicIndex) {
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
      
      app.globalData.bgMusicManager.title = music.name;
      app.globalData.bgMusicManager.epname = music.epname;
      app.globalData.bgMusicManager.src = music.src;
      app.globalData.bgMusicManager.loop = true;
      
      app.globalData.bgMusicManager.play();
      console.log('[BgMusic] Starting with src:', music.src);
    }
  },
  playGuideMusic() {
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
      
      app.globalData.bgMusicManager.title = guideMusic.name;
      app.globalData.bgMusicManager.epname = guideMusic.epname;
      app.globalData.bgMusicManager.src = guideMusic.src;
      app.globalData.bgMusicManager.loop = true;
      
      app.globalData.bgMusicManager.play();
      console.log('[GuideMusic] Starting with src:', guideMusic.src);
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
