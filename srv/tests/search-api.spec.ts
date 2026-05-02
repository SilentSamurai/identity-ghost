import {v4 as uuidv4} from 'uuid';
import {SharedTestFixture} from "./shared-test.fixture";
import {UsersClient} from "./api-client/user-client";
import {TokenFixture} from "./token.fixture";

describe('GenericSearchController (e2e)', () => {
    let app: SharedTestFixture;
    let usersClient: UsersClient;
    let tokenFixture: TokenFixture;
    let accessToken: string;
    let httpServer: any;

    // Test user credentials for search tests
    const testUserEmail = `search-test-${uuidv4()}@example.com`;
    const testUserPassword = 'Test@123456';
    const testUserName = 'Search Test User';

    beforeAll(async () => {
        // Create and set up the test application
        app = new SharedTestFixture();

        // Get admin access token for authenticated requests
        tokenFixture = new TokenFixture(app);
        const tokenResponse = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        accessToken = tokenResponse.accessToken;

        // Initialize the users client with the access token
        usersClient = new UsersClient(app, accessToken);
        httpServer = app.getHttpServer();

        // Create a test user for search operations
        await usersClient.createUser(
            testUserName,
            testUserEmail,
            testUserPassword
        );
    });

    afterAll(async () => {
        // Clean up test user if possible
        try {
            const user = await usersClient.getUserByEmail(testUserEmail);
            if (user && user.id) {
                await usersClient.deleteUser(user.id);
            }
        } catch (error) {
            console.log('Error cleaning up test user:', error);
        }

        await app.close();
    });

    describe('Search Users', () => {
        it('should search users with pagination', async () => {
            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 10
                });

            expect(response.status).toBe(201);
            expect(response.body).toBeDefined();
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.pageNo).toBe(0);
            expect(response.body.pageSize).toBe(10);
        });

        it('should search users with email filter using equals operator', async () => {
            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 50,
                    where: [
                        {
                            field: 'email',
                            label: 'Email',
                            value: testUserEmail,
                            operator: 'equals'
                        }
                    ]
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThanOrEqual(1);
            expect(response.body.data.some(user => user.email === testUserEmail)).toBe(true);
        });

        it('should search users with name filter using contains operator', async () => {
            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 50,
                    where: [
                        {
                            field: 'name',
                            label: 'Name',
                            value: 'Search Test',
                            operator: 'contains'
                        }
                    ]
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.some(user => user.name.includes('Search Test'))).toBe(true);
        });

        it('should return count of users', async () => {
            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    select: 'count'
                });

            expect(response.status).toBe(201);
            expect(response.body).toBeDefined();
            expect(response.body.count).toBeDefined();
            expect(typeof response.body.count).toBe('number');
            expect(response.body.count).toBeGreaterThan(0);
        });

        it('should search users with multiple filters', async () => {
            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 50,
                    where: [
                        {
                            field: 'email',
                            label: 'Email',
                            value: '@example.com',
                            operator: 'contains'
                        },
                        {
                            field: 'name',
                            label: 'Name',
                            value: 'Test',
                            operator: 'contains'
                        }
                    ]
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);

            // All returned users should have @example.com in their email and 'Test' in their name
            response.body.data.forEach(user => {
                expect(user.email).toContain('@example.com');
                expect(user.name).toContain('Test');
            });
        });
    });

    describe('Search Tenants', () => {
        it('should search tenants with pagination', async () => {
            const response = await httpServer
                .post('/api/search/Tenants')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 10
                });

            expect(response.status).toBe(201);
            expect(response.body).toBeDefined();
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should return count of tenants', async () => {
            const response = await httpServer
                .post('/api/search/Tenants')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    select: 'count'
                });

            expect(response.status).toBe(201);
            expect(response.body).toBeDefined();
            expect(response.body.count).toBeDefined();
            expect(typeof response.body.count).toBe('number');
            expect(response.body.count).toBeGreaterThan(0);
        });
    });

    describe('Search Roles', () => {
        it('should search roles with pagination', async () => {
            const response = await httpServer
                .post('/api/search/Roles')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 10
                });

            expect(response.status).toBe(201);
            expect(response.body).toBeDefined();
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });

    describe('Search with Relations', () => {
        it('should search users with tenant relations expanded', async () => {
            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 10,
                    expand: ['Tenants']
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);

            // Check if at least one user has tenants property
            const usersWithTenants = response.body.data.filter(user => user.tenants);
            expect(usersWithTenants.length).toBeGreaterThan(0);
        });

        it('should search roles with tenant relation expanded', async () => {
            const response = await httpServer
                .post('/api/search/Roles')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 10,
                    expand: ['Tenants']
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });

    describe('Search with Complex Filters', () => {
        it('should search with relation filter', async () => {
            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 50,
                    where: [
                        {
                            field: 'Tenants/domain',
                            label: 'Tenant Domain',
                            value: 'auth.server.com',
                            operator: 'equals'
                        }
                    ],
                    expand: ['Tenants']
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should search with multiple operators', async () => {
            // Create a timestamp to test date comparison
            const now = new Date().toISOString();

            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 50,
                    where: [
                        {
                            field: 'createdAt',
                            label: 'Created At',
                            value: now,
                            operator: 'lessThan'
                        },
                        {
                            field: 'email',
                            label: 'Email',
                            value: '@',
                            operator: 'contains'
                        }
                    ]
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
        });

        it('should handle null check operators', async () => {
            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 50,
                    where: [
                        {
                            field: 'email',
                            label: 'Email',
                            value: null,
                            operator: 'isnotnull'
                        }
                    ]
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);

            // All returned users should have non-null email
            response.body.data.forEach(user => {
                expect(user.email).not.toBeNull();
            });
        });
    });

    describe('Error Handling', () => {
        it('should return error for invalid entity', async () => {
            const response = await httpServer
                .post('/api/search/InvalidEntity')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 10
                });

            expect(response.status).toBe(404);
        });

        it('should return error for unauthorized access', async () => {
            // Create an invalid token
            const invalidToken = 'invalid.token.here';

            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${invalidToken}`)
                .set('Accept', 'application/json')
                .send({
                    pageNo: 0,
                    pageSize: 10
                });

            expect(response.status).toBe(401);
        });
    });


    describe('Search with Relations and Pagination', () => {
        it('should search users with tenant relations expanded', async () => {
            const response = await httpServer
                .post('/api/search/Users')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({pageNo: 0, pageSize: 10, expand: ['Tenants']});

            expect(response.status).toBe(201);
            expect(response.body.data).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('should return error for invalid entity', async () => {
            const response = await httpServer
                .post('/api/search/InvalidEntity')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json')
                .send({pageNo: 0, pageSize: 10});

            expect(response.status).toBe(404);
        });
    });

    describe('Test Operations', () => {

        beforeAll(async () => {
            const testUserEmail = `test-${uuidv4()}@example.com`;
            await usersClient.createUser(testUserName, testUserEmail, testUserPassword);
        });

        const testCreatedAt = new Date().toISOString(); // Store the creation date

        const filterTests = [
            {
                rule: 'equals',
                resource: "Users",
                field: "email",
                value: testUserEmail,
                check: (user) => user.email === testUserEmail
            },
            {
                rule: 'notEquals',
                resource: "Users",
                field: "email",
                value: 'non-existent@example.com',
                check: (user) => user.email !== 'non-existent@example.com'
            },
            {
                rule: 'greaterThan',
                resource: "Users",
                field: "createdAt",
                value: testCreatedAt,
                check: (user) => new Date(user.createdAt) > new Date(testCreatedAt)
            },
            {
                rule: 'greaterThanEqual',
                resource: "Users",
                field: "createdAt",
                value: testCreatedAt,
                check: (user) => new Date(user.createdAt) >= new Date(testCreatedAt)
            },
            {
                rule: 'lessThan',
                resource: "Users",
                field: "createdAt",
                value: new Date().toISOString(),
                check: (user) => new Date(user.createdAt) < new Date()
            },
            {
                rule: 'lessThanEquals',
                resource: "Users",
                field: "createdAt",
                value: new Date().toISOString(),
                check: (user) => new Date(user.createdAt) <= new Date()
            },
            {
                rule: 'contains',
                resource: "Users",
                field: "email",
                value: 'test-',
                check: (user) => user.email.includes('test-')
            },
            {
                rule: 'nlike',
                resource: "Users",
                field: "email",
                value: 'invalid',
                check: (user) => !user.email.includes('invalid')
            },
            {
                rule: 'in',
                resource: "Users",
                field: "email",
                value: [testUserEmail, 'another@example.com'],
                check: (user) => [testUserEmail, 'another@example.com'].includes(user.email)
            },
            {
                rule: 'nin',
                resource: "Users",
                field: "email",
                value: ['wrong@example.com'],
                check: (user) => !['wrong@example.com'].includes(user.email)
            },
            {
                rule: 'isnull',
                resource: "Users",
                field: "verified",
                value: null,
                check: (user) => user.verified === null
            },
            {
                rule: 'isnotnull',
                resource: "Users",
                field: "email",
                value: null,
                check: (user) => user.email !== null
            },
            {
                rule: 'matches',
                resource: "Users",
                field: "email",
                value: 'test-*@example.com',
                check: (user) => new RegExp('^test-.*@example.com$').test(user.email)
            },
        ];

        for (let {rule, resource, field, value, check} of filterTests) {
            it(`should filter users using '${rule}' operator`, async () => {
                const response = await httpServer
                    .post(`/api/search/${resource}`)
                    .set('Authorization', `Bearer ${accessToken}`)
                    .set('Accept', 'application/json')
                    .send({
                        pageNo: 0,
                        pageSize: 50,
                        where: [{
                            field: field,
                            label: field,
                            operator: rule,
                            value: value
                        }]
                    });

                console.log(response.body);
                expect(response.status).toBe(201);
                expect(response.body.data).toBeDefined();
                expect(Array.isArray(response.body.data)).toBe(true);

                if (response.body.data.length > 0) {
                    response.body.data.forEach(user => {
                        expect(check(user)).toBe(true);
                    });
                }
            });
        }

    });
});