import postgres from 'postgres';

/**
 * E2E helpers for controlled-sale Playwright (no Meta/99envíos).
 * Usage:
 *   tsx src/cli/e2e-sale-helpers.ts ensure-locality
 *   tsx src/cli/e2e-sale-helpers.ts seed-quote <orderId>
 *   tsx src/cli/e2e-sale-helpers.ts mark-guide-created <orderId>
 */
const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim() === '') {
  throw new Error('DATABASE_URL or TEST_DATABASE_URL required');
}
const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error('Refusing database whose name does not end with _test');
}

const [command, orderId] = process.argv.slice(2);
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  if (command === 'ensure-locality') {
    await sql`
      INSERT INTO shipping_localities
        (carrier_code, department, locality, normalized_name, source_sha256)
      VALUES ('05001000', 'Antioquia', 'Medellín', 'medellin', ${'e'.repeat(64)})
      ON CONFLICT (carrier_code) DO NOTHING
    `;
    console.log('locality ready');
  } else if (command === 'seed-quote') {
    if (!orderId) throw new Error('orderId required');
    const policySnapshot = JSON.stringify({
      preferredCarrier: null,
      fallbackPolicy: 'allow',
      offerMode: 'economy_only',
      protectedInsurance: 'standard',
    });
    const [order] = await sql<{ draft_version: number }[]>`
      SELECT draft_version FROM sales_orders WHERE id = ${orderId}
    `;
    if (!order) throw new Error(`order ${orderId} not found`);
    await sql`DELETE FROM shipping_quotes WHERE order_id = ${orderId}`;
    await sql`
      INSERT INTO shipping_quotes
        (order_id, draft_version, carrier, service_id, freight_cop,
         cash_on_delivery_cop, surcharge_cop, estimated_days, quoted_at,
         expires_at, recommended, selected, policy_snapshot)
      VALUES (
        ${orderId},
        ${order.draft_version},
        'envia',
        12,
        13368,
        3000,
        600,
        '1',
        clock_timestamp(),
        clock_timestamp() + interval '30 minutes',
        true,
        true,
        ${policySnapshot}::jsonb
      )
    `;
    console.log('quote seeded');
  } else if (command === 'mark-guide-created') {
    if (!orderId) throw new Error('orderId required');
    const result = await sql`
      UPDATE shipping_guide_jobs
      SET status = 'created',
          pre_shipment_number = '954101306888',
          freight_cop = 11596,
          updated_at = clock_timestamp()
      WHERE order_id = ${orderId}
      RETURNING id
    `;
    if (result.length === 0) throw new Error(`no guide job for ${orderId}`);
    console.log('guide marked created');
  } else {
    throw new Error(
      'usage: ensure-locality | seed-quote <orderId> | mark-guide-created <orderId>',
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
