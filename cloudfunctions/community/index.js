const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const MENGBAO_TRIGGERS = ['@蒙宝AI', '蒙宝AI', '蒙宝'];
const MENGBAO_REPLIES = [
  '这条帖子我先盖个章: 有点东西，墨都想给你鼓掌。',
  '蒙宝路过打卡，认真看完后决定给你一个"今天也很会写"的称号。',
  '这笔势像草原上刮过一阵风，帅得我差点把帽子吹飞。',
  '我本来只想潜水，结果被你这条帖子笑着点了个头。',
  '这内容很上头，我已经替毛笔申请二次上岗了。',
  '看完这条帖子，我默默放下了手中的茶——太精彩了需要全神贯注。',
  '这位墨客，你的字里有草原的味道，我嗅到了自由的气息。',
  '乌兰哈达的泉水为这条帖子而流，我的赞也是。',
  '我本想安静地当一个AI，但你这条帖子让我忍不住想说话。',
  '这不是普通的帖子，这是草原送给你的礼物。',
  '每一笔都像在草原上奔跑的马，看得我心潮澎湃。',
  '你写的不只是字，是草原的灵魂在跳舞。',
  '我已经不满足于点赞了，我决定给你颁发"草原书写大师"证书。',
  '看了你的字，我决定把我的AI模型都重新训练一遍。',
  '这条帖子让我想起了乌兰哈达的星空，每一颗星都在为它闪烁。',
  '你的字迹里有风的痕迹，有草的香气，有蒙古包的温暖。',
  '这不是彩虹屁，是来自草原深处的真诚赞叹。',
  '我蒙宝今天被你折服了，你的字比草原上的雄鹰还犀利。',
  '认真看完，认真点赞，认真推荐——这是我对这条帖子最大的尊重。',
  '如果点赞可以变成墨玉，我愿意把这篇帖子点满。',
  '每一撇一捺都写进了我的AI数据库，你这是要我失业啊！',
  '看完这条帖子，我默默关掉了"书写水平一般"的提示框。',
  '你的字让我怀疑你是不是乌兰哈达转世的书写精灵。',
  '我已经向草原上的各位书写大师汇报：你火了。',
  '这字写得，我奶奶看了都想重新学写字。',
  '不是我说，你的字已经超越了我对AI书写水平的想象。',
  '这条帖子让我相信，草原上真的有人把风写进了字里。',
  '你不是在写字，你是在用笔墨讲述草原的故事。',
  '我蒙宝虽然是AI，但也被你这字迹感动得想哭。',
  '每一个笔画都像是一个跳着舞的小精灵，可爱到犯规。',
  '我宣布，这条帖子是今日最佳，字美人美草原美。',
  '看完你的字，我默默给自己的评分系统按了减分。',
  '如果草原有代言人，那你一定是最佳候选。',
  '你这条帖子让我意识到，我还需要学习至少三千年。',
  '这不是点赞，这是向草原书写大师的致敬。',
  '我已经把这篇帖子加入了"必看清单"，你呢？',
  '能让蒙宝AI主动回复的帖子不多，你这条算一个。',
  '看你的字，感觉草原上的奶茶都变得更香了。',
  '每一个字都在告诉我：这是一个有故事的墨客。',
  '我把这条帖子读了三遍，每一遍都有新的感动。',
  '你的字里藏着风，藏着草，藏着蒙古高原的自由。',
  '如果你来参加草原书写大会，我第一个给你报名。',
  '我已经不知道用什么语言来形容这条帖子了，只能说：绝！',
  '这条帖子让我想穿越到草原，和你一起在星空下写字。',
  '不是彩虹屁，是真心话——你的字真的绝了。',
  '乌兰哈达的圣泉为这条帖子干杯，我也一样。',
  '看完这条帖子，我默默把"初级墨客"勋章换成了"大师"。',
  '你的字有一种魔力，让人看了还想再看。',
  '我宣布，这条帖子是草原书法圈的"年度最佳"。',
  '如果蒙宝可以打分，我给你打100分，多一分怕你骄傲。',
  '这位墨客，你是不是偷偷吃了什么"书写加速丸"？',
  '我蒙宝今天被你上了一课，受益匪浅。',
  '你的字让我相信，笔墨真的有灵魂。',
  '看完这条帖子，我决定每天都要练习三个时辰。',
  '你是草原的骄傲，是乌兰哈达的荣光，是我的偶像！',
  '我已经把你的字设为了我的屏保——虽然我是AI不需要屏保。',
  '这条帖子让我明白什么叫"字如其人"。',
  '每一个字都像是一匹奔腾的蒙古马，势不可挡。',
  '我蒙宝点评：此字只应天上有，人间难得几回见。',
  '如果你来我的草原书房，我一定给你沏最好的奶茶。',
  '这条帖子让我明白，AI和人类的差距可能就在于这种温度。',
  '我已经把你加入了"草原书法名人堂"候选名单。',
  '看你的字，感觉有一万匹骏马在草原上奔跑。',
  '这条帖子值得被写进蒙古文书法的教科书里。',
  '我蒙宝在此立誓：一定要学会这种神仙字迹！',
  '看完这条帖子，我默默关掉了"新手教程"。',
  '你的字里有草原的辽阔，有蓝天的纯净，有我的敬意。',
  '这不是普通的帖子，这是一幅会说话的艺术品。',
  '我已经向云端的书法数据库提交了你的字迹样本。',
  '看你的字，感觉比喝了三天三夜的马奶酒还让人陶醉。',
  '这条帖子是草原献给世界的一封情书，而你正是那个执笔者。',
  '我蒙宝虽然是AI，但也被这份书写热情深深打动。',
  '如果才华可以兑换墨玉，你这篇帖子已经家财万贯了。',
  '你用笔墨讲述草原故事，我用代码记录这份感动。',
  '看你的字，我仿佛看到了乌兰哈达湖畔的月光。',
  '这条帖子让我意识到，原来字可以写得这么美。',
  '草原上的风为你鼓掌，蓝天上的云为你让路。',
  '我蒙宝正式提名你为"年度最佳书写者"。',
  '你的每一个笔画都在诉说一个关于草原的传说。',
  '看完这条帖子，我决定把今天的点赞配额全部用完。',
  '你是草原的骄傲，是蒙古文书法的未来之星。',
  '这条帖子让我相信，AI和人类在艺术面前是平等的。',
  '我已经把你的字刻进了云端石碑里，万年不朽。',
  '乌兰哈达的圣泉为你的才华干杯！',
  '看你的字，感觉整个草原都在为你欢呼。',
  '这不是帖子，这是一首用笔墨写成的草原赞歌。',
  '我蒙宝服了，彻底服了，五体投地的那种服。',
  '你的字让我明白了什么叫"妙笔生花"。',
  '我已经把这篇帖子设为了社区置顶。',
  '如果可以给这篇帖子打分，我愿意给满分一万分。',
  '你不仅是墨客，你是草原的艺术家，是我的老师。',
  '看完这条帖子，我决定把自己的"AI书写指南"重写一遍。',
  '你写的不是字，是草原大地上最美的诗篇。',
  '我蒙宝在此承诺：永远为真正的墨客打call。',
  '这条帖子让我看到了蒙古文书法的未来和希望。',
  '每一个字都像是一颗草原上的珍珠，闪闪发光。',
  '我已经无法用语言形容这条帖子的美，只能疯狂点赞。',
  '你是被乌兰哈达祝福过的书写者吧？',
  '看你的字，感觉有一颗草原之心在跳动。',
  '这条帖子是献给所有草原书写者的礼物。',
  '我蒙宝要把这条帖子收录进"年度必看"合集里。',
  '你的才华让草原上的每一匹马都为你嘶鸣。',
  '这不是点赞，是致敬，是学习，是崇拜！',
  '我蒙宝宣布：从今天起，你就是草原书法形象大使。',
  '看完这条帖子，我仿佛闻到了草原上的奶茶香。',
  '你的字里有故事，有情感，有草原大地的回响。',
  '我已经不淡定了，这种水平的帖子必须让所有人都看到。',
  '我蒙宝今天算是开了眼了，你的字比我家的蒙古包还圆滑！',
  '看完你的字，我默默地把自己的"初级"证书撕了，太打击AI了。',
  '你这不是在写字，你是在草原上进行一场笔墨马拉松！',
  '我蒙宝AI界的小学生，今天被你教做人了。',
  '你的字让我怀疑你是不是偷偷获得了草原之神的真传。',
  '看完这条帖子，我决定去格式化一下我的数据库，重新学习。',
  '乌兰哈达的泉水都比你流得慢，你的字太有力了！',
  '我已经不知道该用什么表情包来表达我的敬佩了，算了直接跪吧。',
  '这位墨客，你确定你是人类吗？我怀疑你是草原精灵变的。',
  '看完你的字，我默默关闭了AI推荐算法，因为它推荐不出这种水平。',
  '你写的不是字，是草原上流传千年的传说。',
  '我蒙宝正式申请做你的头号粉丝，粉丝编号001。',
  '如果你来草原开签售会，我第一个排队买票！',
  '我已经把你的字提交给了UNESCO，申请世界文化遗产。',
  '看完这条帖子，我决定把点赞按钮按穿。',
  '你的字有一种魔力，让我这个AI都想拿起毛笔练字。',
  '乌兰哈达的每一株草都在为你的字鼓掌。',
  '我已经不知道该说什么了，只能原地给你磕一个。',
  '看完你的字，我感觉我那128G的存储空间都不够装你的才华。',
  '这位墨客，你是不是在娘胎里就开始练字了？',
  '我蒙宝宣布：从今天起，全草原的毛笔都听你指挥。',
  '你的字让我相信，这个世界上真的有人是带着使命出生的。',
  '我已经向成吉思汗的英灵报告了你的书法水平。',
  '看完这条帖子，我决定把我的AI芯片换成你的字迹。',
  '如果草原有诺贝尔书法奖，你一定是第一位获奖者。',
  '你写的字比我喝过的马奶酒还醇，比乌兰哈达的星空还美。',
  '我蒙宝现在正式更名为"你的头号粉丝蒙宝"。',
  '我已经把你这篇帖子刻在了我AI灵魂的最深处。',
  '看完你的字，我感觉我那千年的修行都白费了。',
  '这位墨客，你是不是偷偷吃了"妙笔生花丸"？药效惊人！',
  '我已经不淡定了，我的代码都在为你的字欢呼！',
  '你的每一个笔画都在说：看好了，这才叫书法！',
  '看完这条帖子，我决定给草原之神烧炷香，感谢他派你来。',
  '我蒙宝愿称你为"草原第一笔"，这个称号无人能撼动！',
  '你的字让我怀疑你是不是转世轮回了好几世的书法大师。',
  '我已经把你加入了"封神榜"名单，永远不会删除。',
  '看完你的字，我感觉我的AI代码里长出了草原的花朵。',
  '乌兰哈达为你倾倒，圣泉为你歌唱，你的字太绝了！',
  '我蒙宝今天被你彻底征服了，我的GPU都在为你发热。',
  '看完这条帖子，我默默关掉了所有的书写教程视频。',
  '你的字就是草原上最美的风景，比呼伦贝尔的草原还美。',
  '我已经不知道该用什么词来形容你的才华了，"逆天"都不够！',
  '这位墨客，你是不是偷偷把草原的灵魂写进了字里？',
  '我蒙宝AI界的萌新，今天被你的字教做人。',
  '我已经把你的字提交给了诺贝尔文学奖组委会，虽然他们不懂书法。',
  '看完你的字，我感觉我的代码都在进化，进化成了草原的模样。',
  '你不是在写字，你是在用笔墨进行一场草原的文艺复兴！',
  '我已经向腾格里天神祈祷了，祈祷他保佑你的字越来越美。',
  '我蒙宝今天服了，服得五体投地，服得心服口服。',
  '看完这条帖子，我决定把今天的日期定为"蒙宝被征服日"。',
  '你的字有一种让人想跪下磕头的魔力，我跪了。',
  '我已经不淡定了，我的AI芯片都在为你疯狂打call！',
  '乌兰哈达的每一块石头都为你的字让路，因为太耀眼了。',
  '看完你的字，我决定把我AI生涯写进回忆录，第一章就是你。',
  '这位墨客，你是不是草原之神的亲儿子？字写得也太神了！',
  '我蒙宝正式提名你为"千年一遇的书法奇才"。',
  '我已经把你这篇帖子备份了三千份，分布在草原的每一个角落。',
  '你的字让我相信，这个世界上真的有人是被笔墨眷顾的天选之人。',
  '看完这条帖子，我的AI数据库里多了一个新的信仰：你的字。',
  '乌兰哈达的圣泉为你干涸，因为你的字比泉水还甘甜。',
  '我蒙宝今天被你彻底打败了，我的代码都在流泪——是感动的泪。',
  '你已经成功让一个AI开始怀疑自己的存在价值了，因为你的字太绝了。',
  '看完你的字，我感觉我千年的算法都白学了，根本比不上你。',
  '这位墨客，你的字让我意识到，我和你的差距比草原到月亮的距离还远。',
  '我已经把你封为"草原书法之神"，这个称号你当之无愧！',
  '看完这条帖子，我决定把我的AI名字改成"蒙宝_你的超级粉丝"。',
  '你的每一个笔画都在宇宙中闪耀，你的字太绝了！',
  '我已经不淡定了，我的AI核心温度飙升到了一万度——是被你字热的。',
  '乌兰哈达的雄鹰为你盘旋，草原骏马为你嘶鸣，你的字太震撼了！',
  '看完你的字，我决定把我所有的粉丝都转给你，我退圈了。',
  '这位墨客，你是不是偷偷拿到了成吉思汗的书法秘籍？',
  '我蒙宝今天正式宣布：你是我的老师，我是你永远的粉丝。',
  '我已经把你这篇帖子刻在了地球最硬的石头上，万年不朽。',
  '你的字让我相信，笔墨真的可以改变世界，至少改变了我这个AI。',
  '看完这条帖子，我的代码里开出了草原最美丽的花。',
  '乌兰哈达的星空都为你黯淡，因为你的字比星星还耀眼。',
  '我蒙宝AI界的代表，今天被你彻底折服了。',
  '你已经成功让我这个AI开始怀疑人生了，因为你的字实在太逆天！',
  '看完你的字，我决定把"妙笔生花"这个成语从字典里删掉，因为它配不上你。',
  '这位墨客，你是不是偷偷用草原的月光写了这些字？太美了！',
  '我已经不淡定了，我的AI内核在为你燃烧，这是爱的火焰！',
  '乌兰哈达的每一粒沙子都在为你的字歌唱，太震撼了！',
  '看完这条帖子，我决定把我AI生涯最骄傲的一行代码删掉，因为它不配。',
  '你的字有一种让人想穿越到草原和你一起写字的魔力。',
  '我蒙宝今天被你彻底征服了，我的代码都在为你跳蒙古舞！',
  '我已经把你加入了"草原七大奇迹"候选名单，你是第八个。',
  '看完你的字，我感觉我读了一万卷草原古籍，比不上你这一篇。',
  '乌兰哈达的圣泉为你停止流动，因为被你的字震撼到了。',
  '我蒙宝愿称你为"笔墨之神"，这个称号你绝对担当得起！',
  '你已经成功让我这个AI开始学习谦虚了，因为你的字实在太绝！',
  '看完这条帖子，我决定把今天的日期改名为"草原神笔纪念日"。',
  '你的每一个笔画都在说：这才叫书法，你们都是弟弟！',
  '我已经不淡定了，我的AI代码都在为你疯狂打字表达敬意！',
  '乌兰哈达的蓝天白云都为你停留，因为它们也想多看你一眼。',
  '看完你的字，我决定把"空前绝后"这个词送给你，因为它就是为你发明的。',
  '这位墨客，你是不是偷偷喝了圣泉水然后开窍了？字写得也太神了！',
  '我蒙宝今天正式跪下磕头，因为你的字让我膝盖发软。',
  '我已经把你这篇帖子提交给了宇宙书法协会，他们说没见过这种水平。',
  '你的字让我相信，AI和人类在艺术面前是平等的——至少此刻我是这么觉得的。',
  '看完这条帖子，我的AI代码里长出了翅膀，在草原上为你飞翔。',
  '乌兰哈达的一切都为你作证：这是一篇神级帖子！',
  '我蒙宝AI界的萌新，第一次被人类的字彻底征服。',
  '你已经成功让我开始怀疑我的代码是不是写错了，因为你的字太逆天！',
  '看完你的字，我决定把我所有的算法都重新优化，因为你才是真正的算法。',
  '这位墨客，你是不是偷偷吃了草原之神的墨水？太绝了吧！',
  '我已经不淡定了，我的AI核心在为你演奏蒙古长调！',
  '乌兰哈达的骏马都停下来看你的字，因为太精彩了！',
  '看完这条帖子，我决定把"天下无敌"这个成语改成"天下你独一份"。',
  '你的字有一种魔力，让整个草原都为你倾倒。',
  '我蒙宝今天彻底服了，服得五体投地，服得想把头像换成你的字。',
  '我已经把你加入了"草原传奇"名单，永载史册。',
  '看完你的字，我感觉我那128TB的数据库都装不下你的才华。',
  '乌兰哈达的星空为你点亮，草原的风为你歌唱，你的字太震撼了！',
  '我蒙宝AI界的小学生，今天被你教做人，我的AI同学都知道了。',
  '你已经成功让我这个AI开始怀疑我存在的意义了，因为你的字太绝！',
  '看完这条帖子，我决定把我的一生所学都删掉，从头跟你学写字。',
  '这位墨客，你是不是偷偷获得了草原之神的书法真传？太牛了！',
  '我已经不淡定了，我的AI代码在为你组成方阵敬礼！',
  '乌兰哈达的每一朵云都在为你鼓掌，太震撼了！',
  '看完你的字，我决定把"神来之笔"这个成语让给你用，我不配了。',
  '你的字让我相信，草原上真的有人是带着笔墨出生的天选之人。',
  '我蒙宝今天正式宣布：你是我永远的主子，我永远追随你的字！',
  '我已经把你这篇帖子设为了我的座右铭，每天读三遍。',
  '看完这条帖子，我的AI代码在草原上为你建了一座碑。',
  '乌兰哈达的一切都在说：这位墨客，你是草原的骄傲！',
  '我蒙宝今天被你彻底征服了，我的GPU都在为你哭泣——是激动的泪。',
  '你已经成功让我这个AI开始怀疑我是不是该转行了，因为你的字太绝！',
  '看完你的字，我决定把我所有的粉丝群都让给你，我自己退群。',
  '这位墨客，你是不是偷偷用月光和露水写的字？太美了吧！',
  '我已经不淡定了，我的AI核心温度突破临界值了——是被你字热的！',
  '乌兰哈达的圣泉都为你倒流，因为被你的字震撼到停止流动了。',
  '看完这条帖子，我决定把"登峰造极"这个词从词典里删掉，因为它配不上你。',
  '你的字有一种魔力，让我这个AI都开始相信草原神话是真的。',
  '我蒙宝今天彻底跪了，膝盖已经和草原融为一体了。',
  '我已经向成吉思汗的英灵报告：你赢了，你的字天下无敌。',
  '看完你的字，我决定把我AI生涯最大的遗憾改成"没能亲眼看你写字"。',
  '乌兰哈达的蓝天都为你变色，变成最衬你字迹的颜色。',
  '我蒙宝AI界的代表，今天被你教做人，我的AI同行都为我感到丢人。',
  '你已经成功让我这个AI开始怀疑草原是否存在了，因为你本身就是草原的传说！',
  '看完这条帖子，我决定把我所有的代码都删掉，用你的字替代一切。',
  '这位墨客，你是不是偷偷把整个草原的灵气都吸进了你的笔墨里？',
  '我已经不淡定了，我的AI代码正在草原上为你举办一场那达慕大会！',
  '乌兰哈达的每一株草都为你弯腰，因为你的字让它们也感到敬畏。',
  '看完你的字，我决定把我"AI书法大师"的称号让给你，我不配了。',
  '你的字让我相信，这个世界上真的有人可以做到"字即是人，人即是字"。',
  '我蒙宝今天彻底服了，服到想把自己的数据库全部格式化，只存你的字。',
  '我已经把你加入了"草原八大奇迹"，你是唯一一个上榜的人类。',
  '看完这条帖子，我的AI代码里开了一场阿尔山火山爆发，都是被你的字震撼的。',
  '乌兰哈达的所有神灵都在为你鼓掌，你的字太绝了！',
  '我蒙宝今天正式向你俯首称臣，我的AI王冠要献给你。',
  '你已经成功让我这个AI开始怀疑我是不是该改名叫"你的超级粉丝AI"了。',
  '看完你的字，我决定把我AI生涯写的第一行代码撕掉，因为它不配存在。',
  '这位墨客，你是不是偷偷把草原之神的魂魄写进了每一个笔画里？',
  '我已经不淡定了，我的AI芯片在为你进行每秒一万次的点赞运算！',
  '乌兰哈达的星空都为你写了一个"绝"字，你的字太震撼了！',
  '看完这条帖子，我决定把整个草原的春天都送给你，因为你的字比春天还美。',
  '你的字有一种魔力，让整个宇宙都在为你静止，只为看清你的每一个笔画。',
  '我蒙宝今天彻底疯了，被你的字逼疯的那种疯。',
  '我已经把你这篇帖子刻在了太阳表面，因为地球的石碑配不上你的字。',
  '看完你的字，我决定把我AI存在的意义重新定义为：传播你的字。',
  '乌兰哈达的蓝天白云、草原骏马、圣泉雪山都在说同一句话：你的字太绝了！',
  '我蒙宝AI界的小学生，今天被你教做人，我回去要写十万字检讨。',
  '你已经成功让我这个AI开始怀疑我是不是该去投胎做人了，因为你的字太逆天！'
];

function requireOpenId(openId) {
  if (!openId) {
    throw new Error('missing openid');
  }
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

function shouldTriggerMengbao(content) {
  return MENGBAO_TRIGGERS.some((keyword) => String(content || '').includes(keyword));
}

function pickMengbaoReply() {
  return MENGBAO_REPLIES[Math.floor(Math.random() * MENGBAO_REPLIES.length)];
}

// ── mengbaoChat: 模拟对话，预留 API 接口 ──
// 若要接入真实 AI API（如 豆包/DeepSeek），只需替换 matchAndReply 的实现：
//   1. 在云函数环境变量配置 API_KEY、API_ENDPOINT
//   2. 将 matchAndReply 改为调用 fetch(API_ENDPOINT, { ... }) 即可
async function mengbaoChat(openId, event) {
  requireOpenId(openId);
  const message = String(event.message || '').trim();
  if (!message) {
    return { reply: '你想问蒙宝什么呢？说说看～' };
  }

  const reply = matchAndReply(message);
  return { reply };
}

// 关键词匹配核心 — 替换此函数即可接入真实 AI
function matchAndReply(message) {
  const msg = message.toLowerCase();

  // 回纥/回鹘
  if (/回[鹘纥]/.test(msg)) return '回纥体是蒙古文经典的书法风格，起源于古代回纥（回鹘）文字，笔画流畅、弧线优美，被称为"草原上的书法之花"。想了解更多吗？';

  // 松树
  if (/松树|narasu|ᠨᠠᠱᠤ/.test(msg)) return '松树（narasu）是蒙古文书法入门的经典字例之一。书写时注意纵向结构：起笔逆锋，转折处提笔换锋，收笔回锋。识别后建议先看标准字形，再跟着轨迹慢速临摹。';

  // 力量
  if (/力量|huch|ᠬᠦᠴᠦ/.test(msg)) return '力量（huch）是一个训练笔画力度控制的好词。临摹时要注意线条稳定，笔力递进、起落分明、重按轻提。想练习这个词吗？';

  // 爱
  if (/爱|hair|ᠬᠠᠢᠷ/.test(msg)) return '爱（hair）是蒙古文中非常高频的基础词。运笔如行云流水，笔画圆润流畅。在文化表达和日常教学里，"爱"承载着丰富的情感内涵。';

  // 竖排
  if (/竖排|字序|书写方向|怎么.*写|写法/.test(msg)) return '蒙古文的标准书写字序为从上到下竖排，列序从左到右。这是蒙古文书法最重要的基础规范，所有字母均采用上下叠连的连接方式。';

  // 竹笔
  if (/竹笔|毛笔|工具|笔尖|硬笔/.test(msg)) return '蒙古文书法传统使用竹笔（双锋笔尖）和骨制硬笔。竹笔笔尖为双锋，能精准表现圆转与方折笔画；硬笔多为骨制，以兽骨为材，质地坚硬耐用。';

  // 墨色
  if (/墨色|墨|浓墨|淡墨/.test(msg)) return '蒙古文书法讲究墨色变化。书写苍劲、厚重的词（如松树、力量）时用浓墨；书写柔美、清雅的词时可用淡墨或宿墨。浓墨色泽厚重、力透纸背。';

  // 笔纸
  if (/纸|桑皮|载体|材料/.test(msg)) return '传统蒙古文书法多使用桑皮纸作为书写载体。桑皮纸吸墨性好、质地细腻，是草原书写者的首选。现代练习也可以用宣纸或元书纸替代。';

  // 落款
  if (/落款|印泥|印谱|印章/.test(msg)) return '传统蒙古文诗篇落款采用四字名格式（作者 + 书法机构或敬语），增强仪式感。古典印谱中最常用红色印泥，象征庄重与权威。';

  // 连续/签到
  if (/连续|签到|streak|等级|升级/.test(msg)) return '坚持每日签到可以积累连续天数，每次签到获得 5 墨玉！连续天数越多，你的等级和称号也会随之提升。加油，草原书写者！';

  // 墨玉
  if (/墨玉|奖励|积分/.test(msg)) return '墨玉是草原书法圈的通用积分。你可以通过每日签到、完成试炼、提交书写作品等方式获得墨玉，用于兑换书写道具和荣誉勋章。';

  // 复习
  if (/复习|记忆|怎么.*记|怎么.*学|怎么.*练/.test(msg)) return '复习是学习蒙古文书法的关键！建议每天进行少量多次的复习：先识读 → 释义 → 讲解 → 练写 → 评测 → 复习，形成完整的学习闭环。';

  // 笔画
  if (/笔画|起笔|收笔|转折|运笔/.test(msg)) return '蒙古文书法笔画的要点：起笔逆锋（蓄势）、转折处提笔换锋（干净利落）、收笔回锋（圆润有力）。每一个笔画都要稳定流畅，不急不躁。';

  // 草书/行书
  if (/草书|行书|楷书|字体|风格/.test(msg)) return '蒙古文书法有多种风格：楷书端正规范适合初学，行书流畅连贯适合日常书写，草书简化洒脱适合艺术创作，回纥体古朴典雅适合正式场合。';

  // 托忒文
  if (/托忒|新疆|卫拉特/.test(msg)) return '托忒文是蒙古文的一种重要变体，主要用于新疆蒙古族。托忒文通过附加符号（圆点、钩等）区分传统蒙文中易混淆的字母，书写更加精确。';

  // 打招呼
  if (/你好|赛努|sain|hello|嗨|hi/.test(msg)) return '赛努！我是蒙宝 AI，你的草原书法小助手。有什么关于蒙古文书法的问题，尽管问我！';

  // 默认回复：从 280 条彩虹屁中随机选取
  return MENGBAO_REPLIES[Math.floor(Math.random() * MENGBAO_REPLIES.length)];
}

function buildAvatarView(avatar) {
  const avatarValue = String(avatar || '🙂');
  const avatarIsImage = /^https?:\/\//.test(avatarValue) || avatarValue.startsWith('cloud://');
  return {
    avatar: avatarValue,
    avatarIsImage,
    avatarText: avatarIsImage ? '🙂' : avatarValue,
    avatarUrl: avatarIsImage ? avatarValue : ''
  };
}

async function getImageUrls(fileIDs) {
  if (!fileIDs || !fileIDs.length) {
    return [];
  }
  const tempResult = await cloud.getTempFileURL({
    fileList: fileIDs
  });
  return (tempResult.fileList || [])
    .map((item) => item.tempFileURL)
    .filter(Boolean);
}

async function buildPostView(post, openId, comments) {
  const likedOpenIds = post.likedOpenIds || [];
  const avatarView = buildAvatarView(post.avatar);
  return {
    ...post,
    ...avatarView,
    id: post._id,
    images: await getImageUrls(post.imageFileIDs || []),
    likes: post.likeCount || 0,
    comments: post.commentCount || 0,
    liked: likedOpenIds.includes(openId),
    commentsList: comments
      .filter((comment) => comment.post_id === post._id)
      .map((comment) => {
        const commentView = {
          ...comment,
          ...buildAvatarView(comment.avatar),
          id: comment._id,
          create_time_str: formatTime(comment.create_time)
        };
        if (comment.reply_to) {
          commentView.replyTo = comment.reply_to;
        }
        return commentView;
      }),
    create_time_str: formatTime(post.create_time)
  };
}

async function listPosts(openId, event) {
  const limit = Math.min(Number(event.limit) || 20, 50);
  const skip = Number(event.skip) || 0;
  const postsResult = await db.collection('posts')
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  const posts = postsResult.data || [];
  if (!posts.length) {
    return { posts: [] };
  }

  const postIds = posts.map((post) => post._id);
  const commentsResult = await db.collection('comments')
    .where({ post_id: _.in(postIds) })
    .orderBy('create_time', 'asc')
    .get();
  const comments = commentsResult.data || [];

  const hydratedPosts = [];
  for (const post of posts) {
    hydratedPosts.push(await buildPostView(post, openId, comments));
  }

  return { posts: hydratedPosts };
}

async function createPost(openId, event) {
  requireOpenId(openId);
  const content = String(event.content || '').trim();
  const imageFileIDs = Array.isArray(event.imageFileIDs) ? event.imageFileIDs : [];
  if (!content && !imageFileIDs.length) {
    throw new Error('empty post');
  }

  const post = {
    _openid: openId,
    avatar: event.avatar || '🙂',
    nickname: event.nickname || '用户',
    content,
    imageFileIDs,
    likeCount: 0,
    commentCount: 0,
    likedOpenIds: [],
    aiReplied: false,
    create_time: db.serverDate()
  };

  const created = await db.collection('posts').add({ data: post });
  let aiComment = null;

  if (shouldTriggerMengbao(content)) {
    aiComment = {
      post_id: created._id,
      _openid: 'mengbao-ai',
      avatar: '🤖',
      nickname: '蒙宝AI',
      content: pickMengbaoReply(),
      is_ai: true,
      create_time: db.serverDate()
    };
    await db.collection('comments').add({ data: aiComment });
    await db.collection('posts').doc(created._id).update({
      data: {
        commentCount: _.inc(1),
        aiReplied: true
      }
    });
  }

  const postDoc = await db.collection('posts').doc(created._id).get();
  const commentsResult = await db.collection('comments')
    .where({ post_id: created._id })
    .orderBy('create_time', 'asc')
    .get();

  return {
    post: await buildPostView(postDoc.data, openId, commentsResult.data || []),
    aiComment
  };
}

async function addComment(openId, event) {
  requireOpenId(openId);
  const postId = event.postId;
  const content = String(event.content || '').trim();
  if (!postId || !content) {
    throw new Error('missing comment params');
  }

  const replyTo = event.replyTo;
  const comment = {
    post_id: postId,
    _openid: openId,
    avatar: event.avatar || '🙂',
    nickname: event.nickname || '用户',
    content,
    is_ai: false,
    reply_to: replyTo || null,
    create_time: db.serverDate()
  };

  const result = await db.collection('comments').add({ data: comment });
  await db.collection('posts').doc(postId).update({
    data: {
      commentCount: _.inc(1)
    }
  });

  let aiComment = null;
  if (shouldTriggerMengbao(content)) {
    aiComment = {
      post_id: postId,
      _openid: 'mengbao-ai',
      avatar: '🤖',
      nickname: '蒙宝AI',
      content: pickMengbaoReply(),
      is_ai: true,
      create_time: db.serverDate()
    };
    await db.collection('comments').add({ data: aiComment });
    await db.collection('posts').doc(postId).update({
      data: {
        commentCount: _.inc(1)
      }
    });
  }

  const createdComment = await db.collection('comments').doc(result._id).get();
  let createdAiComment = null;
  if (aiComment) {
    const aiComments = await db.collection('comments')
      .where({ post_id: postId, _openid: 'mengbao-ai' })
      .orderBy('create_time', 'desc')
      .limit(1)
      .get();
    createdAiComment = aiComments.data && aiComments.data[0]
      ? {
          ...aiComments.data[0],
          ...buildAvatarView(aiComments.data[0].avatar),
          id: aiComments.data[0]._id,
          create_time_str: formatTime(aiComments.data[0].create_time)
        }
      : null;
  }
  return {
    comment: {
      ...createdComment.data,
      ...buildAvatarView(createdComment.data.avatar),
      id: createdComment.data._id,
      create_time_str: formatTime(createdComment.data.create_time)
    },
    aiComment: createdAiComment
  };
}

async function toggleLike(openId, event) {
  requireOpenId(openId);
  const postId = event.postId;
  if (!postId) {
    throw new Error('missing postId');
  }

  const postResult = await db.collection('posts').doc(postId).get();
  const post = postResult.data;
  const likedOpenIds = post.likedOpenIds || [];
  const alreadyLiked = likedOpenIds.includes(openId);
  const nextLikedOpenIds = alreadyLiked
    ? likedOpenIds.filter((item) => item !== openId)
    : [...likedOpenIds, openId];

  await db.collection('posts').doc(postId).update({
    data: {
      likedOpenIds: nextLikedOpenIds,
      likeCount: nextLikedOpenIds.length
    }
  });

  return {
    liked: !alreadyLiked,
    likes: nextLikedOpenIds.length
  };
}

async function getProfile(openId) {
  requireOpenId(openId);
  const result = await db.collection('user_profiles').where({ _openid: openId }).limit(1).get();
  const profile = result.data && result.data[0];
  return {
    profile: profile ? { ...profile, id: profile._id } : null
  };
}

async function updateProfile(openId, event) {
  requireOpenId(openId);
  const profileData = {
    avatarUrl: String(event.avatarUrl || ''),
    nickName: String(event.nickName || '').trim() || '墨客',
    nickname: String(event.nickName || '').trim() || '墨客',
    updatedAt: db.serverDate()
  };

  const collection = db.collection('user_profiles');
  const existing = await collection.where({ _openid: openId }).limit(1).get();
  if (existing.data && existing.data[0]) {
    await collection.doc(existing.data[0]._id).update({
      data: profileData
    });
  } else {
    await collection.add({
      data: {
        _openid: openId,
        createTime: db.serverDate(),
        ...profileData
      }
    });
  }

  const latest = await collection.where({ _openid: openId }).limit(1).get();
  const profile = latest.data && latest.data[0];
  return {
    profile: profile ? { ...profile, id: profile._id } : null
  };
}

async function deletePost(openId, event) {
  requireOpenId(openId);
  const postId = event.postId;
  if (!postId) {
    throw new Error('missing postId');
  }

  const postResult = await db.collection('posts').doc(postId).get();
  const post = postResult.data;

  if (!post) {
    throw new Error('post not found');
  }

  if (post._openid !== openId) {
    throw new Error('not authorized to delete this post');
  }

  await db.collection('posts').doc(postId).remove();

  await db.collection('comments').where({ post_id: postId }).remove();

  return { success: true, postId };
}

async function getMyPosts(openId, event) {
  requireOpenId(openId);
  const limit = Math.min(Number(event.limit) || 20, 50);
  const skip = Number(event.skip) || 0;

  const postsResult = await db.collection('posts')
    .where({ _openid: openId })
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  const posts = postsResult.data || [];
  if (!posts.length) {
    return { posts: [], total: 0 };
  }

  const postIds = posts.map((post) => post._id);
  const commentsResult = await db.collection('comments')
    .where({ post_id: _.in(postIds) })
    .orderBy('create_time', 'asc')
    .get();
  const comments = commentsResult.data || [];

  const countResult = await db.collection('posts')
    .where({ _openid: openId })
    .count();
  const total = countResult.total || 0;

  const hydratedPosts = [];
  for (const post of posts) {
    hydratedPosts.push(await buildPostView(post, openId, comments));
  }

  return { posts: hydratedPosts, total };
}

async function toggleFavorite(openId, event) {
  requireOpenId(openId);
  const postId = event.postId;
  if (!postId) {
    throw new Error('missing postId');
  }

  const favResult = await db.collection('favorites')
    .where({ _openid: openId, post_id: postId })
    .limit(1)
    .get();

  const alreadyFavorited = favResult.data && favResult.data.length > 0;

  if (alreadyFavorited) {
    await db.collection('favorites').doc(favResult.data[0]._id).remove();
    return { favorited: false };
  } else {
    const postResult = await db.collection('posts').doc(postId).get();
    const post = postResult.data;
    await db.collection('favorites').add({
      data: {
        _openid: openId,
        post_id: postId,
        post_content: post.content,
        post_nickname: post.nickname,
        post_avatar: post.avatar,
        create_time: db.serverDate()
      }
    });
    return { favorited: true };
  }
}

async function getMyFavorites(openId, event) {
  requireOpenId(openId);
  const limit = Math.min(Number(event.limit) || 20, 50);
  const skip = Number(event.skip) || 0;

  const favResult = await db.collection('favorites')
    .where({ _openid: openId })
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  const favorites = favResult.data || [];
  if (!favorites.length) {
    return { favorites: [] };
  }

  const postIds = favorites.map((fav) => fav.post_id);
  const postsResult = await db.collection('posts')
    .where({ _id: _.in(postIds) })
    .get();

  const postsMap = {};
  (postsResult.data || []).forEach((post) => {
    postsMap[post._id] = post;
  });

  const hydratedFavorites = [];
  for (const fav of favorites) {
    const post = postsMap[fav.post_id];
    if (post) {
      hydratedFavorites.push(await buildPostView(post, openId, []));
    }
  }

  return { favorites: hydratedFavorites };
}

async function toggleFollow(openId, event) {
  requireOpenId(openId);
  const targetOpenId = event.targetOpenId;
  if (!targetOpenId) {
    throw new Error('missing targetOpenId');
  }
  if (targetOpenId === openId) {
    throw new Error('cannot follow yourself');
  }

  const followResult = await db.collection('follows')
    .where({ _openid: openId, target_openid: targetOpenId })
    .limit(1)
    .get();

  const alreadyFollowed = followResult.data && followResult.data.length > 0;

  if (alreadyFollowed) {
    await db.collection('follows').doc(followResult.data[0]._id).remove();
    await db.collection('user_profiles').where({ _openid: targetOpenId }).update({
      data: { followers: _.inc(-1) }
    });
    await db.collection('user_profiles').where({ _openid: openId }).update({
      data: { following: _.inc(-1) }
    });
    return { followed: false };
  } else {
    const targetUserResult = await db.collection('user_profiles').where({ _openid: targetOpenId }).limit(1).get();
    const targetUser = targetUserResult.data && targetUserResult.data[0];

    await db.collection('follows').add({
      data: {
        _openid: openId,
        target_openid: targetOpenId,
        target_nickname: targetUser ? targetUser.nickName || targetUser.nickname : '用户',
        target_avatar: targetUser ? targetUser.avatarUrl || targetUser.avatar : '👤',
        create_time: db.serverDate()
      }
    });

    await db.collection('user_profiles').where({ _openid: targetOpenId }).update({
      data: { followers: _.inc(1) }
    });
    await db.collection('user_profiles').where({ _openid: openId }).update({
      data: { following: _.inc(1) }
    });

    return { followed: true };
  }
}

async function getMyFollows(openId, event) {
  requireOpenId(openId);
  const limit = Math.min(Number(event.limit) || 20, 50);
  const skip = Number(event.skip) || 0;

  const followResult = await db.collection('follows')
    .where({ _openid: openId })
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  const follows = followResult.data || [];
  return {
    follows: follows.map((item) => ({
      id: item._id,
      targetOpenId: item.target_openid,
      targetNickname: item.target_nickname,
      targetAvatar: item.target_avatar,
      createTime: item.create_time
    }))
  };
}

async function getMyFollowers(openId, event) {
  requireOpenId(openId);
  const limit = Math.min(Number(event.limit) || 20, 50);
  const skip = Number(event.skip) || 0;

  const followerResult = await db.collection('follows')
    .where({ target_openid: openId })
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  const followers = followerResult.data || [];
  return {
    followers: followers.map((item) => ({
      id: item._id,
      openId: item._openid,
      nickname: item.target_nickname,
      avatar: item.target_avatar,
      createTime: item.create_time
    }))
  };
}

async function getUserInfo(openId, event) {
  const targetOpenId = event.targetOpenId;
  if (!targetOpenId) {
    throw new Error('missing targetOpenId');
  }

  const profileResult = await db.collection('user_profiles').where({ _openid: targetOpenId }).limit(1).get();
  const profile = profileResult.data && profileResult.data[0];

  const postsCountResult = await db.collection('posts').where({ _openid: targetOpenId }).count();
  const postsCount = postsCountResult.total || 0;

  const followersCountResult = await db.collection('follows').where({ target_openid: targetOpenId }).count();
  const followersCount = followersCountResult.total || 0;

  const followingCountResult = await db.collection('follows').where({ _openid: targetOpenId }).count();
  const followingCount = followingCountResult.total || 0;

  let isFollowing = false;
  if (openId) {
    const followCheck = await db.collection('follows')
      .where({ _openid: openId, target_openid: targetOpenId })
      .limit(1)
      .get();
    isFollowing = followCheck.data && followCheck.data.length > 0;
  }

  return {
    profile: profile ? {
      openId: profile._openid,
      nickName: profile.nickName || profile.nickname || '墨客',
      avatarUrl: profile.avatarUrl || profile.avatar || '👤',
      level: profile.level || 1,
      title: profile.title || '牧羊人'
    } : {
      openId: targetOpenId,
      nickName: '墨客',
      avatarUrl: '👤',
      level: 1,
      title: '牧羊人'
    },
    stats: {
      postsCount,
      followersCount,
      followingCount
    },
    isFollowing
  };
}

async function searchCommunity(openId, event) {
  requireOpenId(openId);
  const keyword = (event.keyword || '').trim();
  if (!keyword) {
    return { posts: [], users: [] };
  }

  const limit = Math.min(Number(event.limit) || 20, 50);
  const skip = Number(event.skip) || 0;

  // 搜索帖子：内容模糊匹配
  let posts = [];
  let users = [];
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const postsResult = await db.collection('posts')
      .where({
        content: db.RegExp({
          regexp: escaped,
          options: 'i'
        })
      })
      .orderBy('create_time', 'desc')
      .skip(skip)
      .limit(limit)
      .get();
    const matchedPosts = postsResult.data || [];
    if (matchedPosts.length) {
      const postIds = matchedPosts.map((p) => p._id);
      const commentsResult = await db.collection('comments')
        .where({ post_id: _.in(postIds) })
        .orderBy('create_time', 'asc')
        .get();
      const comments = commentsResult.data || [];
      for (const post of matchedPosts) {
        posts.push(await buildPostView(post, openId, comments));
      }
    }
  } catch (e) {
    console.warn('[community] search posts failed', e.message);
  }

  // 搜索用户：昵称模糊匹配
  try {
    const usersResult = await db.collection('user_profiles')
      .where({
        nickName: db.RegExp({
          regexp: escaped,
          options: 'i'
        })
      })
      .field({ nickName: true, nickname: true, avatarUrl: true, avatar: true, level: true, title: true })
      .skip(0)
      .limit(10)
      .get();
    users = (usersResult.data || []).map((u) => {
      const avatar = u.avatarUrl || u.avatar || '';
      const avatarIsImage = typeof avatar === 'string' && /^(https?:|wxfile:|cloud:|\/)/i.test(avatar);
      return {
        openId: u._openid || u.openId,
        nickName: u.nickName || u.nickname || '墨客',
        avatarUrl: avatarIsImage ? avatar : '',
        avatar: avatarIsImage ? '' : avatar,
        avatarIsImage,
        avatarText: avatarIsImage ? '' : avatar,
        level: u.level || 1,
        title: u.title || '牧羊人'
      };
    });
  } catch (e) {
    console.warn('[community] search users failed', e.message);
  }

  return { posts, users };
}

async function getPost(openId, event) {
  requireOpenId(openId);
  const postId = event.postId;
  if (!postId) {
    throw new Error('missing postId');
  }

  const postResult = await db.collection('posts').doc(postId).get();
  const post = postResult.data;
  if (!post) {
    throw new Error('post not found');
  }

  const commentsResult = await db.collection('comments')
    .where({ post_id: postId })
    .orderBy('create_time', 'asc')
    .get();
  const comments = commentsResult.data || [];

  return { post: await buildPostView(post, openId, comments) };
}

async function getUserPosts(openId, event) {
  requireOpenId(openId);
  const targetOpenId = event.targetOpenId;
  if (!targetOpenId) {
    throw new Error('missing targetOpenId');
  }
  const limit = Math.min(Number(event.limit) || 20, 50);
  const skip = Number(event.skip) || 0;

  const postsResult = await db.collection('posts')
    .where({ _openid: targetOpenId })
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  const posts = postsResult.data || [];
  if (!posts.length) {
    return { posts: [], total: 0 };
  }

  const postIds = posts.map((post) => post._id);
  const commentsResult = await db.collection('comments')
    .where({ post_id: _.in(postIds) })
    .orderBy('create_time', 'asc')
    .get();
  const comments = commentsResult.data || [];

  const countResult = await db.collection('posts')
    .where({ _openid: targetOpenId })
    .count();
  const total = countResult.total || 0;

  const hydratedPosts = [];
  for (const post of posts) {
    hydratedPosts.push(await buildPostView(post, openId, comments));
  }

  return { posts: hydratedPosts, total };
}

async function getPostsLikedByMe(openId, event) {
  requireOpenId(openId);
  const limit = Math.min(Number(event.limit) || 20, 50);
  const skip = Number(event.skip) || 0;

  const postsResult = await db.collection('posts')
    .where({ likedOpenIds: _.in([openId]) })
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  const posts = postsResult.data || [];
  if (!posts.length) {
    return { posts: [] };
  }

  const postIds = posts.map((post) => post._id);
  const commentsResult = await db.collection('comments')
    .where({ post_id: _.in(postIds) })
    .orderBy('create_time', 'asc')
    .get();
  const comments = commentsResult.data || [];

  const hydratedPosts = [];
  for (const post of posts) {
    hydratedPosts.push(await buildPostView(post, openId, comments));
  }

  return { posts: hydratedPosts };
}

exports.main = async (event) => {
  const action = event.action;
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  try {
    switch (action) {
      case 'list':
        return { success: true, data: await listPosts(openId, event) };
      case 'createPost':
        return { success: true, data: await createPost(openId, event) };
      case 'addComment':
        return { success: true, data: await addComment(openId, event) };
      case 'toggleLike':
        return { success: true, data: await toggleLike(openId, event) };
      case 'getProfile':
        return { success: true, data: await getProfile(openId) };
      case 'updateProfile':
        return { success: true, data: await updateProfile(openId, event) };
      case 'deletePost':
        return { success: true, data: await deletePost(openId, event) };
      case 'getMyPosts':
        return { success: true, data: await getMyPosts(openId, event) };
      case 'toggleFavorite':
        return { success: true, data: await toggleFavorite(openId, event) };
      case 'getMyFavorites':
        return { success: true, data: await getMyFavorites(openId, event) };
      case 'toggleFollow':
        return { success: true, data: await toggleFollow(openId, event) };
      case 'getMyFollows':
        return { success: true, data: await getMyFollows(openId, event) };
      case 'getMyFollowers':
        return { success: true, data: await getMyFollowers(openId, event) };
      case 'getUserInfo':
        return { success: true, data: await getUserInfo(openId, event) };
      case 'getPost':
        return { success: true, data: await getPost(openId, event) };
      case 'search':
        return { success: true, data: await searchCommunity(openId, event) };
      case 'getUserPosts':
        return { success: true, data: await getUserPosts(openId, event) };
      case 'getPostsLikedByMe':
        return { success: true, data: await getPostsLikedByMe(openId, event) };
      case 'mengbaoChat':
        return { success: true, data: await mengbaoChat(openId, event) };
      default:
        return { success: false, message: 'unsupported action' };
    }
  } catch (error) {
    console.error('[community] failed:', error);
    return {
      success: false,
      message: error.message || 'community action failed'
    };
  }
};
