@echo off
rem Launcher only - all logic and messages live in serve.ps1
rem (cmd.exe mis-parses multi-byte text inside if(...) blocks, so keep this ASCII-only)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %*
