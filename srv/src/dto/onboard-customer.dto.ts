import * as yup from 'yup';

/**
 * Request body for POST /api/apps/:appId/onboard-customer
 *
 * Requirements: 4.9
 */
export interface OnboardCustomerDto {
    tenantName: string;
    tenantDomain: string;
    userEmail?: string;
    userName?: string;
}

/**
 * Yup validation schema for OnboardCustomerDto.
 *
 * - tenantName and tenantDomain are always required.
 * - userEmail is optional; when provided, userName becomes required.
 * - userName is optional on its own but required when userEmail is present.
 */
export const OnboardCustomerSchema = yup.object().shape({
    tenantName: yup.string().required('tenantName is required').max(128),
    tenantDomain: yup.string().required('tenantDomain is required').max(128),
    userEmail: yup.string().email('userEmail must be a valid email').max(128).optional(),
    userName: yup.string().max(128).when('userEmail', {
        is: (val: string | undefined) => !!val,
        then: (schema) => schema.required('userName is required when userEmail is provided'),
        otherwise: (schema) => schema.optional(),
    }),
});

/**
 * Response from the onboard-customer endpoint.
 *
 * Requirements: 4.10
 */
export interface OnboardCustomerResponse {
    tenantId: string;
    subscriptionId: string;
    userId?: string;
    roleNames?: string[];
}
