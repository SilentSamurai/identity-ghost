import {INestApplication} from "@nestjs/common";
import {Environment} from "../src/config/environment.service";
import {Test, TestingModule} from "@nestjs/testing";
import {AppModule} from "../src/app.module";
import * as superTest from 'supertest';
import * as process from "node:process";
import TestAgent from "supertest/lib/agent";
import {createFakeSmtpServer, FakeSmtpServer} from "../src/mail/FakeSmtpServer";
import {setupConsole} from "./helper.fixture";
import {RS256_TOKEN_GENERATOR, TokenService} from "../src/core/token-abstraction";

export class TestAppFixture {
    private app: INestApplication;
    private moduleRef: TestingModule;
    private _jwtService: TokenService;
    private smtpServer: FakeSmtpServer;

    constructor() {
        setupConsole();
    }

    public get smtp(): FakeSmtpServer {
        return this.smtpServer;
    }

    public get nestApp(): INestApplication {
        return this.app;
    }

    public jwtService(): TokenService {
        return this._jwtService;
    }

    public async init(): Promise<TestAppFixture> {

        process.env.ENV_FILE = './envs/.env.testing';
        process.env.ENABLE_FAKE_SMTP_SERVER = "false"
        Environment.setup();


        this.smtpServer = createFakeSmtpServer({port: 0, controlPort: 0});
        await this.smtpServer.listen();

        // Point the mail transport at the actual bound port
        process.env.MAIL_PORT = String(this.smtpServer.boundPort);

        this.moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile()
        this.app = this.moduleRef.createNestApplication();
        this._jwtService = this.app.get<TokenService>(RS256_TOKEN_GENERATOR);
        await this.app.init();
        this.app.useLogger(console);

        return this;
    }

    public getHttpServer(): TestAgent<superTest.Test> {
        return superTest(this.app.getHttpServer());
    }

    public async close() {
        this.app.flushLogs();
        await this.app.close();
        await this.moduleRef.close();
        await this.smtpServer.close();
    }
}
