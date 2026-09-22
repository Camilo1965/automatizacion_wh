# Task 2 implementer report — Real roles and capabilities

Branch: `cursor/kairo-definitive-closeout`  
Date: 2026-09-22  
Status: **DONE**

## Summary

Replaced the unconditional `hasCapability()` stub with owner/operator roles and colon-form capabilities. Server-side `requireCapability()` / `authorize()` gates every admin domain route. Owner-only Security API + admin page manage operators with password confirmation. Existing users migrate to `owner`.

## TDD evidence

### RED

```text
pnpm --filter @camila/api exec vitest run test/capabilities.test.ts
```

Result: 1 failed / 3 passed  
Failing assertion: `expected true to be false` on  
`hasCapability(operator, 'integrations:manage')` against stub `return true`.

### GREEN

```text
pnpm --filter @camila/api exec vitest run test/capabilities.test.ts
→ 4 passed
```

## Verification run

| Suite                 | Command                                                            | Result    |
| --------------------- | ------------------------------------------------------------------ | --------- |
| Capabilities unit     | `vitest run test/capabilities.test.ts`                             | 4 passed  |
| Auth service unit     | `vitest run test/auth-service.test.ts`                             | 6 passed  |
| Contracts             | `pnpm --filter @camila/contracts test:unit`                        | 70 passed |
| AuthZ integration     | `test:integration -- test/admin-authorization.integration.test.ts` | 5 passed  |
| Auth migrations/login | `admin-auth-migrations` + `admin-auth-login`                       | 4 passed  |
| Security page unit    | `SecuritySettingsPage.test.tsx`                                    | 2 passed  |
| More page unit        | `MorePage.test.tsx`                                                | 2 passed  |
| E2E authorization     | `playwright test e2e/authorization.spec.ts`                        | 1 passed  |
| Typecheck             | api + admin + contracts `tsc --noEmit`                             | pass      |

Integration cases covered: 401 unauthenticated, 403 operator on owner-only, owner success, operator success on operate routes, create operator without exposing hashes.

## Key files

- `apps/api/src/modules/auth/capabilities.ts` — real capability matrix
- `apps/api/src/modules/auth/authorize.ts` — `requireCapability` + `AuthorizationDeniedError` (403)
- `apps/api/drizzle/0031_admin_roles_audit_sessions.sql` + meta journal/snapshot
- `apps/api/src/routes/admin/security.ts` — owner user management API
- Domain registrars wrapped via `authorize(...)` in `index.ts` / `integrations.ts`
- `packages/contracts/src/auth.ts` — `role` on `AdminUserPublic` + security bodies
- `apps/admin/src/settings/SecuritySettingsPage.tsx` + API + nav gating
- Docs: functional matrix row 18; closeout evidence Task 2 section

## Migration notes

- Adds `admin_users.role varchar(16) NOT NULL DEFAULT 'owner'` with check `(owner|operator)`
- Existing rows receive `owner` via default
- Rollback: drop check constraint + column (no data loss beyond role)

## Concerns

- Dashboard still surfaces an “Integraciones” queue link to all roles; API denies operators (403). Nav/Más hide owner links correctly.
- Contracts package must be rebuilt (`pnpm --filter @camila/contracts build`) so consumers resolve new schemas from `dist`.
- Session idle/`last_seen` columns deferred to Task 3 (role-only migration as planned).
