Component({
  properties: {
    currentTab: {
      type: Number,
      value: 0
    }
  },

  data: {
    tabs: [
      { id: 0, name: '首页', icon: '🏠', activeIcon: '🏠' },
      { id: 1, name: '班级', icon: '👥', activeIcon: '👥' },
      { id: 2, name: '社区', icon: '💬', activeIcon: '💬' },
      { id: 3, name: '我', icon: '👤', activeIcon: '👤' }
    ]
  },

  methods: {
    onTabTap(e) {
      const index = e.currentTarget.dataset.index
      if (index === this.data.currentTab) return
      this.triggerEvent('tabchange', { index })
    }
  }
})
