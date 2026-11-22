@echo off
REM ============================================================
REM  Classroom RPG launcher - starts a local server on port 8000
REM  and opens the game in your default browser.
REM  No admin rights needed. ONE requirement: Node.js (https://nodejs.org).
REM ============================================================
setlocal
set PORT=8000
set "ROOT=%~dp0"

echo.
echo  Starting Classroom RPG server on http://localhost:%PORT%
echo.
echo  Two screens: open http://localhost:%PORT%/gm.html on the teacher
echo  laptop and http://localhost:%PORT%/stage.html on the projector
echo  (drag the Stage window to the projector and press F11).
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js was not found.
    echo  Install Node.js from https://nodejs.org, then run this file again.
    pause
    exit /b 1
)

pushd "%ROOT%"
echo  Serving %ROOT% with Node.js
echo  Press Ctrl+C to stop the server.
echo.
start "" "http://localhost:%PORT%/index.html"
node server.js
popd
endlocal
