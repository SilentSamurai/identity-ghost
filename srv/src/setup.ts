import {NestApplicationOptions} from "@nestjs/common/interfaces/nest-application-options.interface";
import {Environment} from "./config/environment.service";
import fs from "fs";
import {NestExpressApplication} from "@nestjs/platform-express";
import {NestFactory} from "@nestjs/core";
import {AppModule} from "./app.module";
import {HttpExceptionFilter} from "./exceptions/filter/http-exception.filter";
import * as express from "express";
import * as process from "node:process";
import type {FakeSmtpServer} from "./mail/FakeSmtpServer";

// Hold reference to SMTP server (if started) so we can close it on shutdown
let smtpServerRef: FakeSmtpServer | null = null;

export async function prepareApp() {
    Environment.setup();

    let options: NestApplicationOptions = {
        httpsOptions: null,
        cors: false,
    };

    // https
    if (Environment.get("ENABLE_HTTPS")) {
        const keyPath = Environment.get("KEY_PATH");
        const certPath = Environment.get("CERT_PATH");

        // Protective check before reading files
        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
            console.error(
                `HTTPS is enabled but missing key/cert. Key Path: ${keyPath}, Cert Path: ${certPath}`,
            );
            process.exit(1);
        }
        options.httpsOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        };
    }

    // logger
    // if (Environment.isProduction()) {
    //     options.logger = new JsonConsoleLogger();
    // }

    // smtp
    if (Environment.get("ENABLE_FAKE_SMTP_SERVER", false)) {
        const {createFakeSmtpServer} = await import("./mail/FakeSmtpServer");
        const server = createFakeSmtpServer({});
        await server.listen();
        smtpServerRef = server;
    }

    console.log("Application options: ", options);
    const app: NestExpressApplication =
        await NestFactory.create<NestExpressApplication>(AppModule, options);
    app.useGlobalFilters(new HttpExceptionFilter());

    // Add HEAD / handler
    app.use('/', (req, res, next) => {
        if (req.method === 'HEAD' && req.path === '/') {
            return res.status(200).end();
        }
        next();
    });

    if (Environment.get("ENABLE_CORS")) {
        app.enableCors();
    }

    app.use(
        express.json({
            limit: Environment.get("MAX_REQUEST_SIZE"),
        }),
    );

    app.use(
        express.urlencoded({
            limit: Environment.get("MAX_REQUEST_SIZE"),
            extended: true,
        }),
    );

    return app;
}

export async function run(app: NestExpressApplication) {
    // Graceful shutdown: on SIGTERM/SIGINT, close Nest app cleanly
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    signals.forEach((signal) => {
        process.on(signal, async () => {
            console.log(`Received ${signal}, closing Nest application...`);
            // Close SMTP server first (if running) to free ports
            if (smtpServerRef) {
                try {
                    await smtpServerRef.close();
                } catch (e) {
                    console.error("Error while closing SMTP server:", e);
                } finally {
                    smtpServerRef = null;
                }
            }
            await app.close();
            console.log("Nest application successfully closed.");
            process.exit(0);
        });
    });

    const port = Environment.get("PORT") || 9000;
    await app.listen(port);

    const url: string = await app.getUrl();
    console.log(`🚀 Service running on: ${url}`);
}
