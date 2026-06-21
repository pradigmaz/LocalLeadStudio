@echo off
REM Убирает build-мусор, оставляет только портативный .exe и исходники.
REM Пути относительные (%~dp0) — никакого хардкода.
setlocal
set "ROOT=%~dp0"

echo Cleaning build artifacts...
rmdir /s /q "%ROOT%backend\build"                  2>nul
rmdir /s /q "%ROOT%backend\dist"                   2>nul
rmdir /s /q "%ROOT%electron\dist\win-unpacked"     2>nul
del   /q    "%ROOT%electron\dist\*.blockmap"       2>nul
del   /q    "%ROOT%electron\dist\builder-effective-config.yaml" 2>nul
del   /q    "%ROOT%electron\dist\builder-debug.yml" 2>nul

REM __pycache__ только в backend (node_modules не трогаем)
for /d /r "%ROOT%backend" %%d in (__pycache__) do @if exist "%%d" rmdir /s /q "%%d" 2>nul

echo.
echo Done. Portable build left in electron\dist:
dir /b "%ROOT%electron\dist" 2>nul
endlocal
