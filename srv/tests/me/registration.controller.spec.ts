// NOTE: This test suite uses an inline NestJS test module because it requires
// jest.spyOn() to mock internal services (MailService, TenantService).
// SharedTestFixture does not expose the NestJS app instance.

import {INestApplication} from "@nestjs/common";
import {Test, TestingModule} from "@nestjs/testing";
import {AppModule} from "../../src/app.module";
import {MailService} from "../../src/mail/mail.service";
import {TenantService} from "../../src/services/tenant.service";
import {Environment} from "../../src/config/environment.service";
import * as superTest from "supertest";
import * as process from "node:process";
import {setupConsole} from "../helper.fixture";

describe('RegistrationController', () => {
    let app: INestApplication;
    let moduleRef: TestingModule;
    let mailService: MailService;
    let tenantService: TenantService;

    setupConsole();

    beforeEach(async () => {
        process.env.ENV_FILE = './envs/.env.testing';
        process.env.ENABLE_FAKE_SMTP_SERVER = 'false';
        Environment.setup();

        moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        mailService = app.get<MailService>(MailService);
        tenantService = app.get<TenantService>(TenantService);
    });

    afterEach(async () => {
        await app.close();
        await moduleRef.close();
    });

    function getHttpServer() {
        return superTest(app.getHttpServer());
    }

    it('should fail when domain exists', async () => {
        // Setup existing domain
        jest.spyOn(tenantService, 'existByDomain').mockResolvedValue(true);

        const response = await getHttpServer()
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

        const response = await getHttpServer()
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

        const response = await getHttpServer()
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
        const response = await getHttpServer()
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
        const authResponse = await getHttpServer()
            .post('/api/login')
            .send({email: 'user@test.com', password: 'ValidPass1!'});

        const response = await getHttpServer()
            .post('/api/signdown')
            .set('Authorization', `Bearer ${authResponse.body.access_token}`)
            .send({password: 'wrong-password'});

        expect(response.status).toBe(401);
    });
});
