#!/usr/bin/env node
/**
 * Enforce coverage floors from Vitest json-summary reports.
 *
 * Design §10.2:
 * - Critical rules (orders, inventory, messages, guides): ≥90% lines/branches.
 * - Modified non-critical domain modules: ≥80% lines/branches.
 * Does not exclude difficult production rule code merely to raise %.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Critical business rules (design §10.2) — basename match. */
const CRITICAL_BASENAMES = new Set([
  'order-state.ts',
  'order-validation.ts',
  'daily-closure-scheduler.ts',
  'conversation-state.ts',
  'outbound-message-state.ts',
  'whatsapp-event.ts',
  'guide-job-state.ts',
  'shipping-selection.ts',
  'shipping-policy.ts',
]);

/** Non-critical domain module pattern for the 80% modified gate. */
const DOMAIN_MODULE = /[/\\]modules[/\\][^/\\]+[/\\][^/\\]+\.(ts|tsx)$/i;
const DOMAIN_KIND =
  /(service|state|validation|policy|capabilities|authorize|totp|password|crypto|selection|event|scheduler)\.(ts|tsx)$/i;

const CRITICAL = { lines: 90, branches: 90 };
const MODIFIED = { lines: 80, branches: 80 };

const reports = [
  {
    label: '@camila/api',
    summary: path.join(root, 'apps/api/coverage/coverage-summary.json'),
    enforceCritical: true,
  },
  {
    label: '@camila/admin',
    summary: path.join(root, 'apps/admin/coverage/coverage-summary.json'),
    enforceCritical: false,
  },
  {
    label: '@camila/contracts',
    summary: path.join(
      root,
      'packages/contracts/coverage/coverage-summary.json',
    ),
    enforceCritical: false,
  },
];

function pct(metric) {
  if (!metric || typeof metric.pct !== 'number') return 100;
  return metric.pct;
}

function basename(filePath) {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

function isCritical(filePath) {
  return CRITICAL_BASENAMES.has(basename(filePath));
}

function isDomainModule(filePath) {
  return DOMAIN_MODULE.test(filePath) && DOMAIN_KIND.test(filePath);
}

function normalizeRepoPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

const exceptionsPath = path.join(root, 'docs/release/coverage-exceptions.json');

function loadExceptions() {
  if (!existsSync(exceptionsPath)) return [];
  const raw = JSON.parse(readFileSync(exceptionsPath, 'utf8'));
  return Array.isArray(raw.exceptions) ? raw.exceptions : [];
}

function findException(filePath) {
  const needle = normalizeRepoPath(filePath);
  return loadExceptions().find(
    (item) =>
      typeof item.path === 'string' &&
      (needle.endsWith(normalizeRepoPath(item.path)) ||
        normalizeRepoPath(item.path) === needle),
  );
}

function listModifiedSourceFiles() {
  const baseEnv = process.env.COVERAGE_DIFF_BASE;
  const candidates = baseEnv ? [baseEnv] : ['origin/main', 'main'];

  let base = null;
  for (const candidate of candidates) {
    const probe = spawnSync('git', ['rev-parse', '--verify', candidate], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    });
    if (probe.status === 0) {
      base = candidate;
      break;
    }
  }

  if (base === null) {
    console.warn(
      'No git base for modified-file coverage; skipping 80% modified gate.',
    );
    return [];
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
    console.warn('git diff failed; skipping modified-file coverage gate.');
    return [];
  }

  return diff.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (file) =>
        isDomainModule(file) &&
        !isCritical(file) &&
        !/\.test\.(ts|tsx)$/.test(file),
    );
}

function findSummaryEntry(data, repoRelative) {
  const needle = normalizeRepoPath(repoRelative);
  for (const key of Object.keys(data)) {
    if (key === 'total') continue;
    const normalized = normalizeRepoPath(key);
    if (
      normalized.endsWith(needle) ||
      normalized.includes(`/${needle}`) ||
      normalized.replace(/^[A-Za-z]:/, '').endsWith(needle)
    ) {
      return { key, metrics: data[key] };
    }
  }
  return null;
}

const failures = [];
const modified = listModifiedSourceFiles();
console.log(
  `Modified non-critical domain modules for 80% gate: ${modified.length}`,
);

for (const report of reports) {
  if (!existsSync(report.summary)) {
    failures.push(
      `${report.label}: missing ${report.summary} (run test:coverage first)`,
    );
    continue;
  }

  const data = JSON.parse(readFileSync(report.summary, 'utf8'));
  const total = data.total;
  if (!total) {
    failures.push(`${report.label}: coverage-summary missing total`);
    continue;
  }

  console.log(
    `${report.label} total: lines ${pct(total.lines).toFixed(2)}% branches ${pct(total.branches).toFixed(2)}%`,
  );

  if (report.enforceCritical) {
    const criticalFiles = Object.entries(data).filter(
      ([file]) => file !== 'total' && isCritical(file),
    );

    if (criticalFiles.length === 0) {
      failures.push(
        `${report.label}: no critical-rule files in coverage report`,
      );
    } else {
      let critLinesHit = 0;
      let critLinesTotal = 0;
      let critBranchesHit = 0;
      let critBranchesTotal = 0;

      for (const [file, metrics] of criticalFiles) {
        const linesPct = pct(metrics.lines);
        const branchesPct = pct(metrics.branches);
        console.log(
          `  critical ${basename(file)}: lines ${linesPct.toFixed(1)}% branches ${branchesPct.toFixed(1)}%`,
        );
        critLinesHit += metrics.lines?.covered ?? 0;
        critLinesTotal += metrics.lines?.total ?? 0;
        critBranchesHit += metrics.branches?.covered ?? 0;
        critBranchesTotal += metrics.branches?.total ?? 0;
      }

      const critLinesPct =
        critLinesTotal === 0 ? 100 : (100 * critLinesHit) / critLinesTotal;
      const critBranchesPct =
        critBranchesTotal === 0
          ? 100
          : (100 * critBranchesHit) / critBranchesTotal;

      console.log(
        `${report.label} critical rules aggregate (${criticalFiles.length} files): lines ${critLinesPct.toFixed(2)}% branches ${critBranchesPct.toFixed(2)}%`,
      );

      if (critLinesPct < CRITICAL.lines) {
        failures.push(
          `${report.label} critical: lines ${critLinesPct.toFixed(2)}% < ${CRITICAL.lines}%`,
        );
      }
      if (critBranchesPct < CRITICAL.branches) {
        failures.push(
          `${report.label} critical: branches ${critBranchesPct.toFixed(2)}% < ${CRITICAL.branches}%`,
        );
      }
    }
  }

  for (const file of modified) {
    const entry = findSummaryEntry(data, file);
    if (!entry) continue;

    const lines = pct(entry.metrics.lines);
    const branches = pct(entry.metrics.branches);
    if (lines < MODIFIED.lines || branches < MODIFIED.branches) {
      const exception = findException(file);
      if (exception) {
        console.warn(
          `  exception (until ${exception.until}): ${file} lines ${lines.toFixed(2)}% branches ${branches.toFixed(2)}% — ${exception.reason}`,
        );
        if (new Date(exception.until) < new Date()) {
          failures.push(
            `expired exception ${file}: until ${exception.until} — ${exception.reason}`,
          );
        }
        continue;
      }
      failures.push(
        `modified ${file}: lines ${lines.toFixed(2)}% / branches ${branches.toFixed(2)}% (need ≥${MODIFIED.lines}/${MODIFIED.branches})`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('\nCoverage gate failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('\nCoverage gates OK.');
