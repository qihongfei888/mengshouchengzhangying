// 独立系统：神兽养成
// - 复用 Supabase accounts 登录
// - users 表中用不同 id 前缀隔离数据
// - 本地存储也用不同前缀隔离数据

(function () {
  const APP_NS = 'beast';
  const LS_PREFIX = 'beast_pet_';
  const CLOUD_ID_PREFIX = 'beast_'; // users.id = beast_<userId>

  const KEYS = {
    currentUser: `${LS_PREFIX}current_user`,
    userData: (uid) => `${LS_PREFIX}user_data_${uid}`,
  };

  function ensureSupabaseClient() {
    if (window.RUN_MODE !== 'online') return null;
    if (!window.SUPABASE_URL || !window.SUPABASE_KEY) return null;
    if (!window.supabase || !window.supabase.createClient) return null;
    return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  }

  async function supabaseFetchAccount(username, password) {
    const client = ensureSupabaseClient();
    if (!client || !navigator.onLine) return null;
    const u = String(username || '').trim();
    const p = String(password || '');
    const { data, error } = await client
      .from('accounts')
      .select('username,password,user_id')
      .eq('username', u)
      .limit(1);
    if (error || !data || !data.length) return null;
    if (data[0].password !== p) return null;
    return data[0];
  }

  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(KEYS.currentUser);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setCurrentUser(user) {
    localStorage.setItem(KEYS.currentUser, JSON.stringify(user));
  }

  function getUserData(uid) {
    try {
      const raw = localStorage.getItem(KEYS.userData(uid));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setUserData(uid, data) {
    localStorage.setItem(KEYS.userData(uid), JSON.stringify(data));
  }

  function defaultData() {
    return {
      version: '1.0.0',
      system: APP_NS,
      beasts: {}, // 未来：按班级/学生存
      lastModified: new Date().toISOString(),
    };
  }

  async function uploadToCloud(uid, data) {
    const client = ensureSupabaseClient();
    if (!client || !navigator.onLine) return false;
    const payload = {
      id: CLOUD_ID_PREFIX + String(uid),
      data: data,
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('users').upsert(payload, { onConflict: 'id' });
    return !error;
  }

  async function downloadFromCloud(uid) {
    const client = ensureSupabaseClient();
    if (!client || !navigator.onLine) return null;
    const { data, error } = await client
      .from('users')
      .select('id, data, updated_at')
      .eq('id', CLOUD_ID_PREFIX + String(uid))
      .limit(1);
    if (error || !data || !data.length) return null;
    return data[0].data || null;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function renderPreview() {
    const root = byId('beastPreview');
    if (!root) return;
    const slug = 'qinglong';
    const stageNames = ['蛋 / 封印之卵', '幼体', '成长期', '觉醒体', '完全体'];
    root.innerHTML = stageNames.map((name, i) => {
      const n = i + 1;
      const src = `../photos/beast/${slug}/stage${n}.jpg`;
      return `
        <div class="beast-stage">
          <img src="${src}" onerror="this.style.opacity=0.35;this.title='未找到：${src}'">
          <div class="t">阶段 ${n}</div>
          <div class="s">${name}</div>
        </div>
      `;
    }).join('');
  }

  async function main() {
    renderPreview();

    const loginBtn = byId('beastLoginBtn');
    const uploadBtn = byId('beastUploadBtn');
    const downloadBtn = byId('beastDownloadBtn');
    const loginStatus = byId('beastLoginStatus');
    const syncStatus = byId('beastSyncStatus');

    function setLoginStatus(text) { if (loginStatus) loginStatus.textContent = text; }
    function setSyncStatus(text) { if (syncStatus) syncStatus.textContent = text; }

    const existing = getCurrentUser();
    if (existing && existing.userId) {
      setLoginStatus(`已登录：${existing.username}`);
    }

    if (loginBtn) {
      loginBtn.addEventListener('click', async () => {
        const username = byId('beastUsername').value;
        const password = byId('beastPassword').value;
        setLoginStatus('登录中…');
        try {
          const acc = await supabaseFetchAccount(username, password);
          if (!acc || !acc.user_id) {
            setLoginStatus('登录失败：账号不存在或密码错误');
            return;
          }
          setCurrentUser({ username: acc.username, userId: acc.user_id });
          setLoginStatus(`已登录：${acc.username}`);
          const d = getUserData(acc.user_id) || defaultData();
          setUserData(acc.user_id, d);
        } catch (e) {
          setLoginStatus('登录异常，请检查网络');
          console.error(e);
        }
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', async () => {
        const u = getCurrentUser();
        if (!u || !u.userId) { alert('请先登录'); return; }
        const d = getUserData(u.userId) || defaultData();
        d.lastModified = new Date().toISOString();
        setUserData(u.userId, d);
        setSyncStatus('云同步状态：上传中…');
        const ok = await uploadToCloud(u.userId, d);
        setSyncStatus(ok ? '云同步状态：✅ 上传成功（新系统独立数据）' : '云同步状态：❌ 上传失败');
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', async () => {
        const u = getCurrentUser();
        if (!u || !u.userId) { alert('请先登录'); return; }
        setSyncStatus('云同步状态：拉取中…');
        const d = await downloadFromCloud(u.userId);
        if (!d) {
          setSyncStatus('云同步状态：云端没有找到新系统数据');
          return;
        }
        setUserData(u.userId, d);
        setSyncStatus('云同步状态：✅ 已从云端恢复到本机（新系统独立数据）');
      });
    }
  }

  // Supabase SDK 需要你在页面自行引入（如果你当前项目已全局引入，可忽略）
  // 这里尝试动态加载（失败则依赖外部 script）
  (async function boot() {
    if (!window.supabase) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.async = true;
      s.onload = main;
      s.onerror = main;
      document.head.appendChild(s);
    } else {
      main();
    }
  })();
})();

