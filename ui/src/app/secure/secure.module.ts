import {CUSTOM_ELEMENTS_SCHEMA, NgModule} from '@angular/core';
import {TableModule} from 'primeng/table';
import {RouterModule} from '@angular/router';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MultiSelectModule} from 'primeng/multiselect';
import {ChipModule} from 'primeng/chip';
import {MenuModule} from 'primeng/menu';
import {PanelMenuModule} from 'primeng/panelmenu';
import {HomeComponent} from './home.component';
import {SecureNavBarComponent} from './nav-bar.component';
import {NgbCollapseModule, NgbDropdownModule, NgbNavModule,} from '@ng-bootstrap/ng-bootstrap';
import {TN02Component} from './tenants/TN02.component';
import {AddMemberComponent} from './tenants/dialogs/add-member.component';
import {AddRoleComponent} from './tenants/dialogs/add-role.component';
import {ComponentModule} from '../component/component.module';
import {InputTextModule} from 'primeng/inputtext';
import {MessagesModule} from 'primeng/messages';
import {ConfirmDialogModule} from 'primeng/confirmdialog';
import {ConfirmationService, MessageService} from 'primeng/api';
import {RL02Component} from './roles/RL02.component';
import {TNRL01Component} from './tenants/TNRL01.component';
import {AbilityModule} from '@casl/angular';
import {SkeletonModule} from 'primeng/skeleton';
import {CreateSubscriptionComponent} from "./tenants/dialogs/create-subscription.component";
import {CL01Component} from './clients/CL01.component';
import {CL02Component} from './clients/CL02.component';
import {CreateClientComponent} from './clients/dialogs/create-client.component';
import {EditClientComponent} from './clients/dialogs/edit-client.component';
import {SecretDisplayComponent} from './clients/dialogs/secret-display.component';
import {UpdateTenantComponent} from './tenants/dialogs/update-tenant.component';
import {CreateAppComponent} from './apps/dialogs/create-app.component';
import {UpdateAppComponent} from './apps/dialogs/update-app.component';
import {CreatePolicyModalComponent} from './roles/create-policy-modal.component';
import {UpdateRoleModalComponent} from './roles/update-role-modal.component';

@NgModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    declarations: [
        HomeComponent,
        SecureNavBarComponent,
        TN02Component,
        TNRL01Component,
        AddMemberComponent,
        AddRoleComponent,
        RL02Component,
        CreateSubscriptionComponent,
        CL01Component,
        CL02Component,
        CreateClientComponent,
        EditClientComponent,
        SecretDisplayComponent,
        UpdateTenantComponent,
        CreateAppComponent,
        UpdateAppComponent,
        CreatePolicyModalComponent,
        UpdateRoleModalComponent,
    ],
    imports: [
        TableModule,
        RouterModule,
        CommonModule,
        FormsModule,
        MultiSelectModule,
        ChipModule,
        MenuModule,
        PanelMenuModule,
        NgbCollapseModule,
        NgbNavModule,
        NgbDropdownModule,
        ComponentModule,
        InputTextModule,
        MessagesModule,
        ConfirmDialogModule,
        ReactiveFormsModule,
        AbilityModule,
        SkeletonModule,
    ],
    providers: [ConfirmationService, MessageService],
    exports: [SecureNavBarComponent],
})
export class SecureModule {
}
