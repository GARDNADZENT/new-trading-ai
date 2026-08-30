import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

const PYTHON_CMD = process.env.MT5_PYTHON_CMD || 'python';
const PY_SCRIPT = path.join(root, 'mt5-python-server', 'mt5_trade_server.py');

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

async function start() {
  console.log('========================================');
  console.log('   News Trader AI - Starting Stack       ');
  console.log('========================================');
  freePort8000();
  await new Promise((r) => setTimeout(r, 1000));

  console.log(`[Start] Launching MT5 Python bridge (${PYTHON_CMD} ${path.basename(PY_SCRIPT)})`);
  const python = spawn(PYTHON_CMD, [PY_SCRIPT], { cwd: root, env: process.env });
  pipe('PYTHON', python.stdout);
  pipe('PYTHON', python.stderr);
  python.on('error', (err) => console.warn(`[PYTHON] Failed to start (${err.message}). Is Python + MetaTrader5 installed / elevated? The Node app will continue and retry connecting.`));
  python.on('exit', (code, signal) => {
    if (code !== null && code !== 0) console.warn(`[PYTHON] Bridge exited (code ${code}${signal ? ', signal ' + signal : ''}). Another bridge may already hold port 8000.`);
  });

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
