// login_handler.js - 独立登录处理（带超时兜底）
(function(){

var ADMIN_LIST = [
  { username: '18844162799', password: 'QW200124.' },
  { username: '18645803876', password: 'QW0124.' }
];

var USER_LIST_KEY = 'class_pet_user_list';
var CURRENT_USER_KEY = 'class_pet_current_user';
var SESSION_ID_KEY = 'class_pet_session_id';

function setLoginBtnLoading(loading) {
  var btn = document.querySelector('#login-form button[type="submit"]');
  if (!btn) return;
  btn.disabled = !!loading;
  btn.textContent = loading ? '登录中...' : '登录';
}

function showAppFallback() {
  var lp = document.getElementById('login-page');
  var ap = document.getElementById('app');
  if (lp) lp.style.display = 'none';
  if (ap) ap.style.display = 'block';
}

function doLoginSuccess(uid, username, isAdmin) {
  try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ id: uid, username: username, isAdmin: !!isAdmin })); } catch (e) {}
  try { localStorage.setItem(SESSION_ID_KEY, 'sess_' + Date.now()); } catch (e) {}

  if (!window.app) {
    // app 可能仍在异步加载，稍后再尝试初始化一次
    showAppFallback();
    setTimeout(function(){
      try {
        if (window.app) {
          window.app.currentUserId = uid;
          window.app.currentUsername = username;
          if (typeof window.app.showApp === 'function') window.app.showApp();
          if (typeof window.app.init === 'function') window.app.init();
        }
      } catch (e) { console.error('delayed init err:', e); }
    }, 300);
    return;
  }

  window.app.currentUserId = uid;
  window.app.currentUsername = username;

  try {
    if (typeof window.app.loadUserData === 'function') window.app.loadUserData();
  } catch (e) {
    console.error('loadUserData err:', e);
  }

  try {
    if (typeof window.app.showApp === 'function') {
      window.app.showApp();
    } else {
      showAppFallback();
    }
  } catch (e) {
    console.error('showApp err:', e);
    showAppFallback();
  }

  // 强制补一次初始化，确保系统内按键监听器已绑定
  setTimeout(function(){
    try {
      if (window.app && typeof window.app.init === 'function') {
        window.app.init();
      }
    } catch (e) {
      console.error('post-login init err:', e);
    }
  }, 50);
}

window._doLogin = function(){
  var u = (document.getElementById('loginUsername').value || '').trim();
  var p = (document.getElementById('loginPassword').value || '').trim();

  if (!u) { alert('请输入用户名'); return; }
  if (!p) { alert('请输入密码'); return; }

  setLoginBtnLoading(true);

  // 1) 管理员直登（不走云）
  var isAdmin = ADMIN_LIST.some(function(a){ return a.username === u && a.password === p; });
  if (isAdmin) {
    doLoginSuccess('admin_' + u, u, true);
    setLoginBtnLoading(false);
    return;
  }

  // 2) 本地用户
  try {
    var raw = localStorage.getItem(USER_LIST_KEY);
    var list = raw ? JSON.parse(raw) : [];
    var user = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].username === u) { user = list[i]; break; }
    }

    if (user && user.password === p) {
      doLoginSuccess(user.id, user.username, false);
      setLoginBtnLoading(false);
      return;
    }

    if (user && user.password !== p) {
      setLoginBtnLoading(false);
      alert('密码错误，请重新输入');
      return;
    }
  } catch (e) {
    console.error('本地用户查询失败:', e);
  }

  // 3) 云端登录（超时兜底）
  if (window.RUN_MODE === 'online' && navigator.onLine && window.app && typeof window.app.login === 'function') {
    Promise.race([
      window.app.login(u, p),
      new Promise(function(resolve){ setTimeout(function(){ resolve('__timeout__'); }, 5000); })
    ]).then(function(result){
      setLoginBtnLoading(false);
      if (result === '__timeout__') {
        alert('登录超时，请重试');
        return;
      }
      if (!result) {
        alert('用户名不存在或密码错误，请先注册');
      }
    }).catch(function(e){
      setLoginBtnLoading(false);
      alert('登录出错: ' + (e && e.message ? e.message : e));
    });
    return;
  }

  setLoginBtnLoading(false);
  alert('用户名不存在，请先注册');
};

window._doRegister = function(){
  var u = (document.getElementById('registerUsername').value || '').trim();
  var p = (document.getElementById('registerPassword').value || '');
  var p2 = (document.getElementById('registerPasswordConfirm').value || '');
  var k = (document.getElementById('registerLicenseKey') && document.getElementById('registerLicenseKey').value || '').trim();
  if (!u) { alert('请输入用户名'); return; }
  if (!p) { alert('请设置密码'); return; }
  if (p !== p2) { alert('两次密码不一致'); return; }
  if (window.app && typeof window.app.register === 'function') {
    window.app.register(u, p, k);
  } else {
    alert('系统还在加载中，请稍候再试');
  }
};

function bindTabs(){
  document.querySelectorAll('.login-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.login-tab').forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      var type = tab.dataset.tab;
      var lf = document.getElementById('login-form');
      var rf = document.getElementById('register-form');
      if (lf) lf.style.display = type === 'login' ? 'block' : 'none';
      if (rf) rf.style.display = type === 'register' ? 'block' : 'none';
    });
  });

  var loginForm = document.getElementById('login-form');
  if (loginForm && !loginForm._bound) {
    loginForm._bound = true;
    loginForm.addEventListener('submit', function(e){
      e.preventDefault();
      window._doLogin();
    });
  }

  var registerForm = document.getElementById('register-form');
  if (registerForm && !registerForm._bound) {
    registerForm._bound = true;
    registerForm.addEventListener('submit', function(e){
      e.preventDefault();
      window._doRegister();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindTabs);
} else {
  bindTabs();
}

})();
