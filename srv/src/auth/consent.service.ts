import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserConsent } from '../entity/user-consent.entity';
import { ScopeNormalizer } from '../casl/scope-normalizer';

@Injectable()
export class ConsentService {
    constructor(
        @InjectRepository(UserConsent)
        private readonly userConsentRepository: Repository<UserConsent>,
    ) {}

    /**
     * Check if the user has already consented to the requested scopes for this client.
     * Returns { consentRequired: false } if granted_scopes ⊇ requested_scopes.
     * Returns { consentRequired: true, requestedScopes } otherwise.
     */
    async checkConsent(
        userId: string,
        clientId: string,
        requestedScopes: string[],
    ): Promise<{ consentRequired: boolean; requestedScopes?: string[] }> {
        const consent = await this.userConsentRepository.findOne({
            where: { userId, clientId },
        });

        if (!consent) {
            return { consentRequired: true, requestedScopes };
        }

        const grantedScopes = ScopeNormalizer.parse(consent.grantedScopes);
        const requestedSet = new Set(requestedScopes);

        // Check if all requested scopes are in the granted scopes
        const allGranted = Array.from(requestedSet).every(scope =>
            grantedScopes.includes(scope),
        );

        if (allGranted) {
            return { consentRequired: false };
        }

        return { consentRequired: true, requestedScopes };
    }

    /**
     * Create or update the consent record.
     * - If no record exists: create with granted_scopes = approvedScopes, version = 1.
     * - If record exists: granted_scopes = union(existing, approvedScopes), version += 1.
     */
    async grantConsent(
        userId: string,
        clientId: string,
        approvedScopes: string[],
    ): Promise<UserConsent> {
        let consent = await this.userConsentRepository.findOne({
            where: { userId, clientId },
        });

        if (!consent) {
            // Create new consent record
            consent = this.userConsentRepository.create({
                userId,
                clientId,
                grantedScopes: ScopeNormalizer.format(approvedScopes),
                consentVersion: 1,
            });
        } else {
            // Update existing consent record
            const existingScopes = ScopeNormalizer.parse(consent.grantedScopes);
            const mergedScopes = ScopeNormalizer.union(
                existingScopes,
                approvedScopes,
            );
            consent.grantedScopes = ScopeNormalizer.format(mergedScopes);
            consent.consentVersion += 1;
        }

        return this.userConsentRepository.save(consent);
    }

    /**
     * Find the existing consent record for a user-client pair.
     * Returns null if no consent exists.
     */
    async findConsent(
        userId: string,
        clientId: string,
    ): Promise<UserConsent | null> {
        return this.userConsentRepository.findOne({
            where: { userId, clientId },
        });
    }
}
