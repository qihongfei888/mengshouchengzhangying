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
  
  // 初始化 Bmob
  function initBmob() {
    try {
      if (typeof Bmob !== 'undefined') {
        // 检查Bmob版本
        console.log('Bmob SDK版本:', Bmob.version || '未知');
        // 初始化Bmob - 使用API安全码（2.0以上版本需要）
        // 注意：这里使用的是示例密钥，实际使用时需要替换为真实的API安全码
        // 对于Bmob SDK 2.0+，使用对象格式初始化
        Bmob.initialize({
          appKey: "055bbfab769cf4ca035e9a97bdd2a015",
          secretKey: "8f55b66963acf2810512a244e17d7b79"
        });
        console.log('✅ Bmob 初始化成功');
        return true;
      } else {
        console.error('❌ Bmob SDK 未加载');
        return false;
      }
    } catch (e) {
      console.error('❌ Bmob 初始化失败:', e);
      return false;
    }
  }
  
  // 尝试初始化Bmob，如果失败则延迟重试
  if (!initBmob()) {
    let retryCount = 0;
    const maxRetries = 5;
    const retryInterval = 1000;
    
    const retryInit = setInterval(() => {
      retryCount++;
      console.log(`🔄 尝试重新初始化Bmob (${retryCount}/${maxRetries})`);
      
      if (initBmob() || retryCount >= maxRetries) {
        clearInterval(retryInit);
        if (retryCount >= maxRetries) {
          console.error('❌ 多次尝试后Bmob仍未加载，将使用本地存储模式');
        }
      }
    }, retryInterval);
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
      this.setupRealtimeListener();
      this.startAutoSync();
    }

    // 设置实时监听器
    setupRealtimeListener() {
      // 检查Bmob是否加载
      if (typeof Bmob === 'undefined') {
        console.error('Bmob SDK未加载，无法设置实时监听器');
        return;
      }
      
      // 监听用户数据变化
      try {
        const query = Bmob.Query('UserData');
        // 确保userId是字符串类型
        const userIdStr = String(this.userId || 'default_user');
        query.equalTo('userId', userIdStr);
        query.subscribe().then((subscription) => {
          this.channels.userData = subscription;
          subscription.on('create', (object) => {
            console.log('收到云端创建事件:', object);
            this.updateLocalData(object.get('data'));
          });
          subscription.on('update', (object) => {
            console.log('收到云端更新事件:', object);
            this.updateLocalData(object.get('data'));
          });
          subscription.on('delete', (object) => {
            console.log('收到云端删除事件:', object);
            // 处理删除事件
          });
          console.log('实时同步监听器已设置');
        }).catch((error) => {
          console.error('设置实时监听器失败:', error);
        });
      } catch (e) {
        console.error('设置实时监听器失败:', e);
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
        const key = this.userId ? `class_pet_user_data_${this.userId}` : 'class_pet_default_user';
        console.log('更新本地数据，键名:', key);
        console.log('更新数据:', data);
        
        // 先更新内存缓存
        memoryStorage[key] = data;
        
        // 更新localStorage
        localStorage.setItem(key, JSON.stringify(data));
        // 同时更新默认键，确保数据不会丢失
        if (this.userId) {
          localStorage.setItem('class_pet_default_user', JSON.stringify(data));
          memoryStorage['class_pet_default_user'] = data;
        }
        
        console.log('本地数据已更新');
        // 重新加载用户数据
        if (window.app) {
          console.log('触发app.loadUserData()');
          window.app.loadUserData();
        }
      } catch (e) {
        console.error('更新本地数据失败:', e);
      }
    }

    // 同步数据到云端
    async syncToCloud(data) {
      // 检查Bmob是否加载
      if (typeof Bmob === 'undefined') {
        console.error('Bmob SDK未加载，无法同步到云端');
        return false;
      }
      
      try {
        // 尝试将数据转换为JSON字符串，解决参数类型错误
        const dataToSync = JSON.stringify(data);
        
        // 确保userId是字符串类型
        const userIdStr = String(this.userId || 'default_user');
        
        const query = Bmob.Query('UserData');
        const results = await query.equalTo('userId', userIdStr).find();
        
        if (results.length > 0) {
          // 更新现有数据
          const userData = results[0];
          userData.set('data', dataToSync);
          userData.set('updatedAt', new Date().toISOString());
          await userData.save();
        } else {
          // 创建新数据
          const userData = Bmob.Query('UserData');
          userData.set('userId', userIdStr);
          userData.set('data', dataToSync);
          userData.set('updatedAt', new Date().toISOString());
          await userData.save();
        }
        
        console.log('数据已同步到云端');
        return true;
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
        const key = this.userId ? `class_pet_user_data_${this.userId}` : 'class_pet_default_user';
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
  
  const STORAGE_KEYS = {
    students: 'class_pet_students',
    systemName: 'class_pet_system_name',
    theme: 'class_pet_theme',
    stagePoints: 'class_pet_stage_points',
    totalStages: 'class_pet_total_stages',
    plusItems: 'class_pet_plus_items',
    minusItems: 'class_pet_minus_items',
    prizes: 'class_pet_prizes',
    lotteryPrizes: 'class_pet_lottery_prizes',
    broadcastMessages: 'class_pet_broadcast_messages',
    groups: 'class_pet_groups',
    groupPointHistory: 'class_pet_group_point_history',
    petCategoryPhotos: 'class_pet_pet_category_photos',
    className: 'class_pet_class_name'
  };
  const USER_LIST_KEY = 'class_pet_user_list';
  const USER_DATA_PREFIX = 'class_pet_user_data_';
  const CURRENT_USER_KEY = 'class_pet_current_user';
  
  // 授权码管理
  const LICENSE_KEY = 'class_pet_licenses';
  const ACTIVATED_DEVICES_KEY = 'class_pet_activated_devices';
  
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
            if (key && key.startsWith('class_pet_backup_')) {
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
    
    console.log('getUserData - 当前用户ID:', userId);
    
    var key = userId ? USER_DATA_PREFIX + userId : 'class_pet_default_user';
    console.log('getUserData - 使用的存储键:', key);
    
    // 尝试从多个来源获取数据
    let data = null;
    
    // 1. 尝试从内存存储获取
    try {
      data = memoryStorage[key];
      if (data) {
        console.log('从内存存储获取数据成功');
        return data;
      }
    } catch (e) {
      console.error('从内存存储获取数据失败:', e);
    }
    
    // 2. 尝试从localStorage获取
    try {
      var v = localStorage.getItem(key);
      if (v) {
        data = JSON.parse(v);
        console.log('从localStorage获取数据成功');
        // 更新内存存储
        memoryStorage[key] = data;
        return data;
      }
    } catch (e) {
      console.error('从localStorage获取数据失败:', e);
    }
    
    // 3. 如果当前用户有ID但没有数据，尝试从默认键获取
    if (userId) {
      try {
        var defaultData = localStorage.getItem('class_pet_default_user');
        if (defaultData) {
          data = JSON.parse(defaultData);
          console.log('从默认键获取数据成功');
          // 更新用户特定的存储
          memoryStorage[key] = data;
          try {
            localStorage.setItem(key, JSON.stringify(data));
          } catch (e) {
            console.error('更新用户特定存储失败:', e);
          }
          return data;
        }
      } catch (e) {
        console.error('从默认键获取数据失败:', e);
      }
    }
    
    // 4. 如果没有用户ID但有保存的用户ID，尝试从用户特定的键中读取
    if (!userId) {
      try {
        const currentUserStr = localStorage.getItem(CURRENT_USER_KEY);
        if (currentUserStr) {
          const currentUser = JSON.parse(currentUserStr);
          if (currentUser.id) {
            const userKey = USER_DATA_PREFIX + currentUser.id;
            const userV = localStorage.getItem(userKey);
            if (userV) {
              data = JSON.parse(userV);
              console.log('从用户特定键获取数据成功');
              // 更新内存存储和默认键
              memoryStorage[userKey] = data;
              memoryStorage['class_pet_default_user'] = data;
              try {
                localStorage.setItem('class_pet_default_user', userV);
              } catch (e) {
                console.error('更新默认键存储失败:', e);
              }
              return data;
            }
          }
        }
      } catch (e) {
        console.error('读取用户特定数据失败:', e);
      }
    }
    
    // 5. 如果都没有数据，返回默认数据结构，而不是空对象
    console.log('所有存储都没有数据，返回默认数据结构');
    data = {
      students: [],
      groups: [],
      pets: [],
      settings: getDefaultSettings(),
      scoreItems: {
        plus: DEFAULT_PLUS_ITEMS,
        minus: DEFAULT_MINUS_ITEMS
      },
      scoreHistory: [],
      badges: [],
      store: {
        goods: DEFAULT_GOODS,
        accessories: DEFAULT_ACCESSORIES,
        lottery: DEFAULT_LOTTERY_PRIZES
      },
      honors: {
        weekly: [],
        monthly: [],
        semester: [],
        all: []
      },
      lastModified: new Date().toISOString()
    };
    
    // 保存默认数据到存储
    try {
      memoryStorage[key] = data;
      localStorage.setItem(key, JSON.stringify(data));
      console.log('默认数据已保存到存储');
    } catch (e) {
      console.error('保存默认数据失败:', e);
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
    
    var key = userId ? USER_DATA_PREFIX + userId : 'class_pet_default_user';
    memoryStorage[key] = data;
    try {
      localStorage.setItem(key, JSON.stringify(data));
      // 同时更新默认键，确保数据不会丢失
      if (userId) {
        localStorage.setItem('class_pet_default_user', JSON.stringify(data));
      }
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
            if (storageKey && storageKey.startsWith('class_pet_backup_')) {
              localStorage.removeItem(storageKey);
              console.log('已清理备份:', storageKey);
            }
          }
          // 再次尝试保存
          localStorage.setItem(key, JSON.stringify(data));
          if (userId) {
            localStorage.setItem('class_pet_default_user', JSON.stringify(data));
          }
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
      // 同时更新默认键，确保数据不会丢失
      if (userId) {
        IndexedDBManager.setItem('class_pet_default_user', data).catch(function(e) {
          console.error('IndexedDB 写入默认键失败:', e);
        });
      }
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

  const app = {
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
        
        const users = getUserList();
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
          // 记录成功登录
          recordLoginAttempt(username, true);
          
          // 生成设备指纹
          const deviceId = generateDeviceFingerprint();
          
          // 检查设备是否已绑定
          if (!user.devices) {
            user.devices = [];
          }
          // 强制设置最大设备数为1，确保一个用户只能同时在线一个设备
          user.maxDevices = 1;
          
          const existingDevice = user.devices.find(d => d.id === deviceId);
          
          if (existingDevice) {
            // 设备已绑定，更新最后登录时间
            existingDevice.lastLogin = new Date().toISOString();
            console.log('设备已绑定，更新登录时间');
          } else {
            // 设备未绑定，检查是否已有设备
            if (user.devices.length >= user.maxDevices) {
              // 已有设备，强制下线
              console.log('已有设备登录，强制下线');
              // 清空设备列表，只保留当前设备
              user.devices = [];
              console.log('旧设备已强制下线');
            }
            
            // 添加新设备
            user.devices.push({
              id: deviceId,
              name: navigator.userAgent || 'Unknown Device',
              lastLogin: new Date().toISOString()
            });
            console.log('添加新设备:', deviceId);
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
          
          // 保存当前用户信息
          try {
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ 
              id: user.id, 
              username: user.username,
              deviceId: deviceId 
            }));
          } catch (e) {
            console.warn('保存当前用户信息到localStorage失败:', e);
            // 保存到内存存储
            memoryStorage[CURRENT_USER_KEY] = JSON.stringify({ 
              id: user.id, 
              username: user.username,
              deviceId: deviceId 
            });
          }
          
          // 数据迁移：从旧存储导入到新的Bmob数据库
          try {
            console.log('登录时执行数据迁移...');
            await this.migrateDataFromOldStorage();
          } catch (e) {
            console.error('数据迁移失败:', e);
          }
          
          // 优先从云端同步数据（确保多端数据一致）
          let syncSuccess = false;
          try {
            console.log('登录时从云端同步数据...');
            // 强制从云端同步数据，不考虑时间差
            // 增加重试机制，确保同步成功
            let retryCount = 0;
            const maxRetries = 3;
            const retryDelay = 2000;
            
            while (retryCount < maxRetries) {
              try {
                syncSuccess = await this.syncFromCloud();
                if (syncSuccess) {
                  console.log('从云端同步成功，使用云端数据');
                  break;
                } else {
                  console.log('云端数据较旧或没有数据，使用本地数据');
                  // 即使云端没有数据，也要尝试同步本地数据到云端
                  if (navigator.onLine) {
                    console.log('尝试将本地数据同步到云端...');
                    await this.syncToCloud();
                  }
                  break;
                }
              } catch (e) {
                retryCount++;
                console.error(`登录时云端同步失败 (${retryCount}/${maxRetries}):`, e);
                if (retryCount < maxRetries) {
                  console.log(`等待 ${retryDelay}ms 后重试...`);
                  await new Promise(resolve => setTimeout(resolve, retryDelay));
                } else {
                  console.error('登录时云端同步多次失败，使用本地数据');
                }
              }
            }
          } catch (e) {
            console.error('云端同步失败，使用本地数据:', e);
            // 即使同步失败，也要确保本地数据可用
            console.log('使用本地数据，确保应用正常运行');
          }
          
          // 无论同步是否成功，都重新加载用户数据，确保显示最新信息
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
          systemName: '童心宠伴',
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
          const broadcastEl = document.getElementById('broadcastContent');
          
          if (stagePointsEl) stagePointsEl.value = currentClass.stagePoints || 20;
          if (stagesEl) stagesEl.value = currentClass.totalStages || 10;
          if (broadcastEl) broadcastEl.value = (currentClass.broadcastMessages || ['欢迎来到童心宠伴！🎉']).join('\n');
        } else {
          // 没有选择班级时的默认值
          this.students = [];
          this.groups = [];
          this.groupPointHistory = [];
          this.currentClassName = '';
          
          const stagePointsEl = document.getElementById('settingStagePoints');
          const stagesEl = document.getElementById('settingStages');
          const broadcastEl = document.getElementById('broadcastContent');
          
          if (stagePointsEl) stagePointsEl.value = 20;
          if (stagesEl) stagesEl.value = 10;
          if (broadcastEl) broadcastEl.value = '欢迎来到童心宠伴！🎉';
        }
        
        console.log('用户数据加载完成，班级数:', this.classes.length, '当前班级:', this.currentClassName);
        
        // 加载全局设置
        const systemTitleEl = document.getElementById('systemTitleText');
        const classNameEl = document.getElementById('currentClassName');
        const settingSystemNameEl = document.getElementById('settingSystemName');
        const settingClassNameEl = document.getElementById('settingClassName');
        const settingThemeEl = document.getElementById('settingTheme');
        
        if (systemTitleEl) systemTitleEl.textContent = data.systemName || '童心宠伴';
        if (classNameEl) classNameEl.textContent = this.currentClassName ? `| ${this.currentClassName}` : '';
        if (settingSystemNameEl) settingSystemNameEl.value = data.systemName || '童心宠伴';
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
        // 不再调用不存在的init()方法，直接渲染设备列表
        // 渲染设备列表
        this.renderDevicesList();
        // 确保数据已加载
        if (!this.dataLoaded) {
          this.loadUserData();
          this.dataLoaded = true;
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
        
        // 移除本地存储的用户信息
        try { localStorage.removeItem(CURRENT_USER_KEY); } catch (e) {}
        
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
          systemName: '童心宠伴',
          theme: 'coral'
        };
      }
      
      // 版本 1.0.0 迁移
      if (!data.version) {
        data.version = '1.0.0';
        // 为旧数据添加必要的字段
        if (!data.systemName) data.systemName = '童心宠伴';
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
          cls.broadcastMessages = ['欢迎来到童心宠伴！🎉'];
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
    
    // 数据压缩函数 - 减少数据传输量
    compressUserData(data) {
      // 创建数据的深拷贝
      const compressed = JSON.parse(JSON.stringify(data));
      
      // 1. 清理历史数据
      if (compressed.classes) {
        for (const cls of compressed.classes) {
          // 限制历史记录长度
          if (cls.groupPointHistory && cls.groupPointHistory.length > 100) {
            cls.groupPointHistory = cls.groupPointHistory.slice(-100); // 只保留最近100条
          }
          
          // 清理空数组和对象
          if (cls.groups && cls.groups.length === 0) {
            delete cls.groups;
          }
          if (cls.plusItems && cls.plusItems.length === 0) {
            delete cls.plusItems;
          }
          if (cls.minusItems && cls.minusItems.length === 0) {
            delete cls.minusItems;
          }
          if (cls.prizes && cls.prizes.length === 0) {
            delete cls.prizes;
          }
          if (cls.lotteryPrizes && cls.lotteryPrizes.length === 0) {
            delete cls.lotteryPrizes;
          }
          if (cls.broadcastMessages && cls.broadcastMessages.length === 0) {
            delete cls.broadcastMessages;
          }
          if (cls.petCategoryPhotos && Object.keys(cls.petCategoryPhotos).length === 0) {
            delete cls.petCategoryPhotos;
          }
        }
      }
      
      // 2. 移除不必要的字段
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
        const oldStorageKeys = [
          'class_pet_students',
          'class_pet_system_name',
          'class_pet_theme',
          'class_pet_stage_points',
          'class_pet_total_stages',
          'class_pet_plus_items',
          'class_pet_minus_items',
          'class_pet_prizes',
          'class_pet_lottery_prizes',
          'class_pet_broadcast_messages',
          'class_pet_groups',
          'class_pet_group_point_history',
          'class_pet_pet_category_photos',
          'class_pet_class_name',
          'class_pet_user_list',
          'class_pet_licenses'
        ];
        
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
            systemName: oldData.class_pet_system_name || '童心宠伴',
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
            totalStages: oldData.class_pet_total_stages || 10,
            plusItems: oldData.class_pet_plus_items || [],
            minusItems: oldData.class_pet_minus_items || [],
            prizes: oldData.class_pet_prizes || [],
            lotteryPrizes: oldData.class_pet_lottery_prizes || [],
            broadcastMessages: oldData.class_pet_broadcast_messages || ['欢迎来到童心宠伴！🎉'],
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
    
    // 同步用户列表到云端
    async syncUserListToCloud() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过用户列表同步');
        return false;
      }
      
      // 检查Bmob是否加载
      if (typeof Bmob === 'undefined') {
        console.error('Bmob SDK未加载，无法同步用户列表到云端');
        return false;
      }
      
      try {
        const users = getUserList();
        const now = new Date().toISOString();
        
        // 将用户列表存储在云端
        const query = Bmob.Query('UserData');
        const results = await query.equalTo('userId', 'user_list_global').find();
        
        if (results.length > 0) {
          // 更新现有数据
          const userListData = results[0];
          userListData.set('data', { users: users });
          userListData.set('updatedAt', now);
          await userListData.save();
        } else {
          // 创建新数据
          const userListData = Bmob.Query('UserData');
          userListData.set('userId', 'user_list_global');
          userListData.set('data', { users: users });
          userListData.set('updatedAt', now);
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
      
      // 检查Bmob是否加载
      if (typeof Bmob === 'undefined') {
        console.error('Bmob SDK未加载，无法批量上传用户数据到云端');
        return { success: false, message: 'Bmob SDK未加载' };
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
              // 更新现有数据
              const userDataRecord = results[0];
              userDataRecord.set('data', userData);
              userDataRecord.set('username', user.username);
              userDataRecord.set('password', user.password);
              userDataRecord.set('updatedAt', now);
              userDataRecord.set('last_sync', now);
              await userDataRecord.save();
            } else {
              // 创建新数据
              const userDataRecord = Bmob.Query('UserData');
              userDataRecord.set('userId', user.id);
              userDataRecord.set('username', user.username);
              userDataRecord.set('password', user.password);
              userDataRecord.set('data', userData);
              userDataRecord.set('updatedAt', now);
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
      
      // 检查Bmob是否加载
      if (typeof Bmob === 'undefined') {
        console.error('Bmob SDK未加载，无法从云端下载用户数据');
        return { success: false, message: 'Bmob SDK未加载' };
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
    
    // 备份云端数据
    async backupCloudData() {
      if (!navigator.onLine || !this.currentUserId) {
        console.log('无网络连接或无用户ID，跳过备份');
        return false;
      }
      
      if (typeof Bmob === 'undefined') {
        console.log('Bmob SDK未加载，跳过备份');
        return false;
      }
      
      try {
        const userData = getUserData();
        const now = new Date().toISOString();
        
        // 创建备份数据
        const backupRecord = Bmob.Query('Backups');
        backupRecord.set('userId', this.currentUserId);
        backupRecord.set('data', userData);
        backupRecord.set('timestamp', now);
        backupRecord.set('version', userData.version || '1.0.0');
        
        // 保存备份
        await backupRecord.save();
        
        console.log('数据备份成功');
        
        // 清理旧备份，保留最近5个
        await this.cleanupOldBackups();
        
        return true;
      } catch (e) {
        console.error('备份失败:', e);
        // 备份失败不影响主功能，继续执行
        return false;
      }
    },
    
    // 清理旧备份
    async cleanupOldBackups() {
      if (!navigator.onLine || !this.currentUserId) {
        return false;
      }
      
      if (typeof Bmob === 'undefined') {
        console.log('Bmob SDK未加载，跳过清理旧备份');
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
    
    // 从备份恢复数据
    async restoreFromBackup(backupId) {
      if (!navigator.onLine || !this.currentUserId) {
        console.log('无网络连接或无用户ID，跳过恢复');
        return false;
      }
      
      // 检查Bmob是否加载
      if (typeof Bmob === 'undefined') {
        console.error('Bmob SDK未加载，无法从备份恢复数据');
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
    
    // 从云端同步用户列表
    async syncUserListFromCloud() {
      // 检查Bmob是否加载
      if (typeof Bmob === 'undefined') {
        console.error('Bmob SDK未加载，无法从云端同步用户列表');
        return false;
      }
      
      try {
        // 从云端获取用户列表数据
        const query = Bmob.Query('UserData');
        query.equalTo('userId', 'user_list_global');
        const results = await query.find();
        
        if (results.length === 0) {
          console.log('云端没有用户列表数据，尝试上传本地用户列表');
          // 云端没有数据时，上传本地用户列表
          await this.syncUserListToCloud();
          return true;
        }
        
        const cloudData = results[0].get('data');
        if (cloudData && cloudData.users) {
          const cloudUsers = cloudData.users;
          const localUsers = getUserList();
          
          // 合并用户列表（以云端为准，但保留本地的新用户）
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
          // 云端数据为空时，上传本地用户列表
          await this.syncUserListToCloud();
          return true;
        }
      } catch (e) {
        console.error('从云端同步用户列表失败:', e);
        // 即使同步失败，也要确保本地有用户列表
        return false;
      }
    },
    
    // 数据同步方法 - 优化版，支持2000人同时使用
    async syncData() {
      if (!this.currentUserId) return;
      
      // 防止循环调用
      if (this.isSyncingData) {
        console.log('syncData 正在执行中，跳过重复调用');
        return;
      }
      
      this.isSyncingData = true;
      
      try {
        // 1. 首先保存本地数据（优先本地存储）
        await this.saveUserDataInternal();
      
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
        
        data.systemName = systemNameEl ? systemNameEl.value || '童心宠伴' : '童心宠伴';
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
            students: this.students,
            groups: this.groups,
            groupPointHistory: this.groupPointHistory,
            stagePoints: 20,
            totalStages: 10,
            plusItems: this.getPlusItems(),
            minusItems: this.getMinusItems(),
            prizes: this.getPrizes(),
            lotteryPrizes: this.getLotteryPrizes(),
            broadcastMessages: ['欢迎来到童心宠伴！🎉'],
            petCategoryPhotos: this.getPetCategoryPhotos()
          };
          data.classes.push(newClass);
          this.currentClassId = newClass.id;
          this.currentClassName = newClass.name;
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
          const broadcastEl = document.getElementById('broadcastContent');
          
          currentClass.stagePoints = stagePointsEl ? parseInt(stagePointsEl.value) || 20 : 20;
          currentClass.totalStages = stagesEl ? parseInt(stagesEl.value) || 10 : 10;
          currentClass.plusItems = this.getPlusItems();
          currentClass.minusItems = this.getMinusItems();
          currentClass.prizes = this.getPrizes();
          currentClass.lotteryPrizes = this.getLotteryPrizes();
          currentClass.broadcastMessages = broadcastEl ? broadcastEl.value.split('\n') : ['欢迎来到童心宠伴！🎉'];
          currentClass.petCategoryPhotos = this.getPetCategoryPhotos();
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
      // 无网时不进行云同步
      if (!navigator.onLine) {
        console.log('无网络连接，跳过云端同步');
        return;
      }
      
      // 防止重复同步
      if (this.syncing) {
        console.log('正在同步中，跳过重复同步');
        return;
      }
      
      this.syncing = true;
      
      try {
        // 1. 获取并迁移数据
        let userData = getUserData();
        userData = this.migrateUserData(userData);
        const licenses = getLicenses(); // 读取授权码
        const now = new Date().toISOString();
        
        // 2. 数据验证
        if (!this.validateUserData(userData)) {
          console.error('数据验证失败，跳过同步');
          return;
        }
        
        // 3. 数据压缩（减少传输量）
        const compressedData = this.compressUserData(userData);
        
        console.log('准备同步到云端，用户ID:', this.currentUserId);
        console.log('同步时间:', now);
        console.log('授权码数量:', licenses.length);
        console.log('数据大小:', JSON.stringify(compressedData).length, 'bytes');
        
        // 4. 更新数据的最后修改时间
        compressedData.lastModified = now;
        
        // 5. 优先使用本地存储
        try {
          const backupKey = this.currentUserId ? `class_pet_local_${this.currentUserId}` : 'class_pet_local_default';
          localStorage.setItem(backupKey, JSON.stringify({
            data: compressedData,
            timestamp: now
          }));
          console.log('数据已存储到本地');
        } catch (localError) {
          console.error('本地存储失败:', localError);
        }
        
        // 6. 减少备份频率（每10次同步才备份一次）
        if (Math.random() < 0.1) { // 10%的概率创建备份
          console.log('创建数据备份...');
          try {
            await this.backupCloudData();
          } catch (e) {
            console.error('备份失败:', e);
          }
        }
        
        // 7. 使用Bmob进行云同步 - 批量操作优化
        if (typeof Bmob !== 'undefined') {
          console.log('开始上传到Bmob...');
          
          try {
            // 对于Bmob SDK 2.7.0，使用更简单的方式
            const userId = this.currentUserId || 'default_user';
            const userIdStr = String(userId);
            
            // 先检查是否存在该用户的数据
            const query = Bmob.Query('UserData');
            query.equalTo('userId', userIdStr);
            const results = await query.find();
            
            // 创建一个简单的数据结构，只包含必要的字段
            const simpleData = {
              userId: userIdStr,
              data: JSON.stringify(compressedData),
              licenses: JSON.stringify(licenses),
              updatedAt: now,
              last_sync: now
            };
            
            console.log('准备同步的数据:', simpleData);
            
            if (results.length > 0) {
              // 更新现有数据
              const userDataRecord = results[0];
              userDataRecord.set('data', simpleData.data);
              userDataRecord.set('licenses', simpleData.licenses);
              userDataRecord.set('updatedAt', simpleData.updatedAt);
              userDataRecord.set('last_sync', simpleData.last_sync);
              await userDataRecord.save();
            } else {
              // 创建新数据
              const userDataRecord = Bmob.Query('UserData');
              userDataRecord.set('userId', simpleData.userId);
              userDataRecord.set('data', simpleData.data);
              userDataRecord.set('licenses', simpleData.licenses);
              userDataRecord.set('updatedAt', simpleData.updatedAt);
              userDataRecord.set('last_sync', simpleData.last_sync);
              await userDataRecord.save();
            }
            
            console.log('数据已同步到Bmob云存储');
          } catch (bmobError) {
            console.error('Bmob同步失败:', bmobError);
            console.error('错误详情:', {
              code: bmobError.code,
              message: bmobError.message,
              stack: bmobError.stack
            });
            
            // 尝试使用更简单的方式
            try {
              console.log('尝试使用更简单的同步方式');
              const userId = this.currentUserId || 'default_user';
              const userIdStr = String(userId);
              
              // 创建一个非常简单的数据结构
              const minimalData = {
                userId: userIdStr,
                data: '{}',
                updatedAt: now
              };
              
              const query = Bmob.Query('UserData');
              query.equalTo('userId', userIdStr);
              const results = await query.find();
              
              if (results.length > 0) {
                const userDataRecord = results[0];
                userDataRecord.set('userId', minimalData.userId);
                userDataRecord.set('data', minimalData.data);
                userDataRecord.set('updatedAt', minimalData.updatedAt);
                await userDataRecord.save();
              } else {
                const userDataRecord = Bmob.Query('UserData');
                userDataRecord.set('userId', minimalData.userId);
                userDataRecord.set('data', minimalData.data);
                userDataRecord.set('updatedAt', minimalData.updatedAt);
                await userDataRecord.save();
              }
              
              console.log('使用最小数据结构同步成功');
            } catch (e) {
              console.error('最小数据结构同步也失败:', e);
            }
            
            // Bmob同步失败不影响本地存储
          }
        } else {
          console.log('Bmob SDK未加载，跳过云端同步');
          // 尝试重新初始化Bmob
          initBmob();
        }
        
        // 同步成功后更新本地数据的lastModified
        setUserData(compressedData);
        // 同步成功后重新加载用户数据，确保应用界面显示最新数据
        this.loadUserData();
        
        // 8. 通知其他设备同步数据
        if (window.realtimeSync) {
          console.log('通知其他设备同步数据');
          // 这里可以添加推送通知逻辑，确保其他设备能够及时同步数据
        }
        
      } catch (e) {
        console.error('云同步失败:', e);
        // 异常时不再自动恢复，避免过多API请求
        // 数据已保存到本地，下次同步时会重试
      } finally {
        this.syncing = false;
      }
    },
    
    // 从云存储同步授权码（无需用户ID）
    async syncLicensesFromCloud() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过云端同步');
        return null;
      }
      
      // 检查Bmob是否加载
      if (typeof Bmob === 'undefined') {
        console.error('Bmob SDK未加载，无法从云端同步授权码');
        return null;
      }
      
      try {
        console.log('开始从Bmob同步授权码...');
        
        // 首先尝试查询管理员用户的数据（管理员用户ID通常包含admin）
        const adminQuery = Bmob.Query('UserData');
        adminQuery.equalTo('userId', 'user_list_global');
        const adminResults = await adminQuery.find();
        
        console.log('查询全局用户列表数据:', adminResults);
        
        if (adminResults.length > 0) {
          const adminData = adminResults[0].get('data');
          if (adminData && adminData.licenses) {
            console.log('从全局用户列表同步授权码，数量:', adminData.licenses.length);
            setLicenses(adminData.licenses);
            return adminData.licenses;
          }
        }
        
        // 如果没有全局数据，查询最近更新的用户数据
        const query = Bmob.Query('UserData');
        query.order('updatedAt', { descending: true });
        query.limit(1);
        const results = await query.find();
        
        console.log('查询最近更新的用户数据:', results);
        
        if (results.length > 0) {
          const userData = results[0].get('data');
          if (userData && userData.licenses) {
            console.log('从用户数据同步授权码，数量:', userData.licenses.length);
            setLicenses(userData.licenses);
            return userData.licenses;
          }
        }
      } catch (e) {
        console.error('同步授权码失败:', e);
      }
      
      return null;
    },
    
    // 从云存储同步
    async syncFromCloud() {
      // 无网时不进行云同步
      if (!navigator.onLine) {
        console.log('无网络连接，跳过云端同步');
        return false;
      }
      
      // 防止重复同步
      if (this.syncing) {
        console.log('正在同步中，跳过重复同步');
        return false;
      }
      
      this.syncing = true;
      let syncSuccess = false;
      
      try {
        // 1. 优先从云存储同步（确保多端数据一致）
        console.log('开始从Bmob同步数据，用户ID:', this.currentUserId);
        
        if (typeof Bmob !== 'undefined') {
          let results = [];
          
          try {
            if (this.currentUserId) {
              // 从Bmob查询用户数据
              const query = Bmob.Query('UserData');
              // 确保userId是字符串类型
              const userIdStr = String(this.currentUserId);
              query.equalTo('userId', userIdStr);
              results = await query.find();
            } else {
              // 没有用户ID时，查询最近更新的数据
              const query = Bmob.Query('UserData');
              // 使用更兼容的排序方式
              query.order('-updatedAt');
              query.limit(1);
              results = await query.find();
            }
            
            console.log('Bmob返回数据:', results);
            
            if (results.length === 0) {
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
              const userDataRecord = results[0];
              let cloudData = userDataRecord.get('data');
              const cloudLicenses = userDataRecord.get('licenses');
              const cloudTimestamp = userDataRecord.get('updatedAt') || '1970-01-01T00:00:00.000Z';
              
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
                
                // 保存数据
                setUserData(updatedData);
                
                // 同时更新本地备份
                try {
                  const backupKey = this.currentUserId ? `class_pet_local_${this.currentUserId}` : 'class_pet_local_default';
                  localStorage.setItem(backupKey, JSON.stringify({
                    data: updatedData,
                    timestamp: cloudTimestamp
                  }));
                } catch (e) {
                  console.error('本地备份失败:', e);
                }
                
                console.log('从Bmob云存储同步成功，数据已更新');
                syncSuccess = true;
              }
            }
          } catch (bmobError) {
            console.error('Bmob同步失败:', bmobError);
            console.error('错误详情:', {
              code: bmobError.code,
              message: bmobError.message,
              stack: bmobError.stack
            });
            // Bmob同步失败不影响本地存储
          }
        } else {
          console.log('Bmob SDK未加载，使用本地数据');
          // 尝试从本地存储读取数据
          try {
            const backupKey = this.currentUserId ? `class_pet_local_${this.currentUserId}` : 'class_pet_local_default';
            const backupData = localStorage.getItem(backupKey);
            if (backupData) {
              try {
                const parsedBackup = JSON.parse(backupData);
                console.log('从本地存储恢复数据');
                // 检查数据是否有效
                if (parsedBackup.data && this.validateUserData(parsedBackup.data)) {
                  setUserData(parsedBackup.data);
                  console.log('本地数据恢复成功');
                  syncSuccess = true;
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
      }
      
      // 2. 云存储没有数据或同步失败，尝试从本地备份加载
      if (!syncSuccess) {
        try {
          const backupKey = this.currentUserId ? `class_pet_local_${this.currentUserId}` : 'class_pet_local_default';
          const localData = localStorage.getItem(backupKey);
          
          if (localData) {
            const parsedData = JSON.parse(localData);
            const currentData = getUserData();
            const currentTimestamp = currentData.lastModified || '1970-01-01T00:00:00.000Z';
            
            // 比较时间戳，选择较新的数据
            if (parsedData.timestamp > currentTimestamp) {
              // 更新本地数据
              const updatedData = {
                ...parsedData.data,
                lastModified: parsedData.timestamp
              };
              setUserData(updatedData);
              
              console.log('从本地备份加载成功，数据已更新');
              syncSuccess = true;
            }
          }
        } catch (localError) {
          console.error('从本地备份加载失败:', localError);
        }
      }
      
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
      // 如果已经启用，先禁用之前的定时器，避免重复创建
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
      }
      
      // 每5分钟检查一次是否需要同步，大幅减少API请求频率
      this.autoSyncInterval = setInterval(async () => {
        // 保存本地数据（优先本地存储）
        this.saveUserData();
        
        // 只有当网络可用且有数据变更时才同步到云端
        if (navigator.onLine && this.dataChanged) {
          const now = Date.now();
          const timeSinceLastSync = now - this.lastSyncAttempt;
          
          // 只有距离上次同步超过2分钟，或者累积了5个变更，才进行云端同步
          if (timeSinceLastSync >= 2 * 60 * 1000 || this.pendingChanges >= 5) {
            console.log('自动同步：满足条件，开始云端同步');
            this.showSyncStatus('正在同步数据...', 'info');
            try {
              await this.syncData();
              this.showSyncStatus('数据同步成功', 'success');
            } catch (e) {
              this.showSyncStatus('同步失败，将在网络恢复后重试', 'warning');
            }
          } else {
            console.log('自动同步：条件不满足，仅保存本地');
          }
        } else if (!navigator.onLine) {
          console.log('无网络连接，仅保存本地');
        }
        
        // 每30分钟自动备份到云端
        const now = Date.now();
        if (!this.lastBackupTime || now - this.lastBackupTime >= 30 * 60 * 1000) {
          if (navigator.onLine && this.currentUserId) {
            console.log('自动备份：开始备份到云端');
            try {
              await this.backupCloudData();
              this.lastBackupTime = now;
              this.showSyncStatus('数据备份成功', 'success');
            } catch (e) {
              console.error('自动备份失败:', e);
            }
          }
        }
      }, 5 * 60 * 1000); // 每5分钟检查一次
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
      try {
        // 检查是否已经加载过数据（避免重复加载覆盖同步的数据）
        if (!this.dataLoaded) {
          // 加载用户数据和当前班级数据
          this.loadUserData();
          this.dataLoaded = true;
          console.log('首次加载用户数据');
        } else {
          console.log('数据已加载，跳过重复加载');
        }
        
        // 渲染各项设置
        this.renderPlusItems();
        this.renderMinusItems();
        this.renderPrizes();
        this.renderLotteryPrizes();
        
        // 绑定事件和显示页面
        this.bindNav();
        this.bindSearch();
        this.bindStoreTabs();
        this.loadBroadcastSettings();
        this.loadBroadcastMessages();
        this.showPage('dashboard');
        this.renderDashboard();
        this.renderStudents();
        this.renderHonor();
        this.renderStore();
        
        // 初始化照片存储（添加错误处理）
        try {
          this.initPhotoStorage();
        } catch (e) {
          console.error('照片存储初始化失败:', e);
        }
        
        // 每小时重置GitHub API计数
        setInterval(() => {
          try {
            this.resetGithubApiCounter();
          } catch (e) {
            console.error('重置API计数器失败:', e);
          }
        }, 60 * 60 * 1000);
        
        // 启动照片队列处理器
        this.startPhotoQueueProcessor();
        
        console.log('应用初始化完成');
      } catch (e) {
        console.error('应用初始化失败:', e);
      }
    },

    getStagePoints() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      return currentClass ? (parseInt(currentClass.stagePoints, 10) || 20) : 20;
    },
    getTotalStages() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      return currentClass ? (parseInt(currentClass.totalStages, 10) || 10) : 10;
    },
    getPlusItems() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      return currentClass ? (currentClass.plusItems || DEFAULT_PLUS_ITEMS) : DEFAULT_PLUS_ITEMS;
    },
    getMinusItems() {
      const data = getUserData();
      const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
      return currentClass ? (currentClass.minusItems || DEFAULT_MINUS_ITEMS) : DEFAULT_MINUS_ITEMS;
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
        broadcastMessages: ['欢迎来到童心宠伴！🎉'],
        petCategoryPhotos: {}
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
      const type = PET_TYPES.find(t => t.id === s.pet.typeId);
      return type && type.food ? type.food : '🍖';
    },

    bindNav() {
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => this.showPage(btn.dataset.page));
      });
      
      // 光荣榜时间周期标签
      document.querySelectorAll('.honor-period-tab').forEach(tab => {
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
      this.loadBadgeAwardStudents();
      this.renderBackupStatus();
      this.renderAccessoriesList();
      this.checkAndShowPhotoStorageConfig();
      this.refreshStorageStatus();
      this.renderBatchSyncButton();
    }
    },

    bindSearch() {
      const search = document.getElementById('studentSearch');
      if (search) search.addEventListener('input', () => this.renderStudents());
      const petSearch = document.getElementById('petStudentSearch');
      if (petSearch) petSearch.addEventListener('input', () => this.renderPetStudentList());
    },

    bindStoreTabs() {
      document.querySelectorAll('.store-tab').forEach(tab => {
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
      const total = this.students.length;
      const withPet = this.students.filter(s => s.pet).length;
      let badges = 0;
      this.students.forEach(s => { badges += this.getTotalBadgesEarned(s); });
      document.getElementById('statStudents').textContent = total;
      document.getElementById('statPets').textContent = withPet;
      document.getElementById('statBadges').textContent = badges;
    },

    renderStudents() {
      const keyword = (document.getElementById('studentSearch') && document.getElementById('studentSearch').value || '').trim().toLowerCase();
      let list = this.students;
      if (keyword) list = list.filter(s => (s.name || '').toLowerCase().includes(keyword) || (s.id || '').toLowerCase().includes(keyword));
      const html = list.map(s => this.studentCardHtml(s)).join('');
      const el = document.getElementById('studentList');
      if (el) el.innerHTML = html || '<p class="placeholder-text">暂无学生，请导入学生名单</p>';
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

    studentCardHtml(s) {
      const stagePoints = this.getStagePoints();
      const totalStages = this.getTotalStages();
      let petHtml = '';
      let badgeCount = this.getTotalBadgesEarned(s);
      
      // 获取当前阶段
      const currentStage = s.pet ? (s.pet.stage || 0) : 0;
      const theme = this.getCardThemeByLevel(currentStage);
      
      if (s.pet) {
        if (s.pet.stage === 1) {
          // 第1阶段：宠物蛋 - 使用固定样式
          petHtml = `<div class="student-pet-preview"><div class="pet-egg" style="width: 100%; height: 100%; background: linear-gradient(135deg, #fef9c3 0%, #fde047 50%, #facc15 100%); border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3), inset 0 -10px 15px rgba(255, 255, 255, 0.3);"><span style="font-size: 2.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">🥚</span></div></div>`;
        } else if ((s.pet.stage || 0) >= totalStages) {
          // 已完成：成熟期 - 调用本地照片
          petHtml = `<div class="student-pet-preview"><img src="photos/${s.pet.typeId}/mature/${s.pet.breedId}_stage3.jpg" class="pet-img-stage" onerror="this.src=''; this.onerror=null;"></div>`;
        } else {
          // 中间阶段：成长期 - 调用本地照片
          petHtml = `<div class="student-pet-preview"><img src="photos/${s.pet.typeId}/growing/${s.pet.breedId}_stage2.jpg" class="pet-img-stage" onerror="this.src=''; this.onerror=null;"></div>`;
        }
      } else {
        petHtml = '<div class="student-pet-preview pet-empty"><span class="pet-img">🐣</span><small>未领养</small></div>';
      }
      
      // 计算进度百分比和还需积分
      let progressPercent = 0;
      let progressText = '';
      let needPointsText = '';
      if (s.pet) {
        if (s.pet.stage === 1) {
          progressPercent = Math.min(100, ((s.pet.stageProgress || 0) / stagePoints) * 100);
          progressText = '🥚 宠物蛋';
          const need = Math.max(0, stagePoints - (s.pet.stageProgress || 0));
          needPointsText = `还需 ${need} 积分孵化`;
        } else if ((s.pet.stage || 0) >= totalStages) {
          progressPercent = 100;
          progressText = '已满级';
          needPointsText = '已完成全部升级！';
        } else {
          progressPercent = Math.min(100, ((s.pet.stageProgress || 0) / stagePoints) * 100);
          progressText = `第${s.pet.stage}/${totalStages}阶段`;
          const need = Math.max(0, stagePoints - (s.pet.stageProgress || 0));
          needPointsText = `还需 ${need} 积分升级`;
        }
      } else {
        needPointsText = '未领养宠物';
      }
      
      // 宠物装扮
      const petAccessories = s.pet && s.pet.accessories ? s.pet.accessories : [];
      const accessoriesHtml = petAccessories.length > 0 ? 
        `<div class="pet-accessories">${petAccessories.map(acc => `<span class="accessory" title="${acc.name}">${acc.icon}</span>`).join('')}</div>` : 
        '';
      
      // 判断是否可以喂食
      const canFeed = s.pet && (s.points || 0) >= 1 && (s.pet.stage || 0) < totalStages;
      const feedAction = canFeed ? `onclick="event.stopPropagation(); app.quickFeed('${s.id}')"` : '';
      const feedClass = canFeed ? 'can-feed' : 'cannot-feed';
      const isMaxLevel = s.pet && (s.pet.stage || 0) >= totalStages && s.pet.completed;
      
      // 按照设计图重新设计学生卡片
      return `
        <div class="student-card-v2" data-id="${s.id}" data-student-id="${s.id}" style="background: ${theme.bg}; border-color: ${theme.border};" onclick="app.openStudentModal('${s.id}')">
          <div class="student-card-v2-header">
            <span class="student-level" style="color: ${theme.primary}; background: ${theme.bg};">Lv.${s.pet ? (s.pet.stage || 0) : 0}</span>
            ${badgeCount > 0 ? `<span class="student-badge-count">🏆${badgeCount}</span>` : ''}
            ${isMaxLevel ? `<span class="student-crown">👑</span>` : ''}
          </div>
          <div class="student-card-v2-pet">
            ${petHtml}
            ${accessoriesHtml}
          </div>
          <div class="student-card-v2-info">
            <div class="student-name-row">
              <span class="student-name-v2" style="color: ${theme.primary};">${this.escape(s.name)}</span>
              ${s.pet ? `<span class="student-pet-type">${s.pet.isCustom ? s.pet.customName : (s.pet.typeId ? '宠物' : '未领养')}</span>` : '<span class="student-pet-type">未领养</span>'}
            </div>
            <div class="student-progress-row">
              <span class="progress-label">${needPointsText}</span>
              <span class="progress-status">${progressText}</span>
            </div>
            <div class="student-progress-bar">
              <div class="progress-fill" style="width: ${progressPercent}%; background: ${theme.primary};"></div>
            </div>
            <div class="student-points-row ${feedClass}" ${feedAction} title="${canFeed ? '点击喂食' : '积分不足或已满级'}">
              <span class="points-icon">🍖</span>
              <span class="points-value">${s.points ?? 0}</span>
            </div>
          </div>
          <div class="student-card-v2-actions">
            ${s.pet ? `<button class="btn btn-small" onclick="event.stopPropagation(); app.dressUpPet('${s.id}')">🎀 装扮</button>` : ''}
          </div>
        </div>`;
    },

    openStudentModal(studentId) {
      const s = this.students.find(x => x.id === studentId);
      if (!s) return;
      const plusItems = this.getPlusItems();
      const minusItems = this.getMinusItems();
      const stagePoints = this.getStagePoints();
      const totalStages = this.getTotalStages();
      let petSection = '';
      if (s.pet) {
        const type = PET_TYPES.find(t => t.id === s.pet.typeId);
        const breed = type && type.breeds.find(b => b.id === s.pet.breedId);
        const icon = (breed && breed.icon) || (type && type.icon) || '🐾';
        const progress = s.pet.stageProgress || 0;
        const need = stagePoints;
        const stage = s.pet.stage || 0;
        const canFeed = !s.pet.hatching && stage < totalStages && (s.points || 0) >= 1;
        const foodLabel = this.getPetFood(s);
        petSection = `
          <div class="modal-feed-section">
            <p><strong>宠物进度</strong>：第 ${stage}/${totalStages} 阶段，本阶段 ${progress}/${need} 分</p>
            ${canFeed ? `<button class="btn feed-btn" onclick="app.feedStudentInModal('${s.id}')">${foodLabel} 喂食（消耗1积分）</button>` : '<p class="text-muted">积分不足或已满级</p>'}
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
        const t = PET_TYPES.find(x => x.id === cp.typeId);
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
      const toNext = s.pet && (s.pet.hatching || (s.pet.stage || 0) < totalStages) ? Math.max(0, stagePoints - (s.pet.stageProgress || 0)) : null;
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
        <div class="modal-score-section">
          <p><strong>加分</strong></p>
          <div class="score-btns">${plusBtns}</div>
          <p><strong>扣分</strong></p>
          <div class="score-btns">${minusBtns}</div>
        </div>
        ${toNextTip}
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

    addScoreToStudent(studentId, type, itemIndex) {
      const s = this.students.find(x => x.id === studentId);
      if (!s) return;
      const items = type === 'plus' ? this.getPlusItems() : this.getMinusItems();
      const item = items[itemIndex];
      if (!item) return;
      const delta = type === 'plus' ? (item.points || 1) : -(Math.abs(item.points) || 1);
      s.points = (s.points || 0) + delta;
      if (!s.scoreHistory) s.scoreHistory = [];
      s.scoreHistory.unshift({ time: Date.now(), delta, reason: item.name });
      this.saveStudents();
      this.renderStudents();
      this.renderHonor();
      // 显示加分减分特效
      this.showScoreEffect(studentId, delta);
      // 添加到广播站
      this.addBroadcastMessage(s.name, delta, item.name);
      if (document.getElementById('studentModal').classList.contains('show')) this.openStudentModal(studentId);
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
        welcome.textContent = '欢迎来到童心宠伴！🎉';
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
                      `<img src="photos/${s.pet.typeId}/mature/${s.pet.breedId}_stage3.jpg" class="pet-img-stage" style="width: 100px; height: 100px; object-fit: cover;" onerror="this.src=''; this.onerror=null;">`
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
      const card = document.querySelector('.student-card-v2[data-student-id="' + studentId + '"]');
      if (!card) return;
      
      const pointsRow = card.querySelector('.student-points-row');
      if (!pointsRow) return;
      
      const rect = pointsRow.getBoundingClientRect();
      const effect = document.createElement('div');
      effect.className = 'feed-effect';
      effect.textContent = '🍖 +1';
      effect.style.left = rect.left + rect.width / 2 - 20 + 'px';
      effect.style.top = rect.top + 'px';
      effect.style.fontSize = '1.5rem';
      effect.style.fontWeight = 'bold';
      effect.style.color = '#f59e0b';
      document.body.appendChild(effect);
      
      setTimeout(() => effect.remove(), 1200);
    },

    // 显示升级特效
    showLevelUpEffect(studentId, newStage) {
      const card = document.querySelector('.student-card-v2[data-student-id="' + studentId + '"]');
      if (!card) return;
      
      const petContainer = card.querySelector('.student-card-v2-pet');
      if (!petContainer) return;
      
      const rect = petContainer.getBoundingClientRect();
      const effect = document.createElement('div');
      effect.className = 'level-up-effect';
      effect.innerHTML = `
        <div class="level-up-text">Lv.${newStage}</div>
        <div class="level-up-stars"></div>
      `;
      effect.style.left = rect.left + rect.width / 2 + 'px';
      effect.style.top = rect.top + rect.height / 2 + 'px';
      document.body.appendChild(effect);
      
      setTimeout(() => effect.remove(), 1500);
    },

    // 显示卡片闪光特效
    showCardFlashEffect(studentId) {
      const card = document.querySelector('.student-card-v2[data-student-id="' + studentId + '"]');
      if (!card) return;
      
      const flash = document.createElement('div');
      flash.className = 'card-flash-effect';
      card.appendChild(flash);
      
      setTimeout(() => flash.remove(), 800);
    },

    // 显示加分减分特效
    showScoreEffect(studentId, delta) {
      const card = document.querySelector('.student-card-v2[data-student-id="' + studentId + '"]');
      if (!card) return;
      
      const pointsRow = card.querySelector('.student-points-row');
      if (!pointsRow) return;
      
      const rect = pointsRow.getBoundingClientRect();
      const effect = document.createElement('div');
      effect.className = 'score-effect';
      effect.textContent = delta > 0 ? `+${delta}` : `${delta}`;
      effect.style.left = rect.left + rect.width / 2 - 20 + 'px';
      effect.style.top = rect.top + 'px';
      effect.style.fontSize = '1.5rem';
      effect.style.fontWeight = 'bold';
      effect.style.color = delta > 0 ? '#4ECDC4' : '#FF6B6B';
      effect.style.textShadow = delta > 0 ? '0 0 10px #4ECDC4' : '0 0 10px #FF6B6B';
      document.body.appendChild(effect);
      
      // 动画效果
      effect.style.animation = delta > 0 ? 'scoreUp 1.2s ease-out forwards' : 'scoreDown 1.2s ease-out forwards';
      
      setTimeout(() => effect.remove(), 1200);
    },

    interactWithPet(studentId) {
      const card = document.querySelector('.student-card[data-student-id="' + studentId + '"]');
      if (!card) return;
      const preview = card.querySelector('.student-pet-preview');
      if (preview) {
        preview.classList.add('pet-interact-animate');
        setTimeout(function () { preview.classList.remove('pet-interact-animate'); }, 600);
      }
      const container = document.getElementById('effectContainer');
      if (container) {
        const el = document.createElement('div');
        el.className = 'interact-effect';
        el.textContent = ['💕', '✨', '🌟', '😊'][Math.floor(Math.random() * 4)];
        el.style.left = (30 + Math.random() * 40) + '%';
        el.style.top = (20 + Math.random() * 30) + '%';
        container.appendChild(el);
        setTimeout(function () { el.remove(); }, 1000);
      }
    },

    feedPet(studentId, amount) {
      const s = this.students.find(x => x.id === studentId);
      if (!s || !s.pet) return;
      const pts = Math.min(amount, s.points || 0);
      if (pts <= 0) return;
      s.points = (s.points || 0) - pts;
      const stagePoints = this.getStagePoints();
      const totalStages = this.getTotalStages();
      
      let stage = s.pet.stage || 1;
      let progress = (s.pet.stageProgress || 0) + pts;
      
      // 第1阶段：宠物蛋，需要孵化
      if (stage === 1) {
        if (progress >= stagePoints) {
          stage = 2;
          progress = progress - stagePoints;
          this.showUpgradeEffect();
        }
      }
      
      // 第2阶段及以上：正常升级
      while (stage < totalStages && progress >= stagePoints) {
        progress -= stagePoints;
        stage++;
        this.showUpgradeEffect();
      }
      
      s.pet.stage = stage;
      s.pet.stageProgress = progress;
      
      // 完成全部升级后获得1枚勋章
      if (stage >= totalStages && !s.pet.completed) {
        s.pet.completed = true;
        s.pet.badgesEarned = 1;
        this.showCompleteEffect();
        // 显示全屏烟花特效
        this.showFireworksEffect();
        // 语音播报
        this.speak(`恭喜${s.name}养成宠物！`);
      }
      this.saveStudents();
    },

    showUpgradeEffect() {
      const el = document.createElement('div');
      el.className = 'upgrade-effect';
      el.textContent = '✨ 升级啦！';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1000);
    },
    showCompleteEffect() {
      const el = document.createElement('div');
      el.className = 'complete-effect';
      el.innerHTML = '🏅 恭喜获得勋章！';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2000);
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
      if ('speechSynthesis' in window) {
        const speech = new SpeechSynthesisUtterance(text);
        speech.lang = 'zh-CN';
        speech.volume = 1;
        speech.rate = 1;
        speech.pitch = 1;
        window.speechSynthesis.speak(speech);
      }
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
      const stagePoints = this.getStagePoints();
      if (s.pet) {
        if (s.pet.hatching) {
          const canFeed = (s.points || 0) >= 1;
          let petDisplay, foodStr;
          if (s.pet.isCustom && s.pet.customImage) {
            petDisplay = `<img src="${s.pet.customImage}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 50%; filter: grayscale(50%); margin-bottom: 16px;">`;
            foodStr = '🍖';
          } else {
            const type = PET_TYPES.find(t => t.id === s.pet.typeId);
            const breed = type && type.breeds.find(b => b.id === s.pet.breedId);
            // 使用固定的宠物蛋样式
            petDisplay = `
              <div style="width: 120px; height: 120px; background: linear-gradient(135deg, #fef9c3 0%, #fde047 50%, #facc15 100%); border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3), inset 0 -10px 15px rgba(255, 255, 255, 0.3); margin: 0 auto 16px;"><span style="font-size: 3.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">🥚</span></div>
            `;
            foodStr = type && type.food ? type.food : '🍖';
          }
          document.getElementById('currentStudentPetInfo').innerHTML = `
            <div class="egg-stage">
              ${petDisplay}
              <p>等待孵化中… 请用 <span class="feed-food-icon">${foodStr}</span> 喂养宠物完成孵化（本阶段需 ${stagePoints} 积分）</p>
              <p>当前进度：${s.pet.stageProgress || 0}/${stagePoints}</p>
              ${canFeed ? `<button class="btn feed-pet-btn btn-primary" onclick="app.feedPet('${s.id}',1); app.showEatEffect(); app.renderPetAdopt();">${foodStr} 喂食（消耗1积分）</button>` : '<p class="text-muted">积分不足无法喂食</p>'}
            </div>`;
          document.getElementById('petChooseSection').innerHTML = '';
        } else {
          const stage = s.pet.stage || 0;
          const isComplete = stage >= totalStages;
          if (isComplete) {
            let petDisplay, petName;
            if (s.pet.isCustom && s.pet.customImage) {
              petDisplay = `<img src="${s.pet.customImage}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%; margin-bottom: 8px;">`;
              petName = s.pet.customName;
            } else {
              const type = PET_TYPES.find(t => t.id === s.pet.typeId);
              const breed = type && type.breeds.find(b => b.id === s.pet.breedId);
              const photoPath = `photos/${type.id}/mature/${breed.id}_stage3.jpg`;
              petDisplay = `
                <img src="${photoPath}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%; margin-bottom: 8px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
                <span class="breed-icon" style="display:none">${(breed && breed.icon) || (type && type.icon) || '🐾'}</span>
              `;
              petName = (breed && breed.name) || (type && type.name);
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
            let petDisplay, petName, foodStr;
            if (s.pet.isCustom && s.pet.customImage) {
              petDisplay = `<img src="${s.pet.customImage}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%; margin-bottom: 8px;">`;
              petName = s.pet.customName;
              foodStr = '🍖';
            } else {
              const type = PET_TYPES.find(t => t.id === s.pet.typeId);
              const breed = type && type.breeds.find(b => b.id === s.pet.breedId);
              let petDisplay;
              if (stage === 1) {
                // 第一阶段：宠物蛋 - 使用固定样式
                petDisplay = `
                  <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #fef9c3 0%, #fde047 50%, #facc15 100%); border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3), inset 0 -10px 15px rgba(255, 255, 255, 0.3); margin: 0 auto 8px;"><span style="font-size: 3rem; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">🥚</span></div>
                `;
              } else if (isComplete) {
                // 已完成：成熟期 - 调用本地照片
                const photoPath = `photos/${type.id}/mature/${breed.id}_stage3.jpg`;
                petDisplay = `
                  <img src="${photoPath}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%; margin-bottom: 8px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
                  <span class="breed-icon" style="display:none">${(breed && breed.icon) || (type && type.icon) || '🐾'}</span>
                `;
              } else {
                // 中间阶段：成长期 - 调用本地照片
                const photoPath = `photos/${type.id}/growing/${breed.id}_stage2.jpg`;
                petDisplay = `
                  <img src="${photoPath}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%; margin-bottom: 8px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
                  <span class="breed-icon" style="display:none">${(breed && breed.icon) || (type && type.icon) || '🐾'}</span>
                `;
              }
              petName = (breed && breed.name) || (type && type.name);
              foodStr = type && type.food ? type.food : '🍖';
            }
            const progress = s.pet.stageProgress || 0;
            const need = stagePoints;
            const pct = need ? Math.min(100, (progress / need) * 100) : 0;
            const borderStyle = STAGE_BORDERS[Math.min(stage, STAGE_BORDERS.length - 1)];
            
            // 显示喂食按钮（如果还未完成）
            const canFeed = (s.points || 0) >= 1 && !isComplete;
            const feedButton = canFeed ? `<button class="btn feed-pet-btn btn-primary" onclick="app.feedPet('${s.id}',1); app.showEatEffect(); app.renderPetAdopt();">${foodStr} 喂食（消耗1积分）</button>` : '<p class="text-muted">积分不足无法喂食</p>';
            
            document.getElementById('currentStudentPetInfo').innerHTML = `
              <div class="pet-growth-area">
                <p><strong>${this.escape(s.name)}</strong> 的宠物（已领养，不可更换）</p>
                <div class="pet-display-box" style="border: ${borderStyle}">
                  ${petDisplay}
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
          const t = PET_TYPES.find(x => x.id === cp.typeId);
          const b = t && t.breeds.find(x => x.id === cp.breedId);
          return { icon: (b && b.icon) || (t && t.icon) || '🐾', name: (b && b.name) || (t && t.name) || '' };
        });
        const completedTip = completedList.length ? `<p class="completed-pets-tip">已养成宠物：${completedList.map(c => c.icon + ' ' + this.escape(c.name)).join('、')}</p>` : '';
        document.getElementById('currentStudentPetInfo').innerHTML = `<p><strong>${this.escape(s.name)}</strong> 选择要领养的新宠物</p>${completedTip}`;
        let optionsHtml = '<div class="pet-adopt-options">';
        PET_TYPES.forEach(type => {
          type.breeds.forEach(breed => {
            // 从照片包读取成长期照片，格式：photos/类别ID/growing/品种ID_stage2.jpg
            const photoPath = `photos/${type.id}/growing/${breed.id}_stage2.jpg`;
            optionsHtml += `
              <div class="pet-breed-option" data-type="${type.id}" data-breed="${breed.id}" data-food="${this.escape(type.food)}">
                <img src="${photoPath}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 8px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
                <span class="breed-icon" style="display:none">${breed.icon}</span>
                <span class="breed-name">${this.escape(breed.name)}</span>
              </div>`;
          });
        });
        optionsHtml += '</div>';
        document.getElementById('petChooseSection').innerHTML = optionsHtml;
        document.getElementById('petChooseSection').querySelectorAll('.pet-breed-option').forEach(node => {
          node.addEventListener('click', () => {
            const typeId = node.dataset.type;
            const breedId = node.dataset.breed;
            const type = PET_TYPES.find(t => t.id === typeId);
            if (!type || !s) return;
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
      let earned = (s.completedPets || []).reduce((sum, p) => sum + (p.badgesEarned || 0), 0);
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

    renderLotteryWheel() {
      const prizes = getStorage(STORAGE_KEYS.lotteryPrizes, []);
      const wheel = document.getElementById('lotteryWheel');
      if (!wheel) return;
      if (!prizes.length) { 
        wheel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">请先在设置中添加转盘奖品</div>'; 
        return; 
      }
      
      // 渲染转盘上的奖品
      const segmentAngle = 360 / prizes.length;
      let gradientColors = [];
      const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181', '#AA96DA', '#FCBAD3', '#FFFFD2'];
      
      for (let i = 0; i < prizes.length; i++) {
        const startAngle = i * segmentAngle;
        const endAngle = (i + 1) * segmentAngle;
        const color = colors[i % colors.length];
        gradientColors.push(`${color} ${startAngle}deg ${endAngle}deg`);
      }
      
      wheel.style.background = `conic-gradient(from 0deg, ${gradientColors.join(', ')})`;
      
      // 渲染奖品标签
      let labelsHtml = '';
      for (let i = 0; i < prizes.length; i++) {
        const angle = i * segmentAngle + segmentAngle / 2;
        const radian = (angle - 90) * Math.PI / 180;
        const x = 50 + 35 * Math.cos(radian);
        const y = 50 + 35 * Math.sin(radian);
        labelsHtml += `<div class="lottery-prize-label" style="left:${x}%;top:${y}%;transform:translate(-50%,-50%) rotate(${angle}deg)">${this.escape(prizes[i].name)}</div>`;
      }
      
      wheel.innerHTML = labelsHtml;
      
      const btn = document.getElementById('lotterySpinBtn');
      if (btn) btn.onclick = () => this.spinLottery();
    },

    spinLottery() {
      // 检查当前学生
      if (!this._lotteryStudentId) {
        alert('请先选择要抽奖的学生！');
        return;
      }
      
      const student = this.students.find(s => s.id === this._lotteryStudentId);
      if (!student) {
        alert('学生信息错误！');
        return;
      }
      
      // 检查勋章数量
      const availableBadges = this.getAvailableBadges(student);
      if (availableBadges < 1) {
        alert(`${student.name} 的勋章数量不足！需要 1 枚勋章才能抽奖。`);
        return;
      }
      
      const prizes = getStorage(STORAGE_KEYS.lotteryPrizes, []);
      if (!prizes.length) {
        alert('暂无奖品，请教师先设置奖品！');
        return;
      }
      
      const wheel = document.getElementById('lotteryWheel');
      const btn = document.getElementById('lotterySpinBtn');
      if (!wheel || !btn) return;
      
      // 禁用按钮
      btn.disabled = true;
      btn.textContent = '抽奖中...';
      
      // 随机选择奖品
      const idx = Math.floor(Math.random() * prizes.length);
      const segmentAngle = 360 / prizes.length;
      const targetAngle = idx * segmentAngle + segmentAngle / 2;
      
      // 计算旋转角度（多圈 + 目标角度）
      const spins = 5 + Math.floor(Math.random() * 3); // 5-7圈
      const finalAngle = spins * 360 + (360 - targetAngle);
      
      // 执行旋转动画
      wheel.style.transform = `rotate(${finalAngle}deg)`;
      
      // 动画结束后显示结果
      setTimeout(() => {
        const prize = prizes[idx];
        
        // 扣除勋章
        student.badgesSpent = (student.badgesSpent || 0) + 1;
        this.saveStudents();
        
        // 显示结果
        alert(`🎉 恭喜 ${student.name} 抽中：${prize.name}！\n\n已消耗 1 枚勋章，剩余 ${this.getAvailableBadges(student)} 枚。`);
        
        // 重置转盘
        wheel.style.transition = 'none';
        wheel.style.transform = 'rotate(0deg)';
        setTimeout(() => {
          wheel.style.transition = 'transform 3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        }, 50);
        
        // 恢复按钮
        btn.disabled = false;
        btn.textContent = '转动抽奖';
        
        // 更新显示
        this.renderLotteryStudentList();
      }, 3000);
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
      `).join('');
      document.getElementById('plusItemsList').innerHTML = html;
      document.querySelectorAll('#plusItemsList input').forEach(inp => {
        inp.addEventListener('change', () => {
          const data = getUserData();
          const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
          if (currentClass) {
            const arr = currentClass.plusItems || [...DEFAULT_PLUS_ITEMS];
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
      `).join('');
      document.getElementById('minusItemsList').innerHTML = html;
      document.querySelectorAll('#minusItemsList input').forEach(inp => {
        inp.addEventListener('change', () => {
          const data = getUserData();
          const currentClass = data.classes && this.currentClassId ? data.classes.find(c => c.id === this.currentClassId) : null;
          if (currentClass) {
            const arr = currentClass.minusItems || [...DEFAULT_MINUS_ITEMS];
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
        const defaultItems = type === 'plus' ? DEFAULT_PLUS_ITEMS : DEFAULT_MINUS_ITEMS;
        const arr = type === 'plus' ? (currentClass.plusItems || [...defaultItems]) : (currentClass.minusItems || [...defaultItems]);
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
        const defaultItems = type === 'plus' ? DEFAULT_PLUS_ITEMS : DEFAULT_MINUS_ITEMS;
        const arr = type === 'plus' ? (currentClass.plusItems || [...defaultItems]) : (currentClass.minusItems || [...defaultItems]);
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
      const key = type === 'plus' ? STORAGE_KEYS.plusItems : STORAGE_KEYS.minusItems;
      const defaultItems = type === 'plus' ? DEFAULT_PLUS_ITEMS : DEFAULT_MINUS_ITEMS;
      const arr = getStorage(key, defaultItems);
      if (editIndex !== '' && editIndex !== undefined) {
        const i = parseInt(editIndex, 10);
        if (arr[i]) arr[i] = { name, points: type === 'minus' ? Math.abs(points) : points };
      } else arr.push({ name, points: type === 'minus' ? Math.abs(points) : points });
      setStorage(key, arr);
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
      const prizes = getStorage(STORAGE_KEYS.lotteryPrizes, []);
      const html = prizes.map((p, i) => `
        <div class="prize-item-row">
          <input type="text" value="${this.escape(p.name)}" placeholder="奖品名" data-i="${i}" data-f="name">
          <button class="btn-remove" onclick="app.removeLotteryPrize(${i})">删除</button>
        </div>
      `).join('');
      document.getElementById('lotteryPrizeList').innerHTML = html;
      document.querySelectorAll('#lotteryPrizeList input').forEach(inp => {
        inp.addEventListener('change', () => {
          const arr = getStorage(STORAGE_KEYS.lotteryPrizes, []);
          const i = parseInt(inp.dataset.i, 10);
          if (arr[i]) arr[i].name = inp.value;
          setStorage(STORAGE_KEYS.lotteryPrizes, arr);
          this.saveData();
        });
      });
    },
    addLotteryPrizeModal() {
      const name = prompt('转盘奖品名称：');
      if (!name) return;
      const arr = getStorage(STORAGE_KEYS.lotteryPrizes, []);
      arr.push({ name });
      setStorage(STORAGE_KEYS.lotteryPrizes, arr);
      this.saveData();
      this.renderLotteryPrizes();
      this.renderLotteryWheel();
    },
    removeLotteryPrize(i) {
      const arr = getStorage(STORAGE_KEYS.lotteryPrizes, []);
      arr.splice(i, 1);
      setStorage(STORAGE_KEYS.lotteryPrizes, arr);
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
      const idx = Math.floor(Math.random() * this.students.length);
      const s = this.students[idx];
      const div = document.createElement('div');
      div.className = 'rollcall-overlay';
      div.innerHTML = '<div class="rollcall-display">' + (s.avatar || '👦') + ' ' + this.escape(s.name) + '</div>';
      div.onclick = () => div.remove();
      document.body.appendChild(div);
      // 语音播报学生名字
      this.speak(`请${s.name}回答问题`);
      setTimeout(() => div.remove(), 3000);
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
              if (key && key.startsWith('class_pet_backup_')) {
                const value = localStorage.getItem(key);
                cleanedSize += (key.length + value.length) * 2;
                localStorage.removeItem(key);
                cleanedCount++;
              }
            }
            
            // 清理内存存储中的备份数据
            for (const key in memoryStorage) {
              if (key.startsWith('class_pet_backup_')) {
                delete memoryStorage[key];
                cleanedCount++;
              }
            }
            
            // 清理IndexedDB中的备份数据
            if (useIndexedDB && indexedDBReady) {
              try {
                const allKeys = await IndexedDBManager.getAllKeys();
                for (const key of allKeys) {
                  if (key.startsWith('class_pet_backup_')) {
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
    
    saveStudents() { 
      this.saveData();
    },
    
    // 本地备份存储
    saveToLocalBackup() {
      try {
        const classData = getClassData();
        const backupKey = `class_pet_backup_${this.currentClassId}`;
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
        const backupKey = `class_pet_backup_${this.currentClassId}`;
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
      setStorage(STORAGE_KEYS.theme, theme);
      this.saveData();
      document.body.setAttribute('data-theme', theme);
    },
    importStudents() { document.getElementById('importFile').click(); },
    openAddStudentModal() {
      document.getElementById('addStudentId').value = '';
      document.getElementById('addStudentName').value = '';
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
        modal.style.display = 'none';
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
      this.students.push({ id, name, points: 0, avatar });
      this.saveStudents();
      this.closeAddStudentModal();
      this.renderStudents();
      this.renderDashboard();
      this.renderPetStudentList();
      this.renderStudentManage();
      this.renderScoreHistory();
      this.loadBadgeAwardStudents();
      this.renderStore();
      alert('添加成功');
    },
    exportToExcel() {
      if (!this.students.length) { alert('暂无数据'); return; }
      const stagePoints = this.getStagePoints();
      const totalStages = this.getTotalStages();
      const headers = ['学号', '姓名', '积分', '宠物类型', '宠物品种', '阶段', '本阶段进度', '徽章数'];
      const rows = this.students.map(s => {
        const type = s.pet ? PET_TYPES.find(t => t.id === s.pet.typeId) : null;
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
      const stagePoints = parseInt(document.getElementById('settingStagePoints').value, 10) || 20;
      const stages = parseInt(document.getElementById('settingStages').value, 10) || 10;
      
      // 直接调用saveUserData保存所有设置
      this.saveUserData();
      
      // 更新UI显示
      var t = document.getElementById('systemTitleText');
      if (t) t.textContent = name || '童心宠伴';
      else if (document.getElementById('systemTitle')) document.getElementById('systemTitle').textContent = name || '童心宠伴';
      document.getElementById('currentClassName').textContent = className ? `| ${className}` : '';
      this.currentClassName = className;
      document.body.setAttribute('data-theme', theme);
      
      alert('已保存');
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
      a.download = '童心宠伴_全部备份_' + new Date().toISOString().slice(0, 10) + '.json';
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
      a.download = `童心宠伴_${currentClass.name}_班级数据_${new Date().toISOString().slice(0, 10)}.json`;
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
          } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.csv')) {
            // 导入Excel/CSV学生名单
            this.importExcelData(e.target.result, fileName);
          } else {
            alert('不支持的文件格式，请上传 .json, .xlsx 或 .csv 文件');
          }
        } catch (err) {
          alert('导入失败：' + (err.message || '文件格式错误'));
        }
        event.target.value = '';
      };
      
      if (fileName.endsWith('.json')) {
        reader.readAsText(file, 'UTF-8');
      } else {
        reader.readAsBinaryString(file);
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
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        
        if (!jsonData || jsonData.length === 0) {
          alert('Excel文件中没有数据');
          return;
        }
        
        // 映射Excel列到学生数据
        const students = [];
        let successCount = 0;
        let skipCount = 0;
        
        jsonData.forEach((row, index) => {
          // 支持多种列名格式
          const id = row['学号'] || row['ID'] || row['id'] || row['编号'] || '';
          const name = row['姓名'] || row['名字'] || row['name'] || row['学生姓名'] || '';
          
          if (id && name) {
            // 检查是否已存在
            const existing = this.students.find(s => s.id === String(id));
            if (!existing) {
              students.push({
                id: String(id),
                name: String(name),
                avatar: row['头像'] || '👦',
                points: parseInt(row['积分']) || 0,
                badges: parseInt(row['徽章']) || 0,
                groupName: row['所在小组'] || ''
              });
              successCount++;
            } else {
              skipCount++;
            }
          }
        });
        
        if (students.length > 0) {
          // 添加到当前班级
          this.students.push(...students);
          this.saveStudents();
          this.renderStudents();
          this.renderDashboard();
          this.renderHonor();
          this.renderStudentManage();
          this.loadBadgeAwardStudents();
          
          let msg = `成功导入 ${successCount} 名学生`;
          if (skipCount > 0) {
            msg += `，跳过 ${skipCount} 名已存在学生`;
          }
          alert(msg);
        } else {
          alert('没有可导入的学生数据（可能所有学生都已存在）');
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
      this.renderScoreHistory();
      this.loadBadgeAwardStudents();
      this.renderStore();
      alert('学生已删除');
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

    addGroupPoint() {
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
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const data = ev.target.result;
        let rows = [];
        if (file.name.endsWith('.csv')) {
          const text = new TextDecoder().decode(data);
          rows = text.split(/\r?\n/).map(line => line.split(',').map(c => c.trim()));
        } else {
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        }
        if (rows.length < 2) { alert('文件至少需要表头+一行数据'); return; }
        // 确保表头是数组
        if (!Array.isArray(rows[0])) { alert('文件格式错误：表头不是有效的数组'); return; }
        const headers = rows[0].map(h => (h || '').toString().toLowerCase());
        const idCol = headers.findIndex(h => h.includes('学号') || h === 'id' || h === '编号');
        const nameCol = headers.findIndex(h => h.includes('姓名') || h === 'name');
        const idIdx = idCol >= 0 ? idCol : 0;
        const nameIdx = nameCol >= 0 ? nameCol : 1;
        const existing = (app.students || []).map(s => s.id);
        const added = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          // 确保row是数组
          if (!Array.isArray(row)) continue;
          // 安全地获取ID和姓名，确保值不是undefined
          const idValue = row[idIdx] != null ? row[idIdx] : row[0];
          const nameValue = row[nameIdx] != null ? row[nameIdx] : row[1];
          const id = idValue != null ? idValue.toString().trim() : '';
          const name = nameValue != null ? nameValue.toString().trim() : '';
          if (!id && !name) continue;
          const sid = id || 's' + (existing.length + added.length + 1);
          if (existing.includes(sid) || added.some(a => a.id === sid)) continue;
          added.push({ id: sid, name: name || sid, points: 0, avatar: AVATAR_OPTIONS[0] });
        }
        app.students = (app.students || []).concat(added);
        app.saveStudents();
        app.renderStudents();
        app.renderDashboard();
        app.renderPetStudentList();
        alert('成功导入 ' + added.length + ' 名学生');
      } catch (err) {
        alert('导入失败：' + (err.message || err));
      }
      e.target.value = '';
    };
    if (file.name.endsWith('.csv')) reader.readAsArrayBuffer(file);
    else reader.readAsArrayBuffer(file);
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
              console.log('自动登录时从云端同步数据...');
              const syncResult = await app.syncFromCloud();
              if (syncResult) {
                console.log('从云端同步成功，使用云端数据');
                // 同步成功后重新加载用户数据
                app.loadUserData();
              } else {
                console.log('云端数据较旧或没有数据，使用本地数据');
              }
            } catch (e) {
              console.error('云端同步失败，使用本地数据:', e);
            }
          } else {
            // 无网时直接使用本地数据
            console.log('无网络连接，直接使用本地数据');
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
    await bootstrap();
    document.querySelectorAll('.login-tab').forEach(function (tabEl) {
      tabEl.addEventListener('click', function (e) {
        var t = e.currentTarget.dataset.tab;
        document.querySelectorAll('.login-tab').forEach(function (x) { x.classList.remove('active'); });
        e.currentTarget.classList.add('active');
        document.getElementById('login-form').style.display = t === 'login' ? 'block' : 'none';
        document.getElementById('register-form').style.display = t === 'register' ? 'block' : 'none';
      });
    });
    document.getElementById('login-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var username = (document.getElementById('loginUsername').value || '').trim();
      var password = (document.getElementById('loginPassword').value || '').trim();
      if (!username) { alert('请输入用户名（手机号或邮箱）'); return; }
      if (!password) { alert('请输入密码'); return; }
      
      console.log('登录尝试:', username);
      
      // 检查是否为管理员账号
      const isAdmin = ADMIN_ACCOUNTS.some(a => a.username === username && a.password === password);
      console.log('是否为管理员:', isAdmin);
      
      if (isAdmin) {
        // 管理员登录
        app.currentUsername = username;
        app.currentUserId = 'admin_' + username;
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ 
          id: app.currentUserId, 
          username: app.currentUsername,
          isAdmin: true
        }));
        
        console.log('管理员登录成功，用户ID:', app.currentUserId);
        
        // 为管理员创建默认数据
        const userData = getUserData();
        console.log('获取到的用户数据:', userData);
        
        if (!userData.classes || userData.classes.length === 0) {
          const defaultClass = {
            id: 'class_' + Date.now(),
            name: '默认班级',
            students: [],
            groups: [],
            groupPointHistory: [],
            createdAt: new Date().toISOString(),
            stagePoints: 20,
            totalStages: 10,
            broadcastMessages: ['欢迎来到童心宠伴！🎉'],
            accessories: [...DEFAULT_ACCESSORIES],
            prizes: [...DEFAULT_PRIZES]
          };
          userData.classes = [defaultClass];
          userData.currentClassId = defaultClass.id;
          userData.systemName = '童心宠伴';
          userData.theme = 'coral';
          setUserData(userData);
          console.log('创建默认班级数据');
        }
        
        // 优先从云端同步数据（确保多端数据一致）
        let syncSuccess = false;
        try {
          console.log('管理员登录时从云端同步数据...');
          // 强制从云端同步数据，不考虑时间差
          syncSuccess = await app.syncFromCloud();
          if (syncSuccess) {
            console.log('从云端同步成功，使用云端数据');
          } else {
            console.log('云端数据较旧或没有数据，使用本地数据');
            // 即使云端没有数据，也要尝试同步本地数据到云端
            if (navigator.onLine) {
              console.log('尝试将本地数据同步到云端...');
              await app.syncToCloud();
            }
          }
        } catch (e) {
          console.error('云端同步失败，使用本地数据:', e);
          // 即使同步失败，也要确保本地数据可用
          console.log('使用本地数据，确保应用正常运行');
        }
        
        // 无论同步是否成功，都重新加载用户数据，确保显示最新信息
        app.loadUserData();
        
        // 显示应用界面
        app.showApp();
        // 显示管理员入口
        document.getElementById('adminButton').style.display = 'block';
        // 初始化并启用RealtimeSync
        window.realtimeSync.init(app.currentUserId);
        // 启用实时同步和自动同步
        app.enableRealtimeSync();
        app.enableAutoSync();
        console.log('管理员登录完成');
        return;
      }
      
      // 不是管理员，先检查本地用户列表
      console.log('非管理员登录，先检查本地用户列表');
      let localUsers = getUserList();
      console.log('本地用户列表:', localUsers);
      
      // 检查用户是否在本地存在
      let userExistsLocally = localUsers.some(u => u.username === username);
      console.log('用户是否在本地存在:', userExistsLocally);
      
      // 如果本地不存在，尝试从云端同步
      if (!userExistsLocally) {
        console.log('本地用户不存在，尝试从云端同步用户列表');
        try {
          const syncSuccess = await app.syncUserListFromCloud();
          console.log('用户列表同步结果:', syncSuccess);
          // 再次检查本地用户列表
          localUsers = getUserList();
          console.log('同步后本地用户列表:', localUsers);
          userExistsLocally = localUsers.some(u => u.username === username);
          console.log('同步后用户是否存在:', userExistsLocally);
        } catch (e) {
          console.error('同步用户列表失败:', e);
        }
      }
      
      // 进行登录
      console.log('开始登录验证');
      app.login(username, password).then(function(success) {
        if (!success) {
          // 检查用户是否存在
          const users = app.getUserList();
          console.log('最终用户列表:', users);
          const userExists = users.some(u => u.username === username);
          console.log('最终用户是否存在:', userExists);
          if (!userExists) {
            alert('用户名不存在，请先注册');
          } else {
            alert('密码错误，请重新输入');
          }
        }
      });
    });
    document.getElementById('register-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var username = (document.getElementById('registerUsername').value || '').trim();
      var password = (document.getElementById('registerPassword').value || '');
      var passwordConfirm = (document.getElementById('registerPasswordConfirm').value || '');
      var licenseKey = (document.getElementById('registerLicenseKey').value || '').trim();
      if (!username) { alert('请输入用户名（手机号或邮箱）'); return; }
      if (!password) { alert('请设置密码'); return; }
      if (password !== passwordConfirm) { alert('两次密码不一致'); return; }
      if (app.register(username, password, licenseKey)) {
        // 注册成功
      } else {
        // 注册失败，错误信息已在register函数中显示
      }
    });

    
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
  });
})();
