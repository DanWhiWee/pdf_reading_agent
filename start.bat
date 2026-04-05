@echo off
chcp 65001 >nul

REM Use the directory where this .bat file lives as project root
set "PROJECT_DIR=%~dp0"

echo ========================================
echo   PDF Reading Agent - Starting...
echo   Project: %PROJECT_DIR%
echo ========================================
echo.

if not exist "%PROJECT_DIR%.env" (
    echo [WARNING] .env file not found. Copying from .env.example...
    echo Please edit .env to set your LLM_API_KEY before using chat.
    copy "%PROJECT_DIR%.env.example" "%PROJECT_DIR%.env" >nul
    echo.
)

REM 换机 / 新克隆后常见遗漏：未安装依赖则直接启动会报「找不到 vite / uvicorn」
if not exist "%PROJECT_DIR%frontend\node_modules\" (
    echo [错误] 未找到 frontend\node_modules
    echo 请先双击运行 setup-once.bat，或在 frontend 目录执行: npm install
    echo.
    pause
    exit /b 1
)
python -c "import uvicorn" 2>nul
if errorlevel 1 (
    echo [错误] 当前 Python 环境中没有 uvicorn
    echo 请先双击运行 setup-once.bat，或在 backend 目录执行: pip install -r requirements.txt
    echo 注意: start.bat 使用的 python 必须与安装依赖时一致 ^(可在 cmd 中执行 where python 查看^)
    echo.
    pause
    exit /b 1
)

REM Kill old uvicorn/node on dev ports so you always get a fresh process ^(latest code^)
call "%PROJECT_DIR%kill-dev-ports.bat"

echo [1/2] Starting backend (FastAPI) on http://127.0.0.1:8000 ...
REM Use start /D for working dir — nested "cd /d \"...\" inside cmd /k breaks quoting on Windows
start "PDF-Agent-Backend" /D "%PROJECT_DIR%backend" cmd /k python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

echo [2/2] Starting frontend (Vite) on http://localhost:5173 ...
REM Prepend Node install dir so npm can find node.exe when PATH is minimal
start "PDF-Agent-Frontend" /D "%PROJECT_DIR%frontend" cmd /k set "PATH=C:\Program Files\nodejs;%PATH%" ^&^& npm run dev

timeout /t 5 /nobreak >nul
echo.
echo ========================================
echo   Open http://localhost:5173 in browser
echo ========================================
start http://localhost:5173
