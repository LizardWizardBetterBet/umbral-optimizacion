@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js 22.12+ instalado: https://nodejs.org/
  pause
  exit /b 1
)
echo Instalando dependencias...
call npm install
if errorlevel 1 (
  echo Fallo npm install. Revisa conexion a Internet.
  pause
  exit /b 1
)
echo.
echo Iniciando UMBRAL en http://127.0.0.1:5173/
call npm run dev
pause
