const { getReviewSummary, syncTodayReviewCount } = require('../../utils/review-manager.js');
const { LEARNABLE_WORDS } = require('../../utils/recognition-catalog.js');
const {
  getStudentSession,
  getTeacherSession,
  getLastClassRole
} = require('../../utils/classStudentAuth.js');

const TEACHER_DASHBOARD = '/pages/class/teacher/dashboard/dashboard';
const STUDENT_DASHBOARD = '/pages/class/student/dashboard/dashboard';
const CLASS_LOGIN = '/pages/class/login/login';

const FLOW_STEPS = ['识读', '释义', '讲解', '练写', '评测', '复习'];
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function buildGreeting(hour) {
  if (hour < 5) return '夜深了';
  if (hour < 9) return '早安';
  if (hour < 12) return '上午好';
  if (hour < 14) return '午安';
  if (hour < 18) return '下午好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

Page({
  data: {
    todayReviewWords: 0,
    recognitionTotal: LEARNABLE_WORDS.length,
    writingProgress: { completed: 0, total: 12 },
    totalXp: 0,
    streakDays: 0,
    flowSteps: FLOW_STEPS,
    flowLine: FLOW_STEPS.join('  ·  '),
    greeting: '你好',
    nickname: '墨客',
    todayLabel: '',
    quickActions: []
  },

  onLoad() {
    this.refreshOverview();
  },

  onShow() {
    this.refreshOverview();
  },

  onPullDownRefresh() {
    this.refreshOverview();
    wx.stopPullDownRefresh();
  },

  refreshOverview() {
    const profile = wx.getStorageSync('userProfile') || wx.getStorageSync('userInfo') || {};

    syncTodayReviewCount();
    const reviewSummary = getReviewSummary();

    const writingCompleted = this.readNumber('writingCompleted', 0);
    const writingTotal = this.readNumber('writingTotal', 12);
    const todayReviewWords = this.readNumber('todayReviewWords', reviewSummary.dueCount);
    const recognitionTotal = reviewSummary.total || LEARNABLE_WORDS.length;
    const totalXp = this.readNumber('totalXp', Math.max(Number(profile.xp || 0), 0));
    const streakDays = Number(profile.streak || 0);
    const classQuickDesc = this.getClassQuickDesc();

    const now = new Date();
    const greeting = buildGreeting(now.getHours());
    const todayLabel = `${now.getMonth() + 1}月${now.getDate()}日 · ${WEEKDAYS[now.getDay()]}`;
    const nickname = profile.nickName || profile.nickname || '墨客';

    this.setData({
      greeting,
      nickname,
      todayLabel,
      todayReviewWords,
      recognitionTotal,
      totalXp,
      streakDays,
      writingProgress: {
        completed: writingCompleted,
        total: writingTotal
      },
      quickActions: this.buildQuickActions({
        todayReviewWords,
        recognitionTotal,
        classQuickDesc,
        writingCompleted,
        writingTotal,
        streakDays
      })
    });
  },

  readNumber(key, fallback) {
    const raw = Number(wx.getStorageSync(key));
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
  },

  buildQuickActions({
    todayReviewWords,
    recognitionTotal,
    classQuickDesc,
    writingCompleted,
    writingTotal,
    streakDays
  }) {
    return [
      {
        key: 'writing',
        icon: 'pencil',
        title: '书写练习',
        desc: `${writingCompleted}/${writingTotal} 已练`
      },
      {
        key: 'review',
        icon: 'bookmark',
        title: '复习词库',
        desc: `${todayReviewWords} 个待复习`
      },
      {
        key: 'class',
        icon: 'graduation',
        title: '我的班级',
        desc: classQuickDesc
      },
      {
        key: 'stats',
        icon: 'star',
        title: '学习数据',
        desc: `${recognitionTotal} 个词条`
      },
      {
        key: 'ai',
        icon: 'sparkle',
        title: '蒙宝 AI',
        desc: '讲解与陪练'
      },
      {
        key: 'challenge',
        icon: 'flag',
        title: '每日试炼',
        desc: `连续 ${streakDays} 天`
      }
    ];
  },

  onGoToRecognition() {
    wx.navigateTo({ url: '/pages/word-recognition/word-recognition' });
  },

  onGoToWriting() {
    wx.navigateTo({ url: '/pages/writing-practice/writing-practice' });
  },

  onGoToReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  },

  getClassQuickDesc() {
    const student = getStudentSession();
    const teacher = getTeacherSession();
    const lastRole = getLastClassRole();

    if (lastRole === 'teacher' && teacher) {
      return '继续进入教师端';
    }
    if (lastRole === 'student' && student) {
      return '继续进入学生端';
    }
    if (student) {
      return '继续进入学生端';
    }
    if (teacher) {
      return '继续进入教师端';
    }
    return '教师 / 学生入口';
  },

  onGoToClass() {
    const student = getStudentSession();
    const teacher = getTeacherSession();
    const lastRole = getLastClassRole();

    if (lastRole === 'teacher' && teacher) {
      wx.navigateTo({ url: TEACHER_DASHBOARD });
      return;
    }
    if (lastRole === 'student' && student) {
      wx.navigateTo({ url: STUDENT_DASHBOARD });
      return;
    }
    if (student) {
      wx.navigateTo({ url: STUDENT_DASHBOARD });
      return;
    }
    if (teacher) {
      wx.navigateTo({ url: TEACHER_DASHBOARD });
      return;
    }

    wx.navigateTo({ url: CLASS_LOGIN });
  },

  onGoToMengbao() {
    wx.navigateTo({ url: '/pages/mengbao-chat/mengbao-chat' });
  },

  onGoToChallenge() {
    wx.navigateTo({ url: '/pages/daily-challenge/daily-challenge' });
  },

  onTapQuickAction(e) {
    const { key } = e.currentTarget.dataset;
    if (key === 'writing') {
      this.onGoToWriting();
      return;
    }
    if (key === 'review') {
      this.onGoToReview();
      return;
    }
    if (key === 'class') {
      this.onGoToClass();
      return;
    }
    if (key === 'stats') {
      wx.navigateTo({ url: '/pages/learning-stats/learning-stats' });
      return;
    }
    if (key === 'ai') {
      this.onGoToMengbao();
      return;
    }
    if (key === 'challenge') {
      this.onGoToChallenge();
      return;
    }
    wx.showToast({ title: '即将上线', icon: 'none' });
  }
});
