#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { RELEASE_STEPS, runReleaseSteps } from './lib/release-steps.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function execute(step) {
  console.log(`[verify:release] ${step.name}`);
  const onWindows = process.platform === 'win32' && step.command === 'pnpm';
  const result = spawnSync(
    onWindows ? 'cmd.exe' : step.command,
    onWindows ? ['/d', '/s', '/c', 'pnpm.cmd', ...step.args] : step.args,
    { cwd: root, stdio: 'inherit', env: process.env, shell: false },
  );
  if (result.error) {
    console.error(`[verify:release] ${step.name}: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    console.error(`[verify:release] ${step.name} failed (${result.status})`);
  }
  return result.status ?? 1;
}

process.exitCode = runReleaseSteps(RELEASE_STEPS, execute);
if (process.exitCode === 0) {
  console.log('[verify:release] all local gates passed');
}
