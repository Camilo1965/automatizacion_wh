import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src',
);

describe('HTTP and worker entrypoints', () => {
  it('keeps HTTP server free of worker timers', () => {
    const server = readFileSync(path.join(srcRoot, 'server.ts'), 'utf8');
    expect(server).not.toContain('setInterval');
    expect(server).not.toContain('OutboxWorker');
    expect(server).not.toContain('ShippingGuideWorker');
    expect(server).toContain('buildApp');
    expect(server).toContain('createRuntime');
  });

  it('starts background workers from the worker entrypoint', () => {
    const worker = readFileSync(path.join(srcRoot, 'worker.ts'), 'utf8');
    expect(worker).toContain('workers.start');
    expect(worker).not.toContain('buildApp');
    expect(worker).not.toContain('app.listen');
  });

  it('owns worker loops in createRuntime', () => {
    const runtime = readFileSync(path.join(srcRoot, 'runtime.ts'), 'utf8');
    expect(runtime).toContain('OutboxWorker');
    expect(runtime).toContain('ShippingGuideWorker');
    expect(runtime).toContain('setInterval');
  });
});
