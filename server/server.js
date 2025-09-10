/**
 * Obsidian XTerm Terminal Server
 * 
 * Node.js backend server providing real shell access for the Obsidian XTerm plugin.
 * Uses socket.io for WebSocket communication and node-pty for proper PTY support.
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');
const os = require('os');

const app = express();
const server = createServer(app);

// Configure socket.io with CORS support
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Store active terminal sessions (socketId -> ptyProcess)
const terminals = new Map();

/**
 * Gets the default shell for the current platform
 * @returns {string} Shell executable path
 */
const getDefaultShell = () => {
  switch (process.platform) {
    case 'win32':
      return 'powershell.exe';
    case 'darwin':
      return '/bin/zsh';
    default:
      return '/bin/bash';
  }
};

// Enable CORS for HTTP endpoints
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

/**
 * Health check endpoint for server monitoring
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    terminals: terminals.size,
    platform: process.platform,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

/**
 * Handle WebSocket connections from Obsidian clients
 */
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  /**
   * Create a new terminal session for the client
   */
  socket.on('create-terminal', (options = {}) => {
    console.log(`Creating terminal for client ${socket.id}`);
    
    try {
      const shell = options.shell || getDefaultShell();
      const cwd = options.cwd || os.homedir();
      
      console.log(`Creating terminal with shell: ${shell}, cwd: ${cwd}`);
      
      // Create PTY process with proper environment
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd: cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        }
      });

      // Store terminal session
      terminals.set(socket.id, ptyProcess);

      // Forward PTY output to client
      ptyProcess.onData((data) => {
        socket.emit('terminal-output', data);
      });

      // Handle terminal process exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`Terminal ${socket.id} exited with code ${exitCode}, signal ${signal}`);
        socket.emit('terminal-exit', { exitCode, signal });
        terminals.delete(socket.id);
      });

      // Confirm terminal creation
      socket.emit('terminal-created', {
        id: socket.id,
        shell: shell,
        cwd: cwd,
        cols: ptyProcess.cols,
        rows: ptyProcess.rows
      });

      console.log(`Terminal created for ${socket.id} with shell: ${shell}`);

    } catch (error) {
      console.error(`Error creating terminal for ${socket.id}:`, error);
      socket.emit('terminal-error', {
        error: error.message,
        code: 'TERMINAL_CREATE_FAILED'
      });
    }
  });

  /**
   * Handle input from the client terminal
   */
  socket.on('terminal-input', (data) => {
    const terminal = terminals.get(socket.id);
    if (terminal) {
      terminal.write(data);
    } else {
      socket.emit('terminal-error', {
        error: 'No terminal session found',
        code: 'NO_TERMINAL'
      });
    }
  });

  /**
   * Handle terminal resize events
   */
  socket.on('terminal-resize', ({ cols, rows }) => {
    const terminal = terminals.get(socket.id);
    if (terminal) {
      try {
        terminal.resize(cols, rows);
        console.log(`Terminal ${socket.id} resized to ${cols}x${rows}`);
      } catch (error) {
        console.error(`Error resizing terminal ${socket.id}:`, error);
      }
    }
  });

  /**
   * Handle client disconnection
   */
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    const terminal = terminals.get(socket.id);
    if (terminal) {
      try {
        terminal.kill();
        terminals.delete(socket.id);
        console.log(`Cleaned up terminal session for ${socket.id}`);
      } catch (error) {
        console.error(`Error killing terminal ${socket.id}:`, error);
      }
    }
  });
});

/**
 * Start the server
 */
server.listen(PORT, () => {
  console.log(`Obsidian XTerm Server running on port ${PORT}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Default shell: ${getDefaultShell()}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

/**
 * Graceful shutdown handling
 */
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  
  // Terminate all active terminals
  for (const [socketId, terminal] of terminals) {
    try {
      console.log(`Terminating terminal session: ${socketId}`);
      terminal.kill();
    } catch (error) {
      console.error(`Error killing terminal ${socketId}:`, error);
    }
  }
  
  terminals.clear();
  
  server.close(() => {
    console.log('Server closed successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.emit('SIGTERM');
});