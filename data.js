// 山海经神兽定义 - 每种神兽对应 photos/{id}/stage1~5.jpg
window.PET_TYPES = [
  { id:'qinglong', name:'青龙', icon:'🐉', desc:'东方之神，掌管风雨，翠鳞闪耀，守护四方安宁。', food:'⚡ 雷霆之力', breeds:[{id:'qinglong',name:'青龙',icon:'🐉'}] },
  { id:'baihu', name:'白虎', icon:'🐯', desc:'西方之神，威猛无双，百兽之王，镇守一方。', food:'🌟 星辰之力', breeds:[{id:'baihu',name:'白虎',icon:'🐯'}] },
  { id:'zhuque', name:'朱雀', icon:'🦅', desc:'南方之神，浴火重生，吉祥如意。', food:'🔥 火焰精华', breeds:[{id:'zhuque',name:'朱雀',icon:'🦅'}] },
  { id:'xuanwu', name:'玄武', icon:'🐢', desc:'北方之神，龟蛇合体，寿与天齐，稳如磐石。', food:'💧 玄冰之水', breeds:[{id:'xuanwu',name:'玄武',icon:'🐢'}] },
  { id:'fenghuang', name:'凤凰', icon:'🦚', desc:'百鸟之王，浴火重生，象征美好与希望。', food:'🌈 彩云之露', breeds:[{id:'fenghuang',name:'凤凰',icon:'🦚'}] },
  { id:'qinlin', name:'麒麟', icon:'🦄', desc:'仁兽，脚踏祥云，出现则天下太平。', food:'🌸 祥云花露', breeds:[{id:'qinlin',name:'麒麟',icon:'🦄'}] },
  { id:'pixiu', name:'貔貅', icon:'🦁', desc:'上古神兽，招财辟邪，镇宅护身。', food:'💰 金银之气', breeds:[{id:'pixiu',name:'貔貅',icon:'🦁'}] },
  { id:'yinglong', name:'应龙', icon:'🐲', desc:'有翼之龙，助黄帝战蚩尤，威震八方。', food:'☁️ 云雾之精', breeds:[{id:'yinglong',name:'应龙',icon:'🐲'}] },
  { id:'zhulong', name:'烛龙', icon:'🌟', desc:'人面龙身，口衔烛火，照耀幽冥之地。', food:'🕯️ 烛火之光', breeds:[{id:'zhulong',name:'烛龙',icon:'🌟'}] },
  { id:'taotie', name:'饕餮', icon:'👹', desc:'青铜器上的守护神纹，贪食之兽，凶猛异常。', food:'🍖 天地精华', breeds:[{id:'taotie',name:'饕餮',icon:'👹'}] },
  { id:'hundun', name:'混沌', icon:'🌀', desc:'天地未开之神，蕴含无尽能量，万物之源。', food:'🌌 宇宙之源', breeds:[{id:'hundun',name:'混沌',icon:'🌀'}] },
  { id:'jiuweihu', name:'九尾狐', icon:'🦊', desc:'千年修炼，九尾齐现，智慧与美丽并存。', food:'🌙 月华之光', breeds:[{id:'jiuweihu',name:'九尾狐',icon:'🦊'}] },
  { id:'jingwei', name:'精卫', icon:'🐦', desc:'炎帝之女溺海化鸟，衔石填海，永不言弃。', food:'🪨 海之碎石', breeds:[{id:'jingwei',name:'精卫',icon:'🐦'}] },
  { id:'jinwu', name:'金乌', icon:'☀️', desc:'三足神鸟，栖于太阳之中，掌管光明与温暖。', food:'🌞 日之精华', breeds:[{id:'jinwu',name:'金乌',icon:'☀️'}] },
  { id:'yutu', name:'玉兔', icon:'🐰', desc:'月宫神兽，手持玉杵捣药，善良温柔。', food:'🌿 仙草灵药', breeds:[{id:'yutu',name:'玉兔',icon:'🐰'}] },
  { id:'xiezhi', name:'獬豸', icon:'🦏', desc:'独角神兽，能辨善恶是非，公正之象征。', food:'⚖️ 正义之光', breeds:[{id:'xiezhi',name:'獬豸',icon:'🦏'}] },
  { id:'baize', name:'白泽', icon:'🦌', desc:'圣兽，能言语，知天下鬼神之事，黄帝得之。', food:'📖 智慧之书', breeds:[{id:'baize',name:'白泽',icon:'🦌'}] },
  { id:'tiangou', name:'天狗', icon:'🐺', desc:'流星化身，速如闪电，护主忠诚不二。', food:'🌠 流星之力', breeds:[{id:'tiangou',name:'天狗',icon:'🐺'}] },
  { id:'bifang', name:'毕方', icon:'🦩', desc:'木精之鸟，一足赤纹，出则有火灾，上古奇鸟。', food:'🔥 赤炎之木', breeds:[{id:'bifang',name:'毕方',icon:'🦩'}] },
  { id:'shanxiao', name:'山魈', icon:'🐒', desc:'人形独脚，好效人声，住山洞，山林之神。', food:'🍄 山林菌菇', breeds:[{id:'shanxiao',name:'山魈',icon:'🐒'}] }
];

// 默认加分项
const DEFAULT_PLUS_ITEMS = [
  { name: '早读打卡', points: 1 },
  { name: '积极回答', points: 1 },
  { name: '作业优秀', points: 1 },
  { name: '完成背诵', points: 1 }
];

// 默认扣分项
const DEFAULT_MINUS_ITEMS = [
  { name: '不认真听讲', points: 1 },
  { name: '未交作业', points: 1 }
];

// 默认宠物装扮（10个卡通玩具和装饰）
const DEFAULT_ACCESSORIES = [
  { id: 'accessory_crown', name: '金色皇冠', icon: '👑', points: 50, enabled: true },
  { id: 'accessory_hat', name: '可爱帽子', icon: '🎩', points: 30, enabled: true },
  { id: 'accessory_bow', name: '粉色蝴蝶结', icon: '🎀', points: 25, enabled: true },
  { id: 'accessory_star', name: '闪亮星星', icon: '⭐', points: 20, enabled: true },
  { id: 'accessory_heart', name: '爱心项链', icon: '💝', points: 35, enabled: true },
  { id: 'accessory_sunglasses', name: '酷炫墨镜', icon: '🕶️', points: 40, enabled: true },
  { id: 'accessory_flower', name: '美丽花朵', icon: '🌸', points: 20, enabled: true },
  { id: 'accessory_balloon', name: '彩色气球', icon: '🎈', points: 15, enabled: true },
  { id: 'accessory_rocket', name: '小火箭', icon: '🚀', points: 45, enabled: true },
  { id: 'accessory_trophy', name: '小奖杯', icon: '🏆', points: 60, enabled: true }
];

// 默认商店礼物（10个礼物图标）
const DEFAULT_PRIZES = [
  { id: 'prize_chocolate', name: '巧克力', icon: '🍫', cost: 5, stock: 999, enabled: true },
  { id: 'prize_candy', name: '糖果', icon: '🍬', cost: 3, stock: 999, enabled: true },
  { id: 'prize_cookie', name: '饼干', icon: '🍪', cost: 4, stock: 999, enabled: true },
  { id: 'prize_icecream', name: '冰淇淋', icon: '🍦', cost: 8, stock: 999, enabled: true },
  { id: 'prize_cake', name: '小蛋糕', icon: '🍰', cost: 10, stock: 999, enabled: true },
  { id: 'prize_toy', name: '小玩具', icon: '🧸', cost: 15, stock: 999, enabled: true },
  { id: 'prize_sticker', name: '贴纸', icon: '⭐', cost: 2, stock: 999, enabled: true },
  { id: 'prize_pencil', name: '可爱铅笔', icon: '✏️', cost: 6, stock: 999, enabled: true },
  { id: 'prize_notebook', name: '小笔记本', icon: '📓', cost: 12, stock: 999, enabled: true },
  { id: 'prize_surprise', name: '神秘盲盒', icon: '🎁', cost: 20, stock: 999, enabled: true }
];

// 学生头像选项（动漫风格）
const AVATAR_OPTIONS = [
  '👦', '👧', '🧒', '👶', '🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐨', '🦁', '🐯', '🐸', '🐵',
  '😊', '🥳', '😎', '🤓', '🧑‍🎓', '👨‍🎓', '👩‍🎓', '🦸', '🦹', '🧙', '👸', '🤴', '🧚', '🐣', '🌟'
];

// 主题颜色配置
const THEMES = {
  coral: { primary: '#FF6B6B', secondary: '#FFE66D', bg: '#FFF5F5' },
  mint: { primary: '#4ECDC4', secondary: '#A8E6CF', bg: '#F0FFF4' },
  sky: { primary: '#45B7D1', secondary: '#96E6DF', bg: '#F0F9FF' },
  lavender: { primary: '#A78BFA', secondary: '#E9D5FF', bg: '#FAF5FF' },
  peach: { primary: '#FB923C', secondary: '#FED7AA', bg: '#FFF7ED' },
  forest: { primary: '#22C55E', secondary: '#86EFAC', bg: '#F0FDF4' },
  sunset: { primary: '#F59E0B', secondary: '#FDE68A', bg: '#FFFBEB' },
  rose: { primary: '#F43F5E', secondary: '#FDA4AF', bg: '#FFF1F2' },
  ocean: { primary: '#0EA5E9', secondary: '#7DD3FC', bg: '#F0F9FF' },
  grape: { primary: '#8B5CF6', secondary: '#C4B5FD', bg: '#FAF5FF' }
};

// 成长阶段边框样式
const STAGE_BORDERS = [
  '2px solid #ccc',           // 0 蛋
  '2px solid #94a3b8',        // 1
  '2px solid #64748b',        // 2
  '2px solid #22c55e',        // 3
  '2px solid #16a34a',        // 4
  '2px solid #15803d',        // 5
  '3px solid #ca8a04',        // 6 金
  '3px solid #b45309',        // 7
  '3px solid #ea580c',        // 8
  '3px solid #dc2626',        // 9
  '4px solid #7c3aed'         // 10 满级
];
