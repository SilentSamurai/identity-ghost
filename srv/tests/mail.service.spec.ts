// NOTE: This test suite uses an inline NestJS test module because it requires
// DISABLE_MAIL_RATE_LIMIT=false, which differs from the shared infrastructure's
// default (true). It also needs direct DI access for UserRepository seeding.

import {INestApplication} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {AppModule} from '../src/app.module';
import {Environment} from '../src/config/environment.service';
import {createFakeSmtpServer, FakeSmtpServer} from '../src/mail/FakeSmtpServer';
import * as superTest from 'supertest';
import * as argon2 from 'argon2';
import * as process from 'node:process';
import {setupConsole} from './helper.fixture';

describe('MailService Rate Limiting', () => {
    let app: INestApplication;
    let moduleRef: TestingModule;
    let smtpServer: FakeSmtpServer;

    setupConsole();

    beforeAll(async () => {
        process.env.ENV_FILE = './envs/.env.testing';
        process.env.ENABLE_FAKE_SMTP_SERVER = 'false';
        process.env.DISABLE_MAIL_RATE_LIMIT = 'false';
        Environment.setup();

        smtpServer = createFakeSmtpServer({port: 0, controlPort: 0});
        await smtpServer.listen();
        process.env.MAIL_PORT = String(smtpServer.boundPort);

        moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        await moduleRef.close();
        await smtpServer.close();
    });

    function getHttpServer() {
        return superTest(app.getHttpServer());
    }

    it('should enforce rate limit on forgot password requests', async () => {
        // Create a test user with properly hashed password
        const hashedPassword = await argon2.hash('testPassword123');
        await app.get('UserRepository').save({
            name: 'Test User',
            email: 'test@example.com',
            password: hashedPassword,
            verified: true
        });

        // First request should succeed
        const result1 = await getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test@example.com'});
        expect(result1.status).toBe(201);
        expect(result1.body.status).toBe(true);

        // Second request should succeed
        const result2 = await getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test@example.com'});
        expect(result2.status).toBe(201);
        expect(result2.body.status).toBe(true);

        // Third request should succeed
        const result3 = await getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test@example.com'});
        expect(result3.status).toBe(201);
        expect(result3.body.status).toBe(true);

        // Fourth request should fail due to rate limit
        const result4 = await getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test@example.com'});
        expect(result4.status).toBe(503); // Too Many Requests

        // Verify email count in database
        const updatedUser = await app.get('UserRepository').findOne({where: {email: 'test@example.com'}});
        expect(updatedUser.emailCount).toBe(3);
    });

    it('should reset rate limit after 24 hours', async () => {
        // Create a test user with rate limit almost expired and properly hashed password
        const hashedPassword = await argon2.hash('testPassword123');
        await app.get('UserRepository').save({
            name: 'Test User',
            email: 'test2@example.com',
            password: hashedPassword,
            verified: true,
            emailCount: 3,
            emailCountResetAt: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
        });

        // Test forgot password request
        const result = await getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test2@example.com'});
        expect(result.status).toBe(201);
        expect(result.body.status).toBe(true);

        // Verify email count was reset
        const updatedUser = await app.get('UserRepository').findOne({where: {email: 'test2@example.com'}});
        expect(updatedUser.emailCount).toBe(1);
        expect(updatedUser.emailCountResetAt).toBeDefined();
    });
});
