import { App, ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { io, Socket } from 'socket.io-client';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

const VIEW_TYPE_TERMINAL = "terminal-view";

interface TerminalPluginSettings {
	serverUrl: string;
	shell: string;
	fontSize: number;
	theme: string;
	autoStartServer: boolean;
	serverPort: number;
	nodePath: string;
}

const DEFAULT_SETTINGS: TerminalPluginSettings = {
	serverUrl: 'http://localhost:3001',
	shell: process.platform === 'win32' ? 'powershell.exe' : (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'),
	fontSize: 14,
	theme: 'dark',
	autoStartServer: true,
	serverPort: 3001,
	nodePath: 'auto' // 'auto' means auto-detect, otherwise use the specified path
}

export default class TerminalPlugin extends Plugin {
	settings: TerminalPluginSettings;
	serverProcess: ChildProcess | null = null;
	isServerRunning = false;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_TERMINAL,
			(leaf) => new TerminalView(leaf, this.settings)
		);

		this.addRibbonIcon('terminal', 'Open Terminal', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-terminal',
			name: 'Open Terminal',
			callback: () => {
				this.activateView();
			}
		});

		this.addSettingTab(new TerminalSettingTab(this.app, this));
	}

	async activateView() {
		console.log('Activating terminal view...');
		console.log('Auto-start enabled:', this.settings.autoStartServer);
		console.log('Server running:', this.isServerRunning);
		
		// Auto-start server if enabled
		if (this.settings.autoStartServer && !this.isServerRunning) {
			console.log('Attempting to auto-start server...');
			const started = await this.startServer();
			console.log('Auto-start result:', started);
		}

		const { workspace } = this.app;
		
		let leaf: WorkspaceLeaf;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false) || workspace.getLeaf();
			await leaf.setViewState({ type: VIEW_TYPE_TERMINAL, active: true });
		}

		workspace.revealLeaf(leaf);
	}

	async startServer(): Promise<boolean> {
		if (this.isServerRunning) {
			return true;
		}

		try {
			// Check if server is already running
			const isRunning = await this.checkServerHealth();
			if (isRunning) {
				this.isServerRunning = true;
				return true;
			}

			// Try multiple possible server paths
			const possiblePaths = [
				// Standard plugin installation path
				path.join((this.app.vault.adapter as any).basePath || process.cwd(), '.obsidian', 'plugins', 'obsidian-xterm', 'server'),
				// Development path (current directory)
				path.join(process.cwd(), 'server'),
				// Alternative plugin path
				path.join(__dirname, 'server'),
				// Relative to main.js location
				path.join(path.dirname(require.main?.filename || ''), 'server')
			];

			let serverPath = '';
			const fs = require('fs');
			
			for (const testPath of possiblePaths) {
				console.log('Checking server path:', testPath);
				if (fs.existsSync(path.join(testPath, 'server.js'))) {
					serverPath = testPath;
					console.log('Found server at:', serverPath);
					break;
				}
			}

			if (!serverPath) {
				new Notice('Terminal server files not found. Checked paths: ' + possiblePaths.join(', '));
				console.log('Server not found in any of these paths:', possiblePaths);
				return false;
			}

			new Notice('Starting terminal server...', 2000);
			
			// Try to start server with multiple approaches
			try {
				this.serverProcess = await this.tryStartServer(serverPath);
			} catch (startupError) {
				console.error('All server startup methods failed:', startupError);
				new Notice('Failed to start terminal server. Check console for details.', 5000);
				return false;
			}

			// Handle server output
			this.serverProcess.stdout?.on('data', (data) => {
				const output = data.toString();
				console.log(`Terminal Server: ${output}`);
			});

			this.serverProcess.stderr?.on('data', (data) => {
				const error = data.toString();
				console.error(`Terminal Server Error: ${error}`);
				new Notice(`Server error: ${error}`, 5000);
			});

			this.serverProcess.on('exit', (code, signal) => {
				console.log(`Terminal server exited with code ${code}, signal ${signal}`);
				this.isServerRunning = false;
				this.serverProcess = null;
				if (code !== 0 && code !== null) {
					new Notice(`Server exited with error code ${code}`, 5000);
				}
			});

			this.serverProcess.on('error', (error) => {
				console.error('Server process error:', error);
				new Notice(`Server process error: ${error.message}`, 5000);
				this.isServerRunning = false;
				this.serverProcess = null;
			});

			// Wait a bit more for server to fully start, then check if it's running
			await new Promise(resolve => setTimeout(resolve, 3000));
			
			const started = await this.checkServerHealth();
			if (started) {
				this.isServerRunning = true;
				new Notice('Terminal server started successfully!');
				return true;
			} else {
				new Notice('Server started but not responding to health checks. Check console for errors.');
				return false;
			}

		} catch (error) {
			console.error('Error starting terminal server:', error);
			new Notice(`Failed to start terminal server: ${error.message}`);
			return false;
		}
	}

	async checkServerHealth(): Promise<boolean> {
		try {
			const response = await fetch(`${this.settings.serverUrl}/health`, {
				method: 'GET',
				timeout: 3000
			} as any);
			return response.ok;
		} catch {
			return false;
		}
	}

	async stopServer(): Promise<void> {
		if (this.serverProcess) {
			this.serverProcess.kill('SIGTERM');
			this.serverProcess = null;
		}
		this.isServerRunning = false;
	}

	async findNodePath(): Promise<string> {
		const fs = require('fs');
		
		// If user specified a custom path, use it (unless it's 'auto')
		if (this.settings.nodePath && this.settings.nodePath !== 'auto') {
			console.log('Using user-specified Node.js path:', this.settings.nodePath);
			
			// Verify the path exists
			if (fs.existsSync(this.settings.nodePath)) {
				return this.settings.nodePath;
			} else {
				console.error('User-specified Node.js path does not exist:', this.settings.nodePath);
				new Notice(`Custom Node.js path not found: ${this.settings.nodePath}. Using auto-detection.`, 5000);
			}
		}

		console.log('Auto-detecting Node.js path...');
		
		// Try common Node.js locations
		const possibleNodePaths = [
			// Current process node (most likely to work)
			process.execPath,
			// Common system locations
			'/usr/bin/node',
			'/usr/local/bin/node',
			'/opt/homebrew/bin/node', // Apple Silicon Mac with Homebrew
			'/opt/homebrew/opt/node/bin/node',
			// NVM locations
			`${process.env.HOME}/.nvm/versions/node/*/bin/node`,
			// Windows locations
			'C:\\Program Files\\nodejs\\node.exe',
			'C:\\Program Files (x86)\\nodejs\\node.exe',
			// Just 'node' as fallback
			'node'
		];

		// Expand NVM path pattern
		const expandedPaths = [...possibleNodePaths];
		if (process.env.HOME) {
			const nvmBasePath = `${process.env.HOME}/.nvm/versions/node`;
			if (fs.existsSync(nvmBasePath)) {
				try {
					const versions = fs.readdirSync(nvmBasePath);
					for (const version of versions) {
						expandedPaths.push(`${nvmBasePath}/${version}/bin/node`);
					}
				} catch (error) {
					console.log('Could not read NVM versions:', error);
				}
			}
		}

		console.log('Checking Node.js paths:', expandedPaths);

		// Test each path
		for (const nodePath of expandedPaths) {
			try {
				if (nodePath === 'node') {
					// Skip the fallback 'node' for now, test others first
					continue;
				}
				
				if (fs.existsSync(nodePath)) {
					console.log('Found Node.js at:', nodePath);
					return nodePath;
				}
			} catch (error) {
				// Continue checking other paths
			}
		}

		// If no absolute path worked, try using the same node that's running Obsidian
		console.log('Using process.execPath as fallback:', process.execPath);
		return process.execPath;
	}

	async tryStartServer(serverPath: string): Promise<ChildProcess> {
		const approaches = [
			// Approach 1: Try with detected Node.js path
			async () => {
				const nodePath = await this.findNodePath();
				console.log('Approach 1: Using Node.js path:', nodePath);
				return spawn(nodePath, ['server.js'], {
					cwd: serverPath,
					env: { 
						...process.env, 
						PORT: this.settings.serverPort.toString(),
						NODE_ENV: 'production',
						PATH: process.env.PATH || ''
					},
					detached: false,
					stdio: ['ignore', 'pipe', 'pipe']
				});
			},
			
			// Approach 2: Try with npm start (uses package.json scripts)
			async () => {
				console.log('Approach 2: Using npm start');
				return spawn('npm', ['start'], {
					cwd: serverPath,
					env: { 
						...process.env, 
						PORT: this.settings.serverPort.toString(),
						NODE_ENV: 'production'
					},
					detached: false,
					stdio: ['ignore', 'pipe', 'pipe']
				});
			},
			
			// Approach 3: Try with shell execution
			async () => {
				const nodePath = await this.findNodePath();
				console.log('Approach 3: Using shell execution with:', nodePath);
				const command = process.platform === 'win32' ? 
					`"${nodePath}" server.js` : 
					`"${nodePath}" server.js`;
				return spawn(command, [], {
					cwd: serverPath,
					env: { 
						...process.env, 
						PORT: this.settings.serverPort.toString(),
						NODE_ENV: 'production'
					},
					shell: true,
					detached: false,
					stdio: ['ignore', 'pipe', 'pipe']
				});
			}
		];

		for (let i = 0; i < approaches.length; i++) {
			try {
				console.log(`Trying server startup approach ${i + 1}...`);
				const serverProcess = await approaches[i]();
				
				// Wait a moment to see if the process starts successfully
				await new Promise(resolve => setTimeout(resolve, 1000));
				
				// Check if process is still running (didn't immediately exit with error)
				if (serverProcess.exitCode === null && !serverProcess.killed) {
					console.log(`✅ Approach ${i + 1} successful!`);
					return serverProcess;
				} else {
					console.log(`❌ Approach ${i + 1} failed - process exited`);
					serverProcess.kill();
				}
			} catch (error) {
				console.log(`❌ Approach ${i + 1} failed:`, error.message);
			}
		}

		throw new Error('All server startup approaches failed');
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
		// Stop server when plugin is unloaded
		this.stopServer();
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		
		// Ensure autoStartServer is explicitly set if not present
		if (this.settings.autoStartServer === undefined) {
			this.settings.autoStartServer = true;
			await this.saveSettings();
		}
		
		console.log('Settings loaded:', this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TerminalView extends ItemView {
	private terminal: Terminal;
	private socket: Socket | null = null;
	private settings: TerminalPluginSettings;
	private isConnected = false;

	constructor(leaf: WorkspaceLeaf, settings: TerminalPluginSettings) {
		super(leaf);
		this.settings = settings;
	}

	getViewType() {
		return VIEW_TYPE_TERMINAL;
	}

	getDisplayText() {
		return "Terminal";
	}

	getIcon() {
		return "terminal";
	}

	async onOpen() {
		console.log('TerminalView onOpen called');
		const container = this.containerEl.children[1];
		container.empty();
		
		const terminalContainer = container.createDiv();
		terminalContainer.addClass('terminal-container');
		
		// Create terminal
		this.terminal = new Terminal({
			fontSize: this.settings.fontSize,
			fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
			theme: {
				background: '#1e1e1e',
				foreground: '#ffffff',
			},
			cursorBlink: true,
			convertEol: true,
			cols: 80,
			rows: 24,
		});

		this.terminal.open(terminalContainer);
		this.terminal.focus();
		
		// Add click handler to ensure focus
		terminalContainer.addEventListener('click', () => {
			this.terminal.focus();
		});

		// Handle terminal resize
		const resizeObserver = new ResizeObserver(() => {
			if (this.terminal && this.socket && this.isConnected) {
				const rect = terminalContainer.getBoundingClientRect();
				const cols = Math.floor(rect.width / 9); // More accurate character width
				const rows = Math.floor(rect.height / 17); // More accurate line height
				if (cols > 0 && rows > 0 && (cols !== this.terminal.cols || rows !== this.terminal.rows)) {
					this.terminal.resize(cols, rows);
					this.socket.emit('terminal-resize', { cols, rows });
				}
			}
		});
		resizeObserver.observe(terminalContainer);

		// Initialize WebSocket connection
		await this.initializeSocket();
	}

	private async initializeSocket() {
		this.terminal.write('Connecting to terminal server...\r\n');

		try {
			// Connect to the backend server
			this.socket = io(this.settings.serverUrl, {
				timeout: 10000, // Increased timeout for auto-start
				forceNew: true
			});

			// Connection successful
			this.socket.on('connect', () => {
				this.isConnected = true;
				this.terminal.clear();
				this.terminal.write('Connected to terminal server. Starting shell...\r\n');
				
				// Create terminal session on the backend
				this.socket!.emit('create-terminal', {
					shell: this.settings.shell,
					cols: this.terminal.cols,
					rows: this.terminal.rows
				});
			});

			// Terminal created successfully
			this.socket.on('terminal-created', (data: any) => {
				this.terminal.clear();
				console.log('Terminal created:', data);
			});

			// Handle terminal output from backend
			this.socket.on('terminal-output', (data: string) => {
				this.terminal.write(data);
			});

			// Handle terminal exit
			this.socket.on('terminal-exit', (data: any) => {
				this.terminal.write(`\r\n\r\nTerminal exited with code ${data.exitCode}\r\n`);
				this.terminal.write('Connection closed. Close this tab to reconnect.\r\n');
				this.isConnected = false;
			});

			// Handle errors
			this.socket.on('terminal-error', (error: any) => {
				this.terminal.write(`\r\nError: ${error.error}\r\n`);
				console.error('Terminal error:', error);
			});

			// Handle disconnection
			this.socket.on('disconnect', (reason: string) => {
				this.isConnected = false;
				this.terminal.write(`\r\n\r\nDisconnected from server: ${reason}\r\n`);
				console.log('Socket disconnected:', reason);
			});

			// Connection error
			this.socket.on('connect_error', (error: Error) => {
				this.terminal.clear();
				this.terminal.write(`Failed to connect to terminal server at ${this.settings.serverUrl}\r\n`);
				this.terminal.write(`Error: ${error.message}\r\n\r\n`);
				this.terminal.write(`Please ensure the terminal server is running:\r\n`);
				this.terminal.write(`1. cd server\r\n`);
				this.terminal.write(`2. npm start\r\n\r\n`);
				console.error('Socket connection error:', error);
			});

			// Handle terminal input
			this.terminal.onData((data) => {
				if (this.socket && this.isConnected) {
					this.socket.emit('terminal-input', data);
				}
			});

		} catch (error) {
			this.terminal.write(`Failed to initialize terminal: ${error}\r\n`);
			console.error('Terminal initialization error:', error);
		}
	}

	async onClose() {
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
		}
		if (this.terminal) {
			this.terminal.dispose();
		}
		this.isConnected = false;
	}
}

class TerminalSettingTab extends PluginSettingTab {
	plugin: TerminalPlugin;

	constructor(app: App, plugin: TerminalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Auto-Start Server')
			.setDesc('Automatically start the terminal server when opening a terminal')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoStartServer)
				.onChange(async (value) => {
					this.plugin.settings.autoStartServer = value;
					await this.plugin.saveSettings();
				}));

		const nodePathSetting = new Setting(containerEl)
			.setName('Node.js Path')
			.setDesc('Path to Node.js executable. Use "auto" for automatic detection, or specify full path (e.g., /usr/local/bin/node)');

		let nodePathText: any;
		
		nodePathSetting.addText(text => {
			nodePathText = text;
			return text
				.setPlaceholder('auto')
				.setValue(this.plugin.settings.nodePath)
				.onChange(async (value) => {
					this.plugin.settings.nodePath = value || 'auto';
					await this.plugin.saveSettings();
				});
		});

		nodePathSetting.addButton(button => button
			.setButtonText('Detect')
			.setTooltip('Auto-detect Node.js path and fill the field')
			.onClick(async () => {
				button.setButtonText('Detecting...');
				// Temporarily set to auto to trigger detection
				const originalPath = this.plugin.settings.nodePath;
				this.plugin.settings.nodePath = 'auto';
				try {
					const detectedPath = await this.plugin.findNodePath();
					this.plugin.settings.nodePath = detectedPath;
					await this.plugin.saveSettings();
					// Update the text field
					if (nodePathText) {
						nodePathText.setValue(detectedPath);
					}
					new Notice(`Detected Node.js at: ${detectedPath}`);
					button.setButtonText('✓ Detected');
				} catch (error: any) {
					this.plugin.settings.nodePath = originalPath;
					new Notice(`Failed to detect Node.js: ${error.message}`);
					button.setButtonText('✗ Failed');
				}
				setTimeout(() => button.setButtonText('Detect'), 3000);
			}));

		nodePathSetting.addButton(button => button
			.setButtonText('Test')
			.setTooltip('Test if the current Node.js path works')
			.onClick(async () => {
				button.setButtonText('Testing...');
				try {
					const nodePath = await this.plugin.findNodePath();
					// Test by trying to get Node.js version
					const { spawn } = require('child_process');
					const testProcess = spawn(nodePath, ['--version'], {
						stdio: ['ignore', 'pipe', 'pipe']
					});

					let output = '';
					let error = '';

					testProcess.stdout?.on('data', (data: Buffer) => {
						output += data.toString();
					});

					testProcess.stderr?.on('data', (data: Buffer) => {
						error += data.toString();
					});

					testProcess.on('close', (code: number) => {
						if (code === 0 && output.trim().startsWith('v')) {
							new Notice(`✅ Node.js path works! Version: ${output.trim()}`);
							button.setButtonText('✓ Works');
						} else {
							new Notice(`❌ Node.js path failed: ${error || 'Unknown error'}`);
							button.setButtonText('✗ Failed');
						}
						setTimeout(() => button.setButtonText('Test'), 3000);
					});

					testProcess.on('error', (err: Error) => {
						new Notice(`❌ Node.js path error: ${err.message}`);
						button.setButtonText('✗ Error');
						setTimeout(() => button.setButtonText('Test'), 3000);
					});

				} catch (error: any) {
					new Notice(`❌ Test failed: ${error.message}`);
					button.setButtonText('✗ Error');
					setTimeout(() => button.setButtonText('Test'), 3000);
				}
			}));

		new Setting(containerEl)
			.setName('Server URL')
			.setDesc('Terminal server URL')
			.addText(text => text
				.setPlaceholder('http://localhost:3001')
				.setValue(this.plugin.settings.serverUrl)
				.onChange(async (value) => {
					this.plugin.settings.serverUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Server Port')
			.setDesc('Port for the terminal server (requires restart)')
			.addText(text => text
				.setPlaceholder('3001')
				.setValue(this.plugin.settings.serverPort.toString())
				.onChange(async (value) => {
					const port = parseInt(value);
					if (port > 0 && port < 65536) {
						this.plugin.settings.serverPort = port;
						this.plugin.settings.serverUrl = `http://localhost:${port}`;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Shell')
			.setDesc('Shell command to execute on the server')
			.addText(text => text
				.setPlaceholder('Enter shell path')
				.setValue(this.plugin.settings.shell)
				.onChange(async (value) => {
					this.plugin.settings.shell = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Font Size')
			.setDesc('Terminal font size')
			.addSlider(slider => slider
				.setLimits(8, 24, 1)
				.setValue(this.plugin.settings.fontSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.fontSize = value;
					await this.plugin.saveSettings();
				}));

		// Server Management Section
		containerEl.createEl('h3', {text: 'Server Management'});
		
		const statusSetting = new Setting(containerEl)
			.setName('Server Status')
			.setDesc('Check if the terminal server is running');

		statusSetting.addButton(button => button
			.setButtonText('Check Status')
			.onClick(async () => {
				button.setButtonText('Checking...');
				const isRunning = await this.plugin.checkServerHealth();
				if (isRunning) {
					try {
						const response = await fetch(`${this.plugin.settings.serverUrl}/health`);
						const data = await response.json();
						button.setButtonText('✓ Online');
						new Notice(`Server is running (Platform: ${data.platform}, Active terminals: ${data.terminals})`);
					} catch {
						button.setButtonText('✓ Online');
						new Notice('Server is running');
					}
				} else {
					button.setButtonText('✗ Offline');
					new Notice('Server is not responding');
				}
				setTimeout(() => button.setButtonText('Check Status'), 3000);
			}));

		statusSetting.addButton(button => button
			.setButtonText('Start Server')
			.onClick(async () => {
				button.setButtonText('Starting...');
				const started = await this.plugin.startServer();
				button.setButtonText(started ? '✓ Started' : '✗ Failed');
				setTimeout(() => button.setButtonText('Start Server'), 3000);
			}));

		statusSetting.addButton(button => button
			.setButtonText('Stop Server')
			.onClick(async () => {
				button.setButtonText('Stopping...');
				await this.plugin.stopServer();
				button.setButtonText('✓ Stopped');
				new Notice('Server stopped');
				setTimeout(() => button.setButtonText('Stop Server'), 3000);
			}));

		// Debug section
		containerEl.createEl('h3', {text: 'Debug & Testing'});
		
		const debugSetting = new Setting(containerEl)
			.setName('Debug Auto-Start')
			.setDesc('Test the auto-start functionality manually');

		debugSetting.addButton(button => button
			.setButtonText('Test Auto-Start')
			.onClick(async () => {
				button.setButtonText('Testing...');
				console.log('Manual auto-start test triggered');
				console.log('Current settings:', this.plugin.settings);
				console.log('Server running:', this.plugin.isServerRunning);
				
				// Show Node.js path info
				const nodePath = await this.plugin.findNodePath();
				console.log('Node.js path being used:', nodePath);
				new Notice(`Using Node.js: ${nodePath}`, 3000);
				
				if (!this.plugin.isServerRunning) {
					const result = await this.plugin.startServer();
					button.setButtonText(result ? '✓ Success' : '✗ Failed');
					new Notice(result ? 'Auto-start test successful!' : 'Auto-start test failed!');
				} else {
					button.setButtonText('Already Running');
					new Notice('Server is already running');
				}
				setTimeout(() => button.setButtonText('Test Auto-Start'), 3000);
			}));
	}
}
