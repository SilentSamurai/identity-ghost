/**
 * ResourceIndicatorValidator - Pure utility for RFC 8707 resource indicator validation.
 *
 * This class provides static methods for validating resource indicator URIs per RFC 8707:
 * - URI must be absolute (has a scheme component) per RFC 3986 §4.3
 * - URI must not contain a fragment component
 * - URI must be in the client's allowedResources list (exact string match)
 *
 * Note: RFC 8707 §2 requires an absolute URI, not a URL. Valid resource indicators
 * include https URLs (e.g. https://api.example.com) as well as non-URL URIs
 * (e.g. urn:example:api). The only structural requirements are a scheme and no fragment.
 *
 * This is a stateless utility class following the pattern of CryptUtil and ScopeNormalizer.
 */
import {OAuthException} from "../exceptions/oauth-exception";

export class ResourceIndicatorValidator {
    /**
     * Validate that a resource is a well-formed absolute URI with no fragment.
     * Per RFC 8707 Section 2, a resource indicator must be an absolute URI
     * (RFC 3986 §4.3: scheme ":" hier-part [ "?" query ]) that does not
     * include a fragment component.
     *
     * This accepts any URI with a scheme — including http/https URLs and
     * non-URL schemes like urn:, custom-scheme:, etc.
     *
     * @param resource The resource URI string to validate
     * @returns true if valid, false otherwise
     */
    static isValidResourceUri(resource: string): boolean {
        if (!resource || typeof resource !== 'string') {
            return false;
        }

        // Reject URIs with fragment component (RFC 8707 §2: "MUST NOT include a fragment")
        if (resource.includes('#')) {
            return false;
        }

        try {
            const url = new URL(resource);

            // Must have a scheme — the URL constructor rejects strings without one,
            // but guard against edge cases where protocol parses as empty or bare colon.
            if (!url.protocol || url.protocol === ':') {
                return false;
            }

            return true;
        } catch {
            // URL constructor throws for strings that are not valid absolute URIs
            return false;
        }
    }

    /**
     * Validate a resource parameter against a client's allowed resources.
     * Throws OAuthException.invalidTarget() on failure.
     *
     * Checks:
     * 1. resource is an absolute URI (has a scheme, no fragment) per RFC 8707 §2
     * 2. client has allowedResources configured (non-empty)
     * 3. resource exactly matches an entry in allowedResources
     *
     * @param resource The resource URI to validate
     * @param allowedResources The client's allowed resources list (may be null)
     * @throws OAuthException with invalid_target error code on validation failure
     */
    static validateResource(resource: string, allowedResources: string[] | null): void {
        // Check if resource is a valid absolute URI
        if (!this.isValidResourceUri(resource)) {
            throw OAuthException.invalidTarget('The resource parameter must be an absolute URI without a fragment component');
        }

        // Check if client has allowedResources configured
        if (!allowedResources || allowedResources.length === 0) {
            throw OAuthException.invalidTarget('The client is not configured to accept resource indicators');
        }

        // Check exact string match against allowedResources
        if (!allowedResources.includes(resource)) {
            throw OAuthException.invalidTarget('The resource is not in the client\'s allowed resources list');
        }
    }
}
