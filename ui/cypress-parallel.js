/**
 * Parallel Cypress Test Runner
 *
 * Discovers all *.cy.ts specs in cypress/e2e/ and runs them in parallel
 * using a worker pool. Each worker picks up the next available spec as
 * soon as it finishes the current one — no batch waiting.
 *
 * Concurrency is 2 specs per CPU core, capped by available memory.
 * Override with: CYPRESS_PARALLEL=N node cypress-parallel.js
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// --- Resource-aware concurrency calculation ---

const TESTS_PER_CORE = 1;          // target concurrent Cypress instances per CPU core
const MEM_PER_INSTANCE_MB = 1024;   // ~1GB per Cypress browser instance (measured)
const RESERVED_MEM_MB = 6144;      // memory reserved for backend services + OS headroom
const MAX_CONCURRENCY = 6;         // hard cap — beyond this, resource contention causes flakiness

const cpuBased = Math.max(1, os.cpus().length * TESTS_PER_CORE);
const freeMem = Math.max(0, (os.freemem() / (1024 * 1024)) - RESERVED_MEM_MB);
const memBased = Math.max(1, Math.floor(freeMem / MEM_PER_INSTANCE_MB));
const auto = Math.min(cpuBased, memBased, MAX_CONCURRENCY);

// Use env override if set, otherwise use the auto-calculated value
const CONCURRENCY = parseInt(process.env.CYPRESS_PARALLEL, 10) || auto;

// --- Discover spec files ---
// Single-spec mode: pass spec path as CLI arg or via CYPRESS_SPEC env var.
// Usage: node cypress-parallel.js cypress/e2e/some.cy.ts
//        CYPRESS_SPEC=cypress/e2e/some.cy.ts node cypress-parallel.js

const singleSpec = process.argv[2] || process.env.CYPRESS_SPEC || null;

const specDir = path.join(__dirname, 'cypress', 'e2e');
const specs = singleSpec
    ? [singleSpec]
    : fs.readdirSync(specDir)
          .filter(f => f.endsWith('.cy.ts'))
          .map(f => path.join('cypress', 'e2e', f));

// --- Screenshot folder management ---
// Clean screenshots once at startup, then preserve during parallel runs
const screenshotsDir = path.join(__dirname, 'cypress', 'screenshots');

function cleanScreenshotsFolder() {
    if (fs.existsSync(screenshotsDir)) {
        fs.rmSync(screenshotsDir, { recursive: true, force: true });
        console.log('Cleaned screenshots folder\n');
    }
}

// Always clean at startup, before any tests run
cleanScreenshotsFolder();

if (singleSpec) {
    console.log(`Running single spec: ${singleSpec}\n`);
} else {
    console.log(`Found ${specs.length} specs, running ${CONCURRENCY} at a time\n`);
}

// --- Runner state ---

let index = 0;
let passed = 0;
let failed = [];

/**
 * Runs a single Cypress spec file and reports pass/fail with elapsed time.
 * trashAssetsBeforeRuns=false prevents Cypress from deleting screenshots between specs.
 */
function runSpec(spec, attempt) {
    const name = path.basename(spec);
    const label = attempt > 1 ? `${name} (retry #${attempt - 1})` : name;
    console.log(`  ▶ ${label}`);
    return new Promise((resolve) => {
        const start = Date.now();
        const child = spawn('npx', [
            'cypress', 'run',
            '--spec', spec,
            '--config', 'trashAssetsBeforeRuns=false'
        ], {
            cwd: __dirname,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Capture output for potential debugging (not printed unless needed)
        let output = '';
        child.stdout.on('data', (d) => output += d);
        child.stderr.on('data', (d) => output += d);

        child.on('close', (code) => {
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            if (code === 0) {
                passed++;
                console.log(`  ✓ ${label} (${elapsed}s)`);
            } else {
                console.log(`  ✗ ${label} (${elapsed}s)`);
            }
            resolve({ code, name, output, spec });
        });
    });
}

// Retries only enabled when running the full suite, not for single spec runs
// MAX_ATTEMPTS = 1 means run once (no retry), 2 means run up to twice (1 retry)
const MAX_ATTEMPTS = singleSpec ? 1 : 2;

/**
 * Worker loop: grabs the next spec from the queue and runs it.
 * Retries transient failures (disabled for single spec runs).
 */
function worker() {
    if (index >= specs.length) return Promise.resolve();
    const spec = specs[index++];
    return (async () => {
        let result;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            result = await runSpec(spec, attempt);
            if (result.code === 0) break;
            if (attempt < MAX_ATTEMPTS) {
                console.log(`  ↻ Retrying ${result.name} (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
            }
        }
        if (result.code !== 0) {
            failed.push({ name: result.name, output: result.output });
        }
        return worker();
    })();
}

/**
 * Main entry: spawns N workers and waits for all specs to complete.
 */
async function run() {
    const startTime = Date.now();
    console.log(`Started at ${new Date(startTime).toLocaleTimeString()}\n`);

    // Spawn CONCURRENCY workers — each runs specs back-to-back
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    // Summary
    const elapsed = Date.now() - startTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = ((elapsed % 60000) / 1000).toFixed(1);
    console.log(`\n${passed} passed, ${failed.length} failed — total time: ${mins}m ${secs}s`);
    if (failed.length > 0) {
        console.log('\nFailed specs:');
        failed.forEach(f => {
            console.log(`\n  ✗ ${f.name}`);
            // Print last 30 lines of output for debugging
            const lines = f.output.split('\n').filter(l => l.trim());
            const tail = lines.slice(-30).join('\n');
            console.log(tail);
        });
        process.exit(1);
    }
}

run();
