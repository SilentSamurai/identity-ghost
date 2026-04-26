# Multi‑Tenant Onboarding Design

## Goal
Provide a seamless onboarding experience for companies that need to use the Todo app. The onboarding should:

1. Create a tenant for the company.
2. Ensure the Todo app has its own tenant (created once).
3. Create the Todo app record under the Todo‑app tenant.
4. Subscribe the company tenant to the Todo app.
5. Seed initial data and provide a first‑time admin user.
6. Return a short success response.

## Flow

```
POST /api/companies/onboard
  {
    "name": "Acme Corp",
    "contactEmail": "admin@acme.com"
  }
```

**Steps**
1. **Create company tenant** – `TenantService.create({name, domain})`.
2. **Ensure Todo‑app tenant exists** – create if missing.
3. **Create Todo app** – `AppService.create({name, appUrl, ownerTenantId})`.
4. **Create subscription** – `SubscriptionService.create({subscriberTenantId, appId})`.
5. **Seed data** – run `TodoSeeder.seedForTenant(companyTenantId)`.
6. **Return** – `tenantId`, `appUrl`, and welcome message.

## API Endpoint
```ts
// companies.controller.ts
@Post('onboard')
async onboardCompany(@Body() dto: CreateCompanyDto) {
  // implementation as described above
}
```

## Data Model
- **Tenant** – holds company identity, users, roles, groups, apps, subscriptions.
- **App** – owned by Todo‑app tenant.
- **Subscription** – links company tenant to Todo app.

## Error handling
- Validate input.
- Catch database errors (e.g., duplicate domain). Return 400.
- Wrap all DB operations in a transaction; rollback on failure.

## Security
- API key or OAuth token required for this endpoint.
- Rate limit to prevent abuse.
- No direct tenant ID exposure; return sanitized response.

## Extensibility
- Add optional parameters (custom domain, pre‑selected subscription plan).
- Hook into billing service after subscription.

## Reference
- Azure multi‑tenant patterns.
- Stripe Connect onboarding.
- Auth0 Tenant API.

---

## Checklist
- [ ] Create `docs/multi-tenant-onboarding.md`.
- [ ] Add to `docs/README.md` if exists.
- [ ] Include diagrams if needed.

---

## Next Steps
1. Write the API implementation.
2. Add unit tests.
3. Deploy to staging and test with a mock tenant.
