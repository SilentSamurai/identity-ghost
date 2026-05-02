# Client API

OAuth clients (applications) are registered per tenant. Each client has a unique `clientId` and, for confidential clients, a `clientSecret`. The secret is only revealed at creation time or when rotated.

All endpoints require a valid JWT bearer token (`Authorization: Bearer <token>`).

---

## Client Object

A client object returned by the API has the following shape:

```json
{
    "id": "uuid",
    "clientId": "uuid",
    "name": "string",
    "alias": "string | null",
    "redirectUris": ["string"],
    "allowedScopes": "string",
    "grantTypes": "string",
    "responseTypes": "string",
    "tokenEndpointAuthMethod": "string",
    "isPublic": false,
    "requirePkce": false,
    "allowPasswordGrant": false,
    "allowRefreshToken": true,
    "allowedResources": ["string"] | null,
    "tenantId": "uuid",
    "createdAt": "ISO 8601 timestamp"
}
```

> **Note:** The `clientSecrets` array (containing hashed secrets) is included in the response but contains only hashed values — the plain-text secret is never returned except at creation or rotation time.

---

## Endpoints

### Create Client

```http
POST /api/clients/create
```

`protected`  `application/json`

Creates a new OAuth client for a tenant. The caller must have permission to create clients in the specified tenant.

**Request Body**

| Parameter                 | Required | Default                  | Description                                                                 |
|---------------------------|----------|--------------------------|-----------------------------------------------------------------------------|
| `tenantId`                | Yes      | —                        | UUID of the tenant to create the client in                                  |
| `name`                    | Yes      | —                        | Display name for the client (max 128 characters)                            |
| `redirectUris`            | No       | `[]`                     | Array of valid redirect URIs (must be valid URLs)                           |
| `allowedScopes`           | No       | `""` (empty)             | Space-delimited scope string (e.g., `"openid profile email"`)               |
| `grantTypes`              | No       | `"authorization_code"`   | Space-delimited grant types (e.g., `"authorization_code client_credentials"`) |
| `responseTypes`           | No       | `"code"`                 | Space-delimited response types (e.g., `"code"`)                             |
| `tokenEndpointAuthMethod` | No       | `"client_secret_basic"`  | Token endpoint auth method (e.g., `"client_secret_post"`, `"none"`)         |
| `isPublic`                | No       | `false`                  | If `true`, no client secret is generated (for SPAs and native apps)         |
| `requirePkce`             | No       | `false`                  | If `true`, PKCE is required for authorization code flows                    |
| `allowPasswordGrant`      | No       | `false`                  | If `true`, the resource owner password grant is enabled                     |
| `allowRefreshToken`       | No       | `true`                   | If `false`, refresh tokens will not be issued                               |
| `allowedResources`        | No       | `null`                   | Array of absolute URIs for resource indicators (RFC 8707)                   |

**Response** `201 Created`

```json
{
    "client": {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "clientId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "name": "My App",
        "alias": null,
        "redirectUris": ["https://myapp.example.com/callback"],
        "allowedScopes": "openid profile email",
        "grantTypes": "authorization_code",
        "responseTypes": "code",
        "tokenEndpointAuthMethod": "client_secret_basic",
        "isPublic": false,
        "requirePkce": true,
        "allowPasswordGrant": false,
        "allowRefreshToken": true,
        "allowedResources": null,
        "tenantId": "1a2b3c4d-5e6f-7890-abcd-ef1234567890",
        "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "clientSecret": "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"
}
```

> **Note:** The `clientSecret` is only revealed upon creation. Store it securely — it cannot be retrieved again. For public clients (`isPublic: true`), `clientSecret` will be `null`.

---

### List My Clients

```http
GET /api/clients/my/clients
```

`protected`  `application/json`

Returns all clients belonging to the tenant associated with the authenticated user's JWT token.

**Response** `200 OK`

```json
[
    {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "clientId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "name": "My App",
        "alias": "myapp",
        "redirectUris": ["https://myapp.example.com/callback"],
        "allowedScopes": "openid profile email",
        "grantTypes": "authorization_code",
        "responseTypes": "code",
        "tokenEndpointAuthMethod": "client_secret_basic",
        "isPublic": false,
        "requirePkce": true,
        "allowPasswordGrant": false,
        "allowRefreshToken": true,
        "allowedResources": null,
        "tenantId": "1a2b3c4d-5e6f-7890-abcd-ef1234567890",
        "createdAt": "2024-01-15T10:30:00.000Z"
    }
]
```

---

### Get Client Details

```http
GET /api/clients/{clientId}
```

`protected`  `application/json`

Returns details for a specific client by its `clientId` (UUID). The client can also be looked up by its `alias` if one is set.

**Path Parameters**

| Parameter  | Description                                    |
|------------|------------------------------------------------|
| `clientId` | The client's UUID (`clientId` field) or alias  |

**Response** `200 OK`

```json
{
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "clientId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "My App",
    "alias": null,
    "redirectUris": ["https://myapp.example.com/callback"],
    "allowedScopes": "openid profile email",
    "grantTypes": "authorization_code",
    "responseTypes": "code",
    "tokenEndpointAuthMethod": "client_secret_basic",
    "isPublic": false,
    "requirePkce": true,
    "allowPasswordGrant": false,
    "allowRefreshToken": true,
    "allowedResources": null,
    "tenantId": "1a2b3c4d-5e6f-7890-abcd-ef1234567890",
    "createdAt": "2024-01-15T10:30:00.000Z"
}
```

> **Note:** The plain-text `clientSecret` is never returned by this endpoint.

---

### Rotate Client Secret

```http
POST /api/clients/{clientId}/rotate-secret
```

`protected`  `application/json`

Generates a new client secret. The existing secret remains valid for a 24-hour overlap window to allow zero-downtime rotation, after which only the new secret is accepted.

**Path Parameters**

| Parameter  | Description              |
|------------|--------------------------|
| `clientId` | The client's UUID        |

**Response** `201 Created`

```json
{
    "client": {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "clientId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "name": "My App",
        "alias": null,
        "redirectUris": ["https://myapp.example.com/callback"],
        "allowedScopes": "openid profile email",
        "grantTypes": "authorization_code",
        "responseTypes": "code",
        "tokenEndpointAuthMethod": "client_secret_basic",
        "isPublic": false,
        "requirePkce": true,
        "allowPasswordGrant": false,
        "allowRefreshToken": true,
        "allowedResources": null,
        "tenantId": "1a2b3c4d-5e6f-7890-abcd-ef1234567890",
        "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "clientSecret": "b4c9d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4"
}
```

> **Note:** The new `clientSecret` is only revealed during this rotation operation. The previous secret remains valid for 24 hours to allow a graceful transition.

---

### Update Client

```http
PATCH /api/clients/{clientId}
```

`protected`  `application/json`

Updates mutable properties of a client. The caller must have permission to update clients in the client's tenant. Only the fields listed below can be updated — other fields (such as `grantTypes`, `allowedScopes`, or `tokenEndpointAuthMethod`) are immutable after creation.

**Path Parameters**

| Parameter  | Description       |
|------------|-------------------|
| `clientId` | The client's UUID |

**Request Body** (all fields optional)

| Parameter          | Type       | Description                                              |
|--------------------|------------|----------------------------------------------------------|
| `name`             | `string`   | New display name (max 128 characters)                    |
| `redirectUris`     | `string[]` | Replacement list of redirect URIs (must be valid URLs)   |
| `requirePkce`      | `boolean`  | Enable or disable PKCE requirement                       |
| `allowPasswordGrant` | `boolean` | Enable or disable the resource owner password grant     |
| `allowRefreshToken` | `boolean` | Enable or disable refresh token issuance                |

**Response** `200 OK`

Returns the updated client object (same shape as [Get Client Details](#get-client-details)).

---

### Delete Client

```http
DELETE /api/clients/{clientId}
```

`protected`

Permanently deletes a client. The caller must have permission to delete clients in the client's tenant. This action is irreversible.

**Path Parameters**

| Parameter  | Description       |
|------------|-------------------|
| `clientId` | The client's UUID |

**Response** `200 OK`

```json
{
    "status": "success"
}
```
