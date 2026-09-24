import { eq, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import { customers } from '../../database/schema/customers.js';
import { normalizeColombianPhone } from '../orders/order-validation.js';

export type CustomerTransaction = Parameters<
  Parameters<PostgresDatabase['orm']['transaction']>[0]
>[0];

function phoneLockKey(phone: string): string {
  if (/[a-z]/i.test(phone)) return phone;
  try {
    return normalizeCustomerPhone(phone);
  } catch {
    return phone;
  }
}

export async function lockCustomerPhone(
  transaction: CustomerTransaction,
  phone: string,
): Promise<void> {
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${phoneLockKey(phone)}))`,
  );
}

export async function lockCustomerPhones(
  transaction: CustomerTransaction,
  phones: readonly string[],
): Promise<void> {
  const keys = new Set<string>();
  for (const phone of phones) keys.add(phoneLockKey(phone));
  for (const phone of [...keys].sort())
    await lockCustomerPhone(transaction, phone);
}

export async function lockCustomerIds(
  transaction: CustomerTransaction,
  ids: readonly string[],
): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`kairo.customer.id:${id}`}))`,
    );
  }
}

export function normalizeCustomerPhone(phone: string): string {
  return normalizeColombianPhone(phone);
}

function normalizedName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-CO');
}

export async function resolveCustomerContact(
  transaction: CustomerTransaction,
  input: Readonly<{ normalizedPhone: string; displayName?: string | null }>,
): Promise<string | null> {
  await lockCustomerPhone(transaction, input.normalizedPhone);
  const displayName = input.displayName?.trim() || null;
  const [inserted] = await transaction
    .insert(customers)
    .values({
      normalizedPhone: input.normalizedPhone,
      displayName,
    })
    .onConflictDoNothing({ target: customers.normalizedPhone })
    .returning({ id: customers.id });
  if (inserted !== undefined) return inserted.id;

  const [existing] = await transaction
    .select({
      id: customers.id,
      displayName: customers.displayName,
      needsReview: customers.needsReview,
    })
    .from(customers)
    .where(eq(customers.normalizedPhone, input.normalizedPhone))
    .limit(1)
    .for('update');
  if (existing === undefined || existing.needsReview) return null;

  if (displayName !== null && existing.displayName === null) {
    await transaction
      .update(customers)
      .set({ displayName, updatedAt: new Date() })
      .where(eq(customers.id, existing.id));
  } else if (
    displayName !== null &&
    existing.displayName !== null &&
    normalizedName(displayName) !== normalizedName(existing.displayName)
  ) {
    await transaction
      .update(customers)
      .set({ needsReview: true, updatedAt: new Date() })
      .where(eq(customers.id, existing.id));
    return null;
  }

  return existing.id;
}
