Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    name: {
      type: String,
      value: '蒙宝'
    },
    message: {
      type: String,
      value: ''
    },
    avatar: {
      type: String,
      value: '/assets/images/mengbao.jpg'
    },
    showAction: {
      type: Boolean,
      value: false
    },
    actionText: {
      type: String,
      value: '知道了'
    }
  },

  data: {
    // 内部数据
  },

  lifetimes: {
    attached() {
      // 组件创建时
    }
  },

  methods: {
    show(message) {
      if (message) {
        this.setData({ message });
      }
      this.setData({ visible: true });
    },

    hide() {
      this.setData({ visible: false });
    },

    onActionTap() {
      this.triggerEvent('actiontap');
    }
  }
});
