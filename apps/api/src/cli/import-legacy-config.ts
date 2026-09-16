import { loadConfig } from '../config.js';
import { createPostgresDatabase } from '../database/client.js';
import { IntegrationSecretCrypto } from '../modules/integrations/integration-secret-crypto.js';
import { IntegrationSettingsService } from '../modules/integrations/integration-settings-service.js';
import { PostgresIntegrationSettingsRepository } from '../modules/integrations/postgres-integration-settings-repository.js';

export async function importLegacyConfiguration(
  environment: NodeJS.ProcessEnv,
) {
  const config = loadConfig(environment);
  if (!config.integrationEncryptionKey)
    throw new Error(
      'Configura KAIRO_CONFIG_ENCRYPTION_KEY antes de importar las conexiones.',
    );
  const database = createPostgresDatabase(config.databaseUrl);
  const repository = new PostgresIntegrationSettingsRepository(database);
  const service = new IntegrationSettingsService(
    repository,
    new IntegrationSecretCrypto(config.integrationEncryptionKey),
  );
  let imported = 0;
  try {
    if (
      !(await repository.draft('whatsapp')) &&
      !(await repository.get('whatsapp')) &&
      config.whatsappPhoneNumberId &&
      config.whatsappAccessToken
    ) {
      await service.update(
        {
          whatsapp: {
            phoneNumberId: config.whatsappPhoneNumberId,
            accessToken: config.whatsappAccessToken,
            graphApiVersion: config.whatsappGraphApiVersion ?? 'v26.0',
            ...(config.whatsappAppSecret
              ? { appSecret: config.whatsappAppSecret }
              : {}),
            ...(config.whatsappWebhookVerifyToken
              ? { webhookVerifyToken: config.whatsappWebhookVerifyToken }
              : {}),
          },
        },
        'legacy-import',
      );
      imported++;
    }
    if (
      !(await repository.draft('shipping')) &&
      !(await repository.get('shipping')) &&
      config.ninetyNineEnviosEmail &&
      config.ninetyNineEnviosPassword
    ) {
      await service.update(
        {
          shipping: {
            accountEmail: config.ninetyNineEnviosEmail,
            password: config.ninetyNineEnviosPassword,
            ...(config.ninetyNineEnviosIntegrationToken
              ? { integrationToken: config.ninetyNineEnviosIntegrationToken }
              : {}),
            ...(config.ninetyNineEnviosIntegrationId
              ? { integrationId: config.ninetyNineEnviosIntegrationId }
              : {}),
          },
        },
        'legacy-import',
      );
      imported++;
    }
    return { imported, activeConnectionsChanged: false };
  } finally {
    await database.close();
  }
}
