module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    globalSetup: './tests/global-setup.ts',
    globalTeardown: './tests/global-teardown.ts',
    setupFiles: ['dotenv/config'],
    testTimeout: 30000,
    collectCoverage: true, // ensures coverage is actually collected
    collectCoverageFrom: [
        "src/**/*.ts",
        '!tests/**/*.ts',  // exclude test files
        '!dist/src/**/*',  // exclude compiled output
    ]
};
