# Obsidian-Xterm Plugin

Terminal emulator plugin for Obsidian using xterm.js with full shell access.

## Features

- Full terminal functionality within Obsidian
- Auto-starts backend server when needed
- Configurable Node.js path for compatibility
- Supports all platforms (Windows, macOS, Linux)
- Dockable terminal view
- Real shell access with interactive programs

## Quick Start

1. Install dependencies in the plugin directory:
   ```bash
   npm install express socket.io node-pty
   ```

2. Configure Node.js path in settings if needed

3. Open terminal via ribbon icon or command palette

For detailed setup instructions, see [TERMINAL_SETUP.md](TERMINAL_SETUP.md).

## Installation

### From Source
1. Clone this repo to your vault's plugins folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/your-username/obsidian-xterm
   ```

2. Install dependencies:
   ```bash
   cd obsidian-xterm
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Enable the plugin in Obsidian settings

### Manual Installation
- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/obsidian-xterm/`

## Development

This plugin provides a fully functional terminal emulator for Obsidian using:
- Frontend: xterm.js terminal UI
- Backend: Node.js server with socket.io and node-pty
- Auto-start server with smart Node.js detection

### Build Commands
- `npm run dev` - Development build with watch mode
- `npm run build` - Production build

## Requirements

- Node.js (for running the terminal backend)
- Obsidian desktop app (mobile not supported)

## License

MIT