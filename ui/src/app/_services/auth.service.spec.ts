import {TestBed} from '@angular/core/testing';
import {HttpClientTestingModule, HttpTestingController,} from '@angular/common/http/testing';
import {AuthService, LoginResponse} from './auth.service';

describe('AuthService', () => {
    let service: AuthService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [AuthService],
        });
        service = TestBed.inject(AuthService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should login successfully', async () => {
        const mockResponse: LoginResponse = {success: true};

        const loginPromise = service.login(
            'test@example.com',
            'password123',
            'client123',
        );

        const req = httpMock.expectOne('/api/oauth/login');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            client_id: 'client123',
            email: 'test@example.com',
            password: 'password123',
        });

        req.flush(mockResponse);

        const result = await loginPromise;
        expect(result).toEqual(mockResponse);
    });

    it('should fetch access token', async () => {
        const mockToken = {
            access_token: 'test_access_token',
            token_type: 'Bearer',
            expires_in: 3600,
        };

        const tokenPromise = service
            .fetchAccessToken('auth_code_123', 'verifier_123', 'test_client_id');

        const req = httpMock.expectOne('/api/oauth/token');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            grant_type: 'authorization_code',
            code: 'auth_code_123',
            code_verifier: 'verifier_123',
            client_id: 'test_client_id'
        });

        req.flush(mockToken);

        const response = await tokenPromise;
        expect(response).toEqual(mockToken);
    });

    it('should fetch permissions', async () => {
        const mockPermissions = ['READ', 'WRITE'];

        const permissionsPromise = service.fetchPermissions();

        const req = httpMock.expectOne('/api/v1/my/internal-permissions');
        expect(req.request.method).toBe('GET');

        req.flush(mockPermissions);

        const result = await permissionsPromise;
        expect(result).toEqual(mockPermissions);
    });

    it('should validate auth code', async () => {
        const mockValidation = {valid: true};

        const validationPromise = service.validateAuthCode('test_auth_code', 'client123');

        const req = httpMock.expectOne('/api/oauth/verify-auth-code');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            auth_code: 'test_auth_code',
            client_id: 'client123',
        });

        req.flush(mockValidation);

        const result = await validationPromise;
        expect(result).toEqual(mockValidation);
    });

    it('should sign up new user', async () => {
        const mockSignupResponse = {success: true};

        const signupPromise = service.signUp(
            'Test User',
            'test@example.com',
            'password123',
            'client123',
        );

        const req = httpMock.expectOne('/api/signup');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123',
            client_id: 'client123',
        });

        req.flush(mockSignupResponse);

        const result = await signupPromise;
        expect(result).toEqual(mockSignupResponse);
    });

    it('should register tenant', async () => {
        const mockRegisterResponse = {success: true};

        const registerPromise = service.registerTenant(
            'Test User',
            'test@example.com',
            'password123',
            'Test Org',
            'test.com',
        );

        const req = httpMock.expectOne('/api/register-domain');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123',
            orgName: 'Test Org',
            domain: 'test.com',
        });

        req.flush(mockRegisterResponse);

        const result = await registerPromise;
        expect(result).toEqual(mockRegisterResponse);
    });
});
