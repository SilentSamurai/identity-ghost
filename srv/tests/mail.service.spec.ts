// NOTE: This test suite uses TestAppFixture instead of SharedTestFixture because it requires
// direct DI container access (app.nestApp.get()) for MailService and UserRepository.
// SharedTestFixture does not expose the NestJS app instance.

import {MailService} from '../src/mail/mail.service';
import {FakeSmtpServer} from '../src/mail/FakeSmtpServer';
import {TestAppFixture} from './test-app.fixture';
import * as argon2 from 'argon2';
import * as process from "node:process";

describe('MailService Rate Limiting', () => {
    let app: TestAppFixture;
    let mailService: MailService;
    let smtpServer: FakeSmtpServer;

    beforeAll(async () => {
        // Create and set up the test application
        process.env['DISABLE_MAIL_RATE_LIMIT'] = 'false'
        app = await new TestAppFixture().init();
        mailService = app.nestApp.get<MailService>(MailService);
        smtpServer = app.smtp;
    });

    afterAll(async () => {
        await app.close();
    });

    it('should enforce rate limit on forgot password requests', async () => {
        // Create a test user with properly hashed password
        const hashedPassword = await argon2.hash('testPassword123');
        const user = await app.nestApp.get('UserRepository').save({
            name: 'Test User',
            email: 'test@example.com',
            password: hashedPassword,
            verified: true
        });

        // Test forgot password requests
        const headers = {host: 'localhost:3000'};

        // First request should succeed
        const result1 = await app.getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test@example.com'});
        expect(result1.status).toBe(201);
        expect(result1.body.status).toBe(true);

        // Second request should succeed
        const result2 = await app.getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test@example.com'});
        expect(result2.status).toBe(201);
        expect(result2.body.status).toBe(true);

        // Third request should succeed
        const result3 = await app.getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test@example.com'});
        expect(result3.status).toBe(201);
        expect(result3.body.status).toBe(true);

        // Fourth request should fail due to rate limit
        const result4 = await app.getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test@example.com'});
        expect(result4.status).toBe(503); // Too Many Requests

        // Verify email count in database
        const updatedUser = await app.nestApp.get('UserRepository').findOne({where: {email: 'test@example.com'}});
        expect(updatedUser.emailCount).toBe(3);
    });

    it('should reset rate limit after 24 hours', async () => {
        // Create a test user with rate limit almost expired and properly hashed password
        const hashedPassword = await argon2.hash('testPassword123');
        const user = await app.nestApp.get('UserRepository').save({
            name: 'Test User',
            email: 'test2@example.com',
            password: hashedPassword,
            verified: true,
            emailCount: 3,
            emailCountResetAt: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
        });

        // Test forgot password request
        const result = await app.getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .send({email: 'test2@example.com'});
        expect(result.status).toBe(201);
        expect(result.body.status).toBe(true);

        // Verify email count was reset
        const updatedUser = await app.nestApp.get('UserRepository').findOne({where: {email: 'test2@example.com'}});
        expect(updatedUser.emailCount).toBe(1);
        expect(updatedUser.emailCountResetAt).toBeDefined();
    });
}); 