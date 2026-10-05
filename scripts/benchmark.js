#!/usr/bin/env node
/**
 * scripts/benchmark.js
 *
 * Autocannon-based benchmark runner.
 *
 * Usage:
 *   node scripts/benchmark.js [scenario] [--connections N] [--duration S]
 *
 * Scenarios:
 *   health          GET /health
 *   users-10        GET /api/users?limit=10
 *   users-100       GET /api/users?limit=100
 *   users-1000      GET /api/users?limit=1000
 *   users-paginate  GET /api/users?limit=100&offset=10000
 *   user-single     GET /api/users/1
 *   stats           GET /api/stats
 *   all             Run every scenario above in sequence
 *
 * Environment variables (overrides .env):
 *   BENCH_URL         Base URL              (default: http://localhost:3000)
 *   BENCH_DURATION    Seconds per run       (default: 30)
 *   BENCH_PIPELINING  HTTP pipelining       (default: 1)
 *
 * RPS presets (passed as --connections):
 *   ~1K RPS   → 10 connections
 *   ~5K RPS   → 50 connections
 *   ~10K RPS  → 100 connections
 *   ~25K RPS  → 250 connections
 *   ~50K RPS  → 500 connections
 *   ~75K RPS  → 750 connections
 *   ~100K RPS → 1000 connections
 *
 * Example — target 10K RPS on /health for 60 seconds:
 *   node scripts/benchmark.js health --connections 100 --duration 60
 */

import 'dotenv/config';
import autocannon from 'autocannon';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ─────────────────────────────────────────────────────────────
//  Config from env / CLI args
// ─────────────────────────────────────────────────────────────
const BASE_URL     = process.env.BENCH_URL         ?? 'http://localhost:3000';
const DURATION     = parseInt(process.env.BENCH_DURATION    ?? '30',  10);
const PIPELINING   = parseInt(process.env.BENCH_PIPELINING  ?? '1',   10);

// Parse --connections and --duration from CLI
const args = process.argv.slice(2);
const scenarioArg = args.find(a => !a.startsWith('--')) ?? 'all';

function getFlag(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? parseInt(args[idx + 1], 10) : fallback;
}

const CONNECTIONS = getFlag('connections', 100);  // ~10K RPS baseline
const DURATION_S  = getFlag('duration',   DURATION);

// ─────────────────────────────────────────────────────────────
//  Scenario definitions
// ─────────────────────────────────────────────────────────────
const SCENARIOS = {
  'health':         `${BASE_URL}/health`,
  'users-10':       `${BASE_URL}/api/users?limit=10`,
  'users-100':      `${BASE_URL}/api/users?limit=100`,
  'users-1000':     `${BASE_URL}/api/users?limit=1000`,
  'users-paginate': `${BASE_URL}/api/users?limit=100&offset=10000`,
  'user-single':    `${BASE_URL}/api/users/1`,
  'stats':          `${BASE_URL}/api/stats`,
};

// ─────────────────────────────────────────────────────────────
//  RPS target → connections mapping (quick reference)
// ─────────────────────────────────────────────────────────────
const RPS_PRESETS = {
  '1K':   10,
  '5K':   50,
  '10K':  100,
  '25K':  250,
  '50K':  500,
  '75K':  750,
  '100K': 1000,
};

// ─────────────────────────────────────────────────────────────
//  Run one scenario
// ─────────────────────────────────────────────────────────────
function runBenchmark(name, url, connections, durationSec) {
  return new Promise((resolve, reject) => {
    console.log('\n' + '═'.repeat(70));
    console.log(`  Scenario : ${name}`);
    console.log(`  URL      : ${url}`);
    console.log(`  Conns    : ${connections}  |  Duration: ${durationSec}s  |  Pipeline: ${PIPELINING}`);
    console.log('═'.repeat(70));

    const inst = autocannon(
      {
        url,
        connections,
        duration:    durationSec,
        pipelining:  PIPELINING,
        headers:     { 'accept': 'application/json' },
        // Print a live progress bar
        renderStatusLine: false,
      },
      (err, result) => {
        if (err) return reject(err);
        printResult(name, result);
        resolve(result);
      },
    );

    autocannon.track(inst, { renderProgressBar: true });
  });
}

// ─────────────────────────────────────────────────────────────
//  Pretty-print results
// ─────────────────────────────────────────────────────────────
function printResult(name, r) {
  const lat = r.latency;
  const req = r.requests;
  const thr = r.throughput;

  console.log(`\n📊  Results for: ${name}`);
  console.log('─'.repeat(70));
  console.log(`  Requests/sec   : ${req.mean.toFixed(0).padStart(10)}  (p2.5=${req.p2_5}  p97.5=${req.p97_5})`);
  console.log(`  Throughput/sec : ${formatBytes(thr.mean).padStart(10)}`);
  console.log(`  Latency (ms)   :`);
  console.log(`    avg  : ${lat.mean.toFixed(2)}`);
  console.log(`    p50  : ${lat.p50}`);
  console.log(`    p95  : ${lat.p95}`);
  console.log(`    p99  : ${lat.p99}`);
  console.log(`    max  : ${lat.max}`);
  console.log(`  Errors         : ${r.errors}  |  Timeouts: ${r.timeouts}`);
  console.log(`  Total requests : ${r.requests.total.toLocaleString()}`);
  console.log(`  Duration       : ${r.duration}s`);
  console.log('─'.repeat(70));

  // Warn if error rate is high
  if (r.errors > 0 || r.timeouts > 0) {
    const total = r.requests.total || 1;
    const errorPct = (((r.errors + r.timeouts) / total) * 100).toFixed(2);
    console.warn(`  ⚠️  Error rate: ${errorPct}%  — check pool size or server capacity`);
  }
}

function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB/s`;
  if (bytes >= 1_000)     return `${(bytes / 1_000).toFixed(2)} KB/s`;
  return `${bytes} B/s`;
}

// ─────────────────────────────────────────────────────────────
//  Save results to disk
// ─────────────────────────────────────────────────────────────
function saveResults(allResults) {
  const dir = resolve(process.cwd(), 'results');
  mkdirSync(dir, { recursive: true });
  const filename = `${dir}/bench_${Date.now()}.json`;
  writeFileSync(filename, JSON.stringify(allResults, null, 2));
  console.log(`\n💾  Results saved → ${filename}`);
}

// ─────────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  Node.js 100K RPS Benchmark Runner');
  console.log(`  Base URL  : ${BASE_URL}`);
  console.log(`  Scenario  : ${scenarioArg}`);
  console.log(`  Target    : ~${CONNECTIONS * 1000 / 100}K RPS (${CONNECTIONS} connections)`);
  console.log(`  Duration  : ${DURATION_S}s per run`);
  console.log('\n  Quick RPS preset table:');
  for (const [label, conns] of Object.entries(RPS_PRESETS)) {
    console.log(`    ${label.padEnd(6)} → --connections ${conns}`);
  }
  console.log('█'.repeat(70));

  const toRun = scenarioArg === 'all'
    ? Object.entries(SCENARIOS)
    : [[scenarioArg, SCENARIOS[scenarioArg]]];

  if (toRun.some(([, url]) => !url)) {
    console.error(`\n❌  Unknown scenario: "${scenarioArg}"`);
    console.error(`    Available: ${Object.keys(SCENARIOS).join(', ')}, all`);
    process.exit(1);
  }

  const allResults = {};

  for (const [name, url] of toRun) {
    const result = await runBenchmark(name, url, CONNECTIONS, DURATION_S);
    allResults[name] = {
      url,
      connections: CONNECTIONS,
      duration:    DURATION_S,
      rps:         Math.round(result.requests.mean),
      latency:     {
        avg: result.latency.mean,
        p50: result.latency.p50,
        p95: result.latency.p95,
        p99: result.latency.p99,
        max: result.latency.max,
      },
      throughputBytesPerSec: result.throughput.mean,
      errors:   result.errors,
      timeouts: result.timeouts,
      totalRequests: result.requests.total,
    };
  }

  // ── Summary table ──────────────────────────────────────────
  console.log('\n\n' + '═'.repeat(70));
  console.log('  BENCHMARK SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  ${'Scenario'.padEnd(20)} ${'RPS'.padStart(8)} ${'p50'.padStart(6)} ${'p95'.padStart(6)} ${'p99'.padStart(6)} ${'Errors'.padStart(7)}`);
  console.log('─'.repeat(70));
  for (const [name, r] of Object.entries(allResults)) {
    console.log(
      `  ${name.padEnd(20)} ${String(r.rps).padStart(8)} ${String(r.latency.p50).padStart(6)} ${String(r.latency.p95).padStart(6)} ${String(r.latency.p99).padStart(6)} ${String(r.errors).padStart(7)}`,
    );
  }
  console.log('═'.repeat(70));

  saveResults(allResults);
}

main().catch((err) => {
  console.error('❌ Benchmark failed:', err);
  process.exit(1);
});
