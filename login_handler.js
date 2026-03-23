// login_handler.js - 完全独立的登录处理
(function(){

var ADMIN_LIST = [
  { username: '18844162799', password: 'QW200124.' },
  { username: '18645803876', password: 'QW0124.' }
];

var USER_LIST_KEY = 'class_pet_user_list';
var CURRENT_USER_KEY = 'class_pet_current_user';
var SESSION_ID_KEY = 'class_pet_session_id';

function doLoginSuccess(uid, username, isAdmin) {
  try{ localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({id:uid, username:username, isAdmin:!!isAdmin})); }catch(e){}
  try{ localStorage.setItem(SESSION_ID_KEY, 'sess_'+Date.now()); }catch(e){}
  
  if(window.app) {
    window.app.currentUserId = uid;
    window.app.currentUsername = username;
    try{ if(typeof window.app.loadUserData==='function') window.app.loadUserData(); }catch(e){ console.error('loadUserData err:', e); }
    try{ 
      if(typeof window.app.showApp==='function') {
        window.app.showApp();
      } else {
        // fallback: 手动显示
        var lp = document.getElementById('login-page');
        var ap = document.getElementById('app');
        if(lp) lp.style.display='none';
        if(ap) ap.style.display='block';
      }
    }catch(e){ 
      console.error('showApp err:', e);
      // 出错时直接刷新
      location.reload();
    }
    try{ if(typeof window.app.init==='function') window.app.init(); }catch(e){ console.error('init err:', e); }
  } else {
    // app还没加载，直接刷新让bootstrap处理
    location.reload();
  }
}

window._doLogin = function(){
  var u = (document.getElementById('loginUsername').value||'').trim();
  var p = (document.getElementById('loginPassword').value||'').trim();
  if(!u){alert('请输入用户名');return;}
  if(!p){alert('请输入密码');return;}

  // 检查管理员
  var isAdmin = ADMIN_LIST.some(function(a){return a.username===u && a.password===p;});
  if(isAdmin){
    doLoginSuccess('admin_'+u, u, true);
    return;
  }

  // 检查普通用户（本地）
  try{
    var raw = localStorage.getItem(USER_LIST_KEY);
    var list = raw ? JSON.parse(raw) : [];
    var user = null;
    for(var i=0;i<list.length;i++){ if(list[i].username===u){user=list[i];break;} }
    if(user && user.password===p){
      doLoginSuccess(user.id, user.username, false);
      return;
    }
    if(user && user.password!==p){ alert('密码错误，请重新输入'); return; }
  }catch(e){ console.error('本地用户查询失败:', e); }

  // 本地没找到，尝试通过Supabase查询（online模式）
  if(window.RUN_MODE === 'online' && navigator.onLine && window.app && typeof window.app.login === 'function') {
    // 显示等待提示
    var btn = document.querySelector('#login-form button[type="submit"]');
    if(btn) { btn.disabled=true; btn.textContent='登录中...'; }
    window.app.login(u, p).then(function(result){
      if(btn) { btn.disabled=false; btn.textContent='登录'; }
      if(!result) alert('用户名不存在或密码错误，请先注册');
    }).catch(function(e){
      if(btn) { btn.disabled=false; btn.textContent='登录'; }
      alert('登录出错: ' + (e.message||e));
    });
  } else {
    alert('用户名不存在，请先注册');
  }
};

window._doRegister = function(){
  var u=(document.getElementById('registerUsername').value||'').trim();
  var p=(document.getElementById('registerPassword').value||'');
  var p2=(document.getElementById('registerPasswordConfirm').value||'');
  var k=(document.getElementById('registerLicenseKey')&&document.getElementById('registerLicenseKey').value||'').trim();
  if(!u){alert('请输入用户名');return;}
  if(!p){alert('请设置密码');return;}
  if(p!==p2){alert('两次密码不一致');return;}
  if(window.app && typeof window.app.register==='function'){
    window.app.register(u,p,k);
  } else {
    alert('系统还在加载中，请稍候再试');
  }
};

// Tab切换 + 表单事件绑定
function bindTabs(){
  document.querySelectorAll('.login-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.login-tab').forEach(function(t){t.classList.remove('active');});
      tab.classList.add('active');
      var type=tab.dataset.tab;
      var lf=document.getElementById('login-form');
      var rf=document.getElementById('register-form');
      if(lf)lf.style.display=type==='login'?'block':'none';
      if(rf)rf.style.display=type==='register'?'block':'none';
    });
  });
  var loginForm = document.getElementById('login-form');
  if(loginForm && !loginForm._bound){
    loginForm._bound = true;
    loginForm.addEventListener('submit', function(e){
      e.preventDefault();
      window._doLogin();
    });
  }
  var registerForm = document.getElementById('register-form');
  if(registerForm && !registerForm._bound){
    registerForm._bound = true;
    registerForm.addEventListener('submit', function(e){
      e.preventDefault();
      window._doRegister();
    });
  }
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', bindTabs);
}else{
  bindTabs();
}

})();
