import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {lastValueFrom, Observable} from 'rxjs';

const AUTH_API = '/api/oauth';

const httpOptions = {
    headers: new HttpHeaders({'Content-Type': 'application/json'}),
};

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    constructor(private http: HttpClient) {
    }

    async login(
        email: string,
        password: string,
        client_id: string,
        code_challenge: string,
        method: string,
        subscriber_tenant_hint?: string,
        nonce?: string,
    ): Promise<any> {
        const body: any = {
            code_challenge: code_challenge,
            code_challenge_method: method,
            client_id,
            email,
            password,
        };
        if (subscriber_tenant_hint) {
            body.subscriber_tenant_hint = subscriber_tenant_hint;
        }
        if (nonce) {
            body.nonce = nonce;
        }
        return await lastValueFrom(
            this.http.post(
                `${AUTH_API}/login`,
                body,
                httpOptions,
            ),
        );
    }

    fetchAccessToken(code: string, verifier: string, client_id: string, subscriber_tenant_hint?: string): Observable<any> {
        const body: any = {
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            client_id
        };
        
        if (subscriber_tenant_hint) {
            body.subscriber_tenant_hint = subscriber_tenant_hint;
        }

        return this.http.post(
            `${AUTH_API}/token`,
            body,
            httpOptions,
        );
    }

    async fetchPermissions(): Promise<any> {
        return await lastValueFrom(this.http.get('/api/v1/my/internal-permissions'));
    }

    async fetchMyProfile(): Promise<any> {
        return await lastValueFrom(this.http.get('/api/users/me'));
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

    async submitConsent(params: {
        email: string;
        password: string;
        client_id: string;
        code_challenge: string;
        code_challenge_method: string;
        approved_scopes: string[];
        consent_action: 'approve' | 'deny';
        redirect_uri?: string;
        scope?: string;
        nonce?: string;
        subscriber_tenant_hint?: string;
    }): Promise<any> {
        const body: any = {
            email: params.email,
            password: params.password,
            client_id: params.client_id,
            code_challenge: params.code_challenge,
            code_challenge_method: params.code_challenge_method,
            approved_scopes: params.approved_scopes,
            consent_action: params.consent_action,
        };
        if (params.redirect_uri) {
            body.redirect_uri = params.redirect_uri;
        }
        if (params.scope) {
            body.scope = params.scope;
        }
        if (params.nonce) {
            body.nonce = params.nonce;
        }
        if (params.subscriber_tenant_hint) {
            body.subscriber_tenant_hint = params.subscriber_tenant_hint;
        }
        return await lastValueFrom(
            this.http.post(
                `${AUTH_API}/consent`,
                body,
                httpOptions,
            ),
        );
    }

}
