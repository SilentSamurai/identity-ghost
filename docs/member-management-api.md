# Member Management API

## Overview

The Member Management API provides endpoints for managing users within a tenant. Tenant administrators can list members, add new members by email, remove members, and manage the roles assigned to each member.

All endpoints require a valid Bearer access token obtained via the OAuth 2.0 authorization flow. The tenant context is derived from the token — the token determines which tenant the operation applies to.

**Base path:** `/api/tenant/my`

---

## Authentication

All endpoints require an `Authorization` header with a valid Bearer token:

```http
Authorization: Bearer <access_token>
```

The tenant is resolved from the token's `tenant` claim. You do not pass a tenant ID in the URL — the token determines which tenant you are operating on.

---

## Roles and Permissions

| Role            | Permissions                                                                 |
|-----------------|-----------------------------------------------------------------------------|
| `TENANT_ADMIN`  | Can list, add, and remove members; can read and update member roles         |
| `TENANT_VIEWER` | Can list members and read member roles; cannot add, remove, or update roles |

> **Note:** A `TENANT_ADMIN` cannot remove themselves from the tenant.

---

## List Members

```http
GET /api/tenant/my/members
```

`protected`  `application/json`

Returns all members of the tenant associated with the current access token. Each member object includes their assigned roles within the tenant.

**Response**

Returns an array of user objects:

```json
[
    {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "email": "alice@example.com",
        "name": "Alice Smith",
        "createdAt": "2024-01-15T10:00:00.000Z",
        "roles": [
            {
                "id": "r1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "name": "TENANT_ADMIN",
                "description": "Tenant administrator",
                "removable": false,
                "createdAt": "2024-01-15T10:00:00.000Z"
            }
        ]
    },
    {
        "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "email": "bob@example.com",
        "name": "Bob Jones",
        "createdAt": "2024-02-01T09:00:00.000Z",
        "roles": [
            {
                "id": "r2c3d4e5-f6a7-8901-bcde-f12345678901",
                "name": "TENANT_VIEWER",
                "description": "Tenant viewer",
                "removable": false,
                "createdAt": "2024-01-15T10:00:00.000Z"
            }
        ]
    }
]
```

| Field              | Type   | Description                                          |
|--------------------|--------|------------------------------------------------------|
| `id`               | string | UUID of the user                                     |
| `email`            | string | Email address of the user                            |
| `name`             | string | Display name of the user                             |
| `createdAt`        | string | ISO 8601 timestamp of user account creation          |
| `roles`            | array  | Roles assigned to this user within the tenant        |
| `roles[].id`       | string | UUID of the role                                     |
| `roles[].name`     | string | Name of the role (e.g., `TENANT_ADMIN`)              |
| `roles[].removable`| boolean| Whether the role can be removed from the user        |

**Error Responses**

| Status | Description                                                         |
|--------|---------------------------------------------------------------------|
| `401`  | Missing or invalid access token                                     |
| `403`  | Insufficient permissions (requires `TENANT_VIEWER` role or higher) |
| `404`  | Tenant not found                                                    |

---

## Add Members

```http
POST /api/tenant/my/members/add
```

`protected`  `application/json`

Adds one or more users to the tenant by email address. If a user with the given email does not yet exist in the system, a shadow account is created automatically. The user is then added as a member of the tenant.

Requires the `TENANT_ADMIN` role.

**Request Body**

```json
{
    "emails": [
        "alice@example.com",
        "bob@example.com"
    ]
}
```

| Parameter | Required | Description                                                        |
|-----------|----------|--------------------------------------------------------------------|
| `emails`  | Yes      | Array of email addresses to add as members (max 128 chars each)    |

**Response**

Returns the updated tenant object with the new members reflected:

```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Acme Corp",
    "domain": "acme.example.com",
    "allowSignUp": false,
    "createdAt": "2024-01-01T00:00:00.000Z"
}
```

> **Note:** Newly added members have no roles assigned by default. Use the [Set Member Roles](#set-member-roles) endpoint to assign roles after adding.

**What happens on add**

1. For each email in the list, the system checks whether a user account exists.
2. If no account exists, a shadow (unverified) account is created with that email.
3. The user is linked to the tenant as a member.

**Error Responses**

| Status | Description                                                        |
|--------|--------------------------------------------------------------------|
| `400`  | Invalid request body (e.g., malformed email address)               |
| `401`  | Missing or invalid access token                                    |
| `403`  | Insufficient permissions (requires `TENANT_ADMIN` role)            |
| `404`  | Tenant not found                                                   |

---

## Remove Members

```http
DELETE /api/tenant/my/members/delete
```

`protected`  `application/json`

Removes one or more users from the tenant by email address. The user accounts are not deleted — they are only unlinked from the tenant. Requires the `TENANT_ADMIN` role.

> **Note:** A tenant admin cannot remove themselves from the tenant.

**Request Body**

```json
{
    "emails": [
        "bob@example.com"
    ]
}
```

| Parameter | Required | Description                                                        |
|-----------|----------|--------------------------------------------------------------------|
| `emails`  | Yes      | Array of email addresses to remove from the tenant                 |

**Response**

Returns the updated tenant object:

```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Acme Corp",
    "domain": "acme.example.com",
    "allowSignUp": false,
    "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses**

| Status | Description                                                        |
|--------|--------------------------------------------------------------------|
| `400`  | Invalid request body                                               |
| `401`  | Missing or invalid access token                                    |
| `403`  | Insufficient permissions (requires `TENANT_ADMIN` role), or attempting to remove self |
| `404`  | Tenant or user not found                                           |

---

## Get Member Details

```http
GET /api/tenant/my/member/{userId}
```

`protected`  `application/json`

Returns details for a specific member of the tenant, including their assigned roles.

**Path Parameters**

| Parameter | Description                    |
|-----------|--------------------------------|
| `userId`  | UUID of the user to look up    |

**Response**

```json
{
    "tenantId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "userId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "roles": [
        {
            "id": "r1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "name": "TENANT_VIEWER",
            "description": "Tenant viewer",
            "removable": false,
            "createdAt": "2024-01-15T10:00:00.000Z"
        }
    ]
}
```

| Field      | Type   | Description                                          |
|------------|--------|------------------------------------------------------|
| `tenantId` | string | UUID of the tenant                                   |
| `userId`   | string | UUID of the user                                     |
| `roles`    | array  | Roles assigned to this user within the tenant        |

**Error Responses**

| Status | Description                                                         |
|--------|---------------------------------------------------------------------|
| `401`  | Missing or invalid access token                                     |
| `403`  | Insufficient permissions (requires `TENANT_VIEWER` role or higher) |
| `404`  | Tenant or user not found                                            |

---

## Get Member Roles

```http
GET /api/tenant/my/member/{userId}/roles
```

`protected`  `application/json`

Returns the roles assigned to a specific member within the tenant.

**Path Parameters**

| Parameter | Description                    |
|-----------|--------------------------------|
| `userId`  | UUID of the user               |

**Response**

```json
{
    "roles": [
        {
            "id": "r1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "name": "TENANT_ADMIN",
            "description": "Tenant administrator",
            "removable": false,
            "createdAt": "2024-01-15T10:00:00.000Z"
        }
    ]
}
```

| Field              | Type    | Description                                          |
|--------------------|---------|------------------------------------------------------|
| `roles`            | array   | Roles assigned to this user within the tenant        |
| `roles[].id`       | string  | UUID of the role                                     |
| `roles[].name`     | string  | Name of the role                                     |
| `roles[].description` | string | Human-readable description of the role            |
| `roles[].removable`| boolean | Whether the role can be removed from the user        |
| `roles[].createdAt`| string  | ISO 8601 timestamp of role creation                  |

**Error Responses**

| Status | Description                                                         |
|--------|---------------------------------------------------------------------|
| `401`  | Missing or invalid access token                                     |
| `403`  | Insufficient permissions (requires `TENANT_VIEWER` role or higher) |
| `404`  | Tenant or user not found                                            |

---

## Set Member Roles

```http
PUT /api/tenant/my/member/{userId}/roles
```

`protected`  `application/json`

Replaces the full set of roles for a member. Any roles currently assigned to the user that are not included in the request body will be removed. Requires the `TENANT_ADMIN` role.

**Path Parameters**

| Parameter | Description                    |
|-----------|--------------------------------|
| `userId`  | UUID of the user               |

**Request Body**

```json
{
    "roles": [
        "TENANT_ADMIN",
        "auditor"
    ]
}
```

| Parameter | Required | Description                                                        |
|-----------|----------|--------------------------------------------------------------------|
| `roles`   | Yes      | Array of role names to assign. Replaces the user's current roles.  |

**Response**

Returns the updated array of role objects assigned to the user:

```json
[
    {
        "id": "r1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "TENANT_ADMIN",
        "description": "Tenant administrator",
        "removable": false,
        "createdAt": "2024-01-15T10:00:00.000Z"
    },
    {
        "id": "r2c3d4e5-f6a7-8901-bcde-f12345678901",
        "name": "auditor",
        "description": "Custom auditor role",
        "removable": true,
        "createdAt": "2024-02-01T09:00:00.000Z"
    }
]
```

**Error Responses**

| Status | Description                                                        |
|--------|--------------------------------------------------------------------|
| `400`  | Invalid request body                                               |
| `401`  | Missing or invalid access token                                    |
| `403`  | Insufficient permissions (requires `TENANT_ADMIN` role)            |
| `404`  | Tenant, user, or one of the specified roles not found              |

---

## Add Roles to Member

```http
POST /api/tenant/my/member/{userId}/roles/add
```

`protected`  `application/json`

Adds one or more roles to a member without affecting their existing roles. Requires the `TENANT_ADMIN` role.

**Path Parameters**

| Parameter | Description                    |
|-----------|--------------------------------|
| `userId`  | UUID of the user               |

**Request Body**

```json
{
    "roles": [
        "auditor"
    ]
}
```

| Parameter | Required | Description                                                        |
|-----------|----------|--------------------------------------------------------------------|
| `roles`   | Yes      | Array of role names to add to the user's existing roles            |

**Response**

Returns the full updated array of role objects assigned to the user after the addition:

```json
[
    {
        "id": "r1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "TENANT_VIEWER",
        "description": "Tenant viewer",
        "removable": false,
        "createdAt": "2024-01-15T10:00:00.000Z"
    },
    {
        "id": "r2c3d4e5-f6a7-8901-bcde-f12345678901",
        "name": "auditor",
        "description": "Custom auditor role",
        "removable": true,
        "createdAt": "2024-02-01T09:00:00.000Z"
    }
]
```

**Error Responses**

| Status | Description                                                        |
|--------|--------------------------------------------------------------------|
| `400`  | Invalid request body                                               |
| `401`  | Missing or invalid access token                                    |
| `403`  | Insufficient permissions (requires `TENANT_ADMIN` role)            |
| `404`  | Tenant, user, or one of the specified roles not found              |

---

## Remove Roles from Member

```http
DELETE /api/tenant/my/member/{userId}/roles/remove
```

`protected`  `application/json`

Removes one or more roles from a member without affecting their other roles. Requires the `TENANT_ADMIN` role.

**Path Parameters**

| Parameter | Description                    |
|-----------|--------------------------------|
| `userId`  | UUID of the user               |

**Request Body**

```json
{
    "roles": [
        "auditor"
    ]
}
```

| Parameter | Required | Description                                                        |
|-----------|----------|--------------------------------------------------------------------|
| `roles`   | Yes      | Array of role names to remove from the user                        |

**Response**

Returns the full updated array of role objects assigned to the user after the removal:

```json
[
    {
        "id": "r1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "TENANT_VIEWER",
        "description": "Tenant viewer",
        "removable": false,
        "createdAt": "2024-01-15T10:00:00.000Z"
    }
]
```

**Error Responses**

| Status | Description                                                        |
|--------|--------------------------------------------------------------------|
| `400`  | Invalid request body                                               |
| `401`  | Missing or invalid access token                                    |
| `403`  | Insufficient permissions (requires `TENANT_ADMIN` role)            |
| `404`  | Tenant, user, or one of the specified roles not found              |

---

## Endpoint Summary

| Method   | Path                                          | Description                          | Required Role   |
|----------|-----------------------------------------------|--------------------------------------|-----------------|
| `GET`    | `/api/tenant/my/members`                      | List all members                     | `TENANT_VIEWER` |
| `POST`   | `/api/tenant/my/members/add`                  | Add members by email                 | `TENANT_ADMIN`  |
| `DELETE` | `/api/tenant/my/members/delete`               | Remove members by email              | `TENANT_ADMIN`  |
| `GET`    | `/api/tenant/my/member/{userId}`              | Get a specific member's details      | `TENANT_VIEWER` |
| `GET`    | `/api/tenant/my/member/{userId}/roles`        | Get a member's roles                 | `TENANT_VIEWER` |
| `PUT`    | `/api/tenant/my/member/{userId}/roles`        | Replace a member's roles (full set)  | `TENANT_ADMIN`  |
| `POST`   | `/api/tenant/my/member/{userId}/roles/add`    | Add roles to a member                | `TENANT_ADMIN`  |
| `DELETE` | `/api/tenant/my/member/{userId}/roles/remove` | Remove roles from a member           | `TENANT_ADMIN`  |

---

## See Also

- [Tenant Management API](tenant-management-api.md) — Creating and configuring tenants
- [User Management API](user-management-api.md) — Managing the authenticated user's own account
- [App-Owned Roles](app-owned-roles.md) — Application-scoped roles assigned to tenant members
- [Architecture Overview](architecture.md) — Multi-tenant model and role system
