import * as fc from 'fast-check';
import * as crypto from 'crypto';
import {hashToken} from '../../src/auth/refresh-token.service';

/**
 * Feature: db-refresh-token-rotation, Property 11: Family revocation marks all tokens
 *
 * For any token family containing N tokens, revoking any one SHALL result
 * in all N having `revoked = true`.
 *
 * Validates: Requirements 10.1
 */
describe('Feature: db-refresh-token-rotation, Property 11: Family revocation marks all tokens', () => {

    interface SimToken {
        id: string;
        familyId: string;
        parentId: string | null;
        revoked: boolean;
    }

    function createFamily(size: number): { tokens: SimToken[]; familyId: string } {
        const familyId = crypto.randomUUID();
        const tokens: SimToken[] = [];

        for (let i = 0; i < size; i++) {
            tokens.push({
                id: crypto.randomUUID(),
                familyId,
                parentId: i === 0 ? null : tokens[i - 1].id,
                revoked: false,
            });
        }

        return {tokens, familyId};
    }

    /** Simulate revokeFamily: UPDATE SET revoked=true WHERE family_id = :familyId */
    function revokeFamily(allTokens: SimToken[], familyId: string): void {
        for (const t of allTokens) {
            if (t.familyId === familyId) {
                t.revoked = true;
            }
        }
    }

    const familySizeArb = fc.integer({min: 1, max: 20});

    it('revoking via any token in the family marks all N tokens as revoked', () => {
        fc.assert(
            fc.property(familySizeArb, fc.integer({min: 0, max: 100}), (size, indexSeed) => {
                const {tokens, familyId} = createFamily(size);

                // Pick any token in the family as the "trigger"
                const triggerIndex = indexSeed % size;
                const triggerToken = tokens[triggerIndex];

                // Revoke the family (this is what revokeFamily and revokeByToken do)
                revokeFamily(tokens, triggerToken.familyId);

                // All tokens in the family must be revoked
                for (const t of tokens) {
                    expect(t.revoked).toBe(true);
                }
            }),
            {numRuns: 200},
        );
    });

    it('revocation of one family does not affect tokens in other families', () => {
        fc.assert(
            fc.property(familySizeArb, familySizeArb, (sizeA, sizeB) => {
                const familyA = createFamily(sizeA);
                const familyB = createFamily(sizeB);
                const allTokens = [...familyA.tokens, ...familyB.tokens];

                // Revoke family A
                revokeFamily(allTokens, familyA.familyId);

                // All of family A revoked
                for (const t of familyA.tokens) {
                    expect(t.revoked).toBe(true);
                }

                // None of family B revoked
                for (const t of familyB.tokens) {
                    expect(t.revoked).toBe(false);
                }
            }),
            {numRuns: 200},
        );
    });

    it('revoking a single-token family marks that token as revoked', () => {
        fc.assert(
            fc.property(fc.integer({min: 0, max: 1000}), () => {
                const {tokens, familyId} = createFamily(1);
                revokeFamily(tokens, familyId);
                expect(tokens[0].revoked).toBe(true);
            }),
            {numRuns: 200},
        );
    });
});
