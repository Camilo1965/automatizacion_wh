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
    });
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

  it('does not include the supplied password in error messages', () => {
    const password = 'super-secret-db-password';

    try {
      loadConfig({
        ...validEnvironment,
        DATABASE_URL: `mysql://camila:${password}@127.0.0.1:5432/camila`,
      });
      expect.unreachable('expected ConfigurationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      const configurationError = error as ConfigurationError;
      expect(configurationError.message).not.toContain(password);
      expect(JSON.stringify(configurationError.issues)).not.toContain(password);
    }
  });
});
