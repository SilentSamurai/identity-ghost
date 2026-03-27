# Architecture Refactor Plan

Each phase is independently shippable. The system stays functional between phases.

---

## Phase 1: Extract TokenIssuanceService (eliminates grant type duplication)

**Goal**: Remove the copy-pasted membership check → subscription resolution → token creation logic from `AuthController`.

**New file**: `srv/src/auth/token-issuance.service.ts`

```typescript
@Injectable()
export class TokenIssuanceService {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantService: TenantService,
    private readonly subscriptionService: SubscriptionService,
    private readonly securityService: SecurityService,
    private readonly configService: Environment,
    private readonly authCodeService: AuthCodeService,
  ) {}

  /**
   * Given a resolved user and tenant, handles the full pipeline:
   * membership check → subscription resolution → scope building → token creation → response formatting.
   */
  async issueToken(
    user: User,
    tenant: Tenant,
    options?: { subscriberTenantHint?: string; authCode?: string }
  ): Promise<TokenResponse> {
    const adminContext = await this.securityService.getAdminContextForInternalUse();

    const isMember = await this.tenantService.isMember(adminContext, tenant.id, user);
    const isSubscribed = await this.subscriptionService.isUserSubscribedToTenant(adminContext, user, tenant);

    if (!isMember && !isSubscribed) {
      throw new BadRequestException("User is not a member of the tenant and does not have a valid app subscription");
    }

    if (isSubscribed) {
      return this.issueSubscribedToken(adminContext, user, tenant, options);
    }

    const { accessToken, refreshToken, scopes } =
      await this.authService.createUserAccessToken(user, tenant, []);

    return this.formatResponse(accessToken, refreshToken, scopes);
  }

  private async issueSubscribedToken(
    adminContext: AuthContext,
    user: User,
    tenant: Tenant,
    options?: { subscriberTenantHint?: string; authCode?: string }
  ): Promise<TokenResponse> {
    let hint = options?.subscriberTenantHint;

    // Check auth code for stored hint
    if (!hint && options?.authCode) {
      const authCodeObj = await this.authCodeService.findByCode(options.authCode);
      if (authCodeObj?.subscriberTenantHint) {
        hint = authCodeObj.subscriberTenantHint;
      }
    }

    const ambiguityResult = await this.subscriptionService
      .resolveSubscriptionTenantAmbiguity(adminContext, user, tenant, hint);

    if (ambiguityResult.ambiguousTenants) {
      throw new BadRequestException("Multiple subscription tenants found. Please specify a subscriber_tenant_hint.");
    }

    const subscribingTenant = ambiguityResult.resolvedTenant!;
    let additionalScopes = await this.tenantService.getMemberRoles(adminContext, subscribingTenant.id, user);

    const { accessToken, refreshToken, scopes } =
      await this.authService.createSubscribedUserAccessToken(
        user, tenant, subscribingTenant, additionalScopes.map(r => r.name)
      );

    return this.formatResponse(accessToken, refreshToken, scopes);
  }

  private formatResponse(accessToken: string, refreshToken: string, scopes: string[]): TokenResponse {
    return {
      access_token: accessToken,
      expires_in: this.configService.get("TOKEN_EXPIRATION_TIME_IN_SECONDS"),
      token_type: "Bearer",
      refresh_token: refreshToken,
      ...(scopes?.length ? { scope: scopes.join(" ") } : {}),
    };
  }
}
```

**Changes to AuthController**:
Each grant handler shrinks to ~15 lines: validate inputs, resolve user + tenant, call `tokenIssuanceService.issueToken(user, tenant, { hint })`.

**Module changes**:
- `TokenIssuanceService` lives in `AuthModule`.
- This naturally reduces what `AuthModule` needs to import from `ServiceModule` (it only needs `TenantService` and `SubscriptionService`).

---

## Phase 2: Move tenant ambiguity resolution into login (eliminate late-stage disambiguation)

**Goal**: Resolve subscription tenant ambiguity during `/login`, before the auth code is issued. Delete the `check-tenant-ambiguity` and `update-subscriber-tenant-hint` endpoints entirely.

**The problem with the current flow:**

The ambiguity is discovered too late — during token exchange. This forces a multi-step workaround:

1. User logs in → gets auth code
2. Client calls `/token` → backend discovers ambiguity → error
3. Client calls `/check-tenant-ambiguity` → gets tenant list
4. User picks a tenant on a selection screen
5. Client calls `/update-subscriber-tenant-hint` → mutates the auth code
6. Client calls `/token` again → now it works

Three extra round trips, a mutable auth code, and a broken OAuth flow (the `/token` endpoint should never bounce back to the UI).

**The fix — resolve during login:**

```
1. User submits credentials to /login
2. Backend validates, checks membership/subscription
3. If ambiguous → return { requires_tenant_selection: true, tenants: [...] }
4. UI shows tenant selection screen
5. User picks a tenant, UI calls /login again with subscriber_tenant_hint
6. Backend issues auth code with hint baked in
7. Client exchanges auth code for token at /token — clean, single step
```

**Backend changes to `/login` endpoint:**

Add `subscriber_tenant_hint` as an optional field in the login request body:

```typescript
@Post("/login")
async login(@Body() body: {
  client_id: string;
  password: string;
  email: string;
  code_challenge_method: string;
  code_challenge: string;
  subscriber_tenant_hint?: string;  // new
}) {
  const user = await this.authService.validate(body.email, body.password);
  const tenant = await this.resolveTenant(body.client_id);

  // ... membership/subscription checks ...

  if (isSubscribed) {
    const ambiguityResult = await this.subscriptionService
      .resolveSubscriptionTenantAmbiguity(context, user, tenant, body.subscriber_tenant_hint);

    if (ambiguityResult.ambiguousTenants) {
      // Don't issue auth code — ask the user to choose
      return {
        requires_tenant_selection: true,
        tenants: ambiguityResult.ambiguousTenants.map(t => ({
          id: t.id, domain: t.domain, name: t.name
        })),
      };
    }

    // Hint resolved or unambiguous — bake it into the auth code
    const auth_code = await this.authCodeService.createAuthToken(
      user, tenant, body.code_challenge, body.code_challenge_method,
      ambiguityResult.resolvedTenant?.domain  // stored at creation time
    );
    return { authentication_code: auth_code };
  }

  // Direct member — no ambiguity possible
  const auth_code = await this.authCodeService.createAuthToken(
    user, tenant, body.code_challenge, body.code_challenge_method
  );
  return { authentication_code: auth_code };
}
```

**Changes to `AuthCodeService.createAuthToken`:**

Accept an optional `subscriberTenantHint` parameter and set it at creation time:

```typescript
async createAuthToken(
  user: User,
  tenant: Tenant,
  code_challenge: string,
  method: string,
  subscriberTenantHint?: string,  // new
): Promise<string> {
  // ... existing code ...
  let session = this.authCodeRepository.create({
    codeChallenge: code_challenge,
    code: code,
    method: method,
    tenantId: tenant.id,
    userId: user.id,
    subscriberTenantHint: subscriberTenantHint || null,  // set once, never mutated
  });
  // ...
}
```

**Changes to `TokenIssuanceService` (from Phase 1):**

The `issueToken` method simplifies — the hint is always on the auth code already, no need to handle the ambiguous case:

```typescript
async issueToken(user: User, tenant: Tenant, options?: { subscriberTenantHint?: string }): Promise<TokenResponse> {
  // ... membership check ...
  if (isSubscribed) {
    // Hint is guaranteed to be present (resolved during login)
    return this.issueSubscribedToken(context, user, tenant, options);
  }
  // ...
}
```

**UI changes to `authorize-login.component.ts`:**

```typescript
async onSubmit(subscriberTenantHint?: string): Promise<void> {
  const data = await this.authService.login(
    username, password, client_id,
    this.code_challenge, this.code_challenge_method,
    subscriberTenantHint  // new optional param
  );

  if (data.requires_tenant_selection) {
    // Show selection screen — same TenantSelectionComponent, but on selection
    // it calls onSubmit() again with the chosen tenant hint
    this.router.navigate(['/tenant-selection'], {
      state: {
        tenants: data.tenants,
        // Pass login params so tenant-selection can re-call /login with the hint
        loginParams: { username, password, client_id, code_challenge, code_challenge_method },
        redirectUri: this.redirectUri,
        state: this.state
      }
    });
    return;
  }

  // Normal flow — auth code received
  this.tokenStorage.saveAuthCode(data.authentication_code);
  this.redirectToClient(data.authentication_code);
}
```

**UI changes to `tenant-selection.component.ts`:**

Instead of calling `updateSubscriberTenantHint`, it re-calls `/login` with the hint:

```typescript
async selectTenant(tenant: any) {
  const data = await this.authService.login(
    this.loginParams.username,
    this.loginParams.password,
    this.loginParams.client_id,
    this.loginParams.code_challenge,
    this.loginParams.code_challenge_method,
    tenant.domain  // subscriber_tenant_hint
  );
  // Now we have the auth code — redirect
  const redirectUrl = new URL(this.redirectUri);
  redirectUrl.searchParams.append('code', data.authentication_code);
  if (this.state) redirectUrl.searchParams.append('state', this.state);
  window.location.href = redirectUrl.toString();
}
```

**Endpoints to delete:**
- `POST /api/oauth/check-tenant-ambiguity`
- `POST /api/oauth/update-subscriber-tenant-hint`

**Methods to delete:**
- `AuthController.checkTenantAmbiguity()`
- `AuthController.updateSubscriberTenantHint()`
- `AuthCodeService.updateAuthCode()` (no longer needed — auth codes are immutable)
- `AuthCodeService.hasAuthCodeWithHint()` (no longer needed)
- `AuthService.checkTenantAmbiguity()` (UI service)
- `AuthService.updateSubscriberTenantHint()` (UI service)

**Security note on re-sending credentials:**
The tenant selection re-sends the user's password to `/login`. This is acceptable because:
- It happens over the same HTTPS connection within the same browser session.
- The alternative (storing the password in Angular router state) would be worse.
- The re-validation is actually a security benefit — it confirms the user is still the one making the request.

If re-sending credentials is undesirable, an alternative is to issue a short-lived, single-use "pending auth" token on the first `/login` call that can be exchanged (with the hint) for a real auth code. But that adds complexity for marginal benefit.

---

## Phase 3: Replace god-mode admin context with scoped internal contexts

**Goal**: Stop creating fake `TenantToken` objects with `SUPER_ADMIN` scope for internal operations. Replace them with purpose-built contexts that carry only the exact permissions the operation needs.

**Why not bypass CASL entirely (internal methods)?**
Bypassing CASL for internal calls removes the authorization layer from a large portion of the codebase. If a future developer accidentally calls an `*Internal` method from a controller, there's no safety net. The CASL layer should stay in the loop for every operation — it just needs to be scoped correctly.

**Why not a single `InternalContext` with full access?**
Same blast radius as the current fake super admin token. Any code that gets hold of it has unrestricted access. A leaked or misused context is just as dangerous.

**Approach: Scoped context factories on SecurityService**

Each internal use case gets its own factory method that builds a minimal CASL ability set:

```typescript
// New type for internal operations
export class InternalToken implements Token {
  readonly sub: string;
  readonly scopes: string[] = [];
  readonly grant_type = GRANT_TYPES.CLIENT_CREDENTIALS;
  readonly purpose: string;
  readonly scopedTenantId?: string;

  static create(params: { purpose: string; scopedTenantId?: string }): InternalToken {
    const token = new InternalToken();
    token.purpose = params.purpose;
    token.scopedTenantId = params.scopedTenantId;
    token.sub = `internal:${params.purpose}`;
    return token;
  }

  isTenantToken() { return false; }
  isTechnicalToken() { return false; }
  isInternalToken() { return true; }
  asTenantToken(): TenantToken { throw new Error("Internal token"); }
  asTechnicalToken(): TechnicalToken { throw new Error("Internal token"); }
}
```

```typescript
// SecurityService — scoped factory methods

/**
 * For login/token issuance: can read membership and subscription status for a specific tenant.
 */
async getContextForTokenIssuance(tenantId: string): Promise<AuthContext> {
  const { can, build } = new AbilityBuilder(createMongoAbility);
  can(Action.Read, SubjectEnum.TENANT, { id: tenantId });
  can(Action.Read, SubjectEnum.MEMBER, { tenantId });
  can(Action.Read, SubjectEnum.ROLE, { tenantId });
  return {
    SECURITY_CONTEXT: InternalToken.create({ purpose: "token-issuance", scopedTenantId: tenantId }),
    SCOPE_ABILITIES: build(),
  };
}

/**
 * For adding members: can read/create users and read tenant membership.
 */
async getContextForMemberManagement(tenantId: string): Promise<AuthContext> {
  const { can, build } = new AbilityBuilder(createMongoAbility);
  can(Action.Read, SubjectEnum.TENANT, { id: tenantId });
  can(Action.Read, SubjectEnum.MEMBER, { tenantId });
  can(Action.Read, SubjectEnum.USER);
  can(Action.Create, SubjectEnum.USER);
  return {
    SECURITY_CONTEXT: InternalToken.create({ purpose: "member-management", scopedTenantId: tenantId }),
    SCOPE_ABILITIES: build(),
  };
}

/**
 * For registration: can check domain existence and create tenants/users.
 */
async getContextForRegistration(): Promise<AuthContext> {
  const { can, build } = new AbilityBuilder(createMongoAbility);
  can(Action.Read, SubjectEnum.TENANT);
  can(Action.Create, SubjectEnum.TENANT);
  can(Action.Read, SubjectEnum.USER);
  can(Action.Create, SubjectEnum.USER);
  return {
    SECURITY_CONTEXT: InternalToken.create({ purpose: "registration" }),
    SCOPE_ABILITIES: build(),
  };
}

/**
 * For startup seed data: full access (this is the only legitimate use of broad permissions).
 */
async getContextForStartup(): Promise<AuthContext> {
  const { can, build } = new AbilityBuilder(createMongoAbility);
  can(Action.Manage, "all");
  return {
    SECURITY_CONTEXT: InternalToken.create({ purpose: "startup-seed" }),
    SCOPE_ABILITIES: build(),
  };
}
```

**Migration by call site:**

| Call site | Current | Replace with |
|---|---|---|
| `auth.controller.ts` (login, grant handlers) | `getAdminContextForInternalUse()` | `getContextForTokenIssuance(tenant.id)` |
| `members.controller.ts` (add member) | `getAdminContextForInternalUse()` | `getContextForMemberManagement(tenantId)` |
| `registration.controller.ts` | `getAdminContextForInternalUse()` | `getContextForRegistration()` |
| `startUp.service.ts` | `getAdminContextForInternalUse()` | `getContextForStartup()` |

**After migration, delete `getAdminContextForInternalUse()` entirely.**

**Security properties:**
- CASL stays in the loop for every operation, internal or external.
- Each internal context can only do what it was designed for. A token-issuance context can't create users. A member-management context can't read credentials.
- If a scoped context is accidentally passed to an operation it wasn't designed for, CASL rejects it with `ForbiddenException`.
- The `purpose` field makes internal operations auditable in logs.
- Only `getContextForStartup()` has broad permissions, and it's only called during application bootstrap.

---

## Phase 4: TenantResolutionGuard (security-by-design)

**Goal**: Derive the tenant from the token by default. Eliminate `:tenantId` URL params for non-admin routes.

### Step 3a: Add TenantResolutionGuard

**New file**: `srv/src/auth/tenant-resolution.guard.ts`

```typescript
@Injectable()
export class TenantResolutionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const securityContext = request["SECURITY_CONTEXT"] as Token;

    if (!securityContext) return true; // Let JwtAuthGuard handle this

    if (securityContext.isTenantToken()) {
      const token = securityContext as TenantToken;
      request["RESOLVED_TENANT_ID"] = token.tenant.id;
      request["RESOLVED_USER_TENANT_ID"] = token.userTenant.id;
    } else if (securityContext.isTechnicalToken()) {
      const token = securityContext as TechnicalToken;
      request["RESOLVED_TENANT_ID"] = token.tenant.id;
    }

    return true;
  }
}
```

Register it globally after `JwtAuthGuard` so every authenticated request has `RESOLVED_TENANT_ID` available.

### Step 3b: Create @CurrentTenantId() decorator

```typescript
export const CurrentTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request["RESOLVED_TENANT_ID"];
  },
);
```

### Step 3c: Migrate controllers incrementally

For each controller, replace:
```typescript
// Before
@Get("/:tenantId/members")
async getMembers(@Param("tenantId") tenantId: string) {
  const tenant = await this.tenantService.findById(request, tenantId);
  this.securityService.check(request, Action.Read, subject(SubjectEnum.TENANT, tenant));
  // ...
}
```

With:
```typescript
// After
@Get("/members")
async getMembers(@CurrentTenantId() tenantId: string) {
  // tenantId comes from the token — no IDOR possible
  // CASL check still runs but the tenant is guaranteed to be the user's own
}
```

### Step 3d: Super-admin override routes

Create a separate route prefix for cross-tenant admin operations:

```typescript
@Controller("api/admin/tenant/:tenantId")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminTenantController {
  // These endpoints explicitly accept :tenantId because super admins
  // need to operate on arbitrary tenants. The SuperAdminGuard ensures
  // only super admins can reach these routes.
}
```

### Migration strategy for Phase 3

This is the riskiest phase because it changes URL paths. Do it incrementally:

1. Add the guard and decorator (no breaking changes).
2. For each controller, add new routes without `:tenantId` that use `@CurrentTenantId()`.
3. Keep old `:tenantId` routes working but mark them deprecated.
4. Update the UI to use the new routes.
5. Remove the old routes.

---

## Phase 5: Break the circular dependency

**Goal**: Eliminate `forwardRef` between `ServiceModule` and `AuthModule`.

After Phase 1, the dependency graph is already simpler. The remaining shared pieces are:
- `AuthModule` needs `UsersService` and `TenantService` (to validate users, look up tenants)
- `ServiceModule` needs `AuthCodeService` (subscription service uses it)

**Solution**: Extract a `CoreModule` containing the shared TypeORM repositories and basic lookup services that both modules need:

```
CoreModule (entities, repositories, basic lookups)
    ↑               ↑
AuthModule      ServiceModule
```

Neither `AuthModule` nor `ServiceModule` imports the other. Both import `CoreModule`.

---

## Phase 6: Split AuthController

**Goal**: Single Responsibility for the controller layer.

After Phase 1 made the grant handlers thin, this is straightforward:

| New Controller | Endpoints |
|---|---|
| `OAuthTokenController` | `POST /api/oauth/token`, `POST /api/oauth/login` |
| `OAuthVerificationController` | `POST /api/oauth/verify-auth-code`, `GET /api/oauth/verify-access-token` |
| `PasswordResetController` | `POST /api/oauth/forgot-password`, `POST /api/oauth/reset-password` |
| `EmailController` | `GET /api/oauth/verify-email/:token`, `GET /api/oauth/change-email/:token` |

Note: `TenantAmbiguityController` is no longer needed — those endpoints were deleted in Phase 2.

No URL changes needed — just moving methods to separate files.

---

## Phase 7: Fix environment secret logging

**Goal**: Stop logging sensitive environment variables at startup.

Smallest change, do it anytime (even before Phase 1):

```typescript
// In Environment.setup()
const SENSITIVE_KEYS = ["PASSWORD", "SECRET", "PRIVATE_KEY", "KEY"];

Object.keys(process.env).forEach((key) => {
  const isSensitive = SENSITIVE_KEYS.some(s => key.toUpperCase().includes(s));
  console.log(`${key}=${isSensitive ? "****" : process.env[key]}`);
});
```

---

## Execution Order

| Order | Phase | Risk | Effort |
|---|---|---|---|
| 1 | Phase 7 (secret logging) | None | 30 min |
| 2 | Phase 1 (TokenIssuanceService) | Low | 1-2 days |
| 3 | Phase 2 (ambiguity into login) | Medium | 1-2 days |
| 4 | Phase 3 (scoped internal contexts) | Low-Medium | 1 day |
| 5 | Phase 6 (split AuthController) | Low | Half day |
| 6 | Phase 5 (break circular deps) | Medium | 1 day |
| 7 | Phase 4 (tenant resolution) | High | 2-3 days |

Phase 7 is trivial and can be done immediately. Phases 1-3 form the core security and design improvements. Phase 2 touches both backend and UI but the API change is additive (new optional field on `/login`, new response shape) so it can be rolled out with backward compatibility. Phase 4 is last because it changes URL paths across the entire API surface and requires coordinated UI migration.
