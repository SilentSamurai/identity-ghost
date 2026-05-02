/**
 * Default test ports. Override via environment variables if needed:
 *   TEST_APP_PORT, TEST_SMTP_PORT, TEST_SMTP_CONTROL_PORT, TEST_WEBHOOK_PORT
 */
export const DEFAULT_TEST_PORTS = {
    app: 9001,
    smtp: 3101,
    smtpControl: 3102,
    webhook: 3103,
};

export interface TestPorts {
    app: number;
    smtp: number;
    smtpControl: number;
    webhook: number;
}

export function getTestPorts(): TestPorts {
    return {
        app: parseInt(process.env.TEST_APP_PORT || '', 10) || DEFAULT_TEST_PORTS.app,
        smtp: parseInt(process.env.TEST_SMTP_PORT || '', 10) || DEFAULT_TEST_PORTS.smtp,
        smtpControl: parseInt(process.env.TEST_SMTP_CONTROL_PORT || '', 10) || DEFAULT_TEST_PORTS.smtpControl,
        webhook: parseInt(process.env.TEST_WEBHOOK_PORT || '', 10) || DEFAULT_TEST_PORTS.webhook,
    };
}
