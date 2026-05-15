import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Feature: user-consent-tracking, Property 2: Consent required iff requested scopes exceed granted scopes
 *
 * For any set of granted scopes G and requested scopes R (both drawn from valid OIDC scope
 * values), the consent check SHALL return `consentRequired = false` if and only if R ⊆ G.
 * Otherwise it SHALL return `consentRequired = true`.
 *
 * **Validates: Requirements 2.1, 3.1, 5.1**
 */
describe('Feature: user-consent-tracking, Property 2: Consent required iff requested scopes exceed granted scopes', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://consent-iff-prop.example.com/callback';
    const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchAccessTokenFlow(email, password, 'auth.server.com');
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const uniqueSuffix = String(Date.now()).slice(-8);
        const tenant = await tenantClient.createTenant(
            `ci-prop-${uniqueSuffix}`,
            `ci-prop-${uniqueSuffix}.com`,
        );
        testTenantId = tenant.id;
    }, 60_000);

    afterAll(async () => {
        await fixture.close();
    });

    /**
     * Drive /authorize (with a valid session) and determine whether consent is required.
     * Returns true iff /authorize redirected to the consent UI.
     */
    async function checkConsentRequired(clientId: string, requestedScopes: string[]): Promise<boolean> {
        const params = {
            clientId,
            redirectUri: REDIRECT_URI,
            scope: requestedScopes.join(' '),
            state: 'iff-check',
            codeChallenge: CODE_CHALLENGE,
            codeChallengeMethod: 'plain',
        };
        const csrfContext = await tokenFixture.initializeFlow(params);
        const sidCookie = await tokenFixture.login(email, password, clientId, csrfContext);

        const { location } = await tokenFixture.checkAuthorize(params, sidCookie, csrfContext.flowIdCookie);

        if (location.includes('view=consent') || location.includes('/consent?')) {
            return true;
        }

        // Otherwise must be a redirect to redirect_uri with a code (no error).
        const url = new URL(location, 'http://localhost');
        expect(url.searchParams.has('error')).toBe(false);
        expect(url.searchParams.get('code')).toBeTruthy();
        return false;
    }

    it('consentRequired = false iff R ⊆ G (biconditional)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (grantedScopes, requestedScopes) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CI Prop ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Grant consent with scopes G
                        await tokenFixture.preGrantConsentFlow(email, password, {
                            clientId,
                            redirectUri: REDIRECT_URI,
                            scope: grantedScopes.join(' '),
                            state: 'consent-state',
                            codeChallenge: CODE_CHALLENGE,
                            codeChallengeMethod: 'plain',
                        });

                        // Check consent with requested scopes R
                        const consentRequired = await checkConsentRequired(clientId, requestedScopes);

                        // Compute the expected result: R ⊆ G ↔ consentRequired = false
                        const rSubsetOfG = requestedScopes.every(s => grantedScopes.includes(s));

                        expect(consentRequired).toBe(!rSubsetOfG);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 20},
        );
    }, 300_000);

    it('consentRequired = false when R = G (equal sets)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (scopes) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CI Equal ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        await tokenFixture.preGrantConsentFlow(email, password, {
                            clientId,
                            redirectUri: REDIRECT_URI,
                            scope: scopes.join(' '),
                            state: 'consent-state',
                            codeChallenge: CODE_CHALLENGE,
                            codeChallengeMethod: 'plain',
                        });

                        const consentRequired = await checkConsentRequired(clientId, scopes);

                        expect(consentRequired).toBe(false);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 15},
        );
    }, 300_000);

    it('consentRequired = false when R is a strict subset of G', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 2}),
                async (grantedScopes) => {
                    const requestedScopes = grantedScopes.slice(0, grantedScopes.length - 1);
                    fc.pre(requestedScopes.length >= 1);

                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CI Subset ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        await tokenFixture.preGrantConsentFlow(email, password, {
                            clientId,
                            redirectUri: REDIRECT_URI,
                            scope: grantedScopes.join(' '),
                            state: 'consent-state',
                            codeChallenge: CODE_CHALLENGE,
                            codeChallengeMethod: 'plain',
                        });

                        const consentRequired = await checkConsentRequired(clientId, requestedScopes);

                        expect(consentRequired).toBe(false);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 10},
        );
    }, 300_000);

    it('consentRequired = true when R contains scopes not in G', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1, maxLength: 2}),
                async (grantedScopes) => {
                    const requestedScopes = ['openid', 'profile', 'email'];
                    const rExceedsG = requestedScopes.some(s => !grantedScopes.includes(s));
                    fc.pre(rExceedsG);

                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CI Exceed ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        await tokenFixture.preGrantConsentFlow(email, password, {
                            clientId,
                            redirectUri: REDIRECT_URI,
                            scope: grantedScopes.join(' '),
                            state: 'consent-state',
                            codeChallenge: CODE_CHALLENGE,
                            codeChallengeMethod: 'plain',
                        });

                        const consentRequired = await checkConsentRequired(clientId, requestedScopes);

                        expect(consentRequired).toBe(true);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 10},
        );
    }, 300_000);
});
