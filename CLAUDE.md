# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Obsidian-Xterm plugin, a fully functional terminal emulator for Obsidian that provides real shell access within the editor. The plugin uses a dual-architecture approach:

- **Frontend**: Obsidian plugin using xterm.js for terminal UI (TypeScript)
- **Backend**: Node.js server using socket.io and node-pty for shell process management
- **Communication**: WebSocket connection for real-time bidirectional I/O

## Build and Development Commands

```bash
# Development build with watch mode
npm run dev

# Production build (TypeScript compilation + esbuild)
npm run build

# Version bump (updates manifest.json and versions.json)
npm run version

# Install backend dependencies for terminal functionality
npm install express socket.io node-pty

# Start backend server manually (if auto-start disabled)
node server.js
```

## Architecture Overview

### Core Components

**Main Plugin (`main.ts`)**:
- `XTermPlugin`: Main plugin class that manages the Obsidian integration
- `TerminalView`: ItemView implementation that creates the dockable terminal interface
- `XTermSettingTab`: Settings UI for configuration

**Backend Server (`server.js`)**:
- Express HTTP server with Socket.IO for WebSocket communication
- Uses node-pty to spawn real shell processes with pseudoterminal support
- Platform-specific shell detection (PowerShell/cmd on Windows, zsh/bash on macOS/Linux)
- Per-connection terminal session management with proper cleanup

**Key Architecture Patterns**:
- Auto-server management: Plugin automatically detects and starts backend server
- Custom Node.js path detection: Handles Electron's restricted PATH environment
- Cross-platform shell spawning with proper environment inheritance
- Socket-based server availability checking before startup attempts

### Plugin Settings Architecture

The `XTermPluginSettings` interface controls all configurable aspects:
- `nodePath`: Custom Node.js executable path (with auto-detection fallback)
- `autoStartServer`: Enable/disable automatic server management  
- `serverPort`/`serverUrl`: Backend communication configuration
- Terminal UI settings (fontSize, theme, terminalHeight)

### View Management

- Uses Obsidian's `ItemView` for dockable terminal integration
- View registration with `TERMINAL_VIEW_TYPE` constant
- Proper lifecycle management (`onOpen`/`onClose`) with WebSocket cleanup
- Terminal resizing and reconnection handling

## Critical Dependencies

**Runtime Dependencies**:
- `@xterm/xterm`: Terminal frontend rendering
- `socket.io-client`: WebSocket communication to backend
- `express`, `socket.io`, `node-pty`: Backend server dependencies

**Development Dependencies**:
- Uses esbuild for bundling with Obsidian API
- TypeScript with strict configuration for type safety
- Plugin must have `isDesktopOnly: true` to access Node.js APIs

## Reference Implementation

The `.refs/wetty/` directory contains a reference implementation that informed the architecture. Key patterns adopted:
- Terminal process lifecycle management
- Socket.IO event handling for terminal I/O
- Platform-specific configuration patterns

## Node.js Path Resolution

Critical for Electron compatibility: The plugin includes sophisticated Node.js detection because Obsidian's Electron environment has restricted PATH access. The resolution order:
1. Custom user-specified path (via settings)
2. Platform-specific common locations 
3. `which`/`where` command execution
4. Fallback to Electron's embedded Node.js with `ELECTRON_RUN_AS_NODE`

## Server Process Management

The plugin manages server lifecycle automatically:
- Port availability checking via TCP socket connection
- Spawning server as child process with proper environment
- Cross-platform signal handling for graceful shutdown
- Process cleanup on plugin unload (optional)

## Development Notes

- Plugin requires Node.js runtime for backend server functionality
- Backend dependencies must be installed separately from plugin dependencies
- Server binds to localhost only (127.0.0.1) for security
- Terminal sessions are isolated per WebSocket connection
- All file paths use absolute resolution due to Obsidian's working directory constraints