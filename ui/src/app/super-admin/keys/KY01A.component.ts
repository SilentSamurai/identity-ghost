import {Component, OnInit} from '@angular/core';
import {AdminTenantService} from '../../_services/admin-tenant.service';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {MessageService} from 'primeng/api';
import {StaticSource} from '../../component/model/StaticSource';
import {Filter} from '../../component/model/Filters';
import {FilterSelectOption} from '../../component/filter-bar/filter-select-field.component';

@Component({
    selector: 'app-KY01A',
    template: `
        <app-page-view>
            <app-page-view-header>
                <div class="">
                    <app-fb (onFilter)="onFilter($event)">
                        <app-fb-col label="Tenant" name="tenant"></app-fb-col>
                        <app-fb-col label="Status" name="status" type="select" [options]="statusOptions"></app-fb-col>
                    </app-fb>
                    <div class="text-muted small mt-1" id="KEY_SUMMARY">
                        Total: {{ filteredKeys.length }} keys · Active: {{ activeCount }} · Deactivated: {{ deactivatedCount }}
                    </div>
                </div>
            </app-page-view-header>

            <app-page-view-body>
                <app-table
                    title="Keys Overview"
                    multi="true"
                    scrollHeight="75vh"
                    [dataSource]="dataSource"
                >
                    <app-table-col label="Tenant" name="tenant.domain"></app-table-col>
                    <app-table-col label="Version" name="keyVersion"></app-table-col>
                    <app-table-col label="Key ID" name="kid"></app-table-col>
                    <app-table-col label="Algorithm" name="algorithm"></app-table-col>
                    <app-table-col label="Status" name="status"></app-table-col>
                    <app-table-col label="Created" name="createdAt"></app-table-col>
                    <app-table-col label="Superseded" name="supersededAt"></app-table-col>
                    <app-table-col label="Deactivated" name="deactivatedAt"></app-table-col>

                    <ng-template #table_body let-key>
                        <td>
                            <a [routerLink]="['/admin/TN02', key.tenant?.id]"
                               href="javascript:void(0)">{{ key.tenant?.domain }}</a>
                        </td>
                        <td>{{ key.keyVersion }}</td>
                        <td>{{ key.kid ? key.kid.substring(0, 8) + '\u2026' : '' }}</td>
                        <td>RS256</td>
                        <td>
                            <span *ngIf="key.deactivatedAt" class="badge bg-secondary">Deactivated</span>
                            <span *ngIf="!key.deactivatedAt && key.isCurrent" class="badge bg-success">Current</span>
                            <span *ngIf="!key.deactivatedAt && !key.isCurrent" class="badge bg-warning text-dark">Active</span>
                        </td>
                        <td>{{ key.createdAt | date:'medium' }}</td>
                        <td>{{ key.supersededAt ? (key.supersededAt | date:'medium') : '' }}</td>
                        <td>{{ key.deactivatedAt ? (key.deactivatedAt | date:'medium') : '' }}</td>
                    </ng-template>
                </app-table>
            </app-page-view-body>
        </app-page-view>
    `,
    styles: [''],
})
export class KY01AComponent implements OnInit {
    dataSource: StaticSource<any>;
    allKeys: any[] = [];
    filteredKeys: any[] = [];
    activeCount = 0;
    deactivatedCount = 0;

    statusOptions: FilterSelectOption[] = [
        { label: 'All', value: 'all' },
        { label: 'Current', value: 'current' },
        { label: 'Active', value: 'active' },
        { label: 'Deactivated', value: 'deactivated' },
    ];

    constructor(
        private adminTenantService: AdminTenantService,
        private authDefaultService: AuthDefaultService,
        private messageService: MessageService,
    ) {
        this.dataSource = new StaticSource(['id']);
    }

    async ngOnInit() {
        this.authDefaultService.setTitle('KY01: Key Overview');
        await this.loadKeys();
    }

    private async loadKeys() {
        try {
            const result: any = await this.adminTenantService.getAllKeys();
            this.allKeys = Array.isArray(result.keys) ? result.keys : [];
            this.applyFilters('', 'all');
        } catch (e) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load keys' });
        }
    }

    onFilter(event: Filter[]) {
        const tenantFilter = event.find(f => f.field === 'tenant');
        const statusFilter = event.find(f => f.field === 'status');
        const tenant = typeof tenantFilter?.value === 'string' ? tenantFilter.value : '';
        const status = typeof statusFilter?.value === 'string' ? statusFilter.value : 'all';
        this.applyFilters(tenant, status);
    }

    private applyFilters(filterTenant: string, filterStatus: string) {
        let keys = this.allKeys;

        if (filterTenant.trim()) {
            const term = filterTenant.trim().toLowerCase();
            keys = keys.filter((k: any) =>
                (k.tenant?.domain || '').toLowerCase().includes(term) ||
                (k.tenant?.name || '').toLowerCase().includes(term)
            );
        }

        if (filterStatus !== 'all') {
            keys = keys.filter((k: any) => this.deriveStatus(k) === filterStatus);
        }

        this.filteredKeys = keys;
        this.activeCount = this.filteredKeys.filter((k: any) => !k.deactivatedAt).length;
        this.deactivatedCount = this.filteredKeys.filter((k: any) => !!k.deactivatedAt).length;
        this.dataSource.setData(this.filteredKeys);
    }

    private deriveStatus(key: any): string {
        if (key.deactivatedAt) return 'deactivated';
        if (key.isCurrent) return 'current';
        return 'active';
    }
}
