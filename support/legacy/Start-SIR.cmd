@echo off
cd /d "%~dp0..\..\"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run SIR.
  pause
  exit /b 1
)
echo Starting SIR. The browser will open after the server is ready.
echo Keep this window open while using the demo.
echo Close this window to stop the demo.
set "SIR_TLS_OPTION="
node --help | findstr /c:"--use-system-ca" >nul
if not errorlevel 1 set "SIR_TLS_OPTION=--use-system-ca"
node %SIR_TLS_OPTION% server.js --open
echo.
echo The SIR server has stopped. Any error is shown above.
pause
