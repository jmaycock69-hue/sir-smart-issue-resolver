@echo off
setlocal
title SIR - 19 October acceptance candidate
cd /d "%~dp0..\..\"
set "PORT=3217"
echo SIR - 19 October acceptance candidate
echo Application folder: %CD%
echo Expected browser heading: Let's sort this out.
echo Keep this window open while using SIR.
set "SIR_TLS_OPTION="
node --help | findstr /c:"--use-system-ca" >nul
if not errorlevel 1 set "SIR_TLS_OPTION=--use-system-ca"
node %SIR_TLS_OPTION% server.js --open
echo SIR has stopped. Any error is shown above.
pause
endlocal
