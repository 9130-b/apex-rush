@echo off
rem Launcher only - all logic and messages live in push-to-github.ps1
rem (cmd.exe mis-parses multi-byte text inside if(...) blocks, so keep this ASCII-only)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1" %*
