function normalize(filePath) {
  return filePath.replace(/\\/g, '/');
}

// The 80/80 floor targets changed business-decision modules. Persistence,
// provider clients, workers, CLI entrypoints and storage adapters are separate
// integration surfaces, not silently waived business rules.
export function isPureDomainModule(filePath) {
  const normalized = normalize(filePath);
  return (
    /^apps\/api\/src\/modules\/[^/]+\/[^/]+\.(ts|tsx)$/i.test(normalized) &&
    /(?:service|state|validation|policy|capabilities|authorize|totp|password|crypto|selection|event|scheduler|token|errors)\.(ts|tsx)$/i.test(
      normalized,
    )
  );
}

function metricPct(metric) {
  return typeof metric?.pct === 'number' ? metric.pct : null;
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
    if (lines === null || branches === null) {
      failures.push(
        `${kind} ${file}: missing lines or branches coverage metric`,
      );
      return;
    }
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
