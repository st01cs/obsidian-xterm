# Obsidian XTerm Terminal Plugin

A fully functional terminal emulator for Obsidian using a dual-architecture approach with xterm.js frontend and Node.js backend for reliable shell access.

## Architecture

**🏗️ Dual-Architecture Design:**
- **Frontend**: Obsidian plugin using xterm.js for terminal UI (TypeScript)
- **Backend**: Node.js server using socket.io and node-pty for shell process management  
- **Communication**: WebSocket connection for real-time bidirectional I/O

This architecture provides superior shell integration, proper PTY support, and avoids the limitations of running shell processes directly in Obsidian's restricted environment.

## Features

- **Full Terminal Emulator**: Uses xterm.js for a complete terminal experience
- **Real Shell Access**: Proper PTY integration with node-pty for authentic shell behavior
- **WebSocket Communication**: Real-time bidirectional I/O between frontend and backend
- **Multi-Platform**: Works on macOS, Linux, and Windows with appropriate shell detection
- **Desktop Only**: Designed for desktop environments with shell access
- **Server Health Monitoring**: Built-in server status checking and health endpoints
- **Configurable**: Customizable shell, server URL, and font size settings
- **Integrated UI**: Opens as a panel in Obsidian's workspace

## Installation

### Step 1: Install the Plugin Files
1. Download the plugin files to your Obsidian plugins folder:
   - `main.js`
   - `manifest.json` 
   - `styles.css`

2. Enable the plugin in Obsidian's Community Plugins settings

### Step 2: Backend Server
The plugin requires a separate Node.js backend server to be running.

**🚀 Automatic Startup (Default):**
The plugin will automatically start the server when you open a terminal! No manual setup required.

**Manual Control (Optional):**
```bash
# macOS/Linux
./start-server.sh

# Windows
start-server.bat

# Or manually:
cd server
npm install
npm start
```

The server will start on `http://localhost:3001` by default.

## Usage

### Opening the Terminal

- **Ribbon Icon**: Click the terminal icon in the left ribbon
- **Command Palette**: Run "Open Terminal" command
- **Keyboard**: You can assign a hotkey to the "Open Terminal" command

### Terminal Features

- Full shell interaction with command history
- Copy/paste support (use Ctrl+Shift+C/V or Cmd+C/V)
- Scrollback buffer for viewing command history
- Process management (close tab to terminate shell)

## Settings

Access plugin settings through **Settings > Community Plugins > Obsidian XTerm**:

- **Auto-Start Server**: Automatically start the terminal server when opening a terminal (default: enabled)
- **Server URL**: Terminal backend server URL (default: `http://localhost:3001`)
- **Server Port**: Port for the terminal server (default: 3001)
- **Shell**: Configure which shell to use (default: zsh on macOS, bash on Linux, PowerShell on Windows) 
- **Font Size**: Adjust terminal font size (8-24px range)
- **Server Management**: Check server status, manually start/stop server, and view server information

## Requirements

- **Desktop Only**: This plugin only works on desktop versions of Obsidian
- **Node.js**: Requires Node.js runtime for the backend server
- **Shell Access**: Requires a system with shell access (macOS, Linux, Windows)
- **Network**: Backend server runs on localhost (configurable port)

## Technical Details

**Frontend (Obsidian Plugin):**
- Built with TypeScript and xterm.js
- Uses socket.io-client for WebSocket communication
- Terminal view integrates with Obsidian's workspace system
- CSS styling ensures proper terminal appearance

**Backend (Node.js Server):**
- Express.js web server with socket.io WebSocket support
- node-pty for proper PTY (pseudo-terminal) integration  
- Real shell process management with full terminal capabilities
- Health monitoring and multi-client support

**Communication Protocol:**
- WebSocket-based real-time bidirectional communication
- Events: `create-terminal`, `terminal-input`, `terminal-output`, `terminal-resize`, `terminal-exit`
- Automatic reconnection and error handling

## Development

```bash
# Install dependencies
npm install

# Development build with watch
npm run dev

# Production build
npm run build
```

## License

MIT License