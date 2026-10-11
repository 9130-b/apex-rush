param([string]$Repo = "")

$ErrorActionPreference = 'Stop'
try {
  & "$env:SystemRoot\System32\chcp.com" 65001 | Out-Null
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch { }

function Write-Line($t, $c) {
  if ($c) { Write-Host $t -ForegroundColor $c } else { Write-Host $t }
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# ---- 找 git：先看 PATH，再找常见安装位置（刚装完 PATH 可能还没刷新）----
$git = $null
$cmd = Get-Command git -ErrorAction SilentlyContinue
if ($cmd) { $git = $cmd.Source }
if (-not $git) {
  foreach ($p in @(
      "$env:ProgramFiles\Git\cmd\git.exe",
      "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
      "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
    )) {
    if (Test-Path $p) { $git = $p; break }
  }
}
if (-not $git) {
  Write-Line ""
  Write-Line "  [x] 找不到 git。请先安装 Git for Windows：" Red
  Write-Line "      https://git-scm.com/download/win" Yellow
  Write-Line ""
  Read-Host "按回车关闭"
  exit 1
}

if (-not (Test-Path (Join-Path $root '.git'))) {
  Write-Line "  [x] 当前目录不是 git 仓库：$root" Red
  Read-Host "按回车关闭"
  exit 1
}

if ([string]::IsNullOrWhiteSpace($Repo)) {
  Write-Line ""
  $Repo = Read-Host "  请输入 GitHub 仓库地址（例如 https://github.com/你的用户名/apex-rush.git）"
}
if ([string]::IsNullOrWhiteSpace($Repo)) {
  Write-Line "  [x] 没有输入地址，已取消。" Red
  Read-Host "按回车关闭"
  exit 1
}

Write-Line ""
Write-Line "  仓库目录 : $root"
Write-Line "  目标仓库 : $Repo"
Write-Line ""
Write-Line ("  当前提交 : " + (& $git log --oneline -1))
Write-Line ""

& $git remote remove origin 2>$null | Out-Null
& $git remote add origin $Repo
& $git branch -M main

Write-Line "  正在推送…… 首次推送会弹出浏览器让你登录 GitHub 授权。"
Write-Line ""
& $git push -u origin main
$code = $LASTEXITCODE

if ($code -ne 0) {
  Write-Line ""
  Write-Line "  [x] 推送失败。常见原因：" Red
  Write-Line "      1. 仓库还没在 GitHub 上创建 —— 先去网页端新建一个【空】仓库，" Yellow
  Write-Line "         不要勾选 Add a README / .gitignore / license" Yellow
  Write-Line "      2. 地址写错，或这个账号没有该仓库的写权限" Yellow
  Write-Line "      3. 浏览器授权那一步被取消了" Yellow
  Write-Line ""
  Write-Line "  想换地址重试：直接重新运行本脚本即可（会自动覆盖 origin）。" DarkGray
} else {
  Write-Line ""
  Write-Line "  [√] 推送完成，去 GitHub 刷新页面就能看到了。" Green
}
Write-Line ""
Read-Host "按回车关闭"
