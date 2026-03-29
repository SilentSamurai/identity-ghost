import {expect2xx, TestFixture} from "./api-client/client";

export class TokenFixture {

    private readonly app: TestFixture;

    constructor(app: TestFixture) {
        this.app = app;
    }

    public async fetchAccessToken(username: string, password: string, client_id: string): Promise<{
        accessToken: string,
        refreshToken: string,
        jwt: any
    }> {
        const response = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": username,
                "password": password,
                "client_id": client_id
            })
            .set('Accept', 'application/json');

        console.log("fetchAccessToken Response: ", response.body);

        expect2xx(response);

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        expect(response.body.refresh_token).toBeDefined();

        let decode = this.app.jwtService().decode(response.body.access_token, {json: true}) as any;
        expect(decode.sub).toBeDefined();
        expect(decode.email).toBeDefined();
        expect(decode.name).toBeDefined();
        expect(decode.grant_type).toBeDefined();
        expect(decode.tenant.id).toBeDefined();
        expect(decode.tenant.name).toBeDefined();
        expect(decode.tenant.domain).toBeDefined();

        return {
            accessToken: response.body.access_token,
            refreshToken: response.body.refresh_token,
            jwt: decode
        }
    }


    public async getUser(email: string, password: string) {
        const token = await this.fetchAccessToken(
            email,
            password,
            "auth.server.com"
        );
        const response = await this.app.getHttpServer()
            .get("/api/users/me")
            .set('Authorization', `Bearer ${token.accessToken}`)
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        console.log(response.body);
        return response.body;
    }

    /**
     * Fetch an access token using the client credentials grant.
     * Takes clientId and clientSecret, and returns an object containing
     * the access token, refresh token, and decoded JWT.
     */
    public async fetchClientCredentialsToken(clientId: string, clientSecret: string): Promise<{
        accessToken: string,
        refreshToken?: string,
        jwt: any
    }> {
        const response = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret
            })
            .set('Accept', 'application/json');

        console.log("fetchClientCredentialsToken Response: ", response.body);

        expect2xx(response);
        // Depending on your OAuth2 implementation, a 200 or 201 response code is typical
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');

        // The refresh token may or may not be present in client_credentials flows
        const decode = this.app.jwtService().decode(response.body.access_token, {json: true}) as any;

        // Additional checks on decoded token fields can be added here if needed

        return {
            accessToken: response.body.access_token,
            refreshToken: response.body.refresh_token,
            jwt: decode
        };
    }

    /**
     * Login using OAuth authorization code flow.
     * Returns the response which may contain an authentication_code or requires_tenant_selection.
     */
    public async login(email: string, password: string, clientId: string, codeChallenge: string = 'verifier', subscriberTenantHint?: string): Promise<any> {
        const body: any = {
            email,
            password,
            client_id: clientId,
            code_challenge_method: 'plain',
            code_challenge: codeChallenge
        };
        if (subscriberTenantHint) {
            body.subscriber_tenant_hint = subscriberTenantHint;
        }
        const response = await this.app.getHttpServer()
            .post('/api/oauth/login')
            .send(body)
            .set('Accept', 'application/json');

        expect2xx(response);
        return response.body;
    }

    public async exchangeCodeForToken(
        code: string,
        clientId: string,
        codeVerifier: string = 'verifier'
    ): Promise<{
        access_token?: string,
        refresh_token?: string,
        token_type?: string,
        error?: string,
        tenants?: Array<{ id: string, name: string, client_id: string, domain: string }>
    }> {
        const response = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: codeVerifier,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(response);

        // If there's an error response (like ambiguous tenants), return it directly
        if (response.body.error) {
            return response.body;
        }

        // Otherwise, return the token response
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        return response.body;
    }

    /**
     * Exchange an authentication code for an access token.
     * Supports resolving subscription tenant ambiguity by providing subscription_tenant_id.
     */
    public async exchangeCodeWithHint(
        code: string,
        clientId: string,
        subscriptionTenantId?: string,
        codeVerifier: string = 'verifier'
    ): Promise<{
        access_token?: string,
        refresh_token?: string,
        token_type?: string,
        error?: string,
        tenants?: Array<{ id: string, name: string, client_id: string, domain: string }>
    }> {
        const response = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: codeVerifier,
                client_id: clientId,
                ...(subscriptionTenantId && {subscriber_tenant_hint: subscriptionTenantId})
            })
            .set('Accept', 'application/json');

        expect2xx(response);

        // If there's an error response (like ambiguous tenants), return it directly
        if (response.body.error) {
            return response.body;
        }

        // Otherwise, return the token response
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        return response.body;
    }

}
