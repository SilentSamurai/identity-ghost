import {ForbiddenException, Injectable} from "@nestjs/common";
import * as crypto from "crypto";
import {Environment} from "../config/environment.service";

/**
 * Stateless CSRF token service.
 *
 * The token is a hex-encoded HMAC-SHA256 of the signed `flow_id` cookie,
 * keyed by the process-wide `COOKIE_SECRET`. Because `flow_id` is stable
 * for the lifetime of an OAuth flow, the CSRF token is the same value
 * across every `/authorize` UI redirect and every POST in one flow — no
 * DB storage, no rotation, no single-use semantics.
 *
 * Validation is performed via `crypto.timingSafeEqual` on byte-equal
 * buffers to avoid leaking timing information.
 */
@Injectable()
export class CsrfTokenService {
    constructor(private readonly environment: Environment) {
    }

    /**
     * Compute the CSRF token for a given `flow_id`.
     *
     * @param flowId - The value of the signed `flow_id` cookie.
     * @returns hex-encoded HMAC-SHA256(COOKIE_SECRET, flowId).
     */
    computeFromFlowId(flowId: string): string {
        const secret = this.environment.get(
            "COOKIE_SECRET",
            "dev-cookie-secret-do-not-use-in-prod",
        );
        return crypto
            .createHmac("sha256", secret)
            .update(flowId)
            .digest("hex");
    }

    /**
     * Validate a `csrf_token` value submitted in a request body against the
     * signed `flow_id` cookie on the same request.
     *
     * Throws {@link ForbiddenException} if the cookie is missing, the token
     * is missing, the token length does not match the expected HMAC length,
     * or the timing-safe comparison fails.
     *
     * @param signedFlowIdCookie - Value of `req.signedCookies.flow_id`.
     * @param tokenFromBody - Value of `csrf_token` from the request body.
     */
    verifyOrThrow(
        signedFlowIdCookie: string | undefined,
        tokenFromBody: string | undefined,
    ): void {
        if (!signedFlowIdCookie) {
            throw new ForbiddenException("Missing flow context");
        }
        if (!tokenFromBody) {
            throw new ForbiddenException("Missing csrf_token");
        }

        const expected = this.computeFromFlowId(signedFlowIdCookie);

        if (tokenFromBody.length !== expected.length) {
            throw new ForbiddenException("Invalid csrf_token");
        }

        let equal = false;
        try {
            equal = crypto.timingSafeEqual(
                Buffer.from(tokenFromBody, "hex"),
                Buffer.from(expected, "hex"),
            );
        } catch {
            throw new ForbiddenException("Invalid csrf_token");
        }

        if (!equal) {
            throw new ForbiddenException("Invalid csrf_token");
        }
    }
}
