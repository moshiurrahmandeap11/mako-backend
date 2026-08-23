const net = require('net');
const { spawn } = require('child_process');
const { Client } = require('ssh2');

const SSH_CONFIG = {
  host: '103.71.47.73',
  port: 22,
  username: 'moshimoshi',
  password: '#moshiurrahaT5',
  readyTimeout: 30000,
  keepaliveInterval: 10000,
};

const LOCAL_PORT = 5432;
const REMOTE_HOST = '127.0.0.1';
const REMOTE_PORT = 5432;

function startTunnel() {
  const sshClient = new Client();

  sshClient.on('ready', () => {
    console.log('✅ SSH Connection to VPS established successfully!');

    const server = net.createServer((socket) => {
      socket.on('error', (err) => {
        // Suppress benign client disconnect resets
      });

      sshClient.forwardOut(
        '127.0.0.1',
        socket.remotePort || 0,
        REMOTE_HOST,
        REMOTE_PORT,
        (err, stream) => {
          if (err) {
            socket.end();
            return;
          }
          stream.on('error', () => {});
          socket.pipe(stream).pipe(socket);
        }
      );
    });

    server.listen(LOCAL_PORT, '127.0.0.1', () => {
      console.log(`🚀 Secure Database Tunnel Active: 127.0.0.1:${LOCAL_PORT} -> VPS 127.0.0.1:${REMOTE_PORT}`);
      console.log('⚡ Starting Backend Dev Server...\n');

      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'npm.cmd' : 'npm';
      const devProcess = spawn(cmd, ['run', 'dev'], {
        stdio: 'inherit',
        shell: true,
      });

      devProcess.on('close', (code) => {
        server.close();
        sshClient.end();
        process.exit(code || 0);
      });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${LOCAL_PORT} already in use. Starting dev server directly...`);
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'npm.cmd' : 'npm';
        spawn(cmd, ['run', 'dev'], { stdio: 'inherit', shell: true });
      } else {
        console.error('❌ Server error:', err);
      }
    });
  });

  sshClient.on('error', (err) => {
    console.error('❌ SSH Connection Failed:', err.message);
  });

  sshClient.connect(SSH_CONFIG);
}

startTunnel();
