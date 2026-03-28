import { SharedTestFixture } from '../shared-test.fixture';

describe('Shared Infrastructure Lifecycle', () => {
    let fixture: SharedTestFixture;

    beforeAll(() => {
        fixture = new SharedTestFixture();
    });

    afterAll(async () => {
        await fixture.close();
    });

    it('should connect to the shared NestJS app via HTTP', async () => {
        const response = await fixture.getHttpServer()
            .get('/api/v1/health-check')
            .set('Accept', 'application/json');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('health', true);
    });

    it('should connect to the shared SMTP control API', async () => {
        const result = await fixture.smtp.listEmails();
        expect(result).toHaveProperty('emails');
        expect(Array.isArray(result.emails)).toBe(true);
    });

    it('should connect to the shared webhook server', async () => {
        const result = await fixture.webhook.getOnboardRequests();
        expect(result).toHaveProperty('count');
        expect(result).toHaveProperty('requests');
    });

    it('should provide a working JwtService for decode operations', () => {
        const jwtService = fixture.jwtService();
        expect(jwtService).toBeDefined();
        expect(typeof jwtService.decode).toBe('function');
    });
});
