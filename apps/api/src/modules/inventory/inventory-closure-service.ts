import { createHash } from 'node:crypto';

export type ClosureMovement = Readonly<{
  code: string;
  size: string;
  delta: number;
}>;
export type ClosureRepository = Readonly<{
  findByDate(date: string): Promise<unknown | null>;
  movementsForDate(date: string): Promise<readonly ClosureMovement[]>;
  save(
    input: Readonly<{
      businessDate: string;
      profile: 'adjustments';
      movementCount: number;
      totalUnits: number;
      checksum: string;
      csvContent: string;
    }>,
  ): Promise<unknown>;
  list?(): Promise<readonly unknown[]>;
  findById?(id: string): Promise<unknown | null>;
  acknowledge?(id: string): Promise<unknown>;
  reopen?(id: string, reason: string): Promise<unknown>;
}>;

export class InventoryClosureService {
  constructor(private readonly repository: ClosureRepository) {}
  async generate(businessDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate))
      throw new Error('invalid_business_date');
    const existing = await this.repository.findByDate(businessDate);
    if (existing !== null) return existing;
    const movements = await this.repository.movementsForDate(businessDate);
    const rows = movements.map(
      (movement) => `${movement.code},${movement.size},${movement.delta}`,
    );
    const csvContent = ['referencia,talla,ajuste', ...rows, ''].join('\r\n');
    return this.repository.save({
      businessDate,
      profile: 'adjustments',
      movementCount: movements.length,
      totalUnits: movements.reduce(
        (total, movement) => total + movement.delta,
        0,
      ),
      checksum: createHash('sha256').update(csvContent).digest('hex'),
      csvContent,
    });
  }
  list() {
    return this.repository.list?.() ?? Promise.resolve([]);
  }
  findById(id: string) {
    return this.repository.findById?.(id) ?? Promise.resolve(null);
  }
  acknowledge(id: string) {
    if (!this.repository.acknowledge)
      throw new Error('closure_acknowledge_unavailable');
    return this.repository.acknowledge(id);
  }
  reopen(id: string, reason: string) {
    const normalized = reason.trim();
    if (!normalized) return Promise.reject(new Error('reopen_reason_required'));
    if (!this.repository.reopen) throw new Error('closure_reopen_unavailable');
    return this.repository.reopen(id, normalized);
  }
}
