import {SharedTestFixture} from '../shared-test.fixture';

describe('SMTP Adapter End-to-End', () => {
    let fixture: SharedTestFixture;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        // Clear any previously captured emails to avoid cross-test pollution
        await fixture.smtp.clearEmails();
    });

    afterAll(async () => {
        await fixture.close();
    });

    it('should send and retrieve a forgot-password email via SMTP adapter', async () => {
        // Trigger forgot-password email for the super admin user
        const response = await fixture.getHttpServer()
            .post('/api/oauth/forgot-password')
            .set('Accept', 'application/json')
            .set('Host', 'localhost:9001')
            .send({email: 'admin@auth.server.com'});

        expect(response.status).toBe(201);

        // Retrieve the email via SMTP adapter
        const email = await fixture.smtp.getLatestEmail({
            to: 'admin@auth.server.com',
            subject: 'Reset',
            timeoutMs: 10000,
        });

        expect(email).toBeDefined();
        expect(email.subject).toBeDefined();
        expect(email.to).toBeDefined();

        // Verify link extraction
        const links = fixture.smtp.extractLinks(email);
        expect(Array.isArray(links)).toBe(true);
        expect(links.length).toBeGreaterThan(0);

        // Verify path extraction
        const paths = fixture.smtp.extractPaths(email);
        expect(Array.isArray(paths)).toBe(true);
    });
});
