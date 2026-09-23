import { eq } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import { customers } from '../../database/schema/customers.js';
import { normalizeColombianPhone } from '../orders/order-validation.js';

type CustomerTransaction = Parameters<
  Parameters<PostgresDatabase['orm']['transaction']>[0]
>[0];

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
