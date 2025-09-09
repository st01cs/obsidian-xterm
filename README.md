# Obsidian XTerm Terminal Plugin

A fully functional terminal emulator for Obsidian that provides real shell access within your workspace using a dual-architecture approach.

## 🏗️ Architecture

**Dual-Architecture Design:**
- **Frontend**: Obsidian plugin using xterm.js for terminal UI (TypeScript)
- **Backend**: Node.js server using socket.io and node-pty for shell process management  
- **Communication**: WebSocket connection for real-time bidirectional I/O

This architecture provides superior shell integration, proper PTY support, and avoids limitations of running shell processes directly in Obsidian's restricted environment.

## ✨ Features

- **Full Terminal Emulator**: Complete terminal experience with xterm.js
- **Real Shell Access**: Proper PTY integration with node-pty for authentic shell behavior
- **Vault Root Directory**: Terminal starts in your Obsidian vault directory
- **Full View Usage**: Terminal uses the complete available workspace area
- **Auto-Start Server**: Automatically starts backend server when needed
- **Cross-Platform**: Works on macOS, Linux, and Windows with appropriate shell detection
- **User-Configurable Node.js Path**: Auto-detection with manual override option
- **WebSocket Communication**: Real-time bidirectional I/O between frontend and backend
- **Server Health Monitoring**: Built-in status checking and health endpoints
- **Integrated UI**: Opens as a panel in Obsidian's workspace

## 📋 Requirements

- **Desktop Only**: Works only on desktop versions of Obsidian
- **Node.js**: Requires Node.js runtime for the backend server
- **Shell Access**: System with shell access (macOS, Linux, Windows)
- **Network**: Backend server runs on localhost (configurable port)

## 🚀 Installation

### Option 1: Simple Installation (Recommended)
1. Download the plugin files to your Obsidian plugins folder:
   ```
   .obsidian/plugins/obsidian-xterm/
   ├── main.js
   ├── manifest.json
   ├── styles.css
   └── server/
       ├── server.js
       ├── package.json
       └── package-lock.json
   ```

2. Enable the plugin in Obsidian's Community Plugins settings

3. The plugin will automatically:
   - Detect your Node.js installation
   - Start the backend server when you open a terminal
   - Install server dependencies as needed

### Option 2: Manual Setup
If auto-start doesn't work, you can manually start the server:

```bash
# Navigate to server directory
cd .obsidian/plugins/obsidian-xterm/server

# Install dependencies (first time only)
npm install

# Start server
npm start
```

## 🎯 Usage

### Opening the Terminal

- **Ribbon Icon**: Click the terminal icon in the left ribbon
- **Command Palette**: Run "Open Terminal" command (Ctrl/Cmd+P → "Open Terminal")
- **Keyboard Shortcut**: Assign a hotkey in Settings → Hotkeys → "Open Terminal"

### Terminal Features

- Full shell interaction with command history
- **Starts in vault directory**: Terminal opens in your Obsidian vault root directory
- **Full workspace usage**: Terminal automatically fills the entire available view area
- Copy/paste support (Ctrl/Cmd+Shift+C/V)
- Scrollback buffer for viewing command history
- Process management (close tab to terminate shell)
- Auto-resize when window changes

## ⚙️ Configuration

Access settings through **Settings → Community Plugins → Obsidian XTerm**:

### Basic Settings
- **Auto-Start Server**: Automatically start server when opening terminal (default: enabled)
- **Server URL**: Terminal backend server URL (default: `http://localhost:3001`)  
- **Server Port**: Port for the terminal server (default: 3001)
- **Shell**: Shell to use (auto-detected: zsh/bash/PowerShell)
- **Font Size**: Terminal font size (8-24px)

### Node.js Path Configuration
- **Node.js Path**: Configure Node.js executable path
  - `auto`: Automatic detection (default)
  - Custom path: e.g., `/usr/local/bin/node`
- **Detect Button**: Auto-detect and fill Node.js path
- **Test Button**: Verify Node.js installation works

### Server Management
- **Check Status**: Verify if server is running
- **Start Server**: Manually start the terminal server
- **Stop Server**: Stop the running server

## 🔧 Troubleshooting

### Server Won't Start

1. **Check Node.js Installation**:
   ```bash
   node --version
   ```

2. **Configure Node.js Path**:
   - Go to plugin settings
   - Click "Detect" to auto-find Node.js
   - Or manually set the path to your Node.js executable

3. **Manual Server Start**:
   ```bash
   cd server
   npm install
   npm start
   ```

### Connection Issues

1. Check if server is running: `http://localhost:3001/health`
2. Verify port isn't blocked by firewall
3. Try changing server port in settings

### Common Node.js Paths

- **macOS (Homebrew)**: `/opt/homebrew/bin/node`
- **macOS (System)**: `/usr/local/bin/node`
- **Linux**: `/usr/bin/node` or `/usr/local/bin/node`
- **Windows**: `C:\Program Files\nodejs\node.exe`
- **NVM**: `~/.nvm/versions/node/vX.X.X/bin/node`

## 🏛️ Technical Details

### Frontend (Obsidian Plugin)
- Built with TypeScript and xterm.js
- Uses socket.io-client for WebSocket communication
- Integrates with Obsidian's workspace system
- Handles terminal rendering, input, and resize events

### Backend (Node.js Server)
- Express.js web server with socket.io WebSocket support
- node-pty for proper PTY (pseudo-terminal) integration  
- Real shell process management with full terminal capabilities
- Health monitoring and multi-client support
- Graceful shutdown handling

### Communication Protocol
WebSocket events:
- `create-terminal`: Initialize new terminal session
- `terminal-input`: Send user input to shell
- `terminal-output`: Receive shell output
- `terminal-resize`: Handle terminal resize
- `terminal-exit`: Handle shell process termination

## 🛠️ Development

```bash
# Install dependencies
npm install

# Development build with watch
npm run dev

# Production build
npm run build

# Server development
cd server
npm install
npm start
```

## 📄 License

MIT License

## 🤝 Contributing

Contributions welcome! Please read the contributing guidelines and submit pull requests for any improvements.

## ⚠️ Security Note

This plugin provides direct shell access to your system. Only use in trusted environments and be cautious with commands that could affect your system.