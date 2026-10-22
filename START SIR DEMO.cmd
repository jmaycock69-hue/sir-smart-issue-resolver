@echo off
setlocal
title SIR - Smart Issue Resolver
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo SIR needs Node.js 22.13 or later. See README.md.
  pause
  exit /b 1
)
node support\launch-demo.mjs
if errorlevel 1 pause
endlocal
