# Obsidian Terminal Plugin Setup Guide

## Overview
This plugin provides a fully functional terminal within Obsidian, using xterm.js for the frontend and a Node.js backend server for shell execution.

## Architecture
- **Frontend**: Obsidian plugin with xterm.js terminal UI
- **Backend**: Node.js server with socket.io and node-pty for shell spawning
- **Communication**: WebSocket connection for real-time bidirectional I/O

## Setup Instructions

### 1. Install Backend Dependencies

First, set up the terminal backend server:

```bash
# Navigate to the plugin directory
cd /path/to/your/vault/.obsidian/plugins/obsidian-xterm

# Install server dependencies
npm install express socket.io node-pty

# Or use the provided package file
npm install --package-lock-only --package=package-server.json
```

### 2. Automatic Server Start (NEW!)

**The plugin now auto-starts the server!** When you open the terminal view:
1. The plugin checks if the server is already running
2. If not, it automatically starts the server process
3. No manual server management needed!

### Manual Server Start (Optional)

If you prefer to manage the server manually or if auto-start is disabled:

```bash
node server.js
```

The server will start on `http://localhost:3321` by default.

You can also set a custom port:
```bash
PORT=8080 node server.js
```

### 3. Configure Plugin Settings

In Obsidian:
1. Open Settings → Plugin Options → Terminal
2. **Node.js Path** - Custom path to Node.js executable (NEW!)
   - Leave empty for auto-detection
   - Click "Detect" to auto-find Node.js
   - Click "Test" to verify the path works
   - Example: `/usr/local/bin/node` or `C:\Program Files\nodejs\node.exe`
3. **Auto-start Server** - Enable/disable automatic server startup (default: enabled)
4. **Server Port** - Set the port for the terminal server (default: 3321)
5. **Server URL** - Automatically updated based on port
6. **Kill Server on Close** - Stop server when plugin unloads (default: disabled)
7. Adjust other settings as needed (font size, theme, etc.)

### 4. Open Terminal

Use one of these methods:
- Click the terminal icon in the left ribbon
- Use Command Palette: "Open Terminal"
- The terminal will open as a dockable view in the right sidebar

## Features

- **Full shell access**: Run any command available in your system shell
- **Interactive programs**: Supports vim, nano, top, etc.
- **Multiple terminals**: Each view creates a separate shell session
- **Persistent sessions**: Terminal sessions persist until closed
- **Resizable**: Terminal automatically adjusts to view size
- **Configurable**: Customize font size, colors, and server URL

## Troubleshooting

### "spawn node ENOENT" Error (FIXED!)
This error means Node.js cannot be found. Solution:
1. Go to Settings → Plugin Options → Terminal
2. In the **Node.js Path** field:
   - Click "Detect" to auto-find Node.js, OR
   - Manually enter the path to your Node.js executable
3. Click "Test" to verify it works
4. Common Node.js locations:
   - **macOS**: `/usr/local/bin/node` or `/opt/homebrew/bin/node` (M1 Macs)
   - **Windows**: `C:\Program Files\nodejs\node.exe`
   - **Linux**: `/usr/bin/node` or `/usr/local/bin/node`

To find your Node.js path manually:
```bash
# macOS/Linux
which node

# Windows
where node
```

### Terminal shows "Connection error"
1. Make sure the server is running (should auto-start)
2. Check the server URL in settings matches the port
3. Verify no firewall is blocking localhost connections

### "Cannot find module 'node-pty'" error
Dependencies not installed. Run in plugin directory:
```bash
npm install express socket.io node-pty
```

Or if node-pty needs rebuilding:
```bash
npm rebuild node-pty
```

### Permission issues on macOS/Linux
The terminal inherits the permissions of the Node.js process. Run the server with appropriate permissions if needed.

## Security Considerations

⚠️ **Warning**: The terminal server provides full shell access. Only run it locally and never expose it to the internet without proper authentication.

- The server only listens on localhost by default
- Each connection gets its own isolated shell session
- Sessions are terminated when the connection closes

## Development

### Server Configuration
Edit `server.js` to customize:
- Default shell (bash, zsh, powershell)
- Working directory
- Environment variables
- CORS settings

### Adding Features
The implementation follows the wetty architecture in `.refs/wetty/`:
- Flow control for high-throughput operations
- Proper terminal resize handling
- Session management

## Known Limitations

- Requires separate backend server process
- No built-in authentication (localhost only)
- File uploads/downloads not yet implemented
- Copy/paste may require platform-specific handling

## Credits

Based on:
- [xterm.js](https://xtermjs.org/) - Terminal frontend
- [node-pty](https://github.com/microsoft/node-pty) - Pseudoterminal spawning
- [wetty](https://github.com/butlerx/wetty) - Reference implementation