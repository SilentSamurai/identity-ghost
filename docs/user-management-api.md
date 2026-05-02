# User Management API

## Overview

The User Management API provides endpoints for users to manage their own account. All endpoints operate on the currently authenticated user — identified by the `sub` claim in the Bearer access token.

All endpoints require a valid Bearer access token obtained via the OAuth 2.0 authorization flow.

**Base path:** `/api/users`

---

## Authentication

All endpoints require an `Authorization` header with a valid Bearer token:

```http
Authorization: Bearer <access_token>
```

The user is identified from the token's `sub` claim. Users can only access and modify their own account data.

---

## Get Current User

```http
GET /api/users/me
```

`protected`  `application/json`

Returns the profile of the currently authenticated user.

**Response**

```json
{
    "id": "3f7a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "email": "user@example.com",
    "name": "Jane Doe",
    "createdAt": "2024-01-15T10:30:00.000Z"
}
```

| Field       | Type   | Description                          |
|-------------|--------|--------------------------------------|
| `id`        | string | UUID of the user                     |
| `email`     | string | User's email address                 |
| `name`      | string | User's display name                  |
| `createdAt` | string | ISO 8601 timestamp of account creation |

> **Note:** The `password`, `verified`, `locked`, `emailCount`, and `emailCountResetAt` fields are excluded from all responses.

**Error Responses**

| Status | Description                          |
|--------|--------------------------------------|
| `401`  | Missing or invalid access token      |

---

## Change Email Address

```http
PATCH /api/users/me/email
```

`protected`  `application/json`

Initiates an email address change. Rather than changing the email immediately, the server sends a confirmation link to the **new** email address. The change takes effect only after the user clicks the confirmation link.

**Request Body**

```json
{
    "email": "newemail@example.com"
}
```

| Parameter | Required | Description                                    |
|-----------|----------|------------------------------------------------|
| `email`   | Yes      | The new email address (valid email, max 128 chars) |

**Response**

```json
{
    "status": true
}
```

| Field    | Type    | Description                                      |
|----------|---------|--------------------------------------------------|
| `status` | boolean | `true` if the confirmation email was sent successfully |

**Email Confirmation Flow**

1. The user submits a `PATCH` request with the desired new email address.
2. The server generates a signed change-email token and sends a confirmation link to the new address.
3. The user clicks the link in their email, which calls `GET /api/oauth/change-email/{token}`.
4. The server validates the token and updates the email address.

**Error Responses**

| Status | Description                                      |
|--------|--------------------------------------------------|
| `400`  | Invalid request body (missing or invalid email)  |
| `401`  | Missing or invalid access token                  |
| `500`  | Failed to send confirmation email                |

---

## Change Password

```http
PATCH /api/users/me/password
```

`protected`  `application/json`

Changes the authenticated user's password. Requires the current password for verification before the new password is applied.

**Request Body**

```json
{
    "currentPassword": "OldPassword123!",
    "newPassword": "NewPassword456!"
}
```

| Parameter         | Required | Description                                                  |
|-------------------|----------|--------------------------------------------------------------|
| `currentPassword` | Yes      | The user's current password (max 128 chars)                  |
| `newPassword`     | Yes      | The desired new password (max 128 chars)                     |

> **Note:** Passwords must meet the server's password complexity requirements.

**Response**

```json
{
    "status": true
}
```

| Field    | Type    | Description                              |
|----------|---------|------------------------------------------|
| `status` | boolean | `true` if the password was changed successfully |

**Error Responses**

| Status | Description                                                  |
|--------|--------------------------------------------------------------|
| `400`  | Invalid request body or current password is incorrect        |
| `401`  | Missing or invalid access token                              |

---

## Update Display Name

```http
PATCH /api/users/me/name
```

`protected`  `application/json`

Updates the authenticated user's display name.

**Request Body**

```json
{
    "name": "Jane Smith"
}
```

| Parameter | Required | Description                                  |
|-----------|----------|----------------------------------------------|
| `name`    | Yes      | The new display name (max 128 chars)         |

**Response**

Returns the updated user object:

```json
{
    "id": "3f7a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "email": "user@example.com",
    "name": "Jane Smith",
    "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Error Responses**

| Status | Description                                      |
|--------|--------------------------------------------------|
| `400`  | Invalid request body (name exceeds 128 chars)    |
| `401`  | Missing or invalid access token                  |

---

## List User's Tenants

```http
GET /api/users/me/tenants
```

`protected`  `application/json`

Returns the list of tenants the authenticated user belongs to. Only tenants where the user has viewer-level access or higher are included.

**Response**

```json
[
    {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Acme Corp",
        "domain": "acme.example.com",
        "allowSignUp": false,
        "createdAt": "2024-01-10T08:00:00.000Z",
        "roles": [
            {
                "id": "r1s2t3u4-v5w6-7890-abcd-ef1234567890",
                "name": "TENANT_ADMIN"
            }
        ]
    },
    {
        "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "name": "Beta Org",
        "domain": "beta.example.com",
        "allowSignUp": true,
        "createdAt": "2024-02-20T12:00:00.000Z",
        "roles": [
            {
                "id": "s2t3u4v5-w6x7-8901-bcde-f12345678901",
                "name": "TENANT_VIEWER"
            }
        ]
    }
]
```

| Field         | Type    | Description                                              |
|---------------|---------|----------------------------------------------------------|
| `id`          | string  | UUID of the tenant                                       |
| `name`        | string  | Display name of the tenant                               |
| `domain`      | string  | Unique domain identifier for the tenant                  |
| `allowSignUp` | boolean | Whether the tenant allows self-registration              |
| `createdAt`   | string  | ISO 8601 timestamp of tenant creation                    |
| `roles`       | array   | Roles defined in the tenant (not the user's assigned roles) |

**Error Responses**

| Status | Description                     |
|--------|---------------------------------|
| `401`  | Missing or invalid access token |

---

## See Also

- [Registration API](registration-api.md) — Creating accounts and signing up to tenants
- [Token API](token-api.md) — Obtaining access tokens
- [Tenant Management API](tenant-management-api.md) — Managing tenant configuration
- [Member Management API](member-management-api.md) — Managing tenant members and roles
