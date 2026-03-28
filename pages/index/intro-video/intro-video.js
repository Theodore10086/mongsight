Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    src: {
      type: String,
      value: 'cloud://cloud1-6g6qzrswbfeff910.636c-cloud1-6g6qzrswbfeff910-1404694297/video_20260214_121126.mp4'
    },
    autoplay: {
      type: Boolean,
      value: true
    },
    loop: {
      type: Boolean,
      value: false
    },
    muted: {
      type: Boolean,
      value: false
    },
    showPlayBtn: {
      type: Boolean,
      value: false
    },
    showControls: {
      type: Boolean,
      value: false
    },
    showSkip: {
      type: Boolean,
      value: true
    },
    showMuteToggle: {
      type: Boolean,
      value: false
    },
    objectFit: {
      type: String,
      value: 'cover'
    },
    duration: {
      type: Number,
      value: 8
    }
  },

  data: {
    remainingTime: 8,
    timer: null,
    hasError: false,
    currentSrc: '',
    isLoading: false
  },

  lifetimes: {
    attached() {
      console.log('[IntroVideo] attached, src:', this.properties.src);
      this.videoContext = wx.createVideoContext('intro-video', this);
      
      // 初始化时检查是否需要换取临时链接
      if (this.properties.src.startsWith('cloud://')) {
        this._convertCloudToTempURL();
      } else {
        this.setData({ 
          currentSrc: this.properties.src,
          isLoading: false 
        });
      }
    },

    detached() {
      this._clearTimer();
    }
  },

  observers: {
    'visible': function(visible) {
      console.log('[IntroVideo] visible changed:', visible);
      if (visible) {
        this.setData({ 
          hasError: false,
          isLoading: true 
        });
        
        // 延迟播放，确保链接已准备好
        setTimeout(() => {
          if (this.videoContext && this.data.currentSrc) {
            console.log('[IntroVideo] Delayed play after visible');
            this.videoContext.play();
          }
        }, 500);
      } else {
        this._clearTimer();
        this._stopVideo();
      }
    },
    'src': function(src) {
      console.log('[IntroVideo] src changed:', src);
      if (!this.data.hasError) {
        if (src.startsWith('cloud://')) {
          this._convertCloudToTempURL();
        } else {
          this.setData({ 
            currentSrc: src,
            isLoading: false 
          });
        }
      }
    }
  },

  methods: {
    // 将 Cloud ID 转换为临时 HTTPS 链接
    _convertCloudToTempURL() {
      if (!this.properties.src.startsWith('cloud://')) {
        return;
      }
      
      console.log('[IntroVideo] Converting Cloud ID to temp URL:', this.properties.src);
      this.setData({ isLoading: true });
      
      wx.cloud.getTempFileURL({
        fileList: [this.properties.src]
      }).then(res => {
        if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          const tempURL = res.fileList[0].tempFileURL;
          console.log('[IntroVideo] Cloud ID converted to temp URL:', tempURL);
          
          this.setData({ 
            currentSrc: tempURL,
            isLoading: false 
          });
          
          // 强制重载视频源
          this._reloadVideoSource();
          
        } else {
          throw new Error('Failed to get temp file URL');
        }
      }).catch(err => {
        console.error('[IntroVideo] Cloud ID conversion failed:', err);
        this.setData({ 
          hasError: true,
          isLoading: false 
        });
        this.triggerEvent('error', { errMsg: 'CLOUD_CONVERSION_FAILED' });
      });
    },
    
    // 强制重载视频源
    _reloadVideoSource() {
      if (this.videoContext) {
        // 先停止当前播放
        this.videoContext.pause();
        
        // 延迟播放，确保视频源已更新
        setTimeout(() => {
          if (this.videoContext && this.data.currentSrc) {
            console.log('[IntroVideo] Reloading video source');
            this.videoContext.play();
          }
        }, 300);
      }
    },

    _startTimer() {
      let remaining = this.data.duration;
      this.setData({ remainingTime: remaining });

      this.data.timer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          this._clearTimer();
        } else {
          this.setData({ remainingTime: remaining });
        }
      }, 1000);
    },

    _clearTimer() {
      if (this.data.timer) {
        clearInterval(this.data.timer);
        this.data.timer = null;
      }
    },

    _stopVideo() {
      try {
        if (this.videoContext) {
          this.videoContext.pause();
        }
      } catch (e) {
        console.warn('[IntroVideo] Pause failed:', e);
      }
    },

    handleSkip() {
      console.log('[IntroVideo] User skipped video');
      this._clearTimer();
      this.triggerEvent('skip');
    },

    toggleMute() {
      const muted = !this.data.muted;
      this.setData({ muted });
      this.triggerEvent('mutedchange', { muted });
    },

    onPlay(e) {
      console.log('[IntroVideo] bindplay triggered, video is playing');
      this._startTimer();
      this.triggerEvent('play', e.detail);
    },

    onPause(e) {
      console.log('[IntroVideo] bindpause triggered, video paused');
      this.triggerEvent('pause', e.detail);
    },

    onEnded(e) {
      console.log('[IntroVideo] bindended triggered, video finished');
      this._clearTimer();
      this.triggerEvent('ended', e.detail);
    },

    onError(e) {
      console.error('[IntroVideo] binderror triggered, error:', e.detail);
      console.error('[IntroVideo] errMsg:', e.detail.errMsg);
      
      this.setData({ hasError: true });
      this.triggerEvent('error', e.detail);
    },

    onWaiting(e) {
      console.log('[IntroVideo] bindwaiting triggered, waiting for data');
      this.triggerEvent('waiting', e.detail);
    },

    onProgress(e) {
      console.log('[IntroVideo] bindprogress triggered:', e.detail);
      this.triggerEvent('progress', e.detail);
    },

    play() {
      console.log('[IntroVideo] play() called');
      
      // 如果当前是 Cloud ID，先转换为临时链接
      if (this.data.currentSrc.startsWith('cloud://')) {
        this._convertCloudToTempURL();
        return;
      }
      
      if (this.videoContext) {
        console.log('[IntroVideo] Playing video with src:', this.data.currentSrc);
        this.videoContext.play();
      } else {
        console.warn('[IntroVideo] videoContext is null');
      }
    },

    pause() {
      if (this.videoContext) {
        this.videoContext.pause();
      }
    }
  }
});
