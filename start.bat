@echo off
REM ============================================================
REM  Classroom RPG launcher - starts a local server on port 8000
REM  and opens the game in your default browser.
REM  No admin rights needed. Tries, in order:
REM     1. node server.js                 (Node.js - preferred)
REM     2. py -m http.server 8000        (Python)
REM     3. python -m http.server 8000     (Python)
REM  If none are found, prints a clear message (see README for the
REM  VS Code "Live Server" extension or GitHub Pages alternatives).
REM ============================================================
setlocal
set PORT=8000
set "ROOT=%~dp0"

echo.
echo  Starting Classroom RPG server on http://localhost:%PORT%
echo.

REM --- locate Node (preferred) ---
set "NODECMD="
where node >nul 2>nul && set "NODECMD=node"

REM --- locate a usable Python ---
set "PYCMD="
where py >nul 2>nul && set "PYCMD=py"
if not defined PYCMD ( where python >nul 2>nul && set "PYCMD=python" )

if defined NODECMD (
    pushd "%ROOT%"
    echo  Serving %ROOT% with Node.js
    echo  Press Ctrl+C to stop the server.
    echo.
    start "" "http://localhost:%PORT%/index.html"
    node server.js
    popd
) else if defined PYCMD (
    pushd "%ROOT%"
    echo  Serving %ROOT% with Python
    echo  Press Ctrl+C to stop the server.
    echo.
    start "" "http://localhost:%PORT%/index.html"
    %PYCMD% -m http.server %PORT%
    popd
) else (
    echo  [ERROR] Node.js and Python were not found.
    echo.
    echo  Two alternatives:
    echo    1. VS Code - install the "Live Server" extension,
    echo       right-click index.html -^> "Open with Live Server".
    echo    2. GitHub Pages - push this repo to GitHub, enable Pages,
    echo       and open https://YOUR-USERNAME.github.io/YOUR-REPO/
    echo.
    echo  See README.md for details.
    pause
)
endlocal

