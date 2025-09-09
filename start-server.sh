#!/bin/bash

# Obsidian XTerm Server Startup Script

echo "🚀 Starting Obsidian XTerm Server..."
echo "=================================="

cd server

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing server dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

echo "🖥️  Starting terminal server on port 3001..."
echo "📍 Health check: http://localhost:3001/health"
echo "🔗 WebSocket endpoint: ws://localhost:3001"
echo ""
echo "💡 Keep this terminal open while using Obsidian XTerm plugin"
echo "⏹️  Press Ctrl+C to stop the server"
echo ""

npm start