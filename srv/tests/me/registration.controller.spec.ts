// NOTE: This test suite uses TestAppFixture instead of SharedTestFixture because it requires
// direct DI container access (app.nestApp.get()) to mock internal services (MailService, TenantService).
// SharedTestFixture does not expose the NestJS app instance.

import {TestAppFixture} from "../test-app.fixture";
import {MailService} from "../../src/mail/mail.service";
import {TenantService} from "../../src/services/tenant.service";


describe('RegistrationController', () => {
    let app: TestAppFixture;
    let mailService: MailService;
    let tenantService: TenantService;

    beforeEach(async () => {
        app = await new TestAppFixture().init();
        mailService = app.nestApp.get<MailService>(MailService);
        tenantService = app.nestApp.get<TenantService>(TenantService);
    });

    afterEach(async () => {
        await app.close();
    });

    it('should fail when domain exists', async () => {
        // Setup existing domain
        jest.spyOn(tenantService, 'existByDomain').mockResolvedValue(true);

        const response = await app.getHttpServer()
            .post('/api/register-domain')
            .send({
                name: 'test',
                password: 'ValidPass1!',
                email: 'exists@test.com',
                orgName: 'Test Org',
                domain: 'existing-domain.com'
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Domain already exists');
    });

    it('should handle email service failure', async () => {
        // Simulate mail service failure
        jest.spyOn(mailService, 'sendVerificationMail').mockResolvedValue(false);

        const response = await app.getHttpServer()
            .post('/api/register-domain')
            .send({
                name: 'test',
                password: 'ValidPass1!',
                email: 'fail@test.com',
                orgName: 'Test Org',
                domain: 'new-domain.com'
            });

        console.log("should handle email service failure body: ", response.body)

        expect(response.status).toBe(503);
        expect(response.body.message).toContain('Mail service error');
    });

    it('should prevent signup when not allowed by tenant', async () => {
        jest.spyOn(tenantService, 'findByClientIdOrDomain').mockResolvedValue({
            allowSignUp: false
        } as any);

        const response = await app.getHttpServer()
            .post('/api/signup')
            .send({
                name: 'test',
                password: 'ValidPass1!',
                email: 'blocked@test.com',
                client_id: 'restricted-client'
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Sign up not allowed');
    });

    it('should handle existing user signup', async () => {

        // Setup existing user
        const response = await app.getHttpServer()
            .post('/api/signup')
            .send({
                name: 'legolas',
                password: 'legolas9000',
                email: 'legolas@mail.com', // Use email that already exists
                client_id: 'shire.local'
            });

        console.log("existing user signup response body: ", response.body)

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
    });


    it('should require valid password for deletion', async () => {
        // Setup authenticated user
        const authResponse = await app.getHttpServer()
            .post('/api/login')
            .send({email: 'user@test.com', password: 'ValidPass1!'});

        const response = await app.getHttpServer()
            .post('/api/signdown')
            .set('Authorization', `Bearer ${authResponse.body.access_token}`)
            .send({password: 'wrong-password'});

        expect(response.status).toBe(401);
    });
});