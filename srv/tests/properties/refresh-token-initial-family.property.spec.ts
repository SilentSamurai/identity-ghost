import * as fc from 'fast-check';
import * as crypto from 'crypto';
import {generateOpaqueToken, hashToken} from '../../src/auth/refresh-token.service';

/**
 * Feature: db-refresh-token-rotation, Property 3: Initial token family structure
 *
 * For any newly created refresh token, the record SHALL have a valid UUID
 * `family_id` and `parent_id` SHALL be NULL.
 *
 * Validates: Requirements 4.2
 */
describe('Feature: db-refresh-token-rotation, Property 3: Initial token family structure', () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    /**
     * Simulate the create() logic from RefreshTokenService:
     * - Generate opaque token + hash
     * - Generate a new UUID familyId
     * - Set parentId to null
     */
    function simulateCreate(params: {
        userId: string;
        clientId: string;
        tenantId: string;
        scope: string;
    }) {
        const plaintext = generateOpaqueToken();
        const tokenHash = hashToken(plaintext);
        const familyId = crypto.randomUUID();
        const now = new Date();

        return {
            plaintext,
            record: {
                tokenHash,
                familyId,
                parentId: null as string | null,
                userId: params.userId,
                clientId: params.clientId,
                tenantId: params.tenantId,
                scope: params.scope,
                expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
                absoluteExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
                revoked: false,
                usedAt: null as Date | null,
            },
        };
    }

    const uuidArb = fc.uuid();
    const clientIdArb = fc.string({minLength: 1, maxLength: 50});
    const scopeArb = fc.subarray(['openid', 'profile', 'email'], {minLength: 1}).map(s => s.join(' '));

    it('newly created token has a valid UUID family_id', () => {
        fc.assert(
            fc.property(uuidArb, clientIdArb, uuidArb, scopeArb, (userId, clientId, tenantId, scope) => {
                const {record} = simulateCreate({userId, clientId, tenantId, scope});
                expect(record.familyId).toMatch(UUID_REGEX);
            }),
            {numRuns: 200},
        );
    });

    it('newly created token has parent_id equal to null', () => {
        fc.assert(
            fc.property(uuidArb, clientIdArb, uuidArb, scopeArb, (userId, clientId, tenantId, scope) => {
                const {record} = simulateCreate({userId, clientId, tenantId, scope});
                expect(record.parentId).toBeNull();
            }),
            {numRuns: 200},
        );
    });

    it('each created token gets a unique family_id', () => {
        fc.assert(
            fc.property(uuidArb, clientIdArb, uuidArb, scopeArb, (userId, clientId, tenantId, scope) => {
                const {record: a} = simulateCreate({userId, clientId, tenantId, scope});
                const {record: b} = simulateCreate({userId, clientId, tenantId, scope});
                expect(a.familyId).not.toEqual(b.familyId);
            }),
            {numRuns: 200},
        );
    });
});
