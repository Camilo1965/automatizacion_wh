#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  filesystemScanPipeline,
  imageScanCommand,
  PRODUCTION_IMAGES,
  securityCommand,
} from './lib/local-security-gates.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run({ command, args }) {
  const executable =
    process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  const result = spawnSync(executable, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status ?? result.error?.message})`,
    );
  }
}

async function runPipeline({ producer, consumer }) {
  const source = spawn(producer.command, producer.args, {
    cwd: root,
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const destination = spawn(consumer.command, consumer.args, {
    cwd: root,
    env: process.env,
    shell: false,
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  source.stdout.pipe(destination.stdin);

  const waitForExit = (child, label) =>
    new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${label} failed (${code})`));
      });
    });

  await Promise.all([
    waitForExit(source, producer.command),
    waitForExit(destination, consumer.command),
  ]);
}

function scanImages() {
  run({
    command: 'docker',
    args: [
      'compose',
      '--env-file',
      '.env.prod.example',
      '-f',
      'compose.prod.yaml',
      'build',
      '--pull',
      'migrate',
      'worker',
      'admin',
      'backup',
    ],
  });
  for (const image of PRODUCTION_IMAGES) {
    console.log(`[security] Trivy image ${image}`);
    run(imageScanCommand(root, image));
  }
}

const mode = process.argv[2];
if (!['secrets', 'filesystem', 'images', 'all'].includes(mode)) {
  console.error(
    'Usage: node scripts/security-scan.mjs <secrets|filesystem|images|all>',
  );
  process.exit(2);
}

try {
  if (mode === 'secrets' || mode === 'all') {
    console.log('[security] Gitleaks full history');
    run(securityCommand('secrets', root));
  }
  if (mode === 'filesystem' || mode === 'all') {
    console.log('[security] Trivy filesystem');
    await runPipeline(filesystemScanPipeline());
  }
  if (mode === 'images' || mode === 'all') {
    scanImages();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
