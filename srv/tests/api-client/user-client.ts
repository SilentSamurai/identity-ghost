import {expect2xx, HttpClient, TestFixture} from "./client";

export class UsersClient extends HttpClient {

    constructor(app: TestFixture, accessToken: string) {
        super(app, accessToken);
    }

    // -----------------------------------------------------------------
    // Create a user (POST /api/users/create)
    // -----------------------------------------------------------------
    public async createUser(name: string, email: string, password: string) {
        const response = await this.app.getHttpServer()
            .post('/api/users/create')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({name, email, password});

        console.log("Create User Response:", response.body);
        expect2xx(response);
        // Typically expect 201 for a successful creation
        return response.body;
    }

    public async getUserByEmail(email: string) {
        const response = await this.app.getHttpServer()
            .post('/api/search/Users')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({
                "pageNo": 0,
                "pageSize": 50,
                "where": [
                    {
                        "field": "email",
                        "label": "Email",
                        "value": email,
                        "operator": "equals"
                    }
                ],
                "orderBy": [],
                "expand": []
            });

        console.log("Search User Response:", response.body);
        expect2xx(response);

        expect(response.body).toBeDefined();
        expect(response.body.data).toBeDefined();
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThanOrEqual(1);

        return response.body.data[0];
    }

    // -----------------------------------------------------------------
    // Get user details (GET /api/users/:email)
    // -----------------------------------------------------------------
    public async getUser(id: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/users/${id}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get User Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Update a user (PUT /api/users/update)
    // -----------------------------------------------------------------
    public async updateUser(
        id: string,
        name: string,
        email: string
    ) {
        const response = await this.app.getHttpServer()
            .put('/api/users/update')
            .send({id, name, email})
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Update User Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Get all users (GET /api/users)
    // -----------------------------------------------------------------
    public async getAllUsers() {
        const response = await this.app.getHttpServer()
            .get('/api/users')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get All Users Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Get user tenants (GET /api/users/:email/tenants)
    // -----------------------------------------------------------------
    public async getUserTenants(id: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/users/${id}/tenants`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get User Tenants Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Delete a user (DELETE /api/users/:id)
    // -----------------------------------------------------------------
    public async deleteUser(id: string) {
        const response = await this.app.getHttpServer()
            .delete(`/api/users/${id}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Delete User Response:", response.body);
        expect2xx(response);
        return response;
    }


    public async registerTenant(name: string, email: string, password: string, orgName: string, domain: string) {
        const response = await this.app.getHttpServer()
            .post('/api/register-domain')
            .set('Accept', 'application/json')
            .send({name, email, password, orgName, domain});

        console.log("Signup Response:", response.body);
        expect2xx(response);
        return response.body;
    }


    // -----------------------------------------------------------------
    // Sign up a new user (POST /api/users/signup)
    // -----------------------------------------------------------------
    public async signup(name: string, email: string, password: string, client_id: string) {
        const response = await this.app.getHttpServer()
            .post('/api/signup')
            .set('Accept', 'application/json')
            .send({name, email, password, client_id});

        console.log("Signup Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Sign down (delete account) (POST /api/users/signdown)
    // -----------------------------------------------------------------
    public async signdown(password: string) {
        const response = await this.app.getHttpServer()
            .post('/api/signdown')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({password});

        console.log("Signdown Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Get current user details (GET /api/users/me)
    // -----------------------------------------------------------------
    public async getMe() {
        const response = await this.app.getHttpServer()
            .get('/api/users/me')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Me Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Update current user's email (PATCH /api/users/me/email)
    // -----------------------------------------------------------------
    public async updateMyEmail(email: string) {
        const response = await this.app.getHttpServer()
            .patch('/api/users/me/email')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({email});

        console.log("Update My Email Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Update current user's password (PATCH /api/users/me/password)
    // -----------------------------------------------------------------
    public async updateMyPassword(currentPassword: string, newPassword: string) {
        const response = await this.app.getHttpServer()
            .patch('/api/users/me/password')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({currentPassword, newPassword});

        console.log("Update My Password Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Update current user's name (PATCH /api/users/me/name)
    // -----------------------------------------------------------------
    public async updateMyName(name: string) {
        const response = await this.app.getHttpServer()
            .patch('/api/users/me/name')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({name});

        console.log("Update My Name Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Get current user's tenants (GET /api/users/me/tenants)
    // -----------------------------------------------------------------
    public async getMyTenants() {
        const response = await this.app.getHttpServer()
            .get('/api/users/me/tenants')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get My Tenants Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Lock a user (PUT /api/users/:userId/lock)
    // -----------------------------------------------------------------
    public async lockUser(userId: string) {
        const response = await this.app.getHttpServer()
            .put(`/api/users/${userId}/lock`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({});

        console.log("Lock User Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async lockUserRaw(userId: string) {
        return this.app.getHttpServer()
            .put(`/api/users/${userId}/lock`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({});
    }

    // -----------------------------------------------------------------
    // Unlock a user (PUT /api/users/:userId/unlock)
    // -----------------------------------------------------------------
    public async unlockUser(userId: string) {
        const response = await this.app.getHttpServer()
            .put(`/api/users/${userId}/unlock`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({});

        console.log("Unlock User Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async unlockUserRaw(userId: string) {
        return this.app.getHttpServer()
            .put(`/api/users/${userId}/unlock`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({});
    }

}