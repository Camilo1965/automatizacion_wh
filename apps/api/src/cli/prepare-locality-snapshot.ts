import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse99EnviosLocalitySource } from '../modules/localities/99envios-locality-source.js';
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output)
  throw new Error('Usage: prepare-locality-snapshot input.txt output.csv');
const source = await readFile(input, 'utf8');
const parsed = parse99EnviosLocalitySource(source);
if (!parsed.rows.length) throw new Error('No valid Colombian destinations');
const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
const csv =
  [
    'carrier_code,department,locality,country',
    ...parsed.rows.map(
      (row) =>
        `${row.daneCode},${escape(row.department)},${escape(row.locality)},CO`,
    ),
  ].join('\n') + '\n';
await writeFile(output, csv);
await writeFile(
  `${output}.metadata.json`,
  JSON.stringify(
    {
      sourceUrl:
        'https://docs.google.com/document/u/0/d/1RQxkGWIiQsoHtBUP8SDhINw3f_IHMRMT_NM2r6JkTxo/mobilebasic',
      preparedAt: new Date().toISOString(),
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      csvSha256: createHash('sha256').update(csv).digest('hex'),
      validRows: parsed.rows.length,
      excludedRows: parsed.issues.length,
      issues: parsed.issues,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    validRows: parsed.rows.length,
    excludedRows: parsed.issues.length,
  }),
);
