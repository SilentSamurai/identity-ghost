import * as fc from 'fast-check';
import {createHash} from 'crypto';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';

/**
 * PKCE Enforcement — Required PKCE, Voluntary PKCE, and Downgrade Prevention
 *
 * These tests verify that:
 * - Clients with requirePkce=true are rejected without code_challenge
 * - Voluntary PKCE (requirePkce=false + code_challenge provided) is validated at token exchange
 * - PKCE method downgrade from S256 to plain is prevented
 * - Pre-redirect errors (unknown client_id) return JSON 400
 *
 * Sub-properties:
 * A) PKCE Required Enforcement: requirePkce=true + no code_challenge → redirect with error=invalid_request
 * B) Voluntary PKCE Honored: requirePkce=false + valid code_challenge S256 → flow succeeds, token exchange requires code_verifier
 * C) Downgrade Prevention: requirePkce=true + code_challenge_method=plain → redirect with error=invalid_request
 * D) Pre-redirect Errors: unknown client_id → JSON 400 (never redirect)
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */
describe('PKCE Enforcement: required PKCE, voluntary PKCE, downgrade prevention, and error handling', () => {
    let fixture: SharedTestFixture;
    let pkceRequiredClientId: string;
    let pkceOptionalClientId: string;

    const TENANT_DOMAIN = 'pkce-preservation-test.local';
    const ADMIN_EMAIL = `admin@${TENANT_DOMAIN}`;
    const ADMIN_PASSWORD = 'admin9000';
    const REDIRECT_URI = 'https://pkce-preservation.example.com/callback';

    // Helper: generate a valid S256 code_challenge from a code_verifier
    function generateS256Challenge(verifier: string): string {
        const hash = createHash('sha256').update(verifier).digest();
        return hash.toString('base64url');
    }

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);

        // Get tenant-scoped token to retrieve tenant ID
        const {accessToken: tenantToken, jwt} = await tokenFixture.fetchAccessToken(
            ADMIN_EMAIL,
            ADMIN_PASSWORD,
            TENANT_DOMAIN,
        );
        const tenantId = jwt.tenant.id;

        // Get super-admin token to create clients
        const {accessToken: superToken} = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const clientApi = new ClientEntityClient(fixture, superToken);

        // Create client with requirePkce=true
        const pkceRequired = await clientApi.createClient(tenantId, 'PKCE Preservation Required Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            requirePkce: true,
        });
        pkceRequiredClientId = pkceRequired.client.clientId;

        // Create client with requirePkce=false (for voluntary PKCE)
        const pkceOptional = await clientApi.createClient(tenantId, 'PKCE Preservation Optional Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            requirePkce: false,
        });
        pkceOptionalClientId = pkceOptional.client.clientId;

        // Pre-grant consent for the optional PKCE client so login returns auth codes
        // instead of requires_consent (third-party clients require consent)
        const consentChallenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
        await fixture.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD,
                client_id: pkceOptionalClientId,
                code_challenge: consentChallenge,
                code_challenge_method: 'plain',
                approved_scopes: ['openid', 'profile', 'email'],
                consent_action: 'approve',
                scope: 'openid profile email',
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');
    });

    afterAll(async () => {
        await fixture.close();
    });

    // --- Generators ---

    // Valid state strings (URL-safe)
    const stateArb = fc.stringMatching(/^[A-Za-z0-9_\-]{8,64}$/);

    // Valid scope subsets from the client's allowed scopes
    const scopeArb = fc.subarray(['openid', 'profile', 'email'], {minLength: 1})
        .map(scopes => scopes.join(' '));

    // Valid PKCE code_verifier: 43-128 chars from unreserved charset
    const UNRESERVED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const verifierArb = fc.integer({min: 43, max: 128}).chain((len: number) =>
        fc.array(fc.constantFrom(...UNRESERVED_CHARS.split('')), {minLength: len, maxLength: len})
            .map((chars: string[]) => chars.join('')),
    );

    // Unknown client_id values that cannot match real clients
    const unknownClientIdArb = fc.stringMatching(/^[A-Za-z0-9_\-]{8,32}$/)
        .map(s => `unknown-pkce-${s}`);

    // --- Sub-property A: PKCE Required Enforcement ---
    describe('Sub-property A: PKCE Required Enforcement', () => {
        it('requirePkce=true + no code_challenge → redirect with error=invalid_request', async () => {
            await fc.assert(
                fc.asyncProperty(stateArb, scopeArb, async (state, scope) => {
                    const res = await fixture.getHttpServer()
                        .get('/api/oauth/authorize')
                        .query({
                            response_type: 'code',
                            client_id: pkceRequiredClientId,
                            redirect_uri: REDIRECT_URI,
                            scope,
                            state,
                        })
                        .redirects(0);

                    // Post-redirect error: 302 redirect with error params
                    expect(res.status).toEqual(302);
                    const location = res.headers['location'] as string;
                    expect(location).toBeDefined();

                    const redirectUrl = new URL(location, 'http://localhost');
                    expect(redirectUrl.searchParams.get('error')).toEqual('invalid_request');
                    expect(redirectUrl.searchParams.has('error_description')).toBe(true);
                    expect(redirectUrl.searchParams.get('state')).toEqual(state);
                }),
                {numRuns: 20},
            );
        }, 120_000);
    });

    // --- Sub-property B: Voluntary PKCE Honored ---
    describe('Sub-property B: Voluntary PKCE Honored', () => {
        it('requirePkce=false + valid S256 code_challenge → full flow succeeds and token exchange requires code_verifier', async () => {
            await fc.assert(
                fc.asyncProperty(stateArb, scopeArb, verifierArb, async (state, scope, verifier) => {
                    const codeChallenge = generateS256Challenge(verifier);

                    // Step 1: GET /api/oauth/authorize with code_challenge
                    const authorizeRes = await fixture.getHttpServer()
                        .get('/api/oauth/authorize')
                        .query({
                            response_type: 'code',
                            client_id: pkceOptionalClientId,
                            redirect_uri: REDIRECT_URI,
                            scope,
                            state,
                            code_challenge: codeChallenge,
                            code_challenge_method: 'S256',
                        })
                        .redirects(0);

                    // Should redirect to frontend login page (success path)
                    expect(authorizeRes.status).toEqual(302);
                    const location = authorizeRes.headers['location'] as string;
                    expect(location).toBeDefined();

                    const redirectUrl = new URL(location, 'http://localhost');
                    // Should NOT have error params
                    expect(redirectUrl.searchParams.has('error')).toBe(false);
                    // Should pass through code_challenge
                    expect(redirectUrl.searchParams.get('code_challenge')).toEqual(codeChallenge);
                    expect(redirectUrl.searchParams.get('code_challenge_method')).toEqual('S256');

                    // Step 2: POST /api/oauth/login with code_challenge
                    const loginRes = await fixture.getHttpServer()
                        .post('/api/oauth/login')
                        .send({
                            email: ADMIN_EMAIL,
                            password: ADMIN_PASSWORD,
                            client_id: pkceOptionalClientId,
                            redirect_uri: REDIRECT_URI,
                            scope,
                            code_challenge: codeChallenge,
                            code_challenge_method: 'S256',
                        })
                        .set('Accept', 'application/json');

                    expect(loginRes.status).toBeGreaterThanOrEqual(200);
                    expect(loginRes.status).toBeLessThan(300);
                    expect(loginRes.body.authentication_code).toBeDefined();

                    const authCode = loginRes.body.authentication_code;

                    // Step 3a: Token exchange WITH correct code_verifier → should succeed
                    const tokenRes = await fixture.getHttpServer()
                        .post('/api/oauth/token')
                        .send({
                            grant_type: 'authorization_code',
                            code: authCode,
                            client_id: pkceOptionalClientId,
                            redirect_uri: REDIRECT_URI,
                            code_verifier: verifier,
                        })
                        .set('Accept', 'application/json');

                    expect(tokenRes.status).toEqual(200);
                    expect(tokenRes.body.access_token).toBeDefined();
                    expect(tokenRes.body.token_type).toEqual('Bearer');
                }),
                {numRuns: 10},
            );
        }, 120_000);

        it('requirePkce=false + valid S256 code_challenge → token exchange with WRONG code_verifier fails', async () => {
            await fc.assert(
                fc.asyncProperty(stateArb, scopeArb, verifierArb, verifierArb, async (state, scope, verifier, wrongVerifier) => {
                    // Ensure the wrong verifier is actually different
                    fc.pre(verifier !== wrongVerifier);

                    const codeChallenge = generateS256Challenge(verifier);

                    // Step 1: Authorize
                    const authorizeRes = await fixture.getHttpServer()
                        .get('/api/oauth/authorize')
                        .query({
                            response_type: 'code',
                            client_id: pkceOptionalClientId,
                            redirect_uri: REDIRECT_URI,
                            scope,
                            state,
                            code_challenge: codeChallenge,
                            code_challenge_method: 'S256',
                        })
                        .redirects(0);

                    expect(authorizeRes.status).toEqual(302);
                    const location = authorizeRes.headers['location'] as string;
                    const redirectUrl = new URL(location, 'http://localhost');
                    expect(redirectUrl.searchParams.has('error')).toBe(false);

                    // Step 2: Login
                    const loginRes = await fixture.getHttpServer()
                        .post('/api/oauth/login')
                        .send({
                            email: ADMIN_EMAIL,
                            password: ADMIN_PASSWORD,
                            client_id: pkceOptionalClientId,
                            redirect_uri: REDIRECT_URI,
                            scope,
                            code_challenge: codeChallenge,
                            code_challenge_method: 'S256',
                        })
                        .set('Accept', 'application/json');

                    expect(loginRes.status).toBeGreaterThanOrEqual(200);
                    expect(loginRes.status).toBeLessThan(300);
                    expect(loginRes.body.authentication_code).toBeDefined();

                    const authCode = loginRes.body.authentication_code;

                    // Step 3: Token exchange with WRONG code_verifier → should fail
                    const tokenRes = await fixture.getHttpServer()
                        .post('/api/oauth/token')
                        .send({
                            grant_type: 'authorization_code',
                            code: authCode,
                            client_id: pkceOptionalClientId,
                            redirect_uri: REDIRECT_URI,
                            code_verifier: wrongVerifier,
                        })
                        .set('Accept', 'application/json');

                    // Should reject with an error (invalid_grant or similar)
                    expect(tokenRes.status).toBeGreaterThanOrEqual(400);
                    expect(tokenRes.body.error).toBeDefined();
                }),
                {numRuns: 10},
            );
        }, 120_000);
    });

    // --- Sub-property C: Downgrade Prevention ---
    describe('Sub-property C: Downgrade Prevention', () => {
        it('requirePkce=true + code_challenge_method=plain → redirect with error=invalid_request', async () => {
            await fc.assert(
                fc.asyncProperty(stateArb, scopeArb, verifierArb, async (state, scope, verifier) => {
                    // Use the verifier as a plain challenge (plain method = challenge equals verifier)
                    const res = await fixture.getHttpServer()
                        .get('/api/oauth/authorize')
                        .query({
                            response_type: 'code',
                            client_id: pkceRequiredClientId,
                            redirect_uri: REDIRECT_URI,
                            scope,
                            state,
                            code_challenge: verifier,
                            code_challenge_method: 'plain',
                        })
                        .redirects(0);

                    // Post-redirect error: 302 redirect with error params
                    expect(res.status).toEqual(302);
                    const location = res.headers['location'] as string;
                    expect(location).toBeDefined();

                    const redirectUrl = new URL(location, 'http://localhost');
                    expect(redirectUrl.searchParams.get('error')).toEqual('invalid_request');
                    expect(redirectUrl.searchParams.has('error_description')).toBe(true);
                    expect(redirectUrl.searchParams.get('state')).toEqual(state);
                }),
                {numRuns: 20},
            );
        }, 120_000);
    });

    // --- Sub-property D: Pre-redirect Errors ---
    describe('Sub-property D: Pre-redirect Errors', () => {
        it('unknown client_id → JSON 400 (never redirect)', async () => {
            await fc.assert(
                fc.asyncProperty(unknownClientIdArb, stateArb, async (clientId, state) => {
                    const res = await fixture.getHttpServer()
                        .get('/api/oauth/authorize')
                        .query({
                            response_type: 'code',
                            client_id: clientId,
                            redirect_uri: 'https://any.example.com/callback',
                            scope: 'openid',
                            state,
                        })
                        .redirects(0);

                    // Must NOT be a 302 redirect — pre-redirect error
                    expect(res.status).not.toEqual(302);
                    // Should return a JSON error body with status 400
                    expect(res.status).toEqual(400);
                    expect(res.body.error).toBeDefined();
                }),
                {numRuns: 20},
            );
        }, 120_000);
    });
});
