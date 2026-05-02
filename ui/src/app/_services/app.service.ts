import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {RestApiModel} from '../component/model/RestApiModel';
import {query} from '../component/model/Query';
import {lastValueFrom} from 'rxjs';

const API_URL = '/api';

@Injectable({
    providedIn: 'root'
})
export class AppService {


    constructor(private http: HttpClient) {
    }

    getHttpOptions() {
        return {
            headers: new HttpHeaders({
                'Content-Type': 'application/json',
                // 'Authorization': 'Bearer ' + this.sessionService.getToken()
            }),
        };
    }

    async createApp(tenantId: string, name: string, appUrl: string, description: string) {
        return lastValueFrom(
            this.http.post(`${API_URL}/apps/create`, {
                tenantId,
                name,
                appUrl,
                description
            })
        );
    }

    async updateApp(id: string, name: string, appUrl: string, description: string) {
        return lastValueFrom(
            this.http.patch(`${API_URL}/apps/${id}`, {
                name,
                appUrl,
                description
            })
        );
    }

    async deleteApp(appId: string) {
        return lastValueFrom(
            this.http.delete(`${API_URL}/apps/${appId}`)
        );
    }

    async getAppCreatedByTenantId() {
        return lastValueFrom(
            this.http.get(`${API_URL}/apps/my/created`)
        ) as Promise<any[]>;
    }

    async getAvailableApps(): Promise<any[]> {
        return lastValueFrom(
            this.http.get(
                `${API_URL}/apps/my/available`,
                this.getHttpOptions()
            )
        ) as Promise<any[]>;
    }

    createDataModel() {
        return new RestApiModel(this.http, `/api/search/Apps`, ['id'], query({
            expand: ['owner']
        }));
    }

    async publishApp(appId: string) {
        return lastValueFrom(
            this.http.patch(`${API_URL}/apps/${appId}/publish`, {}, this.getHttpOptions())
        );
    }
}
