@echo off
setlocal enabledelayedexpansion

:: Ensure the script runs in the same directory as the batch file
cd /d "%~dp0"

if not exist "node_modules\dotenv\package.json" (
    echo Installing Node.js dependencies...
    call npm install
    if errorlevel 1 (
        echo npm install failed. Install Node.js 18+ from https://nodejs.org then run this file again.
        pause
        exit /b 1
    )
)

echo Starting the server...
:: 1. Start server.js in a new minimized command prompt window
start "Node Server" /min node server.js

echo Finding local IP address...
:: 2. Retrieve the machine's IPv4 address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set IP=%%a
    :: Remove leading spaces
    set IP=!IP: =!
    :: Break the loop after finding the first IP address
    goto :launchBrowser
)

:launchBrowser
:: Fallback to localhost if an IP couldn't be detected
if "%IP%"=="" (
    set IP=localhost
)

echo Using IP: %IP%

:: Give the Node.js server 2 seconds to fully start up before opening the browser
timeout /t 2 /nobreak >nul

echo Opening Chrome...
:: 3. Open Chrome in full screen to the specific address
start chrome --start-fullscreen "http://%IP%:3000/home.html"

exit