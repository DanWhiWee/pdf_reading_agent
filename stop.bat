@echo off
chcp 65001 >nul
set "PROJECT_DIR=%~dp0"

echo ========================================
echo   PDF Reading Agent - Stop dev servers
echo ========================================
echo.

call "%PROJECT_DIR%kill-dev-ports.bat"

echo You can close any remaining "PDF-Agent-Backend" / "PDF-Agent-Frontend" windows manually.
echo.
pause
