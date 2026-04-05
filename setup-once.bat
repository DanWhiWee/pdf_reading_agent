@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ========================================
echo   PDF Reading Agent - 首次 / 换机安装依赖
echo   项目: %ROOT%
echo ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [错误] 未在 PATH 中找到 python。请先安装 Python 3.10+ 并勾选「Add to PATH」。
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未在 PATH 中找到 npm。请先安装 Node.js 18+ ^(会附带 npm^)。
  pause
  exit /b 1
)

echo [1/2] 安装后端依赖 ^(含 uvicorn、torch 等，首次可能较久^)...
python -m pip install -r "%ROOT%backend\requirements.txt"
if errorlevel 1 (
  echo.
  echo [错误] pip 安装失败。可尝试: python -m pip install --upgrade pip
  pause
  exit /b 1
)

echo.
echo [2/2] 安装前端依赖 ^(生成 frontend\node_modules^)...
cd /d "%ROOT%frontend"
call npm install
if errorlevel 1 (
  echo.
  echo [错误] npm install 失败。可尝试删除 frontend\node_modules 后重试。
  cd /d "%ROOT%"
  pause
  exit /b 1
)

cd /d "%ROOT%"
echo.
echo ========================================
echo   依赖安装完成
echo ========================================
echo.
if not exist "%ROOT%.env" (
  echo [提示] 尚未存在 .env，启动 start.bat 时会从 .env.example 复制，请编辑并填写 LLM_API_KEY。
  echo.
)
echo 接下来请运行 start.bat 启动开发环境。
echo 可选: 运行 powershell -ExecutionPolicy Bypass -File scripts\check-dev-env.ps1 做环境自检
echo.
pause
