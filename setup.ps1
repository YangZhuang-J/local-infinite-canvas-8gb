# 无界画布 8GB 适配版 · 安装脚本
# 用法：powershell -ExecutionPolicy Bypass -File .\setup.ps1
# 作用：检查环境 -> 修复 LFS 指针文件 -> 生成 launcher/config.json -> 复制画布工作流

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$msBase = "https://modelscope.cn/api/v1/datasets/shensanshu/ComfyUI-Local-Infinite-Canvas/resolve/master"

function Info($m) { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red; exit 1 }

Write-Host "`n=== 1/5 检查 Node.js ==="
$nodeExe = Join-Path $root "node\node.exe"
if (Test-Path $nodeExe) {
    $v = & $nodeExe --version
    Info "已存在 node/node.exe（$v）"
} else {
    Warn "缺少 node/node.exe（本仓库不含 Node 运行时）"
    $sys = Get-Command node -ErrorAction SilentlyContinue
    if ($sys) {
        New-Item -ItemType Directory -Force -Path (Join-Path $root "node") | Out-Null
        Copy-Item $sys.Source $nodeExe
        Info "已从系统 Node 复制（$(& $nodeExe --version)）"
    } else {
        Warn "系统也没有 Node，请安装 Node.js 24+ 后重跑：https://nodejs.org/"
        Warn "（启动脚本也支持直接用系统 node，只要 PATH 里有）"
    }
}

Write-Host "`n=== 2/5 修复 LFS 指针文件 ==="
$lfsFiles = @(
    "comfyui-gateway/src/resources.js",
    "comfyui-gateway/resources/index.json",
    "launcher/gateway-deps.zip",
    "assistant/assistant-runtime.zip"
)
foreach ($rel in $lfsFiles) {
    $p = Join-Path $root $rel
    if (-not (Test-Path $p)) { Warn "$rel 不存在，跳过"; continue }
    $head = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
    if ($head.StartsWith("version https://git-lfs")) {
        $url = "$msBase/$rel"
        try {
            Invoke-WebRequest -Uri $url -OutFile $p -UseBasicParsing -TimeoutSec 300
            Info "已下载真文件：$rel ($([math]::Round((Get-Item $p).Length/1KB)) KB)"
        } catch {
            Warn "下载失败：$rel —— 可手动从魔搭 resolve 接口取"
        }
    } else {
        Info "$rel 已是真实文件"
    }
}

Write-Host "`n=== 3/5 定位 ComfyUI ==="
$cfgPath = Join-Path $root "launcher\config.json"
$candidates = @(
    "D:\LenovoSoftstore\comfyui\ComfyUI\ComfyUI",
    "D:\ComfyUI",
    "C:\ComfyUI",
    "$env:USERPROFILE\ComfyUI",
    "$env:USERPROFILE\Documents\ComfyUI"
)
$comfyDir = $null
foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c "main.py")) { $comfyDir = $c; break }
}
if (-not $comfyDir) {
    Warn "未自动找到 ComfyUI，请输入其根目录（含 main.py），例如 D:\ComfyUI"
    $comfyDir = Read-Host "ComfyUI 路径"
    if (-not (Test-Path (Join-Path $comfyDir "main.py"))) { Fail "该路径下没有 main.py" }
}
Info "ComfyUI: $comfyDir"

$wfDir = Join-Path $comfyDir "user\default\workflows"
$cfg = [ordered]@{
    comfyUrl = "http://127.0.0.1:8188"
    comfyDir = $comfyDir
    comfyWorkflowsDir = $wfDir
    gatewayPort = 8190
    controlPort = 8290
    canvasPort = 3000
    gatewayDir = ""
    canvasDist = ""
    comfyStartTimeoutSec = 300
    gatewayStartTimeoutSec = 30
    openBrowser = $true
    closeCanvasStopsBackend = $true
    stopAdoptedComfyOnCanvasClose = $false
    canvasIdleGraceSec = 86400
    allowLan = $false
    canvasHost = "127.0.0.1"
    gatewayHost = "127.0.0.1"
    gatewayPublicHost = ""
    corsOrigins = ""
}
New-Item -ItemType Directory -Force -Path (Split-Path $cfgPath) | Out-Null
$cfg | ConvertTo-Json | Set-Content -Path $cfgPath -Encoding UTF8
Info "已生成 launcher/config.json"

Write-Host "`n=== 4/5 复制画布自由卡片工作流 ==="
$srcWf = Join-Path $root "comfyui-workflows"
if (Test-Path $srcWf) {
    New-Item -ItemType Directory -Force -Path $wfDir | Out-Null
    Get-ChildItem $srcWf -Filter *.json | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $wfDir $_.Name) -Force
        Info "已复制：$($_.Name)"
    }
} else { Warn "comfyui-workflows 目录不存在" }

Write-Host "`n=== 5/5 环境变量建议（D 盘化）==="
Write-Host "  建议设置（可选，节省 C 盘）："
Write-Host "    setx HF_HOME D:\Cache\hf"
Write-Host "    setx PIP_CACHE_DIR D:\Cache\pip"
Write-Host "    setx UV_CACHE_DIR D:\Cache\uv"

Write-Host "`n=== 完成 ===" -ForegroundColor Cyan
Write-Host "  启动：.\start-8gb.bat"
Write-Host "  画布：http://127.0.0.1:3000"
Write-Host "  提示：模型需自行下载，见 README 的模型清单（魔搭源最快）"
