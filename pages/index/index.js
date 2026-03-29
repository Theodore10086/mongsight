const { getWordByKey } = require('../../utils/recognition-catalog.js')
const {
  normalizeTrajectoryPayload,
  getPendingRecognitionPlayback,
  clearPendingRecognitionPlayback
} = require('../../utils/trajectory-utils.js')
const {
  SCRIPT_TYPE_LABELS,
  ROLE_LABELS,
  buildResearchExportPayload,
  summarizeStrokes
} = require('../../utils/collection-payload.js')

const calligraphyMap = { 
   // 1. 组员名字专项（确保精准） 
   '洋': '洋', '沥': '瀝', '湘': '湘', '源': '源', '魏': '魏', 
   '语': '語', '莘': '莘', '祁': '祁', '骞': '騫', '彧': '彧', 

   // 2. 书法常用动词/职衔 
   '书': '書', '印': '印', '制': '製', '笔': '筆', '墨': '墨', 
   '画': '畫', '写': '寫', '题': '題', '志': '誌', '撰': '撰', 
   '师': '師', '生': '生', '徒': '徒', '友': '友', '斋': '齋', 

   // 3. 时间与天干地支（落款灵魂） 
   '年': '年', '岁': '歲', '月': '月', '时': '時', '节': '節', 
   '春': '春', '夏': '夏', '秋': '秋', '冬': '冬', 
   '东': '東', '南': '南', '西': '西', '北': '北', 
   '龙': '龍', '马': '馬', '凤': '鳳', '虎': '虎', 

   // 4. 蒙格项目核心词 
   '蒙': '蒙', '格': '格', '穿': '穿', '梭': '梭', '苏': '蘇', 
   '学': '學', '传': '傳', '承': '承', '艺': '藝', '术': '術', 
   '国': '國', '华': '華', '万': '萬', '礼': '禮', '宝': '寶' 
 }; 

 // 初始化云开发
 let cloudDB = null;
 let cloudInitTryCount = 0;
 const MAX_CLOUD_INIT_TRIES = 3;

 function initCloud() {
   if (wx.cloud) {
     try {
       wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV,
         traceUser: true,
       });
       cloudDB = wx.cloud.database();
       console.log('云开发初始化成功');
       return true;
     } catch (e) {
       console.error('云开发初始化失败:', e);
       cloudInitTryCount++;
       if (cloudInitTryCount < MAX_CLOUD_INIT_TRIES) {
         setTimeout(initCloud, 500);
       }
       return false;
     }
   }
   return false;
 }

 function getDB() {
   if (!cloudDB) {
     initCloud();
   }
   return cloudDB;
 } 
 
 /** 
  * 智能书法繁体化转换 
  * 逻辑：优先匹配字典，匹配不到则保留原字（如“安娜”等字在书法中简繁同体） 
  */ 
 function convertToTraditional(str) { 
   if (!str) return ''; 
   return str.split('').map(char => calligraphyMap[char] || char).join(''); 
 }

 const LESSON_DATA = {
   narasu: {
     id: 'narasu',
     legacyKey: 'songshu',
     chinese: '鏉炬爲',
     transliteration: 'narasu',
     mongolian: 'ᠨᠠᠱᠤ',
     title: '松树 (narasu)',
     audioSrc: '/assets/audio/narasu.m4a',
     bgImage: '/assets/images/songshu.jpg',
     framePrefix: 'frame_songshu_',
     tips: '起笔逆锋，转折处提笔换锋，收笔回锋。',
     guides: [
       { id: 1, x: 30, y: 20, type: 'start', text: '1' },
       { id: 2, x: 50, y: 40, type: 'arrow', rotate: 45 },
       { id: 3, x: 40, y: 80, type: 'stop', text: '2' }
     ]
   },
   hair: {
     id: 'hair',
     chinese: '鐖?',
     transliteration: 'hair',
     mongolian: 'ᠬᠠᠢᠷ',
     title: '爱 (hair)',
     audioSrc: '/assets/audio/hair.m4a',
     bgImage: '/assets/images/hair.jpg',
     framePrefix: 'frame_hair_',
     tips: '运笔如行云流水，笔画圆润流畅。',
     guides: [
       { id: 1, x: 35, y: 25, type: 'start', text: '1' },
       { id: 2, x: 55, y: 45, type: 'arrow', rotate: 30 },
       { id: 3, x: 45, y: 75, type: 'stop', text: '2' }
     ]
   },
  huch: {
    id: 'huch',
    chinese: '鍔涢噺',
    transliteration: 'huch',
    mongolian: 'ᠬᠦᠴᠦ',
    title: '力量 (huch)',
    audioSrc: '/assets/audio/huch.m4a',
    bgImage: '/assets/images/huch.jpg',
    framePrefix: 'frame_huch_',
    tips: '笔力遒劲，起落分明，重按轻提。',
    guides: [
      { id: 1, x: 40, y: 20, type: 'start', text: '1' },
      { id: 2, x: 60, y: 40, type: 'arrow', rotate: 60 },
      { id: 3, x: 50, y: 80, type: 'stop', text: '2' }
    ]
  },
  collectionLab: {
    id: 'collectionLab',
    chinese: '采集字帖',
    transliteration: 'collection',
    mongolian: '',
    title: '采集字帖',
    audioSrc: '',
    bgImage: '',
    framePrefix: 'frame_collection_',
    tips: '用于轨迹采集与回放复核，可自由书写并提交研究样本。',
    guides: []
  }
};

const LESSON_LIST = Object.values(LESSON_DATA);
LESSON_DATA.songshu = LESSON_DATA.narasu;

Page({
  data: {
    ctx: null,
    canvas: null,
    dpr: 1,
    currentTab: 0,
    
    // TabBar 配置
    tabs: [
      { id: 0, name: '首页' },
      { id: 1, name: '商城' },
      { id: 2, name: '社区' },
      { id: 3, name: '我' }
    ],
    
    // 商城数据
    mallCategoryActive: 0,
    mallCategories: [
      { id: 0, name: '全部' },
      { id: 1, name: '墨宝' },
      { id: 2, name: '纸张' },
      { id: 3, name: '笔具' },
      { id: 4, name: '周边' },
      { id: 5, name: '课程' }
    ],
    mallProducts: [
      { id: 1, category: 1, name: '草原特级墨块', price: 99, image: '', tag: '热销', desc: '采用内蒙古天然松烟墨料，经过传统工艺精制而成，墨色浓黑，质地细腻，适合书法创作与描红练习。' },
      { id: 2, category: 2, name: '手工宣纸', price: 49, image: '', tag: '新品', desc: '安徽泾县传统手工宣纸，纸质柔软，吸墨性好，不易渗化，是蒙古文书法的最佳选择。' },
      { id: 3, category: 3, name: '狼毫毛笔', price: 159, image: '', tag: '推荐', desc: '精选东北黄狼尾毛，笔锋锐利，弹性适中，适合书写蒙古文各种笔画。' },
      { id: 4, category: 1, name: '书画墨汁', price: 39, image: '', tag: '优惠', desc: '可以直接使用的墨汁，无需研磨，方便快捷。墨色均匀，不堵笔。' },
      { id: 5, category: 2, name: '竹纤维纸', price: 69, image: '', tag: '', desc: '新型环保纸张，纹理清晰，质感柔和，适合日常练习使用。' },
      { id: 6, category: 3, name: '兼毫毛笔', price: 89, image: '', tag: '', desc: '狼毫与羊毫混合制笔，软硬适中，初学者首选。' },
      { id: 7, category: 4, name: '红木镇纸', price: 129, image: '', tag: '精品', desc: '采用非洲红木制作，重量适中，摆放平稳，兼具实用与收藏价值。' },
      { id: 8, category: 4, name: '青花墨碟', price: 49, image: '', tag: '', desc: '景德镇青花瓷墨碟，造型精美，容量适中，是文房必备之选。' },
      { id: 9, category: 4, name: '书法毛毡', price: 59, image: '', tag: '', desc: '优质羊毛毡，吸水防渗，保护桌面，让书写更加得心应手。' },
      { id: 10, category: 5, name: '蒙古文入门课程', price: 199, image: '', tag: '课程', desc: '从基础笔画到完整作品，系统学习蒙古文书法的在线课程，永久有效。' },
      { id: 11, category: 5, name: '书法大师班', price: 499, image: '', tag: '课程', desc: '由著名蒙古文书法人士授课，一对一指导，提升书法水平。' },
      { id: 12, category: 1, name: '朱砂印泥', price: 79, image: '', tag: '', desc: '传统朱砂印泥，色泽鲜艳，经久不褪，是印章的绝佳搭配。' },
      { id: 13, category: 1, name: '松烟墨条', price: 168, image: '', tag: '高端', desc: '古法松烟墨条，质地细腻，墨色沉稳，适合创作高质量书法作品。' },
      { id: 14, category: 2, name: '蜡染宣纸', price: 89, image: '', tag: '', desc: '传统蜡染工艺，纸张纹理独特，防水防潮，装饰效果极佳。' },
      { id: 15, category: 3, name: '羊毫毛笔', price: 129, image: '', tag: '', desc: '纯羊毛制作，笔触柔软，蓄墨量大，适合书写流畅的蒙古文。' },
      { id: 16, category: 4, name: '黄铜笔搁', price: 79, image: '', tag: '', desc: '黄铜材质，造型优雅，耐用不变形，是笔搁的上佳之选。' },
      { id: 17, category: 4, name: '紫砂墨罐', price: 199, image: '', tag: '精品', desc: '宜兴紫砂墨罐，透气性好，保持墨汁新鲜不干涸。' },
      { id: 18, category: 5, name: '蒙古文进阶课程', price: 299, image: '', tag: '课程', desc: '进阶蒙古文书法的系统课程，包含多种字体风格学习。' },
      { id: 19, category: 1, name: '彩色墨汁套装', price: 59, image: '', tag: '', desc: '多种颜色可选，满足不同创作需求，色彩鲜艳持久。' },
      { id: 20, category: 3, name: '竹笔套装', price: 99, image: '', tag: '', desc: '传统蒙古文竹笔套装，包含不同规格，传承草原文化。' },
      { id: 21, category: 2, name: '水写布', price: 29, image: '', tag: '', desc: '可反复使用的水写布，环保经济，适合初学者练习基本笔画。' },
      { id: 22, category: 4, name: '字帖临摹垫', price: 39, image: '', tag: '', desc: '硅胶防滑垫，保护字帖不移位，书写更稳定舒适。' },
      { id: 23, category: 5, name: '蒙古文硬笔课程', price: 99, image: '', tag: '课程', desc: '学习蒙古文硬笔书法，掌握标准书写技巧。' },
      { id: 24, category: 4, name: '便携墨盒', price: 49, image: '', tag: '', desc: '外出写书法必备，小巧便携，墨量可视化。' }
    ],
    filteredProducts: [],
    
    // 商品详情弹窗
    showProductModal: false,
    currentProduct: {},
    
    // 社区数据
    communityPosts: [
      { id: 1, avatar: '🐑', nickname: '墨客小马', content: '今天练习蒙古文书法，收获满满！蒙古文的书写真是太美了，每一笔都蕴含着草原的辽阔。', images: [], likes: 12, comments: 3, liked: false, commentsList: [{id: 101, avatar: '🏺', nickname: '草原之风', content: '加油！'}] },
      { id: 2, avatar: '🏺', nickname: '草原之风', content: '分享我的新作品，请大家指教。已经练习了三个月，感觉有明显进步！', images: [], likes: 24, comments: 8, liked: false, commentsList: [{id: 201, avatar: '🐑', nickname: '墨客小马', content: '写得真好！'}] },
      { id: 3, avatar: '🎨', nickname: '书法爱好者', content: '有没有一起学习蒙古文书法的朋友？我们可以交流心得~', images: [], likes: 5, comments: 2, liked: false, commentsList: [] },
      { id: 4, avatar: '🌟', nickname: '墨韵大师', content: '今日创作：草原天路。蒙古文书法的魅力在于线条的流畅与力度并存。', images: [], likes: 36, comments: 12, liked: false, commentsList: [] },
      { id: 5, avatar: '🐎', nickname: '草原雄鹰', content: '分享一个学习蒙古文书法的技巧：先从基本笔画开始，循序渐进。', images: [], likes: 18, comments: 5, liked: false, commentsList: [] },
      { id: 6, avatar: '🦅', nickname: '雄鹰展翅', content: '蒙古文书法太有魅力了！练习了一个月，终于掌握了基本笔画的写法。继续加油！', images: [], likes: 15, comments: 4, liked: false, commentsList: [] },
      { id: 7, avatar: '🌙', nickname: '草原明月', content: '推荐一个学习蒙古文书法的APP——智墨穿梭，界面美观，内容丰富，非常适合初学者！', images: [], likes: 28, comments: 7, liked: false, commentsList: [] },
      { id: 8, avatar: '🔥', nickname: '书法热情', content: '今日练习成果：终于写出了满意的"爱"字！蒙古文的笔画真的太优美了。', images: [], likes: 42, comments: 15, liked: false, commentsList: [] },
      { id: 9, avatar: '💎', nickname: '墨玉公子', content: '蒙文书法入门难不难？我来分享一下我的学习方法，希望能帮到大家。', images: [], likes: 20, comments: 6, liked: false, commentsList: [] },
      { id: 10, avatar: '🌈', nickname: '彩虹草原', content: '今天参加了草原书法展，看到了很多蒙古文书法大家的作品，太震撼了！', images: [], likes: 55, comments: 18, liked: false, commentsList: [] }
    ],
    
    guideEnabled: false,
    // 数据结构：allStrokes 存储所有笔画
    allStrokes: [], 
    currentStroke: [], 
    showTemplate: false, // 控制字帖显示，初始为隐藏状态
    musicEnabled: true,
    wasBgMusicPlaying: false,
    showMusicPicker: false,
    musicList: [],
    currentMusicIndex: 0,
    
    // 左侧边栏（字帖、落款、试炼）
    showLeftSidebar: false,
    leftSidebarTab: 'zitie',
    
    // 编辑头像/用户名弹窗
    showEditAvatar: false,
    showEditNickname: false,
    tempNickname: '',
    selectedAvatar: '',
    avatarOptions: ['👤', '🐑', '🏺', '🎨', '🌟', '🐎', '🦅', '🌙', '🔥', '💎', '🌈', '🎭'],
    
    // 社区评论相关
    showCommentModal: false,
    currentPostId: null,
    currentComments: [],
    commentText: '',
    replyTargetNickname: '',
    
    // 发帖相关
    showPostModal: false,
    postContent: '',
    postImages: [],
    
    // 我的作品
    myWorks: [],
    myPostCount: 0,
    hasCheckedIn: false,
    lastCheckInDate: '',
    myLikes: [],
    myCollections: [],
    myPosts: [],
    isLoadingPosts: false,
    refresherTriggered: false,
    hasMorePosts: true,
    currentPage: 1,
    
    // 弹窗控制
    showMyWorksModal: false,
    showSettingsModal: false,
    lessonList: LESSON_LIST,
    
    templateSettings: {
      scale: 1.0,   // 缩放比例 (0.5 - 2.0)
      opacity: 0.5, // 透明度 (0.1 - 1.0)
      x: 0,         // X轴偏移 (微调位置)
      y: 0          // Y轴偏移
    },

    isPinching: false, // 双指缩放状态
    pinchData: {
      initialDistance: 0,    // 初始双指距离
      initialScale: 1.0,     // 初始缩放值
      initialOpacity: 0.5,  // 初始透明度
      initialCenterY: 0      // 初始中心Y用于透明度调节
    },

    showLessonPicker: false, // 控制选帖面板显示

    isToolbarCollapsed: false, // 控制底部工具栏折叠状态
    isToolbarMinimized: false, // 控制底部工具栏最小化状态

    // 提示框拖拽相关状态
    tipPosition: {
      x: 20, // 提示框初始位置x（胶囊式悬浮窗）
      y: 120  // 提示框初始位置y
    },
    isTipCollapsed: false, // 提示框折叠状态

    // --- 新增：AI 科技模式相关 ---
    isTechMode: false,      // 默认为艺术模式，点击切换为 true
    currentVelocity: '0.00', // 仪表盘：实时速度
    totalPoints: 0,          // 仪表盘：采集点数计数
    playbackStatus: 'Waiting...', // 仪表盘：回放状态
    // -------------------------
    // --- 记忆盒子相关 ---
    show3DView: false,
    frameList: [],
    currentFrameIndex: 0,
    currentFrameUrl: '',
    frameProgress: 0,
    averageVelocity: 0,
    averageForce: 0,
    playbackSpeed: '0.0',
    playbackPressure: '0.0',
    playbackTime: '0',
    playbackCanvas: null,
    playbackCtx: null,
    // --- 3D回溯增强功能 ---
    isAutoPlaying: false, // 自动播放状态
    playbackSpeedRate: 1.0, // 回溯倍速
    playbackTimer: null, // 回溯定时器
    playbackTrailPoints: [], // 拖尾效果点集
    cursorVisible: false, // 光标显示状态
    cursorX: 0, // 光标X坐标
    cursorY: 0, // 光标Y坐标
    viewAngle: 0, // 视角倾斜角度 (0=正面, 1=左斜, 2=右斜, 3=俯视, 4=360度旋转)
    rotationAngle: 0, // 360度旋转时的当前角度
    rotationTimer: null, // 旋转动画定时器
    // -------------------------

    // 笔锋计算缓存变量
    lastX: 0,
    lastY: 0,
    lastPoint: { x: 0, y: 0 },
    lastDirection: undefined,
    lastTime: 0,
    baseWidth: 6, // 基础笔画宽度
    showSetting: false, // 控制调节面板显示
    activeSkin: 'xuan',
    sealText: '蒙格', // 默认印章文字
    sealColor: '#d74a49', // 印章颜色
    sealType: 'baiwen', // 'zhuwen'(阳刻-红字) 或 'baiwen'(阴刻-白字)
    showSealEditor: false,
    showToolbox: false, // 控制工具箱侧边栏显示
    showReverseMenu: false, // 控制逆流菜单显示
    
    // --- 新增：笔画颜色相关 ---
    currentColor: '#2c2c2c', // 默认黑色
    colorOptions: [
      { name: '墨黑', value: '#2c2c2c' },
      { name: '朱砂', value: '#d74a49' },
      { name: '鎏金', value: '#d4af37' }
    ],
    // -------------------------
    
    // --- 新增：多模态读音相关 ---
    isPlaying: false, // 音频播放状态
    // innerAudioContext: null, // 音频上下文不再存储在data中，而是存储在页面实例属性中
    // -------------------------
    
    // --- 新增：折叠式侧边栏相关 ---
    showSkinPicker: false, // 控制纸张选择器展开/收起
    showColorPicker: false, // 控制颜色选择器展开/收起
    // -------------------------
    
    // --- 新增：挑战系统相关 ---
    isChallengeMode: false, // 挑战模式状态
    challengeScore: 0, // 挑战得分
    currentChallengeIndex: 0, // 当前挑战题号
    currentQuizQuestions: [], // 当前挑战的题目集
    challengeCorrectCount: 0, // 挑战答对数量
    showChallengeResult: false, // 显示挑战结果弹窗
    // -------------------------
    
    // --- 核心题库定义 ---
    fullQuizLibrary: [
      {
        id: 1,
        type: '基础篇',
        question: '蒙古文书法书写"Өлзий түмэн（祖国）"时，标准的书写字序为？',
        options: ['从右到左横排', '从上到下竖排', '从左到右横排', '从下到上竖排'],
        answer: 1,
        explanation: '传统与规范蒙古文书法的标准字序为从上到下竖排，列序从左到右。'
      },
      {
        id: 2,
        type: '基础篇',
        question: '蒙语"холт（山）"在蒙古文书法竖排书写时，字母的连接方式为？',
        options: ['左右平连', '上下叠连', '内外环绕', '无固定连接'],
        answer: 1,
        explanation: '蒙古文为竖排书写体系，所有字母均采用上下叠连的连接方式。'
      },
      {
        id: 3,
        type: '基础篇',
        question: '蒙古文斜体字书写"сүнс холт（松山）"时，整体的书写斜度为？',
        options: ['30°左右', '45°左右', '60°左右', '无固定斜度'],
        answer: 1,
        explanation: '蒙古文斜体字的标准书写斜度为45°左右，兼顾书写流畅性与视觉美观性。'
      },
      {
        id: 4,
        type: '基础篇',
        question: '传统蒙古文竹笔书法书写"сүнс（松树）"时，竹笔的笔尖通常为？',
        options: ['单锋', '双锋', '三锋', '多锋'],
        answer: 1,
        explanation: '蒙古文竹笔为草原特色书写工具，标准笔尖为双锋，能精准表现圆转与方折笔画。'
      },
      {
        id: 5,
        type: '基础篇',
        question: '草原蒙古文书法中，传统书写工具的笔杆多采用哪种木材？',
        options: ['松木', '桦木', '杨木', '榆木'],
        answer: 1,
        explanation: '草原桦木质轻、纹理直、易打磨，适配蒙古文竖写的握持习惯。'
      },
      {
        id: 6,
        type: '基础篇',
        question: '为了体现"松树"苍劲坚韧的意象，书法墨色应采用？',
        options: ['淡墨', '浓墨', '宿墨', '焦墨淡染'],
        answer: 1,
        explanation: '浓墨色泽厚重、力透纸背，能精准表现松树苍劲坚韧的意象。'
      },
      {
        id: 7,
        type: '基础篇',
        question: '传统蒙古文硬笔书法中，硬笔的材质通常为？',
        options: ['铜质', '铁质', '骨质', '木质'],
        answer: 2,
        explanation: '草原传统蒙古文硬笔以兽骨为材质，质地坚硬且书写顺滑。'
      },
      {
        id: 8,
        type: '基础篇',
        question: '传统蒙古文书法书写"祖国"等长幅作品时，标准书写姿势为？',
        options: ['坐写', '站写', '跪写', '蹲写'],
        answer: 1,
        explanation: '传统蒙古文书法为竖排长幅书写，标准姿势为站写，能保证笔势舒展。'
      },
      {
        id: 9,
        type: '基础篇',
        question: '蒙语"холтын урсгал（山谷）"的书写中，后缀"тын"的位置应在？',
        options: ['主体词上方', '主体词下方', '主体词左侧', '主体词右侧'],
        answer: 1,
        explanation: '蒙古文的辅音后缀均书写在主体词字母的下方。'
      },
      {
        id: 10,
        type: '基础篇',
        question: '在蒙古文沙地书法中，常用的书写工具是？',
        options: ['毛笔', '竹笔', '树枝', '硬笔'],
        answer: 2,
        explanation: '蒙古文沙地书法就地取材，以树枝为工具，适配草原开阔的书写场景。'
      },
      {
        id: 11,
        type: '进阶篇',
        question: '蒙古文书法中，核心词汇"祖国"的字母比例通常要求为？',
        options: ['黄金比例', '1:1', '2:1', '1:2'],
        answer: 0,
        explanation: '蒙古文书法中核心词汇的字母比例要求为黄金比例（1:0.618），保证视觉美观。'
      },
      {
        id: 12,
        type: '进阶篇',
        question: '蒙语"ᠰᠦᠨᠳᠡᠷ（祖国）"的蒙古文书写，由几个核心字母拼合而成？',
        options: ['5个', '6个', '7个', '8个'],
        answer: 0,
        explanation: '由ᠰ、ᠦ、ᠨ、ᠳ、ᠡ、ᠷ这6个核心字母拼合而成。'
      },
      {
        id: 13,
        type: '进阶篇',
        question: '"松树"（сүнс）的蒙古文首字母形态为？',
        options: ['圆形', '方形', '弧形', '斜线形'],
        answer: 2,
        explanation: '首字母с在蒙古文书写中的标准形态为弧形。'
      },
      {
        id: 14,
        type: '进阶篇',
        question: '蒙古文硬笔书法的标准执笔法是？',
        options: ['三指执笔法', '五指执笔法', '两指执笔法', '握拳执笔法'],
        answer: 0,
        explanation: '标准为三指执笔法（拇指、食指捏笔，中指托笔）。'
      },
      {
        id: 15,
        type: '进阶篇',
        question: '书写"金山"（Алтан холт）时，"金"（Алтан）的墨色可选用？',
        options: ['黑色', '红色', '金色', '蓝色'],
        answer: 2,
        explanation: '"Алтан"意为金，书写时用金色墨汁契合语义与文化意象。'
      },
      {
        id: 16,
        type: '进阶篇',
        question: '蒙古文篆体书写"山"（холт）时，笔画的核心特征是？',
        options: ['圆转均匀', '方折刚劲', '连笔繁多', '笔画纤细'],
        answer: 0,
        explanation: '蒙古文篆体核心特征为笔画圆转均匀、粗细一致。'
      },
      {
        id: 17,
        type: '进阶篇',
        question: '在草原祭典中，蒙古文书法作品通常采用哪种形式？',
        options: ['册页', '条幅', '斗方', '手卷'],
        answer: 1,
        explanation: '草原祭典多采用条幅形式，竖幅舒展，契合庄重场景。'
      },
      {
        id: 18,
        type: '进阶篇',
        question: '蒙古文书法中，松、山意象词与"祖国"组合时，修饰词应位于？',
        options: ['祖国词左侧', '祖国词右侧', '祖国词上方', '祖国词下方'],
        answer: 3,
        explanation: '遵循"主题在上、修饰在下"的章法，意象修饰词位于核心主题词下方。'
      },
      {
        id: 19,
        type: '进阶篇',
        question: '书写"松山"等自然意象词时，收笔通常采用什么笔法？',
        options: ['露锋', '藏锋', '折锋', '扫锋'],
        answer: 1,
        explanation: '采用藏锋收笔，能体现意象的厚重感。'
      },
      {
        id: 20,
        type: '进阶篇',
        question: '蒙古文书法传统上的核心传承方式是？',
        options: ['口传心授', '书本传承', '网络传承', '师徒手传'],
        answer: 3,
        explanation: '传统传承方式为师徒手传，手把手教学笔法与章法。'
      },
      {
        id: 21,
        type: '高阶篇',
        question: '现代蒙古文字母形态主要源自古代的？',
        options: ['回鹘式蒙古文', '八思巴文', '托忒蒙古文', '锡伯文'],
        answer: 0,
        explanation: '现代蒙古文的字母形态核心溯源是回鹘式蒙古文。'
      },
      {
        id: 22,
        type: '高阶篇',
        question: '元代蒙古文书法碑刻体现了哪种草原文化特征？',
        options: ['粗犷豪放', '婉约柔美', '纤细灵动', '平淡简约'],
        answer: 0,
        explanation: '受草原游牧文化影响，字体融合了粗犷豪放的特征，笔画刚劲。'
      },
      {
        id: 23,
        type: '高阶篇',
        question: '草原祭天仪式中，家国主题书法作品的悬挂方向应为？',
        options: ['向东', '向南', '向西', '向北'],
        answer: 3,
        explanation: '蒙古族祭天仪式中正北为尊位，家国主题作品悬挂于正北。'
      },
      {
        id: 24,
        type: '高阶篇',
        question: '蒙古文书法碑刻作品中，碑石的首选材料通常是？',
        options: ['青石', '白石', '红石', '黑石'],
        answer: 0,
        explanation: '草原青石质地坚硬、耐风化，是蒙古文碑刻的核心选材。'
      },
      {
        id: 25,
        type: '高阶篇',
        question: '蒙古文书法的"飞白体"中，飞白笔画主要出现在？',
        options: ['首字母', '中间长笔画', '尾字母', '所有笔画'],
        answer: 1,
        explanation: '主要出现在中间的长笔画处，既有艺术效果又不影响识别。'
      },
      {
        id: 26,
        type: '高阶篇',
        question: '蒙古文书法主题作品中，钤印的印章形状标准为？',
        options: ['方形', '圆形', '椭圆形', '不规则形'],
        answer: 0,
        explanation: '方形在蒙古族文化中象征庄重，适配主题作品。'
      },
      {
        id: 27,
        type: '高阶篇',
        question: '蒙古文书法史中，笔画演变的整体趋势是？',
        options: ['繁化', '简化', '不变', '随机变化'],
        answer: 1,
        explanation: '整体趋势为简化，删减装饰性笔画，保留核心轮廓。'
      },
      {
        id: 28,
        type: '高阶篇',
        question: '松、山、祖国相关蒙语词的书写，融合了哪种草原文化核心？',
        options: ['自然崇拜', '图腾崇拜', '祖先崇拜', '神灵崇拜'],
        answer: 0,
        explanation: '松、山为自然崇拜的核心意象，与祖国词组合融合了这一核心。'
      }
    ],
    // -------------------------
    
    // --- 新增：智能导学图层相关 ---
    showGuideLayer: false, // 控制导学图层显示
    capsuleOpacity: 1, // 底部胶囊透明度

    // --- 保存预览相关 ---
    showPreviewModal: false,

    // --- 用户身份与引导状态 ---
    identityState: 'UNAUTH',  // UNAUTH | AUTH_SUCCESS | VIDEO_INTRO | WRITING_TEST
    hasGuided: false,         // 是否已完成新手引导
    loginAvatar: '',          // 登录页头像
    loginNickname: '',        // 登录页昵称
    // --------------------
    previewImageSrc: '',
    playbackPreviewImageSrc: '',
    startFlash: false, // 截图闪光动画
    sealX: 200, // 印章初始位置
    sealY: 400,
    // --------------------

    // --- 沉浸式仪式对话系统 ---
    showDialogStage: false, // 对话舞台显示状态（点击入籍后显示）
    showGuideChoice: false, // 显示引导选择按钮（开始探索/跳过引导）
    ritualActive: false, // 仪式容器激活状态
    ritualVideoPlaying: false, // 背景视频播放状态
    dialogVisible: false, // 对话框显示状态
    currentSpeaker: '', // 当前说话者: 'mengbao' | 'altan'
    currentSpeakerName: '', // 说话者名称
    currentDialogText: '', // 当前对话文本
    isTyping: false, // 打字机效果进行中
    hasMoreDialog: false, // 是否还有更多对话
    // --------------------

    currentLesson: LESSON_DATA.collectionLab,
    
    // --- 新增：用户数据和赛季系统 ---
    userProfile: {
      level: 1,         // 当前等级
      title: '牧羊人',   // 当前段位
      inkJades: 100,    // 墨玉数量 (货币)
      exp: 0,           // 当前经验值
      season: 'S1 启牧'
    },
    showUserStatus: false, // 控制个人状态栏显示
    showChallengeModal: false, // 控制挑战弹窗显示
    
    // 坐标数据导出相关
    showCoordinateModal: false, // 控制坐标数据弹窗显示
    coordinateData: null, // 导出的坐标数据
    coordinateJson: '', // 坐标数据的 JSON 字符串
    coordinateStats: { strokeCount: 0, pointCount: 0 }, // 统计数据
    isExporting: false, // 导出中状态
    showCollectionSetup: false,
    showCollectionRecords: false,
    showCollectionRecordDetail: false,
    collectionSubmitResult: null,
    showMengbaoActionSheet: false,
    allCollectionRecords: [],
    collectionRecords: [],
    isLoadingCollectionRecords: false,
    collectionRecordFilter: 'all',
    collectionRecordScriptFilter: 'all',
    collectionRecordRoleFilter: 'all',
    showCollectionAdvancedFilters: false,
    isAdminMode: false,
    adminCodeVerified: false,
    selectedCollectionRecord: {},
    selectedCollectionRecordRawPayload: null,
    selectedCollectionRecordPreviewSrc: '',
    isLoadingSelectedCollectionRecord: false,
    replayDisplayMode: 'trajectory',
    collectionConfig: {
      projectId: 'mengge-lab',
      projectName: '文字轨迹采集计划',
      taskId: 'mongolian-narasu',
      taskLabel: '蒙古文基础词采集',
      contentLabel: '松树',
      scriptType: 'mongolian',
      role: 'participant'
    },
    collectionRoleOptions: Object.keys(ROLE_LABELS).map((key) => ({ value: key, label: ROLE_LABELS[key] })),
    collectionScriptOptions: Object.keys(SCRIPT_TYPE_LABELS).map((key) => ({ value: key, label: SCRIPT_TYPE_LABELS[key] })),
    
    // 蒙宝AI打分相关
    showScoringModal: false, // 打分弹窗显示
    scoringResult: null, // 打分结果
    scoringDetail: null, // 打分明细
    isScoring: false, // 打分中
    
    // 题库
    quizBank: [
      {
        question: '"松树"在蒙古文书法中通常代表？',
        options: ['坚韧', '财富', '速度'],
        answer: 0
      },
      {
        question: '蒙古文书写的方向是？',
        options: ['从左往右纵书', '从右往左横书', '从上往下横书'],
        answer: 0
      },
      {
        question: '"苍狼"在蒙古文化中是什么地位？',
        options: ['图腾', '宠物', '普通动物'],
        answer: 0
      },
      {
        question: '蒙文书法的笔触轻重主要通过什么控制？',
        options: ['压力与速度', '颜色', '屏幕亮度'],
        answer: 0
      },
      {
        question: 'S1赛季的名称是？',
        options: ['启牧', '闭环', '开天'],
        answer: 0
      }
    ],
    challengeData: {
      question: '"松树"在蒙古文书法中通常代表？',
      options: ['坚韧', '财富', '速度'],
      answer: 0
    },
    showResultPanel: false, // 控制结算面板显示

    // -------------------------
  },

  buildDefaultCollectionConfig(lesson = this.data.currentLesson) {
    const lessonId = lesson?.id || 'narasu'
    return {
      projectId: 'mengge-lab',
      projectName: '文字轨迹采集计划',
      taskId: `mongolian-${lessonId}`,
      taskLabel: `${lesson?.title || '基础词'}轨迹采集`,
      contentLabel: lesson?.title || lesson?.chinese || '',
      scriptType: 'mongolian',
      scriptTypeLabel: SCRIPT_TYPE_LABELS.mongolian,
      role: 'participant',
      roleLabel: ROLE_LABELS.participant
    }
  },

  decorateCollectionConfig(config = {}) {
    const scriptType = config.scriptType || 'mongolian'
    const role = config.role || 'participant'
    return {
      ...config,
      scriptType,
      role,
      scriptTypeLabel: SCRIPT_TYPE_LABELS[scriptType] || SCRIPT_TYPE_LABELS.mongolian,
      roleLabel: ROLE_LABELS[role] || ROLE_LABELS.participant
    }
  },

  ensureCollectionConfig() {
    const stored = wx.getStorageSync('collectionConfig')
    const defaults = this.buildDefaultCollectionConfig()
    const merged = this.decorateCollectionConfig({
      ...defaults,
      ...(stored || {})
    })
    this.setData({ collectionConfig: merged })
    return merged
  },

  syncCollectionConfigWithLesson(lesson = this.data.currentLesson) {
    const current = this.data.collectionConfig || this.buildDefaultCollectionConfig(lesson)
    const isCollectionLesson = lesson?.id === 'collectionLab'
    const nextConfig = this.decorateCollectionConfig({
      ...current,
      taskId: isCollectionLesson ? (current.taskId || `${current.scriptType || 'mongolian'}-freewrite`) : (current.taskId || `${current.scriptType || 'mongolian'}-${lesson?.id || 'freewrite'}`),
      taskLabel: isCollectionLesson ? (current.taskLabel || '自由采集任务') : (current.taskLabel || `${lesson?.title || '基础词'}轨迹采集`),
      contentLabel: isCollectionLesson ? (current.contentLabel || '自由采集') : (lesson?.title || lesson?.chinese || current.contentLabel || '')
    })
    this.setData({ collectionConfig: nextConfig })
    wx.setStorageSync('collectionConfig', nextConfig)
  },

  getDeviceSnapshot() {
    try {
      const systemInfo = wx.getSystemInfoSync()
      return {
        brand: systemInfo.brand || '',
        model: systemInfo.model || '',
        platform: systemInfo.platform || '',
        system: systemInfo.system || '',
        language: systemInfo.language || '',
        pixelRatio: systemInfo.pixelRatio || 1,
        screenWidth: systemInfo.screenWidth || 0,
        screenHeight: systemInfo.screenHeight || 0
      }
    } catch (error) {
      console.warn('[Collection] getSystemInfoSync failed:', error)
      return {}
    }
  },

  captureSimpleCanvasPreview(updateState = true) {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery()
      query.select('#simpleCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            reject(new Error('canvas unavailable'))
            return
          }

          wx.canvasToTempFilePath({
            canvas: res[0].node,
            fileType: 'jpg',
            quality: 0.9,
            success: (result) => {
              if (updateState) {
                this.setData({
                  playbackPreviewImageSrc: result.tempFilePath
                })
              }
              resolve(result.tempFilePath)
            },
            fail: reject
          })
        })
    })
  },

  async refreshPlaybackPreview() {
    if (!this.data.allStrokes?.length) {
      this.setData({ playbackPreviewImageSrc: '' })
      return ''
    }

    try {
      return await this.renderStrokePreview(this.data.allStrokes, {
        updateState: true,
        strokeColor: '#111111',
        backgroundColor: '#ffffff'
      })
    } catch (error) {
      console.warn('[Collection] refreshPlaybackPreview failed:', error)
      return ''
    }
  },

  async renderStrokePreview(strokes = [], options = {}) {
    if (!strokes || !strokes.length) {
      if (options.updateState) {
        this.setData({ playbackPreviewImageSrc: '' })
      }
      return ''
    }

    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery()
      query.select('#previewCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            reject(new Error('preview canvas unavailable'))
            return
          }

          try {
            const canvas = res[0].node
            const ctx = canvas.getContext('2d')
            const dpr = wx.getSystemInfoSync().pixelRatio || 2
            const width = 420
            const height = 620
            canvas.width = width * dpr
            canvas.height = height * dpr
            ctx.scale(dpr, dpr)

            ctx.clearRect(0, 0, width, height)
            ctx.fillStyle = options.backgroundColor || '#ffffff'
            ctx.fillRect(0, 0, width, height)
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'

            let minX = Infinity
            let minY = Infinity
            let maxX = -Infinity
            let maxY = -Infinity
            strokes.forEach((stroke) => {
              const points = stroke.points || stroke || []
              points.forEach((point) => {
                if (typeof point.x === 'number' && typeof point.y === 'number') {
                  minX = Math.min(minX, point.x)
                  minY = Math.min(minY, point.y)
                  maxX = Math.max(maxX, point.x)
                  maxY = Math.max(maxY, point.y)
                }
              })
            })

            const bboxWidth = Math.max(1, maxX - minX)
            const bboxHeight = Math.max(1, maxY - minY)
            const paddingX = 48
            const paddingY = 42
            const scale = Math.min(
              (width - paddingX * 2) / bboxWidth,
              (height - paddingY * 2) / bboxHeight
            ) * 0.92
            const offsetX = (width - bboxWidth * scale) / 2 - minX * scale
            const offsetY = (height - bboxHeight * scale) / 2 - minY * scale

            strokes.forEach((stroke) => {
              const points = stroke.points || stroke || []
              if (!points.length) return
              ctx.beginPath()
              points.forEach((point, index) => {
                const x = point.x * scale + offsetX
                const y = point.y * scale + offsetY
                if (index === 0) {
                  ctx.moveTo(x, y)
                } else {
                  ctx.lineTo(x, y)
                }
              })
              const force = Number(points[points.length - 1]?.f || points[points.length - 1]?.pressure || 0.5)
              ctx.lineWidth = Math.max(4, Math.min(12, 5 + force * 4))
              ctx.strokeStyle = options.strokeColor || '#111111'
              ctx.stroke()
            })

            wx.canvasToTempFilePath({
              canvas,
              fileType: 'png',
              success: (result) => {
                if (options.updateState) {
                  this.setData({
                    playbackPreviewImageSrc: result.tempFilePath
                  })
                }
                resolve(result.tempFilePath)
              },
              fail: reject
            })
          } catch (error) {
            reject(error)
          }
        })
    })
  },

  resetPlaybackOverlayState() {
    if (this.data.playbackTimer) {
      clearInterval(this.data.playbackTimer)
    }
    if (this.data.rotationTimer) {
      clearInterval(this.data.rotationTimer)
    }

    const ctx = this.data.playbackCtx
    const canvas = this.data.playbackCanvas
    if (ctx && canvas) {
      try {
        const dpr = wx.getSystemInfoSync().pixelRatio || 1
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      } catch (error) {
        console.warn('[Playback] clear canvas failed:', error)
      }
    }

    this.data.playbackTrailPoints = []
    this.setData({
      isAutoPlaying: false,
      playbackTimer: null,
      frameProgress: 0,
      rotationTimer: null,
      rotationAngle: 0,
      viewAngle: 0,
      cursorVisible: false,
      cursorX: 0,
      cursorY: 0,
      playbackStatus: 'Waiting...'
    })
  },

  restoreWritingSurface() {
    setTimeout(() => {
      if (!this.simpleCtx) {
        this.initSimpleCanvas()
        return
      }
      if (this.data.allStrokes?.length) {
        this.redrawAllSimpleStrokes()
      }
    }, 80)
  },

  cachePendingCollectionSample(payload, errorMessage = '') {
    const pending = wx.getStorageSync('pendingTrajectorySamples') || []
    const nextItem = {
      id: `pending-${Date.now()}`,
      createdAt: Date.now(),
      errorMessage,
      payload
    }
    const nextPending = [nextItem, ...pending].slice(0, 50)
    wx.setStorageSync('pendingTrajectorySamples', nextPending)
    return nextItem
  },

  mapPendingCollectionRecord(item = {}) {
    const payload = item.payload || {}
    return {
      id: item.id,
      taskLabel: payload?.task?.taskLabel || '离线待同步样本',
      taskId: payload?.task?.taskId || '',
      projectId: payload?.project?.projectId || 'mengge-lab',
      projectName: payload?.project?.projectName || '文字轨迹采集计划',
      scriptType: payload?.task?.scriptTypeLabel || payload?.task?.scriptType || '未知',
      scriptTypeKey: payload?.task?.scriptType || 'mongolian',
      role: payload?.participant?.roleLabel || payload?.participant?.role || '未知',
      roleKey: payload?.participant?.role || 'participant',
      qualityStatus: 'pending',
      reviewStatus: 'local-pending',
      pointCount: payload?.sample?.summary?.pointCount || 0,
      strokeCount: payload?.sample?.summary?.strokeCount || 0,
      durationMs: payload?.sample?.summary?.durationMs || 0,
      contentLabel: payload?.task?.contentLabel || '',
      submittedAt: item.createdAt,
      notes: item.errorMessage || '',
      isStandardSample: !!payload?.sample?.isStandardSample,
      rawPayload: payload
    }
  },

  buildCollectionPayloadFromRecord(record = {}) {
    if (record.rawPayload) {
      return record.rawPayload
    }

    return {
      version: record.clientExportVersion || 'research-sample.v1',
      exportTime: record.submittedAt || new Date().toISOString(),
      project: {
        projectId: record.projectId || 'mengge-lab',
        projectName: record.projectName || '文字轨迹采集计划'
      },
      task: {
        taskId: record.taskId || '',
        taskLabel: record.taskLabel || '',
        contentLabel: record.contentLabel || '',
        scriptType: record.scriptTypeKey || record.scriptType || 'mongolian',
        scriptTypeLabel: SCRIPT_TYPE_LABELS[record.scriptTypeKey || record.scriptType] || record.scriptType || '蒙古文'
      },
      participant: {
        participantId: record.participantId || '',
        role: record.roleKey || record.role || 'participant',
        roleLabel: ROLE_LABELS[record.roleKey || record.role] || record.role || '普通样本',
        nickname: record.participantSnapshot?.nickname || this.data.userProfile?.nickName || this.data.userProfile?.nickname || '',
        avatar: record.participantSnapshot?.avatar || this.data.userProfile?.avatarUrl || this.data.userProfile?.avatar || ''
      },
      device: record.device || {},
      sample: {
        sampleLocalId: record.id || '',
        isStandardSample: !!record.isStandardSample,
        summary: record.summary || {
          strokeCount: record.strokeCount || 0,
          pointCount: record.pointCount || 0,
          durationMs: record.durationMs || 0
        },
        previewFileID: record.finalImageFileID || '',
        previewCloudPath: record.finalImageCloudPath || ''
      },
      strokes: record.strokes || []
    }
  },

  applyCollectionRecordFilters(records = this.data.allCollectionRecords || []) {
    const filter = this.data.collectionRecordFilter || 'all'
    const scriptFilter = this.data.collectionRecordScriptFilter || 'all'
    const roleFilter = this.data.collectionRecordRoleFilter || 'all'
    let nextRecords = records

    if (filter === 'offline') {
      nextRecords = records.filter((item) => item.reviewStatus === 'local-pending')
    } else if (filter === 'pending') {
      nextRecords = records.filter((item) => item.reviewStatus === 'pending')
    } else if (filter === 'reviewed') {
      nextRecords = records.filter((item) => item.reviewStatus && !['pending', 'local-pending'].includes(item.reviewStatus))
    }

    if (scriptFilter !== 'all') {
      nextRecords = nextRecords.filter((item) => item.scriptTypeKey === scriptFilter || item.scriptType === scriptFilter)
    }

    if (roleFilter !== 'all') {
      nextRecords = nextRecords.filter((item) => item.roleKey === roleFilter || item.role === roleFilter)
    }

    this.setData({
      allCollectionRecords: records,
      collectionRecords: nextRecords
    })
  },

  async ensureAdminMode() {
    if (this.data.adminCodeVerified) {
      return true
    }

    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '管理员验证',
        content: '请输入管理员验证码',
        editable: true,
        placeholderText: '请输入 123456',
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    })

    if (!result.confirm) {
      return false
    }

    const code = String(result.content || '').trim()
    if (code !== '123456') {
      wx.showToast({
        title: '验证码错误',
        icon: 'none'
      })
      return false
    }

    this.setData({
      isAdminMode: true,
      adminCodeVerified: true
    })
    wx.showToast({
      title: '已进入管理员模式',
      icon: 'success'
    })
    return true
  },

  onLoad() {
    this.ensureRecognitionTab()
    this.ensureCollectionConfig()
    this.setData({
      tabs: [
        { id: 0, name: '首页' },
        { id: 4, name: '识别', pagePath: '/pages/scan/scan' },
        { id: 2, name: '社区' },
        { id: 1, name: '商城' },
        { id: 3, name: '我' }
      ]
    })
    // 初始化云开发
    initCloud();
    
    // 初始化音频上下文
    console.log('开始初始化音频上下文')
    this.innerAudioContext = wx.createInnerAudioContext()
    console.log('创建音频上下文成功:', this.innerAudioContext)
    
    // 配置音频选项，解决iPad静音问题
    wx.setInnerAudioOption({
      obeyMuteSwitch: false,  // 关键！即使静音键开启也能播放
      mixWithOther: false
    });
    
    this.innerAudioContext.onPlay(() => {
      console.log('音频开始播放')
      this.setData({ isPlaying: true })
    })
    this.innerAudioContext.onPause(() => {
      console.log('音频暂停')
      this.setData({ isPlaying: false })
    })
    this.innerAudioContext.onStop(() => {
      console.log('音频停止')
      this.setData({ isPlaying: false })
    })
    this.innerAudioContext.onEnded(() => {
      console.log('音频播放结束')
      this.setData({ isPlaying: false })
    })
    this.innerAudioContext.onError((res) => {
      console.error('════════════════════════════════════');
      console.error('❌ 音频播放失败详细报告:');
      console.error('错误码:', res.errCode);
      console.error('错误信息:', res.errMsg);
      console.error('当前音频路径:', this.data.currentLesson?.audioSrc);
      console.error('音频上下文状态:', this.innerAudioContext?.paused);
      console.error('════════════════════════════════════');
      
      // 根据错误码提供具体建议
      let hint = '请检查音频文件';
      if (res.errCode === 10001) {
        hint = '系统错误，请重启小程序';
      } else if (res.errCode === 10002) {
        hint = '网络错误，请检查网络连接';
      } else if (res.errCode === 10003) {
        hint = '音频文件格式不支持';
      } else if (res.errCode === 10004) {
        hint = '文件未找到，请检查路径';
      } else if (res.errCode === 10005) {
        hint = '权限不足';
      }
      
      wx.showToast({ 
        title: hint, 
        icon: 'none',
        duration: 2000 
      });
      this.setData({ isPlaying: false });
    });
    console.log('音频上下文初始化完成')

    // 初始化用户身份系统
    this._initUserIdentity()
    
    // 加载我的作品
    const savedWorks = wx.getStorageSync('myWorks') || []
    this.setData({ 
      myWorks: savedWorks,
      filteredProducts: this.data.mallProducts
    })
    
    // 加载签到状态
    this.loadCheckinStatus()
    
    this.consumePendingRecognitionPlayback()
  },

  // 用户身份与引导系统
  _initUserIdentity() {
    const app = getApp()
    
    // 检查本地缓存的用户信息
    const cachedUserInfo = wx.getStorageSync('userInfo')
    const hasCompletedOnboarding = wx.getStorageSync('hasCompletedOnboarding') || false
    
    // 显示开启入籍时，播放悲壮歌曲
    if (app.playGuideMusic) {
      app.playGuideMusic();
    }
    
    if (cachedUserInfo) {
      console.log('[UserIdentity] 已缓存用户信息:', cachedUserInfo.nickName)
      console.log('[UserIdentity] hasCompletedOnboarding:', hasCompletedOnboarding)
      
      this.setData({
        identityState: 'AUTH_SUCCESS',
        userProfile: cachedUserInfo,
        hasGuided: false,
        guideEnabled: false
      })
    } else {
      this.setData({
        identityState: 'UNAUTH',
        hasGuided: false,
        guideEnabled: false
      })
    }
  },

  // 微信登录授权
  onWechatLogin() {
    const nickName = (this.data.loginNickname || '').trim() || '新用户'
    const avatarUrl = this.data.loginAvatar || ''
    const userInfo = { nickName, avatarUrl }

    wx.showLoading({ title: '登录中...', mask: true })

    wx.login({
      success: async (loginRes) => {
        console.log('[Login] wx.login success')
        try {
          const cloudResult = await wx.cloud.callFunction({
            name: 'login',
            data: { userInfo }
          })
          console.log('[Login] 云函数调用结果:', cloudResult)
          let userData
          if (cloudResult && cloudResult.result && cloudResult.result.success) {
            const cloudUser = cloudResult.result.data
            userData = {
              ...userInfo,
              openId: cloudUser.openId,
              userId: cloudUser.userId,
              level: cloudUser.level || 1,
              title: '牧羊人',
              totalScore: cloudUser.totalScore || 0,
              experience: cloudUser.experience || 0,
              inkJades: 100,
              authTime: Date.now()
            }
          } else {
            userData = {
              ...userInfo,
              level: 1,
              title: '牧羊人',
              inkJades: 100,
              authTime: Date.now()
            }
          }
          wx.setStorageSync('userInfo', userData)
          this.setData({
            identityState: 'AUTH_SUCCESS',
            userProfile: userData,
            hasGuided: false,
            guideEnabled: false
          })
          wx.hideLoading()
          wx.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => {
            const guideComponent = this.selectComponent('#guide-component')
            if (guideComponent) {
              console.log('[Login] Login success, guide component found')
            } else {
              console.error('[Login] Guide component not found!')
            }
          }, 500)
        } catch (cloudErr) {
          console.error('[Login] 云函数调用失败:', cloudErr)
          const userData = {
            ...userInfo,
            level: 1,
            title: '牧羊人',
            inkJades: 100,
            authTime: Date.now()
          }
          wx.setStorageSync('userInfo', userData)
          this.setData({
            identityState: 'AUTH_SUCCESS',
            userProfile: userData,
            hasGuided: false,
            guideEnabled: false
          })
          wx.hideLoading()
          wx.showToast({ title: '登录成功(本地模式)', icon: 'success' })
          setTimeout(() => {
            const guideComponent = this.selectComponent('#guide-component')
            if (guideComponent) {
              console.log('[Login] Login success, guide component found')
            }
          }, 500)
        }
      },
      fail: (err) => {
        console.error('[Login] wx.login fail:', err)
        wx.hideLoading()
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  },

  // 跳过登录，以游客身份体验
  onSkipLogin() {
    this.setData({
      identityState: 'AUTH_SUCCESS',
      userProfile: {
        nickName: '游客',
        avatarUrl: '',
        level: 1,
        title: '牧羊人',
        inkJades: 0,
        isGuest: true
      },
      hasGuided: false,
      guideEnabled: false
    })
  },

  onChooseAvatar(e) {
    this.setData({ loginAvatar: e.detail.avatarUrl })
  },

  onNicknameInput(e) {
    this.setData({ loginNickname: e.detail.value })
  },

  onIntroVideoEnded() {
    console.log('[IntroVideo] 视频播放结束，进入书写测试')
    this.setData({
      identityState: 'WRITING_TEST'
    })
  },

  onAuthTap() {
    console.log('[Auth] 开启入籍按钮点击, identityState:', this.data.identityState);
    
    if (this.data.identityState === 'UNAUTH') {
      this.onWechatLogin();
    } else {
      this.setData({ showGuideChoice: true });
    }
  },
  
  onStartGuide() {
    console.log('[Guide] 用户选择开始探索');
    const app = getApp();
    if (app.playBgMusic) {
      app.playBgMusic(0);
    }
    this.setData({
      showGuideChoice: false,
      guideEnabled: true,
      hasGuided: true
    });
    wx.setStorageSync('hasCompletedOnboarding', true);
  },
  
  onSkipGuide() {
    console.log('[Guide] 用户选择跳过引导');
    const app = getApp();
    if (app.playBgMusic) {
      app.playBgMusic(0);
    }
    this.setData({
      showGuideChoice: false,
      guideEnabled: false,
      hasGuided: true,
      identityState: 'WRITING_TEST'
    });
  },

  // 书写测试提示
  _showWritingTestPrompt() {
    wx.showModal({
      title: '书写测试',
      content: '请在屏幕上书写一个蒙古文笔画，开启你的书法之旅！',
      showCancel: false,
      confirmText: '开始书写',
      success: (res) => {
        if (res.confirm) {
          // 可以在这里显示字帖或开始书写
          this.setData({ showTemplate: true })
        }
      }
    })
  },
  // --------------------

  onUnload() {
    // 销毁音频上下文，释放内存
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy()
      this.innerAudioContext = null
    }
  },

  onReady() {
    this.initCanvas()
    this.initSimpleCanvas()
  },

  checkAndStartGuide() {
    // 登录后检查是否需要引导
    const app = getApp()
    if (this.data.identityState === 'AUTH_SUCCESS' && !this.data.hasGuided) {
      // 显示引导界面
    }
  },

  onGuideComplete() {
    const app = getApp()
    app.globalData.hasGuided = true
    this.setData({ 
      guideEnabled: false,
      hasGuided: true,
      identityState: 'WRITING_TEST'
    })
  },

  onCanvasStrokeForGuide() {
    const guideComponent = this.selectComponent('#guide-component')
    if (guideComponent) {
      guideComponent.handleCanvasStroke()
    }
  },

  initCanvas() {
    console.log('[Canvas] initCanvas 开始执行')
    // 1. 获取设备信息，实现全设备适配
    const windowInfo = wx.getWindowInfo()
    const { windowWidth, windowHeight } = windowInfo
    const sys = wx.getSystemInfoSync()
    const dpr = sys.pixelRatio
    
    // 2. 计算 Canvas 尺寸，保持正确的长宽比
    // 以屏幕宽度为基准，高度设置为全屏
    const canvasWidth = windowWidth
    const canvasHeight = windowHeight // 全屏高度，允许用户在全屏幕书写
    
    // 3. 先设置canvasHeight到data中，确保WXML绑定生效
    this.setData({ 
      dpr,
      canvasHeight
    })
    
    // 4. 初始化 Canvas
    const query = wx.createSelectorQuery()
    query.select('#myCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        console.log('[Canvas] initCanvas 查询结果:', res)
        if (!res || !res[0]) {
          console.warn('[Canvas] Canvas 元素未找到')
          return
        }
        
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')

        // 应用 DPR 补偿，确保高刷屏平板上的笔迹不模糊
        canvas.width = canvasWidth * dpr
        canvas.height = canvasHeight * dpr
        ctx.scale(dpr, dpr)

        // 笔触样式初始化
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        
        this.setData({ 
          canvas, 
          ctx,
          canvasWidth
        })
      })
  },

  // --- 核心交互区 ---

  getTouchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  getTouchCenterY(touches) {
    if (touches.length < 2) return touches[0].clientY;
    return (touches[0].clientY + touches[1].clientY) / 2;
  },

  findStylusTouch(touches) {
    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      if (touch.touchType === 'stylus' || touch.touchType === 'direct') {
        return touch;
      }
    }
    return null;
  },

  hasStylusAndFinger(touches) {
    let hasStylus = false;
    let hasFinger = false;
    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      if (touch.touchType === 'stylus' || touch.touchType === 'direct') {
        hasStylus = true;
      } else if (!touch.force) {
        hasFinger = true;
      }
    }
    return hasStylus && hasFinger;
  },

  onTouchStart(e) {
    const touches = e.touches;

    if (touches.length >= 2 && this.data.showTemplate) {
      if (this.hasStylusAndFinger(touches)) {
        console.log('[Canvas] 检测到笔和手指同时触摸，优先使用笔');
        const stylusTouch = this.findStylusTouch(touches);
        if (stylusTouch) {
          e.touches = [stylusTouch];
        }
      } else {
        const distance = this.getTouchDistance(touches);
        const centerY = this.getTouchCenterY(touches);
        this.data.isPinching = true;
        this.data.pinchData = {
          initialDistance: distance,
          initialScale: this.data.templateSettings.scale,
          initialOpacity: this.data.templateSettings.opacity,
          initialCenterY: centerY
        };
        console.log('[Canvas] 双指缩放开始', this.data.pinchData);
        return;
      }
    }

    const touch = touches[0];
    console.log('[Canvas] onTouchStart 触发', {
      touchType: touch.touchType,
      force: touch.force,
      x: touch.x,
      y: touch.y
    });

    if (touch.touchType === 'indirect' || touch.touchType === 'palm') {
      console.log('[Canvas] 忽略非直接触控:', touch.touchType);
      return;
    }

    if (!touch.force && touches.length > 1) {
      console.log('[Canvas] 忽略多点触控 (可能是手指)');
      return;
    }

    this.onCanvasStrokeForGuide();

    const { x, y } = touch;
    const pressure = touch.force || 0;
    // iOS 上 force 可能为 1 或 undefined，需要限制
    let effectivePressure = 0.3;
    if (pressure > 0 && pressure <= 1) {
      effectivePressure = pressure;
    }
    if (effectivePressure < 0.3) {
      effectivePressure = 0.3;
    }

    this.setData({
      lastX: x,
      lastY: y,
      lastTime: Date.now(),
      currentWidth: this.data.baseWidth * (0.5 + effectivePressure * 0.6)
    });

    if (!this.data.ctx) {
      this.initCanvas();
    }

    this.data.lastVelocity = 0;
    this.data.currentMomentum = this.data.baseWidth * (0.5 + effectivePressure * 0.6);
    this.data.currentStroke = [{ x, y, t: this.data.lastTime, v: 0 }];
    this.data.lastPoint = { x, y };
    this.data.lastDirection = undefined;

    const startRadius = this.data.baseWidth * (0.4 + effectivePressure * 0.5);
    this.drawBrushPoint(x, y, startRadius, 0);
  },

  onTouchMove(e) {
    if (this.data.isPinching && e.touches.length >= 2) {
      if (this.hasStylusAndFinger(e.touches)) {
        console.log('[Canvas] 移动中检测到笔和手指同时触摸，忽略移动');
        return;
      }

      const touches = e.touches;
      const currentDistance = this.getTouchDistance(touches);
      const currentCenterY = this.getTouchCenterY(touches);
      const { initialDistance, initialScale, initialOpacity, initialCenterY } = this.data.pinchData;

      if (initialDistance > 0) {
        const scaleRatio = currentDistance / initialDistance;
        const newScale = Math.max(0.5, Math.min(2.0, initialScale * scaleRatio));

        const yDelta = currentCenterY - initialCenterY;
        const opacityDelta = yDelta / 500;
        const newOpacity = Math.max(0.1, Math.min(1.0, initialOpacity + opacityDelta));

        this.setData({
          'templateSettings.scale': newScale,
          'templateSettings.opacity': newOpacity
        });
        console.log('[Canvas] 双指缩放中', { newScale, newOpacity, yDelta });
      }
      return;
    }

    if (!this.data.ctx) {
      console.warn('Canvas context lost, attempting to reconnect...');
      this.initCanvas();
      return;
    }

    let touches = e.touches;

    if (this.hasStylusAndFinger(touches)) {
      console.log('[Canvas] 移动中检测到笔和手指同时触摸，优先使用笔');
      const stylusTouch = this.findStylusTouch(touches);
      if (stylusTouch) {
        touches = [stylusTouch];
      }
    }

    const touch = touches[0];

    if (touch.touchType === 'indirect' || touch.touchType === 'palm') {
      return;
    }

    if (!touch.force && touches.length > 1) {
      return;
    }

    const { x, y } = touch;
    
    const screenHeight = this.data.canvasHeight || 800;
    const threshold = screenHeight - 150;

    if (y > threshold) {
      if (this.data.capsuleOpacity !== 0.2) {
        this.setData({ capsuleOpacity: 0.2 });
      }
    } else {
      if (this.data.capsuleOpacity !== 1) {
        this.setData({ capsuleOpacity: 1 });
      }
    }

    const force = touch.force || 0
    const now = Date.now()
    const ctx = this.data.ctx

    const dx = x - this.data.lastX
    const dy = y - this.data.lastY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > 100) {
      this.setData({
        lastX: x,
        lastY: y,
        lastTime: now
      });
      this.data.lastPoint = { x, y }
      this.data.lastDirection = dx !== 0 ? Math.atan2(dy, dx) : 0
      return
    }

    if (distance < 1) {
      this.data.lastX = x
      this.data.lastY = y
      this.data.lastTime = now
      this.data.lastPoint = { x, y }
      return
    }

    const dt = now - this.data.lastTime || 1
    const velocity = distance / dt
    const currentDirection = Math.atan2(dy, dx)

    let directionChange = 0
    if (this.data.lastDirection !== undefined) {
      let angleDiff = currentDirection - this.data.lastDirection
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
      directionChange = Math.abs(angleDiff)
    }

    if (this.data.totalPoints % 15 === 0) {
      this.setData({
        currentVelocity: velocity.toFixed(2),
        totalPoints: this.data.totalPoints + 1
      })
    } else {
      this.data.totalPoints++
    }

    const minWidth = 1
    const maxWidth = this.data.baseWidth * 3

    let targetWidth = minWidth
    if (force > 0) {
      const normalizedForce = Math.min(force, 1)
      targetWidth = minWidth + (maxWidth - minWidth) * (normalizedForce * normalizedForce)
    } else {
      const normalizedVelocity = Math.min(velocity * 1.0, 1)
      targetWidth = minWidth + (maxWidth - minWidth) * (1 - normalizedVelocity * 0.6)
    }

    if (directionChange > 0.3 && velocity < 1.5) {
      targetWidth = targetWidth * 1.3
    }

    const momentumFactor = 0.25
    const targetMomentum = targetWidth - this.data.currentMomentum
    this.data.currentMomentum += targetMomentum * momentumFactor
    const lineWidth = this.data.currentMomentum

    const lastPt = this.data.lastPoint
    const midX = (lastPt.x + x) / 2
    const midY = (lastPt.y + y) / 2
    
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(lastPt.x, lastPt.y)
    
    if (directionChange > 0.5 && velocity < 1.2) {
      ctx.arc(midX, midY, lineWidth * 0.6, 0, Math.PI * 2)
    } else {
      ctx.quadraticCurveTo(lastPt.x, lastPt.y, midX, midY)
      ctx.quadraticCurveTo(midX, midY, x, y)
    }
    
    ctx.strokeStyle = this.data.currentColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    const maxBleed = this.data.baseWidth * 1.5
    if (velocity < 0.6) {
      const bleedAmount = maxBleed * (1 - velocity / 0.6)
      ctx.shadowBlur = bleedAmount
      ctx.shadowColor = this.data.currentColor
    } else if (directionChange > 0.4 && velocity < 1.0) {
      ctx.shadowBlur = maxBleed * 0.3
      ctx.shadowColor = this.data.currentColor
    } else {
      ctx.shadowBlur = 0
    }
    
    ctx.stroke()
    ctx.restore()

    const steps = Math.max(1, Math.ceil(distance / 3))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const lerpX = lastPt.x + dx * t
      const lerpY = lastPt.y + dy * t
      
      let pointWidth = lineWidth * (0.6 + 0.4 * (1 - t))
      if (directionChange > 0.3 && t > 0.3 && t < 0.7) {
        pointWidth = pointWidth * 1.2
      }
      
      this.drawBrushPoint(lerpX, lerpY, pointWidth * 0.4, 0)
    }

    this.data.currentStroke.push({
      x, y, t: now, w: lineWidth, v: velocity, f: force
    })

    this.data.lastX = x
    this.data.lastY = y
    this.data.lastTime = now
    this.data.lastPoint = { x, y }
    this.data.lastDirection = currentDirection
  },

  drawBrushPoint(x, y, r, blur) {
    if (!this.data.ctx) return;
    const ctx = this.data.ctx
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = this.data.currentColor

    if (blur > 0) {
      ctx.shadowBlur = blur
      ctx.shadowColor = this.data.currentColor
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    } else {
      ctx.shadowBlur = 0
    }

    ctx.fill()
    ctx.restore()
  },

  onTouchEnd() {
    this.data.isPinching = false;
    this.setData({ capsuleOpacity: 1 });
    if (this.data.currentStroke.length > 0) {
      const newStrokes = [...this.data.allStrokes, {
        points: this.data.currentStroke,
        color: this.data.currentColor
      }];
      this.setData({
        allStrokes: newStrokes,
        currentStroke: []
      });
    }
    this.data.lastPoint = { x: 0, y: 0 };
    this.data.lastDirection = undefined;
  },

  // 简单书写区域初始化
  simpleCanvas: null,
  simpleCtx: null,
  simpleLastX: 0,
  simpleLastY: 0,
  simpleLastTime: 0,
  simpleCurrentStroke: [],

  initSimpleCanvas() {
    console.log('[SimpleCanvas] 初始化')
    const query = wx.createSelectorQuery()
    query.select('#simpleCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        console.log('[SimpleCanvas] 查询结果:', res)
        if (!res || !res[0]) {
          console.warn('[SimpleCanvas] Canvas未找到')
          return
        }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const sys = wx.getSystemInfoSync()
        const dpr = sys.pixelRatio
        
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        ctx.scale(dpr, dpr)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = '#1a1a1a'
        ctx.lineWidth = 4
        
        this.simpleCanvas = canvas
        this.simpleCtx = ctx
        console.log('[SimpleCanvas] 初始化完成')
      })
  },

  onSimpleTouchStart(e) {
    console.log('[SimpleCanvas] 触摸开始', {
      touchType: e.touches[0].touchType,
      force: e.touches[0].force
    });
    const touches = e.touches;

    if (touches.length >= 2 && this.data.showTemplate) {
      if (this.hasStylusAndFinger(touches)) {
        console.log('[SimpleCanvas] 检测到笔和手指同时触摸，优先使用笔');
        const stylusTouch = this.findStylusTouch(touches);
        if (stylusTouch) {
          touches = [stylusTouch];
        }
      } else {
        const distance = this.getTouchDistance(touches);
        const centerY = this.getTouchCenterY(touches);
        this.data.isPinching = true;
        this.data.pinchData = {
          initialDistance: distance,
          initialScale: this.data.templateSettings.scale,
          initialOpacity: this.data.templateSettings.opacity,
          initialCenterY: centerY
        };
        console.log('[SimpleCanvas] 双指缩放开始', this.data.pinchData);
        return;
      }
    }

    const touch = touches[0];

    if (touch.touchType === 'indirect' || touch.touchType === 'palm') {
      console.log('[SimpleCanvas] 忽略非直接触控:', touch.touchType);
      return;
    }

    if (!this.simpleCtx) {
      this.initSimpleCanvas();
      return;
    }
    const { x, y } = touch;
    let pressure = touch.force || 0;

    if (pressure === 0 || pressure > 1) {
      pressure = 0.3;
    } else if (pressure < 0.3) {
      pressure = 0.3;
    }

    this.simpleLastX = x;
    this.simpleLastY = y;
    this.simpleLastTime = Date.now();
    this.simpleLastPressure = pressure;
    this.simpleCurrentStroke = [{ x, y, t: Date.now(), f: pressure }];

    const baseWidth = this.data.baseWidth || 6;
    const lineWidth = baseWidth * (0.6 + pressure * 0.8);

    this.simpleCtx.lineCap = 'round';
    this.simpleCtx.lineJoin = 'round';

    const color = this.data.currentColor || '#1a1a1a';
    this.simpleCtx.strokeStyle = color;
    this.simpleCtx.lineWidth = lineWidth;

    if (pressure < 0.3) {
      this.simpleCtx.setLineDash([lineWidth * 0.8, lineWidth * 0.3]);
    } else {
      this.simpleCtx.setLineDash([]);
    }

    this.simpleCtx.beginPath();
    this.simpleCtx.moveTo(x, y);
    this.simpleCtx.lineTo(x + 0.5, y + 0.5);
    this.simpleCtx.stroke();

    if (pressure > 0.4) {
      this.drawInkSpread(x, y, lineWidth, color, 0.25);
    }
  },

  drawInkSpread(x, y, size, color, opacity) {
    if (!this.simpleCtx) return
    const ctx = this.simpleCtx
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2.5)
    const rgb = this.hexToRgb(color)
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`)
    gradient.addColorStop(0.4, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.6})`)
    gradient.addColorStop(0.7, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.3})`)
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`)
    
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, size * 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  },

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 26, g: 26, b: 26 }
  },

  onSimpleTouchMove(e) {
    if (this.data.isPinching && e.touches.length >= 2) {
      if (this.hasStylusAndFinger(e.touches)) {
        console.log('[SimpleCanvas] 移动中检测到笔和手指同时触摸，忽略移动');
        return;
      }

      const touches = e.touches;
      const currentDistance = this.getTouchDistance(touches);
      const currentCenterY = this.getTouchCenterY(touches);
      const { initialDistance, initialScale, initialOpacity, initialCenterY } = this.data.pinchData;

      if (initialDistance > 0) {
        const scaleRatio = currentDistance / initialDistance;
        const newScale = Math.max(0.5, Math.min(2.0, initialScale * scaleRatio));

        const yDelta = currentCenterY - initialCenterY;
        const opacityDelta = yDelta / 500;
        const newOpacity = Math.max(0.1, Math.min(1.0, initialOpacity + opacityDelta));

        this.setData({
          'templateSettings.scale': newScale,
          'templateSettings.opacity': newOpacity
        });
        console.log('[SimpleCanvas] 双指缩放中', { newScale, newOpacity, yDelta });
      }
      return;
    }

    if (!this.simpleCtx) return;

    let touches = e.touches;

    if (this.hasStylusAndFinger(touches)) {
      console.log('[SimpleCanvas] 移动中检测到笔和手指同时触摸，优先使用笔');
      const stylusTouch = this.findStylusTouch(touches);
      if (stylusTouch) {
        touches = [stylusTouch];
      }
    }

    const touch = touches[0];
    if (touch.touchType === 'indirect' || touch.touchType === 'palm') {
      return;
    }

    const { x, y } = touch;
    let pressure = touch.force || 0;

    if (pressure === 0 || pressure > 1) {
      pressure = 0.3;
    } else if (pressure < 0.3) {
      pressure = 0.3;
    }

    const now = Date.now();
    const dt = now - (this.simpleLastTime || now);
    const dx = x - this.simpleLastX;
    const dy = y - this.simpleLastY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const velocity = distance / (dt || 1);

    const baseWidth = this.data.baseWidth || 6;
    let lineWidth = baseWidth * (0.6 + pressure * 0.8);

    if (velocity > 4) {
      lineWidth = lineWidth * 0.65;
    } else if (velocity < 0.5) {
      lineWidth = lineWidth * 1.4;
    }

    const pressureChange = Math.abs(pressure - (this.simpleLastPressure || 0.5));
    if (pressureChange > 0.3) {
      lineWidth = lineWidth * (1 + pressureChange * 0.6);
    }

    this.simpleCurrentStroke.push({ x, y, t: now, f: pressure, v: velocity });

    this.simpleCtx.lineCap = 'round';
    this.simpleCtx.lineJoin = 'round';
    this.simpleCtx.strokeStyle = this.data.currentColor || '#1a1a1a';
    this.simpleCtx.lineWidth = lineWidth;

    if (velocity > 3 && pressure < 0.4) {
      this.simpleCtx.setLineDash([lineWidth * 0.6, lineWidth * 0.4]);
    } else if (velocity > 2) {
      this.simpleCtx.setLineDash([lineWidth * 0.3, lineWidth * 0.15]);
    } else {
      this.simpleCtx.setLineDash([]);
    }

    this.simpleCtx.beginPath();
    this.simpleCtx.moveTo(this.simpleLastX, this.simpleLastY);
    this.simpleCtx.lineTo(x, y);
    this.simpleCtx.stroke();

    if (pressure > 0.35 && velocity < 1.5) {
      this.drawInkSpread(x, y, lineWidth * 0.6, this.data.currentColor || '#1a1a1a', 0.2);
    }

    this.simpleLastX = x;
    this.simpleLastY = y;
    this.simpleLastTime = now;
    this.simpleLastPressure = pressure;
  },

  onSimpleTouchEnd(e) {
    console.log('[SimpleCanvas] 触摸结束');
    this.data.isPinching = false;
    if (this.simpleCurrentStroke.length > 0) {
      const newStrokes = [...(this.data.allStrokes || []), {
        points: this.simpleCurrentStroke,
        color: this.data.currentColor || '#1a1a1a'
      }];
      this.setData({ allStrokes: newStrokes });
      console.log('[SimpleCanvas] 保存笔画，当前共', newStrokes.length, '笔');
      this.simpleCurrentStroke = [];
    }
  },

  // 记忆盒子切换
  onToggleMemoryBox() {
    if (!this.data.show3DView) {
      this.initFrameList()
      this.preloadFrames()
      this.refreshPlaybackPreview()
    } else {
      this.resetPlaybackOverlayState()
    }
    this.setData({
      show3DView: !this.data.show3DView,
      showScoringModal: false
    }, () => {
      if (!this.data.show3DView) {
        this.restoreWritingSurface()
      }
    })
  },

  onChangeReplayDisplayMode(e) {
    const mode = e.currentTarget.dataset.mode || 'trajectory'
    this.setData({
      replayDisplayMode: mode
    }, () => {
      if (mode === 'result') {
        this.refreshPlaybackPreview()
      }
    })
  },

  // 收起侧边栏
  onCollapseSidebar() {
    this.setData({
      showToolbox: false
    })
  },

  // 点击画布任意区域，收起工具箱侧边栏
  onCanvasTap() {
    if (this.data.showToolbox) {
      this.setData({
        showToolbox: false
      })
    }
  },

  // 逆流菜单切换
  onToggleReverseMenu() {
    this.setData({
      showReverseMenu: !this.data.showReverseMenu
    })
  },

  // 初始化序列帧列表
  initFrameList() {
    const { currentLesson } = this.data;
    const staticImage = currentLesson ? currentLesson.bgImage : LESSON_DATA.songshu.bgImage;
    this.setData({
      frameList: [staticImage],
      currentFrameIndex: 0,
      currentFrameUrl: staticImage
    })

    this.initPlaybackCanvas()
  },

  // 初始化回放画布
  initPlaybackCanvas() {
    const query = wx.createSelectorQuery()
    query.select('#playbackCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) {
          console.log('Canvas not found, retrying...')
          setTimeout(() => this.initPlaybackCanvas(), 100)
          return
        }

        try {
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio || 2

          const size = res[0].size || { width: 300, height: 400 }
          canvas.width = size.width * dpr
          canvas.height = size.height * dpr
          ctx.scale(dpr, dpr)

          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'

          this.setData({
            playbackCanvas: canvas,
            playbackCtx: ctx
          })

          console.log('Playback canvas initialized:', size)
        } catch(e) {
          console.error('Canvas init error:', e)
        }
      })
  },

  // 预加载序列帧
  preloadFrames() {
    console.log('预加载已临时禁用，使用静态图片测试')
  },

  // 计算当前帧索引
  calculateFrameIndex(strokes, totalFrames = 60) {
    if (!strokes || strokes.length === 0) return 0

    const firstStroke = strokes[0]
    const lastStroke = strokes[strokes.length - 1]
    const startTime = firstStroke[0].t
    const endTime = lastStroke[lastStroke.length - 1].t
    const totalDuration = endTime - startTime

    if (totalDuration === 0) return 0

    const progress = Math.min(Math.max(this.data.frameProgress / 100, 0), 1)
    const frameIndex = Math.floor(progress * (totalFrames - 1))

    return frameIndex
  },

  // 更新 3D 视图 - 重写版本
  update3DView(progress) {
    const { allStrokes, playbackCanvas, playbackCtx, currentColor, currentLesson, viewAngle } = this.data
    const frameUrl = currentLesson ? currentLesson.bgImage : LESSON_DATA.songshu.bgImage

    let playbackSpeed = '0.0'
    let playbackPressure = '0.0'
    let playbackTime = '0'
    let playbackStatus = 'Waiting...'
    let cursorX = 0
    let cursorY = 0
    let cursorVisible = false

    if (allStrokes.length > 0 && playbackCtx) {
      const dpr = wx.getSystemInfoSync().pixelRatio || 1
      let width = 300
      let height = 400
      
      try {
        if (playbackCanvas) {
          width = playbackCanvas.width / dpr || 300
          height = playbackCanvas.height / dpr || 400
        }
      } catch(e) {
        console.log('Canvas size error:', e)
      }

      playbackCtx.clearRect(0, 0, width, height)

      let totalPoints = 0
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      allStrokes.forEach(stroke => {
        const points = stroke.points || stroke
        totalPoints += points.length
        points.forEach((point) => {
          if (typeof point.x === 'number' && typeof point.y === 'number') {
            minX = Math.min(minX, point.x)
            minY = Math.min(minY, point.y)
            maxX = Math.max(maxX, point.x)
            maxY = Math.max(maxY, point.y)
          }
        })
      })

      if (totalPoints === 0) {
        this.setData({
          currentFrameUrl: frameUrl,
          playbackSpeed,
          playbackPressure,
          playbackTime,
          playbackStatus,
          cursorVisible: false
        })
        return
      }

      const safeTop = 52
      const safeBottom = 320
      const safeSide = 70
      const availableWidth = Math.max(120, width - safeSide * 2)
      const availableHeight = Math.max(180, height - safeTop - safeBottom)
      const bboxWidth = Math.max(1, maxX - minX)
      const bboxHeight = Math.max(1, maxY - minY)
      const scale = Math.max(0.3, Math.min(availableWidth / bboxWidth, availableHeight / bboxHeight) * 0.9)
      const offsetX = (width - bboxWidth * scale) / 2 - minX * scale
      const offsetY = safeTop + (availableHeight - bboxHeight * scale) / 2 - minY * scale
      const centerX = width / 2
      const centerY = safeTop + availableHeight / 2

      const transformPlaybackPoint = (x, y) => {
        let tx = x * scale + offsetX
        let ty = y * scale + offsetY

        if (viewAngle === 4) {
          const angle = (this.data.rotationAngle || 0) * Math.PI / 180
          const dx = tx - centerX
          const sinA = Math.sin(angle)
          const cosA = Math.cos(angle)
          const perspective = 0.08 + 0.92 * Math.abs(cosA)
          tx = centerX + dx * sinA * 1.7
          tx = centerX + (tx - centerX) * perspective
          ty = ty + (1 - perspective) * 8
        }

        return { x: tx, y: ty }
      }

      playbackCtx.save()

      const progressRatio = Math.min(Math.max(progress / 100, 0), 1)
      const drawLimit = Math.floor(totalPoints * progressRatio)

      let drawnPoints = 0
      let lastValidPoint = null

      for (const stroke of allStrokes) {
        const points = stroke.points || stroke
        if (points.length < 2 || drawnPoints >= drawLimit) break

        for (let i = 0; i < points.length; i++) {
          if (drawnPoints >= drawLimit) break

          const point = points[i]

          if (i > 0) {
            const prevPoint = points[i - 1]
            const dx = point.x - prevPoint.x
            const dy = point.y - prevPoint.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const steps = Math.max(1, Math.ceil(distance))

            for (let j = 0; j < steps; j++) {
              const t = j / steps
              const lerpX = prevPoint.x + dx * t
              const lerpY = prevPoint.y + dy * t
              const lerpWidth = ((prevPoint.w || 2) + ((point.w || 2) - (prevPoint.w || 2)) * t) * 2
              const fromPoint = transformPlaybackPoint(prevPoint.x, prevPoint.y)
              const drawPoint = transformPlaybackPoint(lerpX, lerpY)

              // 所有视角都添加光晕效果
              if (viewAngle === 0) {
                playbackCtx.shadowColor = '#00ffff'
                playbackCtx.shadowBlur = 15
              } else if (viewAngle === 4) {
                playbackCtx.shadowColor = `hsl(${(this.data.rotationAngle || 0) % 360}, 100%, 50%)`
                playbackCtx.shadowBlur = 25
              } else {
                playbackCtx.shadowColor = '#00ff88'
                playbackCtx.shadowBlur = 25
              }

              playbackCtx.beginPath()
              playbackCtx.lineWidth = lerpWidth
              
              // 根据视角使用不同颜色
              if (viewAngle === 0) {
                playbackCtx.strokeStyle = '#00ffff'
              } else if (viewAngle === 4) {
                const hue = (this.data.rotationAngle || 0) % 360
                playbackCtx.strokeStyle = `hsl(${hue}, 100%, 60%)`
              } else {
                playbackCtx.strokeStyle = '#00ff88'
              }
              
              playbackCtx.lineCap = 'round'
              playbackCtx.lineJoin = 'round'
              playbackCtx.moveTo(fromPoint.x, fromPoint.y)
              playbackCtx.lineTo(drawPoint.x, drawPoint.y)
              playbackCtx.stroke()
            }
          }

          lastValidPoint = point
          drawnPoints++
        }
      }

      playbackCtx.restore()
      playbackCtx.shadowBlur = 0

      // 始终显示光标（如果有笔画的话），光标位置跟随进度
      if (lastValidPoint && allStrokes.length > 0) {
        // 如果进度为0但正在播放，应该显示在起始点
        if (progress === 0 && this.data.isAutoPlaying) {
          const firstStroke = allStrokes[0]
          const firstPoint = firstStroke[0]?.points ? firstStroke[0][0] : firstStroke[0]
          if (firstPoint) {
            lastValidPoint = firstPoint
          }
        }
        
        cursorVisible = this.data.isAutoPlaying || progress > 0
        if (cursorVisible) {
          const transformedCursor = transformPlaybackPoint(lastValidPoint.x, lastValidPoint.y)
          
          // 光标位置 - 画布尺寸的百分比转换
          // 画布是容器的80%宽、75%高，居中显示（左边距10%，上边距12.5%）
          cursorX = Math.max(8, Math.min(92, (transformedCursor.x / width) * 100))
          cursorY = Math.max(10, Math.min(82, (transformedCursor.y / height) * 100))
          
          const velocity = lastValidPoint.v || 0
          const pressure = lastValidPoint.f || 0
          playbackSpeed = (velocity * 10).toFixed(1)
          playbackPressure = pressure.toFixed(1)
          playbackStatus = progress > 0 ? 'PLAYING...' : 'READY'
        }
      }

      if (allStrokes.length > 0 && allStrokes[0].length > 0) {
        const firstStroke = allStrokes[0]
        const lastStroke = allStrokes[allStrokes.length - 1]
        const startTime = firstStroke[0].t
        const endTime = lastStroke[lastStroke.length - 1].t
        const totalDuration = endTime - startTime
        const currentTime = startTime + totalDuration * progressRatio
        playbackTime = Math.floor(currentTime - startTime).toString()
      }
    }

    this.setData({
      currentFrameUrl: frameUrl,
      playbackSpeed,
      playbackPressure,
      playbackTime,
      playbackStatus,
      cursorX: cursorX,
      cursorY: cursorY,
      cursorVisible: cursorVisible
    })
  },

  // 获取指定进度对应的时间戳
  getStrokeTimeAtProgress(strokes, progress) {
    if (!strokes || strokes.length === 0) return 0

    const firstStroke = strokes[0]
    const lastStroke = strokes[strokes.length - 1]
    const startTime = firstStroke[0].t
    const endTime = lastStroke[lastStroke.length - 1].t
    const totalDuration = endTime - startTime

    if (totalDuration === 0) return startTime

    return startTime + totalDuration * progress
  },

  // 计算平均速度
  calculateAverageVelocity() {
    if (this.data.allStrokes.length === 0) return 0
    let totalVelocity = 0
    let count = 0
    this.data.allStrokes.forEach(stroke => {
      const points = stroke.points || stroke
      points.forEach(point => {
        totalVelocity += point.v
        count++
      })
    })
    return count > 0 ? totalVelocity / count : 0
  },

  // 计算平均压力
  calculateAverageForce() {
    if (this.data.allStrokes.length === 0) return 0
    let totalForce = 0
    let count = 0
    this.data.allStrokes.forEach(stroke => {
      const points = stroke.points || stroke
      points.forEach(point => {
        totalForce += point.f || 0
        count++
      })
    })
    return count > 0 ? totalForce / count : 0
  },

  // 进度条变化
  onSliderChange(e) {
    const progress = e.detail.value
    this.setData({
      frameProgress: progress
    })
    this.update3DView(progress)
  },

  // 切换自动播放
  onToggleAutoPlay() {
    const { isAutoPlaying, playbackTimer, allStrokes } = this.data
    
    if (isAutoPlaying) {
      if (playbackTimer) {
        clearInterval(playbackTimer)
      }
      this.setData({
        isAutoPlaying: false,
        playbackTimer: null
      })
    } else {
      if (allStrokes.length === 0) return
      
      this.setData({ frameProgress: 0 })
      this.update3DView(0)
      
      const baseInterval = 30
      const interval = baseInterval / this.data.playbackSpeedRate
      
      const timer = setInterval(() => {
        let newProgress = this.data.frameProgress + 1
        if (newProgress >= 100) {
          newProgress = 0
        }
        this.setData({ frameProgress: newProgress })
        this.update3DView(newProgress)
      }, interval)
      
      this.setData({
        isAutoPlaying: true,
        playbackTimer: timer
      })
    }
  },

  // 改变回溯倍速
  onChangeSpeed(e) {
    const speed = parseFloat(e.currentTarget.dataset.speed)
    const { isAutoPlaying, playbackTimer } = this.data
    
    if (isAutoPlaying) {
      clearInterval(playbackTimer)
      const baseInterval = 30
      const interval = baseInterval / speed
      
      const timer = setInterval(() => {
        let newProgress = this.data.frameProgress + 1
        if (newProgress >= 100) {
          newProgress = 0
        }
        this.setData({ frameProgress: newProgress })
        this.update3DView(newProgress)
      }, interval)
      
      this.setData({
        playbackSpeedRate: speed,
        playbackTimer: timer
      })
    } else {
      this.setData({ playbackSpeedRate: speed })
    }
  },

  // 改变视角
  onChangeViewAngle(e) {
    const angle = parseInt(e.currentTarget.dataset.angle)
    const { rotationTimer, rotationAngle } = this.data
    
    if (angle === 4) {
      if (rotationTimer) {
        clearInterval(rotationTimer)
      }
      
      const timer = setInterval(() => {
        let newAngle = (this.data.rotationAngle + 2) % 360
        this.setData({ 
          viewAngle: 4,
          rotationAngle: newAngle
        })
      }, 30)
      
      this.setData({
        viewAngle: 4,
        rotationTimer: timer
      })
    } else {
      if (rotationTimer) {
        clearInterval(rotationTimer)
      }
      this.setData({ 
        viewAngle: angle,
        rotationTimer: null,
        rotationAngle: 0
      })
    }
  },

  // 关闭记忆盒子时停止播放
  onCloseMemoryBox() {
    this.resetPlaybackOverlayState()
    this.setData({
      show3DView: false
    }, () => {
      this.restoreWritingSurface()
    })
  },

  // --- 新增：绘制科技感节点的辅助函数 ---
  drawTechNodes(x, y, velocity, force) {
    const ctx = this.data.ctx
    
    // 1. 动态计算颜色：基于速度 (Velocity Heatmap)
    // 慢(红色) -> 中(黄色) -> 快(绿色)
    let strokeColor = '#00ff00' // 默认绿
    let pointRadius = 1.5

    if (force > 0) {
      if (force > 0.6) strokeColor = '#ff0000' // 重按：红
      else if (force > 0.3) strokeColor = '#ffff00' // 中等：黄
      else strokeColor = '#00ff00' // 轻按：绿
      pointRadius = 1 + force * 5 // 压力越大，点越大
    } else {
      // 还是用速度控制
      if (velocity < 0.3) strokeColor = '#ff3333'
      else if (velocity < 1.0) strokeColor = '#ffff00'
    }

    // 2. 画连线
    ctx.beginPath()
    ctx.lineWidth = 1
    ctx.strokeStyle = strokeColor
    ctx.globalAlpha = 0.6
    ctx.moveTo(this.data.lastX, this.data.lastY)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.globalAlpha = 1.0

    // 3. 画节点
    ctx.beginPath()
    ctx.fillStyle = strokeColor
    ctx.arc(x, y, pointRadius, 0, Math.PI * 2)
    ctx.fill()
  },

  // --- 功能区 ---

  // 0. 切换 AI/艺术 模式
  onToggleMode() {
    const { allStrokes, isTechMode } = this.data
    
    if (!allStrokes || allStrokes.length === 0) {
      wx.showModal({
        title: '🤖 蒙宝AI',
        content: '你想做什么？',
        confirmText: '打分',
        cancelText: '对话',
        success: (res) => {
          if (res.confirm) {
            wx.showToast({ title: '请先书写一些内容', icon: 'none' })
          } else {
            this.onOpenMengbaoChat()
          }
        }
      })
      return
    }
    
    wx.showModal({
      title: '🤖 蒙宝AI',
      content: '你想做什么？',
      confirmText: '打分',
      cancelText: '对话',
      success: (res) => {
        if (res.confirm) {
          this.onSubmitForScoring()
        } else {
          this.onOpenMengbaoChat()
        }
      }
    })
  },

  // 打开蒙宝对话
  onOpenMengbaoChat() {
    wx.showModal({
      title: '💬 与蒙宝对话',
      content: '蒙宝是一位蒙古文书法的AI导师，你可以问它关于书法的问题。\n\n请在社区发帖，我会回复你！',
      confirmText: '知道了',
      showCancel: false,
      success: () => {
        this.setData({ currentTab: 2 })
      }
    })
  },

  // 1. 切换字帖
  onToggleTemplate() {
    this.setData({
      showLessonPicker: true
    });
  },

  changeLesson(lessonId) {
     const newLesson = LESSON_DATA[lessonId];
     if (!newLesson) {
       wx.showToast({ title: '课程开发中...', icon: 'none' });
       return;
     }

     // 停止当前音频
     if (this.innerAudioContext) {
       this.innerAudioContext.stop();
     }

    this.setData({
      currentLesson: newLesson,
      showTemplate: newLesson.id !== 'collectionLab',
      isPlaying: false,
      isTechMode: false
    }, () => {
       this.syncCollectionConfigWithLesson(newLesson)
       wx.showToast({
         title: `已加载：${newLesson.title}`,
         icon: 'none'
       });

       if (this.innerAudioContext) {
         this.innerAudioContext.src = newLesson.audioSrc;
       }
     });
   },

  // 关闭选帖面板
  onCloseLessonPicker() {
    this.setData({
      showLessonPicker: false
    });
  },

  // 选择字帖
  onSelectLesson(e) {
    const lesson = e.currentTarget.dataset.lesson;
    const lessonId = lesson?.id || e.currentTarget.dataset.lessonId;
    
    if (lessonId) {
      this.changeLesson(lessonId);
      this.setData({
        showLessonPicker: false,
        showTemplate: true,
        showLeftSidebar: false
      });
    }
  },

  onTemplateImageError(e) {
    console.error('字帖图片加载失败:', e.detail.errMsg);
    if (e.detail.errMsg.includes('fail')) {
      wx.showToast({
        title: '图片加载中...',
        icon: 'loading',
        duration: 1000
      });
      this.setData({
        'currentLesson.bgImage': LESSON_DATA.songshu.bgImage
      });
    }
  },

  // 切换工具栏折叠状态（带弹性动画）
  onToggleToolbar() {
    const willCollapse = !this.data.isToolbarCollapsed;
    
    if (willCollapse) {
      // 折叠动画：先缩小再消失
      this.setData({
        capsuleOpacity: 0.8
      });
      
      setTimeout(() => {
        this.setData({
          isToolbarCollapsed: true,
          capsuleOpacity: 1
        });
      }, 100);
    } else {
      // 展开动画：弹性弹出效果
      this.setData({
        isToolbarCollapsed: false,
        capsuleOpacity: 0.3
      });
      
      // 弹性动画序列
      setTimeout(() => {
        this.setData({ capsuleOpacity: 0.8 });
      }, 50);
      
      setTimeout(() => {
        this.setData({ capsuleOpacity: 0.6 });
      }, 100);
      
      setTimeout(() => {
        this.setData({ capsuleOpacity: 0.9 });
      }, 150);
      
      setTimeout(() => {
        this.setData({ capsuleOpacity: 1 });
      }, 200);
    }
  },

  // 手势识别相关变量
  swipeStartY: 0,
  swipeStartTime: 0,
  isSwiping: false,

  // 手势开始
  onSwipeStart(e) {
    this.swipeStartY = e.touches[0].clientY;
    this.swipeStartTime = Date.now();
    this.isSwiping = true;
  },

  // 手势移动
  onSwipeMove(e) {
    if (!this.isSwiping) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = this.swipeStartY - currentY; // 上滑为正值，下滑为负值
    
    if (this.data.isToolbarMinimized) {
      // 最小化状态下，上滑提供视觉反馈
      if (deltaY > 20) {
        const progress = Math.min(1, deltaY / 80);
        this.setData({
          capsuleOpacity: 0.3 + progress * 0.7
        });
      }
    } else {
      // 展开状态下，下滑提供视觉反馈
      if (deltaY < -20) {
        const progress = Math.min(1, Math.abs(deltaY) / 80);
        this.setData({
          capsuleOpacity: 1 - progress * 0.7
        });
      }
    }
  },

  // 手势结束
  onSwipeEnd(e) {
    if (!this.isSwiping) return;
    
    const currentY = e.changedTouches[0].clientY;
    const deltaY = this.swipeStartY - currentY;
    const deltaTime = Date.now() - this.swipeStartTime;
    const velocity = Math.abs(deltaY / deltaTime);
    
    if (this.data.isToolbarMinimized) {
      // 最小化状态下，上滑展开
      if (deltaY > 40 && velocity > 0.2) {
        this.setData({
          isToolbarMinimized: false,
          capsuleOpacity: 1
        });
      } else {
        // 手势无效，恢复状态
        this.setData({
          capsuleOpacity: 1
        });
      }
    } else {
      // 展开状态下，下滑最小化
      if (deltaY < -40 && velocity > 0.2) {
        this.setData({
          isToolbarMinimized: true,
          capsuleOpacity: 1
        });
      } else {
        // 手势无效，恢复状态
        this.setData({
          capsuleOpacity: 1
        });
      }
    }
    
    this.isSwiping = false;
  },

  // 清空字帖（暂不临摹）
  onClearTemplate() {
    this.setData({
      showTemplate: false,
      showLessonPicker: false
    });
    wx.showToast({
      title: '已清空字帖',
      icon: 'none',
      duration: 1000
    });
  },

  // 2. 切换调节面板
  onToggleSetting() {
    this.setData({ showSetting: !this.data.showSetting })
  },

  // 3. 调节粗细
  onWidthChange(e) {
    this.setData({ baseWidth: e.detail.value })
  },

  // 阻止快捷按钮事件冒泡
  onQuickActionTap() {},

  onToggleMusic() {
    const enabled = !this.data.musicEnabled;
    this.setData({ musicEnabled: enabled });
    const app = getApp();
    app.toggleBgMusic(enabled, this.data.currentMusicIndex);
  },

  onMusicLongPress() {
    const app = getApp();
    const musicList = app.getMusicList() || [];
    const currentIndex = app.getCurrentMusicIndex();
    this.setData({
      showMusicPicker: true,
      musicList: musicList,
      currentMusicIndex: currentIndex
    });
  },

  onSelectMusic(e) {
    const index = e.currentTarget.dataset.index;
    const app = getApp();
    this.setData({
      currentMusicIndex: index,
      showMusicPicker: false,
      musicEnabled: true
    });
    app.toggleBgMusic(true, index);
  },

  onCloseMusicPicker() {
    this.setData({ showMusicPicker: false });
  },

  // 4. 撤销
  onUndo() {
    const { allStrokes } = this.data
    console.log('[Undo] 当前笔画数:', allStrokes?.length)
    
    if (!allStrokes || allStrokes.length === 0) {
      wx.showToast({ title: '没有可撤销的笔画', icon: 'none' })
      return
    }
    
    const newStrokes = [...allStrokes]
    newStrokes.pop()
    console.log('[Undo] 撤销后笔画数:', newStrokes.length)
    
    this.setData({ allStrokes: newStrokes })
    this.redrawSimpleCanvas()
    this.redrawAllSimpleStrokes()
    
    wx.showToast({ title: '已撤销', icon: 'success', duration: 500 })
  },

  // 5. 清空
  onClearCanvas() {
    console.log('[Clear] 清空画布')
    
    this.setData({ allStrokes: [] })
    this.clearSimpleCanvas()
    
    // 清空时重置计数器
    this.setData({ totalPoints: 0, currentVelocity: '0.00' })
    
    wx.showToast({ title: '已清空', icon: 'success', duration: 500 })
  },
  
  // 重绘简单画布上的所有笔画
  redrawAllSimpleStrokes() {
    if (!this.simpleCtx || !this.simpleCanvas) {
      console.log('[Redraw] canvas未初始化')
      return
    }
    
    const ctx = this.simpleCtx
    const { allStrokes, currentColor } = this.data
    
    ctx.clearRect(0, 0, this.simpleCanvas.width, this.simpleCanvas.height)
    
    if (!allStrokes || allStrokes.length === 0) return
    
    console.log('[Redraw] 重绘笔画数:', allStrokes.length)
    
    allStrokes.forEach(stroke => {
      const points = stroke.points
      if (!points || points.length < 2) return
      
      const color = stroke.color || currentColor || '#1a1a1a'
      
      ctx.beginPath()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = color
      ctx.lineWidth = 12
      
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y)
      }
      ctx.stroke()
    })
  },
  
  // 重绘简单画布（清空）
  redrawSimpleCanvas() {
    if (!this.simpleCtx || !this.simpleCanvas) return
    const ctx = this.simpleCtx
    const canvas = this.simpleCanvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  },
  
  // 清空简单画布
  clearSimpleCanvas() {
    if (!this.simpleCtx || !this.simpleCanvas) return
    const ctx = this.simpleCtx
    const canvas = this.simpleCanvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  },

  // --- 重绘逻辑 (完全重写：支持线性插值) ---
  redrawCanvas() {
    const { ctx, canvas, allStrokes, isTechMode } = this.data
    
    // 清屏
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.clearRect(0, 0, 9999, 9999) 

    // 遍历历史笔画
    allStrokes.forEach(stroke => {
      const points = stroke.points || stroke
      const strokeColor = stroke.color || '#2c2c2c'
      
      if (points.length < 2) return
      
      if (isTechMode) {
        // 科技风重绘：保持原有逻辑
        for (let i = 1; i < points.length; i++) {
          const p0 = points[i-1]
          const p1 = points[i]
          
          ctx.beginPath()
          ctx.lineWidth = 1
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
          
          ctx.beginPath()
          ctx.fillStyle = '#00ff00'
          const r = (p1.v || 0) < 0.5 ? 3 : 1.5
          ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        // 水墨风重绘：完全重写，加入线性插值
        for (let i = 1; i < points.length; i++) {
          const p0 = points[i-1]
          const p1 = points[i]
          
          // 计算两点间距离和方向
          const dx = p1.x - p0.x
          const dy = p1.y - p0.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          
          // 距离阈值保护（与onTouchMove一致）
          if (distance > 100) continue
          
          // 计算速度（用于渗墨效果）
          const dt = (p1.t || 0) - (p0.t || 0) || 1
          const velocity = distance / dt
          
          // 重新执行插值循环（与onTouchMove逻辑一致）
          const steps = Math.ceil(distance)
          for (let k = 0; k < steps; k++) {
            const t = k / steps
            const lerpX = p0.x + dx * t
            const lerpY = p0.y + dy * t
            
            // 重新计算笔锋粗细（基于速度）
            const stepVelocity = velocity * (1 - t * 0.3)
            const baseWidth = p1.w || this.data.baseWidth
            const pointWidth = baseWidth * (1 - t * 0.2)
            
            // 重新计算渗墨效果（基于速度）
            const baseBleed = 8
            const maxBleed = baseWidth * 1.5
            let shadowBlur = 0
            
            if (stepVelocity < 0.5) {
              shadowBlur = maxBleed
            } else if (stepVelocity > 2.0) {
              shadowBlur = 0
            } else {
              const t = (stepVelocity - 0.5) / 1.5
              shadowBlur = maxBleed * (1 - t)
            }
            
            // 绘制插值点
            this.drawBrushPoint(lerpX, lerpY, pointWidth, shadowBlur)
          }
        }
      }
    })
  },

  // 6. 保存作品 (使用您修复后的版本)
  // === 1. 新增：印章绘制工具函数 ===
  drawCustomSeal(ctx, x, y, size, text) {
    ctx.save();
    const sealColor = this.data.sealColor || '#d74a49';
    // 1. 绘制背景和边框 (保持原有逻辑)
    ctx.strokeStyle = sealColor;
    ctx.lineWidth = size * 0.08;
    ctx.strokeRect(x, y, size, size);
    
    // 阴刻/阳刻背景处理...
    if (this.data.sealType === 'baiwen') {
      ctx.fillStyle = sealColor;
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = '#f4f3ea'; // 白字
    } else {
      ctx.fillStyle = sealColor; // 红字
    }
  
    // 2. 文字排版核心算法
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const len = text.length;
    // 预设坐标系：分为四个象限的中心点
    // 坐标基于 (x, y) 偏移
    const leftX = x + size * 0.25;
    const rightX = x + size * 0.75;
    const topY = y + size * 0.25;
    const bottomY = y + size * 0.75;
    const centerY = y + size * 0.5;
    
    // 4字布局 (右上->右下->左上->左下)
    if (len === 4) {
      ctx.font = `bold ${size * 0.35}px "SimSun", serif`; // 稍微调小一点避免拥挤
      ctx.fillText(text[0], rightX, topY); // 右上
      ctx.fillText(text[1], rightX, bottomY); // 右下
      ctx.fillText(text[2], leftX, topY); // 左上
      ctx.fillText(text[3], leftX, bottomY); // 左下
    }
    // 3字布局 (右1居中，左2上下)
    else if (len === 3) {
      ctx.font = `bold ${size * 0.35}px "SimSun", serif`;
      ctx.fillText(text[0], rightX, centerY); // 右列居中
      ctx.fillText(text[1], leftX, topY); // 左上
      ctx.fillText(text[2], leftX, bottomY); // 左下
    }
    // 2字布局 (右1，左1)
    else if (len === 2) {
      ctx.font = `bold ${size * 0.4}px "SimSun", serif`;
      ctx.fillText(text[0], rightX, centerY);
      ctx.fillText(text[1], leftX, centerY);
    }
    // 1字布局 (居中)
    else {
      ctx.font = `bold ${size * 0.5}px "SimSun", serif`;
      ctx.fillText(text[0], x + size * 0.5, centerY);
    }
    ctx.restore();
  },

  // === 2. 新增：印花框边绘制函数 ===
  drawFrame(ctx, width, height) {
    ctx.save();
    
    // 边框宽度
    const frameWidth = 30;
    
    // 1. 绘制外层边框
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 8;
    ctx.strokeRect(frameWidth, frameWidth, width - frameWidth * 2, height - frameWidth * 2);
    
    // 2. 绘制内层边框
    ctx.strokeStyle = '#a0522d';
    ctx.lineWidth = 4;
    ctx.strokeRect(frameWidth + 10, frameWidth + 10, width - (frameWidth + 10) * 2, height - (frameWidth + 10) * 2);
    
    // 3. 绘制回纹图案
    ctx.strokeStyle = '#cd853f';
    ctx.lineWidth = 2;
    
    // 左上角回纹
    ctx.beginPath();
    ctx.moveTo(frameWidth, frameWidth + 20);
    ctx.lineTo(frameWidth + 15, frameWidth + 20);
    ctx.lineTo(frameWidth + 15, frameWidth + 5);
    ctx.lineTo(frameWidth + 30, frameWidth + 5);
    ctx.lineTo(frameWidth + 30, frameWidth);
    ctx.stroke();
    
    // 右上角回纹
    ctx.beginPath();
    ctx.moveTo(width - frameWidth, frameWidth + 20);
    ctx.lineTo(width - frameWidth - 15, frameWidth + 20);
    ctx.lineTo(width - frameWidth - 15, frameWidth + 5);
    ctx.lineTo(width - frameWidth - 30, frameWidth + 5);
    ctx.lineTo(width - frameWidth - 30, frameWidth);
    ctx.stroke();
    
    // 左下角回纹
    ctx.beginPath();
    ctx.moveTo(frameWidth, height - frameWidth - 20);
    ctx.lineTo(frameWidth + 15, height - frameWidth - 20);
    ctx.lineTo(frameWidth + 15, height - frameWidth - 5);
    ctx.lineTo(frameWidth + 30, height - frameWidth - 5);
    ctx.lineTo(frameWidth + 30, height - frameWidth);
    ctx.stroke();
    
    // 右下角回纹
    ctx.beginPath();
    ctx.moveTo(width - frameWidth, height - frameWidth - 20);
    ctx.lineTo(width - frameWidth - 15, height - frameWidth - 20);
    ctx.lineTo(width - frameWidth - 15, height - frameWidth - 5);
    ctx.lineTo(width - frameWidth - 30, height - frameWidth - 5);
    ctx.lineTo(width - frameWidth - 30, height - frameWidth);
    ctx.stroke();
    
    // 4. 绘制装饰点
    ctx.fillStyle = '#cd853f';
    const dotSpacing = 40;
    
    // 上边装饰点
    for (let x = frameWidth + 40; x < width - frameWidth - 40; x += dotSpacing) {
      ctx.beginPath();
      ctx.arc(x, frameWidth + 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 下边装饰点
    for (let x = frameWidth + 40; x < width - frameWidth - 40; x += dotSpacing) {
      ctx.beginPath();
      ctx.arc(x, height - frameWidth - 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 左边装饰点
    for (let y = frameWidth + 40; y < height - frameWidth - 40; y += dotSpacing) {
      ctx.beginPath();
      ctx.arc(frameWidth + 10, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 右边装饰点
    for (let y = frameWidth + 40; y < height - frameWidth - 40; y += dotSpacing) {
      ctx.beginPath();
      ctx.arc(width - frameWidth - 10, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  },

  // === 2. 故宫风边框绘制函数 ===
  drawPalaceBorder(ctx, width, height) {
    // 四周留白5%
    const padding = Math.min(width, height) * 0.05;
    const borderWidth = 2;
    
    // 确保padding至少为20
    const minPadding = 20;
    const finalPadding = Math.max(padding, minPadding);
    
    // 清除虚线设置，使用实线
    ctx.setLineDash([]);
    
    // 1. 绘制外层故宫红边框
    ctx.strokeStyle = '#d74a49';
    ctx.lineWidth = borderWidth * 2;
    ctx.strokeRect(finalPadding, finalPadding, width - finalPadding * 2, height - finalPadding * 2);
    
    // 2. 绘制内层细边框
    ctx.strokeStyle = '#d74a49';
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(finalPadding + 4, finalPadding + 4, width - (finalPadding + 4) * 2, height - (finalPadding + 4) * 2);
    
    // 3. 绘制回纹装饰角
    const cornerSize = 20;
    ctx.strokeStyle = '#d74a49';
    ctx.lineWidth = 1;
    
    // 左上角回纹
    ctx.beginPath();
    ctx.moveTo(finalPadding, finalPadding + cornerSize);
    ctx.lineTo(finalPadding + cornerSize / 2, finalPadding + cornerSize);
    ctx.lineTo(finalPadding + cornerSize / 2, finalPadding + cornerSize / 2);
    ctx.lineTo(finalPadding + cornerSize, finalPadding + cornerSize / 2);
    ctx.lineTo(finalPadding + cornerSize, finalPadding);
    ctx.stroke();
    
    // 右上角回纹
    ctx.beginPath();
    ctx.moveTo(width - finalPadding, finalPadding + cornerSize);
    ctx.lineTo(width - finalPadding - cornerSize / 2, finalPadding + cornerSize);
    ctx.lineTo(width - finalPadding - cornerSize / 2, finalPadding + cornerSize / 2);
    ctx.lineTo(width - finalPadding - cornerSize, finalPadding + cornerSize / 2);
    ctx.lineTo(width - finalPadding - cornerSize, finalPadding);
    ctx.stroke();
    
    // 左下角回纹
    ctx.beginPath();
    ctx.moveTo(finalPadding, height - finalPadding - cornerSize);
    ctx.lineTo(finalPadding + cornerSize / 2, height - finalPadding - cornerSize);
    ctx.lineTo(finalPadding + cornerSize / 2, height - finalPadding - cornerSize / 2);
    ctx.lineTo(finalPadding + cornerSize, height - finalPadding - cornerSize / 2);
    ctx.lineTo(finalPadding + cornerSize, height - finalPadding);
    ctx.stroke();
    
    // 右下角回纹
    ctx.beginPath();
    ctx.moveTo(width - finalPadding, height - finalPadding - cornerSize);
    ctx.lineTo(width - finalPadding - cornerSize / 2, height - finalPadding - cornerSize);
    ctx.lineTo(width - finalPadding - cornerSize / 2, height - finalPadding - cornerSize / 2);
    ctx.lineTo(width - finalPadding - cornerSize, height - finalPadding - cornerSize / 2);
    ctx.lineTo(width - finalPadding - cornerSize, height - finalPadding);
    ctx.stroke();
  },

  // === 3. 装裱保存仪式感与功能 ===
  onSaveImage() {
    if (this.data.allStrokes.length === 0 && this.data.currentStroke.length === 0) {
      wx.showToast({ title: '画布空空如也', icon: 'none' });
      return;
    }

    this.setData({ startFlash: true });

    const query = wx.createSelectorQuery();
    query.select('#simpleCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          this.setData({ startFlash: false });
          wx.showToast({ title: '获取画布失败', icon: 'none' });
          return;
        }
        
        const canvas = res[0].node;
        const canvasDpr = canvas.width / res[0].width;

        wx.canvasToTempFilePath({
          canvas: canvas,
          success: (res) => {
            this.setData({
              showPreviewModal: true,
              startFlash: false,
              previewImageSrc: res.tempFilePath,
              sealX: 200,
              sealY: 300
            });
          },
          fail: (err) => {
            this.setData({ startFlash: false });
            wx.showToast({ title: '生成预览失败', icon: 'none' });
            console.error("canvasToTempFilePath failed:", err);
          }
        });
      });
  },

  onUndoPreview() {
    this.setData({
      showPreviewModal: false,
      previewImageSrc: ''
    });
  },

  onSealDrag(e) {
    if (e.detail.source === 'touch') {
      this.setData({
        sealX: e.detail.x,
        sealY: e.detail.y
      });
    }
  },

  async onConfirmSave() {
    wx.showLoading({ title: '正在精心装裱...', mask: true });

    try {
      const { 
        canvasWidth, canvasHeight, dpr, 
        sealX, sealY, sealText, sealType, 
        activeSkin, previewImageSrc 
      } = this.data;
      
      // 1. 获取预览容器的实际尺寸，用于计算坐标缩放
      const query = wx.createSelectorQuery();
      const previewRect = await new Promise(resolve => {
        query.select('#previewBox').boundingClientRect(res => resolve(res)).exec();
      });

      if (!previewRect) throw new Error('无法获取预览区域尺寸');

      // 换算比例：(Canvas 实际物理像素 / UI 预览显示像素)
      const scaleX = (canvasWidth * dpr) / previewRect.width;
      const scaleY = (canvasHeight * dpr) / previewRect.height;

      // 2. 创建高精离屏 Canvas 进行合成
      const offscreenCanvas = wx.createOffscreenCanvas({
        type: '2d',
        width: canvasWidth * dpr,
        height: canvasHeight * dpr
      });
      const ctx = offscreenCanvas.getContext('2d');

      // --- 分层绘制开始 ---
      
      // A. 绘制背景纸张色
      let bgColor = '#f4f3ea'; // 默认宣纸
      if (activeSkin === 'cao') bgColor = '#d2b48c';
      else if (activeSkin === 'gold') bgColor = '#f1e5ac';
      
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasWidth * dpr, canvasHeight * dpr);

      // B. 绘制作品内容
      const artworkImg = offscreenCanvas.createImage();
      await new Promise((resolve, reject) => {
        artworkImg.onload = resolve;
        artworkImg.onerror = reject;
        artworkImg.src = previewImageSrc;
      });
      ctx.drawImage(artworkImg, 0, 0, canvasWidth * dpr, canvasHeight * dpr);

      // C. 绘制边框 (Palace Border)
      this.drawPalaceBorder(ctx, canvasWidth * dpr, canvasHeight * dpr);

      // D. 绘制印章 (根据拖拽位置换算)
      const finalSealX = sealX * scaleX;
      const finalSealY = sealY * scaleY;
      const sealSize = 40 * dpr; // 合成图上的印章大小
      this.drawCustomSeal(ctx, finalSealX, finalSealY, sealSize, sealText);

      // E. 绘制启牧标识
      ctx.fillStyle = 'rgba(139, 69, 19, 0.4)';
      ctx.font = `${12 * dpr}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('S1 启牧', 20 * dpr, 25 * dpr);

      // 3. 导出最终图片
      const tempFilePath = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: offscreenCanvas,
          fileType: 'jpg',
          quality: 1.0,
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        });
      });

      // 4. 保存到相册
      wx.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => {
          wx.hideLoading();
          
          // 保存到我的作品
          const newWork = {
            id: Date.now(),
            image: tempFilePath,
            timestamp: Date.now()
          };
          const myWorks = [newWork, ...this.data.myWorks];
          this.setData({ myWorks });
          wx.setStorageSync('myWorks', myWorks);
          
          wx.showToast({ title: '已收入珍宝馆', icon: 'success' });
          this.setData({ showPreviewModal: false });
        },
        fail: (err) => {
          wx.hideLoading();
          if (err.errMsg.includes('auth')) {
            wx.showModal({
              title: '提示',
              content: '需要您的授权才能保存到相册',
              success: (res) => { if (res.confirm) wx.openSetting(); }
            });
          }
        }
      });
    } catch (err) {
      console.error('保存失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '装裱失败，请重试', icon: 'none' });
    }
  },

  // 阻止触摸穿透
  preventTouch() {},

  // 离屏绘制纸张背景
  drawPaperBackground(ctx, w, h, skin) {
    let bgColor = '#faf8f5';
    if (skin === 'cao') bgColor = '#e8dcc8';
    if (skin === 'gold') bgColor = '#faf6e8';
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    
    // 简单纹理模拟 (可选)
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  },

  // 绘制故宫风边框
  drawPalaceBorder(ctx, w, h) {
    const margin = 20;
    const padding = 10;
    
    ctx.strokeStyle = '#bc9d6e'; // 故宫金
    ctx.lineWidth = 4;
    
    // 外框
    ctx.strokeRect(margin, margin, w - margin * 2, h - margin * 2);
    
    // 内细框
    ctx.lineWidth = 1;
    ctx.strokeRect(margin + padding, margin + padding, w - (margin + padding) * 2, h - (margin + padding) * 2);
    
    // 四角花纹 (简约云纹模拟)
    const drawCloud = (x, y, rotate) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotate);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(10, -10, 20, 0);
      ctx.quadraticCurveTo(10, 10, 0, 0);
      ctx.stroke();
      ctx.restore();
    };
    
    drawCloud(margin, margin, 0);
    drawCloud(w - margin, margin, Math.PI / 2);
    drawCloud(w - margin, h - margin, Math.PI);
    drawCloud(margin, h - margin, -Math.PI / 2);
  },



  // === 3. 新增：侧边栏点击交互函数 ===
  onSelectSkin(e) {
    const skin = e.currentTarget.dataset.skin;
    const { userProfile } = this.data;
    
    // 默认解锁所有纸张，让用户免费使用
    this.setData({ activeSkin: skin });
    wx.showToast({ title: `已换成${skin=='gold'?'洒金':'纸张'}`, icon: 'none' });
  },

  onToggleSealEditor() {
    // 弹出一个输入框让用户改印章名字
    wx.showModal({
      title: '修改落款',
      placeholderText: '输入1-4个字',
      editable: true,
      success: (res) => {
        if (res.confirm && res.content) {
          const traditionalText = convertToTraditional(res.content);
          this.setData({ sealText: traditionalText.substring(0, 4) });
        }
      }
    });
  },

  // 切换纸张选择器展开/收起
  onToggleSkinPicker() {
    // 先关闭颜色选择器，确保同一时间只有一个展开
    if (this.data.showColorPicker) {
      this.setData({ showColorPicker: false });
    }
    this.setData({ showSkinPicker: !this.data.showSkinPicker });
  },

  // 切换颜色选择器展开/收起
  onToggleColorPicker() {
    // 先关闭纸张选择器，确保同一时间只有一个展开
    if (this.data.showSkinPicker) {
      this.setData({ showSkinPicker: false });
    }
    this.setData({ showColorPicker: !this.data.showColorPicker });
  },

  // 7. 导出数据 (保留)
  onExportData() {
    const data = JSON.stringify(this.data.allStrokes)
    console.log('Exporting Strokes:', this.data.allStrokes)
    wx.showLoading({ title: 'AI 正在解析...' })
    wx.request({
      url: 'http://127.0.0.1:8000/api/collect', 
      method: 'POST',
      data: { strokes: this.data.allStrokes, timestamp: Date.now() },
      success: (res) => { wx.hideLoading(); wx.showToast({ title: '上传成功' }) },
      fail: (err) => {
        wx.hideLoading()
        wx.setClipboardData({ data })
        wx.showToast({ title: '已复制数据', icon: 'none' })
      }
    })
  },

  // 提交笔迹进行评分
  onSubmitForScoring() {
    const { allStrokes, currentLesson } = this.data

    if (!allStrokes || allStrokes.length === 0) {
      wx.showToast({ title: '请先书写', icon: 'none' })
      return
    }

    const lessonId = currentLesson?.id || 'narasu'
    
    const requestData = {
      strokes: allStrokes,
      lessonId: lessonId,
      canvasWidth: this.data.canvasWidth || 375,
      canvasHeight: this.data.canvasHeight || 600,
      timestamp: Date.now()
    }

    console.log('[Scoring] Submitting strokes for scoring:', {
      strokeCount: allStrokes.length,
      lessonId,
      pointCount: allStrokes.reduce((sum, s) => sum + (s.points?.length || 0), 0)
    })

    wx.showLoading({ title: 'AI 评分中...' })

    wx.request({
      url: 'http://127.0.0.1:8000/api/score',
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: requestData,
      success: (res) => {
        wx.hideLoading()
        if (res.data && res.data.success) {
          this._handleScoringResult(res.data.result)
        } else {
          wx.showToast({ title: res.data?.error || '评分失败', icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('[Scoring] Request failed:', err)
        wx.showToast({ title: '网络错误，使用本地评分', icon: 'none' })
        this._useLocalScoring(requestData)
      }
    })
  },

  // 处理评分结果
  _handleScoringResult(result) {
    console.log('[Scoring] Result:', result)
    
    const totalScore = result.totalScore !== undefined 
      ? result.totalScore 
      : (result.similarity * 100 || 0)
    
    const structureScore = result.structureScore || (totalScore * 0.4 + Math.random() * 20)
    const fluencyScore = result.fluencyScore || (totalScore * 0.35 + Math.random() * 20)
    const rhythmScore = result.rhythmScore || (totalScore * 0.25 + Math.random() * 15)
    
    const scoringDetail = {
      totalScore: totalScore.toFixed(1),
      structureScore: structureScore.toFixed(1),
      fluencyScore: fluencyScore.toFixed(1),
      rhythmScore: rhythmScore.toFixed(1),
      strokeCount: this.data.allStrokes?.length || 0,
      feedback: this._getScoringFeedback(totalScore)
    }
    
    this.setData({
      showScoringModal: true,
      scoringResult: result,
      scoringDetail: scoringDetail,
      isScoring: false
    })
  },
  
  _getScoringFeedback(score) {
    if (score >= 90) return '完美！你的书法已有大家之风！'
    if (score >= 80) return '很棒！继续努力，定能成为书法大师！'
    if (score >= 70) return '不错！结构稳健，还需加强笔锋练习'
    if (score >= 60) return '及格了！建议多临摹字帖，提升笔意'
    return '还需加油！从基本笔画开始练习吧'
  },
  
  onCloseScoringModal() {
    this.setData({ showScoringModal: false })
  },

  // 使用本地评分（后端不可用时）
  _useLocalScoring(requestData) {
    const DTWAlgorithm = require('./services/dtw-algorithm.js').DTWAlgorithm
    const ScoreManager = require('./services/score-manager.js').ScoreManager

    const dtw = new DTWAlgorithm()
    const scoreManager = new ScoreManager({ dtw })

    const templates = {
      narasu: [
        { points: [{ x: 50, y: 100, t: 0, w: 5 }, { x: 80, y: 60, t: 100, w: 5 }, { x: 120, y: 60, t: 200, w: 5 }, { x: 150, y: 100, t: 300, w: 5 }] },
        { points: [{ x: 70, y: 60, t: 0, w: 4 }, { x: 110, y: 60, t: 80, w: 3 }] }
      ],
      hair: [
        { points: [{ x: 50, y: 80, t: 0, w: 5 }, { x: 100, y: 80, t: 100, w: 5 }, { x: 150, y: 120, t: 200, w: 5 }] },
        { points: [{ x: 60, y: 100, t: 0, w: 4 }, { x: 100, y: 100, t: 80, w: 4 }, { x: 140, y: 120, t: 160, w: 3 }] }
      ]
    }

    const templateStrokes = templates[requestData.lessonId] || templates.narasu
    const result = dtw.computeMultiStrokeDTW(requestData.strokes, templateStrokes)

    const totalScore = result.similarity * 100

    this._handleScoringResult({
      similarity: result.similarity,
      totalScore: totalScore,
      strokeCount: requestData.strokes.length,
      templateStrokeCount: templateStrokes.length,
      strokeMatch: requestData.strokes.length === templateStrokes.length,
      strokeScores: result.strokeScores
    })
  },

  // --- 新增：颜色选择相关函数 ---
  onSelectColor(e) {
    const color = e.currentTarget.dataset.color;
    const { userProfile } = this.data;
    
    // 默认解锁所有墨色，让用户免费使用
    this.setData({ 
      currentColor: color
    });
  },
  
  // --- 新增：多模态读音相关函数 ---
  onPlayAudio() {
    console.log('>>> 触发了播放点击');
    
    const src = this.data.currentLesson?.audioSrc;
    console.log('🔈 音频路径:', src);
    
    if (!src) {
      wx.showToast({ title: '音频路径不存在', icon: 'none' });
      return;
    }

    const app = getApp();
    if (app.globalData.bgMusicManager && app.globalData.bgMusicManager.paused === false) {
      app.globalData.bgMusicManager.pause();
      this.setData({ wasBgMusicPlaying: true });
    }
    
    if (!this.innerAudioContext) {
      this.innerAudioContext = wx.createInnerAudioContext();
      this._setupAudioListeners();
    }
    
    this.innerAudioContext.src = src;
    this.innerAudioContext.play();
  },
  
  _setupAudioListeners() {
    this.innerAudioContext.onPlay(() => {
      console.log('音频开始播放');
      this.setData({ isPlaying: true });
    });
    
    this.innerAudioContext.onPause(() => {
      console.log('音频暂停');
      this.setData({ isPlaying: false });
    });
    
    this.innerAudioContext.onStop(() => {
      console.log('音频停止');
      this.setData({ isPlaying: false });
      
      const app = getApp();
      if (this.data.wasBgMusicPlaying && app.globalData.bgMusicManager) {
        app.globalData.bgMusicManager.play();
        this.setData({ wasBgMusicPlaying: false });
      }
    });
    
    this.innerAudioContext.onEnded(() => {
      console.log('音频播放结束');
      this.setData({ isPlaying: false });
      
      const app = getApp();
      if (this.data.wasBgMusicPlaying && app.globalData.bgMusicManager) {
        app.globalData.bgMusicManager.play();
        this.setData({ wasBgMusicPlaying: false });
      }
    });
    
    this.innerAudioContext.onError((res) => {
      console.error('音频播放失败:', res);
      let hint = '请检查音频文件';
      if (res.errCode === 10001) {
        hint = '系统错误，请重启小程序';
      } else if (res.errCode === 10002) {
        hint = '网络错误，请检查网络连接';
      } else if (res.errCode === 10003) {
        hint = '音频文件格式不支持';
      } else if (res.errCode === 10004) {
        hint = '文件未找到，请检查路径';
      } else if (res.errCode === 10005) {
        hint = '权限不足';
      }
      wx.showToast({ title: hint, icon: 'none', duration: 2000 });
      this.setData({ isPlaying: false });
    });
  },
  
  // --- 新增：智能导学图层相关函数 ---
  onToggleGuideLayer() {
    this.setData({ showGuideLayer: !this.data.showGuideLayer })
  },
  
  // --- 新增：游戏化功能相关函数 ---
  switchLesson(lessonId) {
    // 停止当前正在播放的音频
    if (this.data.isPlaying && this.innerAudioContext) {
      this.innerAudioContext.stop()
    }
    
    // 重置所有相关变量
    this.setData({
      isPlaying: false,
      showResultPanel: false,
      showChallengeModal: false,
      userQuizAnswers: [],
      challengeData: {
        question: '松树的正确笔顺是？',
        options: [
          { id: '1', text: '竖', correct: true, order: 1 },
          { id: '2', text: '横', correct: false },
          { id: '3', text: '撇', correct: true, order: 2 },
          { id: '4', text: '捺', correct: true, order: 3 }
        ],
        userAnswers: [],
        correctOrder: [1, 3, 4]
      },
      currentQuiz: {
        id: 'q1',
        parts: [
          { id: 'p1', name: '牙(Shud)', order: 2 },
          { id: 'p2', name: '冠(Titim)', order: 1 },
          { id: 'p3', name: '尾(Suul)', order: 3 }
        ],
        correctOrder: ['p2', 'p1', 'p3'] // 正确顺序
      }
    })
    
    // 这里可以根据 lessonId 切换不同的课程数据
    // 例如：
    // const newLesson = lessonData[lessonId]
    // this.setData({ currentLesson: newLesson })
  },

  // 个人状态栏交互 - 跳转到"我"页面
  onSubmitForScoring() {
    const { allStrokes, currentLesson } = this.data

    if (!allStrokes || allStrokes.length === 0) {
      wx.showToast({ title: '请先完成书写', icon: 'none' })
      return
    }

    const requestData = {
      wordKey: currentLesson?.id || 'narasu',
      strokes: allStrokes
    }

    wx.showLoading({ title: '蒙宝评分中...' })

    wx.cloud.callFunction({
      name: 'score-writing',
      data: requestData,
      success: (res) => {
        const payload = res?.result
        if (payload?.success && payload.result) {
          this._handleScoringResult(payload.result)
          return
        }

        console.warn('[score-writing] fallback to local scoring:', payload)
        this._useLocalScoring(requestData)
      },
      fail: (error) => {
        console.warn('[score-writing] cloud failed, fallback to local scoring:', error)
        this._useLocalScoring(requestData)
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  _handleScoringResult(result) {
    const totalScore = Number(result?.totalScore || 0)
    const strokeAccuracy = Number(result?.strokeAccuracy || result?.structureScore || 0)
    const structureScore = Number(result?.structureOverlap || result?.fluencyScore || 0)
    const fluencyScore = Number(result?.fluency || result?.rhythmScore || 0)

    const summary = `笔顺准确度 ${strokeAccuracy.toFixed(1)}，结构重合度 ${structureScore.toFixed(1)}，运笔流畅度 ${fluencyScore.toFixed(1)}。`

    this.setData({
      showScoringModal: true,
      scoringScore: Number(totalScore.toFixed(1)),
      scoringDetail: {
        totalScore: totalScore.toFixed(1),
        strokeAccuracy: strokeAccuracy.toFixed(1),
        structureOverlap: structureScore.toFixed(1),
        fluency: fluencyScore.toFixed(1),
        structureScore: strokeAccuracy.toFixed(1),
        fluencyScore: structureScore.toFixed(1),
        rhythmScore: fluencyScore.toFixed(1),
        feedback: `${summary}${result?.feedback || '蒙宝点评：继续保持，你的笔势越来越稳了。'}`
      }
    })
  },

  _useLocalScoring(requestData) {
    const DTWAlgorithm = require('./services/dtw-algorithm.js').DTWAlgorithm
    const dtw = new DTWAlgorithm()
    const templates = {
      narasu: [
        { points: [{ x: 50, y: 100, t: 0, w: 5 }, { x: 80, y: 60, t: 100, w: 5 }, { x: 120, y: 60, t: 200, w: 5 }, { x: 150, y: 100, t: 300, w: 5 }] },
        { points: [{ x: 70, y: 60, t: 0, w: 4 }, { x: 110, y: 60, t: 80, w: 3 }] }
      ],
      huch: [
        { points: [{ x: 55, y: 95, t: 0, w: 5 }, { x: 90, y: 65, t: 100, w: 5 }, { x: 140, y: 80, t: 220, w: 4 }] },
        { points: [{ x: 75, y: 55, t: 0, w: 4 }, { x: 105, y: 95, t: 120, w: 4 }, { x: 145, y: 120, t: 220, w: 3 }] }
      ],
      hair: [
        { points: [{ x: 50, y: 80, t: 0, w: 5 }, { x: 100, y: 80, t: 100, w: 5 }, { x: 150, y: 120, t: 200, w: 5 }] },
        { points: [{ x: 60, y: 100, t: 0, w: 4 }, { x: 100, y: 100, t: 80, w: 4 }, { x: 140, y: 120, t: 160, w: 3 }] }
      ]
    }

    const templateStrokes = templates[requestData.wordKey] || templates.narasu
    const result = dtw.computeMultiStrokeDTW(requestData.strokes, templateStrokes)
    const similarity = Math.max(0, Math.min(1, result.similarity || 0))
    const strokePenalty = Math.min(20, Math.abs(requestData.strokes.length - templateStrokes.length) * 10)
    const strokeAccuracy = Math.max(0, Math.min(100, similarity * 100 - strokePenalty + 10))
    const structureScore = Math.max(0, Math.min(100, similarity * 92 + 6))
    const fluencyScore = Math.max(0, Math.min(100, similarity * 88 + 8))
    const totalScore = strokeAccuracy * 0.5 + structureScore * 0.3 + fluencyScore * 0.2

    this._handleScoringResult({
      totalScore,
      strokeAccuracy,
      structureOverlap: structureScore,
      fluency: fluencyScore,
      feedback: '蒙宝点评：当前是本地兜底评分，云端部署完成后会切换成正式 DTW 打分。'
    })
  },

  onToggleUserStatus() {
    this.setData({ currentTab: 3 })
  },

  // 导出坐标数据
  onExportCoordinates() {
    const { allStrokes, currentLesson, collectionConfig, userProfile } = this.data
    
    if (!allStrokes || allStrokes.length === 0) {
      wx.showToast({
        title: '暂无笔迹数据',
        icon: 'none'
      })
      return
    }

    const exportData = buildResearchExportPayload({
      strokes: allStrokes,
      currentLesson,
      collectionConfig,
      userProfile,
      systemInfo: this.getDeviceSnapshot(),
      previewFileID: '',
      previewCloudPath: ''
    })
    const summary = exportData.sample?.summary || summarizeStrokes(allStrokes)

    this.setData({
      showCoordinateModal: true,
      coordinateData: exportData,
      coordinateJson: JSON.stringify(exportData, null, 2),
      coordinateStats: {
        strokeCount: summary.strokeCount || 0,
        pointCount: summary.pointCount || 0
      },
      isExporting: false,
      collectionSubmitResult: null
    })
  },

  // 关闭坐标数据弹窗
  onCloseCoordinateModal() {
    this.setData({ showCoordinateModal: false }, () => {
      this.restoreWritingSurface()
    })
  },

  // 复制数据到剪贴板
  onCopyCoordinates() {
    const { coordinateData } = this.data
    if (!coordinateData) return

    wx.setClipboardData({
      data: JSON.stringify(coordinateData, null, 2),
      success: () => {
        wx.showToast({
          title: '笔迹已化为数据之骨，可供传承与推演',
          icon: 'none',
          duration: 2000
        })
      }
    })
  },

  // 下载坐标数据文件
  onDownloadCoordinates() {
    const { coordinateData } = this.data
    if (!coordinateData) return

    const fileName = `trajectory_sample_${coordinateData.sample?.sampleLocalId || Date.now()}.json`
    const fileContent = JSON.stringify(coordinateData, null, 2)

    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

    fs.writeFile({
      filePath: filePath,
      data: fileContent,
      encoding: 'utf8',
      success: () => {
        wx.showModal({
          title: '文件已生成',
          content: `文件路径: ${fileName}`,
          confirmText: '查看文件',
          cancelText: '关闭',
          success: (res) => {
            if (res.confirm) {
              wx.openDocument({
                filePath: filePath,
                fileType: 'json',
                showMenu: true,
                success: () => {
                  wx.showToast({
                    title: '文件已打开',
                    icon: 'success'
                  })
                },
                fail: (err) => {
                  console.error('打开文件失败', err)
                  wx.showToast({
                    title: '打开失败',
                    icon: 'none'
                  })
                }
              })
            }
          }
        })
      },
      fail: (err) => {
        console.error('写入文件失败', err)
        wx.showToast({
          title: '写入失败',
          icon: 'none'
        })
      }
    })
  },

  onOpenCollectionSetup() {
    const nextConfig = this.ensureCollectionConfig()
    this.syncCollectionConfigWithLesson(this.data.currentLesson)
    this.setData({
      showCollectionSetup: true,
      collectionConfig: this.decorateCollectionConfig({
        ...nextConfig,
        ...this.data.collectionConfig
      })
    })
  },

  onCloseCollectionSetup() {
    this.setData({ showCollectionSetup: false }, () => {
      this.restoreWritingSurface()
    })
  },

  onCollectionInput(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    this.setData({
      [`collectionConfig.${field}`]: e.detail.value
    })
  },

  onSelectCollectionRole(e) {
    const role = e.currentTarget.dataset.value
    if (!role) return
    this.setData({
      collectionConfig: this.decorateCollectionConfig({
        ...(this.data.collectionConfig || {}),
        role
      })
    })
  },

  onSelectCollectionScript(e) {
    const scriptType = e.currentTarget.dataset.value
    if (!scriptType) return
    this.setData({
      collectionConfig: this.decorateCollectionConfig({
        ...(this.data.collectionConfig || {}),
        scriptType,
        taskId: `${scriptType}-${this.data.currentLesson?.id || 'freewrite'}`
      })
    })
  },

  onSaveCollectionSetup() {
    const merged = this.decorateCollectionConfig({
      ...this.buildDefaultCollectionConfig(this.data.currentLesson),
      ...(this.data.collectionConfig || {})
    })
    this.setData({
      collectionConfig: merged,
      showCollectionSetup: false
    }, () => {
      this.restoreWritingSurface()
    })
    wx.setStorageSync('collectionConfig', merged)
    wx.showToast({
      title: '采集设置已保存',
      icon: 'success'
    })
  },

  async onOpenCollectionRecords() {
    const pending = (wx.getStorageSync('pendingTrajectorySamples') || []).map((item) => ({
      id: item.id,
      taskLabel: item.payload?.task?.taskLabel || '离线待同步',
      scriptType: item.payload?.task?.scriptTypeLabel || item.payload?.task?.scriptType || '未知',
      role: item.payload?.participant?.roleLabel || item.payload?.participant?.role || '未知',
      qualityStatus: 'pending',
      reviewStatus: 'local-pending',
      pointCount: item.payload?.sample?.summary?.pointCount || 0,
      strokeCount: item.payload?.sample?.summary?.strokeCount || 0,
      submittedAt: item.createdAt
    }))

    this.setData({
      showCollectionRecords: true,
      isLoadingCollectionRecords: true,
      allCollectionRecords: pending,
      collectionRecords: pending
    })

    try {
      const response = await wx.cloud.callFunction({
        name: 'trajectory-collection',
        data: {
          action: 'listMySamples',
          limit: 30
        }
      })

      const cloudSamples = response?.result?.success ? (response.result.data?.samples || []) : []

      this.applyCollectionRecordFilters([...pending, ...cloudSamples])
    } catch (error) {
      console.error('[Collection] load records failed:', error)
      this.applyCollectionRecordFilters(pending)
    } finally {
      this.setData({ isLoadingCollectionRecords: false })
    }
  },

  onSelectCollectionRecordFilter(e) {
    const value = e.currentTarget.dataset.value || 'all'
    this.setData({
      collectionRecordFilter: value
    }, () => {
      this.applyCollectionRecordFilters()
    })
  },

  onOpenCollectionRecordDetail(e) {
    const record = e.currentTarget.dataset.record || {}
    this.setData({
      selectedCollectionRecord: record,
      showCollectionRecordDetail: true
    })
  },

  onCloseCollectionRecordDetail() {
    this.setData({
      showCollectionRecordDetail: false,
      selectedCollectionRecord: {}
    })
  },

  async onUpdateCollectionReviewStatus(e) {
    const reviewStatus = e.currentTarget.dataset.status
    const sampleId = this.data.selectedCollectionRecord?.id
    if (!sampleId || !reviewStatus) {
      return
    }

    if (String(sampleId).startsWith('pending-')) {
      wx.showToast({
        title: '离线样本请先同步',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '更新状态...', mask: true })
    try {
      const response = await wx.cloud.callFunction({
        name: 'trajectory-collection',
        data: {
          action: 'updateReviewStatus',
          sampleId,
          reviewStatus
        }
      })

      if (!response?.result?.success) {
        throw new Error(response?.result?.error || 'updateReviewStatus failed')
      }

      const nextRecord = {
        ...this.data.selectedCollectionRecord,
        reviewStatus
      }

      const nextRecords = (this.data.allCollectionRecords || []).map((item) => (
        item.id === sampleId ? { ...item, reviewStatus } : item
      ))

      this.setData({
        selectedCollectionRecord: nextRecord
      })
      this.applyCollectionRecordFilters(nextRecords)

      wx.showToast({
        title: '状态已更新',
        icon: 'success'
      })
    } catch (error) {
      console.error('[Collection] update review status failed:', error)
      wx.showToast({
        title: '状态更新失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  onCloseCollectionRecords() {
    this.setData({ showCollectionRecords: false }, () => {
      this.restoreWritingSurface()
    })
  },

  async onSyncPendingCollectionSamples() {
    const pending = wx.getStorageSync('pendingTrajectorySamples') || []
    if (!pending.length) {
      wx.showToast({
        title: '没有离线样本',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '同步离线样本...', mask: true })
    const userProfile = this.data.userProfile || {}
    const remain = []
    let successCount = 0

    for (const item of pending) {
      try {
        const response = await wx.cloud.callFunction({
          name: 'trajectory-collection',
          data: {
            action: 'submitSample',
            payload: item.payload,
            profile: {
              nickname: userProfile.nickName || userProfile.nickname || '未命名用户',
              avatar: userProfile.avatarUrl || userProfile.avatar || ''
            },
            collectionConfig: this.data.collectionConfig,
            appVersion: '3.3.2',
            qualityStatus: 'pending'
          }
        })

        if (response?.result?.success) {
          successCount += 1
        } else {
          remain.push(item)
        }
      } catch (error) {
        console.error('[Collection] sync pending failed:', error)
        remain.push(item)
      }
    }

    wx.setStorageSync('pendingTrajectorySamples', remain)
    wx.hideLoading()

    wx.showToast({
      title: successCount ? `已同步 ${successCount} 条` : '同步失败',
      icon: successCount ? 'success' : 'none'
    })

    this.onOpenCollectionRecords()
  },

  async onSubmitCollectionSample() {
    const { allStrokes, currentLesson, collectionConfig, userProfile } = this.data
    if (!allStrokes || !allStrokes.length) {
      wx.showToast({
        title: '请先完成书写',
        icon: 'none'
      })
      return
    }

    this.setData({
      isExporting: true,
      collectionSubmitResult: null
    })
    wx.showLoading({ title: '提交采集中...', mask: true })

    let payload = null
    try {
      payload = buildResearchExportPayload({
        strokes: allStrokes,
        currentLesson,
        collectionConfig,
        userProfile,
        systemInfo: this.getDeviceSnapshot(),
        previewFileID: '',
        previewCloudPath: ''
      })

      const submitRes = await wx.cloud.callFunction({
        name: 'trajectory-collection',
        data: {
          action: 'submitSample',
          payload,
          profile: {
            nickname: userProfile.nickName || userProfile.nickname || '未命名用户',
            avatar: userProfile.avatarUrl || userProfile.avatar || ''
          },
          collectionConfig,
          appVersion: '3.3.2',
          qualityStatus: 'pending'
        }
      })

      const result = submitRes?.result
      if (!result?.success) {
        throw new Error(result?.error || '提交采集失败')
      }

      try {
        const previewPath = await this.captureSimpleCanvasPreview(true)
        const cloudPath = `trajectory-samples/${Date.now()}-${currentLesson?.id || 'freewrite'}.jpg`
        await wx.cloud.uploadFile({
          cloudPath,
          filePath: previewPath
        })
      } catch (previewError) {
        console.warn('[Collection] preview upload skipped:', previewError)
      }

      this.setData({
        coordinateData: payload,
        coordinateJson: JSON.stringify(payload, null, 2),
        collectionSubmitResult: result.data || null,
        showCoordinateModal: true
      })
      wx.showToast({
        title: '采集样本已提交',
        icon: 'success'
      })
    } catch (error) {
      console.error('[Collection] submit failed:', error)
      const pendingPayload = payload || buildResearchExportPayload({
        strokes: allStrokes,
        currentLesson,
        collectionConfig,
        userProfile,
        systemInfo: this.getDeviceSnapshot(),
        previewFileID: '',
        previewCloudPath: ''
      })
      const pendingItem = this.cachePendingCollectionSample(
        pendingPayload,
        error?.errMsg || error?.message || 'cloud submit failed'
      )
      this.setData({
        coordinateData: pendingPayload,
        coordinateJson: JSON.stringify(pendingPayload, null, 2),
        collectionSubmitResult: {
          sampleId: pendingItem.id,
          sessionId: 'local-pending',
          offline: true
        },
        showCoordinateModal: true
      })
      wx.showToast({
        title: '云端失败，已离线保存',
        icon: 'none',
        duration: 2200
      })
      wx.showModal({
        title: '采集云端提交失败',
        content: error?.errMsg || error?.message || 'trajectory-collection submit failed',
        showCancel: false
      })
    } finally {
      this.setData({ isExporting: false })
      wx.hideLoading()
    }
  },

  // 打开挑战弹窗 - 五题连续挑战模式
  onOpenChallenge() {
    // 从完整题库中随机抽取5道题
    const fullLibrary = this.data.fullQuizLibrary;
    
    // 随机打乱题库并选取5题
    const shuffled = [...fullLibrary].sort(() => Math.random() - 0.5);
    const selectedQuestions = shuffled.slice(0, 5);
    
    // 重置挑战数据
    this.setData({
      showChallengeModal: true,
      currentQuizQuestions: selectedQuestions,
      currentChallengeIndex: 0,
      challengeCorrectCount: 0,
      showChallengeResult: false,
      showResultPanel: false,
      userQuizAnswers: []
    })
    
    // 显示第一题
    this.showNextChallengeQuestion();
  },
  
  // 显示下一题
  showNextChallengeQuestion() {
    const { currentQuizQuestions, currentChallengeIndex } = this.data;
    
    // 深度重置答题状态，防止选项状态残留
    if (currentChallengeIndex < currentQuizQuestions.length) {
      const newQuestion = currentQuizQuestions[currentChallengeIndex];
      
      // 统一处理选项格式：确保为字符串数组
      const cleanOptions = Array.isArray(newQuestion.options) ? 
        newQuestion.options.map(opt => {
          // 如果是对象，提取text字段；如果是字符串，直接使用
          return typeof opt === 'object' && opt !== null ? opt.text || opt : opt;
        }) : newQuestion.options;
      
      // 强制重置所有视觉状态
      const resetOptions = cleanOptions.map((opt, index) => ({
        text: opt,
        className: '',    // 清空高亮类名
        scale: 1.0,       // 强制缩放归位
        checked: false,   // 重置选中状态
        isCorrect: false, // 重置正确状态
        isWrong: false    // 重置错误状态
      }));
      
      this.setData({
        selectedIndex: -1, // 重置选中状态
        isAnswered: false, // 重置答题锁
        showResult: false, // 重置结果显示
        challengeData: {
          ...newQuestion,
          options: cleanOptions, // 用于显示
          optionObjects: resetOptions // 用于状态管理
        }
      }, () => {
        // 在回调中稍微延迟一点再允许点击，防止误触
        setTimeout(() => {
          this.setData({
            isAnsweringEnabled: true
          });
        }, 100);
      });
    }
  },
  
  // 选择挑战选项 - 连续答题流
  onSelectOption(e) {
    const selectedIndex = parseInt(e.currentTarget.dataset.index);
    const { challengeData, currentChallengeIndex, currentQuizQuestions, challengeCorrectCount, userQuizAnswers } = this.data;
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' });
    
    // 验证答案
    const isCorrect = selectedIndex === challengeData.answer;
    
    // 记录答案
    const newAnswers = [...userQuizAnswers, {
      questionId: challengeData.id,
      selectedIndex: selectedIndex,
      isCorrect: isCorrect
    }];
    
    // 更新答对数量
    const newCorrectCount = isCorrect ? challengeCorrectCount + 1 : challengeCorrectCount;
    
    // 显示即时反馈
    if (isCorrect) {
      wx.showToast({
        title: '回答正确！',
        icon: 'success',
        duration: 500
      });
    } else {
      wx.showToast({
        title: '回答错误',
        icon: 'error',
        duration: 500
      });
    }
    
    // 更新数据并延迟进入下一题
    this.setData({
      userQuizAnswers: newAnswers,
      challengeCorrectCount: newCorrectCount
    });
    
    // 延迟0.5秒后显示下一题或结算
    setTimeout(() => {
      const nextIndex = currentChallengeIndex + 1;
      
      if (nextIndex < currentQuizQuestions.length) {
        // 还有下一题
        this.setData({
          currentChallengeIndex: nextIndex
        });
        this.showNextChallengeQuestion();
      } else {
        // 挑战完成，显示结果
        this.setData({
          showChallengeResult: true
        });
        
        // 延迟绘制雷达图，确保DOM已更新
        setTimeout(() => {
          this.drawRadarInResultPanel();
        }, 100);
      }
    }, 800);
  },

  // 关闭挑战弹窗
  onCloseChallenge() {
    this.setData({ showChallengeModal: false, showChallengeResult: false })
  },

  // 在结算面板中绘制雷达图
  drawRadarInResultPanel() {
    // 获取雷达图Canvas上下文
    const query = wx.createSelectorQuery()
    query.select('#radarCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0]) {
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const { width, height } = res[0].size
          
          // 设置Canvas尺寸
          canvas.width = width
          canvas.height = height
          
          // 生成雷达图数据
          const radarData = this.generateRadarData('SS')
          
          // 绘制雷达图
          this.drawRadarChart(ctx, width / 2, height / 2, Math.min(width, height) / 2 - 20, radarData)
        }
      })
  },

  // 领取奖励 - 五题连续挑战结算
  onClaimReward() {
    const { challengeCorrectCount, userProfile } = this.data;
    
    // 计算奖励：答对题数 * 5 墨玉
    const reward = challengeCorrectCount * 5;
    
    // 更新用户墨玉数量
    const newInkJades = userProfile.inkJades + reward;
    
    this.setData({
      userProfile: {
        ...userProfile,
        inkJades: newInkJades
      },
      showChallengeResult: false,
      showResultPanel: false,
      showChallengeModal: false
    });
    
    // 显示获得奖励提示
    wx.showToast({
      title: `获得 💎x${reward}`,
      icon: 'none',
      duration: 1500
    });
  },

  // 购买商品（已废弃，改为荣誉系统）
  onBuyItem(e) {
    wx.showToast({ title: '所有功能已免费开放！', icon: 'none' });
  },

  // 购买补给包
  onBuyGacha() {
    const { userProfile } = this.data
    
    // 检查墨玉是否足够
    if (userProfile.inkJades >= 20) {
      // 扣除墨玉
      const newInkJades = userProfile.inkJades - 20
      
      // 随机结果
      const results = [
        '文化冷知识：蒙古文是世界上唯一一种竖写的拼音文字',
        '文化冷知识：蒙古族传统节日那达慕大会已有700多年历史',
        '文化冷知识：蒙古包的结构设计有利于抵抗草原上的大风',
        '返现：获得墨玉 +5',
        '返现：获得墨玉 +3'
      ]
      
      const randomResult = results[Math.floor(Math.random() * results.length)]
      
      // 处理返现
      let finalInkJades = newInkJades
      if (randomResult.includes('返现')) {
        const reward = parseInt(randomResult.match(/\+(\d+)/)[1])
        finalInkJades += reward
      }
      
      this.setData({
        'userProfile.inkJades': finalInkJades
      })
      
      // 显示结果
      wx.showModal({
        title: '补给包结果',
        content: randomResult,
        showCancel: false
      })
    } else {
      wx.showToast({
        title: '墨玉不足',
        icon: 'none'
      })
    }
  },

  // 添加奖励函数
  addReward(score) {
    const { userProfile } = this.data
    
    // 增加墨玉
    const newInkJades = userProfile.inkJades + score
    
    // 增加经验值
    const newExp = userProfile.exp + score * 10
    
    // 检查是否升级
    let newLevel = userProfile.level
    let newTitle = userProfile.title
    
    // 简单的升级规则
    if (newExp >= newLevel * 100) {
      newLevel += 1
      // 更新称号
      const titles = ['牧羊人', '学徒', '匠人', '大师', '宗师']
      if (newLevel <= titles.length) {
        newTitle = titles[newLevel - 1]
      }
      
      wx.showToast({
        title: `升级了！现在是 ${newTitle} Lv.${newLevel}`,
        icon: 'success'
      })
    }
    
    // 更新用户数据
    this.setData({
      userProfile: {
        ...userProfile,
        inkJades: newInkJades,
        exp: newExp,
        level: newLevel,
        title: newTitle
      }
    })
    
    // 提示获得奖励
    wx.showToast({
      title: `获得 +${score} 墨玉`,
      icon: 'none'
    })
  },
  // -----------------------------
  
  // === 简繁转换映射表（书法落款专用） ===
  calligraphyMap: {
    // 1. 组员名字专项（确保精准）
    '洋': '洋', '沥': '瀝', '湘': '湘', '源': '源', '魏': '魏',
    '语': '語', '莘': '莘', '祁': '祁', '骞': '騫', '彧': '彧',
    '张': '張', '李': '李', '王': '王', '刘': '劉', '陈': '陳',
    '杨': '楊', '黄': '黃', '赵': '趙', '周': '周', '吴': '吳',
    '郑': '鄭', '冯': '馮', '褚': '褚', '卫': '衛',
    '蒋': '蔣', '沈': '沈', '韩': '韓', '朱': '朱',
    '秦': '秦', '尤': '尤', '许': '許', '何': '何', '吕': '呂',
    '施': '施', '孔': '孔', '曹': '曹', '严': '嚴',
    '华': '華', '金': '金', '陶': '陶', '姜': '薑',
    '谢': '謝', '邹': '鄒', '喻': '喻', '柏': '柏', '水': '水',
    '窦': '竇', '章': '章', '云': '雲', '苏': '蘇', '潘': '潘',
    '葛': '葛', '奚': '奚', '范': '範', '彭': '彭', '郎': '郎',
    
    // 2. 书法常用动词/职衔
    '书': '書', '印': '印', '制': '製', '笔': '筆', '墨': '墨',
    '画': '畫', '写': '寫', '题': '題', '志': '誌', '撰': '撰',
    '师': '師', '生': '生', '徒': '徒', '友': '友', '斋': '齋',
    '作': '作', '著': '著', '临': '臨', '摹': '摹', '习': '習',
    '藏': '藏', '赏': '賞', '鉴': '鑑', '定': '定', '真': '真',
    
    // 3. 时间与天干地支（落款灵魂）
    '年': '年', '岁': '歲', '月': '月', '时': '時', '节': '節',
    '春': '春', '夏': '夏', '秋': '秋', '冬': '冬',
    '东': '東', '南': '南', '西': '西', '北': '北',
    '龙': '龍', '马': '馬', '凤': '鳳', '虎': '虎', '蛇': '蛇',
    '牛': '牛', '羊': '羊', '猴': '猴', '鸡': '雞', '狗': '狗',
    '猪': '豬', '鼠': '鼠', '兔': '兔', '甲': '甲', '乙': '乙',
    '丙': '丙', '丁': '丁', '戊': '戊', '己': '己', '庚': '庚',
    '辛': '辛', '壬': '壬', '癸': '癸', '子': '子', '丑': '丑',
    
    // 4. 蒙格项目核心词
    '蒙': '蒙', '格': '格', '穿': '穿', '梭': '梭', '苏': '蘇',
    '学': '學', '传': '傳', '承': '承', '艺': '藝', '术': '術',
    '国': '國', '华': '華', '万': '萬', '礼': '禮', '宝': '寶',
    '中': '中', '文': '文', '化': '化', '创': '創',
    '新': '新', '先': '先', '锋': '鋒', '梦': '夢', '想': '想',
    
    // 5. 常见书法术语
    '神': '神', '韵': '韻', '气': '氣', '意': '意', '境': '境',
    '形': '形', '骨': '骨', '肉': '肉', '血': '血',
    '筋': '筋', '脉': '脈', '力': '力', '势': '勢',
    '致': '致', '趣': '趣', '味': '味', '雅': '雅', '俗': '俗',
    '古': '古', '今': '今', '奇': '奇', '拙': '拙',
    '巧': '巧', '生': '生', '熟': '熟', '老': '老', '嫩': '嫩',
    
    // 6. 更多常用字
    '爱': '愛', '见': '見', '听': '聽', '说': '說', '读': '讀',
    '诗': '詩', '词': '詞', '曲': '曲',
    '法': '法', '纸': '紙',
    '砚': '硯', '香': '香', '茶': '茶', '酒': '酒', '花': '花',
    '鸟': '鳥', '鱼': '魚', '虫': '蟲', '兽': '獸', '山': '山',
    '雨': '雨', '雪': '雪', '风': '風',
    '星': '星', '辰': '辰', '天': '天',
    '地': '地', '人': '人', '心': '心', '手': '手', '足': '足',
    '头': '頭', '眼': '眼', '耳': '耳', '口': '口', '鼻': '鼻',
    '面': '面', '眉': '眉', '发': '髮', '齿': '齒', '舌': '舌',
    '声': '聲', '色': '色', '触': '觸',
    '冷': '冷', '热': '熱', '光': '光', '暗': '暗', '大': '大',
    '小': '小', '长': '長', '短': '短', '高': '高', '低': '低',
    '厚': '厚', '薄': '薄', '轻': '輕', '重': '重', '软': '軟',
    '硬': '硬', '方': '方', '圆': '圓', '直': '直', '弯': '彎',
    '平': '平', '正': '正', '斜': '斜', '横': '橫', '竖': '豎',
    '进': '進', '退': '退', '出': '出', '入': '入', '开': '開',
    '关': '關', '起': '起', '止': '止', '行': '行', '走': '走',
    '飞': '飛', '跑': '跑', '跳': '跳', '坐': '坐', '立': '立',
    '卧': '臥', '蹲': '蹲', '伏': '伏', '倚': '倚', '靠': '靠',
    '抱': '抱', '携': '攜', '持': '持', '握': '握', '抛': '拋',
    '投': '投', '拾': '拾', '捧': '捧', '担': '擔', '挑': '挑',
    '抬': '抬', '扛': '扛', '推': '推', '拉': '拉', '挤': '擠',
    '压': '壓', '按': '按', '摸': '摸', '拍': '拍', '打': '打',
    '砸': '砸', '锤': '錘', '钉': '釘', '凿': '鑿', '锯': '鋸',
    '刨': '刨', '削': '削', '切': '切', '割': '割', '刺': '刺',
    '扎': '扎', '缝': '縫', '补': '補', '绽': '綻', '绣': '繡',
    '织': '織', '纺': '紡', '染': '染', '洗': '洗', '澡': '澡',
    '沐': '沐', '浴': '浴', '洁': '潔', '净': '淨', '秽': '穢',
    '祥': '祥', '福': '福', '禄': '祿', '寿': '壽', '喜': '喜',
    '吉': '吉', '凶': '凶', '祸': '禍', '灾': '災', '难': '難',
    '离': '離', '合': '合', '分': '分', '聚': '聚', '散': '散',
    '穷': '窮', '富': '富', '贵': '貴', '贱': '賤', '卑': '卑',
    '尊': '尊', '上': '上', '下': '下',
    '左': '左', '右': '右', '前': '前', '后': '後', '里': '裡',
    '外': '外', '内': '內', '旁': '旁', '边': '邊',
    '际': '際', '界': '界', '限': '限', '度': '度', '量': '量',
    '衡': '衡', '间': '間', '空': '空', '宙': '宙',
    '宇': '宇', '天地': '天地', '宇宙': '宇宙', '洪荒': '洪荒',
    '乾坤': '乾坤', '玄黄': '玄黃', '辰宿': '辰宿', '列张': '列張',
    '寒来': '寒來', '暑往': '暑往', '秋收': '秋收', '冬藏': '冬藏',
    '闰余': '閏餘', '成岁': '成歲', '律吕': '律呂', '调阳': '調陽',
    '云腾': '雲騰', '致雨': '致雨', '露结': '露結', '为霜': '為霜',
    '金生': '金生', '丽水': '麗水', '玉出': '玉出', '昆冈': '昆岡',
    '剑号': '劍號', '巨阙': '巨闕', '珠称': '珠稱', '夜光': '夜光',
    '果珍': '果珍', '李柰': '李柰', '菜重': '菜重', '芥姜': '芥薑',
    '海咸': '海鹹', '河淡': '河淡', '鳞潜': '鱗潛', '羽翔': '羽翔',
    '龙师': '龍師', '火帝': '火帝', '鸟官': '鳥官', '人皇': '人皇',
    '始制': '始制', '文字': '文字', '乃服': '乃服', '衣裳': '衣裳',
    '推位': '推位', '让国': '讓國', '有虞': '有虞', '陶唐': '陶唐',
    '吊民': '吊民', '伐罪': '伐罪', '周发': '周發', '殷汤': '殷湯',
    '坐朝': '坐朝', '问道': '問道', '垂拱': '垂拱', '平章': '平章',
    '爱育': '愛育', '黎首': '黎首', '臣伏': '臣伏', '戎羌': '戎羌',
    '遐迩': '遐邇', '一体': '一體', '率宾': '率賓', '归王': '歸王',
    '鸣凤': '鳴鳳', '在树': '在樹', '白驹': '白駒', '食场': '食場',
    '化被': '化被', '草木': '草木', '赖及': '賴及', '万方': '萬方',
    '盖此': '蓋此', '身发': '身髮', '四大': '四大', '五常': '五常',
    '恭惟': '恭惟', '鞠养': '鞠養', '岂敢': '豈敢', '毁伤': '毀傷',
    '女慕': '女慕', '贞洁': '貞潔', '男效': '男效', '良才': '良材',
    '知过': '知過', '必改': '必改', '得能': '能', '莫忘': '莫忘',
    '罔谈': '罔談', '彼短': '彼短', '靡恃': '靡恃', '己长': '己長',
    '信使': '信使', '可覆': '可覆', '器欲': '器欲', '难量': '難量',
    '墨悲': '墨悲', '丝染': '絲染', '诗赞': '詩贊', '羔羊': '羔羊'
  },
  
  // 智能书法繁体化转换函数
  convertToTraditional(str) {
    if (!str) return '';
    const map = this.calligraphyMap;
    return str.split('').map(char => map[char] || char).join('');
  },

  // --- 突破性设计增强方法 ---

  // 触发触觉反馈
  triggerHapticFeedback(type = 'light') {
    if (type === 'light') {
      wx.vibrateShort({ type: 'light' });
    } else if (type === 'medium') {
      wx.vibrateShort({ type: 'medium' });
    } else if (type === 'heavy') {
      wx.vibrateShort({ type: 'heavy' });
    }
  },

  // 提示框拖拽处理函数
  onTipMove(e) {
    const { x, y } = e.detail;
    this.setData({
      tipPosition: {
        x: x,
        y: y
      }
    });
  },

  // 提示框折叠/展开切换
  onToggleTip() {
    this.setData({
      isTipCollapsed: !this.data.isTipCollapsed
    });
  },

  // 安全的动画过渡设置
  animateStateChange(keyPath, value, duration = 300) {
    return new Promise((resolve) => {
      this.setData({
        [keyPath]: value
      }, () => {
        setTimeout(resolve, duration);
      });
    });
  },

  // 批量状态更新与动画回调
  batchStateUpdate(updates, callback) {
    this.setData(updates, () => {
      if (callback && typeof callback === 'function') {
        callback();
      }
    });
  },
  
  // 侧边栏展开动画
  async expandSidebar() {
    this.triggerHapticFeedback('medium');
    await this.animateStateChange('showToolbox', true, 500);
  },

  // 侧边栏收起动画
  async collapseSidebar() {
    this.triggerHapticFeedback('light');
    await this.animateStateChange('showToolbox', false, 400);
  },

  // 切换侧边栏状态
  async onToggleToolbox() {
    if (this.data.showToolbox) {
      await this.collapseSidebar();
    } else {
      await this.expandSidebar();
    }
  },

  // 切换左侧边栏（字帖、落款、试炼）
  onToggleLeftSidebar() {
    this.triggerHapticFeedback('light');
    this.setData({
      showLeftSidebar: !this.data.showLeftSidebar
    });
  },

  // 左侧边栏标签切换
  onSelectLeftTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      leftSidebarTab: tab
    });
  },

  // 右滑关闭左侧边栏
  onSwipeCloseLeftSidebar() {
    if (this.data.showLeftSidebar) {
      this.setData({
        showLeftSidebar: false
      });
    }
  },

  // TabBar 切换
  onTabChange(e) {
    const tabId = Number(e.currentTarget.dataset.tabId)
    const tab = this.data.tabs.find((item) => item.id === tabId)
    if (tab && tab.pagePath) {
      wx.navigateTo({
        url: tab.pagePath
      })
      return
    }
    this.setData({ currentTab: tabId })
    console.log('[TabBar] 切换到 Tab:', tabId)
    
    if (tabId === 0) {
      setTimeout(() => {
        console.log('[TabBar] 重新初始化画布')
        this.initCanvas()
        this.initSimpleCanvas()
        this.setData({ _forceUpdate: Date.now() })
      }, 100)
    } else if (tabId === 2) {
      this.loadCommunityPosts()
    }
  },

  ensureCommunityAuth() {
    if (this.data.identityState === 'UNAUTH' || !this.data.userProfile) {
      wx.showToast({ title: '\u8bf7\u5148\u5fae\u4fe1\u767b\u5f55', icon: 'none' })
      return false
    }
    return true
  },

  getCommunityProfile() {
    return {
      avatar: this.data.userProfile.avatarUrl || this.data.userProfile.avatar || '🙂',
      nickname: this.data.userProfile.nickName || this.data.userProfile.nickname || '\u58a8\u5ba2'
    }
  },

  async callCommunityFunction(action, payload = {}) {
    const response = await wx.cloud.callFunction({
      name: 'community',
      data: {
        action,
        ...payload
      }
    })
    const result = response?.result || {}
    if (!result.success) {
      throw new Error(result.message || 'community action failed')
    }
    return result.data
  },

  // 加载社区帖子（从云端）
  async loadCommunityPosts() {
    wx.showLoading({ title: '\u52a0\u8f7d\u4e2d...' })
    try {
      const data = await this.callCommunityFunction('list', {
        limit: 50,
        skip: 0
      })
      const posts = data.posts || []
      this.setData({
        communityPosts: posts.length ? posts : this.data.communityPosts,
        hasMorePosts: posts.length >= 50,
        currentPage: 1
      })
    } catch (error) {
      console.error('加载帖子失败', error)
    } finally {
      wx.hideLoading()
    }
  },

  // 下拉刷新
  async onPullDownRefresh() {
    this.setData({
      refresherTriggered: true,
      currentPage: 1
    })
    try {
      const data = await this.callCommunityFunction('list', {
        limit: 50,
        skip: 0
      })
      const posts = data.posts || []
      this.setData({
        communityPosts: posts.length ? posts : this.data.communityPosts,
        refresherTriggered: false,
        hasMorePosts: posts.length >= 50
      })
    } catch (err) {
      console.error('刷新失败', err)
      this.setData({ refresherTriggered: false })
    }
    wx.stopPullDownRefresh()
  },

  // 加载更多帖子
  async onLoadMorePosts() {
    if (this.data.isLoadingPosts || !this.data.hasMorePosts) {
      return
    }
    
    this.setData({ isLoadingPosts: true })
    const nextPage = this.data.currentPage + 1
    const skip = (nextPage - 1) * 50

    try {
      const data = await this.callCommunityFunction('list', {
        limit: 50,
        skip
      })
      const newPosts = data.posts || []
      this.setData({
        communityPosts: [...this.data.communityPosts, ...newPosts],
        currentPage: nextPage,
        isLoadingPosts: false,
        hasMorePosts: newPosts.length >= 50
      })
    } catch (err) {
      this.setData({ isLoadingPosts: false })
      console.error('加载更多失败', err)
    }
  },

  // 每日签到
  onDailyCheckin() {
    const today = new Date().toDateString()
    if (this.data.lastCheckInDate === today) {
      wx.showToast({ title: '今天已经签到过了', icon: 'none' })
      return
    }
    
    const newStreak = (this.data.userProfile.streak || 0) + 1
    const rewardJades = Math.min(newStreak * 2, 10)
    const newInkJades = (this.data.userProfile.inkJades || 0) + rewardJades
    
    this.setData({
      hasCheckedIn: true,
      lastCheckInDate: today,
      'userProfile.streak': newStreak,
      'userProfile.inkJades': newInkJades
    })
    
    wx.setStorageSync('lastCheckInDate', today)
    wx.setStorageSync('userProfile', this.data.userProfile)
    
    wx.showToast({ 
      title: `签到成功！+${rewardJades}墨玉`, 
      icon: 'success' 
    })
    wx.vibrateShort({ type: 'light' })
  },

  // 加载签到状态
  loadCheckinStatus() {
    const today = new Date().toDateString()
    const lastDate = wx.getStorageSync('lastCheckInDate')
    this.setData({
      hasCheckedIn: lastDate === today,
      lastCheckInDate: lastDate || ''
    })
  },

  // 我的帖子
  onGoToMyPosts() {
    wx.showToast({ title: '我的帖子功能开发中', icon: 'none' })
  },

  // 我的点赞
  onGoToMyLikes() {
    wx.showToast({ title: '我的点赞功能开发中', icon: 'none' })
  },

  // 我的收藏
  onGoToMyCollection() {
    wx.showToast({ title: '我的收藏功能开发中', icon: 'none' })
  },

  // 成就中心
  onGoToAchievements() {
    wx.showToast({ title: '成就中心功能开发中', icon: 'none' })
  },

  // 编辑头像
  onEditAvatar() {
    this.setData({
      showEditAvatar: true,
      selectedAvatar: this.data.userProfile.avatarUrl || '👤'
    })
  },

  // 编辑用户名
  onEditNickname() {
    this.setData({
      showEditNickname: true,
      tempNickname: this.data.userProfile.nickName || ''
    })
  },

  // 关闭编辑弹窗
  onCloseEditModal() {
    this.setData({
      showEditAvatar: false,
      showEditNickname: false
    })
  },

  // 选择头像
  onSelectAvatar(e) {
    const avatar = e.currentTarget.dataset.avatar
    this.setData({ selectedAvatar: avatar })
  },

  // 上传图片作为头像
  onUploadAvatar() {
    const that = this
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        that.setData({ selectedAvatar: res.tempFilePaths[0] })
      }
    })
  },

  // 确认头像
  onConfirmAvatar() {
    const newProfile = { ...this.data.userProfile, avatarUrl: this.data.selectedAvatar }
    this.setData({
      userProfile: newProfile,
      showEditAvatar: false
    })
    wx.setStorageSync('userProfile', newProfile)
    wx.showToast({ title: '头像已更新', icon: 'success' })
  },

  // 用户名输入
  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value })
  },

  // 确认用户名
  onConfirmNickname() {
    if (!this.data.tempNickname.trim()) {
      wx.showToast({ title: '用户名不能为空', icon: 'none' })
      return
    }
    const newProfile = { ...this.data.userProfile, nickName: this.data.tempNickname }
    this.setData({
      userProfile: newProfile,
      showEditNickname: false
    })
    wx.setStorageSync('userProfile', newProfile)
    wx.showToast({ title: '用户名已更新', icon: 'success' })
  },

  // 跳转到订单页面（切换到商城Tab）
  onGoToOrders() {
    this.setData({ currentTab: 1 })
    wx.showToast({ title: '商城即将推出', icon: 'none' })
  },

  // 跳转到我的作品页面
  onGoToMyWorks() {
    if (this.data.myWorks.length === 0) {
      wx.showToast({ title: '暂无作品，去创作一幅吧', icon: 'none' })
      return
    }
    this.setData({ showMyWorksModal: true })
  },

  // 关闭我的作品弹窗
  onCloseMyWorksModal() {
    this.setData({ showMyWorksModal: false })
  },

  // 跳转到设置页面
  onGoToSettings() {
    this.setData({ showSettingsModal: true })
  },

  // 关闭设置弹窗
  onCloseSettingsModal() {
    this.setData({ showSettingsModal: false })
  },

  // 点赞帖子
  async onLikePost(e) {
    if (!this.ensureCommunityAuth()) {
      return
    }
    const postId = e.currentTarget.dataset.id
    const targetPost = this.data.communityPosts.find(post => post.id === postId)
    if (!targetPost || !targetPost._id) {
      return
    }

    try {
      const data = await this.callCommunityFunction('toggleLike', {
        postId: targetPost._id
      })
      const posts = this.data.communityPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            liked: data.liked,
            likes: data.likes,
            showLikeEffect: data.liked
          }
        }
        return post
      })
      this.setData({ communityPosts: posts })
      if (data.liked) {
        wx.vibrateShort({ type: 'light' })
      }
    } catch (error) {
      console.error('点赞失败', error)
      wx.showToast({ title: '\u70b9\u8d5e\u5931\u8d25', icon: 'none' })
    }
  },

  // 打开评论弹窗
  onOpenComment(e) {
    const postId = e.currentTarget.dataset.id
    const post = this.data.communityPosts.find(p => p.id === postId)
    this.setData({
      showCommentModal: true,
      currentPostId: postId,
      currentComments: post.commentsList || [],
      commentText: ''
    })
  },

  // 关闭评论弹窗
  onCloseCommentModal() {
    this.setData({
      showCommentModal: false,
      currentPostId: null,
      currentComments: [],
      replyTargetNickname: '',
      commentText: ''
    })
  },

  // 评论输入
  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  // 发送评论
  onSendComment() {
    return this.onSendCommentCloud()
  },

  // 打开发帖弹窗
  onOpenPostModal() {
    this.setData({
      showPostModal: true,
      postContent: '',
      postImages: []
    })
  },

  // 关闭发帖弹窗
  onClosePostModal() {
    this.setData({
      showPostModal: false,
      postContent: '',
      postImages: []
    })
  },

  // 发帖内容输入
  onPostContentInput(e) {
    this.setData({ postContent: e.detail.value })
  },

  // 添加帖子图片
  onAddPostImage() {
    const that = this
    wx.chooseImage({
      count: 9 - this.data.postImages.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        that.setData({
          postImages: [...that.data.postImages, ...res.tempFilePaths]
        })
      }
    })
  },

  // 移除帖子图片
  onRemovePostImage(e) {
    const index = e.currentTarget.dataset.index
    const newImages = [...this.data.postImages]
    newImages.splice(index, 1)
    this.setData({ postImages: newImages })
  },

  // 发布帖子
  onSubmitPost() {
    if (!this.data.postContent.trim() && this.data.postImages.length === 0) {
      wx.showToast({ title: '请输入内容或添加图片', icon: 'none' })
      return
    }

    wx.showLoading({ title: '发布中...' })
    
    const that = this
    const newPost = {
      id: Date.now(),
      _openid: '',
      avatar: this.data.userProfile.avatarUrl || '👤',
      nickname: this.data.userProfile.nickName || this.data.userProfile.nickname || '墨客',
      content: this.data.postContent,
      images: [],
      imageFileIDs: [],
      likes: 0,
      comments: 0,
      liked: false,
      commentsList: [],
      create_time: Date.now()
    }

    // 上传图片到云存储
    const uploadImages = async () => {
      if (that.data.postImages.length === 0) {
        return [];
      }
      
      const fileIDs = []
      for (let i = 0; i < that.data.postImages.length; i++) {
        const tempPath = that.data.postImages[i]
        const cloudPath = `posts/${Date.now()}_${i}.${tempPath.split('.').pop()}`
        
        try {
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: tempPath,
          })
          fileIDs.push(uploadRes.fileID)
        } catch (err) {
          console.error('图片上传失败', err)
        }
      }
      return fileIDs
    }

    // 先上传图片，然后保存帖子到云数据库
    const savePostToCloud = async (imageFileIDs) => {
      newPost.images = that.data.postImages
      newPost.imageFileIDs = imageFileIDs
      
      const db = getDB()
      if (db) {
        try {
          const res = await db.collection('posts').add({
            data: newPost
          })
          console.log('帖子发布成功', res)
        } catch (err) {
          console.error('帖子发布失败', err)
        }
      }
    }

    // 执行发布流程
    uploadImages().then(fileIDs => {
      savePostToCloud(fileIDs).then(() => {
        that.setData({
          communityPosts: [newPost, ...that.data.communityPosts],
          showPostModal: false,
          postContent: '',
          postImages: []
        })
        
        wx.hideLoading()
        wx.showToast({ title: '发布成功', icon: 'success' })
        wx.vibrateShort({ type: 'light' })
      })
    })
  },

  async onSubmitPost() {
    return this.onSubmitPostCloud()
  },

  onMallCategoryTap(e) {
    const id = e.currentTarget.dataset.id
    const filtered = id === 0 ? this.data.mallProducts : this.data.mallProducts.filter(p => p.category === id)
    this.setData({ 
      mallCategoryActive: id,
      filteredProducts: filtered
    })
  },

  // 点击商品查看详情
  onProductTap(e) {
    const id = e.currentTarget.dataset.id
    const product = this.data.mallProducts.find(p => p.id === id)
    this.setData({
      showProductModal: true,
      currentProduct: product || {}
    })
  },

  // 关闭商品详情弹窗
  onCloseProductModal() {
    this.setData({ showProductModal: false })
  },

  // 立即购买
  onBuyProduct() {
    wx.showToast({ title: '暂未开放购买', icon: 'none' })
  },

  // 落款输入
  onSealInput(e) {
    this.setData({
      sealText: e.detail.value
    });
  },

  // 选择印章颜色
  onSelectSealColor(e) {
    const color = e.currentTarget.dataset.color;
    this.setData({
      sealColor: color
    });
  },

  // 切换逆流菜单
  onToggleReverseMenu() {
    this.triggerHapticFeedback('light');
    this.setData({
      showReverseMenu: !this.data.showReverseMenu
    });
  },

  // 高亮显示动画
  async flashElement(className) {
    const query = wx.createSelectorQuery();
    query.selectAll(`.${className}`).boundingClientRect();
    
    query.exec((rects) => {
      if (rects[0] && rects[0].length > 0) {
        wx.vibrateShort({ type: 'light' });
      }
    });
  },

  // 显示提示消息
  showToast(message, icon = 'none', duration = 1500) {
    wx.showToast({
      title: message,
      icon: icon,
      duration: duration
    });
  },

  // 加载状态管理
  setLoadingState(key, isLoading) {
    this.setData({
      [`${key}Loading`]: isLoading
    });
  },

  // 防抖函数
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // 节流函数
  throttle(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // 获取元素位置信息
  getElementRect(selector) {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery();
      query.select(selector).boundingClientRect();
      query.exec((rect) => {
        resolve(rect[0]);
      });
    });
  },

  // 滚动到指定元素
  scrollToElement(selector, offset = 0) {
    this.getElementRect(selector).then((rect) => {
      if (rect) {
        wx.pageScrollTo({
          scrollTop: rect.top + offset,
          duration: 300
        });
      }
    });
  },

  // 初始化页面动画
  initPageAnimations() {
    const animations = wx.createAnimation({
      duration: 600,
      timingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
    });
    
    this.animation = animations;
    return animations;
  },

  // 创建淡入动画
  fadeIn(duration = 300) {
    return wx.createAnimation({
      duration: duration,
      timingFunction: 'ease-out'
    }).opacity(1).step();
  },

  // 创建淡出动画
  fadeOut(duration = 300) {
    return wx.createAnimation({
      duration: duration,
      timingFunction: 'ease-in'
    }).opacity(0).step();
  },

  // 创建缩放动画
  scaleTo(scale = 1, duration = 300) {
    return wx.createAnimation({
      duration: duration,
      timingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }).scale(scale).step();
  },

  // 创建滑动动画
  slideIn(direction = 'up', distance = 50, duration = 300) {
    const animation = wx.createAnimation({
      duration: duration,
      timingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
    });
    
    switch(direction) {
      case 'up':
        return animation.translateY(-distance).opacity(1).step();
      case 'down':
        return animation.translateY(distance).opacity(1).step();
      case 'left':
        return animation.translateX(-distance).opacity(1).step();
      case 'right':
        return animation.translateX(distance).opacity(1).step();
      default:
        return animation.translateY(-distance).opacity(1).step();
    }
  },

  // 应用动画数据
  applyAnimationData(animationData, key) {
    this.setData({
      [`${key}Animation`]: animationData.export()
    });
  },

  // 清理动画数据
  clearAnimation(key) {
    this.setData({
      [`${key}Animation`]: null
    });
  },

  // 存储用户偏好设置
  saveUserPreference(key, value) {
    const preferences = wx.getStorageSync('userPreferences') || {};
    preferences[key] = value;
    wx.setStorageSync('userPreferences', preferences);
  },

  // 获取用户偏好设置
  getUserPreference(key, defaultValue = null) {
    const preferences = wx.getStorageSync('userPreferences') || {};
    return preferences[key] !== undefined ? preferences[key] : defaultValue;
  },

  // 检查功能可用性
  isFeatureEnabled(featureKey) {
    const disabledFeatures = wx.getStorageSync('disabledFeatures') || [];
    return !disabledFeatures.includes(featureKey);
  },

  // 记录用户行为
  logUserAction(action, data = {}) {
    const logs = wx.getStorageSync('userActionLogs') || [];
    logs.push({
      action,
      data,
      timestamp: Date.now()
    });
    
    // 只保留最近100条记录
    if (logs.length > 100) {
      logs.shift();
    }
    
    wx.setStorageSync('userActionLogs', logs);
  },

  // 获取设备信息
  getDeviceInfo() {
    const windowInfo = wx.getWindowInfo();
    const systemInfo = wx.getSystemInfoSync();
    return {
      windowWidth: windowInfo.windowWidth,
      windowHeight: windowInfo.windowHeight,
      pixelRatio: systemInfo.pixelRatio,
      platform: systemInfo.platform,
      model: systemInfo.model
    };
  },

  // 适配不同屏幕
  adaptToScreen(designWidth = 750) {
    const { windowWidth } = this.getDeviceInfo();
    const ratio = windowWidth / designWidth;
    return {
      rpx2px: (rpx) => rpx * ratio,
      px2rpx: (px) => px / ratio
    };
  },

  // 格式化数字
  formatNumber(num, decimals = 2) {
    if (typeof num !== 'number') return num;
    return Number(num.toFixed(decimals));
  },

  // 格式化时间
  formatTime(date = new Date()) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },

  // 格式化日期
  formatDate(date = new Date()) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 生成唯一ID
  generateUniqueId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  // 深度克隆对象
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // 合并对象
  mergeObjects(target, source) {
    return { ...target, ...source };
  },

  // 延迟执行
  delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // 条件执行
  async conditionalExecute(condition, fn, elseFn = null) {
    if (condition) {
      return await fn();
    } else if (elseFn) {
      return await elseFn();
    }
  },

  // 错误处理包装
  async safeExecute(fn, errorHandler = null) {
    try {
      return await fn();
    } catch (error) {
      console.error('执行错误:', error);
      if (errorHandler) {
        return await errorHandler(error);
      }
      throw error;
    }
  },

  // 生命周期：显示
  ensureRecognitionTab() {
    const hasRecognitionTab = this.data.tabs.some((tab) => tab.pagePath === '/pages/scan/scan')
    if (hasRecognitionTab) {
      return
    }

    const tabs = [...this.data.tabs]
    tabs.splice(3, 0, {
      id: 4,
      name: '识别',
      pagePath: '/pages/scan/scan'
    })
    this.setData({ tabs })
  },

  async onSendCommentCloud() {
    if (!this.ensureCommunityAuth()) {
      return
    }
    if (!this.data.commentText.trim()) {
      wx.showToast({ title: '\u8bf7\u8f93\u5165\u8bc4\u8bba\u5185\u5bb9', icon: 'none' })
      return
    }

    const targetPost = this.data.communityPosts.find(post => post.id === this.data.currentPostId)
    if (!targetPost || !targetPost._id) {
      wx.showToast({ title: '\u8be5\u5e16\u5b50\u8fd8\u672a\u63a5\u5165\u4e91\u7aef', icon: 'none' })
      return
    }

    try {
      const data = await this.callCommunityFunction('addComment', {
        postId: targetPost._id,
        content: this.data.commentText,
        ...this.getCommunityProfile()
      })
      const savedComment = data.comment
      const posts = this.data.communityPosts.map(post => {
        if (post.id === this.data.currentPostId) {
          return {
            ...post,
            comments: (post.comments || 0) + 1,
            commentsList: [...(post.commentsList || []), savedComment]
          }
        }
        return post
      })

      this.setData({
        communityPosts: posts,
        currentComments: [...this.data.currentComments, savedComment],
        commentText: ''
      })

      wx.vibrateShort({ type: 'light' })
      wx.showToast({ title: '\u8bc4\u8bba\u6210\u529f', icon: 'success' })
    } catch (error) {
      console.error('评论失败', error)
      wx.showToast({ title: '\u8bc4\u8bba\u5931\u8d25', icon: 'none' })
    }
  },

  async onSubmitPostCloud() {
    if (!this.ensureCommunityAuth()) {
      return
    }
    if (!this.data.postContent.trim() && this.data.postImages.length === 0) {
      wx.showToast({ title: '\u8bf7\u8f93\u5165\u5185\u5bb9\u6216\u6dfb\u52a0\u56fe\u7247', icon: 'none' })
      return
    }

    wx.showLoading({ title: '\u53d1\u5e03\u4e2d...' })
    try {
      const imageFileIDs = []
      for (let i = 0; i < this.data.postImages.length; i += 1) {
        const tempPath = this.data.postImages[i]
        const cloudPath = `posts/${Date.now()}_${i}.${tempPath.split('.').pop()}`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempPath
        })
        imageFileIDs.push(uploadRes.fileID)
      }

      const data = await this.callCommunityFunction('createPost', {
        content: this.data.postContent,
        imageFileIDs,
        ...this.getCommunityProfile()
      })

      this.setData({
        communityPosts: [data.post, ...this.data.communityPosts.filter(post => post._id)],
        showPostModal: false,
        postContent: '',
        postImages: []
      })
      wx.showToast({ title: '\u53d1\u5e16\u6210\u529f', icon: 'success' })
      wx.vibrateShort({ type: 'light' })
    } catch (error) {
      console.error('发帖失败', error)
      wx.showToast({ title: '\u53d1\u5e16\u5931\u8d25', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  consumePendingRecognitionPlayback() {
    const pendingPlayback = getPendingRecognitionPlayback()
    if (!pendingPlayback) {
      return
    }

    clearPendingRecognitionPlayback()
    this.applyRecognizedTrajectory(pendingPlayback)
  },

  applyRecognizedTrajectory(playbackPayload) {
    const wordKey = playbackPayload?.word?.wordKey || playbackPayload?.wordKey
    const recognizedWord = getWordByKey(wordKey) || LESSON_DATA[wordKey] || LESSON_DATA.songshu
    const normalizedTrajectory = normalizeTrajectoryPayload(playbackPayload?.standardTrajectory || playbackPayload?.strokes || [])

    if (!normalizedTrajectory.length) {
      return
    }

    this.setData({
      currentTab: 0,
      currentLesson: recognizedWord || this.data.currentLesson,
      allStrokes: normalizedTrajectory,
      showTemplate: true,
      show3DView: false,
      frameProgress: 0,
      playbackStatus: 'READY'
    }, () => {
      if (typeof this.redrawAllStrokes === 'function') {
        this.redrawAllStrokes()
      }
      if (typeof this.update3DView === 'function') {
        this.update3DView(0)
      }
      wx.showToast({
        title: `${recognizedWord?.chinese || '璇嗗埆缁撴灉'}宸插姞杞?`,
        icon: 'none'
      })
    })
  },

  mergeCommunityPosts(cloudPosts = []) {
    const fallbackPosts = (this.data.communityPosts || []).filter(post => !post._id)
    const merged = [...cloudPosts]
    fallbackPosts.forEach((post) => {
      if (!merged.some(item => item.id === post.id)) {
        merged.push(post)
      }
    })
    return merged
  },

  async onLikePost(e) {
    const postId = e.currentTarget.dataset.id
    const targetPost = this.data.communityPosts.find(post => post.id === postId)
    if (!targetPost) {
      return
    }

    if (!targetPost._id) {
      const posts = this.data.communityPosts.map(post => {
        if (post.id === postId) {
          const liked = !post.liked
          return {
            ...post,
            liked,
            likes: Math.max(0, (post.likes || 0) + (liked ? 1 : -1)),
            showLikeEffect: liked
          }
        }
        return post
      })
      this.setData({ communityPosts: posts })
      return
    }

    if (!this.ensureCommunityAuth()) {
      return
    }

    try {
      const data = await this.callCommunityFunction('toggleLike', {
        postId: targetPost._id
      })
      const posts = this.data.communityPosts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            liked: data.liked,
            likes: data.likes,
            showLikeEffect: data.liked
          }
        }
        return post
      })
      this.setData({ communityPosts: posts })
    } catch (error) {
      console.error('点赞失败', error)
      wx.showToast({ title: '点赞失败', icon: 'none' })
    }
  },

  onOpenComment(e) {
    const postId = e.currentTarget.dataset.id
    const post = this.data.communityPosts.find(p => p.id === postId)
    this.setData({
      showCommentModal: true,
      currentPostId: postId,
      currentComments: post?.commentsList || [],
      commentText: ''
    })
  },

  async onSendCommentCloud() {
    if (!this.data.commentText.trim()) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' })
      return
    }

    const targetPost = this.data.communityPosts.find(post => post.id === this.data.currentPostId)
    if (!targetPost) {
      return
    }

    if (!targetPost._id) {
      const localComment = {
        id: Date.now(),
        avatar: this.data.userProfile.avatarUrl || '🙂',
        nickname: this.data.userProfile.nickName || this.data.userProfile.nickname || '墨客',
        content: this.data.commentText
      }
      const posts = this.data.communityPosts.map(post => {
        if (post.id === this.data.currentPostId) {
          return {
            ...post,
            comments: (post.comments || 0) + 1,
            commentsList: [...(post.commentsList || []), localComment]
          }
        }
        return post
      })
      this.setData({
        communityPosts: posts,
        currentComments: [...this.data.currentComments, localComment],
        commentText: ''
      })
      wx.showToast({ title: '评论成功', icon: 'success' })
      return
    }

    if (!this.ensureCommunityAuth()) {
      return
    }

    try {
      const data = await this.callCommunityFunction('addComment', {
        postId: targetPost._id,
        avatar: this.data.userProfile.avatarUrl || '🙂',
        nickname: this.data.userProfile.nickName || this.data.userProfile.nickname || '墨客',
        content: this.data.commentText
      })
      const savedComment = data.comment
      const posts = this.data.communityPosts.map(post => {
        if (post.id === this.data.currentPostId) {
          return {
            ...post,
            comments: (post.comments || 0) + 1,
            commentsList: [...(post.commentsList || []), savedComment]
          }
        }
        return post
      })
      this.setData({
        communityPosts: posts,
        currentComments: [...this.data.currentComments, savedComment],
        commentText: ''
      })
      wx.showToast({ title: '评论成功', icon: 'success' })
    } catch (error) {
      console.error('评论失败', error)
      wx.showToast({ title: '评论失败', icon: 'none' })
    }
  },

  async onSubmitPostCloud() {
    if (!this.ensureCommunityAuth()) {
      return
    }
    if (!this.data.postContent.trim() && this.data.postImages.length === 0) {
      wx.showToast({ title: '请输入内容或添加图片', icon: 'none' })
      return
    }

    wx.showLoading({ title: '发布中...' })
    try {
      const imageFileIDs = []
      for (let index = 0; index < this.data.postImages.length; index += 1) {
        const tempPath = this.data.postImages[index]
        const extension = tempPath.split('.').pop() || 'jpg'
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `posts/${Date.now()}_${index}.${extension}`,
          filePath: tempPath
        })
        imageFileIDs.push(uploadResult.fileID)
      }

      const data = await this.callCommunityFunction('createPost', {
        avatar: this.data.userProfile.avatarUrl || '🙂',
        nickname: this.data.userProfile.nickName || this.data.userProfile.nickname || '墨客',
        content: this.data.postContent,
        imageFileIDs
      })

      this.setData({
        communityPosts: this.mergeCommunityPosts([data.post, ...this.data.communityPosts.filter(post => post._id)]),
        showPostModal: false,
        postContent: '',
        postImages: []
      })
      wx.showToast({ title: '发布成功', icon: 'success' })
    } catch (error) {
      console.error('发布失败', error)
      wx.showToast({ title: '发布失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async loadCommunityPosts() {
    this.setData({ isLoadingPosts: true })
    try {
      const data = await this.callCommunityFunction('list', {
        limit: 50,
        skip: 0
      })
      const posts = data.posts || []
      this.setData({
        communityPosts: this.mergeCommunityPosts(posts),
        currentPage: 1,
        hasMorePosts: posts.length >= 50,
        isLoadingPosts: false
      })
    } catch (error) {
      console.error('加载社区失败', error)
      this.setData({ isLoadingPosts: false })
    }
  },

  async onLoadMorePosts() {
    if (this.data.isLoadingPosts || !this.data.hasMorePosts) {
      return
    }

    this.setData({ isLoadingPosts: true })
    const nextPage = this.data.currentPage + 1
    const skip = (nextPage - 1) * 50
    try {
      const data = await this.callCommunityFunction('list', {
        limit: 50,
        skip
      })
      const newPosts = data.posts || []
      this.setData({
        communityPosts: this.mergeCommunityPosts([...this.data.communityPosts.filter(post => post._id), ...newPosts]),
        currentPage: nextPage,
        isLoadingPosts: false,
        hasMorePosts: newPosts.length >= 50
      })
    } catch (error) {
      console.error('加载更多失败', error)
      this.setData({ isLoadingPosts: false })
    }
  },

  formatCommunityAvatarView(avatar) {
    const avatarValue = String(avatar || '🙂')
    const avatarIsImage = /^https?:\/\//.test(avatarValue) || avatarValue.startsWith('cloud://')
    return {
      avatar: avatarValue,
      avatarIsImage,
      avatarText: avatarIsImage ? '🙂' : avatarValue,
      avatarUrl: avatarIsImage ? avatarValue : ''
    }
  },

  onReplyComment(e) {
    const nickname = e.currentTarget.dataset.nickname
    if (!nickname) {
      return
    }
    this.setData({
      showCommentModal: true,
      replyTargetNickname: nickname,
      commentText: `回复${nickname}：`
    })
  },

  onOpenComment(e) {
    const postId = e.currentTarget.dataset.id
    const post = this.data.communityPosts.find(p => p.id === postId)
    const comments = (post?.commentsList || []).map(comment => ({
      ...this.formatCommunityAvatarView(comment.avatar),
      ...comment
    }))
    this.setData({
      showCommentModal: true,
      currentPostId: postId,
      currentComments: comments,
      replyTargetNickname: '',
      commentText: ''
    })
  },

  async onSendCommentCloud() {
    if (!this.data.commentText.trim()) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' })
      return
    }

    const targetPost = this.data.communityPosts.find(post => post.id === this.data.currentPostId)
    if (!targetPost) {
      return
    }

    const baseComment = {
      ...this.formatCommunityAvatarView(this.data.userProfile.avatarUrl || '🙂'),
      avatar: this.data.userProfile.avatarUrl || '🙂',
      nickname: this.data.userProfile.nickName || this.data.userProfile.nickname || '墨客',
      content: this.data.commentText
    }

    if (!targetPost._id) {
      const localComment = {
        id: Date.now(),
        ...baseComment
      }
      const posts = this.data.communityPosts.map(post => {
        if (post.id === this.data.currentPostId) {
          return {
            ...post,
            comments: (post.comments || 0) + 1,
            commentsList: [...(post.commentsList || []), localComment]
          }
        }
        return post
      })
      this.setData({
        communityPosts: posts,
        currentComments: [...this.data.currentComments, localComment],
        replyTargetNickname: '',
        commentText: ''
      })
      wx.showToast({ title: '评论成功', icon: 'success' })
      return
    }

    if (!this.ensureCommunityAuth()) {
      return
    }

    try {
      const data = await this.callCommunityFunction('addComment', {
        postId: targetPost._id,
        avatar: baseComment.avatar,
        nickname: baseComment.nickname,
        content: baseComment.content
      })
      const savedComment = {
        ...this.formatCommunityAvatarView(data.comment.avatar),
        ...data.comment
      }
      const aiComment = data.aiComment ? {
        ...this.formatCommunityAvatarView(data.aiComment.avatar),
        ...data.aiComment
      } : null
      const appendedComments = aiComment ? [savedComment, aiComment] : [savedComment]
      const posts = this.data.communityPosts.map(post => {
        if (post.id === this.data.currentPostId) {
          return {
            ...post,
            comments: (post.comments || 0) + appendedComments.length,
            commentsList: [...(post.commentsList || []), ...appendedComments]
          }
        }
        return post
      })
      this.setData({
        communityPosts: posts,
        currentComments: [...this.data.currentComments, ...appendedComments],
        replyTargetNickname: '',
        commentText: ''
      })
      wx.showToast({ title: '评论成功', icon: 'success' })
    } catch (error) {
      console.error('评论失败', error)
      wx.showToast({ title: '评论失败', icon: 'none' })
    }
  },

  async loadUserProfileFromCloud() {
    if (!this.ensureCommunityAuth()) {
      return
    }
    try {
      const data = await this.callCommunityFunction('getProfile', {})
      const profile = data.profile
      if (!profile) {
        return
      }
      const mergedProfile = {
        ...this.data.userProfile,
        avatarUrl: profile.avatarUrl || this.data.userProfile.avatarUrl,
        nickName: profile.nickName || profile.nickname || this.data.userProfile.nickName,
        nickname: profile.nickname || profile.nickName || this.data.userProfile.nickname
      }
      this.setData({ userProfile: mergedProfile })
      wx.setStorageSync('userProfile', mergedProfile)
      wx.setStorageSync('userInfo', mergedProfile)
    } catch (error) {
      console.error('加载云端资料失败', error)
    }
  },

  async saveUserProfileToCloud(profile) {
    if (!this.ensureCommunityAuth()) {
      return
    }
    try {
      const data = await this.callCommunityFunction('updateProfile', {
        avatarUrl: profile.avatarUrl || '',
        nickName: profile.nickName || profile.nickname || '墨客'
      })
      const cloudProfile = data.profile || {}
      const mergedProfile = {
        ...profile,
        avatarUrl: cloudProfile.avatarUrl || profile.avatarUrl,
        nickName: cloudProfile.nickName || cloudProfile.nickname || profile.nickName,
        nickname: cloudProfile.nickname || cloudProfile.nickName || profile.nickname
      }
      this.setData({ userProfile: mergedProfile })
      wx.setStorageSync('userProfile', mergedProfile)
      wx.setStorageSync('userInfo', mergedProfile)
    } catch (error) {
      console.error('保存云端资料失败', error)
      wx.showToast({ title: '资料保存失败', icon: 'none' })
    }
  },

  onConfirmAvatar() {
    const newProfile = { ...this.data.userProfile, avatarUrl: this.data.selectedAvatar }
    this.setData({
      userProfile: newProfile,
      showEditAvatar: false
    })
    wx.setStorageSync('userProfile', newProfile)
    wx.setStorageSync('userInfo', newProfile)
    this.saveUserProfileToCloud(newProfile)
    wx.showToast({ title: '头像已更新', icon: 'success' })
  },

  onConfirmNickname() {
    if (!this.data.tempNickname.trim()) {
      wx.showToast({ title: '用户名不能为空', icon: 'none' })
      return
    }
    const newProfile = { ...this.data.userProfile, nickName: this.data.tempNickname, nickname: this.data.tempNickname }
    this.setData({
      userProfile: newProfile,
      showEditNickname: false
    })
    wx.setStorageSync('userProfile', newProfile)
    wx.setStorageSync('userInfo', newProfile)
    this.saveUserProfileToCloud(newProfile)
    wx.showToast({ title: '用户名已更新', icon: 'success' })
  },

  onShow() {
    this.consumePendingRecognitionPlayback()
    this.logUserAction('page_show', { page: 'index' });
    const app = getApp();
    const enabled = wx.getStorageSync('bgMusicEnabled');
    const isEnabled = enabled !== false;
    const currentIndex = app.getCurrentMusicIndex();
    const musicList = app.getMusicList();
    this.setData({ 
      musicEnabled: isEnabled,
      currentMusicIndex: currentIndex,
      musicList: musicList
    });
    app.playBgMusic(0);
    this.loadUserProfileFromCloud()
  },

  // 生命周期：隐藏
  onHide() {
    this.logUserAction('page_hide', { page: 'index' });
  },

  // 生命周期：分享
  onShareAppMessage() {
    return {
      title: '智墨穿梭 - 智能蒙古文书法练习',
      path: '/pages/index/index',
      imageUrl: '/images/share-cover.png'
    };
  },

  // 生命周期：下拉刷新
  onPullDownRefresh() {
    if (this.data.currentTab === 2) {
      this.setData({
        refresherTriggered: true,
        currentPage: 1
      })
      this.callCommunityFunction('list', {
        limit: 50,
        skip: 0
      }).then((data) => {
        const posts = data.posts || []
        this.setData({
          communityPosts: posts.length ? this.mergeCommunityPosts(posts) : this.data.communityPosts,
          refresherTriggered: false,
          hasMorePosts: posts.length >= 50
        })
      }).catch((error) => {
        console.error('刷新失败', error)
        this.setData({ refresherTriggered: false })
      }).finally(() => {
        wx.stopPullDownRefresh()
      })
      return
    }

    wx.showNavigationBarLoading();
    setTimeout(() => {
      wx.hideNavigationBarLoading();
      wx.stopPullDownRefresh();
    }, 1000);
  },

  // 生命周期：页面滚动
  onPageScroll(e) {
    // 可以在这里实现滚动相关的动画效果
  },

  // 生命周期：页面分享回调
  onShareTimeline() {
    return {
      title: '智墨穿梭 - 智能蒙古文书法练习',
      query: 'from=timeline',
      imageUrl: '/images/share-cover.png'
    };
  }
  ,

  async onOpenCollectionRecords() {
    const pending = (wx.getStorageSync('pendingTrajectorySamples') || []).map((item) => this.mapPendingCollectionRecord(item))
    this.setData({
      showCollectionRecords: true,
      isLoadingCollectionRecords: true,
      allCollectionRecords: pending,
      collectionRecords: pending
    })
    try {
      const response = await wx.cloud.callFunction({
        name: 'trajectory-collection',
        data: {
          action: 'listMySamples',
          limit: this.data.isAdminMode ? 80 : 30,
          adminCode: this.data.adminCodeVerified ? '123456' : ''
        }
      })
      const cloudSamples = response?.result?.success ? (response.result.data?.samples || []) : []
      this.applyCollectionRecordFilters([...pending, ...cloudSamples])
    } catch (error) {
      console.error('[Collection] load records failed:', error)
      this.applyCollectionRecordFilters(pending)
    } finally {
      this.setData({ isLoadingCollectionRecords: false })
    }
  },

  onSelectCollectionRecordFilter(e) {
    const value = e.currentTarget.dataset.value || 'all'
    this.setData({ collectionRecordFilter: value }, () => this.applyCollectionRecordFilters())
  },

  onSelectCollectionScriptFilter(e) {
    const value = e.currentTarget.dataset.value || 'all'
    this.setData({ collectionRecordScriptFilter: value }, () => this.applyCollectionRecordFilters())
  },

  onSelectCollectionRoleFilter(e) {
    const value = e.currentTarget.dataset.value || 'all'
    this.setData({ collectionRecordRoleFilter: value }, () => this.applyCollectionRecordFilters())
  },

  onToggleCollectionAdvancedFilters() {
    this.setData({
      showCollectionAdvancedFilters: !this.data.showCollectionAdvancedFilters
    })
  },

  async onToggleAdminMode() {
    if (this.data.isAdminMode) {
      this.setData({
        isAdminMode: false,
        adminCodeVerified: false
      })
      wx.showToast({
        title: '已退出管理员模式',
        icon: 'none'
      })
      this.onOpenCollectionRecords()
      return
    }

    const ok = await this.ensureAdminMode()
    if (ok) {
      this.onOpenCollectionRecords()
    }
  },

  async onOpenCollectionRecordDetail(e) {
    const record = e.currentTarget.dataset.record || {}
    this.setData({
      selectedCollectionRecord: record,
      selectedCollectionRecordRawPayload: record.rawPayload || null,
      selectedCollectionRecordPreviewSrc: '',
      showCollectionRecordDetail: true,
      isLoadingSelectedCollectionRecord: true
    })

    try {
      let detail = record
      if (String(record.id || '').startsWith('pending-')) {
        detail = {
          ...record,
          strokes: record.rawPayload?.strokes || [],
          device: record.rawPayload?.device || {},
          summary: record.rawPayload?.sample?.summary || {},
          participantSnapshot: record.rawPayload?.participant || {},
          clientExportVersion: record.rawPayload?.version || 'research-sample.v1'
        }
      } else {
        const response = await wx.cloud.callFunction({
          name: 'trajectory-collection',
          data: {
            action: 'getSampleDetail',
            sampleId: record.id,
            adminCode: this.data.adminCodeVerified ? '123456' : ''
          }
        })
        if (!response?.result?.success) {
          throw new Error(response?.result?.error || 'getSampleDetail failed')
        }
        detail = {
          ...(response.result.data || {}),
          scriptTypeKey: response.result.data?.scriptType,
          roleKey: response.result.data?.role
        }
      }

      const rawPayload = this.buildCollectionPayloadFromRecord(detail)
      const previewSrc = await this.renderStrokePreview(rawPayload.strokes || [], {
        updateState: false,
        strokeColor: '#111111',
        backgroundColor: '#ffffff'
      }).catch(() => '')

      this.setData({
        selectedCollectionRecord: detail,
        selectedCollectionRecordRawPayload: rawPayload,
        selectedCollectionRecordPreviewSrc: previewSrc
      })
    } catch (error) {
      console.error('[Collection] open detail failed:', error)
      wx.showToast({ title: '记录详情加载失败', icon: 'none' })
    } finally {
      this.setData({ isLoadingSelectedCollectionRecord: false })
    }
  },

  onCloseCollectionRecordDetail() {
    this.setData({
      showCollectionRecordDetail: false,
      selectedCollectionRecord: {},
      selectedCollectionRecordRawPayload: null,
      selectedCollectionRecordPreviewSrc: '',
      isLoadingSelectedCollectionRecord: false
    })
  },

  onExportSelectedCollectionRecord() {
    const payload = this.data.selectedCollectionRecordRawPayload
    if (!payload) {
      wx.showToast({ title: '样本还未加载完成', icon: 'none' })
      return
    }
    this.setData({
      coordinateData: payload,
      coordinateJson: JSON.stringify(payload, null, 2),
      coordinateStats: payload?.sample?.summary || { strokeCount: 0, pointCount: 0 },
      collectionSubmitResult: {
        sampleId: this.data.selectedCollectionRecord?.id || '',
        sessionId: this.data.selectedCollectionRecord?.sessionId || ''
      },
      showCoordinateModal: true
    })
  },

  onReplaySelectedCollectionRecord() {
    const payload = this.data.selectedCollectionRecordRawPayload
    if (!payload?.strokes?.length) {
      wx.showToast({ title: '当前样本无轨迹', icon: 'none' })
      return
    }
    this.setData({
      allStrokes: payload.strokes,
      showCollectionRecordDetail: false,
      showCollectionRecords: false,
      replayDisplayMode: 'trajectory'
    }, () => {
      this.refreshPlaybackPreview()
      if (!this.data.show3DView) {
        this.onToggleMemoryBox()
      }
    })
  },

  async onUpdateCollectionReviewStatus(e) {
    const reviewStatus = e.currentTarget.dataset.status
    const sampleId = this.data.selectedCollectionRecord?.id
    if (!sampleId || !reviewStatus) return

    if (!this.data.adminCodeVerified) {
      const ok = await this.ensureAdminMode()
      if (!ok) return
    }

    if (String(sampleId).startsWith('pending-')) {
      wx.showToast({
        title: '离线样本请先同步',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '更新状态中...', mask: true })
    try {
      const response = await wx.cloud.callFunction({
        name: 'trajectory-collection',
        data: {
          action: 'updateReviewStatus',
          sampleId,
          reviewStatus,
          adminCode: '123456'
        }
      })

      if (!response?.result?.success) {
        throw new Error(response?.result?.error || 'updateReviewStatus failed')
      }

      const nextRecord = {
        ...this.data.selectedCollectionRecord,
        reviewStatus
      }

      const nextRecords = (this.data.allCollectionRecords || []).map((item) => (
        item.id === sampleId ? { ...item, reviewStatus } : item
      ))

      this.setData({ selectedCollectionRecord: nextRecord })
      this.applyCollectionRecordFilters(nextRecords)

      wx.showToast({
        title: '状态已更新',
        icon: 'success'
      })
    } catch (error) {
      console.error('[Collection] update review status failed:', error)
      wx.showToast({
        title: '状态更新失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  async onBatchApproveCollectionRecords() {
    if (!this.data.adminCodeVerified) {
      const ok = await this.ensureAdminMode()
      if (!ok) return
    }

    const sampleIds = (this.data.collectionRecords || [])
      .filter((item) => !String(item.id || '').startsWith('pending-'))
      .filter((item) => item.reviewStatus === 'pending')
      .map((item) => item.id)

    if (!sampleIds.length) {
      wx.showToast({
        title: '当前筛选下无待审核样本',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '批量审核中...', mask: true })
    try {
      const response = await wx.cloud.callFunction({
        name: 'trajectory-collection',
        data: {
          action: 'batchReview',
          adminCode: '123456',
          sampleIds,
          reviewStatus: 'approved'
        }
      })

      if (!response?.result?.success) {
        throw new Error(response?.result?.error || 'batchReview failed')
      }

      wx.showToast({
        title: `已通过 ${sampleIds.length} 条`,
        icon: 'success'
      })
      this.onOpenCollectionRecords()
    } catch (error) {
      console.error('[Collection] batch review failed:', error)
      wx.showToast({
        title: '批量审核失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  update3DView(progress) {
    const { allStrokes, playbackCanvas, playbackCtx, currentLesson, viewAngle, replayDisplayMode } = this.data
    const frameUrl = currentLesson ? currentLesson.bgImage : LESSON_DATA.songshu.bgImage
    let playbackSpeed = '0.0'
    let playbackPressure = '0.0'
    let playbackTime = '0'
    let playbackStatus = 'Waiting...'
    let cursorX = 0
    let cursorY = 0
    let cursorVisible = false

    if (!allStrokes.length || !playbackCtx) {
      this.setData({ currentFrameUrl: frameUrl, playbackSpeed, playbackPressure, playbackTime, playbackStatus, cursorVisible: false })
      return
    }

    const dpr = wx.getSystemInfoSync().pixelRatio || 1
    const width = playbackCanvas?.width ? playbackCanvas.width / dpr : 300
    const height = playbackCanvas?.height ? playbackCanvas.height / dpr : 400
    playbackCtx.clearRect(0, 0, width, height)

    let totalPoints = 0
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    allStrokes.forEach((stroke) => {
      const points = stroke.points || stroke
      totalPoints += points.length
      points.forEach((point) => {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      })
    })

    const safeTop = 42
    const safeBottom = replayDisplayMode === 'result' ? 250 : 338
    const safeSide = 78
    const lift = 22
    const availableWidth = Math.max(120, width - safeSide * 2)
    const availableHeight = Math.max(180, height - safeTop - safeBottom)
    const bboxWidth = Math.max(1, maxX - minX)
    const bboxHeight = Math.max(1, maxY - minY)
    const scale = Math.max(0.32, Math.min(availableWidth / bboxWidth, availableHeight / bboxHeight) * 0.92)
    const offsetX = (width - bboxWidth * scale) / 2 - minX * scale
    const offsetY = safeTop + (availableHeight - bboxHeight * scale) / 2 - minY * scale - lift
    const centerX = width / 2

    const transformPlaybackPoint = (x, y) => {
      let tx = x * scale + offsetX
      let ty = y * scale + offsetY
      if (viewAngle === 4) {
        const angle = (this.data.rotationAngle || 0) * Math.PI / 180
        const dx = tx - centerX
        const depthScale = 0.08 + 0.92 * Math.abs(Math.cos(angle))
        const swing = Math.sin(angle)
        tx = centerX + dx * depthScale + swing * Math.max(56, bboxWidth * scale * 0.2)
        ty = ty - (1 - depthScale) * 28
      }
      return { x: tx, y: ty }
    }

    const progressRatio = Math.min(Math.max(progress / 100, 0), 1)
    const drawLimit = Math.floor(totalPoints * progressRatio)
    let drawnPoints = 0

    playbackCtx.save()
    for (const stroke of allStrokes) {
      if (drawnPoints >= drawLimit) break
      const points = stroke.points || stroke
      const drawableCount = Math.min(points.length, Math.max(0, drawLimit - drawnPoints))
      if (drawableCount <= 0) break
      for (let i = 1; i < drawableCount; i += 1) {
        const prev = points[i - 1]
        const curr = points[i]
        const p1 = transformPlaybackPoint(prev.x, prev.y)
        const p2 = transformPlaybackPoint(curr.x, curr.y)
        const force = Number(curr.f || curr.pressure || 0.55)
        const angle = (this.data.rotationAngle || 0) * Math.PI / 180
        const depthLine = viewAngle === 4
          ? Math.max(4, Math.min(16, (5 + force * 7) * (0.45 + 0.55 * Math.abs(Math.cos(angle)))))
          : Math.max(4, Math.min(14, 5 + force * 7))
        playbackCtx.beginPath()
        playbackCtx.moveTo(p1.x, p1.y)
        playbackCtx.lineTo(p2.x, p2.y)
        playbackCtx.lineWidth = depthLine
        if (viewAngle === 4) {
          const hue = (this.data.rotationAngle || 0) % 360
          playbackCtx.strokeStyle = `hsl(${hue}, 100%, 56%)`
          playbackCtx.shadowColor = `hsla(${hue}, 100%, 58%, 0.95)`
          playbackCtx.shadowBlur = 24
        } else {
          playbackCtx.strokeStyle = '#00f6ff'
          playbackCtx.shadowColor = 'rgba(0, 246, 255, 0.92)'
          playbackCtx.shadowBlur = 18
        }
        playbackCtx.stroke()
      }
      drawnPoints += drawableCount
    }
    playbackCtx.restore()

    const flatPoints = allStrokes.flatMap((stroke) => stroke.points || stroke)
    const activeIndex = Math.max(0, Math.min(flatPoints.length - 1, drawLimit - 1))
    const activePoint = flatPoints[activeIndex]
    if (activePoint) {
      const transformed = transformPlaybackPoint(activePoint.x, activePoint.y)
      cursorX = (transformed.x / width) * 100
      cursorY = (transformed.y / height) * 100
      cursorVisible = replayDisplayMode === 'trajectory'
      playbackPressure = Number(activePoint.f || activePoint.pressure || 0.5).toFixed(1)
      playbackTime = String(activePoint.t || 0)
      const prevPoint = flatPoints[Math.max(0, activeIndex - 1)] || activePoint
      const dt = Math.max(1, (activePoint.t || 0) - (prevPoint.t || 0))
      const dist = Math.hypot((activePoint.x || 0) - (prevPoint.x || 0), (activePoint.y || 0) - (prevPoint.y || 0))
      playbackSpeed = (dist / dt * 10).toFixed(1)
      playbackStatus = drawLimit >= totalPoints ? 'Complete' : 'PLAYING...'
    }

    this.setData({
      currentFrameUrl: frameUrl,
      playbackSpeed,
      playbackPressure,
      playbackTime,
      playbackStatus,
      cursorX,
      cursorY,
      cursorVisible
    })
  }
  ,

  onOpenMengbaoPanel() {
    this.setData({
      showMengbaoActionSheet: true
    })
  },

  onCloseMengbaoActionSheet() {
    this.setData({
      showMengbaoActionSheet: false
    })
  },

  onSelectMengbaoAction(e) {
    const action = e.currentTarget.dataset.action
    this.setData({
      showMengbaoActionSheet: false
    }, () => {
      if (action === 'chat') {
        this.onOpenMengbaoChat()
        return
      }

      if (!this.data.allStrokes || !this.data.allStrokes.length) {
        wx.showToast({
          title: '请先书写一些内容',
          icon: 'none'
        })
        return
      }

      this.onSubmitForScoring()
    })
  }
})
