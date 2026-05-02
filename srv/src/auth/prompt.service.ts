import {Injectable} from '@nestjs/common';
import {OAuthException} from '../exceptions/oauth-exception';
import {LoginSession} from '../entity/login-session.entity';

/**
 * Actions that can result from prompt/max_age evaluation.
 */
export enum PromptAction {
    /** Normal flow, no special handling needed */
    PROCEED = 'PROCEED',
    /** Invalidate sessions, require fresh authentication */
    FORCE_LOGIN = 'FORCE_LOGIN',
    /** Always show consent screen */
    FORCE_CONSENT = 'FORCE_CONSENT',
    /** Silent auth: issue code from existing session */
    ISSUE_CODE = 'ISSUE_CODE',
}

/**
 * Result of prompt/max_age evaluation.
 */
export interface PromptEvaluation {
    /** The action the caller should take */
    action: PromptAction;
    /** Whether auth_time must appear in the ID token */
    requireAuthTime: boolean;
    /** OIDC error code (login_required, consent_required, etc.) */
    error?: string;
    /** Human-readable error description */
    errorDescription?: string;
}

/**
 * Context for prompt/max_age evaluation.
 */
export interface PromptContext {
    /** Parsed prompt values (e.g., ['login', 'consent']) */
    promptValues: string[];
    /** max_age parameter value */
    maxAge?: number;
    /** Existing session for the user+tenant */
    session?: LoginSession | null;
    /** Whether consent already exists for the requested scopes */
    consentGranted?: boolean;
}

/**
 * Recognized prompt values per OIDC Core §3.1.2.1.
 */
const RECOGNIZED_PROMPT_VALUES = ['none', 'login', 'consent', 'select_account'];

/**
 * Centralizes all prompt and max_age decision logic.
 * Pure business logic — no HTTP concerns.
 */
@Injectable()
export class PromptService {
    /**
     * Parse the prompt parameter from a space-delimited string into an array.
     * Returns empty array if prompt is undefined/null.
     * Filters to recognized values and removes duplicates while preserving order.
     *
     * @param prompt - Space-delimited prompt string (e.g., "login consent")
     * @returns Array of recognized prompt values
     */
    parsePrompt(prompt?: string): string[] {
        if (!prompt) {
            return [];
        }

        const values = prompt.split(' ').filter(v => v.length > 0);
        const seen = new Set<string>();
        const result: string[] = [];

        for (const value of values) {
            // Only include recognized values per OIDC Core §3.1.2.1
            if (RECOGNIZED_PROMPT_VALUES.includes(value) && !seen.has(value)) {
                seen.add(value);
                result.push(value);
            }
        }

        return result;
    }

    /**
     * Validate the parsed prompt values.
     * Throws OAuthException.invalidRequest if 'none' appears with other values.
     * Per OIDC Core §3.1.2.1, 'none' is mutually exclusive with all other prompt values.
     *
     * @param values - Parsed prompt values
     * @throws OAuthException if 'none' is combined with other values
     */
    validatePrompt(values: string[]): void {
        if (values.includes('none') && values.length > 1) {
            throw OAuthException.invalidRequest(
                'prompt=none must not be combined with other values',
            );
        }
    }

    /**
     * Check if a session is fresh enough for the given max_age.
     * Returns true if (now - session.authTime) <= maxAge.
     *
     * @param session - The login session to check
     * @param maxAge - Maximum allowable elapsed time in seconds
     * @returns true if the session is fresh, false otherwise
     */
    isSessionFresh(session: LoginSession, maxAge: number): boolean {
        const now = Math.floor(Date.now() / 1000);
        return (now - session.authTime) <= maxAge;
    }

    /**
     * Main evaluation method. Determines what action the caller should take
     * based on prompt values, max_age, session state, and consent state.
     *
     * Evaluation logic:
     * 1. If prompt contains 'none':
     *    - No valid session → login_required error
     *    - max_age present and session not fresh → login_required error
     *    - Consent required and not granted → consent_required error
     *    - Otherwise → ISSUE_CODE with requireAuthTime based on max_age presence
     *
     * 2. If prompt contains 'consent':
     *    - FORCE_CONSENT with requireAuthTime based on login/max_age
     *
     * 3. If prompt contains 'login' OR max_age=0:
     *    - FORCE_LOGIN with requireAuthTime=true
     *
     * 4. If max_age present (non-zero) and session exists but not fresh:
     *    - FORCE_LOGIN with requireAuthTime=true
     *
     * 5. Default:
     *    - PROCEED with requireAuthTime based on max_age presence
     *
     * @param context - The evaluation context
     * @returns The evaluation result
     */
    evaluate(context: PromptContext): PromptEvaluation {
        const {promptValues, maxAge, session, consentGranted} = context;

        // 1. Handle prompt=none (silent authentication)
        if (promptValues.includes('none')) {
            // No valid session → login_required
            if (!session) {
                return {
                    action: PromptAction.ISSUE_CODE, // Will be treated as error by caller
                    requireAuthTime: false,
                    error: 'login_required',
                    errorDescription: 'User authentication is required but prompt=none was requested',
                };
            }

            // max_age present and session not fresh → login_required
            if (maxAge !== undefined && maxAge > 0 && !this.isSessionFresh(session, maxAge)) {
                return {
                    action: PromptAction.ISSUE_CODE, // Will be treated as error by caller
                    requireAuthTime: false,
                    error: 'login_required',
                    errorDescription: 'User authentication is required but prompt=none was requested',
                };
            }

            // Consent required and not granted → consent_required
            if (consentGranted === false) {
                return {
                    action: PromptAction.ISSUE_CODE, // Will be treated as error by caller
                    requireAuthTime: false,
                    error: 'consent_required',
                    errorDescription: 'User consent is required but prompt=none was requested',
                };
            }

            // All checks passed → issue code from existing session
            return {
                action: PromptAction.ISSUE_CODE,
                requireAuthTime: maxAge !== undefined,
            };
        }

        // 2. prompt=consent → FORCE_CONSENT (checked before login so both can be handled)
        if (promptValues.includes('consent')) {
            return {
                action: PromptAction.FORCE_CONSENT,
                requireAuthTime: promptValues.includes('login') || maxAge !== undefined,
            };
        }

        // 3. prompt=login OR max_age=0 → FORCE_LOGIN
        if (promptValues.includes('login') || maxAge === 0) {
            return {
                action: PromptAction.FORCE_LOGIN,
                requireAuthTime: true,
            };
        }

        // 4. max_age present (non-zero) and session exists but not fresh → FORCE_LOGIN
        if (maxAge !== undefined && maxAge > 0 && session && !this.isSessionFresh(session, maxAge)) {
            return {
                action: PromptAction.FORCE_LOGIN,
                requireAuthTime: true,
            };
        }

        // 5. Default → PROCEED
        return {
            action: PromptAction.PROCEED,
            requireAuthTime: maxAge !== undefined,
        };
    }
}
