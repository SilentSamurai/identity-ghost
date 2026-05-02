import supertest from "supertest";
import TestAgent from "supertest/lib/agent";
import {JwtService} from "@nestjs/jwt";

export interface TestFixture {
    getHttpServer(): TestAgent<supertest.Test>;

    jwtService(): JwtService;
}

export function is2xx(response: { status: number }) {
    return response.status >= 200 && response.status < 300;
}

export function expect2xx(response: { body: any; status: number }) {
    if (is2xx(response)) {
        return;
    }
    throw {status: response.status, body: response.body};
}


export class HttpClient {

    protected readonly app: TestFixture;
    protected readonly accessToken: string;

    constructor(app: TestFixture, accessToken: string) {
        this.app = app;
        this.accessToken = accessToken;
    }

    public get(url: string): supertest.Test {
        let httpServer = this.app.getHttpServer();
        return httpServer.get(url)
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${this.accessToken}`);
    }

    public post(url: string): supertest.Test {
        let httpServer = this.app.getHttpServer();
        return httpServer.post(url)
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${this.accessToken}`);
    }

    public patch(url: string): supertest.Test {
        let httpServer = this.app.getHttpServer();
        return httpServer.patch(url)
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${this.accessToken}`);
    }
}