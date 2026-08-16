@echo off
setlocal
cd /d "%~dp0"
python tools\install_provincial_calendar_v1_5_1.py
if errorlevel 1 (
  echo.
  echo Installation incomplete. Ne deployez pas avant correction.
  pause
  exit /b 1
)
echo.
echo Installation terminee. Commit/push, puis Render et Vercel.
pause
