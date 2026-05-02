# Testing Strategy

- For the backend (`srv/`), write **integration tests** only. Do not write unit tests.
- For the UI, write **Cypress integration tests** only. Do not write any other type of test (no unit tests, no component
  tests).
- No other test types should be generated for this project.

## What This Means

### Backend Integration Tests

- Spin up the full NestJS module with real (or test) database connections.
- Send actual HTTP requests to controllers and verify the entire flow: controller → service → repository → database.
- Do not mock services or repositories. Test that components work together correctly.
- This catches wiring issues, serialization problems, auth middleware behavior, and database constraints.

### Backend Test Isolation (Critical)

All backend tests under `srv/tests/` run against a **single shared NestJS server** started once by `globalSetup`. Tests
are **not isolated** from each other — they share the same database, sessions, users, and tenants.

**Rule: Every test suite must use its own dedicated tenant.** Never reuse a tenant across test suites that mutate
state (sessions, roles, user locks, etc.).

To add a new isolated tenant:

1. Add a seed entry in `srv/src/startUp.service.ts` → `createDummyTenantAndUser()` → `dummyTenants` array (e.g.
   `{name: "My Feature Test Tenant", domain: "my-feature-test.local", signUp: false}`).
2. In the test file, set `clientId = 'my-feature-test.local'` and `email = 'admin@my-feature-test.local'`. The password
   for all seeded admins is `admin9000`.
3. The seed logic automatically creates the admin user, tenant, default client, and enables the password grant.

`auth.server.com` (the super tenant) should only be used for setup operations that need super-admin privileges (creating
tenants, adding members). Never use it as the primary tenant for test assertions.

### Cypress Integration Tests (UI)

- Launch the UI in a real browser and interact with it as a user would (clicking, typing, navigating).
- Tests hit the running backend, verifying the full stack from the user's perspective.
- Assert on what's visible on screen, not on internal component state.
- This catches rendering issues, form flows, navigation, and frontend-backend integration problems.
