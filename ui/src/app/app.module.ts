import {CUSTOM_ELEMENTS_SCHEMA, NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {HttpClientModule} from '@angular/common/http';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {LoginComponent} from './open-pages/login.component';
import {RegisterComponent} from './open-pages/register.component';
import {ProfileComponent} from './open-pages/profile.component';
import {ForgotPasswordComponent} from './open-pages/forgot-password.component';
import {ResetPasswordComponent} from './open-pages/reset-password.component';
import {CenteredCardComponent} from './component/centered-card/centered-card.component';

import {authInterceptorProviders} from './_helpers/auth.interceptor';
import {httpErrorInterceptorProviders} from './_helpers/http-error.interceptor';
import {NgbCollapseModule, NgbDropdown, NgbModule,} from '@ng-bootstrap/ng-bootstrap';
import {TableModule} from 'primeng/table';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {ToastModule} from 'primeng/toast';
import {ConfirmationService, MessageService} from 'primeng/api';
import {RouterModule} from '@angular/router';
import {SecureModule} from './secure/secure.module';
import {CardModule} from 'primeng/card';
import {ComponentModule} from './component/component.module';
import {ConfirmDialogModule} from 'primeng/confirmdialog';
import {HttpErrorComponent} from './error-pages/HttpError.component';
import {AbilityModule} from '@casl/angular';
import {Ability, createMongoAbility, PureAbility,} from '@casl/ability';
import {OAuthCallbackComponent} from "./open-pages/oauth-callback.component";
import {NgOptimizedImage} from "@angular/common";
import {WelcomeComponent} from './open-pages/welcome.component';
import {SignUpComponent} from './open-pages/signup.component';
import {OpenNavbarComponent} from './open-pages/open-navbar.component';
import {LogoutComponent} from './open-pages/logout.component';
import {AuthorizeComponent} from './open-pages/authorize.component';
import {LoginViewComponent} from './open-pages/authorize/views/login-view.component';
import {ConsentViewComponent} from './open-pages/authorize/views/consent-view.component';
import {SessionConfirmViewComponent} from './open-pages/authorize/views/session-confirm-view.component';
import {TenantSelectionViewComponent} from './open-pages/authorize/views/tenant-selection-view.component';
import {ErrorViewComponent} from './open-pages/authorize/views/error-view.component';
import {LoadingViewComponent} from './open-pages/authorize/views/loading-view.component';

@NgModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    declarations: [
        AppComponent,
        LoginComponent,
        RegisterComponent,
        ProfileComponent,
        HttpErrorComponent,
        OAuthCallbackComponent,
        ForgotPasswordComponent,
        ResetPasswordComponent,
        CenteredCardComponent,
        WelcomeComponent,
        SignUpComponent,
        OpenNavbarComponent,
        LogoutComponent,
        AuthorizeComponent,
        LoginViewComponent,
        ConsentViewComponent,
        SessionConfirmViewComponent,
        TenantSelectionViewComponent,
        ErrorViewComponent,
        LoadingViewComponent,
    ],
    imports: [
        BrowserModule,
        RouterModule,
        AppRoutingModule,
        FormsModule,
        HttpClientModule,
        NgbModule,
        NgbCollapseModule,
        TableModule,
        SecureModule,
        BrowserAnimationsModule,
        ReactiveFormsModule,
        ToastModule,
        CardModule,
        ComponentModule,
        ConfirmDialogModule,
        AbilityModule,
        NgOptimizedImage,
    ],
    providers: [
        authInterceptorProviders,
        httpErrorInterceptorProviders,
        NgbDropdown,
        MessageService,
        ConfirmationService,
        {provide: PureAbility, useValue: createMongoAbility()},
        {provide: Ability, useExisting: PureAbility},
    ],
    exports: [],
    bootstrap: [AppComponent],
})
export class AppModule {
}
