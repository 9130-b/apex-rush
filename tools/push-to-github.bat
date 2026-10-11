@echo off
chcp 65001 >nul
title APEX RUSH - 推送到 GitHub
cd /d "%~dp0.."

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [x] 找不到 git。请先安装 Git for Windows：
  echo       https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

set "REPO=%~1"
if "%REPO%"=="" set /p "REPO=请输入 GitHub 仓库地址（例如 https://github.com/你的用户名/apex-rush.git）: "
if "%REPO%"=="" (
  echo   [x] 没有输入地址，已取消。
  pause
  exit /b 1
)

echo.
echo   目标仓库 : %REPO%
echo.

git remote remove origin >nul 2>nul
git remote add origin "%REPO%"
git branch -M main

echo   正在推送…… 首次推送会弹出浏览器让你登录 GitHub 授权。
echo.
git push -u origin main

if errorlevel 1 (
  echo.
  echo   [x] 推送失败。常见原因：
  echo       1. 仓库还没在 GitHub 上创建 —— 先去网页端新建一个空仓库，不要勾选 README / .gitignore
  echo       2. 地址写错，或账号没有该仓库的写权限
  echo       3. 浏览器授权被取消
  echo.
) else (
  echo.
  echo   [√] 推送完成，去 GitHub 刷新页面就能看到了。
  echo.
)
pause
