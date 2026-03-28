const IdentityStates = {
  UNAUTH: 'UNAUTH',
  AUTH_SUCCESS: 'AUTH_SUCCESS',
  VIDEO_INTRO: 'VIDEO_INTRO',
  WRITING_TEST: 'WRITING_TEST'
};

const IdentityConfig = {
  VIDEO_SRC: '/assets/video/intro_8s.mp4',
  VIDEO_DURATION: 8000,
  STORAGE_KEY: 'user_identity',
  WELCOME_MESSAGE: '赛奴！在这羊皮纸上，刻下你的第一笔。'
};

class UserIdentity {
  constructor(options = {}) {
    this.currentState = IdentityStates.UNAUTH;
    this.page = options.page || null;
    this.onStateChange = options.onStateChange || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.userInfo = null;
    this.videoContext = null;
    this._isInitializing = false;
  }

  init(pageContext) {
    this.page = pageContext;
    this._loadCachedUserInfo();
    console.log('[UserIdentity] Initialized, current state:', this.currentState);
    return this.currentState;
  }

  _loadCachedUserInfo() {
    try {
      const cached = wx.getStorageSync(IdentityConfig.STORAGE_KEY);
      if (cached) {
        this.userInfo = cached;
        this.currentState = IdentityStates.AUTH_SUCCESS;
        console.log('[UserIdentity] Loaded cached user info');
      }
    } catch (e) {
      console.warn('[UserIdentity] Cache read failed:', e);
    }
  }

  _saveUserInfo() {
    try {
      wx.setStorageSync(IdentityConfig.STORAGE_KEY, this.userInfo);
      console.log('[UserIdentity] User info cached');
    } catch (e) {
      console.warn('[UserIdentity] Cache save failed:', e);
    }
  }

  getCurrentState() {
    return this.currentState;
  }

  isAuthenticated() {
    return this.currentState === IdentityStates.AUTH_SUCCESS || 
           this.currentState === IdentityStates.VIDEO_INTRO ||
           this.currentState === IdentityStates.WRITING_TEST;
  }

  async authorize() {
    if (this.currentState !== IdentityStates.UNAUTH) {
      console.log('[UserIdentity] Already authorized, skipping...');
      return this._proceedToNextState();
    }

    try {
      const userProfile = await this._getUserProfile();
      this.userInfo = userProfile;
      this._saveUserInfo();
      await this._transitionTo(IdentityStates.AUTH_SUCCESS);
      
      return this._proceedToNextState();
    } catch (error) {
      console.error('[UserIdentity] Authorization failed:', error);
      throw error;
    }
  }

  _getUserProfile() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于创建你的书法档案',
        success: (res) => {
          console.log('[UserIdentity] WeChat auth success');
          
          wx.login({
            success: (loginRes) => {
              const userData = {
                ...res.userInfo,
                code: loginRes.code,
                authTime: Date.now()
              };
              resolve(userData);
            },
            fail: (loginError) => {
              console.warn('[UserIdentity] Login failed, using basic info');
              resolve({
                ...res.userInfo,
                authTime: Date.now()
              });
            }
          });
        },
        fail: (authError) => {
          console.warn('[UserIdentity] User rejected auth:', authError);
          reject(new Error('User denied authorization'));
        }
      });
    });
  }

  async _proceedToNextState() {
    switch (this.currentState) {
      case IdentityStates.AUTH_SUCCESS:
        await this._transitionTo(IdentityStates.WRITING_TEST);
        break;
      case IdentityStates.VIDEO_INTRO:
        await this._transitionTo(IdentityStates.WRITING_TEST);
        break;
      default:
        break;
    }
    return this.currentState;
  }

  async _transitionTo(targetState) {
    console.log(`[UserIdentity] Transition: ${this.currentState} -> ${targetState}`);
    
    const prevState = this.currentState;
    this.currentState = targetState;
    
    this.onStateChange(targetState, {
      prevState,
      userInfo: this.userInfo
    });

    if (targetState === IdentityStates.WRITING_TEST) {
      setTimeout(() => {
        this.onComplete({
          userInfo: this.userInfo,
          fromState: prevState
        });
      }, 500);
    }

    return this.currentState;
  }

  createVideoContext(videoId) {
    if (!this.page) {
      console.warn('[UserIdentity] Page context not set');
      return null;
    }
    this.videoContext = this.page.createVideoContext(videoId);
    return this.videoContext;
  }

  async playIntroVideo(videoId = 'intro-video') {
    if (this.currentState !== IdentityStates.VIDEO_INTRO) {
      console.warn('[UserIdentity] Not in VIDEO_INTRO state');
      return;
    }

    try {
      await this._transitionTo(IdentityStates.VIDEO_INTRO);
      
      if (this.videoContext) {
        this.videoContext.play();
      } else {
        const ctx = this.page.createVideoContext(videoId);
        ctx.play();
      }
      
      console.log('[UserIdentity] Video started playing');
    } catch (error) {
      console.error('[UserIdentity] Video play failed:', error);
    }
  }

  handleVideoEnded() {
    if (this.currentState !== IdentityStates.VIDEO_INTRO) {
      return;
    }

    console.log('[UserIdentity] Video ended, transitioning to WRITING_TEST');
    this._proceedToNextState();
  }

  getWelcomeMessage() {
    return IdentityConfig.WELCOME_MESSAGE;
  }

  getUserInfo() {
    return this.userInfo;
  }

  logout() {
    try {
      wx.removeStorageSync(IdentityConfig.STORAGE_KEY);
    } catch (e) {
      console.warn('[UserIdentity] Logout cleanup failed:', e);
    }
    
    this.userInfo = null;
    this.currentState = IdentityStates.UNAUTH;
    console.log('[UserIdentity] User logged out');
  }

  reset() {
    this.logout();
    this.currentState = IdentityStates.UNAUTH;
  }
}

module.exports = {
  IdentityStates,
  IdentityConfig,
  UserIdentity
};
