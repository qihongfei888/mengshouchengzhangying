// 异步加载app.js和login_handler.js，避免主线程阻塞
(function() {
  // 显示加载提示
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'app-loading-indicator';
  loadingDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 255, 255, 0.95);
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;
  loadingDiv.innerHTML = `
    <div style="font-size: 2rem; margin-bottom: 15px;">🐉</div>
    <div style="font-size: 1.2rem; color: #333; margin-bottom: 10px;">萌兽成长营</div>
    <div style="font-size: 0.9rem; color: #666;">正在加载中...</div>
    <div style="margin-top: 15px; width: 200px; height: 4px; background: #eee; border-radius: 2px; overflow: hidden;">
      <div style="height: 100%; background: #d9534f; animation: progress 2s infinite;"></div>
    </div>
    <style>
      @keyframes progress {
        0% { width: 0%; }
        50% { width: 70%; }
        100% { width: 100%; }
      }
    </style>
  `;
  document.body.appendChild(loadingDiv);

  // 延迟加载app.js（给浏览器时间处理其他任务）
  setTimeout(function() {
    // 动态加载app.js
    const appScript = document.createElement('script');
    appScript.src = './app.js?v=14';
    appScript.onload = function() {
      // app.js加载完成后，再加载login_handler.js
      const loginScript = document.createElement('script');
      loginScript.src = './login_handler.js?v=4';
      loginScript.onload = function() {
        // 隐藏加载提示
        setTimeout(function() {
          if (loadingDiv.parentNode) {
            loadingDiv.style.opacity = '0';
            loadingDiv.style.transition = 'opacity 0.3s';
            setTimeout(function() {
              if (loadingDiv.parentNode) {
                loadingDiv.parentNode.removeChild(loadingDiv);
              }
            }, 300);
          }
        }, 200);
      };
      document.body.appendChild(loginScript);
    };
    document.body.appendChild(appScript);
  }, 100);
})();
