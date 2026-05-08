import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {lastValueFrom, Observable} from 'rxjs';

const AUTH_API = '/api/oauth';

const httpOptions = {
    headers: new HttpHeaders({'Content-Type': 'application/json'}),
};

const httpOptionsWithCredentials = {
    headers: new HttpHeaders({'Content-Type': 'application/json'}),
    withCredentials: true,
};

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    constructor(private http: HttpClient) {
    }

    /**
     * Authenticate with credentials. Returns {success: true} and sets the sid cookie.
     * The frontend constructs the redirect URL from OAuth params it already has.
     */
    async login(
        email: string,
        password: string,
        client_id: string,
    ): Promise<{ success: true }> {
        return await lastValueFrom(
            this.http.post<{ success: true }>(
                `${AUTH_API}/login`,
                {client_id, email, password},
                httpOptionsWithCredentials,
            ),
        );
    }

    fetchAccessToken(code: string, verifier: string, client_id: string, subscriber_tenant_hint?: string): Promise<any> {
        const body: any = {
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            client_id,
        };
        if (subscriber_tenant_hint) {
            body.subscriber_tenant_hint = subscriber_tenant_hint;
        }
        return lastValueFrom(
            this.http.post(
                `${AUTH_API}/token`,
                body,
                httpOptions,
            ),
        );
    }

    async fetchPermissions(): Promise<any> {
        return await lastValueFrom(this.http.get('/api/v1/my/internal-permissions'));
    }

    async fetchMyProfile(): Promise<any> {
        return await lastValueFrom(this.http.get('/api/users/me'));
    }

    async fetchUserInfo(): Promise<any> {
        return await lastValueFrom(this.http.get(`${AUTH_API}/userinfo`));
    }

    /**
     * Get the current session's user info (email) via cookie-authenticated endpoint.
     */
    async getSessionInfo(): Promise<{ email: string }> {
        return await lastValueFrom(
            this.http.get<{ email: string }>(
                `${AUTH_API}/session-info`,
                {withCredentials: true},
            ),
        );
    }

    /**
     * Invalidate the server-side session and clear the sid cookie.
     */
    async sessionLogout(): Promise<void> {
        await lastValueFrom(
            this.http.post(
                `${AUTH_API}/session-logout`,
                {},
                httpOptionsWithCredentials,
            ),
        );
    }

    validateAuthCode(authCode: string, clientId: string): Promise<any> {
        return lastValueFrom(
            this.http.post(
                `${AUTH_API}/verify-auth-code`,
                {
                    auth_code: authCode,
                    client_id: clientId,
                },
                httpOptions,
            ),
        );
    }

    signUp(
        name: string,
        email: string,
        password: string,
        client_id: string,
    ): Promise<any> {
        return lastValueFrom(
            this.http.post(
                `/api/signup`,
                {
                    name,
                    email,
                    password,
                    client_id,
                },
                httpOptions,
            ),
        );
    }

    registerTenant(
        name: string,
        email: string,
        password: string,
        orgName: string,
        domain: string,
    ): Promise<any> {
        return lastValueFrom(
            this.http.post(
                `/api/register-domain`,
                {
                    name,
                    email,
                    password,
                    orgName,
                    domain,
                },
                httpOptions,
            ),
        );
    }

    refreshAccessToken(refreshToken: string, clientId: string): Observable<any> {
        return this.http.post(
            `${AUTH_API}/token`,
            {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
            },
            httpOptions,
        );
    }

    async logout(refreshToken: string): Promise<void> {
        await lastValueFrom(
            this.http.post(
                `${AUTH_API}/logout`,
                {
                    refresh_token: refreshToken,
                },
                httpOptions,
            ),
        );
    }
}
