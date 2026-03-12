(function() {
  const DB_NAME = 'XinTongXinPetDB';
  const DB_VERSION = 1;
  let db = null;

  window.IndexedDBManager = {
    async init() {
      return new Promise((resolve, reject) => {
        if (db) {
          resolve(db);
          return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
          console.error('IndexedDB 打开失败:', event.target.error);
          reject(event.target.error);
        };

        request.onsuccess = (event) => {
          db = event.target.result;
          console.log('✅ IndexedDB 初始化成功');
          resolve(db);
        };

        request.onupgradeneeded = (event) => {
          const database = event.target.result;
          
          if (!database.objectStoreNames.contains('userData')) {
            database.createObjectStore('userData', { keyPath: 'key' });
          }
          
          if (!database.objectStoreNames.contains('students')) {
            database.createObjectStore('students', { keyPath: 'id' });
          }
          
          if (!database.objectStoreNames.contains('scoreHistory')) {
            const scoreStore = database.createObjectStore('scoreHistory', { keyPath: 'id', autoIncrement: true });
            scoreStore.createIndex('studentId', 'studentId', { unique: false });
            scoreStore.createIndex('time', 'time', { unique: false });
          }
          
          if (!database.objectStoreNames.contains('photos')) {
            database.createObjectStore('photos', { keyPath: 'id' });
          }
          
          console.log('✅ IndexedDB 数据库结构创建完成');
        };
      });
    },

    async setItem(key, value) {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['userData'], 'readwrite');
        const store = transaction.objectStore('userData');
        const request = store.put({ key, value, updatedAt: Date.now() });

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => {
          console.error('IndexedDB 写入失败:', event.target.error);
          reject(event.target.error);
        };
      });
    },

    async getItem(key) {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['userData'], 'readonly');
        const store = transaction.objectStore('userData');
        const request = store.get(key);

        request.onsuccess = (event) => {
          const result = event.target.result;
          resolve(result ? result.value : null);
        };
        request.onerror = (event) => {
          console.error('IndexedDB 读取失败:', event.target.error);
          reject(event.target.error);
        };
      });
    },

    async removeItem(key) {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['userData'], 'readwrite');
        const store = transaction.objectStore('userData');
        const request = store.delete(key);

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => {
          console.error('IndexedDB 删除失败:', event.target.error);
          reject(event.target.error);
        };
      });
    },

    async clear() {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['userData'], 'readwrite');
        const store = transaction.objectStore('userData');
        const request = store.clear();

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => {
          console.error('IndexedDB 清空失败:', event.target.error);
          reject(event.target.error);
        };
      });
    },

    async getAllKeys() {
      await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['userData'], 'readonly');
        const store = transaction.objectStore('userData');
        const request = store.getAllKeys();

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
      });
    },

    async migrateFromLocalStorage() {
      console.log('开始从 localStorage 迁移数据到 IndexedDB...');
      
      const keysToMigrate = [
        'class_pet_user_list',
        'class_pet_current_user'
      ];
      
      for (let i = 0; i < 100; i++) {
        keysToMigrate.push(`class_pet_user_data_${i}`);
      }

      let migratedCount = 0;
      
      for (const key of keysToMigrate) {
        try {
          const value = localStorage.getItem(key);
          if (value !== null) {
            const existingValue = await this.getItem(key);
            if (!existingValue) {
              await this.setItem(key, JSON.parse(value));
              migratedCount++;
              console.log(`迁移: ${key}`);
            }
          }
        } catch (e) {
          console.warn(`迁移 ${key} 失败:`, e);
        }
      }

      console.log(`✅ 数据迁移完成，共迁移 ${migratedCount} 条数据`);
      return migratedCount;
    },

    async getStorageUsage() {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage,
          quota: estimate.quota,
          usageMB: (estimate.usage / 1024 / 1024).toFixed(2),
          quotaMB: (estimate.quota / 1024 / 1024).toFixed(2),
          percentUsed: ((estimate.usage / estimate.quota) * 100).toFixed(2)
        };
      }
      return null;
    },

    isSupported() {
      return 'indexedDB' in window;
    }
  };

  console.log('📦 IndexedDB 管理器已加载');
})();
