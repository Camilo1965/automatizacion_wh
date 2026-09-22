#!/usr/bin/env node
/**
 * Disposable staging smoke:
 * 1. Write a uniquely named, ignored staging env file with random secrets
 * 2. Build + boot compose.prod + compose.staging
 * 3. Wait for health
 * 4. Bootstrap admin, login, hit major routes
 * 5. Prove application S3 put/get/delete
 * 6. Prove encrypted backup upload, verification, and isolated restore
 * 7. Confirm service topology and separate api/worker processes
 * 8. Clean shutdown
 *
 * Usage: pnpm production:smoke
 * Partial runs (no Docker / resource limits): docs/release/_task8-smoke-partial.md
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import {
  assertBackupHeartbeat,
  parseBackupId,
  projectScopedComposeFiles,
  renderStagingEnv,
  smokeImageTags,
  smokeProjectName,
} from './lib/production-smoke-helpers.mjs';

// Staging uses Caddy `tls internal`; accept the local CA for this process only.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const smokeProject = smokeProjectName();
const envFileName = `.env.staging.${smokeProject}`;
const envPath = join(root, envFileName);
process.env.SMOKE_ENV_FILE = envFileName;
const evidenceDir = join(root, 'docs', 'release');
const evidencePartial = join(evidenceDir, '_task8-smoke-partial.md');

const composeFiles = projectScopedComposeFiles(smokeProject);

const baseUrl = process.env.SMOKE_BASE_URL ?? 'https://localhost:18443';

function log(message) {
  console.log(`[production-smoke] ${message}`);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    ...options,
  });
}

function requireOk(result, label) {
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (exit ${result.status}): ${result.stderr || result.stdout || ''}`,
    );
  }
}

function randomSecret(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

function writeStagingEnv() {
  const secrets = {
    integrationEncryptionKey: randomBytes(32).toString('base64'),
    backupEncryptionKey: randomBytes(32).toString('base64'),
    postgresPassword: `stg_${randomSecret(18)}`,
    mediaAccessKey: `stgmedia_${randomSecret(12)}`,
    mediaSecretKey: `stgmedia_${randomSecret(24)}`,
    backupAccessKey: `stgbackup_${randomSecret(12)}`,
    backupSecretKey: `stgbackup_${randomSecret(24)}`,
    rootAccessKey: `stgroot_${randomSecret(12)}`,
    rootSecretKey: `stgroot_${randomSecret(24)}`,
    adminPassword: `Adm_${randomSecret(16)}_9x`,
    adminUsername: 'smoke-owner',
  };

  writeFileSync(envPath, renderStagingEnv(secrets, smokeProject), 'utf8');
  return {
    adminUsername: secrets.adminUsername,
    adminPassword: secrets.adminPassword,
  };
}

async function waitForHealth(timeoutMs = 180_000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const live = await fetch(`${baseUrl}/health/live`);
      const ready = await fetch(`${baseUrl}/health/ready`);
      const admin = await fetch(`${baseUrl}/`);
      if (live.ok && ready.ok && admin.ok) {
        log('health endpoints ready');
        return;
      }
      lastError = `live=${live.status} ready=${ready.status} admin=${admin.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(3_000);
  }
  const caddyLogs = run('docker', [
    'compose',
    ...composeFiles,
    '--env-file',
    envFileName,
    'logs',
    'caddy',
    '--tail',
    '40',
  ]);
  throw new Error(
    `Timed out waiting for health: ${lastError}\n${caddyLogs.stdout || ''}\n${caddyLogs.stderr || ''}`,
  );
}

async function checkRoutes(cookie) {
  const routes = ['/', '/login', '/orders', '/catalog'];
  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`, {
      headers: cookie ? { cookie } : {},
    });
    if (!response.ok && response.status !== 304) {
      throw new Error(`Route ${route} returned ${response.status}`);
    }
    log(`route ok ${route} (${response.status})`);
  }
}

function confirmSeparateProcesses() {
  const apiId = composeRun(['ps', '-q', 'api']);
  const workerId = composeRun(['ps', '-q', 'worker']);
  requireOk(apiId, 'api container lookup');
  requireOk(workerId, 'worker container lookup');
  const apiContainer = (apiId.stdout || '').trim();
  const workerContainer = (workerId.stdout || '').trim();
  if (!apiContainer || !workerContainer || apiContainer === workerContainer) {
    throw new Error('API and worker containers are missing or identical');
  }
  const apiInspect = run('docker', [
    'inspect',
    '--format',
    '{{json .Config.Cmd}}',
    apiContainer,
  ]);
  const workerInspect = run('docker', [
    'inspect',
    '--format',
    '{{json .Config.Cmd}}',
    workerContainer,
  ]);
  requireOk(apiInspect, 'api process probe');
  requireOk(workerInspect, 'worker process probe');
  const apiCmd = (apiInspect.stdout || '').trim();
  const workerCmd = (workerInspect.stdout || '').trim();
  if (!apiCmd.includes('server.js')) {
    throw new Error(`API Cmd unexpected: ${apiCmd}`);
  }
  if (!workerCmd.includes('worker.js')) {
    throw new Error(`Worker Cmd unexpected: ${workerCmd}`);
  }
  if (apiCmd === workerCmd) {
    throw new Error('API and worker appear to share the same command');
  }
  log(`separate processes confirmed api=${apiCmd} worker=${workerCmd}`);
}

function composeRun(args) {
  return run('docker', [
    'compose',
    ...composeFiles,
    '--env-file',
    envFileName,
    ...args,
  ]);
}

function removeDisposableImages() {
  const result = run('docker', [
    'image',
    'rm',
    ...smokeImageTags(smokeProject),
  ]);
  requireOk(result, 'smoke image cleanup');
}

function parseLastJson(output, label) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Commands can emit progress before their final machine-readable result.
    }
  }
  throw new Error(`${label} did not emit a JSON result`);
}

function parseComposeRows(output) {
  const trimmed = output.trim();
  if (trimmed === '') return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

async function waitForComposeServices(timeoutMs = 180_000) {
  const running = [
    'postgres',
    'api',
    'worker',
    'admin',
    'caddy',
    'backup',
    'metrics',
    'alertmanager',
    'minio',
  ];
  const completed = ['migrate', 'minio-init'];
  const started = Date.now();
  let lastError = 'service status unavailable';
  while (Date.now() - started < timeoutMs) {
    const result = composeRun(['ps', '--all', '--format', 'json']);
    if (result.status === 0) {
      try {
        const rows = parseComposeRows(result.stdout || '');
        const byService = new Map(rows.map((row) => [row.Service, row]));
        for (const service of running) {
          const row = byService.get(service);
          if (row?.State !== 'running') {
            throw new Error(`${service} state is ${row?.State ?? 'missing'}`);
          }
          if (row.Health && row.Health !== 'healthy') {
            throw new Error(`${service} health is ${row.Health}`);
          }
        }
        for (const service of completed) {
          const row = byService.get(service);
          if (row?.State !== 'exited' || Number(row.ExitCode) !== 0) {
            throw new Error(
              `${service} did not complete successfully (${row?.State ?? 'missing'}/${row?.ExitCode ?? 'n/a'})`,
            );
          }
        }
        log('all mandatory compose services are healthy or completed');
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    } else {
      lastError = result.stderr || result.stdout || 'compose ps failed';
    }
    await delay(3_000);
  }
  throw new Error(`Timed out waiting for compose services: ${lastError}`);
}

function proveStorageAndBackup() {
  const storage = composeRun([
    'run',
    '--rm',
    '-T',
    'api',
    'node',
    'dist/cli/storage-smoke.js',
  ]);
  requireOk(storage, 'storage S3 smoke');
  const storageResult = parseLastJson(storage.stdout || '', 'storage S3 smoke');
  if (storageResult.ok !== true || storageResult.storageDriver !== 's3') {
    throw new Error('storage S3 smoke returned an invalid result');
  }
  log('storage-s3 ok');

  const backup = composeRun([
    'run',
    '--rm',
    '-T',
    '-e',
    'BACKUP_LOOP=0',
    'backup',
    'node',
    '/app/scripts/backup-postgres.mjs',
  ]);
  requireOk(backup, 'encrypted backup upload');
  const backupId = parseBackupId(
    `${backup.stdout || ''}\n${backup.stderr || ''}`,
  );
  log(`backup-upload ok (${backupId})`);

  const verify = composeRun([
    'run',
    '--rm',
    '-T',
    '-e',
    `BACKUP_ID=${backupId}`,
    'backup',
    'node',
    '/app/scripts/verify-backup.mjs',
  ]);
  requireOk(verify, 'backup verification');
  if (parseLastJson(verify.stdout || '', 'backup verification').ok !== true) {
    throw new Error('backup verification returned an invalid result');
  }
  log('backup-verify ok');

  const restore = composeRun([
    'run',
    '--rm',
    '-T',
    '-e',
    `BACKUP_ID=${backupId}`,
    'backup',
    'node',
    '/app/scripts/restore-postgres-drill.mjs',
  ]);
  requireOk(restore, 'restore drill');
  const restoreResult = parseLastJson(restore.stdout || '', 'restore drill');
  if (
    restoreResult.ok !== true ||
    restoreResult.backupId !== backupId ||
    restoreResult.cleaned !== true
  ) {
    throw new Error('restore drill did not validate and clean its database');
  }
  log('restore-drill ok');

  const heartbeat = composeRun([
    'exec',
    '-T',
    'backup',
    'node',
    '-e',
    "process.stdout.write(require('node:fs').readFileSync('/backups/heartbeat.json','utf8'))",
  ]);
  requireOk(heartbeat, 'backup heartbeat read');
  const heartbeatMetrics = JSON.parse(heartbeat.stdout || '{}');
  assertBackupHeartbeat(heartbeatMetrics);
  if (heartbeatMetrics.lastBackupId !== backupId) {
    throw new Error('Backup heartbeat does not reference the smoke backup');
  }
  log('backup-heartbeat ok');
}

function writePartialEvidence(passed, detail) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    evidencePartial,
    `# Task 8 production-smoke partial evidence

- Timestamp: ${new Date().toISOString()}
- Passed steps: ${passed.join(', ') || '(none)'}
- Detail:
\`\`\`
${detail}
\`\`\`

Docker resource limits or missing engine may prevent a full boot on this host.
`,
    'utf8',
  );
}

async function main() {
  const passed = [];
  let secrets;
  try {
    const docker = run('docker', [
      'version',
      '--format',
      '{{.Server.Version}}',
    ]);
    if (docker.status !== 0) {
      throw new Error('Docker engine not available');
    }
    passed.push('docker-available');

    secrets = writeStagingEnv();
    passed.push('env-written');
    log(`wrote disposable ${envFileName}`);

    const config = run('docker', [
      'compose',
      ...composeFiles,
      '--env-file',
      envFileName,
      'config',
      '--quiet',
    ]);
    requireOk(config, 'compose config');
    passed.push('compose-config');

    log(`building disposable images for ${smokeProject}`);
    const build = run(
      'docker',
      [
        'compose',
        ...composeFiles,
        '--env-file',
        envFileName,
        'build',
        'migrate',
        'worker',
        'admin',
        'backup',
      ],
      { stdio: 'inherit' },
    );
    if (build.status !== 0) {
      throw new Error(`compose build failed with exit ${build.status}`);
    }
    passed.push('compose-build');

    log('starting staging stack');
    const up = run(
      'docker',
      [
        'compose',
        ...composeFiles,
        '--env-file',
        envFileName,
        'up',
        '-d',
        '--remove-orphans',
        '--pull',
        'missing',
      ],
      { stdio: 'inherit' },
    );
    if (up.status !== 0) {
      throw new Error(`compose up failed with exit ${up.status}`);
    }
    passed.push('compose-up');

    await waitForHealth();
    passed.push('health');

    const bootstrap = run('docker', [
      'compose',
      ...composeFiles,
      '--env-file',
      envFileName,
      'run',
      '--rm',
      '-T',
      '-e',
      `ADMIN_BOOTSTRAP_USERNAME=${secrets.adminUsername}`,
      '-e',
      `ADMIN_BOOTSTRAP_PASSWORD=${secrets.adminPassword}`,
      'api',
      'node',
      'dist/cli/admin-create-bootstrap.js',
    ]);
    requireOk(bootstrap, 'admin bootstrap');
    passed.push('admin-bootstrap');

    const loginResponse = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://localhost:18443',
      },
      body: JSON.stringify({
        username: secrets.adminUsername,
        password: secrets.adminPassword,
      }),
    });
    if (!loginResponse.ok) {
      const text = await loginResponse.text();
      throw new Error(`login failed ${loginResponse.status}: ${text}`);
    }
    const setCookie = loginResponse.headers.getSetCookie?.() ?? [];
    const cookieHeader =
      setCookie.map((part) => part.split(';')[0]).join('; ') ||
      loginResponse.headers.get('set-cookie')?.split(';')[0] ||
      '';
    if (!cookieHeader) {
      throw new Error('login succeeded but no session cookie returned');
    }
    passed.push('login');
    log('login ok');

    await checkRoutes(cookieHeader);
    passed.push('routes');

    const session = await fetch(`${baseUrl}/api/admin/auth/session`, {
      headers: {
        cookie: cookieHeader,
        origin: 'https://localhost:18443',
      },
    });
    if (!session.ok) {
      throw new Error(`/api/admin/auth/session returned ${session.status}`);
    }
    passed.push('auth-session');

    proveStorageAndBackup();
    passed.push(
      'storage-s3',
      'backup-upload',
      'backup-verify',
      'restore-drill',
      'backup-heartbeat',
    );

    await waitForComposeServices();
    passed.push('compose-services');

    confirmSeparateProcesses();
    passed.push('separate-processes');

    log('shutting down staging stack');
    const down = run(
      'docker',
      [
        'compose',
        ...composeFiles,
        '--env-file',
        envFileName,
        'down',
        '-v',
        '--remove-orphans',
      ],
      { stdio: 'inherit' },
    );
    requireOk(down, 'compose down');
    passed.push('shutdown');
    removeDisposableImages();
    passed.push('image-cleanup');

    if (existsSync(envPath)) {
      rmSync(envPath);
    }
    if (existsSync(evidencePartial)) {
      rmSync(evidencePartial);
    }

    log(`PASS — steps: ${passed.join(' → ')}`);
  } catch (error) {
    const detail =
      error instanceof Error ? error.stack || error.message : String(error);
    writePartialEvidence(passed, detail);
    console.error(`[production-smoke] FAIL after: ${passed.join(' → ')}`);
    console.error(detail);
    run(
      'docker',
      [
        'compose',
        ...composeFiles,
        '--env-file',
        envFileName,
        'down',
        '-v',
        '--remove-orphans',
      ],
      { stdio: 'inherit' },
    );
    const imageCleanup = run('docker', [
      'image',
      'rm',
      ...smokeImageTags(smokeProject),
    ]);
    if (imageCleanup.status !== 0) {
      log(
        `image cleanup incomplete: ${imageCleanup.stderr || imageCleanup.stdout}`,
      );
    }
    if (existsSync(envPath)) {
      rmSync(envPath);
    }
    process.exitCode = 1;
  }
}

await main();
