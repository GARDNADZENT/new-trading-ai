import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function isWSL() {
  if (process.platform !== 'linux') return false;
  try {
    const release = fs.readFileSync('/proc/sys/kernel/osrelease', 'utf8').toLowerCase();
    if (release.includes('microsoft') || release.includes('wsl')) return true;
  } catch {}
  try {
    if (fs.existsSync('/mnt/c/Windows')) return true;
  } catch {}
  return false;
}

function resolvePythonCommand() {
  if (process.env.MT5_PYTHON_CMD) return process.env.MT5_PYTHON_CMD;
  if (process.platform === 'win32') return 'python';
  if (isWSL()) {
    const candidates = [
      'cmd.exe',
      path.join('/mnt/c/', 'Users/gadna/AppData/Local/Programs/Python/Python314/python.exe'),
      path.join('/mnt/c/', 'Users/gadna/AppData/Local/Programs/Python/Python313/python.exe'),
      path.join('/mnt/c/', 'Users/gadna/AppData/Local/Programs/Python/Python312/python.exe'),
      'python',
    ];
    for (const cmd of candidates) {
      if (cmd === 'cmd.exe') return cmd;
      try {
        if (fs.existsSync(cmd)) return cmd;
      } catch {}
    }
    return 'python';
  }
  return 'python';
}

const PYTHON_CMD = resolvePythonCommand();
const PY_SCRIPT = path.join(root, 'mt5-python-server', 'mt5_trade_server.py');
const USE_CMD_SHELL = isWSL() && PYTHON_CMD === 'cmd.exe';

function pipe(prefix, stream) {
  if (!stream) return;
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    for (const line of text.split('\n')) {
      if (line.length) process.stdout.write(`[${prefix}] ${line}\n`);
    }
  });
}

function freePort8000() {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync('netstat -ano -p TCP', { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      if (line.includes(':8000') && line.includes('LISTENING')) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && pid !== String(process.pid)) {
          try {
            execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
            console.log(`[Start] Freed port 8000 (stopped existing bridge PID ${pid})`);
          } catch {
            console.warn(`[Start] Could not stop existing bridge (PID ${pid}). If it is an old build, run an elevated shell or stop it manually.`);
          }
        }
      }
    }
  } catch {}
}

async function waitForPort(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const url = USE_CMD_SHELL ? `http://localhost:${port}/health` : `http://127.0.0.1:${port}/health`;
      const resp = await fetch(url).then(r => r.text()).catch(() => null);
      if (resp && resp.includes('connected')) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function start() {
  console.log('========================================');
  console.log('   News Trader AI - Starting Stack       ');
  console.log('========================================');
  console.log(`[Start] Platform: ${process.platform} | WSL: ${isWSL() ? 'yes' : 'no'}`);
  freePort8000();
  await new Promise((r) => setTimeout(r, 1000));

  const pythonArgs = USE_CMD_SHELL ? ['/c', 'python', PY_SCRIPT] : [PY_SCRIPT];
  console.log(`[Start] Launching MT5 Python bridge (${PYTHON_CMD} ${pythonArgs.join(' ')} ${path.basename(PY_SCRIPT)})`);

  const python = spawn(PYTHON_CMD, pythonArgs, { cwd: root, env: process.env, shell: USE_CMD_SHELL });
  pipe('PYTHON', python.stdout);
  pipe('PYTHON', python.stderr);

  python.on('error', (err) => console.warn(`[PYTHON] Failed to start (${err.message}). Ensure Python + MetaTrader5 are installed and you are running as Administrator on Windows. The Node app will continue and retry connecting.`));
  python.on('exit', (code, signal) => {
    if (code !== null && code !== 0) console.warn(`[PYTHON] Bridge exited (code ${code}${signal ? ', signal ' + signal : ''}). Another bridge may already hold port 8000.`);
  });

  console.log('[Start] Waiting for Python bridge to become ready...');
  const ready = await waitForPort(8000, 15000);
  if (ready) {
    console.log('[Start] Python bridge is ready.');
  } else {
    console.warn('[Start] Python bridge did not become ready in time. Node.js will continue and retry connections.');
  }

  console.log('[Start] Launching Node trading bot (index.js)');
  const node = spawn(process.execPath, ['index.js'], { cwd: root, env: process.env });
  pipe('NODE', node.stdout);
  pipe('NODE', node.stderr);
  node.on('error', (err) => { console.error(`[NODE] Failed to start: ${err.message}`); process.exit(1); });
  node.on('exit', (code, signal) => {
    console.log(`[NODE] exited (code ${code}${signal ? ', signal ' + signal : ''})`);
    try { python.kill(); } catch {}
    process.exit(code ?? 0);
  });

  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[Start] Shutting down all processes...');
    try { node.kill(); } catch {}
    try { python.kill(); } catch {}
    setTimeout(() => process.exit(0), 1500).unref();
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
