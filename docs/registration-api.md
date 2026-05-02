# Registration API

## Overview

The Registration API provides endpoints for creating new tenants, registering users to existing tenants, and deleting user accounts. These endpoints support the full onboarding lifecycle — from provisioning a brand-new organization to allowing individual users to self-register.

**Endpoints at a glance:**

| Endpoint | Method | Auth Required | Purpose |
|---|---|---|---|
| `/api/register-domain` | `POST` | No | Create a new tenant with an admin user |
| `/api/signup` | `POST` | No | Register a user to an existing tenant |
| `/api/signdown` | `POST` | Yes | Delete the authenticated user's account |

---

## Email Verification Flow

Both `/api/register-domain` and `/api/signup` (for new accounts) trigger an email verification step before the user can log in.

**Flow:**

1. The client submits a registration request.
2. The server creates the user account in an **unverified** state.
3. The server sends a verification email to the provided address containing a link of the form:
   ```
   {BASE_BACKEND_URL}/api/oauth/verify-email/{token}
   ```
4. The user clicks the link. The server validates the token and marks the account as verified.
5. If a `BASE_URL` is configured, the user is redirected to:
   ```
   {BASE_URL}/login?verified=true
   ```
   Otherwise, the endpoint returns `{ "status": true }`.
6. The user can now log in.

> **Important:** If the verification email cannot be sent (mail service error), the user account is automatically deleted and the registration request returns `503 Service Unavailable`. This prevents orphaned unverified accounts.

---

## Register Domain

```http
POST /api/register-domain
```

`public`  `application/json`

Creates a new tenant (organization) and registers the submitting user as its administrator. This is the entry point for new organizations onboarding to the Auth Server.

**What happens:**

1. Validates that the email address is not already in use.
2. Validates that the requested domain is not already taken.
3. Creates the user account (password hashed with argon2).
4. Sends a verification email to the provided address.
5. Creates the tenant with the specified domain and organization name.
6. Associates the new user as the tenant's admin.

> **Note:** If the mail service is unavailable, the user account is rolled back and `503` is returned. The tenant is only created after the verification email is sent successfully.

**Request Body**

```json
{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "SecurePass123!",
    "orgName": "Acme Corp",
    "domain": "acme.example.com"
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name`    | Yes      | Display name for the admin user (max 128 chars, alphanumeric and spaces) |
| `email`   | Yes      | Email address for the admin user (valid email, max 128 chars) |
| `password`| Yes      | Password for the admin user (max 128 chars, must meet complexity requirements) |
| `orgName` | Yes      | Display name for the new tenant/organization (max 128 chars) |
| `domain`  | Yes      | Unique domain identifier for the tenant (max 128 chars, e.g., `acme.example.com`) |

**Response**

```json
{
    "success": true
}
```

| Field     | Type    | Description |
|-----------|---------|-------------|
| `success` | boolean | `true` when the tenant and user were created and the verification email was sent |

**Error Responses**

| Status | Description |
|--------|-------------|
| `400`  | Validation error (missing/invalid fields) or the requested domain is already taken |
| `409`  | The email address is already registered |
| `503`  | Mail service unavailable — account was not created |

**Example**

```http
POST /api/register-domain
Content-Type: application/json

{
    "name": "Jane Doe",
    "email": "jane@acme.example.com",
    "password": "SecurePass123!",
    "orgName": "Acme Corp",
    "domain": "acme.example.com"
}
```

```json
{
    "success": true
}
```

---

## Sign Up

```http
POST /api/signup
```

`public`  `application/json`

Registers a user to an existing tenant. The tenant must have self-registration enabled (`allowSignUp: true`). This endpoint is intended for end-user sign-up flows embedded in a tenant's own application.

**What happens:**

1. Resolves the target tenant from the `client_id` field — first by looking up a registered OAuth client with that ID or alias, then by looking up a tenant by domain.
2. Checks that the tenant has `allowSignUp` enabled. If not, returns `400`.
3. If the email is **not** already registered:
   - Creates a new user account (password hashed with argon2).
   - Sends a verification email.
   - If the mail service fails, the account is rolled back and `503` is returned.
4. If the email **is** already registered:
   - Validates the provided password against the existing account.
5. Adds the user as a member of the tenant (if not already a member).

> **Note:** A tenant admin can enable or disable self-registration via the [Tenant Management API](tenant-management-api.md).

**Request Body**

```json
{
    "name": "Bob Smith",
    "email": "bob@example.com",
    "password": "SecurePass123!",
    "client_id": "acme.example.com"
}
```

| Parameter   | Required | Description |
|-------------|----------|-------------|
| `name`      | Yes      | Display name for the new user (max 128 chars, alphanumeric and spaces) |
| `email`     | Yes      | Email address for the new user (valid email, max 128 chars) |
| `password`  | Yes      | Password for the new user (max 128 chars, must meet complexity requirements) |
| `client_id` | Yes      | The OAuth client ID, client alias, or tenant domain to sign up to (max 128 chars) |

**Response**

```json
{
    "success": true
}
```

| Field     | Type    | Description |
|-----------|---------|-------------|
| `success` | boolean | `true` when the user was registered and added to the tenant |

**Error Responses**

| Status | Description |
|--------|-------------|
| `400`  | Validation error, tenant not found, or the tenant does not allow self-registration |
| `401`  | Existing email provided but password is incorrect |
| `503`  | Mail service unavailable — new account was not created |

**Example — new user**

```http
POST /api/signup
Content-Type: application/json

{
    "name": "Bob Smith",
    "email": "bob@example.com",
    "password": "SecurePass123!",
    "client_id": "acme.example.com"
}
```

```json
{
    "success": true
}
```

**Example — existing user joining a second tenant**

```http
POST /api/signup
Content-Type: application/json

{
    "name": "Bob Smith",
    "email": "bob@example.com",
    "password": "SecurePass123!",
    "client_id": "another-tenant.example.com"
}
```

```json
{
    "success": true
}
```

---

## Sign Down

```http
POST /api/signdown
```

`protected`  `application/json`

Permanently deletes the authenticated user's own account. The user must provide their current password to confirm the deletion.

> **Warning:** This action is irreversible. The user account and all associated data are permanently removed.

**Request Body**

```json
{
    "password": "SecurePass123!"
}
```

| Parameter  | Required | Description |
|------------|----------|-------------|
| `password` | Yes      | The user's current password, used to confirm the deletion (max 128 chars) |

**Response**

```json
{
    "status": true
}
```

| Field    | Type    | Description |
|----------|---------|-------------|
| `status` | boolean | `true` when the account was successfully deleted |

**Error Responses**

| Status | Description |
|--------|-------------|
| `400`  | Invalid request body or incorrect password |
| `401`  | Missing or invalid access token |

**Example**

```http
POST /api/signdown
Authorization: Bearer <access_token>
Content-Type: application/json

{
    "password": "SecurePass123!"
}
```

```json
{
    "status": true
}
```

---

## Password Requirements

All passwords submitted to registration endpoints must meet the following complexity requirements:

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

Passwords exceeding 128 characters are rejected.

---

## Endpoint Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/register-domain` | Public | Create a new tenant with an admin user |
| `POST` | `/api/signup` | Public | Register a user to an existing tenant |
| `POST` | `/api/signdown` | Bearer token | Delete the authenticated user's account |

---

## See Also

- [User Management API](user-management-api.md) — Managing the authenticated user's profile
- [Tenant Management API](tenant-management-api.md) — Configuring tenant settings including `allowSignUp`
- [Member Management API](member-management-api.md) — Managing tenant members and roles
- [Getting Started](getting-started.md) — End-to-end guide for onboarding a new tenant
