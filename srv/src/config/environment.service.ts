import {Injectable} from "@nestjs/common";
import {config} from "dotenv";
import * as path from "path";
import * as process from "node:process";
import * as fs from "node:fs";

@Injectable()
export class Environment {
    constructor() {
    }

    static setup(): any {
        const envFile = process.env.ENV_FILE || "./envs/.env.development";
        let envPath = path.resolve(process.cwd(), envFile);
        if (!fs.existsSync(envPath)) {
            console.log("Environment does not exist", envPath);
            throw new Error("Missing environment");
        }
        console.log("Environment path :", envPath);
        config({
            path: envPath,
        });

        const DIAGNOSTIC_KEYS = [
            "NODE_ENV", "PORT", "SERVICE_NAME", "ENV_FILE",
            "DATABASE_HOST", "DATABASE_PORT", "DATABASE_NAME",
            "MAIL_HOST", "MAIL_PORT",
            "LOG_LEVEL",
        ];
        console.log("Environment diagnostics:");
        for (const key of DIAGNOSTIC_KEYS) {
            if (key in process.env) {
                console.log(`  ${key}=${process.env[key]}`);
            }
        }
    }

    // static configTest(print = false): any {
    //     let envPath = path.resolve(process.cwd(), '.env.testing');
    //     console.log("Environment path :", envPath);
    //     config({
    //         path: envPath
    //     })
    //
    //
    //     if (print) {
    //         console.log("Environment variables:");
    //         Object.keys(process.env).forEach(function (key) {
    //             console.log(key + '=' + process.env[key]);
    //         });
    //     }
    // }

    /**
     * Get a configuration value.
     */
    static get(key: string, defaultValue: any = null): any {
        if (key in process.env) {
            let value: string = process.env[key];
            switch (value) {
                // case '1':
                case "true":
                    return true;
                // case '0':
                case "false":
                    return false;
                default:
                    return value;
            }
        } else {
            return defaultValue;
        }
    }

    /**
     * Is a production environment?
     */
    static isProduction(): boolean {
        return process.env.NODE_ENV === "production";
    }

    /**
     * Get a configuration value.
     */
    get(key: string, defaultValue: any = null): any {
        return Environment.get(key, defaultValue);
    }

    /**
     * Get the service name.
     */
    getServiceName(): string {
        const key: string = "SERVICE_NAME";
        if (key in process.env) {
            return process.env[key];
        } else {
            return "Auth Server";
        }
    }

    isProduction() {
        return Environment.isProduction();
    }
}
