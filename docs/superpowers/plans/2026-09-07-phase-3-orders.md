# Phase 3 Orders and Reservations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementation is performed directly in the current Codex task; do not delegate to Cursor.

**Goal:** Build a complete owner-operated cash-on-delivery order lifecycle with versioned summaries, idempotent confirmation, concurrency-safe reservations, manual dispatch/delivery/return, and an audited admin UI.

**Architecture:** Add an `orders` domain beside `catalog`, backed by PostgreSQL transactions and immutable summary/status/reservation records. Keep one reference+talla per order, leave drafts unreserved, and lock the stock row during confirmation and lifecycle changes. Expose strict shared Zod contracts through focused Fastify order routes and consume them from React Query pages in the protected admin panel.

**Tech Stack:** Node.js 24.14.1, TypeScript 6, Fastify 5, PostgreSQL 18, Drizzle ORM/migrations, Zod 4 shared contracts, React 19, React Router 7, TanStack Query 5, Vitest 5, Testing Library, MSW 2, Playwright Chromium, pnpm 11.19.0.

## Global Constraints

- One order has exactly one catalog reference, one whole/half shoe size, and quantity `1..10`.
- Drafts never reserve inventory.
- Payment method is cash on delivery; phase 3 stores product subtotal and represents shipping as pending.
- All order routes require the single owner's admin session; all mutations require the exact configured admin Origin.
- Confirmation must update order, stock, audit rows, and idempotency data atomically. Cancellation, dispatch, delivery, and return must update their applicable order, stock, and audit rows atomically.
- Never use floating point for COP; all monetary values are positive integers.
- Never log customer name, phone, address, delivery notes, request body, summary snapshot, cookie, or authorization data.
- Preserve existing catalog behavior, migrations, photo storage, and test counts.
- Use TDD for every domain rule and bug fix: RED evidence, minimal GREEN, then focused refactor.
- A task is deliverable only when its focused tests, format, lint, and typecheck pass.
- Do not mark real pilot data as loaded and do not connect WhatsApp, Chatwoot, 99envíos, Treinta, or payment services.

---

## Locked file map

### Database and shared contracts

- Modify `apps/api/src/database/schema.ts`: Drizzle definitions for five order tables and new inventory reasons.
- Create `apps/api/drizzle/0004_orders_and_reservations.sql` plus Drizzle metadata through `pnpm db:generate`.
- Modify `packages/contracts/src/index.ts`: strict request/response schemas, state enums, cursors, summary snapshot, and public order types.
- Modify `packages/contracts/test/contracts.test.ts`: boundary, invariant, strictness, and cursor tests.

### API domain

- Create `apps/api/src/modules/orders/order-types.ts`: internal entities and inputs.
- Create `apps/api/src/modules/orders/order-errors.ts`: typed validation, conflict, and not-found errors.
- Create `apps/api/src/modules/orders/order-validation.ts`: customer, phone, address, quantity, reason, and idempotency normalization.
- Create `apps/api/src/modules/orders/order-repository.ts`: persistence interface.
- Create `apps/api/src/modules/orders/postgres-order-repository.ts`: all SQL and transaction boundaries.
- Create `apps/api/src/modules/orders/order-service.ts`: orchestration and legal state transitions.
- Create `apps/api/src/http/order-mappers.ts`: internal Date/entity to strict public contract conversion.
- Create `apps/api/src/routes/admin/orders.ts`: authenticated HTTP handlers only.
- Modify `apps/api/src/routes/admin/index.ts`: register the focused order plugin; do not add order handlers inline.
- Modify `apps/api/src/app.ts` and `apps/api/src/server.ts`: dependency construction and injection.
- Modify `apps/api/src/http/map-domain-error.ts`: stable public order error mapping.

### Admin panel

- Create `apps/admin/src/api/order-api.ts`: schema-validated API calls.
- Create `apps/admin/src/orders/OrderCreatePage.tsx`: complete draft form and locality/reference selection.
- Create `apps/admin/src/orders/OrderSummary.tsx`: immutable summary display and confirmation.
- Create `apps/admin/src/orders/OrderListPage.tsx`: filters and cursor pagination.
- Create `apps/admin/src/orders/OrderDetailPage.tsx`: lifecycle state, audit, and actions.
- Create `apps/admin/src/orders/OrderStatusBadge.tsx`: accessible Spanish state labels.
- Modify `apps/admin/src/App.tsx` and `apps/admin/src/components/AppShell.tsx`: protected routes and navigation.
- Modify `apps/admin/src/test/handlers.ts` and `fixtures.ts`: stateful MSW order model.
- Modify `apps/admin/src/styles.css`: existing visual system only.

### Tests and documentation

- Create focused API unit and PostgreSQL integration files under `apps/api/test/order-*.test.ts`.
- Create focused React tests under `apps/admin/src/orders/*.test.tsx`.
- Create `apps/admin/e2e/orders.spec.ts`.
- Modify `apps/api/src/cli/seed-e2e-admin.ts`: truncate new tables in FK-safe order.
- Modify `README.md`, `ROADMAP.md`, and create `docs/phase-3-closeout.md` only after acceptance evidence exists.

---

## Canonical domain interfaces

Use these names and meanings consistently in repository, service, routes, mappers, and tests:

```ts
export type OrderStatus =
  'draft' | 'confirmed' | 'cancelled' | 'dispatched' | 'delivered' | 'returned';

export type CreateDraftInput = Readonly<{
  referenceId: string;
  size: string;
  quantity: number;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  localityCarrierCode?: string;
  deliveryNotes?: string | null;
}>;

export type UpdateDraftInput = Readonly<{
  orderId: string;
  referenceId?: string;
  size?: string;
  quantity?: number;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  localityCarrierCode?: string;
  deliveryNotes?: string | null;
}>;

export type ConfirmOrderInput = Readonly<{
  orderId: string;
  summaryVersion: number;
  idempotencyKey: string;
  adminId: string;
}>;

export type OrderSummarySnapshotV1 = Readonly<{
  schemaVersion: 1;
  version: number;
  draftVersion: number;
  orderNumber: string;
  reference: Readonly<{
    id: string;
    code: string;
    modelName: string;
    color: string;
  }>;
  size: string;
  quantity: number;
  unitPriceCop: number;
  productSubtotalCop: number;
  shippingCostCop: null;
  shippingPending: true;
  totalCop: number;
  customer: Readonly<{ name: string; phone: string }>;
  destination: Readonly<{
    address: string;
    localityCarrierCode: string;
    department: string;
    locality: string;
    deliveryNotes: string | null;
  }>;
}>;

export interface OrderRepository {
  createDraft(input: CreateDraftInput, adminId: string): Promise<SalesOrder>;
  updateDraft(input: UpdateDraftInput, adminId: string): Promise<SalesOrder>;
  createSummary(orderId: string): Promise<OrderSummary>;
  confirm(input: ConfirmOrderInput): Promise<OrderDetail>;
  cancel(
    orderId: string,
    reason: string,
    adminId: string,
  ): Promise<OrderDetail>;
  dispatch(orderId: string, adminId: string): Promise<OrderDetail>;
  deliver(orderId: string, adminId: string): Promise<OrderDetail>;
  receiveReturn(
    orderId: string,
    reason: string,
    adminId: string,
  ): Promise<OrderDetail>;
  findDetail(orderId: string): Promise<OrderDetail | null>;
  listOrders(input: ListOrdersInput): Promise<OrderPage>;
}
```

`SalesOrder`, `OrderSummary`, `OrderDetail`, `OrderStatusEvent`, `ReservationMovement`, `ListOrdersInput`, and `OrderPage` mirror the database fields described in the design. All `Date` values remain `Date` inside the API and become ISO strings only in `order-mappers.ts`.

---

### Task 1: Strict shared order contracts

**Files:**

- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/test/contracts.test.ts`

**Interfaces:**

- Produces: `OrderStatusSchema`, `CreateOrderBodySchema`, `PatchOrderBodySchema`, `CreateOrderSummaryResponseSchema`, `ConfirmOrderBodySchema`, `OrderDetailResponseSchema`, `ListOrdersQuerySchema`, `ListOrdersResponseSchema`, `CancelOrderBodySchema`, `ReturnOrderBodySchema`, `OrderActionResponseSchema`, `encodeOrderCursor`, `decodeOrderCursor`.
- Public phone format: `+57` plus ten national digits.
- Public dates: ISO-8601 datetime strings.

- [ ] **Step 1: Write contract RED tests**

Cover exact accepted shapes and rejection of: extra keys at every nesting level, empty PATCH, quantity 0/11/decimal, malformed UUID, malformed phone when supplied, blank reason, decimal/negative COP, inconsistent summary total, unknown state, and invalid cursor payload. Prove that create accepts the required `referenceId`, `size`, and `quantity` without customer fields, while PATCH accepts each customer/destination field independently; completeness is enforced when creating a summary.

Use this summary invariant in tests:

```ts
const summary = {
  schemaVersion: 1,
  version: 1,
  draftVersion: 1,
  reference: { id: SAMPLE_UUID, code: '01', modelName: 'Roma', color: 'Negro' },
  size: '37.5',
  quantity: 2,
  unitPriceCop: 120000,
  productSubtotalCop: 240000,
  shippingCostCop: null,
  shippingPending: true,
  totalCop: 240000,
  customer: { name: 'Cliente Prueba', phone: '+573001234567' },
  destination: {
    address: 'Calle 10 # 20-30',
    localityCarrierCode: '05001',
    department: 'Antioquia',
    locality: 'Medellín',
    deliveryNotes: null,
  },
};
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @camila/contracts test:unit`

Expected: tests fail because the order exports do not exist.

- [ ] **Step 3: Implement strict schemas and inferred types**

Use `.strict()`, existing `ShoeSizeStringSchema`, integer COP/quantity schemas, normalized pagination defaults `limit=25`, maximum `100`, and cursor `{ createdAt, id }` encoded as base64url JSON. Add a `superRefine` to the summary schema requiring `productSubtotalCop = unitPriceCop * quantity`, `shippingCostCop = null`, `shippingPending = true`, and `totalCop = productSubtotalCop`.

- [ ] **Step 4: Run GREEN and package build**

Run:

```powershell
pnpm --filter @camila/contracts test:unit
pnpm --filter @camila/contracts build
pnpm --filter @camila/contracts typecheck
```

Expected: all contract tests pass and generated declarations compile.

- [ ] **Step 5: Commit**

```powershell
git add packages/contracts
git commit -m "feat: define strict order contracts"
```

### Task 2: Order domain validation and state machine

**Files:**

- Create: `apps/api/src/modules/orders/order-types.ts`
- Create: `apps/api/src/modules/orders/order-errors.ts`
- Create: `apps/api/src/modules/orders/order-validation.ts`
- Create: `apps/api/test/order-validation.test.ts`
- Create: `apps/api/test/order-state.test.ts`

**Interfaces:**

- Produces `normalizeCustomerName`, `normalizeColombianPhone`, `normalizeAddress`, `normalizeDeliveryNotes`, `normalizeActionReason`, `normalizeIdempotencyKey`, `validateOrderQuantity`, and `assertTransition(current, action)`.
- `OrderAction` is `confirm | cancel | dispatch | deliver | return`.
- Error codes are `invalid_customer_name`, `invalid_phone`, `invalid_address`, `invalid_delivery_notes`, `invalid_quantity`, `invalid_reason`, `invalid_idempotency_key`, and `invalid_order_transition`.

- [ ] **Step 1: Write RED table tests**

Test whitespace trimming, Unicode names, exact Colombian phone normalization from `3001234567` and `573001234567` to `+573001234567`, rejection of letters/extensions, address length `5..180`, notes max 250, reasons `3..250`, quantity integers `1..10`, idempotency printable length `8..128`, and every state/action pair in the design table.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @camila/api test:unit -- order-validation.test.ts order-state.test.ts`

Expected: module resolution failure for the new domain files.

- [ ] **Step 3: Implement pure functions**

Keep normalization deterministic. `assertTransition` returns the destination state and throws `OrderConflictError('invalid_order_transition', ...)` for all other pairs. Do not touch PostgreSQL in this task.

- [ ] **Step 4: Run GREEN**

Run the same focused tests plus `pnpm --filter @camila/api typecheck`.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/orders apps/api/test/order-validation.test.ts apps/api/test/order-state.test.ts
git commit -m "feat: add order domain rules"
```

### Task 3: Order database migration and upgrade safety

**Files:**

- Modify: `apps/api/src/database/schema.ts`
- Create: `apps/api/drizzle/0004_orders_and_reservations.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/drizzle/meta/0004_snapshot.json`
- Create: `apps/api/test/order-migrations.integration.test.ts`
- Modify: `apps/api/test/database-migrations.integration.test.ts`

**Interfaces:**

- Produces Drizzle tables `salesOrders`, `orderSummaries`, `orderConfirmations`, `reservationMovements`, `orderStatusEvents`.
- Adds inventory reasons `order_dispatched` and `order_returned` without rewriting prior movement data.

- [ ] **Step 1: Write migration RED test**

Create a temporary database ending `_test`, migrate only through `0003`, seed one reference, stock and locality, then run full migrations. Assert all five tables, unique/index/foreign-key/check constraints, old data survival, and a second migration run with no error. Always drop the temporary database in `finally`.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @camila/api test:integration -- order-migrations.integration.test.ts`

Expected: missing `sales_orders`.

- [ ] **Step 3: Add Drizzle schema and generate migration**

Run: `pnpm db:generate -- --name=orders_and_reservations`.

Inspect SQL manually. Required indexes:

```sql
CREATE UNIQUE INDEX sales_orders_order_number_unique ON sales_orders(order_number);
CREATE INDEX sales_orders_status_created_idx ON sales_orders(status, created_at DESC, id DESC);
CREATE INDEX sales_orders_phone_idx ON sales_orders(customer_phone);
CREATE UNIQUE INDEX order_confirmations_idempotency_unique ON order_confirmations(idempotency_key);
CREATE UNIQUE INDEX order_confirmations_order_unique ON order_confirmations(order_id);
CREATE INDEX order_status_events_order_created_idx ON order_status_events(order_id, created_at, id);
CREATE INDEX reservation_movements_order_created_idx ON reservation_movements(order_id, created_at, id);
```

Require FK `restrict`, nonnegative quantities, delta consistency, timestamp/state consistency, positive confirmed prices, and JSON object summaries.

- [ ] **Step 4: Run GREEN and schema checks**

Run migration tests, `pnpm db:migrate`, and query `information_schema` through the test to verify constraints. Run `pnpm db:generate` again and require `No schema changes`.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/database apps/api/drizzle apps/api/test/*migration*
git commit -m "feat: persist orders and reservations"
```

### Task 4: Draft repository and immutable summaries

**Files:**

- Create: `apps/api/src/modules/orders/order-repository.ts`
- Create: `apps/api/src/modules/orders/postgres-order-repository.ts`
- Create: `apps/api/src/modules/orders/order-service.ts`
- Create: `apps/api/test/order-service.test.ts`
- Create: `apps/api/test/order-drafts.integration.test.ts`

**Interfaces:**

- `OrderRepository.createDraft(input, adminId): Promise<SalesOrder>`.
- `updateDraft(input, adminId): Promise<SalesOrder>` increments version only on an effective change.
- `createSummary(orderId): Promise<OrderSummary>` owns its transaction and snapshot.
- `findDetail(orderId): Promise<OrderDetail | null>`.

- [ ] **Step 1: Write service RED tests with a typed fake repository**

Assert normalized input reaches the repository, unavailable/inactive reference errors pass through, patching non-draft fails, and summaries require all customer/destination fields.

- [ ] **Step 2: Write PostgreSQL RED tests**

Seed active reference `01`, stock 37/37.5 and locality `05001`. Assert create leaves `reserved_quantity=0`; patch changes only supplied fields and version; no-op patch keeps version; locality snapshot comes from DB rather than request text; sequential summaries become versions 1 and 2; summary 1 remains byte-for-byte unchanged.

- [ ] **Step 3: Run RED**

Run both focused test files and capture missing repository/service evidence.

- [ ] **Step 4: Implement draft and summary transactions**

Generate order number in PostgreSQL. Lock the order while creating a summary. Read authoritative reference/locality values and calculate COP integers. Store `snapshot` only after validating it with the shared summary schema. Insert creation/status event with the authenticated admin id.

- [ ] **Step 5: Run GREEN**

Run focused unit/integration tests three times for summary version stability, then API typecheck.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/orders apps/api/test/order-*
git commit -m "feat: create order drafts and summaries"
```

### Task 5: Idempotent confirmation and concurrent reservation

**Files:**

- Modify: `apps/api/src/modules/orders/order-repository.ts`
- Modify: `apps/api/src/modules/orders/postgres-order-repository.ts`
- Modify: `apps/api/src/modules/orders/order-service.ts`
- Create: `apps/api/test/order-confirmation.integration.test.ts`

**Interfaces:**

- `confirm(input: { orderId; summaryVersion; idempotencyKey; adminId }): Promise<OrderDetail>`.
- Conflict codes: `summary_stale`, `reference_unavailable`, `insufficient_stock`, `idempotency_key_reused`, `order_already_confirmed`.

- [ ] **Step 1: Write confirmation RED cases**

Cover valid confirmation; missing summary; old summary; draft changed after summary; price changed after summary; inactive reference; stock zero; quantity exceeding available; wrong size; same key retry; same key on another order; different key after confirmation.

- [ ] **Step 2: Write the last-pair concurrency RED test**

Create two drafts and summaries for the same `reference+size`, with physical 1 and reserved 0. Run both confirmations using `Promise.allSettled`. Require exactly one fulfilled result, one `insufficient_stock`, final physical 1, final reserved 1, one confirmation row and one reservation movement. Repeat the test three times.

- [ ] **Step 3: Run RED**

Expected: missing `confirm`, then concurrency failure until locking is implemented.

- [ ] **Step 4: Implement the exact transaction sequence from the design**

Use row locks and an update predicate equivalent to:

```sql
UPDATE catalog_stock
SET reserved_quantity = reserved_quantity + $quantity,
    updated_at = clock_timestamp()
WHERE reference_id = $referenceId
  AND size = $size
  AND physical_quantity - reserved_quantity >= $quantity
RETURNING *;
```

Handle unique violation `23505` for idempotency by rereading the existing confirmation. Never retry a transaction automatically after an ambiguous application error.

- [ ] **Step 5: Run GREEN and concurrency ×3**

Run the focused file three consecutive times, then the entire integration suite.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/orders apps/api/test/order-confirmation.integration.test.ts
git commit -m "feat: confirm orders without overselling"
```

### Task 6: Cancellation, dispatch, delivery, and return transactions

**Files:**

- Modify: `apps/api/src/modules/orders/order-repository.ts`
- Modify: `apps/api/src/modules/orders/postgres-order-repository.ts`
- Modify: `apps/api/src/modules/orders/order-service.ts`
- Create: `apps/api/test/order-lifecycle.integration.test.ts`

**Interfaces:**

- `cancel(orderId, reason, adminId)`.
- `dispatch(orderId, adminId)`.
- `deliver(orderId, adminId)`.
- `receiveReturn(orderId, reason, adminId)`.

- [ ] **Step 1: Write lifecycle RED matrix**

Assert every legal transition and every illegal state/action pair. Verify exact final physical/reserved counts, one event per transition, reservation deltas, inventory deltas, timestamps, and reasons. Inject a failing audit trigger and prove the stock/order update rolls back.

- [ ] **Step 2: Run RED**

Expected: lifecycle methods missing.

- [ ] **Step 3: Implement locked lifecycle transactions**

Lock order then stock in the same consistent order used by confirmation. Cancellation of `draft` has no stock movement; cancellation of `confirmed` releases reserved. Dispatch decrements both physical and reserved and records both audit types. Return increments physical and records `order_returned`. Deliver changes only state/event.

- [ ] **Step 4: Run GREEN and repetition tests**

Execute each endpoint-equivalent repository action twice; the second call must return `invalid_order_transition` and leave all counts unchanged.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/orders apps/api/test/order-lifecycle.integration.test.ts
git commit -m "feat: manage order fulfillment lifecycle"
```

### Task 7: Order queries, detail, and cursor pagination

**Files:**

- Modify: `apps/api/src/modules/orders/order-repository.ts`
- Modify: `apps/api/src/modules/orders/postgres-order-repository.ts`
- Create: `apps/api/test/order-queries.integration.test.ts`

**Interfaces:**

- `listOrders({ status?, query?, cursor?, limit }): Promise<OrderPage>`.
- Ordering is `created_at DESC, id DESC`; cursor contains both fields.
- Search matches formatted order number, normalized phone, and reference code with escaped `%`, `_`, and `\`.

- [ ] **Step 1: Write query RED tests**

Seed 30 mixed-state orders with identical timestamps for a subset. Assert no duplicate/skip across pages, state filtering, search escaping, phone/reference/order lookup, unknown cursor rejection, and detail event ordering.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement limit+1 keyset queries**

Never use offset. Fetch summary snapshot, events and both movement types with bounded queries. Return customer data only from the authenticated admin API layer.

- [ ] **Step 4: Run GREEN**

Run query tests plus integration suite.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/orders apps/api/test/order-queries.integration.test.ts
git commit -m "feat: query order history"
```

### Task 8: Authenticated Fastify order API

**Files:**

- Create: `apps/api/src/http/order-mappers.ts`
- Create: `apps/api/src/routes/admin/orders.ts`
- Modify: `apps/api/src/routes/admin/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/http/map-domain-error.ts`
- Create: `apps/api/test/order-http.integration.test.ts`

**Interfaces:**

- Routes and status codes exactly match the design API section.
- Success envelopes are `{ data: ... }`; all response bodies validate against shared contracts.

- [ ] **Step 1: Write HTTP RED tests**

For every route test anonymous `401`; for every mutation test absent/wrong Origin `403`; test malformed bodies `400` with field; not found `404`; domain conflicts `409`; success codes `200/201`. Parse every success with its shared Zod response schema. Assert no response contains internal storage keys or raw DB fields.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement mappers and focused plugin**

Pass `request.adminUser.id` into mutations. Split route schemas from handler logic. Extend log redaction with `req.body.customerName`, `customerPhone`, `address`, `deliveryNotes`, and `reason`; add an integration logger capture proving sentinel PII never appears.

- [ ] **Step 4: Run GREEN**

Run order HTTP tests, existing admin HTTP tests, lint and typecheck.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src apps/api/test/order-http.integration.test.ts
git commit -m "feat: expose secured order API"
```

### Task 9: Admin API client and stateful test server

**Files:**

- Create: `apps/admin/src/api/order-api.ts`
- Modify: `apps/admin/src/test/fixtures.ts`
- Modify: `apps/admin/src/test/handlers.ts`
- Create: `apps/admin/src/api/order-api.test.ts`

**Interfaces:**

- Functions `createOrder`, `updateOrder`, `createOrderSummary`, `confirmOrder`, `listOrders`, `getOrder`, `cancelOrder`, `dispatchOrder`, `deliverOrder`, `returnOrder`.
- Every call uses `apiRequest` with a strict response schema; no `as` cast of server JSON.

- [ ] **Step 1: Write client RED tests**

Use MSW valid and malformed `200` responses. Require malformed nested summary/event data to become `ApiClientError('invalid_response')`. Assert mutation method/path/body exactly.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement client and in-memory handlers**

The MSW state model must enforce versions, idempotency, stock and legal transitions closely enough for UI tests; PostgreSQL remains the authority tested by API integration.

- [ ] **Step 4: Run GREEN**

- [ ] **Step 5: Commit**

```powershell
git add apps/admin/src/api apps/admin/src/test
git commit -m "feat: add typed order admin client"
```

### Task 10: Owner order creation and versioned confirmation UI

**Files:**

- Create: `apps/admin/src/orders/OrderCreatePage.tsx`
- Create: `apps/admin/src/orders/OrderSummary.tsx`
- Create: `apps/admin/src/orders/OrderCreatePage.test.tsx`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/AppShell.tsx`
- Modify: `apps/admin/src/styles.css`

**Interfaces:**

- Protected route `/orders/new`.
- On confirm navigate to `/orders/:orderId`.

- [ ] **Step 1: Write UI RED tests**

Cover: required fields, reference selection, only available sizes, digit-only quantity, Colombian phone normalization, searchable locality, summary values, cancel confirmation with no HTTP call, successful confirmation, stale summary alert and regenerated values, insufficient stock alert, busy-button prevention, keyboard focus trap and restored focus.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement accessible form and summary**

Use explicit labels, field-linked errors, `aria-live` status, existing `ConfirmDialog`, and `Intl.NumberFormat('es-CO', { currency: 'COP' })`. Generate idempotency key once per confirmation intent with `crypto.randomUUID()` and retain it across safe network retries until a definitive response.

- [ ] **Step 4: Run GREEN and inspect at 1280×720 and 390×844**

Use Playwright screenshot only for local visual inspection; do not commit generated screenshots.

- [ ] **Step 5: Commit**

```powershell
git add apps/admin/src
git commit -m "feat: create and confirm orders in admin"
```

### Task 11: Order list, detail, and lifecycle UI

**Files:**

- Create: `apps/admin/src/orders/OrderStatusBadge.tsx`
- Create: `apps/admin/src/orders/OrderListPage.tsx`
- Create: `apps/admin/src/orders/OrderDetailPage.tsx`
- Create: `apps/admin/src/orders/OrderListPage.test.tsx`
- Create: `apps/admin/src/orders/OrderDetailPage.test.tsx`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/AppShell.tsx`
- Modify: `apps/admin/src/styles.css`

**Interfaces:**

- Routes `/orders` and `/orders/:orderId`.
- Actions shown strictly by state table.

- [ ] **Step 1: Write UI RED tests**

List tests: state/query filters, cursor “Cargar más”, no duplicates, empty/error/loading states. Detail tests: PII and destination, COP formatting, summary version, event/movement timeline, permitted buttons, cancel/return required reason, dialog cancellation, mutation success, `401` session redirect, and recoverable `409`.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement pages and query invalidation**

Invalidate `orders`, `order:<id>`, `references`, and `catalog-readiness` after stock-affecting actions. Do not optimistically alter stock.

- [ ] **Step 4: Run GREEN**

Run all admin unit tests, lint, typecheck, and build.

- [ ] **Step 5: Commit**

```powershell
git add apps/admin/src
git commit -m "feat: operate order lifecycle in admin"
```

### Task 12: End-to-end acceptance, audit, and phase closure

**Files:**

- Create: `apps/admin/e2e/orders.spec.ts`
- Modify: `apps/api/src/cli/seed-e2e-admin.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Create: `docs/phase-3-closeout.md`

**Interfaces:**

- E2E uses ports 3100/5174, temporary media, PostgreSQL test, and fictional customer data.

- [ ] **Step 1: Add E2E RED scenarios**

Scenario A: create draft → review versioned summary → confirm → observe reservation → dispatch → deliver. Scenario B: confirm → cancel → observe released reservation. Scenario C uses API requests to prepare two drafts for one unit and confirms concurrently, requiring one success and one `409 insufficient_stock`. Scenario D changes catalog price after summary and requires stale-summary recovery.

- [ ] **Step 2: Update FK-safe test cleanup**

Truncate in this order before users/catalog: confirmations, summaries, reservation movements, status events, orders, sessions, users, inventory movements, stock, references, imports and localities. Keep `CASCADE` as defense but make dependencies explicit.

- [ ] **Step 3: Run the full verification gate**

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
docker compose config --quiet
docker compose --profile test up -d postgres-test
pnpm db:migrate
pnpm verify
pnpm audit --prod
git diff --check
docker inspect camila-postgres-test-1 --format '{{json .HostConfig.Tmpfs}} {{json .Mounts}}'
```

Required results: Node `v24.14.1`, pnpm `11.19.0`, every suite green, zero known production vulnerabilities, no whitespace errors, test PostgreSQL healthy, tmpfs at `/var/lib/postgresql`, and no mounted volume there.

- [ ] **Step 4: Stress critical tests**

Run the last-pair concurrency test three times and both main E2E order flows three times. A flaky run blocks closure and must be debugged before rerunning the full gate.

- [ ] **Step 5: Perform deep review**

Review every diff against the design and record a matrix in `docs/phase-3-closeout.md`: requirement, implementation, RED evidence, GREEN evidence, remaining operational dependency. Search for PII fixtures outside tests, `as` casts on HTTP JSON, offset pagination, unguarded state mutations, missing Origin/session checks, floating-point money, unlocked stock updates, and unbounded result sets.

- [ ] **Step 6: Update documentation only from evidence**

README documents owner operation and exact states. ROADMAP checks every phase 3 item only after its acceptance test passes. Keep WhatsApp and 99envíos explicitly outside the completed scope.

- [ ] **Step 7: Commit closure and require clean tree**

```powershell
git add README.md ROADMAP.md docs/phase-3-closeout.md apps/admin/e2e apps/api/src/cli/seed-e2e-admin.ts
git commit -m "docs: close orders and reservations phase"
git status --short
```

Expected: empty `git status --short`.

---

## Execution checkpoints

- **Checkpoint A — foundation:** Tasks 1–3. Audit contracts and migration before domain writes.
- **Checkpoint B — inventory correctness:** Tasks 4–7. Do not begin HTTP/UI until concurrency and rollback tests pass.
- **Checkpoint C — application surface:** Tasks 8–11. Audit every response with shared schemas and every mutation with session+Origin.
- **Checkpoint D — release gate:** Task 12. Repeat full verification after the last code or documentation formatting change.

## Completion report format

The final report must include commit hashes by checkpoint; complete endpoint/state matrices; migration names and constraints; RED→GREEN evidence; test counts by suite; concurrency ×3 and E2E ×3 results; `pnpm verify`, audit, tmpfs, `git diff --check`, and clean status evidence; deviations with rationale; and operational limitations. It must not declare the phase approved merely because code exists.
