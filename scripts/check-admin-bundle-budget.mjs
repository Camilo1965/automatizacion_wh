#!/usr/bin/env node
/**
 * Measurable admin bundle budget after Vite build.
 * Fails when individual JS chunks exceed the limits below.
 */
import fs from 'node:fs';
import path from 'node:path';

const distAssets = path.resolve('apps/admin/dist/assets');
const limits = {
  charts: 400_000,
  'settings-heavy': 360_000,
  entry: 250_000,
  default: 520_000,
};

if (!fs.existsSync(distAssets)) {
  console.error(`Missing ${distAssets}. Run admin build first.`);
  process.exit(1);
}

const files = fs
  .readdirSync(distAssets)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const size = fs.statSync(path.join(distAssets, name)).size;
    return { name, size };
  })
  .sort((a, b) => b.size - a.size);

const violations = [];
for (const file of files) {
  let limit = limits.default;
  if (file.name.includes('charts')) limit = limits.charts;
  else if (file.name.includes('settings-heavy'))
    limit = limits['settings-heavy'];
  else if (file.name.includes('index') || file.name.includes('entry'))
    limit = limits.entry;
  if (file.size > limit) {
    violations.push({ ...file, limit });
  }
}

console.log('Admin JS chunks (bytes):');
for (const file of files.slice(0, 12)) {
  console.log(`  ${file.size.toString().padStart(8)}  ${file.name}`);
}

if (violations.length > 0) {
  console.error('\nBundle budget exceeded:');
  for (const item of violations) {
    console.error(`  ${item.name}: ${item.size} > ${item.limit}`);
  }
  process.exit(1);
}

console.log('\nBundle budget OK.');
