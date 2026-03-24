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

REM Kill old uvicorn/node on dev ports so you always get a fresh process ^(latest code^)
call "%PROJECT_DIR%kill-dev-ports.bat"

echo [1/2] Starting backend (FastAPI) on http://127.0.0.1:8000 ...
start "PDF-Agent-Backend" cmd /k "cd /d "%PROJECT_DIR%backend" && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

echo [2/2] Starting frontend (Vite) on http://localhost:5173 ...
start "PDF-Agent-Frontend" cmd /k "cd /d "%PROJECT_DIR%frontend" && npm run dev"

timeout /t 5 /nobreak >nul
echo.
echo ========================================
echo   Open http://localhost:5173 in browser
echo ========================================
start http://localhost:5173
