# WhatsApp Inbound Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify Meta-signed WhatsApp webhooks and persist each inbound message once before any conversation automation runs.

**Architecture:** Keep the public Fastify route thin. A WhatsApp module verifies the HMAC over the original request bytes, parses only supported Meta inbound-message data, and delegates idempotent inserts to a PostgreSQL repository. The route acknowledges valid non-message events but never sends replies.

**Tech Stack:** Node.js 24, TypeScript 6, Fastify 5, PostgreSQL 18, Drizzle ORM, Zod 4, Vitest 5, pnpm 11.

## Global Constraints

- Use direct Meta Cloud API; do not add Chatwoot, 99envíos, sending logic, or conversation state.
- Require `X-Hub-Signature-256` with HMAC-SHA-256 over the exact raw body and compare values in constant time.
- Do not log webhook URL query strings, request bodies, signature headers, verification tokens, cookies, or authorization headers.
- Persist only Meta inbound `messages[]`; acknowledge valid status-only events with `200`.
- Enforce uniqueness on `whatsapp_message_id`; duplicate delivery remains a successful `200`.
- Keep test PostgreSQL ephemeral and secrets out of tracked files.
- Every behavioral change begins with a failing focused test, then minimal implementation.

---

### Task 1: Configuration and raw-body signature verification

**Files:**

- Modify: `apps/api/src/config.ts`
- Modify: `.env.example`
- Create: `apps/api/src/modules/whatsapp/whatsapp-signature.ts`
- Create: `apps/api/test/whatsapp-signature.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**

```ts
export type AppConfig = Readonly<{
  // existing fields
  whatsappAppSecret?: string;
}>;

export function verifyWhatsAppSignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string | undefined,
): boolean;
```

- [ ] **Step 1: Write RED tests** for a known HMAC-valid body, a modified body,
  missing/invalid `sha256=` header, and absent app secret. Run:

  ```powershell
  pnpm --filter @camila/api test:unit -- whatsapp-signature.test.ts
  ```

  Expected: fail because `whatsapp-signature.ts` does not exist.

- [ ] **Step 2: Implement minimal verifier** with Node `createHmac` and
  `timingSafeEqual`, returning false when byte lengths differ before comparing.
  Do not parse JSON here.

- [ ] **Step 3: Add optional config**: trim `WHATSAPP_APP_SECRET`, add only a
  commented placeholder to `.env.example`, and expose no secret in errors.

- [ ] **Step 4: Capture raw request bytes** only for `/webhooks/whatsapp` using
  a Fastify `preParsing` hook that buffers the payload within the existing
  1 MiB limit and exposes `request.rawBody`. Add a Fastify module declaration.

- [ ] **Step 5: Run focused tests and static checks**:

  ```powershell
  pnpm --filter @camila/api test:unit -- whatsapp-signature.test.ts
  pnpm --filter @camila/api typecheck
  pnpm lint
  ```

### Task 2: Inbound-event parser and database schema

**Files:**

- Modify: `apps/api/src/database/schema.ts`
- Create: `apps/api/drizzle/0005_whatsapp_inbound.sql`
- Create: `apps/api/src/modules/whatsapp/whatsapp-event.ts`
- Create: `apps/api/src/modules/whatsapp/whatsapp-inbound-repository.ts`
- Create: `apps/api/src/modules/whatsapp/postgres-whatsapp-inbound-repository.ts`
- Create: `apps/api/test/whatsapp-event.test.ts`
- Create: `apps/api/test/whatsapp-inbound-repository.integration.test.ts`

**Interfaces:**

```ts
export type InboundWhatsAppMessage = Readonly<{
  whatsappMessageId: string;
  businessPhoneNumberId: string;
  customerPhone: string;
  messageType: string;
  textBody: string | null;
  receivedAt: Date;
  payload: unknown;
}>;

export interface WhatsAppInboundRepository {
  storeMany(messages: readonly InboundWhatsAppMessage[]): Promise<void>;
}

export function extractInboundWhatsAppMessages(payload: unknown):
  | { ok: true; messages: readonly InboundWhatsAppMessage[] }
  | { ok: false };
```

- [ ] **Step 1: Write parser RED tests** using a representative Meta payload:
  one text message produces normalized `+` phone and text; multimedia produces
  null text; status-only payload produces an empty valid list; malformed
  `entry` payload returns `ok: false`.

- [ ] **Step 2: Implement parser** using Zod with explicit structural checks.
  Parse timestamps as Unix seconds; preserve the originating `value` as payload.
  Do not accept missing message ID, phone number ID, sender, type, or timestamp.

- [ ] **Step 3: Define Drizzle table and migration**:

  ```sql
  CREATE TABLE whatsapp_inbound_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_message_id varchar(128) NOT NULL UNIQUE,
    business_phone_number_id varchar(32) NOT NULL,
    customer_phone varchar(20) NOT NULL,
    message_type varchar(32) NOT NULL,
    text_body text,
    received_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX whatsapp_inbound_messages_customer_received_idx
    ON whatsapp_inbound_messages (customer_phone, received_at);
  ```

- [ ] **Step 4: Write repository integration RED test** that stores the same
  `whatsappMessageId` twice and verifies one row, then run it against
  `postgres-test`.

- [ ] **Step 5: Implement `storeMany`** in a transaction using
  `ON CONFLICT (whatsapp_message_id) DO NOTHING` and no read-then-write check.

- [ ] **Step 6: Run focused unit/integration tests, migrate dev and test
  databases, then typecheck/lint.**

### Task 3: Secure HTTP route and privacy logging

**Files:**

- Modify: `apps/api/src/routes/whatsapp.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/test/whatsapp-webhook.test.ts`
- Create: `apps/api/test/whatsapp-webhook.integration.test.ts`

**Interfaces:**

```ts
export type WhatsAppRoutesDependencies = Readonly<{
  config: AppConfig;
  inboundRepository?: WhatsAppInboundRepository;
}>;
```

- [ ] **Step 1: Write HTTP RED tests** proving: a signed text body gets `200`
  and calls real parser/repository; bad/missing signature gets `401` and no
  write; malformed but signed payload gets `400`; signed status-only payload
  gets `200` with no write; duplicate signed deliveries leave one persisted
  row.

- [ ] **Step 2: Extend the route** so GET verification behavior remains
  unchanged and POST verifies raw bytes before JSON parsing. Use the exact
  `x-hub-signature-256` request header. Respond with an empty `200` body only
  after storage completes.

- [ ] **Step 3: Wire the production repository** in `server.ts` and inject it
  through `buildApp`. Preserve tests that create the app without an order
  service or database ORM by supplying an explicit fake repository.

- [ ] **Step 4: Redact logging** by removing `req.url`, `req.body`, and
  `req.headers.x-hub-signature-256` from structured logs, in addition to the
  existing credential paths. Add a capture-logger assertion that a signed
  webhook never emits its query, signature, or body.

- [ ] **Step 5: Run focused webhook unit/integration tests, format, lint,
  typecheck, and full API suite.**

### Task 4: Local acceptance and documentation

**Files:**

- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `.env.example`

- [ ] **Step 1: Write README instructions**: set `WHATSAPP_APP_SECRET` directly
  in untracked `.env`; restart API; keep local tunnel open; use Meta `messages`
  sample only while the app remains unpublished. Never print the secret.

- [ ] **Step 2: Update roadmap**: mark only the secure receiver/deduplication
  subitems completed; do not mark the full WhatsApp phase complete.

- [ ] **Step 3: Run full verification**:

  ```powershell
  pnpm install --frozen-lockfile
  docker compose --profile test up -d postgres-test
  pnpm db:migrate
  pnpm test:unit
  pnpm test:integration
  pnpm format:check
  pnpm lint
  pnpm typecheck
  pnpm build
  pnpm verify
  git diff --check
  git status --short
  ```

- [ ] **Step 4: Commit coherent implementation** only after all checks succeed.

## Plan self-review

- Signature verification, raw bytes, strict parsing, idempotent storage and
  safe logging are each covered by an independent task and explicit tests.
- The data model contains no conversation state, sender, catalog selection or
  outbound side effect, matching the approved scope.
- No placeholders or unstated external credentials remain; the only manual
  input is the app secret in untracked `.env`.
