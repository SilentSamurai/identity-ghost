import {CUSTOM_ELEMENTS_SCHEMA, NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {TableModule} from 'primeng/table';
import {MultiSelectModule} from 'primeng/multiselect';
import {ChipModule} from 'primeng/chip';
import {MenuModule} from 'primeng/menu';
import {PanelMenuModule} from 'primeng/panelmenu';
import {InputTextModule} from 'primeng/inputtext';
import {MessagesModule} from 'primeng/messages';
import {ConfirmDialogModule} from 'primeng/confirmdialog';
import {SkeletonModule} from 'primeng/skeleton';
import {NgbCollapseModule, NgbDropdownModule, NgbNavModule} from '@ng-bootstrap/ng-bootstrap';
import {AbilityModule} from '@casl/angular';
import {ConfirmationService, MessageService} from 'primeng/api';

import {ComponentModule} from '../component/component.module';
import {AdminRoutingModule} from './admin-routing.module';

// Layout & core
import {AdminLayoutComponent} from './admin-layout.component';
import {AdminNavBarComponent} from './admin-navbar.component';
import {AdminHomeComponent} from './admin-home.component';

// Tenants
import {TN01AComponent} from './tenants/TN01A.component';
import {TN02ASelectionComponent} from './tenants/TN02A-selection.component';
import {TN02AComponent} from './tenants/TN02A.component';
import {TNRL01ASelectionComponent} from './tenants/TNRL01A-selection.component';
import {CreateTenantComponent} from './tenants/dialogs/create-tenant.component';
import {UpdateTenantComponent} from './tenants/dialogs/update-tenant.component';
import {UpdateTenantAdminComponent} from './tenants/dialogs/update-tenant-admin.component';
import {AddMemberAdminComponent} from './tenants/dialogs/add-member-admin.component';
import {AddRoleAdminComponent} from './tenants/dialogs/add-role-admin.component';

// Users
import {UR01AComponent} from './users/UR01A.component';
import {UR02ASelectionComponent} from './users/UR02A-selection.component';
import {UR02AComponent} from './users/UR02A.component';
import {CreateUserModalComponent} from './users/dialogs/create-user.modal.component';
import {EditUserModalComponent} from './users/dialogs/edit-user.modal.component';
import {ChangePasswordModalComponent} from './users/dialogs/change-password.modal.component';

// Roles
import {RL01AComponent} from './roles/RL01A.component';
import {RL02ASelectionComponent} from './roles/RL02A-selection.component';
import {RL02AComponent} from './roles/RL02A.component';
import {CreatePolicyModalComponent} from './roles/create-policy-modal.component';
import {UpdateRoleModalComponent} from './roles/update-role-modal.component';

// Groups
import {GP01AComponent} from './group/GP01A.component';
import {GP02ASelectionComponent} from './group/GP02A-selection.component';
import {GP02AComponent} from './group/GP02A.component';
import {CreateGroupComponent} from './group/dialogs/create-group.component';
import {UpdateGroupComponent} from './group/dialogs/update-group.component';

// Apps
import {AP01AComponent} from './apps/AP01A.component';
import {CreateAppComponent} from './apps/dialogs/create-app.component';
import {CreateAppAdminComponent} from './apps/dialogs/create-app-admin.component';
import {UpdateAppComponent} from './apps/dialogs/update-app.component';

// Clients
import {CL01AComponent} from './clients/CL01A.component';
import {CL02ASelectionComponent} from './clients/CL02A-selection.component';
import {CL02AComponent} from './clients/CL02A.component';
import {CreateClientAdminComponent} from './clients/dialogs/create-client-admin.component';
import {SecretDisplayAdminComponent} from './clients/dialogs/secret-display-admin.component';
import {EditClientAdminComponent} from './clients/dialogs/edit-client-admin.component';

@NgModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    declarations: [
        // Layout & core
        AdminLayoutComponent,
        AdminNavBarComponent,
        AdminHomeComponent,
        // Tenants
        TN01AComponent,
        TN02ASelectionComponent,
        TN02AComponent,
        TNRL01ASelectionComponent,
        CreateTenantComponent,
        UpdateTenantComponent,
        UpdateTenantAdminComponent,
        AddMemberAdminComponent,
        AddRoleAdminComponent,
        // Users
        UR01AComponent,
        UR02ASelectionComponent,
        UR02AComponent,
        CreateUserModalComponent,
        EditUserModalComponent,
        ChangePasswordModalComponent,
        // Roles
        RL01AComponent,
        RL02ASelectionComponent,
        RL02AComponent,
        CreatePolicyModalComponent,
        UpdateRoleModalComponent,
        // Groups
        GP01AComponent,
        GP02ASelectionComponent,
        GP02AComponent,
        CreateGroupComponent,
        UpdateGroupComponent,
        // Apps
        AP01AComponent,
        CreateAppComponent,
        CreateAppAdminComponent,
        UpdateAppComponent,
        // Clients
        CL01AComponent,
        CL02ASelectionComponent,
        CL02AComponent,
        CreateClientAdminComponent,
        EditClientAdminComponent,
        SecretDisplayAdminComponent,
    ],
    imports: [
        AdminRoutingModule,
        ComponentModule,
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        NgbCollapseModule,
        NgbNavModule,
        NgbDropdownModule,
        TableModule,
        MultiSelectModule,
        ChipModule,
        MenuModule,
        PanelMenuModule,
        InputTextModule,
        MessagesModule,
        ConfirmDialogModule,
        AbilityModule,
        SkeletonModule,
    ],
    providers: [ConfirmationService, MessageService],
})
export class AdminModule {}
