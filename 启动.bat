@echo off
echo 正在启动萌兽成长营...
cd /d "%~dp0"

:: 检查端口8080是否已占用
netstat -ano | findstr :8080 >nul 2>&1
if %errorlevel% == 0 (
  echo 服务器已在运行，直接打开浏览器...
  start http://localhost:8080
  exit
)

:: 启动Node.js服务器
echo 启动本地服务器...
start /B node -e "const h=require('http'),fs=require('fs'),p=require('path'),url=require('url');const base=__dirname;const mime={'html':'text/html','js':'application/javascript','css':'text/css','png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','gif':'image/gif','svg':'image/svg+xml','ico':'image/x-icon','woff2':'font/woff2','woff':'font/woff'};h.createServer(function(req,res){try{let u=url.parse(req.url).pathname;if(u==='/'||u==='')u='/index.html';let f=p.join(base,decodeURIComponent(u));let d=fs.readFileSync(f);let ext=f.split('.').pop().toLowerCase();res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-cache'});res.end(d);}catch(e){res.writeHead(404);res.end('404');}}).listen(8080,function(){console.log('OK');});"

:: 等待服务器启动
timeout /t 2 /nobreak >nul

:: 打开浏览器
echo 打开浏览器...
start http://localhost:8080

echo 服务器运行中，关闭此窗口将停止服务器。
pause
