import {Injectable} from '@angular/core';
import {ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree} from '@angular/router';
import {Observable} from 'rxjs';
import {SessionService} from '../_services/session.service';
import {AuthDefaultService} from '../_services/auth.default.service';

@Injectable({
    providedIn: 'root',
})
export class AdminGuard {
    constructor(
        private sessionService: SessionService,
        private authDefaultService: AuthDefaultService,
        private router: Router,
    ) {
    }

    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot,
    ):
        | Observable<boolean | UrlTree>
        | Promise<boolean | UrlTree>
        | boolean
        | UrlTree {
        if (!this.sessionService.isLoggedIn()) {
            this.authDefaultService.signOut(state.url, false, null);
            return false;
        }
        if (!this.sessionService.isSuperAdmin()) {
            return this.router.createUrlTree(['/error', '403 unauthorized']);
        }
        return true;
    }
}
