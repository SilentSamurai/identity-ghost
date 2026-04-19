import {Controller, Get, Options, Param, Req, Res} from "@nestjs/common";
import {Request, Response} from "express";
import {DiscoveryService} from "../services/discovery.service";
import {TenantService} from "../services/tenant.service";

/**
 * Controller for the OIDC Discovery endpoint.
 * Serves the OpenID Connect Discovery document at /.well-known/openid-configuration
 * per OpenID Connect Discovery 1.0 §4.
 *
 * No authentication required — the endpoint is public so clients can fetch
 * configuration before any authentication has occurred.
 */
@Controller(":tenantDomain/.well-known")
export class DiscoveryController {
    constructor(
        private readonly discoveryService: DiscoveryService,
        private readonly tenantService: TenantService,
    ) {}

    /**
     * Returns the OIDC Discovery document for the requested tenant.
     *
     * @param tenantDomain - The tenant domain from the URL path
     * @param req - The Express request object
     * @param res - The Express response object
     */
    @Get("openid-configuration")
    async getOpenIdConfiguration(
        @Param("tenantDomain") tenantDomain: string,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        // Validate tenant exists
        const tenant = await this.tenantService.findByDomainPublic(tenantDomain);
        if (!tenant) {
            res.status(404).json({error: "not_found"});
            return;
        }

        // Derive base URL from request headers (with proxy support)
        const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
        const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
        const baseUrl = `${protocol}://${host}`;

        // Build the discovery document
        const {body, etag} = this.discoveryService.buildDocument(baseUrl, tenantDomain);

        // Handle conditional request (304 Not Modified)
        const ifNoneMatch = req.headers["if-none-match"];
        if (ifNoneMatch === etag) {
            res.status(304).end();
            return;
        }

        // Set response headers
        res.set("Content-Type", "application/json");
        res.set("Cache-Control", "max-age=3600");
        res.set("ETag", etag);
        res.set("Access-Control-Allow-Origin", "*");

        res.status(200).send(body);
    }

    /**
     * Handles CORS preflight requests for the OpenID Configuration endpoint.
     * Returns wildcard CORS headers to allow any origin to fetch the discovery document.
     */
    @Options("openid-configuration")
    async optionsOpenIdConfiguration(@Res() res: Response): Promise<void> {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.status(204).end();
    }
}
