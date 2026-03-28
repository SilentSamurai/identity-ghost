import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';
import {SessionService} from './session.service';
import {query} from "../component/model/Query";
import {DataSource} from "../component/model/DataSource";
import {RestApiModel} from "../component/model/RestApiModel";

const API_URL = '/api';

@Injectable({
    providedIn: 'root',
})
export class UserService {
    constructor(
        private http: HttpClient,
        private tokenService: SessionService,
    ) {
    }

    getHttpOptions() {
        return {
            headers: new HttpHeaders({
                'Content-Type': 'application/json',
                // 'Authorization': 'Bearer ' + this.tokenService.getToken()
            }),
        };
    }

    createUser(name: string, email: string, password: string) {
        return lastValueFrom(
            this.http.post(
                `${API_URL}/users/create`,
                {
                    name,
                    email,
                    password,
                },
                this.getHttpOptions(),
            ),
        );
    }

    editUser(id: string, name: string, email: string) {
        return this.http.put(
            `${API_URL}/users/update`,
            {
                id,
                name,
                email
            },
            this.getHttpOptions(),
        );
    }

    deleteUser(id: string) {
        return lastValueFrom(
            this.http.delete(`${API_URL}/users/${id}`, this.getHttpOptions()),
        );
    }

    getUser(userId: string) {
        return this.http.get(
            `${API_URL}/users/${userId}`,
            this.getHttpOptions(),
        );
    }

    getUserTenants(userId: string) {
        return this.http.get(
            `${API_URL}/users/${userId}/tenants`,
            this.getHttpOptions(),
        );
    }

    async queryUser(query: any): Promise<any> {
        return lastValueFrom(
            this.http.post(
                `${API_URL}/search/Users`,
                query,
                this.getHttpOptions(),
            ),
        );
    }

    async verifyUser(email: string, verify: boolean) {
        return lastValueFrom(
            this.http.put(
                `${API_URL}/users/verify-user`,
                {
                    verify: verify,
                    email: email,
                },
                this.getHttpOptions(),
            ),
        );
    }

    createDataModel(): DataSource<any> {
        return new RestApiModel(
            this.http,
            `${API_URL}/search/Users`,
            ['id'],
            query({expand: ["Tenants"]}),
        );
    }

    changeUserPassword(userId: string, password: string, confirmPassword: string) {
        return lastValueFrom(
            this.http.put(
                `${API_URL}/users/${userId}/password`,
                { password, confirmPassword },
                this.getHttpOptions(),
            ),
        );
    }

    lockUser(userId: string) {
        return lastValueFrom(
            this.http.put(`${API_URL}/users/${userId}/lock`, {}, this.getHttpOptions()),
        );
    }

    unlockUser(userId: string) {
        return lastValueFrom(
            this.http.put(`${API_URL}/users/${userId}/unlock`, {}, this.getHttpOptions()),
        );
    }
}
