### Verify Access Token

```http
[POST] /api/oauth/verify
```

`public`  `application/json`

**Request**

```json
{
    "access_token": "string",
    "client_id": "string",
    "client_secret": "string"
}
```

**Response**

```json
{
    "sub": "string",
    "email": "string",
    "name": "string",
    "tenant": {
        "id": "string",
        "name": "string",
        "domain": "string"
    },
    "scopes": "string[]",
    "grant_type": "password | client_credential"
}
```

<hr>

### Access Token Exchange

```http
[POST] /api/oauth/exchange
```

`public`  `application/json`

**Request**

```json
{
    "access_token": "string",
    "client_id": "string | client_id of exchange tenant",
    "client_secret": "string"
}
```

**Response**

```json
{
    "grant_type": "password",
    "email": "string",
    "password": "string",
    "domain": "string"
}
```

<hr>

### JWT Roles Array Format

The `roles` claim in the JWT access token contains all roles assigned to the user. Role names follow different formats depending on their type:

| Role Type | Format | Example | Description |
|-----------|--------|---------|-------------|
| Internal | `ROLE_NAME` | `SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_VIEWER` | Built-in auth server roles. No separator. |
| Tenant-local | `roleName` | `reviewer`, `billing-admin` | Custom roles scoped to a single tenant. No separator. |
| App-owned | `appName:roleName` | `todo-app:editor`, `crm-app:sales-manager` | Roles defined by a subscribed app. Uses `:` as the namespace separator. |

App-owned roles are namespaced with the app name to prevent collisions when a user has roles from multiple subscribed apps. Internal and tenant-local roles never contain the `:` separator.

**Example JWT payload** — a user with internal, tenant-local, and app-owned roles:

```json
{
    "sub": "user-uuid",
    "email": "user@example.com",
    "tenant": {
        "id": "...",
        "name": "...",
        "domain": "..."
    },
    "roles": [
        "TENANT_ADMIN",
        "reviewer",
        "todo-app:editor",
        "todo-app:viewer",
        "crm-app:sales-manager"
    ],
    "scope": "openid profile email",
    "grant_type": "password"
}
```

**Technical tokens** (`client_credentials` grant) do **not** include a `roles` field — there is no user context. They carry `scopes` only.

For full details on app-owned role namespacing, policy resolution, and the resource server verification pattern, see [App-Owned Roles](app-owned-roles.md).
