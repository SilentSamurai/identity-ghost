import {
    HTTP_INTERCEPTORS,
    HttpErrorResponse,
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpRequest
} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {BehaviorSubject, catchError, filter, Observable, switchMap, take, throwError} from 'rxjs';
import {SessionService} from '../_services/session.service';
import {AuthDefaultService} from '../_services/auth.default.service';
import {AuthService} from '../_services/auth.service';
import jwt_decode from 'jwt-decode';
import {JwtToken} from '../model/user.model';

const TOKEN_HEADER_KEY = 'Authorization';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
    private isRefreshing = false;
    private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

    constructor(
        private tokenService: SessionService,
        private authDefaultService: AuthDefaultService,
        private authService: AuthService,
    ) {
    }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        let authReq = req;

        const nonAuthUrls = ['/login', '/authorize', '/register', '/forgot-password', '/reset-password'];
        if (nonAuthUrls.some(url => req.url.includes(url))) {
            return next.handle(req);
        }

        // Don't intercept the refresh token request itself to avoid infinite loops
        if (req.url.includes('/api/oauth/token')) {
            return next.handle(req);
        }

        // Check if token is expired before sending the request
        if (this.tokenService.getToken() != null && this.tokenService.isTokenExpired()) {
            return this.handleTokenRefresh(req, next);
        }

        // Add Authorization header if token is present
        const token = this.tokenService.getToken();
        if (token) {
            authReq = this.addTokenHeader(req, token);
        }

        // Handle 401 response errors
        return next.handle(authReq).pipe(
            catchError((error: HttpErrorResponse) => {
                if (error.status === 401) {
                    return this.handleTokenRefresh(req, next);
                }
                return throwError(() => error);
            })
        );
    }

    private handleTokenRefresh(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        if (!this.isRefreshing) {
            this.isRefreshing = true;
            this.refreshTokenSubject.next(null);

            const refreshToken = this.tokenService.getRefreshToken();
            const clientId = this.extractClientIdFromToken();

            if (!refreshToken || !clientId) {
                this.isRefreshing = false;
                this.authDefaultService.signOut('/home', true);
                return throwError(() => new Error('Token expired'));
            }

            return this.authService.refreshAccessToken(refreshToken, clientId).pipe(
                switchMap((data: any) => {
                    this.isRefreshing = false;

                    // Save the new tokens
                    this.tokenService.saveToken(data.access_token);
                    if (data.refresh_token) {
                        this.tokenService.saveRefreshToken(data.refresh_token);
                    }

                    this.refreshTokenSubject.next(data.access_token);

                    // Retry the original request with the new token
                    return next.handle(this.addTokenHeader(req, data.access_token));
                }),
                catchError((err) => {
                    this.isRefreshing = false;
                    this.authDefaultService.signOut('/home', true);
                    return throwError(() => err);
                })
            );
        }

        // If a refresh is already in progress, queue this request until the new token arrives
        return this.refreshTokenSubject.pipe(
            filter(token => token !== null),
            take(1),
            switchMap((token) => next.handle(this.addTokenHeader(req, token!)))
        );
    }

    private addTokenHeader(req: HttpRequest<any>, token: string): HttpRequest<any> {
        return req.clone({
            headers: req.headers.set(TOKEN_HEADER_KEY, 'Bearer ' + token),
        });
    }

    /**
     * Extract client_id from the raw JWT without going through getDecodedToken(),
     * which clears the session (including the refresh token) when the token is expired.
     */
    private extractClientIdFromToken(): string | null {
        const token = this.tokenService.getToken();
        if (!token) {
            return null;
        }
        try {
            const decoded = jwt_decode<JwtToken>(token);
            return decoded.client_id ?? decoded.tenant?.client_id ?? null;
        } catch {
            return null;
        }
    }
}

export const authInterceptorProviders = [
    {provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true},
];
