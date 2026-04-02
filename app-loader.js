// 异步按序加载所有脚本，避免主线程阻塞
(function() {
  // 显示加载提示
  var loadingDiv = document.createElement('div');
  loadingDiv.id = 'app-loading-indicator';
  loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,255,255,0.97);padding:30px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:10000;text-align:center;min-width:220px;';
  loadingDiv.innerHTML = '<div style="font-size:2.5rem;margin-bottom:12px">🐉</div><div style="font-size:1.2rem;color:#333;font-weight:bold;margin-bottom:8px">萌兽成长营</div><div style="font-size:0.9rem;color:#888;margin-bottom:15px">正在加载中，请稍候...</div><div style="width:200px;height:5px;background:#eee;border-radius:3px;overflow:hidden;margin:0 auto"><div id="_loadBar" style="height:100%;width:0%;background:linear-gradient(90deg,#e85d04,#f48c06);border-radius:3px;transition:width 0.3s"></div></div>';
  document.body.appendChild(loadingDiv);

  var scripts = [
    './app.js?v=132',
    './features.js?v=4',
    './features_monopoly.js?v=5',
    './features_monopoly2.js?v=1',
    './features_stage.js?v=2',
    './features_init.js?v=4',
    './login_handler.js?v=10'
  ];

  var i = 0;
  var bar = document.getElementById('_loadBar');

  function loadNext() {
    if (i >= scripts.length) {
      // 全部加载完成
      if (bar) bar.style.width = '100%';
      // 确保登录表单事件已绑定
      setTimeout(function() {
        var loginForm = document.getElementById('login-form');
        if (loginForm && !loginForm._bound) {
          loginForm._bound = true;
          loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (typeof window._doLogin === 'function') window._doLogin();
          });
        }
        // 隐藏加载提示
        if (loadingDiv.parentNode) {
          loadingDiv.style.opacity = '0';
          loadingDiv.style.transition = 'opacity 0.4s';
          setTimeout(function() {
            if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
          }, 400);
        }
      }, 300);
      return;
    }
    // 更新进度条
    if (bar) bar.style.width = Math.round((i / scripts.length) * 100) + '%';
    var s = document.createElement('script');
    s.src = scripts[i++];
    s.onload = loadNext;
    s.onerror = loadNext; // 出错也继续
    document.body.appendChild(s);
  }

  // 延迟100ms启动，让浏览器先渲染页面
  setTimeout(loadNext, 100);
})();
