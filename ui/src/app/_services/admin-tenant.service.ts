import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';

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

    private getHttpOptions() {
        return {
            headers: new HttpHeaders({
                'Content-Type': 'application/json',
            }),
        };
    }

    // ─── Tenant ───

    async getAllTenants(): Promise<any[]> {
        return lastValueFrom(
            this.http.get<any[]>(
                `${API_URL}/admin/tenant`,
                this.getHttpOptions(),
            ),
        );
    }

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

    // ─── Members ───

    async getMembers(tenantId: string): Promise<any[]> {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/members`,
                this.getHttpOptions(),
            ),
        ) as Promise<any[]>;
    }

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

    // ─── Roles ───

    async getTenantRoles(tenantId: string): Promise<any> {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/roles`,
                this.getHttpOptions(),
            ),
        );
    }

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

    // ─── Groups ───

    async getGroups(tenantId: string): Promise<any[]> {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/groups`,
                this.getHttpOptions(),
            ),
        ) as Promise<any[]>;
    }

    // ─── Clients ───

    async getClients(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/clients`,
                this.getHttpOptions(),
            ),
        );
    }

    // ─── Apps ───

    async getCreatedApps(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/apps/created`,
                this.getHttpOptions(),
            ),
        ) as Promise<any[]>;
    }

    async getSubscriptions(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/apps/subscriptions`,
                this.getHttpOptions(),
            ),
        ) as Promise<any[]>;
    }

    // ─── Member mutations ───

    async addMember(tenantId: string, emails: string[]) {
        return lastValueFrom(
            this.http.post(
                `${API_URL}/admin/tenant/${tenantId}/members/add`,
                {emails},
                this.getHttpOptions(),
            ),
        );
    }

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

    // ─── Keys ───

    async getKeys(tenantId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/admin/tenant/${tenantId}/keys`,
                this.getHttpOptions(),
            ),
        );
    }

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
}
