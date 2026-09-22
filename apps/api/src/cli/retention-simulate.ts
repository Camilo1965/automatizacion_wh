import { and, eq, lt, sql } from 'drizzle-orm';

import { createPostgresDatabase } from '../database/client.js';
import {
  ownerAlerts,
  whatsappConversationMessages,
  whatsappInboundMessages,
} from '../database/schema/index.js';
import { requireDatabaseUrl } from './cli-args.js';

function readDaysArg(argv: readonly string[]): number {
  const flagIndex = argv.findIndex((value) => value === '--days');
  const inline = argv.find((value) => value.startsWith('--days='));
  if (flagIndex >= 0) {
    const raw = argv[flagIndex + 1];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('--days must be a non-negative number');
    }
    return parsed;
  }
  if (inline !== undefined) {
    const parsed = Number(inline.slice('--days='.length));
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('--days must be a non-negative number');
    }
    return parsed;
  }
  return 365;
}

export async function simulateRetention(options: {
  databaseUrl: string;
  days: number;
}): Promise<{
  days: number;
  cutoff: string;
  counts: {
    whatsappConversationMessages: number;
    whatsappInboundMessages: number;
    ownerAlertsResolved: number;
  };
}> {
  const database = createPostgresDatabase(options.databaseUrl);
  try {
    const cutoff = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
    const [conversationRows, inboundRows, alertRows] = await Promise.all([
      database.orm
        .select({ count: sql<number>`count(*)::int` })
        .from(whatsappConversationMessages)
        .where(lt(whatsappConversationMessages.createdAt, cutoff)),
      database.orm
        .select({ count: sql<number>`count(*)::int` })
        .from(whatsappInboundMessages)
        .where(lt(whatsappInboundMessages.createdAt, cutoff)),
      database.orm
        .select({ count: sql<number>`count(*)::int` })
        .from(ownerAlerts)
        .where(
          and(
            eq(ownerAlerts.status, 'resolved'),
            lt(ownerAlerts.resolvedAt, cutoff),
          ),
        ),
    ]);

    return {
      days: options.days,
      cutoff: cutoff.toISOString(),
      counts: {
        whatsappConversationMessages: conversationRows[0]?.count ?? 0,
        whatsappInboundMessages: inboundRows[0]?.count ?? 0,
        ownerAlertsResolved: alertRows[0]?.count ?? 0,
      },
    };
  } finally {
    await database.close();
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const days = readDaysArg(argv);
  const databaseUrl = requireDatabaseUrl(environment);
  const result = await simulateRetention({ databaseUrl, days });
  console.log(JSON.stringify(result, null, 2));
}

const executedAsCli = process.argv[1]?.includes('retention-simulate') === true;

if (executedAsCli) {
  main().catch((error: unknown) => {
    console.error('Retention simulation failed');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}
