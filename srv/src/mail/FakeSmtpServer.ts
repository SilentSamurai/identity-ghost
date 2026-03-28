import {SMTPServer, SMTPServerDataStream, SMTPServerOptions, SMTPServerSession,} from "smtp-server";
import {AddressObject, EmailAddress, ParsedMail, simpleParser,} from "mailparser";
import * as express from "express";
import * as http from "http";

/**
 * Interface for environment configuration
 */
interface ServerConfig {
    port?: number;
    host?: string;
    logLevel?: "none" | "error" | "warn" | "info" | "debug";
    controlHost?: string;
    controlPort?: number;
    controlEnabled?: boolean;
}

export interface EmailSearchCriteria {
    to?: string | RegExp; // Recipient email address or pattern
    from?: string | RegExp; // Sender email address or pattern
    subject?: string | RegExp; // Subject line text or pattern
    body?: string | RegExp; // Text in email body (text or HTML)
    hasAttachments?: boolean; // Whether email has attachments
    after?: Date; // Emails received after this date
    before?: Date; // Emails received before this date
    containsLink?: boolean | RegExp; // Whether email contains links (or matching specific pattern)
    limit?: number; // Maximum number of results to return
    sort?: "newest" | "oldest"; // Sort order
}

export class FakeSmtpServer {
    public emails: ParsedMail[] = [];
    private server: SMTPServer;
    private config: Required<ServerConfig>;
    private logger: Console;
    private controlApp?: express.Express;
    private controlServer?: http.Server;
    private emailHandler?: (email: ParsedMail) => void;
    private _boundPort: number = 0;
    private _boundControlPort: number = 0;

    /** Actual SMTP port after listen() — useful when configured with port 0. */
    public get boundPort(): number {
        return this._boundPort;
    }

    /** Actual control-server port after listen() — useful when configured with port 0. */
    public get boundControlPort(): number {
        return this._boundControlPort;
    }

    constructor(config: ServerConfig = {}) {
        this.config = this.getFullConfig(config);
        this.logger = console;

        // Create server with options
        const serverOptions = this.buildServerOptions();
        this.server = new SMTPServer(serverOptions);

        // Setup graceful shutdown
        this.setupShutdownHandlers();
    }

    public async listen(): Promise<FakeSmtpServer> {
        return new Promise((resolve, reject) => {
            const onError = (err: Error) => {
                this.log("error", "SMTP listen error:", err);
                this.server.removeListener('error', onError);
                reject(err);
            };
            this.server.once('error', onError);

            this.server.listen(this.config.port, this.config.host, () => {
                this.server.removeListener('error', onError);
                const addr = this.server.server.address();
                if (addr && typeof addr === 'object') {
                    this._boundPort = addr.port;
                }
                this.log(
                    "info",
                    `SMTP Server listening on ${this.config.host}:${this._boundPort}`,
                );
                // Optionally start control HTTP server
                if (this.config.controlEnabled) {
                    this.startControlServer()
                        .then(() => resolve(this))
                        .catch((err) => {
                            this.log("error", "Failed to start control server", err);
                            resolve(this); // continue even if control fails
                        });
                } else {
                    resolve(this);
                }
            });
        });
    }

    public async close(): Promise<void> {
        this.log("info", "Closing SMTP server...");
        return new Promise((resolve, reject) => {
            this.server.close((error?: Error) => {
                if (error) {
                    this.log("error", "Error closing SMTP server:", error);
                    return reject(error);
                }
                this.log("info", "SMTP Server closed");
                // Close control server if running
                if (this.controlServer) {
                    this.controlServer.close(() => resolve());
                    this.controlServer = undefined;
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Set custom email handler
     * @param handler Function to handle parsed emails
     */
    public setEmailHandler(handler: (email: ParsedMail) => void): void {
        this.emailHandler = handler;
    }

    public searchEmails(criteria: EmailSearchCriteria): ParsedMail[] {
        const limit = criteria.limit ?? this.emails.length;
        const sortNewest = criteria.sort === "newest";

        return this.emails
            .filter((email) => this.matchEmail(email, criteria))
            .sort((a, b) => {
                // Safely obtain epoch times, falling back to 0 if the Date is missing
                const timeA = a.date?.getTime() ?? 0;
                const timeB = b.date?.getTime() ?? 0;
                return sortNewest ? timeB - timeA : timeA - timeB;
            })
            .slice(0, limit);
    }

    public waitForEmail(
        criteria: EmailSearchCriteria,
        timeoutMs = 5000,
        pollInterval = 500,
    ): Promise<ParsedMail> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkEmails = () => {
                const matchingEmail = this.searchEmails(criteria);
                if (matchingEmail.length > 0) {
                    return resolve(matchingEmail[0]);
                }

                if (Date.now() - startTime >= timeoutMs) {
                    return reject(
                        new Error(
                            `Timeout waiting for email matching: ${JSON.stringify(criteria)}`,
                        ),
                    );
                }
                setTimeout(checkEmails, pollInterval);
            };
            checkEmails();
        });
    }

    public extractPaths(email: ParsedMail): string[] {
        const body = `${email.text || ""} ${email.html || ""}`;
        const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;

        return Array.from(
            new Set(
                (body.match(urlRegex) || []).map((url) => {
                    try {
                        return new URL(url).pathname;
                    } catch (error) {
                        return ""; // Ignore invalid URLs
                    }
                }),
            ),
        ).filter((path) => path); // Remove empty values
    }

    public extractLinks(email: ParsedMail): string[] {
        const body = `${email.text || ""} ${email.html || ""}`;
        const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
        return Array.from(new Set(body.match(urlRegex) || [])); // Remove duplicates
    }

    /**
     * Merge provided config with defaults and environment variables
     */
    private getFullConfig(config: ServerConfig): Required<ServerConfig> {
        return {
            port: config.port ?? parseInt(process.env.MAIL_PORT || "587", 10),
            host: config.host || process.env.MAIL_HOST || "127.0.0.1",
            logLevel:
                config.logLevel ||
                (process.env.SMTP_LOG_LEVEL as any) ||
                "info",
            controlHost: config.controlHost || process.env.MAIL_CONTROL_HOST || "127.0.0.1",
            controlPort: config.controlPort ?? parseInt(process.env.MAIL_CONTROL_PORT || "8899", 10),
            controlEnabled: config.controlEnabled !== undefined
                ? config.controlEnabled
                : (process.env.MAIL_CONTROL_ENABLE || "true").toLowerCase() === "true",
        };
    }

    /**
     * Start HTTP control server to retrieve emails
     */
    private async startControlServer(): Promise<void> {
        this.controlApp = express();
        const app = this.controlApp;

        app.get('/__test__/emails/latest', async (req, res) => {
            try {
                const to = req.query.to as string | undefined;
                const subject = req.query.subject as string | undefined;
                const timeoutMs = Number(req.query.timeoutMs ?? 10000);
                const criteria: any = { sort: 'newest', limit: 1 };
                if (to) criteria.to = to;
                if (subject) {
                    try { criteria.subject = new RegExp(subject as string, 'i'); } catch { criteria.subject = subject; }
                }
                const email = await this.waitForEmail(criteria, timeoutMs, 500);
                const links = this.extractLinks(email);
                const paths = this.extractPaths(email);
                return res.json({
                    subject: email.subject,
                    to: email.to,
                    from: email.from,
                    links,
                    paths,
                    text: email.text,
                    html: email.html,
                    date: email.date,
                });
            } catch (e: any) {
                return res.status(404).json({ error: e?.message || 'No matching email found' });
            }
        });

        app.get('/__test__/emails/list', (req, res) => {
            const to = req.query.to as string | undefined;
            const subject = req.query.subject as string | undefined;
            const limit = Number(req.query.limit ?? 10);
            const criteria: any = { sort: 'newest', limit };
            if (to) criteria.to = to;
            if (subject) {
                try { criteria.subject = new RegExp(subject as string, 'i'); } catch { criteria.subject = subject; }
            }
            const emails = this.searchEmails(criteria).map(e => ({
                subject: e.subject,
                to: e.to,
                from: e.from,
                date: e.date,
            }));
            return res.json({ emails });
        });

        app.post('/__test__/emails/clear', (req, res) => {
            this.emails.length = 0;
            return res.status(204).end();
        });

        await new Promise<void>((resolve) => {
            this.controlServer = app.listen(this.config.controlPort, this.config.controlHost, () => {
                const addr = this.controlServer.address();
                if (addr && typeof addr === 'object') {
                    this._boundControlPort = addr.port;
                }
                this.log('info', `SMTP Control listening on http://${this.config.controlHost}:${this._boundControlPort}`);
                resolve();
            });
        });
    }

    /**
     * Build SMTP server options
     */
    private buildServerOptions(): SMTPServerOptions {
        return {
            onData: this.handleEmailData.bind(this),
            disabledCommands: ["AUTH", "STARTTLS"],
            secure: false,
            allowInsecureAuth: true,
            authOptional: true,
            disableReverseLookup: true,
        };
    }

    private handleEmailData(
        stream: SMTPServerDataStream,
        session: SMTPServerSession,
        callback: (err?: Error) => void,
    ): void {
        simpleParser(stream)
            .then((parsedEmail) => {
                this.emails.push(parsedEmail);
                this.logEmailDetails(parsedEmail);
                if (this.emailHandler) {
                    try {
                        this.emailHandler(parsedEmail);
                    } catch (handlerErr: any) {
                        this.log("error", "Email handler error:", handlerErr);
                    }
                }
                callback();
            })
            .catch((err) => {
                this.log("error", "Error parsing email:", err);
                callback(err);
            });
    }

    private logEmailDetails(parsedEmail: ParsedMail): void {
        this.log("info", "Email received:", parsedEmail.subject);
        this.log("info", "From:", parsedEmail.from?.text);
        this.log("info", "To:", this.getRecipientText(parsedEmail));
        if (parsedEmail.text) {
            this.log("info", `Body: ${parsedEmail.text}`);
        }
        if (parsedEmail.attachments?.length) {
            this.log("info", `Attachments: ${parsedEmail.attachments.length}`);
        }
    }

    private setupShutdownHandlers(): void {
        if (require.main !== module) {
            return;
        }
        // Handle termination signals
        process.on("SIGTERM", async () => {
            this.log("info", "SMTP Server shutting down (SIGTERM)...");
            await this.close();
            process.exit(0);
        });

        process.on("SIGINT", async () => {
            this.log("info", "SMTP Server shutting down (SIGINT)...");
            await this.close();
            process.exit(0);
        });
    }

    private log(
        level: "none" | "error" | "warn" | "info" | "debug",
        ...args: any[]
    ): void {
        const levels = {none: 0, error: 1, warn: 2, info: 3, debug: 4};
        if (levels[level] <= levels[this.config.logLevel]) {
            console[
                level === "error"
                    ? "error"
                    : level === "warn"
                        ? "warn"
                        : level === "info"
                            ? "info"
                            : "log"
                ](...args);
        }
    }

    private getRecipientText(email: ParsedMail): string {
        if (!email.to) return "";
        return Array.isArray(email.to)
            ? email.to.map(this.formatAddressObject).join(", ")
            : this.formatAddressObject(email.to);
    }

    private formatAddressObject(
        address: EmailAddress | AddressObject | any,
    ): string {
        if (typeof address === "string") return address;
        if (typeof address === "object") {
            if (address.group)
                return `${address.name || "Group"}: ${address.group.map(this.formatAddressObject).join(", ")};`;
            return address.address || address.email || address.text || "";
        }
        return String(address);
    }

    private matchEmail(
        email: ParsedMail,
        criteria: EmailSearchCriteria,
    ): boolean {
        const match = (field: string | undefined, value: string | RegExp) =>
            field &&
            (typeof value === "string"
                ? field.includes(value)
                : value.test(field));

        if (criteria.to && !match(this.getRecipientText(email), criteria.to))
            return false;
        if (criteria.from && !match(email.from?.text, criteria.from))
            return false;
        if (criteria.subject && !match(email.subject, criteria.subject))
            return false;
        if (criteria.body) {
            const fullContent = `${email.text || ""} ${email.html || ""}`;
            if (!match(fullContent, criteria.body)) return false;
        }
        if (
            criteria.hasAttachments !== undefined &&
            email.attachments?.length > 0 !== criteria.hasAttachments
        )
            return false;
        if (criteria.after && email.date && email.date < criteria.after)
            return false;
        if (criteria.before && email.date && email.date > criteria.before)
            return false;

        if (criteria.containsLink !== undefined) {
            const links = this.extractLinks(email);
            if (criteria.containsLink instanceof RegExp) {
                const re = criteria.containsLink as RegExp;
                const anyMatches = links.some(l => re.test(l));
                if (!anyMatches) return false;
            } else {
                if (criteria.containsLink && links.length === 0) return false;
                if (!criteria.containsLink && links.length > 0) return false;
            }
        }
        return true;
    }
}

export const createFakeSmtpServer = (
    config: ServerConfig = {},
): FakeSmtpServer => {
    return new FakeSmtpServer(config);
};

// Auto-start server if this file is executed directly
if (require.main === module) {
    const server = createFakeSmtpServer({});
    server.listen().catch((err) => console.log(err));
}
