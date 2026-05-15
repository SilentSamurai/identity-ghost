/**
 * Thrown by ClientService.findByClientIdOrAlias when a supplied value matches
 * both a UUID clientId on one Client row AND an alias on a different Client row.
 *
 * This is distinct from NotFoundException so that callers (e.g. AuthorizeService)
 * can surface the correct OAuth error code: `invalid_request` per Req 8.7, rather
 * than `unauthorized_client` which is reserved for unknown client_id values.
 */
export class AmbiguousClientIdException extends Error {
    readonly clientIdValue: string;

    constructor(value: string) {
        super(`Ambiguous client_id: "${value}" matches both a clientId UUID and an alias on different Client rows`);
        this.name = 'AmbiguousClientIdException';
        this.clientIdValue = value;
    }
}
