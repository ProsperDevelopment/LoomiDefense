// ============================================================
// Dev launcher: starts the game server (API + lobby) and Vite
// together, with prefixed output and a shared shutdown.
//
//   npm run dev        -> backend :4000 + vite :3000
//   npm run dev:client -> vite only (backend must run separately)
// ============================================================
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => join(root, 'node_modules', '.bin', name);

const children = [];
let shuttingDown = false;

function run(name, cmd, args) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const prefix = `[${name}] `;
  const forward = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
    stream.on('end', () => {
      if (buffer) out.write(prefix + buffer + '\n');
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`${prefix}exited (${signal ?? code})`);
    shutdown(typeof code === 'number' && code !== 0 ? code : 0);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
    }
  }
  // Give children a moment to exit, then force
  setTimeout(() => {
    for (const child of children) {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }
    process.exit(code);
  }, 800).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting game server (:4000) and Vite dev server (:3000)…\n');
// --watch: reload the backend on code changes (validators/routes go
// live immediately instead of needing a manual restart)
run('server', bin('tsx'), ['watch', 'server/index.ts']);
run('vite', bin('vite'), process.argv.slice(2));
