@echo off
rem Media Viewer test-and-update launcher (ASCII only; logic lives in scripts\update.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1"
echo.
pause
