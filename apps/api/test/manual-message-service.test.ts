import { describe, expect, it, vi } from 'vitest';

import { ManualMessageService } from '../src/modules/conversations/manual-message-service.js';

describe('ManualMessageService', () => {
  it('queues an owner reply inside the 24-hour service window', async () => {
    const enqueueText = vi.fn().mockResolvedValue({ id: 'outbound-1' });
    const service = new ManualMessageService(
      {
        getManualContext: vi.fn().mockResolvedValue({
          customerPhone: '+573001234567',
          controlMode: 'human',
          lastInboundMessageAt: new Date('2026-09-10T12:00:00Z'),
        }),
      },
      { enqueueText },
      () => new Date('2026-09-10T13:00:00Z'),
    );

    await expect(
      service.send({
        conversationId: '11111111-1111-4111-8111-111111111111',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        clientRequestId: 'request-1',
        text: 'Hola, te atiendo personalmente.',
      }),
    ).resolves.toEqual({ id: 'outbound-1', status: 'queued' });
    expect(enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'owner_panel',
        idempotencyKey: 'owner:request-1',
      }),
    );
  });

  it('requires human control and an approved template outside the window', async () => {
    const enqueueText = vi.fn();
    const context = {
      customerPhone: '+573001234567',
      controlMode: 'human' as const,
      lastInboundMessageAt: new Date('2026-09-08T12:00:00Z'),
    };
    const service = new ManualMessageService(
      { getManualContext: vi.fn().mockResolvedValue(context) },
      { enqueueText },
      () => new Date('2026-09-10T13:00:00Z'),
    );

    await expect(
      service.send({
        conversationId: '11111111-1111-4111-8111-111111111111',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        clientRequestId: 'request-2',
        text: '¿Sigues interesada?',
      }),
    ).rejects.toMatchObject({ code: 'template_required' });
    expect(enqueueText).not.toHaveBeenCalled();
  });
});
