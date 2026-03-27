# Architecture Review: Tenant Resolution & Structural Issues

## 1. Tenant Resolution: URL Params vs Token-Derived Context

### The Problem

The JWT token already carries tenant information (`tenant` and `userTenant` in `TenantToken`), yet nearly every secured endpoint accepts a `:tenantId` URL parameter and loads the tenant from the database independently. Security relies entirely on CASL checks being applied correctly at each endpoint.

This is **security-by-convention** instead of **security-by-design**.

### Where It Shows Up

| Controller | Pattern |
|---|---|
| `MemberController` | `/:tenantId/members`, `/:tenantId/member/:userId/roles`, etc. |
| `TenantController` | `/:tenantId`, `/:tenantId/credentials` |
| `RoleController` | `/:tenantId/roles` |
| `GroupController` | `/:tenantId/groups` |
| `PolicyController` | `/:tenantId/policies` |
| `AppController` | `/:tenantId/apps` |
| `ClientController` | `/:tenantId/clients` |

Every one of these follows the same pattern:
```typescript
const tenant = await this.tenantService.findById(request, tenantId); // tenantId from URL
this.securityService.check(request, Action.Read, subject(SubjectEnum.TENANT, tenant));
```

### Why It's Risky

- **IDOR vulnerability surface**: If a developer forgets the CASL check on a new endpoint, any authenticated user can access any tenant's data by changing the URL parameter.
- **No defense in depth**: There is no middleware or guard that validates the requested tenant against the token. The only barrier is the per-endpoint CASL check.
- **Inconsistent enforcement**: Some endpoints (e.g., `deleteTenant`) pass `request` through to the service layer without an explicit controller-level CASL check, relying on the service to handle it.

### Why It Was Likely Done This Way

The multi-tenant model is complex:
- A user can belong to multiple tenants.
- The subscription system allows cross-tenant app access.
- Super admins need to operate on tenants other than their own.
- The token carries `tenant` (OAuth client's tenant) and `userTenant` (user's home tenant), but which one is "current" depends on context.

Rather than building a tenant resolution strategy that accounts for all these cases, the simpler path was: let the client specify the tenant via URL, check permissions with CASL.

### Recommended Approach

1. Introduce a `TenantResolutionGuard` or middleware that:
   - Extracts the tenant from the token by default.
   - For super-admin routes, allows explicit tenant override via URL param with additional validation.
   - Sets a `currentTenant` on the request context that all downstream code uses.
2. Remove `:tenantId` from non-admin routes. Regular users should only operate within their token's tenant scope.
3. Create a dedicated `AdminTenantController` (or route prefix like `/api/admin/tenant/:tenantId/...`) for cross-tenant operations, with explicit super-admin guards.

---

## 2. AuthController: God Controller with Duplicated Grant Logic

### The Problem

`AuthController` is 600+ lines with 9 injected dependencies. It handles OAuth token issuance, email verification, password reset, tenant ambiguity resolution, and more.

The grant type handlers (`handleCodeGrant`, `handlePasswordGrant`, `handleRefreshTokenGrant`) contain nearly identical logic:

```
1. Validate user/tenant
2. Get admin context
3. Check isMember / isSubscribed
4. If subscribed → resolve subscription tenant ambiguity → get roles → createSubscribedUserAccessToken
5. Otherwise → createUserAccessToken
6. Return the same response shape
```

This block is copy-pasted across three methods. Any change to the token response, scope resolution, or membership check must be applied in three places.

### Recommended Approach

Extract a `TokenIssuanceService` that encapsulates the shared pipeline:

```typescript
class TokenIssuanceService {
  async issueTokenForUser(user: User, tenant: Tenant, hints?: { subscriberTenantHint?: string }): Promise<TokenResponse> {
    // membership check, subscription resolution, scope building, token creation
    // all in one place
  }
}
```

Each grant handler becomes a thin adapter: validate its specific inputs, resolve user + tenant, delegate to `TokenIssuanceService`.

---

## 3. Circular Module Dependencies

### The Problem

`ServiceModule` and `AuthModule` import each other using `forwardRef()`:

```
ServiceModule → forwardRef(() => AuthModule)
AuthModule   → forwardRef(() => ServiceModule)
```

`forwardRef` is a workaround, not a solution. It masks a coupling problem and makes the dependency graph fragile.

### Root Cause

Auth logic (token creation, validation) needs business services (tenant lookup, user lookup), and business services need auth logic (password hashing, token validation). The responsibilities aren't cleanly separated.

### Recommended Approach

Extract shared interfaces or a thin "core" module that both can depend on without circular imports. The `TokenIssuanceService` from section 2 would naturally live in this shared layer.

---

## 4. Fabricated Admin Context

### The Problem

`SecurityService.getAdminContextForInternalUse()` creates a fake `TenantToken` with empty IDs and `SUPER_ADMIN` scope to bypass authorization for internal operations:

```typescript
SECURITY_CONTEXT: TenantToken.create({
    email: "",
    sub: "",
    userId: "",
    tenant: { id: "", name: "", domain: superTenantDomain },
    scopes: ["SUPER_ADMIN"],
    ...
})
```

This is used in controllers whenever a service call needs elevated permissions (e.g., checking membership during token issuance). It's a workaround for the fact that the authorization system doesn't distinguish between "user-initiated request" and "system-internal operation."

### Why It Matters

- Empty IDs in a token can cause unexpected behavior if any downstream code assumes they're real.
- It conflates "no authorization needed" with "super admin authorization," which are different concepts.
- It's called from controllers, meaning the controller is deciding when to bypass security — that decision should live in the service layer.

### Recommended Approach

Introduce an explicit `InternalContext` type (separate from `TenantToken`) that services can accept for system-level operations. This makes the intent clear and avoids fabricating fake user tokens.

---

## 5. Environment Service Logging Secrets

### The Problem

`Environment.setup()` logs all environment variables to the console at startup:

```typescript
Object.keys(process.env).forEach(function (key) {
    console.log(key + "=" + process.env[key]);
});
```

This includes `DATABASE_PASSWORD`, `client_secret`, private keys, and any other sensitive values in the environment. In a containerized deployment, these logs are typically shipped to a centralized logging system.

### Recommended Fix

Remove the blanket env dump. If startup diagnostics are needed, log only non-sensitive keys or use an allowlist.
