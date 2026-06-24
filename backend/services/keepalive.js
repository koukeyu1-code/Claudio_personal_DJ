// Backend supervisor: restarts server.js if it crashes.
// Usage: node --env-file=.env services/keepalive.js
import { spawn } from 'node:child_process';
import { writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = join(__dirname, '..', 'data', 'backend-crash.log');
const serverJs = join(__dirname, '..', 'server.js');   // server.js is in backend root, one level up

let child = null;
let crashCount = 0;

function start() {
  child = spawn(process.execPath, ['--env-file=.env', serverJs], {
    cwd: join(__dirname, '..'),
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: false,
  });

  child.on('exit', (code, signal) => {
    const ts = new Date().toISOString();
    // Was it killed intentionally (Ctrl+C / taskkill)? Exit codes from signals like SIGTERM/SIGKILL
    if (signal === 'SIGTERM' || signal === 'SIGKILL' || signal === 'SIGINT') {
      appendFileSync(logFile, `[${ts}] server exited via ${signal} — intentional shutdown, not restarting.\n`);
      process.exit(0);
    }
    // Crashed unexpectedly — restart
    crashCount++;
    appendFileSync(logFile, `[${ts}] server exited (code=${code} signal=${signal}), crash #${crashCount}. Restarting in 2s...\n`);
    setTimeout(start, 2000);
  });
}

// Graceful shutdown — don't restart when we're told to stop
process.on('SIGINT', () => { if (child) child.kill('SIGTERM'); process.exit(0); });
process.on('SIGTERM', () => { if (child) child.kill('SIGTERM'); process.exit(0); });

start();
