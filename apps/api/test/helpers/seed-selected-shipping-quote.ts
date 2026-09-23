import postgres from 'postgres';

import { assertTestDatabaseName } from './test-database.js';

export async function seedSelectedShippingQuote(
  databaseUrl: string,
  orderId: string,
  draftVersion = 1,
): Promise<void> {
  assertTestDatabaseName(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const policySnapshot = JSON.stringify({
    preferredCarrier: null,
    fallbackPolicy: 'allow',
    offerMode: 'economy_only',
    protectedInsurance: 'standard',
  });
  try {
    await sql`
      INSERT INTO shipping_quotes
        (order_id, draft_version, carrier, service_id, freight_cop,
         cash_on_delivery_cop, surcharge_cop, estimated_days, quoted_at,
         expires_at, recommended, selected, policy_snapshot)
      VALUES
        (${orderId}, ${draftVersion}, 'envia', 12, 13368,
         3000, 600, '1', clock_timestamp(),
         clock_timestamp() + interval '30 minutes',
         true, true, ${policySnapshot}::jsonb)
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
