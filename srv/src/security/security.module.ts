import {Module} from '@nestjs/common';
import {SecurityEventLogger} from './security-event-logger.service';

/**
 * SecurityModule provides security-related services for the Auth Server.
 * Currently exports SecurityEventLogger for structured security event logging.
 */
@Module({
    providers: [SecurityEventLogger],
    exports: [SecurityEventLogger],
})
export class SecurityModule {
}
