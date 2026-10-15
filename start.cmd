@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo First run: powershell -ExecutionPolicy Bypass -File install.ps1
  pause
  exit /b 1
)
".venv\Scripts\python.exe" run.py %*
pause
