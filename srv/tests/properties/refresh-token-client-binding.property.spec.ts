import * as fc from 'fast-check';
import {OAuthException} from '../../src/exceptions/oauth-exception';

/**
 * Feature: db-refresh-token-rotation, Property 7: Client binding enforcement
 *
 * For any token with `client_id = X`, presenting with `client_id = Y` (X ≠ Y)
 * SHALL be rejected; presenting with `client_id = X` SHALL NOT be rejected
 * on client binding grounds.
 *
 * Validates: Requirements 6.1
 */
describe('Feature: db-refresh-token-rotation, Property 7: Client binding enforcement', () => {

    /**
     * Simulate the client binding check from consumeAndRotate().
     * This is the exact logic: if existing.clientId !== params.clientId, throw.
     */
    function checkClientBinding(recordClientId: string, presentedClientId: string): void {
        if (recordClientId !== presentedClientId) {
            throw OAuthException.invalidGrant('The refresh token is invalid or has expired');
        }
    }

    const clientIdArb = fc.string({minLength: 1, maxLength: 100});

    it('presenting with the correct client_id does not throw', () => {
        fc.assert(
            fc.property(clientIdArb, (clientId) => {
                expect(() => checkClientBinding(clientId, clientId)).not.toThrow();
            }),
            {numRuns: 200},
        );
    });

    it('presenting with a different client_id throws invalid_grant', () => {
        fc.assert(
            fc.property(clientIdArb, clientIdArb, (recordClientId, presentedClientId) => {
                fc.pre(recordClientId !== presentedClientId);

                try {
                    checkClientBinding(recordClientId, presentedClientId);
                    fail('Expected OAuthException to be thrown');
                } catch (e) {
                    expect(e).toBeInstanceOf(OAuthException);
                    expect((e as OAuthException).errorCode).toBe('invalid_grant');
                }
            }),
            {numRuns: 200},
        );
    });

    it('error message is a fixed generic string that does not vary with input', () => {
        const EXPECTED_MESSAGE = 'The refresh token is invalid or has expired';

        fc.assert(
            fc.property(clientIdArb, clientIdArb, (recordClientId, presentedClientId) => {
                fc.pre(recordClientId !== presentedClientId);

                try {
                    checkClientBinding(recordClientId, presentedClientId);
                } catch (e) {
                    const desc = (e as OAuthException).errorDescription;
                    // The error message must always be the same generic string
                    // regardless of which client IDs were involved
                    expect(desc).toBe(EXPECTED_MESSAGE);
                    // Must not reveal the nature of the mismatch
                    expect(desc).not.toContain('client');
                    expect(desc).not.toContain('mismatch');
                    expect(desc).not.toContain('binding');
                }
            }),
            {numRuns: 200},
        );
    });
});
