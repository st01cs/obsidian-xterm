# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dual-Architecture Terminal Plugin

This is an Obsidian plugin providing terminal functionality through a dual-architecture approach:

- **Frontend**: Obsidian plugin (`main.ts`) using xterm.js for terminal UI and socket.io-client for WebSocket communication
- **Backend**: Node.js server (`server/server.js`) using socket.io and node-pty for shell process management
- **Communication**: WebSocket connection for real-time bidirectional I/O between frontend and backend

## Build Commands

```bash
# Development build with watch mode
npm run dev

# Production build (includes TypeScript check and bundling)
npm run build

# Server development (auto-restart on changes)
cd server && npm run dev

# Start server manually
cd server && npm start

# Auto-start server script (installs deps if needed)
./start-server.sh
```

## Architecture Overview

### Plugin Structure
- `main.ts` - Main plugin class with server management and terminal view implementation
- `styles.css` - Optimized CSS for full viewport layout with xterm.js integration
- `manifest.json` - Obsidian plugin manifest (desktop-only)

### Server Structure  
- `server/server.js` - Express + Socket.io server with node-pty integration
- `server/package.json` - Server dependencies (express, socket.io, node-pty)

### Key Components

**TerminalPlugin Class**:
- Auto-start server functionality with Node.js path detection
- Server health monitoring and lifecycle management
- Settings management for Node.js path, shell, and server configuration

**TerminalView Class**:
- xterm.js terminal initialization with 10,000-line scrollback buffer
- Responsive terminal sizing with debounced resize handling  
- WebSocket communication with backend for shell I/O
- Vault root directory detection for terminal working directory

**Server WebSocket Events**:
- `create-terminal` - Initialize new terminal session with vault directory
- `terminal-input` - Send user input to shell
- `terminal-output` - Receive shell output  
- `terminal-resize` - Handle terminal resize with dimension sync
- `terminal-exit` - Handle shell process termination

## Layout Implementation

The terminal uses absolute positioning with `inset: 0` for complete viewport coverage. CSS overrides Obsidian's default view padding and ensures the terminal container fills the entire workspace area. The xterm.js viewport is configured with `overflow-y: scroll` for proper scrolling behavior with long outputs.

## Server Auto-Start

The plugin automatically detects Node.js installation using multiple fallback paths (including NVM, Homebrew, system installations). If auto-start fails, users can manually configure the Node.js path in settings or use the provided startup scripts.

## Cross-Platform Shell Detection

Default shells are automatically detected based on platform:
- Windows: `powershell.exe`
- macOS: `/bin/zsh` 
- Linux: `/bin/bash`

## Health Monitoring

The server exposes a `/health` endpoint that returns server status, active terminal count, platform info, and memory usage. The plugin uses this for server health checks and status monitoring.