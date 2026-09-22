#!/usr/bin/env node
/** Enforce KAIRO coverage floors against combined Vitest reports. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateFileCoverage,
  findSummaryEntry,
  isPureDomainModule,
} from './lib/coverage-gate.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const CRITICAL_FILES = Object.freeze([
  'apps/api/src/modules/orders/order-state.ts',
  'apps/api/src/modules/orders/order-validation.ts',
  'apps/api/src/modules/inventory/daily-closure-scheduler.ts',
  'apps/api/src/modules/conversations/conversation-state.ts',
  'apps/api/src/modules/whatsapp/outbound-message-state.ts',
  'apps/api/src/modules/whatsapp/whatsapp-event.ts',
  'apps/api/src/modules/shipping/guide-job-state.ts',
  'apps/api/src/modules/shipping/shipping-selection.ts',
  'apps/api/src/modules/shipping/shipping-policy.ts',
]);

const reports = [
  {
    label: '@camila/api',
    summary: path.join(root, 'apps/api/coverage/coverage-summary.json'),
  },
  {
    label: '@camila/admin',
    summary: path.join(root, 'apps/admin/coverage/coverage-summary.json'),
  },
  {
    label: '@camila/contracts',
    summary: path.join(
      root,
      'packages/contracts/coverage/coverage-summary.json',
    ),
  },
];

function pct(metric) {
  return typeof metric?.pct === 'number' ? metric.pct : null;
}

function basename(filePath) {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

function isCritical(filePath) {
  return CRITICAL_FILES.includes(filePath.replace(/\\/g, '/'));
}

function listModifiedSourceFiles() {
  const baseEnv = process.env.COVERAGE_DIFF_BASE;
  const candidates = baseEnv ? [baseEnv] : ['origin/main', 'main'];
  const base = candidates.find((candidate) => {
    const probe = spawnSync('git', ['rev-parse', '--verify', candidate], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    });
    return probe.status === 0;
  });

  if (base === undefined) {
    throw new Error(
      'No git base for modified-file coverage; set COVERAGE_DIFF_BASE.',
    );
  }

  const mergeBase = spawnSync('git', ['merge-base', base, 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  const from = mergeBase.status === 0 ? mergeBase.stdout.trim() : base;
  const diff = spawnSync('git', ['diff', '--name-only', `${from}...HEAD`], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  if (diff.status !== 0) {
    throw new Error(`git diff failed: ${diff.stderr || diff.stdout}`);
  }

  return diff.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (file) =>
        isPureDomainModule(file) &&
        !isCritical(file) &&
        !/\.test\.(ts|tsx)$/.test(file),
    );
}

const failures = [];
const summaries = {};

for (const report of reports) {
  if (!existsSync(report.summary)) {
    failures.push(
      `${report.label}: missing ${report.summary} (run test:coverage first)`,
    );
    continue;
  }
  const data = JSON.parse(readFileSync(report.summary, 'utf8'));
  if (!data.total) {
    failures.push(`${report.label}: coverage-summary missing total`);
    continue;
  }
  const totalLines = pct(data.total.lines);
  const totalBranches = pct(data.total.branches);
  if (totalLines === null || totalBranches === null) {
    failures.push(
      `${report.label}: coverage-summary missing total lines/branches`,
    );
    continue;
  }
  console.log(
    `${report.label} total: lines ${totalLines.toFixed(2)}% branches ${totalBranches.toFixed(2)}%`,
  );
  Object.assign(summaries, data);
}

const modifiedFiles = listModifiedSourceFiles();
console.log(
  `Modified non-critical domain modules for 80% gate: ${modifiedFiles.length}`,
);

for (const file of CRITICAL_FILES) {
  const entry = findSummaryEntry(summaries, file);
  if (entry !== null) {
    const lines = pct(entry.metrics.lines);
    const branches = pct(entry.metrics.branches);
    console.log(
      `  critical ${basename(file)}: lines ${lines?.toFixed(2) ?? 'missing'}% branches ${branches?.toFixed(2) ?? 'missing'}%`,
    );
  }
}
for (const file of modifiedFiles) {
  const entry = findSummaryEntry(summaries, file);
  if (entry !== null) {
    const lines = pct(entry.metrics.lines);
    const branches = pct(entry.metrics.branches);
    console.log(
      `  modified ${file}: lines ${lines?.toFixed(2) ?? 'missing'}% branches ${branches?.toFixed(2) ?? 'missing'}%`,
    );
  }
}

failures.push(
  ...evaluateFileCoverage({
    criticalFiles: CRITICAL_FILES,
    modifiedFiles,
    summaries,
  }),
);

if (failures.length > 0) {
  console.error('\nCoverage gate failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nCoverage gates OK.');
