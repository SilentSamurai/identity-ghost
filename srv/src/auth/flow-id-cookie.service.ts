/**
 * FlowIdCookieService — manages the `flow_id` cookie lifecycle for the
 * unified OAuth authorization flow.
 *
 * The `flow_id` cookie is a signed, HttpOnly, SameSite=Lax UUID that is
 * minted on the first `/api/oauth/authorize` hit (when absent) and kept
 * stable for the life of a single authorization flow. It binds a
 * stateless CSRF token (`HMAC-SHA256(COOKIE_SECRET, flow_id)`) across
 * every UI redirect (login, consent, session-confirm) and every
 * state-changing POST in that flow, without requiring any DB storage.
 *
 * Cookie options mirror `sid` (same path `/api/oauth`, same SameSite,
 * same HttpOnly, same signed, same `secure` gating on `BASE_URL` scheme).
 *
 * Requirements: 5.10, 5.11, 5.14, 12.6
 */
import {Injectable} from "@nestjs/common";
import {Request as ExpressRequest, Response} from "express";
import * as crypto from "crypto";

import {Environment} from "../config/environment.service";

@Injectable()
export class FlowIdCookieService {
    static readonly COOKIE_NAME = "flow_id";
    /** 15 minutes — long enough for login + consent, short enough to bound replay risk. */
    static readonly TTL_MS = 15 * 60 * 1000;
    /** Scoped to the OAuth endpoints so the cookie never leaks to unrelated paths. */
    static readonly COOKIE_PATH = "/api/oauth";

    constructor(private readonly env: Environment) {
    }

    /**
     * Return the current flow id if the signed `flow_id` cookie is present,
     * otherwise mint a new UUIDv4, set it as a signed cookie with a 15-minute
     * TTL, and return the newly-minted value.
     *
     * Reused on subsequent `/authorize` hits within the same flow to avoid
     * rotating CSRF tokens between login, consent, and session-confirm.
     */
    mintIfAbsent(req: ExpressRequest, res: Response): string {
        const existing = (req as any).signedCookies?.[FlowIdCookieService.COOKIE_NAME];
        if (typeof existing === "string" && existing.length > 0) {
            return existing;
        }
        const flowId = crypto.randomUUID();
        res.cookie(
            FlowIdCookieService.COOKIE_NAME,
            flowId,
            this.cookieOptions(FlowIdCookieService.TTL_MS),
        );
        return flowId;
    }

    /**
     * Clear the `flow_id` cookie. Called on every external-client redirect
     * (success or OAuth error) to terminate the flow's CSRF context.
     */
    clear(res: Response): void {
        res.cookie(
            FlowIdCookieService.COOKIE_NAME,
            "",
            this.cookieOptions(0),
        );
    }

    private cookieOptions(maxAgeMs: number): Record<string, any> {
        return {
            signed: true,
            httpOnly: true,
            secure: String(this.env.get("BASE_URL", "")).startsWith("https"),
            sameSite: "lax" as const,
            path: FlowIdCookieService.COOKIE_PATH,
            maxAge: maxAgeMs,
        };
    }
}
