<#
  serve.ps1 — 极简静态文件服务器（零依赖，只用 .NET）
  用法：  powershell -ExecutionPolicy Bypass -File serve.ps1
          powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9000 -NoBrowser
#>
param(
  [int]$Port = 8123,
  [switch]$NoBrowser
)

# 本文件保存为 UTF-8 with BOM；这里再把控制台切到 UTF-8，保证中文输出不乱码
try {
  & "$env:SystemRoot\System32\chcp.com" 65001 | Out-Null
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch { }

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
$root = (Resolve-Path $root).Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.glb'  = 'model/gltf-binary'
  '.gltf' = 'model/gltf+json'
  '.hdr'  = 'application/octet-stream'
  '.exr'  = 'application/octet-stream'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.gif'  = 'image/gif'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.wasm' = 'application/wasm'
  '.bin'  = 'application/octet-stream'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
  '.mp3'  = 'audio/mpeg'
  '.ogg'  = 'audio/ogg'
  '.woff2'= 'font/woff2'
}

# 找一个可用端口
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try {
    $l.Start()
    $listener = $l
    $Port = $p
    break
  } catch {
    try { $l.Close() } catch {}
  }
}
if (-not $listener) {
  Write-Host ""
  Write-Host "  [x] 无法启动本地服务器（端口 $Port 起均被占用）" -ForegroundColor Red
  Write-Host "      请用参数换一个端口： powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9200" -ForegroundColor Yellow
  exit 1
}

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  ==========================================================" -ForegroundColor DarkCyan
Write-Host "   APEX RUSH  —  本地服务器已启动" -ForegroundColor Cyan
Write-Host "  ==========================================================" -ForegroundColor DarkCyan
Write-Host "   地址 : $url"
Write-Host "   目录 : $root"
Write-Host ""
Write-Host "   关闭：在本窗口按 Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) {
  try { Start-Process $url | Out-Null } catch { Write-Host "   (请手动在浏览器打开上面的地址)" -ForegroundColor Yellow }
}

$nav = New-Object System.Text.UTF8Encoding($false)

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
      $full = Join-Path $root $rel
      $full = [System.IO.Path]::GetFullPath($full)

      if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
        $res.Close()
        continue
      }
      if ((Test-Path $full -PathType Container)) { $full = Join-Path $full 'index.html' }

      if (-not (Test-Path $full -PathType Leaf)) {
        $res.StatusCode = 404
        $body = $nav.GetBytes("404 Not Found: $rel")
        $res.ContentType = 'text/plain; charset=utf-8'
        $res.OutputStream.Write($body, 0, $body.Length)
        $res.Close()
        Write-Host ("  404  " + $rel) -ForegroundColor DarkYellow
        continue
      }

      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($full)

      $res.ContentType = $type
      $res.ContentLength64 = $bytes.Length
      $res.Headers.Add('Cache-Control', 'no-cache, no-store, must-revalidate')
      $res.Headers.Add('Access-Control-Allow-Origin', '*')
      if ($req.HttpMethod -ne 'HEAD') {
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      $res.Close()

      if ($ext -eq '.html' -or $ext -eq '.js' -or $ext -eq '.css' -or $ext -eq '.glb' -or $ext -eq '.hdr') {
        Write-Host ("  200  " + $rel + "  (" + [math]::Round($bytes.Length / 1KB, 1) + " KB)") -ForegroundColor DarkGray
      }
    } catch {
      try { $res.StatusCode = 500; $res.Close() } catch {}
      Write-Host ("  500  " + $_.Exception.Message) -ForegroundColor Red
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
  Write-Host ""
  Write-Host "  服务器已关闭。" -ForegroundColor DarkGray
}
