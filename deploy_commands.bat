@echo off
chcp 65001
echo 童心宠伴 GitHub 部署指令
echo ========================
echo.

rem 1. 初始化 git 仓库
echo 1. 初始化 git 仓库
git init
git config user.name "Your Name"
git config user.email "your.email@example.com"
echo.

rem 2. 创建 .gitignore 文件
echo 2. 创建 .gitignore 文件
echo # Dependencies
node_modules/

# Build outputs
dist/
build/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE and editor files
.vscode/
.idea/
*.swp
*.swo
*~

# OS generated files
Thumbs.db
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
> .gitignore
echo.

rem 3. 添加文件到仓库
echo 3. 添加文件到仓库
git add .
git commit -m "初始提交 - 童心宠伴应用"
echo.

rem 4. 创建 GitHub 仓库（需要手动在 GitHub 上创建）
echo 4. 请在 GitHub 上创建一个新的仓库，然后复制仓库 URL
echo.
echo 5. 关联远程仓库
echo 输入 GitHub 仓库 URL（例如：https://github.com/yourusername/your-repo.git）:
set /p repo_url=
git remote add origin %repo_url%
echo.

rem 6. 推送代码到 GitHub
echo 6. 推送代码到 GitHub
git push -u origin master
echo.

rem 7. 配置 GitHub Pages
echo 7. 配置 GitHub Pages
echo 请在 GitHub 仓库设置中：
echo - 找到 "Pages" 部分
echo - 选择 "master" 分支作为源
echo - 点击 "Save"
echo.
echo 部署完成！应用将在 https://yourusername.github.io/your-repo/ 访问
echo.
echo 按任意键退出...
pause > nul