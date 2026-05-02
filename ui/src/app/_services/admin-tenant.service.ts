import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';
import {RestApiModel} from '../component/model/RestApiModel';
import {query} from '../component/model/Query';
import {DataSource} from '../component/model/DataSource';

const API_URL = '/api';

/**
 * Admin-only service for cross-tenant operations.
 * Every method requires an explicit tenantId and calls /api/admin/tenant/ routes.
 * These routes are protected by SuperAdminGuard on the backend.
 *
 * This service must NEVER be used in tenant-user components.
 */
@Injectable({
    providedIn: 'root',
})
export class AdminTenantService {
    constructor(private http: HttpClient) {
    }

    async getAllTenants(): Promise<any[]> {
        return lastValueFrom(
            this.http.get<any[]>(
                `${API_URL}/admin/tenant`,
                this.getHttpOptions(),
            ),
        );
    }

    // ─── Tenant ───

    async getTenantDetails(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}`,
                this.getHttpOptions(),
            ),
        );
    }

    async updateTenant(tenantId: string, body: { name?: string; allowSignUp?: boolean }) {
        return lastValueFrom(
            this.http.patch(
                `${API_URL}/admin/tenant/${tenantId}`,
                body,
                this.getHttpOptions(),
            ),
        );
    }

    async deleteTenant(tenantId: string) {
        return lastValueFrom(
            this.http.delete(
                `${API_URL}/admin/tenant/${tenantId}`,
                this.getHttpOptions(),
            ),
        );
    }

    async getTenantCredentials(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/credentials`,
                this.getHttpOptions(),
            ),
        );
    }

    async getMembers(tenantId: string): Promise<any[]> {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/members`,
                this.getHttpOptions(),
            ),
        ) as Promise<any[]>;
    }

    // ─── Members ───

    async getMemberDetails(tenantId: string, userId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/member/${userId}`,
                this.getHttpOptions(),
            ),
        );
    }

    async getMemberRoles(tenantId: string, userId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/member/${userId}/roles`,
                this.getHttpOptions(),
            ),
        );
    }

    async setMemberRoles(tenantId: string, userId: string, roles: string[]) {
        return lastValueFrom(
            this.http.put(
                `${API_URL}/admin/tenant/${tenantId}/member/${userId}/roles`,
                {roles},
                this.getHttpOptions(),
            ),
        );
    }

    async getTenantRoles(tenantId: string): Promise<any> {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/roles`,
                this.getHttpOptions(),
            ),
        );
    }

    // ─── Roles ───

    async createRole(tenantId: string, name: string) {
        return lastValueFrom(
            this.http.post(
                `${API_URL}/admin/tenant/${tenantId}/role/${name}`,
                {},
                this.getHttpOptions(),
            ),
        );
    }

    async deleteRole(tenantId: string, name: string) {
        return lastValueFrom(
            this.http.delete(
                `${API_URL}/admin/tenant/${tenantId}/role/${name}`,
                this.getHttpOptions(),
            ),
        );
    }

    async getGroups(tenantId: string): Promise<any[]> {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/groups`,
                this.getHttpOptions(),
            ),
        ) as Promise<any[]>;
    }

    // ─── Groups ───

    async getClients(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/clients`,
                this.getHttpOptions(),
            ),
        );
    }

    // ─── Clients ───

    async getCreatedApps(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/apps/created`,
                this.getHttpOptions(),
            ),
        ) as Promise<any[]>;
    }

    // ─── Apps ───

    async getSubscriptions(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/apps/subscriptions`,
                this.getHttpOptions(),
            ),
        ) as Promise<any[]>;
    }

    async addMember(tenantId: string, emails: string[]) {
        return lastValueFrom(
            this.http.post(
                `${API_URL}/admin/tenant/${tenantId}/members/add`,
                {emails},
                this.getHttpOptions(),
            ),
        );
    }

    // ─── Member mutations ───

    async removeMember(tenantId: string, email: string) {
        return lastValueFrom(
            this.http.delete(
                `${API_URL}/admin/tenant/${tenantId}/members/delete`,
                {
                    body: {emails: [email]},
                },
            ),
        );
    }

    async getKeys(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/keys`,
                this.getHttpOptions(),
            ),
        );
    }

    // ─── Keys ───

    async rotateKeys(tenantId: string) {
        return lastValueFrom(
            this.http.put(
                `${API_URL}/admin/tenant/${tenantId}/keys`,
                {},
                this.getHttpOptions(),
            ),
        );
    }

    async getAllKeys(params?: { status?: string; tenantId?: string }) {
        let url = `${API_URL}/admin/keys`;
        const queryParts: string[] = [];
        if (params?.status && params.status !== 'all') queryParts.push(`status=${params.status}`);
        if (params?.tenantId) queryParts.push(`tenantId=${params.tenantId}`);
        if (queryParts.length) url += '?' + queryParts.join('&');
        return lastValueFrom(
            this.http.get(url, this.getHttpOptions()),
        );
    }

    createTenant(name: string, domain: string) {
        return this.http.post(
            `${API_URL}/tenant/create`,
            {name, domain},
            this.getHttpOptions(),
        );
    }

    createDataModel(): DataSource<any> {
        return new RestApiModel(
            this.http,
            `${API_URL}/search/Tenants`,
            ['id'],
            query({expand: ['Tenants']}),
        );
    }

    private getHttpOptions() {
        return {
            headers: new HttpHeaders({
                'Content-Type': 'application/json',
            }),
        };
    }
}
