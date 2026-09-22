/**
 * Lightweight Prometheus exposition (no prom-client dependency).
 * Labels are bounded enums only — never phones, names, order IDs, or free text.
 */

export const CORRELATION_HEADER = 'x-correlation-id';

export const HTTP_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

const METHOD_LABELS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'OTHER',
]);

export const ROUTE_GROUPS = [
  'health',
  'metrics',
  'whatsapp',
  'admin_auth',
  'admin_catalog',
  'admin_orders',
  'admin_shipping',
  'admin_conversations',
  'admin_inventory',
  'admin_integrations',
  'admin_other',
  'other',
] as const;

export type RouteGroup = (typeof ROUTE_GROUPS)[number];

export type GuideOutcome =
  | 'created'
  | 'uncertain'
  | 'failed'
  | 'skipped';

export type WhatsAppSendOutcome = 'sent' | 'failed';

export type JobQueue = 'whatsapp_outbound' | 'shipping_guide' | 'owner_alert';

export type JobOutcome = 'attempt' | 'failure';

export type ProviderName = 'whatsapp' | 'shipping' | 'backup' | 'other';

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function formatLabels(labels: Readonly<Record<string, string>>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(',')}}`;
}

function boundMethod(method: string): string {
  const upper = method.toUpperCase();
  return METHOD_LABELS.has(upper) ? upper : 'OTHER';
}

export function classifyRoute(urlPath: string): RouteGroup {
  const path = urlPath.split('?')[0] ?? urlPath;
  if (path.startsWith('/health')) return 'health';
  if (path.startsWith('/metrics')) return 'metrics';
  if (path.startsWith('/webhooks/whatsapp') || path.startsWith('/whatsapp'))
    return 'whatsapp';
  if (!path.startsWith('/api/admin')) return 'other';
  if (path.startsWith('/api/admin/auth')) return 'admin_auth';
  if (path.startsWith('/api/admin/catalog')) return 'admin_catalog';
  if (path.startsWith('/api/admin/orders')) return 'admin_orders';
  if (path.startsWith('/api/admin/shipping')) return 'admin_shipping';
  if (path.startsWith('/api/admin/conversations'))
    return 'admin_conversations';
  if (path.startsWith('/api/admin/inventory')) return 'admin_inventory';
  if (path.startsWith('/api/admin/integrations')) return 'admin_integrations';
  return 'admin_other';
}

export function normalizeCorrelationId(
  value: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 64) return undefined;
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

type CounterKey = string;

export class MetricsRegistry {
  private readonly counters = new Map<CounterKey, number>();
  private readonly gauges = new Map<CounterKey, number>();
  private readonly histograms = new Map<
    CounterKey,
    { counts: number[]; overflow: number; sum: number }
  >();
  private readonly histogramBuckets: readonly number[];

  constructor(options?: { histogramBuckets?: readonly number[] }) {
    this.histogramBuckets =
      options?.histogramBuckets ?? HTTP_DURATION_BUCKETS_SECONDS;
  }

  private counterKey(
    name: string,
    labels: Readonly<Record<string, string>>,
  ): CounterKey {
    return `${name}\0${JSON.stringify(labels)}`;
  }

  private incCounter(
    name: string,
    labels: Readonly<Record<string, string>>,
    delta = 1,
  ): void {
    const key = this.counterKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + delta);
  }

  private setGauge(
    name: string,
    labels: Readonly<Record<string, string>>,
    value: number,
  ): void {
    this.gauges.set(this.counterKey(name, labels), value);
  }

  private observeHistogram(
    name: string,
    labels: Readonly<Record<string, string>>,
    value: number,
  ): void {
    const key = this.counterKey(name, labels);
    let series = this.histograms.get(key);
    if (series === undefined) {
      series = {
        counts: this.histogramBuckets.map(() => 0),
        overflow: 0,
        sum: 0,
      };
      this.histograms.set(key, series);
    }
    let placed = false;
    for (let i = 0; i < this.histogramBuckets.length; i += 1) {
      if (value <= (this.histogramBuckets[i] as number)) {
        series.counts[i] = (series.counts[i] ?? 0) + 1;
        placed = true;
        break;
      }
    }
    if (!placed) {
      series.overflow += 1;
    }
    series.sum += value;
  }

  recordHttpRequest(input: {
    method: string;
    routeGroup: RouteGroup;
    statusCode: number;
    durationSeconds: number;
  }): void {
    const method = boundMethod(input.method);
    const statusClass = `${Math.floor(input.statusCode / 100)}xx`;
    const labels = {
      method,
      route_group: input.routeGroup,
      status_class: statusClass,
    };
    this.incCounter('kairo_http_requests_total', labels);
    this.observeHistogram(
      'kairo_http_request_duration_seconds',
      labels,
      input.durationSeconds,
    );
    if (input.statusCode >= 500) {
      this.incCounter('kairo_http_errors_total', {
        method,
        route_group: input.routeGroup,
      });
    }
  }

  setDbReady(ready: boolean): void {
    this.setGauge('kairo_db_ready', {}, ready ? 1 : 0);
  }

  setWorkerHeartbeat(unixSeconds: number): void {
    this.setGauge('kairo_worker_heartbeat_unixtime', {}, unixSeconds);
  }

  setWorkerHeartbeatAgeSeconds(ageSeconds: number): void {
    this.setGauge('kairo_worker_heartbeat_age_seconds', {}, ageSeconds);
  }

  setQueueDepth(queue: JobQueue, depth: number): void {
    this.setGauge('kairo_queue_depth', { queue }, depth);
  }

  setQueueAgeSeconds(queue: JobQueue, ageSeconds: number): void {
    this.setGauge('kairo_queue_oldest_age_seconds', { queue }, ageSeconds);
  }

  recordJob(input: {
    queue: JobQueue;
    outcome: JobOutcome;
  }): void {
    this.incCounter('kairo_job_events_total', {
      queue: input.queue,
      outcome: input.outcome,
    });
  }

  recordWhatsAppSend(outcome: WhatsAppSendOutcome): void {
    this.incCounter('kairo_whatsapp_send_total', { outcome });
  }

  recordGuideOutcome(outcome: GuideOutcome): void {
    this.incCounter('kairo_guide_outcomes_total', { outcome });
  }

  recordInventoryConflict(reason: 'insufficient_stock' | 'other'): void {
    this.incCounter('kairo_inventory_conflicts_total', { reason });
  }

  recordProviderFailure(provider: ProviderName): void {
    this.incCounter('kairo_provider_failures_total', { provider });
  }

  setLastBackupUnixtime(unixSeconds: number | null): void {
    this.setGauge(
      'kairo_last_backup_unixtime',
      {},
      unixSeconds === null ? 0 : unixSeconds,
    );
  }

  setLastBackupAgeSeconds(ageSeconds: number | null): void {
    this.setGauge(
      'kairo_last_backup_age_seconds',
      {},
      ageSeconds === null ? Number.POSITIVE_INFINITY : ageSeconds,
    );
  }

  setLastBackupOk(ok: boolean): void {
    this.setGauge('kairo_last_backup_ok', {}, ok ? 1 : 0);
  }

  setLastRestoreDrillOk(ok: boolean | null): void {
    this.setGauge(
      'kairo_last_restore_drill_ok',
      {},
      ok === null ? -1 : ok ? 1 : 0,
    );
  }

  recordSchedulerSuccess(ok: boolean): void {
    this.incCounter('kairo_scheduler_runs_total', {
      result: ok ? 'success' : 'failure',
    });
    if (ok) {
      this.setGauge(
        'kairo_scheduler_last_success_unixtime',
        {},
        Date.now() / 1000,
      );
    }
  }

  setSchedulerLastSuccessUnixtime(unixSeconds: number): void {
    this.setGauge('kairo_scheduler_last_success_unixtime', {}, unixSeconds);
  }

  /** Synthetic counters for staging alert-rule drills (no PII). */
  recordSyntheticFailure(kind: string): void {
    const bounded =
      kind === 'provider' ||
      kind === 'queue' ||
      kind === 'guide_uncertain' ||
      kind === 'backup' ||
      kind === 'api'
        ? kind
        : 'other';
    this.incCounter('kairo_synthetic_failures_total', { kind: bounded });
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    const emittedHelp = new Set<string>();

    const ensureHelp = (name: string, type: string, help: string): void => {
      if (emittedHelp.has(name)) return;
      emittedHelp.add(name);
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
    };

    for (const [key, value] of this.counters) {
      const [name, labelsJson] = key.split('\0') as [string, string];
      const labels = JSON.parse(labelsJson) as Record<string, string>;
      ensureHelp(name, 'counter', name);
      lines.push(`${name}${formatLabels(labels)} ${value}`);
    }

    for (const [key, value] of this.gauges) {
      const [name, labelsJson] = key.split('\0') as [string, string];
      const labels = JSON.parse(labelsJson) as Record<string, string>;
      ensureHelp(name, 'gauge', name);
      const rendered = Number.isFinite(value) ? String(value) : '+Inf';
      lines.push(`${name}${formatLabels(labels)} ${rendered}`);
    }

    for (const [key, series] of this.histograms) {
      const [name, labelsJson] = key.split('\0') as [string, string];
      const labels = JSON.parse(labelsJson) as Record<string, string>;
      ensureHelp(name, 'histogram', name);
      let cumulative = 0;
      for (let i = 0; i < this.histogramBuckets.length; i += 1) {
        cumulative += series.counts[i] ?? 0;
        const bucketLabels = {
          ...labels,
          le: String(this.histogramBuckets[i]),
        };
        lines.push(`${name}_bucket${formatLabels(bucketLabels)} ${cumulative}`);
      }
      const total = cumulative + series.overflow;
      lines.push(
        `${name}_bucket${formatLabels({ ...labels, le: '+Inf' })} ${total}`,
      );
      lines.push(`${name}_sum${formatLabels(labels)} ${series.sum}`);
      lines.push(`${name}_count${formatLabels(labels)} ${total}`);
    }

    lines.push('');
    return lines.join('\n');
  }
}

export type MetricsSink = MetricsRegistry;

export type QueueSnapshot = Readonly<{
  queue: JobQueue;
  depth: number;
  oldestAgeSeconds: number;
}>;

/**
 * SQL-free snapshot applicator so unit tests stay DB-free.
 * Runtime supplies values from Postgres queries.
 */
export function applyQueueSnapshots(
  metrics: MetricsRegistry,
  snapshots: readonly QueueSnapshot[],
): void {
  for (const snapshot of snapshots) {
    metrics.setQueueDepth(snapshot.queue, snapshot.depth);
    metrics.setQueueAgeSeconds(snapshot.queue, snapshot.oldestAgeSeconds);
  }
}

export type BackupMetricsSnapshot = Readonly<{
  lastSuccessfulBackupAt: string | null;
  lastBackupAgeSeconds: number | null;
  lastRestoreDrillOk: boolean | null;
  lastBackupOk?: boolean;
}>;

export function applyBackupSnapshot(
  metrics: MetricsRegistry,
  snapshot: BackupMetricsSnapshot,
  nowMs = Date.now(),
): void {
  if (snapshot.lastSuccessfulBackupAt === null) {
    metrics.setLastBackupUnixtime(null);
    metrics.setLastBackupAgeSeconds(null);
    metrics.setLastBackupOk(false);
  } else {
    const parsed = Date.parse(snapshot.lastSuccessfulBackupAt);
    metrics.setLastBackupUnixtime(Number.isNaN(parsed) ? null : parsed / 1000);
    metrics.setLastBackupAgeSeconds(
      snapshot.lastBackupAgeSeconds ??
        (Number.isNaN(parsed)
          ? null
          : Math.max(0, (nowMs - parsed) / 1000)),
    );
    metrics.setLastBackupOk(snapshot.lastBackupOk ?? true);
  }
  metrics.setLastRestoreDrillOk(snapshot.lastRestoreDrillOk);
}
