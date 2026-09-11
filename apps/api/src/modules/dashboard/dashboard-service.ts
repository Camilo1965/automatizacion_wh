import type { DashboardSummary } from '@camila/contracts';

export type DashboardCounts = Omit<DashboardSummary, 'generatedAt'>;

export interface DashboardRepository {
  getSummary(dayStart: Date, dayEnd: Date): Promise<DashboardCounts>;
}

const BOGOTA_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;

function bogotaDayBounds(now: Date): readonly [Date, Date] {
  const local = new Date(now.getTime() + BOGOTA_UTC_OFFSET_MS);
  const localMidnightUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const start = new Date(localMidnightUtc - BOGOTA_UTC_OFFSET_MS);
  return [start, new Date(start.getTime() + 24 * 60 * 60 * 1000)];
}

export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getSummary(
    range: 'today' | '7d' | '30d' = 'today',
  ): Promise<DashboardSummary> {
    const now = this.clock();
    const [dayStart, dayEnd] = bogotaDayBounds(now);
    const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
    const counts = await this.repository.getSummary(
      new Date(dayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000),
      dayEnd,
    );
    return { ...counts, generatedAt: now.toISOString() };
  }
}
