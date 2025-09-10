#!/bin/bash

# Obsidian XTerm Server Startup Script

echo "🚀 Starting Obsidian XTerm Server..."
echo "=================================="

cd server

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Installation failed"
        exit 1
    fi
fi

echo "🖥️  Starting server on port 3001..."
echo "📍 Health: http://localhost:3001/health"
echo "💡 Keep this terminal open while using plugin"
echo "⏹️  Press Ctrl+C to stop"
echo ""

npm start