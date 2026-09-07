import { readFile } from 'node:fs/promises';
import { createPostgresDatabase } from '../database/client.js';
import {
  LocalityImportError,
  LocalityService,
} from '../modules/localities/locality-service.js';
import { PostgresLocalityRepository } from '../modules/localities/postgres-locality-repository.js';

async function main() {
  const inputIndex = process.argv.indexOf('--input');
  const inputPath = inputIndex < 0 ? undefined : process.argv[inputIndex + 1];
  const databaseUrl = process.env.DATABASE_URL;
  if (!inputPath || !databaseUrl)
    throw new Error('Use --input <ruta> y configure DATABASE_URL');
  const database = createPostgresDatabase(databaseUrl);
  try {
    const result = await new LocalityService(
      new PostgresLocalityRepository(database),
    ).importCsv(await readFile(inputPath));
    console.info(
      result.unchanged
        ? 'Localidades sin cambios'
        : `Localidades importadas: ${result.imported}`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Falló la importación',
  );
  if (error instanceof LocalityImportError) {
    for (const issue of error.issues) {
      console.error(`Fila ${issue.row}: ${issue.message} (${issue.code})`);
    }
  }
  process.exitCode = 1;
});
