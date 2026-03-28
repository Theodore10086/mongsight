Component({
  properties: {
    text: {
      type: String,
      value: '一键授权'
    },
    icon: {
      type: String,
      value: ''
    },
    disabled: {
      type: Boolean,
      value: false
    },
    loading: {
      type: Boolean,
      value: false
    }
  },

  data: {
    // 内部状态
  },

  methods: {
    handleTap() {
      if (this.data.disabled || this.data.loading) {
        return;
      }
      this.triggerEvent('tap');
    },

    setLoading(loading) {
      this.setData({ loading });
    },

    setDisabled(disabled) {
      this.setData({ disabled });
    }
  }
});
