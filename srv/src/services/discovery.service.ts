import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";

/**
 * OIDC Discovery Document metadata as defined by OpenID Connect Discovery 1.0 §4.
 * Contains all required metadata fields for OIDC relying party auto-configuration.
 */
export interface DiscoveryDocument {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    introspection_endpoint: string;
    revocation_endpoint: string;
    scopes_supported: string[];
    response_types_supported: string[];
    grant_types_supported: string[];
    subject_types_supported: string[];
    id_token_signing_alg_values_supported: string[];
    token_endpoint_auth_methods_supported: string[];
}

/**
 * Service for building OIDC Discovery documents.
 * Pure computation service with no dependencies — constructs the metadata JSON
 * from a base URL and tenant domain, and computes a SHA-256 ETag for caching.
 */
@Injectable()
export class DiscoveryService {
    /**
     * Static OIDC metadata values that don't change per request.
     * These represent the Auth Server's supported capabilities.
     */
    private static readonly SCOPES_SUPPORTED = ["openid", "profile", "email"];
    private static readonly RESPONSE_TYPES_SUPPORTED = ["code"];
    private static readonly GRANT_TYPES_SUPPORTED = ["authorization_code", "client_credentials", "refresh_token"];
    private static readonly SUBJECT_TYPES_SUPPORTED = ["public"];
    private static readonly ID_TOKEN_SIGNING_ALG_VALUES_SUPPORTED = ["RS256"];
    private static readonly TOKEN_ENDPOINT_AUTH_METHODS_SUPPORTED = ["client_secret_basic", "client_secret_post"];

    /**
     * Builds the OIDC Discovery document for a given base URL and tenant domain.
     * 
     * @param baseUrl - The base URL derived from request headers (protocol + host)
     * @param tenantDomain - The tenant domain from the URL path parameter
     * @returns An object containing the JSON body and SHA-256 ETag
     */
    buildDocument(baseUrl: string, tenantDomain: string): { body: string; etag: string } {
        const document: DiscoveryDocument = {
            issuer: baseUrl,
            authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
            token_endpoint: `${baseUrl}/api/oauth/token`,
            userinfo_endpoint: `${baseUrl}/api/oauth/userinfo`,
            jwks_uri: `${baseUrl}/${tenantDomain}/.well-known/jwks.json`,
            introspection_endpoint: `${baseUrl}/api/oauth/introspect`,
            revocation_endpoint: `${baseUrl}/api/oauth/revoke`,
            scopes_supported: DiscoveryService.SCOPES_SUPPORTED,
            response_types_supported: DiscoveryService.RESPONSE_TYPES_SUPPORTED,
            grant_types_supported: DiscoveryService.GRANT_TYPES_SUPPORTED,
            subject_types_supported: DiscoveryService.SUBJECT_TYPES_SUPPORTED,
            id_token_signing_alg_values_supported: DiscoveryService.ID_TOKEN_SIGNING_ALG_VALUES_SUPPORTED,
            token_endpoint_auth_methods_supported: DiscoveryService.TOKEN_ENDPOINT_AUTH_METHODS_SUPPORTED,
        };

        const body = JSON.stringify(document);
        const etag = `"${createHash("sha256").update(body).digest("hex")}"`;

        return { body, etag };
    }
}
