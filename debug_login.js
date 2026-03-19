// debug_login.js - 诊断登录问题
(function(){
  window.onerror = function(msg, src, line, col, err){
    var info = '❌ JS错误:\n消息: '+msg+'\n文件: '+src+'\n行号: '+line;
    console.error(info);
    // show on page if login page visible
    var lp = document.getElementById('login-page');
    if(lp && lp.style.display !== 'none'){
      var d = document.getElementById('_debug_err');
      if(!d){ d=document.createElement('div'); d.id='_debug_err'; d.style.cssText='position:fixed;bottom:10px;left:10px;right:10px;background:rgba(0,0,0,0.85);color:#ff6b6b;padding:12px;border-radius:8px;font-size:0.8rem;z-index:99999;max-height:200px;overflow-y:auto;white-space:pre-wrap;'; document.body.appendChild(d); }
      d.textContent += info + '\n\n';
    }
    return false;
  };

  // check app ready after load
  window.addEventListener('load', function(){
    setTimeout(function(){
      var ok = window.app && typeof window.app.login !== 'undefined';
      console.log('[debug] window.app ready:', !!window.app, 'login:', ok);
      var lf = document.getElementById('login-form');
      console.log('[debug] login-form found:', !!lf);
      if(lf){
        // check event listeners by testing submit
        console.log('[debug] login form OK, listeners should be bound');
      }
    }, 1000);
  });
})();
