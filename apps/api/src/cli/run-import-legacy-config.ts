import { importLegacyConfiguration } from './import-legacy-config.js';
const result = await importLegacyConfiguration(process.env);
console.log(JSON.stringify(result));
