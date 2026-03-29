import * as http from 'http';

export interface OnboardRequest {
    tenantId: string;
    timestamp: string;
}

export interface OffboardRequest {
    tenantId: string;
    timestamp: string;
}

/**
 * HTTP client wrapper for the TenantAppServer control API.
 * Used by SharedTestFixture in worker processes to communicate
 * with the shared TenantAppServer over HTTP.
 */
export class WebhookClientAdapter {
    private readonly _boundPort: number;

    constructor(private readonly baseUrl: string) {
        const match = baseUrl.match(/:(\d+)/);
        this._boundPort = match ? parseInt(match[1], 10) : 0;
    }

    /** Port extracted from the baseUrl for convenience. */
    get boundPort(): number {
        return this._boundPort;
    }

    async getOnboardRequests(): Promise<{ count: number; requests: OnboardRequest[] }> {
        return this.httpGet<{ count: number; requests: OnboardRequest[] }>('/api/onboard/requests');
    }

    async getOnboardRequestsForTenant(tenantId: string): Promise<{ count: number; requests: OnboardRequest[] }> {
        return this.httpGet<{ count: number; requests: OnboardRequest[] }>(`/api/onboard/requests/${tenantId}`);
    }

    async getOffboardRequests(): Promise<{ count: number; requests: OffboardRequest[] }> {
        return this.httpGet<{ count: number; requests: OffboardRequest[] }>('/api/offboard/requests');
    }

    async getOffboardRequestsForTenant(tenantId: string): Promise<{ count: number; requests: OffboardRequest[] }> {
        return this.httpGet<{ count: number; requests: OffboardRequest[] }>(`/api/offboard/requests/${tenantId}`);
    }

    async clearOnboardRequests(): Promise<void> {
        await this.httpDelete('/api/onboard/requests');
    }

    async clearOffboardRequests(): Promise<void> {
        await this.httpDelete('/api/offboard/requests');
    }

    async getLastDecodedToken(): Promise<any> {
        return this.httpGet<any>('/api/last-decoded-token');
    }

    async getDecodedTokenForTenant(tenantId: string): Promise<any> {
        return this.httpGet<any>(`/api/decoded-token/${tenantId}`);
    }

    private httpGet<T>(path: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const url = `${this.baseUrl}${path}`;
            http.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error(`Failed to parse JSON from ${url}: ${data}`));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode} from GET ${url}: ${data}`));
                    }
                });
                res.on('error', reject);
            }).on('error', reject);
        });
    }

    private httpDelete(path: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const parsed = new URL(`${this.baseUrl}${path}`);
            const options: http.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname,
                method: 'DELETE',
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        reject(new Error(`HTTP ${res.statusCode} from DELETE ${path}: ${data}`));
                    }
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            req.end();
        });
    }
}
