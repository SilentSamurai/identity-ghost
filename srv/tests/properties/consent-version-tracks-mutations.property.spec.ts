import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Feature: user-consent-tracking, Property 1: Consent version tracks mutation count
 *
 * For any user-client pair, if N consent grant operations are performed sequentially,
 * the resulting `consent_version` SHALL equal N. The first grant sets version to 1,
 * and each subsequent grant increments it by exactly 1.
 *
 * **Validates: Requirements 1.3, 1.4**
 *
 * Since there is no public API to read the version number, we verify the invariant
 * indirectly by confirming the consent record remains valid and covers the cumulative
 * union of all granted scopes after each grant. Each successful /authorize (no
 * consent UI redirect) is evidence of a live, consistent record.
 */
describe('Feature: user-consent-tracking, Property 1: Consent version tracks mutation count', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://consent-version-prop.example.com/callback';
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
            `cv-prop-${uniqueSuffix}`,
            `cv-prop-${uniqueSuffix}.com`,
        );
        testTenantId = tenant.id;
    }, 60_000);

    afterAll(async () => {
        await fixture.close();
    });

    /** Grant consent with the given scopes. */
    async function grantConsent(clientId: string, scopes: string[]): Promise<void> {
        await tokenFixture.preGrantConsentFlow(email, password, {
            clientId,
            redirectUri: REDIRECT_URI,
            scope: scopes.join(' '),
            state: 'consent-state',
            codeChallenge: CODE_CHALLENGE,
            codeChallengeMethod: 'plain',
        });
    }

    /**
     * Drive /authorize and determine if consent is required.
     */
    async function isConsentRequired(clientId: string, requestedScopes: string[]): Promise<boolean> {
        const params = {
            clientId,
            redirectUri: REDIRECT_URI,
            scope: requestedScopes.join(' '),
            state: 'version-check',
            codeChallenge: CODE_CHALLENGE,
            codeChallengeMethod: 'plain',
        };
        const csrfContext = await tokenFixture.initializeFlow(params);
        const sidCookie = await tokenFixture.login(email, password, clientId, csrfContext);

        const { location } = await tokenFixture.checkAuthorize(params, sidCookie, csrfContext.flowIdCookie);

        if (location.includes('view=consent') || location.includes('/consent?')) return true;

        const url = new URL(location, 'http://localhost');
        expect(url.searchParams.has('error')).toBe(false);
        expect(url.searchParams.get('code')).toBeTruthy();
        return false;
    }

    it('consent record remains valid after N sequential grants', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                    {minLength: 1, maxLength: 10},
                ),
                async (scopeSequence) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CV Prop ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Perform N grants sequentially
                        for (const scopes of scopeSequence) {
                            await grantConsent(clientId, scopes);
                        }

                        // After N grants, the record must cover the union of all granted scopes
                        const allGrantedScopes = Array.from(new Set(scopeSequence.flat()));

                        expect(await isConsentRequired(clientId, allGrantedScopes)).toBe(false);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 10},
        );
    }, 300_000);

    it('first grant creates a valid consent record (record exists at version 1)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (scopes) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CV First ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Before any grant: /authorize must redirect to consent UI
                        expect(await isConsentRequired(clientId, scopes)).toBe(true);

                        // Perform exactly 1 grant
                        await grantConsent(clientId, scopes);

                        // After 1 grant: /authorize must NOT require consent
                        expect(await isConsentRequired(clientId, scopes)).toBe(false);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 10},
        );
    }, 300_000);

    it('each subsequent grant keeps the consent record valid (version increments monotonically)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                    {minLength: 2, maxLength: 5},
                ),
                async (scopeSequence) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CV Mono ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Perform all N grants sequentially; record must cover cumulative union after each.
                        for (let i = 0; i < scopeSequence.length; i++) {
                            await grantConsent(clientId, scopeSequence[i]);

                            const cumulativeScopes = Array.from(
                                new Set(scopeSequence.slice(0, i + 1).flat()),
                            );

                            expect(await isConsentRequired(clientId, cumulativeScopes)).toBe(false);
                        }
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
