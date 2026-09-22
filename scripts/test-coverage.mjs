#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';

const testDatabaseUrl =
  'postgresql://camila_test:camila_test@127.0.0.1:5433/camila_test';
const env = {
  ...process.env,
  TEST_DATABASE_URL: testDatabaseUrl,
  DATABASE_URL: testDatabaseUrl,
};

function run(command, args, options = {}) {
  const executable =
    process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  const result = spawnSync(executable, args, {
    env,
    shell: false,
    stdio: 'inherit',
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status ?? result.error?.message})`,
    );
  }
}

let databaseStarted = false;
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
  databaseStarted = true;
  run('pnpm', ['--filter', '@camila/contracts', 'test:coverage']);
  run('pnpm', ['--filter', '@camila/api', 'test:coverage']);
  run('pnpm', ['--filter', '@camila/admin', 'test:coverage']);
  run(process.execPath, ['scripts/check-coverage-gates.mjs']);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (databaseStarted) {
    try {
      run('docker', ['compose', '--profile', 'test', 'stop', 'postgres-test']);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
