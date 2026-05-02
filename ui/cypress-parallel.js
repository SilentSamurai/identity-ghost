/**
 * Parallel Cypress Test Runner
 *
 * Discovers all *.cy.ts specs in cypress/e2e/ and runs them in parallel
 * using a worker pool. Each worker picks up the next available spec as
 * soon as it finishes the current one — no batch waiting.
 *
 * Concurrency is auto-calculated from available CPU cores and free memory,
 * reserving resources for the backend, frontend, database, and SMTP servers.
 * Override with: CYPRESS_PARALLEL=N node cypress-parallel.js
 */
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// --- Resource-aware concurrency calculation ---

const RESERVED_CORES = 4;          // cores reserved for: NestJS backend, Angular dev server, PostgreSQL, fake SMTP
const THREADS_PER_INSTANCE = 6;    // each Cypress instance spawns a browser + Node process (~6 threads total)
const MEM_PER_INSTANCE_MB = 2048;   // ~2GB per Cypress browser instance (measured)
const RESERVED_MEM_MB = 4096;      // memory reserved for backend services (~2GB)

const cpuBased = Math.max(1, Math.floor((os.cpus().length - RESERVED_CORES) / THREADS_PER_INSTANCE));
const freeMem = Math.max(0, (os.freemem() / (1024 * 1024)) - RESERVED_MEM_MB);
const memBased = Math.max(1, Math.floor(freeMem / MEM_PER_INSTANCE_MB));
const auto = Math.min(cpuBased, memBased);

// Use env override if set, otherwise use the auto-calculated value
const CONCURRENCY = parseInt(process.env.CYPRESS_PARALLEL, 10) || auto;

// --- Discover spec files ---

const specDir = path.join(__dirname, 'cypress', 'e2e');
const specs = fs.readdirSync(specDir)
    .filter(f => f.endsWith('.cy.ts'))
    .map(f => path.join('cypress', 'e2e', f));

console.log(`Found ${specs.length} specs, running ${CONCURRENCY} at a time\n`);

// --- Runner state ---

let index = 0;
let passed = 0;
let failed = [];

/**
 * Runs a single Cypress spec file and reports pass/fail with elapsed time.
 */
function runSpec(spec, attempt) {
    const name = path.basename(spec);
    const label = attempt > 1 ? `${name} (retry #${attempt - 1})` : name;
    console.log(`  ▶ ${label}`);
    return new Promise((resolve) => {
        const start = Date.now();
        const child = spawn('npx', ['cypress', 'run', '--spec', spec], {
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

const MAX_RETRIES = 2; // retry failed specs up to 2 times

/**
 * Worker loop: grabs the next spec from the queue and runs it.
 * Retries transient failures up to MAX_RETRIES times.
 */
function worker() {
    if (index >= specs.length) return Promise.resolve();
    const spec = specs[index++];
    return (async () => {
        let result;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            result = await runSpec(spec, attempt);
            if (result.code === 0) break;
            if (attempt < MAX_RETRIES) {
                console.log(`  ↻ Retrying ${result.name} (attempt ${attempt + 1}/${MAX_RETRIES})...`);
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
