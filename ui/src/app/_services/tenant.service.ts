import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';
import {SessionService} from './session.service';
import {RestApiModel} from '../component/model/RestApiModel';
import {query} from "../component/model/Query";
import {DataSource} from "../component/model/DataSource";

const API_URL = '/api';

/**
 * Custom exception for when no changes are made to a tenant
 */
export class NoChangesException extends Error {
    constructor(message: string = 'No changes have been made to the tenant') {
        super(message);
        this.name = 'NoChangesException';
    }
}

@Injectable({
    providedIn: 'root',
})
export class TenantService {
    constructor(
        private http: HttpClient,
        private sessionService: SessionService,
    ) {
    }

    getHttpOptions() {
        return {
            headers: new HttpHeaders({
                'Content-Type': 'application/json',
            }),
        };
    }

    createTenant(name: string, domain: string) {
        return this.http.post(
            `${API_URL}/tenant/create`,
            {
                name,
                domain,
            },
            this.getHttpOptions(),
        );
    }

    editTenant(
        name: null | string,
        allowSignUp: null | boolean,
    ) {
        const requestBody: any = {};

        if (name !== null) {
            requestBody.name = name;
        }

        if (allowSignUp !== null) {
            requestBody.allowSignUp = allowSignUp;
        }

        if (Object.keys(requestBody).length === 0) {
            throw new NoChangesException();
        }

        return this.http.patch(
            `${API_URL}/tenant/my`,
            requestBody,
            this.getHttpOptions(),
        );
    }

    deleteTenant() {
        return lastValueFrom(
            this.http.delete(
                `${API_URL}/tenant/my`,
                this.getHttpOptions(),
            ),
        );
    }

    async getTenantDetails() {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/tenant/my/info`,
                this.getHttpOptions(),
            ),
        );
    }

    async getTenantCredentials() {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/tenant/my/credentials`,
                this.getHttpOptions(),
            ),
        );
    }

    async getMembers(): Promise<any[]> {
        return (await lastValueFrom(
            this.http.get(
                `${API_URL}/tenant/my/members`,
                this.getHttpOptions(),
            ),
        )) as Promise<any[]>;
    }

    async addMember(email: string) {
        return lastValueFrom(
            this.http.post(
                `${API_URL}/tenant/my/members/add`,
                {
                    emails: [email],
                },
                this.getHttpOptions(),
            ),
        );
    }

    async createRole(name: string) {
        return lastValueFrom(
            this.http.post(
                `${API_URL}/tenant/my/role/${name}`,
                {},
                this.getHttpOptions(),
            ),
        );
    }

    async removeMember(email: string) {
        return lastValueFrom(
            this.http.delete(`${API_URL}/tenant/my/members/delete`, {
                body: {
                    emails: [email],
                },
            }),
        );
    }

    async deleteRole(name: string) {
        return lastValueFrom(
            this.http.delete(
                `${API_URL}/tenant/my/role/${name}`,
                this.getHttpOptions(),
            ),
        );
    }

    async getMemberDetails(userId: string) {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/tenant/my/member/${userId}`,
                this.getHttpOptions(),
            ),
        );
    }

    async getTenantRoles(): Promise<any> {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/tenant/my/roles`,
                this.getHttpOptions(),
            ),
        );
    }

    async queryTenant(query: any): Promise<any> {
        return (await lastValueFrom(
            this.http.post(
                `${API_URL}/search/Tenants`,
                query,
                this.getHttpOptions(),
            ),
        )) as any;
    }

    async replaceRoles(selectedRoles: any[], userId: string) {
        const roles = selectedRoles.map((role) => role.name);
        return lastValueFrom(
            this.http.put(
                `${API_URL}/tenant/my/member/${userId}/roles`,
                {
                    roles: roles,
                },
                this.getHttpOptions(),
            ),
        );
    }

    async addRolesToMember(
        selectedRoles: any[],
        userId: string,
    ) {
        const roles = selectedRoles.map((role) => role.name);
        return lastValueFrom(
            this.http.post(
                `${API_URL}/tenant/my/member/${userId}/roles/add`,
                {
                    roles: roles,
                },
                this.getHttpOptions(),
            ),
        );
    }

    async removeRolesFromMember(
        selectedRoles: any[],
        userId: string,
    ) {
        const roles = selectedRoles.map((role) => role.name);
        return lastValueFrom(
            this.http.delete(
                `${API_URL}/tenant/my/member/${userId}/roles/remove`,
                {
                    body: {
                        roles: roles,
                    },
                },
            ),
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
}
