# Testing Strategy

- For the backend (`srv/`), write **integration tests** only. Do not write unit tests.
- For the UI, write **Cypress integration tests** only. Do not write any other type of test (no unit tests, no component tests).
- No other test types should be generated for this project.

## What This Means

### Backend Integration Tests
- Spin up the full NestJS module with real (or test) database connections.
- Send actual HTTP requests to controllers and verify the entire flow: controller → service → repository → database.
- Do not mock services or repositories. Test that components work together correctly.
- This catches wiring issues, serialization problems, auth middleware behavior, and database constraints.

### Cypress Integration Tests (UI)
- Launch the UI in a real browser and interact with it as a user would (clicking, typing, navigating).
- Tests hit the running backend, verifying the full stack from the user's perspective.
- Assert on what's visible on screen, not on internal component state.
- This catches rendering issues, form flows, navigation, and frontend-backend integration problems.
