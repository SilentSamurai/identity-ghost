/**
 * Integration tests for negative OAuth token flow scenarios.
 * 
 * Tests error responses for:
 * - Invalid credentials (wrong password)
 * - Missing grant type
 * - Invalid grant types
 * - Invalid refresh tokens
 * 
 * Verifies OAuth 2.0 RFC 6749 compliant error responses.
 */
import {SharedTestFixture} from "../shared-test.fixture";

describe('e2e negative token flow', () => {
    let app: SharedTestFixture;
    let refreshToken = "";
    let accessToken = "";
    let clientId = "";
    let clientSecret = "";

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    it(`/POST Wrong Password `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": "admin@auth.server.com",
                "password": "wrong-password",
                "client_id": "auth.server.com"
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');
    });

    it(`/POST Missing Grant Type `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                // "grant_type": "password",
                "username": "admin@auth.server.com",
                "password": "wrong-password",
                "client_id": "auth.server.com"
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST Wrong Grant Type `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "missing-Grant",
                "username": "admin@auth.server.com",
                "password": "wrong-password",
                "client_id": "auth.server.com"
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST Wrong email `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": "wrong-email@sada.cas",
                "password": "wrong-password",
                "client_id": "auth.server.com"
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(404);
    });

    it(`/POST Wrong Domain `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": "admin@auth.server.com",
                "password": "admin9000",
                "client_id": "auth.server.comasda"
            })
            .set('Accept', 'application/json');

        console.log(response.body);
        expect(response.status).toEqual(400);
    });

    it(`/POST Refresh Token Missing Grant Type `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                // "grant_type": "refresh_token",
                "refresh_token": refreshToken,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST Refresh Token Null Grant Type `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": null,
                "refresh_token": refreshToken,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST Invalid Refresh Token `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "refresh_token",
                "refresh_token": "auasd",
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST Null Refresh Token `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "refresh_token",
                "refresh_token": null,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST Wrong Refresh Token Label`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "refresh_token",
                "refreshToken": "Asfasg",
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST Client Credentials Missing Grant Type `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                // "grant_type": "client_credentials",
                "client_id": clientId,
                "client_secret": clientSecret
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST Empty Client Credentials`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "client_credentials",
                "client_id": "",
                "client_secret": ""
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST Wrong Client Credentials`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "client_credentials",
                "client_id": "sadasdasfasf",
                "client_secret": "asfasfasfasfasf"
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(404);
    });

    it(`/POST password Gibberish `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": "sdgsdah@safasf.asfasfa",
                "password": "asfasfasf",
                "client_id": "tracko.com"
            })
            .set('Accept', 'application/json');

        console.log(response.body)
        expect(response.status).toEqual(404);
    });

    it(`/POST grant_type null Client Credentials`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": null,
                "client_id": "",
                "client_secret": ""
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST client_id null Client Credentials`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "client_credentials",
                "client_id": null,
                "client_secret": ""
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST client_secret null Client Credentials`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "client_credentials",
                "client_id": "Asfasf",
                "client_secret": null
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
    });

    it(`/POST password is null `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": "sdgsdah@safasf.asfasfa",
                "password": null,
                "client_id": "tracko.com"
            })
            .set('Accept', 'application/json');

        console.log(response.body)
        expect(response.status).toEqual(400);
    });

    it(`/POST email is null `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": null,
                "password": "asfasf",
                "client_id": "tracko.com"
            })
            .set('Accept', 'application/json');

        console.log(response.body)
        expect(response.status).toEqual(400);
    });

    it(`/POST client_id is null `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": "asgasgasg@fsaf.asf",
                "password": "asfasf",
                "client_id": null
            })
            .set('Accept', 'application/json');

        console.log(response.body)
        expect(response.status).toEqual(400);
    });

    it(`/POST grant_type is null `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": null,
                "username": "asgasgasg@fsaf.asf",
                "password": "asfasf",
                "client_id": "dasdasd"
            })
            .set('Accept', 'application/json');

        console.log(response.body)
        expect(response.status).toEqual(400);
    });

});

