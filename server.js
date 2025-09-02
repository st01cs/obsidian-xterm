const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3321;
const terminals = {};

// Get default shell based on platform
function getDefaultShell() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    // Windows: Try PowerShell first, then cmd
    return process.env.COMSPEC || 'cmd.exe';
  } else if (platform === 'darwin') {
    // macOS: Use default shell or zsh (default in modern macOS)
    return process.env.SHELL || '/bin/zsh';
  } else {
    // Linux/Unix: Use default shell or bash
    return process.env.SHELL || '/bin/bash';
  }
}

const shell = getDefaultShell();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create', (cols, rows) => {
    console.log(`Creating terminal for ${socket.id} with cols:${cols} rows:${rows}`);
    console.log(`Using shell: ${shell}`);
    
    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 30,
      cwd: process.env.HOME,
      env: process.env
    });

    terminals[socket.id] = term;

    term.onData((data) => {
      socket.emit('data', data);
    });

    term.onExit(() => {
      socket.emit('exit');
      delete terminals[socket.id];
    });

    socket.emit('created', term.pid);
  });

  socket.on('data', (data) => {
    const term = terminals[socket.id];
    if (term) {
      term.write(data);
    }
  });

  socket.on('resize', (cols, rows) => {
    const term = terminals[socket.id];
    if (term) {
      try {
        term.resize(cols, rows);
      } catch (err) {
        console.error('Error resizing terminal:', err);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const term = terminals[socket.id];
    if (term) {
      term.kill();
      delete terminals[socket.id];
    }
  });
});

// Bind to localhost only for security
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Terminal server running on http://localhost:${PORT}`);
});

// Graceful shutdown handlers
function cleanup() {
  console.log('Shutting down server...');
  Object.keys(terminals).forEach(id => {
    try {
      terminals[id].kill();
    } catch (e) {
      console.error(`Error killing terminal ${id}:`, e);
    }
  });
  server.close(() => {
    process.exit(0);
  });
}

// Handle various shutdown signals
process.on('SIGINT', cleanup);  // Ctrl+C
process.on('SIGTERM', cleanup); // Termination signal

// Windows doesn't have SIGHUP
if (process.platform !== 'win32') {
  process.on('SIGHUP', cleanup);  // Terminal closed
}

// Windows-specific cleanup
if (process.platform === 'win32') {
  process.on('SIGBREAK', cleanup);
}
process.on('exit', () => {
  // Final cleanup on exit
  Object.keys(terminals).forEach(id => {
    try {
      terminals[id].kill();
    } catch (e) {
      // Silent fail on exit
    }
  });
});