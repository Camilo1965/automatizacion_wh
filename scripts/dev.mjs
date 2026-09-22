import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const children = [
  spawn('pnpm', ['--filter', '@camila/api', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  }),
  spawn('pnpm', ['--filter', '@camila/api', 'dev:worker'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  }),
  spawn('pnpm', ['--filter', '@camila/admin', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  }),
];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => {
  shutdown(0);
});
process.on('SIGTERM', () => {
  shutdown(0);
});

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      return;
    }
    shutdown(code ?? 1);
  });
}
