@echo off
setlocal
title SIR - credential-free scripted demo
cd /d "%~dp0..\..\"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or later is required. See README.md.
  pause
  exit /b 1
)
set "SIR_DEMO_MODE=scripted"
set "OPENAI_API_KEY="
set "SIR_AI_MODEL="
set "SIR_NODE_MODULES="
set "SIR_DATA_DIR=%~dp0..\..\data-demo"
set "PORT=3218"
echo Alexa+ simulation - local scripted conversation, real case workflow.
echo No API key or paid service is needed. Keep this window open.
echo Close with Ctrl+C. Restart this launcher to reopen saved demo cases.
node server.js --demo --open
pause
endlocal
