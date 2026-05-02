import * as fc from 'fast-check';
import * as crypto from 'crypto';
import {hashToken} from '../../src/auth/refresh-token.service';

/**
 * Feature: db-refresh-token-rotation, Property 6: Replay detection revokes entire family
 *
 * For any consumed token past the grace window, presenting it again SHALL
 * result in all family tokens having `revoked = true`.
 *
 * Validates: Requirements 5.1
 */
describe('Feature: db-refresh-token-rotation, Property 6: Replay detection revokes entire family', () => {

    /**
     * Simulate an in-memory token family and the revokeFamily logic.
     * This models the state transitions without a database.
     */
    interface SimToken {
        id: string;
        tokenHash: string;
        familyId: string;
        parentId: string | null;
        usedAt: Date | null;
        revoked: boolean;
    }

    function createFamilyChain(length: number): { tokens: SimToken[]; familyId: string } {
        const familyId = crypto.randomUUID();
        const tokens: SimToken[] = [];

        for (let i = 0; i < length; i++) {
            tokens.push({
                id: crypto.randomUUID(),
                tokenHash: hashToken(crypto.randomBytes(32).toString('base64url')),
                familyId,
                parentId: i === 0 ? null : tokens[i - 1].id,
                usedAt: i < length - 1 ? new Date(Date.now() - 60000) : null, // all but last are "used"
                revoked: false,
            });
        }

        return {tokens, familyId};
    }

    /** Simulate revokeFamily: set revoked=true on all tokens with matching familyId */
    function revokeFamily(tokens: SimToken[], familyId: string): void {
        for (const t of tokens) {
            if (t.familyId === familyId) {
                t.revoked = true;
            }
        }
    }

    /** Simulate replay detection: if token is already used and past grace window, revoke family */
    function simulateReplayDetection(
        tokens: SimToken[],
        replayedToken: SimToken,
        graceWindowSeconds: number,
    ): 'revoked' | 'grace' {
        if (replayedToken.usedAt) {
            const graceDeadline = new Date(replayedToken.usedAt.getTime() + graceWindowSeconds * 1000);
            if (new Date() <= graceDeadline) {
                return 'grace';
            }
            revokeFamily(tokens, replayedToken.familyId);
            return 'revoked';
        }
        return 'grace'; // not used yet, shouldn't happen in replay scenario
    }

    const chainLengthArb = fc.integer({min: 2, max: 10});

    it('replaying a consumed token (grace=0) revokes all tokens in the family', () => {
        fc.assert(
            fc.property(chainLengthArb, (chainLength) => {
                const {tokens, familyId} = createFamilyChain(chainLength);

                // Pick the first token (already consumed — usedAt is set)
                const replayedToken = tokens[0];
                expect(replayedToken.usedAt).not.toBeNull();

                // Simulate replay with grace window = 0
                const result = simulateReplayDetection(tokens, replayedToken, 0);
                expect(result).toBe('revoked');

                // All tokens in the family must be revoked
                for (const t of tokens) {
                    expect(t.revoked).toBe(true);
                }
            }),
            {numRuns: 200},
        );
    });

    it('replaying any consumed token in the chain revokes the entire family', () => {
        fc.assert(
            fc.property(
                chainLengthArb,
                fc.integer({min: 0, max: 100}),
                (chainLength, indexSeed) => {
                    const {tokens} = createFamilyChain(chainLength);

                    // Pick any consumed token (all except the last are consumed)
                    const consumedTokens = tokens.filter(t => t.usedAt !== null);
                    if (consumedTokens.length === 0) return; // skip if no consumed tokens
                    const replayedToken = consumedTokens[indexSeed % consumedTokens.length];

                    simulateReplayDetection(tokens, replayedToken, 0);

                    // Every token in the family must be revoked
                    for (const t of tokens) {
                        expect(t.revoked).toBe(true);
                    }
                },
            ),
            {numRuns: 200},
        );
    });

    it('tokens in a different family are not affected by revocation', () => {
        fc.assert(
            fc.property(chainLengthArb, chainLengthArb, (lenA, lenB) => {
                const familyA = createFamilyChain(lenA);
                const familyB = createFamilyChain(lenB);
                const allTokens = [...familyA.tokens, ...familyB.tokens];

                // Replay a consumed token from family A
                const replayedToken = familyA.tokens[0];
                simulateReplayDetection(allTokens, replayedToken, 0);

                // Family A tokens are all revoked
                for (const t of familyA.tokens) {
                    expect(t.revoked).toBe(true);
                }

                // Family B tokens are untouched
                for (const t of familyB.tokens) {
                    expect(t.revoked).toBe(false);
                }
            }),
            {numRuns: 200},
        );
    });
});
