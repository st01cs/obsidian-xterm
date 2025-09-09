/**
 * Obsidian XTerm Terminal Plugin
 * 
 * A fully functional terminal emulator for Obsidian using a dual-architecture approach:
 * - Frontend: Obsidian plugin with xterm.js for terminal UI
 * - Backend: Node.js server with socket.io and node-pty for shell process management
 * - Communication: WebSocket connection for real-time bidirectional I/O
 */

import { App, ItemView, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
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
	nodePath: string; // 'auto' for auto-detection, or full path to Node.js executable
}

const DEFAULT_SETTINGS: TerminalPluginSettings = {
	serverUrl: 'http://localhost:3001',
	shell: process.platform === 'win32' ? 'powershell.exe' : (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'),
	fontSize: 14,
	theme: 'dark',
	autoStartServer: true,
	serverPort: 3001,
	nodePath: 'auto'
}

/**
 * Main plugin class that handles server management and terminal view creation
 */
export default class TerminalPlugin extends Plugin {
	settings: TerminalPluginSettings;
	serverProcess: ChildProcess | null = null;
	isServerRunning = false;

	async onload() {
		await this.loadSettings();

		// Register terminal view
		this.registerView(VIEW_TYPE_TERMINAL, (leaf) => new TerminalView(leaf, this.settings));

		// Add ribbon icon
		this.addRibbonIcon('terminal', 'Open Terminal', () => {
			this.activateView();
		});

		// Add command
		this.addCommand({
			id: 'open-terminal',
			name: 'Open Terminal',
			callback: () => this.activateView()
		});

		// Add settings tab
		this.addSettingTab(new TerminalSettingTab(this.app, this));
	}

	/**
	 * Activates or creates a new terminal view
	 */
	async activateView() {
		// Auto-start server if enabled and not running
		if (this.settings.autoStartServer && !this.isServerRunning) {
			const started = await this.startServer();
			if (!started) {
				new Notice('Failed to auto-start server. Please start manually in settings.');
			}
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

	/**
	 * Starts the terminal server with automatic Node.js path detection
	 */
	async startServer(): Promise<boolean> {
		if (this.isServerRunning) return true;

		try {
			// Check if server is already running
			if (await this.checkServerHealth()) {
				this.isServerRunning = true;
				return true;
			}

			// Find server directory
			const serverPath = await this.findServerPath();
			if (!serverPath) {
				new Notice('Terminal server files not found');
				return false;
			}

			new Notice('Starting terminal server...', 2000);

			// Start server with multiple fallback approaches
			this.serverProcess = await this.tryStartServer(serverPath);
			this.setupServerEventHandlers();

			// Verify server started successfully
			await new Promise(resolve => setTimeout(resolve, 3000));
			const started = await this.checkServerHealth();

			if (started) {
				this.isServerRunning = true;
				new Notice('Terminal server started successfully!');
				return true;
			} else {
				new Notice('Server failed to start properly. Check console for errors.');
				return false;
			}

		} catch (error) {
			console.error('Error starting terminal server:', error);
			new Notice(`Failed to start terminal server: ${error.message}`);
			return false;
		}
	}

	/**
	 * Finds the server directory in possible installation locations
	 */
	private async findServerPath(): Promise<string | null> {
		const fs = require('fs');
		const possiblePaths = [
			// Plugin installation path
			path.join((this.app.vault.adapter as any).basePath || process.cwd(), '.obsidian', 'plugins', 'obsidian-xterm', 'server'),
			// Development path
			path.join(process.cwd(), 'server'),
			// Alternative paths
			path.join(__dirname, 'server'),
			path.join(path.dirname(require.main?.filename || ''), 'server')
		];

		for (const testPath of possiblePaths) {
			if (fs.existsSync(path.join(testPath, 'server.js'))) {
				return testPath;
			}
		}

		return null;
	}

	/**
	 * Sets up event handlers for the server process
	 */
	private setupServerEventHandlers() {
		if (!this.serverProcess) return;

		this.serverProcess.stdout?.on('data', (data) => {
			console.log(`Terminal Server: ${data.toString()}`);
		});

		this.serverProcess.stderr?.on('data', (data) => {
			console.error(`Terminal Server Error: ${data.toString()}`);
		});

		this.serverProcess.on('exit', (code, signal) => {
			console.log(`Terminal server exited with code ${code}, signal ${signal}`);
			this.isServerRunning = false;
			this.serverProcess = null;
		});

		this.serverProcess.on('error', (error) => {
			console.error('Server process error:', error);
			this.isServerRunning = false;
			this.serverProcess = null;
		});
	}

	/**
	 * Health check for the terminal server
	 */
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

	/**
	 * Stops the terminal server
	 */
	async stopServer(): Promise<void> {
		if (this.serverProcess) {
			this.serverProcess.kill('SIGTERM');
			this.serverProcess = null;
		}
		this.isServerRunning = false;
	}

	/**
	 * Finds Node.js executable path with comprehensive detection
	 */
	async findNodePath(): Promise<string> {
		const fs = require('fs');

		// Use custom path if specified
		if (this.settings.nodePath && this.settings.nodePath !== 'auto') {
			if (fs.existsSync(this.settings.nodePath)) {
				return this.settings.nodePath;
			} else {
				new Notice(`Custom Node.js path not found: ${this.settings.nodePath}. Using auto-detection.`, 5000);
			}
		}

		// Auto-detect Node.js path
		const possiblePaths = [
			process.execPath, // Current Node.js process
			'/usr/bin/node',
			'/usr/local/bin/node',
			'/opt/homebrew/bin/node', // Homebrew on Apple Silicon
			'/opt/homebrew/opt/node/bin/node',
			'C:\\Program Files\\nodejs\\node.exe', // Windows
			'C:\\Program Files (x86)\\nodejs\\node.exe'
		];

		// Add NVM paths if available
		if (process.env.HOME) {
			const nvmBasePath = `${process.env.HOME}/.nvm/versions/node`;
			if (fs.existsSync(nvmBasePath)) {
				try {
					const versions = fs.readdirSync(nvmBasePath);
					for (const version of versions) {
						possiblePaths.push(`${nvmBasePath}/${version}/bin/node`);
					}
				} catch (error) {
					console.log('Could not read NVM versions:', error);
				}
			}
		}

		// Test each path
		for (const nodePath of possiblePaths) {
			try {
				if (fs.existsSync(nodePath)) {
					return nodePath;
				}
			} catch (error) {
				// Continue to next path
			}
		}

		// Fallback to process.execPath
		return process.execPath;
	}

	/**
	 * Attempts to start the server using multiple approaches
	 */
	async tryStartServer(serverPath: string): Promise<ChildProcess> {
		const approaches = [
			// Approach 1: Direct Node.js execution
			async () => {
				const nodePath = await this.findNodePath();
				return spawn(nodePath, ['server.js'], {
					cwd: serverPath,
					env: { 
						...process.env, 
						PORT: this.settings.serverPort.toString(),
						NODE_ENV: 'production'
					},
					stdio: ['ignore', 'pipe', 'pipe']
				});
			},
			
			// Approach 2: npm start
			async () => {
				return spawn('npm', ['start'], {
					cwd: serverPath,
					env: { 
						...process.env, 
						PORT: this.settings.serverPort.toString(),
						NODE_ENV: 'production'
					},
					stdio: ['ignore', 'pipe', 'pipe']
				});
			}
		];

		for (let i = 0; i < approaches.length; i++) {
			try {
				const serverProcess = await approaches[i]();
				
				// Wait to see if process starts successfully
				await new Promise(resolve => setTimeout(resolve, 1000));
				
				if (serverProcess.exitCode === null && !serverProcess.killed) {
					return serverProcess;
				} else {
					serverProcess.kill();
				}
			} catch (error) {
				console.log(`Server startup approach ${i + 1} failed:`, error.message);
			}
		}

		throw new Error('All server startup approaches failed');
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
		this.stopServer();
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		
		// Ensure autoStartServer is set
		if (this.settings.autoStartServer === undefined) {
			this.settings.autoStartServer = true;
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/**
 * Terminal view that renders xterm.js and handles WebSocket communication
 */
class TerminalView extends ItemView {
	private terminal: Terminal;
	private socket: Socket | null = null;
	private settings: TerminalPluginSettings;
	private isConnected = false;

	constructor(leaf: WorkspaceLeaf, settings: TerminalPluginSettings) {
		super(leaf);
		this.settings = settings;
	}

	/**
	 * Gets the vault root directory path to set as the terminal's working directory.
	 * This ensures the terminal opens in the user's Obsidian vault folder,
	 * making it easy to run commands on vault files and scripts.
	 */
	private getVaultPath(): string {
		// Get vault path from the app's vault adapter
		const adapter = this.app.vault.adapter;
		if (adapter && (adapter as any).basePath) {
			return (adapter as any).basePath;
		}
		// Fallback to current working directory
		return process.cwd();
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
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		
		// Ensure container uses full available space
		container.style.position = 'relative';
		container.style.width = '100%';
		container.style.height = '100%';
		
		const terminalContainer = container.createDiv();
		terminalContainer.addClass('terminal-container');
		
		// Calculate initial terminal dimensions based on container size
		const containerRect = container.getBoundingClientRect();
		const fontSize = this.settings.fontSize;
		const charWidth = fontSize * 0.6; // Approximate character width
		const lineHeight = fontSize * 1.2; // Approximate line height
		
		const initialCols = Math.max(80, Math.floor(containerRect.width / charWidth));
		const initialRows = Math.max(24, Math.floor(containerRect.height / lineHeight));
		
		// Initialize xterm.js with dynamic sizing
		this.terminal = new Terminal({
			fontSize: this.settings.fontSize,
			fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
			theme: {
				background: '#1e1e1e',
				foreground: '#ffffff',
			},
			cursorBlink: true,
			convertEol: true,
			cols: initialCols,
			rows: initialRows,
		});

		this.terminal.open(terminalContainer);
		
		// Force initial resize after terminal is opened
		setTimeout(() => {
			this.resizeTerminal();
		}, 100);
		
		this.terminal.focus();
		
		// Handle focus and resize
		terminalContainer.addEventListener('click', () => this.terminal.focus());
		this.setupResizeHandler(terminalContainer);

		// Connect to backend server
		await this.initializeSocket();
	}

	/**
	 * Resizes the terminal to fit the available space
	 */
	private resizeTerminal() {
		if (!this.terminal) return;
		
		const container = this.containerEl.querySelector('.terminal-container') as HTMLElement;
		if (!container) return;
		
		const rect = container.getBoundingClientRect();
		const fontSize = this.settings.fontSize;
		const charWidth = fontSize * 0.6; // More accurate character width estimation
		const lineHeight = fontSize * 1.2; // More accurate line height estimation
		
		const cols = Math.max(10, Math.floor(rect.width / charWidth));
		const rows = Math.max(5, Math.floor(rect.height / lineHeight));
		
		if (cols !== this.terminal.cols || rows !== this.terminal.rows) {
			this.terminal.resize(cols, rows);
			
			// Notify server of resize if connected
			if (this.socket && this.isConnected) {
				this.socket.emit('terminal-resize', { cols, rows });
			}
		}
	}

	/**
	 * Sets up terminal resize handling
	 */
	private setupResizeHandler(container: HTMLElement) {
		// Debounce resize to avoid excessive calls
		let resizeTimeout: NodeJS.Timeout;
		
		const resizeObserver = new ResizeObserver(() => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				this.resizeTerminal();
			}, 100);
		});
		
		resizeObserver.observe(container);
		
		// Also listen to window resize for good measure
		const windowResizeHandler = () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				this.resizeTerminal();
			}, 100);
		};
		
		window.addEventListener('resize', windowResizeHandler);
		
		// Store cleanup function
		this.registerDomEvent(window, 'resize', windowResizeHandler);
	}

	/**
	 * Initializes WebSocket connection to backend server
	 */
	private async initializeSocket() {
		this.terminal.write('Connecting to terminal server...\r\n');

		try {
			this.socket = io(this.settings.serverUrl, {
				timeout: 10000,
				forceNew: true
			});

			// Connection events
			this.socket.on('connect', () => {
				this.isConnected = true;
				this.terminal.clear();
				this.terminal.write('Connected to terminal server. Starting shell...\r\n');
				
				this.socket!.emit('create-terminal', {
					shell: this.settings.shell,
					cols: this.terminal.cols,
					rows: this.terminal.rows,
					cwd: this.getVaultPath() // Set working directory to vault root
				});
			});

			// Terminal events
			this.socket.on('terminal-created', () => this.terminal.clear());
			this.socket.on('terminal-output', (data: string) => this.terminal.write(data));
			this.socket.on('terminal-exit', (data: any) => {
				this.terminal.write(`\r\n\r\nTerminal exited with code ${data.exitCode}\r\n`);
				this.isConnected = false;
			});

			// Error handling
			this.socket.on('terminal-error', (error: any) => {
				this.terminal.write(`\r\nError: ${error.error}\r\n`);
			});

			this.socket.on('disconnect', (reason: string) => {
				this.isConnected = false;
				this.terminal.write(`\r\n\r\nDisconnected from server: ${reason}\r\n`);
			});

			this.socket.on('connect_error', (error: Error) => {
				this.terminal.clear();
				this.terminal.write(`Failed to connect to terminal server at ${this.settings.serverUrl}\r\n`);
				this.terminal.write(`Error: ${error.message}\r\n\r\n`);
			});

			// Handle user input
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

/**
 * Settings tab for configuring the terminal plugin
 */
class TerminalSettingTab extends PluginSettingTab {
	plugin: TerminalPlugin;

	constructor(app: App, plugin: TerminalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Auto-start server setting
		new Setting(containerEl)
			.setName('Auto-Start Server')
			.setDesc('Automatically start the terminal server when opening a terminal')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoStartServer)
				.onChange(async (value) => {
					this.plugin.settings.autoStartServer = value;
					await this.plugin.saveSettings();
				}));

		// Node.js path configuration
		this.addNodePathSetting(containerEl);

		// Basic settings
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

		// Server management section
		this.addServerManagementSection(containerEl);
	}

	/**
	 * Adds Node.js path configuration with detect and test buttons
	 */
	private addNodePathSetting(containerEl: HTMLElement) {
		const nodePathSetting = new Setting(containerEl)
			.setName('Node.js Path')
			.setDesc('Path to Node.js executable. Use "auto" for automatic detection, or specify full path');

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

		// Detect button
		nodePathSetting.addButton(button => button
			.setButtonText('Detect')
			.setTooltip('Auto-detect Node.js path')
			.onClick(async () => {
				button.setButtonText('Detecting...');
				try {
					const originalPath = this.plugin.settings.nodePath;
					this.plugin.settings.nodePath = 'auto';
					const detectedPath = await this.plugin.findNodePath();
					
					this.plugin.settings.nodePath = detectedPath;
					await this.plugin.saveSettings();
					nodePathText?.setValue(detectedPath);
					
					new Notice(`Detected Node.js at: ${detectedPath}`);
					button.setButtonText('✓ Detected');
				} catch (error: any) {
					new Notice(`Failed to detect Node.js: ${error.message}`);
					button.setButtonText('✗ Failed');
				}
				setTimeout(() => button.setButtonText('Detect'), 3000);
			}));

		// Test button
		nodePathSetting.addButton(button => button
			.setButtonText('Test')
			.setTooltip('Test if the Node.js path works')
			.onClick(async () => {
				button.setButtonText('Testing...');
				try {
					const nodePath = await this.plugin.findNodePath();
					const { spawn } = require('child_process');
					const testProcess = spawn(nodePath, ['--version'], {
						stdio: ['ignore', 'pipe', 'pipe']
					});

					let output = '';
					testProcess.stdout?.on('data', (data: Buffer) => {
						output += data.toString();
					});

					testProcess.on('close', (code: number) => {
						if (code === 0 && output.trim().startsWith('v')) {
							new Notice(`✅ Node.js works! Version: ${output.trim()}`);
							button.setButtonText('✓ Works');
						} else {
							new Notice(`❌ Node.js path failed`);
							button.setButtonText('✗ Failed');
						}
						setTimeout(() => button.setButtonText('Test'), 3000);
					});

				} catch (error: any) {
					new Notice(`❌ Test failed: ${error.message}`);
					button.setButtonText('✗ Error');
					setTimeout(() => button.setButtonText('Test'), 3000);
				}
			}));
	}

	/**
	 * Adds server management controls
	 */
	private addServerManagementSection(containerEl: HTMLElement) {
		containerEl.createEl('h3', { text: 'Server Management' });

		const statusSetting = new Setting(containerEl)
			.setName('Server Status')
			.setDesc('Check and control the terminal server');

		statusSetting.addButton(button => button
			.setButtonText('Check Status')
			.onClick(async () => {
				button.setButtonText('Checking...');
				const isRunning = await this.plugin.checkServerHealth();
				
				if (isRunning) {
					button.setButtonText('✓ Online');
					new Notice('Server is running');
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
	}
}