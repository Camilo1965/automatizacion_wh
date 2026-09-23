import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig } from '../src/config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '3000',
  DATABASE_URL: 'postgresql://camila:secret-password@127.0.0.1:5432/camila',
  ADMIN_ORIGIN: 'http://127.0.0.1:5173',
  LOG_LEVEL: 'info',
};

describe('loadConfig', () => {
  it('accepts a valid configuration and converts PORT to a number', () => {
    const config = loadConfig(validEnvironment);

    expect(config).toEqual({
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 3000,
      databaseUrl: validEnvironment.DATABASE_URL,
      adminOrigin: 'http://127.0.0.1:5173',
      logLevel: 'info',
      mediaRoot: './var/media',
      storageDriver: 'local',
      whatsappGraphApiVersion: 'v26.0',
      sessionAbsoluteTtlHours: 12,
      sessionIdleTtlMinutes: 720,
      sessionLastSeenThrottleSeconds: 300,
      retentionExecutionEnabled: false,
      metricsEnabled: true,
      workerMetricsPort: 9091,
    });
  });

  it('defaults STORAGE_DRIVER to local outside production', () => {
    expect(loadConfig(validEnvironment).storageDriver).toBe('local');
  });

  it('requires STORAGE_DRIVER=s3 in production with S3 settings', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        NODE_ENV: 'production',
        ADMIN_ORIGIN: 'https://admin.example.com',
        DATABASE_URL:
          'postgresql://camila:prod-db-pass-9f3a@127.0.0.1:5432/camila',
        KAIRO_CONFIG_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
      }),
    ).toThrow(ConfigurationError);

    const config = loadConfig({
      ...validEnvironment,
      NODE_ENV: 'production',
      ADMIN_ORIGIN: 'https://admin.example.com',
      DATABASE_URL:
        'postgresql://camila:prod-db-pass-9f3a@127.0.0.1:5432/camila',
      KAIRO_CONFIG_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://s3.example.com',
      S3_BUCKET: 'kairo-media',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'AKIA_NOT_AN_EXAMPLE',
      S3_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'.replace(
        'EXAMPLE',
        'REALVAL',
      ),
      S3_FORCE_PATH_STYLE: 'true',
      S3_TLS_REJECT_UNAUTHORIZED: 'true',
    });
    expect(config.storageDriver).toBe('s3');
    expect(config.s3).toMatchObject({
      endpoint: 'https://s3.example.com',
      bucket: 'kairo-media',
      forcePathStyle: true,
      tlsRejectUnauthorized: true,
    });
  });

  it('refuses HTTP ADMIN_ORIGIN, blank encryption keys, local storage, and example passwords in production', () => {
    const productionBase: NodeJS.ProcessEnv = {
      ...validEnvironment,
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgresql://camila:prod-db-pass-9f3a@127.0.0.1:5432/camila',
      ADMIN_ORIGIN: 'https://admin.example.com',
      KAIRO_CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://s3.example.com',
      S3_BUCKET: 'kairo-media',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'AKIA_NOT_AN_EXAMPLE',
      S3_SECRET_ACCESS_KEY: 'not-an-example-secret-value-32chars!!',
      S3_FORCE_PATH_STYLE: 'true',
      S3_TLS_REJECT_UNAUTHORIZED: 'true',
    };

    expect(() =>
      loadConfig({
        ...productionBase,
        ADMIN_ORIGIN: 'http://admin.example.com',
      }),
    ).toThrow(ConfigurationError);

    expect(() => {
      const env = { ...productionBase };
      delete env.KAIRO_CONFIG_ENCRYPTION_KEY;
      loadConfig(env);
    }).toThrow(ConfigurationError);

    expect(() =>
      loadConfig({
        ...productionBase,
        STORAGE_DRIVER: 'local',
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfig({
        ...productionBase,
        DATABASE_URL:
          'postgresql://camila:change_me_use_long_random_secret@127.0.0.1:5432/camila',
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfig({
        ...productionBase,
        S3_SECRET_ACCESS_KEY: 'change_me',
      }),
    ).toThrow(ConfigurationError);

    expect(loadConfig(productionBase).adminOrigin).toBe(
      'https://admin.example.com',
    );
  });

  it('rejects a missing DATABASE_URL', () => {
    const environment = { ...validEnvironment };
    delete environment.DATABASE_URL;

    expect(() => loadConfig(environment)).toThrow(ConfigurationError);

    try {
      loadConfig(environment);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).issues).toContain('DATABASE_URL');
    }
  });

  it('rejects an incorrect database protocol', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        DATABASE_URL: 'mysql://camila:secret-password@127.0.0.1:5432/camila',
      }),
    ).toThrow(ConfigurationError);

    try {
      loadConfig({
        ...validEnvironment,
        DATABASE_URL: 'mysql://camila:secret-password@127.0.0.1:5432/camila',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).issues).toContain('DATABASE_URL');
    }
  });

  it.each(['3000.5', '-1', '0', '65536'])(
    'rejects invalid PORT value %s',
    (port) => {
      expect(() =>
        loadConfig({
          ...validEnvironment,
          PORT: port,
        }),
      ).toThrow(ConfigurationError);

      try {
        loadConfig({
          ...validEnvironment,
          PORT: port,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).issues).toContain('PORT');
      }
    },
  );

  it('rejects an unknown log level', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        LOG_LEVEL: 'verbose',
      }),
    ).toThrow(ConfigurationError);

    try {
      loadConfig({
        ...validEnvironment,
        LOG_LEVEL: 'verbose',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).issues).toContain('LOG_LEVEL');
    }
  });

  it('rejects ADMIN_ORIGIN that includes a path', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        ADMIN_ORIGIN: 'http://127.0.0.1:5173/admin',
      }),
    ).toThrow(ConfigurationError);

    try {
      loadConfig({
        ...validEnvironment,
        ADMIN_ORIGIN: 'http://127.0.0.1:5173/admin',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).issues).toContain('ADMIN_ORIGIN');
    }
  });

  it('defaults MEDIA_ROOT to ./var/media', () => {
    const config = loadConfig(validEnvironment);

    expect(config.mediaRoot).toBe('./var/media');
  });

  it('rejects an empty MEDIA_ROOT without copying the value', () => {
    try {
      loadConfig({
        ...validEnvironment,
        MEDIA_ROOT: '   ',
      });
      expect.unreachable('expected ConfigurationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      const configurationError = error as ConfigurationError;
      expect(configurationError.issues).toContain('MEDIA_ROOT');
      expect(configurationError.message).not.toContain('   ');
    }
  });

  it('loads complete WhatsApp sending credentials with a version default', () => {
    const config = loadConfig({
      ...validEnvironment,
      WHATSAPP_ACCESS_TOKEN: 'local-test-token',
      WHATSAPP_PHONE_NUMBER_ID: '123456789',
    });
    expect(config).toMatchObject({
      whatsappAccessToken: 'local-test-token',
      whatsappPhoneNumberId: '123456789',
      whatsappGraphApiVersion: 'v26.0',
    });
  });

  it('rejects incomplete WhatsApp sending credentials', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        WHATSAPP_ACCESS_TOKEN: 'local-test-token',
      }),
    ).toThrow(ConfigurationError);
  });

  it('rejects incomplete 99envios credentials', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        NINETYNINE_ENVIOS_EMAIL: 'owner@example.test',
      }),
    ).toThrow(ConfigurationError);
  });

  it('accepts an optional numeric 99envios branch code for stored guide PDFs', () => {
    expect(
      loadConfig({
        ...validEnvironment,
        NINETYNINE_ENVIOS_BRANCH_CODE: '691722',
      }).ninetyNineEnviosBranchCode,
    ).toBe('691722');
  });

  it('rejects a nonnumeric 99envios branch code', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        NINETYNINE_ENVIOS_BRANCH_CODE: 'branch-691722',
      }),
    ).toThrow(ConfigurationError);
  });
});
