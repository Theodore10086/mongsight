var FULL_QUIZ_LIBRARY = [
  { id: 1, type: '基础篇', question: '蒙古文书法书写"Өлзий түмэн（祖国）"时，标准的书写字序为？', options: ['从右到左横排', '从上到下竖排', '从左到右横排', '从下到上竖排'], answer: 1, explanation: '传统与规范蒙古文书法的标准字序为从上到下竖排，列序从左到右。' },
  { id: 2, type: '基础篇', question: '蒙语"холт（山）"在蒙古文书法竖排书写时，字母的连接方式为？', options: ['左右平连', '上下叠连', '内外环绕', '无固定连接'], answer: 1, explanation: '蒙古文为竖排书写体系，所有字母均采用上下叠连的连接方式。' },
  { id: 3, type: '基础篇', question: '蒙古文斜体字书写"сүнс холт（松山）"时，整体的书写斜度为？', options: ['30°左右', '45°左右', '60°左右', '无固定斜度'], answer: 1, explanation: '蒙古文斜体字的标准书写斜度为45°左右，兼顾书写流畅性与视觉美观性。' },
  { id: 4, type: '基础篇', question: '传统蒙古文竹笔书法书写"сүнс（松树）"时，竹笔的笔尖通常为？', options: ['单锋', '双锋', '三锋', '多锋'], answer: 1, explanation: '蒙古文竹笔为草原特色书写工具，标准笔尖为双锋，能精准表现圆转与方折笔画。' },
  { id: 5, type: '基础篇', question: '草原蒙古文书法中，传统书写工具的笔杆多采用哪种木材？', options: ['松木', '桦木', '杨木', '榆木'], answer: 1, explanation: '草原桦木质轻、纹理直、易打磨，适配蒙古文竖写的握持习惯。' },
  { id: 6, type: '基础篇', question: '为了体现"松树"苍劲坚韧的意象，书法墨色应采用？', options: ['淡墨', '浓墨', '宿墨', '焦墨淡染'], answer: 1, explanation: '浓墨色泽厚重、力透纸背，能精准表现松树苍劲坚韧的意象。' },
  { id: 7, type: '基础篇', question: '传统蒙古文硬笔书法中，硬笔的材质通常为？', options: ['竹制', '骨制', '铁制', '木制'], answer: 1, explanation: '蒙古文硬笔多为骨制，以兽骨为材，质地坚硬耐用，可实现精细书写。' },
  { id: 8, type: '基础篇', question: '在书写蒙古文竖排标题时，常见的点段分隔符为？', options: ['逗号', '单点', '双点', '双横线'], answer: 1, explanation: '蒙古文竖排标题常使用单点分隔（᠅），或使用双点（᠁）区分层级。' },
  { id: 9, type: '基础篇', question: '书法临摹笔迹时，蒙古文书写载体材质通常为？', options: ['棉布', '桑皮纸', '松木片', '羊皮'], answer: 1, explanation: '桑皮纸吸墨性好、质地细腻，是传统蒙古文书法的首选书写载体。' },
  { id: 10, type: '基础篇', question: '书写蒙古文书法作品时，在起笔前应该？', options: ['立即下笔', '心审字形结构及笔画顺序', '随意画几笔', '只关注墨色'], answer: 1, explanation: '蒙古文书法讲究"意在笔先"，起笔前需心审字形结构及笔画顺序。' },
  { id: 11, type: '进阶篇', question: '蒙古文楷体字"Mongγol（蒙古）"首字母M的笔画，主要包含？', options: ['竖折与右上弧', '横折与右下弧', '直竖与左弧', '点折与回弧'], answer: 1, explanation: 'M首母以竖折与右上弧为核心笔画，体现蒙古文竖向书写的基本形态。' },
  { id: 12, type: '进阶篇', question: '书写多音节词汇时，蒙古文连笔应如何布局字间距？', options: ['紧密连接', '均匀分布', '左密右疏', '上密下疏'], answer: 1, explanation: '蒙古文竖向书写时，字母间应均匀分布，保持上下一致的视觉节奏。' },
  { id: 13, type: '进阶篇', question: '蒙古文回纥字风格在书写"Ezen（主人、帝王）"时，竖折与弧笔的比例关系为？', options: ['1:1', '1:2', '2:1', '3:1'], answer: 1, explanation: '回纥体竖折与弧笔比例约1:2，竖折为基础骨架，弧笔为装饰主体。' },
  { id: 14, type: '进阶篇', question: '硬笔书法的"发力"与"轻掠"动作主要影响字形的？', options: ['墨色深浅', '笔画粗细变化', '字体大小', '书写速度'], answer: 1, explanation: '硬笔发力轻重直接决定笔画的粗细变化，形成书法层次感。' },
  { id: 15, type: '进阶篇', question: '蒙古文行书在书写长词时，字母之间的连笔方式多为？', options: ['直线连接', '弧线连接', '折线连接', '无线连接'], answer: 1, explanation: '蒙古文行书采用弧线连接实现流畅的竖向书写，保持整体字形连贯。' },
  { id: 16, type: '进阶篇', question: '传统书写中，"虎"字（huch）的收笔处通常处理为？', options: ['上提尖收', '回锋圆收', '横拖收笔', '点顿收笔'], answer: 1, explanation: '蒙古文收笔讲究回锋圆收，体现书法力度控制与字形完整性。' },
  { id: 17, type: '进阶篇', question: '蒙古文古典文献中，标题部分通常采用何种书写风格？', options: ['行书', '草书', '方块字', '巴思八字'], answer: 1, explanation: '古典蒙古文标题会使用巴思八字（蒙古文方正体）以增强标题的庄重感。' },
  { id: 18, type: '进阶篇', question: '蒙古文书法用笔中，副毫的主要作用是？', options: ['储墨', '增加笔锋弹性', '装饰笔杆', '调节笔重'], answer: 1, explanation: '副毫是主毫周围的辅助毫毛，用于增加储墨量并调节笔锋弹性。' },
  { id: 19, type: '进阶篇', question: '书写蒙文诗篇落款时，传统上采用几字落款格式？', options: ['一字名', '二字名', '三字名', '四字名'], answer: 1, explanation: '传统蒙古文诗篇落款采用四字名（作者 + 书法机构或敬语），增强仪式感。' },
  { id: 20, type: '进阶篇', question: '蒙古文行书的核心韵律被称为？', options: ['顿挫法', '行笔法', '连笔法', '提按法'], answer: 1, explanation: '蒙古文行书核心韵律为"提按法"，通过提笔轻掠与按笔重压交替形成节奏感。' },
  { id: 21, type: '高级篇', question: '回纥体蒙古文书写"Sain bainuu（你好）"时，S字母的弧线通常从何处起笔？', options: ['左上', '右下', '左下', '右上'], answer: 1, explanation: '回纥体S字母从左上起笔，向右下弧行后收于右下，形成优美的S形弧线。' },
  { id: 22, type: '高级篇', question: '蒙古文"虎（huch）"字在草书中的简化形式，核心保留的笔画为？', options: ['尾部折笔', '头部弧笔', '中间横笔', '右侧竖笔'], answer: 1, explanation: '草书蒙古文简化至头部弧笔与基础骨架，保留字形辨识度的核心笔画。' },
  { id: 23, type: '高级篇', question: '蒙古文书法中"牙"（牙形笔锋）的典型应用场景为？', options: ['字母中段', '字母连接处', '起笔与收笔', '横笔中间'], answer: 1, explanation: '"牙"形笔锋常用于蒙古文竖排字母的起笔与收笔，增强字形精神感。' },
  { id: 24, type: '高级篇', question: '蒙古文古典文本中出现的"回纥字尾"的典型特征为？', options: ['圆点', '长拖尾', '方折', '弧线折'], answer: 1, explanation: '回纥字尾以长拖尾为典型特征，尾笔延伸形成纵向装饰线，极具辨识度。' },
  { id: 25, type: '高级篇', question: '传统蒙古文竹笔在书写大字时，笔杆的握持位置应？', options: ['笔尖处', '笔杆中部', '笔杆末端', '任意位置'], answer: 1, explanation: '书写大字时握持笔杆末端可增加笔锋活动半径，易于控制大字笔画的舒展。' },
  { id: 26, type: '高级篇', question: '新疆蒙古文托忒文书法中，字母"o"与"u"的区别主要通过？', options: ['附加符号', '圆点位置', '弧线方向', '横笔长度'], answer: 1, explanation: '托忒文通过附加符号（如圆点、钩、横线等）区分传统蒙文中易混淆的字母。' },
  { id: 27, type: '高级篇', question: '在写蒙古文书法时，若出现墨迹洇纸，最可能的原因是？', options: ['用墨太淡', '纸张太厚', '墨汁太多或纸张不吸墨', '笔锋太硬'], answer: 1, explanation: '墨汁过多或纸张质地不吸墨都会导致洇墨，影响字形完整与美观。' },
  { id: 28, type: '高级篇', question: '蒙古文古典印谱中，最常用的印泥颜色为？', options: ['红色', '黑色', '金色', '蓝色'], answer: 1, explanation: '红色为蒙古文古典印谱中最常用的印泥颜色，象征庄重与权威。' }
];

Page({
  data: {
    quizQuestions: [],
    currentIndex: 0,
    currentQuestion: null,
    correctCount: 0,
    userAnswers: [],
    showResult: false,
    showModal: false,
    userProfile: {}
  },

  onLoad() {
    var profile = wx.getStorageSync('userProfile') || wx.getStorageSync('userInfo') || {};
    this.setData({ userProfile: profile });
    this.startChallenge();
  },

  startChallenge() {
    var shuffled = FULL_QUIZ_LIBRARY.slice().sort(function () { return Math.random() - 0.5; });
    var selected = shuffled.slice(0, 5);
    this.setData({
      showModal: true,
      quizQuestions: selected,
      currentIndex: 0,
      correctCount: 0,
      userAnswers: [],
      showResult: false
    });
    this.showQuestion(0);
  },

  showQuestion(index) {
    if (index >= this.data.quizQuestions.length) return;
    this.setData({
      currentIndex: index,
      currentQuestion: this.data.quizQuestions[index]
    });
  },

  onSelectOption(e) {
    var selectedIdx = parseInt(e.currentTarget.dataset.index);
    var q = this.data.currentQuestion;
    var isCorrect = selectedIdx === q.answer;
    wx.vibrateShort({ type: 'light' });

    var newAnswers = this.data.userAnswers.concat([{
      questionId: q.id,
      selectedIndex: selectedIdx,
      isCorrect: isCorrect
    }]);
    var newCorrectCount = isCorrect ? this.data.correctCount + 1 : this.data.correctCount;

    wx.showToast({
      title: isCorrect ? '回答正确！' : '回答错误',
      icon: isCorrect ? 'success' : 'error',
      duration: 500
    });

    this.setData({ userAnswers: newAnswers, correctCount: newCorrectCount });

    var self = this;
    setTimeout(function () {
      var nextIdx = self.data.currentIndex + 1;
      if (nextIdx < self.data.quizQuestions.length) {
        self.showQuestion(nextIdx);
      } else {
        self.setData({ showResult: true });
      }
    }, 800);
  },

  onCloseModal() {
    this.setData({ showModal: false, showResult: false });
  },

  onClaimReward() {
    var reward = this.data.correctCount * 5;
    var profile = this.data.userProfile || {};
    profile.inkJades = (profile.inkJades || 0) + reward;
    wx.setStorageSync('userProfile', profile);
    wx.setStorageSync('userInfo', profile);
    this.setData({ userProfile: profile, showResult: false, showModal: false });
    wx.showToast({ title: '获得 +' + reward + ' 墨玉', icon: 'none', duration: 1500 });
  },

  onRestart() {
    this.setData({ showResult: false });
    this.startChallenge();
  }
});
