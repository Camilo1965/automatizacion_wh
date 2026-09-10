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

  it('acknowledges a generated closure and requires a reason to reopen it', async () => {
    const acknowledge = vi.fn().mockResolvedValue({ status: 'acknowledged' });
    const reopen = vi
      .fn()
      .mockResolvedValue({ status: 'reopened', version: 2 });
    const repository = {
      findByDate: vi.fn(),
      movementsForDate: vi.fn(),
      save: vi.fn(),
      list: vi.fn(),
      findById: vi.fn(),
      acknowledge,
      reopen,
    };
    const service = new InventoryClosureService(repository);
    await service.acknowledge('11111111-1111-4111-8111-111111111111');
    await expect(
      service.reopen('11111111-1111-4111-8111-111111111111', ' '),
    ).rejects.toThrow('reopen_reason_required');
    await service.reopen(
      '11111111-1111-4111-8111-111111111111',
      'Corrección en Treinta',
    );
    expect(acknowledge).toHaveBeenCalledOnce();
    expect(reopen).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Corrección en Treinta',
    );
  });
});
