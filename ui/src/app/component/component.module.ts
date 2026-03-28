import {NgModule} from '@angular/core';
import {TableModule} from 'primeng/table';
import {RouterModule} from '@angular/router';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MultiSelectModule} from 'primeng/multiselect';
import {ChipModule} from 'primeng/chip';
import {MenuModule} from 'primeng/menu';
import {PanelMenuModule} from 'primeng/panelmenu';
import {NgbCollapseModule, NgbDropdownModule, NgbNavModule,} from '@ng-bootstrap/ng-bootstrap';
import {TileComponent} from './tile/tile.component';
import {CardModule} from 'primeng/card';
import {ValueHelpComponent} from './value-help/value-help.component';
import {ValueHelpInputComponent} from './value-help-input/value-help-input.component';
import {SkeletonModule} from 'primeng/skeleton';
import {ValueHelpColumnComponent} from './value-help-input/value-help-column.component';
import {FilterBarColumnComponent, FilterBarComponent,} from './filter-bar/filter-bar.component';
import {TileGroupsComponent} from './tile/tile-groups.component';
import {ObjectPageComponent} from './object-page/object-page.component';
import {ObjectPageSectionComponent} from './object-page/object-page-section.component';
import {LaunchPadComponent} from './tile/launchpad.component';
import {PageViewComponent} from './page-view/page-view.component';
import {TableColumnComponent} from './table/app-table-column.component';
import {FilterFieldComponent} from './filter-bar/filter-field.component';
import {FilterValueHelpComponent} from './filter-bar/filter-value-help.component';
import {ButtonModule} from 'primeng/button';
import {RippleModule} from 'primeng/ripple';
import {AttributeComponent} from './fields/attribute.component';
import {StandardDialogComponent} from './dialogs/standard-dialog.component';
import {DialogActionsComponent} from './dialogs/dialog-actions.component';
import {DialogTabComponent} from './dialogs/dialog-tab.component';
import {DialogFooterComponent} from './dialogs/dialog-footer.component';
import {ConfirmationDialogComponent, ConfirmationService,} from './dialogs/confirmation.service';
import {TextInputComponent} from './inputs/text-input.component';
import {ButtonLinkComponent} from './button/button-link.component';
import {CheckboxModule} from 'primeng/checkbox';
import {RadioButtonModule} from 'primeng/radiobutton';
import {InputErrorComponent} from './inputs/input-error.component';
import {FormValueHelpInputComponent} from './inputs/form-value-help-input.component';
import {ModalService} from './dialogs/modal.service';
import {SelectInputComponent, SelectOptionComponent,} from './inputs/select-input.component';
import {ObjectPageTabComponent} from './object-page/object-page-tab.component';
import {ValueHelpButtonComponent} from './button/value-help-button.component';
import {AppTableComponent} from './table/app-table.component';
import {InfiniteScrollDirective} from './table/infinite-scroll.directive';
import {ThemeToggleComponent} from './theme/theme-toggle.component';
import {LoaderComponent} from "./loader/loader.component";
import { PasswordInputComponent } from './inputs/password-input.component';

@NgModule({
    declarations: [
        TileComponent,
        ValueHelpComponent,
        ValueHelpInputComponent,
        ValueHelpColumnComponent,
        FilterBarComponent,
        FilterBarColumnComponent,
        FilterFieldComponent,
        FilterValueHelpComponent,
        TableColumnComponent,
        TileGroupsComponent,
        LaunchPadComponent,
        ObjectPageComponent,
        ObjectPageSectionComponent,
        ObjectPageTabComponent,
        PageViewComponent,
        AttributeComponent,
        StandardDialogComponent,
        DialogActionsComponent,
        DialogTabComponent,
        DialogFooterComponent,
        ConfirmationDialogComponent,
        TextInputComponent,
        InputErrorComponent,
        ButtonLinkComponent,
        FormValueHelpInputComponent,
        SelectInputComponent,
        SelectOptionComponent,
        ValueHelpButtonComponent,
        AppTableComponent,
        InfiniteScrollDirective,
        ThemeToggleComponent,
        LoaderComponent,
        PasswordInputComponent
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
        NgbNavModule,
        NgbCollapseModule,
        NgbDropdownModule,
        CardModule,
        SkeletonModule,
        ButtonModule,
        RippleModule,
        ReactiveFormsModule,
        CheckboxModule,
        RadioButtonModule,
    ],
    providers: [ConfirmationService, ModalService],
    exports: [
        TileComponent,
        ValueHelpInputComponent,
        ValueHelpColumnComponent,
        FilterBarColumnComponent,
        TableColumnComponent,
        FilterBarComponent,
        TileGroupsComponent,
        ObjectPageComponent,
        ObjectPageSectionComponent,
        LaunchPadComponent,
        PageViewComponent,
        AttributeComponent,
        StandardDialogComponent,
        DialogTabComponent,
        DialogFooterComponent,
        TextInputComponent,
        InputErrorComponent,
        ButtonLinkComponent,
        FormValueHelpInputComponent,
        SelectInputComponent,
        SelectOptionComponent,
        ObjectPageTabComponent,
        ValueHelpButtonComponent,
        AppTableComponent,
        InfiniteScrollDirective,
        ThemeToggleComponent,
        LoaderComponent,
        PasswordInputComponent
    ],
})
export class ComponentModule {
}
