# Premium Admin Experience Design

**Date:** 2026-09-10  
**Status:** Approved design direction; pending written-spec review  
**Product:** WhatsApp Commerce Automation

## 1. Objective

Turn the existing operational foundation into a polished, mobile-first commerce workspace for one store owner. The finished panel must let her understand what requires attention, answer WhatsApp conversations, create and maintain catalog references, operate orders and shipping, and reconcile inventory with Treinta without technical knowledge.

The connected sales number currently uses WhatsApp Business. The target channel architecture is official WhatsApp Business App and Cloud API coexistence, so the owner can answer from her phone or from the panel using the same number. Coexistence eligibility and onboarding must be validated against the actual Meta business account before production migration.

## 2. Current-state findings

- The panel has functional routes but still reads as an engineering administration shell.
- Conversations show conversation state and bot/human ownership, but no message history or composer. Taking control currently pauses automation; it does not let the owner reply.
- New reference creation captures only code, model, color, and price. Photo and stock require a second visit to the detail screen.
- Catalog import accepts a strict CSV and exposes technical validation results without a guided Treinta workflow.
- Shipping preferences support a policy model but still use a free-text carrier field and raw locality code.
- The dashboard and navigation do not yet expose enough operational priority or visual hierarchy.

## 3. Product principles

1. Every screen answers “what needs attention now?” before showing secondary information.
2. Every visible action has a working outcome, loading state, error state, and recovery path.
3. Technical identifiers are secondary. People select municipalities, carriers, products, and statuses by human-readable names.
4. Desktop and 390 px mobile layouts support the complete operational workflow.
5. The bot and human operator never answer the same conversation concurrently.
6. External uncertainty from Meta or 99envíos is displayed explicitly and never converted into silent retries that could duplicate a message or guide.
7. Treinta remains a manual file boundary until an official supported integration becomes available.

## 4. Channel architecture and coexistence

### 4.1 Target behavior

The same WhatsApp Business number must support:

- automated messages sent by the platform;
- manual messages sent from the admin panel;
- manual messages sent from the WhatsApp Business mobile app;
- a unified conversation timeline in the panel;
- source attribution for bot, panel owner, mobile app, and customer messages;
- automatic bot suspension after human intervention;
- explicit bot resumption from a known conversation state.

### 4.2 Coexistence prerequisite

WhatsApp Business App coexistence is not equivalent to registering an ordinary Cloud API number. Production onboarding must use Meta's supported coexistence flow and confirm that the business account, country, number, app version, and onboarding method are eligible. The current Meta test number is only for development and cannot represent mobile coexistence.

The system will contain a connection-capability record:

```ts
type WhatsAppConnectionMode = 'cloud_api_only' | 'business_app_coexistence';

interface WhatsAppConnectionCapabilities {
  mode: WhatsAppConnectionMode;
  mobileAppAvailable: boolean;
  historySyncAvailable: boolean;
  mobileEchoEventsAvailable: boolean;
  checkedAt: string;
}
```

The UI must not claim that mobile sync is active until the actual connection reports the required capabilities.

### 4.3 Human takeover rules

- `bot`: automation may process inbound customer messages.
- `human_panel`: the owner took control in the panel and can use the composer.
- `human_mobile`: an outbound echo or supported mobile-origin event indicates that the owner answered from the phone.
- `paused_attention`: automation stopped because of an operational error or explicit customer request.

When a human reply is detected, queued bot messages for that conversation are cancelled before any new automated response is accepted. Resuming the bot requires an explicit action that shows the state it will resume from. The system must never guess a state after an unstructured manual exchange.

### 4.4 WhatsApp messaging constraints

Inside the customer-service window, the owner can send free-form messages. Outside the allowed window, the composer must explain why free text is unavailable and offer approved message templates. Delivery lifecycle is stored as `queued`, `sent`, `delivered`, `read`, or `failed`.

## 5. Information architecture

### 5.1 Desktop navigation

- Inicio
- Conversaciones
- Pedidos
- Catálogo
- Inventario
  - Existencias
  - Importar desde Treinta
  - Cierres diarios
- Envíos
- Alertas
- Configuración
  - Negocio
  - WhatsApp
  - Envíos
  - Notificaciones
  - Inventario
  - Integraciones

The sidebar displays unread or actionable counts for conversations, orders, alerts, and inventory closure.

### 5.2 Mobile navigation

The bottom navigation contains Inicio, Conversaciones, Pedidos, Catálogo, and Más. The primary action for the current screen appears in a fixed safe-area-aware action bar when appropriate.

### 5.3 Global header

- contextual page title and breadcrumb;
- global search for phone, customer, order, and reference;
- WhatsApp connection status;
- notification center;
- owner menu;
- quick actions for new reference, manual order, and daily closure.

## 6. Visual system

### 6.1 Brand direction

- Background: cream `#F7F4EF`.
- Surface: white `#FFFFFF`.
- Primary text: dark brown `#27211E`.
- Primary accent: deep green `#236052`.
- Secondary accent: terracotta `#B65C43`.
- Semantic colors include accessible text and icon treatment for success, warning, danger, and information.
- System font stack; no remote font dependency.
- Minimum touch target of 44 by 44 px.
- WCAG 2.2 AA contrast, visible focus, reduced-motion support, and keyboard operation.

### 6.2 Shared components

Create focused components for buttons, icon buttons, fields, currency input, select, searchable combobox, file dropzone, status badge, statistics card, responsive data list, drawer, modal, toast, skeleton, empty state, error state, tabs, stepper, page header, filters, pagination, and mobile action bar.

Desktop tables collapse into purpose-built mobile cards. Horizontal scrolling is not the default mobile solution.

## 7. Dashboard

The first viewport prioritizes operational queues:

1. Conversations requiring attention.
2. Shipping-guide incidents.
3. Orders ready to dispatch.
4. Orders waiting for customer confirmation.
5. Pending Treinta closure.
6. Low-stock references.
7. Integration failures.

Below the queues, daily metrics show new conversations, confirmed orders, dispatched orders, COD value, created guides, incidents, reserved units, and average first-response time. Every card opens its corresponding filtered screen.

## 8. Conversation inbox

### 8.1 Layout

Desktop uses three regions: conversation list, chat timeline, and customer/order context. Mobile uses separate navigable screens with preserved scroll position and drafts.

### 8.2 Conversation list

Each item shows customer name when available, phone, last-message preview, timestamp, unread count, operational label, bot/human owner, related order, and attention priority. Search and filters cover unread, needs attention, bot active, human active, confirmed order, shipping incident, and closed.

### 8.3 Timeline

The timeline renders customer messages, bot messages, panel messages, mobile-app echoes, product images, order summaries, quote selections, guide events, and delivery failures. Internal state transitions use quiet event separators rather than chat bubbles.

### 8.4 Composer

Taking control atomically pauses the bot and enables text, image attachment, and approved quick replies. The composer displays the service-window deadline. Outside the service window, only approved templates can be selected. Sending is idempotent and visibly progresses through queued, sent, delivered, read, or failed.

### 8.5 Customer context

The right panel shows contact data, expected bot input, selected size/reference, active order, shipping selection, guide, timeline, and actions to open the full order or resume the bot.

## 9. Catalog experience

### 9.1 Catalog list

Provide grid and compact table views. Every reference displays its image, code, model, color, price, available sizes, physical/reserved/available stock, readiness, and warnings. Filters include active, inactive, missing photo, out of stock, low stock, size, model, color, and ready for WhatsApp.

### 9.2 New-reference wizard

Creation is a four-step draft workflow:

1. Basic information: reference code, model, color, price, optional internal note.
2. Main photo: drag and drop, file picker, mobile camera, preview, replace, validation.
3. Size matrix: whole and half sizes, quantities, bulk editing, and reserved-stock explanation.
4. Review: final WhatsApp-facing card, validation summary, save draft, or save and activate.

A reference can activate only when it has one valid main photo and positive available stock in at least one size. The draft persists between steps and supports recovery after refresh. Creating data, photo metadata, and initial stock is coordinated so partial failure has a visible recovery path.

### 9.3 Reference detail

Use tabs for Resumen, Fotografía, Tallas y stock, Movimientos, and Actividad. The primary actions are edit, replace photo, adjust stock, activate/deactivate, and duplicate reference.

## 10. Treinta import experience

### 10.1 Purpose

Import is for initial catalog/stock loading and controlled bulk updates from Treinta. It is not the normal way to create one new product.

### 10.2 Supported inputs

- XLSX exported from Treinta;
- CSV exported from Treinta;
- product template generated by this system.

### 10.3 Wizard

1. Select origin and file.
2. Detect spreadsheet sheet and headers.
3. Map source columns to reference, model, color, price, size, and quantity.
4. Preview new, updated, ignored, and invalid rows.
5. Resolve blocking conflicts.
6. Confirm atomic import.
7. Enter the photo-preparation queue.

Column mappings are saved by source profile. Import previews never change inventory. Invalid imports preserve existing data. Errors can be downloaded with row number, source value, field, and remediation.

## 11. Shipping preferences

### 11.1 Provider catalog

The documented 99envíos quotation response covers Interrapidísimo, TCC, Servientrega, Coordinadora, and Envia. The API does not document a separate carrier-list endpoint. The application therefore owns a versioned provider catalog containing those carriers and records real availability from quotation responses.

Carrier fields are closed searchable selects. Free-text carrier identifiers are not accepted.

### 11.2 Global policy

Global settings include automatic selection, primary and secondary preferred carrier, fallback behavior, customer offer mode, protected-insurance level, declared-value rule, package defaults, COD behavior, and quote-validity duration.

### 11.3 Municipal rules

Municipalities are selected by searchable name, department, and DANE/carrier code. A municipal rule can configure:

- primary carrier;
- secondary carrier;
- allow any other carrier or block;
- customer choice, economy only, or protected only;
- standard or Plus protection;
- active/inactive state;
- effective dates when operationally necessary.

The editor always produces a natural-language explanation of the effective behavior.

### 11.4 Quote simulator

The simulator accepts municipality, product value, weight, dimensions, and COD. It displays policy source, all provider responses, selected alternatives, selection reasons, each charge, insurance, and final COD total. It never creates a guide. Quotation caching and rate-limit protection respect the provider's documented 300-quotes-per-hour limit.

## 12. Orders, inventory, alerts, and integrations

### 12.1 Orders

Quick views cover attention, waiting for customer, confirmed, generating guide, ready to dispatch, sent, delivered, cancelled, and returned. Detail combines product, customer, destination, selected quote, insurance, guide/PDF, conversation, inventory impact, alerts, and event timeline.

### 12.2 Inventory

Show physical, reserved, available, sold-pending-Treinta, low-stock, and conflict quantities. Every adjustment records reason, source, actor, and related order or closure.

### 12.3 Daily closures

The daily closure groups confirmed/dispatched sales, cancellations, returns, and reference-size deltas. A movement is exported once. Reopening creates a compensating version and retains the original audit record.

### 12.4 Alerts

Persistent alerts cover guide uncertainty, expired quote, unavailable required carrier, WhatsApp failure, human request, insufficient stock, missing PDF, pending closure, and integration outage. Each alert provides a concrete next action and deduplicated retry behavior.

### 12.5 Integrations

The integrations page shows WhatsApp mode/capabilities, last webhook, last message, 99envíos authentication and latest quote/guide, database, media storage, scheduler, and closure worker. Connection checks must not send customer messages or create guides.

## 13. Backend boundaries

New or expanded modules must have one clear responsibility:

- conversation transcript and message-source persistence;
- manual-message command service;
- human-control state coordinator;
- WhatsApp capability and service-window evaluator;
- provider-carrier catalog;
- locality search;
- catalog draft wizard;
- spreadsheet parser and column mapper;
- alert center;
- daily inventory closure.

Shared Zod contracts validate every panel response and mutation. Mutations require authenticated session, valid Origin, idempotency where external effects are possible, and audit data.

## 14. Error handling

- Meta failure: retain the failed outbound item with safe provider code and manual retry when appropriate.
- Uncertain WhatsApp send: reconcile by provider message ID before retrying.
- Mobile coexistence unavailable: show Cloud API only and provide a migration checklist; do not display mobile-sync claims.
- 99envíos rate limit: display retry time and reuse valid cached quotes.
- Required carrier unavailable: stop the order, create an attention alert, and preserve customer context.
- Photo failure: retain the reference draft and permit retry without re-entering product data.
- Import failure: change no stock and provide row-level remediation.
- Expired session: return to login and restore safe unsaved drafts after authentication.

## 15. Testing and acceptance

Required automated coverage includes contracts, domain units, PostgreSQL integration, HTTP integration, component behavior, accessibility checks, and Playwright desktop/mobile flows.

The experience is accepted only when:

1. The owner can answer a real WhatsApp conversation from the panel.
2. A supported mobile-app reply appears in the panel and pauses the bot.
3. The panel clearly reports when coexistence capability is unavailable.
4. Bot resume identifies the exact state that will continue.
5. A reference can be created with photo, price, sizes, and stock in one flow.
6. Treinta XLSX/CSV can be mapped and previewed without manually rewriting headers.
7. Carrier selection uses the five-provider catalog rather than free text.
8. Municipality selection uses name and department rather than raw code.
9. Global and municipal fallback, offer, and insurance policies affect real quote selection.
10. Dashboard cards open actionable filtered queues.
11. Critical workflows work at 390 px and 1280 px.
12. No visible action is decorative or routed to an empty destination.
13. External side effects are idempotent and uncertain results are not blindly retried.
14. Existing data migrates from migration `0000` to the latest schema without loss.

## 16. Delivery sequence

1. Visual system, shell, navigation, responsive foundations, and dashboard.
2. Conversation transcript, manual replies, takeover rules, and service-window behavior.
3. Coexistence onboarding validation, capability reporting, and mobile-message attribution.
4. Catalog grid, complete reference wizard, and reference detail.
5. Treinta XLSX/CSV mapping, preview, import, and photo-preparation queue.
6. Carrier catalog, locality search, global/municipal policy editor, and quote simulator.
7. Orders, inventory closures, alerts, and integration health.
8. Accessibility, mobile/desktop E2E, migration audit, security review, and controlled production acceptance.

Each sequence item closes with tests, migration verification where applicable, review evidence, and an independent commit.

## 17. External references

- Meta WhatsApp Business Platform official collection: <https://www.postman.com/meta/whatsapp-business-platform/overview>
- Meta Embedded Signup overview: <https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview>
- 99envíos API documentation: <https://integration.99envios.app/api-docs>

