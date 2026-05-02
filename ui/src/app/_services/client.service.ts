import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';

const API_URL = '/api';

export interface Client {
    id: string;
    clientId: string;
    redirectUris: string[];
    allowedScopes: string;
    grantTypes: string;
    responseTypes: string;
    tokenEndpointAuthMethod: string;
    isPublic: boolean;
    requirePkce: boolean;
    allowPasswordGrant: boolean;
    allowRefreshToken: boolean;
    name: string;
    createdAt: string;
    tenant: { id: string; name: string };
}

export interface CreateClientRequest {
    tenantId: string;
    name: string;
    redirectUris: string[];
    allowedScopes?: string;
    grantTypes?: string;
    responseTypes?: string;
    tokenEndpointAuthMethod?: string;
    isPublic?: boolean;
    requirePkce?: boolean;
    allowPasswordGrant?: boolean;
    allowRefreshToken?: boolean;
}

export interface CreateClientResponse {
    client: Client;
    clientSecret: string | null;
}

export interface UpdateClientRequest {
    name?: string;
    redirectUris?: string[];
    requirePkce?: boolean;
    allowPasswordGrant?: boolean;
    allowRefreshToken?: boolean;
}

export interface RotateSecretResponse {
    client: Client;
    clientSecret: string;
}

@Injectable({
    providedIn: 'root'
})
export class ClientService {

    constructor(private http: HttpClient) {
    }

    async createClient(tenantId: string, body: CreateClientRequest): Promise<CreateClientResponse> {
        return lastValueFrom(
            this.http.post<CreateClientResponse>(`${API_URL}/clients/create`, body)
        );
    }

    async getClient(clientId: string): Promise<Client> {
        return lastValueFrom(
            this.http.get<Client>(`${API_URL}/clients/${clientId}`)
        );
    }

    async getClientsByTenant(): Promise<Client[]> {
        return lastValueFrom(
            this.http.get<Client[]>(`${API_URL}/clients/my/clients`)
        );
    }

    async updateClient(clientId: string, body: UpdateClientRequest): Promise<Client> {
        return lastValueFrom(
            this.http.patch<Client>(`${API_URL}/clients/${clientId}`, body)
        );
    }

    async rotateSecret(clientId: string): Promise<RotateSecretResponse> {
        return lastValueFrom(
            this.http.post<RotateSecretResponse>(`${API_URL}/clients/${clientId}/rotate-secret`, {})
        );
    }

    async deleteClient(clientId: string): Promise<void> {
        return lastValueFrom(
            this.http.delete<void>(`${API_URL}/clients/${clientId}`)
        );
    }
}
