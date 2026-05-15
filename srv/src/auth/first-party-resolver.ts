import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Client} from '../entity/client.entity';
import {Tenant} from '../entity/tenant.entity';
import {Environment} from '../config/environment.service';

/**
 * Determines if an OAuth flow is "first-party" (i.e., the auth server's own UI).
 *
 * IMPORTANT: First-party means the user is staying within the auth server itself.
 * If the redirect_uri points to an EXTERNAL application, it is ALWAYS third-party
 * and consent MUST be shown — even if the client's alias matches the tenant domain.
 *
 * First-party flow (consent skipped):
 *   - User logs into the auth server admin UI
 *   - redirect_uri points back to the auth server (e.g., http://localhost:4200/oauth/callback)
 *
 * Third-party flow (consent required):
 *   - External app redirects user to auth server for login
 *   - redirect_uri points to the external app (e.g., http://localhost:3000/callback)
 *   - User must explicitly consent to share their data with the external app
 */
@Injectable()
export class FirstPartyResolver {
    constructor(
        @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    ) {}

    /**
     * Check if this is a first-party flow where consent can be skipped.
     *
     * A flow is first-party ONLY when BOTH conditions are met:
     * 1. The client's alias matches its owning tenant's domain (it's the tenant's default client)
     * 2. The redirect_uri points back to the auth server itself (same origin as BASE_URL)
     *
     * If redirect_uri points to an external application, consent is ALWAYS required
     * because the user is authorizing a third-party app to access their data.
     *
     * @param client - The OAuth client
     * @param redirectUri - The redirect_uri from the authorize request
     * @returns true if consent can be skipped (first-party), false if consent is required
     */
    isFirstParty(client: Client, redirectUri: string): boolean {
        try {
            // Step 1: Check if redirect_uri points to the auth server itself
            // If it points elsewhere, it's ALWAYS third-party — consent required
            const baseUrl = Environment.get('BASE_URL', '');
            if (!baseUrl) {
                // No BASE_URL configured — cannot determine first-party status, require consent
                return false;
            }

            const baseOrigin = new URL(baseUrl).origin;
            const redirectOrigin = new URL(redirectUri).origin;

            if (redirectOrigin !== baseOrigin) {
                // redirect_uri points to an external app — ALWAYS third-party
                // User is authorizing an external application, consent is required
                return false;
            }

            // Step 2: redirect_uri points to auth server — check if it's the default client
            // The default client has alias === tenant.domain (created at tenant onboarding)
            const tenant = client.tenant;
            if (!tenant) {
                return false;
            }

            return client.alias === tenant.domain;
        } catch {
            // URL parsing failed or other error — require consent to be safe
            return false;
        }
    }

    /**
     * Check if a client is the tenant's default client (alias matches tenant domain).
     *
     * This is used for tenant resolution logic (e.g., determining if tenant selection
     * is needed for multi-tenant users). It does NOT determine consent requirements.
     *
     * For consent decisions, use isFirstParty() which also checks redirect_uri.
     *
     * @param client - The OAuth client
     * @returns true if client is the tenant's default client
     */
    isDefaultClient(client: Client): boolean {
        const tenant = client.tenant;
        if (!tenant) {
            return false;
        }
        return client.alias === tenant.domain;
    }
}
