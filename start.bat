@echo off
chcp 65001 >nul
title APEX RUSH - 本地服务器
cd /d "%~dp0"
echo.
echo   正在启动本地服务器...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %*
if errorlevel 1 (
  echo.
  echo   启动失败。可以尝试：
  echo     1^) 右键以管理员身份运行本文件
  echo     2^) 换端口:  start.bat -Port 9200
  echo.
  pause
)
