import {Injectable} from '@angular/core';
import {
    HTTP_INTERCEPTORS,
    HttpErrorResponse,
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpRequest
} from '@angular/common/http';
import {catchError, Observable, throwError} from 'rxjs';
import {MessageService} from 'primeng/api';

@Injectable()
export class HttpErrorInterceptor implements HttpInterceptor {
    constructor(
        private messageService: MessageService,
    ) {
    }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return next.handle(req).pipe(
            catchError((error: HttpErrorResponse) => {
                if (error.status >= 500) {
                    const message = error.error?.message || 'A server error occurred. Please try again later.';
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Server Error',
                        detail: message,
                    });
                }
                return throwError(() => error);
            })
        );
    }
}

export const httpErrorInterceptorProviders = [
    {provide: HTTP_INTERCEPTORS, useClass: HttpErrorInterceptor, multi: true},
];
