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
import {AdminNavBarComponent} from './nav-bar.component';
import {NgbCollapseModule, NgbDropdownModule, NgbNavModule,} from '@ng-bootstrap/ng-bootstrap';
import {TN01Component} from './tenants/TN01.component';
import {UpdateTenantComponent} from './tenants/dialogs/update-tenant.component';
import {CreateTenantComponent} from './tenants/dialogs/create-tenant.component';
import {UR02Component} from './users/UR02.component';
import {UR01Component} from './users/UR01.component';
import {CreateUserModalComponent} from './users/dialogs/create-user.modal.component';
import {EditUserModalComponent} from './users/dialogs/edit-user.modal.component';
import {TN02Component} from './tenants/TN02.component';
import {AddMemberComponent} from './tenants/dialogs/add-member.component';
import {AddRoleComponent} from './tenants/dialogs/add-role.component';
import {ComponentModule} from '../component/component.module';
import {RL01Component} from './roles/RL01.component';
import {RL02SelectionComponent} from './roles/RL02-selection.component';
import {InputTextModule} from 'primeng/inputtext';
import {MessagesModule} from 'primeng/messages';
import {GP02SelectionComponent} from './group/GP02-selection.component';
import {GP01Component} from './group/GP01.component';
import {CreateGroupComponent} from './group/dialogs/create-group.component';
import {GP02Component} from './group/GP02.component';
import {ConfirmDialogModule} from 'primeng/confirmdialog';
import {ConfirmationService, MessageService} from 'primeng/api';
import {UpdateGroupComponent} from './group/dialogs/update-group.component';
import {RL02Component} from './roles/RL02.component';
import {TN02SelectionComponent} from './tenants/TN02-selection.component';
import {TNRL01Component} from './tenants/TNRL01.component';
import {TNRL01SelectionComponent} from './tenants/TNRL01-selection.component';
import {UR02SelectionComponent} from './users/UR02-selection.component';
import {AbilityModule} from '@casl/angular';
import {SkeletonModule} from 'primeng/skeleton';
import {CreatePolicyModalComponent} from './roles/create-policy-modal.component';
import {UpdateRoleModalComponent} from './roles/update-role-modal.component';
import {AP01Component} from './apps/AP01.component';
import {CreateAppComponent} from "./apps/dialogs/create-app.component";
import {UpdateAppComponent} from "./apps/dialogs/update-app.component";
import {CreateSubscriptionComponent} from "./tenants/dialogs/create-subscription.component";
import {ChangePasswordModalComponent} from "./users/dialogs/change-password.modal.component";
import {CL01Component} from './clients/CL01.component';
import {CL02Component} from './clients/CL02.component';
import {CreateClientComponent} from './clients/dialogs/create-client.component';
import {SecretDisplayComponent} from './clients/dialogs/secret-display.component';

@NgModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    declarations: [
        HomeComponent,
        AdminNavBarComponent,
        TN01Component,
        UpdateTenantComponent,
        CreateTenantComponent,
        UR02Component,
        UR01Component,
        UR02SelectionComponent,
        CreateUserModalComponent,
        EditUserModalComponent,
        TN02Component,
        TN02SelectionComponent,
        TNRL01SelectionComponent,
        TNRL01Component,
        AddMemberComponent,
        AddRoleComponent,
        RL01Component,
        RL02SelectionComponent,
        GP02SelectionComponent,
        GP01Component,
        CreateGroupComponent,
        GP02Component,
        UpdateGroupComponent,
        RL02Component,
        CreatePolicyModalComponent,
        UpdateRoleModalComponent,
        AP01Component,
        CreateAppComponent,
        UpdateAppComponent,
        CreateSubscriptionComponent,
        ChangePasswordModalComponent,
        CL01Component,
        CL02Component,
        CreateClientComponent,
        SecretDisplayComponent
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
    exports: [AdminNavBarComponent],
})
export class SecureModule {
}
