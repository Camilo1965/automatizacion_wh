import { describe, expect, it, vi } from 'vitest';
import { AlertService } from '../src/modules/alerts/alert-service.js';

describe('AlertService', () => {
  it('delegates creation with a stable deduplication key', async () => {
    const open = vi.fn().mockResolvedValue({ id: 'alert-1' });
    const service = new AlertService({
      open,
      list: vi.fn(),
      markRead: vi.fn(),
      resolve: vi.fn(),
    });
    await service.open({
      type: 'guide_failed',
      severity: 'critical',
      title: 'Guía fallida',
      detail: 'Revisar',
      entityUrl: '/orders/1',
      entityId: '1',
      retrySafe: false,
    });
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ deduplicationKey: 'guide_failed:1' }),
    );
  });
});
