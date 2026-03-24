@echo off
chcp 65001 >nul
REM Release dev ports so new backend/frontend bind cleanly (no stale old code).
REM Ports: 8000 = FastAPI, 5173/5174 = Vite (5174 when 5173 is already taken)

echo [kill-dev-ports] Releasing 8000, 5173, 5174 ...

powershell -NoProfile -ExecutionPolicy Bypass -Command "foreach ($port in 8000,5173,5174) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ('  port ' + $port + ' -> PID ' + $_.OwningProcess); Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

echo [kill-dev-ports] Done.
echo.
