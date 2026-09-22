export const GITLEAKS_IMAGE = 'zricethezav/gitleaks:v8.30.1';
export const TRIVY_IMAGE = 'aquasec/trivy:0.74.0';

export const PRODUCTION_IMAGES = Object.freeze([
  'camila-api:local',
  'camila-admin:local',
  'camila-worker:local',
  'camila-backup:local',
]);

export function filesystemScanPipeline() {
  return {
    producer: { command: 'git', args: ['archive', 'HEAD'] },
    consumer: {
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-i',
        '-v',
        'camila-trivy-cache:/root/.cache/',
        '--entrypoint',
        '/bin/sh',
        TRIVY_IMAGE,
        '-c',
        'mkdir -p /work && tar -xf - -C /work && trivy fs --severity CRITICAL,HIGH --exit-code 1 --ignore-unfixed --ignorefile /work/.trivyignore /work',
      ],
    },
  };
}

export function securityCommand(mode, root) {
  if (mode === 'secrets') {
    return {
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        `${root}:/repo`,
        GITLEAKS_IMAGE,
        'detect',
        '--source=/repo',
        '--config=/repo/.gitleaks.toml',
        '--verbose',
        '--redact',
        '--exit-code=1',
      ],
    };
  }

  throw new Error(`Unsupported security mode: ${mode}`);
}

export function imageScanCommand(root, image) {
  if (!PRODUCTION_IMAGES.includes(image)) {
    throw new Error(`Unsupported production image: ${image}`);
  }
  return {
    command: 'docker',
    args: [
      'run',
      '--rm',
      '-v',
      '/var/run/docker.sock:/var/run/docker.sock',
      '-v',
      `${root}/.trivyignore:/workspace/.trivyignore:ro`,
      '-v',
      'camila-trivy-cache:/root/.cache/',
      TRIVY_IMAGE,
      'image',
      '--severity',
      'CRITICAL,HIGH',
      '--exit-code',
      '1',
      '--ignore-unfixed',
      '--ignorefile',
      '/workspace/.trivyignore',
      image,
    ],
  };
}
