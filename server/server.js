const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');
const path = require('path');
const os = require('os');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Store active terminal sessions
const terminals = new Map();

// Default shell configuration
const getDefaultShell = () => {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  } else if (process.platform === 'darwin') {
    return '/bin/zsh';
  } else {
    return '/bin/bash';
  }
};

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    terminals: terminals.size,
    platform: process.platform 
  });
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('create-terminal', (options = {}) => {
    console.log(`Creating terminal for client ${socket.id}`);
    
    try {
      const shell = options.shell || getDefaultShell();
      const cwd = options.cwd || os.homedir();
      
      // Spawn PTY process
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

      // Store the terminal session
      terminals.set(socket.id, ptyProcess);

      // Handle PTY output
      ptyProcess.onData((data) => {
        socket.emit('terminal-output', data);
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`Terminal ${socket.id} exited with code ${exitCode}, signal ${signal}`);
        socket.emit('terminal-exit', { exitCode, signal });
        terminals.delete(socket.id);
      });

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

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Clean up terminal session
    const terminal = terminals.get(socket.id);
    if (terminal) {
      try {
        terminal.kill();
      } catch (error) {
        console.error(`Error killing terminal ${socket.id}:`, error);
      }
      terminals.delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Obsidian XTerm Server running on port ${PORT}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Default shell: ${getDefaultShell()}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  
  // Kill all active terminals
  for (const [socketId, terminal] of terminals) {
    try {
      terminal.kill();
    } catch (error) {
      console.error(`Error killing terminal ${socketId}:`, error);
    }
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});