// 运行模式：'online' 用 Supabase 云同步；'offline' 只用本地存储
// 线上部署版本使用 online 模式
// 自动检测运行环境：GitHub Pages用online，本地file://用offline
window.RUN_MODE = (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'online' : 'offline';

// 应用标识 - 用于区分萌兽成长营和童心宠伴，避免数据冲突
// 童心宠伴用 'class_pet_'，萌兽成长营用 'mengshow_'
window.APP_ID = 'mengshow';
window.APP_STORAGE_PREFIX = 'mengshow_';

// Supabase 配置（与你 Supabase 项目一致）
window.SUPABASE_URL = 'https://cuipqszkjsxixmbrvwdg.supabase.co';
window.SUPABASE_KEY = 'sb_publishable_kV8fI-YCfPQy2m2akpOdXg_JXrRurE9';

// R2 宠物照片根地址（暂时不用可以留空字符串）
// 留空时，宠物照片将直接使用 GitHub Pages 上的 photos 目录：
// 例如 https://qihongfei888.github.io/xintongxin/photos/...
window.R2_PETS_BASE_URL = '';

