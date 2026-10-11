# 生成 src/assets-embed.js
# 把 Kenney 车模 / 道具模型与贴图集打包成 base64，使 index.html 直接用 file:// 打开也能跑
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$models = Join-Path $root 'assets\models'
$out = Join-Path $root 'src\assets-embed.js'

$cars = @('kart-ooli')
$props = @{ cone = 'cone'; box = 'box'; tire = 'debris-tire' }

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('/* 自动生成，请勿手工修改 — 由 tools/make-embed.ps1 生成 */')
[void]$sb.AppendLine('/* 用途：file:// 直接打开 index.html 时，用内嵌数据代替无法通过 XHR 读取的 .glb */')
[void]$sb.AppendLine('window.APEX_EMBED = {')

$first = $true
foreach ($name in $cars) {
  $p = Join-Path $models ($name + '.glb')
  if (-not (Test-Path $p)) { Write-Host "跳过（缺失）: $p" -ForegroundColor Yellow; continue }
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($p))
  if (-not $first) { [void]$sb.AppendLine(',') }
  $first = $false
  [void]$sb.Append('  "' + $name + '": "' + $b64 + '"')
}
foreach ($k in $props.Keys) {
  $p = Join-Path $models ($props[$k] + '.glb')
  if (-not (Test-Path $p)) { continue }
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($p))
  [void]$sb.AppendLine(',')
  [void]$sb.Append('  "' + $k + '": "' + $b64 + '"')
}
[void]$sb.AppendLine()
[void]$sb.AppendLine('};')

$cm = Join-Path $models 'Textures\colormap.png'
if (Test-Path $cm) {
  $cb64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($cm))
  [void]$sb.AppendLine('window.APEX_COLORMAP = "data:image/png;base64,' + $cb64 + '";')
}

[IO.File]::WriteAllText($out, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
$kb = [math]::Round((Get-Item $out).Length / 1KB, 0)
Write-Host "已生成 $out  ($kb KB)" -ForegroundColor Green
