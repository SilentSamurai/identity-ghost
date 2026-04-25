### Create Client
```http
[POST] /api/clients/create
```

`protected`  `application/json`

**Request**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `tenantId` | Yes | The UUID of the tenant |
| `name` | Yes | The name of the client |
| `redirectUris` | No | Array of valid redirect URIs |
| `allowedScopes` | No | Space-delimited scope string |
| `grantTypes` | No | Allowed OAuth2 grant types (e.g., `client_credentials`) |
| `responseTypes` | No | Allowed response types (e.g., `code`) |
| `tokenEndpointAuthMethod` | No | Authentication method (e.g., `client_secret_post`) |
| `isPublic` | No | Whether the client is public (no secret) |
| `requirePkce` | No | Whether PKCE is required |
| `allowPasswordGrant` | No | Whether password grant is allowed |
| `allowRefreshToken` | No | Whether refresh tokens are allowed |
| `allowedResources` | No | Array of absolute URIs for resource access |

**Response**

```json
{
    "client": {
        "id": "string",
        "name": "string",
        ...
    },
    "clientSecret": "string"
}
```
> **Note:** The `clientSecret` is only revealed upon creation or rotation.

<hr>

### List My Clients
```http
[GET] /api/clients/my/clients
```

`protected`  `application/json`

**Response**

```json
[
    {
        "id": "string",
        "name": "string",
        ...
    }
]
```

<hr>

### Get Client Details
```http
[GET] /api/clients/{clientId}
```

`protected`  `application/json`

**Response**

```json
{
    "id": "string",
    "name": "string",
    ...
}
```
> **Note:** The `clientSecret` is **never** returned by this endpoint.

<hr>

### Rotate Client Secret
```http
[POST] /api/clients/{clientId}/rotate-secret
```

`protected`  `application/json`

**Response**

```json
{
    "client": {
        "id": "string",
        "name": "string",
        ...
    },
    "clientSecret": "string"
}
```
> **Note:** The new `clientSecret` is revealed only during this rotation operation.

<hr>

### Update Client
```http
[PATCH] /api/clients/{clientId}
```

`protected`  `application/json`

**Request**
```json
{
    "name": "string",
    "redirectUris": ["string"],
    "requirePkce": boolean,
    "allowPasswordGrant": boolean,
    "allowRefreshToken": boolean
}
```

**Response**
```json
{
    "id": "string",
    "name": "string",
    ...
}
```

<hr>

### Delete Client
```http
[DELETE] /api/clients/{clientId}
```

`protected`

**Response**
```json
{
    "status": "success"
}
```
