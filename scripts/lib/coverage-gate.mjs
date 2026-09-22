function normalize(filePath) {
  return filePath.replace(/\\/g, '/');
}

function metricPct(metric) {
  return typeof metric?.pct === 'number' ? metric.pct : 100;
}

export function findSummaryEntry(summaries, repoRelative) {
  const needle = normalize(repoRelative);
  for (const [file, metrics] of Object.entries(summaries)) {
    if (file === 'total') continue;
    const normalized = normalize(file);
    if (
      normalized === needle ||
      normalized.endsWith(`/${needle}`) ||
      normalized.replace(/^[A-Za-z]:/, '').endsWith(`/${needle}`)
    ) {
      return { file, metrics };
    }
  }
  return null;
}

export function evaluateFileCoverage({
  criticalFiles,
  modifiedFiles,
  summaries,
}) {
  const failures = [];
  const critical = new Set(criticalFiles.map(normalize));

  function evaluate(kind, file, threshold) {
    const entry = findSummaryEntry(summaries, file);
    if (entry === null) {
      failures.push(`${kind} ${file}: missing from coverage report`);
      return;
    }
    const lines = metricPct(entry.metrics.lines);
    const branches = metricPct(entry.metrics.branches);
    if (lines < threshold || branches < threshold) {
      failures.push(
        `${kind} ${file}: lines ${lines.toFixed(2)}% / branches ${branches.toFixed(2)}% (need ≥${threshold}/${threshold})`,
      );
    }
  }

  for (const file of criticalFiles) evaluate('critical', file, 90);
  for (const file of modifiedFiles) {
    if (!critical.has(normalize(file))) evaluate('modified', file, 80);
  }

  return failures;
}
