(function () {
  console.log('🚀 应用启动中...');

  // 检查存储空间
  async function checkStorageSpace() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percentUsed = quota > 0 ? ((usage / quota) * 100).toFixed(2) : 0;
        
        console.log('📦 存储空间使用情况:');
        console.log('  - 已使用: ' + (usage / 1024 / 1024).toFixed(2) + ' MB');
        console.log('  - 总配额: ' + (quota / 1024 / 1024).toFixed(2) + ' MB');
        console.log('  - 使用率: ' + percentUsed + '%');
        
        // 检查localStorage使用情况
        let localStorageSize = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const value = localStorage.getItem(key);
          localStorageSize += (key.length + value.length) * 2; // UTF-16编码，每个字符2字节
        }
        console.log('  - localStorage使用: ' + (localStorageSize / 1024).toFixed(2) + ' KB');
        
        if (percentUsed > 90) {
          console.warn('⚠️ 存储空间使用率超过90%，建议清理数据');
        }
        
        return { usage, quota, percentUsed, localStorageSize };
      } else {
        console.log('📦 浏览器不支持存储空间检查');
        return null;
      }
    } catch (e) {
      console.error('检查存储空间失败:', e);
      return null;
    }
  }
  
  // 启动时检查存储空间
  checkStorageSpace().then(info => {
    window.storageInfo = info;
  });
  
  // Bmob 已弃用：保留空实现避免旧代码报错，不再做任何初始化或日志输出
  function initBmob() {
    return false;
  }

  // Supabase 客户端（唯一云同步后端）
  let supabaseClient = null;
  function ensureSupabaseClient() {
    if (window.RUN_MODE === 'offline') return null;
    if (!navigator.onLine) return null;
    if (supabaseClient) return supabaseClient;
    if (typeof window === 'undefined' ||
        !window.supabase ||
        !window.SUPABASE_URL ||
        !window.SUPABASE_KEY ||
        typeof window.supabase.createClient !== 'function') {
      console.warn('Supabase 未配置或 SDK 未加载，当前仅使用本地/IndexedDB 存储');
      return null;
    }
    try {
      supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
      console.log('✅ 云同步: Supabase 客户端已初始化');
      return supabaseClient;
    } catch (e) {
      console.error('❌ 初始化 Supabase 客户端失败:', e);
      supabaseClient = null;
      return null;
    }
  }

  // Supabase 账户相关辅助方法（accounts 表）
  async function supabaseUpsertAccount(username, password, userId) {
    const client = ensureSupabaseClient();
    if (!client || !navigator.onLine) return false;
    try {
      const normalizedUserId = String(userId).trim();
      const payload = {
        // 为了兼容当前 Supabase 表结构，直接用 userId 作为主键 id
        id: normalizedUserId,
        username: String(username).trim(),
        password: String(password),
        user_id: normalizedUserId
      };
      const { error } = await client
        .from('accounts')
        .upsert(payload, { onConflict: 'username' });
      if (error) {
        console.error('Supabase 账号写入失败:', error);
        return false;
      }
      console.log('Supabase 账号已写入/更新:', payload.username);
      return true;
    } catch (e) {
      console.error('Supabase 账号写入异常:', e);
      return false;
    }
  }

  async function supabaseFetchAccount(username, password) {
    const client = ensureSupabaseClient();
    if (!client || !navigator.onLine) return null;
    try {
      const { data, error } = await client
        .from('accounts')
        .select('username,password,user_id')
        .eq('username', String(username).trim())
        .limit(1);
      if (error) {
        console.error('Supabase 查询账号失败:', error);
        return null;
      }
      if (!data || data.length === 0) return null;

      const row = data[0];
      if (row.password !== password) {
        console.warn('Supabase 账号密码不匹配');
        return null;
      }
      return row; // { username, password, user_id }
    } catch (e) {
      console.error('Supabase 查询账号异常:', e);
      return null;
    }
  }

  // 实时同步管理类
  class RealtimeSync {
    constructor() {
    this.pendingChanges = {};
    this.syncTimeout = null;
    this.syncInterval = 10000; // 10秒
    this.channels = {};
  }

    // 初始化同步
    init(userId) {
      this.userId = userId;
      try {
        this.setupRealtimeListener();
      } catch (e) {
        if (e && e.code === 415) {
          console.warn('实时监听暂不可用(415)，将使用定时同步');
        } else {
          console.warn('实时监听设置失败，将使用定时同步:', e);
        }
      }
      this.startAutoSync();
    }

    // 设置实时监听器（Bmob 2.5.30 可能报 415，失败时仅用定时同步）
    setupRealtimeListener() {
      const userIdStr = String(this.userId || '').trim();
      if (!userIdStr) return;

      // 优先使用 Supabase Realtime（当前系统主云端）
      try {
        const client = ensureSupabaseClient();
        if (client && typeof client.channel === 'function') {
          const ch = client
            .channel('realtime_user_' + userIdStr)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'users', filter: 'id=eq.' + userIdStr },
              (payload) => {
                try {
                  const row = payload && payload.new ? payload.new : null;
                  if (row && row.data) {
                    console.log('Supabase Realtime：收到云端更新，准备刷新本地数据');
                    this.updateLocalData(row.data);
                  }
                } catch (e) {
                  console.warn('处理 Supabase Realtime 更新失败:', e);
                }
              }
            )
            .subscribe((status) => {
              console.log('Supabase Realtime 订阅状态:', status);
            });

          this.channels.userData = ch;
          console.log('已启用 Supabase Realtime 监听');
          return;
        }
      } catch (e) {
        console.warn('Supabase Realtime 监听初始化失败，将尝试旧方案:', e);
      }

      // 兼容旧 Bmob（若存在）
      if (typeof Bmob === 'undefined') return;
      try {
        const query = Bmob.Query('UserData');
        query.equalTo('userId', userIdStr);
        query.subscribe().then((subscription) => {
          this.channels.userData = subscription;
          subscription.on('create', (object) => {
            if (object && object.get) this.updateLocalData(object.get('data'));
          });
          subscription.on('update', (object) => {
            if (object && object.get) this.updateLocalData(object.get('data'));
          });
          subscription.on('delete', () => {});
          console.log('Bmob 实时同步监听器已设置');
        }).catch((err) => {
          if (err && err.code === 415) console.warn('实时监听 415，已跳过');
          else console.warn('实时监听失败:', err);
        });
      } catch (e) {
        if (e && e.code === 415) throw e;
        console.warn('设置实时监听异常:', e);
      }
    }

    // 更新本地数据
    updateLocalData(data) {
      try {
        // 尝试解析JSON字符串格式的数据
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
            console.log('解析云端JSON数据成功');
          } catch (e) {
            console.error('解析云端JSON数据失败:', e);
            return;
          }
        }
        
        // 使用与app对象一致的键名
        const key = this.userId ? `${USER_DATA_PREFIX}${this.userId}` : `${APP_NAMESPACE}_default_user`;
        console.log('更新本地数据，键名:', key);
        console.log('更新数据:', data);
        
        // 先更新内存缓存
        memoryStorage[key] = data;
        
        // 更新localStorage
        localStorage.setItem(key, JSON.stringify(data));
        
        console.log('本地数据已更新');
        // 重新加载用户数据
        if (window.app) {
          console.log('触发app.loadUserData()');
          window.app.loadUserData();
          try {
            window.app.updateClassSelect();
            window.app.renderDashboard();
            window.app.renderStudents();
            window.app.renderHonor();
            window.app.renderStore();
          } catch (e) {}
        }
      } catch (e) {
        console.error('更新本地数据失败:', e);
      }
    }

    // 同步数据到云端（旧实时同步类，内部仍委托到应用的 Supabase 同步）
    async syncToCloud(data) {
      try {
        if (window.app && typeof window.app.syncToCloud === 'function') {
          await window.app.syncToCloud(data);
        return true;
        }
        console.log('未找到 app.syncToCloud，跳过旧同步逻辑');
        return false;
      } catch (e) {
        console.error('同步到云端失败:', e);
        return false;
      }
    }

    // 队列变更（节流）
    queueChange(key, value) {
      this.pendingChanges[key] = value;
      
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
      }
      
      this.syncTimeout = setTimeout(async () => {
        const currentData = this.getLocalData();
        const updatedData = { ...currentData, ...this.pendingChanges };
        await this.syncToCloud(updatedData);
        this.pendingChanges = {};
      }, 300);
    }

    // 启动自动同步
    startAutoSync() {
      // 不再设置独立的定时器，而是依赖app对象的自动同步机制
      // 这样可以避免重复同步和过于频繁的API请求
      console.log('RealtimeSync自动同步已启用，使用app对象的同步机制');
    }

    // 获取本地数据
    getLocalData() {
      try {
        // 使用与app对象一致的键名
        const key = this.userId ? `${USER_DATA_PREFIX}${this.userId}` : `${APP_NAMESPACE}_default_user`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        console.error('获取本地数据失败:', e);
        return null;
      }
    }

    // 关闭同步
    close() {
      Object.values(this.channels).forEach(channel => {
        try {
          channel.unsubscribe();
        } catch (e) {
          console.error('关闭同步通道失败:', e);
        }
      });
    }
  }

  // 实例化实时同步
  window.realtimeSync = new RealtimeSync();
  
  const APP_NAMESPACE = 'mengshou';
  const nsKey = (suffix) => `${APP_NAMESPACE}_${suffix}`;
  
  const STORAGE_KEYS = {
    students: nsKey('students'),
    systemName: nsKey('system_name'),
    theme: nsKey('theme'),
    stagePoints: nsKey('stage_points'),
    totalStages: nsKey('total_stages'),
    plusItems: nsKey('plus_items'),
    minusItems: nsKey('minus_items'),
    prizes: nsKey('prizes'),
    lotteryPrizes: nsKey('lottery_prizes'),
    broadcastMessages: nsKey('broadcast_messages'),
    groups: nsKey('groups'),
    groupPointHistory: nsKey('group_point_history'),
    petCategoryPhotos: nsKey('pet_category_photos'),
    className: nsKey('class_name'),
    cardPrizes: nsKey('card_prizes')
  };
  const USER_LIST_KEY = nsKey('user_list');
  const USER_DATA_PREFIX = nsKey('user_data_');
  const CURRENT_USER_KEY = nsKey('current_user');
  const SESSION_ID_KEY = nsKey('session_id');
  const PHOTO_TYPE_IDS = [
    'baihu','baize','bifang','chiru','dianmu','dijiang','fenghuang','fuzhu','gudiao','heluoyu',
    'huashe','huoshu','hundun','jiuweihu','jiuying','jingwei','jinshen','jinwu','jufu','leishen',
    'luanniao','lushu','mingshe','pixiu','qinglong','qingniao','qinlin','qiongqi','shanxiao','shuiyuan',
    'taotie','taowu','tiangou','xiezhi','xuanwu','xuangui','yinglong','yutu','zheng','zhulong','zhuque'
  ];
  const PHOTO_TYPE_NAME_MAP = {
    baihu:'白虎', baize:'白泽', bifang:'毕方', chiru:'赤鱬', dianmu:'电母', dijiang:'帝江', fenghuang:'凤凰',
    fuzhu:'夫诸', gudiao:'蛊雕', heluoyu:'河罗鱼', huashe:'化蛇', huoshu:'火鼠', hundun:'混沌',
    jiuweihu:'九尾狐', jiuying:'九婴', jingwei:'精卫', jinshen:'金神', jinwu:'金乌', jufu:'举父',
    leishen:'雷神', luanniao:'鸾鸟', lushu:'鹿蜀', mingshe:'鸣蛇', pixiu:'貔貅', qinglong:'青龙',
    qingniao:'青鸟', qinlin:'麒麟', qiongqi:'穷奇', shanxiao:'山魈', shuiyuan:'水猿', taotie:'饕餮',
    taowu:'梼杌', tiangou:'天狗', xiezhi:'獬豸', xuanwu:'玄武', xuangui:'玄龟', yinglong:'应龙',
    yutu:'玉兔', zheng:'狰', zhulong:'烛龙', zhuque:'朱雀'
  };

  function generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
  }

  // 判断当前用户数据是否“明显有内容”（至少有一个班级且该班级有学生）
  function hasMeaningfulUserData() {
    try {
      const data = getUserData();
      if (!data || !Array.isArray(data.classes)) return false;
      const nonEmptyClasses = data.classes.filter(c => Array.isArray(c.students) && c.students.length > 0);
      return nonEmptyClasses.length > 0;
    } catch (e) {
      console.warn('检查本地数据是否为空时出错:', e);
      return false;
    }
  }

  function _parseNum(v) {
    const n = parseFloat(String(v || '').trim());
    return Number.isFinite(n) ? n : null;
  }

  function getCurrentTermLabel() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const term = month >= 8 || month <= 1 ? '第一学期' : '第二学期';
    return `${year}-${year + 1}学年${term}`;
  }

  function getTodayDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 授权码管理
  const LICENSE_KEY = nsKey('licenses');
  const ACTIVATED_DEVICES_KEY = nsKey('activated_devices');
  
  // 管理员账号和密码
  const ADMIN_ACCOUNTS = [
    { username: '18844162799', password: 'QW200124.' },
    { username: '18645803876', password: 'QW0124.' },
    // 可以添加更多管理员账号
  ];
  
  // 生成授权码
  function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) key += '-';
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }
  
  // 获取授权码列表
  function getLicenses() {
    try {
      const v = localStorage.getItem(LICENSE_KEY);
      return v ? JSON.parse(v) : [];
    } catch (e) {
      return memoryStorage[LICENSE_KEY] || [];
    }
  }
  
  // 保存授权码列表
  function setLicenses(licenses) {
    try {
      localStorage.setItem(LICENSE_KEY, JSON.stringify(licenses));
    } catch (e) {
      memoryStorage[LICENSE_KEY] = licenses;
    }
  }
  
  // 验证授权码
  function validateLicense(licenseKey, deviceId) {
    const licenses = getLicenses();
    const license = licenses.find(l => l.key === licenseKey && !l.used);
    
    if (!license) {
      // 紧急修复：直接检查授权码格式，允许特定格式的授权码（不区分大小写）
      if (/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(licenseKey)) {
        console.log('授权码格式正确，临时允许注册');
        // 将授权码添加到本地存储
        const newLicense = {
          key: licenseKey,
          createdAt: new Date().toISOString(),
          used: false,
          expireAt: null
        };
        const updatedLicenses = [...licenses, newLicense];
        setLicenses(updatedLicenses);
        return { valid: true, license: newLicense };
      }
      return { valid: false, message: '授权码无效或已被使用' };
    }
    
    if (license.expireAt && new Date(license.expireAt) < new Date()) {
      return { valid: false, message: '授权码已过期' };
    }

    return { valid: true, license: license };
  }
  
  // 激活授权码
  function activateLicense(licenseKey, deviceId, userId) {
    const licenses = getLicenses();
    const licenseIndex = licenses.findIndex(l => l.key.toLowerCase() === licenseKey.toLowerCase());
    
    if (licenseIndex === -1) return false;
    
    licenses[licenseIndex].used = true;
    licenses[licenseIndex].activatedAt = new Date().toISOString();
    licenses[licenseIndex].deviceId = deviceId;
    licenses[licenseIndex].userId = userId;
    
    setLicenses(licenses);
    return true;
  }

  // 内存存储作为 localStorage 的备用
  let memoryStorage = {};
  
  // 登录尝试记录
  let loginAttempts = {};
  
  // 生成设备指纹
  function generateDeviceFingerprint() {
    let fingerprint = '';
    
    // 收集浏览器信息
    fingerprint += navigator.userAgent || '';
    fingerprint += navigator.platform || '';
    fingerprint += navigator.language || '';
    fingerprint += navigator.cpuClass || '';
    fingerprint += navigator.appVersion || '';
    
    // 收集屏幕信息
    fingerprint += screen.width + 'x' + screen.height;
    fingerprint += screen.colorDepth || '';
    
    // 收集时区信息
    fingerprint += new Date().getTimezoneOffset() || '';
    
    // 收集插件信息
    if (navigator.plugins) {
      fingerprint += navigator.plugins.length;
      for (let i = 0; i < navigator.plugins.length; i++) {
        fingerprint += navigator.plugins[i].name || '';
      }
    }
    
    // 简单的哈希函数
    function simpleHash(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash.toString(16);
    }
    
    return simpleHash(fingerprint);
  }
  
  // 检查密码强度
  function checkPasswordStrength(password) {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  }
  
  // 检查登录尝试次数
  function checkLoginAttempts(username) {
    const attempts = loginAttempts[username] || { count: 0, lastAttempt: 0 };
    const now = Date.now();
    
    // 重置时间窗口（10分钟）
    if (now - attempts.lastAttempt > 10 * 60 * 1000) {
      attempts.count = 0;
    }
    
    if (attempts.count >= 5) {
      return false; // 超过尝试次数
    }
    
    return true;
  }
  
  // 记录登录尝试
  function recordLoginAttempt(username, success) {
    const attempts = loginAttempts[username] || { count: 0, lastAttempt: 0 };
    if (!success) {
      attempts.count++;
    } else {
      attempts.count = 0; // 成功登录重置计数
    }
    attempts.lastAttempt = Date.now();
    loginAttempts[username] = attempts;
  }
  
  function getUserList() {
    try {
      const v = localStorage.getItem(USER_LIST_KEY);
      return v ? JSON.parse(v) : [];
    } catch (e) {
      // localStorage 不可用时使用内存存储
      return memoryStorage[USER_LIST_KEY] || [];
    }
  }
  function setUserList(list) {
    try {
      // 检查存储空间
      const dataStr = JSON.stringify(list);
      const dataSize = new Blob([dataStr]).size;
      
      // 如果数据超过1MB，可能是数据过大
      if (dataSize > 1024 * 1024) {
        console.warn('用户列表数据过大 (' + (dataSize / 1024).toFixed(2) + 'KB)，尝试压缩...');
        // 清理不必要的数据
        const cleanedList = list.map(user => ({
          id: user.id,
          username: user.username,
          password: user.password,
          licenseKey: user.licenseKey,
          createdAt: user.createdAt,
          maxDevices: user.maxDevices || 1,
          devices: (user.devices || []).slice(0, 1) // 只保留最近一个设备
        }));
        localStorage.setItem(USER_LIST_KEY, JSON.stringify(cleanedList));
      } else {
        localStorage.setItem(USER_LIST_KEY, dataStr);
      }
      
      // 同时保存到内存
      memoryStorage[USER_LIST_KEY] = list;
      // 用户列表变化时也写入磁盘快照
      persistLocalStorageToDisk();
      return true;
    } catch (e) {
      console.error('localStorage 写入失败:', e);
      // localStorage 不可用时使用内存存储
      memoryStorage[USER_LIST_KEY] = list;
      
      // 如果是存储空间不足，尝试清理旧数据
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.log('尝试清理存储空间...');
        try {
          // 清理旧的备份数据
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`${APP_NAMESPACE}_backup_`)) {
              localStorage.removeItem(key);
              console.log('已清理备份:', key);
            }
          }
          // 再次尝试保存
          localStorage.setItem(USER_LIST_KEY, JSON.stringify(list));
          return true;
        } catch (e2) {
          console.error('清理后仍然无法保存:', e2);
        }
      }
      
      // 抛出错误让调用者知道保存失败
      throw new Error('存储空间不足，请清理浏览器数据后重试');
    }
  }
  // ===== 离线桌面版：将 localStorage 快照同步到磁盘（通过 Electron preload 暴露的 offlineStorage）=====
  async function restoreLocalStorageFromDisk() {
    try {
      if (!window.offlineStorage || !window.offlineStorage.loadLocal) return;
      const snapshot = await window.offlineStorage.loadLocal();
      if (!snapshot || typeof snapshot !== 'object') return;
      Object.keys(snapshot).forEach((key) => {
        try {
          localStorage.setItem(key, snapshot[key]);
        } catch (e) {}
      });
      console.log('已从本地磁盘快照恢复数据');
    } catch (e) {
      console.warn('从本地磁盘快照恢复数据失败:', e);
    }
  }

  async function persistLocalStorageToDisk() {
    try {
      if (!window.offlineStorage || !window.offlineStorage.saveLocal) return;
      const snapshot = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          snapshot[key] = localStorage.getItem(key);
        }
      } catch (e) {
        console.warn('收集 localStorage 快照失败:', e);
      }
      await window.offlineStorage.saveLocal(snapshot);
      console.log('已将本地数据写入磁盘快照');
    } catch (e) {
      console.warn('写入本地磁盘快照失败:', e);
    }
  }

  var useIndexedDB = typeof IndexedDBManager !== 'undefined' && IndexedDBManager.isSupported();
  var indexedDBReady = false;
  
  async function initIndexedDB() {
    if (useIndexedDB && !indexedDBReady) {
      try {
        await IndexedDBManager.init();
        indexedDBReady = true;
        var migrated = await IndexedDBManager.migrateFromLocalStorage();
        if (migrated > 0) {
          console.log('已从 localStorage 迁移 ' + migrated + ' 条数据到 IndexedDB');
        }
      } catch (e) {
        console.error('IndexedDB 初始化失败，使用 localStorage:', e);
        useIndexedDB = false;
      }
    }
  }
  
  function getUserData() {
    // 按当前登录用户隔离数据，不再把“默认用户”的数据复制给新账号
    let userId = app.currentUserId;
    if (!userId) {
      try {
        const currentUserStr = localStorage.getItem(CURRENT_USER_KEY);
        if (currentUserStr) {
          const currentUser = JSON.parse(currentUserStr);
          if (currentUser.id) userId = currentUser.id;
          }
        } catch (e) {
          console.error('读取当前用户ID失败:', e);
        }
      }

    // 未登录用户：返回一份临时数据结构，不写入任何账号，避免污染
    if (!userId) {
      console.warn('未找到当前用户ID，返回临时数据结构（不会写入其它账号）');
      return {
        version: '1.0.0',
        classes: [],
        currentClassId: null,
        systemName: '萌兽成长营',
        theme: 'coral',
        lastModified: new Date().toISOString()
      };
    }

    const key = USER_DATA_PREFIX + userId;
    
    // 1. 尝试从内存存储获取
    try {
      const cached = memoryStorage[key];
      if (cached) {
        console.log('从内存存储获取数据成功');
        return cached;
      }
    } catch (e) {
      console.error('从内存存储获取数据失败:', e);
    }
    
    // 2. 尝试从 localStorage 获取
    try {
      const v = localStorage.getItem(key);
      if (v) {
        const data = JSON.parse(v);
        console.log('从localStorage获取数据成功');
        memoryStorage[key] = data;
        return data;
      }
    } catch (e) {
      console.error('从localStorage获取数据失败:', e);
    }
    
    // 3. 尝试从本地备份键恢复数据（仅限本账号）
    try {
      const backupKey = `${APP_NAMESPACE}_local_` + userId;
      const backupStr = localStorage.getItem(backupKey);
      if (backupStr) {
        const backupObj = JSON.parse(backupStr);
        // 仅当备份里“确实有学生数据”才用于恢复，避免空备份覆盖
        const backupData = backupObj && backupObj.data;
        const classes = (backupData && Array.isArray(backupData.classes)) ? backupData.classes : [];
        const meaningful = classes.some(c => Array.isArray(c.students) && c.students.length > 0);
        if (meaningful) {
          console.log('从本地备份键恢复数据成功，班级数:', backupObj.data.classes.length);
          memoryStorage[key] = backupObj.data;
          localStorage.setItem(key, JSON.stringify(backupObj.data));
          return backupObj.data;
        }
        }
      } catch (e) {
      console.error('从本地备份键恢复数据失败:', e);
    }

    // 5. 当前用户完全没有历史数据：为该用户创建一份全新的默认数据结构
    console.log('当前用户无任何历史数据，为该用户创建全新的默认数据结构');
    const data = {
      version: '1.0.0',
      classes: [],
      currentClassId: null,
      systemName: '萌兽成长营',
      theme: 'coral',
      lastModified: new Date().toISOString()
    };
    
    try {
      memoryStorage[key] = data;
      localStorage.setItem(key, JSON.stringify(data));
      console.log('已为当前用户保存默认数据结构');
    } catch (e) {
      console.error('保存当前用户默认数据失败:', e);
    }
    
    return data;
  }
  
  function getUserDataForUser(userId) {
    if (!userId) return {};
    var key = USER_DATA_PREFIX + userId;
    if (useIndexedDB && indexedDBReady) {
      var cachedData = memoryStorage[key];
      if (cachedData) return cachedData;
    }
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : {};
    } catch (e) {
      return memoryStorage[key] || {};
    }
  }
  
  function setUserDataForUser(userId, data) {
    if (!userId || !data) return;
    var key = USER_DATA_PREFIX + userId;
    memoryStorage[key] = data;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('localStorage 写入失败:', e);
    }
    if (useIndexedDB && indexedDBReady) {
      IndexedDBManager.setItem(key, data).catch(function(e) {
        console.error('IndexedDB 写入失败:', e);
      });
    }
  }
  
  async function getUserDataAsync() {
    if (!app.currentUserId) return {};
    var key = USER_DATA_PREFIX + app.currentUserId;
    if (useIndexedDB && indexedDBReady) {
      try {
        var data = await IndexedDBManager.getItem(key);
        if (data) {
          memoryStorage[key] = data;
          return data;
        }
      } catch (e) {
        console.error('IndexedDB 读取失败:', e);
      }
    }
    return getUserData();
  }
  
  function setUserData(data) {
    // 首先尝试获取当前用户ID
    let userId = app.currentUserId;
    if (!userId) {
      // 如果没有用户ID，尝试从localStorage中获取
      try {
        const currentUserStr = localStorage.getItem(CURRENT_USER_KEY);
        if (currentUserStr) {
          const currentUser = JSON.parse(currentUserStr);
          if (currentUser.id) {
            userId = currentUser.id;
          }
        }
      } catch (e) {
        // 尝试从内存存储中获取
        try {
          const currentUserStr = memoryStorage[CURRENT_USER_KEY];
          if (currentUserStr) {
            const currentUser = JSON.parse(currentUserStr);
            if (currentUser.id) {
              userId = currentUser.id;
            }
          }
        } catch (e) {
          console.error('读取当前用户ID失败:', e);
        }
      }
    }
    
    var key = userId ? USER_DATA_PREFIX + userId : `${APP_NAMESPACE}_default_user`;
    memoryStorage[key] = data;
    try {
      localStorage.setItem(key, JSON.stringify(data));
      // 同步写入本地备份键（仅该账号），刷新后若云端同步失败可从备份键加载
      if (userId) {
        const backupKey = `${APP_NAMESPACE}_local_` + userId;
        const timestamp = (data && data.lastModified) || new Date().toISOString();
        localStorage.setItem(backupKey, JSON.stringify({ data: data, timestamp: timestamp }));
      }
      // 关键数据变更后，同步一份 localStorage 快照到磁盘（仅离线桌面版生效）
      persistLocalStorageToDisk();
      // 如果没有用户ID但有保存的用户ID，也更新用户特定的键
      if (!userId) {
        const currentUserStr = localStorage.getItem(CURRENT_USER_KEY);
        if (currentUserStr) {
          try {
            const currentUser = JSON.parse(currentUserStr);
            if (currentUser.id) {
              const userKey = USER_DATA_PREFIX + currentUser.id;
              localStorage.setItem(userKey, JSON.stringify(data));
            }
          } catch (e) {
            console.error('更新用户特定键失败:', e);
          }
        }
      }
    } catch (e) {
      console.warn('localStorage 写入失败:', e);
      
      // 如果是存储空间不足，尝试清理旧数据
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.log('尝试清理存储空间...');
        try {
          // 清理旧的备份数据
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const storageKey = localStorage.key(i);
            if (storageKey && storageKey.startsWith(`${APP_NAMESPACE}_backup_`)) {
              localStorage.removeItem(storageKey);
              console.log('已清理备份:', storageKey);
            }
          }
          // 再次尝试保存
          localStorage.setItem(key, JSON.stringify(data));
          console.log('清理后保存成功');
          return; // 保存成功，直接返回
        } catch (e2) {
          console.error('清理后仍然无法保存:', e2);
          // 抛出错误让调用者知道
          throw new Error('存储空间不足，请清理浏览器数据后重试');
        }
      } else {
        // 其他类型的错误也抛出，让调用者知道
        throw new Error('数据保存失败: ' + (e.message || '未知错误'));
      }
    }
    if (useIndexedDB && indexedDBReady) {
      IndexedDBManager.setItem(key, data).catch(function(e) {
        console.error('IndexedDB 写入失败:', e);
      });
      // 如果没有用户ID但有保存的用户ID，也更新用户特定的键
      if (!userId) {
        const currentUserStr = localStorage.getItem(CURRENT_USER_KEY);
        if (currentUserStr) {
          try {
            const currentUser = JSON.parse(currentUserStr);
            if (currentUser.id) {
              const userKey = USER_DATA_PREFIX + currentUser.id;
              IndexedDBManager.setItem(userKey, data).catch(function(e) {
                console.error('IndexedDB 写入用户特定键失败:', e);
              });
            }
          } catch (e) {
            console.error('更新用户特定键失败:', e);
          }
        }
      }
    }
  }
  function getStorage(key, defaultValue) {
    const data = getUserData();
    return data[key] !== undefined ? data[key] : (defaultValue !== undefined ? defaultValue : null);
  }
  function setStorage(key, value) {
    const data = getUserData();
    data[key] = value;
    setUserData(data);
  }

  window.app = {
    students: [],
    currentStudentId: null,
    selectedBatchStudents: new Set(),
    selectedBatchFeedStudents: new Set(),
    currentUserId: null,
    currentUsername: '',
    currentClassName: '',
    groups: [],
    groupPointHistory: [],
    lastSyncTime: null,
    dataChanged: false,
    syncing: false,
    syncTimeout: null,
    pendingChanges: 0,
    lastSyncAttempt: 0,
    lastPullFromCloud: 0, // 上次从云端拉取时间，用于多端同步
    dataLoaded: false, // 标记数据是否已加载
    
    // 照片存储管理
    photoStorage: {
      githubApiCalls: 0,
      githubApiLimit: 5000,
      currentProvider: 'github', // 'github' 或 'r2'
      githubToken: null, // GitHub Personal Access Token
      githubRepo: 'qihongfei888/xintongxin', // GitHub仓库
      githubBranch: 'main',
      // R2计费控制
      r2BillingControl: {
        enabled: true, // 是否启用计费控制
        monthlyLimit: 1000000, // 每月请求限制（100万次内免费）
        currentMonthCalls: 0, // 当月已使用次数
        lastResetMonth: null, // 上次重置月份
        autoCutoff: true, // 接近限制时自动截断
        cutoffThreshold: 0.9 // 达到90%时截断
      },
      r2Config: {
        accountId: '',
        bucketName: '',
        accessKeyId: '',
        secretAccessKey: ''
      }
    },

    showLoginPage() {
      document.getElementById('login-page').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
      document.getElementById('login-form').reset();
      document.getElementById('register-form').reset();
      document.querySelector('.login-tab[data-tab="login"]').classList.add('active');
      document.querySelector('.login-tab[data-tab="register"]').classList.remove('active');
      document.getElementById('login-form').style.display = 'block';
      document.getElementById('register-form').style.display = 'none';
    },

    // 单端登录：在其他设备登录后强制本端下线
    forceLogout(message) {
      try {
        localStorage.removeItem(CURRENT_USER_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
      } catch (e) {}
      try {
        memoryStorage[CURRENT_USER_KEY] = undefined;
        memoryStorage[SESSION_ID_KEY] = undefined;
      } catch (e) {}
      this.currentUserId = null;
      this.currentUsername = null;
      this.showLoginPage();
      if (message) alert(message);
    },
    async login(username, password) {
      try {
        // 检查登录尝试次数
        if (!checkLoginAttempts(username)) {
          alert('登录尝试次数过多，请10分钟后再试');
          return false;
        }
        
        // 先从云端同步用户列表（确保多端数据一致）
        if (navigator.onLine) {
          try {
            console.log('登录前从云端同步用户列表...');
            await this.syncUserListFromCloud();
          } catch (e) {
            console.error('同步用户列表失败:', e);
          }
        }
        
        let users = getUserList();
        let user = users.find(u => u.username === username && u.password === password);

        // 如果本地未找到用户，尝试从 Supabase 账户表查询
        if (!user && navigator.onLine) {
          try {
            console.log('本地未找到账号，尝试从 Supabase 查询账户...');
            const account = await supabaseFetchAccount(username, password);
          if (account && account.user_id) {
              const userId = account.user_id;
              user = {
                id: userId,
                username,
                password,
                devices: [],
                maxDevices: 1
              };
              users.push(user);
              setUserList(users);
              console.log('从 Supabase 导入账号到本地，userId:', userId);
            } else {
              console.log('Supabase 中未找到该账号或密码不匹配');
            }
          } catch (e) {
            console.error('从 Supabase 查询账号时出错:', e);
          }
        }
        if (user) {
          // 记录成功登录
          recordLoginAttempt(username, true);
          
          // 生成设备指纹
          const deviceId = generateDeviceFingerprint();
          
          // 检查设备是否已绑定（支持多端同时登录，仅用于记录设备信息，不再强制单端在线）
          if (!user.devices) {
            user.devices = [];
          }
          const existingDevice = user.devices.find(d => d.id === deviceId);
          
          if (existingDevice) {
            // 设备已绑定，更新最后登录时间
            existingDevice.lastLogin = new Date().toISOString();
            console.log('设备已绑定，更新登录时间');
          } else {
            // 添加新设备到列表，用于设备管理展示
            user.devices.push({
              id: deviceId,
              name: navigator.userAgent || 'Unknown Device',
              lastLogin: new Date().toISOString()
            });
            console.log('添加新设备（多端登录允许）:', deviceId);
          }
          
          // 保存用户数据
          try {
            setUserList(users);
          } catch (saveError) {
            console.error('保存用户列表失败:', saveError);
            alert('保存登录信息失败: ' + saveError.message);
            return false;
          }
          
          this.currentUserId = user.id;
          this.currentUsername = user.username;
          
          // 登录成功后，确保账号信息写入 Supabase（用于老账号自动补建 accounts 映射）
          if (navigator.onLine) {
            try {
              await supabaseUpsertAccount(user.username, user.password, user.id);
            } catch (e) {
              console.warn('登录后同步账号到 Supabase 失败（不影响本地登录）:', e);
            }
          }
          
          // 保存当前用户信息
          try {
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ 
              id: user.id, 
              username: user.username,
              deviceId: deviceId 
            }));
          } catch (e) {
            console.warn('保存当前用户信息到localStorage失败:', e);
            memoryStorage[CURRENT_USER_KEY] = JSON.stringify({ 
              id: user.id, 
              username: user.username,
              deviceId: deviceId 
            });
          }
          // 单端登录：生成会话 ID，登录后上传到云端以占用“当前端”
          var loginSessionId = generateSessionId();
          try { localStorage.setItem(SESSION_ID_KEY, loginSessionId); } catch (e) {}
          
          // 数据迁移：从旧存储导入到新的Bmob数据库
          try {
            console.log('登录时执行数据迁移...');
            await this.migrateDataFromOldStorage();
              } catch (e) {
            console.error('数据迁移失败:', e);
          }
          
          // 登录成功后，仅使用本地数据初始化界面，不在登录流程中自动与云端互相覆盖，
          // 避免误操作导致云端或本地数据被清空。
          console.log('登录成功，使用本地数据初始化界面（登录阶段不自动与云端读写）');
          this.loadUserData();
          
          // 显示应用界面（init中会调用loadUserData加载最新数据）
          this.showApp();
          
          // 初始化并启用RealtimeSync
          window.realtimeSync.init(user.id);
          // 启用实时同步和自动同步（减少频次）
          this.enableRealtimeSync();
          this.enableAutoSync();
          
          // 登录成功后，通知用户设备切换成功
          if (user.devices.length > 0 && user.devices[0].id !== deviceId) {
            alert('您的账号已在新设备登录，其他设备已下线');
          }
          
          return true;
        }
        
        // 记录失败的登录尝试
        recordLoginAttempt(username, false);
        return false;
      } catch (e) {
        console.error('登录失败:', e);
        // 根据错误类型显示不同的提示
        if (e.message && e.message.includes('存储空间不足')) {
          alert('登录失败：浏览器存储空间不足。\n\n解决方法：\n1. 清理浏览器缓存和历史记录\n2. 关闭其他标签页\n3. 使用隐私/无痕模式登录\n4. 更换浏览器尝试');
        } else if (e.name === 'QuotaExceededError' || (e.code === 22)) {
          alert('登录失败：存储空间已满。请清理浏览器数据后重试。');
        } else {
          alert('登录失败: ' + (e.message || '请检查网络连接或稍后重试'));
        }
        return false;
      }
    },
    async register(username, password, licenseKey) {
      try {
        // 检查密码强度
        const strength = checkPasswordStrength(password);
        if (strength < 2) {
          alert('密码强度不足，请使用至少6位包含字母和数字的密码');
          return false;
        }
        
        // 验证授权码
        if (!licenseKey) {
          alert('请输入授权码');
          return false;
        }
        
        // 有网络时，先从云端同步授权码
        if (navigator.onLine) {
          try {
            console.log('注册前从云端同步授权码...');
            // 直接同步授权码，不需要用户ID
            const licensesData = await this.syncLicensesFromCloud();
            if (licensesData) {
              console.log('授权码同步成功，数量:', licensesData.length);
            }
          } catch (e) {
            console.error('同步授权码失败:', e);
            // 同步失败不影响注册流程
          }
        }
        
        const deviceId = generateDeviceFingerprint();
        const licenseValidation = validateLicense(licenseKey, deviceId);
        
        if (!licenseValidation.valid) {
          alert(licenseValidation.message);
          return false;
        }
        
        const users = getUserList();
        if (users.some(u => u.username === username)) {
          alert('用户名已存在，请使用其他用户名');
          return false; // 用户名已存在
        }
        
        const newUser = {
          id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          username: username,
          password: password,
          createdAt: new Date().toISOString(),
          devices: [{
            id: deviceId,
            name: navigator.userAgent || 'Unknown Device',
            lastLogin: new Date().toISOString()
          }],
          maxDevices: 5, // 限制最多5个设备
          lastLogin: new Date().toISOString(),
          licenseKey: licenseKey // 记录使用的授权码
        };
        users.push(newUser);
        setUserList(users);
        
        // 激活授权码
        activateLicense(licenseKey, deviceId, newUser.id);
        
        // 实时同步授权码状态到云端
        try {
          console.log('激活授权码后实时同步到云端...');
          // 先设置用户ID
          this.currentUserId = newUser.id;
          this.currentUsername = newUser.username;
          
          // 同步用户列表到云端（优先同步用户列表，确保用户信息不丢失）
          await this.syncUserListToCloud();
          console.log('用户列表已同步到云端');
          
          // 同步到云端
          await this.syncToCloud();
          console.log('授权码状态已同步到云端');
        } catch (e) {
          console.error('同步授权码状态到云端失败:', e);
          // 即使同步失败，也要确保用户信息已保存到本地
          console.log('用户信息已保存到本地');
        }

        // 将账号写入 Supabase，支持跨设备登录
        try {
          const accountOk = await supabaseUpsertAccount(newUser.username, newUser.password, newUser.id);
          if (!accountOk && navigator.onLine) {
            console.warn('账号未同步到 Supabase，手机端可能无法登录该账号');
          }
        } catch (e) {
          console.warn('写入 Supabase 账号异常:', e);
        }
        
        this.currentUserId = newUser.id;
        this.currentUsername = newUser.username;
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ 
          id: newUser.id, 
          username: newUser.username,
          deviceId: deviceId 
        }));
        this.initUserData();
        this.showApp();
        
        // 初始化并启用RealtimeSync
        window.realtimeSync.init(newUser.id);
        // 启用实时同步和自动同步
        this.enableRealtimeSync();
        this.enableAutoSync();
        
        return true;
      } catch (e) {
        console.error('注册失败:', e);
        alert('注册失败，请重试');
        return false;
      }
    },
    initUserData() {
      // 检查用户数据是否已存在
      const existingData = getUserData();
      
      // 只有在用户数据不存在时才创建默认数据
      if (Object.keys(existingData).length === 0) {
        const defaultData = {
          version: '1.0.0', // 数据版本号
          classes: [],
          currentClassId: null,
          systemName: '萌兽成长营',
          theme: 'coral'
        };
        setUserData(defaultData);
      }
      
      this.loadUserData();
    },
    loadUserData() {
      try {
        // 首先尝试从本地存储加载数据
        let data = getUserData();
        
        // 数据迁移
        data = this.migrateUserData(data);
        
        // 确保数据结构正确
        if (!data.classes) {
          data.classes = [];
          data.currentClassId = null;
          setUserData(data);
        }
        
        // 加载班级列表
        this.classes = data.classes || [];
        this.currentClassId = data.currentClassId || null;
        // 修复：只有一个班级时，如果没有 currentClassId，会导致刷新后“有班级但无当前班级”，
        // 从而 students 不会被持久化进该班级，表现为“导入后刷新消失/上传后消失”。
        if (!this.currentClassId && this.classes.length === 1 && this.classes[0] && this.classes[0].id) {
          this.currentClassId = this.classes[0].id;
          data.currentClassId = this.currentClassId;
          try { setUserData(data); } catch (e) {}
          console.log('已自动选择唯一班级为当前班级:', this.currentClassId);
        }
        
        // 加载当前班级数据
        const currentClass = this.classes.find(c => c.id === this.currentClassId);
        if (currentClass) {
          this.students = currentClass.students || [];
          this.groups = currentClass.groups || [];
          this.groupPointHistory = currentClass.groupPointHistory || [];
          this.currentClassName = currentClass.name || '';
          
          // 加载班级设置
          const stagePointsEl = document.getElementById('settingStagePoints');
          const stagesEl = document.getElementById('settingStages');
          const stagePointsByStageEl = document.getElementById('settingStagePointsByStage');
          const broadcastEl = document.getElementById('broadcastContent');
          const sickDaysEl = document.getElementById('settingSickDays');
          const hospitalProjectsEl = document.getElementById('settingHospitalProjects');
          const monopolyRollCostEl = document.getElementById('settingMonopolyRollCost');
          const monopolyChallengePointsEl = document.getElementById('settingMonopolyChallengePoints');
          const monopolyOpportunityTaskEl = document.getElementById('settingMonopolyOpportunityTask');
          const monopolyOpportunityPointsEl = document.getElementById('settingMonopolyOpportunityPoints');
          const monopolyStealPointsEl = document.getElementById('settingMonopolyStealPoints');
          
          if (stagePointsEl) stagePointsEl.value = currentClass.stagePoints || 20;
          if (stagesEl) stagesEl.value = currentClass.totalStages || 10;
          if (stagePointsByStageEl) stagePointsByStageEl.value = (currentClass.stagePointsByStage || []).join(',');
          if (broadcastEl) broadcastEl.value = (currentClass.broadcastMessages || ['欢迎来到萌兽成长营！🎉']).join('\n');
          if (sickDaysEl) sickDaysEl.value = parseInt(currentClass.sickDays, 10) || 3;
          if (hospitalProjectsEl) {
            const list = Array.isArray(currentClass.hospitalProjects) && currentClass.hospitalProjects.length
              ? currentClass.hospitalProjects
              : [
                  { name: '复活针', cost: 8, type: 'revive' },
                  { name: '急救药', cost: 3, type: 'cure' }
                ];
            hospitalProjectsEl.value = list.map(p => `${p.name}|${p.cost}|${p.type}`).join('\n');
          }
          if (monopolyRollCostEl) monopolyRollCostEl.value = parseInt(currentClass.monopolyRollCost, 10) || 1;
          if (monopolyChallengePointsEl) monopolyChallengePointsEl.value = parseInt(currentClass.monopolyChallengePoints, 10) || 3;
          if (monopolyOpportunityTaskEl) monopolyOpportunityTaskEl.value = currentClass.monopolyOpportunityTask || '全组30秒内回答3题';
          if (monopolyOpportunityPointsEl) monopolyOpportunityPointsEl.value = parseInt(currentClass.monopolyOpportunityPoints, 10) || 4;
          if (monopolyStealPointsEl) monopolyStealPointsEl.value = parseInt(currentClass.monopolyStealPoints, 10) || 2;
          const awakenPointsThresholdEl = document.getElementById('settingAwakenPointsThreshold');
          if (awakenPointsThresholdEl) awakenPointsThresholdEl.value = parseInt(currentClass.awakenPointsThreshold, 10) || 100;
        } else {
          // 没有选择班级时的默认值
          this.students = [];
          this.groups = [];
          this.groupPointHistory = [];
          this.currentClassName = '';
          
          const stagePointsEl = document.getElementById('settingStagePoints');
          const stagesEl = document.getElementById('settingStages');
          const stagePointsByStageEl = document.getElementById('settingStagePointsByStage');
          const broadcastEl = document.getElementById('broadcastContent');
          const sickDaysEl = document.getElementById('settingSickDays');
          const hospitalProjectsEl = document.getElementById('settingHospitalProjects');
          const monopolyRollCostEl = document.getElementById('settingMonopolyRollCost');
          const monopolyChallengePointsEl = document.getElementById('settingMonopolyChallengePoints');
          const monopolyOpportunityTaskEl = document.getElementById('settingMonopolyOpportunityTask');
          const monopolyOpportunityPointsEl = document.getElementById('settingMonopolyOpportunityPoints');
          const monopolyStealPointsEl = document.getElementById('settingMonopolyStealPoints');
          
          if (stagePointsEl) stagePointsEl.value = 20;
          if (stagesEl) stagesEl.value = 10;
          if (stagePointsByStageEl) stagePointsByStageEl.value = '';
          if (broadcastEl) broadcastEl.value = '欢迎来到萌兽成长营！🎉';
          if (sickDaysEl) sickDaysEl.value = 3;
          if (hospitalProjectsEl) hospitalProjectsEl.value = '复活针|8|revive\n急救药|3|cure';
          if (monopolyRollCostEl) monopolyRollCostEl.value = 1;
          if (monopolyChallengePointsEl) monopolyChallengePointsEl.value = 3;
          if (monopolyOpportunityTaskEl) monopolyOpportunityTaskEl.value = '全组30秒内回答3题';
          if (monopolyOpportunityPointsEl) monopolyOpportunityPointsEl.value = 4;
          if (monopolyStealPointsEl) monopolyStealPointsEl.value = 2;
          const awakenPointsThresholdEl = document.getElementById('settingAwakenPointsThreshold');
          if (awakenPointsThresholdEl) awakenPointsThresholdEl.value = 100;
        }
        
        console.log('用户数据加载完成，班级数:', this.classes.length, '当前班级:', this.currentClassName);
        
        // 加载全局设置
        const systemTitleEl = document.getElementById('systemTitleText');
        const classNameEl = document.getElementById('currentClassName');
        const settingSystemNameEl = document.getElementById('settingSystemName');
        const settingClassNameEl = document.getElementById('settingClassName');
        const settingThemeEl = document.getElementById('settingTheme');
        
        if (systemTitleEl) systemTitleEl.textContent = data.systemName || '萌兽成长营';
        if (classNameEl) classNameEl.textContent = this.currentClassName ? `| ${this.currentClassName}` : '';
        if (settingSystemNameEl) settingSystemNameEl.value = data.systemName || '萌兽成长营';
        if (settingClassNameEl) settingClassNameEl.value = this.currentClassName || '';
        if (settingThemeEl) settingThemeEl.value = data.theme || 'coral';
        
        this.applyTheme(data.theme || 'coral');
        this.updateClassSelect();
      } catch (e) {
        console.error('加载用户数据失败:', e);
        // 使用默认数据
        this.students = [];
        this.groups = [];
        this.groupPointHistory = [];
        this.currentClassName = '';
      }
    },
    
    showApp() {
      try {
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        this.renderDevicesList();
        // 确保数据已加载
        if (!this.dataLoaded) {
          this.loadUserData();
          this.dataLoaded = true;
        }
        this.schedulePetPreheat('showApp_class', () => this.preheatCurrentClassPetImages(), 1200);
        this.schedulePetPreheat('showApp_adopt', () => this.preheatPetAdoptImages(), 1800);
        // 分帧初始化，避免主线程长时间阻塞导致“页面无响应”
        if (!this._initScheduled) {
          this._initScheduled = true;
          const self = this;
          setTimeout(function () {
            try {
              self.init();
            } catch (e) {
              console.error('初始化应用失败:', e);
            } finally {
              self._initScheduled = false;
            }
          }, 0);
        }
      } catch (e) {
        console.error('显示应用失败:', e);
        alert('应用加载失败，请刷新页面重试');
      }
    },
    async saveUserData() {
      try {
        // 1. 先获取当前数据作为备份
        const backupData = getUserData();
        
        // 2. 使用内部方法保存数据（不触发同步）
        await this.saveUserDataInternal();
        
        // 3. 使用批量同步机制
        // 避免循环调用：只有在非同步过程中才调用
        if (!this.isSyncingData) {
          this.scheduleSync();
        }
        
        console.log('用户数据保存成功');
      } catch (e) {
        console.error('保存用户数据失败:', e);
        // 显示用户友好的错误提示
        try {
          let errorMsg = '保存数据时发生错误';
          
          if (e.message && e.message.includes('存储空间不足')) {
            errorMsg = '保存失败：浏览器存储空间不足。\n\n解决方法：\n1. 清理浏览器缓存（按Ctrl+Shift+Delete）\n2. 关闭其他标签页释放内存\n3. 使用隐私/无痕模式（Ctrl+Shift+N）\n4. 导出数据后清理浏览器数据再导入';
          } else if (e.name === 'QuotaExceededError' || e.code === 22) {
            errorMsg = '保存失败：存储空间已满。请清理浏览器缓存或导出数据后重置应用。';
          } else if (e.message) {
            errorMsg = '保存失败：' + e.message;
          }
          
          alert(errorMsg);
        } catch (alertError) {
          // 防止alert也失败
          console.error('显示错误提示失败:', alertError);
        }
      }
    },
    
    // 批量同步机制
    scheduleSync() {
      // 清除之前的定时器
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
      }
      
      // 累积多个变更后一次性同步（延迟3秒）
      // 减少延迟，确保数据及时同步
      this.syncTimeout = setTimeout(() => {
        if (this.dataChanged && navigator.onLine) {
          this.syncData();
          this.pendingChanges = 0;
        }
      }, 3 * 1000);
    },
    logout() {
      try {
        // 退出前先保存数据到本地
        console.log('退出前保存数据到本地...');
        this.saveUserData();
        
        // 如果网络可用且数据有变更，同步到云端
        if (this.currentUserId && navigator.onLine && this.dataChanged) {
          console.log('退出前同步数据到云端...');
          this.syncToCloud();
        }
        
        // 禁用实时同步
        this.disableRealtimeSync();
        // 禁用自动同步
        this.disableAutoSync();
        
        // 清理同步状态
        this.syncing = false;
        this.dataChanged = false;
        this.pendingChanges = 0;
        if (this.syncTimeout) {
          clearTimeout(this.syncTimeout);
          this.syncTimeout = null;
        }
        
        // 移除本地存储的用户信息与会话（单端登录）
        try {
          localStorage.removeItem(CURRENT_USER_KEY);
          localStorage.removeItem(SESSION_ID_KEY);
        } catch (e) {}
        
        // 重置用户状态
        this.currentUserId = null;
        this.currentUsername = '';
        this.currentClassName = '';
        
        // 显示登录页面
        this.showLoginPage();
        console.log('退出登录完成');
      } catch (e) {
        console.error('退出登录失败:', e);
        // 即使出错也尝试显示登录页面
        this.showLoginPage();
      }
    },
    
    // 获取用户列表
    getUserList() {
      return getUserList();
    },
    
    // 数据迁移函数
    migrateUserData(data) {
      if (!data) {
        return {
          version: '1.0.0',
          classes: [],
          currentClassId: null,
          systemName: '萌兽成长营',
          theme: 'coral'
        };
      }
      
      // 版本 1.0.0 迁移
      if (!data.version) {
        data.version = '1.0.0';
        // 为旧数据添加必要的字段
        if (!data.systemName) data.systemName = '萌兽成长营';
        if (!data.theme) data.theme = 'coral';
        if (!data.classes) data.classes = [];
        if (!data.currentClassId) data.currentClassId = null;
        setUserData(data);
      }
      
      // 后续版本的迁移可以在这里添加
      // 例如：if (data.version < '1.1.0') { ... }
      
      return data;
    },
    
    // 数据压缩和清理
    compressAndCleanData() {
      try {
        const data = getUserData();
        
        // 1. 清理过期的历史记录
        if (data.classes) {
          for (const cls of data.classes) {
            // 清理旧的积分历史记录（保留最近1000条）
            if (cls.groupPointHistory && cls.groupPointHistory.length > 1000) {
              cls.groupPointHistory = cls.groupPointHistory.slice(-1000);
              console.log(`清理班级 ${cls.name} 的积分历史记录，保留最近1000条`);
            }
            
            // 清理学生的宠物历史记录
            if (cls.students) {
              for (const student of cls.students) {
                if (student.petHistory && student.petHistory.length > 500) {
                  student.petHistory = student.petHistory.slice(-500);
                }
              }
            }
          }
        }
        
        // 2. 压缩数据（移除空数组和空对象）
        const compressData = (obj) => {
          if (Array.isArray(obj)) {
            return obj.filter(item => item !== null && item !== undefined).map(compressData);
          } else if (typeof obj === 'object' && obj !== null) {
            const compressed = {};
            for (const [key, value] of Object.entries(obj)) {
              if (value !== null && value !== undefined) {
                if (typeof value === 'object') {
                  const compressedValue = compressData(value);
                  if (Array.isArray(compressedValue) && compressedValue.length > 0) {
                    compressed[key] = compressedValue;
                  } else if (typeof compressedValue === 'object' && Object.keys(compressedValue).length > 0) {
                    compressed[key] = compressedValue;
                  }
                } else {
                  compressed[key] = value;
                }
              }
            }
            return compressed;
          }
          return obj;
        };
        
        const compressedData = compressData(data);
        
        // 3. 保存压缩后的数据
        setUserData(compressedData);
        console.log('数据压缩和清理完成');
        
        return true;
      } catch (e) {
        console.error('数据压缩和清理失败:', e);
        return false;
      }
    },
    
    // 数据验证函数
    validateUserData(data) {
      if (!data) {
        console.error('数据为空');
        return false;
      }
      
      // 确保数据结构完整
      if (!data.classes) {
        console.error('班级数据不存在');
        data.classes = [];
      } else if (!Array.isArray(data.classes)) {
        console.error('班级数据不是数组');
        data.classes = [];
      }
      
      // 确保有版本号
      if (!data.version) {
        data.version = '1.0.0';
      }
      
      // 确保有最后修改时间
      if (!data.lastModified) {
        data.lastModified = new Date().toISOString();
      }
      
      // 验证班级数据结构
      for (const cls of data.classes) {
        if (!cls.id) {
          console.error('班级缺少ID:', cls);
          cls.id = 'class_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        if (!cls.name) {
          console.error('班级缺少名称:', cls);
          cls.name = '未命名班级';
        }
        
        // 确保学生数据结构
        if (!cls.students) {
          cls.students = [];
        } else if (!Array.isArray(cls.students)) {
          console.error('学生数据不是数组');
          cls.students = [];
        }
        
        // 验证学生数据结构
        if (cls.students) {
          for (const student of cls.students) {
            if (!student.id) {
              console.error('学生缺少ID:', student);
              student.id = 'student_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            if (!student.name) {
              console.error('学生缺少名称:', student);
              student.name = '未命名学生';
            }
            
            // 确保学生有积分
            if (student.points === undefined) {
              student.points = 0;
            }
            
            // 确保学生有宠物数据
            if (!student.pet) {
              student.pet = {
                type: 'cat',
                name: '默认宠物',
                level: 1,
                exp: 0,
                hunger: 100,
                happiness: 100
              };
            }
          }
        }
        
        // 确保班级有其他必要数据
        if (!cls.groups) {
          cls.groups = [];
        }
        
        if (!cls.groupPointHistory) {
          cls.groupPointHistory = [];
        }
        
        if (!cls.stagePoints) {
          cls.stagePoints = 20;
        }
        
        if (!cls.totalStages) {
          cls.totalStages = 10;
        }

        if (!Array.isArray(cls.stagePointsByStage)) {
          cls.stagePointsByStage = [];
        }
        
        if (!cls.plusItems) {
          cls.plusItems = [];
        }
        
        if (!cls.minusItems) {
          cls.minusItems = [];
        }
        
        if (!cls.prizes) {
          cls.prizes = [];
        }
        
        if (!cls.lotteryPrizes) {
          cls.lotteryPrizes = [];
        }
        
        if (!cls.broadcastMessages) {
          cls.broadcastMessages = ['欢迎来到萌兽成长营！🎉'];
        }
        
        if (!cls.petCategoryPhotos) {
          cls.petCategoryPhotos = {};
        }
      }
      
      // 验证当前班级ID
      if (data.currentClassId && !data.classes.some(cls => cls.id === data.currentClassId)) {
        console.error('当前班级ID不存在于班级列表中');
        data.currentClassId = data.classes.length > 0 ? data.classes[0].id : null;
      }
      
      return true;
    },
    
    // 数据压缩函数 - 减少数据传输量，只保留云端需要的关键信息
    compressUserData(data) {
      // 创建数据的深拷贝
      const compressed = JSON.parse(JSON.stringify(data));
      
      // 1. 仅保留班级及学生的关键信息，裁剪冗余字段
      if (compressed.classes) {
        compressed.classes = compressed.classes.map(cls => {
          const slimClass = {
            id: cls.id,
            name: cls.name,
            stagePoints: cls.stagePoints,
            stagePointsByStage: cls.stagePointsByStage,
            totalStages: cls.totalStages,
            // 与教学配置强相关的几块保留：自定义加/扣分项、奖品、抽奖奖品、广播配置、宠物照片配置
            plusItems: cls.plusItems,
            minusItems: cls.minusItems,
            prizes: cls.prizes,
            lotteryPrizes: cls.lotteryPrizes,
            broadcastMessages: cls.broadcastMessages,
            petCategoryPhotos: cls.petCategoryPhotos,
            // 排座位：按班级保存
            seatingPlan: cls.seatingPlan,
            // 出勤记录：按班级保存
            attendanceRecords: cls.attendanceRecords
          };

          // 学生列表：只保留与教学密切相关的字段（姓名、学号、积分、宠物状态等）
          if (Array.isArray(cls.students)) {
            slimClass.students = cls.students.map(stu => {
              const slimStudent = {
                id: stu.id,
                name: stu.name,
                // 当前积分与历史徽章
                points: stu.points || 0,
                badgesSpent: stu.badgesSpent || 0,
                badgesEarned: stu.badgesEarned || 0,
                // 宠物当前状态及已养成记录、装扮
                pet: stu.pet || null,
                completedPets: stu.completedPets || [],
                accessories: stu.accessories || [],
                // 基本展示信息
                avatar: stu.avatar || null,
                // 学生信息（用于排座位等小工具）
                height: stu.height || null,
                visionLeft: stu.visionLeft || null,
                visionRight: stu.visionRight || null,
                parentPhone: stu.parentPhone || null,
                familyNote: stu.familyNote || null,
                termComment: stu.termComment || null
              };

              // 最近的加减分记录保留少量，方便撤回/查看（最多 50 条）
              if (Array.isArray(stu.scoreHistory) && stu.scoreHistory.length > 0) {
                slimStudent.scoreHistory = stu.scoreHistory.slice(-50);
              }

              return slimStudent;
            });
          }

          return slimClass;
        });
      }
      
      // 2. 清理全局上的临时字段
      delete compressed.tempData;
      delete compressed.uploading;
      
      return compressed;
    },
    
    // 数据迁移功能：从旧的云端存储导入数据到新的Bmob数据库
    async migrateDataFromOldStorage() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过数据迁移');
        return false;
      }
      
      try {
        console.log('开始数据迁移...');
        
        // 1. 检查是否已经迁移过
        const migrationFlag = localStorage.getItem('data_migrated_to_bmob');
        if (migrationFlag) {
          console.log('数据已经迁移过，跳过');
          return true;
        }
        
        // 2. 尝试从本地存储获取旧数据
        console.log('检查本地存储中的旧数据...');
        
        // 检查所有可能的旧存储键
        const oldStorageKeys = [];
        
        let hasOldData = false;
        const oldData = {};
        
        for (const key of oldStorageKeys) {
          try {
            const value = localStorage.getItem(key);
            if (value) {
              oldData[key] = JSON.parse(value);
              hasOldData = true;
              console.log(`找到旧数据: ${key}`);
            }
          } catch (e) {
            console.error(`读取旧数据 ${key} 失败:`, e);
          }
        }
        
        // 3. 如果有旧数据，创建新的数据结构
        if (hasOldData) {
          console.log('发现旧数据，开始迁移...');
          
          // 创建新的用户数据结构
          const newUserData = {
            version: '1.0.0',
            classes: [],
            currentClassId: null,
            systemName: oldData.class_pet_system_name || '萌兽成长营',
            theme: oldData.class_pet_theme || 'coral'
          };
          
          // 创建默认班级
          const defaultClass = {
            id: 'class_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: oldData.class_pet_class_name || '默认班级',
            students: oldData.class_pet_students || [],
            groups: oldData.class_pet_groups || [],
            groupPointHistory: oldData.class_pet_group_point_history || [],
            stagePoints: oldData.class_pet_stage_points || 20,
            stagePointsByStage: [],
            totalStages: oldData.class_pet_total_stages || 10,
            plusItems: oldData.class_pet_plus_items || [],
            minusItems: oldData.class_pet_minus_items || [],
            prizes: oldData.class_pet_prizes || [],
            lotteryPrizes: oldData.class_pet_lottery_prizes || [],
            broadcastMessages: oldData.class_pet_broadcast_messages || ['欢迎来到萌兽成长营！🎉'],
            petCategoryPhotos: oldData.class_pet_pet_category_photos || {}
          };
          
          newUserData.classes.push(defaultClass);
          newUserData.currentClassId = defaultClass.id;
          
          // 4. 保存迁移后的数据到本地
          setUserData(newUserData);
          console.log('旧数据已迁移到新的数据结构');
          
          // 5. 同步到Bmob云端
          if (this.currentUserId) {
            console.log('同步迁移后的数据到Bmob云端...');
            await this.syncToCloud();
            console.log('数据已同步到Bmob云端');
          }
          
          // 6. 标记迁移完成
          localStorage.setItem('data_migrated_to_bmob', 'true');
          console.log('数据迁移完成');
          
          return true;
        } else {
          console.log('没有发现旧数据，跳过迁移');
          // 即使没有旧数据，也标记迁移完成，避免重复检查
          localStorage.setItem('data_migrated_to_bmob', 'true');
          return true;
        }
      } catch (e) {
        console.error('数据迁移失败:', e);
        return false;
      }
    },
    
    // 同步用户列表到云端（旧 Bmob 方案，当前若无 Bmob 则直接跳过）
    async syncUserListToCloud() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过用户列表同步');
        return false;
      }
      if (typeof Bmob === 'undefined') {
        console.log('当前未配置 Bmob，跳过用户列表同步（已改用 Supabase 账号表）');
        return false;
      }
      
      try {
        const users = getUserList();
        const now = new Date().toISOString();
        
        // 将用户列表存储在云端
        const query = Bmob.Query('UserData');
        const results = await query.equalTo('userId', 'user_list_global').find();
        
        if (results.length > 0) {
          const userListData = results[0];
          userListData.set('data', { users: users });
          await userListData.save();
        } else {
          const userListData = Bmob.Query('UserData');
          userListData.set('userId', 'user_list_global');
          userListData.set('data', { users: users });
          await userListData.save();
        }
        
        console.log('用户列表已同步到云端，用户数:', users.length);
        return true;
      } catch (e) {
        console.error('同步用户列表到云端失败:', e);
        return false;
      }
    },
    
    // 批量上传所有本地用户数据到云端
    async uploadAllLocalUsersToCloud() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过批量上传');
        return { success: false, message: '无网络连接' };
      }
      
      try {
        console.log('开始批量上传所有本地用户数据到云端...');
        
        // 1. 获取本地所有用户列表
        const localUsers = getUserList();
        if (localUsers.length === 0) {
          return { success: true, message: '本地没有用户数据' };
        }
        
        console.log(`找到 ${localUsers.length} 个本地用户`);
        
        // 2. 上传用户列表
        const userListSuccess = await this.syncUserListToCloud();
        if (!userListSuccess) {
          return { success: false, message: '用户列表上传失败' };
        }
        
        // 3. 上传每个用户的详细数据
        let successCount = 0;
        let failCount = 0;
        const now = new Date().toISOString();
        
        for (const user of localUsers) {
          try {
            // 获取用户数据
            const userData = getUserDataForUser(user.id);
            
            if (!userData || Object.keys(userData).length === 0) {
              console.log(`用户 ${user.username} 没有数据，跳过`);
              continue;
            }
            
            // 上传用户数据到云端
            const query = Bmob.Query('UserData');
            const results = await query.equalTo('userId', user.id).find();
            
            if (results.length > 0) {
              const userDataRecord = results[0];
              userDataRecord.set('data', userData);
              userDataRecord.set('username', user.username);
              userDataRecord.set('password', user.password);
              userDataRecord.set('last_sync', now);
              await userDataRecord.save();
            } else {
              const userDataRecord = Bmob.Query('UserData');
              userDataRecord.set('userId', user.id);
              userDataRecord.set('username', user.username);
              userDataRecord.set('password', user.password);
              userDataRecord.set('data', userData);
              userDataRecord.set('last_sync', now);
              await userDataRecord.save();
            }
            
            console.log(`用户 ${user.username} 数据上传成功`);
            successCount++;
            
            // 添加延迟，避免API请求过于频繁
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (e) {
            console.error(`处理用户 ${user.username} 时出错:`, e);
            failCount++;
          }
        }
        
        console.log(`批量上传完成：成功 ${successCount} 个，失败 ${failCount} 个`);
        
        return {
          success: true,
          message: `批量上传完成：成功 ${successCount} 个，失败 ${failCount} 个`,
          successCount,
          failCount
        };
        
      } catch (e) {
        console.error('批量上传所有用户数据失败:', e);
        return { success: false, message: '批量上传失败：' + e.message };
      }
    },
    
    // 从云端下载所有用户数据到本地
    async downloadAllCloudUsersToLocal() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过批量下载');
        return { success: false, message: '无网络连接' };
      }
      if (typeof Bmob === 'undefined') {
        console.log('当前未配置 Bmob，跳过批量下载所有用户数据（已改用 Supabase 同步）');
        return { success: false, message: '当前版本未启用旧 Bmob 云端，不支持批量下载所有用户数据' };
      }
      
      try {
        console.log('开始从云端下载所有用户数据...');
        
        // 1. 从云端获取所有用户数据
        const query = Bmob.Query('UserData');
        const cloudUsers = await query.find();
        
        if (!cloudUsers || cloudUsers.length === 0) {
          return { success: true, message: '云端没有用户数据' };
        }
        
        // 过滤掉用户列表全局数据
        const filteredCloudUsers = cloudUsers.filter(user => user.get('userId') !== 'user_list_global');
        
        console.log(`从云端获取到 ${filteredCloudUsers.length} 个用户`);
        
        // 2. 合并用户列表
        const localUsers = getUserList();
        const mergedUsers = [...localUsers];
        let addedCount = 0;
        let updatedCount = 0;
        
        for (const cloudUser of filteredCloudUsers) {
          const userId = cloudUser.get('userId');
          const username = cloudUser.get('username');
          const password = cloudUser.get('password');
          const data = cloudUser.get('data');
          const last_sync = cloudUser.get('last_sync');
          const createdAt = cloudUser.get('createdAt');
          
          const existingIndex = mergedUsers.findIndex(u => u.id === userId);
          
          if (existingIndex >= 0) {
            mergedUsers[existingIndex] = {
              ...mergedUsers[existingIndex],
              username: username,
              password: password,
              lastSync: last_sync
            };
            updatedCount++;
          } else {
            mergedUsers.push({
              id: userId,
              username: username,
              password: password,
              createdAt: createdAt,
              lastSync: last_sync
            });
            addedCount++;
          }
          
          if (data) {
            setUserDataForUser(userId, data);
          }
        }
        
        setUserList(mergedUsers);
        
        console.log(`批量下载完成：新增 ${addedCount} 个，更新 ${updatedCount} 个`);
        
        return {
          success: true,
          message: `批量下载完成：新增 ${addedCount} 个，更新 ${updatedCount} 个`,
          addedCount,
          updatedCount
        };
        
      } catch (e) {
        console.error('批量下载所有用户数据失败:', e);
        return { success: false, message: '批量下载失败：' + e.message };
      }
    },
    
    // 同步所有用户数据（双向同步）
    async syncAllUsersData() {
      console.log('开始同步所有用户数据...');
      
      const uploadResult = await this.uploadAllLocalUsersToCloud();
      const downloadResult = await this.downloadAllCloudUsersToLocal();
      
      console.log('所有用户数据同步完成');
      
      return {
        upload: uploadResult,
        download: downloadResult
      };
    },
    
    // 备份云端数据（旧 Bmob 方案，当前若无 Bmob 则直接跳过）
    async backupCloudData() {
      if (!navigator.onLine || !this.currentUserId) {
        console.log('无网络连接或无用户ID，跳过备份');
        return false;
      }
      if (typeof Bmob === 'undefined') {
        console.log('当前未配置 Bmob，跳过云端备份（已改用 Supabase 同步）');
        return false;
      }
      
      try {
        const userData = getUserData();
        const now = new Date().toISOString();
        const userIdStr = String(this.currentUserId);
        const versionStr = String(userData.version || '1.0.0');
        const dataStr = typeof userData === 'string' ? userData : JSON.stringify(userData);
        
        const backupRecord = Bmob.Query('Backups');
        backupRecord.set('userId', userIdStr);
        backupRecord.set('data', dataStr);
        backupRecord.set('timestamp', now);
        backupRecord.set('version', versionStr);
        
        await backupRecord.save();
        console.log('数据备份成功');
        await this.cleanupOldBackups();
        return true;
      } catch (e) {
        console.error('备份失败:', e);
        return false;
      }
    },
    
    // 清理旧备份（旧 Bmob 方案，当前若无 Bmob 则直接跳过）
    async cleanupOldBackups() {
      if (!navigator.onLine || !this.currentUserId) {
        return false;
      }
      if (typeof Bmob === 'undefined') {
        return false;
      }
      
      try {
        // 获取备份列表
        const query = Bmob.Query('Backups');
        query.equalTo('userId', this.currentUserId);
        query.order('timestamp', { descending: true });
        const backups = await query.find();
        
        // 保留最近5个备份，删除其他的
        if (backups && backups.length > 5) {
          const backupsToDelete = backups.slice(5);
          for (const backup of backupsToDelete) {
            await backup.destroy();
          }
          console.log('清理旧备份完成');
        }
        
        return true;
      } catch (e) {
        console.error('清理旧备份失败:', e);
        return false;
      }
    },
    
    // 从备份恢复数据（旧 Bmob 方案，当前若无 Bmob 则直接跳过）
    async restoreFromBackup(backupId) {
      if (!navigator.onLine || !this.currentUserId) {
        console.log('无网络连接或无用户ID，跳过恢复');
        return false;
      }
      if (typeof Bmob === 'undefined') {
        console.log('当前未配置 Bmob，跳过从云端备份恢复（已改用 Supabase 同步）');
        return false;
      }
      
      try {
        let backupData;
        if (backupId) {
          // 恢复指定备份
          const query = Bmob.Query('Backups');
          query.equalTo('objectId', backupId);
          const results = await query.find();
          
          if (results.length === 0) {
            console.error('获取备份失败: 备份不存在');
            return false;
          }
          backupData = results[0].get('data');
        } else {
          // 恢复最近的备份
          const query = Bmob.Query('Backups');
          query.equalTo('userId', this.currentUserId);
          query.order('timestamp', { descending: true });
          query.limit(1);
          const results = await query.find();
          
          if (results.length === 0) {
            console.error('获取最近备份失败: 没有备份数据');
            return false;
          }
          backupData = results[0].get('data');
        }
        
        if (backupData) {
          // 迁移备份数据
          const migratedData = this.migrateUserData(backupData);
          setUserData(migratedData);
          this.loadUserData();
          console.log('数据恢复成功');
          return true;
        }
        
        return false;
      } catch (e) {
        console.error('恢复数据失败:', e);
        return false;
      }
    },
    
    // 管理员专用：批量迁移所有用户数据
    async migrateAllUsersData() {
      // 只允许管理员执行
      if (!this.currentUserId || !this.isAdmin) {
        console.log('权限不足，只有管理员可以执行批量数据迁移');
        return { success: false, message: '权限不足' };
      }
      
      if (!navigator.onLine) {
        console.log('无网络连接，无法执行批量迁移');
        return { success: false, message: '无网络连接' };
      }
      
      try {
        console.log('开始批量迁移所有用户数据...');
        
        // 1. 首先同步用户列表
        console.log('同步用户列表...');
        await this.syncUserListToCloud();
        
        // 2. 上传所有本地用户数据到云端
        console.log('上传所有本地用户数据...');
        const uploadResult = await this.uploadAllLocalUsersToCloud();
        
        // 3. 从云端下载所有用户数据到本地
        console.log('从云端下载所有用户数据...');
        const downloadResult = await this.downloadAllCloudUsersToLocal();
        
        console.log('批量迁移完成');
        
        return {
          success: true,
          message: '批量迁移完成',
          upload: uploadResult,
          download: downloadResult
        };
      } catch (e) {
        console.error('批量迁移失败:', e);
        return { success: false, message: '批量迁移失败: ' + e.message };
      }
    },
    
    // 从云端同步用户列表（使用 Supabase users 表中的虚拟用户 user_list_global）
    async syncUserListFromCloud() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过从云端同步用户列表');
        return false;
      }
      const client = ensureSupabaseClient();
      if (!client) return false;

      try {
        const { data, error } = await client
          .from('users')
          .select('id, data, updated_at')
          .eq('id', 'user_list_global')
          .limit(1);

        if (error) {
          console.error('从云端同步用户列表失败:', error);
          return false;
        }

        if (!data || data.length === 0) {
          console.log('云端没有用户列表数据，尝试上传本地用户列表');
          await this.syncUserListToCloud();
          return true;
        }
        
        const cloudPayload = data[0].data || {};
        if (cloudPayload && cloudPayload.users) {
          const cloudUsers = cloudPayload.users;
          const localUsers = getUserList();
          
          const mergedUsers = [...cloudUsers];
          localUsers.forEach(localUser => {
            if (!mergedUsers.some(u => u.id === localUser.id)) {
              mergedUsers.push(localUser);
            }
          });
          
          setUserList(mergedUsers);
          console.log('用户列表已从云端同步，用户数:', mergedUsers.length);
          return true;
        } else {
          console.log('云端用户列表数据为空，上传本地用户列表');
          await this.syncUserListToCloud();
          return true;
        }
      } catch (e) {
        console.error('从云端同步用户列表失败:', e);
        return false;
      }
    },
    
    // 数据同步方法 - 优化版，支持2000人同时使用
    async syncData() {
      if (!this.currentUserId) {
        console.log('无用户ID，跳过同步');
        return;
      }
      
      // 防止循环调用
      if (this.isSyncingData) {
        console.log('syncData 正在执行中，跳过重复调用');
        return;
      }
      
      this.isSyncingData = true;
      
      try {
        // 1. 首先保存本地数据（优先本地存储）
        await this.saveUserDataInternal();
        console.log('本地数据保存完成');
      
        // 2. 仅在特定条件下才进行云同步
        const now = Date.now();
        const timeSinceLastSync = now - this.lastSyncAttempt;
        
        // 优化同步条件：确保多端数据同步
        // 同步频率：30秒一次，变更阈值：1次
        // 确保跨设备数据一致性
        const shouldSyncToCloud = 
          navigator.onLine && 
          (this.dataChanged || timeSinceLastSync >= 30 * 1000); // 30秒同步一次，确保跨设备数据一致
        
        if (shouldSyncToCloud) {
          console.log('满足云端同步条件，开始同步...');
          this.lastSyncAttempt = now;
          
          // 同步失败重试机制 - 优化重试策略
          let retryCount = 0;
          const maxRetries = 3; // 增加重试次数
          const retryDelay = 1000; // 合理的重试间隔
          
          while (retryCount < maxRetries) {
            try {
              await this.syncToCloud();
              this.dataChanged = false;
              this.pendingChanges = 0;
              this.lastSyncTime = new Date().toISOString();
              console.log('云端同步完成');
              // 同步完成后，尝试从云端拉取最新数据，确保多端数据一致
              try {
                const pulled = await this.syncFromCloud();
                if (pulled) {
                console.log('从云端拉取最新数据完成');
                } else {
                  console.log('从云端未拉取到新数据，保持使用本地数据');
                }
              } catch (e) {
                console.error('从云端拉取数据失败:', e);
              }
              break;
            } catch (e) {
              retryCount++;
              console.error(`云端同步失败 (${retryCount}/${maxRetries}):`, e);
              if (retryCount < maxRetries) {
                console.log(`等待 ${retryDelay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              } else {
                console.error('云端同步多次失败，放弃重试，数据已保存到本地');
              }
            }
          }
        } else {
          console.log('仅保存到本地，跳过云端同步');
        }
      } catch (e) {
        console.error('同步数据失败:', e);
      } finally {
        // 释放同步锁
        this.isSyncingData = false;
      }
    },
    
    // 内部保存方法，不触发同步
    async saveUserDataInternal() {
      try {
        const data = getUserData();
        
        // 确保数据结构正确
        if (!data.classes) {
          data.classes = [];
          data.currentClassId = null;
        }
        
        // 更新全局设置
        const systemNameEl = document.getElementById('settingSystemName');
        const themeEl = document.getElementById('settingTheme');
        
        data.systemName = systemNameEl ? systemNameEl.value || '萌兽成长营' : '萌兽成长营';
        data.theme = themeEl ? themeEl.value || 'coral' : 'coral';
        
        // 获取班级名称
        const classNameEl = document.getElementById('settingClassName');
        const className = classNameEl ? classNameEl.value.trim() : '';
        
        // 确保有班级数据
        if (!this.currentClassId && data.classes.length > 0) {
          this.currentClassId = data.classes[0].id;
        }
        
        // 如果没有班级，创建一个默认班级
        if (!this.currentClassId) {
          const newClass = {
            id: 'class_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: className || '默认班级',
            students: [],
            groups: [],
            groupPointHistory: [],
            stagePoints: 20,
            stagePointsByStage: [],
            totalStages: 10,
            plusItems: [
              { name: '早读打卡', points: 1 },
              { name: '课堂表现好', points: 2 },
              { name: '作业完成', points: 1 },
              { name: '考试优秀', points: 3 },
              { name: '乐于助人', points: 2 },
              { name: '进步明显', points: 2 }
            ],
            minusItems: [
              { name: '迟到', points: -1 },
              { name: '未完成作业', points: -2 },
              { name: '课堂违纪', points: -2 }
            ],
            prizes: [],
            lotteryPrizes: [],
            broadcastMessages: ['欢迎来到萌兽成长营！🎉'],
            petCategoryPhotos: {},
            sickDays: 3,
            hospitalProjects: [
              { name: '复活针', cost: 8, type: 'revive' },
              { name: '急救药', cost: 3, type: 'cure' }
            ],
            monopolyRollCost: 1,
            monopolyChallengePoints: 3,
            monopolyOpportunityTask: '全组30秒内回答3题',
            monopolyOpportunityPoints: 4,
            monopolyStealPoints: 2,
            awakenPointsThreshold: 100,
            customQuizQuestions: []
          };
          data.classes.push(newClass);
          this.currentClassId = newClass.id;
          this.currentClassName = newClass.name;
          this.students = [];
          this.groups = [];
          this.groupPointHistory = [];
        }
        
        // 更新班级数据
        const currentClass = data.classes.find(c => c.id === this.currentClassId);
        if (currentClass) {
          currentClass.name = className || currentClass.name;
          currentClass.students = this.students;
          currentClass.groups = this.groups;
          currentClass.groupPointHistory = this.groupPointHistory;
          
          const stagePointsEl = document.getElementById('settingStagePoints');
          const stagesEl = document.getElementById('settingStages');
          const stagePointsByStageEl = document.getElementById('settingStagePointsByStage');
          const broadcastEl = document.getElementById('broadcastContent');
          const sickDaysEl = document.getElementById('settingSickDays');
          const hospitalProjectsEl = document.getElementById('settingHospitalProjects');
          const monopolyRollCostEl = document.getElementById('settingMonopolyRollCost');
          const monopolyChallengePointsEl = document.getElementById('settingMonopolyChallengePoints');
          const monopolyOpportunityTaskEl = document.getElementById('settingMonopolyOpportunityTask');
          const monopolyOpportunityPointsEl = document.getElementById('settingMonopolyOpportunityPoints');
          const monopolyStealPointsEl = document.getElementById('settingMonopolyStealPoints');
          const awakenPointsThresholdEl = document.getElementById('settingAwakenPointsThreshold');
          
          currentClass.stagePoints = stagePointsEl ? parseInt(stagePointsEl.value) || 20 : 20;
          currentClass.totalStages = stagesEl ? parseInt(stagesEl.value) || 10 : 10;
          currentClass.stagePointsByStage = stagePointsByStageEl
            ? stagePointsByStageEl.value.split(',').map(x => parseInt(String(x).trim(), 10)).filter(x => Number.isFinite(x) && x > 0)
            : [];
          currentClass.plusItems = this.getPlusItems();
          currentClass.minusItems = this.getMinusItems();
          currentClass.prizes = this.getPrizes();
          currentClass.lotteryPrizes = this.getLotteryPrizes();
          currentClass.broadcastMessages = broadcastEl ? broadcastEl.value.split('\n') : ['欢迎来到萌兽成长营！🎉'];
          currentClass.petCategoryPhotos = this.getPetCategoryPhotos();
          currentClass.sickDays = sickDaysEl ? (parseInt(sickDaysEl.value, 10) || 3) : (parseInt(currentClass.sickDays, 10) || 3);
          currentClass.monopolyRollCost = monopolyRollCostEl ? (parseInt(monopolyRollCostEl.value, 10) || 1) : (parseInt(currentClass.monopolyRollCost, 10) || 1);
          currentClass.monopolyChallengePoints = monopolyChallengePointsEl ? (parseInt(monopolyChallengePointsEl.value, 10) || 3) : (parseInt(currentClass.monopolyChallengePoints, 10) || 3);
          currentClass.monopolyOpportunityTask = monopolyOpportunityTaskEl ? (monopolyOpportunityTaskEl.value || '全组30秒内回答3题') : (currentClass.monopolyOpportunityTask || '全组30秒内回答3题');
          currentClass.monopolyOpportunityPoints = monopolyOpportunityPointsEl ? (parseInt(monopolyOpportunityPointsEl.value, 10) || 4) : (parseInt(currentClass.monopolyOpportunityPoints, 10) || 4);
          currentClass.monopolyStealPoints = monopolyStealPointsEl ? (parseInt(monopolyStealPointsEl.value, 10) || 2) : (parseInt(currentClass.monopolyStealPoints, 10) || 2);
          currentClass.awakenPointsThreshold = awakenPointsThresholdEl ? Math.max(1, parseInt(awakenPointsThresholdEl.value, 10) || 100) : (parseInt(currentClass.awakenPointsThreshold, 10) || 100);
          currentClass.hospitalProjects = hospitalProjectsEl
            ? hospitalProjectsEl.value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
                const parts = line.split('|');
                return {
                  name: (parts[0] || '').trim(),
                  cost: Math.max(1, parseInt(parts[1], 10) || 1),
                  type: ((parts[2] || 'cure').trim() === 'revive' ? 'revive' : 'cure')
                };
              }).filter(x => x.name)
            : (Array.isArray(currentClass.hospitalProjects) ? currentClass.hospitalProjects : [
                { name: '复活针', cost: 8, type: 'revive' },
                { name: '急救药', cost: 3, type: 'cure' }
              ]);
          this.currentClassName = currentClass.name;
        }
        
        data.lastModified = new Date().toISOString();
        
        // 保存数据（不触发同步）
        setUserData(data);
        console.log('用户数据保存完成（内部方法），最后修改时间:', data.lastModified);
        
        // 设置数据变更标志
        this.dataChanged = true;
        this.pendingChanges++;
        
      } catch (e) {
        console.error('内部保存用户数据失败:', e);
        throw e;
      }
    },
    
    // 同步到云存储 - 优化版，支持2000人同时使用
    async syncToCloud() {
      const statusEl = document.getElementById('cloudSyncStatus');
      const btnUpload = document.getElementById('btnSyncToCloud');
      const btnDownload = document.getElementById('btnSyncFromCloud');
      // 无网时不进行云同步
      if (!navigator.onLine) {
        console.log('无网络连接，跳过云端同步');
        if (statusEl) statusEl.textContent = '云同步状态：当前无网络，未上传';
        return false;
      }

      // 本地数据为空时，出于安全考虑禁止上传，避免把有数据的云端覆盖成空
      if (!hasMeaningfulUserData()) {
        console.log('本地没有任何班级或学生数据，出于安全考虑不上传到云端');
        if (statusEl) {
          statusEl.textContent = '云同步状态：本机暂无班级/学生数据，已阻止空数据上传云端';
        }
        return false;
      }
      
      // 防止重复同步
      if (this.syncing) {
        console.log('正在同步中，跳过重复同步');
        if (statusEl) statusEl.textContent = '云同步状态：正在进行中，请稍候…';
        return false;
      }
      
      this.syncing = true;
      if (statusEl) statusEl.textContent = '云同步状态：正在上传到 Supabase…';
      if (btnUpload) btnUpload.disabled = true;
      if (btnDownload) btnDownload.disabled = true;
      
      try {
        // 1. 获取并迁移数据
        let userData = getUserData();
        userData = this.migrateUserData(userData);
        const now = new Date().toISOString();
        
        // 2. 数据验证
        if (!this.validateUserData(userData)) {
          console.error('数据验证失败，跳过同步');
          if (statusEl) statusEl.textContent = '云同步状态：数据格式不合法，未上传';
          return false;
        }
        
        // 3. 数据压缩（减少传输量）
        const compressedData = this.compressUserData(userData);
        
        console.log('准备同步到云端，用户ID:', this.currentUserId);
        console.log('同步时间:', now);
        console.log('数据大小:', JSON.stringify(compressedData).length, 'bytes');
        
        // 4. 更新数据的最后修改时间
        compressedData.lastModified = now;
        
        // 5. 本地备份（仅本账号）：保存完整数据，避免精简版导致本地“看起来丢数据”
        try {
          const backupKey = this.currentUserId ? `${APP_NAMESPACE}_local_${this.currentUserId}` : `${APP_NAMESPACE}_local_default`;
          localStorage.setItem(backupKey, JSON.stringify({
            data: userData,
            timestamp: now
          }));
          console.log('数据已存储到本地');
        } catch (localError) {
          console.error('本地存储失败:', localError);
        }
        
        // 6. 单端登录：上传时携带当前会话 ID，供其他端校验
        const userId = this.currentUserId || 'default_user';
        const userIdStr = String(userId);
        let sessionId = localStorage.getItem(SESSION_ID_KEY);
        if (!sessionId) {
          sessionId = generateSessionId();
          try { localStorage.setItem(SESSION_ID_KEY, sessionId); } catch (e) {}
        }
        let uploadOk = await this.syncToCloudViaRest(userIdStr, compressedData, now, sessionId);
        if (!uploadOk && typeof Bmob !== 'undefined') {
          console.log('REST 上传未成功，尝试 SDK 上传...');
          try {
            const userDataRecord = Bmob.Query('UserData');
            userDataRecord.set('userId', userIdStr);
            userDataRecord.set('data', typeof compressedData === 'string' ? compressedData : JSON.stringify(compressedData));
            userDataRecord.set('sessionId', sessionId);
            userDataRecord.set('sessionUpdatedAt', now);
            // 不设置 updatedAt：Bmob 保留字段，会报 code 105
            await userDataRecord.save();
            uploadOk = true;
            console.log('✅ 数据已通过 SDK 同步到 Bmob');
          } catch (bmobError) {
            console.error('Bmob同步失败:', bmobError);
            if (bmobError.code === 415) {
              console.warn('SDK 415，云端上传失败，数据已保存在本地，多端请依赖 REST 拉取');
            }
          }
        }
        if (!uploadOk) {
          console.log('云端上传失败或未配置，数据已保存在本地');
          if (statusEl) statusEl.textContent = '云同步状态：上传失败，数据已保存在本地';
        } else {
          if (statusEl) statusEl.textContent = '云同步状态：✅ 上传成功';
          this.lastSyncTime = now;
          this.dataChanged = false;
          this.pendingChanges = 0;
        }
        
      } catch (e) {
        console.error('云同步失败:', e);
        if (statusEl) statusEl.textContent = '云同步状态：上传异常，数据已保存在本地';
      } finally {
        this.syncing = false;
        if (btnUpload) btnUpload.disabled = false;
        if (btnDownload) btnDownload.disabled = false;
      }
      this.updateSyncDigest();
      return true;
    },

    async syncAllNow() {
      const statusEl = document.getElementById('cloudSyncStatus');
      if (statusEl) statusEl.textContent = '云同步状态：执行一键双向同步中…';
      const up = await this.syncToCloud();
      const down = await this.syncFromCloud();
      this.updateSyncDigest();
      if (up || down) {
        if (statusEl) statusEl.textContent = '云同步状态：✅ 双向同步完成，数据已对齐';
      } else {
        if (statusEl) statusEl.textContent = '云同步状态：⚠️ 本次未发生数据变更';
      }
    },
    
    // 从云存储同步授权码（无需用户ID），使用 Supabase
    async syncLicensesFromCloud() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过云端同步授权码');
        return null;
      }
      const client = ensureSupabaseClient();
      if (!client) return null;

      try {
        console.log('开始从 Supabase 同步授权码...');
        let { data: rows, error } = await client
          .from('users')
          .select('id, data, updated_at')
          .eq('id', 'user_list_global')
          .limit(1);

        if (error) {
          console.error('从 Supabase 查询授权码失败:', error);
          rows = null;
        }

        if (!rows || rows.length === 0) {
          const result = await client
            .from('users')
            .select('id, data, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1);
          if (result.error) {
            console.error('从 Supabase 查询最近用户授权码失败:', result.error);
            return null;
          }
          rows = result.data || [];
        }

        if (!rows || rows.length === 0) return null;

        const row = rows[0];
        const payload = row.data || {};
        const licenses = payload.licenses;

              if (licenses && Array.isArray(licenses)) {
          console.log('从 Supabase 同步授权码，数量:', licenses.length);
                setLicenses(licenses);
                return licenses;
        }
      } catch (e) {
        console.error('同步授权码失败:', e);
      }
      
      return null;
    },
    
    // 使用 Supabase 上传 UserData（替代原 Bmob REST）
    async syncToCloudViaRest(userIdStr, compressedData, now, sessionId) {
      const client = ensureSupabaseClient();
      if (!client) return false;
      try {
        const payload = {
          id: userIdStr,
          data: compressedData,
          updated_at: now || new Date().toISOString()
        };
        const { error } = await client
          .from('users')
          .upsert(payload, { onConflict: 'id' });
        if (error) {
          console.error('Supabase 上传用户数据失败:', error);
          return false;
        }
        console.log('✅ 已通过 Supabase 上传用户数据');
          return true;
      } catch (e) {
        console.warn('Supabase 上传失败:', e);
        return false;
      }
    },

    // 仅更新云端 data 字段（不更新 sessionId），用于强制下线前保存本端数据
    async pushDataOnlyToCloud(objectId, userData) {
      if (!navigator.onLine) return false;
      const client = ensureSupabaseClient();
      if (!client) return false;
      try {
        let data = this.migrateUserData(userData || getUserData());
        if (!this.validateUserData(data)) return false;
        const compressed = this.compressUserData(data);
        const now = new Date().toISOString();
        compressed.lastModified = now;

        const { error } = await client
          .from('users')
          .update({ data: compressed, updated_at: now })
          .eq('id', objectId);
        if (error) {
          console.error('Supabase 保存数据失败:', error);
        return false;
        }
        console.log('强制下线前已保存数据到 Supabase');
        return true;
      } catch (e) {
        console.warn('强制下线前保存到 Supabase 失败:', e);
        return false;
      }
    },

    // 使用 Supabase 拉取 UserData（替代原 Bmob REST）
    async fetchUserDataViaRest(userIdStr) {
      const client = ensureSupabaseClient();
      if (!client) return null;
      try {
        if (userIdStr) {
          const { data, error } = await client
            .from('users')
            .select('id, data, updated_at')
            .eq('id', userIdStr)
            .limit(1);
          if (error) {
            console.error('从 Supabase 拉取用户数据失败:', error);
            return null;
          }
          if (!data || data.length === 0) return [];
          const row = data[0];
          return [{
            objectId: row.id,
            data: row.data,
            licenses: null,
            sessionId: null,
            updatedAt: row.updated_at
          }];
        } else {
          const { data, error } = await client
            .from('users')
            .select('id, data, updated_at')
            .order('updated_at', { ascending: false })
            .limit(100);
          if (error) {
            console.error('从 Supabase 拉取多用户数据失败:', error);
            return null;
          }
          return (data || []).map(row => ({
            objectId: row.id,
            data: row.data,
            licenses: null,
            sessionId: null,
            updatedAt: row.updated_at
          }));
        }
      } catch (e) {
        console.warn('Supabase 拉取用户数据异常:', e);
        return null;
      }
    },

    // 是否允许用云端/备份数据覆盖本地（防止空云端或旧云端覆盖本地有效数据）
    shouldOverwriteLocalWithCloud(localData, cloudData, cloudTimestamp) {
      if (!cloudData || typeof cloudData !== 'object') return false;
      const localClasses = (localData && localData.classes) ? localData.classes : [];
      const cloudClasses = (cloudData.classes && Array.isArray(cloudData.classes)) ? cloudData.classes : [];
      const localHasData = localClasses.some(c => Array.isArray(c.students) && c.students.length > 0);
      const cloudHasData = cloudClasses.some(c => Array.isArray(c.students) && c.students.length > 0);

      if (localHasData && !cloudHasData) {
        console.log('跳过用空云端数据覆盖本地数据，保留本地');
        return false;
      }

      const localTs = Date.parse((localData && localData.lastModified) || '') || 0;
      const cloudTs = Date.parse(cloudTimestamp || (cloudData && cloudData.lastModified) || '') || 0;
      if (localTs && cloudTs && localTs >= cloudTs) {
        console.log('本地数据更新（或相同）于云端，保留本地，避免反向覆盖');
        return false;
      }

      const sumStudents = (arr) => (arr || []).reduce((n, c) => n + ((c && c.students && c.students.length) || 0), 0);
      const localStudents = sumStudents(localClasses);
      const cloudStudents = sumStudents(cloudClasses);
      if (localStudents > cloudStudents && localHasData) {
        console.log('本地学生数更多，保留本地避免误覆盖');
        return false;
      }
      return true;
    },

    backupSafetySnapshot(tag, data) {
      try {
        const key = this.currentUserId ? `${APP_NAMESPACE}_safety_${this.currentUserId}` : `${APP_NAMESPACE}_safety_default`;
        const raw = localStorage.getItem(key);
        const arr = raw ? JSON.parse(raw) : [];
        arr.unshift({ tag: tag || 'sync', time: new Date().toISOString(), data });
        localStorage.setItem(key, JSON.stringify(arr.slice(0, 5)));
      } catch (e) {
        console.warn('保存安全快照失败:', e);
      }
    },

    // 从云存储同步。skipSessionCheck=true 表示本次是登录流程，不校验“其他设备登录”
    async syncFromCloud(skipSessionCheck, forceCloudOverwrite) {
      const statusEl = document.getElementById('cloudSyncStatus');
      const btnUpload = document.getElementById('btnSyncToCloud');
      const btnDownload = document.getElementById('btnSyncFromCloud');
      if (!navigator.onLine) {
        console.log('无网络连接，跳过云端同步');
        if (!skipSessionCheck && statusEl) statusEl.textContent = '云同步状态：当前无网络，无法从云端恢复';
        return false;
      }
      
      // 登录场景优先保护本地完整数据：
      // 只有当本地“确实有学生数据”时，才认为本地是权威源并跳过云端覆盖。
      // 避免新设备自动生成空班级后，被误判为“本地有数据”，从而导致“云端恢复成功但没数据”。
      try {
        const localHasMeaningful = hasMeaningfulUserData();
        if (skipSessionCheck && localHasMeaningful) {
          console.log('登录场景下本地已有数据，跳过从云端覆盖本地，后续将以本地为准同步到云端');
          return false;
        }
      } catch (e) {
        console.warn('检查本地数据是否存在时出错，继续执行云端同步:', e);
      }
      if (this.syncing) {
        console.log('正在同步中，跳过重复同步');
        return false;
      }
      
      this.syncing = true;
      if (!skipSessionCheck && statusEl) statusEl.textContent = '云同步状态：正在向 Supabase 发起请求…';
      if (!skipSessionCheck && btnUpload) btnUpload.disabled = true;
      if (!skipSessionCheck && btnDownload) btnDownload.disabled = true;
      let syncSuccess = false;
      const userIdStr = this.currentUserId ? String(this.currentUserId).trim() : '';
        console.log('开始从Bmob同步数据，用户ID:', userIdStr || '(无)');

      try {
        // 1) 优先用 REST API 拉取，避免 SDK 在部分环境触发 415
        if (!skipSessionCheck && statusEl) statusEl.textContent = '云同步状态：已发送请求，等待 Supabase 响应…';
        let results = await this.fetchUserDataViaRest(userIdStr);
        if (results && results.length > 0) {
          if (userIdStr && results.length > 1) {
            results = results.slice(0, 1);
          }
          const row = results[0];
          // 多端并行保护：检测到其他设备会话时，不强制下线，不覆盖当前端本地数据
          if (!skipSessionCheck && row.sessionId) {
            const mySession = localStorage.getItem(SESSION_ID_KEY);
            if (mySession !== row.sessionId) {
              if (statusEl) statusEl.textContent = '云同步状态：检测到其他设备登录，当前端进入本地保护模式（不覆盖本机）';
              console.warn('检测到会话不一致，已启用本地保护模式');
              return false;
            }
          }
          let cloudData = row.data;
          const cloudLicenses = row.licenses;
          const cloudTimestamp = String(row.updatedAt || '1970-01-01T00:00:00.000Z');
          if (cloudData) {
            if (!skipSessionCheck && statusEl) statusEl.textContent = '云同步状态：已从 Supabase 收到数据，正在解析…';
            if (typeof cloudData === 'string') {
              try { cloudData = JSON.parse(cloudData); } catch (e) {}
            }
            if (cloudData && typeof cloudData === 'object') {
              if (!skipSessionCheck && statusEl) statusEl.textContent = '云同步状态：正在迁移并校验数据…';
              let updatedData = this.migrateUserData(cloudData);
              if (this.validateUserData(updatedData)) {
                updatedData.lastModified = cloudTimestamp;
                if (cloudLicenses) {
                  try {
                    const licenses = typeof cloudLicenses === 'string' ? JSON.parse(cloudLicenses) : cloudLicenses;
                    if (licenses && Array.isArray(licenses)) setLicenses(licenses);
                  } catch (e) {}
                }
                const localData = getUserData();
                if (forceCloudOverwrite || this.shouldOverwriteLocalWithCloud(localData, updatedData, cloudTimestamp)) {
                  if (!skipSessionCheck && statusEl) statusEl.textContent = '云同步状态：正在写入本地存储…';
                  this.backupSafetySnapshot('before-cloud-overwrite', localData);
                  setUserData(updatedData);
                  syncSuccess = true;
                  console.log('从Bmob REST同步成功，数据已更新');
                  // 立即刷新内存与界面，避免“拉取完成但没数据显示”
                  this.loadUserData();
                  this.updateClassSelect();
                  this.renderDashboard();
                  this.renderStudents();
                  this.renderHonor();
                  this.renderStore();
                } else {
                  console.log('保留本地数据，未用云端覆盖');
                }
              }
            }
          }
        }
        
        // 2) REST 无数据或失败时，再用 SDK 尝试
        if (!syncSuccess && typeof Bmob !== 'undefined') {
          let sdkResults = [];
          try {
            if (userIdStr) {
              const query = Bmob.Query('UserData');
              query.equalTo('userId', userIdStr);
              sdkResults = await query.find();
            } else {
              const query = Bmob.Query('UserData');
              sdkResults = await query.find();
            }
            if (sdkResults.length > 1) {
              sdkResults.sort(function (a, b) {
                const t1 = (a.get && a.get('updatedAt')) ? new Date(a.get('updatedAt')).getTime() : 0;
                const t2 = (b.get && b.get('updatedAt')) ? new Date(b.get('updatedAt')).getTime() : 0;
                return t2 - t1;
              });
              sdkResults = sdkResults.slice(0, 1);
            }
            
            console.log('Bmob SDK返回数据:', sdkResults);
            
            if (sdkResults.length === 0) {
              console.log('云端没有数据记录，准备上传本地数据');
              const localData = getUserData();
              if (Object.keys(localData).length > 0) {
                console.log('本地有数据，上传到云端');
                await this.syncToCloud();
                syncSuccess = true;
              } else {
                console.log('本地也没有数据，跳过同步');
              }
            } else {
              const userDataRecord = sdkResults[0];
              const cloudSessionId = userDataRecord.get && userDataRecord.get('sessionId');
              if (!skipSessionCheck && cloudSessionId) {
                const mySession = localStorage.getItem(SESSION_ID_KEY);
                if (mySession !== cloudSessionId) {
                  this.syncing = false;
                  if (statusEl) statusEl.textContent = '云同步状态：检测到其他设备登录，当前端进入本地保护模式（不覆盖本机）';
                  console.warn('SDK检测到会话不一致，已启用本地保护模式');
                  return false;
                }
              }
              let cloudData = userDataRecord.get('data');
              const cloudLicenses = userDataRecord.get('licenses');
              const cloudTimestamp = String(userDataRecord.get('updatedAt') || '1970-01-01T00:00:00.000Z');
              
              console.log('云端数据内容:', cloudData);
              console.log('云端数据类型:', typeof cloudData);
              console.log('云端授权码:', cloudLicenses);
              console.log('云端更新时间:', cloudTimestamp);
              
              if (cloudData) {
                // 尝试解析JSON字符串格式的数据
                if (typeof cloudData === 'string') {
                  try {
                    cloudData = JSON.parse(cloudData);
                    console.log('解析云端JSON数据成功');
                  } catch (e) {
                    console.error('解析云端JSON数据失败:', e);
                    return false;
                  }
                }
                
                // 确保cloudData是对象
                if (typeof cloudData !== 'object' || cloudData === null) {
                  console.error('云端数据格式错误，不是对象:', cloudData);
                  return false;
                }
                
                const localData = getUserData();
                const localTimestamp = localData.lastModified || '1970-01-01T00:00:00.000Z';
                
                console.log(`时间戳比较 - 本地: ${localTimestamp}, 云端: ${cloudTimestamp}`);
                console.log(`本地数据:`, localData);
                console.log(`云端数据:`, cloudData);
                
                // 总是从云端同步最新数据，不考虑时间差
                console.log('从云端同步最新数据');
                // 迁移和验证云端数据
                let updatedData = this.migrateUserData(cloudData);
                
                // 验证数据
                if (!this.validateUserData(updatedData)) {
                  console.error('云端数据验证失败，跳过同步');
                  return false;
                }
                
                // 更新时间戳
                updatedData.lastModified = cloudTimestamp;
                
                // 同步授权码
                if (cloudLicenses) {
                  try {
                    const licenses = typeof cloudLicenses === 'string' ? JSON.parse(cloudLicenses) : cloudLicenses;
                    if (licenses && Array.isArray(licenses)) {
                      console.log('同步云端授权码，数量:', licenses.length);
                      setLicenses(licenses);
                      updatedData.licenses = licenses;
                    }
                  } catch (e) {
                    console.error('解析云端授权码失败:', e);
                  }
                }
                
                // 仅当云端数据有效且允许覆盖时才保存（防止空云端覆盖本地）
                if (this.shouldOverwriteLocalWithCloud(localData, updatedData)) {
                  setUserData(updatedData);
                  try {
                    const backupKey = this.currentUserId ? `${APP_NAMESPACE}_local_${this.currentUserId}` : `${APP_NAMESPACE}_local_default`;
                    localStorage.setItem(backupKey, JSON.stringify({
                      data: updatedData,
                      timestamp: cloudTimestamp
                    }));
                  } catch (e) {
                    console.error('本地备份失败:', e);
                  }
                  console.log('从Bmob云存储同步成功，数据已更新');
                  syncSuccess = true;
                } else {
                  console.log('保留本地数据，未用云端覆盖');
                }
              }
            }
          } catch (bmobError) {
            if (bmobError && bmobError.code === 415) {
              console.warn('云端同步暂不可用(415)，已使用本地数据，数据已保存在本设备');
            } else {
              console.error('Bmob同步失败:', bmobError);
            }
            // 415 时降级：仅 find() 不传 where/limit，拉取后本地按 userId 过滤
            if (bmobError.code === 415 && userIdStr) {
              try {
                const fallbackQuery = Bmob.Query('UserData');
                const list = await fallbackQuery.find();
                const filtered = list.filter(function (r) {
                  return (r.get && r.get('userId')) === userIdStr;
                });
                if (filtered.length > 0) {
                  filtered.sort(function (a, b) {
                    const t1 = (a.get && a.get('updatedAt')) ? new Date(a.get('updatedAt')).getTime() : 0;
                    const t2 = (b.get && b.get('updatedAt')) ? new Date(b.get('updatedAt')).getTime() : 0;
                    return t2 - t1;
                  });
                  const userDataRecord = filtered[0];
                  const fallbackSessionId = userDataRecord.get && userDataRecord.get('sessionId');
                  if (!skipSessionCheck && fallbackSessionId) {
                    const mySession = localStorage.getItem(SESSION_ID_KEY);
                    if (mySession !== fallbackSessionId) {
                      this.syncing = false;
                      const objId = userDataRecord.id || (userDataRecord.get && userDataRecord.get('objectId'));
                      if (objId) await this.pushDataOnlyToCloud(objId, getUserData());
                      this.forceLogout('您已在其他设备登录，请重新登录');
                      return false;
                    }
                  }
                  let cloudData = userDataRecord.get('data');
                  const cloudLicenses = userDataRecord.get('licenses');
                  const cloudTimestamp = String(userDataRecord.get('updatedAt') || '1970-01-01T00:00:00.000Z');
                  if (cloudData) {
                    if (typeof cloudData === 'string') {
                      try { cloudData = JSON.parse(cloudData); } catch (e) {}
                    }
                    if (cloudData && typeof cloudData === 'object') {
                      let updatedData = this.migrateUserData(cloudData);
                      if (this.validateUserData(updatedData)) {
                        updatedData.lastModified = cloudTimestamp;
                        if (cloudLicenses) {
                          try {
                            const licenses = typeof cloudLicenses === 'string' ? JSON.parse(cloudLicenses) : cloudLicenses;
                            if (licenses && Array.isArray(licenses)) setLicenses(licenses);
                          } catch (e) {}
                        }
                        const localData = getUserData();
                        if (this.shouldOverwriteLocalWithCloud(localData, updatedData)) {
                          setUserData(updatedData);
                          syncSuccess = true;
                          console.log('Bmob 415 降级：已用云端数据更新本地');
                        }
                      }
                    }
                  }
                }
              } catch (e2) {
                console.warn('Bmob 415 降级查询失败:', e2);
              }
            }
            // Bmob同步失败不影响本地存储，应用仍可正常使用
          }
        } else {
          console.log('云端未配置或拉取失败，使用本地数据');
          // 尝试从本地存储读取数据
          try {
            const backupKey = this.currentUserId ? `${APP_NAMESPACE}_local_${this.currentUserId}` : `${APP_NAMESPACE}_local_default`;
            const backupData = localStorage.getItem(backupKey);
            if (backupData) {
              try {
                const parsedBackup = JSON.parse(backupData);
                console.log('从本地存储恢复数据');
                if (parsedBackup.data && this.validateUserData(parsedBackup.data)) {
                  const localData = getUserData();
                  if (this.shouldOverwriteLocalWithCloud(localData, parsedBackup.data)) {
                    setUserData(parsedBackup.data);
                    console.log('本地数据恢复成功');
                    syncSuccess = true;
                  }
                }
              } catch (e) {
                console.error('解析本地备份数据失败:', e);
              }
            }
          } catch (localError) {
            console.error('读取本地存储失败:', localError);
          }
        }
        
        // 标记数据已加载，避免init中重复加载
        this.dataLoaded = true;
        // 立即加载更新后的数据到内存
        this.loadUserData();
        // 重新渲染界面以显示新数据
        this.renderDashboard();
        this.renderStudents();
        this.renderHonor();
        this.renderStore();
        console.log('界面已重新渲染');
        
        // 即使本地数据更新，也要确保云端有数据
        if (this.dataChanged) {
          console.log('本地数据有变更，同步到云端');
          await this.syncToCloud();
        }
      } catch (e) {
        console.error('从云存储同步失败:', e);
      } finally {
        this.syncing = false;
        if (!skipSessionCheck && btnUpload) btnUpload.disabled = false;
        if (!skipSessionCheck && btnDownload) btnDownload.disabled = false;
        if (!skipSessionCheck && statusEl) {
          if (syncSuccess) {
            statusEl.textContent = '云同步状态：已从云端恢复到本机';
          } else {
            statusEl.textContent = '云同步状态：未从云端加载任何数据（可能云端暂无数据，请先在有数据设备点「上传到云端」）';
          }
        }
      }
      
      // 2. 云存储没有数据或同步失败，尝试从本地备份加载（不允许多端空备份覆盖本地有效数据）
      if (!syncSuccess) {
        try {
          const backupKey = this.currentUserId ? `${APP_NAMESPACE}_local_${this.currentUserId}` : `${APP_NAMESPACE}_local_default`;
          const localDataStr = localStorage.getItem(backupKey);
          
          if (localDataStr) {
            const parsedData = JSON.parse(localDataStr);
            const currentData = getUserData();
            const currentTimestamp = currentData.lastModified || '1970-01-01T00:00:00.000Z';
            const backupData = parsedData.data;
            const newerTimestamp = parsedData.timestamp > currentTimestamp;
            if (newerTimestamp && backupData && this.shouldOverwriteLocalWithCloud(currentData, backupData, parsedData.timestamp)) {
              const updatedData = {
                ...backupData,
                lastModified: parsedData.timestamp
              };
              setUserData(updatedData);
              this.loadUserData();
              this.renderDashboard();
              this.renderStudents();
              this.renderHonor();
              this.renderStore();
              console.log('从本地备份加载成功，数据已更新');
              syncSuccess = true;
              if (!skipSessionCheck && statusEl) {
                statusEl.textContent = '云同步状态：已从本地备份恢复';
              }
            }
          }
        } catch (localError) {
          console.error('从本地备份加载失败:', localError);
        }
      }
      
      this.updateSyncDigest();
      return syncSuccess;
  },
    
    // 显示同步状态
    showSyncStatus(message, type = 'info') {
      try {
        let statusEl = document.getElementById('syncStatus');
        if (!statusEl) {
          // 创建状态提示元素
          statusEl = document.createElement('div');
          statusEl.id = 'syncStatus';
          statusEl.style.position = 'fixed';
          statusEl.style.bottom = '20px';
          statusEl.style.right = '20px';
          statusEl.style.padding = '10px 15px';
          statusEl.style.borderRadius = '4px';
          statusEl.style.zIndex = '10000';
          statusEl.style.fontSize = '14px';
          statusEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          document.body.appendChild(statusEl);
        }
        
        // 设置样式
        switch (type) {
          case 'success':
            statusEl.style.backgroundColor = '#52c41a';
            statusEl.style.color = '#fff';
            break;
          case 'error':
            statusEl.style.backgroundColor = '#ff4d4f';
            statusEl.style.color = '#fff';
            break;
          case 'warning':
            statusEl.style.backgroundColor = '#faad14';
            statusEl.style.color = '#fff';
            break;
          default:
            statusEl.style.backgroundColor = '#1890ff';
            statusEl.style.color = '#fff';
        }
        
        // 设置消息
        statusEl.textContent = message;
        statusEl.style.display = 'block';
        
        // 3秒后隐藏
        setTimeout(() => {
          if (statusEl) {
            statusEl.style.display = 'none';
          }
        }, 3000);
      } catch (e) {
        console.error('显示同步状态失败:', e);
      }
    },
    
    // 启用自动同步和备份 - 大幅减少云端操作
    enableAutoSync() {
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
      }
      
      this.autoSyncInterval = setInterval(async () => {
        const now = Date.now();
        this.saveUserData();

        if (!navigator.onLine) {
          console.log('无网络连接，仅保存本地');
          return;
        }

        if (this.currentUserId && (now - (this.lastPullFromCloud || 0)) >= 10 * 60 * 1000) {
          this.lastPullFromCloud = now;
          try {
            const updated = await this.syncFromCloud();
            if (updated) {
              this.loadUserData();
              this.renderStudents();
              this.renderGroups();
              this.renderDashboard();
              this.renderHonor();
              this.renderStore();
              console.log('多端同步：已拉取云端最新数据并刷新界面');
            }
          } catch (e) {
            console.warn('从云端拉取失败:', e);
          }
        }

        if (this.dataChanged) {
          const timeSinceLastSync = now - this.lastSyncAttempt;
          if (timeSinceLastSync >= 5 * 60 * 1000 || this.pendingChanges >= 10) {
            try {
              this.showSyncStatus('正在同步数据...', 'info');
              await this.syncData();
              this.showSyncStatus('数据同步成功', 'success');
            } catch (e) {
              this.showSyncStatus('同步失败，将在网络恢复后重试', 'warning');
            }
          }
        }

        if (!this.lastBackupTime || now - this.lastBackupTime >= 60 * 60 * 1000) {
          if (this.currentUserId) {
            try {
              await this.backupCloudData();
              this.lastBackupTime = now;
              this.showSyncStatus('数据备份成功', 'success');
            } catch (e) {
              console.error('自动备份失败:', e);
            }
          }
        }
      }, 10 * 60 * 1000);
    },
    
    // 禁用自动同步
    disableAutoSync() {
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
      }
    },
    
    // 启用实时同步
    enableRealtimeSync() {
      // 如果已经启用，先移除之前的事件监听，避免重复绑定
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
        this.onlineHandler = null;
      }
      if (this.visibilityHandler) {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
        this.visibilityHandler = null;
      }
      
      // 监听网络状态变化
      this.onlineHandler = () => {
        console.log('网络已连接，开始同步数据');
        this.syncData();
      };
      window.addEventListener('online', this.onlineHandler);
      
      // 监听页面可见性变化（用户切换回页面时检查同步）
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          console.log('页面可见，检查是否需要同步');
          const now = Date.now();
          const timeSinceLastSync = now - this.lastSyncAttempt;
          
          // 只有距离上次同步超过30分钟才检查云端更新
          if (timeSinceLastSync >= 30 * 60 * 1000) {
            setTimeout(() => {
              this.syncFromCloud().then(syncResult => {
                if (syncResult) {
                  this.renderStudents();
                  this.renderGroups();
                  console.log('页面可见时同步完成，界面已刷新');
                }
              });
            }, 2000);
          } else {
            console.log('距离上次同步不足30分钟，跳过云端检查');
          }
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
      
      // 监听数据变化
      this.observeDataChanges();
    },
    
    // 禁用实时同步
    disableRealtimeSync() {
      // 清理事件监听器
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
        this.onlineHandler = null;
      }
      if (this.visibilityHandler) {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
        this.visibilityHandler = null;
      }
    },
    
    // 观察数据变化
    observeDataChanges() {
      // 这里可以添加数据变化的观察逻辑
      // 例如使用Proxy或其他方式监听数据变化
    },

    init() {
      // 先绑定交互，避免渲染中途报错导致“按键无反应”
      try { this.bindNav(); } catch (e) { console.error('bindNav失败:', e); }
      try { this.bindSearch(); } catch (e) { console.error('bindSearch失败:', e); }
      try { this.bindStoreTabs(); } catch (e) { console.error('bindStoreTabs失败:', e); }
      try { this.ensureKeyboardShortcutsBound(); } catch (e) { console.error('快捷键绑定失败:', e); }

      // 数据加载
      try {
        if (!this.dataLoaded) {
          this.loadUserData();
          this.dataLoaded = true;
          console.log('首次加载用户数据');
        } else {
          console.log('数据已加载，跳过重复加载');
        }
      } catch (e) {
        console.error('加载用户数据失败:', e);
      }

      // 渲染设置项
      try { this.renderPlusItems(); } catch (e) { console.error('renderPlusItems失败:', e); }
      try { this.renderMinusItems(); } catch (e) { console.error('renderMinusItems失败:', e); }
      try { this.renderPrizes(); } catch (e) { console.error('renderPrizes失败:', e); }
      try { this.renderLotteryPrizes(); } catch (e) { console.error('renderLotteryPrizes失败:', e); }
      try { this.loadBroadcastSettings(); } catch (e) { console.error('loadBroadcastSettings失败:', e); }
      try { this.loadScreenLockSettings(); } catch (e) { console.error('loadScreenLockSettings失败:', e); }
      try { this.loadBroadcastMessages(); } catch (e) { console.error('loadBroadcastMessages失败:', e); }
      try { this.applySeasonThemeAndBgm(); } catch (e) { console.error('赛季主题初始化失败:', e); }
      try {
        const cls = this.getCurrentClassData();
        const rollCost = parseInt((cls && cls.monopolyRollCost) || 1, 10) || 1;
        const rollInput = document.getElementById('monopolyRollCost');
        if (rollInput) rollInput.value = String(rollCost);
      } catch (e) { console.error('初始化PK掷骰消耗失败:', e); }

      // 首屏渲染
      try { this.showPage('dashboard'); } catch (e) { console.error('showPage失败:', e); }
      try { this.renderDashboard(); } catch (e) { console.error('renderDashboard失败:', e); }
      setTimeout(() => { try { this.renderStudents(); } catch (e) { console.error('延后渲染学生失败:', e); } }, 0);
      setTimeout(() => { try { this.renderHonor(); } catch (e) { console.error('延后渲染光荣榜失败:', e); } }, 30);
      setTimeout(() => { try { this.renderStore(); } catch (e) { console.error('延后渲染商店失败:', e); } }, 60);

      // 初始化照片存储
      try { this.initPhotoStorage(); } catch (e) { console.error('照片存储初始化失败:', e); }

      // 后台任务仅启动一次
      if (!this._backgroundJobsStarted) {
        this._backgroundJobsStarted = true;
        setInterval(() => {
          try { this.resetGithubApiCounter(); } catch (e) { console.error('重置API计数器失败:', e); }
        }, 60 * 60 * 1000);
        this.startPhotoQueueProcessor();
      }
        
        console.log('应用初始化完成');
    },

    getStagePointsByStage(stage) {
      // 缓存班级数据，避免每张卡片都读一次localStorage
      if (!this._stageCache || this._stageCacheClassId !== this.currentClassId) {
      const data = getUserData();
        const currentClass = data.classes && this.currentClassId
          ? data.classes.find(c => c.id === this.currentClassId)
          : null;
        this._stageCache = {
          list: (currentClass && Array.isArray(currentClass.stagePointsByStage)) ? currentClass.stagePointsByStage : [],
          defaultPoints: (currentClass && parseInt(currentClass.stagePoints, 10) > 0) ? parseInt(currentClass.stagePoints, 10) : 20
        };
        this._stageCacheClassId = this.currentClassId;
      }
      const idx = Math.max(1, parseInt(stage, 10) || 1) - 1;
      const v = parseInt(this._stageCache.list[idx], 10);
      return (Number.isFinite(v) && v > 0) ? v : this._stageCache.defaultPoints;
    },
    getStagePhotoPath(typeId, stage) {
      if (!typeId) return '';
      const aliasMap = { qilin: 'qinlin' };
      const safeTypeId = aliasMap[typeId] || typeId;
      const s = Math.max(1, Math.min(5, parseInt(stage, 10) || 1));
      return `photos/${safeTypeId}/stage${s}.jpg`;
    },
    handleStagePhotoError(imgEl) {
      if (!imgEl) return;
      const typeId = imgEl.dataset.typeId || '';
      let stage = parseInt(imgEl.dataset.stage || '1', 10) || 1;
      stage -= 1;
      if (typeId && stage >= 1) {
        imgEl.dataset.stage = String(stage);
        imgEl.src = this.getStagePhotoPath(typeId, stage);
        return;
      }
      imgEl.style.display = 'none';
      if (imgEl.nextElementSibling) {
        imgEl.nextElementSibling.style.display = 'none';
      } else if (imgEl.parentElement) {
        imgEl.parentElement.innerHTML = '';
      }
    },
    preloadPetStageImages(typeId, stage) {
      if (!typeId) return;
      if (!this._petImagePreloadCache) this._petImagePreloadCache = Object.create(null);
      const s = Math.max(1, Math.min(5, parseInt(stage, 10) || 1));
      const candidates = [s, Math.min(5, s + 1), Math.min(5, s + 2)];
      candidates.forEach(st => {
        const src = this.getStagePhotoPath(typeId, st);
        if (!src || this._petImagePreloadCache[src]) return;
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
        this._petImagePreloadCache[src] = 1;
      });
    },
    schedulePetPreheat(taskKey, fn, timeout = 1500) {
      if (!taskKey || typeof fn !== 'function') return;
      if (!this._petPreheatPending) this._petPreheatPending = Object.create(null);
      if (this._petPreheatPending[taskKey]) return;
      this._petPreheatPending[taskKey] = 1;
      const run = () => {
        try {
          fn();
        } catch (e) {
          console.error('宠物图片预热失败:', e);
        } finally {
          this._petPreheatPending[taskKey] = 0;
        }
      };
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout });
      } else {
        setTimeout(run, 80);
      }
    },
    preheatCurrentClassPetImages() {
      const now = Date.now();
      if (this._lastClassPetPreheatAt && now - this._lastClassPetPreheatAt < 12000) return;
      this._lastClassPetPreheatAt = now;
      if (!this.students || !this.students.length) return;
      const countMap = Object.create(null);
      this.students.forEach(s => {
        const typeId = s && s.pet && s.pet.typeId;
        if (!typeId) return;
        countMap[typeId] = (countMap[typeId] || 0) + 1;
      });
      const topTypeIds = Object.keys(countMap)
        .sort((a, b) => (countMap[b] || 0) - (countMap[a] || 0))
        .slice(0, 10);
      topTypeIds.forEach(typeId => {
        for (let st = 1; st <= 5; st++) this.preloadPetStageImages(typeId, st);
      });
    },
    preheatPetAdoptImages() {
      const now = Date.now();
      if (this._lastPetAdoptPreheatAt && now - this._lastPetAdoptPreheatAt < 8000) return;
      this._lastPetAdoptPreheatAt = now;
      const ids = (typeof PHOTO_TYPE_IDS !== 'undefined' && Array.isArray(PHOTO_TYPE_IDS) && PHOTO_TYPE_IDS.length)
        ? PHOTO_TYPE_IDS
        : ((window.PET_TYPES || []).map(t => t.id).filter(Boolean));
      ids.slice(0, 24).forEach(typeId => {
        this.preloadPetStageImages(typeId, 1);
        this.preloadPetStageImages(typeId, 3);
      });
    },
    getTotalStages() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      return currentClass ? (parseInt(currentClass.totalStages, 10) || 10) : 10;
    },
    getPlusItems() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId
        ? data.classes.find(c => c.id === this.currentClassId)
        : null;

      // 优先使用班级内自定义加分项
      let plusItems = currentClass && Array.isArray(currentClass.plusItems)
        ? currentClass.plusItems
        : null;

      // 如果班级里还没有配置，但旧版全局存储里有自定义加分项，则做一次迁移并使用它
      if ((!plusItems || plusItems.length === 0)) {
        const globalPlus = getStorage(STORAGE_KEYS.plusItems, []);
        if (globalPlus && globalPlus.length > 0) {
          plusItems = globalPlus;
          if (currentClass) {
            currentClass.plusItems = [...globalPlus];
            setUserData(data);
          }
        }
      }

      // 新规则：
      // - 不再自动显示默认加分项；只有老师手动添加的才显示
      // - 上限 8 个
      const MAX_PLUS_ITEMS = 30;
      const list = (plusItems && plusItems.length > 0) ? plusItems : [];
      return list.slice(0, MAX_PLUS_ITEMS);
    },
    getMinusItems() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId
        ? data.classes.find(c => c.id === this.currentClassId)
        : null;

      // 优先使用班级内自定义扣分项
      let minusItems = currentClass && Array.isArray(currentClass.minusItems)
        ? currentClass.minusItems
        : null;

      // 如果班级里还没有配置，但旧版全局存储里有自定义扣分项，则做一次迁移并使用它
      if ((!minusItems || minusItems.length === 0)) {
        const globalMinus = getStorage(STORAGE_KEYS.minusItems, []);
        if (globalMinus && globalMinus.length > 0) {
          minusItems = globalMinus;
          if (currentClass) {
            currentClass.minusItems = [...globalMinus];
            setUserData(data);
          }
        }
      }

      // 新规则：
      // - 不再自动显示默认扣分项；只有老师手动添加的才显示
      // - 上限 6 个
      const MAX_MINUS_ITEMS = 30;
      const list = (minusItems && minusItems.length > 0) ? minusItems : [];
      return list.slice(0, MAX_MINUS_ITEMS);
    },
    getPrizes() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (currentClass) {
        if (!currentClass.prizes || currentClass.prizes.length === 0) {
          // 如果没有奖品，使用默认奖品
          currentClass.prizes = [...DEFAULT_PRIZES];
          setUserData(data);
        }
        return currentClass.prizes;
      }
      return [...DEFAULT_PRIZES];
    },
    getLotteryPrizes() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      return currentClass ? (currentClass.lotteryPrizes || []) : [];
    },
    getPetCategoryPhotos() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      return currentClass ? (currentClass.petCategoryPhotos || {}) : {};
    },

    getScreenLockSettings() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      return currentClass ? (currentClass.screenLock || { enabled: false, pin: '', locked: false }) : { enabled: false, pin: '', locked: false };
    },

    loadScreenLockSettings() {
      const lock = this.getScreenLockSettings();
      const enabledEl = document.getElementById('settingScreenLockEnabled');
      const pinEl = document.getElementById('settingScreenLockPin');
      if (enabledEl) enabledEl.checked = !!lock.enabled;
      if (pinEl) pinEl.value = lock.pin || '';
      this.applyScreenLockState(!!lock.locked, false);
    },

    saveScreenLockSettings() {
      const enabled = !!document.getElementById('settingScreenLockEnabled')?.checked;
      const pin = String(document.getElementById('settingScreenLockPin')?.value || '').trim();
      if (enabled && pin.length < 4) {
        alert('解锁密码至少4位');
        return;
      }
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!currentClass) return;
      const old = currentClass.screenLock || {};
      currentClass.screenLock = {
        enabled,
        pin: enabled ? pin : '',
        locked: enabled ? !!old.locked : false
      };
      setUserData(data);
      if (!enabled) this.applyScreenLockState(false, false);
      alert('锁屏设置已保存');
    },

    lockScreenNow() {
      const lock = this.getScreenLockSettings();
      if (!lock.enabled || !lock.pin || lock.pin.length < 4) {
        alert('请先在设置中启用锁屏并设置4位以上密码');
        return;
      }
      this.applyScreenLockState(true, true);
    },

    tryUnlockScreen() {
      const input = document.getElementById('screenLockInput');
      const val = String(input?.value || '').trim();
      const lock = this.getScreenLockSettings();
      if (!lock.pin || val !== lock.pin) {
        alert('密码错误');
        if (input) input.value = '';
        return;
      }
      this.applyScreenLockState(false, true);
      if (input) input.value = '';
      this.showSuccess('已解锁');
    },

    applyScreenLockState(locked, persist = true) {
      const overlay = document.getElementById('screenLockOverlay');
      if (overlay) overlay.style.display = locked ? 'flex' : 'none';
      document.body.classList.toggle('screen-locked', !!locked);
      this.isScreenLocked = !!locked;
      if (locked) {
        const input = document.getElementById('screenLockInput');
        setTimeout(() => input && input.focus(), 50);
      }
      if (!persist) return;
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!currentClass) return;
      const old = currentClass.screenLock || { enabled: false, pin: '', locked: false };
      currentClass.screenLock = { ...old, locked: !!locked };
      setUserData(data);
    },

    switchClass(classId) {
      if (!classId) return;
      
      const data = getUserData();
      const selectedClass = data.classes.find(c => c.id === classId);
      if (selectedClass) {
        data.currentClassId = classId;
        setUserData(data);
        this.loadUserData();
        this.init();
        // 重新加载广播设置，确保班级间广播内容隔离
        this.loadBroadcastSettings();
        this.updateBroadcastContent();
        setTimeout(() => {
          this.schedulePetPreheat('switchClass_class', () => this.preheatCurrentClassPetImages(), 1200);
          this.schedulePetPreheat('switchClass_adopt', () => this.preheatPetAdoptImages(), 1800);
        }, 80);
        alert('已切换到班级：' + selectedClass.name);
      }
    },
    createNewClass() {
      const className = document.getElementById('settingClassName').value.trim();
      if (!className) {
        alert('请输入班级名称');
        return;
      }
      
      const data = getUserData();
      
      // 检查班级名称是否已存在
      if (data.classes && data.classes.some(c => c.name === className)) {
        alert('该班级名称已存在，请输入新的班级名称');
        // 清空输入框，让用户输入新的班级名称
        document.getElementById('settingClassName').value = '';
        return;
      }
      
      // 创建新班级
      const newClass = {
        id: 'class_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: className,
        students: [],
        groups: [],
        groupPointHistory: [],
        stagePoints: parseInt(document.getElementById('settingStagePoints').value) || 20,
        stagePointsByStage: (document.getElementById('settingStagePointsByStage')?.value || '')
          .split(',').map(x => parseInt(x.trim(), 10)).filter(x => Number.isFinite(x) && x > 0),
        totalStages: parseInt(document.getElementById('settingStages').value) || 10,
        plusItems: [
          { name: '早读打卡', points: 1 },
          { name: '课堂表现好', points: 2 },
          { name: '作业完成', points: 1 },
          { name: '考试优秀', points: 3 },
          { name: '乐于助人', points: 2 },
          { name: '进步明显', points: 2 }
        ],
        minusItems: [
          { name: '迟到', points: -1 },
          { name: '未完成作业', points: -2 },
          { name: '课堂违纪', points: -2 }
        ],
        prizes: [],
        lotteryPrizes: [],
        broadcastMessages: ['欢迎来到萌兽成长营！🎉'],
        petCategoryPhotos: {},
        sickDays: parseInt(document.getElementById('settingSickDays')?.value, 10) || 3,
        hospitalProjects: (document.getElementById('settingHospitalProjects')?.value || '复活针|8|revive\n急救药|3|cure')
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => {
            const parts = line.split('|');
            return { name: (parts[0] || '').trim(), cost: Math.max(1, parseInt(parts[1], 10) || 1), type: ((parts[2] || 'cure').trim() === 'revive' ? 'revive' : 'cure') };
          })
          .filter(x => x.name),
        monopolyRollCost: parseInt(document.getElementById('settingMonopolyRollCost')?.value, 10) || 1,
        monopolyChallengePoints: parseInt(document.getElementById('settingMonopolyChallengePoints')?.value, 10) || 3,
        monopolyOpportunityTask: document.getElementById('settingMonopolyOpportunityTask')?.value || '全组30秒内回答3题',
        monopolyOpportunityPoints: parseInt(document.getElementById('settingMonopolyOpportunityPoints')?.value, 10) || 4,
        monopolyStealPoints: parseInt(document.getElementById('settingMonopolyStealPoints')?.value, 10) || 2,
        customQuizQuestions: [],
        screenLock: { enabled: false, pin: '', locked: false }
      };
      
      if (!data.classes) {
        data.classes = [];
      }
      
      data.classes.push(newClass);
      data.currentClassId = newClass.id;
      setUserData(data);
      this.loadUserData();
      // 只更新必要的界面，不重新初始化整个应用
      this.renderDashboard();
      this.renderStudents();
      this.renderHonor();
      this.renderStore();
      
      // 确保新创建的班级数据同步到云端
      if (navigator.onLine) {
        try {
          console.log('同步新班级数据到云端...');
          this.syncToCloud();
        } catch (e) {
          console.error('同步班级数据失败:', e);
        }
      }
      
      alert('班级创建成功：' + className);
    },
    deleteClass() {
      if (!this.currentClassId) {
        alert('请先选择一个班级');
        return;
      }
      
      if (!confirm('确定要删除当前班级吗？此操作不可恢复！')) {
        return;
      }
      
      const data = getUserData();
      const classIndex = data.classes.findIndex(c => c.id === this.currentClassId);
      if (classIndex > -1) {
        data.classes.splice(classIndex, 1);
        data.currentClassId = data.classes.length > 0 ? data.classes[0].id : null;
        setUserData(data);
        this.loadUserData();
        this.init();
        alert('班级已删除');
      }
    },
    updateClassSelect() {
      const selectEl = document.getElementById('settingClassSelect');
      if (!selectEl) return;
      
      const data = getUserData();
      const classes = data.classes || [];
      
      // 清空下拉菜单
      selectEl.innerHTML = '<option value="">-- 选择班级 --</option>';
      
      // 添加班级选项
      classes.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls.id;
        option.textContent = cls.name;
        if (cls.id === this.currentClassId) {
          option.selected = true;
        }
        selectEl.appendChild(option);
      });
    },
    getPetFood(s) {
      if (!s || !s.pet || !s.pet.typeId) return '🍖';
      const type = window.PET_TYPES.find(t => t.id === s.pet.typeId);
      return type && type.food ? type.food : '🍖';
    },

    getCurrentClassData() {
      const data = getUserData();
      return data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
    },

    getHospitalProjects() {
      const cls = this.getCurrentClassData();
      const list = cls && Array.isArray(cls.hospitalProjects) ? cls.hospitalProjects : [];
      if (list.length) return list;
      return [
        { name: '复活针', cost: 8, type: 'revive' },
        { name: '急救药', cost: 3, type: 'cure' }
      ];
    },

    ensurePetHealthStatus(student, forcePersist = false) {
      if (!student || !student.pet) return;
      const p = student.pet;
      if (p.isDead || p.isBrokenEgg) return;
      const cls = this.getCurrentClassData();
      const sickDays = Math.max(1, parseInt((cls && cls.sickDays) || 3, 10) || 3);
      const lastFedAt = p.lastFedAt || Date.now();
      const elapsedDays = (Date.now() - lastFedAt) / (24 * 60 * 60 * 1000);
      if (elapsedDays >= sickDays) {
        if (!p.isSick) {
          p.isSick = true;
          if (forcePersist) this.saveStudents();
        }
      }
    },

    openPetHospitalTool() {
      const modal = document.getElementById('petHospitalModal');
      const selectEl = document.getElementById('petHospitalStudentSelect');
      const listEl = document.getElementById('petHospitalList');
      if (!modal || !selectEl || !listEl) return;
      const petStudents = this.students.filter(s => s.pet);
      selectEl.innerHTML = '<option value="">请选择学生</option>' + petStudents.map(s => `<option value="${s.id}">${this.escape(s.name)}（${this.escape(s.id)}）</option>`).join('');
      if (!selectEl.value && petStudents.length) selectEl.value = petStudents[0].id;
      this.renderPetHospitalShop();
      listEl.innerHTML = '<p class="placeholder-text">购买记录会显示在这里</p>';
      modal.style.display = 'flex';
    },

    renderPetHospitalShop() {
      const studentId = document.getElementById('petHospitalStudentSelect')?.value;
      const infoEl = document.getElementById('petHospitalStudentInfo');
      const shopEl = document.getElementById('petHospitalShop');
      if (!infoEl || !shopEl) return;
      const s = this.students.find(x => x.id === studentId);
      if (!s || !s.pet) {
        infoEl.innerHTML = '<span class="placeholder-text">请先选择一个有神兽的学生</span>';
        shopEl.innerHTML = '';
        return;
      }
      this.ensurePetHealthStatus(s);
      const p = s.pet;
      const status = p.isBrokenEgg || p.isDead ? '🥚💥 宠物蛋碎裂' : (p.isSick ? '🤒 生病中' : '✅ 健康');
      infoEl.innerHTML = `<strong>${this.escape(s.name)}</strong> ｜ 当前积分：${s.points || 0} ｜ 状态：${status}`;

      const iconMap = { revive: '💉', cure: '🩹' };
      const descMap = { revive: '复活后回到第2阶段', cure: '治愈生病状态' };
      const projects = this.getHospitalProjects();
      shopEl.innerHTML = projects.map((proj, idx) => {
        const canUse = (proj.type === 'revive' && (p.isBrokenEgg || p.isDead)) || (proj.type === 'cure' && p.isSick);
        const enough = (s.points || 0) >= proj.cost;
        const disabled = (!canUse || !enough) ? 'disabled' : '';
        const buttonText = !canUse ? '当前不可用' : (!enough ? '积分不足' : '购买并使用');
        return `<div class="goods-card" style="border-color:${canUse ? '#ffd7ad' : '#e5e5e5'};opacity:${canUse ? '1' : '0.75'};">
          <div class="goods-icon">${iconMap[proj.type] || '🏥'}</div>
          <div class="goods-name">${this.escape(proj.name)}</div>
          <div class="goods-cost">${proj.cost} 积分</div>
          <div class="goods-stock">${descMap[proj.type] || '医疗道具'}</div>
          <button class="btn btn-primary btn-block" ${disabled} onclick="app.treatPetInHospital('${s.id}',${idx})">${buttonText}</button>
        </div>`;
      }).join('');
    },

    treatPetInHospital(studentId, projectIndex) {
      const s = this.students.find(x => x.id === studentId);
      if (!s || !s.pet) return;
      const projects = this.getHospitalProjects();
      const proj = projects[projectIndex];
      if (!proj) return;
      const cost = Math.max(1, parseInt(proj.cost, 10) || 1);
      if ((s.points || 0) < cost) {
        alert('积分不足，无法治疗');
        return;
      }
      const p = s.pet;
      if (proj.type === 'revive') {
        if (!(p.isBrokenEgg || p.isDead)) { alert('当前无需复活'); return; }
        s.points -= cost;
        p.isDead = false;
        p.isBrokenEgg = false;
        p.isSick = false;
        p.hatching = false;
        p.stage = 2;
        p.stageProgress = 0;
        p.lastFedAt = Date.now();
      } else {
        if (!p.isSick) { alert('当前无需治疗'); return; }
        s.points -= cost;
        p.isSick = false;
        p.lastFedAt = Date.now();
      }
      if (!s.scoreHistory) s.scoreHistory = [];
      s.scoreHistory.unshift({ time: Date.now(), delta: -cost, reason: `神兽医院-${proj.name}` });
      const listEl = document.getElementById('petHospitalList');
      if (listEl) {
        const msg = `${new Date().toLocaleTimeString()} ${s.name} 购买 ${proj.name}，消耗 ${cost} 分`;
        listEl.innerHTML = `<div class="withdraw-item"><span>${this.escape(msg)}</span></div>` + listEl.innerHTML;
      }
      this.saveStudents();
      this.renderStudents();
      this.renderDashboard();
      this.renderPetHospitalShop();
    },

    openCustomQuizPKTool() {
      const modal = document.getElementById('customQuizModal');
      if (!modal) return;
      const cls = this.getCurrentClassData();
      const saved = (cls && Array.isArray(cls.customQuizQuestions)) ? cls.customQuizQuestions : [];
      const textEl = document.getElementById('quizQuestionsText');
      if (textEl && saved.length) {
        textEl.value = saved.map(q => `${q.q}|${q.a}`).join('\n');
      }
      this._quizViewMode = 'setup';
      this.setQuizViewMode('setup');
      document.getElementById('quizBattlePanel').style.display = 'none';
      this.renderQuizTargets();
      modal.style.display = 'flex';
    },

    setQuizViewMode(mode) {
      this._quizViewMode = mode === 'stage' ? 'stage' : 'setup';
      const setupBtn = document.getElementById('quizViewSetupBtn');
      const stageBtn = document.getElementById('quizViewStageBtn');
      const setupPanel = document.getElementById('quizSetupPanel');
      const battlePanel = document.getElementById('quizBattlePanel');
      const importRow = document.getElementById('quizImportRow');
      const textWrap = document.getElementById('quizTextareaWrap');
      const answerRow = document.getElementById('quizAnswerRow');
      const quickRow = document.getElementById('quizQuickJudgeRow');
      if (setupBtn) {
        setupBtn.classList.toggle('btn-primary', this._quizViewMode === 'setup');
        setupBtn.classList.toggle('btn-outline', this._quizViewMode !== 'setup');
      }
      if (stageBtn) {
        stageBtn.classList.toggle('btn-primary', this._quizViewMode === 'stage');
        stageBtn.classList.toggle('btn-outline', this._quizViewMode !== 'stage');
      }
      if (setupPanel) setupPanel.style.display = this._quizViewMode === 'setup' ? 'block' : 'none';
      if (battlePanel) battlePanel.classList.toggle('pk-stage-focus', this._quizViewMode === 'stage');
      if (battlePanel && this._quizViewMode === 'stage') {
        battlePanel.style.display = 'block';
        battlePanel.style.padding = '14px';
        battlePanel.style.borderRadius = '16px';
        battlePanel.style.background = 'radial-gradient(circle at 20% 10%, #fff7ef, #ffe3ba 45%, #ffd29a 100%)';
        battlePanel.style.border = '2px solid #ffb45f';
        battlePanel.style.boxShadow = '0 10px 30px rgba(255,145,58,.35)';
      }
      if (importRow) importRow.style.display = this._quizViewMode === 'setup' ? 'flex' : 'none';
      if (textWrap) textWrap.style.display = this._quizViewMode === 'setup' ? 'block' : 'none';
      if (answerRow) answerRow.style.display = this._quizViewMode === 'setup' ? 'flex' : 'none';
      if (quickRow) quickRow.style.display = this._quizViewMode === 'stage' ? 'flex' : 'none';
      if (this._quizViewMode === 'stage' && !this._quizBattle) {
        alert('请先点击“开始PK”，系统会自动进入舞台视图');
      }
      this.renderQuizBattleStage();
    },

    async importCustomQuizFile() {
      const input = document.getElementById('quizImportFile');
      const textEl = document.getElementById('quizQuestionsText');
      if (!input || !input.files || !input.files[0] || !textEl) {
        alert('请先选择文件');
        return;
      }
      const file = input.files[0];
      const name = (file.name || '').toLowerCase();
      try {
        let text = '';
        if (name.endsWith('.txt') || name.endsWith('.csv')) {
          text = await file.text();
        } else if (name.endsWith('.docx')) {
          if (!window.mammoth || typeof window.mammoth.extractRawText !== 'function') {
            alert('当前环境未加载Word解析库，请先用复制粘贴方式导入');
            return;
          }
          const arr = await file.arrayBuffer();
          const res = await window.mammoth.extractRawText({ arrayBuffer: arr });
          text = res.value || '';
        } else {
          alert('暂不支持该文件类型，请使用 txt/docx/csv');
          return;
        }
        const normalized = this.normalizeQuizImportText(text);
        if (!normalized.length) {
          alert('未解析到题目，请检查格式');
          return;
        }
        textEl.value = normalized.join('\n');
        alert(`导入成功，共 ${normalized.length} 题`);
      } catch (e) {
        console.error('导入题库失败:', e);
        alert('导入失败，请检查文件内容');
      }
    },

    normalizeQuizImportText(text) {
      return String(text || '')
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean)
        .map(line => {
          if (line.includes('|')) return line;
          if (line.includes('答案：')) {
            const [q, a] = line.split('答案：');
            return `${(q || '').replace(/^\d+[\.、\s]*/, '').trim()}|${(a || '').trim()}`;
          }
          return '';
        })
        .filter(Boolean);
    },

    renderQuizBattleStage() {
      const stage = document.getElementById('quizBattleStage');
      if (!stage) return;
      if (!this._quizBattle) {
        stage.innerHTML = '<div style="font-weight:700;color:#8B1A1A;">⚔️ PK舞台待命中</div><div style="color:#777;font-size:12px;">开始PK后显示双方气氛面板</div>';
        return;
      }
      const b = this._quizBattle;
      const leftName = (b.mode === 'group' ? this.groups.find(g => g.id === b.targetA)?.name : this.students.find(s => s.id === b.targetA)?.name) || 'A方';
      const rightName = (b.mode === 'group' ? this.groups.find(g => g.id === b.targetB)?.name : this.students.find(s => s.id === b.targetB)?.name) || 'B方';
      // 获取神兽图片和信息
      const getPetInfo = (targetId, mode) => {
        if (mode === 'group') {
          // 小组模式：取小组成员中积分最高学生的神兽
          const g = this.groups.find(x => x.id === targetId);
          if (!g) return null;
          const members = (g.memberIds || []).map(id => this.students.find(s => s.id === id)).filter(Boolean);
          const top = members.sort((a, b) => (b.points || 0) - (a.points || 0))[0];
          return top ? this._buildPetCardInfo(top) : null;
        } else {
          const s = this.students.find(x => x.id === targetId);
          return s ? this._buildPetCardInfo(s) : null;
        }
      };
      const leftPet = getPetInfo(b.targetA, b.mode);
      const rightPet = getPetInfo(b.targetB, b.mode);
      const renderPetCard = (name, pet, side) => {
        const sideColor = side === 'A' ? '#ffd09a' : '#a5d8ff';
        const sideBg = side === 'A' ? 'linear-gradient(135deg,#fff7ef,#ffe8cc)' : 'linear-gradient(135deg,#eff8ff,#d0ebff)';
        const sideIcon = side === 'A' ? '⚔️' : '🛡️';
        if (!pet) return `<div style="flex:1;text-align:center;padding:12px;border-radius:14px;background:${sideBg};border:2px solid ${sideColor};"><div style="font-size:26px;">${sideIcon}</div><strong style="display:block;margin-top:4px;font-size:1rem;">${this.escape(name)}</strong><div style="font-size:11px;color:#888;margin-top:4px;">暂无神兽</div></div>`;
        return `<div style="flex:1;text-align:center;padding:10px;border-radius:14px;background:${sideBg};border:2px solid ${sideColor};position:relative;overflow:hidden;">
          ${pet.photoPath ? `<img src="${pet.photoPath}" style="width:72px;height:72px;object-fit:cover;border-radius:12px;border:2px solid ${sideColor};display:block;margin:0 auto 6px;filter:contrast(1.14) saturate(1.12) brightness(1.06) drop-shadow(0 4px 8px rgba(0,0,0,.25));" loading="eager" decoding="async" onerror="this.style.display='none'">` : `<div style="font-size:42px;line-height:1;margin-bottom:4px;">${pet.icon}</div>`}
          <strong style="display:block;font-size:1rem;color:#1e293b;">${this.escape(name)}</strong>
          <div style="font-size:12px;color:#8B1A1A;font-weight:700;margin:2px 0;">${this.escape(pet.typeName)} · Lv.${pet.stage}</div>
          <div style="font-size:11px;color:#64748b;line-height:1.5;margin-top:3px;">${this.escape(pet.intro)}</div>
          <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;">
            <span style="font-size:11px;background:rgba(245,158,11,.15);border-radius:999px;padding:2px 8px;color:#b45309;">🍖 ${pet.points}分</span>
            <span style="font-size:11px;background:rgba(139,92,246,.12);border-radius:999px;padding:2px 8px;color:#6d28d9;">💞 ${pet.affinity}</span>
          </div>
        </div>`;
      };
      stage.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        ${renderPetCard(leftName, leftPet, 'A')}
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px;"><span style="font-size:22px;font-weight:900;color:#8B1A1A;">🗡️</span><span style="font-size:14px;font-weight:900;color:#8B1A1A;">VS</span><span style="font-size:22px;">🛡️</span></div>
        ${renderPetCard(rightName, rightPet, 'B')}
      </div>`;
    },

    _buildPetCardInfo(s) {
      if (!s || !s.pet || !s.pet.typeId) return null;
      const totalStages = this.getTotalStages();
      const stage = s.pet.stage || 0;
      const renderStage = stage >= totalStages ? 5 : Math.max(1, stage);
      const photoPath = this.getStagePhotoPath(s.pet.typeId, renderStage);
      const typeMap = {qinglong:'青龙',baihu:'白虎',zhuque:'朱雀',xuanwu:'玄武',fenghuang:'凤凰',qinlin:'麒麟',qilin:'麒麟',pixiu:'貔貅',yinglong:'应龙',zhulong:'烛龙',taotie:'饕餮',hundun:'混沌',jiuweihu:'九尾狐',jingwei:'精卫',jinwu:'金乌',yutu:'玉兔',xiezhi:'獬豸',baize:'白泽',tiangou:'天狗',bifang:'毕方',shanxiao:'山魈'};
      const typeObj = (window.PET_TYPES || []).find(t => t.id === s.pet.typeId);
      const typeName = (typeObj && typeObj.name) || typeMap[s.pet.typeId] || '神兽';
      const intro = (typeObj && typeObj.desc) || (window.BEAST_DESC && window.BEAST_DESC[s.pet.typeId]) || `${typeName}，与主人共同成长的神兽伙伴。`;
      const icon = (typeObj && typeObj.icon) || '🐾';
      return { photoPath, icon, typeName, stage, intro: intro.slice(0, 38), points: s.points || 0, affinity: s.pet.affinity || 0 };
    },

    renderQuizTargets() {
      const mode = (document.getElementById('quizMode')?.value || 'group');
      const selA = document.getElementById('quizTargetA');
      const selB = document.getElementById('quizTargetB');
      if (!selA || !selB) return;
      const list = mode === 'group'
        ? this.groups.map(g => ({ id: g.id, name: g.name }))
        : this.students.map(s => ({ id: s.id, name: s.name }));
      const options = '<option value="">请选择</option>' + list.map(x => `<option value="${x.id}">${this.escape(x.name)}</option>`).join('');
      selA.innerHTML = options;
      selB.innerHTML = options;
    },

    startCustomQuizPK() {
      const mode = (document.getElementById('quizMode')?.value || 'group');
      const targetA = document.getElementById('quizTargetA')?.value || '';
      const targetB = document.getElementById('quizTargetB')?.value || '';
      const winPoints = Math.max(1, parseInt(document.getElementById('quizWinPoints')?.value, 10) || 2);
      const losePoints = Math.max(0, parseInt(document.getElementById('quizLosePoints')?.value, 10) || 1);
      const lines = (document.getElementById('quizQuestionsText')?.value || '').split('\n').map(x => x.trim()).filter(Boolean);
      const questions = lines.map(line => {
        const parts = line.split('|');
        return { q: (parts[0] || '').trim(), a: (parts[1] || '').trim() };
      }).filter(x => x.q && x.a);
      if (!targetA || !targetB || targetA === targetB) { alert('请选择不同的对战双方'); return; }
      if (!questions.length) { alert('请先设置题目和答案'); return; }
      this._quizBattle = { mode, targetA, targetB, winPoints, losePoints, questions, idx: 0, log: [] };
      const cls = this.getCurrentClassData();
      if (cls) {
        cls.customQuizQuestions = questions;
        this.saveData();
      }
      document.getElementById('quizBattlePanel').style.display = 'block';
      document.getElementById('quizBattleLog').innerHTML = '';
      this.setQuizViewMode('stage');
      if (window.launchFireworks) window.launchFireworks();
      this.speak('答题PK舞台开启');
      this.renderQuizBattleStage();
      this._renderQuizQuestion();
    },

    _renderQuizQuestion() {
      if (!this._quizBattle) return;
      const b = this._quizBattle;
      const q = b.questions[b.idx];
      if (!q) {
        document.getElementById('quizCurrentQuestion').textContent = 'PK结束';
        return;
      }
      document.getElementById('quizCurrentQuestion').textContent = `第 ${b.idx + 1} 题：${q.q}`;
      document.getElementById('quizAnswerA').value = '';
      document.getElementById('quizAnswerB').value = '';
    },

    _normalizeAnswer(v) {
      return String(v || '').trim().toLowerCase().replace(/\s+/g, '');
    },

    quickQuizDelta(side, sign) {
      const b = this._quizBattle;
      if (!b) return;
      const targetId = side === 'A' ? b.targetA : b.targetB;
      const base = side === 'A' ? (b.winPoints || 2) : (b.winPoints || 2);
      const value = sign > 0 ? base : -Math.max(1, b.losePoints || 1);
      this.applyQuizDelta(b.mode, targetId, value, `课堂快速判分-${side}`);
      const who = side === 'A' ? 'A方' : 'B方';
      b.log.unshift(`${new Date().toLocaleTimeString()} ${who}${value > 0 ? '+' : ''}${value}分（快速判分）`);
      document.getElementById('quizBattleLog').innerHTML = b.log.slice(0, 20).map(x => `<div class="withdraw-item"><span>${this.escape(x)}</span></div>`).join('');
      this.saveStudents();
      this.renderGroups();
      this.renderStudents();
      this.renderDashboard();
    },

    quizNextRound() {
      const b = this._quizBattle;
      if (!b) return;
      b.idx += 1;
      if (b.idx >= b.questions.length) {
        document.getElementById('quizCurrentQuestion').textContent = 'PK结束，可关闭弹窗';
        return;
      }
      this._renderQuizQuestion();
    },

    judgeCustomQuizRound() {
      const b = this._quizBattle;
      if (!b) return;
      const q = b.questions[b.idx];
      if (!q) return;
      const ans = this._normalizeAnswer(q.a);
      let aOk = false;
      let bOk = false;
      if (this._quizViewMode === 'stage') {
        const winner = prompt('舞台判定：输入 A / B / T（平局）');
        const v = String(winner || '').trim().toUpperCase();
        aOk = v === 'A';
        bOk = v === 'B';
      } else {
        const a1 = this._normalizeAnswer(document.getElementById('quizAnswerA')?.value || '');
        const a2 = this._normalizeAnswer(document.getElementById('quizAnswerB')?.value || '');
        aOk = a1 && a1 === ans;
        bOk = a2 && a2 === ans;
      }
      const reason = `答题PK-第${b.idx + 1}题`;
      if (aOk && !bOk) {
        this.applyQuizDelta(b.mode, b.targetA, b.winPoints, reason + '胜');
        if (b.losePoints > 0) this.applyQuizDelta(b.mode, b.targetB, -b.losePoints, reason + '负');
      } else if (!aOk && bOk) {
        this.applyQuizDelta(b.mode, b.targetB, b.winPoints, reason + '胜');
        if (b.losePoints > 0) this.applyQuizDelta(b.mode, b.targetA, -b.losePoints, reason + '负');
      }
      b.log.unshift(`${reason}｜正确答案:${q.a}｜A:${aOk ? '✅' : '❌'} B:${bOk ? '✅' : '❌'}`);
      document.getElementById('quizBattleLog').innerHTML = b.log.slice(0, 20).map(x => `<div class="withdraw-item"><span>${this.escape(x)}</span></div>`).join('');
      b.idx += 1;
      if (b.idx >= b.questions.length) {
        document.getElementById('quizCurrentQuestion').textContent = 'PK结束，可关闭弹窗';
        this.saveStudents();
        this.renderGroups();
        this.renderStudents();
        this.renderDashboard();
        return;
      }
      this._renderQuizQuestion();
    },

    applyQuizDelta(mode, targetId, delta, reason) {
      if (!delta) return;
      if (mode === 'group') {
        const g = this.groups.find(x => x.id === targetId);
        if (!g) return;
        g.points = (g.points || 0) + delta;
        this.groupPointHistory.push({ id: 'point_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), groupId: g.id, groupName: g.name, delta, reason, time: new Date().toISOString() });
        setStorage(STORAGE_KEYS.groups, this.groups);
        setStorage(STORAGE_KEYS.groupPointHistory, this.groupPointHistory);
      } else {
        const s = this.students.find(x => x.id === targetId);
        if (!s) return;
        s.points = (s.points || 0) + delta;
        if (!s.scoreHistory) s.scoreHistory = [];
        s.scoreHistory.unshift({ time: Date.now(), delta, reason });
        if (delta < 0) this.applyPetDegenerationOnScoreChange(s, delta);
      }
    },

    openAssassinKingGame() {
      const modal = document.getElementById('assassinKingModal');
      if (!modal) return;
      const a = document.getElementById('kingGameGroupA');
      const b = document.getElementById('kingGameGroupB');
      const options = '<option value="">请选择</option>' + this.groups.map(g => `<option value="${g.id}">${this.escape(g.name)}</option>`).join('');
      if (a) a.innerHTML = options;
      if (b) b.innerHTML = options;
      const board = document.getElementById('assassinKingRoleBoard');
      const log = document.getElementById('assassinKingLog');
      if (board) board.innerHTML = '<p class="placeholder-text">先选择参战小组并点击「开始对局」</p>';
      if (log) log.innerHTML = '';
      this._assassinKing = null;
      this._assassinPendingSide = null;
      this._assassinRolesReady = false;
      this._assassinRoleLocked = false;
      this._assassinViewMode = 'setup';
      const lockBtn = document.getElementById('assassinRoleLockBtn');
      if (lockBtn) lockBtn.textContent = '🔓 角色可编辑';
      const setupBtn = document.getElementById('assassinViewSetupBtn');
      const stageBtn = document.getElementById('assassinViewStageBtn');
      if (setupBtn) setupBtn.classList.add('btn-primary');
      if (setupBtn) setupBtn.classList.remove('btn-outline');
      if (stageBtn) stageBtn.classList.add('btn-outline');
      if (stageBtn) stageBtn.classList.remove('btn-primary');
      modal.style.display = 'flex';
    },

    initAssassinKingBattle() {
      const groupAId = document.getElementById('kingGameGroupA')?.value;
      const groupBId = document.getElementById('kingGameGroupB')?.value;
      const needAnswers = Math.max(1, parseInt(document.getElementById('kingGameNeedAnswers')?.value, 10) || 3);
      const answerPoints = Math.max(1, parseInt(document.getElementById('kingGameAnswerPoints')?.value, 10) || 2);
      if (!groupAId || !groupBId || groupAId === groupBId) {
        alert('请选择两个不同小组');
        return;
      }

      if (!this._assassinKing || this._assassinKing.A.groupId !== groupAId || this._assassinKing.B.groupId !== groupBId) {
        const groupA = this.groups.find(g => g.id === groupAId);
        const groupB = this.groups.find(g => g.id === groupBId);
        if (!groupA || !groupB) return;
        const teamA = this._buildAssassinTeam(groupA);
        const teamB = this._buildAssassinTeam(groupB);
        if (!teamA || !teamB) {
          alert('参战小组人数至少需要3人');
          return;
        }
        this._assassinKing = {
          needAnswers,
          answerPoints,
          A: { groupId: groupA.id, groupName: groupA.name, answers: 0, roster: teamA },
          B: { groupId: groupB.id, groupName: groupB.name, answers: 0, roster: teamB },
          log: []
        };
        this._assassinPendingSide = null;
        this._assassinRolesReady = false;
        this._assassinViewMode = 'setup';
        this._assassinRoleLocked = false;
        const lockBtn = document.getElementById('assassinRoleLockBtn');
        if (lockBtn) lockBtn.textContent = '🔓 角色可编辑';
        this._normalizeAssassinRoles('A');
        this._normalizeAssassinRoles('B');
        this.renderAssassinKingRoles();
        this._pushAssassinKingLog(`对局已创建：${groupA.name} VS ${groupB.name}，请先随机或指定角色`);
        alert('请先随机打乱角色或手动指定角色，再点击“开始对局”进入PK舞台');
        return;
      }

      if (!this._assassinRolesReady) {
        alert('请先随机打乱角色或手动指定角色');
        return;
      }

      this._assassinKing.needAnswers = needAnswers;
      this._assassinKing.answerPoints = answerPoints;
      this.setAssassinViewMode('stage');
      this._pushAssassinKingLog('⚔️ PK舞台开启');
      if (window.launchFireworks) window.launchFireworks();
      this.speak('刺杀国王对决开始');
    },

    _buildAssassinTeam(group) {
      const members = this.getGroupMembers(group.id) || [];
      if (members.length < 3) return null;
      const names = { king: '国王', prince: '王子', knight: '骑士' };
      const roster = members.map((m, idx) => {
        const role = idx === 0 ? 'king' : (idx === 1 ? 'prince' : 'knight');
        return { studentId: m.studentId, name: m.name, avatar: m.avatar || '👤', role, roleName: names[role], alive: true };
      });
      const king = roster.find(x => x.role === 'king');
      const prince = roster.find(x => x.role === 'prince');
      return { members: roster, kingId: king?.studentId || '', princeId: prince?.studentId || '', knightId: '' };
    },

    toggleAssassinRoleLock() {
      this._assassinRoleLocked = !this._assassinRoleLocked;
      const btn = document.getElementById('assassinRoleLockBtn');
      if (btn) btn.textContent = this._assassinRoleLocked ? '🔒 角色已锁定' : '🔓 角色可编辑';
      this.renderAssassinKingRoles();
    },

    setAssassinViewMode(mode) {
      this._assassinViewMode = mode === 'stage' ? 'stage' : 'setup';
      const setupBtn = document.getElementById('assassinViewSetupBtn');
      const stageBtn = document.getElementById('assassinViewStageBtn');
      const setupPanel = document.getElementById('assassinSetupPanel');
      const board = document.getElementById('assassinKingRoleBoard');
      if (setupBtn) {
        setupBtn.classList.toggle('btn-primary', this._assassinViewMode === 'setup');
        setupBtn.classList.toggle('btn-outline', this._assassinViewMode !== 'setup');
      }
      if (stageBtn) {
        stageBtn.classList.toggle('btn-primary', this._assassinViewMode === 'stage');
        stageBtn.classList.toggle('btn-outline', this._assassinViewMode !== 'stage');
      }
      if (setupPanel) setupPanel.style.display = this._assassinViewMode === 'setup' ? 'block' : 'none';
      if (board) board.classList.toggle('pk-stage-focus', this._assassinViewMode === 'stage');
      if (board && this._assassinViewMode === 'stage') {
        board.style.background = 'radial-gradient(circle at 20% 10%, #fff4ef, #ffd2c6 45%, #ffc2ae 100%)';
        board.style.border = '2px solid #ff8f70';
        board.style.padding = '12px';
        board.style.borderRadius = '14px';
      }
      if (this._assassinViewMode === 'stage' && !this._assassinKing) {
        alert('请先点击“开始对局”，随后会自动进入PK舞台视图');
      }
      this.renderAssassinKingRoles();
    },

    randomizeAssassinRoles(side) {
      if (!this._assassinKing) {
        alert('请先开始对局');
        return;
      }
      const randomTeam = (key) => {
        const t = this._assassinKing[key];
        if (!t || !t.roster || !Array.isArray(t.roster.members)) return;
        const members = t.roster.members.filter(m => m.alive);
        if (members.length < 3) {
          this._pushAssassinKingLog(`${t.groupName} 存活人数不足，无法随机角色`);
          return;
        }
        members.forEach(m => { m.role = 'knight'; });
        const shuffled = [...members].sort(() => Math.random() - 0.5);
        shuffled[0].role = 'king';
        shuffled[1].role = 'prince';
        this._normalizeAssassinRoles(key);
      };
      if (side === 'all') {
        randomTeam('A');
        randomTeam('B');
        this._pushAssassinKingLog('已为双方随机分配角色');
      } else {
        randomTeam(side);
        const t = this._assassinKing[side];
        if (t) this._pushAssassinKingLog(`${t.groupName} 已随机分配角色`);
      }
      this._assassinRolesReady = true;
      this.renderAssassinKingRoles();
    },

    setAssassinRole(side, studentId, role) {
      if (this._assassinRoleLocked) return;
      if (!this._assassinKing || !this._assassinKing[side]) return;
      const team = this._assassinKing[side].roster;
      const member = team.members.find(x => x.studentId === studentId);
      if (!member) return;
      member.role = role;
      this._normalizeAssassinRoles(side);
      this._assassinRolesReady = true;
      this.renderAssassinKingRoles();
    },

    _normalizeAssassinRoles(side) {
      if (!this._assassinKing || !this._assassinKing[side]) return;
      const team = this._assassinKing[side].roster;
      const names = { king: '国王', prince: '王子', knight: '骑士' };
      const aliveMembers = team.members.filter(m => m.alive);

      // 国王唯一
      const kings = aliveMembers.filter(m => m.role === 'king');
      if (kings.length === 0 && aliveMembers.length) aliveMembers[0].role = 'king';
      if (kings.length > 1) kings.slice(1).forEach(m => { m.role = 'knight'; });

      // 王子唯一
      const princes = aliveMembers.filter(m => m.role === 'prince');
      if (princes.length === 0) {
        const cand = aliveMembers.find(m => m.role !== 'king');
        if (cand) cand.role = 'prince';
      }
      if (princes.length > 1) princes.slice(1).forEach(m => { m.role = 'knight'; });

      aliveMembers.forEach(m => { m.roleName = names[m.role] || '骑士'; });
      const king = aliveMembers.find(m => m.role === 'king');
      const prince = aliveMembers.find(m => m.role === 'prince');
      const knight = aliveMembers.find(m => m.role === 'knight');
      team.kingId = king ? king.studentId : '';
      team.princeId = prince ? prince.studentId : '';
      team.knightId = knight ? knight.studentId : '';
    },

    renderAssassinKingRoles() {
      const board = document.getElementById('assassinKingRoleBoard');
      if (!board) return;
      if (!this._assassinKing) {
        board.innerHTML = '<p class="placeholder-text">先选择参战小组并点击「开始对局」</p>';
        return;
      }
      const renderTeam = (key) => {
        const t = this._assassinKing[key];
        const cards = t.roster.members.map(m => {
          const deadClass = m.alive ? '' : 'opacity:0.45;filter:grayscale(1);';
          const isStage = this._assassinViewMode === 'stage';
          const roleText = isStage ? '❓ 身份保密' : m.roleName;
          const roleDescMap = {
            king: '国王：核心目标，被刺杀成功会触发继位。',
            prince: '王子：若被刺杀命中会直接暴露身份。',
            knight: '骑士：被刺杀会触发反杀，保护队伍。'
          };
          const roleDesc = m.alive
            ? (isStage ? '舞台模式下身份隐藏，先靠答题累积行动值。' : (roleDescMap[m.role] || '队员：与队友配合完成PK任务。'))
            : '已出局：本回合无法继续行动。';
          const roleSelector = (!isStage && m.alive)
            ? `<select class="login-input" ${this._assassinRoleLocked ? 'disabled' : ''} style="padding:4px 6px;font-size:12px;margin-top:4px;" onchange="app.setAssassinRole('${key}','${m.studentId}',this.value)">
                <option value="king" ${m.role === 'king' ? 'selected' : ''}>国王</option>
                <option value="prince" ${m.role === 'prince' ? 'selected' : ''}>王子</option>
                <option value="knight" ${m.role === 'knight' ? 'selected' : ''}>骑士</option>
              </select>`
            : (m.alive ? '<div style="font-size:12px;color:#888;margin-top:4px;">🗡️ PK中身份隐藏</div>' : `<div style="font-size:12px;color:#999;margin-top:4px;">已出局</div>`);
          return `<div style="padding:8px;border:1px solid #ffd7ad;border-radius:10px;background:#fff;${deadClass}">
            <div style="font-size:22px;">${this.escape(m.avatar || '👤')}</div>
            <div style="font-weight:700;">${this.escape(m.name)}</div>
            <div style="font-size:12px;color:#8B1A1A;">${roleText}</div>
            <div style="font-size:11px;color:#6b7280;line-height:1.45;margin-top:3px;min-height:30px;">${roleDesc}</div>
            ${roleSelector}
          </div>`;
        }).join('');
        const title = this._assassinViewMode === 'stage'
          ? `🗡️ ${this.escape(t.groupName)} ｜ 行动值 ${t.answers}/${this._assassinKing.needAnswers}`
          : `${this.escape(t.groupName)} ｜ 答题进度 ${t.answers}/${this._assassinKing.needAnswers}`;
        return `<div style="flex:1;min-width:260px;background:linear-gradient(135deg,#fffaf0,#f5fbff);padding:10px;border-radius:12px;border:1px solid #ffd3a6;">
          <div style="font-weight:800;color:#8B1A1A;margin-bottom:6px;">${title}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:8px;">${cards}</div>
        </div>`;
      };
      board.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;">${renderTeam('A')}${renderTeam('B')}</div>`;
      this.renderAssassinTargetButtons();
      const logEl = document.getElementById('assassinKingLog');
      if (logEl) logEl.innerHTML = this._assassinKing.log.map(x => `<div class="withdraw-item"><span>${this.escape(x)}</span></div>`).join('');
    },

    renderAssassinTargetButtons() {
      const wrap = document.getElementById('assassinTargetButtons');
      if (!wrap) return;
      if (!this._assassinKing || !this._assassinPendingSide) {
        wrap.innerHTML = '<div class="placeholder-text">点击“发起刺杀”后，这里会出现可点击的刺杀对象按钮</div>';
        return;
      }
      const side = this._assassinPendingSide;
      const def = side === 'A' ? this._assassinKing.B : this._assassinKing.A;
      const aliveTargets = def.roster.members.filter(m => m.alive);
      wrap.innerHTML = `<div style="padding:8px;border:1px dashed #ff9f80;border-radius:10px;background:#fff7f3;">
        <div style="font-weight:700;color:#8B1A1A;margin-bottom:6px;">请选择 ${this.escape(def.groupName)} 的刺杀对象：</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">${aliveTargets.map(m => `<button class="btn btn-small btn-danger" onclick="app.assassinKingSelectTarget('${side}','${m.studentId}')">${this.escape(m.name)}</button>`).join('')}</div>
      </div>`;
    },

    _pushAssassinKingLog(text) {
      if (!this._assassinKing) return;
      this._assassinKing.log.unshift(`${new Date().toLocaleTimeString()} ${text}`);
      this._assassinKing.log = this._assassinKing.log.slice(0, 30);
      this.renderAssassinKingRoles();
    },

    addAssassinKingAnswer(side) {
      if (!this._assassinKing) return;
      const t = this._assassinKing[side];
      if (!t) return;
      t.answers += 1;
      const g = this.groups.find(x => x.id === t.groupId);
      if (g) g.points = (g.points || 0) + this._assassinKing.answerPoints;
      setStorage(STORAGE_KEYS.groups, this.groups);
      this.saveData();
      this.renderGroups();
      this._pushAssassinKingLog(`${t.groupName} 答对 +1（小组+${this._assassinKing.answerPoints}分）`);
    },

    assassinKingAction(side) {
      if (!this._assassinKing) return;
      const atk = this._assassinKing[side];
      if (atk.answers < this._assassinKing.needAnswers) {
        alert(`还未达到刺杀次数，需先答对 ${this._assassinKing.needAnswers} 题`);
        return;
      }
      this._assassinPendingSide = side;
      this._pushAssassinKingLog(`${atk.groupName} 发起刺杀，请点击目标头像按钮`);
      this.renderAssassinTargetButtons();
    },

    assassinKingSelectTarget(side, targetStudentId) {
      if (!this._assassinKing) return;
      const atk = this._assassinKing[side];
      const def = side === 'A' ? this._assassinKing.B : this._assassinKing.A;
      if (!atk || !def) return;
      if (atk.answers < this._assassinKing.needAnswers) {
        alert(`还未达到刺杀次数，需先答对 ${this._assassinKing.needAnswers} 题`);
        return;
      }
      const target = def.roster.members.find(m => m.alive && m.studentId === targetStudentId);
      if (!target) { alert('目标不可用'); return; }
      atk.answers = 0;
      this._assassinPendingSide = null;

      if (target.role === 'knight') {
        const atkAlive = atk.roster.members.filter(m => m.alive);
        const back = atkAlive[Math.floor(Math.random() * atkAlive.length)];
        if (back) back.alive = false;
        this._pushAssassinKingLog(`🛡️ ${atk.groupName} 刺杀了 ${def.groupName} 的骑士 ${target.name}，触发反杀！${back ? back.name : '对方'} 出局`);
        this.renderAssassinKingRoles();
        return;
      }

      if (target.role === 'prince') {
        target.alive = false;
        this._pushAssassinKingLog(`🎯 ${atk.groupName} 刺杀命中！目标是王子：${target.name}（身份已暴露）`);
        this._normalizeAssassinRoles(side === 'A' ? 'B' : 'A');
        this.renderAssassinKingRoles();
        return;
      }

      const success = Math.random() < 0.65;
      if (!success) {
        this._pushAssassinKingLog(`⚠️ ${atk.groupName} 刺杀国王失败，${def.groupName} 国王幸存`);
        this.renderAssassinKingRoles();
        return;
      }

      target.alive = false;
      this._pushAssassinKingLog(`💥 ${atk.groupName} 刺杀国王成功！${def.groupName} 国王 ${target.name} 出局`);
      const prince = def.roster.members.find(m => m.alive && m.role === 'prince');
      if (prince) {
        prince.role = 'king';
        prince.roleName = '国王';
        this._pushAssassinKingLog(`👑 王子 ${prince.name} 继位为新国王`);
      }
      this._normalizeAssassinRoles(side === 'A' ? 'B' : 'A');
      this.renderAssassinKingRoles();
    },

    openTongueTwisterGame() {
      const modal = document.getElementById('tongueTwisterModal');
      if (!modal) return;
      const sel = document.getElementById('tongueStudentSelect');
      if (sel) {
        sel.innerHTML = '<option value="">请选择学生</option>' + this.students.map(s => `<option value="${s.id}">${this.escape(s.name)}（${this.escape(s.id)}）</option>`).join('');
      }
      const log = document.getElementById('tongueLog');
      if (log) log.innerHTML = '';
      this.generateTongueSentence();
      modal.style.display = 'flex';
    },

    generateTongueSentence() {
      const easy = [
        '四是四，十是十，十四是十四，四十是四十。',
        '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮。',
        '红凤凰、粉凤凰、黄凤凰，红粉凤凰花凤凰。',
        '春眠不觉晓处处闻啼鸟，夜来风雨声花落知多少。'
      ];
      const medium = [
        '牛郎恋刘娘，刘娘念牛郎；牛郎年年恋刘娘，刘娘年年念牛郎。',
        '山前有四十四棵涩柿子树，山后有四十四只石狮子。',
        '八百标兵奔北坡，炮兵并排北边跑；标兵怕碰炮兵炮，炮兵怕把标兵碰。',
        '今天下雨天留客天留我不留，请你在不改变文字的情况下读出三种不同断句。'
      ];
      const hell = [
        '如果你现在能够平稳地读完这一句长句而且中间不打结不吞字不漏字，那么请你继续加快速度再读一遍。',
        '请把这句话读成新闻播报节奏：清晨操场上三十名同学整齐站队进行三分钟深呼吸训练随后进行十分钟朗读。',
        '从早读到午写从讨论到展示每一位同学都在不断练习表达的准确度清晰度与节奏感那你就是今天的口条王者。',
        '七巷一个漆匠西巷一个锡匠，七巷漆匠用了西巷锡匠的锡，西巷锡匠拿了七巷漆匠的漆。'
      ];
      const mode = document.getElementById('tongueDifficulty')?.value || 'medium';
      const corpus = mode === 'easy' ? easy : (mode === 'hell' ? hell : medium.concat(hell.slice(0,2)));
      const txt = corpus[Math.floor(Math.random() * corpus.length)];
      this._tongueCurrent = txt;
      const card = document.getElementById('tongueSentenceCard');
      if (card) card.textContent = `【${mode === 'easy' ? '简单' : (mode === 'hell' ? '地狱' : '中等')}】${txt}`;
    },

    applyTongueAward(success) {
      const sid = document.getElementById('tongueStudentSelect')?.value;
      const pts = Math.max(1, parseInt(document.getElementById('tongueAwardPoints')?.value, 10) || 2);
      const log = document.getElementById('tongueLog');
      if (!sid) { alert('请先选择学生'); return; }
      const s = this.students.find(x => x.id === sid);
      if (!s) return;
      if (success) {
        s.points = (s.points || 0) + pts;
        if (!s.scoreHistory) s.scoreHistory = [];
        s.scoreHistory.unshift({ time: Date.now(), delta: pts, reason: '嘴瓢大挑战-读对' });
        this.saveStudents();
        this.renderStudents();
        this.renderDashboard();
      }
      if (log) {
        const msg = `${new Date().toLocaleTimeString()} ${s.name}：${success ? '读对 +'+pts+'分' : '嘴瓢，继续挑战'} ｜ ${this._tongueCurrent || ''}`;
        log.innerHTML = `<div class="withdraw-item"><span>${this.escape(msg)}</span></div>` + log.innerHTML;
      }
      if (success) this.generateTongueSentence();
    },

    // ===== 夸夸墙 =====
    openPraiseWall() {
      const modal = document.getElementById('praiseWallModal');
      if (!modal) return;
      const sel = document.getElementById('pwStudentSelect');
      if (sel) {
        sel.innerHTML = '<option value="">请选择学生</option>' +
          this.students.map(s => `<option value="${this.escape(s.id)}">${this.escape(s.name)}</option>`).join('');
      }
      this._renderPraiseMarquee();
      this._renderPraiseAllList();
      modal.classList.add('show');
    },

    closePraiseWall() {
      const modal = document.getElementById('praiseWallModal');
      if (modal) modal.classList.remove('show');
      if (this._praiseMarqueeTimer) clearInterval(this._praiseMarqueeTimer);
    },

    _getPraiseMessages() {
      const key = 'praiseWall_' + (this.currentClassId || 'default');
      try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
    },

    _savePraiseMessages(msgs) {
      const key = 'praiseWall_' + (this.currentClassId || 'default');
      localStorage.setItem(key, JSON.stringify(msgs.slice(-200)));
    },

    submitPraiseMessage() {
      const sel = document.getElementById('pwStudentSelect');
      const input = document.getElementById('pwMessageInput');
      const name = sel ? (sel.options[sel.selectedIndex]?.text || '') : '';
      const msg = (input ? input.value : '').trim();
      if (!sel || !sel.value) { alert('请先选择学生'); return; }
      if (!msg) { alert('请写一句话'); return; }
      const msgs = this._getPraiseMessages();
      msgs.push({ name, msg, time: Date.now() });
      this._savePraiseMessages(msgs);
      if (input) input.value = '';
      this._renderPraiseMarquee();
      this._renderPraiseAllList();
    },

    clearPraiseWall() {
      if (!confirm('确定清空本班所有夸夸墙留言？')) return;
      this._savePraiseMessages([]);
      this._renderPraiseMarquee();
      this._renderPraiseAllList();
    },

    _renderPraiseMarquee() {
      const wrap = document.getElementById('pwMarquee');
      if (!wrap) return;
      const msgs = this._getPraiseMessages();
      if (!msgs.length) {
        wrap.innerHTML = '<span class="pw-marquee-item">还没有留言，快来第一个写吧！🌟</span>';
        return;
      }
      const icons = ['🌟','💖','🎉','✨','🥳','👏','🌈','💫','🎊','🦄'];
      const items = [...msgs, ...msgs].map((m, i) =>
        `<span class="pw-marquee-item">${icons[i % icons.length]} <strong>${this.escape(m.name)}</strong>：${this.escape(m.msg)}</span>`
      ).join('<span class="pw-marquee-sep">❤️</span>');
      wrap.innerHTML = items;
      wrap.style.animation = 'none';
      wrap.offsetWidth;
      const totalW = wrap.scrollWidth;
      const dur = Math.max(12, totalW / 80);
      wrap.style.animation = `pwScroll ${dur}s linear infinite`;
    },

    _renderPraiseAllList() {
      const el = document.getElementById('pwAllMessages');
      if (!el) return;
      const msgs = this._getPraiseMessages();
      if (!msgs.length) { el.innerHTML = '<div style="color:#94a3b8;font-size:.85rem;padding:8px 0;">暂无留言</div>'; return; }
      el.innerHTML = msgs.slice().reverse().map(m => {
        const t = new Date(m.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return `<div class="pw-msg-item"><span class="pw-msg-name">${this.escape(m.name)}</span><span class="pw-msg-text">${this.escape(m.msg)}</span><span class="pw-msg-time">${t}</span></div>`;
      }).join('');
    },

    openStudentScreen() {
      this.refreshStudentScreenBoard();
      document.body.classList.add('mode-student-screen');
      const modal = document.getElementById('studentScreenModal');
      if (modal) modal.classList.add('show');
    },

    refreshStudentScreenBoard() {
      const el = document.getElementById('studentScreenBoard');
      if (!el) return;
      const top = [...(this.students || [])]
        .sort((a, b) => (b.points || 0) - (a.points || 0))
        .slice(0, 20);
      if (!top.length) {
        el.innerHTML = '<p class="placeholder-text">暂无学生数据</p>';
        return;
      }
      el.innerHTML = top.map((s, i) => {
        const petStage = s.pet ? (s.pet.stage || 0) : 0;
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '⭐'));
        return `<div class="ss-item rank-${i < 3 ? (i + 1) : 4}">
          <div class="ss-rank">${medal}</div>
          <div class="ss-main">
            <div class="ss-name">${this.escape(s.name)}</div>
            <div class="ss-sub">积分 ${s.points || 0} · 神兽 Lv.${petStage}</div>
          </div>
        </div>`;
      }).join('');
    },

    openSeasonPanel() {
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      const cfg = cls && cls.seasonConfig ? cls.seasonConfig : { theme: '青龙冲刺周', desc: '全班累计加分达到300分', target: 300, rewardPoints: 3, groupTarget: 120, groupRewardPoints: 10, badgeName: '赛季勇者章', bgTheme: 'dragon', bgm: 'none' };
      const a = document.getElementById('seasonThemeInput');
      const b = document.getElementById('seasonDescInput');
      const c = document.getElementById('seasonTargetInput');
      const rp = document.getElementById('seasonRewardPointsInput');
      const gt = document.getElementById('seasonGroupTargetInput');
      const gr = document.getElementById('seasonGroupRewardInput');
      const bd = document.getElementById('seasonBadgeInput');
      const bg = document.getElementById('seasonBgThemeInput');
      const bm = document.getElementById('seasonBgmInput');
      if (a) a.value = cfg.theme || '';
      if (b) b.value = cfg.desc || '';
      if (c) c.value = cfg.target || 300;
      if (rp) rp.value = cfg.rewardPoints ?? 3;
      if (gt) gt.value = cfg.groupTarget ?? 120;
      if (gr) gr.value = cfg.groupRewardPoints ?? 10;
      if (bd) bd.value = cfg.badgeName || '赛季勇者章';
      if (bg) bg.value = cfg.bgTheme || 'dragon';
      if (bm) bm.value = cfg.bgm || 'none';
      const modal = document.getElementById('seasonModal');
      if (modal) modal.classList.add('show');
      this.renderSeasonPreview();
    },

    saveSeasonConfig() {
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!cls) return;
      cls.seasonConfig = {
        theme: (document.getElementById('seasonThemeInput')?.value || '青龙冲刺周').trim(),
        desc: (document.getElementById('seasonDescInput')?.value || '').trim(),
        target: Math.max(10, parseInt(document.getElementById('seasonTargetInput')?.value, 10) || 300),
        rewardPoints: Math.max(0, parseInt(document.getElementById('seasonRewardPointsInput')?.value, 10) || 3),
        groupTarget: Math.max(10, parseInt(document.getElementById('seasonGroupTargetInput')?.value, 10) || 120),
        groupRewardPoints: Math.max(0, parseInt(document.getElementById('seasonGroupRewardInput')?.value, 10) || 10),
        badgeName: (document.getElementById('seasonBadgeInput')?.value || '赛季勇者章').trim(),
        bgTheme: (document.getElementById('seasonBgThemeInput')?.value || 'dragon'),
        bgm: (document.getElementById('seasonBgmInput')?.value || 'none')
      };
      setUserData(data);
      this.saveData();
      this.renderSeasonPreview();
      this.applySeasonThemeAndBgm();
      this.announceClassEvent(`赛季更新：${cls.seasonConfig.theme || '新赛季'}`);
      this.showWinBanner('🗺️ 赛季已更新', cls.seasonConfig.theme || '新的挑战开始啦');
    },

    renderSeasonPreview() {
      const el = document.getElementById('seasonPreview');
      if (!el) return;
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!cls) return;
      const cfg = cls.seasonConfig || { theme: '青龙冲刺周', desc: '全班累计加分达到300分', target: 300, rewardPoints: 3, groupTarget: 120, groupRewardPoints: 10 };
      const totalPlus = (this.students || []).reduce((sum, s) => {
        const hist = Array.isArray(s.scoreHistory) ? s.scoreHistory : [];
        return sum + hist.reduce((ss, h) => ss + ((h.delta || 0) > 0 ? (h.delta || 0) : 0), 0);
      }, 0);
      const groupTotal = (this.groups || []).reduce((sum, g) => sum + Math.max(0, g.points || 0), 0);
      const pct = Math.max(0, Math.min(100, Math.round((totalPlus / (cfg.target || 300)) * 100)));
      const gpct = Math.max(0, Math.min(100, Math.round((groupTotal / (cfg.groupTarget || 120)) * 100)));
      const groupTitles = this.getGroupSeasonTitles();
      el.innerHTML = `<div class="season-card">
        <div class="season-theme">${this.escape(cfg.theme || '赛季主题')}</div>
        <div class="season-desc">${this.escape(cfg.desc || '')}</div>
        <div class="season-bar"><div class="season-fill" style="width:${pct}%"></div></div>
        <div class="season-foot">班级进度 ${totalPlus} / ${cfg.target}（${pct}%）｜达标奖励：每位学生 +${cfg.rewardPoints} 分</div>
        <div class="season-bar" style="margin-top:10px;"><div class="season-fill" style="width:${gpct}%;background:linear-gradient(90deg,#0ea5e9,#22d3ee,#2dd4bf)"></div></div>
        <div class="season-foot">小组进度 ${groupTotal} / ${cfg.groupTarget}（${gpct}%）｜达标奖励：每组 +${cfg.groupRewardPoints} 分</div>
        <div class="season-group-title-list">${groupTitles.length ? groupTitles.map(x => `<span class="season-group-title">${this.escape(x.name)}：${this.escape(x.title)}</span>`).join('') : '<span class="season-group-title">暂无小组称号</span>'}</div>
      </div>`;
    },

    applySeasonThemeAndBgm() {
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      const cfg = cls && cls.seasonConfig ? cls.seasonConfig : null;
      const theme = cfg && cfg.bgTheme ? cfg.bgTheme : 'dragon';
      document.body.classList.remove('season-theme-dragon', 'season-theme-flame', 'season-theme-ocean', 'season-theme-forest');
      document.body.classList.add(`season-theme-${theme}`);
      this._playSeasonBgm(cfg && cfg.bgm ? cfg.bgm : 'none');
    },

    _playSeasonBgm(kind = 'none') {
      if (kind === 'none') return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!this._seasonBgmCtx) this._seasonBgmCtx = new AudioCtx();
        const ctx = this._seasonBgmCtx;
        if (ctx.state === 'suspended') ctx.resume();
        if (this._seasonBgmNode) {
          try { this._seasonBgmNode.stop(); } catch (e) {}
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const f = kind === 'march' ? 196 : (kind === 'magic' ? 246 : 110);
        osc.type = kind === 'drum' ? 'square' : 'triangle';
        osc.frequency.value = f;
        gain.gain.value = 0.015;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        this._seasonBgmNode = osc;
        setTimeout(() => {
          try { if (this._seasonBgmNode === osc) osc.stop(); } catch (e) {}
        }, 1600);
      } catch (e) {
        console.warn('赛季BGM播放失败:', e);
      }
    },

    announceClassEvent(text, speakText = '') {
      const bar = document.getElementById('classEventStrip');
      if (bar) {
        bar.textContent = text;
        bar.classList.add('show');
        setTimeout(() => bar.classList.remove('show'), 3600);
      }
      if (speakText || text) this.speak((speakText || text).replace(/[🎉🏆✨⚡]/g, ''));
    },

    openClassModePanel() {
      const modal = document.getElementById('classModeModal');
      if (modal) modal.classList.add('show');
      this.renderClassModeStatus();
    },

    startClassMode() {
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!cls) return;
      cls.classMode = cls.classMode || {};
      cls.classMode.active = true;
      cls.classMode.startedAt = Date.now();
      cls.classMode.startSnapshot = (this.students || []).map(s => ({ id: s.id, points: s.points || 0 }));
      setUserData(data);
      this.saveData();
      this.renderClassModeStatus();
      this.showWinBanner('▶️ 课堂模式已开始', '记录课堂成长中');
    },

    endClassMode() {
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!cls || !cls.classMode || !cls.classMode.active) { this.renderClassModeStatus(); return; }
      cls.classMode.active = false;
      cls.classMode.endedAt = Date.now();
      setUserData(data);
      this.saveData();
      this.renderClassModeStatus();
      this.generateWeeklyReport(true);
      this.showWinBanner('⏹️ 课堂模式已结束', '课堂小结已生成');
    },

    renderClassModeStatus() {
      const el = document.getElementById('classModeStatus');
      if (!el) return;
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!cls || !cls.classMode || !cls.classMode.startedAt) {
        el.innerHTML = '<div class="season-card"><div class="season-theme">当前未开始课堂模式</div></div>';
        return;
      }
      const cm = cls.classMode;
      const now = cm.active ? Date.now() : (cm.endedAt || Date.now());
      const mins = Math.max(1, Math.round((now - cm.startedAt) / 60000));
      const startMap = Object.create(null);
      (cm.startSnapshot || []).forEach(x => { startMap[x.id] = x.points || 0; });
      const plus = (this.students || []).reduce((sum, s) => sum + Math.max(0, (s.points || 0) - (startMap[s.id] || 0)), 0);
      el.innerHTML = `<div class="season-card">
        <div class="season-theme">课堂状态：${cm.active ? '进行中' : '已结束'}</div>
        <div class="season-desc">时长 ${mins} 分钟 · 本节净增长积分 ${plus}</div>
      </div>`;
    },

    openWeeklyReportPanel() {
      const modal = document.getElementById('weeklyReportModal');
      if (modal) modal.classList.add('show');
      this.generateWeeklyReport();
    },

    generateWeeklyReport(fromClassMode = false) {
      const el = document.getElementById('weeklyReportBody');
      if (!el) return;
      const since = Date.now() - 7 * 24 * 3600 * 1000;
      const list = (this.students || []).map(s => {
        const hs = (s.scoreHistory || []).filter(h => (h.time || 0) >= since);
        const delta = hs.reduce((sum, h) => sum + (h.delta || 0), 0);
        const plusCount = hs.filter(h => (h.delta || 0) > 0).length;
        return { s, delta, plusCount };
      });
      const active = [...list].sort((a, b) => b.plusCount - a.plusCount).slice(0, 5);
      const improve = [...list].sort((a, b) => b.delta - a.delta).slice(0, 5);
      const focus = [...list].sort((a, b) => a.delta - b.delta).slice(0, 5);
      const renderList = (arr, icon) => arr.length
        ? arr.map(x => `<div class="report-row">${icon} ${this.escape(x.s.name)} <strong>${x.delta >= 0 ? '+' : ''}${x.delta}</strong></div>`).join('')
        : '<div class="report-row">暂无数据</div>';
      el.innerHTML = `<div class="weekly-report-grid">
        <div><h4>🔥 活跃榜</h4>${renderList(active, '⚡')}</div>
        <div><h4>🚀 进步榜</h4>${renderList(improve, '🌟')}</div>
        <div><h4>💡 关注名单</h4>${renderList(focus, '🧭')}</div>
      </div>`;
      if (!fromClassMode) this.showScoreRain(14);
    },

    openShortcutPanel() {
      const sel = document.getElementById('shortcutStudentSelect');
      if (sel) {
        sel.innerHTML = (this.students || []).map(s => `<option value="${this.escape(s.id)}">${this.escape(s.name)}</option>`).join('');
      }
      const plus = this.getPlusItems();
      const minus = this.getMinusItems();
      const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
      setTxt('shortcutPlus1Btn', `1号加分项 ${plus[0] ? `(+${plus[0].points || 1} ${plus[0].name})` : ''}`);
      setTxt('shortcutPlus2Btn', `2号加分项 ${plus[1] ? `(+${plus[1].points || 1} ${plus[1].name})` : ''}`);
      setTxt('shortcutMinus1Btn', `1号减分项 ${minus[0] ? `(-${Math.abs(minus[0].points || 1)} ${minus[0].name})` : ''}`);
      setTxt('shortcutMinus2Btn', `2号减分项 ${minus[1] ? `(-${Math.abs(minus[1].points || 1)} ${minus[1].name})` : ''}`);
      const modal = document.getElementById('shortcutPanelModal');
      if (modal) modal.classList.add('show');
    },

    applyQuickShortcut(code) {
      const sid = document.getElementById('shortcutStudentSelect')?.value;
      if (!sid) return;
      if (code > 0) {
        this.addScoreToStudent(sid, 'plus', Math.max(0, code - 1));
      } else {
        this.addScoreToStudent(sid, 'minus', Math.max(0, Math.abs(code) - 1));
      }
    },

    ensureKeyboardShortcutsBound() {
      if (this._shortcutBound) return;
      this._shortcutBound = true;
      document.addEventListener('keydown', (e) => {
        const screenModal = document.getElementById('studentScreenModal');
        if (e.key === 'Escape' && screenModal && screenModal.classList.contains('student-screen-pure')) {
          this.exitStudentScreenPureMode();
          return;
        }
        const modal = document.getElementById('shortcutPanelModal');
        if (!modal || !modal.classList.contains('show')) return;
        if (e.key === 'Escape') {
          this.closeModal('shortcutPanelModal');
          return;
        }
        const n = parseInt(e.key, 10);
        if (!Number.isFinite(n) || n < 1 || n > 5) return;
        e.preventDefault();
        this.applyQuickShortcut(e.shiftKey ? -n : n);
      });
    },

    toggleStudentScreenPureMode() {
      const modal = document.getElementById('studentScreenModal');
      if (!modal) return;
      modal.classList.toggle('student-screen-pure');
      if (modal.classList.contains('student-screen-pure')) {
        this.showActionToast('已进入纯净模式，按 Esc 可退出');
      }
    },

    exitStudentScreenPureMode() {
      const modal = document.getElementById('studentScreenModal');
      if (!modal) return;
      modal.classList.remove('student-screen-pure');
    },

    showActionToast(text) {
      const wrap = document.getElementById('effectContainer') || document.body;
      const node = document.createElement('div');
      node.className = 'action-toast';
      node.textContent = text;
      wrap.appendChild(node);
      setTimeout(() => node.remove(), 1300);
    },

    applyComboBonus(studentId, delta) {
      if (!(delta > 0)) return;
      const now = Date.now();
      if (!this._comboState) this._comboState = Object.create(null);
      const key = String(studentId || '');
      const st = this._comboState[key] || { last: 0, count: 0 };
      if (now - st.last <= 15000) st.count += 1;
      else st.count = 1;
      st.last = now;
      this._comboState[key] = st;
      const hit = [2, 5, 10].includes(st.count) ? st.count : 0;
      if (!hit) return;
      const label = hit === 2 ? '双连击' : (hit === 5 ? '五连击' : '十连击');
      this.showWinBanner(`⚡ ${label}`, '课堂状态超燃！');
      this.announceClassEvent(`⚡ 连击触发：${label}`);
      this.showScoreRain(hit === 10 ? 36 : (hit === 5 ? 24 : 14));
    },

    maybeUnlockSeasonReward() {
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!cls) return;
      const cfg = cls.seasonConfig || null;
      if (!cfg || !cfg.target) return;
      const totalPlus = (this.students || []).reduce((sum, s) => {
        const hist = Array.isArray(s.scoreHistory) ? s.scoreHistory : [];
        return sum + hist.reduce((ss, h) => ss + ((h.delta || 0) > 0 ? (h.delta || 0) : 0), 0);
      }, 0);
      const groupTotal = (this.groups || []).reduce((sum, g) => sum + Math.max(0, g.points || 0), 0);

      let changed = false;
      if (!cfg.rewardUnlocked && totalPlus >= cfg.target) {
        cfg.rewardUnlocked = true;
        cfg.rewardUnlockedAt = Date.now();
        const reward = Math.max(0, parseInt(cfg.rewardPoints, 10) || 0);
        if (reward > 0) {
          (this.students || []).forEach(s => {
            s.points = (s.points || 0) + reward;
            if (!s.scoreHistory) s.scoreHistory = [];
            s.scoreHistory.unshift({ time: Date.now(), delta: reward, reason: `赛季达标奖励-${cfg.theme || '赛季'}` });
          });
          this.saveStudents();
        }
        this.showWinBanner('🏆 赛季奖励解锁', `${cfg.theme || '本赛季'}达标，全班奖励 +${reward} 分`);
        this.announceClassEvent(`🏆 赛季达标！全班每人奖励 +${reward} 分`);
        this.showScoreRain(40);
        if (window.launchFireworks) window.launchFireworks();
        changed = true;
      }

      if (!cfg.groupRewardUnlocked && cfg.groupTarget && groupTotal >= cfg.groupTarget) {
        cfg.groupRewardUnlocked = true;
        cfg.groupRewardUnlockedAt = Date.now();
        const gReward = Math.max(0, parseInt(cfg.groupRewardPoints, 10) || 0);
        if (gReward > 0) {
          (this.groups || []).forEach(g => {
            g.points = (g.points || 0) + gReward;
            this.groupPointHistory.push({
              id: 'point_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
              groupId: g.id,
              groupName: g.name,
              delta: gReward,
              reason: `赛季小组达标奖励-${cfg.theme || '赛季'}`,
              time: new Date().toISOString()
            });
          });
          setStorage(STORAGE_KEYS.groups, this.groups);
          setStorage(STORAGE_KEYS.groupPointHistory, this.groupPointHistory);
          this.renderGroups();
        }
        this.showWinBanner('🎯 小组赛季奖励解锁', `全组达标，每组奖励 +${gReward} 分`);
        this.announceClassEvent(`🎯 小组赛季达标！每组奖励 +${gReward} 分`);
        changed = true;
      }

      if (changed) {
        cls.seasonConfig = cfg;
        setUserData(data);
        this.saveData();
        this.renderSeasonPreview();
      }
    },

    getSeasonTitleResult() {
      const now = Date.now();
      const since = now - 7 * 24 * 3600 * 1000;
      const totalPlus = (this.students || []).reduce((sum, s) => {
        const hs = (s.scoreHistory || []).filter(h => (h.time || 0) >= since && (h.delta || 0) > 0);
        return sum + hs.reduce((a, h) => a + (h.delta || 0), 0);
      }, 0);
      const activeCount = (this.students || []).filter(s => (s.scoreHistory || []).some(h => (h.time || 0) >= since)).length;
      const avgPlus = this.students.length ? Math.round(totalPlus / this.students.length) : 0;
      if (totalPlus >= 800 && activeCount >= Math.max(10, Math.floor(this.students.length * 0.85))) return { title: '天穹神话班', desc: '全班爆发，赛季统治级表现', color: '#be123c' };
      if (totalPlus >= 650) return { title: '雷霆王者班', desc: '节奏稳定，强势推进', color: '#7c2d12' };
      if (totalPlus >= 500 && activeCount >= Math.max(10, Math.floor(this.students.length * 0.75))) return { title: '龙焰冠军班', desc: '高能投入，全员火力全开', color: '#dc2626' };
      if (totalPlus >= 380) return { title: '星河冲锋班', desc: '积极上进，士气很高', color: '#7e22ce' };
      if (totalPlus >= 300 && avgPlus >= 8) return { title: '星耀协作班', desc: '稳定进步，协作优秀', color: '#7c3aed' };
      if (totalPlus >= 220) return { title: '赤焰进击班', desc: '目标明确，持续突破', color: '#ea580c' };
      if (totalPlus >= 180) return { title: '晨光成长班', desc: '持续成长，表现积极', color: '#2563eb' };
      return { title: '萌芽奋进班', desc: '厚积薄发，继续加油', color: '#059669' };
    },

    getGroupSeasonTitles() {
      const groups = Array.isArray(this.groups) ? this.groups : [];
      return groups.map(g => {
        const pts = g.points || 0;
        let title = '启航小组';
        if (pts >= 260) title = '神话战队';
        else if (pts >= 180) title = '王者战队';
        else if (pts >= 120) title = '闪耀战队';
        else if (pts >= 80) title = '冲锋战队';
        else if (pts >= 40) title = '成长战队';
        return { id: g.id, name: g.name || '未命名小组', points: pts, title };
      }).sort((a, b) => b.points - a.points);
    },

    openSeasonTitlePanel() {
      const modal = document.getElementById('seasonTitleModal');
      if (modal) modal.classList.add('show');
      this.refreshSeasonTitle();
    },

    refreshSeasonTitle() {
      const el = document.getElementById('seasonTitleBody');
      if (!el) return;
      const result = this.getSeasonTitleResult();
      const groupTitles = this.getGroupSeasonTitles();
      el.innerHTML = `<div class="season-title-card" style="border-color:${result.color};">
        <div class="season-title-main" style="color:${result.color};">${result.title}</div>
        <div class="season-title-sub">${result.desc}</div>
      </div>
      <div class="season-group-title-list" style="margin-top:10px;">
        ${groupTitles.length ? groupTitles.slice(0, 8).map(x => `<span class="season-group-title">${this.escape(x.name)}：${this.escape(x.title)}</span>`).join('') : '<span class="season-group-title">暂无小组</span>'}
      </div>`;
    },

    openBadgeWallPanel() {
      const modal = document.getElementById('badgeWallModal');
      if (modal) modal.classList.add('show');
      this.renderBadgeWall();
    },

    renderBadgeWall() {
      const el = document.getElementById('badgeWallList');
      if (!el) return;
      if (!this.students || !this.students.length) {
        el.innerHTML = '<p class="placeholder-text">暂无学生</p>';
        return;
      }
      const arr = [...this.students].map(s => ({ s, badges: this.getAvailableBadges(s), points: s.points || 0 }))
        .sort((a, b) => (b.badges - a.badges) || (b.points - a.points));
      el.innerHTML = arr.map((x, i) => `<div class="badge-wall-item rank-${i < 3 ? (i + 1) : 4}">
        <div class="bw-head">
          <span class="bw-name">${this.escape(x.s.name)}</span>
          <span class="bw-rank">${i + 1}</span>
        </div>
        <div class="bw-badges">${'🏅'.repeat(Math.min(8, x.badges || 0)) || '—'}</div>
        <div class="bw-foot">可用勋章 ${x.badges} · 积分 ${x.points}</div>
      </div>`).join('');
    },

    openParentReportPanel() {
      const modal = document.getElementById('parentReportModal');
      if (modal) modal.classList.add('show');
      const sel = document.getElementById('parentReportStudentSelect');
      if (sel) {
        sel.innerHTML = '<option value="">全班简报</option>' + (this.students || []).map(s => `<option value="${this.escape(s.id)}">${this.escape(s.name)}</option>`).join('');
      }
      this.renderParentReport();
    },

    _getStudentGrowthSeries(student, days = 7) {
      const arr = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const ds = d.toISOString().slice(0, 10);
        const dayStart = new Date(ds + 'T00:00:00').getTime();
        const dayEnd = dayStart + 24 * 3600 * 1000;
        const hs = (student.scoreHistory || []).filter(h => (h.time || 0) >= dayStart && (h.time || 0) < dayEnd);
        const delta = hs.reduce((sum, h) => sum + (h.delta || 0), 0);
        arr.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, delta });
      }
      return arr;
    },

    _renderGrowthChart(series) {
      if (!series || !series.length) return '<div class="pr-box">暂无成长曲线数据</div>';
      const w = 640, h = 180, p = 24;
      const maxAbs = Math.max(5, ...series.map(x => Math.abs(x.delta || 0)));
      const toY = (v) => {
        const t = (v + maxAbs) / (2 * maxAbs);
        return h - p - t * (h - p * 2);
      };
      const step = (w - p * 2) / Math.max(1, series.length - 1);
      const pts = series.map((x, i) => `${(p + i * step).toFixed(1)},${toY(x.delta || 0).toFixed(1)}`).join(' ');
      const dots = series.map((x, i) => `<circle cx="${(p + i * step).toFixed(1)}" cy="${toY(x.delta || 0).toFixed(1)}" r="3.6" fill="#2563eb"/>`).join('');
      const xlabels = series.map((x, i) => `<text x="${(p + i * step).toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="10" fill="#64748b">${x.label}</text>`).join('');
      const baseline = toY(0).toFixed(1);
      return `<svg viewBox="0 0 ${w} ${h}" class="pr-chart" role="img" aria-label="成长曲线图">
        <line x1="${p}" y1="${baseline}" x2="${w - p}" y2="${baseline}" stroke="#cbd5e1" stroke-dasharray="4 4"/>
        <polyline fill="none" stroke="#2563eb" stroke-width="3" points="${pts}"/>
        ${dots}
        ${xlabels}
      </svg>`;
    },

    renderParentReport() {
      const el = document.getElementById('parentReportContent');
      if (!el) return;
      const selectedId = document.getElementById('parentReportStudentSelect')?.value || '';
      const since = Date.now() - 7 * 24 * 3600 * 1000;
      const title = this.getSeasonTitleResult();

      if (selectedId) {
        const s = (this.students || []).find(x => String(x.id) === String(selectedId));
        if (!s) {
          el.innerHTML = '<div class="pr-box">未找到该学生</div>';
          return;
        }
        const hs = (s.scoreHistory || []).filter(h => (h.time || 0) >= since);
        const delta = hs.reduce((sum, h) => sum + (h.delta || 0), 0);
        const plusCount = hs.filter(h => (h.delta || 0) > 0).length;
        const goalDone = (s.dailyGoal && Array.isArray(s.dailyGoal.done)) ? s.dailyGoal.done.length : 0;
        const growth = this._getStudentGrowthSeries(s, 7);
        el.innerHTML = `<div class="pr-header">
          <h4>萌兽成长营 · 学生家长简报</h4>
          <div>${new Date().toLocaleDateString('zh-CN')} ｜ 学生：${this.escape(s.name)} ｜ 学号：${this.escape(s.id || '')}</div>
        </div>
        <div class="pr-box">本周净积分：<strong>${delta >= 0 ? '+' : ''}${delta}</strong>，积极行为记录：<strong>${plusCount}</strong> 次，今日目标完成：<strong>${goalDone}</strong> 项。</div>
        <div class="pr-box">本周班级称号：<strong style="color:${title.color}">${title.title}</strong>（${title.desc}）。建议与孩子一起复盘“本周最有成就感的一件事”。</div>
        <div class="pr-box">
          <div style="font-weight:700;margin-bottom:6px;">7天成长曲线（每日积分变化）</div>
          ${this._renderGrowthChart(growth)}
        </div>`;
        return;
      }

      const top = [...(this.students || [])]
        .map(s => {
          const hs = (s.scoreHistory || []).filter(h => (h.time || 0) >= since);
          const delta = hs.reduce((sum, h) => sum + (h.delta || 0), 0);
          return { name: s.name, delta, points: s.points || 0 };
        })
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 10);
      el.innerHTML = `<div class="pr-header">
        <h4>萌兽成长营 · 家长简报</h4>
        <div>${new Date().toLocaleDateString('zh-CN')} ｜ 班级：${this.escape(this.currentClassName || '')}</div>
      </div>
      <div class="pr-box">本周班级称号：<strong style="color:${title.color}">${title.title}</strong>（${title.desc}）</div>
      <div class="pr-box">本周进步榜：${top.length ? top.map((x, i) => `${i + 1}.${this.escape(x.name)}(${x.delta >= 0 ? '+' : ''}${x.delta})`).join(' ｜ ') : '暂无数据'}</div>
      <div class="pr-box">班级总人数：${(this.students || []).length}，建议家校协同关注孩子的日常目标达成与同伴合作表现。</div>`;
    },

    printParentReport() {
      const content = document.getElementById('parentReportContent');
      if (!content) return;
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>家长简报</title><style>body{font-family:"Microsoft YaHei",sans-serif;padding:20px;color:#111} .pr-box{border:1px solid #ddd;border-radius:10px;padding:12px;margin:10px 0;} .pr-chart{width:100%;height:auto;} h4{margin:0 0 8px;}</style></head><body>${content.innerHTML}</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 220);
    },

    exportParentReportImage() {
      const target = document.getElementById('parentReportContent');
      if (!target) return;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Microsoft YaHei,sans-serif;background:#fff;padding:18px;color:#111;">${target.innerHTML}</div></foreignObject></svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `家长简报_${new Date().toISOString().slice(0, 10)}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 400);
    },

    exportAllStudentReports() {
      const list = this.students || [];
      if (!list.length) { alert('暂无学生'); return; }
      const selectedEl = document.getElementById('parentReportStudentSelect');
      const oldValue = selectedEl ? selectedEl.value : '';
      const pages = [];
      list.forEach(s => {
        if (selectedEl) selectedEl.value = s.id;
        this.renderParentReport();
        const html = document.getElementById('parentReportContent')?.innerHTML || '';
        pages.push(`<section class="page">${html}</section>`);
      });
      if (selectedEl) selectedEl.value = oldValue;
      this.renderParentReport();
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>全班家长简报</title><style>body{font-family:"Microsoft YaHei",sans-serif;padding:16px;color:#111}.page{page-break-after:always;border:1px solid #ddd;border-radius:12px;padding:14px;margin-bottom:14px}.pr-box{border:1px solid #ddd;border-radius:10px;padding:10px;margin:8px 0}.pr-chart{width:100%;height:auto;} h4{margin:0 0 8px;}</style></head><body>${pages.join('')}</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 280);
    },

    getDailyGoalItems() {
      return [
        { key: 'speak', name: '积极发言1次', reward: 1 },
        { key: 'help', name: '帮助同学1次', reward: 1 },
        { key: 'clean', name: '作业整洁完成', reward: 1 }
      ];
    },

    ensureDailyGoals(student) {
      if (!student) return;
      const today = new Date().toISOString().slice(0, 10);
      if (!student.dailyGoal || student.dailyGoal.date !== today) {
        student.dailyGoal = { date: today, done: [] };
      }
    },

    completeDailyGoal(studentId, key) {
      const s = this.students.find(x => x.id === studentId);
      if (!s) return;
      this.ensureDailyGoals(s);
      if ((s.dailyGoal.done || []).includes(key)) return;
      s.dailyGoal.done.push(key);
      s.points = (s.points || 0) + 1;
      if (!s.scoreHistory) s.scoreHistory = [];
      const goal = this.getDailyGoalItems().find(g => g.key === key);
      s.scoreHistory.unshift({ time: Date.now(), delta: 1, reason: `今日目标-${goal ? goal.name : key}` });
      this.saveStudents();
      this.showScoreEffect(studentId, 1);
      this.showScoreRain(10);
      this.announceClassEvent(`🎯 ${this.escape(s.name)} 完成今日目标：${goal ? goal.name : key}`);
      this.addBroadcastMessage(s.name, 1, `完成今日目标：${goal ? goal.name : key}`);
      this.renderStudents();
      this.renderDashboard();
      this.openStudentModal(studentId);
    },

    renderDailyGoalHtml(s) {
      if (!s) return '';
      this.ensureDailyGoals(s);
      const done = s.dailyGoal && Array.isArray(s.dailyGoal.done) ? s.dailyGoal.done : [];
      const goals = this.getDailyGoalItems();
      return `<div class="daily-goal-box"><h4>🎯 今日目标</h4><div class="daily-goal-list">${goals.map(g => {
        const ok = done.includes(g.key);
        return `<div class="daily-goal-item ${ok ? 'done' : ''}">
          <span>${ok ? '✅' : '⭕'} ${this.escape(g.name)}</span>
          <button class="btn btn-small ${ok ? 'btn-outline' : 'btn-primary'}" ${ok ? 'disabled' : ''} onclick="app.completeDailyGoal('${s.id.replace(/'/g, "\\'")}', '${g.key}')">${ok ? '已完成' : `完成+${g.reward}`}</button>
        </div>`;
      }).join('')}</div></div>`;
    },

    openPassingFlowerGame() {
      const modal = document.getElementById('passingFlowerModal');
      if (!modal) return;
      this._passingFlower = { running: false, timer: null, beep: null, currentId: null };
      const state = document.getElementById('passingFlowerState');
      const current = document.getElementById('passingFlowerCurrent');
      const btn = document.getElementById('passingFlowerToggleBtn');
      const log = document.getElementById('passingFlowerLog');
      const drumBtn = document.getElementById('passingFlowerDrumBtn');
      if (state) state.textContent = '等待开始';
      if (current) current.innerHTML = '<div>点击大鼓开始鼓声，再次点击停鼓后随机互动任务。</div>';
      if (btn) btn.textContent = '开始击鼓';
      if (drumBtn) drumBtn.style.transform = 'scale(1)';
      if (log) log.innerHTML = '';
      modal.style.display = 'flex';
    },

    closePassingFlowerGame() {
      if (this._passingFlower && this._passingFlower.timer) clearInterval(this._passingFlower.timer);
      if (this._passingFlower && this._passingFlower.beep) clearInterval(this._passingFlower.beep);
      this._passingFlower = { running: false, timer: null, beep: null };
      this.closeModal('passingFlowerModal');
    },

    _playDrumHit() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const hit = (freq, gainV, dur, type = 'triangle') => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.55), ctx.currentTime + dur);
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(gainV, ctx.currentTime + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + dur + 0.02);
        };
        hit(95, 0.85, 0.32, 'sine');
        hit(180, 0.35, 0.14, 'triangle');
      } catch (e) {
        console.warn('播放鼓声失败:', e);
      }
    },

    _flashDrumStop() {
      const fx = document.createElement('div');
      fx.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle,#fff8 0%,#ffd98088 45%,transparent 70%);z-index:10004;pointer-events:none;animation:drumFlash .45s ease-out forwards;';
      document.body.appendChild(fx);
      setTimeout(() => fx.remove(), 500);
    },

    _getPassingFlowerTasks() {
      const txt = document.getElementById('passingFlowerTasks')?.value || '';
      const arr = txt.split('\n').map(x => x.trim()).filter(Boolean);
      if (arr.length) return arr;
      return ['表演一个动作', '背一首古诗', '说一个成语并造句', '讲一个小笑话'];
    },

    togglePassingFlower() {
      if (!this.students.length) {
        alert('暂无学生');
        return;
      }
      if (!this._passingFlower) this._passingFlower = { running: false, timer: null, beep: null };
      const state = document.getElementById('passingFlowerState');
      const current = document.getElementById('passingFlowerCurrent');
      const btn = document.getElementById('passingFlowerToggleBtn');
      const log = document.getElementById('passingFlowerLog');
      const drumBtn = document.getElementById('passingFlowerDrumBtn');
      if (!this._passingFlower.running) {
        this._passingFlower.running = true;
        if (btn) btn.textContent = '停鼓抽任务';
        if (state) state.textContent = '咚咚咚…鼓声进行中';
        if (drumBtn) {
          drumBtn.style.transform = 'scale(1.06)';
          drumBtn.style.animation = 'drumShake .36s infinite';
        }

        this._playDrumHit();
        if (this._passingFlower.beep) clearInterval(this._passingFlower.beep);
        this._passingFlower.beep = setInterval(() => this._playDrumHit(), 650);

        this._passingFlower.timer = setInterval(() => {
          const s = this.students[Math.floor(Math.random() * this.students.length)];
          if (current && s) current.innerHTML = `<strong style="font-size:18px;">🌸 ${this.escape(s.name)}</strong><div style="font-size:12px;color:#777;">花正在传递...</div>`;
          this._passingFlower.currentId = s ? s.id : null;
        }, 120);
      } else {
        this._passingFlower.running = false;
        if (this._passingFlower.timer) clearInterval(this._passingFlower.timer);
        if (this._passingFlower.beep) clearInterval(this._passingFlower.beep);
        this._passingFlower.timer = null;
        this._passingFlower.beep = null;
        if (btn) btn.textContent = '再次击鼓';
        if (state) state.textContent = '鼓声已停，执行任务';
        if (drumBtn) {
          drumBtn.style.transform = 'scale(1)';
          drumBtn.style.animation = 'none';
        }
        this._flashDrumStop();

        const s = this.students.find(x => x.id === this._passingFlower.currentId);
        const tasks = this._getPassingFlowerTasks();
        const task = tasks[Math.floor(Math.random() * tasks.length)] || '来一个即兴表演';

        if (current) {
          current.innerHTML = s
            ? `<div style="font-size:18px;font-weight:800;">🎯 ${this.escape(s.name)} 接到花！</div><div style="margin-top:6px;color:#8B1A1A;font-weight:700;">📝 任务：${this.escape(task)}</div>`
            : `<div style="color:#8B1A1A;font-weight:700;">📝 任务：${this.escape(task)}</div>`;
        }
        if (log) {
          const msg = `${new Date().toLocaleTimeString()} ${s ? s.name : '同学'} 抽中任务：${task}`;
          log.innerHTML = `<div class="withdraw-item"><span>${this.escape(msg)}</span></div>` + log.innerHTML;
        }
      }
    },

    applyMonopolyTemplate() {
      const type = document.getElementById('monopolyTemplateSelect')?.value || 'show';
      const map = {
        show: ['表演一个动作', '模仿一个动物', '说一句夸赞同学的话', '全组做一个欢呼口号', '即兴讲笑话', '唱一句歌'],
        sport: ['原地开合跳10次', '深蹲8次', '平板支撑10秒', '高抬腿15次', '左右跨步10次', '体态站姿挑战20秒'],
        coop: ['两人合作说绕口令', '全组接龙成语', '三人合作摆造型', '全组共同说班级目标', '同桌互夸一句', '全组一起拍手节奏']
      };
      const pool = map[type] || map.show;
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!cls) return;
      const n = 32;
      const customCells = [];
      for (let i = 1; i < n - 1; i++) {
        if (Math.random() < 0.55) {
          const label = pool[Math.floor(Math.random() * pool.length)];
          customCells.push({ index: i, label });
        }
      }
      cls.monopolyCustomCells = customCells;
      setUserData(data);
      if (window.Monopoly) {
        window.Monopoly.cells = [];
        window.Monopoly.build();
        window.Monopoly.render();
      }
      alert(`已应用模板：${type}，共填充 ${customCells.length} 个格子`);
    },

    bindNav() {
      document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
        if (btn.dataset.boundNav === '1') return;
        btn.dataset.boundNav = '1';
        btn.addEventListener('click', () => this.showPage(btn.dataset.page));
      });
      
      // 学生卡片点击事件委托（只绑定一次，避免inline onclick失效）
      const studentList = document.getElementById('studentList');
      if (studentList && !studentList.dataset.boundCard) {
        studentList.dataset.boundCard = '1';
        studentList.addEventListener('click', (e) => {
          const card = e.target.closest('.student-card-v2');
          if (!card) return;
          // 如果点击的是喂食区域，不打开弹窗
          if (e.target.closest('.student-points-row.can-feed')) {
            const sid = card.dataset.studentId;
            if (sid) this.quickFeed(sid);
            return;
          }
          // 如果点击的是装扮按钮，不打开弹窗
          if (e.target.closest('.student-card-v2-actions')) return;
          const sid = card.dataset.studentId;
          if (sid) this.openStudentModal(sid);
        });
      }

      // 光荣榜时间周期标签（只绑定一次）
      document.querySelectorAll('.honor-period-tab').forEach(tab => {
        if (tab.dataset.boundHonor === '1') return;
        tab.dataset.boundHonor = '1';
        tab.addEventListener('click', () => {
          document.querySelectorAll('.honor-period-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const period = tab.dataset.period;
          this.renderHonor(period);
        });
      });
    },
    showPage(pageId) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      const page = document.getElementById('page-' + pageId);
      const btn = document.querySelector('.nav-btn[data-page="' + pageId + '"]');
      if (page) page.classList.add('active');
      if (btn) btn.classList.add('active');
      if (pageId === 'dashboard') this.renderDashboard();
      if (pageId === 'students') this.renderStudents();
      if (pageId === 'groups') this.renderGroups();
      if (pageId === 'pets') this.renderPetAdopt();
      if (pageId === 'honor') this.renderHonor();
      if (pageId === 'store') this.renderStore();
      if (pageId === 'settings') { 
      this.renderStudentManage(); 
      this.renderScoreHistory(); 
      this.loadBroadcastSettings(); 
      this.loadScreenLockSettings();
      this.loadBadgeAwardStudents();
      this.renderCallStudentOptions();
      this.updateSyncDigest();
      this.checkSyncConflict();
      this.renderBackupStatus();
      this.renderAccessoriesList();
      this.checkAndShowPhotoStorageConfig();
      this.refreshStorageStatus();
      this.renderBatchSyncButton();
    }
    },

    bindSearch() {
      const search = document.getElementById('studentSearch');
      if (search && !search.dataset.boundSearch) {
        search.dataset.boundSearch = '1';
        search.addEventListener('input', () => this.renderStudents());
      }
      const petSearch = document.getElementById('petStudentSearch');
      if (petSearch && !petSearch.dataset.boundPetSearch) {
        petSearch.dataset.boundPetSearch = '1';
        petSearch.addEventListener('input', () => this.renderPetStudentList());
      }
    },

    bindStoreTabs() {
      document.querySelectorAll('.store-tab').forEach(tab => {
        if (tab.dataset.boundStoreTab === '1') return;
        tab.dataset.boundStoreTab = '1';
        tab.addEventListener('click', () => {
          document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const tabName = tab.dataset.tab;
          document.getElementById('storeGoods').style.display = tabName === 'goods' ? 'grid' : 'none';
          document.getElementById('storeAccessories').style.display = tabName === 'accessories' ? 'grid' : 'none';
          document.getElementById('storeLottery').style.display = tabName === 'lottery' ? 'block' : 'none';
          
          // 当切换到抽奖标签时，渲染学生列表
          if (tabName === 'lottery') {
            this.renderLotteryStudentList();
            this.renderLotteryWheel();
          }
        });
      });
    },

    renderDashboard() {
      try {
        const total = this.students.length;
        const withPet = this.students.filter(s => s.pet).length;
        let badges = 0;
        this.students.forEach(s => { badges += this.getTotalBadgesEarned(s); });
        
        // 添加DOM元素存在性检查
        const statStudentsEl = document.getElementById('statStudents');
        const statPetsEl = document.getElementById('statPets');
        const statBadgesEl = document.getElementById('statBadges');
        
        if (statStudentsEl) statStudentsEl.textContent = total;
        if (statPetsEl) statPetsEl.textContent = withPet;
        if (statBadgesEl) statBadgesEl.textContent = badges;

        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        let todayPlus = 0;
        let petReady = 0;
        this.students.forEach(s => {
          const history = Array.isArray(s.scoreHistory) ? s.scoreHistory : [];
          history.forEach(h => {
            if ((h.time || 0) >= dayStart.getTime() && (h.delta || 0) > 0) todayPlus += (h.delta || 0);
          });
          if (s.pet && !s.pet.isSick && !s.pet.isBrokenEgg && !s.pet.isDead && (s.pet.stage || 0) < this.getTotalStages()) {
            const need = this.getStagePointsByStage(s.pet.stage || 1);
            const left = Math.max(0, need - (s.pet.stageProgress || 0));
            if ((s.points || 0) >= left && left > 0) petReady += 1;
          }
        });
        const topGroup = [...this.groups].sort((a, b) => (b.points || 0) - (a.points || 0))[0];
        const plusEl = document.getElementById('dashTodayPlus');
        const topGroupEl = document.getElementById('dashTopGroup');
        const petReadyEl = document.getElementById('dashPetReady');
        if (plusEl) plusEl.textContent = todayPlus;
        if (topGroupEl) topGroupEl.textContent = topGroup ? `${topGroup.name}（${topGroup.points || 0}）` : '暂无';
        if (petReadyEl) petReadyEl.textContent = petReady;
      } catch (e) {
        console.error('渲染仪表盘失败:', e);
      }
    },

    renderStudents() {
      const keyword = (document.getElementById('studentSearch') && document.getElementById('studentSearch').value || '').trim().toLowerCase();
      let rawStudents = this.students;

      // 自愈：当前班级为空时，自动切换到有学生数据的班级
      const normalizeList = (v) => Array.isArray(v)
        ? v.filter(s => s && typeof s === 'object')
        : (v && typeof v === 'object' ? Object.values(v).filter(s => s && typeof s === 'object') : []);

      let source = normalizeList(rawStudents);

      // 兼容历史数据把 students 存成对象的情况
      if (!Array.isArray(this.students) && source.length) this.students = source;

      let list = source;
      if (keyword) {
        list = list.filter(s => (String(s.name || '')).toLowerCase().includes(keyword) || (String(s.id || '')).toLowerCase().includes(keyword));
      }
      const html = list.map((s, idx) => {
        try {
          this.ensurePetHealthStatus(s);
          return this.studentCardHtml(s, idx);
        } catch (e) {
          console.error('渲染学生卡片失败 id=' + (s && s.id) + ' name=' + (s && s.name) + ':', e.message);
          return '';
        }
      }).join('');
      const el = document.getElementById('studentList');
      console.log('[renderStudents] source=' + source.length + ' list=' + list.length + ' html_len=' + html.length);
      if (el) {
        const nonEmpty = html.replace(/\s/g, '');
        el.innerHTML = nonEmpty ? html : '<p class="placeholder-text">暂无学生，请导入学生名单</p>';
      }
    },

    // 根据等级获取卡片颜色主题
    getCardThemeByLevel(stage) {
      const themes = [
        { bg: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '#bae6fd', primary: '#0ea5e9' }, // 0级 - 浅蓝
        { bg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '#86efac', primary: '#22c55e' }, // 1级 - 浅绿
        { bg: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)', border: '#fde047', primary: '#eab308' }, // 2级 - 浅黄
        { bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', border: '#fdba74', primary: '#f97316' }, // 3级 - 浅橙
        { bg: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', border: '#fca5a5', primary: '#ef4444' }, // 4级 - 浅红
        { bg: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)', border: '#d8b4fe', primary: '#a855f7' }, // 5级 - 浅紫
        { bg: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)', border: '#f0abfc', primary: '#d946ef' }, // 6级 - 粉紫
        { bg: 'linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)', border: '#67e8f9', primary: '#06b6d4' }, // 7级 - 青色
        { bg: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', border: '#94a3b8', primary: '#64748b' }, // 8级 - 银灰
        { bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '#fcd34d', primary: '#f59e0b' }, // 9级 - 金色
      ];
      return themes[Math.min(stage, themes.length - 1)];
    },

    getCardRarity(stage, totalStages) {
      const s = Math.max(0, Number(stage || 0));
      const t = Math.max(1, Number(totalStages || 10));
      const ratio = s / t;
      if (ratio >= 0.9 || s >= t) return { key: 'legendary', label: '传说' };
      if (ratio >= 0.65) return { key: 'epic', label: '史诗' };
      if (ratio >= 0.35) return { key: 'rare', label: '稀有' };
      return { key: 'common', label: '普通' };
    },

    getAwakenPointsThreshold() {
      const currentClass = (this.classes || []).find(c => c && c.id === this.currentClassId);
      return Math.max(1, parseInt(currentClass && currentClass.awakenPointsThreshold, 10) || 100);
    },

    getPetAffinityTier(value) {
      const v = Number(value || 0);
      if (v >= 45) return 3;
      if (v >= 25) return 2;
      if (v >= 10) return 1;
      return 0;
    },

    getPetAffinityTitle(value) {
      const tier = this.getPetAffinityTier(value);
      return ['初识伙伴', '亲密搭档', '灵魂拍档', '守护神契约'][tier] || '初识伙伴';
    },

    getPetAffinityNextGoal(value) {
      const v = Number(value || 0);
      if (v < 10) return 10;
      if (v < 25) return 25;
      if (v < 45) return 45;
      return 45;
    },

    getPetInteractionLines(value) {
      const tier = this.getPetAffinityTier(value);
      if (tier === 3) return ['你就是我的最佳拍档！', '我们一起守护班级荣誉！', '今天也要闪闪发光！'];
      if (tier === 2) return ['你一来我就超开心！', '我们默契越来越好啦～', '继续努力，离满级更近啦！'];
      if (tier === 1) return ['我开始信任你啦！', '再陪我互动几次吧～', '一起冲刺今天的任务！'];
      return ['你好呀，我想和你做朋友！', '轻轻点我会开心哦～', '我们先从每天互动开始吧！'];
    },

    studentCardHtml(s, idx = 0) {
      const totalStages = this.getTotalStages();
      let petHtml = '';
      let badgeCount = this.getTotalBadgesEarned(s);
      
      // 获取当前阶段（确保为数字，避免出现 undefined/10 这种显示）
      const currentStage = s.pet ? (s.pet.stage || 0) : 0;
      const stageNeed = this.getStagePointsByStage(currentStage || 1);
      const theme = this.getCardThemeByLevel(currentStage);
      const isHighLevelStage = !!(s.pet && currentStage >= Math.max(3, Math.ceil(totalStages * 0.7)));
      
      if (s.pet) {
        if (!s.pet.typeId) {
          petHtml = `<div class="sc3-empty"><span>🐾</span><small>待领养</small></div>`;
        } else if (s.pet.isBrokenEgg) {
          petHtml = `<div class="sc3-empty"><span>🥚💥</span><small>宠物蛋碎裂</small></div>`;
        } else {
          const renderStage = (s.pet.stage || 0) >= totalStages ? 5 : (s.pet.stage || 1);
          const photoPath = this.getStagePhotoPath(s.pet.typeId, renderStage);
          petHtml = `<img src="${photoPath}" class="sc3-pet-img${isHighLevelStage ? ' high-level-img' : ''}${(s.pet.stage || 0) >= totalStages ? ' max-level-img' : ''}" loading="${idx < 6 ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${idx < 2 ? 'high' : 'auto'}" data-type-id="${s.pet.typeId}" data-stage="${Math.max(1, Math.min(5, parseInt(renderStage || 1, 10) || 1))}" onerror="app.handleStagePhotoError(this)">`;
        }
      } else {
        petHtml = `<div class="sc3-empty"><span>🐣</span><small>未领养</small></div>`;
      }
      
      // 计算进度百分比和还需积分
      let progressPercent = 0;
      let progressText = '';
      let needPointsText = '';
      if (s.pet) {
        if (s.pet.isBrokenEgg) {
          progressPercent = 0;
          progressText = '宠物蛋已碎裂';
          needPointsText = '请前往神兽医院复活';
        } else if (s.pet.isSick) {
          progressPercent = 0;
          progressText = '神兽生病中';
          needPointsText = '请前往神兽医院治疗';
        } else if (currentStage === 1) {
          progressPercent = Math.min(100, ((s.pet.stageProgress || 0) / stageNeed) * 100);
          progressText = '🥚 宠物蛋';
          const need = Math.max(0, stageNeed - (s.pet.stageProgress || 0));
          needPointsText = `还需 ${need} 积分孵化`;
        } else if (currentStage >= totalStages) {
          progressPercent = 100;
          progressText = '已满级';
          needPointsText = '已完成全部升级！';
        } else {
          progressPercent = Math.min(100, ((s.pet.stageProgress || 0) / stageNeed) * 100);
          progressText = `第${currentStage}/${totalStages}阶段`;
          const need = Math.max(0, stageNeed - (s.pet.stageProgress || 0));
          needPointsText = `还需 ${need} 积分升级`;
        }
      } else {
        needPointsText = '未领养宠物';
      }
      
      // 宠物装扮
      const petAccessories = (s.pet && Array.isArray(s.pet.accessories)) ? s.pet.accessories : [];
      const accessoriesHtml = petAccessories.length > 0 ? 
        `<div class="pet-accessories">${petAccessories.map(acc => `<span class="accessory" title="${acc.name}">${acc.icon}</span>`).join('')}</div>` : 
        '';

      // 学生信息（可选）：身高 / 视力 / 家长电话 / 家庭备注（仅有值时显示）
      const infoParts = [];
      if (s.height) infoParts.push(`身高:${this.escape(String(s.height))}cm`);
      if (s.visionLeft || s.visionRight) infoParts.push(`视力:${this.escape(String(s.visionLeft || '-'))}/${this.escape(String(s.visionRight || '-'))}`);
      if (s.parentPhone) infoParts.push(`家长:${this.escape(String(s.parentPhone))}`);
      if (s.familyNote) infoParts.push(`备注:${this.escape(String(s.familyNote))}`);
      const extraInfoHtml = infoParts.length ? `<div class="student-extra-info" title="${infoParts.join('｜')}">${infoParts.slice(0,2).join(' ｜ ')}${infoParts.length>2?'…':''}</div>` : '';
      
      // 判断是否可以喂食
      const canFeed = s.pet && !s.pet.isSick && !s.pet.isBrokenEgg && !s.pet.isDead && (s.points || 0) >= 1 && (s.pet.stage || 0) < totalStages;
      const _feedId = String(s.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const feedAction = canFeed ? `onclick="event.stopPropagation(); app.quickFeed('${_feedId}')"` : '';
      const feedClass = canFeed ? 'can-feed' : 'cannot-feed';
      const isMaxLevel = s.pet && (s.pet.stage || 0) >= totalStages && s.pet.completed;
      const affinity = s.pet ? Number(s.pet.affinity || 0) : 0;
      const affinityTier = this.getPetAffinityTier(affinity);
      const affinityTitle = this.getPetAffinityTitle(affinity);
      const affinityFace = ['🙂','🥰','🤩','👑'][affinityTier] || '🙂';
      const rarity = this.getCardRarity(currentStage, totalStages);
      const awakenThreshold = this.getAwakenPointsThreshold();
      const isAwakened = (s.points || 0) >= awakenThreshold;
      if (s.pet && s.pet.typeId && idx < 8) this.preloadPetStageImages(s.pet.typeId, s.pet.stage || 1);
      
      // 重新设计：神兽图片全屏占主角，底部信息浮层
      const safeId = String(s.id).replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const petTypeName = s.pet ? (s.pet.isCustom ? (s.pet.customName || '自定义') : (((window.PET_TYPES || []).find(t => t.id === s.pet.typeId) || {}).name || ({qinglong:'青龙',baihu:'白虎',zhuque:'朱雀',xuanwu:'玄武',fenghuang:'凤凰',qinlin:'麒麟',qilin:'麒麟',pixiu:'貔貅',yinglong:'应龙',zhulong:'烛龙',taotie:'饕餮',hundun:'混沌',jiuweihu:'九尾狐',jingwei:'精卫',jinwu:'金乌',yutu:'玉兔',xiezhi:'獬豸',baize:'白泽',tiangou:'天狗',bifang:'毕方',shanxiao:'山魈'})[s.pet.typeId] || '神兽')) : '未领养';
      return `
        <div class="student-card-v3 affinity-tier-${affinityTier} rarity-${rarity.key} ${isAwakened ? 'awakened-card' : ''} ${isHighLevelStage ? 'high-level-card' : ''} ${isMaxLevel ? 'max-level-card' : ''}" data-id="${s.id}" data-student-id="${s.id}" onclick="app.openStudentModal('${safeId}')">
          <div class="sc3-photo">
            ${petHtml}
            <div class="sc3-particles" aria-hidden="true"></div>
            <div class="sc3-top-bar">
              <span class="sc3-level" style="color:${theme.primary};">Lv.${s.pet ? (s.pet.stage || 0) : 0}</span>
              <div class="sc3-badges">
                <span class="rarity-badge rarity-${rarity.key}">${rarity.label}${isAwakened ? '⚡' : ''}</span>
                ${isMaxLevel ? `<span class="sc3-max">MAX</span>` : ''}
                ${badgeCount > 0 ? `<span class="sc3-trophy">🏆${badgeCount}</span>` : ''}
                ${isMaxLevel ? `<span class="sc3-crown">👑</span>` : ''}
          </div>
            </div>
            <div class="sc3-bottom-info">
              <div class="sc3-name-row">
                <span class="sc3-name">${this.escape(s.name)}</span>
                <span class="sc3-pet-name">${this.escape(petTypeName)}</span>
            </div>
              <div class="sc3-progress-bar"><div class="sc3-progress-fill" style="width:${progressPercent}%;background:${theme.primary};"></div></div>
              <div class="sc3-footer">
                <span class="sc3-points ${feedClass}" ${feedAction} title="${canFeed ? '点击喂食' : '积分不足或已满级'}">🍖 ${s.points ?? 0}</span>
                <span class="sc3-stage">${progressText}</span>
                ${s.pet ? `<button class="sc3-btn" onclick="event.stopPropagation();app.interactWithPet('${s.id.replace(/'/g, "\\'")}')">✨</button>` : ''}
            </div>
            </div>
          </div>
        </div>`;
    },

    openStudentModal(studentId) {
      const s = this.students.find(x => x.id === studentId);
      if (!s) return;
      const plusItems = this.getPlusItems();
      const minusItems = this.getMinusItems();
      const stagePoints = this.getStagePointsByStage(s.pet ? (s.pet.stage || 1) : 1);
      const totalStages = this.getTotalStages();
      let petSection = '';
      if (s.pet) {
        const type = window.PET_TYPES && window.PET_TYPES.find(t => t.id === s.pet.typeId);
        const breed = type && type.breeds.find(b => b.id === s.pet.breedId);
        const icon = (breed && breed.icon) || (type && type.icon) || '🐾';
        const intro = (type && type.desc) || (window.BEAST_DESC && window.BEAST_DESC[s.pet.typeId]) || '';
        const photo = s.pet.typeId ? this.getStagePhotoPath(s.pet.typeId, s.pet.stage || 1) : '';
        const progress = s.pet.stageProgress || 0;
        const stage = s.pet.stage || 0;
        const need = this.getStagePointsByStage(stage || 1);
        const canFeed = !s.pet.hatching && stage < totalStages && (s.points || 0) >= 1;
        const foodLabel = this.getPetFood(s);
        petSection = `
          <div class="modal-feed-section">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              ${photo ? `<img src="${photo}" style="width:56px;height:56px;object-fit: cover;border-radius:16px;border:2px solid #f59e0b;" loading="eager" decoding="async" data-type-id="${s.pet.typeId || ''}" data-stage="${Math.max(1, Math.min(5, parseInt(s.pet.stage || 1, 10) || 1))}" onerror="app.handleStagePhotoError(this)"><span style="display:none;font-size:2rem;">${icon}</span>` : `<span style="font-size:2rem;">${icon}</span>`}
              <div>
                <p><strong>宠物进度</strong>：第 ${stage}/${totalStages} 阶段，本阶段 ${progress}/${need} 分</p>
                <p><strong>亲密度</strong>：${s.pet.affinity || 0}（${this.getPetAffinityTitle(s.pet.affinity || 0)}）</p>
                ${intro ? `<p class="text-muted" style="margin-top:4px;">📜 ${this.escape(intro)}</p>` : ''}
            </div>
            </div>
            ${canFeed ? `<button class="btn feed-btn" onclick="app.feedStudentInModal('${s.id}')">${foodLabel} 喂食（消耗1积分）</button>` : '<p class="text-muted">积分不足或已满级</p>'}
            <button class="btn btn-outline" style="margin-top:8px;" onclick="app.interactWithPet('${s.id}')">💬 抚摸互动</button>
          </div>`;
      } else {
        petSection = '<p>该学生尚未领养宠物，请到「领养宠物」页操作。</p>';
      }
      const plusBtns = plusItems.map((item, i) =>
        `<button class="btn btn-primary btn-small" onclick="app.addScoreToStudent('${s.id}','plus',${i})">+${item.points} ${this.escape(item.name)}</button>`
      ).join('');
      const minusBtns = minusItems.map((item, i) =>
        `<button class="btn btn-danger btn-small" onclick="app.addScoreToStudent('${s.id}','minus',${i})">${item.points < 0 ? '' : '-'}${Math.abs(item.points)} ${this.escape(item.name)}</button>`
      ).join('');
      const avatarOptions = AVATAR_OPTIONS.slice(0, 15).map((av, i) =>
        `<button class="btn btn-small" onclick="app.setStudentAvatar('${s.id}','${av}')" style="font-size:1.2rem">${av}</button>`
      ).join('');
      
      // 已养成宠物展示
      const completedPets = (s.completedPets || []).map(cp => {
        if (cp.isCustom) {
          return { icon: '🐾', name: cp.customName || '自定义宠物', isCustom: true, image: cp.customImage };
        }
        const t = window.PET_TYPES.find(x => x.id === cp.typeId);
        const b = t && t.breeds.find(x => x.id === cp.breedId);
        return { icon: (b && b.icon) || (t && t.icon) || '🐾', name: (b && b.name) || (t && t.name) || '' };
      });
      const completedHtml = completedPets.length ? `
        <div class="completed-pets-section">
          <h4>🎉 已养成宠物</h4>
          <div class="completed-pets-grid">
            ${completedPets.map(c => `
              <div class="completed-pet-card">
                ${c.isCustom && c.image ? `<img src="${c.image}" class="completed-pet-img">` : `<span class="completed-pet-icon">${c.icon}</span>`}
                <span class="completed-pet-name">${this.escape(c.name)}</span>
                <span class="completed-pet-badge">🏅 1枚</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '';
      
      const history = (s.scoreHistory || []).slice(0, 10);
      const withdrawBtn = history.length ? `<button class="btn btn-outline btn-small" onclick="app.openWithdrawModal('${s.id}')">撤回记录</button>` : '';
      const dailyGoalHtml = this.renderDailyGoalHtml(s);
      const toNext = s.pet && (s.pet.hatching || (s.pet.stage || 0) < totalStages) ? Math.max(0, this.getStagePointsByStage((s.pet.stage || 1)) - (s.pet.stageProgress || 0)) : null;
      const toNextTip = toNext !== null ? `<p class="modal-to-next">距下一级还需 <strong>${toNext}</strong> 积分</p>` : '';
      document.getElementById('studentModalBody').innerHTML = `
        <div class="student-card-header">
          <div class="student-avatar">${s.avatar || AVATAR_OPTIONS[0]}</div>
          <div class="student-info">
            <div class="student-name">${this.escape(s.name)}</div>
            <div class="student-id">${this.escape(s.id)}</div>
            <div class="student-stat">积分：<strong>${s.points ?? 0}</strong></div>
          </div>
        </div>
        ${(plusItems.length || minusItems.length) ? `
        <div class="modal-score-section">
            ${plusItems.length ? `<p><strong>加分</strong></p><div class="score-btns">${plusBtns}</div>` : ''}
            ${minusItems.length ? `<p><strong>扣分</strong></p><div class="score-btns">${minusBtns}</div>` : ''}
        </div>
        ` : ''}
        ${toNextTip}
        ${dailyGoalHtml}
        ${petSection}
        ${completedHtml}
        <p><strong>设置头像</strong></p>
        <div class="score-btns">${avatarOptions}</div>
        ${withdrawBtn ? '<p><strong>撤回</strong></p><div class="score-btns">' + withdrawBtn + '</div>' : ''}
        <p><strong>学生管理</strong></p>
        <div class="score-btns"><button class="btn btn-danger btn-small" onclick="app.deleteStudent('${s.id}')">🗑️ 删除学生</button></div>
      `;
      document.getElementById('studentModal').classList.add('show');
    },
    closeStudentModal() { document.getElementById('studentModal').classList.remove('show'); },

    deleteStudent(studentId) {
      if (!confirm('确定要删除该学生吗？此操作不可恢复！')) return;
      const index = this.students.findIndex(x => x.id === studentId);
      if (index === -1) return;
      this.students.splice(index, 1);
      this.saveStudents();
      this.renderStudents();
      this.renderHonor();
      this.renderDashboard();
      alert('学生已删除');
    },

    openWithdrawModal(studentId) {
      const s = this.students.find(x => x.id === studentId);
      if (!s || !(s.scoreHistory && s.scoreHistory.length)) return;
      this._withdrawStudentId = studentId;
      const list = (s.scoreHistory || []).slice(0, 10);
      const html = list.map((rec, i) => {
        const sign = rec.delta >= 0 ? '+' : '';
        return `<div class="withdraw-item">
          <span>${rec.reason || '记录'} ${sign}${rec.delta} 分</span>
          <button class="btn btn-small btn-danger" onclick="app.doWithdraw(${i})">撤回</button>
        </div>`;
      }).join('');
      document.getElementById('withdrawList').innerHTML = html;
      document.getElementById('withdrawModal').classList.add('show');
    },
    closeWithdrawModal() {
      document.getElementById('withdrawModal').classList.remove('show');
      this._withdrawStudentId = null;
    },
    doWithdraw(historyIndex) {
      const studentId = this._withdrawStudentId;
      const s = this.students.find(x => x.id === studentId);
      if (!s || !s.scoreHistory || !s.scoreHistory[historyIndex]) return;
      const rec = s.scoreHistory[historyIndex];
      s.points = (s.points || 0) - rec.delta;
      s.scoreHistory.splice(historyIndex, 1);
      this.saveStudents();
      this.closeWithdrawModal();
      this.renderStudents();
      this.renderHonor();
      if (studentId) this.openStudentModal(studentId);
    },

    setStudentAvatar(studentId, avatar) {
      const s = this.students.find(x => x.id === studentId);
      if (s) { s.avatar = avatar; this.saveStudents(); this.closeStudentModal(); this.renderStudents(); this.openStudentModal(studentId); }
    },

    ensureUnlocked(actionName = '该操作') {
      if (!this.isScreenLocked) return true;
      alert(`${actionName}已被锁定，请老师先解锁`);
      return false;
    },

    addScoreToStudent(studentId, type, itemIndex) {
      if (!this.ensureUnlocked('加减分')) return;
      const s = this.students.find(x => x.id === studentId);
      if (!s) return;
      const items = type === 'plus' ? this.getPlusItems() : this.getMinusItems();
      const item = items[itemIndex];
      if (!item) return;
      const delta = type === 'plus' ? (item.points || 1) : -(Math.abs(item.points) || 1);
      s.points = (s.points || 0) + delta;
      if (!s.scoreHistory) s.scoreHistory = [];
      s.scoreHistory.unshift({ time: Date.now(), delta, reason: item.name });
      // 负分触发宠物退化逻辑
      if (delta < 0) {
        this.applyPetDegenerationOnScoreChange(s, delta);
      }
      this.saveStudents();
      this.renderStudents();
      this.renderHonor();
      // 显示加分减分特效
      this.showScoreEffect(studentId, delta);
      if (delta > 0) {
        this.showScoreRain(Math.min(26, 8 + delta * 3));
        if (delta >= 3) this.showWinBanner(`🎉 ${this.escape(s.name)} 获得 ${delta} 分`, '课堂表现超赞！');
      }
      this.applyComboBonus(studentId, delta);
      this.maybeUnlockSeasonReward();
      this.showActionToast(`${this.escape(s.name)} ${delta > 0 ? '加分成功' : '扣分成功'} ${delta > 0 ? '+' : ''}${delta}`);
      if (delta > 0 && (delta >= 3 || Math.random() < 0.2)) this.announceClassEvent(`📣 ${this.escape(s.name)} 课堂表现出色，获得 +${delta} 分！`);
      // 添加到广播站
      this.addBroadcastMessage(s.name, delta, item.name);
      if (document.getElementById('studentModal').classList.contains('show')) this.openStudentModal(studentId);
    },

    // 减分导致宠物退化 / 饥饿逻辑
    applyPetDegenerationOnScoreChange(student, delta) {
      try {
        if (!student || !student.pet) return;
        const s = student;
        const pet = s.pet;
        if (pet.completed) return; // 已养成的宠物不再退化
        const stagePoints = this.getStagePointsByStage(pet.stage || 1);
        let stage = pet.stage || 1;
        let progress = pet.stageProgress || 0;
        // 只处理负向变更
        const loss = Math.abs(delta);
        progress -= loss;

        while (progress < 0 && stage > 1) {
          const prevNeed = this.getStagePointsByStage(stage - 1);
          stage -= 1;
          progress += prevNeed;
        }

        // 退回到宠物蛋并耗尽进度 -> 标记碎裂（不再语音播报“饿死了”）
        if (stage === 1 && progress <= 0) {
          progress = 0;
          pet.isDead = true;
          pet.isBrokenEgg = true;
          pet.brokenAt = Date.now();
        }

        pet.stage = stage;
        pet.stageProgress = Math.max(0, progress);
        pet.lastFedAt = pet.lastFedAt || Date.now();
      } catch (e) {
        console.warn('宠物退化逻辑出错:', e);
      }
    },

    // 广播设置存储键
    getBroadcastSettingsKey() {
      return `broadcast_settings_${this.currentClass}`;
    },

    // 荣誉榜设置存储键
    getHonorSettingsKey() {
      return `honor_settings_${this.currentClass}`;
    },

    // 加载广播设置
    loadBroadcastSettings() {
      const settings = getStorage(this.getBroadcastSettingsKey(), {
        content: '',
        showScore: true,
        autoScroll: true
      });
      
      // 应用到UI
      const contentInput = document.getElementById('broadcastContent');
      const showScoreInput = document.getElementById('broadcastShowScore');
      const autoScrollInput = document.getElementById('broadcastAutoScroll');
      const scroll = document.getElementById('broadcastScroll');
      
      if (contentInput) contentInput.value = settings.content || '';
      if (showScoreInput) showScoreInput.checked = settings.showScore !== false;
      if (autoScrollInput) autoScrollInput.checked = settings.autoScroll !== false;
      
      // 应用自动滚动设置
      if (scroll) {
        if (settings.autoScroll !== false) {
          scroll.style.animationPlayState = 'running';
        } else {
          scroll.style.animationPlayState = 'paused';
        }
      }
      
      return settings;
    },

    // 保存广播设置
    saveBroadcastSettings() {
      const contentInput = document.getElementById('broadcastContent');
      const showScoreInput = document.getElementById('broadcastShowScore');
      const autoScrollInput = document.getElementById('broadcastAutoScroll');
      
      const settings = {
        content: contentInput ? contentInput.value : '',
        showScore: showScoreInput ? showScoreInput.checked : true,
        autoScroll: autoScrollInput ? autoScrollInput.checked : true
      };
      
      setStorage(this.getBroadcastSettingsKey(), settings);
      this.saveData();
      
      // 应用设置
      this.applyBroadcastSettings(settings);
      
      alert('广播设置已保存！');
    },

    // 加载荣誉榜设置
    loadHonorSettings() {
      const settings = getStorage(this.getHonorSettingsKey(), {
        progressStarsPeriod: 'week', // day, week, month, semester
        activeStudentsPeriod: 'week' // day, week, month, semester
      });
      
      const progressSelect = document.getElementById('progressStarsPeriod');
      const activeSelect = document.getElementById('activeStudentsPeriod');
      
      if (progressSelect) progressSelect.value = settings.progressStarsPeriod || 'week';
      if (activeSelect) activeSelect.value = settings.activeStudentsPeriod || 'week';
      
      return settings;
    },

    // 保存荣誉榜设置
    saveHonorSettings() {
      const progressSelect = document.getElementById('progressStarsPeriod');
      const activeSelect = document.getElementById('activeStudentsPeriod');
      
      const settings = {
        progressStarsPeriod: progressSelect ? progressSelect.value : 'week',
        activeStudentsPeriod: activeSelect ? activeSelect.value : 'week'
      };
      
      setStorage(this.getHonorSettingsKey(), settings);
      this.saveData();
      this.renderHonor();
      alert('荣誉榜设置已保存');
    },

    // 更新广播内容（切换班级后调用）
    updateBroadcastContent() {
      this.loadBroadcastMessages();
    },

    // 应用广播设置
    applyBroadcastSettings(settings) {
      const scroll = document.getElementById('broadcastScroll');
      if (!scroll) return;
      
      // 应用自动滚动
      if (settings.autoScroll !== false) {
        scroll.style.animationPlayState = 'running';
      } else {
        scroll.style.animationPlayState = 'paused';
      }
      
      // 重新加载广播内容
      this.loadBroadcastMessages();
    },

    loadBroadcastMessages() {
      const scroll = document.getElementById('broadcastScroll');
      if (!scroll) return;
      
      // 加载设置
      const settings = getStorage(this.getBroadcastSettingsKey(), {
        content: '',
        showScore: true,
        autoScroll: true
      });
      
      // 清空并重新构建内容
      scroll.innerHTML = '';
      
      // 添加自定义内容
      if (settings.content) {
        const lines = settings.content.split('\n').filter(line => line.trim());
        lines.forEach(line => {
          const item = document.createElement('span');
          item.className = 'broadcast-item';
          item.textContent = line.trim();
          scroll.appendChild(item);
        });
      } else {
        // 默认欢迎语
        const welcome = document.createElement('span');
        welcome.className = 'broadcast-item';
        welcome.textContent = '欢迎来到萌兽成长营！🎉';
        scroll.appendChild(welcome);
      }
      
      // 添加积分记录（如果开启）- 从当前班级数据加载
      if (settings.showScore !== false) {
        const data = getUserData();
        const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
        const messages = currentClass && currentClass.broadcastMessages ? currentClass.broadcastMessages : [];
        messages.forEach(msg => {
          const isPlus = msg.delta > 0;
          const item = document.createElement('span');
          item.className = `broadcast-item ${isPlus ? 'plus' : 'minus'}`;
          item.innerHTML = `${isPlus ? '🎉' : '📢'} ${msg.studentName} ${isPlus ? '获得' : '扣除'} ${Math.abs(msg.delta)} 分 - ${msg.reason} ${isPlus ? '👍' : '💪'}`;
          scroll.appendChild(item);
        });
      }
    },

    addBroadcastMessage(studentName, delta, reason) {
      // 检查是否开启了显示积分通知
      const settings = getStorage(this.getBroadcastSettingsKey(), {
        showScore: true
      });
      
      if (settings.showScore === false) return;
      
      const scroll = document.getElementById('broadcastScroll');
      if (!scroll) return;
      
      const isPlus = delta > 0;
      const item = document.createElement('span');
      item.className = `broadcast-item ${isPlus ? 'plus' : 'minus'}`;
      item.innerHTML = `${isPlus ? '🎉' : '📢'} ${studentName} ${isPlus ? '获得' : '扣除'} ${Math.abs(delta)} 分 - ${reason} ${isPlus ? '👍' : '💪'}`;
      scroll.appendChild(item);
      
      // 保存广播消息到当前班级数据
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (currentClass) {
        if (!currentClass.broadcastMessages) {
          currentClass.broadcastMessages = [];
        }
        currentClass.broadcastMessages.push({ studentName, delta, reason, time: Date.now() });
        // 限制消息数量，最多保留20条
        if (currentClass.broadcastMessages.length > 20) {
          currentClass.broadcastMessages.shift();
        }
        setUserData(data);
      }
    },

    feedStudentInModal(studentId) {
      this.feedPet(studentId, 1);
      this.showEatEffect();
      this.closeStudentModal();
      this.renderStudents();
      setTimeout(() => this.openStudentModal(studentId), 400);
    },

    quickFeed(studentId) {
      const s = this.students.find(x => x.id === studentId);
      const totalStages = this.getTotalStages();
      if (!s || !s.pet || (s.points || 0) < 1) return;
      if (!s.pet.hatching && (s.pet.stage || 0) >= totalStages) return;
      
      // 记录喂食前的阶段
      const oldStage = s.pet.stage || 0;
      const oldHatching = s.pet.hatching;
      
      // 执行喂食
      this.feedPet(studentId, 1);
      
      // 显示喂食特效
      this.showFeedEffect(studentId);
      
      // 检测是否升级
      const newStage = s.pet.stage || 0;
      const newHatching = s.pet.hatching;
      if (newStage > oldStage || (oldHatching && !newHatching)) {
        // 升级了，显示升级特效
        setTimeout(() => {
          this.showLevelUpEffect(studentId, newStage);
          this.showCardFlashEffect(studentId);
        }, 300);
      }
      
      this.renderStudents();
    },
    dressUpPet(studentId) {
      const s = this.students.find(x => x.id === studentId);
      if (!s || !s.pet) return;
      
      // 打开装扮模态框
      const modal = document.getElementById('dressUpModal');
      if (!modal) {
        // 创建装扮模态框
        const modalHtml = `
          <div id="dressUpModal" class="modal">
            <div class="modal-content">
              <div class="modal-header">
                <h3>🎀 宠物装扮</h3>
                <button class="close-btn" onclick="app.closeModal('dressUpModal')">&times;</button>
              </div>
              <div class="modal-body">
                <div class="dress-up-section">
                  <h4>当前宠物</h4>
                  <div class="current-pet">
                    ${s.pet.stage === 1 ? 
                      `<div class="pet-egg" style="width: 100px; height: 100px; background: linear-gradient(135deg, #fef9c3 0%, #fde047 50%, #facc15 100%); border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3), inset 0 -10px 15px rgba(255, 255, 255, 0.3);"><span style="font-size: 2.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">🥚</span></div>` : 
                      `<img src="photos/${s.pet.typeId}/stage3.jpg" class="pet-img-stage" style="width: 100px; height: 100px; object-fit: cover;" onerror="this.src=''; this.onerror=null;">`
                    }
                    <div class="pet-name">${s.pet.name}</div>
                  </div>
                </div>
                <div class="dress-up-section">
                  <h4>已拥有的装扮</h4>
                  <div class="owned-accessories">
                    ${this.getOwnedAccessories(studentId).map(acc => `
                      <div class="accessory-item">
                        <span class="accessory-icon">${acc.icon}</span>
                        <span class="accessory-name">${acc.name}</span>
                        <button class="btn btn-small" onclick="app.toggleAccessory('${studentId}', '${acc.id}')">
                          ${this.isAccessoryEquipped(s, acc.id) ? '卸下' : '装备'}
                        </button>
                       </div>
                    `).join('') || '<p class="placeholder-text">暂无装扮</p>'}
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-secondary" onclick="app.closeModal('dressUpModal')">关闭</button>
                <button class="btn btn-primary" onclick="app.openStore('accessories')">去商店兑换</button>
              </div>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
      }
      
      document.getElementById('dressUpModal').style.display = 'block';
    },
    getOwnedAccessories(studentId) {
      // 获取学生拥有的装扮
      const s = this.students.find(x => x.id === studentId);
      if (!s) return [];
      return s.accessories || [];
    },
    isAccessoryEquipped(student, accessoryId) {
      // 检查装扮是否已装备
      return student.pet && student.pet.accessories && student.pet.accessories.some(acc => acc.id === accessoryId);
    },
    toggleAccessory(studentId, accessoryId) {
      // 切换装扮装备状态
      const s = this.students.find(x => x.id === studentId);
      if (!s || !s.pet) return;
      
      if (!s.pet.accessories) {
        s.pet.accessories = [];
      }
      
      const accessory = s.accessories.find(acc => acc.id === accessoryId);
      if (!accessory) return;
      
      const equippedIndex = s.pet.accessories.findIndex(acc => acc.id === accessoryId);
      if (equippedIndex > -1) {
        // 卸下装扮
        s.pet.accessories.splice(equippedIndex, 1);
      } else {
        // 装备装扮
        s.pet.accessories.push(accessory);
      }
      
      this.saveStudents();
      this.renderStudents();
      // 刷新装扮模态框
      this.dressUpPet(studentId);
    },
    // 显示喂食特效
    showFeedEffect(studentId) {
      const card = document.querySelector('.student-card-v3[data-student-id="' + studentId + '"], .student-card-v2[data-student-id="' + studentId + '"]');
      if (!card) return;
      
      const pointsRow = card.querySelector('.sc3-points, .student-points-row');
      const rect = (pointsRow || card).getBoundingClientRect();
      const effect = document.createElement('div');
      effect.className = 'feed-effect';
      effect.textContent = '🍖 +1';
      effect.style.left = rect.left + rect.width / 2 - 20 + 'px';
      effect.style.top = rect.top + 'px';
      effect.style.fontSize = '1.5rem';
      effect.style.fontWeight = 'bold';
      effect.style.color = '#f59e0b';
      document.body.appendChild(effect);
      
      // 喂食时卡片闪光
      card.classList.add('sc3-feed-flash');
      setTimeout(() => card.classList.remove('sc3-feed-flash'), 600);
      
      setTimeout(() => effect.remove(), 1200);
    },

    // 显示升级特效
    showLevelUpEffect(studentId, newStage) {
      const card = document.querySelector('.student-card-v3[data-student-id="' + studentId + '"], .student-card-v2[data-student-id="' + studentId + '"]');
      if (!card) return;
      
      const petContainer = card.querySelector('.sc3-photo, .student-card-v2-pet');
      if (!petContainer) return;
      
      const rect = petContainer.getBoundingClientRect();
      const effect = document.createElement('div');
      effect.className = 'level-up-effect';
      effect.innerHTML = `
        <div class="level-up-text">Lv.${newStage} ↑</div>
        <div class="level-up-stars"></div>
      `;
      effect.style.left = rect.left + rect.width / 2 + 'px';
      effect.style.top = rect.top + rect.height / 2 + 'px';
      document.body.appendChild(effect);
      
      // 升级时卡片大闪光
      card.classList.add('sc3-levelup-flash');
      setTimeout(() => card.classList.remove('sc3-levelup-flash'), 1000);
      
      setTimeout(() => effect.remove(), 1500);
    },

    // 显示卡片闪光特效
    showCardFlashEffect(studentId) {
      const card = document.querySelector('.student-card-v3[data-student-id="' + studentId + '"], .student-card-v2[data-student-id="' + studentId + '"]');
      if (!card) return;
      
      const flash = document.createElement('div');
      flash.className = 'card-flash-effect';
      card.appendChild(flash);
      
      setTimeout(() => flash.remove(), 800);
    },

    interactWithPet(studentId) {
      const s = this.students.find(x => x.id === studentId);
      if (!s || !s.pet) return;
      const before = Number(s.pet.affinity || 0);
      s.pet.affinity = before + 1;
      s.pet.lastInteractAt = Date.now();
      const after = s.pet.affinity;
      const prevTier = this.getPetAffinityTier(before);
      const nextTier = this.getPetAffinityTier(after);

      const card = document.querySelector('.student-card-v3[data-student-id="' + studentId + '"], .student-card-v2[data-student-id="' + studentId + '"]');
      if (!card) return;
      const preview = card.querySelector('.sc3-photo, .student-card-v2-pet');
      if (preview) {
        preview.classList.add('pet-interact-animate');
        setTimeout(function () { preview.classList.remove('pet-interact-animate'); }, 700);

        const lines = this.getPetInteractionLines(after);
        const bubble = document.createElement('div');
        bubble.className = 'pet-chat-bubble';
        bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
        preview.appendChild(bubble);
        setTimeout(() => bubble.remove(), 1600);
      }
      const container = document.getElementById('effectContainer');
      if (container) {
        for (let i = 0; i < 4; i++) {
        const el = document.createElement('div');
        el.className = 'interact-effect';
        el.textContent = ['💕', '✨', '🌟', '😊'][Math.floor(Math.random() * 4)];
          el.style.left = (32 + Math.random() * 36) + '%';
          el.style.top = (22 + Math.random() * 30) + '%';
          el.style.animationDelay = (i * 0.08) + 's';
        container.appendChild(el);
          setTimeout(function () { el.remove(); }, 1100);
        }
      }

      if (nextTier > prevTier) {
        const title = this.getPetAffinityTitle(after);
        this.showWinBanner(`💞 亲密度升级：${title}`, '解锁专属互动台词与光环边框！');
        this.showScoreRain(18);
        this.addBroadcastMessage(s.name, 0, `宠物亲密度升阶：${title}`);
        this.speak(`恭喜，亲密度升级为${title}`);
      } else {
        this.speak('做得真棒，继续加油');
      }

      this.saveStudents();
      this.renderStudents();
      if (document.getElementById('studentModal')?.classList.contains('show')) this.openStudentModal(studentId);
    },

    feedPet(studentId, amount) {
      const s = this.students.find(x => x.id === studentId);
      if (!s || !s.pet) return;
      this.ensurePetHealthStatus(s);
      if (s.pet.isDead || s.pet.isBrokenEgg || s.pet.isSick) return;
      const pts = Math.min(amount, s.points || 0);
      if (pts <= 0) return;
      s.points = (s.points || 0) - pts;
      const totalStages = this.getTotalStages();
      
      let stage = s.pet.stage || 1;
      let progress = (s.pet.stageProgress || 0) + pts;

      // 按阶段积分逐级升级
      while (stage < totalStages) {
        const need = this.getStagePointsByStage(stage);
        if (progress < need) break;
        progress -= need;
        stage++;
        this.showUpgradeEffect(s.name, stage);
      }
      
      s.pet.stage = stage;
      s.pet.stageProgress = progress;
      s.pet.lastFedAt = Date.now();
      this.preloadPetStageImages(s.pet.typeId, stage);
      
      // 完成全部升级后获得1枚勋章
      if (stage >= totalStages && !s.pet.completed) {
        s.pet.completed = true;
        s.pet.badgesEarned = 1;
        this.showCompleteEffect(s.id, s.name);
        // 显示全屏烟花特效
        this.showFireworksEffect();
        // 语音播报
        this.speak(`恭喜${s.name}养成宠物！请去领养新宠物`);
      }
      this.saveStudents();
    },

    showUpgradeEffect(studentName, stage) {
      const container = document.getElementById('effectContainer') || document.body;
      const badge = document.createElement('div');
      badge.className = 'upgrade-effect';
      badge.innerHTML = `<div class="upgrade-main">🐉 Lv.${stage}</div><div class="upgrade-sub">${this.escape(studentName || '神兽')} 进化成功！</div>`;
      container.appendChild(badge);

        for (let i = 0; i < 18; i++) {
        const s = document.createElement('div');
        s.className = 'upgrade-spark';
        s.textContent = ['✨','🌟','💖','🎉'][Math.floor(Math.random() * 4)];
        s.style.left = (45 + Math.random() * 10) + '%';
        s.style.top = (42 + Math.random() * 16) + '%';
        s.style.setProperty('--dx', (Math.random() * 220 - 110) + 'px');
        s.style.setProperty('--dy', (Math.random() * -200 - 40) + 'px');
        s.style.animationDelay = (i * 30) + 'ms';
        container.appendChild(s);
        setTimeout(() => s.remove(), 1200);
      }

      this.showWinBanner(`✨ ${studentName || '神兽'} 升到 Lv.${stage}`, '继续喂养，冲向下一阶段！');
      if (window.launchFireworks) window.launchFireworks();
      this.speak(`太棒了，${studentName || '神兽'}升到${stage}级`);
      setTimeout(() => badge.remove(), 1400);
    },
    showCompleteEffect(studentId, studentName) {
      const el = document.createElement('div');
      el.className = 'complete-effect';
      el.innerHTML = '🏅 恭喜获得勋章！';
      document.body.appendChild(el);
      const tipName = this.escape(studentName || '该同学');
      this.showWinBanner('🎊 神兽通关达成！', `${tipName} 已拿到勋章，请前往【领养宠物】领养新的神兽`);
      this.showScoreRain(30);
      setTimeout(() => el.remove(), 2000);
      if (studentId) {
        setTimeout(() => {
          if (confirm(`🎉 ${studentName || '该同学'} 已完成全部升级并获得勋章！\n是否现在前往“领养宠物”页面继续领养新的？`)) {
            this.changePage('pets');
            this.currentStudentId = studentId;
            this.renderPetAdopt();
          }
        }, 260);
      }
    },

    showWinBanner(title, subtitle = '') {
      const old = document.getElementById('winBannerFx');
      if (old) old.remove();
      const banner = document.createElement('div');
      banner.id = 'winBannerFx';
      banner.className = 'win-banner';
      banner.innerHTML = `<div class="win-banner-title">${this.escape(title || '通关成功')}</div>${subtitle ? `<div class="win-banner-sub">${this.escape(subtitle)}</div>` : ''}`;
      document.body.appendChild(banner);
      setTimeout(() => banner.classList.add('show'), 20);
      setTimeout(() => {
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 360);
      }, 1800);
    },

    showScoreRain(count = 20) {
      const wrap = document.getElementById('effectContainer') || document.body;
      const icons = ['✨', '🏅', '⭐', '🎉', '💫'];
      for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'score-rain-item';
        el.textContent = icons[Math.floor(Math.random() * icons.length)];
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDelay = (Math.random() * 0.5) + 's';
        el.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
        wrap.appendChild(el);
        setTimeout(() => el.remove(), 3300);
      }
    },

    // 显示全屏烟花特效
    showFireworksEffect() {
      // 创建烟花容器
      const fireworksContainer = document.createElement('div');
      fireworksContainer.id = 'fireworks-container';
      fireworksContainer.style.position = 'fixed';
      fireworksContainer.style.top = '0';
      fireworksContainer.style.left = '0';
      fireworksContainer.style.width = '100vw';
      fireworksContainer.style.height = '100vh';
      fireworksContainer.style.pointerEvents = 'none';
      fireworksContainer.style.zIndex = '9999';
      fireworksContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
      document.body.appendChild(fireworksContainer);

      // 生成烟花
      const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
      const fireworkCount = 20;

      for (let i = 0; i < fireworkCount; i++) {
        setTimeout(() => {
          const firework = document.createElement('div');
          firework.style.position = 'absolute';
          firework.style.width = '10px';
          firework.style.height = '10px';
          firework.style.borderRadius = '50%';
          firework.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
          firework.style.left = Math.random() * 100 + 'vw';
          firework.style.top = Math.random() * 100 + 'vh';
          firework.style.transform = 'scale(0)';
          firework.style.transition = 'all 1s ease-out';
          fireworksContainer.appendChild(firework);

          // 爆炸效果
          setTimeout(() => {
            firework.style.transform = 'scale(3)';
            firework.style.opacity = '0';
          }, 100);

          // 移除烟花
          setTimeout(() => {
            if (firework.parentNode) {
              firework.parentNode.removeChild(firework);
            }
          }, 1100);
        }, i * 200);
      }

      // 3秒后移除容器
      setTimeout(() => {
        if (fireworksContainer.parentNode) {
          fireworksContainer.parentNode.removeChild(fireworksContainer);
        }
      }, 3000);
    },

    // 语音播报
    speak(text) {
      if (!('speechSynthesis' in window)) return;
        const speech = new SpeechSynthesisUtterance(text);
        speech.lang = 'zh-CN';
        speech.volume = 1;
      speech.rate = 0.95;
      speech.pitch = 1.08;
      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices() || [];
        if (!voices.length) return;
        const female = voices.find(v => /zh|chinese/i.test(v.lang) && /female|xiaoxiao|xiaoyi|huihui|tingting/i.test((v.name || '').toLowerCase()));
        const zhAny = voices.find(v => /zh|chinese/i.test(v.lang));
        speech.voice = female || zhAny || null;
      };
      pickVoice();
      if (!speech.voice) {
        window.speechSynthesis.onvoiceschanged = () => pickVoice();
      }
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(speech);
    },

    showEatEffect() {
      const container = document.getElementById('effectContainer');
      const el = document.createElement('div');
      el.className = 'eat-effect';
      el.textContent = '🍖';
      el.style.left = Math.random() * 50 + 25 + '%';
      el.style.top = Math.random() * 30 + 35 + '%';
      container.appendChild(el);
      setTimeout(() => el.remove(), 600);
    },
    showEatEffectOnPet(studentId) {
      const card = document.querySelector('.student-card[data-student-id="' + studentId + '"]');
      if (!card) {
        this.showEatEffect();
        return;
      }
      const petPreview = card.querySelector('.student-pet-preview');
      if (!petPreview) {
        this.showEatEffect();
        return;
      }
      const foodIcon = this.getPetFood({ pet: this.students.find(x => x.id === studentId)?.pet });
      
      // 宠物弹跳动画
      petPreview.classList.add('pet-bounce-animate');
      setTimeout(() => petPreview.classList.remove('pet-bounce-animate'), 500);
      
      // 创建多个食物特效 - 相对于宠物预览定位
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const effect = document.createElement('div');
          effect.className = 'pet-eat-effect';
          effect.textContent = foodIcon;
          effect.style.left = (30 + Math.random() * 60) + 'px';
          effect.style.top = (20 + Math.random() * 40) + 'px';
          petPreview.appendChild(effect);
          setTimeout(() => effect.remove(), 1000);
        }, i * 100);
      }
      
      // 添加闪光效果
      const flash = document.createElement('div');
      flash.className = 'pet-flash-effect';
      petPreview.appendChild(flash);
      setTimeout(() => flash.remove(), 800);
      
      // 添加爱心特效
      const hearts = ['💕', '❤️', '💖', '✨'];
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          const heart = document.createElement('div');
          heart.className = 'pet-heart-effect';
          heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
          heart.style.left = (20 + Math.random() * 80) + 'px';
          heart.style.top = (10 + Math.random() * 60) + 'px';
          petPreview.appendChild(heart);
          setTimeout(() => heart.remove(), 1500);
        }, i * 150);
      }
    },

    renderPetAdopt() {
      this.schedulePetPreheat('renderPetAdopt', () => this.preheatPetAdoptImages(), 1200);
      this.renderPetStudentList();
      if (this.currentStudentId) {
        const s = this.students.find(x => x.id === this.currentStudentId);
        if (s) this.renderPetAdoptForStudent(s);
        else { this.currentStudentId = null; document.getElementById('petPlaceholder').style.display = 'block'; document.getElementById('petAdoptContent').style.display = 'none'; }
      } else {
        document.getElementById('petPlaceholder').style.display = 'block';
        document.getElementById('petAdoptContent').style.display = 'none';
      }
    },

    renderPetStudentList() {
      const keyword = (document.getElementById('petStudentSearch') && document.getElementById('petStudentSearch').value || '').trim().toLowerCase();
      let list = this.students;
      if (keyword) list = list.filter(s => (s.name || '').toLowerCase().includes(keyword) || (s.id || '').toLowerCase().includes(keyword));
      const html = list.map(s => {
        const selected = s.id === this.currentStudentId ? ' selected' : '';
        return `<div class="clickable-student-item${selected}" data-id="${s.id}">${s.avatar || '👦'} ${this.escape(s.name)}（${this.escape(s.id)}）</div>`;
      }).join('');
      const el = document.getElementById('petStudentList');
      if (el) {
        el.innerHTML = html || '<p class="placeholder-text">无学生</p>';
        el.querySelectorAll('.clickable-student-item').forEach(node => {
          node.addEventListener('click', () => {
            this.currentStudentId = node.dataset.id;
            this.renderPetAdopt();
          });
        });
      }
    },

    renderPetAdoptForStudent(s) {
      document.getElementById('petPlaceholder').style.display = 'none';
      document.getElementById('petAdoptContent').style.display = 'block';
      const totalStages = this.getTotalStages();

      // 只有当宠物信息是“完整”的时候才视为已领养：
      // 1) 自定义宠物：isCustom = true
      // 2) 预置宠物：同时存在 typeId 和 breedId
      const hasStructuredPet = !!(s.pet && (s.pet.isCustom || (s.pet.typeId && s.pet.breedId)));

      if (hasStructuredPet) {
        this.ensurePetHealthStatus(s);
        if (s.pet.isBrokenEgg || s.pet.isDead) {
          document.getElementById('currentStudentPetInfo').innerHTML = `
            <div class="egg-stage">
              <div style="font-size:3rem;margin-bottom:10px;">🥚💥</div>
              <p><strong>${this.escape(s.name)}</strong> 的宠物蛋已碎裂，需要去神兽医院复活。</p>
              <button class="btn btn-primary" onclick="app.openPetHospitalTool()">去神兽医院</button>
            </div>`;
          document.getElementById('petChooseSection').innerHTML = '';
          return;
        }
        if (s.pet.isSick) {
          document.getElementById('currentStudentPetInfo').innerHTML = `
            <div class="egg-stage">
              <div style="font-size:3rem;margin-bottom:10px;">🤒</div>
              <p><strong>${this.escape(s.name)}</strong> 的神兽生病了，暂时无法喂养。</p>
              <button class="btn btn-primary" onclick="app.openPetHospitalTool()">去神兽医院治疗</button>
            </div>`;
          document.getElementById('petChooseSection').innerHTML = '';
          return;
        }
        if (s.pet.hatching) {
          const hatchNeed = this.getStagePointsByStage(1);
          const canFeed = (s.points || 0) >= 1 && !s.pet.isSick && !s.pet.isBrokenEgg && !s.pet.isDead;
          let petDisplay, foodStr;
          if (s.pet.isCustom && s.pet.customImage) {
            petDisplay = `<img src="${s.pet.customImage}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 18px; filter: grayscale(50%); margin-bottom: 16px;">`;
            foodStr = '🍖';
          } else {
            const type = window.PET_TYPES.find(t => t.id === s.pet.typeId);
            const eggPath = this.getStagePhotoPath(s.pet.typeId, 1);
            petDisplay = `
              <img src="${eggPath}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 18px; margin-bottom: 16px;" loading="eager" decoding="async" data-type-id="${s.pet.typeId || ''}" data-stage="1" onerror="app.handleStagePhotoError(this)">
              <span style="display:none;font-size:3.2rem;">🥚</span>
            `;
            foodStr = type && type.food ? type.food : '🍖';
          }
          document.getElementById('currentStudentPetInfo').innerHTML = `
            <div class="egg-stage">
              ${petDisplay}
              <p>等待孵化中… 请用 <span class="feed-food-icon">${foodStr}</span> 喂养宠物完成孵化（本阶段需 ${hatchNeed} 积分）</p>
              <p>当前进度：${s.pet.stageProgress || 0}/${hatchNeed}</p>
              ${canFeed ? `<button class="btn feed-pet-btn btn-primary" onclick="app.feedPet('${s.id}',1); app.showEatEffect(); app.renderPetAdopt();">${foodStr} 喂食（消耗1积分）</button>` : '<p class="text-muted">积分不足无法喂食</p>'}
            </div>`;
          document.getElementById('petChooseSection').innerHTML = '';
        } else {
          const stage = s.pet.stage || 0;
        const isComplete = stage >= totalStages;
          if (isComplete) {
            let petDisplay, petName;
            if (s.pet.isCustom && s.pet.customImage) {
              petDisplay = `<img src="${s.pet.customImage}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 18px; margin-bottom: 8px;">`;
              petName = s.pet.customName;
            } else {
              const type = window.PET_TYPES.find(t => t.id === s.pet.typeId);
              const breed = type && type.breeds.find(b => b.id === s.pet.breedId);
              const photoPath = this.getStagePhotoPath(type.id, stage);
              petDisplay = `
                <img src="${photoPath}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 18px; margin-bottom: 8px;" loading="eager" decoding="async" data-type-id="${type && type.id ? type.id : ''}" data-stage="${Math.max(1, Math.min(5, parseInt(stage, 10) || 1))}" onerror="app.handleStagePhotoError(this)">
                <span class="breed-icon" style="display:none">${(breed && breed.icon) || (type && type.icon) || '🐾'}</span>
              `;
              petName = PHOTO_TYPE_NAME_MAP[type.id] || (breed && breed.name) || (type && type.name);
            }
            document.getElementById('currentStudentPetInfo').innerHTML = `
              <div class="pet-growth-area">
                <p><strong>${this.escape(s.name)}</strong> 的宠物已养成完成 🎉</p>
                <div class="pet-display-box" style="border: ${STAGE_BORDERS[STAGE_BORDERS.length - 1]}">
                  ${petDisplay}
                  <span>${petName}</span>
                  <p>✅ 全部 ${totalStages} 阶段已完成</p>
                </div>
                <button type="button" class="btn btn-primary feed-pet-btn" onclick="app.moveCurrentPetToCompleted('${s.id}'); app.renderPetAdopt();">领养新宠物</button>
              </div>`;
            document.getElementById('petChooseSection').innerHTML = '';
          } else {
            let petDisplay, petDisplayContent = '', petName, foodStr;
            if (s.pet.isCustom && s.pet.customImage) {
              petDisplay = `<img src="${s.pet.customImage}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 18px; margin-bottom: 8px;">`;
              petName = s.pet.customName;
              foodStr = '🍖';
            } else {
              const type = window.PET_TYPES.find(t => t.id === s.pet.typeId);
              const breed = type && type.breeds.find(b => b.id === s.pet.breedId);
              let petDisplayContent;
              if (stage === 1) {
                const eggPath = this.getStagePhotoPath(type.id, 1);
                petDisplayContent = `
                  <img src="${eggPath}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 18px; margin-bottom: 8px;" loading="eager" decoding="async" data-type-id="${type && type.id ? type.id : ''}" data-stage="1" onerror="app.handleStagePhotoError(this)">
                  <span class="breed-icon" style="display:none">🥚</span>
                `;
              } else if (isComplete) {
                // 已完成：成熟期 - 调用本地照片
                const photoPath = this.getStagePhotoPath(type.id, stage);
                petDisplayContent = `
                  <img src="${photoPath}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 18px; margin-bottom: 8px;" loading="eager" decoding="async" data-type-id="${type && type.id ? type.id : ''}" data-stage="${Math.max(1, Math.min(5, parseInt(stage, 10) || 1))}" onerror="app.handleStagePhotoError(this)">
                  <span class="breed-icon" style="display:none">${(breed && breed.icon) || (type && type.icon) || '🐾'}</span>
                `;
              } else {
                // 中间阶段：成长期 - 调用本地照片（安全判空，避免 type 或 breed 未定义时报错）
                if (type && breed && type.id && breed.id) {
                const photoPath = this.getStagePhotoPath(type.id, stage);
                petDisplayContent = `
                  <img src="${photoPath}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 18px; margin-bottom: 8px;" loading="eager" decoding="async" data-type-id="${type && type.id ? type.id : ''}" data-stage="${Math.max(1, Math.min(5, parseInt(stage, 10) || 1))}" onerror="app.handleStagePhotoError(this)">
                  <span class="breed-icon" style="display:none">${(breed && breed.icon) || (type && type.icon) || '🐾'}</span>
                `;
                } else {
                  petDisplayContent = `<span class="pet-img">🐾</span>`;
              }
              }
              petName = PHOTO_TYPE_NAME_MAP[type.id] || (breed && breed.name) || (type && type.name) || '宠物';
              foodStr = type && type.food ? type.food : '🍖';
            }
        const progress = s.pet.stageProgress || 0;
            const need = this.getStagePointsByStage(stage || 1);
            const pct = need ? Math.min(100, (progress / need) * 100) : 0;
            const borderStyle = STAGE_BORDERS[Math.min(stage, STAGE_BORDERS.length - 1)];
            
            // 显示喂食按钮（如果还未完成）
            const canFeed = (s.points || 0) >= 1 && !isComplete && !s.pet.isSick && !s.pet.isBrokenEgg && !s.pet.isDead;
            const feedButton = canFeed ? `<button class="btn feed-pet-btn btn-primary" onclick="app.feedPet('${s.id}',1); app.showEatEffect(); app.renderPetAdopt();">${foodStr} 喂食（消耗1积分）</button>` : '<p class="text-muted">积分不足无法喂食</p>';

        document.getElementById('currentStudentPetInfo').innerHTML = `
          <div class="pet-growth-area">
                <p><strong>${this.escape(s.name)}</strong> 的神兽（已领养，不可更换）</p>
                <div class="pet-display-box" style="border: ${borderStyle}">
                  ${petDisplayContent || petDisplay}
                  <span>${petName}</span>
                  <p>第 ${stage}/${totalStages} 阶段</p>
                <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
                  <p>${progress}/${need} 积分</p>
                  ${!isComplete ? feedButton : '<p class="text-success">已完成全部升级！</p>'}
            </div>
          </div>`;
        document.getElementById('petChooseSection').innerHTML = '';
      }
        }
      } else {
      const completedList = (s.completedPets || []).map(cp => {
          if (cp.isCustom) {
            return { icon: '🐾', name: cp.customName || '自定义宠物' };
          }
          const t = window.PET_TYPES.find(x => x.id === cp.typeId);
          const b = t && t.breeds.find(x => x.id === cp.breedId);
          return { icon: (b && b.icon) || (t && t.icon) || '🐾', name: (b && b.name) || (t && t.name) || '' };
        });
        const completedTip = completedList.length ? `<p class="completed-pets-tip">已养成宠物：${completedList.map(c => c.icon + ' ' + this.escape(c.name)).join('、')}</p>` : '';
        document.getElementById('currentStudentPetInfo').innerHTML = `<p><strong>${this.escape(s.name)}</strong> 选择要领养的新宠物</p>${completedTip}`;
      let optionsHtml = '<div class="pet-adopt-options">';
        if (window.PET_TYPES && window.PET_TYPES.length > 0) {
          const petTypeMap = new Map(window.PET_TYPES.map(t => [t.id, t]));
          PHOTO_TYPE_IDS.forEach(typeId => {
            const type = petTypeMap.get(typeId) || { id: typeId, name: (PHOTO_TYPE_NAME_MAP[typeId] || typeId), icon: '🐾', food: '🍖', breeds: [{ id: typeId, name: (PHOTO_TYPE_NAME_MAP[typeId] || typeId), icon: '🐾' }] };
            const defaultBreed = type.breeds && type.breeds.length ? type.breeds[0] : null;
            const breedId = defaultBreed ? defaultBreed.id : type.id;
            const breedIcon = defaultBreed ? defaultBreed.icon : (type.icon || '🐾');
            const breedName = PHOTO_TYPE_NAME_MAP[type.id] || (defaultBreed ? defaultBreed.name : type.name);
            const photoPath = `photos/${type.id}/stage3.jpg`;
          optionsHtml += `
              <div class="pet-breed-option" data-type="${type.id}" data-breed="${breedId}" data-food="${this.escape(type.food)}">
                <img src="${photoPath}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 8px;" loading="eager" decoding="async" data-type-id="${type && type.id ? type.id : ''}" data-stage="3" onerror="app.handleStagePhotoError(this)">
                <span class="breed-icon" style="display:none">${breedIcon}</span>
                <span class="breed-name">${this.escape(breedName || type.name)}</span>
            </div>`;
        });
      } else {
          optionsHtml += '<p class="placeholder-text">宠物类型数据未加载</p>';
      }
      optionsHtml += '</div>';
      document.getElementById('petChooseSection').innerHTML = optionsHtml;
      document.getElementById('petChooseSection').querySelectorAll('.pet-breed-option').forEach(node => {
        node.addEventListener('click', () => {
            const typeId = node.dataset.type;
            const breedId = node.dataset.breed;
            if (!s) return;
            s.pet = { typeId, breedId, stage: 1, stageProgress: 0, hatching: false, isCustom: false };
          this.saveStudents();
          this.renderPetAdopt();
          this.renderStudents();
        });
      });
      }
    },

    renderHonor(period = 'all') {
      const totalStages = this.getTotalStages();
      const periodTimestamp = this.getPeriodTimestamp(period);
      
      const list = this.students
        .map(s => {
          // 计算该时间段内的积分变化
          let periodPoints = 0;
          let periodBadges = 0;
          
          if (s.scoreHistory && s.scoreHistory.length > 0) {
            periodPoints = s.scoreHistory
              .filter(h => h.time >= periodTimestamp)
              .reduce((sum, h) => sum + h.delta, 0);
          }
          
          if (s.badges && s.badges.length > 0) {
            periodBadges = s.badges
              .filter(b => b.time >= periodTimestamp)
              .length;
          }
          
          return {
            ...s,
            badgeCount: period === 'all' ? this.getTotalBadgesEarned(s) : periodBadges,
            periodPoints: periodPoints,
            totalPoints: s.points || 0,
            available: this.getAvailableBadges(s),
            petStage: s.pet ? (s.pet.stage || 0) : 0
          };
        })
        .sort((a, b) => {
          // 先按徽章数量排序
          const badgeDiff = (b.badgeCount || 0) - (a.badgeCount || 0);
          if (badgeDiff !== 0) return badgeDiff;
          // 徽章相同则按时间段积分排序
          const periodPointsDiff = (b.periodPoints || 0) - (a.periodPoints || 0);
          if (periodPointsDiff !== 0) return periodPointsDiff;
          // 时间段积分相同则按宠物阶段排序
          const stageDiff = (b.petStage || 0) - (a.petStage || 0);
          if (stageDiff !== 0) return stageDiff;
          // 阶段相同则按总积分排序
          return (b.totalPoints || 0) - (a.totalPoints || 0);
        });
      const top3 = list.slice(0, 3);
      const others = list.slice(3);
      
      // 重新排序top3：亚军、冠军、季军
      const orderedTop3 = [];
      if (top3.length >= 2) orderedTop3.push({...top3[1], rank: 2}); // 亚军
      if (top3.length >= 1) orderedTop3.push({...top3[0], rank: 1}); // 冠军
      if (top3.length >= 3) orderedTop3.push({...top3[2], rank: 3}); // 季军
      
      const top3Html = orderedTop3.length ? `
        <div class="honor-top3">
          ${orderedTop3.map((s) => {
            const rank = s.rank;
            const rankText = rank === 1 ? '冠军' : rank === 2 ? '亚军' : '季军';
            const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
            return `
              <div class="honor-top3-card rank-${rank}">
                <div class="top3-rank">${rankIcon} ${rankText}</div>
                <div class="top3-avatar">${s.avatar || '👦'}</div>
                <div class="top3-name">${this.escape(s.name)}</div>
                <div class="top3-badges">${s.badgeCount > 0 ? '🏆'.repeat(Math.min(s.badgeCount, 5)) : ''} ${s.badgeCount}枚</div>
                <div class="top3-stats">${period === 'all' ? s.totalPoints : s.periodPoints}分 | 阶段${s.petStage}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : '';
      
      const othersHtml = others.length ? `
        <div class="honor-others">
          ${others.map((s, i) => `
            <div class="honor-bar-card">
              <span class="bar-rank">${i + 4}</span>
              <span class="bar-avatar">${s.avatar || '👦'}</span>
              <div class="bar-info">
                <span class="bar-name">${this.escape(s.name)}</span>
                <span class="bar-badges">${s.badgeCount > 0 ? '🏆'.repeat(Math.min(s.badgeCount, 3)) : ''} ${s.badgeCount}枚</span>
                <span class="bar-stats">${period === 'all' ? s.totalPoints : s.periodPoints}分 | 阶段${s.petStage}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : '';
      
      const html = list.length ? top3Html + othersHtml : '<p class="placeholder-text">暂无学生记录</p>';
      const el = document.getElementById('honorList');
      if (el) el.innerHTML = html;
      
      // 渲染右侧3列学生信息
      this.renderHonorSidebar(list);
    },

    // 获取时间周期的时间戳
    getPeriodTimestamp(period) {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      
      switch (period) {
        case 'all':
          return 0; // 总排名，从0开始
        case 'day':
          return now - day;
        case 'week':
          return now - 7 * day;
        case 'month':
          return now - 30 * day;
        case 'semester':
          return now - 180 * day;
        default:
          return 0; // 默认总排名
      }
    },

    // 渲染光荣榜右侧3列
    renderHonorSidebar(list) {
      // 优秀学生：积分最高的3个
      const excellentStudents = [...list].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 3);
      
      // 进步之星：最近积分增长最快的（通过scoreHistory判断）
      const progressStars = list.filter(s => s.scoreHistory && s.scoreHistory.length > 0)
        .sort((a, b) => {
          const aRecent = a.scoreHistory.slice(0, 5).reduce((sum, h) => sum + h.delta, 0);
          const bRecent = b.scoreHistory.slice(0, 5).reduce((sum, h) => sum + h.delta, 0);
          return bRecent - aRecent;
        })
        .slice(0, 3);
      
      // 活跃学生：最近有积分变动的学生
      const activeStudents = list.filter(s => s.scoreHistory && s.scoreHistory.length > 0)
        .sort((a, b) => {
          const aTime = a.scoreHistory[0] ? a.scoreHistory[0].time : 0;
          const bTime = b.scoreHistory[0] ? b.scoreHistory[0].time : 0;
          return bTime - aTime;
        })
        .slice(0, 3);
      
      // 渲染优秀学生
      const column1 = document.getElementById('honorColumn1');
      if (column1) {
        const list1 = column1.querySelector('.honor-column-list');
        if (list1) {
          list1.innerHTML = excellentStudents.length ? excellentStudents.map(s => `
            <div class="honor-sidebar-item">
              <span class="sidebar-avatar">${s.avatar || '👦'}</span>
              <span class="sidebar-name">${this.escape(s.name)}</span>
              <span class="sidebar-points">${s.points || 0}分</span>
            </div>
          `).join('') : '<p class="sidebar-empty">暂无数据</p>';
        }
      }
      
      // 渲染进步之星
      const column2 = document.getElementById('honorColumn2');
      if (column2) {
        const list2 = column2.querySelector('.honor-column-list');
        if (list2) {
          list2.innerHTML = progressStars.length ? progressStars.map(s => {
            const recentGain = s.scoreHistory.slice(0, 5).reduce((sum, h) => sum + h.delta, 0);
            return `
              <div class="honor-sidebar-item">
                <span class="sidebar-avatar">${s.avatar || '👦'}</span>
                <span class="sidebar-name">${this.escape(s.name)}</span>
                <span class="sidebar-gain">+${recentGain}</span>
              </div>
            `;
          }).join('') : '<p class="sidebar-empty">暂无数据</p>';
        }
      }
      
      // 渲染活跃学生
      const column3 = document.getElementById('honorColumn3');
      if (column3) {
        const list3 = column3.querySelector('.honor-column-list');
        if (list3) {
          list3.innerHTML = activeStudents.length ? activeStudents.map(s => {
            const lastTime = s.scoreHistory[0] ? s.scoreHistory[0].time : 0;
            const timeText = lastTime ? this.formatTimeAgo(lastTime) : '未知';
            return `
              <div class="honor-sidebar-item">
                <span class="sidebar-avatar">${s.avatar || '👦'}</span>
                <span class="sidebar-name">${this.escape(s.name)}</span>
                <span class="sidebar-time">${timeText}</span>
              </div>
            `;
          }).join('') : '<p class="sidebar-empty">暂无数据</p>';
        }
      }
    },

    // 格式化时间差
    formatTimeAgo(timestamp) {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (days > 0) return `${days}天前`;
      if (hours > 0) return `${hours}小时前`;
      if (minutes > 0) return `${minutes}分钟前`;
      return '刚刚';
    },

    renderStore() {
      const prizes = getStorage(STORAGE_KEYS.prizes, []);
      const enabledPrizes = prizes.filter(p => p.enabled !== false);
      
      // 渲染商品列表
      const goodsHtml = enabledPrizes.length ? enabledPrizes.map((p, i) => `
        <div class="store-item" data-prize-index="${i}">
          ${p.image ? `<img src="${p.image}" alt="" style="width:80px;height:80px;border-radius:12px;object-fit:cover;">` : '<div class="no-img">🎁</div>'}
          <div><strong>${this.escape(p.name)}</strong></div>
          <div>${p.badges || 1} 枚徽章</div>
          <div class="store-item-students" data-prize-index="${i}"></div>
        </div>
      `).join('') : '<p class="placeholder-text">暂无上架商品</p>';
      
      document.getElementById('storeGoods').innerHTML = goodsHtml;
      
      // 为每个商品渲染符合条件的学生
      enabledPrizes.forEach((p, prizeIndex) => {
        const need = p.badges || 1;
        const eligibleStudents = this.students.filter(s => this.getAvailableBadges(s) >= need);
        
        const studentsHtml = eligibleStudents.length ? eligibleStudents.map(s => `
          <div class="store-student-item" data-student-id="${s.id}" data-prize-index="${prizeIndex}">
            <span class="student-avatar">${s.avatar || '👦'}</span>
            <span class="student-name">${this.escape(s.name)}</span>
            <span class="student-badges">🏆 ${this.getAvailableBadges(s)}</span>
          </div>
        `).join('') : '<p class="no-students">暂无符合条件的学生</p>';
        
        const studentContainer = document.querySelector(`.store-item-students[data-prize-index="${prizeIndex}"]`);
        if (studentContainer) {
          studentContainer.innerHTML = studentsHtml;
        }
      });
      
      // 绑定学生点击事件
      document.querySelectorAll('.store-student-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const studentId = item.dataset.studentId;
          const prizeIndex = parseInt(item.dataset.prizeIndex, 10);
          this.exchangePrizeForStudent(studentId, prizeIndex);
        });
      });
      
      // 渲染装扮和玩具
      this.renderAccessories();
      
      this.renderLotteryWheel();
    },
    renderAccessories() {
      // 渲染装扮和玩具
      const accessories = this.getAccessories();
      const enabledAccessories = accessories.filter(a => a.enabled !== false);
      
      const accessoriesHtml = enabledAccessories.length ? enabledAccessories.map((a, i) => `
        <div class="store-item" data-accessory-index="${i}">
          <div class="accessory-icon">${a.icon}</div>
          <div><strong>${this.escape(a.name)}</strong></div>
          <div>${a.points || 10} 积分</div>
          <div class="store-item-students" data-accessory-index="${i}"></div>
        </div>
      `).join('') : '<p class="placeholder-text">暂无上架装扮</p>';
      
      const accessoriesContainer = document.getElementById('storeAccessories');
      if (accessoriesContainer) {
        accessoriesContainer.innerHTML = accessoriesHtml;
        
        // 为每个装扮渲染符合条件的学生
        enabledAccessories.forEach((a, accessoryIndex) => {
          const need = a.points || 10;
          const eligibleStudents = this.students.filter(s => (s.points || 0) >= need);
          
          const studentsHtml = eligibleStudents.length ? eligibleStudents.map(s => `
            <div class="store-student-item" data-student-id="${s.id}" data-accessory-index="${accessoryIndex}">
              <span class="student-avatar">${s.avatar || '👦'}</span>
              <span class="student-name">${this.escape(s.name)}</span>
              <span class="student-points">🍖 ${s.points || 0}</span>
            </div>
          `).join('') : '<p class="no-students">暂无符合条件的学生</p>';
          
          const studentContainer = document.querySelector(`.store-item-students[data-accessory-index="${accessoryIndex}"]`);
          if (studentContainer) {
            studentContainer.innerHTML = studentsHtml;
          }
        });
        
        // 绑定学生点击事件
        document.querySelectorAll('.store-student-item[data-accessory-index]').forEach(item => {
          item.addEventListener('click', (e) => {
            const studentId = item.dataset.studentId;
            const accessoryIndex = parseInt(item.dataset.accessoryIndex, 10);
            this.exchangeAccessoryForStudent(studentId, accessoryIndex);
          });
        });
      }
    },
    getAccessories() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (currentClass) {
        if (!currentClass.accessories || currentClass.accessories.length === 0) {
          // 如果没有装扮，使用默认装扮
          currentClass.accessories = [...DEFAULT_ACCESSORIES];
          setUserData(data);
        }
        return currentClass.accessories;
      }
      return [...DEFAULT_ACCESSORIES];
    },
    exchangeAccessoryForStudent(studentId, accessoryIndex) {
      const s = this.students.find(x => x.id === studentId);
      if (!s) return;
      
      const accessories = this.getAccessories();
      const accessory = accessories[accessoryIndex];
      if (!accessory) return;
      
      const needPoints = accessory.points || 10;
      if ((s.points || 0) < needPoints) {
        alert('积分不足');
        return;
      }
      
      // 扣除积分
      s.points = (s.points || 0) - needPoints;
      
      // 添加装扮到学生
      if (!s.accessories) {
        s.accessories = [];
      }
      
      // 检查是否已经拥有
      if (!s.accessories.some(a => a.id === accessory.id)) {
        s.accessories.push({
          id: accessory.id,
          name: accessory.name,
          icon: accessory.icon
        });
      }

      // 自动为当前宠物装备新获得的装扮，确保学生卡片上可以立即看到
      if (s.pet) {
        if (!Array.isArray(s.pet.accessories)) {
          s.pet.accessories = [];
        }
        if (!s.pet.accessories.some(a => a.id === accessory.id)) {
          s.pet.accessories.push({
            id: accessory.id,
            name: accessory.name,
            icon: accessory.icon
          });
        }
      }
      
      this.saveStudents();
      this.renderStudents();
      this.renderStore();
      alert(`兑换成功！${s.name} 获得了 ${accessory.name}`);
    },

    // 为指定学生兑换奖品
    exchangePrizeForStudent(studentId, prizeIndex) {
      const prizes = getStorage(STORAGE_KEYS.prizes, []);
      const p = prizes[prizeIndex];
      if (!p || p.enabled === false) return;
      
      const need = p.badges || 1;
      const s = this.students.find(x => x.id === studentId);
      if (!s) { alert('未找到该学生'); return; }
      
      const available = this.getAvailableBadges(s);
      if (available < need) { alert('该学生徽章不足'); return; }
      
      if (confirm(`确定要为 ${s.name} 兑换「${p.name}」吗？需要消耗 ${need} 枚徽章。`)) {
        s.badgesSpent = (s.badgesSpent || 0) + need;
        this.saveStudents();
        this.renderStore();
        this.renderHonor();
        this.addBroadcastMessage(s.name, 0, `兑换了奖品：${p.name}`);
        alert('兑换成功！');
      }
    },

    exchangePrize(prizeIndex) {
      const prizes = getStorage(STORAGE_KEYS.prizes, []);
      const p = prizes[prizeIndex];
      if (!p || p.enabled === false) return;
      const need = p.badges || 1;
      const studentsWithBadges = this.students.filter(s => this.getAvailableBadges(s) >= need);
      if (!studentsWithBadges.length) { alert('没有学生拥有足够徽章'); return; }
      const nameList = studentsWithBadges.map(s => `${s.name}(${this.getAvailableBadges(s)}枚)`).join('、');
      const id = prompt('兑换「' + p.name + '」需 ' + need + ' 枚徽章。请输入学生学号：\n可选：' + nameList);
      if (!id) return;
      const s = this.students.find(x => x.id === id.trim());
      if (!s) { alert('未找到该学生'); return; }
      const available = this.getAvailableBadges(s);
      if (available < need) { alert('该学生徽章不足'); return; }
      s.badgesSpent = (s.badgesSpent || 0) + need;
      this.saveStudents();
      this.renderStore();
      this.renderHonor();
      alert('兑换成功！');
    },
    getTotalBadgesEarned(s) {
      if (!s) return 0;
      const completed = Array.isArray(s.completedPets) ? s.completedPets : [];
      let earned = completed.reduce((sum, p) => sum + (p.badgesEarned || 0), 0);
      if (s.pet) earned += (s.pet.badgesEarned || 0);
      return earned;
    },
    getAvailableBadges(s) {
      if (!s) return 0;
      const earned = this.getTotalBadgesEarned(s);
      const spent = s.badgesSpent || 0;
      const available = Math.max(0, earned - spent);
      console.log(`学生 ${s.name} 总勋章: ${earned}, 已使用: ${spent}, 可用: ${available}`);
      return available;
    },
    moveCurrentPetToCompleted(studentId) {
      const s = this.students.find(x => x.id === studentId);
      if (!s || !s.pet) return;
      if (!s.completedPets) s.completedPets = [];
      // 使用宠物已经获得的勋章数
      const badgesEarned = s.pet.badgesEarned || (s.pet.completed ? 1 : 0);
      s.completedPets.push({
        typeId: s.pet.typeId,
        breedId: s.pet.breedId,
        badgesEarned: badgesEarned
      });
      s.badgesSpent = (s.badgesSpent || 0) + (s.pet.badgesSpent || 0);
      s.pet = null;
      this.saveStudents();
    },

    // 班级扭蛋机
    openGachaMachine() {
      const modal = document.getElementById('gachaModal');
      if (!modal) return;
      modal.style.display = 'flex';
      this.renderGachaStudentList();
      const resultEl = document.getElementById('gachaResultText');
      if (resultEl) resultEl.textContent = '点击「扭一个蛋」开始抽奖';
      const machine = document.getElementById('gachaMachine');
      if (machine) {
        machine.classList.remove('spinning');
        machine.classList.remove('sinking');
      }
      const chute = document.getElementById('gachaChute');
      if (chute) chute.classList.remove('open');
      const dispenseBall = document.getElementById('gachaDispenseBall');
      if (dispenseBall) dispenseBall.classList.remove('show');
      const btn = document.getElementById('gachaSpinBtn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '扭一个蛋';
        btn.onclick = () => this.spinGacha();
      }
    },

    closeGachaMachine() {
      const modal = document.getElementById('gachaModal');
      if (modal) modal.style.display = 'none';
    },

    renderGachaStudentList() {
      const select = document.getElementById('gachaStudentSelect');
      if (!select) return;
      select.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '-- 请选择学生 --';
      select.appendChild(placeholder);
      this.students.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name}（积分 ${s.points ?? 0} / 勋章 ${this.getAvailableBadges(s)}）`;
        select.appendChild(opt);
      });
    },

    spinGacha() {
      const select = document.getElementById('gachaStudentSelect');
      const modeEl = document.getElementById('gachaModeSelect');
      const costInput = document.getElementById('gachaCostInput');
      const resultEl = document.getElementById('gachaResultText');
      const cardEl = document.getElementById('gachaResultCard');
      const btn = document.getElementById('gachaSpinBtn');
      const machine = document.getElementById('gachaMachine');
      const dispenseBall = document.getElementById('gachaDispenseBall');
      const chute = document.getElementById('gachaChute');
      if (!select || !modeEl || !costInput || !btn) return;

      const studentId = select.value;
      if (!studentId) {
        alert('请先选择要抽奖的学生');
        return;
      }
      const student = this.students.find(s => s.id === studentId);
      if (!student) {
        alert('未找到该学生');
        return;
      }
      
      const mode = modeEl.value === 'badges' ? 'badges' : 'points';
      const cost = Math.max(1, parseInt(costInput.value || '1', 10));
      
      const prizes = this.getLotteryPrizes();
      if (!prizes.length) {
        alert('暂无奖品，请在「系统设置 → 转盘奖品」中先添加奖品');
        return;
      }
      
      if (mode === 'points') {
        const currentPoints = student.points ?? 0;
        if (currentPoints < cost) {
          alert(`${student.name} 的积分不足，需要至少 ${cost} 分才能抽奖`);
          return;
        }
      } else {
        const availableBadges = this.getAvailableBadges(student);
        if (availableBadges < cost) {
          alert(`${student.name} 的勋章不足，需要至少 ${cost} 枚勋章才能抽奖`);
          return;
        }
      }

      btn.disabled = true;
      btn.textContent = '扭蛋中...';
      if (cardEl) cardEl.innerHTML = '';
      if (machine) {
        machine.classList.remove('spinning');
        machine.classList.remove('sinking');
        void machine.offsetWidth;
        machine.classList.add('spinning');
      }
      if (dispenseBall) {
        dispenseBall.classList.remove('show');
      }
      if (chute) {
        chute.classList.remove('open');
      }

      // 简单随机
      const idx = Math.floor(Math.random() * prizes.length);
      const prize = prizes[idx] || prizes[0];

      setTimeout(() => {
        try {
          // 旋转结束：整体轻轻下沉一下
          if (machine) {
            machine.classList.remove('sinking');
            void machine.offsetWidth;
            machine.classList.add('sinking');
          }
          // 出蛋口开门
          if (chute) {
            chute.classList.add('open');
          }
          if (dispenseBall) {
            void dispenseBall.offsetWidth;
            dispenseBall.classList.add('show');
          }
          if (mode === 'points') {
            student.points = (student.points ?? 0) - cost;
          } else {
            student.badgesSpent = (student.badgesSpent || 0) + cost;
          }
        this.saveStudents();
          this.renderStore();
          this.renderHonor();

          if (resultEl) {
            const unit = mode === 'points' ? '积分' : '枚勋章';
            const prizeName = prize && prize.name ? prize.name : '神秘奖品';
            resultEl.textContent = `🎉 恭喜 ${student.name} 抽中：${prizeName}！（本次消耗 ${cost} ${unit}）`;
          }

          if (cardEl) {
            const avatar = student.avatar || '👦';
            cardEl.innerHTML = `
              <div class="gacha-card">
                <div class="gacha-card-avatar">${avatar}</div>
                <div class="gacha-card-main">
                  <div class="gacha-card-name">${this.escape(student.name)}</div>
                  <div class="gacha-card-prize">获得奖品：${this.escape(prize && prize.name ? prize.name : '神秘奖品')}</div>
                </div>
              </div>
            `;
          }

          // 中奖语音播报
          try {
            const speakText = `恭喜 ${student.name} 抽中 ${prize && prize.name ? prize.name : '神秘奖品'}`;
            this.speak(speakText);
          } catch (e) {
            console.warn('扭蛋机语音播报失败:', e);
          }

          // 烟花闪光特效
          try {
            this.showFireworksEffect();
          } catch (e) {
            console.warn('扭蛋机烟花特效失败:', e);
          }
        } catch (e) {
          console.error('扭蛋机结算出错:', e);
          if (resultEl) {
            resultEl.textContent = '结算奖品时出错，请检查控制台日志。';
          }
        } finally {
        btn.disabled = false;
          btn.textContent = '再扭一个';
          this.renderGachaStudentList();
          if (machine) machine.classList.remove('spinning');
        }
      }, 900);
    },

    // 兼容旧逻辑：商店渲染里曾调用该函数
    // 现在抽奖已迁移到「班级小工具 → 扭蛋机」，此处保留为空实现避免报错中断
    renderLotteryWheel() {
      return;
    },

    // 渲染抽奖学生列表（只显示有勋章的学生）
    renderLotteryStudentList() {
      const container = document.getElementById('lotteryStudentList');
      if (!container) return;
      
      console.log('开始渲染抽奖学生列表，学生总数:', this.students.length);
      
      // 筛选有勋章的学生
      const studentsWithBadges = this.students.filter(s => {
        const available = this.getAvailableBadges(s);
        console.log(`学生 ${s.name} 可用勋章: ${available}`);
        return available > 0;
      });
      
      console.log('有勋章的学生数量:', studentsWithBadges.length);
      
      if (!studentsWithBadges.length) {
        container.innerHTML = '<p class="lottery-empty">暂无学生拥有勋章</p>';
        return;
      }
      
      const html = studentsWithBadges.map(s => {
        const badges = this.getAvailableBadges(s);
        const isSelected = this._lotteryStudentId === s.id;
        return `
          <div class="lottery-student-item ${isSelected ? 'selected' : ''}" onclick="app.selectLotteryStudent('${s.id}')">
            <span class="lottery-student-avatar">${s.avatar || '👦'}</span>
            <span class="lottery-student-name">${this.escape(s.name)}</span>
            <span class="lottery-student-badges">🏆 ${badges}枚</span>
          </div>
        `;
      }).join('');
      
      container.innerHTML = html;
      console.log('抽奖学生列表渲染完成');
    },

    // 选择抽奖学生
    selectLotteryStudent(studentId) {
      this._lotteryStudentId = studentId;
      this.renderLotteryStudentList();
    },

    renderPlusItems() {
      const items = this.getPlusItems();
      const html = items.map((item, i) => `
        <div class="score-item-row">
          <input type="text" value="${this.escape(item.name)}" data-index="${i}" data-type="plus" data-field="name" placeholder="项目名">
          <input type="number" value="${item.points}" data-index="${i}" data-type="plus" data-field="points" style="width:70px" placeholder="分">
          <button class="btn-remove" onclick="app.removeScoreItem('plus',${i})">删除</button>
        </div>
      `).join('') || '<p class="placeholder-text">未添加加分项（最多 30 个）</p>';
      document.getElementById('plusItemsList').innerHTML = html;
      document.querySelectorAll('#plusItemsList input').forEach(inp => {
        inp.addEventListener('change', () => {
          const data = getUserData();
          const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
          if (currentClass) {
            const arr = currentClass.plusItems || [];
            const i = parseInt(inp.dataset.index, 10);
            if (arr[i]) arr[i][inp.dataset.field] = inp.dataset.field === 'points' ? parseInt(inp.value, 10) || 0 : inp.value;
            currentClass.plusItems = arr;
            setUserData(data);
            this.saveData();
          }
        });
      });
    },
    renderMinusItems() {
      const items = this.getMinusItems();
      const html = items.map((item, i) => `
        <div class="score-item-row">
          <input type="text" value="${this.escape(item.name)}" data-index="${i}" data-type="minus" data-field="name" placeholder="项目名">
          <input type="number" value="${item.points}" data-index="${i}" data-type="minus" data-field="points" style="width:70px" placeholder="分">
          <button class="btn-remove" onclick="app.removeScoreItem('minus',${i})">删除</button>
        </div>
      `).join('') || '<p class="placeholder-text">未添加扣分项（最多 30 个）</p>';
      document.getElementById('minusItemsList').innerHTML = html;
      document.querySelectorAll('#minusItemsList input').forEach(inp => {
        inp.addEventListener('change', () => {
          const data = getUserData();
          const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
          if (currentClass) {
            const arr = currentClass.minusItems || [];
            const i = parseInt(inp.dataset.index, 10);
            if (arr[i]) arr[i][inp.dataset.field] = inp.dataset.field === 'points' ? Math.abs(parseInt(inp.value, 10) || 0) : inp.value;
            currentClass.minusItems = arr;
            setUserData(data);
            this.saveData();
          }
        });
      });
    },

    addScoreItem(type) {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (currentClass) {
        const max = type === 'plus' ? 30 : 30;
        const arr = type === 'plus' ? (currentClass.plusItems || []) : (currentClass.minusItems || []);
        if (arr.length >= max) {
          alert(`最多只能添加 ${max} 个${type === 'plus' ? '加分' : '扣分'}项`);
          return;
        }
        arr.push({ name: '新项目', points: 1 });
        if (type === 'plus') {
          currentClass.plusItems = arr;
        } else {
          currentClass.minusItems = arr;
        }
        setUserData(data);
        this.saveData();
        type === 'plus' ? this.renderPlusItems() : this.renderMinusItems();
      }
    },
    removeScoreItem(type, index) {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (currentClass) {
        const arr = type === 'plus' ? (currentClass.plusItems || []) : (currentClass.minusItems || []);
        arr.splice(index, 1);
        if (type === 'plus') {
          currentClass.plusItems = arr;
        } else {
          currentClass.minusItems = arr;
        }
        setUserData(data);
        this.saveData();
        type === 'plus' ? this.renderPlusItems() : this.renderMinusItems();
      }
    },

    saveScoreItem() {
      const type = document.getElementById('scoreItemType').value;
      const name = document.getElementById('scoreItemName').value.trim();
      const points = parseInt(document.getElementById('scoreItemPoints').value, 10) || 1;
      const editIndex = document.getElementById('scoreItemEditIndex').value;
      const normalizedPoints = type === 'minus' ? Math.abs(points) : points;
      const max = type === 'plus' ? 30 : 30;

      const data = getUserData();
      if (!data || !Array.isArray(data.classes)) {
        alert('未找到班级数据，请先创建/选择班级');
        return;
      }

      // 如果 currentClassId 为空，自动选中一个班级，避免“添加无反应/看起来没添加上”
      if (!this.currentClassId && data.classes.length > 0 && data.classes[0] && data.classes[0].id) {
        this.currentClassId = data.classes[0].id;
        data.currentClassId = this.currentClassId;
      }

      const currentClass = this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!currentClass) {
        alert('请先选择班级后再添加加分/扣分项');
        return;
      }

      const arr = type === 'plus'
        ? (currentClass.plusItems || [])
        : (currentClass.minusItems || []);

      if (editIndex !== '' && editIndex !== undefined) {
        const i = parseInt(editIndex, 10);
        if (arr[i]) arr[i] = { name, points: normalizedPoints };
      } else {
        if (arr.length >= max) {
          alert(`最多只能添加 ${max} 个${type === 'plus' ? '加分' : '扣分'}项`);
          return;
        }
        arr.push({ name, points: normalizedPoints });
      }

      if (type === 'plus') currentClass.plusItems = arr;
      else currentClass.minusItems = arr;

      // 兼容旧版：同步一份到全局（避免旧逻辑/迁移依赖）
      try {
        const key = type === 'plus' ? STORAGE_KEYS.plusItems : STORAGE_KEYS.minusItems;
      setStorage(key, arr);
      } catch (e) {
        console.warn('保存全局加减分项失败（可忽略）', e);
      }

      setUserData(data);
      this.saveData();
      this.closeScoreItemModal();
      type === 'plus' ? this.renderPlusItems() : this.renderMinusItems();
    },
    closeScoreItemModal() { document.getElementById('scoreItemModal').classList.remove('show'); },
    renderAccessoriesList() {
      const accessories = this.getAccessories();
      const html = accessories.map((a, i) => `
        <div class="accessory-item">
          <span class="accessory-icon">${a.icon}</span>
          <div class="accessory-info">
            <strong>${this.escape(a.name)}</strong>
            <span>${a.points || 10} 积分</span>
          </div>
          <div class="accessory-actions">
            <button class="btn btn-small" onclick="app.editAccessory(${i})">编辑</button>
            <button class="btn btn-small btn-danger" onclick="app.deleteAccessory(${i})">删除</button>
          </div>
        </div>
      `).join('') || '<p class="placeholder-text">暂无装扮</p>';
      
      document.getElementById('accessoriesList').innerHTML = html;
    },
    openAccessoryModal(editIndex = -1) {
      const modal = document.getElementById('accessoryModal');
      const title = document.getElementById('accessoryModalTitle');
      const idInput = document.getElementById('accessoryEditId');
      const nameInput = document.getElementById('accessoryName');
      const pointsInput = document.getElementById('accessoryPoints');
      const iconInput = document.getElementById('accessoryIcon');
      
      if (editIndex === -1) {
        // 添加新装扮
        title.textContent = '添加装扮';
        idInput.value = '';
        nameInput.value = '';
        pointsInput.value = 10;
        iconInput.value = '';
      } else {
        // 编辑现有装扮
        const accessories = this.getAccessories();
        const accessory = accessories[editIndex];
        if (accessory) {
          title.textContent = '编辑装扮';
          idInput.value = accessory.id;
          nameInput.value = accessory.name;
          pointsInput.value = accessory.points || 10;
          iconInput.value = accessory.icon;
        }
      }
      
      modal.style.display = 'block';
    },
    closeAccessoryModal() {
      document.getElementById('accessoryModal').style.display = 'none';
    },
    saveAccessory() {
      const id = document.getElementById('accessoryEditId').value;
      const name = document.getElementById('accessoryName').value.trim();
      const points = parseInt(document.getElementById('accessoryPoints').value, 10) || 10;
      const icon = document.getElementById('accessoryIcon').value.trim();
      
      if (!name || !icon) {
        alert('请填写装扮名称和图标');
        return;
      }
      
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!currentClass) return;
      
      if (!currentClass.accessories) {
        currentClass.accessories = [];
      }
      
      if (id) {
        // 更新现有装扮
        const index = currentClass.accessories.findIndex(a => a.id === id);
        if (index > -1) {
          currentClass.accessories[index] = {
            ...currentClass.accessories[index],
            name,
            points,
            icon
          };
        }
      } else {
        // 添加新装扮
        currentClass.accessories.push({
          id: 'accessory_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          name,
          points,
          icon,
          enabled: true
        });
      }
      
      setUserData(data);
      this.renderAccessoriesList();
      this.closeAccessoryModal();
      alert('保存成功');
    },
    editAccessory(index) {
      this.openAccessoryModal(index);
    },
    deleteAccessory(index) {
      if (!confirm('确定要删除这个装扮吗？')) return;
      
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!currentClass || !currentClass.accessories) return;
      
      currentClass.accessories.splice(index, 1);
      setUserData(data);
      this.renderAccessoriesList();
      alert('删除成功');
    },

    addScoreItemModal(type) {
      const max = type === 'plus' ? 30 : 30;
      const curLen = (type === 'plus' ? this.getPlusItems() : this.getMinusItems()).length;
      if (curLen >= max) {
        alert(`最多只能添加 ${max} 个${type === 'plus' ? '加分' : '扣分'}项`);
        return;
      }
      document.getElementById('scoreItemModalTitle').textContent = type === 'plus' ? '添加加分项' : '添加扣分项';
      document.getElementById('scoreItemType').value = type;
      document.getElementById('scoreItemEditIndex').value = '';
      document.getElementById('scoreItemName').value = '';
      document.getElementById('scoreItemPoints').value = '1';
      document.getElementById('scoreItemModal').classList.add('show');
    },

    renderPrizes() {
      const prizes = getStorage(STORAGE_KEYS.prizes, []);
      const html = prizes.map((p, i) => `
        <div class="prize-item-row">
          ${p.image ? `<img src="${p.image}" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover;">` : '<div class="no-prize-img">🎁</div>'}
          <input type="text" value="${this.escape(p.name)}" placeholder="奖品名" data-i="${i}" data-f="name">
          <input type="number" value="${p.badges || 1}" placeholder="徽章" style="width:60px" data-i="${i}" data-f="badges">
          <label><input type="checkbox" ${p.enabled !== false ? 'checked' : ''} data-i="${i}" data-f="enabled"> 上架</label>
          <button class="btn-remove" onclick="app.removePrize(${i})">删除</button>
        </div>
      `).join('');
      document.getElementById('prizeList').innerHTML = html;
      document.querySelectorAll('#prizeList input').forEach(inp => {
        inp.addEventListener('change', () => {
          const arr = getStorage(STORAGE_KEYS.prizes, []);
          const i = parseInt(inp.dataset.i, 10);
          if (arr[i]) {
            if (inp.dataset.f === 'enabled') arr[i].enabled = inp.checked;
            else if (inp.dataset.f === 'badges') arr[i].badges = parseInt(inp.value, 10) || 1;
            else arr[i][inp.dataset.f] = inp.value;
          }
          setStorage(STORAGE_KEYS.prizes, arr);
          this.saveData();
        });
      });
    },
    addPrizeModal() {
      document.getElementById('prizeModalTitle').textContent = '添加奖品';
      document.getElementById('prizeEditId').value = '';
      document.getElementById('prizeName').value = '';
      document.getElementById('prizeBadges').value = '1';
      document.getElementById('prizeImageInput').value = '';
      document.getElementById('prizeImagePreview').innerHTML = '';
      this._prizeImageData = null;
      document.getElementById('prizeModal').classList.add('show');
    },
    closePrizeModal() {
      document.getElementById('prizeModal').classList.remove('show');
      this._prizeImageData = null;
    },
    handlePrizeImageSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = document.getElementById('prizeImagePreview');
        preview.innerHTML = `<img src="${e.target.result}" style="max-width: 150px; max-height: 150px; border-radius: 8px;">`;
        this._prizeImageData = e.target.result;
      };
      reader.readAsDataURL(file);
    },
    savePrize() {
      const id = document.getElementById('prizeEditId').value;
      const name = document.getElementById('prizeName').value.trim();
      const badges = parseInt(document.getElementById('prizeBadges').value, 10) || 1;
      const image = this._prizeImageData || '';
      const arr = getStorage(STORAGE_KEYS.prizes, []);
      if (id !== '') {
        const i = parseInt(id, 10);
        if (arr[i]) arr[i] = { name, badges, image, enabled: arr[i].enabled !== false };
      } else arr.push({ name, badges, image, enabled: true });
      setStorage(STORAGE_KEYS.prizes, arr);
      this.saveData();
      this.closePrizeModal();
      this.renderPrizes();
      this.renderStore();
    },
    removePrize(i) {
      const arr = getStorage(STORAGE_KEYS.prizes, []);
      arr.splice(i, 1);
      setStorage(STORAGE_KEYS.prizes, arr);
      this.saveData();
      this.renderPrizes();
      this.renderStore();
    },

    renderLotteryPrizes() {
      const prizes = this.getLotteryPrizes();
      const html = prizes.map((p, i) => `
        <div class="prize-item-row">
          <input type="text" value="${this.escape(p.name)}" placeholder="奖品名" data-i="${i}" data-f="name">
          <button class="btn-remove" onclick="app.removeLotteryPrize(${i})">删除</button>
        </div>
      `).join('');
      document.getElementById('lotteryPrizeList').innerHTML = html;
      document.querySelectorAll('#lotteryPrizeList input').forEach(inp => {
        inp.addEventListener('change', () => {
          const data = getUserData();
          const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
          if (!currentClass) return;
          const arr = currentClass.lotteryPrizes || [];
          const i = parseInt(inp.dataset.i, 10);
          if (arr[i]) arr[i].name = inp.value;
          currentClass.lotteryPrizes = arr;
          setUserData(data);
          this.saveData();
        });
      });
    },
    addLotteryPrizeModal() {
      const name = prompt('转盘奖品名称：');
      if (!name) return;
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!currentClass) return;
      const arr = currentClass.lotteryPrizes || [];
      arr.push({ name });
      currentClass.lotteryPrizes = arr;
      setUserData(data);
      this.saveData();
      this.renderLotteryPrizes();
      this.renderLotteryWheel();
    },
    removeLotteryPrize(i) {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!currentClass) return;
      const arr = currentClass.lotteryPrizes || [];
      arr.splice(i, 1);
      currentClass.lotteryPrizes = arr;
      setUserData(data);
      this.saveData();
      this.renderLotteryPrizes();
      this.renderLotteryWheel();
    },

    batchScoreModal() {
      const plusItems = this.getPlusItems();
      const minusItems = this.getMinusItems();
      const select = document.getElementById('batchScoreItem');
      select.innerHTML = '';
      plusItems.forEach((item, i) => { const o = document.createElement('option'); o.value = 'plus_' + i; o.textContent = '+ ' + item.name + ' (' + item.points + '分)'; select.appendChild(o); });
      minusItems.forEach((item, i) => { const o = document.createElement('option'); o.value = 'minus_' + i; o.textContent = '- ' + item.name + ' (' + item.points + '分)'; select.appendChild(o); });
      const container = document.getElementById('batchStudentCheckboxes');
      container.innerHTML = this.students.map(s => `
        <div class="batch-student-item">
          <span class="batch-student-name">${this.escape(s.name)}</span>
          <span class="batch-student-points">(积分: ${s.points || 0})</span>
          <input type="checkbox" value="${s.id}" class="batch-student-checkbox">
        </div>
      `).join('') || '<p class="text-muted">暂无学生</p>';
      document.getElementById('batchScoreModal').classList.add('show');
    },
    closeBatchScoreModal() { document.getElementById('batchScoreModal').classList.remove('show'); },
    doBatchScore() {
      const raw = document.getElementById('batchScoreItem').value;
      const [type, idx] = raw.split('_');
      const items = type === 'plus' ? this.getPlusItems() : this.getMinusItems();
      const item = items[parseInt(idx, 10)];
      if (!item) return;
      const delta = type === 'plus' ? (item.points || 1) : -(Math.abs(item.points) || 1);
      const selectedStudents = [];
      document.querySelectorAll('#batchStudentCheckboxes input:checked').forEach(cb => {
        const s = this.students.find(x => x.id === cb.value);
        if (s) {
          s.points = (s.points || 0) + delta;
          if (!s.scoreHistory) s.scoreHistory = [];
          s.scoreHistory.unshift({ time: Date.now(), delta, reason: item.name });
          selectedStudents.push(s.name);
        }
      });
      this.saveStudents();
      this.closeBatchScoreModal();
      this.renderStudents();
      this.renderHonor();
      // 批量操作广播
      if (selectedStudents.length > 0) {
        const isPlus = delta > 0;
        const names = selectedStudents.slice(0, 3).join('、');
        const more = selectedStudents.length > 3 ? `等${selectedStudents.length}人` : '';
        this.addBroadcastMessage(`${names}${more}`, delta, `批量${isPlus ? '加分' : '扣分'}`);
      }
    },

    batchSelectAll(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = true);
    },

    batchInvertSelection(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = !cb.checked);
    },

    batchFeedModal() {
      const container = document.getElementById('batchFeedStudentCheckboxes');
      const totalStages = this.getTotalStages();
      container.innerHTML = this.students.filter(s => s.pet).map(s => {
        const stage = s.pet.stage || 0;
        const stageText = s.pet.hatching ? '孵化中' : `第${stage}/${totalStages}阶段`;
        const points = s.points || 0;
        return `
          <div class="batch-student-item">
            <span class="batch-student-name">${this.escape(s.name)}</span>
            <span class="batch-student-points">(${stageText}, 积分: ${points})</span>
            <input type="checkbox" value="${s.id}" class="batch-student-checkbox">
          </div>
        `;
      }).join('') || '<p class="text-muted">暂无可喂养的宠物</p>';
      document.getElementById('batchFeedPoints').value = '1';
      document.getElementById('batchFeedModal').classList.add('show');
    },
    closeBatchFeedModal() { document.getElementById('batchFeedModal').classList.remove('show'); },
    doBatchFeed() {
      const pts = parseInt(document.getElementById('batchFeedPoints').value, 10) || 1;
      if (pts < 1) return;
      document.querySelectorAll('#batchFeedStudentCheckboxes input:checked').forEach(cb => {
        const s = this.students.find(x => x.id === cb.value);
        if (s && s.pet) {
          const amount = Math.min(pts, s.points || 0);
          if (amount > 0) this.feedPet(s.id, amount);
        }
      });
      this.saveStudents();
      this.closeBatchFeedModal();
      this.renderStudents();
      this.showEatEffect();
    },

    randomRollCall() {
      if (!this.students.length) { alert('暂无学生'); return; }
      const chosen = this.students[Math.floor(Math.random() * this.students.length)];
      const overlay = document.createElement('div');
      overlay.className = 'rollcall-overlay';
      overlay.innerHTML = `
        <div class="rollcall-spiral" style="background:radial-gradient(circle,#1f2433,#0f1220);color:#fff;border:2px solid #ffd08a;box-shadow:0 0 30px #ffbb6680;">
          <div class="rollcall-spiral-center">
            <div class="rollcall-spiral-title" style="color:#ffd08a;">🎯 星光点名</div>
            <div class="rollcall-spiral-sub" style="color:#ffc;">名字风暴中...</div>
          </div>
          <div class="rollcall-spiral-names"></div>
        </div>
      `;
      overlay.onclick = () => overlay.remove();
      document.body.appendChild(overlay);

      const namesBox = overlay.querySelector('.rollcall-spiral-names');
      const all = [...this.students];
      let tick = 0;
      const interval = setInterval(() => {
        tick += 1;
        namesBox.innerHTML = '';
        for (let i = 0; i < 26; i++) {
          const s = all[Math.floor(Math.random() * all.length)];
        const el = document.createElement('div');
        el.className = 'rollcall-name';
          const angle = i * 0.7 + tick * 0.08;
          const radius = 18 + i * 5.2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
          el.style.transform = `translate(${x}px, ${y}px)`;
          el.style.color = i % 2 ? '#ffd08a' : '#fff';
          el.textContent = s ? s.name : '';
        namesBox.appendChild(el);
        }
      }, 90);

      setTimeout(() => {
        clearInterval(interval);
          const result = document.createElement('div');
          result.className = 'rollcall-display rollcall-display-final';
        result.style.cssText = 'font-size:2rem;color:#ffd08a;text-shadow:0 0 14px #ff9f40;';
        result.innerHTML = `${chosen.avatar || '🌟'} ${this.escape(chosen.name)}`;
          overlay.querySelector('.rollcall-spiral').appendChild(result);
        this.speak(`请${chosen.name}开始挑战`);
      }, 2600);

      setTimeout(() => {
        if (overlay && overlay.parentNode) overlay.remove();
      }, 5200);
    },

    toggleToolsMenu(e) {
      try {
        if (e && e.stopPropagation) e.stopPropagation();
        const menu = document.getElementById('toolsMenu');
        if (!menu) return;
        const isOpen = menu.style.display !== 'none';
        menu.style.display = isOpen ? 'none' : 'block';
      } catch (err) {}
    },
    closeToolsMenu() {
      const menu = document.getElementById('toolsMenu');
      if (menu) menu.style.display = 'none';
    },
    openTermCommentTool() {
      const modal = document.getElementById('termCommentModal');
      if (!modal) return;
      // 填充学生下拉
      const select = document.getElementById('termCommentStudentSelect');
      if (select) {
        const options = ['<option value=\"\">-- 请选择学生 --</option>'].concat(
          this.students.map(s => `<option value=\"${this.escape(String(s.id))}\">${this.escape(String(s.id || ''))} - ${this.escape(String(s.name || ''))}</option>`)
        );
        select.innerHTML = options.join('');
      }
      // 默认标题 & 当前学期
      const titleEl = document.getElementById('termCommentTitle');
      if (titleEl && !titleEl.value) titleEl.value = '期末评语';
      this.renderTermCommentCard();
      modal.classList.add('show');
    },
    closeTermCommentTool() {
      const modal = document.getElementById('termCommentModal');
      if (modal) modal.classList.remove('show');
    },

    openAttendanceTool() {
      const modal = document.getElementById('attendanceModal');
      if (!modal) return;
      const dateEl = document.getElementById('attendanceDate');
      if (dateEl && !dateEl.value) dateEl.value = getTodayDateStr();
      this.renderAttendanceList();
      modal.classList.add('show');
    },
    closeAttendanceTool() {
      const modal = document.getElementById('attendanceModal');
      if (modal) modal.classList.remove('show');
    },
    renderAttendanceList() {
      const container = document.getElementById('attendanceList');
      const dateEl = document.getElementById('attendanceDate');
      if (!container || !dateEl) return;
      const dateKey = dateEl.value || getTodayDateStr();
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!cls) {
        container.innerHTML = '<p class="placeholder-text">请先创建并选择一个班级。</p>';
        return;
      }
      const records = cls.attendanceRecords && cls.attendanceRecords[dateKey] ? cls.attendanceRecords[dateKey] : {};
      if (!this.students.length) {
        container.innerHTML = '<p class="placeholder-text">当前班级暂无学生。</p>';
        return;
      }
      const rows = this.students.map(stu => {
        const rec = records[String(stu.id)] || { status: 'present', note: '' };
        return `
          <div class="attendance-row" data-id="${this.escape(String(stu.id))}">
            <div>${this.escape(String(stu.id || ''))} - ${this.escape(String(stu.name || ''))}</div>
            <div>
              <select class="login-input attendance-status">
                <option value="present" ${rec.status === 'present' ? 'selected' : ''}>出勤</option>
                <option value="late" ${rec.status === 'late' ? 'selected' : ''}>迟到</option>
                <option value="leave" ${rec.status === 'leave' ? 'selected' : ''}>请假</option>
                <option value="absent" ${rec.status === 'absent' ? 'selected' : ''}>缺勤</option>
              </select>
            </div>
            <div>
              <input type="text" class="login-input attendance-note" placeholder="备注（可选）" value="${this.escape(String(rec.note || ''))}">
            </div>
          </div>
        `;
      }).join('');
      container.innerHTML = rows;
    },
    markAllPresent() {
      const rows = document.querySelectorAll('#attendanceList .attendance-row');
      rows.forEach(row => {
        const sel = row.querySelector('.attendance-status');
        if (sel) sel.value = 'present';
      });
    },
    saveAttendance() {
      const dateEl = document.getElementById('attendanceDate');
      if (!dateEl) return;
      const dateKey = dateEl.value || getTodayDateStr();
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!cls) { alert('请先选择班级'); return; }
      if (!cls.attendanceRecords) cls.attendanceRecords = {};
      const map = {};
      document.querySelectorAll('#attendanceList .attendance-row').forEach(row => {
        const id = row.getAttribute('data-id');
        const sel = row.querySelector('.attendance-status');
        const noteInput = row.querySelector('.attendance-note');
        if (!id || !sel) return;
        map[id] = {
          status: sel.value || 'present',
          note: (noteInput && noteInput.value || '').trim()
        };
      });
      cls.attendanceRecords[dateKey] = map;
      setUserData(data);
      this.loadUserData();
      alert('出勤记录已保存');
    },


    openSeatArrangeTool() {
      const modal = document.getElementById('seatArrangeModal');
      if (!modal) { alert('排座位模块未加载'); return; }

      // 读取已保存的班级座位方案
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      const plan = cls && cls.seatingPlan ? cls.seatingPlan : null;

      const colsEl = document.getElementById('seatCols');
      const rowsEl = document.getElementById('seatRows');
      if (colsEl) colsEl.value = String((plan && plan.cols) || 8);
      if (rowsEl) rowsEl.value = String((plan && plan.rows) || 6);

      modal.classList.add('show');
      this._renderSeatBoard(plan);
    },
    closeSeatArrangeModal() {
      const modal = document.getElementById('seatArrangeModal');
      if (modal) modal.classList.remove('show');
    },

    openSoundMonitorTool() {
      const modal = document.getElementById('soundMonitorModal');
      if (!modal) return;
      const statusEl = document.getElementById('soundStatusText');
      if (statusEl) statusEl.textContent = '尚未开始监听';
      modal.classList.add('show');
    },
    closeSoundMonitorTool() {
      const modal = document.getElementById('soundMonitorModal');
      if (modal) modal.classList.remove('show');
      this.stopSoundMonitor();
    },
    async startSoundMonitor() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('当前浏览器不支持麦克风访问，无法使用声贝管理。');
        return;
      }
      if (this._soundStream) {
        this._soundRunning = true;
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this._soundStream = stream;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        const data = new Uint8Array(analyser.frequencyBinCount);
        src.connect(analyser);
        this._soundAnalyser = analyser;
        this._soundAudioCtx = ctx;
        this._soundRunning = true;

        const fill = document.getElementById('soundLevelFill');
        const statusEl = document.getElementById('soundStatusText');
        const thresholdEl = document.getElementById('soundThreshold');

        const loop = () => {
          if (!this._soundRunning || !this._soundAnalyser) return;
          this._soundAnalyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length); // 0~1
          const level = Math.min(100, Math.floor(rms * 200)); // 0~100
          if (fill) fill.style.width = level + '%';

          const threshold = parseInt(thresholdEl && thresholdEl.value || '40', 10) || 40;
          if (statusEl) {
            statusEl.textContent = level < threshold ? '当前较安静' : '当前声音偏大，请注意课堂纪律';
          }
          requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        console.error('声贝监听失败:', e);
        const statusEl = document.getElementById('soundStatusText');
        if (statusEl) statusEl.textContent = '无法开启麦克风，请检查浏览器权限或设备设置。';
      }
    },
    stopSoundMonitor() {
      this._soundRunning = false;
      if (this._soundStream) {
        try { this._soundStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        this._soundStream = null;
      }
      if (this._soundAudioCtx) {
        try { this._soundAudioCtx.close(); } catch (e) {}
        this._soundAudioCtx = null;
      }
    },
    _getSeatRules() {
      const lowVisionFront = !!(document.getElementById('seatRuleLowVisionFront') && document.getElementById('seatRuleLowVisionFront').checked);
      const visionThreshold = _parseNum(document.getElementById('seatVisionThreshold') && document.getElementById('seatVisionThreshold').value) ?? 4.8;
      const frontRows = parseInt((document.getElementById('seatFrontRows') && document.getElementById('seatFrontRows').value) || '2', 10) || 0;
      return { lowVisionFront, visionThreshold, frontRows };
    },
    _renderSeatBoard(plan) {
      const board = document.getElementById('seatBoard');
      if (!board) return;
      const cols = parseInt((document.getElementById('seatCols') && document.getElementById('seatCols').value) || '8', 10) || 8;
      const rows = parseInt((document.getElementById('seatRows') && document.getElementById('seatRows').value) || '6', 10) || 6;
      board.style.gridTemplateColumns = `repeat(${cols}, 110px)`;

      const seats = (plan && Array.isArray(plan.seats)) ? plan.seats : [];
      const getSeat = (r, c) => seats.find(x => x.r === r && x.c === c) || { r, c, studentId: null, locked: false };
      const byId = new Map(this.students.map(s => [String(s.id), s]));

      board.innerHTML = '';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seat = getSeat(r, c);
          const stu = seat.studentId ? byId.get(String(seat.studentId)) : null;
          const cell = document.createElement('div');
          cell.className = 'seat-cell' + (seat.locked ? ' locked' : '');
          cell.dataset.r = String(r);
          cell.dataset.c = String(c);
          cell.innerHTML = `
            <div class="seat-lock">${seat.locked ? '🔒' : ''}</div>
            <div class="seat-name">${stu ? this.escape(stu.name) : '空'}</div>
            <div class="seat-meta">${stu ? this.escape(String(stu.id || '')) : `第${r + 1}行-${c + 1}列`}</div>
          `;
          // 点击座位主体：弹出学生选择器
          cell.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openSeatStudentPicker(r, c);
          });
          // 点击锁图标：仅切换锁定状态
          const lockEl = cell.querySelector('.seat-lock');
          if (lockEl) {
            lockEl.addEventListener('click', (e) => {
              e.stopPropagation();
              this.toggleSeatLock(r, c);
            });
          }
          board.appendChild(cell);
        }
      }
    },
    toggleSeatLock(r, c) {
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(x => x.id === this.currentClassId) : null;
      if (!cls) return;
      if (!cls.seatingPlan) cls.seatingPlan = { rows: 6, cols: 8, seats: [] };

      const plan = cls.seatingPlan;
      const seat = plan.seats.find(x => x.r === r && x.c === c);
      if (seat) {
        seat.locked = !seat.locked;
      } else {
        plan.seats.push({ r, c, studentId: null, locked: true });
      }
      setUserData(data);
      this.loadUserData();
      this._renderSeatBoard(plan);
    },
    openSeatStudentPicker(r, c) {
      const modal = document.getElementById('seatStudentPickerModal');
      const rowInput = document.getElementById('seatPickerRow');
      const colInput = document.getElementById('seatPickerCol');
      const select = document.getElementById('seatStudentSelect');
      const lockBox = document.getElementById('seatPickerLock');
      if (!modal || !rowInput || !colInput || !select) return;

      rowInput.value = String(r);
      colInput.value = String(c);

      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(x => x.id === this.currentClassId) : null;
      const seats = cls && cls.seatingPlan && Array.isArray(cls.seatingPlan.seats) ? cls.seatingPlan.seats : [];
      const seat = seats.find(x => x.r === r && x.c === c) || { studentId: null, locked: false };

      // 当前已占用学生
      const currentId = seat.studentId ? String(seat.studentId) : '';

      // 构造下拉列表：先“空座”，然后全部学生
      const options = ['<option value="">（空座）</option>'].concat(
        this.students.map(s => `<option value="${this.escape(String(s.id))}">${this.escape(String(s.id || ''))} - ${this.escape(String(s.name || ''))}</option>`)
      );
      select.innerHTML = options.join('');
      if (currentId) select.value = currentId;

      if (lockBox) lockBox.checked = !!seat.locked;

      modal.classList.add('show');
    },
    closeSeatStudentPicker() {
      const modal = document.getElementById('seatStudentPickerModal');
      if (modal) modal.classList.remove('show');
    },
    assignStudentToSeat() {
      const rowInput = document.getElementById('seatPickerRow');
      const colInput = document.getElementById('seatPickerCol');
      const select = document.getElementById('seatStudentSelect');
      const lockBox = document.getElementById('seatPickerLock');
      if (!rowInput || !colInput || !select) return;

      const r = parseInt(rowInput.value, 10) || 0;
      const c = parseInt(colInput.value, 10) || 0;
      const studentId = select.value || null;
      const lock = !!(lockBox && lockBox.checked);

      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(x => x.id === this.currentClassId) : null;
      if (!cls) return;
      if (!cls.seatingPlan) cls.seatingPlan = { rows: 6, cols: 8, seats: [] };
      const plan = cls.seatingPlan;

      // 确保单个学生只在一个座位上：先清除该学生在其他座位
      if (studentId) {
        plan.seats.forEach(s => {
          if (String(s.studentId) === String(studentId) && (s.r !== r || s.c !== c)) {
            s.studentId = null;
          }
        });
      }

      let seat = plan.seats.find(x => x.r === r && x.c === c);
      if (!seat) {
        seat = { r, c, studentId: null, locked: false };
        plan.seats.push(seat);
      }
      seat.studentId = studentId;
      seat.locked = lock;

      setUserData(data);
      this.loadUserData();
      this._renderSeatBoard(plan);
      this.closeSeatStudentPicker();
    },
    clearSeatStudent() {
      const rowInput = document.getElementById('seatPickerRow');
      const colInput = document.getElementById('seatPickerCol');
      if (!rowInput || !colInput) return;
      const r = parseInt(rowInput.value, 10) || 0;
      const c = parseInt(colInput.value, 10) || 0;

      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(x => x.id === this.currentClassId) : null;
      if (!cls || !cls.seatingPlan || !Array.isArray(cls.seatingPlan.seats)) { this.closeSeatStudentPicker(); return; }
      const plan = cls.seatingPlan;
      const seat = plan.seats.find(x => x.r === r && x.c === c);
      if (seat) {
        seat.studentId = null;
      }
      setUserData(data);
      this.loadUserData();
      this._renderSeatBoard(plan);
      this.closeSeatStudentPicker();
    },

    generateTermComment(force) {
      const select = document.getElementById('termCommentStudentSelect');
      const contentEl = document.getElementById('termCommentContent');
      if (!select || !contentEl) return;
      const studentId = select.value;
      if (!studentId) { alert('请先选择学生'); return; }
      const stu = this.students.find(s => String(s.id) === String(studentId));
      if (!stu) { alert('未找到该学生'); return; }

      const perf = document.getElementById('termPerf').value || '优秀';
      const study = document.getElementById('termStudy').value || '积极';
      const cls = document.getElementById('termClass').value || '活跃';
      const hw = document.getElementById('termHomework').value || '完成良好';
      const remark = (document.getElementById('termRemark').value || '').trim();
      const style = document.getElementById('termCommentStyle').value || 'encourage';

      let text = '';
      const name = stu.name || '该生';
      if (style === 'encourage') {
        text = `${name}同学在本学期中平时表现${perf}，学习态度${study}，课堂参与${cls}，作业完成情况${hw}。`;
        if (remark) {
          text += remark.endsWith('。') ? remark : (remark + '。');
        }
        text += '希望今后继续保持良好的学习习惯，在新的阶段里取得更大的进步。';
      } else if (style === 'objective') {
        text = `本学期，${name}同学总体表现${perf}，学习态度${study}。课堂表现${cls}，作业完成${hw}。`;
        if (remark) text += remark.endsWith('。') ? remark : (remark + '。');
        text += '期待在保持现有优点的同时，进一步完善自我。';
      } else {
        text = `${name}同学本学期在学习与生活中仍有较大提升空间。平时表现${perf}，学习态度${study}，课堂参与${cls}，作业完成${hw}。`;
        if (remark) text += remark.endsWith('。') ? remark : (remark + '。');
        text += '希望新学期能够端正学习态度，在家校共同配合下不断进步。';
      }

      contentEl.value = text;

      // 保存到内存对象（不立即写盘，交给 saveTermComment）
      stu.termComment = text;
      this.renderTermCommentCard();
    },
    saveTermComment() {
      const select = document.getElementById('termCommentStudentSelect');
      const contentEl = document.getElementById('termCommentContent');
      if (!select || !contentEl) return;
      const studentId = select.value;
      if (!studentId) { alert('请先选择学生'); return; }
      const stu = this.students.find(s => String(s.id) === String(studentId));
      if (!stu) { alert('未找到该学生'); return; }

      const text = (contentEl.value || '').trim();
      if (!text) { alert('评语内容为空，无法保存'); return; }
      stu.termComment = text;
      this.saveStudents();
      this.renderTermCommentCard();
      alert('评语已保存到该学生');
    },
    renderTermCommentCard() {
      const card = document.getElementById('termCommentCard');
      if (!card) return;
      const select = document.getElementById('termCommentStudentSelect');
      const contentEl = document.getElementById('termCommentContent');
      const titleEl = document.getElementById('termCommentTitle');
      const title = titleEl ? (titleEl.value || '期末评语') : '期末评语';
      const termLabel = getCurrentTermLabel();
      const studentId = select ? select.value : '';
      const stu = studentId ? this.students.find(s => String(s.id) === String(studentId)) : null;
      const name = stu ? (stu.name || '') : '学生姓名';
      const content = contentEl ? (contentEl.value || '点击「生成评语」按钮，系统将根据学生表现自动生成评语…') : '';
      const teacherName = this.currentUsername || '';
      const today = new Date();
      const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

      card.innerHTML = `
        <div class="term-card-header">
          <div class="term-card-title">${title}</div>
          <div class="term-card-term">${termLabel}</div>
        </div>
        <div class="term-card-body">
          <p><strong>${name}</strong>：</p>
          <p>${content.replace(/\\n/g, '<br>')}</p>
        </div>
        <div class="term-card-footer">
          <span>班主任：${teacherName || '__________'}</span>
          <span>日期：${dateStr}</span>
        </div>
      `;
    },
    openTermCommentPrint() {
      const card = document.getElementById('termCommentCard');
      if (!card) return;
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write('<html><head><title>打印期末评语卡片</title>');
      win.document.write('<style>body{margin:20px;font-family:"Microsoft YaHei",sans-serif;} .term-card{max-width:420px;margin:0 auto;}</style>');
      win.document.write('</head><body>');
      win.document.write('<div class="term-card">' + card.innerHTML + '</div>');
      win.document.write('</body></html>');
      win.document.close();
      win.focus();
      win.print();
    },
    openTermCommentPreviewWindow() {
      const card = document.getElementById('termCommentCard');
      if (!card) return;
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write('<html><head><title>期末评语卡片预览</title>');
      win.document.write('<style>body{margin:20px;background:#fdf2f2;font-family:"Microsoft YaHei",sans-serif;} .term-card{max-width:420px;margin:0 auto;}</style>');
      win.document.write('</head><body>');
      win.document.write('<div class="term-card">' + card.innerHTML + '</div>');
      win.document.write('<p style="margin-top:12px;font-size:12px;color:#666;">提示：可以使用浏览器截图 / 右键「另存为」将卡片保存为图片。</p>');
      win.document.write('</body></html>');
      win.document.close();
      win.focus();
    },
    generateSeatPlan(applyRules) {
      const cols = parseInt((document.getElementById('seatCols') && document.getElementById('seatCols').value) || '8', 10) || 8;
      const rows = parseInt((document.getElementById('seatRows') && document.getElementById('seatRows').value) || '6', 10) || 6;
      const rules = this._getSeatRules();

      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(x => x.id === this.currentClassId) : null;
      if (!cls) { alert('请先创建/选择班级'); return; }

      const total = rows * cols;
      const students = this.students.slice();
      if (students.length === 0) { alert('暂无学生'); return; }

      // 继承锁定座位（固定分座）
      const prev = cls.seatingPlan && Array.isArray(cls.seatingPlan.seats) ? cls.seatingPlan.seats : [];
      const lockedSeats = prev.filter(s => s.locked && s.studentId);
      const lockedStudentIds = new Set(lockedSeats.map(s => String(s.studentId)));

      // 待分配学生
      let candidates = students.filter(s => !lockedStudentIds.has(String(s.id)));

      // 规则排序（可选）
      if (applyRules && rules.lowVisionFront) {
        const threshold = rules.visionThreshold;
        const isLowVision = (stu) => {
          const l = _parseNum(stu.visionLeft);
          const r = _parseNum(stu.visionRight);
          const m = Math.min(l ?? 99, r ?? 99);
          return Number.isFinite(m) && m < threshold;
        };
        const low = candidates.filter(isLowVision);
        const other = candidates.filter(s => !isLowVision(s));
        // 各自打乱
        const shuffle = (arr) => {
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          return arr;
        };
        candidates = [...shuffle(low), ...shuffle(other)];
      } else {
        // 全量打乱
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
      }

      const plan = { rows, cols, seats: [], rules: applyRules ? rules : null };
      // 先放入锁定座位
      lockedSeats.forEach(s => plan.seats.push({ r: s.r, c: s.c, studentId: s.studentId, locked: true }));

      // 生成可用座位顺序：若应用规则且低视力前排，则前排座位优先填充
      const allPositions = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) allPositions.push({ r, c });
      const isLockedPos = (pos) => plan.seats.some(s => s.r === pos.r && s.c === pos.c);
      const freePositions = allPositions.filter(p => !isLockedPos(p));

      let orderedPositions = freePositions;
      if (applyRules && rules.lowVisionFront && rules.frontRows > 0) {
        const front = freePositions.filter(p => p.r < rules.frontRows);
        const rest = freePositions.filter(p => p.r >= rules.frontRows);
        orderedPositions = [...front, ...rest];
      }

      // 分配
      for (let i = 0; i < orderedPositions.length; i++) {
        const pos = orderedPositions[i];
        const stu = candidates[i];
        if (!stu) break;
        plan.seats.push({ r: pos.r, c: pos.c, studentId: stu.id, locked: false });
      }

      cls.seatingPlan = plan;
      setUserData(data);
      this.loadUserData();
      this._renderSeatBoard(plan);
    },
    saveSeatPlan() {
      const data = getUserData();
      const cls = data.classes && this.currentClassId ? data.classes.find(x => x.id === this.currentClassId) : null;
      if (!cls || !cls.seatingPlan) { alert('没有可保存的座位方案'); return; }
      setUserData(data);
      this.loadUserData();
      alert('座位方案已保存（本班级）');
    },

    // 通用数据保存方法，确保所有数据变更都触发多重存储机制
    saveData() {
      // 保存用户数据
      this.saveUserData();
    },

    // 实时自动同步数据 - 使用统一的同步机制
    enableAutoSyncRealtime() {
      // 如果已经启用，先禁用之前的定时器，避免重复创建
      if (this.realtimeSyncInterval) {
        clearInterval(this.realtimeSyncInterval);
        this.realtimeSyncInterval = null;
      }
      
      // 监听所有数据变化
      this.originalData = {
        students: JSON.stringify(this.students),
        groups: JSON.stringify(this.groups),
        groupPointHistory: JSON.stringify(this.groupPointHistory)
      };
      this.realtimeSyncInterval = setInterval(() => {
        try {
          const currentData = {
            students: JSON.stringify(this.students),
            groups: JSON.stringify(this.groups),
            groupPointHistory: JSON.stringify(this.groupPointHistory)
          };
          
          // 检查任何数据是否有变化
          let hasChanges = false;
          for (let key in currentData) {
            if (currentData[key] !== this.originalData[key]) {
              hasChanges = true;
              this.originalData[key] = currentData[key];
            }
          }
          
          if (hasChanges) {
            this.saveData();
            console.log('数据自动同步到本地');
            // 同时同步到云端
            if (navigator.onLine) {
              this.syncToCloud().catch(err => console.error('自动同步到云端失败:', err));
              console.log('数据自动同步到云端');
            }
          }
          
          // 定期检查设备授权状态
          this.checkDeviceAuthorization();
        } catch (e) {
          console.error('实时同步检查失败:', e);
        }
      }, 5000); // 每5秒检查一次
      console.log('实时自动同步已启用');
      
      // 启用自动导出备份功能
      this.enableAutoBackup();
    },

    // ==================== 照片存储管理 ====================
    
    // 初始化照片存储
    initPhotoStorage() {
      try {
        // 从localStorage读取API调用计数
        const savedCount = localStorage.getItem('github_api_calls');
        if (savedCount) {
          this.photoStorage.githubApiCalls = parseInt(savedCount, 10) || 0;
        }
        
        // 加载GitHub Token
        this.loadGithubToken();
        
        // 加载R2计费设置
        this.loadR2BillingSettings();
        
        // 检查月度计数器
        this.checkAndResetMonthlyCounter();
        
        // 检查是否需要切换到R2
        this.checkStorageProvider();
        
        // 更新界面显示
        this.updatePhotoStorageStatus();
        this.updateR2BillingStatus();
        
        console.log(`照片存储提供商: ${this.photoStorage.currentProvider}, GitHub API调用: ${this.photoStorage.githubApiCalls}/${this.photoStorage.githubApiLimit}`);
        console.log(`R2计费控制: ${this.photoStorage.r2BillingControl.enabled ? '已启用' : '已禁用'}, 当月使用: ${this.photoStorage.r2BillingControl.currentMonthCalls}/${this.photoStorage.r2BillingControl.monthlyLimit}`);
      } catch (e) {
        console.error('初始化照片存储失败:', e);
      }
    },
    
    // 检查存储提供商
    checkStorageProvider() {
      // 首先检查R2计费控制
      if (this.shouldBlockR2()) {
        // R2被截断，只能使用GitHub
        if (this.photoStorage.githubApiCalls >= this.photoStorage.githubApiLimit) {
          console.warn('GitHub额度已用完，R2计费控制已启用，暂停照片上传');
          return;
        }
        // 强制使用GitHub
        if (this.photoStorage.currentProvider !== 'github') {
          this.photoStorage.currentProvider = 'github';
          console.log('R2被截断，切换回GitHub存储');
        }
        return;
      }
      
      // 检查GitHub额度
      if (this.photoStorage.githubApiCalls >= this.photoStorage.githubApiLimit) {
        // GitHub额度用完，切换到R2
        if (this.photoStorage.currentProvider !== 'r2') {
          this.photoStorage.currentProvider = 'r2';
          console.log('GitHub API限制已达到，切换到R2存储');
        }
      } else {
        // GitHub额度恢复，切换回GitHub
        if (this.photoStorage.currentProvider !== 'github') {
          this.photoStorage.currentProvider = 'github';
          console.log('GitHub API额度恢复，切换回GitHub存储');
        }
      }
    },
    
    // 检查是否应该阻止R2使用（计费控制）
    shouldBlockR2() {
      const control = this.photoStorage.r2BillingControl;
      if (!control.enabled || !control.autoCutoff) {
        return false;
      }
      
      // 检查是否需要重置月度计数
      this.checkAndResetMonthlyCounter();
      
      // 检查是否达到截断阈值
      const usageRatio = control.currentMonthCalls / control.monthlyLimit;
      if (usageRatio >= control.cutoffThreshold) {
        console.warn(`R2使用接近限制: ${control.currentMonthCalls}/${control.monthlyLimit} (${(usageRatio * 100).toFixed(1)}%)，已自动截断`);
        return true;
      }
      
      return false;
    },
    
    // 检查并重置月度计数器
    checkAndResetMonthlyCounter() {
      const control = this.photoStorage.r2BillingControl;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
      
      if (control.lastResetMonth !== currentMonth) {
        // 新月度，重置计数器
        control.currentMonthCalls = 0;
        control.lastResetMonth = currentMonth;
        localStorage.setItem('r2_last_reset_month', currentMonth);
        localStorage.setItem('r2_monthly_calls', '0');
        console.log(`R2月度计数器已重置: ${currentMonth}`);
      } else {
        // 从localStorage读取当前计数
        const savedCalls = localStorage.getItem('r2_monthly_calls');
        if (savedCalls) {
          control.currentMonthCalls = parseInt(savedCalls, 10) || 0;
        }
      }
    },
    
    // 增加R2调用计数
    incrementR2Calls(count = 1) {
      this.checkAndResetMonthlyCounter();
      this.photoStorage.r2BillingControl.currentMonthCalls += count;
      localStorage.setItem('r2_monthly_calls', this.photoStorage.r2BillingControl.currentMonthCalls.toString());
      
      // 检查是否接近限制
      const control = this.photoStorage.r2BillingControl;
      const usageRatio = control.currentMonthCalls / control.monthlyLimit;
      
      if (usageRatio >= control.cutoffThreshold) {
        console.warn(`R2使用接近限制: ${control.currentMonthCalls}/${control.monthlyLimit} (${(usageRatio * 100).toFixed(1)}%)`);
      }
    },
    
    // 增加GitHub API调用计数
    incrementGithubApiCalls() {
      this.photoStorage.githubApiCalls++;
      localStorage.setItem('github_api_calls', this.photoStorage.githubApiCalls);
      
      // 检查是否需要切换
      this.checkStorageProvider();
      
      // 如果接近限制，显示警告
      if (this.photoStorage.githubApiCalls >= this.photoStorage.githubApiLimit - 100) {
        console.warn(`GitHub API调用接近限制: ${this.photoStorage.githubApiCalls}/${this.photoStorage.githubApiLimit}`);
      }
    },
    
    // 上传照片到GitHub
    async uploadPhotoToGitHub(file, filename) {
      try {
        // 检查API限制
        if (this.photoStorage.githubApiCalls >= this.photoStorage.githubApiLimit) {
          throw new Error('GitHub API限制已达到');
        }
        
        // 读取文件为base64
        const base64Content = await this.fileToBase64(file);
        
        // 构建API请求
        const path = `photos/${Date.now()}_${filename}`;
        const url = `https://api.github.com/repos/${this.photoStorage.githubRepo}/contents/${path}`;
        
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${this.photoStorage.githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Upload photo: ${filename}`,
            content: base64Content,
            branch: this.photoStorage.githubBranch
          })
        });
        
        // 增加API调用计数
        this.incrementGithubApiCalls();
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'GitHub上传失败');
        }
        
        const data = await response.json();
        console.log('照片上传到GitHub成功:', data.content.download_url);
        
        return {
          success: true,
          url: data.content.download_url,
          provider: 'github'
        };
      } catch (e) {
        console.error('GitHub上传失败:', e);
        return { success: false, error: e.message };
      }
    },
    
    // 上传照片到R2
    async uploadPhotoToR2(file, filename) {
      try {
        // 这里使用现有的R2上传逻辑
        // 如果没有配置R2，返回错误
        if (!this.photoStorage.r2Config.accessKeyId) {
          throw new Error('R2未配置');
        }
        
        // TODO: 实现R2上传逻辑
        // 暂时返回错误，提示用户配置R2
        throw new Error('R2上传功能需要配置');
      } catch (e) {
        console.error('R2上传失败:', e);
        return { success: false, error: e.message };
      }
    },
    
    // 智能上传照片（自动选择存储提供商，带计费控制）
    async uploadPhoto(file, filename) {
      // 检查R2计费控制
      if (this.shouldBlockR2()) {
        // R2被截断，只能使用GitHub
        if (this.photoStorage.githubApiCalls >= this.photoStorage.githubApiLimit) {
          console.warn('GitHub额度已用完，R2计费控制已启用，照片将暂存本地队列');
          // 将照片加入待上传队列
          this.addToPhotoQueue(file, filename);
          return {
            success: false,
            error: '存储额度暂时用完，照片已加入队列，将在额度恢复后自动上传',
            queued: true
          };
        }
        // 强制使用GitHub
        this.photoStorage.currentProvider = 'github';
      }
      
      // 检查当前提供商
      this.checkStorageProvider();
      
      let result;
      
      if (this.photoStorage.currentProvider === 'github') {
        // 尝试使用GitHub
        result = await this.uploadPhotoToGitHub(file, filename);
        
        // 如果GitHub失败且是因为API限制，尝试R2（如果未被截断）
        if (!result.success && result.error.includes('限制')) {
          if (!this.shouldBlockR2()) {
            console.log('GitHub API限制，尝试R2...');
            result = await this.uploadPhotoToR2(file, filename);
            if (result.success) {
              // 记录R2调用
              this.incrementR2Calls();
            }
          } else {
            console.warn('GitHub和R2都不可用，照片加入队列');
            this.addToPhotoQueue(file, filename);
            result = {
              success: false,
              error: '存储额度暂时用完，照片已加入队列',
              queued: true
            };
          }
        }
      } else {
        // 使用R2
        result = await this.uploadPhotoToR2(file, filename);
        if (result.success) {
          // 记录R2调用
          this.incrementR2Calls();
        }
      }
      
      return result;
    },
    
    // 照片上传队列（用于额度用完时暂存）
    photoUploadQueue: [],
    
    // 添加照片到上传队列
    addToPhotoQueue(file, filename) {
      const queueItem = {
        file: file,
        filename: filename,
        timestamp: Date.now(),
        retryCount: 0
      };
      this.photoUploadQueue.push(queueItem);
      
      // 保存队列到localStorage
      this.savePhotoQueue();
      
      console.log(`照片已加入上传队列，当前队列: ${this.photoUploadQueue.length}张`);
    },
    
    // 保存照片队列到localStorage
    savePhotoQueue() {
      try {
        // 由于File对象无法序列化，只保存元数据
        const queueMetadata = this.photoUploadQueue.map(item => ({
          filename: item.filename,
          timestamp: item.timestamp,
          retryCount: item.retryCount
        }));
        localStorage.setItem('photo_upload_queue_meta', JSON.stringify(queueMetadata));
      } catch (e) {
        console.error('保存照片队列失败:', e);
      }
    },
    
    // 尝试处理上传队列（在额度恢复时调用）
    async processPhotoQueue() {
      if (this.photoUploadQueue.length === 0) return;
      
      console.log(`开始处理照片上传队列，共${this.photoUploadQueue.length}张`);
      
      const processedItems = [];
      
      for (let i = 0; i < this.photoUploadQueue.length; i++) {
        const item = this.photoUploadQueue[i];
        
        // 检查是否还有额度
        if (this.photoStorage.githubApiCalls >= this.photoStorage.githubApiLimit && this.shouldBlockR2()) {
          console.log('额度仍不足，暂停处理队列');
          break;
        }
        
        try {
          const result = await this.uploadPhoto(item.file, item.filename);
          if (result.success) {
            processedItems.push(i);
            console.log(`队列照片上传成功: ${item.filename}`);
          } else if (item.retryCount < 3) {
            // 失败但可重试
            item.retryCount++;
            console.log(`队列照片上传失败，已重试${item.retryCount}次: ${item.filename}`);
          } else {
            // 超过重试次数，放弃
            processedItems.push(i);
            console.error(`队列照片超过重试次数，放弃上传: ${item.filename}`);
          }
        } catch (e) {
          console.error(`处理队列照片失败: ${item.filename}`, e);
        }
      }
      
      // 移除已处理的项目
      this.photoUploadQueue = this.photoUploadQueue.filter((_, index) => !processedItems.includes(index));
      this.savePhotoQueue();
      
      console.log(`照片队列处理完成，剩余${this.photoUploadQueue.length}张`);
    },
    
    // 启动队列处理定时器（每小时检查一次）
    startPhotoQueueProcessor() {
      // 每小时尝试处理队列
      setInterval(() => {
        this.processPhotoQueue();
      }, 60 * 60 * 1000);
      
      // 立即尝试处理一次
      setTimeout(() => {
        this.processPhotoQueue();
      }, 5000);
    },
    
    // 文件转base64
    fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          // 移除data:image/jpeg;base64,前缀
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
    },
    
    // 重置GitHub API计数（每小时重置一次）
    resetGithubApiCounter() {
      const lastReset = localStorage.getItem('github_api_last_reset');
      const now = Date.now();
      
      if (!lastReset || (now - parseInt(lastReset, 10)) >= 60 * 60 * 1000) {
        this.photoStorage.githubApiCalls = 0;
        localStorage.setItem('github_api_calls', '0');
        localStorage.setItem('github_api_last_reset', now.toString());
        
        // 如果之前切换到R2，现在可以切回GitHub
        if (this.photoStorage.currentProvider === 'r2') {
          this.photoStorage.currentProvider = 'github';
          console.log('GitHub API计数已重置，切换回GitHub存储');
        }
        
        // 重置后尝试处理队列
        this.processPhotoQueue();
      }
      
      // 更新界面显示
      this.updatePhotoStorageStatus();
      this.updateR2BillingStatus();
    },
    
    // 保存R2计费设置
    saveR2BillingSettings() {
      // 检查是否为管理员
      if (!this.isCurrentUserAdmin()) {
        alert('只有管理员才能修改计费设置');
        return;
      }
      
      try {
        const enabled = document.getElementById('r2BillingControlEnabled').checked;
        const autoCutoff = document.getElementById('r2AutoCutoff').checked;
        const monthlyLimit = parseInt(document.getElementById('r2MonthlyLimit').value, 10) || 1000000;
        const cutoffThreshold = (parseInt(document.getElementById('r2CutoffThreshold').value, 10) || 90) / 100;
        
        this.photoStorage.r2BillingControl.enabled = enabled;
        this.photoStorage.r2BillingControl.autoCutoff = autoCutoff;
        this.photoStorage.r2BillingControl.monthlyLimit = monthlyLimit;
        this.photoStorage.r2BillingControl.cutoffThreshold = cutoffThreshold;
        
        // 保存到localStorage
        localStorage.setItem('r2_billing_settings', JSON.stringify({
          enabled,
          autoCutoff,
          monthlyLimit,
          cutoffThreshold
        }));
        
        alert('R2计费设置已保存');
        this.updateR2BillingStatus();
      } catch (e) {
        console.error('保存R2计费设置失败:', e);
        alert('保存失败: ' + e.message);
      }
    },
    
    // 加载R2计费设置
    loadR2BillingSettings() {
      try {
        const saved = localStorage.getItem('r2_billing_settings');
        if (saved) {
          const settings = JSON.parse(saved);
          this.photoStorage.r2BillingControl.enabled = settings.enabled !== false;
          this.photoStorage.r2BillingControl.autoCutoff = settings.autoCutoff !== false;
          this.photoStorage.r2BillingControl.monthlyLimit = settings.monthlyLimit || 1000000;
          this.photoStorage.r2BillingControl.cutoffThreshold = settings.cutoffThreshold || 0.9;
          
          // 更新界面
          const enabledEl = document.getElementById('r2BillingControlEnabled');
          const autoCutoffEl = document.getElementById('r2AutoCutoff');
          const monthlyLimitEl = document.getElementById('r2MonthlyLimit');
          const cutoffThresholdEl = document.getElementById('r2CutoffThreshold');
          
          if (enabledEl) enabledEl.checked = this.photoStorage.r2BillingControl.enabled;
          if (autoCutoffEl) autoCutoffEl.checked = this.photoStorage.r2BillingControl.autoCutoff;
          if (monthlyLimitEl) monthlyLimitEl.value = this.photoStorage.r2BillingControl.monthlyLimit;
          if (cutoffThresholdEl) cutoffThresholdEl.value = Math.round(this.photoStorage.r2BillingControl.cutoffThreshold * 100);
        }
      } catch (e) {
        console.error('加载R2计费设置失败:', e);
      }
    },
    
    // 更新R2计费状态显示
    updateR2BillingStatus() {
      const statusEl = document.getElementById('r2BillingStatus');
      const queueStatusEl = document.getElementById('photoQueueStatus');
      
      if (statusEl) {
        const control = this.photoStorage.r2BillingControl;
        const usage = control.currentMonthCalls;
        const limit = control.monthlyLimit;
        const percentage = limit > 0 ? ((usage / limit) * 100).toFixed(1) : 0;
        
        let statusText = `当月使用: ${usage.toLocaleString()}/${limit.toLocaleString()} (${percentage}%)`;
        
        if (this.shouldBlockR2()) {
          statusText += ' - <span style="color: #e74c3c; font-weight: bold;">已截断</span>';
        } else if (parseFloat(percentage) >= control.cutoffThreshold * 100) {
          statusText += ' - <span style="color: #f39c12;">接近限制</span>';
        } else {
          statusText += ' - <span style="color: #27ae60;">正常</span>';
        }
        
        statusEl.innerHTML = statusText;
      }
      
      if (queueStatusEl) {
        const queueLength = this.photoUploadQueue.length;
        queueStatusEl.textContent = `待上传: ${queueLength}张`;
      }
    },
    
    // 手动重置计数器（用户点击按钮）
    resetGithubCounter() {
      // 检查是否为管理员
      if (!this.isCurrentUserAdmin()) {
        alert('只有管理员才能重置计数器');
        return;
      }
      
      this.photoStorage.githubApiCalls = 0;
      localStorage.setItem('github_api_calls', '0');
      localStorage.setItem('github_api_last_reset', Date.now().toString());
      
      // 如果之前切换到R2，现在可以切回GitHub
      if (this.photoStorage.currentProvider === 'r2') {
        this.photoStorage.currentProvider = 'github';
      }
      
      this.updatePhotoStorageStatus();
      alert('GitHub API计数器已重置');
    },
    
    // 保存GitHub Token
    saveGithubToken() {
      const tokenInput = document.getElementById('githubTokenInput');
      if (!tokenInput) return;
      
      // 检查是否为管理员
      if (!this.isCurrentUserAdmin()) {
        alert('只有管理员才能配置照片存储');
        return;
      }
      
      const token = tokenInput.value.trim();
      if (!token) {
        alert('请输入GitHub Token');
        return;
      }
      
      // 保存到localStorage（加密存储）
      localStorage.setItem('github_token', btoa(token));
      this.photoStorage.githubToken = token;
      
      alert('GitHub Token已保存');
      this.updatePhotoStorageStatus();
    },
    
    // 加载GitHub Token
    loadGithubToken() {
      const savedToken = localStorage.getItem('github_token');
      if (savedToken) {
        try {
          this.photoStorage.githubToken = atob(savedToken);
          
          // 更新输入框
          const tokenInput = document.getElementById('githubTokenInput');
          if (tokenInput) {
            tokenInput.value = this.photoStorage.githubToken;
          }
        } catch (e) {
          console.error('加载GitHub Token失败:', e);
        }
      }
    },
    
    // 测试GitHub连接
    async testGithubConnection() {
      // 检查是否为管理员
      if (!this.isCurrentUserAdmin()) {
        alert('只有管理员才能测试连接');
        return;
      }
      
      if (!this.photoStorage.githubToken) {
        alert('请先保存GitHub Token');
        return;
      }
      
      try {
        const response = await fetch(`https://api.github.com/repos/${this.photoStorage.githubRepo}`, {
          headers: {
            'Authorization': `token ${this.photoStorage.githubToken}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          alert(`连接成功！\n仓库: ${data.full_name}\n默认分支: ${data.default_branch}`);
        } else {
          const error = await response.json();
          alert(`连接失败: ${error.message}`);
        }
      } catch (e) {
        alert(`连接错误: ${e.message}`);
      }
    },
    
    // 检查是否为管理员并显示照片存储配置
    checkAndShowPhotoStorageConfig() {
      try {
        // 检查当前用户是否为管理员
        const isAdmin = this.isCurrentUserAdmin();
        const photoStorageConfig = document.getElementById('photoStorageConfig');
        
        if (photoStorageConfig) {
          if (isAdmin) {
            // 是管理员，显示配置
            photoStorageConfig.style.display = 'block';
            console.log('当前用户是管理员，显示照片存储配置');
          } else {
            // 不是管理员，隐藏配置
            photoStorageConfig.style.display = 'none';
            console.log('当前用户不是管理员，隐藏照片存储配置');
          }
        }
      } catch (e) {
        console.error('检查管理员权限失败:', e);
      }
    },
    
    // 检查当前用户是否为管理员
    isCurrentUserAdmin() {
      try {
        // 检查当前登录的用户名是否在管理员列表中
        if (!this.currentUsername) return false;
        
        // 使用已有的ADMIN_ACCOUNTS数组检查
        const adminAccounts = [
          { username: '18844162799' },
          { username: '18645803876' }
        ];
        
        return adminAccounts.some(admin => admin.username === this.currentUsername);
      } catch (e) {
        console.error('检查管理员身份失败:', e);
        return false;
      }
    },
    
    // 更新照片存储状态显示
    updatePhotoStorageStatus() {
      const statusEl = document.getElementById('photoStorageStatus');
      if (statusEl) {
        const provider = this.photoStorage.currentProvider === 'github' ? 'GitHub' : 'R2';
        const calls = this.photoStorage.githubApiCalls;
        const limit = this.photoStorage.githubApiLimit;
        statusEl.textContent = `当前: ${provider} | API调用: ${calls}/${limit}`;
      }
    },
    
    async refreshStorageStatus() {
      const engineEl = document.getElementById('storageEngine');
      const usedEl = document.getElementById('storageUsed');
      const quotaEl = document.getElementById('storageQuota');
      const percentEl = document.getElementById('storagePercent');
      
      if (engineEl) {
        if (typeof IndexedDBManager !== 'undefined' && IndexedDBManager.isSupported()) {
          engineEl.textContent = 'IndexedDB (大容量)';
          engineEl.style.color = '#22c55e';
        } else {
          engineEl.textContent = 'localStorage (5-10MB)';
          engineEl.style.color = '#f59e0b';
        }
      }
      
      if (typeof IndexedDBManager !== 'undefined') {
        try {
          const usage = await IndexedDBManager.getStorageUsage();
          if (usage && usedEl && quotaEl && percentEl) {
            usedEl.textContent = usage.usageMB + ' MB';
            quotaEl.textContent = usage.quotaMB + ' MB';
            percentEl.textContent = usage.percentUsed + '%';
            
            if (parseFloat(usage.percentUsed) > 80) {
              percentEl.style.color = '#ef4444';
            } else if (parseFloat(usage.percentUsed) > 50) {
              percentEl.style.color = '#f59e0b';
            } else {
              percentEl.style.color = '#22c55e';
            }
          }
        } catch (e) {
          console.error('获取存储状态失败:', e);
          if (usedEl) usedEl.textContent = '无法获取';
          if (quotaEl) quotaEl.textContent = '无法获取';
          if (percentEl) percentEl.textContent = '无法获取';
        }
      }
    },

    // 检查设备授权状态
    checkDeviceAuthorization() {
      if (!this.currentUserId) return;
      
      try {
        // 获取当前用户信息
        const savedUser = localStorage.getItem(CURRENT_USER_KEY);
        if (!savedUser) {
          console.log('未找到用户信息，跳过设备授权检查');
          return;
        }
        
        const userInfo = JSON.parse(savedUser);
        const deviceId = userInfo.deviceId;
        
        if (!deviceId) {
          console.log('未找到设备ID，跳过设备授权检查');
          return;
        }
        
        // 检查设备是否在用户的设备列表中
        const users = getUserList();
        const user = users.find(u => u.id === this.currentUserId);
        
        // 如果找不到用户或设备列表，只记录日志而不强制退出
        // 避免因为数据同步延迟导致的误退出
        if (!user) {
          console.log('未找到用户信息，跳过设备授权检查');
          return;
        }
        
        if (!user.devices) {
          console.log('用户设备列表为空，跳过设备授权检查');
          return;
        }
        
        if (!user.devices.some(d => d.id === deviceId)) {
          console.log('设备不在授权列表中，但暂不强制退出');
          // 不再强制退出，避免闪退问题
          // 只在控制台记录，让用户继续使用
        }
      } catch (e) {
        console.error('检查设备授权失败:', e);
        // 出错时不强制退出，避免闪退
      }
    },

    // 禁用自动同步
    disableAutoSync() {
      // 禁用云端同步定时器
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
        console.log('云端自动同步已禁用');
      }
      
      // 禁用实时同步定时器
      if (this.realtimeSyncInterval) {
        clearInterval(this.realtimeSyncInterval);
        this.realtimeSyncInterval = null;
        console.log('实时自动同步已禁用');
      }
      
      // 禁用自动导出备份功能
      this.disableAutoBackup();
    },

    // 自动导出备份功能
    enableAutoBackup() {
      // 如果已经启用，先禁用之前的定时器，避免重复创建
      if (this.autoBackupInterval) {
        clearInterval(this.autoBackupInterval);
        this.autoBackupInterval = null;
      }
      
      // 每小时自动导出一次备份到localStorage
      this.autoBackupInterval = setInterval(() => {
        try {
          this.autoSaveBackup();
        } catch (e) {
          console.error('自动备份失败:', e);
        }
      }, 60 * 60 * 1000); // 1小时
      
      // 立即执行一次备份
      try {
        this.autoSaveBackup();
      } catch (e) {
        console.error('初始备份失败:', e);
      }
      console.log('自动备份已启用');
    },

    // 禁用自动导出备份
    disableAutoBackup() {
      if (this.autoBackupInterval) {
        clearInterval(this.autoBackupInterval);
        this.autoBackupInterval = null;
        console.log('自动备份已禁用');
      }
    },

    // 自动保存备份到localStorage
    autoSaveBackup() {
      try {
        const userData = getUserData();
        const classList = userData.classes || [];
        let currentClassId = userData.currentClassId || null;
        
        // 尝试从localStorage读取当前班级ID
        try {
          currentClassId = localStorage.getItem('currentClassId') || currentClassId;
        } catch (e) {
          // localStorage不可用时，从内存存储读取
          currentClassId = memoryStorage['currentClassId'] || currentClassId;
        }
        
        const classData = {};
        classList.forEach(function (c) {
          try {
            let raw = null;
            // 尝试从localStorage读取
            try {
              raw = localStorage.getItem('class_data_' + c.id);
            } catch (e) {
              // localStorage不可用时，从内存存储读取
              raw = memoryStorage['class_data_' + c.id];
            }
            if (raw) classData[c.id] = JSON.parse(raw);
          } catch (e) {}
        });
        const backup = {
          version: 1,
          exportTime: Date.now(),
          classList: classList,
          currentClassId: currentClassId || null,
          classData: classData
        };
        
        // 保存到localStorage
        try {
          localStorage.setItem('auto_backup_data', JSON.stringify(backup));
          localStorage.setItem('auto_backup_time', new Date().toISOString());
        } catch (e) {
          // localStorage不可用时，保存到内存存储
          memoryStorage['auto_backup_data'] = JSON.stringify(backup);
          memoryStorage['auto_backup_time'] = new Date().toISOString();
        }
        
        console.log('自动备份已保存');
      } catch (error) {
        console.error('自动备份保存失败:', error);
      }
    },

    // 检查备份时间并提醒 - 仅在数据可能丢失时提醒
    checkBackupReminder() {
      try {
        let backupTime = null;
        let autoBackupData = null;
        
        // 尝试从localStorage读取
        try {
          backupTime = localStorage.getItem('auto_backup_time');
          autoBackupData = localStorage.getItem('auto_backup_data');
        } catch (e) {
          // localStorage不可用时，从内存存储读取
          backupTime = memoryStorage['auto_backup_time'];
          autoBackupData = memoryStorage['auto_backup_data'];
        }
        
        // 如果没有备份记录，不提醒（首次使用）
        if (!backupTime || !autoBackupData) {
          return;
        }
        
        const lastBackup = new Date(backupTime);
        const now = new Date();
        const hoursSinceBackup = (now - lastBackup) / (1000 * 60 * 60);
        
        // 如果超过7天没有导出备份，提醒用户（正常备份不会触发提醒）
        if (hoursSinceBackup > 168) { // 168小时 = 7天
          const days = Math.floor(hoursSinceBackup / 24);
          const message = `距离上次导出备份已超过${days}天，建议立即导出备份以防数据丢失。是否现在导出？`;
          if (confirm(message)) {
            this.exportAllData();
          }
        }
      } catch (error) {
        console.error('检查备份时间失败:', error);
      }
    },

    // 渲染备份状态
    renderBackupStatus() {
      const statusEl = document.getElementById('backupStatus');
      if (!statusEl) return;
      
      try {
        const backupTime = localStorage.getItem('auto_backup_time');
        if (!backupTime) {
          statusEl.innerHTML = '<p class="backup-info">暂无备份记录</p>';
          return;
        }
        
        const lastBackup = new Date(backupTime);
        const now = new Date();
        const hoursSinceBackup = (now - lastBackup) / (1000 * 60 * 60);
        
        let statusClass = 'backup-ok';
        let statusText = '';
        
        if (hoursSinceBackup < 1) {
          statusText = '最近1小时内已自动备份';
          statusClass = 'backup-ok';
        } else if (hoursSinceBackup < 24) {
          statusText = `上次自动备份：${Math.floor(hoursSinceBackup)}小时前`;
          statusClass = 'backup-ok';
        } else {
          const days = Math.floor(hoursSinceBackup / 24);
          statusText = `上次自动备份：${days}天前（建议立即导出备份）`;
          statusClass = 'backup-warning';
        }
        
        statusEl.innerHTML = `
          <p class="backup-info ${statusClass}">
            <span class="backup-icon">${statusClass === 'backup-ok' ? '✅' : '⚠️'}</span>
            ${statusText}
          </p>
        `;
      } catch (error) {
        console.error('渲染备份状态失败:', error);
        statusEl.innerHTML = '<p class="backup-info">无法获取备份状态</p>';
      }
    },
    
    // 渲染批量同步按钮（仅管理员可见）
    renderBatchSyncButton() {
      const settingsEl = document.getElementById('backupStatus');
      if (!settingsEl) return;
      
      // 检查是否为管理员
      const isAdmin = this.isCurrentUserAdmin();
      if (!isAdmin) return;
      
      // 检查按钮是否已存在
      const existingBtn = document.getElementById('batchSyncBtn');
      if (existingBtn) return;
      
      // 添加批量同步按钮
      const btnContainer = document.createElement('div');
      btnContainer.style.marginTop = '15px';
      btnContainer.style.padding = '10px';
      btnContainer.style.background = '#f5f5f5';
      btnContainer.style.borderRadius = '8px';
      btnContainer.innerHTML = `
        <h4 style="margin: 0 0 10px 0;">批量数据同步（管理员）</h4>
        <p style="font-size: 12px; color: #666; margin-bottom: 10px;">
          将本地所有用户数据上传到云端，解决多平台数据不同步问题
        </p>
        <button id="batchSyncBtn" class="btn" style="background: #1890ff; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">
          一键同步所有用户数据
        </button>
        <button id="downloadCloudBtn" class="btn" style="background: #52c41a; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">
          从云端下载数据
        </button>
        <button id="clearStorageBtn" class="btn" style="background: #ff4d4f; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">
          清理存储空间
        </button>
        <div id="batchSyncStatus" style="margin-top: 10px; font-size: 12px;"></div>
      `;
      
      settingsEl.parentNode.appendChild(btnContainer);
      
      // 绑定一键同步按钮事件
      const batchSyncBtn = document.getElementById('batchSyncBtn');
      if (batchSyncBtn) {
        batchSyncBtn.addEventListener('click', async () => {
          if (!navigator.onLine) {
            alert('请检查网络连接');
            return;
          }
          
          const statusEl = document.getElementById('batchSyncStatus');
          if (statusEl) {
            statusEl.innerHTML = '<span style="color: #1890ff;">正在上传本地数据到云端，请稍候...</span>';
          }
          batchSyncBtn.disabled = true;
          
          try {
            const result = await this.uploadAllLocalUsersToCloud();
            if (result.success) {
              if (statusEl) {
                statusEl.innerHTML = `<span style="color: #52c41a;">✅ ${result.message}</span>`;
                // 同步完成后自动从云端下载最新数据
                setTimeout(async () => {
                  await this.downloadAllCloudUsersToLocal();
                  statusEl.innerHTML += '<br><span style="color: #52c41a;">✅ 云端数据已同步到本地</span>';
                }, 1000);
              }
            } else {
              if (statusEl) {
                statusEl.innerHTML = `<span style="color: #ff4d4f;">❌ ${result.message}</span>`;
              }
            }
          } catch (e) {
            if (statusEl) {
              statusEl.innerHTML = `<span style="color: #ff4d4f;">❌ 同步失败：${e.message}</span>`;
            }
          }
          
          batchSyncBtn.disabled = false;
        });
      }
      
      // 绑定从云端下载按钮事件
      const downloadCloudBtn = document.getElementById('downloadCloudBtn');
      if (downloadCloudBtn) {
        downloadCloudBtn.addEventListener('click', async () => {
          if (!navigator.onLine) {
            alert('请检查网络连接');
            return;
          }
          
          const statusEl = document.getElementById('batchSyncStatus');
          if (statusEl) {
            statusEl.innerHTML = '<span style="color: #1890ff;">正在从云端下载数据，请稍候...</span>';
          }
          downloadCloudBtn.disabled = true;
          
          try {
            const result = await this.downloadAllCloudUsersToLocal();
            if (result.success) {
              if (statusEl) {
                statusEl.innerHTML = `<span style="color: #52c41a;">✅ ${result.message}</span>`;
              }
            } else {
              if (statusEl) {
                statusEl.innerHTML = `<span style="color: #ff4d4f;">❌ ${result.message}</span>`;
              }
            }
          } catch (e) {
            if (statusEl) {
              statusEl.innerHTML = `<span style="color: #ff4d4f;">❌ 下载失败：${e.message}</span>`;
            }
          } finally {
            downloadCloudBtn.disabled = false;
          }
        });
      }
      
      // 绑定清理存储空间按钮事件
      const clearStorageBtn = document.getElementById('clearStorageBtn');
      if (clearStorageBtn) {
        clearStorageBtn.addEventListener('click', async () => {
          const statusEl = document.getElementById('batchSyncStatus');
          
          if (!confirm('⚠️ 警告：清理存储空间将删除所有本地备份数据！\n\n建议先导出重要数据后再清理。\n\n确定要继续吗？')) {
            return;
          }
          
          if (statusEl) {
            statusEl.innerHTML = '<span style="color: #1890ff;">正在清理存储空间...</span>';
          }
          clearStorageBtn.disabled = true;
          
          try {
            let cleanedCount = 0;
            let cleanedSize = 0;
            
            // 清理localStorage中的备份数据
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const key = localStorage.key(i);
              if (key && key.startsWith(`${APP_NAMESPACE}_backup_`)) {
                const value = localStorage.getItem(key);
                cleanedSize += (key.length + value.length) * 2;
                localStorage.removeItem(key);
                cleanedCount++;
              }
            }
            
            // 清理内存存储中的备份数据
            for (const key in memoryStorage) {
              if (key.startsWith(`${APP_NAMESPACE}_backup_`)) {
                delete memoryStorage[key];
                cleanedCount++;
              }
            }
            
            // 清理IndexedDB中的备份数据
            if (useIndexedDB && indexedDBReady) {
              try {
                const allKeys = await IndexedDBManager.getAllKeys();
                for (const key of allKeys) {
                  if (key.startsWith(`${APP_NAMESPACE}_backup_`)) {
                    await IndexedDBManager.removeItem(key);
                    cleanedCount++;
                  }
                }
              } catch (e) {
                console.error('清理IndexedDB备份失败:', e);
              }
            }
            
            // 重新检查存储空间
            const storageInfo = await checkStorageSpace();
            
            if (statusEl) {
              statusEl.innerHTML = `<span style="color: #52c41a;">✅ 清理完成！已清理 ${cleanedCount} 项数据，释放 ${(cleanedSize / 1024).toFixed(2)} KB 空间</span>`;
            }
            
            alert(`✅ 存储空间清理完成！\n\n已清理项目：${cleanedCount} 个\n释放空间：${(cleanedSize / 1024).toFixed(2)} KB\n\n当前存储使用率：${storageInfo ? storageInfo.percentUsed + '%' : '未知'}\n\n建议刷新页面后重新登录。`);
            
          } catch (e) {
            console.error('清理存储空间失败:', e);
            if (statusEl) {
              statusEl.innerHTML = `<span style="color: #ff4d4f;">❌ 清理失败：${e.message}</span>`;
            }
          } finally {
            clearStorageBtn.disabled = false;
          }
        });
      }
      
      console.log('已添加批量同步按钮（仅管理员可见）');
    },
    
    // 同步写入当前学生/班级数据到 localStorage，防止刷新前异步保存未完成导致数据丢失
    persistToLocalStorage() {
      try {
        const data = getUserData();
        if (!data || !data.classes) return;
        // 使用 this.currentClassId，避免全局 app.currentClassId 未更新导致找不到班级
        const classId = this.currentClassId || app.currentClassId || data.currentClassId || null;
        let currentClass = classId ? data.classes.find(function (c) { return c.id === classId; }) : null;
        // 如果还没选中班级且只有一个班级，默认使用唯一班级
        if (!currentClass && data.classes.length === 1) {
          currentClass = data.classes[0];
          data.currentClassId = currentClass.id;
          this.currentClassId = currentClass.id;
        }
        if (currentClass) {
          currentClass.students = app.students || [];
          currentClass.groups = app.groups || [];
          currentClass.groupPointHistory = app.groupPointHistory || [];
        }
        data.lastModified = new Date().toISOString();
        setUserData(data);
      } catch (e) {
        console.warn('persistToLocalStorage 失败:', e);
      }
    },

    saveStudents() {
      this.persistToLocalStorage();
      this.saveData();
    },

    // 本地备份存储
    saveToLocalBackup() {
      try {
        const classData = getClassData();
        const backupKey = `${APP_NAMESPACE}_backup_${this.currentClassId}`;
        const backupData = JSON.stringify({
          data: classData,
          timestamp: Date.now(),
          className: this.currentClassName
        });
        
        // 同时保存到localStorage和内存存储
        try {
          localStorage.setItem(backupKey, backupData);
        } catch (e) {
          console.log('localStorage保存失败，使用内存存储');
        }
        
        memoryStorage[backupKey] = backupData;
        console.log('本地备份保存成功');
      } catch (error) {
        console.error('本地备份保存失败:', error);
      }
    },
    
    // 从本地备份恢复
    loadFromLocalBackup() {
      try {
        const backupKey = `${APP_NAMESPACE}_backup_${this.currentClassId}`;
        let backupData = null;
        
        // 尝试从localStorage读取
        try {
          backupData = localStorage.getItem(backupKey);
        } catch (e) {
          // localStorage不可用时，从内存存储读取
          backupData = memoryStorage[backupKey];
        }
        
        if (backupData) {
          const parsed = JSON.parse(backupData);
          if (parsed.data) {
            setClassData(parsed.data);
            console.log('从本地备份恢复成功');
            return true;
          }
        }
      } catch (error) {
        console.error('从本地备份恢复失败:', error);
      }
      return false;
    },
    

    
    // 显示同步状态提示
    showSyncStatus(type, message) {
      // 创建状态提示元素
      const statusEl = document.createElement('div');
      statusEl.className = `sync-status sync-status-${type}`;
      statusEl.textContent = message;
      
      // 添加到页面
      document.body.appendChild(statusEl);
      
      // 3秒后自动消失
      setTimeout(() => {
        statusEl.classList.add('fade-out');
        setTimeout(() => statusEl.remove(), 500);
      }, 3000);
    },
    
    enableRealtimeSync() {
      // 启用实时同步
      console.log('实时同步已启用');
      // 启动自动同步机制
      this.enableAutoSyncRealtime();
    },
    
    disableRealtimeSync() {
      // 禁用实时同步，避免网络依赖
      if (this.channels) {
        Object.values(this.channels).forEach(channel => {
          try {
            channel.unsubscribe();
          } catch (error) {
            console.log('关闭订阅失败:', error);
          }
        });
        this.channels = {};
      }
    },
    applyTheme(theme) {
      document.body.setAttribute('data-theme', theme);
    },
    importStudents() { document.getElementById('importFile').click(); },
    openAddStudentModal() {
      document.getElementById('addStudentId').value = '';
      document.getElementById('addStudentName').value = '';
      const heightEl = document.getElementById('addStudentHeight');
      const vL = document.getElementById('addStudentVisionLeft');
      const vR = document.getElementById('addStudentVisionRight');
      const pPhone = document.getElementById('addStudentParentPhone');
      const fNote = document.getElementById('addStudentFamilyNote');
      if (heightEl) heightEl.value = '';
      if (vL) vL.value = '';
      if (vR) vR.value = '';
      if (pPhone) pPhone.value = '';
      if (fNote) fNote.value = '';
      const container = document.getElementById('addStudentAvatarOptions');
      if (container) {
        container.innerHTML = AVATAR_OPTIONS.slice(0, 18).map((av, i) =>
          '<button type="button" class="btn btn-small add-student-avatar-btn' + (i === 0 ? ' selected' : '') + '" data-avatar="' + av + '" style="font-size:1.2rem" title="' + av + '">' + av + '</button>'
        ).join('');
        container.querySelectorAll('.add-student-avatar-btn').forEach(btn => {
          btn.addEventListener('click', function () {
            container.querySelectorAll('.add-student-avatar-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            app._addStudentAvatar = this.dataset.avatar;
          });
        });
      }
      this._addStudentAvatar = AVATAR_OPTIONS[0] || '👦';
      document.getElementById('addStudentModal').classList.add('show');
    },
    closeAddStudentModal() {
      document.getElementById('addStudentModal').classList.remove('show');
    },

    openStore(tab = 'goods') {
      // 切换到商店页面
      this.changePage('store');
      
      // 切换到指定标签页
      setTimeout(() => {
        const tabElement = document.querySelector(`.store-tab[data-tab="${tab}"]`);
        if (tabElement) {
          tabElement.click();
        }
      }, 100);
    },
    closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove('show');
        if (modalId === 'studentScreenModal') {
          modal.classList.remove('student-screen-pure');
          document.body.classList.remove('mode-student-screen');
        }
        modal.style.display = '';
      }
    },

    showSuccess(message) {
      this.showSyncStatus('success', message);
    },
    saveAddStudent() {
      const id = (document.getElementById('addStudentId').value || '').trim();
      const name = (document.getElementById('addStudentName').value || '').trim();
      if (!id) { alert('请输入学号'); return; }
      if (!name) { alert('请输入姓名'); return; }
      if (this.students.some(s => String(s.id) === String(id))) { alert('该学号已存在'); return; }
      const avatar = this._addStudentAvatar || AVATAR_OPTIONS[0] || '👦';
      const height = (document.getElementById('addStudentHeight') && document.getElementById('addStudentHeight').value || '').trim();
      const visionLeft = (document.getElementById('addStudentVisionLeft') && document.getElementById('addStudentVisionLeft').value || '').trim();
      const visionRight = (document.getElementById('addStudentVisionRight') && document.getElementById('addStudentVisionRight').value || '').trim();
      const parentPhone = (document.getElementById('addStudentParentPhone') && document.getElementById('addStudentParentPhone').value || '').trim();
      const familyNote = (document.getElementById('addStudentFamilyNote') && document.getElementById('addStudentFamilyNote').value || '').trim();

      const student = { id, name, points: 0, avatar };
      if (height) student.height = height;
      if (visionLeft) student.visionLeft = visionLeft;
      if (visionRight) student.visionRight = visionRight;
      if (parentPhone) student.parentPhone = parentPhone;
      if (familyNote) student.familyNote = familyNote;

      this.students.push(student);
      this.saveStudents();
      this.closeAddStudentModal();
      this.renderStudents();
      this.renderDashboard();
      this.renderPetStudentList();
      this.renderStudentManage();
      this.renderCallStudentOptions();
      this.renderScoreHistory();
      this.loadBadgeAwardStudents();
      this.renderStore();
      alert('添加成功');
    },
    exportToExcel() {
      if (!this.students.length) { alert('暂无数据'); return; }
      const stagePoints = this.getStagePointsByStage(1);
      const totalStages = this.getTotalStages();
      const rows = this.students.map(s => {
        const type = s.pet ? window.PET_TYPES.find(t => t.id === s.pet.typeId) : null;
        const breed = type && s.pet ? type.breeds.find(b => b.id === s.pet.breedId) : null;
        return [
          s.id || '',
          s.name || '',
          s.points ?? 0,
          type ? type.name : '',
          breed ? breed.name : '',
          s.pet ? (s.pet.stage ?? 0) : '',
          s.pet ? (s.pet.stageProgress ?? 0) : '',
          s.pet && s.pet.badgesEarned ? s.pet.badgesEarned : ''
        ];
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, '学生数据');
      const safeName = (this.currentClassName || '班级').replace(/[/\\?*:\[\]]/g, '_');
      XLSX.writeFile(wb, (safeName ? safeName + '_' : '') + '班级宠物系统_导出.xlsx');
    },

    savePetSettings() {
      const name = document.getElementById('settingSystemName').value.trim();
      const className = document.getElementById('settingClassName').value.trim();
      const theme = document.getElementById('settingTheme').value;

      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (currentClass) {
        currentClass.sickDays = parseInt(document.getElementById('settingSickDays')?.value, 10) || currentClass.sickDays || 3;
        currentClass.monopolyRollCost = parseInt(document.getElementById('settingMonopolyRollCost')?.value, 10) || currentClass.monopolyRollCost || 1;
        currentClass.monopolyChallengePoints = parseInt(document.getElementById('settingMonopolyChallengePoints')?.value, 10) || currentClass.monopolyChallengePoints || 3;
        currentClass.monopolyOpportunityTask = document.getElementById('settingMonopolyOpportunityTask')?.value || currentClass.monopolyOpportunityTask || '全组30秒内回答3题';
        currentClass.monopolyOpportunityPoints = parseInt(document.getElementById('settingMonopolyOpportunityPoints')?.value, 10) || currentClass.monopolyOpportunityPoints || 4;
        currentClass.monopolyStealPoints = parseInt(document.getElementById('settingMonopolyStealPoints')?.value, 10) || currentClass.monopolyStealPoints || 2;
        currentClass.awakenPointsThreshold = Math.max(1, parseInt(document.getElementById('settingAwakenPointsThreshold')?.value, 10) || currentClass.awakenPointsThreshold || 100);
        currentClass.hospitalProjects = (document.getElementById('settingHospitalProjects')?.value || '复活针|8|revive\n急救药|3|cure')
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => {
            const parts = line.split('|');
            return {
              name: (parts[0] || '').trim(),
              cost: Math.max(1, parseInt(parts[1], 10) || 1),
              type: ((parts[2] || 'cure').trim() === 'revive' ? 'revive' : 'cure')
            };
          })
          .filter(x => x.name);
        setUserData(data);
      }

      const monoInput = document.getElementById('monopolyRollCost');
      if (monoInput) monoInput.value = String((currentClass && currentClass.monopolyRollCost) || 1);
      
      // 直接调用saveUserData保存所有设置
      this.saveUserData();
      
      // 更新UI显示
      var t = document.getElementById('systemTitleText');
      if (t) t.textContent = name || '萌兽成长营';
      else if (document.getElementById('systemTitle')) document.getElementById('systemTitle').textContent = name || '萌兽成长营';
      document.getElementById('currentClassName').textContent = className ? `| ${className}` : '';
      this.currentClassName = className;
      document.body.setAttribute('data-theme', theme);
      
      alert('已保存');
    },

    // 保存排名奖励设置
    saveRankBonusSettings() {
      const bonus1 = parseInt(document.getElementById('rankBonus1').value, 10) || 5;
      const bonus2 = parseInt(document.getElementById('rankBonus2').value, 10) || 3;
      const bonus3 = parseInt(document.getElementById('rankBonus3').value, 10) || 1;
      const period = document.getElementById('rankBonusPeriod').value || 'day';
      const u = getUserData();
      const cls = this.currentClassId ? (u.classes || []).find(c => c.id === this.currentClassId) : null;
      if (cls) {
        cls.rankBonus = { bonus1, bonus2, bonus3, period };
        setUserData(u);
      }
      alert('排名奖励设置已保存');
    },

    // 立即结算排名奖励
    applyRankBonus() {
      const u = getUserData();
      const cls = this.currentClassId ? (u.classes || []).find(c => c.id === this.currentClassId) : null;
      if (!cls) { alert('请先选择班级'); return; }
      const rankBonus = cls.rankBonus || { bonus1: 5, bonus2: 3, bonus3: 1, period: 'day' };
      // 读取设置页当前值（如果有）
      const b1 = parseInt(document.getElementById('rankBonus1') ? document.getElementById('rankBonus1').value : rankBonus.bonus1, 10) || rankBonus.bonus1;
      const b2 = parseInt(document.getElementById('rankBonus2') ? document.getElementById('rankBonus2').value : rankBonus.bonus2, 10) || rankBonus.bonus2;
      const b3 = parseInt(document.getElementById('rankBonus3') ? document.getElementById('rankBonus3').value : rankBonus.bonus3, 10) || rankBonus.bonus3;
      const period = document.getElementById('rankBonusPeriod') ? document.getElementById('rankBonusPeriod').value : (rankBonus.period || 'day');
      const periodMs = { day: 86400000, week: 604800000, month: 2592000000, semester: 15552000000 }[period] || 86400000;
      const since = Date.now() - periodMs;

      // 综合排名：按时间段内积分变化排序
      const ranked = this.students.map(s => {
        const periodPts = (s.scoreHistory || []).filter(h => (h.time || 0) >= since).reduce((sum, h) => sum + (h.delta || 0), 0);
        return { s, periodPts };
      }).sort((a, b) => b.periodPts - a.periodPts);

      const bonuses = [b1, b2, b3];
      const names = [];
      ranked.slice(0, 3).forEach((item, idx) => {
        if (item.periodPts <= 0) return;
        const bonus = bonuses[idx];
        if (!bonus) return;
        item.s.points = (item.s.points || 0) + bonus;
        if (!item.s.scoreHistory) item.s.scoreHistory = [];
        item.s.scoreHistory.push({ delta: bonus, reason: `排名第${idx+1}名奖励(${period})`, time: Date.now() });
        names.push(`${['🥇','🥈','🥉'][idx]} ${item.s.name} +${bonus}分`);
      });

      if (names.length === 0) { alert('本周期内暂无得分记录，无法结算'); return; }
      this.saveStudents();
      this.renderStudents();
      this.renderDashboard();
      this.renderHonor();
      alert('排名奖励已发放！\n' + names.join('\n'));
    },

    exportAllData() {
      const userList = getUserList();
      let currentUserId = null;
      
      // 尝试从localStorage读取当前用户ID
      try {
        const savedUser = localStorage.getItem(CURRENT_USER_KEY);
        if (savedUser) {
          const user = JSON.parse(savedUser);
          currentUserId = user.id;
        }
      } catch (e) {
        // localStorage不可用时，从内存存储读取
        const savedUser = memoryStorage[CURRENT_USER_KEY];
        if (savedUser) {
          try {
            const user = JSON.parse(savedUser);
            currentUserId = user.id;
          } catch (e) {}
        }
      }
      
      const userData = {};
      userList.forEach(function (user) {
        try {
          let raw = null;
          // 尝试从localStorage读取
          try {
            raw = localStorage.getItem(USER_DATA_PREFIX + user.id);
          } catch (e) {
            // localStorage不可用时，从内存存储读取
            raw = memoryStorage[USER_DATA_PREFIX + user.id];
          }
          if (raw) userData[user.id] = JSON.parse(raw);
        } catch (e) {}
      });
      const backup = {
        version: 1,
        exportTime: Date.now(),
        userList: userList,
        currentUserId: currentUserId || null,
        userData: userData
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '萌兽成长营_全部备份_' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      
      // 更新备份时间
      try {
        localStorage.setItem('auto_backup_time', new Date().toISOString());
      } catch (e) {
        // localStorage不可用时，更新内存存储
        memoryStorage['auto_backup_time'] = new Date().toISOString();
      }
      
      // 刷新备份状态显示
      this.renderBackupStatus();
      
      alert('备份已下载，请妥善保存该文件。迁移时在登录页点击「导入备份」选择此文件即可。');
    },

    // 导出当前班级数据
    exportCurrentClassData() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      if (!currentClass) {
        alert('请先选择或创建一个班级');
        return;
      }
      
      const exportData = {
        version: 1,
        exportTime: Date.now(),
        exportType: 'single_class',
        classData: currentClass
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `萌兽成长营_${currentClass.name}_班级数据_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      
      alert(`班级「${currentClass.name}」数据已导出`);
    },

    // 导出学生名单到Excel
    exportStudentsToExcel() {
      if (!this.students || this.students.length === 0) {
        alert('当前没有学生数据');
        return;
      }
      
      // 准备数据
      const data = this.students.map(s => ({
        '学号': s.id,
        '姓名': s.name,
        '头像': s.avatar || '👦',
        '积分': s.points || 0,
        '徽章': s.badges || 0,
        '宠物名称': s.pet ? s.pet.name : '未领养',
        '宠物阶段': s.pet ? (s.pet.stage || 0) : 0,
        '所在小组': s.groupName || '未分组'
      }));
      
      // 创建工作簿
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, '学生名单');
      
      // 导出文件
      const className = this.getCurrentClassName() || '班级';
      XLSX.writeFile(wb, `${className}_学生名单_${new Date().toISOString().slice(0, 10)}.xlsx`);
      
      alert('学生名单已导出为Excel文件');
    },

    // 获取当前班级名称
    getCurrentClassName() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      return currentClass ? currentClass.name : '';
    },

    // 处理数据导入
    handleImportData(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      const fileName = file.name.toLowerCase();
      
      reader.onload = (e) => {
        try {
          if (fileName.endsWith('.json')) {
            // 导入JSON备份文件
            const data = JSON.parse(e.target.result);
            this.importJsonData(data, fileName);
          } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
            // 导入Excel/CSV学生名单
            this.importExcelData(e.target.result, fileName);
          } else {
            alert('不支持的文件格式，请上传 .json, .xlsx, .xls 或 .csv 文件');
          }
        } catch (err) {
          alert('导入失败：' + (err.message || '文件格式错误'));
        }
        event.target.value = '';
      };
      
      if (fileName.endsWith('.json')) {
        reader.readAsText(file, 'UTF-8');
      } else {
        reader.readAsArrayBuffer(file);
      }
    },

    // 导入JSON数据
    importJsonData(data, fileName) {
      if (!data || typeof data !== 'object') {
        alert('无效的数据格式');
        return;
      }
      
      // 判断是完整备份还是单个班级数据
      if (data.exportType === 'single_class' && data.classData) {
        // 导入单个班级数据
        this.importSingleClassData(data.classData);
      } else if (data.userList && data.userData) {
        // 完整备份 - 在设置页面导入时询问是否覆盖
        if (confirm('检测到完整备份文件，导入将覆盖当前所有数据。是否继续？')) {
          doImportBackup(data);
        }
      } else {
        alert('无法识别的备份文件格式');
      }
    },

    // 导入单个班级数据
    importSingleClassData(classData) {
      if (!classData || !classData.name) {
        alert('无效的班级数据');
        return;
      }
      
      const data = getUserData();
      
      // 检查是否已存在同名班级
      const existingClass = data.classes.find(c => c.name === classData.name);
      if (existingClass) {
        if (!confirm(`已存在名为「${classData.name}」的班级，是否覆盖？`)) {
          return;
        }
        // 更新现有班级
        const index = data.classes.findIndex(c => c.id === existingClass.id);
        if (index > -1) {
          // 保留原有ID，更新其他数据
          classData.id = existingClass.id;
          data.classes[index] = classData;
        }
      } else {
        // 生成新ID并添加
        classData.id = 'class_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        data.classes.push(classData);
      }
      
      // 切换到导入的班级
      data.currentClassId = classData.id;
      setUserData(data);
      // 确保刷新后能恢复当前用户，避免数据“消失”
      if (this.currentUserId && this.currentUsername) {
        try {
          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ id: this.currentUserId, username: this.currentUsername }));
        } catch (e) {}
      }
      // 重新加载数据
      this.loadUserData();
      this.init();
      this.loadBroadcastSettings();
      this.updateBroadcastContent();
      this.updateClassSelect();
      
      alert(`班级「${classData.name}」导入成功！`);
    },

    // 导入Excel数据
    importExcelData(data, fileName) {
      try {
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        
        if (!rows || rows.length === 0) {
          alert('Excel文件中没有数据');
          return;
        }
        
        // 确保当前班级已定位（避免导入写入到“无班级上下文”导致列表不显示）
        const u0 = getUserData();
        if (!this.currentClassId) {
          if (u0.currentClassId) {
            this.currentClassId = u0.currentClassId;
          } else if (Array.isArray(u0.classes) && u0.classes.length > 0) {
            this.currentClassId = u0.classes[0].id;
            u0.currentClassId = this.currentClassId;
            setUserData(u0);
          }
        }

        // 兼容 students 可能被写成对象的历史数据，并确保只加载当前班级的学生
        const u0cls = this.currentClassId ? (u0.classes || []).find(c => c.id === this.currentClassId) : null;
        if (u0cls) {
          this.students = Array.isArray(u0cls.students) ? u0cls.students : [];
        } else if (!Array.isArray(this.students)) {
          this.students = this.students && typeof this.students === 'object' ? Object.values(this.students) : [];
        }

        const normalize = v => String(v == null ? '' : v).trim();
        const header = (rows[0] || []).map(v => normalize(v).toLowerCase());
        const idCol = header.findIndex(h => h.includes('学号') || h === 'id' || h === '编号' || h === 'studentid');
        const nameCol = header.findIndex(h => h.includes('姓名') || h === 'name' || h === '学生姓名' || h === 'studentname');
        const hasHeader = idCol >= 0 || nameCol >= 0;
        const idIdx = idCol >= 0 ? idCol : 0;
        const nameIdx = nameCol >= 0 ? nameCol : 1;

        const students = [];
        let successCount = 0;
        let skipCount = 0;
        const startRow = hasHeader ? 1 : 0;

        for (let i = startRow; i < rows.length; i++) {
          const row = Array.isArray(rows[i]) ? rows[i] : [];
          let rawId = normalize(row[idIdx]);
          let rawName = normalize(row[nameIdx]);

          // 兜底：若定位列为空，则取本行前两个非空单元格
          if (!rawId && !rawName) {
            const filled = row.map(normalize).filter(Boolean);
            rawId = filled[0] || '';
            rawName = filled[1] || '';
          } else if (!rawName) {
            const filled = row.map(normalize).filter(Boolean);
            rawName = filled.find(v => v !== rawId) || '';
          }

          if (!rawId && !rawName) continue;

          const baseId = rawId || ('S' + String(Date.now()).slice(-6) + String(i + 1).padStart(3, '0'));
          let sid = baseId;
          let bump = 1;
          while (this.students.some(s => s.id === sid) || students.some(s => s.id === sid)) {
            if (rawId) {
              sid = baseId + '_' + bump;
              bump++;
            } else {
              sid = '';
              break;
            }
          }
          if (!sid) { skipCount++; continue; }

          students.push({
            id: sid,
            name: rawName || sid,
            avatar: '👦',
            points: 0,
            badges: 0,
            groupName: ''
          });
          successCount++;
        }
        
        if (students.length > 0) {
          this.students = (Array.isArray(this.students) ? this.students : []).concat(students);

          // 强制写回当前班级并持久化
          const u = getUserData();
          const classId = this.currentClassId || u.currentClassId;
          const cls = classId ? (u.classes || []).find(c => c.id === classId) : null;
          if (cls) {
            cls.students = this.students;
            u.currentClassId = classId;
            setUserData(u);
          }

          this.saveStudents();
          const searchEl = document.getElementById('studentSearch');
          if (searchEl) searchEl.value = '';
          this.showPage('students');
          this.renderStudents();
          this.renderDashboard();
          this.renderHonor();
          this.renderStudentManage();
          this.loadBadgeAwardStudents();
          
          let msg = `成功导入 ${successCount} 名学生`;
          if (skipCount > 0) msg += `，跳过 ${skipCount} 条重复记录`;
          
          // 诊断弹窗：显示实际写入的数据
          const userData = getUserData();
          const currentCls = userData.classes && userData.classes.find(c => c.id === this.currentClassId);
          const actualCount = currentCls && Array.isArray(currentCls.students) ? currentCls.students.length : 0;
          const debugMsg = `
【导入诊断】
✓ 导入提示: ${msg}
✓ 当前班级ID: ${this.currentClassId}
✓ 班级名称: ${this.currentClassName}
✓ 内存中学生数: ${this.students.length}
✓ 存储中班级学生数: ${actualCount}
✓ 前3个学生: ${this.students.slice(0, 3).map(s => s.name + '(' + s.id + ')').join(', ')}

如果"存储中班级学生数"为0，说明数据没写进班级。
如果"内存中学生数"不为0但页面空白，说明是渲染问题。
          `;
          alert(debugMsg);
        } else {
          alert('没有可导入的学生数据：请确保表格前两列为“学号、姓名”（或包含对应表头）');
        }
      } catch (err) {
        alert('Excel导入失败：' + (err.message || '文件格式错误'));
      }
    },

    // 刷新设备列表
    refreshDevices() {
      this.renderDevicesList();
    },

    // 渲染设备列表
    renderDevicesList() {
      const devicesList = document.getElementById('devicesList');
      if (!devicesList) return;
      
      const users = getUserList();
      const user = users.find(u => u.id === this.currentUserId);
      
      if (!user || !user.devices || user.devices.length === 0) {
        devicesList.innerHTML = '<p class="placeholder-text">暂无绑定的设备</p>';
        return;
      }
      
      // 获取当前设备ID
      let currentDeviceId = null;
      try {
        const savedUser = localStorage.getItem(CURRENT_USER_KEY);
        if (savedUser) {
          const userInfo = JSON.parse(savedUser);
          currentDeviceId = userInfo.deviceId;
        }
      } catch (e) {
        console.error('获取当前设备ID失败:', e);
      }
      
      devicesList.innerHTML = user.devices.map((device, index) => {
        const isCurrent = device.id === currentDeviceId;
        const deviceName = device.name.length > 50 ? device.name.substring(0, 50) + '...' : device.name;
        
        return `
          <div class="device-item ${isCurrent ? 'current' : ''}" style="position: relative;">
            <div class="device-info">
              <div class="device-name">设备 ${index + 1}</div>
              <div class="device-id">设备ID: ${device.id.substring(0, 10)}...</div>
              <div class="device-time">最后登录: ${new Date(device.lastLogin).toLocaleString()}</div>
            </div>
            <div class="device-actions">
              ${!isCurrent ? `
                <button class="btn btn-danger" onclick="app.removeDevice('${device.id}')">解绑</button>
              ` : `
                <span class="btn btn-secondary" disabled>当前设备</span>
              `}
            </div>
          </div>
        `;
      }).join('');
    },

    // 解绑设备
    removeDevice(deviceId) {
      if (!confirm('确定要解绑此设备吗？解绑后该设备需要重新登录。')) {
        return;
      }
      
      const users = getUserList();
      const userIndex = users.findIndex(u => u.id === this.currentUserId);
      
      if (userIndex === -1) {
        alert('未找到用户信息');
        return;
      }
      
      const user = users[userIndex];
      if (!user.devices) {
        alert('设备列表为空');
        return;
      }
      
      // 移除设备
      user.devices = user.devices.filter(d => d.id !== deviceId);
      setUserList(users);
      
      // 重新渲染设备列表
      this.renderDevicesList();
      alert('设备已解绑');
    },

    // ===== 管理员功能 =====
    
    // 管理员登录
    adminLogin(username, password) {
      const admin = ADMIN_ACCOUNTS.find(a => a.username === username && a.password === password);
      if (admin) {
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'block';
        this.renderLicensesList();
        this.renderAdminUsersList();
        return true;
      }
      alert('管理员账号或密码错误');
      return false;
    },
    
    // 退出管理员
    logoutAdmin() {
      try {
        document.getElementById('admin-panel').style.display = 'none';
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.style.display = 'block';
        }
      } catch (error) {
        console.error('退出管理后台失败:', error);
      }
    },
    
    // 打开管理后台
    openAdminPanel() {
      try {
        console.log('打开管理后台');
        const mainContent = document.querySelector('.main-content');
        const adminPanel = document.getElementById('admin-panel');
        
        console.log('mainContent:', mainContent);
        console.log('adminPanel:', adminPanel);
        
        if (mainContent) {
          mainContent.style.display = 'none';
        }
        if (adminPanel) {
          adminPanel.style.display = 'block';
        }
        
        console.log('开始渲染授权码列表');
        this.renderLicensesList();
        console.log('开始渲染用户列表');
        this.renderAdminUsersList();
        console.log('管理后台打开完成');
      } catch (error) {
        console.error('打开管理后台失败:', error);
        alert('打开管理后台失败: ' + error.message);
      }
    },
    
    // 生成新授权码
    async generateNewLicense() {
      const newLicense = {
        key: generateLicenseKey(),
        createdAt: new Date().toISOString(),
        used: false,
        expireAt: null // 可以设置过期时间
      };
      
      const licenses = getLicenses();
      licenses.push(newLicense);
      setLicenses(licenses);
      
      // 实时同步到云端
      if (navigator.onLine) {
        try {
          console.log('生成授权码后实时同步到云端...');
          await this.syncToCloud();
          console.log('授权码已同步到云端');
        } catch (e) {
          console.error('同步授权码到云端失败:', e);
        }
      }
      
      this.renderLicensesList();
      alert(`新授权码已生成：${newLicense.key}`);
    },
    
    // 批量生成授权码
    async batchGenerateLicenses() {
      const count = prompt('请输入要生成的授权码数量：', '10');
      const num = parseInt(count);
      
      if (isNaN(num) || num < 1 || num > 100) {
        alert('请输入1-100之间的有效数字');
        return;
      }
      
      const licenses = getLicenses();
      const newLicenses = [];

      for (let i = 0; i < num; i++) {
        const newLicense = {
          key: generateLicenseKey(),
          createdAt: new Date().toISOString(),
          used: false,
          expireAt: null
        };
        licenses.push(newLicense);
        newLicenses.push(newLicense);
      }
      
      setLicenses(licenses);
      
      // 实时同步到云端
      if (navigator.onLine) {
        try {
          console.log('批量生成授权码后实时同步到云端...');
          await this.syncToCloud();
          console.log('授权码已同步到云端');
        } catch (e) {
          console.error('同步授权码到云端失败:', e);
        }
      }
      
      this.renderLicensesList();
      
      // 生成授权码列表文本
      const licenseText = newLicenses.map(l => l.key).join('\n');
      
      // 创建临时文本文件并下载
      const blob = new Blob([licenseText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `licenses_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert(`成功生成 ${num} 个授权码，已自动下载到本地文件`);
    },
    
    // 渲染授权码列表
    renderLicensesList() {
      try {
        const licensesList = document.getElementById('licensesList');
        if (!licensesList) return;
        
        const licenses = getLicenses();
        
        if (licenses.length === 0) {
          licensesList.innerHTML = '<p class="placeholder-text">暂无授权码，请点击上方按钮生成</p>';
          return;
        }
        
        licensesList.innerHTML = licenses.map(license => `
          <div class="license-item ${license.used ? 'used' : ''}">
            <div class="license-key">${license.key}</div>
            <div class="license-status ${license.used ? 'used' : 'available'}">
              ${license.used ? 
                `已使用 - ${license.userId ? '用户: ' + license.userId.substring(0, 8) + '...' : ''} - ${license.activatedAt ? new Date(license.activatedAt).toLocaleString() : '未知时间'}` : 
                '未使用 - 创建于 ' + new Date(license.createdAt).toLocaleDateString()
              }
            </div>
          </div>
        `).join('');
      } catch (error) {
        console.error('渲染授权码列表失败:', error);
      }
    },
    
    // 导出授权码
    exportLicenses() {
      const licenses = getLicenses();
      const availableLicenses = licenses.filter(l => !l.used);
      
      if (availableLicenses.length === 0) {
        alert('没有可用的授权码可导出');
        return;
      }
      
      const licenseText = availableLicenses.map(l => l.key).join('\n');
      const blob = new Blob([licenseText], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `授权码列表_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      
      alert(`已导出 ${availableLicenses.length} 个授权码`);
    },
    
    // 渲染用户列表（管理员）
    renderAdminUsersList() {
      try {
        const adminUsersList = document.getElementById('adminUsersList');
        if (!adminUsersList) return;
        
        const users = getUserList();
        
        if (users.length === 0) {
          adminUsersList.innerHTML = '<p class="placeholder-text">暂无注册用户</p>';
          return;
        }
        
        adminUsersList.innerHTML = users.map(user => `
          <div class="admin-user-item">
            <div class="admin-user-name">${user.username || '未知用户'}</div>
            <div class="admin-user-info">
              注册时间: ${user.createdAt ? new Date(user.createdAt).toLocaleString() : '未知时间'}<br>
              设备数量: ${user.devices ? user.devices.length : 0} / ${user.maxDevices || 5}<br>
              授权码: ${user.licenseKey ? user.licenseKey.substring(0, 10) + '...' : '无'}
            </div>
            <div class="admin-user-actions">
              <button class="btn btn-danger btn-small" onclick="app.deleteUser('${user.id}')">删除用户</button>
              <button class="btn btn-secondary btn-small" onclick="app.resetUserDevices('${user.id}')">重置设备</button>
            </div>
          </div>
        `).join('');
      } catch (error) {
        console.error('渲染用户列表失败:', error);
      }
    },
    
    // 删除用户
    deleteUser(userId) {
      if (!confirm('确定要删除此用户吗？此操作不可恢复！')) {
        return;
      }
      
      let users = getUserList();
      users = users.filter(u => u.id !== userId);
      setUserList(users);
      
      // 同时删除用户数据
      try {
        localStorage.removeItem(USER_DATA_PREFIX + userId);
      } catch (e) {}
      
      this.renderAdminUsersList();
      alert('用户已删除');
    },
    
    // 重置用户设备
    resetUserDevices(userId) {
      if (!confirm('确定要重置此用户的所有设备吗？重置后用户需要重新登录。')) {
        return;
      }
      
      const users = getUserList();
      const user = users.find(u => u.id === userId);
      
      if (user) {
        user.devices = [];
        setUserList(users);
        this.renderAdminUsersList();
        alert('用户设备已重置');
      }
    },

    renderStudentManage() {
      const select = document.getElementById('studentManageSelect');
      if (!select) return;
      
      // 清空并重新填充下拉框
      select.innerHTML = '<option value="">请选择要删除的学生</option>';
      this.students.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.id})`;
        select.appendChild(opt);
      });
    },

    renderCallStudentOptions() {
      const select = document.getElementById('callStudentSelect');
      if (!select) return;
      select.innerHTML = '<option value="">请选择学生</option>';
      this.students.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name}（${s.id}）`;
        select.appendChild(opt);
      });
    },

    callStudentNow() {
      const sid = document.getElementById('callStudentSelect')?.value;
      const msgInput = document.getElementById('callStudentMessage');
      const s = this.students.find(x => x.id === sid);
      if (!s) {
        alert('请先选择要呼叫的学生');
        return;
      }
      const text = (msgInput?.value || '').trim() || `请${s.name}同学到老师这里来`; 
      this.showWinBanner(`📣 ${s.name} 同学请注意`, text);
      this.showScoreRain(16);
      this.speak(text);
      this.addBroadcastMessage(s.name, 0, `老师呼叫：${text}`);
      if (msgInput) msgInput.value = '';
    },

    updateSyncDigest() {
      const el = document.getElementById('syncDigest');
      if (!el) return;
      const data = getUserData();
      const classes = Array.isArray(data.classes) ? data.classes : [];
      const totalStudents = classes.reduce((n, c) => n + ((c.students && c.students.length) || 0), 0);
      const totalGroups = classes.reduce((n, c) => n + ((c.groups && c.groups.length) || 0), 0);
      const ts = data.lastModified ? new Date(data.lastModified).toLocaleString() : '暂无';
      el.textContent = `数据摘要：班级 ${classes.length} 个 ｜ 学生 ${totalStudents} 人 ｜ 小组 ${totalGroups} 个 ｜ 本机最后更新 ${ts}`;
    },

    summarizeDataForConflict(data) {
      const safe = data && typeof data === 'object' ? data : {};
      const classes = Array.isArray(safe.classes) ? safe.classes : [];
      const classCount = classes.length;
      const studentCount = classes.reduce((n, c) => n + ((c && c.students && c.students.length) || 0), 0);
      const groupCount = classes.reduce((n, c) => n + ((c && c.groups && c.groups.length) || 0), 0);
      const modifiedAt = safe.lastModified || '';
      return {
        classCount,
        studentCount,
        groupCount,
        modifiedAt,
        modifiedText: modifiedAt ? new Date(modifiedAt).toLocaleString() : '暂无'
      };
    },

    renderConflictSummaryList(targetId, summary) {
      const el = document.getElementById(targetId);
      if (!el) return;
      if (!summary) {
        el.innerHTML = '<li>暂无数据</li>';
        return;
      }
      el.innerHTML = `
        <li>最后更新时间：${summary.modifiedText}</li>
        <li>班级数量：${summary.classCount}</li>
        <li>学生人数：${summary.studentCount}</li>
        <li>小组数量：${summary.groupCount}</li>
      `;
    },

    async checkSyncConflict() {
      const hintEl = document.getElementById('conflictHint');
      const localData = getUserData();
      const localSummary = this.summarizeDataForConflict(localData);
      this.renderConflictSummaryList('localConflictSummary', localSummary);

      const userIdStr = this.currentUserId ? String(this.currentUserId).trim() : '';
      if (!navigator.onLine || !userIdStr) {
        this.renderConflictSummaryList('cloudConflictSummary', null);
        if (hintEl) hintEl.textContent = '当前离线或未登录，无法读取云端摘要。';
        return;
      }

      try {
        const rows = await this.fetchUserDataViaRest(userIdStr);
        const row = rows && rows[0] ? rows[0] : null;
        let cloudData = row ? row.data : null;
        const cloudTimestamp = row ? String(row.updatedAt || '') : '';
        if (typeof cloudData === 'string') {
          try { cloudData = JSON.parse(cloudData); } catch (e) {}
        }
        if (cloudData && cloudTimestamp && !cloudData.lastModified) cloudData.lastModified = cloudTimestamp;
        const cloudSummary = cloudData ? this.summarizeDataForConflict(cloudData) : null;
        this.renderConflictSummaryList('cloudConflictSummary', cloudSummary);

        if (!cloudSummary) {
          if (hintEl) hintEl.textContent = '云端暂无数据：建议点击“保留本机（推送覆盖云端）”。';
          return;
        }

        const localTs = Date.parse(localSummary.modifiedAt || '') || 0;
        const cloudTs = Date.parse(cloudSummary.modifiedAt || '') || 0;
        if (localTs > cloudTs || localSummary.studentCount > cloudSummary.studentCount) {
          if (hintEl) hintEl.textContent = '建议：保留本机（本机更新或数据更多）。';
        } else if (cloudTs > localTs || cloudSummary.studentCount > localSummary.studentCount) {
          if (hintEl) hintEl.textContent = '建议：采用云端（云端更新或数据更多）。';
        } else {
          if (hintEl) hintEl.textContent = '本机与云端看起来一致，可继续正常使用。';
        }
      } catch (e) {
        console.error('检测冲突失败:', e);
        this.renderConflictSummaryList('cloudConflictSummary', null);
        if (hintEl) hintEl.textContent = '读取云端摘要失败，请稍后再试。';
      }
    },

    async resolveConflictKeepLocal() {
      await this.syncToCloud();
      await this.checkSyncConflict();
      this.showSuccess('已保留本机数据，并推送到云端');
    },

    async resolveConflictUseCloud() {
      await this.syncFromCloud(false, true);
      await this.checkSyncConflict();
      this.showSuccess('已采用云端数据覆盖本机');
    },

    deleteStudentFromSettings() {
      const select = document.getElementById('studentManageSelect');
      if (!select || !select.value) {
        alert('请先选择要删除的学生');
        return;
      }
      const studentId = select.value;
      const student = this.students.find(s => s.id === studentId);
      if (!student) {
        alert('未找到该学生');
        return;
      }
      if (!confirm(`确定要删除学生「${student.name}」吗？此操作不可恢复！`)) return;
      
      const index = this.students.findIndex(s => s.id === studentId);
      if (index === -1) return;
      this.students.splice(index, 1);
      this.saveStudents();
      this.renderStudents();
      this.renderHonor();
      this.renderDashboard();
      this.renderStudentManage();
      this.renderCallStudentOptions();
      this.renderScoreHistory();
      this.loadBadgeAwardStudents();
      this.renderStore();
      alert('学生已删除');
    },

    // 删除当前班级的所有学生（仅影响当前登录账号、当前班级）
    deleteAllStudentsInCurrentClass() {
      if (!this.currentClassId) {
        alert('请先在系统设置中选择班级');
        return;
      }
      if (!this.students || this.students.length === 0) {
        alert('当前班级没有学生可以删除');
        return;
      }
      if (!confirm('确定要删除当前班级的所有学生吗？此操作不可恢复，且仅影响当前账号的本地/云端数据。')) {
        return;
      }

      // 只清空当前班级的学生数组和相关缓存
      this.students = [];
      this.saveStudents();
      this.renderStudents();
      this.renderHonor();
      this.renderDashboard();
      this.renderStudentManage();
      this.renderCallStudentOptions();
      this.renderScoreHistory();
      this.loadBadgeAwardStudents();
      this.renderStore();
      alert('当前班级的所有学生已删除');
    },

    // 加载勋章发放的学生列表
    loadBadgeAwardStudents() {
      const select = document.getElementById('badgeAwardStudentSelect');
      if (!select) return;
      
      // 清空并重新填充下拉框
      select.innerHTML = '<option value="">请选择学生</option>';
      this.students.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.id})`;
        select.appendChild(opt);
      });
    },

    // 发放勋章
    awardBadge() {
      const select = document.getElementById('badgeAwardStudentSelect');
      const countInput = document.getElementById('badgeAwardCount');
      const reasonInput = document.getElementById('badgeAwardReason');
      
      if (!select || !select.value) {
        alert('请选择要发放勋章的学生');
        return;
      }
      
      const studentId = select.value;
      const count = parseInt(countInput.value, 10) || 1;
      const reason = reasonInput.value.trim() || '表现优秀';
      
      const student = this.students.find(s => s.id === studentId);
      if (!student) {
        alert('未找到该学生');
        return;
      }
      
      // 确保 completedPets 数组存在
      if (!student.completedPets) {
        student.completedPets = [];
      }
      
      // 直接发放勋章（不需要通过宠物养成）
      for (let i = 0; i < count; i++) {
        student.completedPets.push({
          id: `badge_${Date.now()}_${i}`,
          name: `荣誉勋章 ${new Date().toLocaleDateString()}`,
          badgesEarned: 1,
          awardedAt: Date.now(),
          reason: reason
        });
      }
      
      this.saveStudents();
      this.renderStudents();
      this.renderHonor();
      this.addBroadcastMessage(student.name, 0, `获得 ${count} 枚勋章：${reason}`);
      
      // 显示发放成功特效
      this.showBadgeAwardEffect(studentId, count);
      
      // 清空表单
      reasonInput.value = '';
      countInput.value = '1';
      
      this.renderStore();
      
      alert(`已成功为 ${student.name} 发放 ${count} 枚勋章！`);
    },

    // 显示勋章发放特效
    showBadgeAwardEffect(studentId, count) {
      const card = document.querySelector('.student-card-v2[data-student-id="' + studentId + '"]');
      if (!card) return;
      
      const petContainer = card.querySelector('.student-card-v2-pet');
      if (!petContainer) return;
      
      const rect = petContainer.getBoundingClientRect();
      
      // 创建勋章特效
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const effect = document.createElement('div');
          effect.className = 'badge-award-effect';
          effect.textContent = '🏅';
          effect.style.left = rect.left + rect.width / 2 + 'px';
          effect.style.top = rect.top + rect.height / 2 + 'px';
          effect.style.animationDelay = i * 0.2 + 's';
          document.body.appendChild(effect);
          
          setTimeout(() => effect.remove(), 1500);
        }, i * 200);
      }
    },

    renderScoreHistory() {
      const studentFilter = document.getElementById('scoreHistoryStudentFilter');
      const typeFilter = document.getElementById('scoreHistoryTypeFilter');
      const list = document.getElementById('scoreHistoryList');
      if (!studentFilter || !list) return;
      
      // 更新学生筛选下拉框
      if (studentFilter.options.length <= 1) {
        this.students.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name;
          studentFilter.appendChild(opt);
        });
      }
      
      const selectedStudent = studentFilter.value;
      const selectedType = typeFilter ? typeFilter.value : '';
      
      // 收集所有积分记录
      let records = [];
      this.students.forEach(s => {
        if (selectedStudent && s.id !== selectedStudent) return;
        if (s.scoreHistory && s.scoreHistory.length > 0) {
          s.scoreHistory.forEach(h => {
            if (selectedType) {
              const isPlus = h.delta > 0;
              if (selectedType === 'plus' && !isPlus) return;
              if (selectedType === 'minus' && isPlus) return;
            }
            records.push({
              studentName: s.name,
              studentId: s.id,
              time: h.time,
              delta: h.delta,
              reason: h.reason,
              isPlus: h.delta > 0
            });
          });
        }
      });
      
      // 按时间倒序排列
      records.sort((a, b) => b.time - a.time);
      
      // 渲染列表
      if (records.length === 0) {
        list.innerHTML = '<p class="placeholder-text">暂无积分记录</p>';
        return;
      }
      
      const formatTime = (timestamp) => {
        const d = new Date(timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      };
      
      list.innerHTML = records.map(r => `
        <div class="score-history-item ${r.isPlus ? 'plus' : 'minus'}">
          <span class="score-history-time">${formatTime(r.time)}</span>
          <span class="score-history-name">${this.escape(r.studentName)}</span>
          <span class="score-history-reason">${this.escape(r.reason)}</span>
          <span class="score-history-delta">${r.delta > 0 ? '+' : ''}${r.delta}</span>
        </div>
      `).join('');
    },

    exportScoreHistoryToExcel() {
      const studentFilter = document.getElementById('scoreHistoryStudentFilter');
      const typeFilter = document.getElementById('scoreHistoryTypeFilter');
      const selectedStudent = studentFilter ? studentFilter.value : '';
      const selectedType = typeFilter ? typeFilter.value : '';
      
      // 收集所有积分记录
      let records = [];
      this.students.forEach(s => {
        if (selectedStudent && s.id !== selectedStudent) return;
        if (s.scoreHistory && s.scoreHistory.length > 0) {
          s.scoreHistory.forEach(h => {
            if (selectedType) {
              const isPlus = h.delta > 0;
              if (selectedType === 'plus' && !isPlus) return;
              if (selectedType === 'minus' && isPlus) return;
            }
            const d = new Date(h.time);
            records.push({
              时间: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`,
              学号: s.id,
              姓名: s.name,
              类型: h.delta > 0 ? '加分' : '减分',
              原因: h.reason,
              积分变化: h.delta
            });
          });
        }
      });
      
      // 按时间倒序排列
      records.sort((a, b) => new Date(b.时间) - new Date(a.时间));
      
      if (records.length === 0) {
        alert('没有可导出的记录');
        return;
      }
      
      // 创建Excel
      const ws = XLSX.utils.json_to_sheet(records);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '积分记录');
      
      // 设置列宽
      ws['!cols'] = [
        { wch: 20 }, // 时间
        { wch: 12 }, // 学号
        { wch: 10 }, // 姓名
        { wch: 8 },  // 类型
        { wch: 20 }, // 原因
        { wch: 10 }  // 积分变化
      ];
      
      // 导出文件
      const fileName = `积分记录_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    },

    escape(str) {
      if (str == null) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    renderGroups() {
      const container = document.getElementById('groupsList');
      if (!container) return;
      
      if (this.groups.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无小组，点击"添加小组"创建</div>';
        this.updateGroupStats();
        return;
      }
      
      container.innerHTML = this.groups.map(group => {
        const members = this.getGroupMembers(group.id);
        const leader = members.find(m => m.isLeader);
        const memberAvatars = members.slice(0, 6).map(m => 
          `<div class="group-member-avatar" title="${this.escape(m.name)}">${m.avatar}</div>`
        ).join('');
        const moreCount = members.length > 6 ? `<span style="font-size:0.8rem;color:var(--text-muted)">+${members.length - 6}</span>` : '';
        
        return `
          <div class="group-card" onclick="app.openGroupDetailModal('${group.id}')">
            <div class="group-card-header">
              <span class="group-name">${this.escape(group.name)}</span>
              <div class="group-actions">
                <button class="btn btn-small" onclick="event.stopPropagation(); app.openEditGroupModal('${group.id}')">编辑</button>
                <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); app.deleteGroup('${group.id}')">删除</button>
              </div>
            </div>
            <div class="group-info">
              <div class="group-info-item">
                <span class="icon">👥</span>
                <span class="value">${members.length} 名成员</span>
              </div>
              <div class="group-info-item">
                <span class="icon">📅</span>
                <span class="value">${new Date(group.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            ${leader ? `
              <div class="group-leader">
                <span class="leader-icon">👑</span>
                <span class="leader-name">${this.escape(leader.name)}</span>
              </div>
            ` : ''}
            <div class="group-members-preview">
              ${memberAvatars}
              ${moreCount}
            </div>
            <div class="group-points">
              <span class="points-label">小组积分</span>
              <span class="points-value">${group.points || 0}</span>
            </div>
            <div class="group-card-actions" style="margin-top: 12px; display: flex; gap: 8px;">
              <button class="btn btn-small btn-primary" onclick="event.stopPropagation(); app.openGroupPointModal('${group.id}')" style="flex: 1;">积分</button>
              <button class="btn btn-small" onclick="event.stopPropagation(); app.openGroupDetailModal('${group.id}')" style="flex: 1;">详情</button>
            </div>
          </div>
        `;
      }).join('');
      
      this.updateGroupStats();
    },

    renderUngroupedStudents() {
      const container = document.getElementById('ungroupedStudentsList');
      if (!container) return;
      
      const ungroupedStudents = this.students.filter(student => {
        return !this.groups.some(group => 
          group.members && group.members.some(m => m.studentId === student.id)
        );
      });
      
      if (ungroupedStudents.length === 0) {
        container.innerHTML = '<div class="empty-state">所有学生都已分组</div>';
        return;
      }
      
      container.innerHTML = ungroupedStudents.map(student => `
        <div class="ungrouped-student-card" onclick="app.openAddStudentToGroupModal('${student.id}')">
          <div class="ungrouped-student-avatar">${student.avatar}</div>
          <div class="ungrouped-student-info">
            <div class="ungrouped-student-name">${this.escape(student.name)}</div>
            <div class="ungrouped-student-id">${this.escape(student.id)}</div>
          </div>
        </div>
      `).join('');
    },

    updateGroupStats() {
      const totalGroups = this.groups.length;
      const allGroupedStudents = this.groups.reduce((total, group) => {
        return total + (group.members ? group.members.length : 0);
      }, 0);
      const ungroupedStudents = this.students.filter(student => {
        return !this.groups.some(group => 
          group.members && group.members.some(m => m.studentId === student.id)
        );
      }).length;
      
      document.getElementById('groupStatTotal').textContent = totalGroups;
      document.getElementById('groupStatMembers').textContent = allGroupedStudents;
      document.getElementById('groupStatUngrouped').textContent = ungroupedStudents;
    },

    getGroupMembers(groupId) {
      const group = this.groups.find(g => g.id === groupId);
      if (!group || !group.members) return [];
      
      return group.members.map(member => {
        const student = this.students.find(s => s.id === member.studentId);
        return {
          ...member,
          name: student ? student.name : member.studentId,
          avatar: student ? student.avatar : '👤'
        };
      });
    },

    openAddGroupModal() {
      const modal = document.getElementById('addGroupModal');
      if (modal) {
        modal.style.display = 'flex';
        document.getElementById('groupName').value = '';
        document.getElementById('groupName').focus();
      }
    },

    addGroup() {
      const nameInput = document.getElementById('groupName');
      const name = nameInput.value.trim();
      
      if (!name) {
        alert('请输入小组名称');
        return;
      }
      
      const newGroup = {
        id: 'group_' + Date.now(),
        name: name,
        createdAt: new Date().toISOString(),
        members: [],
        points: 0
      };
      
      this.groups.push(newGroup);
      setStorage(STORAGE_KEYS.groups, this.groups);
      
      this.closeModal('addGroupModal');
      this.renderGroups();
      this.renderUngroupedStudents();
      this.showSuccess('小组创建成功');
    },

    openEditGroupModal(groupId) {
      const group = this.groups.find(g => g.id === groupId);
      if (!group) return;
      
      const modal = document.getElementById('editGroupModal');
      if (modal) {
        modal.style.display = 'flex';
        document.getElementById('editGroupId').value = groupId;
        document.getElementById('editGroupName').value = group.name;
        document.getElementById('editGroupName').focus();
      }
    },

    editGroup() {
      const groupId = document.getElementById('editGroupId').value;
      const nameInput = document.getElementById('editGroupName');
      const name = nameInput.value.trim();
      
      if (!name) {
        alert('请输入小组名称');
        return;
      }
      
      const group = this.groups.find(g => g.id === groupId);
      if (group) {
        group.name = name;
        setStorage(STORAGE_KEYS.groups, this.groups);
        
        this.closeModal('editGroupModal');
        this.renderGroups();
        this.showSuccess('小组更新成功');
      }
    },

    deleteGroup(groupId) {
      if (!confirm('确定要删除这个小组吗？小组中的成员将变为未分组状态。')) {
        return;
      }
      
      this.groups = this.groups.filter(g => g.id !== groupId);
      setStorage(STORAGE_KEYS.groups, this.groups);
      
      this.renderGroups();
      this.renderUngroupedStudents();
      this.showSuccess('小组删除成功');
    },

    openGroupDetailModal(groupId) {
      const group = this.groups.find(g => g.id === groupId);
      if (!group) return;
      
      const members = this.getGroupMembers(groupId);
      const leader = members.find(m => m.isLeader);
      
      const modal = document.getElementById('groupDetailModal');
      if (modal) {
        document.getElementById('detailGroupId').value = groupId;
        document.getElementById('detailGroupName').textContent = group.name;
        document.getElementById('detailGroupCreated').textContent = new Date(group.createdAt).toLocaleString();
        document.getElementById('detailGroupMembers').textContent = members.length + ' 名成员';
        document.getElementById('detailGroupPoints').textContent = group.points || 0;
        
        const leaderInfo = leader ? 
          `<span class="group-member-badge">👑 ${this.escape(leader.name)}</span>` : 
          '<span style="color:var(--text-muted)">暂无组长</span>';
        document.getElementById('detailGroupLeader').innerHTML = leaderInfo;
        
        this.renderGroupMembers(groupId);
        this.renderGroupPointHistory(groupId);
        
        modal.style.display = 'flex';
      }
    },

    renderGroupMembers(groupId) {
      const container = document.getElementById('groupMembersList');
      if (!container) return;
      
      const members = this.getGroupMembers(groupId);
      
      if (members.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">暂无成员</div>';
        return;
      }
      
      container.innerHTML = members.map(member => `
        <div class="group-member-item ${member.isLeader ? 'is-leader' : ''}">
          <div class="group-member-avatar">${member.avatar}</div>
          <div class="group-member-info">
            <div class="group-member-name">${this.escape(member.name)}</div>
            <div class="group-member-id">${this.escape(member.studentId)}</div>
          </div>
          ${member.isLeader ? '<span class="group-member-badge">👑 组长</span>' : ''}
          <button class="btn btn-small" onclick="app.removeMemberFromGroup('${groupId}', '${member.studentId}')">移除</button>
          ${!member.isLeader ? `<button class="btn btn-small" onclick="app.setGroupLeader('${groupId}', '${member.studentId}')">设为组长</button>` : ''}
        </div>
      `).join('');
    },

    renderGroupPointHistory(groupId) {
      const container = document.getElementById('groupPointHistoryList');
      if (!container) return;
      
      const history = this.groupPointHistory.filter(h => h.groupId === groupId);
      history.sort((a, b) => new Date(b.time) - new Date(a.time));
      
      if (history.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">暂无积分记录</div>';
        return;
      }
      
      container.innerHTML = history.map(record => `
        <div class="group-point-history-item ${record.delta > 0 ? 'plus' : 'minus'}">
          <span class="group-point-history-time">${new Date(record.time).toLocaleString()}</span>
          <span class="group-point-history-reason">${this.escape(record.reason)}</span>
          <span class="group-point-history-delta">${record.delta > 0 ? '+' : ''}${record.delta}</span>
        </div>
      `).join('');
    },

    removeMemberFromGroup(groupId, studentId) {
      if (!confirm('确定要将该学生从小组中移除吗？')) {
        return;
      }
      
      const group = this.groups.find(g => g.id === groupId);
      if (group && group.members) {
        group.members = group.members.filter(m => m.studentId !== studentId);
        setStorage(STORAGE_KEYS.groups, this.groups);
        
        this.renderGroupMembers(groupId);
        this.renderGroups();
        this.renderUngroupedStudents();
        this.showSuccess('成员移除成功');
      }
    },

    setGroupLeader(groupId, studentId) {
      const group = this.groups.find(g => g.id === groupId);
      if (group && group.members) {
        group.members.forEach(m => m.isLeader = false);
        const member = group.members.find(m => m.studentId === studentId);
        if (member) {
          member.isLeader = true;
          setStorage(STORAGE_KEYS.groups, this.groups);
          
          this.renderGroupMembers(groupId);
          this.renderGroups();
          this.openGroupDetailModal(groupId);
          this.showSuccess('组长设置成功');
        }
      }
    },

    openAddStudentToGroupModal(studentId) {
      const modal = document.getElementById('addStudentToGroupModal');
      if (modal) {
        document.getElementById('studentToGroupId').value = studentId;
        
        const student = this.students.find(s => s.id === studentId);
        document.getElementById('studentToGroupName').textContent = student ? student.name : studentId;
        
        const groupSelect = document.getElementById('selectGroupToAdd');
        groupSelect.innerHTML = this.groups.map(group => 
          `<option value="${group.id}">${this.escape(group.name)}</option>`
        ).join('');
        
        modal.style.display = 'flex';
      }
    },

    addStudentToGroup() {
      const studentId = document.getElementById('studentToGroupId').value;
      const groupId = document.getElementById('selectGroupToAdd').value;
      
      const group = this.groups.find(g => g.id === groupId);
      if (group) {
        if (!group.members) group.members = [];
        
        if (group.members.some(m => m.studentId === studentId)) {
          alert('该学生已经在小组中');
          return;
        }
        
        group.members.push({
          studentId: studentId,
          isLeader: false,
          joinedAt: new Date().toISOString()
        });
        
        setStorage(STORAGE_KEYS.groups, this.groups);
        
        this.closeModal('addStudentToGroupModal');
        this.renderGroups();
        this.renderUngroupedStudents();
        this.showSuccess('学生添加成功');
      }
    },

    openRandomGroupModal() {
      const modal = document.getElementById('randomGroupModal');
      if (modal) {
        document.getElementById('randomGroupCount').value = '';
        document.getElementById('randomGroupCount').focus();
        modal.style.display = 'flex';
      }
    },

    randomGroup() {
      const groupCountInput = document.getElementById('randomGroupCount');
      const groupCount = parseInt(groupCountInput.value);
      
      if (isNaN(groupCount) || groupCount < 1) {
        alert('请输入有效的小组数量');
        return;
      }
      
      const ungroupedStudents = this.students.filter(student => {
        return !this.groups.some(group => 
          group.members && group.members.some(m => m.studentId === student.id)
        );
      });
      
      if (ungroupedStudents.length === 0) {
        alert('没有未分组的学生');
        return;
      }
      
      if (!confirm(`确定要将 ${ungroupedStudents.length} 名未分组学生随机分成 ${groupCount} 个小组吗？`)) {
        return;
      }
      
      const shuffled = [...ungroupedStudents].sort(() => Math.random() - 0.5);
      const studentsPerGroup = Math.floor(shuffled.length / groupCount);
      const remainder = shuffled.length % groupCount;
      
      let studentIndex = 0;
      
      for (let i = 0; i < groupCount; i++) {
        const membersCount = studentsPerGroup + (i < remainder ? 1 : 0);
        const groupMembers = shuffled.slice(studentIndex, studentIndex + membersCount);
        studentIndex += membersCount;
        
        if (groupMembers.length === 0) continue;
        
        const newGroup = {
          id: 'group_' + Date.now() + '_' + i,
          name: `小组 ${i + 1}`,
          createdAt: new Date().toISOString(),
          members: groupMembers.map((student, index) => ({
            studentId: student.id,
            isLeader: index === 0,
            joinedAt: new Date().toISOString()
          })),
          points: 0
        };
        
        this.groups.push(newGroup);
      }
      
      setStorage(STORAGE_KEYS.groups, this.groups);
      
      this.closeModal('randomGroupModal');
      this.renderGroups();
      this.renderUngroupedStudents();
      this.showSuccess(`成功创建 ${groupCount} 个小组`);
    },

    openGroupPointModal(groupId) {
      const group = this.groups.find(g => g.id === groupId);
      if (!group) return;
      
      const modal = document.getElementById('groupPointModal');
      if (modal) {
        document.getElementById('pointGroupId').value = groupId;
        document.getElementById('pointGroupName').textContent = group.name;
        document.getElementById('pointGroupCurrent').textContent = group.points || 0;
        document.getElementById('pointDelta').value = '';
        document.getElementById('pointReason').value = '';
        document.getElementById('pointDelta').focus();
        modal.style.display = 'flex';
      }
    },

    openGroupMemberPointModal(groupId) {
      const group = this.groups.find(g => g.id === groupId);
      if (!group) return;
      const members = this.getGroupMembers(groupId);
      if (!members.length) {
        alert('该小组暂无成员');
        return;
      }
      const modal = document.getElementById('groupMemberPointModal');
      if (!modal) return;
      document.getElementById('memberPointGroupId').value = groupId;
      document.getElementById('memberPointGroupName').textContent = group.name;
      const sel = document.getElementById('memberPointStudent');
      if (sel) {
        sel.innerHTML = members.map(m => `<option value="${m.studentId}">${this.escape(m.name)}（${this.escape(m.studentId)}）</option>`).join('');
      }
      const scopeEl = document.getElementById('memberPointScope');
      if (scopeEl) scopeEl.value = 'single';
      this.toggleGroupMemberPointScope();
      document.getElementById('memberPointDelta').value = '1';
      document.getElementById('memberPointReason').value = '小组任务表现优秀-个人贡献';
      modal.style.display = 'flex';
    },

    toggleGroupMemberPointScope() {
      const scope = document.getElementById('memberPointScope')?.value || 'single';
      const wrap = document.getElementById('memberPointStudentWrap');
      if (wrap) wrap.style.display = scope === 'single' ? 'block' : 'none';
    },

    applyGroupMemberBonus(groupId, scope, delta, reason) {
      const group = this.groups.find(g => g.id === groupId);
      if (!group) return { count: 0, names: [] };
      const members = this.getGroupMembers(groupId);
      let targets = [];
      if (scope === 'all') {
        targets = members;
      } else if (scope === 'leader') {
        targets = members.filter(m => m.isLeader);
      } else {
        const studentId = document.getElementById('memberPointStudent')?.value;
        targets = members.filter(m => m.studentId === studentId);
      }
      const names = [];
      targets.forEach(m => {
        const s = this.students.find(x => x.id === m.studentId);
        if (!s) return;
        s.points = (s.points || 0) + delta;
        if (!s.scoreHistory) s.scoreHistory = [];
        const reasonText = `【小组任务个人奖励】${group.name} ${reason}`.trim();
        s.scoreHistory.unshift({ time: Date.now(), delta, reason: reasonText });
        names.push(s.name);
      });
      return { count: names.length, names };
    },

    quickGroupMemberBonus(scope, delta) {
      if (!this.ensureUnlocked('批量个人加分')) return;
      const groupId = document.getElementById('memberPointGroupId')?.value;
      if (!groupId) return;
      const reason = scope === 'all' ? '全组任务达成奖励' : '组长组织协调奖励';
      const res = this.applyGroupMemberBonus(groupId, scope, delta, reason);
      if (!res.count) {
        alert(scope === 'leader' ? '该小组尚未设置组长' : '未找到可加分成员');
        return;
      }
      this.saveStudents();
      this.renderStudents();
      this.renderDashboard();
      this.showSuccess(`已发放：${scope === 'all' ? '全组每人' : '组长'} +${delta}（共${res.count}人）`);
    },

    addMemberPointFromGroupTask() {
      if (!this.ensureUnlocked('成员个人加分')) return;
      const groupId = document.getElementById('memberPointGroupId')?.value;
      const scope = document.getElementById('memberPointScope')?.value || 'single';
      const delta = parseInt(document.getElementById('memberPointDelta')?.value, 10);
      const reason = (document.getElementById('memberPointReason')?.value || '').trim();
      if (!groupId) {
        alert('请先选择小组');
        return;
      }
      if (!Number.isFinite(delta) || delta <= 0) {
        alert('个人加分必须为正数');
        return;
      }
      if (!reason) {
        alert('请输入加分原因');
        return;
      }
      const res = this.applyGroupMemberBonus(groupId, scope, delta, reason);
      if (!res.count) {
        alert(scope === 'leader' ? '该小组尚未设置组长' : '请选择有效成员');
        return;
      }
      this.saveStudents();
      this.renderStudents();
      this.renderDashboard();
      this.closeModal('groupMemberPointModal');
      this.showSuccess(`已发放个人积分：${res.count}人，每人 +${delta}`);
    },

    addGroupPoint() {
      if (!this.ensureUnlocked('小组积分操作')) return;
      const groupId = document.getElementById('pointGroupId').value;
      const deltaInput = document.getElementById('pointDelta');
      const reasonInput = document.getElementById('pointReason');
      
      const delta = parseInt(deltaInput.value);
      const reason = reasonInput.value.trim();
      
      if (isNaN(delta) || delta === 0) {
        alert('请输入有效的积分变化');
        return;
      }
      
      if (!reason) {
        alert('请输入积分变化原因');
        return;
      }
      
      const group = this.groups.find(g => g.id === groupId);
      if (group) {
        group.points = (group.points || 0) + delta;
        
        const record = {
          id: 'point_' + Date.now(),
          groupId: groupId,
          groupName: group.name,
          delta: delta,
          reason: reason,
          time: new Date().toISOString()
        };
        
        this.groupPointHistory.push(record);
        
        setStorage(STORAGE_KEYS.groups, this.groups);
        setStorage(STORAGE_KEYS.groupPointHistory, this.groupPointHistory);
        
        this.closeModal('groupPointModal');
        this.renderGroups();
        this.renderGroupPointHistory(groupId);
        this.showSuccess(`积分${delta > 0 ? '增加' : '扣除'}成功`);
      }
    },

    openGroupLeaderboard() {
      const modal = document.getElementById('groupLeaderboardModal');
      if (modal) {
        const sortedGroups = [...this.groups].sort((a, b) => (b.points || 0) - (a.points || 0));
        
        const container = document.getElementById('leaderboardList');
        if (sortedGroups.length === 0) {
          container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">暂无小组</div>';
        } else {
          container.innerHTML = sortedGroups.map((group, index) => {
            const members = this.getGroupMembers(group.id);
            const rank = index + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
            
            return `
              <div class="leaderboard-item ${rankClass}">
                <div class="leaderboard-rank">${rankEmoji}</div>
                <div class="leaderboard-info">
                  <div class="leaderboard-name">${this.escape(group.name)}</div>
                  <div class="leaderboard-members">${members.length} 名成员</div>
                </div>
                <div class="leaderboard-points">${group.points || 0}</div>
              </div>
            `;
          }).join('');
        }
        
        modal.style.display = 'flex';
      }
    },

    exportGroupsToExcel() {
      if (this.groups.length === 0) {
        alert('没有可导出的小组数据');
        return;
      }
      
      const records = this.groups.map(group => {
        const members = this.getGroupMembers(group.id);
        const leader = members.find(m => m.isLeader);
        
        return {
          '小组名称': group.name,
          '创建时间': new Date(group.createdAt).toLocaleString(),
          '成员数量': members.length,
          '组长': leader ? leader.name : '无',
          '小组积分': group.points || 0,
          '成员列表': members.map(m => `${m.name}(${m.studentId})`).join(', ')
        };
      });
      
      const ws = XLSX.utils.json_to_sheet(records);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '小组数据');
      
      ws['!cols'] = [
        { wch: 20 },
        { wch: 20 },
        { wch: 10 },
        { wch: 15 },
        { wch: 10 },
        { wch: 50 }
      ];
      
      const fileName = `小组数据_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    }
  };

  document.getElementById('importFile').addEventListener('change', function (e) {
    app.handleImportData(e);
  });

  window.app = app;

  function doImportBackup(backup) {
    if (!backup || !backup.userData) {
      alert('备份文件格式不正确');
      return;
    }
    try {
      localStorage.removeItem(USER_LIST_KEY);
      localStorage.removeItem(CURRENT_USER_KEY);
      // 清除所有用户数据
      const users = getUserList();
      users.forEach(function (user) {
        try { localStorage.removeItem(USER_DATA_PREFIX + user.id); } catch (e) {}
      });
    } catch (e) {}
    // 导入用户列表
    if (backup.userList) {
      setUserList(backup.userList);
    }
    // 导入用户数据
    Object.keys(backup.userData || {}).forEach(function (userId) {
      try {
        localStorage.setItem(USER_DATA_PREFIX + userId, JSON.stringify(backup.userData[userId]));
      } catch (e) {}
    });
    // 设置当前用户
    if (backup.currentUserId) {
      const users = getUserList();
      const user = users.find(u => u.id === backup.currentUserId);
      if (user) {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ id: user.id, username: user.username }));
      }
    }
    alert('导入成功，页面即将刷新');
    location.reload();
  }

  async function bootstrap() {
    if (useIndexedDB) {
      await initIndexedDB();
    }
    try {
      const savedUser = localStorage.getItem(CURRENT_USER_KEY);
      if (savedUser) {
        const user = JSON.parse(savedUser);
        if (user.id && user.username) {
          app.currentUserId = user.id;
          app.currentUsername = user.username;
          
          console.log('自动登录：用户ID:', app.currentUserId, '用户名:', app.currentUsername);
          
          // 加载用户数据
          app.loadUserData();
          app.dataLoaded = true;
          
          if (navigator.onLine) {
            try {
              // 有数据端自动登录：传 true 表示“登录场景”，本地已有班级数据则不拿云端覆盖，避免数据消失
              console.log('自动登录时从云端同步数据（登录场景保护：本地有数据则不覆盖）...');
              // 登录阶段不做阻塞式云拉取，避免卡在转圈
              await Promise.resolve(false);
              // 若 syncFromCloud 内触发“其他设备已登录”并 forceLogout，则不再进入应用
              if (!app.currentUserId) return;
            } catch (e) {
              console.error('云端同步失败，使用本地数据:', e);
            }
          } else {
            console.log('无网络连接，直接使用本地数据');
          }
          // 无论同步成败都按本地数据刷新一次，避免刷新页面后数据不显示
          app.loadUserData();
          // 若主键无数据（云端失败且主键未写入），尝试从本地备份键恢复
          if (app.currentUserId && (!app.students || app.students.length === 0)) {
            try {
              const backupKey = `${APP_NAMESPACE}_local_` + app.currentUserId;
              const raw = localStorage.getItem(backupKey);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.data && parsed.data.classes && parsed.data.classes.length > 0) {
                  setUserData(parsed.data);
                  app.loadUserData();
                  console.log('已从本地备份键恢复数据');
          }
        }
      } catch (e) {
              console.warn('从备份键恢复失败:', e);
            }
          }
          app.showApp();
          app.enableRealtimeSync();
          app.enableAutoSync();
          return;
        }
      }
    } catch (e) {
      console.log('localStorage不可用，使用内存存储:', e);
      // 尝试从内存存储中获取用户信息
      try {
        const savedUser = memoryStorage[CURRENT_USER_KEY];
        if (savedUser) {
          const user = JSON.parse(savedUser);
          if (user.id && user.username) {
            app.currentUserId = user.id;
            app.currentUsername = user.username;
            
            console.log('从内存存储自动登录：用户ID:', app.currentUserId, '用户名:', app.currentUsername);
            
            // 加载用户数据
          app.loadUserData();
            app.dataLoaded = true;
            
          app.showApp();
            app.enableRealtimeSync();
            app.enableAutoSync();
        return;
      }
    }
      } catch (e) {
        console.log('内存存储也不可用:', e);
      }
    }
    app.showLoginPage();
  }

  document.addEventListener('DOMContentLoaded', async function () {
    // 离线桌面版：优先从磁盘恢复 localStorage 快照
    try{ await Promise.race([restoreLocalStorageFromDisk(), new Promise(function(r){setTimeout(r,3000);})]); }catch(e){}
    var importBackupEl = document.getElementById('importBackupFile');
    if (importBackupEl) {
      importBackupEl.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var backup = JSON.parse(ev.target.result);
            doImportBackup(backup);
          } catch (err) {
            alert('导入失败：文件不是有效的备份格式');
          }
          e.target.value = '';
        };
        reader.readAsText(file, 'UTF-8');
      });
    }
    
    // 先绑定所有事件监听器
    // 顶部导航「小工具」菜单：点击页面其它区域时自动关闭
    document.addEventListener('click', function () {
      try {
        if (window.app && typeof window.app.closeToolsMenu === 'function') {
          window.app.closeToolsMenu();
        }
      } catch (e) {}
    });
    // 登录/注册流程已迁移到 login_handler.js（萌兽成长营专用）
    // 这里不再绑定旧版童心宠伴登录事件，避免双流程冲突
    
    document.querySelectorAll('.groups-tab').forEach(function (tabEl) {
      tabEl.addEventListener('click', function (e) {
        var tab = e.currentTarget.dataset.tab;
        document.querySelectorAll('.groups-tab').forEach(function (x) { x.classList.remove('active'); });
        e.currentTarget.classList.add('active');
        document.getElementById('groupsContent').style.display = tab === 'groups' ? 'block' : 'none';
        document.getElementById('ungroupedContent').style.display = tab === 'ungrouped' ? 'block' : 'none';
        if (tab === 'groups') app.renderGroups();
        if (tab === 'ungrouped') app.renderUngroupedStudents();
      });
    });
    
    // 最后调用bootstrap()
    // 5秒超时保护：如果bootstrap卡住，强制显示登录页
var bootstrapTimeout=setTimeout(function(){try{app.showLoginPage();}catch(e){}},5000);
try{await bootstrap();}catch(e){console.error("bootstrap error:",e);}finally{clearTimeout(bootstrapTimeout);}
  });
})();
