import * as http from 'http';

export interface EmailResponse {
    subject: string;
    to: any;
    from: any;
    links: string[];
    paths: string[];
    text?: string;
    html?: string;
    date?: string;
}

export interface EmailListResponse {
    emails: Array<{
        subject: string;
        to: any;
        from: any;
        date?: string;
    }>;
}

/**
 * HTTP client wrapper for the FakeSmtpServer control API.
 * Used by SharedTestFixture in worker processes to communicate
 * with the shared FakeSmtpServer over HTTP.
 */
export class SmtpClientAdapter {
    constructor(private readonly controlBaseUrl: string) {}

    async getLatestEmail(params?: { to?: string; subject?: string; timeoutMs?: number }): Promise<EmailResponse> {
        const query = new URLSearchParams();
        if (params?.to) query.set('to', params.to);
        if (params?.subject) query.set('subject', params.subject);
        if (params?.timeoutMs !== undefined) query.set('timeoutMs', String(params.timeoutMs));

        const qs = query.toString();
        const path = `/__test__/emails/latest${qs ? `?${qs}` : ''}`;
        return this.httpGet<EmailResponse>(path);
    }

    async listEmails(params?: { to?: string; subject?: string; limit?: number }): Promise<EmailListResponse> {
        const query = new URLSearchParams();
        if (params?.to) query.set('to', params.to);
        if (params?.subject) query.set('subject', params.subject);
        if (params?.limit !== undefined) query.set('limit', String(params.limit));

        const qs = query.toString();
        const path = `/__test__/emails/list${qs ? `?${qs}` : ''}`;
        return this.httpGet<EmailListResponse>(path);
    }

    async clearEmails(): Promise<void> {
        await this.httpPost('/__test__/emails/clear');
    }

    extractLinks(email: EmailResponse): string[] {
        return email.links;
    }

    extractPaths(email: EmailResponse): string[] {
        return email.paths;
    }

    /**
     * Mirrors FakeSmtpServer.waitForEmail() signature used in existing tests.
     * Delegates to getLatestEmail with the appropriate params.
     */
    async waitForEmail(
        criteria: { to?: string; subject?: string | RegExp; containsLink?: boolean; sort?: string; limit?: number },
        timeoutMs = 10000,
        _pollInterval?: number,
    ): Promise<EmailResponse> {
        const subject = criteria.subject instanceof RegExp
            ? criteria.subject.source
            : criteria.subject;

        return this.getLatestEmail({
            to: criteria.to,
            subject,
            timeoutMs,
        });
    }

    /** Build the full URL for a given path. */
    buildUrl(path: string): string {
        return `${this.controlBaseUrl}${path}`;
    }

    private httpGet<T>(path: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const url = this.buildUrl(path);
            http.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error(`Failed to parse JSON from ${url}: ${data}`));
                        }
                    } else if (res.statusCode === 404) {
                        const body = data ? JSON.parse(data) : {};
                        reject(new Error(body.error || `No matching email found (GET ${path})`));
                    } else {
                        reject(new Error(`HTTP ${res.statusCode} from GET ${url}: ${data}`));
                    }
                });
                res.on('error', reject);
            }).on('error', reject);
        });
    }

    private httpPost(path: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const url = new URL(this.buildUrl(path));
            const options: http.RequestOptions = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                headers: { 'Content-Length': '0' },
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        reject(new Error(`HTTP ${res.statusCode} from POST ${path}: ${data}`));
                    }
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            req.end();
        });
    }
}
