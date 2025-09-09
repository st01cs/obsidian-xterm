@echo off
REM Obsidian XTerm Server Startup Script for Windows

echo 🚀 Starting Obsidian XTerm Server...
echo ==================================

cd server

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing server dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
)

echo 🖥️  Starting terminal server on port 3001...
echo 📍 Health check: http://localhost:3001/health
echo 🔗 WebSocket endpoint: ws://localhost:3001
echo.
echo 💡 Keep this window open while using Obsidian XTerm plugin
echo ⏹️  Press Ctrl+C to stop the server
echo.

npm start
pause