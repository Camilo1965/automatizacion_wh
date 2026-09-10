import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InventoryClosureService } from '../src/modules/inventory/inventory-closure-service.js';

describe('InventoryClosureService', () => {
  it('creates deterministic Treinta CSV once per business date', async () => {
    const save = vi.fn().mockResolvedValue({ id: 'closure' });
    const repository = {
      findByDate: vi.fn().mockResolvedValue(null),
      movementsForDate: vi
        .fn()
        .mockResolvedValue([{ code: '01', size: '37', delta: -1 }]),
      save,
    };
    const service = new InventoryClosureService(repository);
    await service.generate('2026-09-10');
    const csv = 'referencia,talla,ajuste\r\n01,37,-1\r\n';
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        csvContent: csv,
        checksum: createHash('sha256').update(csv).digest('hex'),
      }),
    );
  });
});
