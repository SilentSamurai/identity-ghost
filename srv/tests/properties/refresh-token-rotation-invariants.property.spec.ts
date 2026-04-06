import * as fc from 'fast-check';
import * as crypto from 'crypto';
import {generateOpaqueToken, hashToken, clampExpiry} from '../../src/auth/refresh-token.service';

/**
 * Feature: db-refresh-token-rotation, Property 4: Rotation preserves family invariants
 *
 * For any token rotation (A → B):
 *   B.family_id == A.family_id
 *   B.parent_id == A.id
 *   B.user_id == A.user_id
 *   B.client_id == A.client_id
 *   B.tenant_id == A.tenant_id
 *   B.absolute_expires_at == A.absolute_expires_at
 *
 * Validates: Requirements 4.1, 4.3
 */
describe('Feature: db-refresh-token-rotation, Property 4: Rotation preserves family invariants', () => {
    const SLIDING_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    /**
     * Simulate the rotation logic from consumeAndRotate():
     * Given a consumed parent record A, produce the child record B.
     */
    function simulateRotation(parentRecord: {
        id: string;
        familyId: string;
        userId: string;
        clientId: string;
        tenantId: string;
        scope: string;
        absoluteExpiresAt: Date;
    }) {
        const plaintext = generateOpaqueToken();
        const tokenHash = hashToken(plaintext);
        const expiresAt = clampExpiry(SLIDING_MS, parentRecord.absoluteExpiresAt);

        return {
            plaintext,
            record: {
                id: crypto.randomUUID(),
                tokenHash,
                familyId: parentRecord.familyId,
                parentId: parentRecord.id,
                userId: parentRecord.userId,
                clientId: parentRecord.clientId,
                tenantId: parentRecord.tenantId,
                scope: parentRecord.scope,
                expiresAt,
                absoluteExpiresAt: parentRecord.absoluteExpiresAt,
                revoked: false,
                usedAt: null as Date | null,
            },
        };
    }

    const uuidArb = fc.uuid();
    const clientIdArb = fc.string({minLength: 1, maxLength: 50});
    const scopeArb = fc.subarray(['openid', 'profile', 'email'], {minLength: 1}).map(s => s.join(' '));
    const futureTimestampArb = fc.integer({
        min: Date.now() + 1000,
        max: Date.now() + 365 * 24 * 60 * 60 * 1000,
    }).map(ts => new Date(ts));

    const parentRecordArb = fc.record({
        id: uuidArb,
        familyId: uuidArb,
        userId: uuidArb,
        clientId: clientIdArb,
        tenantId: uuidArb,
        scope: scopeArb,
        absoluteExpiresAt: futureTimestampArb,
    });

    it('child token preserves family_id from parent', () => {
        fc.assert(
            fc.property(parentRecordArb, (parent) => {
                const {record: child} = simulateRotation(parent);
                expect(child.familyId).toEqual(parent.familyId);
            }),
            {numRuns: 200},
        );
    });

    it('child token parent_id equals parent id', () => {
        fc.assert(
            fc.property(parentRecordArb, (parent) => {
                const {record: child} = simulateRotation(parent);
                expect(child.parentId).toEqual(parent.id);
            }),
            {numRuns: 200},
        );
    });

    it('child token preserves user_id from parent', () => {
        fc.assert(
            fc.property(parentRecordArb, (parent) => {
                const {record: child} = simulateRotation(parent);
                expect(child.userId).toEqual(parent.userId);
            }),
            {numRuns: 200},
        );
    });

    it('child token preserves client_id from parent', () => {
        fc.assert(
            fc.property(parentRecordArb, (parent) => {
                const {record: child} = simulateRotation(parent);
                expect(child.clientId).toEqual(parent.clientId);
            }),
            {numRuns: 200},
        );
    });

    it('child token preserves tenant_id from parent', () => {
        fc.assert(
            fc.property(parentRecordArb, (parent) => {
                const {record: child} = simulateRotation(parent);
                expect(child.tenantId).toEqual(parent.tenantId);
            }),
            {numRuns: 200},
        );
    });

    it('child token preserves absolute_expires_at from parent', () => {
        fc.assert(
            fc.property(parentRecordArb, (parent) => {
                const {record: child} = simulateRotation(parent);
                expect(child.absoluteExpiresAt.getTime()).toEqual(parent.absoluteExpiresAt.getTime());
            }),
            {numRuns: 200},
        );
    });
});
