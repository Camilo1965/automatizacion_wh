import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadGuidePdf } from './orders-api';

describe('downloadGuidePdf', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses a readable printable filename and keeps the object URL alive through the click', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(new Blob(['pdf']), { status: 200 })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:guide');
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('guia-PED-000123-preenvio-PRE-123456.pdf');
        expect(this.href).toBe('blob:guide');
        expect(this.isConnected).toBe(true);
      });

    await downloadGuidePdf(
      '22222222-2222-4222-8222-222222222222',
      'PED-000123',
      'PRE-123456',
    );

    expect(click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith('blob:guide');
  });
});
