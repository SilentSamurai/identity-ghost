import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {AdminLayoutComponent} from './admin-layout.component';
import {AdminHomeComponent} from './admin-home.component';
import {TN01AComponent} from './tenants/TN01A.component';
import {TN02ASelectionComponent} from './tenants/TN02A-selection.component';
import {TN02AComponent} from './tenants/TN02A.component';
import {TNRL01ASelectionComponent} from './tenants/TNRL01A-selection.component';
import {RL01AComponent} from './roles/RL01A.component';
import {RL02ASelectionComponent} from './roles/RL02A-selection.component';
import {RL02AComponent} from './roles/RL02A.component';
import {GP01AComponent} from './group/GP01A.component';
import {GP02ASelectionComponent} from './group/GP02A-selection.component';
import {GP02AComponent} from './group/GP02A.component';
import {UR01AComponent} from './users/UR01A.component';
import {UR02ASelectionComponent} from './users/UR02A-selection.component';
import {UR02AComponent} from './users/UR02A.component';
import {AP01AComponent} from './apps/AP01A.component';
import {CL01AComponent} from './clients/CL01A.component';
import {CL02ASelectionComponent} from './clients/CL02A-selection.component';
import {CL02AComponent} from './clients/CL02A.component';
import {KY01AComponent} from './keys/KY01A.component';

const adminRoutes: Routes = [
    {
        path: '',
        component: AdminLayoutComponent,
        children: [
            {path: '', component: AdminHomeComponent},
            {path: 'TN01', component: TN01AComponent},
            {path: 'TN02', component: TN02ASelectionComponent},
            {path: 'TN02/:tenantId', component: TN02AComponent},
            {path: 'TNRL01', component: TNRL01ASelectionComponent},
            {path: 'RL01', component: RL01AComponent},
            {path: 'RL02', component: RL02ASelectionComponent},
            {path: 'RL02/:tenantId/:roleId', component: RL02AComponent},
            {path: 'GP01', component: GP01AComponent},
            {path: 'GP02', component: GP02ASelectionComponent},
            {path: 'GP02/:groupId', component: GP02AComponent},
            {path: 'UR01', component: UR01AComponent},
            {path: 'UR02', component: UR02ASelectionComponent},
            {path: 'UR02/:userId', component: UR02AComponent},
            {path: 'AP01', component: AP01AComponent},
            {path: 'CL01', component: CL01AComponent},
            {path: 'CL02', component: CL02ASelectionComponent},
            {path: 'CL02/:clientId', component: CL02AComponent},
            {path: 'KY01', component: KY01AComponent},
        ],
    },
];

@NgModule({
    imports: [RouterModule.forChild(adminRoutes)],
    exports: [RouterModule],
})
export class AdminRoutingModule {}
