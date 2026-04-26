import {HttpErrorResponse} from '@angular/common/http';

export function extractErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
    if (error instanceof HttpErrorResponse) {
        return error.error?.message || error.message || fallback;
    }
    if (error instanceof Error) {
        return error.message || fallback;
    }
    if (typeof error === 'string') {
        return error;
    }
    return fallback;
}
