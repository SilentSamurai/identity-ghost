# Multi-Tenant Onboarding

The onboarding endpoint allows apps to programmatically provision tenants, subscriptions, and initial admin users in a single API call. It supports two patterns:

- **Enterprise onboarding** — create a dedicated tenant per customer
- **Community onboarding** — add users to a shared pre-existing tenant

---

## Onboard Customer

```http
[POST] /api/apps/{appId}/onboard-customer
```

`protected (technical token)`  `application/json`

Creates a tenant and subscription for the given app, optionally provisioning an initial admin user with all of the app's roles assigned.

### Authorization

This endpoint requires a **technical token** obtained via the `client_credentials` grant. The token's tenant must match the app's owner tenant.

| Condition | Result |
|-----------|--------|
| Missing or invalid `Authorization` header | `401 Unauthorized` |
| User token (not a technical token) | `403 Forbidden` |
| Technical token from a tenant that does not own the app | `403 Forbidden` |
| `appId` does not reference a valid app | `404 Not Found` |

To obtain a technical token:

```http
POST /api/oauth/token
Content-Type: application/json

{
    "grant_type": "client_credentials",
    "client_id": "<owner-tenant-client-id>",
    "client_secret": "<owner-tenant-client-secret>"
}
```

### Request

| Parameter    | Type   | Required | Description |
|--------------|--------|----------|-------------|
| `tenantName` | string | Yes      | Display name for the new tenant |
| `tenantDomain` | string | Yes   | Unique domain identifier for the tenant |
| `userEmail`  | string | No       | Email address for the initial admin user |
| `userName`   | string | No       | Full name for the initial admin user. Required when `userEmail` is provided |

When `userEmail` and `userName` are provided, the endpoint creates the user, adds them as a tenant member, and assigns all of the app's roles. The user receives an email with a temporary password.

When user fields are omitted, only the tenant and subscription are created.

### Response

**201 Created** — new tenant provisioned

```json
{
    "tenantId": "uuid",
    "subscriptionId": "uuid",
    "userId": "uuid",
    "roleNames": ["editor", "viewer"]
}
```

`userId` and `roleNames` are included only when a user was provided in the request.

**200 OK** — existing tenant, subscription updated or unchanged

```json
{
    "tenantId": "uuid",
    "subscriptionId": "uuid"
}
```

### Error Responses

| Status | Condition |
|--------|-----------|
| `400 Bad Request` | Missing required fields or invalid input (e.g., invalid email format, `userName` missing when `userEmail` provided) |
| `401 Unauthorized` | Missing or invalid authorization token |
| `403 Forbidden` | Token is not a technical token, or token's tenant does not own the app |
| `404 Not Found` | `appId` does not reference a valid app |

---

## Behavior

### New Tenant

When `tenantDomain` does not match any existing tenant, the endpoint:

1. Creates the tenant with the given `tenantName` and `tenantDomain`
2. Creates a subscription linking the tenant to the app
3. If user fields are provided: creates the user, adds them to `tenant_members`, assigns all app roles via `user_roles`, and sends a password reset email

### Existing Tenant — Already Subscribed

When the tenant exists and already has a subscription to the app:

- **With user fields**: upserts role assignments for all app roles (adds any missing roles)
- **Without user fields**: returns the existing subscription without modification

### Existing Tenant — Not Subscribed

When the tenant exists but has no subscription to the app:

1. Creates the subscription
2. If user fields are provided: assigns all app roles via `user_roles`

---

## Idempotency

Duplicate requests are safe. The endpoint uses database unique constraints to prevent duplicate records:

- Calling with the same `tenantDomain` twice returns the same `tenantId` and `subscriptionId`
- Calling with the same `userEmail` for an already-onboarded user returns the existing `userId` without creating duplicates
- Role assignments use the composite primary key `(tenant_id, user_id, role_id)` to prevent duplicate rows

Network retries and race conditions will not produce inconsistent state.

---

## Enterprise Onboarding Example

Provision a dedicated tenant for a new enterprise customer with an initial admin user.

**Request**

```http
POST /api/apps/550e8400-e29b-41d4-a716-446655440000/onboard-customer
Authorization: Bearer <technical-token>
Content-Type: application/json

{
    "tenantName": "Acme Corp",
    "tenantDomain": "acme-corp.example.com",
    "userEmail": "admin@acme-corp.com",
    "userName": "Alice Johnson"
}
```

**Response** `201 Created`

```json
{
    "tenantId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "subscriptionId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "userId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "roleNames": ["editor", "viewer", "admin"]
}
```

The user `admin@acme-corp.com` receives an email with a temporary password and login instructions. They are assigned all of the app's roles and can manage role assignments for subsequent users via the tenant admin UI.

---

## Community Tenant Onboarding Example

Add a free-tier user to a shared community tenant. The community tenant is pre-created by the app owner before onboarding begins.

**Step 1 — Pre-create the community tenant** (one-time setup)

```http
POST /api/apps/550e8400-e29b-41d4-a716-446655440000/onboard-customer
Authorization: Bearer <technical-token>
Content-Type: application/json

{
    "tenantName": "MyApp Community",
    "tenantDomain": "community.myapp.com"
}
```

**Response** `201 Created`

```json
{
    "tenantId": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "subscriptionId": "e5f6a7b8-c9d0-1234-efab-345678901234"
}
```

**Step 2 — Onboard a user to the community tenant**

```http
POST /api/apps/550e8400-e29b-41d4-a716-446655440000/onboard-customer
Authorization: Bearer <technical-token>
Content-Type: application/json

{
    "tenantName": "MyApp Community",
    "tenantDomain": "community.myapp.com",
    "userEmail": "user@example.com",
    "userName": "Bob Smith"
}
```

**Response** `200 OK`

```json
{
    "tenantId": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "subscriptionId": "e5f6a7b8-c9d0-1234-efab-345678901234",
    "userId": "f6a7b8c9-d0e1-2345-fabc-456789012345",
    "roleNames": ["editor", "viewer", "admin"]
}
```

Since the tenant already exists and is subscribed, the endpoint adds the user as a member and assigns all app roles. Subsequent calls with the same `userEmail` are idempotent.

---

## Email Notifications

| Scenario | Email sent? |
|----------|-------------|
| New user created during onboarding | Yes — temporary password / reset link |
| Existing user added to a new tenant | No |
| Duplicate onboarding call for same user | No |
| Onboarding without user fields | No |

Email delivery failures are logged but do not roll back the onboarding transaction.

---

## Transaction Guarantees

All database operations within a single onboarding call (tenant creation, subscription, user creation, role assignment) are wrapped in a single transaction. If any step fails, the entire operation rolls back — no partial state is persisted.

Email delivery happens after the transaction commits and does not affect the transaction outcome.

---

## Related Documentation

- [App-Owned Roles](app-owned-roles.md) — role residency, namespacing, and policy resolution
- [Token API](token-api.md) — JWT format including namespaced app-owned roles
- [OAuth API](oauth.md) — obtaining technical tokens via `client_credentials`
