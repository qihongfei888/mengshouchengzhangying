// login_handler.js - 完全独立的登录处理
(function(){

var ADMIN_LIST = [
  { username: '18844162799', password: 'QW200124.' },
  { username: '18645803876', password: 'QW0124.' }
];

var USER_LIST_KEY = 'class_pet_user_list';
var CURRENT_USER_KEY = 'class_pet_current_user';
var SESSION_ID_KEY = 'class_pet_session_id';

window._doLogin = function(){
  var u = (document.getElementById('loginUsername').value||'').trim();
  var p = (document.getElementById('loginPassword').value||'').trim();
  if(!u){alert('请输入用户名');return;}
  if(!p){alert('请输入密码');return;}

  // 检查管理员
  var isAdmin = ADMIN_LIST.some(function(a){return a.username===u && a.password===p;});
  if(isAdmin){
    var uid = 'admin_' + u;
    try{ localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({id:uid, username:u, isAdmin:true})); }catch(e){}
    try{ localStorage.setItem(SESSION_ID_KEY, 'sess_'+Date.now()); }catch(e){}
    if(window.app && typeof window.app.showApp==='function'){
      window.app.currentUserId = uid;
      window.app.currentUsername = u;
      try{ if(typeof window.app.loadUserData==='function') window.app.loadUserData(); }catch(e){}
      try{ window.app.showApp(); }catch(e){ location.reload(); }
    } else {
      location.reload();
    }
    return;
  }

  // 检查普通用户
  try{
    var raw = localStorage.getItem(USER_LIST_KEY);
    var list = raw ? JSON.parse(raw) : [];
    var user = null;
    for(var i=0;i<list.length;i++){ if(list[i].username===u){user=list[i];break;} }
    if(!user){ alert('用户名不存在，请先注册'); return; }
    if(user.password !== p){ alert('密码错误，请重新输入'); return; }
    try{ localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({id:user.id, username:user.username})); }catch(e){}
    try{ localStorage.setItem(SESSION_ID_KEY, 'sess_'+Date.now()); }catch(e){}
    if(window.app && typeof window.app.showApp==='function'){
      window.app.currentUserId = user.id;
      window.app.currentUsername = user.username;
      try{ if(typeof window.app.loadUserData==='function') window.app.loadUserData(); }catch(e){}
      try{ window.app.showApp(); }catch(e){ location.reload(); }
    } else {
      location.reload();
    }
  }catch(e){ alert('登录出错: '+e.message); }
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
  // 绑定登录表单submit事件
  var loginForm = document.getElementById('login-form');
  if(loginForm){
    loginForm.addEventListener('submit', function(e){
      e.preventDefault();
      window._doLogin();
    });
  }
  // 绑定注册表单submit事件
  var registerForm = document.getElementById('register-form');
  if(registerForm){
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
