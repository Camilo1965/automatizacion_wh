import { rmSync } from 'node:fs';

import { E2E_MEDIA_ROOT } from './constants';

export default async function globalTeardown(): Promise<void> {
  rmSync(E2E_MEDIA_ROOT, { recursive: true, force: true });
}
