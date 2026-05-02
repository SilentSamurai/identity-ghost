import {Client, generators, Issuer, TokenSet} from 'openid-client';
import {SharedTestFixture} from '../shared-test.fixture';
import {getTestPorts} from '../test-ports';
import {TokenFixture} from '../token.fixture';
import {SearchClient} from '../api-client/search-client';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {expect2xx} from "../api-client/client";

/**
 * OAuth 2.0 / OIDC Compatibility Tests (Ported from compat-tests/oidc-compat.test.mjs)
 *
 * Verifies the auth server against the openid-client v5 library.
 * This ensures spec compliance and interoperability.
 *
 * All auth code tests use the full /authorize → login → token exchange flow,
 * matching the real browser-based OAuth flow.
 */
describe('OIDC Compatibility (openid-client v5)', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let baseUrl: string;
    const tenantDomain = 'oidc-compat-test.local';
    const adminEmail = `admin@${tenantDomain}`;
    const adminPassword = 'admin9000';
    const superAdminEmail = 'admin@auth.server.com';
    const superAdminPassword = 'admin9000';
    const superTenantDomain = 'auth.server.com';
    const redirectUri = 'https://oidc-compat-test.example.com/callback';

    let tenantClientId: string;
    let tenantClientSecret: string;
    let tenantId: string;
    let issuer: Issuer<Client>;
    let client: Client;
    let publicClient: Client;

    /**
     * Full OAuth authorize → login → get auth code flow.
     * Hits GET /api/oauth/authorize, follows the 302, parses forwarded params,
     * then POSTs credentials to /api/oauth/login — exactly what the Angular UI does.
     */
    async function authorizeAndLogin(
        oidcClient: Client,
        opts: {
            scope: string;
            code_challenge: string;
            code_challenge_method?: string;
            nonce?: string;
        },
    ): Promise<{ code: string; state: string }> {
        const state = generators.state();

        // 1. Build authorize URL via openid-client
        const authUrl = oidcClient.authorizationUrl({
            scope: opts.scope,
            code_challenge: opts.code_challenge,
            code_challenge_method: opts.code_challenge_method || 'S256',
            state,
            nonce: opts.nonce,
            redirect_uri: redirectUri,
        });

        // 2. Hit /api/oauth/authorize — expect 302 to login page
        const authorizeRes = await fetch(authUrl, {redirect: 'manual'});
        expect(authorizeRes.status).toBe(302);

        const location = authorizeRes.headers.get('location');
        expect(location).toBeDefined();

        // 3. Parse forwarded params from the redirect
        const redirectUrl = new URL(location!, baseUrl);
        const fwdParams = {
            client_id: redirectUrl.searchParams.get('client_id')!,
            scope: redirectUrl.searchParams.get('scope')!,
            code_challenge: redirectUrl.searchParams.get('code_challenge')!,
            code_challenge_method: redirectUrl.searchParams.get('code_challenge_method')!,
            nonce: redirectUrl.searchParams.get('nonce') || undefined,
        };

        // 4. POST credentials to /api/oauth/login (simulating the login form)
        const loginRes = await fetch(`${baseUrl}/api/oauth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                email: adminEmail,
                password: adminPassword,
                client_id: fwdParams.client_id,
                code_challenge: fwdParams.code_challenge,
                code_challenge_method: fwdParams.code_challenge_method,
                scope: fwdParams.scope,
                nonce: fwdParams.nonce,
            }),
        });
        expect2xx(loginRes);

        const loginBody = await loginRes.json();
        expect(loginBody.authentication_code).toBeDefined();

        return {code: loginBody.authentication_code, state};
    }

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const ports = getTestPorts();
        baseUrl = `http://127.0.0.1:${ports.app}`;

        // 1. Get a super admin token to find the tenant
        const {accessToken: superAdminToken} = await tokenFixture.fetchAccessToken(
            superAdminEmail,
            superAdminPassword,
            superTenantDomain
        );

        // 2. Find the oidc-compat-test.local tenant (seeded in StartUpService)
        const searchClient = new SearchClient(app, superAdminToken);
        const tenant = await searchClient.findTenantBy({domain: tenantDomain});

        if (!tenant) {
            throw new Error(`Tenant ${tenantDomain} not found. Ensure the server is seeded with it.`);
        }
        tenantId = tenant.id;

        // 3. Get a tenant-scoped token to create/update clients
        const {accessToken: tenantAccessToken} = await tokenFixture.fetchAccessToken(
            adminEmail,
            adminPassword,
            tenantDomain
        );

        const clientEntityClient = new ClientEntityClient(app, tenantAccessToken);

        // 4. Find the default public client's real clientId, then register a redirect URI
        const clients = await clientEntityClient.getClientsByTenant(tenantId);
        const defaultClient = clients.find((c: any) => c.alias === tenantDomain);
        if (!defaultClient) {
            throw new Error(`Default client for ${tenantDomain} not found`);
        }
        await clientEntityClient.updateClient(defaultClient.clientId, {
            redirectUris: [redirectUri],
        });

        // 5. Create a confidential client with redirect URI
        const createClientRes = await clientEntityClient.createClient(tenantId, 'oidc-compat-confidential', {
            grantTypes: 'client_credentials authorization_code refresh_token',
            allowedScopes: 'openid profile email offline_access',
            isPublic: false,
            redirectUris: [redirectUri],
        });
        tenantClientId = createClientRes.client.clientId;
        tenantClientSecret = createClientRes.clientSecret;

        // 6. Discover OIDC configuration and initialize openid-client instances
        const discoveryUrl = `${baseUrl}/${tenantDomain}/.well-known/openid-configuration`;
        issuer = await Issuer.discover(discoveryUrl);

        client = new issuer.Client({
            client_id: tenantClientId,
            client_secret: tenantClientSecret,
            redirect_uris: [redirectUri],
        });

        publicClient = new issuer.Client({
            client_id: tenantDomain,
            token_endpoint_auth_method: 'none',
            redirect_uris: [redirectUri],
        });
    });

    afterAll(async () => {
        await app.close();
    });

    describe('OIDC Discovery', () => {
        it('should discover server metadata with all required fields', () => {
            const meta = issuer.metadata;
            expect(meta.issuer).toBeDefined();
            expect(meta.token_endpoint).toBeDefined();
            expect(meta.jwks_uri).toBeDefined();
            expect(meta.authorization_endpoint).toBeDefined();
            expect(meta.introspection_endpoint).toBeDefined();
            expect(meta.revocation_endpoint).toBeDefined();
            expect(meta.userinfo_endpoint).toBeDefined();
        });

        it('should report supported scopes, grant types, and response types', () => {
            const meta = issuer.metadata;
            expect(meta.scopes_supported).toContain('openid');
            expect(meta.scopes_supported).toContain('offline_access');
            expect(meta.grant_types_supported).toContain('authorization_code');
            expect(meta.grant_types_supported).toContain('client_credentials');
            expect(meta.grant_types_supported).toContain('refresh_token');
            expect(meta.response_types_supported).toContain('code');
        });

        it('should report RS256 as supported signing algorithm', () => {
            const meta = issuer.metadata;
            expect(meta.id_token_signing_alg_values_supported).toContain('RS256');
        });

        it('should report supported subject types and token endpoint auth methods', () => {
            const meta = issuer.metadata;
            expect(meta.subject_types_supported).toContain('public');
            expect(meta.token_endpoint_auth_methods_supported).toContain('client_secret_basic');
            expect(meta.token_endpoint_auth_methods_supported).toContain('client_secret_post');
        });
    });

    describe('JWKS', () => {
        it('should fetch JWKS with at least one RSA key', async () => {
            const jwksUri = issuer.metadata.jwks_uri;
            expect(jwksUri).toBeDefined();
            const response = await fetch(jwksUri!);
            const jwks = await response.json();

            expect(jwks.keys).toBeDefined();
            expect(jwks.keys.length).toBeGreaterThan(0);

            const rsaKey = jwks.keys.find((k: any) => k.kty === 'RSA');
            expect(rsaKey).toBeDefined();
        });
    });

    describe('Client Credentials Grant', () => {
        it('should obtain an access token via client_credentials', async () => {
            const tokens = await client.grant({
                grant_type: 'client_credentials',
                scope: 'openid profile email'
            });
            expect(tokens.access_token).toBeDefined();
            expect(tokens.token_type?.toLowerCase()).toBe('bearer');
            expect(tokens.expires_in).toBeGreaterThan(0);
        });
    });

    describe('Authorization Code Flow with PKCE', () => {
        let authCodeTokens: TokenSet;

        it('should complete full authorize → login → token exchange flow', async () => {
            const code_verifier = generators.codeVerifier();
            const code_challenge = generators.codeChallenge(code_verifier);
            const nonce = generators.nonce();

            const {code, state} = await authorizeAndLogin(publicClient, {
                scope: 'openid profile email offline_access',
                code_challenge,
                nonce,
            });

            authCodeTokens = await publicClient.callback(redirectUri, {code, state}, {
                code_verifier,
                nonce,
                state,
            });

            expect(authCodeTokens.access_token).toBeDefined();
            expect(authCodeTokens.token_type?.toLowerCase()).toBe('bearer');
            expect(authCodeTokens.refresh_token).toBeDefined();
        });

        it('should return a valid ID token with correct claims', () => {
            expect(authCodeTokens.id_token).toBeDefined();

            const claims = authCodeTokens.claims();
            expect(claims).toBeDefined();
            expect(claims.sub).toBeDefined();
            expect(claims.iss).toBeDefined();
            expect(claims.iat).toBeDefined();
            expect(claims.exp).toBeDefined();
        });

        it('should reject token exchange with wrong code_verifier', async () => {
            const code_verifier = generators.codeVerifier();
            const code_challenge = generators.codeChallenge(code_verifier);

            const {code, state} = await authorizeAndLogin(publicClient, {
                scope: 'openid profile email',
                code_challenge,
            });

            await expect(publicClient.callback(redirectUri, {code, state}, {
                code_verifier: 'wrong-verifier-value',
                state,
            })).rejects.toThrow();
        });

        it('should reject reuse of an authorization code', async () => {
            const code_verifier = generators.codeVerifier();
            const code_challenge = generators.codeChallenge(code_verifier);

            const {code, state} = await authorizeAndLogin(publicClient, {
                scope: 'openid profile email',
                code_challenge,
            });

            // First exchange succeeds
            await publicClient.callback(redirectUri, {code, state}, {code_verifier, state});

            // Second exchange with the same code must fail
            await expect(publicClient.callback(redirectUri, {code, state}, {
                code_verifier,
                state,
            })).rejects.toThrow();
        });

        it('should refresh tokens and get a new access token', async () => {
            expect(authCodeTokens.refresh_token).toBeDefined();

            const refreshed = await publicClient.refresh(authCodeTokens.refresh_token!);
            expect(refreshed.access_token).toBeDefined();
            expect(refreshed.token_type?.toLowerCase()).toBe('bearer');
            expect(refreshed.refresh_token).toBeDefined();
        });

        it('should rotate refresh tokens on use', async () => {
            const code_verifier = generators.codeVerifier();
            const code_challenge = generators.codeChallenge(code_verifier);

            const {code, state} = await authorizeAndLogin(publicClient, {
                scope: 'openid profile email offline_access',
                code_challenge,
            });

            const tokens = await publicClient.callback(redirectUri, {code, state}, {code_verifier, state});
            const originalRefreshToken = tokens.refresh_token!;

            // Use the refresh token — server should issue a new one
            const refreshed = await publicClient.refresh(originalRefreshToken);
            expect(refreshed.refresh_token).toBeDefined();
            expect(refreshed.refresh_token).not.toBe(originalRefreshToken);

            // The original refresh token should now be consumed and unusable
            await expect(publicClient.refresh(originalRefreshToken)).rejects.toThrow();
        });

        it('should fetch user info with scope-appropriate claims', async () => {
            const userInfo = await publicClient.userinfo(authCodeTokens.access_token!);
            expect(userInfo.sub).toBeDefined();
            expect(userInfo.sub).toBe(authCodeTokens.claims().sub);
            // profile scope → name claim
            expect(userInfo.name).toBeDefined();
            // email scope → email + email_verified claims
            expect(userInfo.email).toBeDefined();
            expect(userInfo.email_verified).toBeDefined();
        });
    });

    describe('Token Introspection', () => {
        it('should introspect an active access token', async () => {
            const tokens = await client.grant({grant_type: 'client_credentials'});
            const introspection = await client.introspect(tokens.access_token!);
            expect(introspection.active).toBe(true);
            expect(introspection.scope).toBeDefined();
            expect(introspection.token_type?.toLowerCase()).toBe('bearer');
        });

        it('should return active=false for a garbage token', async () => {
            const introspection = await client.introspect('invalid.garbage.token');
            expect(introspection.active).toBe(false);
        });
    });

    describe('Token Revocation', () => {
        it('should reject revocation from unauthenticated (public) client', async () => {
            const code_verifier = generators.codeVerifier();
            const code_challenge = generators.codeChallenge(code_verifier);

            const {code, state} = await authorizeAndLogin(publicClient, {
                scope: 'openid profile email offline_access',
                code_challenge,
            });

            const tokens = await publicClient.callback(redirectUri, {code, state}, {
                code_verifier,
                state,
            });

            // Public client has no credentials — revocation endpoint requires auth
            await expect(publicClient.revoke(tokens.refresh_token!))
                .rejects.toThrow();
        });

        it('should revoke via confidential client', async () => {
            const code_verifier = generators.codeVerifier();
            const code_challenge = generators.codeChallenge(code_verifier);

            const {code, state} = await authorizeAndLogin(publicClient, {
                scope: 'openid profile email offline_access',
                code_challenge,
            });

            const tokens = await publicClient.callback(redirectUri, {code, state}, {
                code_verifier,
                state,
            });

            await client.revoke(tokens.refresh_token!);

            await expect(publicClient.refresh(tokens.refresh_token!))
                .rejects.toThrow();
        });
    });
});
