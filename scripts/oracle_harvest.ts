/**
 * ORACLE HARVEST (DEC-14b) — freeze the live PHP oracle's parity responses as
 * versioned golden fixtures, so the differential suite survives PHP's
 * decommissioning. Full story: engineering/ORACLE_HARVEST.md.
 *
 * Usage:
 *   bun run scripts/oracle_harvest.ts               # harvest every read-path gate
 *   bun run scripts/oracle_harvest.ts --gate read_differential.test.ts   # one gate
 *   bun run scripts/oracle_harvest.ts --list        # print the manifest and exit
 *
 * Mechanism: each READ-PATH parity gate is run once with ORACLE_MODE=record —
 * one gate per child process, so every store file in
 * test/parity/fixtures/oracle_harvest/ is complete and self-consistent. In
 * record mode PhpApiClient performs its normal live HTTP and freezes every
 * (request → response) pair keyed by canonical request hash, with provenance
 * meta (capture_commit, captured_at, oracle base-URL hash, drift_policy) —
 * extending the batch-1 provenance pattern (scripts/capture_fixture.ts,
 * test/integration/fixtures/diffusion_old_engine_cells.json).
 *
 * LIVE-ONLY gates (FIXTURE_EXEMPT_GATES) are NEVER harvested: their PHP-side
 * round-trips are real mutations, or reads of scratch records seeded fresh
 * each run — either way the frozen responses could not be honestly replayed
 * (and recording writes would mutate the shared DB on every harvest). They
 * skip under ORACLE_MODE=fixtures via hasLivePhpOracle().
 */

import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from '../src/config/config.ts';
import {
	FIXTURE_EXEMPT_GATES,
	NO_ORACLE_GATES,
	finalizeHarvestGate,
	oracleHarvestDir,
} from '../test/parity/oracle_fixtures.ts';
import { PhpApiClient, hasPhpCredentials } from '../test/parity/php_client.ts';

const projectRoot = resolve(import.meta.dir, '..');
const parityDir = join(projectRoot, 'test', 'parity');

/** The canary probes ORACLE LIVENESS itself — nothing to freeze. */
const NON_HARVEST_SPECIALS = ['oracle_canary.test.ts'];

function buildManifest(): string[] {
	const excluded = new Set([...FIXTURE_EXEMPT_GATES, ...NO_ORACLE_GATES, ...NON_HARVEST_SPECIALS]);
	return readdirSync(parityDir)
		.filter((name) => name.endsWith('.test.ts') && !excluded.has(name))
		.sort();
}

const args = Bun.argv.slice(2);
const manifest = buildManifest();

if (args.includes('--list')) {
	console.log(`READ-PATH gates to harvest (${manifest.length}):`);
	for (const gate of manifest) console.log(`  ${gate}`);
	console.log(
		`\nFIXTURE-EXEMPT live-only gates (${FIXTURE_EXEMPT_GATES.length}) — never harvested, skip in fixture mode:`,
	);
	for (const gate of FIXTURE_EXEMPT_GATES) console.log(`  ${gate}`);
	console.log(
		`\nNo-oracle gates (${NO_ORACLE_GATES.length}) — no PhpApiClient traffic, mode-independent:`,
	);
	for (const gate of NO_ORACLE_GATES) console.log(`  ${gate}`);
	process.exit(0);
}

const gateFlagIndex = args.indexOf('--gate');
const selectedGates = gateFlagIndex >= 0 ? [args[gateFlagIndex + 1] ?? ''] : manifest;

if (gateFlagIndex >= 0) {
	const gate = selectedGates[0] as string;
	if (FIXTURE_EXEMPT_GATES.includes(gate)) {
		console.error(
			`REFUSED: ${gate} is fixture-exempt (live-only: PHP-side writes or per-run scratch reads). Its responses cannot be honestly replayed — see FIXTURE_EXEMPT_GATES in test/parity/oracle_fixtures.ts.`,
		);
		process.exit(1);
	}
	if (!manifest.includes(gate)) {
		console.error(`Unknown read-path gate '${gate}'. Use --list to see the manifest.`);
		process.exit(1);
	}
}

// Preflight: the harvest needs the LIVE oracle (never run it in fixture mode).
if (process.env.ORACLE_MODE === 'fixtures') {
	console.error(
		'ORACLE_MODE=fixtures is set — the harvest records from the LIVE oracle. Unset it.',
	);
	process.exit(1);
}
if (!hasPhpCredentials()) {
	console.error(
		'PHP oracle credentials missing (PHP_API_BASE_URL / PHP_API_USERNAME / PHP_API_PASSWORD in ../private/.env).',
	);
	process.exit(1);
}
const preflightClient = new PhpApiClient();
const { status: preflightStatus } = await preflightClient.call({
	action: 'get_environment',
	dd_api: 'dd_core_api',
});
if (preflightStatus !== 200) {
	console.error(`PHP oracle preflight failed: HTTP ${preflightStatus} from get_environment.`);
	process.exit(1);
}
console.log(
	`Oracle live (${new URL(config.phpReference.apiBaseUrl as string).host}). Harvesting ${selectedGates.length} read-path gate(s)…\n`,
);

let captureCommit = 'unknown';
try {
	captureCommit =
		Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD'], { cwd: projectRoot })
			.stdout.toString()
			.trim() || 'unknown';
} catch {
	// git unavailable (exported tree) — keep 'unknown' rather than fail.
}

interface GateOutcome {
	gate: string;
	exitCode: number;
	interactions: number;
	bytes: number;
	seconds: number;
}
const outcomes: GateOutcome[] = [];

for (const gate of selectedGates) {
	const stem = gate.replace(/\.test\.ts$/, '');
	const startedAt = performance.now();
	// --timeout: a gate run STANDALONE pays cold-start (DB pool, ontology
	// caches) inside its hooks; the full-suite run amortizes that across files,
	// so the default 5s hook budget is too tight here.
	const child = Bun.spawnSync(['bun', 'test', '--timeout', '30000', join('test', 'parity', gate)], {
		cwd: projectRoot,
		env: {
			...process.env,
			ORACLE_MODE: 'record',
			ORACLE_HARVEST_GATE: stem,
		},
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const seconds = (performance.now() - startedAt) / 1000;

	// Wrap the child's append log into the final provenance-carrying store file.
	const interactions =
		finalizeHarvestGate(stem, {
			captureCommit,
			oracleBaseUrl: config.phpReference.apiBaseUrl as string,
			entity: config.entity,
		}) ?? 0;
	let bytes = 0;
	const storePath = join(oracleHarvestDir, `${stem}.json`);
	try {
		bytes = statSync(storePath).size;
	} catch {
		// no store file — the gate made no oracle calls or crashed before any.
	}
	outcomes.push({ gate, exitCode: child.exitCode, interactions, bytes, seconds });

	const marker = child.exitCode === 0 ? 'ok  ' : 'RED ';
	console.log(
		`${marker} ${gate}  →  ${interactions} interactions, ${(bytes / 1024).toFixed(1)} KiB, ${seconds.toFixed(1)}s${
			child.exitCode !== 0
				? `  (bun test exit ${child.exitCode} — responses still frozen; adjudicate the red separately)`
				: ''
		}`,
	);
	if (child.exitCode !== 0) {
		const stderrTail = child.stderr.toString().trim().split('\n').slice(-6).join('\n    ');
		console.log(`    ${stderrTail}`);
	}
}

const totalInteractions = outcomes.reduce((sum, entry) => sum + entry.interactions, 0);
const totalBytes = outcomes.reduce((sum, entry) => sum + entry.bytes, 0);
const empty = outcomes.filter((entry) => entry.interactions === 0);
const red = outcomes.filter((entry) => entry.exitCode !== 0);

console.log('\n=== HARVEST SUMMARY ===');
console.log(`gates harvested        : ${outcomes.length}`);
console.log(`fixture-exempt (live)  : ${FIXTURE_EXEMPT_GATES.length}`);
console.log(`no-oracle (TS/DB only) : ${NO_ORACLE_GATES.length}`);
console.log(`interactions frozen    : ${totalInteractions}`);
console.log(
	`harvested this run     : ${(totalBytes / 1024 / 1024).toFixed(2)} MiB into ${oracleHarvestDir}`,
);
if (red.length > 0) {
	console.log(`gates red during record: ${red.map((entry) => entry.gate).join(', ')}`);
}
if (empty.length > 0) {
	console.log(
		`gates with NO recorded interactions (verify they truly need no oracle): ${empty.map((entry) => entry.gate).join(', ')}`,
	);
}
console.log(
	'\nNext: prove the store with `ORACLE_MODE=fixtures PHP_API_BASE_URL= PHP_API_USERNAME= PHP_API_PASSWORD= bun test test/parity/`',
);
process.exit(red.length > 0 ? 1 : 0);
