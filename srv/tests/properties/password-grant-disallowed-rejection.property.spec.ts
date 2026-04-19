import * as fc from 'fast-check';
import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';
import { ClientEntityClient } from '../api-client/client-entity-client';
import { TenantClient } from '../api-client/tenant-client';

/**
 * Feature: password-grant-deprecation, Property 1: Disallowed clients always rejected
 *
 * For any Client with `allowPasswordGrant = false`, and for any combination of username
 * and password (valid or invalid), a password grant request SHALL be rejected with
 * HTTP 400 and `error` set to `unauthorized_client`.
 *
 * This property validates that the flag check occurs BEFORE credential validation,
 * ensuring that unauthorized clients cannot probe for valid credentials.
 *
 * **Validates: Requirements 4.3, 5.1, 5.2, 5.3**
 */
describe('Feature: password-grant-deprecation, Property 1: Disallowed clients always rejected', () => {
    let fixture: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://pg-prop-test.example.com/callback';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const { accessToken } = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const uniqueSuffix = String(Date.now()).slice(-8);
        const tenant = await tenantClient.createTenant(
            `pg-prop-${uniqueSuffix}`,
            `pg-prop-${uniqueSuffix}.com`,
        );
        testTenantId = tenant.id;
    }, 60_000);

    afterAll(async () => {
        await fixture.close();
    });

    it('should reject all password grant requests for disallowed clients regardless of credentials', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate arbitrary username/password combinations.
                // Usernames must be valid email addresses and passwords must match
                // the schema regex /^[a-zA-Z]+(.){7,20}$/ to pass schema validation.
                // The property targets the flag-before-credentials ordering, not schema validation.
                fc.record({
                    username: fc.oneof(
                        fc.constantFrom('admin@auth.server.com', 'nonexistent@example.com'),
                        // Generate random but schema-valid email addresses
                        fc.tuple(
                            fc.stringMatching(/^[a-z][a-z0-9]{0,14}$/),
                            fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/),
                        ).map(([local, domain]) => `${local}@${domain}.com`),
                    ),
                    password: fc.oneof(
                        fc.constantFrom('admin9000', 'wrongPass1'),
                        // Generate passwords that pass schema: starts with alpha, 8-20 chars
                        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{7,19}$/),
                    ),
                }),
                async ({ username, password }) => {
                    // Create a fresh client with allowPasswordGrant: false
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `PG Prop ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                            allowPasswordGrant: false, // Explicitly false
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Send password grant request
                        const response = await fixture.getHttpServer()
                            .post('/api/oauth/token')
                            .send({
                                grant_type: 'password',
                                username,
                                password,
                                client_id: clientId,
                            })
                            .set('Accept', 'application/json');

                        // MUST be rejected with unauthorized_client
                        // This proves the flag check happens BEFORE credential validation
                        expect(response.status).toEqual(400);
                        expect(response.body.error).toEqual('unauthorized_client');
                        expect(response.body.error_description).toContain('password grant is not permitted');

                        // Must NOT be invalid_grant (which would indicate credential validation ran first)
                        expect(response.body.error).not.toEqual('invalid_grant');
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 100 },
        );
    }, 300_000);

    it('should reject disallowed client even with valid credentials', async () => {
        // Create a client with allowPasswordGrant: false
        const uniqueSuffix = String(Date.now()).slice(-8);
        const client = await clientApi.createClient(
            testTenantId,
            `PG Valid Creds ${uniqueSuffix}`,
            {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowPasswordGrant: false,
            },
        );
        const clientId = client.client.clientId;

        try {
            // Use VALID credentials
            const response = await fixture.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: clientId,
                })
                .set('Accept', 'application/json');

            // Still must be rejected
            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('unauthorized_client');
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {});
        }
    });

    it('should reject disallowed client with non-existent user', async () => {
        // Create a client with allowPasswordGrant: false
        const uniqueSuffix = String(Date.now()).slice(-8);
        const client = await clientApi.createClient(
            testTenantId,
            `PG NonExistent ${uniqueSuffix}`,
            {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowPasswordGrant: false,
            },
        );
        const clientId = client.client.clientId;

        try {
            // Use non-existent user
            const response = await fixture.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: 'nonexistent-user-xyz@example.com',
                    password: 'any-password',
                    client_id: clientId,
                })
                .set('Accept', 'application/json');

            // Must be rejected with unauthorized_client, not invalid_grant
            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('unauthorized_client');
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {});
        }
    });

    it('should reject disallowed client with empty username', async () => {
        // Create a client with allowPasswordGrant: false
        const uniqueSuffix = String(Date.now()).slice(-8);
        const client = await clientApi.createClient(
            testTenantId,
            `PG Empty User ${uniqueSuffix}`,
            {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowPasswordGrant: false,
            },
        );
        const clientId = client.client.clientId;

        try {
            const response = await fixture.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: '',
                    password: 'any-password',
                    client_id: clientId,
                })
                .set('Accept', 'application/json');

            // Should be rejected (either validation error or unauthorized_client)
            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(response.status).toBeLessThan(500);
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {});
        }
    });
});
