@echo off
REM ============================================================
REM  Сборка Windows portable .exe. Зависимости — только внутри проекта.
REM  Нужны Python 3.10+ и Node.js 18+ в PATH.
REM ============================================================
setlocal
set "ROOT=%~dp0"
set "CACHE_ROOT=%ROOT%.cache"
set "NPM_CONFIG_CACHE=%CACHE_ROOT%\npm"
set "electron_config_cache=%CACHE_ROOT%\electron"
set "ELECTRON_BUILDER_CACHE=%CACHE_ROOT%\electron-builder"
set "IN_SUBDIR="

where python >nul 2>nul || goto :missing_python
python -c "import sys; raise SystemExit(sys.version_info < (3, 10))" >nul 2>nul || goto :missing_python
where node >nul 2>nul || goto :missing_node
where npm >nul 2>nul || goto :missing_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" >nul 2>nul || goto :missing_node

if not exist "%ROOT%backend\venv\Scripts\python.exe" (
  echo Создаю venv для backend...
  python -m venv "%ROOT%backend\venv"
  if errorlevel 1 goto :failed
)

echo Устанавливаю зависимости backend и PyInstaller в venv...
"%ROOT%backend\venv\Scripts\python.exe" -m pip install --no-cache-dir -r "%ROOT%backend\requirements.txt" PyInstaller
if errorlevel 1 goto :failed

call :npm_ci "%ROOT%frontend" || goto :failed
pushd "%ROOT%frontend" || goto :failed
set "IN_SUBDIR=1"
call npm run lint || goto :failed
call npm run test:social-platform || goto :failed
call npm run build || goto :failed
popd
set "IN_SUBDIR="

echo Собираю backend...
pushd "%ROOT%backend" || goto :failed
set "IN_SUBDIR=1"
"%ROOT%backend\venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean lls-backend.spec
if errorlevel 1 goto :failed
popd
set "IN_SUBDIR="

call :npm_ci "%ROOT%electron" || goto :failed
pushd "%ROOT%electron" || goto :failed
set "IN_SUBDIR=1"
call npm run check || goto :failed
call npm run dist || goto :failed
popd
set "IN_SUBDIR="

echo.
echo Готово: "%ROOT%electron\dist\Local Lead Studio 0.1.0.exe"
endlocal
exit /b 0

:npm_ci
echo Устанавливаю Node-зависимости в "%~1\node_modules"...
pushd "%~1" || exit /b 1
call npm ci --no-audit --fund=false
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

:missing_python
echo [!] Нужен Python 3.10+ в PATH. Открываю страницу установки...
start "" "https://www.python.org/downloads/windows/"
pause
endlocal
exit /b 1

:missing_node
echo [!] Нужен Node.js 18+ и npm в PATH. Открываю страницу установки...
start "" "https://nodejs.org/en/download"
pause
endlocal
exit /b 1

:failed
if defined IN_SUBDIR popd
echo [!] Сборка остановлена. Исправьте ошибку выше и запустите build-portable.bat снова.
pause
endlocal
exit /b 1
