import {Injectable} from '@angular/core';
import {Router} from '@angular/router';
import {SessionService} from './session.service';
import {MessageService} from 'primeng/api';

@Injectable({
    providedIn: 'root',
})
export class AuthDefaultService {
    public title: string = 'Home';

    constructor(
        private router: Router,
        private sessionService: SessionService,
        private messageService: MessageService,
    ) {
    }

    async signOut(redirect: string, showSessionExpiredMessage: boolean = false, client_id: string | null = null): Promise<void> {
        if (showSessionExpiredMessage) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Session Expired',
                detail: 'Your session has expired. Please log in again.',
                life: 5000
            });
        }
        const userInfo = this.sessionService.getUser();
        this.sessionService.clearSession();
        await this.navToLogin(redirect, client_id || userInfo?.tenant.client_id || null);
    }

    public async navToLogin(
        redirect: string,
        client_id: string | null,
    ): Promise<void> {
        let code_challenge =
            await this.sessionService.getCodeChallenge('S256');
        if (client_id) {
            await this.router.navigate(['login'], {
                queryParams: {
                    redirect_uri: redirect,
                    client_id: client_id,
                    code_challenge: code_challenge,
                },
            });
        } else {
            await this.router.navigate(['login'], {
                queryParams: {
                    redirect_uri: redirect,
                    code_challenge: code_challenge,
                },
            });
        }
    }

    resetTitle() {
        this.title = 'Home';
    }

    setTitle(title: string) {
        this.title = title;
    }
}
