@echo off
REM ============================================================
REM  Запуск в окне Electron, без сборки портатива.
REM  ТРЕБУЕТСЯ: Python 3.x и Node.js (npm) в PATH.
REM  UI собирается один раз (быстрый vite build), дальше — сразу.
REM  Данные пишутся рядом: LocalLeadStudio\lead_studio_data
REM ============================================================
setlocal
set "ROOT=%~dp0"

where python >nul 2>nul || (echo [!] Нет Python 3.x в PATH: https://www.python.org/downloads/ & pause & exit /b 1)
where npm    >nul 2>nul || (echo [!] Нет Node.js/npm: https://nodejs.org/ & pause & exit /b 1)

python -c "import fastapi, uvicorn" 2>nul || (
  echo Ставлю зависимости backend...
  python -m pip install -r "%ROOT%backend\requirements.txt" || (echo [!] pip install не удался & pause & exit /b 1)
)

if not exist "%ROOT%frontend\node_modules" (
  echo Ставлю зависимости frontend...
  pushd "%ROOT%frontend" && call npm install && popd
)
if not exist "%ROOT%frontend\dist\index.html" (
  echo Собираю UI ^(один раз^)...
  pushd "%ROOT%frontend" && call npm run build && popd
)
if not exist "%ROOT%electron\node_modules" (
  echo Ставлю Electron...
  pushd "%ROOT%electron" && call npm install && popd
)

echo Запуск Local Lead Studio (окно Electron)...
pushd "%ROOT%electron"
call npm start
popd
endlocal
