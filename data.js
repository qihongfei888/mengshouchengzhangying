// 15种宠物及品种定义（可爱萌宠风格图标使用 emoji + 名称，实际可替换为图片URL）
window.PET_TYPES = [
  {
    id: 'cat',
    name: '猫咪',
    icon: '🐱',
    breeds: [
      { id: 'british', name: '英短蓝猫', icon: '🐱' },
      { id: 'persian', name: '加菲猫', icon: '😺' },
      { id: 'ragdoll', name: '布偶猫', icon: '🐈' },
      { id: 'orange', name: '橘猫', icon: '🐈‍⬛' },
      { id: 'siamese', name: '暹罗猫', icon: '😸' }
    ],
    food: '🐟 小鱼干'
  },
  {
    id: 'dog',
    name: '狗狗',
    icon: '🐕',
    breeds: [
      { id: 'golden', name: '金毛', icon: '🐕' },
      { id: 'husky', name: '哈士奇', icon: '🐕‍🦺' },
      { id: 'corgi', name: '柯基', icon: '🐶' },
      { id: 'shiba', name: '柴犬', icon: '🦮' },
      { id: 'poodle', name: '泰迪', icon: '🐩' }
    ],
    food: '🦴 狗粮'
  },
  {
    id: 'rabbit',
    name: '兔子',
    icon: '🐰',
    breeds: [
      { id: 'white', name: '白兔', icon: '🐰' },
      { id: 'gray', name: '灰兔', icon: '🐇' },
      { id: 'dwarf', name: '侏儒兔', icon: '🐇' }
    ],
    food: '🥕 胡萝卜'
  },
  {
    id: 'hamster',
    name: '仓鼠',
    icon: '🐹',
    breeds: [
      { id: 'golden_hamster', name: '金丝熊', icon: '🐹' },
      { id: 'robo', name: '罗伯罗夫斯基', icon: '🐹' }
    ],
    food: '🌻 瓜子'
  },
  {
    id: 'panda',
    name: '熊猫',
    icon: '🐼',
    breeds: [
      { id: 'giant', name: '大熊猫', icon: '🐼' },
      { id: 'red', name: '小熊猫', icon: '🐻' }
    ],
    food: '🎋 竹子'
  },
  {
    id: 'penguin',
    name: '企鹅',
    icon: '🐧',
    breeds: [
      { id: 'emperor', name: '帝企鹅', icon: '🐧' },
      { id: 'little', name: '小蓝企鹅', icon: '🐧' }
    ],
    food: '🐟 鱼'
  },
  {
    id: 'owl',
    name: '猫头鹰',
    icon: '🦉',
    breeds: [
      { id: 'barn', name: '仓鸮', icon: '🦉' },
      { id: 'snowy', name: '雪鸮', icon: '🦉' }
    ],
    food: '🐁 小老鼠'
  },
  {
    id: 'fox',
    name: '狐狸',
    icon: '🦊',
    breeds: [
      { id: 'red_fox', name: '赤狐', icon: '🦊' },
      { id: 'arctic', name: '北极狐', icon: '🦊' }
    ],
    food: '🍇 浆果'
  },
  {
    id: 'koala',
    name: '考拉',
    icon: '🐨',
    breeds: [
      { id: 'australian', name: '澳洲考拉', icon: '🐨' }
    ],
    food: '🍃 桉树叶'
  },
  {
    id: 'pig',
    name: '小猪',
    icon: '🐷',
    breeds: [
      { id: 'pink', name: '小香猪', icon: '🐷' },
      { id: 'mini', name: '迷你猪', icon: '🐽' }
    ],
    food: '🍎 苹果'
  },
  {
    id: 'unicorn',
    name: '独角兽',
    icon: '🦄',
    breeds: [
      { id: 'rainbow', name: '彩虹独角兽', icon: '🦄' }
    ],
    food: '🌈 彩虹糖'
  },
  {
    id: 'dragon',
    name: '小龙',
    icon: '🐲',
    breeds: [
      { id: 'green', name: '青龙', icon: '🐲' },
      { id: 'cute', name: 'Q版小龙', icon: '🐉' }
    ],
    food: '🔥 火焰果'
  },
  {
    id: 'duck',
    name: '鸭子',
    icon: '🦆',
    breeds: [
      { id: 'yellow', name: '小黄鸭', icon: '🦆' },
      { id: 'mallard', name: '绿头鸭', icon: '🦆' }
    ],
    food: '🌾 谷粒'
  },
  {
    id: 'hedgehog',
    name: '刺猬',
    icon: '🦔',
    breeds: [
      { id: 'european', name: '欧洲刺猬', icon: '🦔' }
    ],
    food: '🐛 虫子'
  },
  {
    id: 'sloth',
    name: '树懒',
    icon: '🦥',
    breeds: [
      { id: 'three_toed', name: '三趾树懒', icon: '🦥' }
    ],
    food: '🍃 树叶'
  }
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
