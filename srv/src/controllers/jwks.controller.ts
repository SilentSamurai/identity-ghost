import {Controller, Get, Options, Param, Req, Res} from "@nestjs/common";
import {Request, Response} from "express";
import {JwksService} from "../services/jwks.service";
import {TenantService} from "../services/tenant.service";

@Controller(":tenantDomain/.well-known")
export class JwksController {
    constructor(
        private readonly jwksService: JwksService,
        private readonly tenantService: TenantService,
    ) {}

    @Get("jwks.json")
    async getJwks(
        @Param("tenantDomain") tenantDomain: string,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const tenant = await this.tenantService.findByDomainPublic(tenantDomain);
        if (!tenant) {
            res.status(404).json({error: "not_found"});
            return;
        }

        const {body, etag} = await this.jwksService.getJwks(tenant.id);

        const ifNoneMatch = req.headers["if-none-match"];
        if (ifNoneMatch === etag) {
            res.status(304).end();
            return;
        }

        res.set("Content-Type", "application/json");
        res.set("Cache-Control", "no-cache");
        res.set("ETag", etag);
        res.set("Access-Control-Allow-Origin", "*");
        res.status(200).send(body);
    }

    /**
     * Handles CORS preflight requests for the JWKS endpoint.
     * Returns wildcard CORS headers to allow any origin to fetch the signing keys.
     */
    @Options("jwks.json")
    async optionsJwks(@Res() res: Response): Promise<void> {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.status(204).end();
    }
}
