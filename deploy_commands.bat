@echo off
chcp 65001
echo ==========================================
echo  童心宠伴 - GitHub 部署脚本
echo ==========================================
echo.

cd /d "c:\Users\24729\Desktop\trae\JF\童心宠伴\class"

echo [1/4] 添加所有更改...
git add .

echo.
echo [2/4] 提交更改...
git commit -m "修复Bmob SDK加载路径：更新版本号为3.7.3，确保SDK正确加载"

echo.
echo [3/4] 推送到 GitHub...
git push origin master

echo.
echo ==========================================
echo  部署完成！
echo ==========================================
echo.
echo 网站地址：https://qihongfei888.github.io/xintongxin/
echo.
pause
