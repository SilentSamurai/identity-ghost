# Tenant Management API

## Overview

The Tenant Management API provides endpoints for creating and managing tenants. Tenant administrators can update their tenant's settings, retrieve credentials, and view tenant information. Creating a new tenant requires a user with sufficient permissions (typically a super admin).

All endpoints require a valid Bearer access token obtained via the OAuth 2.0 authorization flow.

**Base path:** `/api/tenant`

---

## Authentication

All endpoints require an `Authorization` header with a valid Bearer token:

```http
Authorization: Bearer <access_token>
```

The tenant context is derived from the token's `tenant` claim — the token determines which tenant the operation applies to. Users can only manage tenants they are a member of, and only if they hold the `TENANT_ADMIN` role for that tenant.

---

## Roles and Permissions

| Role           | Permissions                                                                 |
|----------------|-----------------------------------------------------------------------------|
| `SUPER_ADMIN`  | Can create tenants and manage any tenant                                    |
| `TENANT_ADMIN` | Can update, read, and delete their own tenant; can read credentials         |
| `TENANT_VIEWER`| Can read tenant information; cannot update settings or read credentials     |

---

## Create Tenant

```http
POST /api/tenant/create
```

`protected`  `application/json`

Creates a new tenant. The authenticated user becomes the first member and is automatically assigned the `TENANT_ADMIN` role in the new tenant. A default OAuth client is created for the tenant automatically.

Requires `SUPER_ADMIN` role (authenticated against the super tenant domain).

**Request Body**

```json
{
    "name": "Acme Corp",
    "domain": "acme.example.com"
}
```

| Parameter | Required | Description                                                  |
|-----------|----------|--------------------------------------------------------------|
| `name`    | Yes      | Display name for the tenant (max 20 chars)                   |
| `domain`  | Yes      | Unique domain identifier for the tenant (max 100 chars)      |

> **Note:** The `domain` must be unique across all tenants. If the domain is already taken, the request will fail with a `400` error.

**Response**

Returns the newly created tenant object:

```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Acme Corp",
    "domain": "acme.example.com",
    "allowSignUp": false,
    "createdAt": "2024-03-01T12:00:00.000Z"
}
```

| Field         | Type    | Description                                              |
|---------------|---------|----------------------------------------------------------|
| `id`          | string  | UUID of the newly created tenant                         |
| `name`        | string  | Display name of the tenant                               |
| `domain`      | string  | Unique domain identifier                                 |
| `allowSignUp` | boolean | Whether self-registration is enabled (defaults to `false`) |
| `createdAt`   | string  | ISO 8601 timestamp of tenant creation                    |

**What happens on creation**

1. The tenant record is created with the provided `name` and `domain`.
2. A default OAuth client is created for the tenant (aliased to the tenant domain).
3. A signing key pair is generated for the tenant (used to sign JWTs).
4. The requesting user is added as a member with the `TENANT_ADMIN` role.
5. `TENANT_ADMIN` and `TENANT_VIEWER` roles are created for the tenant.

**Error Responses**

| Status | Description                                          |
|--------|------------------------------------------------------|
| `400`  | Invalid request body or domain is already taken      |
| `401`  | Missing or invalid access token                      |
| `403`  | Insufficient permissions (requires `SUPER_ADMIN`)    |

---

## Update Current Tenant

```http
PATCH /api/tenant/my
```

`protected`  `application/json`

Updates settings for the tenant associated with the current access token. Requires the `TENANT_ADMIN` role.

**Request Body**

All fields are optional. Only the fields provided will be updated.

```json
{
    "name": "Acme Corporation",
    "allowSignUp": true
}
```

| Parameter     | Required | Description                                                    |
|---------------|----------|----------------------------------------------------------------|
| `name`        | No       | New display name for the tenant (max 128 chars)                |
| `allowSignUp` | No       | Whether to allow users to self-register to this tenant         |

**Response**

Returns the updated tenant object:

```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Acme Corporation",
    "domain": "acme.example.com",
    "allowSignUp": true,
    "createdAt": "2024-03-01T12:00:00.000Z"
}
```

**Error Responses**

| Status | Description                                              |
|--------|----------------------------------------------------------|
| `400`  | Invalid request body                                     |
| `401`  | Missing or invalid access token                          |
| `403`  | Insufficient permissions (requires `TENANT_ADMIN` role)  |
| `404`  | Tenant not found                                         |

---

## Delete Current Tenant

```http
DELETE /api/tenant/my
```

`protected`

Deletes the tenant associated with the current access token. This is a destructive operation — all tenant data including members, roles, clients, and groups will be removed. Requires the `TENANT_ADMIN` role.

**Response**

Returns the deleted tenant object:

```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Acme Corporation",
    "domain": "acme.example.com",
    "allowSignUp": true,
    "createdAt": "2024-03-01T12:00:00.000Z"
}
```

**Error Responses**

| Status | Description                                              |
|--------|----------------------------------------------------------|
| `401`  | Missing or invalid access token                          |
| `403`  | Insufficient permissions (requires `TENANT_ADMIN` role)  |
| `404`  | Tenant not found                                         |

---

## Get Tenant Credentials

```http
GET /api/tenant/my/credentials
```

`protected`  `application/json`

Returns the OAuth credentials and public signing key for the tenant associated with the current access token. Requires the `TENANT_ADMIN` role (or a technical token issued for the tenant).

**Response**

```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "clientId": "acme.example.com",
    "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----"
}
```

| Field       | Type   | Description                                                        |
|-------------|--------|--------------------------------------------------------------------|
| `id`        | string | UUID of the tenant                                                 |
| `clientId`  | string | The `client_id` of the tenant's default OAuth client (the domain) |
| `publicKey` | string | PEM-encoded RSA public key used to verify JWTs issued by this tenant |

> **Note:** The `client_secret` is not returned by this endpoint. It is only revealed when the client is created or when the secret is rotated via the [Client API](client-api.md).

**Error Responses**

| Status | Description                                                          |
|--------|----------------------------------------------------------------------|
| `401`  | Missing or invalid access token                                      |
| `403`  | Insufficient permissions (requires `TENANT_ADMIN` role or technical token) |
| `404`  | Tenant not found                                                     |

---

## Get Tenant Information

```http
GET /api/tenant/my/info
```

`protected`  `application/json`

Returns detailed information about the tenant associated with the current access token, including the default OAuth `client_id`. Requires at least the `TENANT_VIEWER` role.

**Response**

```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Acme Corp",
    "domain": "acme.example.com",
    "allowSignUp": false,
    "createdAt": "2024-03-01T12:00:00.000Z",
    "clientId": "acme.example.com"
}
```

| Field         | Type    | Description                                                        |
|---------------|---------|--------------------------------------------------------------------|
| `id`          | string  | UUID of the tenant                                                 |
| `name`        | string  | Display name of the tenant                                         |
| `domain`      | string  | Unique domain identifier                                           |
| `allowSignUp` | boolean | Whether self-registration is enabled for this tenant               |
| `createdAt`   | string  | ISO 8601 timestamp of tenant creation                              |
| `clientId`    | string  | The `client_id` of the tenant's default OAuth client (the domain) |

**Error Responses**

| Status | Description                                                         |
|--------|---------------------------------------------------------------------|
| `401`  | Missing or invalid access token                                     |
| `403`  | Insufficient permissions (requires `TENANT_VIEWER` role or higher) |
| `404`  | Tenant not found                                                    |

---

## See Also

- [Member Management API](member-management-api.md) — Managing tenant members and their roles
- [Client API](client-api.md) — Managing OAuth clients within a tenant
- [Registration API](registration-api.md) — Registering a new tenant domain with an admin user
- [User Management API](user-management-api.md) — Managing the authenticated user's own account
- [Architecture Overview](architecture.md) — Multi-tenant model and tenant isolation
