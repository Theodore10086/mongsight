const app = getApp();

Page({
  data: {
    messages: [],
    inputText: '',
    isLoading: false,
    scrollToId: ''
  },

  onLoad() {
    this.setData({
      messages: [{
        id: 'welcome',
        role: 'ai',
        content: '赛努！我是蒙宝 AI，草原上的书法小助手。你可以问我蒙古文书法的问题，也可以让我陪你练字、讲解词条。试试说 "教我写松树" 或 "什么是蒙古文竖排"?',
        time: this.formatTime(new Date())
      }]
    });
  },

  onShow() {
    this.scrollToBottom();
  },

  onInputText(e) {
    this.setData({ inputText: e.detail.value });
  },

  onSend() {
    var text = (this.data.inputText || '').trim();
    if (!text || this.data.isLoading) return;

    var now = new Date();
    var userMsg = { id: 'u' + Date.now(), role: 'user', content: text, time: this.formatTime(now) };
    var messages = this.data.messages.concat([userMsg]);
    this.setData({ messages: messages, inputText: '', isLoading: true });
    this.scrollToBottom();

    var self = this;
    wx.cloud.callFunction({
      name: 'community',
      data: { action: 'mengbaoChat', message: text }
    }).then(function (res) {
      var result = (res && res.result) || {};
      var reply = result.success && result.data && result.data.reply
        ? result.data.reply
        : '蒙宝正在草原上练习写字，信号不太好，稍等一会儿再来找我吧～';
      var aiMsg = { id: 'a' + Date.now(), role: 'ai', content: reply, time: self.formatTime(new Date()) };
      self.setData({ messages: self.data.messages.concat([aiMsg]), isLoading: false });
      self.scrollToBottom();
    }).catch(function () {
      var fallback = '蒙宝正在草原上练习写字，信号不太好，稍等一会儿再来找我吧～';
      var aiMsg = { id: 'a' + Date.now(), role: 'ai', content: fallback, time: self.formatTime(new Date()) };
      self.setData({ messages: self.data.messages.concat([aiMsg]), isLoading: false });
      self.scrollToBottom();
    });
  },

  scrollToBottom() {
    var msgs = this.data.messages;
    if (msgs.length > 0) {
      this.setData({ scrollToId: 'msg-' + msgs[msgs.length - 1].id });
    }
  },

  formatTime(date) {
    var h = date.getHours();
    var m = date.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
  }
});
