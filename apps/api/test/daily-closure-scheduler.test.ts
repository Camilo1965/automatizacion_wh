import { describe, expect, it, vi } from 'vitest';
import { DailyClosureScheduler } from '../src/modules/inventory/daily-closure-scheduler.js';

describe('DailyClosureScheduler', () => {
  it('generates the Bogotá closure once after 19:00', async () => {
    const generate = vi.fn();
    const scheduler = new DailyClosureScheduler({ generate });
    await scheduler.tick(new Date('2026-09-11T00:05:00.000Z'));
    await scheduler.tick(new Date('2026-09-11T00:10:00.000Z'));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith('2026-09-10');
  });
});
