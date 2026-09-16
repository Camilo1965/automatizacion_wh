import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: false,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed (${result.status ?? result.error?.message})`,
    );
}
function pnpm(args) {
  const env = {
    ...process.env,
    TEST_DATABASE_URL:
      'postgresql://camila_test:camila_test@127.0.0.1:5433/camila_test',
  };
  if (process.platform === 'win32')
    run('cmd.exe', ['/d', '/s', '/c', 'pnpm.cmd', ...args], env);
  else run('pnpm', args, env);
}
let started = false;
try {
  run('docker', [
    'compose',
    '--profile',
    'test',
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    '90',
    'postgres-test',
  ]);
  started = true;
  pnpm(['verify']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (started && !process.argv.includes('--keep-database')) {
    try {
      run('docker', ['compose', '--profile', 'test', 'stop', 'postgres-test']);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
