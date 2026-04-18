import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';

import {RegisterComponent} from './open-pages/register.component';
import {LoginComponent} from './open-pages/login.component';
import {SessionConfirmationComponent} from './open-pages/session-confirmation.component';
import {TN02Component} from './secure/tenants/TN02.component';
import {HomeComponent} from './secure/home.component';
import {RL02Component} from './secure/roles/RL02.component';
import {TNRL01Component} from './secure/tenants/TNRL01.component';
import {UserAuthGuard} from './shared/user-auth-guard.service';
import {HttpErrorComponent} from './error-pages/HttpError.component';
import {TenantAccessAuthGuard} from './shared/tenant-auth-guard.service';
import {CL01Component} from './secure/clients/CL01.component';
import {CL02Component} from './secure/clients/CL02.component';
import {AuthorizeLoginComponent} from "./open-pages/authorize-login.component";
import {TenantSelectionComponent} from './open-pages/tenant-selection.component';
import {ConsentScreenComponent} from './open-pages/consent-screen.component';
import {ForgotPasswordComponent} from './open-pages/forgot-password.component';
import {ResetPasswordComponent} from './open-pages/reset-password.component';
import {WelcomeComponent} from './open-pages/welcome.component';
import {SignUpComponent} from './open-pages/signup.component';
import {AdminGuard} from './super-admin/admin-guard.service';

const routes: Routes = [
    {path: 'welcome', component: WelcomeComponent},
    {path: 'signup', component: SignUpComponent},
    {path: 'session-confirm', component: SessionConfirmationComponent},
    {path: 'authorize', component: AuthorizeLoginComponent},
    {path: 'consent', component: ConsentScreenComponent},
    {path: 'login', component: LoginComponent},
    {path: 'register', component: RegisterComponent},
    {path: 'forgot-password', component: ForgotPasswordComponent},
    {path: 'reset-password/:token', component: ResetPasswordComponent},
    {path: 'error/:msg', component: HttpErrorComponent},
    {path: '', redirectTo: 'welcome', pathMatch: 'full'},
    {
        path: 'admin',
        canActivate: [AdminGuard],
        loadChildren: () => import('./super-admin/admin.module').then(m => m.AdminModule),
    },
    {
        path: '',
        canActivate: [UserAuthGuard],
        children: [
            {path: 'home', component: HomeComponent, canActivate: []},

            {
                path: 'TN02/:tenantId',
                component: TN02Component,
                canActivate: [TenantAccessAuthGuard],
            },
            {
                path: 'TNRL01/:tenantId/:userId',
                component: TNRL01Component,
                canActivate: [TenantAccessAuthGuard],
            },
            {
                path: 'RL02/:tenantId/:roleId',
                component: RL02Component,
                canActivate: [TenantAccessAuthGuard],
            },
            {
                path: 'CL01/:tenantId',
                component: CL01Component,
                canActivate: [TenantAccessAuthGuard],
            },
            {
                path: 'CL02/:tenantId/:clientId',
                component: CL02Component,
                canActivate: [TenantAccessAuthGuard],
            },
        ],
    },
    {path: 'tenant-selection', component: TenantSelectionComponent},
    {path: '**', redirectTo: '/error/404'},
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {
}
