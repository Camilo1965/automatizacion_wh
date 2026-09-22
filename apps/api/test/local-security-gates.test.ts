/* eslint-disable @typescript-eslint/ban-ts-comment -- local release-gate module has no declarations */
// @ts-nocheck
import { describe, expect, it } from 'vitest';

import {
  filesystemScanPipeline,
  PRODUCTION_IMAGES,
  securityCommand,
} from '../../../scripts/lib/local-security-gates.mjs';

describe('local security gates', () => {
  it('scans every production image, including backups', () => {
    expect(PRODUCTION_IMAGES).toEqual([
      'camila-api:local',
      'camila-admin:local',
      'camila-worker:local',
      'camila-backup:local',
    ]);
  });

  it('builds a pinned full-history Gitleaks command', () => {
    const command = securityCommand('secrets', 'C:/repo');

    expect(command).toEqual({
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        'C:/repo:/repo',
        'zricethezav/gitleaks:v8.30.1',
        'detect',
        '--source=/repo',
        '--config=/repo/.gitleaks.toml',
        '--verbose',
        '--redact',
        '--exit-code=1',
      ],
    });
  });

  it('streams the tracked HEAD into an isolated Trivy filesystem scan', () => {
    const pipeline = filesystemScanPipeline();

    expect(pipeline.producer).toEqual({
      command: 'git',
      args: ['archive', 'HEAD'],
    });
    expect(pipeline.consumer.command).toBe('docker');
    expect(pipeline.consumer.args).toContain('aquasec/trivy:0.74.0');
    expect(pipeline.consumer.args).toContain('-i');
    expect(pipeline.consumer.args.at(-1)).toContain(
      'tar -xf - -C /work && trivy fs',
    );
  });

  it('rejects unsupported scan modes', () => {
    expect(() => securityCommand('unknown', 'C:/repo')).toThrow(
      'Unsupported security mode: unknown',
    );
  });
});
