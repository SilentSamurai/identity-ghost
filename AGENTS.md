# Auth Server — Agent Guide

## Structure

- `srv/` — NestJS backend (TypeScript, TypeORM, PostgreSQL/SQLite)
- `ui/` — Angular 17 frontend (Karma unit tests, Cypress E2E)
- `external-user-app/` — mock external app for integration testing
- `compat-tests/` — OIDC conformance tests
- `specs/` — feature plans and specs
- `docs/` — docsify documentation site
- `helm/` — Kubernetes Helm charts
- `.kiro/steering/` — design principles, testing strategy, token architecture (read before making changes)
- `standalone.dockerfile` — bundles backend + UI into single image

## Env config

Backend loads `srv/envs/.env.{ENV}` based on the `ENV` variable (default: `development`).
Profiles: `development`, `testing`, `production`, `cf`, `aws`.

Testing uses `srv/envs/.env.testing` with in-memory SQLite.

## Commands

| Action | Command |
|--------|---------|
| Install all | `task build` (runs `npm i && npm run build` in srv/ and ui/) |
| Dev server | `task serve` (both backend+ui concurrently) |
| Run all tests | `task test` |
| Backend tests | `cd srv && npm test` — Jest, integration-style, shared globalSetup |
| UI unit tests | `cd ui && npm test` — Karma/ChromeHeadless |
| UI E2E | `cd ui && npm run e2e:test` — Cypress, starts all services |
| Single Cypress spec | `task cypress:spec -- cypress/e2e/some.cy.ts` |
| Build standalone image | `task docker:publish` |
| Kill ports 9001/4200 | `task kill:ports` |
| Generate migration | `cd srv && npm run generate-migration` |
| Run TypeORM CLI | `cd srv && npm run typeorm` |

## Testing quirks

- Backend tests are **integration tests** using a shared NestJS app (globalSetup/globalTeardown) across all suites for performance. Runs on port 9001 by default.
- Test infrastructure: FakeSmtpServer (ports 3101/3102), TenantAppServer (port 3103).
- Use typed API clients from `srv/tests/api-client/` (e.g. `TenantClient`, `RoleClient`, `UsersClient`) rather than raw HTTP calls.
- Onboard a test tenant for isolation; the fixture `HelperFixture` provides helpers like `enablePasswordGrant()` for token access.
- **Each test suite must use its own dedicated tenant** — suites share the same DB and are not isolated. Never reuse a tenant across suites that mutate state.
- Add a new tenant by seeding in `srv/src/startUp.service.ts` → `createDummyTenantAndUser()` → `dummyTenants` array. Password for all seeded admins is `admin9000`.
- `auth.server.com` is the super tenant — only use it for setup/onboarding operations, never for test assertions.
- `npm test` uses `--silent=true --maxWorkers=25%`. Override with `--verbose --silent=false` for debugging.
- E2E requires the full stack: backend + UI + external-user-app (handled by `start-server-and-test`).

## Architecture notes

- Config loaded by `Environment` service (reads `.env.{ENV}`, exposes typed getters). Not the standard NestJS ConfigModule.
- CORS uses database-driven origin validation (`CorsOriginService`). Not a static allowlist.
- DB migrations use TypeORM with `synchronize: false` — always generate and run migrations.
- Cookie signing with `COOKIE_SECRET` env var. Required in production; falls back to an insecure dev secret if absent in dev.
- Graceful shutdown on SIGTERM/SIGINT: closes NestJS app and SMTP server.
- Token expiry validated on startup: `TOKEN_EXPIRATION_TIME_IN_SECONDS` must exceed `JWT_CLOCK_SKEW_SECONDS`.
- JWT `scopes` = OIDC values only (`openid`, `profile`, `email`); `roles` = role enums (`SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_VIEWER`). Never mix. CASL derives abilities from `roles`, never `scopes`.
- UI sections (admin vs user) must be completely independent — no shared components, dialogs, or API services. Duplicate rather than cross-import.
- Dialogs are plain components; data passed via `ModalService.open(Component, { initData })`. Results via `activeModal.close(data)` / `.dismiss()`.
- List pages use `DataSource` / `RestApiModel` backed by `POST /api/search/{Entity}` with `{ pageNo, pageSize, where, orderBy, expand }`.
