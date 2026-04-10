import {Injectable} from '@angular/core';
import jwt_decode from 'jwt-decode';
import {Router} from '@angular/router';
import {PureAbility} from '@casl/ability';
import {DecodedToken} from '../model/user.model';
import {TokenVerificationService} from './token-verification.service';
import {PKCEService} from './pkce.service';

const TOKEN_KEY = 'auth-token';
const AUTH_CODE_KEY = 'auth-code';
const PERMISSIONS_KEY = 'auth-permissions';
const REFRESH_TOKEN_KEY = 'auth-refresh-token';
const USER_PROFILE_KEY = 'auth-user-profile';

export interface UserProfile {
    email: string;
    name: string;
    id: string;
}

@Injectable({
    providedIn: 'root',
})
export class SessionService {
    constructor(
        private router: Router,
        private ability: PureAbility,
        private tokenVerificationService: TokenVerificationService,
        private pkceService: PKCEService,
    ) {
    }

    public clearSession(): void {
        window.sessionStorage.removeItem(TOKEN_KEY);
        window.sessionStorage.removeItem(AUTH_CODE_KEY);
        window.sessionStorage.removeItem(PERMISSIONS_KEY);
        window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
        window.sessionStorage.removeItem(USER_PROFILE_KEY);
    }

    public getAuthCode(): string | null {
        return window.sessionStorage.getItem(AUTH_CODE_KEY);
    }

    public saveRefreshToken(token: string): void {
        window.sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
    }

    public getRefreshToken(): string | null {
        return window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
    }

    public saveAuthCode(code: string): void {
        if (!code) {
            throw new Error('Authorization code cannot be empty');
        }
        window.sessionStorage.removeItem(AUTH_CODE_KEY);
        window.sessionStorage.setItem(AUTH_CODE_KEY, code);
    }

    public saveToken(token: string): void {
        if (!this.tokenVerificationService.verifyToken(token)) {
            this.clearSession();
            throw new Error('Invalid token');
        }
        window.sessionStorage.removeItem(TOKEN_KEY);
        window.sessionStorage.setItem(TOKEN_KEY, token);
    }

    public getToken(): string | null {
        return window.sessionStorage.getItem(TOKEN_KEY);
    }

    public getDecodedToken(): DecodedToken | null {
        const token = this.getToken();
        if (!token) {
            return null;
        }
        try {
            const decodedToken = new DecodedToken(jwt_decode(token));
            if (tokenExpired(decodedToken)) {
                this.clearSession();
                return null;
            }
            // Merge stored user profile (email, name) into decoded token
            const profile = this.getUserProfile();
            if (profile) {
                decodedToken.email = profile.email;
                decodedToken.name = profile.name;
            }
            return decodedToken;
        } catch (error) {
            console.error('Error decoding token:', error);
            this.clearSession();
            return null;
        }
    }

    public getUser(): DecodedToken | null {
        return this.getDecodedToken();
    }

    public isTokenExpired(): boolean {
        const token = this.getToken();
        if (!token) {
            return true;
        }
        try {
            return tokenExpired(new DecodedToken(jwt_decode(token)));
        } catch (error) {
            console.error('Error checking token expiration:', error);
            this.clearSession();
            return true;
        }
    }

    /**
     * Saves the user permissions to session storage and updates the ability
     * @param rules The permission rules to save
     * @throws Error if the rules are invalid
     */
    public savePermissions(rules: any[]): void {
        if (!rules || !Array.isArray(rules)) {
            throw new Error('Invalid permissions format');
        }
        window.sessionStorage.setItem(PERMISSIONS_KEY, JSON.stringify(rules));
        this.ability.update(rules);
    }

    public getPersistedPermissions(): any[] | null {
        const raw = window.sessionStorage.getItem(PERMISSIONS_KEY);
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch (error) {
            console.error('Error parsing permissions:', error);
            window.sessionStorage.removeItem(PERMISSIONS_KEY);
            return null;
        }
    }

    public saveUserProfile(profile: UserProfile): void {
        window.sessionStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
    }

    public getUserProfile(): UserProfile | null {
        const raw = window.sessionStorage.getItem(USER_PROFILE_KEY);
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.error('Error parsing user profile:', error);
            window.sessionStorage.removeItem(USER_PROFILE_KEY);
            return null;
        }
    }

    public getCodeVerifier(): string {
        return this.pkceService.getCodeVerifier();
    }

    public userTenantId() {
        const user = this.getUser()!;
        return user.tenant.id;
    }

    public isLoggedIn(): boolean {
        return !!this.getToken();
    }

    public isSuperAdmin(): boolean {
        const user = this.getUser();
        return user !== null && user.roles.includes('SUPER_ADMIN');
    }

    public isTenantAdmin(): boolean {
        const user = this.getUser();
        return (
            user !== null &&
            (user.roles.includes('TENANT_ADMIN') ||
                user.roles.includes('SUPER_ADMIN'))
        );
    }

    public async getCodeChallenge(method: string): Promise<string> {
        return this.pkceService.getCodeChallenge(method);
    }
}

function tokenExpired(token: DecodedToken): boolean {
    if (!token) {
        return true;
    }
    const currentTs = Math.floor(Date.now() / 1000); // current time in seconds
    return token.exp <= currentTs;
}
