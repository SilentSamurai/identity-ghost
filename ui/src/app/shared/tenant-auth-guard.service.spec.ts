import {TestBed} from '@angular/core/testing';
import {ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree} from '@angular/router';
import {TenantAccessAuthGuard, TenantAdminAuthGuardService} from './tenant-auth-guard.service';
import {SessionService} from '../_services/session.service';
import {AuthDefaultService} from '../_services/auth.default.service';
import {Actions, PermissionService, Subjects} from '../_services/permission.service';

function createMockRoute(tenantId: string | null): ActivatedRouteSnapshot {
    return {
        paramMap: {get: (key: string) => key === 'tenantId' ? tenantId : null},
    } as any;
}

const mockState = {} as RouterStateSnapshot;

describe('TenantAccessAuthGuard', () => {
    let guard: TenantAccessAuthGuard;
    let sessionService: jasmine.SpyObj<SessionService>;
    let permissionService: jasmine.SpyObj<PermissionService>;
    let router: jasmine.SpyObj<Router>;
    let forbiddenUrlTree: UrlTree;

    beforeEach(() => {
        sessionService = jasmine.createSpyObj('SessionService', ['isLoggedIn']);
        permissionService = jasmine.createSpyObj('PermissionService', ['isAuthorized']);
        router = jasmine.createSpyObj('Router', ['parseUrl']);
        forbiddenUrlTree = new UrlTree();
        router.parseUrl.and.returnValue(forbiddenUrlTree);

        TestBed.configureTestingModule({
            providers: [
                TenantAccessAuthGuard,
                {provide: SessionService, useValue: sessionService},
                {provide: AuthDefaultService, useValue: {}},
                {provide: PermissionService, useValue: permissionService},
                {provide: Router, useValue: router},
            ],
        });
        guard = TestBed.inject(TenantAccessAuthGuard);
    });

    it('should return UrlTree to /error/403 when not logged in', () => {
        sessionService.isLoggedIn.and.returnValue(false);
        const result = guard.canActivate(createMockRoute('tenant-1'), mockState);
        expect(result).toBe(forbiddenUrlTree);
        expect(router.parseUrl).toHaveBeenCalledWith('/error/403');
    });

    it('should return UrlTree to /error/403 when tenantId is missing', () => {
        sessionService.isLoggedIn.and.returnValue(true);
        const result = guard.canActivate(createMockRoute(null), mockState);
        expect(result).toBe(forbiddenUrlTree);
    });

    it('should return UrlTree to /error/403 when user lacks Read permission', () => {
        sessionService.isLoggedIn.and.returnValue(true);
        permissionService.isAuthorized.and.returnValue(false);
        const result = guard.canActivate(createMockRoute('tenant-1'), mockState);
        expect(result).toBe(forbiddenUrlTree);
        expect(permissionService.isAuthorized).toHaveBeenCalledWith(
            Actions.Read, Subjects.TENANT, {id: 'tenant-1'},
        );
    });

    it('should return true when user has Read permission', () => {
        sessionService.isLoggedIn.and.returnValue(true);
        permissionService.isAuthorized.and.returnValue(true);
        const result = guard.canActivate(createMockRoute('tenant-1'), mockState);
        expect(result).toBe(true);
    });
});

describe('TenantAdminAuthGuardService', () => {
    let guard: TenantAdminAuthGuardService;
    let sessionService: jasmine.SpyObj<SessionService>;
    let permissionService: jasmine.SpyObj<PermissionService>;
    let router: jasmine.SpyObj<Router>;
    let forbiddenUrlTree: UrlTree;

    beforeEach(() => {
        sessionService = jasmine.createSpyObj('SessionService', ['isLoggedIn']);
        permissionService = jasmine.createSpyObj('PermissionService', ['isAuthorized']);
        router = jasmine.createSpyObj('Router', ['parseUrl']);
        forbiddenUrlTree = new UrlTree();
        router.parseUrl.and.returnValue(forbiddenUrlTree);

        TestBed.configureTestingModule({
            providers: [
                TenantAdminAuthGuardService,
                {provide: SessionService, useValue: sessionService},
                {provide: AuthDefaultService, useValue: {}},
                {provide: PermissionService, useValue: permissionService},
                {provide: Router, useValue: router},
            ],
        });
        guard = TestBed.inject(TenantAdminAuthGuardService);
    });

    it('should return UrlTree to /error/403 when not logged in', () => {
        sessionService.isLoggedIn.and.returnValue(false);
        const result = guard.canActivate(createMockRoute('tenant-1'), mockState);
        expect(result).toBe(forbiddenUrlTree);
        expect(router.parseUrl).toHaveBeenCalledWith('/error/403');
    });

    it('should return UrlTree to /error/403 when tenantId is missing', () => {
        sessionService.isLoggedIn.and.returnValue(true);
        const result = guard.canActivate(createMockRoute(null), mockState);
        expect(result).toBe(forbiddenUrlTree);
    });

    it('should return UrlTree to /error/403 when user lacks Manage permission', () => {
        sessionService.isLoggedIn.and.returnValue(true);
        permissionService.isAuthorized.and.returnValue(false);
        const result = guard.canActivate(createMockRoute('tenant-1'), mockState);
        expect(result).toBe(forbiddenUrlTree);
        expect(permissionService.isAuthorized).toHaveBeenCalledWith(
            Actions.Manage, Subjects.TENANT, {id: 'tenant-1'},
        );
    });

    it('should return true when user has Manage permission', () => {
        sessionService.isLoggedIn.and.returnValue(true);
        permissionService.isAuthorized.and.returnValue(true);
        const result = guard.canActivate(createMockRoute('tenant-1'), mockState);
        expect(result).toBe(true);
    });
});
