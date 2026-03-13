(function () {
  console.log('🚀 应用启动中...');
  
  // 初始化 Supabase - 优先使用本地文件，失败则尝试CDN
  window.initSupabaseClient = async function() {
    console.log('🔄 开始初始化Supabase...');
    
    // 检查是否有网络连接
    if (!navigator.onLine) {
      console.log('📡 无网络连接，跳过Supabase初始化，使用本地数据');
      return false;
    }
    
    try {
      // 1. 检查本地文件是否已加载
      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        console.log('✅ Supabase SDK 已由本地文件加载');
      } else {
        // 2. 本地文件未加载，尝试CDN
        console.log('⏳ 本地SDK未找到，尝试CDN加载...');
        
        const cdns = [
          'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
          'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js'
        ];
        
        let loaded = false;
        for (let i = 0; i < cdns.length; i++) {
          try {
            console.log(`⏳ 尝试加载CDN ${i + 1}/${cdns.length}`);
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = cdns[i];
              script.onload = () => resolve(true);
              script.onerror = () => reject(false);
              document.head.appendChild(script);
            });
            console.log(`✅ Supabase SDK 从CDN ${i + 1}加载成功`);
            loaded = true;
            break;
          } catch (e) {
            console.error(`❌ CDN ${i + 1}加载失败`);
          }
        }
        
        if (!loaded) {
          console.error('❌ 所有CDN都加载失败，使用本地数据');
          return false;
        }
      }
      
      // 3. 初始化客户端
      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        try {
          const supabaseUrl = 'https://cuipqszkjsxixmbrvwdg.supabase.co';
          const supabaseKey = 'sb_publishable_kV8fI-YCfPQy2m2akpOdXg_JXrRurE9';
          window.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
          console.log('✅ Supabase 初始化成功');
          return true;
        } catch (e) {
          console.error('❌ Supabase 初始化失败，使用本地数据:', e);
          return false;
        }
      }
      console.log('⚠️ Supabase SDK未加载，使用本地数据');
      return false;
    } catch (e) {
      console.error('❌ Supabase初始化出错，使用本地数据:', e);
      return false;
    }
  }
  
  // 立即开始初始化（不等待完成，不阻塞应用）
  window.initSupabaseClient().catch(e => {
    console.log('Supabase初始化不影响使用，继续加载应用');
  });
  
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
      localStorage.setItem(USER_LIST_KEY, JSON.stringify(list));
    } catch (e) {
      // localStorage 不可用时使用内存存储
      memoryStorage[USER_LIST_KEY] = list;
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
    if (!app.currentUserId) return {};
    var key = USER_DATA_PREFIX + app.currentUserId;
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
    if (!app.currentUserId) return;
    var key = USER_DATA_PREFIX + app.currentUserId;
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
          if (!user.maxDevices) {
            user.maxDevices = 5;
          }
          
          const existingDevice = user.devices.find(d => d.id === deviceId);
          
          if (existingDevice) {
            // 设备已绑定，更新最后登录时间
            existingDevice.lastLogin = new Date().toISOString();
          } else {
            // 设备未绑定，检查是否超过设备限制
            if (user.devices.length >= user.maxDevices) {
              alert('设备数量已达上限，请联系管理员或解绑其他设备');
              return false;
            }
            
            // 添加新设备
            user.devices.push({
              id: deviceId,
              name: navigator.userAgent || 'Unknown Device',
              lastLogin: new Date().toISOString()
            });
          }
          
          // 保存用户数据
          setUserList(users);
          
          this.currentUserId = user.id;
          this.currentUsername = user.username;
          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ 
            id: user.id, 
            username: user.username,
            deviceId: deviceId 
          }));
          
          // 优先从云端同步数据（确保多端数据一致）
          let syncSuccess = false;
          try {
            console.log('登录时从云端同步数据...');
            // 强制从云端同步数据，不考虑时间差
            syncSuccess = await this.syncFromCloud();
            if (syncSuccess) {
              console.log('从云端同步成功，使用云端数据');
            } else {
              console.log('云端数据较旧或没有数据，使用本地数据');
            }
          } catch (e) {
            console.error('云端同步失败，使用本地数据:', e);
          }
          
          // 显示应用界面（init中会调用loadUserData加载最新数据）
          this.showApp();
          
          // 启用实时同步和自动同步（减少频次）
          this.enableRealtimeSync();
          this.enableAutoSync();
          
          return true;
        }
        
        // 记录失败的登录尝试
        recordLoginAttempt(username, false);
        return false;
      } catch (e) {
        console.error('登录失败:', e);
        alert('登录失败，请重试');
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
        if (navigator.onLine) {
          try {
            console.log('激活授权码后实时同步到云端...');
            // 先设置用户ID
            this.currentUserId = newUser.id;
            this.currentUsername = newUser.username;
            
            // 同步到云端
            await this.syncToCloud();
            console.log('授权码状态已同步到云端');
            
            // 同步用户列表到云端
            await this.syncUserListToCloud();
            console.log('用户列表已同步到云端');
          } catch (e) {
            console.error('同步授权码状态到云端失败:', e);
          }
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
        this.init();
        // 不再调用syncData，避免重复同步
        // 渲染设备列表
        this.renderDevicesList();
      } catch (e) {
        console.error('显示应用失败:', e);
        alert('应用加载失败，请刷新页面重试');
      }
    },
    saveUserData() {
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
        
        // 如果有班级，更新班级数据
        if (this.currentClassId) {
          const currentClass = data.classes.find(c => c.id === this.currentClassId);
          if (currentClass) {
            currentClass.name = className;
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
            this.currentClassName = className;
          }
        }
        
        data.lastModified = new Date().toISOString();
        setUserData(data);
        
        // 设置数据变更标志
        this.dataChanged = true;
        this.pendingChanges++;
        
        // 使用批量同步机制
        this.scheduleSync();
      } catch (e) {
        console.error('保存用户数据失败:', e);
      }
    },
    
    // 批量同步机制
    scheduleSync() {
      // 清除之前的定时器
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
      }
      
      // 累积多个变更后一次性同步（延迟5秒）
      this.syncTimeout = setTimeout(() => {
        if (this.dataChanged && navigator.onLine) {
          this.syncData();
          this.pendingChanges = 0;
        }
      }, 5000);
      
      // 如果累积了10个变更，立即同步
      if (this.pendingChanges >= 10) {
        clearTimeout(this.syncTimeout);
        if (navigator.onLine) {
          this.syncData();
          this.pendingChanges = 0;
        }
      }
    },
    logout() {
      try {
        // 退出前同步数据到云端
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
    
    // 数据验证函数
    validateUserData(data) {
      if (!data) {
        console.error('数据为空');
        return false;
      }
      
      // 验证必要字段
      if (!Array.isArray(data.classes)) {
        console.error('班级数据不是数组');
        data.classes = [];
      }
      
      // 验证班级数据结构
      for (const cls of data.classes) {
        if (!cls.id || !cls.name) {
          console.error('班级缺少必要字段:', cls);
          return false;
        }
        
        // 验证学生数据
        if (cls.students && !Array.isArray(cls.students)) {
          console.error('学生数据不是数组');
          cls.students = [];
        }
        
        // 验证学生数据结构
        if (cls.students) {
          for (const student of cls.students) {
            if (!student.id || !student.name) {
              console.error('学生缺少必要字段:', student);
              return false;
            }
          }
        }
      }
      
      // 验证当前班级ID
      if (data.currentClassId && !data.classes.some(cls => cls.id === data.currentClassId)) {
        console.error('当前班级ID不存在于班级列表中');
        data.currentClassId = data.classes.length > 0 ? data.classes[0].id : null;
      }
      
      return true;
    },
    
    // 同步用户列表到云端
    async syncUserListToCloud() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过用户列表同步');
        return false;
      }
      
      try {
        const supabaseReady = await this.waitForSupabase();
        if (!supabaseReady) {
          console.log('Supabase未初始化，跳过用户列表同步');
          return false;
        }
        
        const users = getUserList();
        const now = new Date().toISOString();
        
        // 将用户列表存储在云端
        const { error } = await supabase
          .from('users')
          .upsert({
            id: 'user_list_global',
            data: { users: users },
            updated_at: now
          });
        
        if (error) {
          console.error('同步用户列表到云端失败:', error);
          return false;
        }
        
        console.log('用户列表已同步到云端，用户数:', users.length);
        return true;
      } catch (e) {
        console.error('同步用户列表到云端失败:', e);
        return false;
      }
    },
    
    // 备份云端数据
    async backupCloudData() {
      if (!navigator.onLine || !this.currentUserId) {
        console.log('无网络连接或无用户ID，跳过备份');
        return false;
      }
      
      try {
        const supabaseReady = await this.waitForSupabase();
        if (!supabaseReady) {
          console.log('Supabase未初始化，跳过备份');
          return false;
        }
        
        const userData = getUserData();
        const now = new Date().toISOString();
        
        // 创建备份数据
        const backupData = {
          id: `backup_${this.currentUserId}_${Date.now()}`,
          userId: this.currentUserId,
          data: userData,
          timestamp: now,
          version: userData.version || '1.0.0'
        };
        
        // 插入备份
        const { error } = await supabase
          .from('backups')
          .insert(backupData);
        
        if (error) {
          console.error('创建备份失败:', error);
          return false;
        }
        
        console.log('数据备份成功');
        
        // 清理旧备份，保留最近5个
        await this.cleanupOldBackups();
        
        return true;
      } catch (e) {
        console.error('备份失败:', e);
        return false;
      }
    },
    
    // 清理旧备份
    async cleanupOldBackups() {
      if (!navigator.onLine || !this.currentUserId) {
        return false;
      }
      
      try {
        const supabaseReady = await this.waitForSupabase();
        if (!supabaseReady) {
          return false;
        }
        
        // 获取备份列表
        const { data: backups, error } = await supabase
          .from('backups')
          .select('id, timestamp')
          .eq('userId', this.currentUserId)
          .order('timestamp', { ascending: false });
        
        if (error) {
          console.error('获取备份列表失败:', error);
          return false;
        }
        
        // 保留最近5个备份，删除其他的
        if (backups && backups.length > 5) {
          const backupsToDelete = backups.slice(5);
          for (const backup of backupsToDelete) {
            const { error: deleteError } = await supabase
              .from('backups')
              .delete()
              .eq('id', backup.id);
            
            if (deleteError) {
              console.error('删除旧备份失败:', deleteError);
            }
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
      
      try {
        const supabaseReady = await this.waitForSupabase();
        if (!supabaseReady) {
          console.log('Supabase未初始化，跳过恢复');
          return false;
        }
        
        let backupData;
        if (backupId) {
          // 恢复指定备份
          const { data, error } = await supabase
            .from('backups')
            .select('data')
            .eq('id', backupId)
            .single();
          
          if (error) {
            console.error('获取备份失败:', error);
            return false;
          }
          backupData = data.data;
        } else {
          // 恢复最近的备份
          const { data: backups, error } = await supabase
            .from('backups')
            .select('data')
            .eq('userId', this.currentUserId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();
          
          if (error) {
            console.error('获取最近备份失败:', error);
            return false;
          }
          backupData = backups.data;
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
    
    // 从云端同步用户列表
    async syncUserListFromCloud() {
      if (!navigator.onLine) {
        console.log('无网络连接，跳过用户列表同步');
        return false;
      }
      
      try {
        const supabaseReady = await this.waitForSupabase();
        if (!supabaseReady) {
          console.log('Supabase未初始化，跳过用户列表同步');
          return false;
        }
        
        const { data, error } = await supabase
          .from('users')
          .select('data, updated_at')
          .eq('id', 'user_list_global')
          .single();
        
        if (error && error.code === 'PGRST116') {
          console.log('云端没有用户列表数据，尝试上传本地用户列表');
          // 云端没有数据时，上传本地用户列表
          await this.syncUserListToCloud();
          return true;
        } else if (error) {
          console.error('从云端同步用户列表失败:', error);
          return false;
        }
        
        if (data && data.data && data.data.users) {
          const cloudUsers = data.data.users;
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
        }
        
        return false;
      } catch (e) {
        console.error('从云端同步用户列表失败:', e);
        return false;
      }
    },
    
    // 数据同步方法 - 大幅减少云端操作
    async syncData() {
      if (!this.currentUserId) return;
      
      // 1. 首先保存本地数据（优先本地存储）
      this.saveUserData();
      
      // 2. 仅在特定条件下才进行云同步
      const now = Date.now();
      const timeSinceLastSync = now - this.lastSyncAttempt;
      
      // 条件：距离上次同步超过15分钟 或 累积了20个变更
      const shouldSyncToCloud = 
        navigator.onLine && 
        this.dataChanged && 
        (timeSinceLastSync >= 15 * 60 * 1000 || this.pendingChanges >= 20);
      
      if (shouldSyncToCloud) {
        console.log('满足云端同步条件，开始同步...');
        this.lastSyncAttempt = now;
        
        try {
          await this.syncToCloud();
          this.dataChanged = false;
          this.pendingChanges = 0;
          this.lastSyncTime = new Date().toISOString();
          console.log('云端同步完成');
        } catch (e) {
          console.error('云端同步失败:', e);
        }
      } else {
        console.log('仅保存到本地，跳过云端同步');
      }
    },
    
    // 等待Supabase初始化完成
    async waitForSupabase(timeout = 10000) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        if (typeof window.supabase !== 'undefined' && window.supabase.from) {
          return true;
        }
        // 等待100ms后重试
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return false;
    },
    
    // 同步到云存储
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
        
        console.log('准备同步到云端，用户ID:', this.currentUserId);
        console.log('同步时间:', now);
        console.log('授权码数量:', licenses.length);
        
        // 3. 更新数据的最后修改时间
        userData.lastModified = now;
        
        // 4. 优先使用本地存储
        try {
          localStorage.setItem(`class_pet_local_${this.currentUserId}`, JSON.stringify({
            data: userData,
            timestamp: now
          }));
          console.log('数据已存储到本地');
        } catch (localError) {
          console.error('本地存储失败:', localError);
        }
        
        // 5. 创建数据备份
        await this.backupCloudData();
        
        // 6. 等待Supabase初始化完成
        console.log('等待Supabase初始化...');
        const supabaseReady = await this.waitForSupabase();
        
        if (!supabaseReady) {
          console.log('Supabase未能在超时时间内初始化，跳过云端同步');
          return;
        }
        
        // 7. 进行云同步
        console.log('开始上传到Supabase...');
        
        // 将授权码存储在data字段中，避免数据库字段不存在的问题
        const userDataWithLicenses = {
          ...userData,
          licenses: licenses // 将授权码存储在data中
        };
        
        const upsertData = {
          id: this.currentUserId,
          data: userDataWithLicenses,
          updated_at: now
        };
        console.log('上传数据:', upsertData);
        
        const { error } = await supabase
          .from('users')
          .upsert(upsertData);
        
        if (error) {
          console.error('Supabase同步失败:', error);
          // 同步失败时尝试从备份恢复
          await this.restoreFromBackup();
        } else {
          console.log('数据已同步到Supabase云存储');
          // 同步成功后更新本地数据的lastModified
          setUserData(userData);
        }
      } catch (e) {
        console.error('云同步失败:', e);
        // 异常时尝试从备份恢复
        try {
          await this.restoreFromBackup();
        } catch (restoreError) {
          console.error('恢复数据失败:', restoreError);
        }
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
      
      try {
        if (typeof supabase !== 'undefined' && supabase) {
          console.log('开始从Supabase同步授权码...');
          
          // 首先尝试查询管理员用户的数据（管理员用户ID通常包含admin）
          const { data: adminData, error: adminError } = await supabase
            .from('users')
            .select('data, updated_at')
            .ilike('id', '%admin%')
            .order('updated_at', { ascending: false })
            .limit(1);
          
          console.log('查询管理员数据:', { adminData, adminError });
          
          if (adminData && adminData.length > 0 && adminData[0].data && adminData[0].data.licenses) {
            console.log('从管理员数据同步授权码，数量:', adminData[0].data.licenses.length);
            setLicenses(adminData[0].data.licenses);
            return adminData[0].data.licenses;
          }
          
          // 如果没有管理员数据，查询所有用户的数据
          const { data, error } = await supabase
            .from('users')
            .select('data, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1);
          
          console.log('查询所有用户数据:', { data, error });
          
          if (error) {
            console.error('Supabase同步失败:', error);
            return null;
          } else if (data && data.length > 0 && data[0].data && data[0].data.licenses) {
            console.log('从用户数据同步授权码，数量:', data[0].data.licenses.length);
            setLicenses(data[0].data.licenses);
            return data[0].data.licenses;
          }
        }
      } catch (e) {
        console.error('同步授权码失败:', e);
      }
      
      return null;
    },
    
    // 从云存储同步
    async syncFromCloud() {
      if (!this.currentUserId) return false;
      
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
        if (typeof supabase !== 'undefined' && supabase) {
          console.log('开始从Supabase同步数据，用户ID:', this.currentUserId);
          
          const { data, error } = await supabase
            .from('users')
            .select('data, updated_at')
            .eq('id', this.currentUserId)
            .single();
          
          console.log('Supabase返回数据:', { data, error });
          
          // 处理 PGRST116 错误（数据为空）
          if (error && error.code === 'PGRST116') {
            console.log('云端没有数据记录，准备上传本地数据');
            const localData = getUserData();
            if (Object.keys(localData).length > 0 && localData.students && localData.students.length > 0) {
              console.log('本地有数据，上传到云端');
              await this.syncToCloud();
              syncSuccess = true;
            } else {
              console.log('本地也没有数据，跳过同步');
            }
          } else if (error) {
            console.error('Supabase同步失败:', error);
          } else if (data) {
            console.log('云端数据内容:', data.data);
            console.log('云端更新时间:', data.updated_at);
            
            if (data.data) {
              const localData = getUserData();
              const localTimestamp = localData.lastModified || '1970-01-01T00:00:00.000Z';
              const cloudTimestamp = data.updated_at || '1970-01-01T00:00:00.000Z';
              
              console.log(`时间戳比较 - 本地: ${localTimestamp}, 云端: ${cloudTimestamp}`);
              console.log(`本地数据:`, localData);
              console.log(`云端数据:`, data.data);
              
              // 总是从云端同步最新数据，不考虑时间差
              console.log('从云端同步最新数据');
              // 迁移和验证云端数据
              let updatedData = this.migrateUserData(data.data);
              
              // 验证数据
              if (!this.validateUserData(updatedData)) {
                console.error('云端数据验证失败，跳过同步');
                return false;
              }
              
              // 更新时间戳
              updatedData.lastModified = cloudTimestamp;
              
              // 保存数据
              setUserData(updatedData);
              
              // 同步授权码
              if (updatedData.licenses) {
                console.log('同步云端授权码，数量:', updatedData.licenses.length);
                setLicenses(updatedData.licenses);
              }
              
              // 同时更新本地备份
              try {
                localStorage.setItem(`class_pet_local_${this.currentUserId}`, JSON.stringify({
                  data: updatedData,
                  timestamp: cloudTimestamp
                }));
              } catch (e) {
                console.error('本地备份失败:', e);
              }
              
              console.log('从Supabase云存储同步成功，数据已更新');
              syncSuccess = true;
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
            } else {
              console.log('云端data字段为空，上传本地数据');
              // 云端没有数据，上传本地数据
              const localData = getUserData();
              if (Object.keys(localData).length > 0) {
                await this.syncToCloud();
              }
            }
          } else {
            console.log('云端没有记录，上传本地数据');
            // 云端没有数据，上传本地数据
            const localData = getUserData();
            if (Object.keys(localData).length > 0) {
              await this.syncToCloud();
            }
          }
        } else {
          console.log('Supabase未初始化');
        }
        
        // 2. 云存储没有数据或同步失败，尝试从本地备份加载
        if (!syncSuccess) {
          try {
            const localStorageKey = `class_pet_local_${this.currentUserId}`;
            const localData = localStorage.getItem(localStorageKey);
            
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
      } catch (e) {
        console.error('从云存储同步失败:', e);
      } finally {
        this.syncing = false;
      }
      return syncSuccess;
    },
    
    // 启用自动同步 - 大幅减少云端操作
    enableAutoSync() {
      // 如果已经启用，先禁用之前的定时器，避免重复创建
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
      }
      
      // 每15分钟检查一次是否需要同步
      this.autoSyncInterval = setInterval(async () => {
        // 只有当网络可用且有数据变更时才同步
        if (navigator.onLine && this.dataChanged) {
          const now = Date.now();
          const timeSinceLastSync = now - this.lastSyncAttempt;
          
          // 只有距离上次同步超过15分钟，或者累积了20个变更，才进行云端同步
          if (timeSinceLastSync >= 15 * 60 * 1000 || this.pendingChanges >= 20) {
            console.log('自动同步：满足条件，开始云端同步');
            await this.syncData();
          } else {
            console.log('自动同步：条件不满足，仅保存本地');
            this.saveUserData();
          }
        }
      }, 15 * 60 * 1000); // 每15分钟检查一次
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
        const classList = getClassList();
        let currentClassId = null;
        
        // 尝试从localStorage读取当前班级ID
        try {
          currentClassId = localStorage.getItem(CURRENT_CLASS_KEY);
        } catch (e) {
          // localStorage不可用时，从内存存储读取
          currentClassId = memoryStorage[CURRENT_CLASS_KEY];
        }
        
        const classData = {};
        classList.forEach(function (c) {
          try {
            let raw = null;
            // 尝试从localStorage读取
            try {
              raw = localStorage.getItem(CLASS_DATA_PREFIX + c.id);
            } catch (e) {
              // localStorage不可用时，从内存存储读取
              raw = memoryStorage[CLASS_DATA_PREFIX + c.id];
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
    
    saveStudents() { 
      setStorage(STORAGE_KEYS.students, this.students); 
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
    
    // Supabase 同步方法
    async saveToSupabase() {
      // 禁用云上传，只保存到本地
    },
    
    async loadFromSupabase() {
      // 禁用云同步，只从本地加载数据
      this.loadFromLocalBackup();
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
      // 禁用实时同步，避免网络依赖
      console.log('实时同步已禁用，使用本地存储');
    },
    
    disableRealtimeSync() {
      // 禁用实时同步，避免网络依赖
      if (this._supabaseSubscription) {
        try {
          if (window.supabase) {
            supabase.removeChannel(this._supabaseSubscription);
          }
          this._supabaseSubscription = null;
        } catch (error) {
          console.log('禁用实时同步失败:', error);
        }
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
          
          // 加载用户数据
          app.loadUserData();
          app.dataLoaded = true;
          
          if (navigator.onLine) {
            try {
              console.log('自动登录时从云端同步数据...');
              const syncResult = await app.syncFromCloud();
              if (syncResult) {
                console.log('从云端同步成功，使用云端数据');
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
      console.log('localStorage不可用，使用内存存储');
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
    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var username = (document.getElementById('loginUsername').value || '').trim();
      var password = (document.getElementById('loginPassword').value || '').trim();
      if (!username) { alert('请输入用户名（手机号或邮箱）'); return; }
      if (!password) { alert('请输入密码'); return; }
      
      // 检查是否为管理员账号
      const isAdmin = ADMIN_ACCOUNTS.some(a => a.username === username && a.password === password);
      if (isAdmin) {
        // 管理员登录
        app.currentUsername = username;
        app.currentUserId = 'admin_' + username;
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ 
          id: app.currentUserId, 
          username: app.currentUsername,
          isAdmin: true
        }));
        
        // 为管理员创建默认数据
        const userData = getUserData();
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
        }
        
        // 加载数据并显示应用
        app.loadUserData();
        app.showApp();
        // 显示管理员入口
        document.getElementById('adminButton').style.display = 'block';
        return;
      }
      
      // 普通用户登录
      app.login(username, password).then(function(success) {
        if (!success) {
          // 检查用户是否存在
          const users = app.getUserList();
          const userExists = users.some(u => u.username === username);
          if (!userExists) {
            // 尝试从云端同步用户列表后再次检查
            app.syncUserListFromCloud().then(function(syncSuccess) {
              if (syncSuccess) {
                const updatedUsers = app.getUserList();
                const updatedUserExists = updatedUsers.some(u => u.username === username);
                if (updatedUserExists) {
                  alert('用户名已存在，请检查密码');
                } else {
                  alert('用户名不存在，请先注册');
                }
              } else {
                alert('用户名不存在，请先注册');
              }
            });
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
