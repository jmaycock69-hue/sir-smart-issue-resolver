@echo off
setlocal
cd /d "%~dp0..\..\"
node SIR-browser-AI-launcher.mjs
if errorlevel 1 pause
endlocal
