import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LocalGuidePdfStorage } from '../src/modules/shipping/local-guide-pdf-storage.js';

describe('LocalGuidePdfStorage', () => {
  it('stores a valid PDF under a generated key and returns its digest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'camila-guides-'));
    const storage = new LocalGuidePdfStorage(root);
    const bytes = new TextEncoder().encode('%PDF-1.7\ncontent');

    const saved = await storage.save(bytes);

    expect(saved.storageKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(saved.byteSize).toBe(bytes.byteLength);
    expect(saved.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await storage.read(saved.storageKey)).toEqual(bytes);
    expect(await readFile(path.join(root, saved.storageKey))).toEqual(
      Buffer.from(bytes),
    );
  });

  it('rejects invalid bytes and traversal keys', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'camila-guides-'));
    const storage = new LocalGuidePdfStorage(root);
    await expect(
      storage.save(new TextEncoder().encode('html')),
    ).rejects.toMatchObject({ code: 'invalid_pdf' });
    await expect(storage.read('../secret.pdf')).rejects.toMatchObject({
      code: 'invalid_pdf_key',
    });
  });
});
