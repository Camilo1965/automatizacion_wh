import { readFile } from 'node:fs/promises';
import { createPostgresDatabase } from '../database/client.js';
import { LocalityCatalogService } from '../modules/localities/locality-catalog-service.js';

async function main() {
  const inputIndex = process.argv.indexOf('--input');
  const inputPath = inputIndex < 0 ? undefined : process.argv[inputIndex + 1];
  const sourceFormat = process.argv.includes('--format=99envios-document')
    ? '99envios-document'
    : 'csv';
  const databaseUrl = process.env.DATABASE_URL;
  if (!inputPath || !databaseUrl)
    throw new Error('Use --input <ruta> y configure DATABASE_URL');
  const database = createPostgresDatabase(databaseUrl);
  try {
    const service = new LocalityCatalogService(database);
    await service.bootstrap();
    const bytes = await readFile(inputPath);
    const preview = await service.preview(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      sourceFormat === '99envios-document' ? '99envios_document' : 'csv',
      'localities-cli',
    );
    await service.publish(preview.id, 'localities-cli');
    console.info(
      `Localidades publicadas: ${preview.rowCount}; exclusiones: ${preview.excludedCount}`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Falló la importación',
  );
  process.exitCode = 1;
});
