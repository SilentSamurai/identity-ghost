import {Injectable, Logger} from '@nestjs/common';

/**
 * SecurityEventLogger provides structured logging for security-relevant events.
 * Each method accepts only the fields relevant to that event type, preventing
 * accidental inclusion of sensitive data.
 *
 * All methods log structured JSON with `event` and `timestamp` fields.
 * - loginFailure, loginLockedAccount, refreshTokenReplayDetected use `warn` level
 * - tokenIssued uses `log` (info) level
 */
@Injectable()
export class SecurityEventLogger {
    private readonly logger = new Logger('SecurityEvent');

    /**
     * Log a failed login attempt due to invalid credentials.
     * Requirements: 3.1, 3.3
     */
    loginFailure(params: { email: string; clientId: string; sourceIp: string }): void {
        this.logger.warn({
            event: 'login_failure',
            timestamp: new Date().toISOString(),
            email: params.email,
            client_id: params.clientId,
            source_ip: params.sourceIp,
        });
    }

    /**
     * Log a failed login attempt due to a locked account.
     * Requirements: 3.2, 3.3
     */
    loginLockedAccount(params: { email: string; clientId: string; sourceIp: string }): void {
        this.logger.warn({
            event: 'login_locked_account',
            timestamp: new Date().toISOString(),
            email: params.email,
            client_id: params.clientId,
            source_ip: params.sourceIp,
        });
    }

    /**
     * Log a successful token issuance event.
     * Requirements: 4.1, 4.2, 4.3
     */
    tokenIssued(params: {
        grantType: string;
        clientId: string;
        tenantId: string;
        scope: string;
        userId?: string;
    }): void {
        const logEntry: Record<string, unknown> = {
            event: 'token_issued',
            timestamp: new Date().toISOString(),
            grant_type: params.grantType,
            client_id: params.clientId,
            tenant_id: params.tenantId,
            scope: params.scope,
        };

        if (params.userId !== undefined) {
            logEntry.user_id = params.userId;
        }

        this.logger.log(logEntry);
    }

    /**
     * Log a refresh token replay detection event.
     * Requirements: 2.1, 2.2, 2.3
     */
    refreshTokenReplayDetected(params: {
        familyId: string;
        clientId: string;
        userId: string;
        tenantId: string;
    }): void {
        this.logger.warn({
            event: 'refresh_token_replay_detected',
            timestamp: new Date().toISOString(),
            family_id: params.familyId,
            client_id: params.clientId,
            user_id: params.userId,
            tenant_id: params.tenantId,
        });
    }

    /**
     * Log a refresh token eligibility decision.
     * Uses `log` (info) level for granted decisions, `warn` level for denied decisions.
     * Requirements: 8.1, 8.2, 8.3
     */
    refreshTokenDecision(params: {
        grantType: string;
        clientId: string;
        tenantId: string;
        userId?: string;
        decision: 'granted' | 'denied';
        reason: 'offline_access_scope' | 'client_allow_refresh_token' | 'refresh_token_not_eligible';
    }): void {
        const logEntry: Record<string, unknown> = {
            event: 'refresh_token_decision',
            timestamp: new Date().toISOString(),
            grant_type: params.grantType,
            client_id: params.clientId,
            tenant_id: params.tenantId,
            decision: params.decision,
            reason: params.reason,
        };

        if (params.userId !== undefined) {
            logEntry.user_id = params.userId;
        }

        if (params.decision === 'granted') {
            this.logger.log(logEntry);
        } else {
            this.logger.warn(logEntry);
        }
    }
}
