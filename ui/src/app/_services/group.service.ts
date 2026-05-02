import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';
import {SessionService} from './session.service';
import {RestApiModel} from '../component/model/RestApiModel';
import {DataSource} from "../component/model/DataSource";

const API_URL = '/api';

@Injectable({
    providedIn: 'root',
})
export class GroupService {
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

    async queryGroup(query: any): Promise<any> {
        return lastValueFrom(
            this.http.post(
                `${API_URL}/search/Groups/`,
                query,
                this.getHttpOptions(),
            ),
        );
    }

    async getGroupsByTenant(): Promise<any[]> {
        return (await lastValueFrom(
            this.http.get(
                `${API_URL}/tenant/my/groups`,
                this.getHttpOptions(),
            ),
        )) as any[];
    }

    async createGroup(name: string, tenantId: string) {
        return lastValueFrom(
            this.http.post(
                `${API_URL}/group/create`,
                {
                    name: name,
                    tenantId: tenantId,
                },
                this.getHttpOptions(),
            ),
        );
    }

    async getGroupDetail(groupId: any) {
        return (await lastValueFrom(
            this.http.get(`${API_URL}/group/${groupId}`, this.getHttpOptions()),
        )) as any;
    }

    async addRoles(groupId: string, roles: any[]) {
        return (await lastValueFrom(
            this.http.post(
                `${API_URL}/group/${groupId}/add-roles`,
                {
                    roles: roles,
                },
                this.getHttpOptions(),
            ),
        )) as any;
    }

    async removeRoles(groupId: any, roles: any[]) {
        return (await lastValueFrom(
            this.http.post(
                `${API_URL}/group/${groupId}/remove-roles`,
                {
                    roles: roles,
                },
                this.getHttpOptions(),
            ),
        )) as any;
    }

    async addUser(groupId: any, emails: any[]) {
        return (await lastValueFrom(
            this.http.post(
                `${API_URL}/group/${groupId}/add-users`,
                {
                    users: emails,
                },
                this.getHttpOptions(),
            ),
        )) as any;
    }

    async removeUser(groupId: string, emails: any[]) {
        return (await lastValueFrom(
            this.http.post(
                `${API_URL}/group/${groupId}/remove-users`,
                {
                    users: emails,
                },
                this.getHttpOptions(),
            ),
        )) as any;
    }

    async updateGroup(groupId: string, name: string) {
        return (await lastValueFrom(
            this.http.patch(
                `${API_URL}/group/${groupId}/update`,
                {
                    name: name,
                },
                this.getHttpOptions(),
            ),
        )) as any;
    }

    async deleteGroup(groupId: any) {
        return (await lastValueFrom(
            this.http.delete(
                `${API_URL}/group/${groupId}/delete`,
                this.getHttpOptions(),
            ),
        )) as any;
    }

    createDataModel(initialData: any[]): DataSource<any> {
        return new RestApiModel(this.http, `${API_URL}/search/Groups`, ['id']);
    }
}
