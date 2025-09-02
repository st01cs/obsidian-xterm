import { App, ItemView, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, Notice } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { io, Socket } from 'socket.io-client';
import { ChildProcess } from 'child_process';

// Node.js modules (only available when isDesktopOnly: true)
const childProcess = require('child_process');
const path = require('path');
const net = require('net');

const TERMINAL_VIEW_TYPE = 'terminal-view';

interface XTermPluginSettings {
	terminalHeight: number;
	fontSize: number;
	theme: 'dark' | 'light';
	serverUrl: string;
	autoStartServer: boolean;
	serverPort: number;
	killServerOnClose: boolean;
	nodePath: string;
}

const DEFAULT_SETTINGS: XTermPluginSettings = {
	terminalHeight: 300,
	fontSize: 14,
	theme: 'dark',
	serverUrl: 'http://localhost:3321',
	autoStartServer: true,
	serverPort: 3321,
	killServerOnClose: false,
	nodePath: ''
}

export default class XTermPlugin extends Plugin {
	settings: XTermPluginSettings;
	serverProcess: ChildProcess | null = null;

	async onload() {
		await this.loadSettings();

		// Register terminal view
		this.registerView(TERMINAL_VIEW_TYPE, (leaf) => new TerminalView(leaf, this));

		// Add ribbon icon for terminal
		this.addRibbonIcon('terminal', 'Open Terminal', () => {
			this.activateView();
		});

		// Add command to open terminal
		this.addCommand({
			id: 'open-terminal',
			name: 'Open Terminal',
			callback: () => {
				this.activateView();
			}
		});

		// Add settings tab
		this.addSettingTab(new XTermSettingTab(this.app, this));

	}

	onunload() {
		// Cleanup when plugin is disabled
		if (this.serverProcess && this.settings.killServerOnClose) {
			console.log('Stopping terminal server...');
			this.serverProcess.kill();
			this.serverProcess = null;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(TERMINAL_VIEW_TYPE);

		const rightLeaf = this.app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			await rightLeaf.setViewState({
				type: TERMINAL_VIEW_TYPE,
				active: true,
			});
		}

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)[0]
		);
	}
}

class TerminalView extends ItemView {
	plugin: XTermPlugin;
	terminal: Terminal;
	socket: Socket | null = null;
	isConnected: boolean = false;
	serverStarting: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: XTermPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return TERMINAL_VIEW_TYPE;
	}

	getDisplayText() {
		return 'Terminal';
	}

	getIcon() {
		return 'terminal';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl('h4', { text: 'Terminal' });

		const terminalContainer = container.createEl('div');
		terminalContainer.addClass('terminal-container');
		terminalContainer.style.height = '100%';
		terminalContainer.style.width = '100%';

		this.terminal = new Terminal({
			rows: 24,
			cols: 80,
			fontSize: this.plugin.settings.fontSize,
			theme: {
				background: this.plugin.settings.theme === 'dark' ? '#000000' : '#ffffff',
				foreground: this.plugin.settings.theme === 'dark' ? '#ffffff' : '#000000'
			}
		});

		this.terminal.open(terminalContainer);
		
		if (this.plugin.settings.autoStartServer) {
			this.autoStartServer();
		} else {
			this.connectToServer();
		}

		// Handle terminal input
		this.terminal.onData(data => {
			if (this.socket && this.isConnected) {
				this.socket.emit('data', data);
			}
		});

		// Handle terminal resize
		this.terminal.onResize(({ cols, rows }) => {
			if (this.socket && this.isConnected) {
				this.socket.emit('resize', cols, rows);
			}
		});
	}

	async onClose() {
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
		}
		if (this.terminal) {
			this.terminal.dispose();
		}
		// Note: We don't kill the server on view close by default
		// Server can be reused when opening the terminal again
	}

	connectToServer() {
		this.terminal.write('Connecting to terminal server...\r\n');
		
		this.socket = io(this.plugin.settings.serverUrl, {
			reconnection: true,
			reconnectionAttempts: 5,
			reconnectionDelay: 1000
		});

		this.socket.on('connect', () => {
			this.isConnected = true;
			this.terminal.clear();
			this.terminal.write('Connected to terminal server\r\n');
			
			// Create terminal on server
			this.socket?.emit('create', this.terminal.cols, this.terminal.rows);
		});

		this.socket.on('created', (pid) => {
			console.log('Terminal created with PID:', pid);
		});

		this.socket.on('data', (data: string) => {
			this.terminal.write(data);
		});

		this.socket.on('exit', () => {
			this.terminal.write('\r\nTerminal session ended\r\n');
			this.isConnected = false;
		});

		this.socket.on('disconnect', () => {
			this.isConnected = false;
			this.terminal.write('\r\nDisconnected from terminal server\r\n');
		});

		this.socket.on('connect_error', (error) => {
			this.terminal.write(`\r\nConnection error: ${error.message}\r\n`);
			if (this.plugin.settings.autoStartServer && !this.serverStarting) {
				this.terminal.write('\r\nAttempting to auto-start server...\r\n');
				this.autoStartServer();
			} else {
				this.terminal.write('Make sure the terminal server is running:\r\n');
				this.terminal.write('1. cd to plugin directory\r\n');
				this.terminal.write('2. npm install (using package-server.json)\r\n');
				this.terminal.write('3. node server.js\r\n');
			}
		});
	}

	async autoStartServer() {
		this.serverStarting = true;
		this.terminal.write('Checking if server is already running...\r\n');
		
		// Check if server is already running
		const isRunning = await this.checkServerRunning();
		if (isRunning) {
			this.terminal.write('Server is already running\r\n');
			this.connectToServer();
			return;
		}
		
		// Start the server
		this.terminal.write('Starting terminal server...\r\n');
		const serverStarted = await this.startServer();
		
		if (serverStarted) {
			// Wait a bit for server to fully initialize
			setTimeout(() => {
				this.connectToServer();
			}, 1000);
		} else {
			this.terminal.write('\r\nFailed to start server automatically\r\n');
		}
		this.serverStarting = false;
	}

	checkServerRunning(): Promise<boolean> {
		return new Promise((resolve) => {
			const client = new net.Socket();
			client.setTimeout(1000);
			
			client.on('connect', () => {
				client.destroy();
				resolve(true);
			});
			
			client.on('error', () => {
				resolve(false);
			});
			
			client.on('timeout', () => {
				client.destroy();
				resolve(false);
			});
			
			client.connect(this.plugin.settings.serverPort, 'localhost');
		});
	}

	findNodePath(): string | null {
		const fs = require('fs');
		const possiblePaths = [];
		
		// First, check if user has specified a custom Node.js path
		if (this.plugin.settings.nodePath && this.plugin.settings.nodePath.trim() !== '') {
			const customPath = this.plugin.settings.nodePath.trim();
			if (fs.existsSync(customPath)) {
				console.log('Using custom Node.js path:', customPath);
				return customPath;
			} else {
				this.terminal.write(`\r\nWarning: Custom Node.js path not found: ${customPath}\r\n`);
				this.terminal.write(`Falling back to auto-detection...\r\n`);
			}
		}
		
		if (process.platform === 'win32') {
			// Windows paths
			possiblePaths.push(
				'C:\\Program Files\\nodejs\\node.exe',
				'C:\\Program Files (x86)\\nodejs\\node.exe',
				path.join(process.env.LOCALAPPDATA || '', 'Programs', 'node', 'node.exe'),
				path.join(process.env.ProgramFiles || '', 'nodejs', 'node.exe')
			);
			
			// Check if node is in PATH
			const pathDirs = (process.env.PATH || '').split(';');
			for (const dir of pathDirs) {
				possiblePaths.push(path.join(dir, 'node.exe'));
			}
		} else if (process.platform === 'darwin') {
			// macOS paths
			possiblePaths.push(
				'/usr/local/bin/node',
				'/opt/homebrew/bin/node',
				'/usr/bin/node',
				'/opt/local/bin/node',
				path.join(process.env.HOME || '', '.nvm', 'versions', 'node', '*', 'bin', 'node'),
				path.join(process.env.HOME || '', '.asdf', 'shims', 'node')
			);
		} else {
			// Linux paths
			possiblePaths.push(
				'/usr/bin/node',
				'/usr/local/bin/node',
				'/bin/node',
				path.join(process.env.HOME || '', '.nvm', 'versions', 'node', '*', 'bin', 'node'),
				path.join(process.env.HOME || '', '.asdf', 'shims', 'node')
			);
		}
		
		// Find first existing path
		for (const nodePath of possiblePaths) {
			// Skip glob patterns for now (would need glob module)
			if (nodePath.includes('*')) {
				continue;
			}
			
			if (fs.existsSync(nodePath)) {
				console.log('Found Node.js at:', nodePath);
				return nodePath;
			}
		}
		
		// Try using 'which' or 'where' command as last resort
		try {
			const whichCmd = process.platform === 'win32' ? 'where' : 'which';
			const result = childProcess.execSync(`${whichCmd} node`, { encoding: 'utf8' }).trim();
			if (result && fs.existsSync(result.split('\n')[0])) {
				console.log('Found Node.js via which/where:', result.split('\n')[0]);
				return result.split('\n')[0];
			}
		} catch (e) {
			// which/where failed
		}
		
		// Try to use Electron's embedded Node.js (process.execPath points to Electron)
		// We can try to spawn with electron's node mode
		if (process.versions && process.versions.node) {
			console.log('Trying to use Electron\'s Node.js');
			// Return a special marker to use process.execPath with ELECTRON_RUN_AS_NODE
			return 'ELECTRON_NODE';
		}
		
		return null;
	}

	startServer(): Promise<boolean> {
		return new Promise((resolve) => {
			try {
				// Get the plugin directory path
				const vaultPath = (this.app.vault.adapter as any).basePath;
				const pluginPath = path.join(vaultPath, '.obsidian', 'plugins', 'obsidian-xterm');
				const serverPath = path.join(pluginPath, 'server.js');
				
				// Check if server.js exists
				const fs = require('fs');
				if (!fs.existsSync(serverPath)) {
					this.terminal.write(`Server file not found: ${serverPath}\r\n`);
					resolve(false);
					return;
				}
				
				// Check if dependencies are installed
				const nodeModulesPath = path.join(pluginPath, 'node_modules');
				if (!fs.existsSync(nodeModulesPath)) {
					this.terminal.write(`\r\nDependencies not installed!\r\n`);
					this.terminal.write(`Please run in the plugin directory:\r\n`);
					this.terminal.write(`  cd "${pluginPath}"\r\n`);
					this.terminal.write(`  npm install express socket.io node-pty\r\n`);
					resolve(false);
					return;
				}
				
				// Check for critical dependencies
				const requiredModules = ['express', 'socket.io', 'node-pty'];
				for (const module of requiredModules) {
					const modulePath = path.join(nodeModulesPath, module);
					if (!fs.existsSync(modulePath)) {
						this.terminal.write(`\r\nMissing dependency: ${module}\r\n`);
						this.terminal.write(`Please install it with: npm install ${module}\r\n`);
						resolve(false);
						return;
					}
				}
				
				// Find Node.js executable
				const nodePath = this.findNodePath();
				if (!nodePath) {
					this.terminal.write(`\r\nNode.js not found!\r\n`);
					this.terminal.write(`Please install Node.js from https://nodejs.org/\r\n`);
					this.terminal.write(`Or ensure it's in your PATH\r\n`);
					resolve(false);
					return;
				}
				
				// Handle special case for Electron's embedded Node.js
				if (nodePath === 'ELECTRON_NODE') {
					this.terminal.write(`Using Electron's embedded Node.js\r\n`);
					
					// Use Electron's executable with ELECTRON_RUN_AS_NODE
					this.plugin.serverProcess = childProcess.spawn(process.execPath, [serverPath], {
						cwd: pluginPath,
						env: { 
							...process.env, 
							PORT: this.plugin.settings.serverPort.toString(),
							ELECTRON_RUN_AS_NODE: '1'
						},
						detached: false,
						shell: false
					});
				} else {
					this.terminal.write(`Using Node.js: ${nodePath}\r\n`);
					
					// Spawn the server process with absolute path
					this.plugin.serverProcess = childProcess.spawn(nodePath, [serverPath], {
						cwd: pluginPath,
						env: { ...process.env, PORT: this.plugin.settings.serverPort.toString() },
						detached: false,
						shell: false
					});
				}
				
				if (this.plugin.serverProcess) {
					this.plugin.serverProcess.stdout?.on('data', (data: Buffer) => {
						console.log('Server output:', data.toString());
					});
					
					this.plugin.serverProcess.stderr?.on('data', (data: Buffer) => {
						console.error('Server error:', data.toString());
						this.terminal.write(`Server error: ${data.toString()}\r\n`);
					});
					
					this.plugin.serverProcess.on('error', (error: any) => {
						console.error('Failed to start server:', error);
						if (error.code === 'ENOENT') {
							this.terminal.write(`\r\nNode.js not found!\r\n`);
							this.terminal.write(`Please install Node.js from https://nodejs.org/\r\n`);
						} else if (error.code === 'EACCES') {
							this.terminal.write(`\r\nPermission denied to run Node.js\r\n`);
						} else {
							this.terminal.write(`Failed to start server: ${error.message}\r\n`);
						}
						this.plugin.serverProcess = null;
						resolve(false);
					});
					
					this.plugin.serverProcess.on('exit', (code) => {
						console.log(`Server process exited with code ${code}`);
						this.plugin.serverProcess = null;
					});
				}
				
				// Server started successfully
				this.terminal.write('Server started successfully\r\n');
				resolve(true);
				
			} catch (error) {
				console.error('Error starting server:', error);
				this.terminal.write(`Error starting server: ${error}\r\n`);
				resolve(false);
			}
		});
	}
}

class XTermSettingTab extends PluginSettingTab {
	plugin: XTermPlugin;

	constructor(app: App, plugin: XTermPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.createEl('h2', {text: 'Terminal Settings'});

		new Setting(containerEl)
			.setName('Terminal Height')
			.setDesc('Height of the terminal window in pixels')
			.addSlider(slider => slider
				.setLimits(200, 800, 50)
				.setValue(this.plugin.settings.terminalHeight)
				.onChange(async (value) => {
					this.plugin.settings.terminalHeight = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Font Size')
			.setDesc('Terminal font size')
			.addSlider(slider => slider
				.setLimits(10, 24, 1)
				.setValue(this.plugin.settings.fontSize)
				.onChange(async (value) => {
					this.plugin.settings.fontSize = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Theme')
			.setDesc('Terminal color theme')
			.addDropdown(dropdown => dropdown
				.addOption('dark', 'Dark')
				.addOption('light', 'Light')
				.setValue(this.plugin.settings.theme)
				.onChange(async (value: 'dark' | 'light') => {
					this.plugin.settings.theme = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Server URL')
			.setDesc('Terminal backend server URL')
			.addText(text => text
				.setPlaceholder('http://localhost:3321')
				.setValue(this.plugin.settings.serverUrl)
				.onChange(async (value) => {
					this.plugin.settings.serverUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-start Server')
			.setDesc('Automatically start the terminal server when opening terminal')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoStartServer)
				.onChange(async (value) => {
					this.plugin.settings.autoStartServer = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Server Port')
			.setDesc('Port for the terminal server (default: 3321)')
			.addText(text => text
				.setPlaceholder('3321')
				.setValue(this.plugin.settings.serverPort.toString())
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port) && port > 0 && port < 65536) {
						this.plugin.settings.serverPort = port;
						this.plugin.settings.serverUrl = `http://localhost:${port}`;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Kill Server on Close')
			.setDesc('Stop the server when closing the plugin (not recommended)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.killServerOnClose)
				.onChange(async (value) => {
					this.plugin.settings.killServerOnClose = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Node.js Path')
			.setDesc('Custom path to Node.js executable (leave empty for auto-detection)')
			.addText(text => text
				.setPlaceholder('e.g., /usr/local/bin/node')
				.setValue(this.plugin.settings.nodePath)
				.onChange(async (value) => {
					this.plugin.settings.nodePath = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('Detect')
				.onClick(async () => {
					// Try to help user find Node.js
					const detectedPath = await this.detectNodePath();
					if (detectedPath) {
						this.plugin.settings.nodePath = detectedPath;
						await this.plugin.saveSettings();
						// Update the text field
						const textInput = containerEl.querySelector('input[type="text"]:last-of-type') as HTMLInputElement;
						if (textInput) {
							textInput.value = detectedPath;
						}
						new Notice(`Node.js found at: ${detectedPath}`);
					} else {
						new Notice('Could not auto-detect Node.js. Please enter the path manually.');
					}
				}))
			.addButton(button => button
				.setButtonText('Test')
				.onClick(async () => {
					// Test the Node.js path
					const nodePath = this.plugin.settings.nodePath || await this.detectNodePath();
					if (!nodePath) {
						new Notice('No Node.js path set and could not auto-detect');
						return;
					}
					
					try {
						const result = childProcess.execSync(`"${nodePath}" --version`, { encoding: 'utf8' }).trim();
						new Notice(`Node.js works! Version: ${result}`);
					} catch (e) {
						new Notice(`Node.js test failed: ${e.message}`);
					}
				}));
	}

	async detectNodePath(): Promise<string | null> {
		const fs = require('fs');
		const possiblePaths = [];
		
		if (process.platform === 'win32') {
			possiblePaths.push(
				'C:\\Program Files\\nodejs\\node.exe',
				'C:\\Program Files (x86)\\nodejs\\node.exe',
				path.join(process.env.LOCALAPPDATA || '', 'Programs', 'node', 'node.exe'),
				path.join(process.env.ProgramFiles || '', 'nodejs', 'node.exe')
			);
		} else if (process.platform === 'darwin') {
			possiblePaths.push(
				'/usr/local/bin/node',
				'/opt/homebrew/bin/node',
				'/usr/bin/node',
				'/opt/local/bin/node'
			);
		} else {
			possiblePaths.push(
				'/usr/bin/node',
				'/usr/local/bin/node',
				'/bin/node'
			);
		}
		
		for (const nodePath of possiblePaths) {
			if (fs.existsSync(nodePath)) {
				return nodePath;
			}
		}
		
		// Try using which/where
		try {
			const whichCmd = process.platform === 'win32' ? 'where' : 'which';
			const result = childProcess.execSync(`${whichCmd} node`, { encoding: 'utf8' }).trim();
			if (result) {
				const firstPath = result.split('\n')[0].trim();
				if (fs.existsSync(firstPath)) {
					return firstPath;
				}
			}
		} catch (e) {
			// which/where failed
		}
		
		return null;
	}
}