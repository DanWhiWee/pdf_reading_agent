# 开发环境自检（Windows）。在项目根目录执行:
#   powershell -ExecutionPolicy Bypass -File scripts\check-dev-env.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "backend\main.py"))) {
    Write-Host "[错误] 无法定位项目根目录（缺少 backend\main.py）。请在仓库根目录下执行本脚本。" -ForegroundColor Red
    exit 1
}

function Ok($msg) { Write-Host ('  [OK] ' + $msg) -ForegroundColor Green }
function Bad($msg) { Write-Host ('  [!!] ' + $msg) -ForegroundColor Red }

Write-Host "`nPDF Reading Agent - 环境检查 ($root)`n" -ForegroundColor Cyan

# Python
try {
    $py = (& python -c "import sys; print(sys.executable)" 2>$null).Trim()
    if ($py) { Ok "Python: $py" } else { throw "no" }
} catch {
    Bad "未找到 python，请安装 Python 3.10+ 并加入 PATH"
}

try {
    & python -c "import uvicorn" 2>$null
    if ($LASTEXITCODE -eq 0) { Ok "Python 包 uvicorn 可用" }
    else { Bad "未安装 uvicorn：在项目根运行 setup-once.bat 或: pip install -r backend\requirements.txt" }
} catch {
    Bad "无法检测 uvicorn"
}

# Node
try {
    $nv = (& node -v 2>$null).Trim()
    if ($nv) { Ok "Node: $nv" } else { throw "no" }
} catch {
    Bad "未找到 node，请安装 Node.js 18+"
}

try {
    $npmv = (& npm -v 2>$null).Trim()
    if ($npmv) {
        Ok "npm: $npmv"
        try {
            if ([version]$npmv -lt [version]"8.0.0") {
                Write-Host '  .. npm 8+ matches lockfile v3 better; optional: npm install -g npm@10' -ForegroundColor DarkGray
            }
        } catch { }
    }
} catch {
    Bad "未找到 npm"
}

$nm = Join-Path $root "frontend\node_modules"
if (Test-Path $nm) { Ok "frontend\node_modules 存在" }
else { Bad "缺少 frontend\node_modules：请运行 setup-once.bat 或在 frontend 目录执行 npm install" }

$vite = Join-Path $root "frontend\node_modules\.bin\vite.cmd"
if (Test-Path $vite) { Ok "Vite 本地命令存在" }
elseif (Test-Path (Join-Path $root "frontend\node_modules\.bin\vite")) { Ok "Vite 本地命令存在" }
else { Bad "未找到 frontend\node_modules\.bin\vite（npm install 可能未完成）" }

if (Test-Path (Join-Path $root ".env")) { Ok ".env 已存在" }
else { Write-Host '  .. .env not found (start.bat copies from .env.example; set LLM_API_KEY for chat)' -ForegroundColor DarkGray }

Write-Host ""
Write-Host 'Done. Fix any line marked [!!], then run start.bat.' -ForegroundColor Cyan
Write-Host ""
