import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for client_id binding verification at token exchange.
 *
 * Verifies that the token endpoint rejects authorization codes presented by
 * a different client than the one that requested them (RFC 6749 §4.1.2).
 *
 * Requirements: 3.1, 3.2
 */
describe('client_id binding verification at token exchange', () => {
    let app: SharedTestFixture;
    const clientId = "auth.server.com";
    const email = "admin@auth.server.com";
    const password = "admin9000";
    const verifier = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    const challenge = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: login with client A and return the authorization code.
     */
    async function loginAndGetCode(): Promise<string> {
        const response = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email,
                password,
                client_id: clientId,
                code_challenge: challenge,
                code_challenge_method: "plain",
            })
            .set('Accept', 'application/json');
        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        return response.body.authentication_code;
    }

    // Requirement 3.2: token exchange with a different client_id must be rejected
    it('should return invalid_grant when client_id does not match the stored value', async () => {
        const code = await loginAndGetCode();

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: "wrong.client.com",
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual("invalid_grant");
    });

    // Requirement 3.1: token exchange with the matching client_id must succeed
    it('should succeed when client_id matches the stored value', async () => {
        const code = await loginAndGetCode();

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });
});
