import * as express from 'express';
import * as http from 'http';
import * as cors from 'cors';
import * as jwt from 'jsonwebtoken';

/**
 * Interface for environment configuration
 */
interface ServerConfig {
    port?: number;
    host?: string;
    logLevel?: 'none' | 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Interface for the response from app's onboard endpoint
 */
interface OnboardResponse {
    appNames?: string[];
}

/**
 * Interface for the response from app's offboard endpoint
 */
interface OffboardResponse {
    appNames?: string[];
}

/**
 * Interface for onboard request tracking
 */
interface OnboardRequest {
    tenantId: string;
    timestamp: Date;
}

/**
 * Interface for offboard request tracking
 */
interface OffboardRequest {
    tenantId: string;
    timestamp: Date;
}

export class TenantAppServer {
    private app: express.Application;
    private server: http.Server;
    private config: Required<ServerConfig>;
    private logger: Console;
    private _boundPort: number = 0;

    // Track onboard and offboard requests
    private onboardRequests: OnboardRequest[] = [];
    private offboardRequests: OffboardRequest[] = [];
    private lastDecodedToken: any = null; // Store last decoded JWT for test assertions
    private decodedTokensByTenant: Map<string, any> = new Map(); // Keyed by tenantId for parallel-safe lookups

    /** Actual port after listen() — useful when configured with port 0. */
    public get boundPort(): number {
        return this._boundPort;
    }

    constructor(config: ServerConfig = {}) {
        this.config = this.getFullConfig(config);
        this.logger = console;

        // Create Express app
        this.app = express();

        // Setup middleware
        this.setupMiddleware();

        // Setup routes
        this.setupRoutes();

        // Create HTTP server
        this.server = http.createServer(this.app);

        // Setup graceful shutdown
        this.setupShutdownHandlers();
    }

    /**
     * Start the server
     */
    public async listen(): Promise<TenantAppServer> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.config.port, this.config.host, () => {
                const addr = this.server.address();
                if (addr && typeof addr === 'object') {
                    this._boundPort = addr.port;
                }
                this.log('info', `Mock Onboard Server listening on ${this.config.host}:${this._boundPort}`);
                resolve(this);
            });
        });
    }

    /**
     * Close the server
     */
    public async close(): Promise<void> {
        this.log('info', 'Closing Mock Onboard Server...');
        return new Promise((resolve, reject) => {
            this.server.close((error?: Error) => {
                if (error) {
                    this.log('error', 'Error closing Mock Onboard Server:', error);
                    return reject(error);
                }
                this.log('info', 'Mock Onboard Server closed');
                resolve();
            });
        });
    }

    /**
     * Get all onboard requests
     */
    public getOnboardRequests(): OnboardRequest[] {
        return [...this.onboardRequests];
    }

    /**
     * Check if a specific tenant was onboarded
     */
    public wasTenantOnboarded(tenantId: string): boolean {
        return this.onboardRequests.some(req => req.tenantId === tenantId);
    }

    /**
     * Clear onboard requests history
     */
    public clearOnboardRequests(): void {
        this.onboardRequests = [];
    }

    /**
     * Get all offboard requests
     */
    public getOffboardRequests(): OffboardRequest[] {
        return [...this.offboardRequests];
    }

    /**
     * Check if a specific tenant was offboarded
     */
    public wasTenantOffboarded(tenantId: string): boolean {
        return this.offboardRequests.some(req => req.tenantId === tenantId);
    }

    /**
     * Clear offboard requests history
     */
    public clearOffboardRequests(): void {
        this.offboardRequests = [];
    }

    /**
     * Setup middleware
     */
    private setupMiddleware(): void {
        // Parse JSON bodies
        this.app.use(express.json());

        // Enable CORS
        this.app.use(cors());
    }

    /**
     * Setup routes
     */
    private setupRoutes(): void {
        // Onboard endpoint (update path to match SubscriptionService)
        this.app.post('/api/onboard/tenant/', (req, res) => {
            try {
                const tenantId = req.body.tenantId;
                // Decode JWT from Authorization header
                const authHeader = req.headers['authorization'];
                let decoded: any = null;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.substring(7);
                    try {
                        decoded = jwt.decode(token);
                        this.lastDecodedToken = decoded;
                        if (tenantId) {
                            this.decodedTokensByTenant.set(tenantId, decoded);
                        }
                    } catch (e) {
                        this.lastDecodedToken = null;
                    }
                }
                this.log('info', `Received onboard request for tenant: ${tenantId}, token sub: ${decoded?.sub}`);

                // Track the request
                this.onboardRequests.push({
                    tenantId,
                    timestamp: new Date()
                });

                // Return a successful response with no additional apps
                res.json({appNames: []} as OnboardResponse);
            } catch (error) {
                this.log('error', 'Error processing onboard request:', error);
                res.status(400).json({error: 'Invalid request body'});
            }
        });

        // Offboard endpoint (update path to match SubscriptionService)
        this.app.post('/api/offboard/tenant/', (req, res) => {
            const tenantId = req.body.tenantId;
            // Decode JWT from Authorization header
            const authHeader = req.headers['authorization'];
            let decoded: any = null;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                try {
                    decoded = jwt.decode(token);
                    this.lastDecodedToken = decoded;
                    if (tenantId) {
                        this.decodedTokensByTenant.set(tenantId, decoded);
                    }
                } catch (e) {
                    this.lastDecodedToken = null;
                }
            }
            this.log('info', `Received offboard request for tenant: ${tenantId}, token sub: ${decoded?.sub}`);

            // Track the offboard request
            this.offboardRequests.push({
                tenantId,
                timestamp: new Date()
            });

            // Return a successful response with no additional apps
            res.json({appNames: []} as OffboardResponse);
        });

        // API to check if onboard was called
        this.app.get('/api/onboard/requests', (req, res) => {
            res.json({
                count: this.onboardRequests.length,
                requests: this.onboardRequests
            });
        });

        // API to check if a specific tenant was onboarded
        this.app.get('/api/onboard/requests/:tenantId', (req, res) => {
            const tenantId = req.params.tenantId;
            const requests = this.onboardRequests.filter(req => req.tenantId === tenantId);

            res.json({
                count: requests.length,
                requests
            });
        });

        // API to clear onboard requests history
        this.app.delete('/api/onboard/requests', (req, res) => {
            this.onboardRequests = [];
            res.json({message: 'Onboard requests cleared'});
        });

        // API to check if offboard was called
        this.app.get('/api/offboard/requests', (req, res) => {
            res.json({
                count: this.offboardRequests.length,
                requests: this.offboardRequests
            });
        });

        // API to check if a specific tenant was offboarded
        this.app.get('/api/offboard/requests/:tenantId', (req, res) => {
            const tenantId = req.params.tenantId;
            const requests = this.offboardRequests.filter(req => req.tenantId === tenantId);

            res.json({
                count: requests.length,
                requests
            });
        });

        // API to clear offboard requests history
        this.app.delete('/api/offboard/requests', (req, res) => {
            this.offboardRequests = [];
            res.json({message: 'Offboard requests cleared'});
        });

        // API to get the last decoded JWT token (for test assertions)
        this.app.get('/api/last-decoded-token', (req, res) => {
            res.json(this.lastDecodedToken || null);
        });

        // API to get a decoded JWT token by the tenantId it was used for (parallel-safe)
        this.app.get('/api/decoded-token/:tenantId', (req, res) => {
            const token = this.decodedTokensByTenant.get(req.params.tenantId);
            res.json(token || null);
        });

        // Catch-all route for unknown endpoints
        this.app.use((req, res) => {
            this.log('warn', `Unknown endpoint: ${req.method} ${req.url}`);
            res.status(404).json({error: 'Not found'});
        });
    }

    /**
     * Merge provided config with defaults
     */
    private getFullConfig(config: ServerConfig): Required<ServerConfig> {
        return {
            port: config.port ?? 3000,
            host: config.host || 'localhost',
            logLevel: config.logLevel || 'info'
        };
    }

    /**
     * Setup shutdown handlers
     */
    private setupShutdownHandlers(): void {
        // Handle termination signals
        process.on('SIGTERM', async () => {
            this.log('info', 'Mock Onboard Server shutting down (SIGTERM)...');
            await this.close();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            this.log('info', 'Mock Onboard Server shutting down (SIGINT)...');
            await this.close();
            process.exit(0);
        });
    }

    /**
     * Log with appropriate level
     */
    private log(level: 'none' | 'error' | 'warn' | 'info' | 'debug', ...args: any[]): void {
        const levels = {none: 0, error: 1, warn: 2, info: 3, debug: 4};
        if (levels[level] <= levels[this.config.logLevel]) {
            console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'info' ? 'info' : 'log'](...args);
        }
    }

    /**
     * Get the last decoded JWT token (for test assertions)
     */
    public getLastDecodedToken(): any {
        return this.lastDecodedToken;
    }
}

/**
 * Create a new MockOnboardServer instance
 */
export const createTenantAppServer = (config: ServerConfig = {}): TenantAppServer => {
    return new TenantAppServer(config);
};

// Auto-start server if this file is executed directly
if (require.main === module) {
    const server = createTenantAppServer({});
    server.listen().catch(err => console.log(err));
}