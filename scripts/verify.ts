/**
 * VERIFY — the "definition of done" gate for a Dédalo TS change.
 *
 * Deterministic, touched-file-aware. Runs the checks the audit + remediation
 * made load-bearing, in cost order, and stops nothing silently:
 *
 *   1. typecheck    — bunx tsc --noEmit (whole tree; zero-error rule)
 *   2. lint         — bunx biome check . (biome.jsonc; zero-error rule)
 *   3. tripwires    — the invariant-enforcement tests (always, they are the
 *                     backbone: SQL confinement, no cross-request state, config
 *                     env, json_codec/locator, SCC, descriptor completeness,
 *                     COEX tags, boundary seam, client byte-identity, oracle
 *                     canary — the authoritative list is rewrite/LEDGER.md
 *                     "Tripwire index"; TRIPWIRES below must match it)
 *   4. neighbours   — the unit/parity test files that IMPORT any changed src
 *                     file (targeted; NOT the full suite)
 *
 * This is NOT the full suite (that is `bun test`). It is the fast pre-commit
 * gate: if verify is green, the change did not break a tripwired invariant and
 * its nearest gates still pass. Parity neighbours need the live PHP oracle
 * (../private/.env + PHP up) — absent, they skip LOUDLY, they do not pass.
 *
 * Usage:
 *   bun run scripts/verify.ts                 # verify uncommitted work (vs HEAD)
 *   bun run scripts/verify.ts --base main     # verify the whole branch vs main
 *   bun run scripts/verify.ts --no-tests      # typecheck + lint + tripwires only
 *   bun run scripts/verify.ts --changed       # print the changed-file set and exit
 *
 * Exit 0 iff every enabled stage is green.
 */

import { $ } from 'bun';

$.throws(false); // we inspect exit codes ourselves; a red stage is data, not a crash

// ---------------------------------------------------------------------------
// The tripwires (rewrite/LEDGER.md "Tripwire index"). Kept explicit — this
// list IS the invariant backbone; if a tripwire is added, add it here too.
// ---------------------------------------------------------------------------
const TRIPWIRES = [
	'test/unit/sql_confinement_tripwire.test.ts',
	'test/unit/config_env_tripwire.test.ts',
	'test/unit/config_census_tripwire.test.ts',
	'test/unit/module_state_tripwire.test.ts',
	'test/unit/diffusion_boundaries.test.ts',
	'test/unit/boundary_seam_tripwire.test.ts',
	'test/unit/coex_tag_tripwire.test.ts',
	'test/unit/descriptor_completeness_tripwire.test.ts',
	'test/unit/import_scc_tripwire.test.ts',
	'test/unit/ws_a_tripwires.test.ts',
	'test/unit/client_serving.test.ts',
	'test/unit/mcp_write_scope_tripwire.test.ts',
	'test/unit/agent_egress_tripwire.test.ts',
	'test/unit/matrix_copy_columns_tripwire.test.ts',
	'test/unit/consultation_only_sections_tripwire.test.ts',
	'test/unit/root_user_hidden_tripwire.test.ts',
	'test/unit/test3_canonical_fixture.test.ts',
	'test/unit/update_ownership_tripwire.test.ts',
	'test/unit/info_widget_registry_tripwire.test.ts',
	'test/unit/ci_workflow_tripwire.test.ts',
	'test/parity/oracle_canary.test.ts',
];

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const argv = Bun.argv.slice(2);
const baseIdx = argv.indexOf('--base');
const base = baseIdx !== -1 ? argv[baseIdx + 1] : 'HEAD';
const runTests = !argv.includes('--no-tests');
const changedOnly = argv.includes('--changed');

// ---------------------------------------------------------------------------
// Changed-file discovery: tracked changes vs <base> + untracked (unignored).
// ---------------------------------------------------------------------------
async function changedFiles(): Promise<string[]> {
	const tracked = await $`git diff --name-only ${base}`.text();
	const untracked = await $`git ls-files --others --exclude-standard`.text();
	const set = new Set<string>();
	for (const line of `${tracked}\n${untracked}`.split('\n')) {
		const f = line.trim();
		if (f) set.add(f);
	}
	return [...set];
}

/** A changed source file's import-tail — the substring test files import it by,
 *  e.g. src/core/section/record/save_component.ts → core/section/record/save_component */
function importTail(file: string): string | null {
	const m = file.match(/^src\/(.+)\.ts$/);
	return m?.[1] ?? null;
}

/** Test files (unit + parity) that import any changed src file, plus changed
 *  test files themselves. Targeted — never the whole suite. */
async function neighbourTests(changed: string[]): Promise<string[]> {
	const out = new Set<string>();

	// A changed test file is its own neighbour.
	for (const f of changed) {
		if (f.startsWith('test/') && f.endsWith('.test.ts')) out.add(f);
	}

	// Src files: find every test that imports their module tail.
	const tails = changed.map(importTail).filter((t): t is string => t !== null);
	for (const tail of tails) {
		// grep the test tree for the import tail; tolerate "no match" (exit 1).
		const hits = await $`grep -rl --include=*.test.ts ${tail} test/`.text().catch(() => '');
		for (const line of hits.split('\n')) {
			const f = line.trim();
			if (f) out.add(f);
		}
	}
	return [...out];
}

// ---------------------------------------------------------------------------
// Stage runner
// ---------------------------------------------------------------------------
interface Stage {
	name: string;
	ok: boolean;
	detail: string;
}
const results: Stage[] = [];

function banner(msg: string): void {
	console.log(`\n\x1b[1m▶ ${msg}\x1b[0m`);
}

async function typecheck(): Promise<void> {
	banner('typecheck (tsc --noEmit)');
	const r = await $`bunx tsc --noEmit`.quiet();
	const errs = (r.stdout.toString() + r.stderr.toString())
		.split('\n')
		.filter((l) => l.includes('error TS')).length;
	const ok = r.exitCode === 0;
	if (!ok) console.log(r.stdout.toString().split('\n').slice(0, 20).join('\n'));
	results.push({ name: 'typecheck', ok, detail: ok ? '0 errors' : `${errs} error(s)` });
}

async function lint(): Promise<void> {
	banner('lint (biome check)');
	const r = await $`bunx biome check .`.quiet();
	const ok = r.exitCode === 0;
	if (!ok) {
		const tail = r.stdout.toString().split('\n');
		console.log(tail.slice(-12).join('\n'));
	}
	results.push({ name: 'lint', ok, detail: ok ? 'clean' : 'errors (see above)' });
}

async function runTestFiles(name: string, files: string[]): Promise<void> {
	banner(`${name} (${files.length} file${files.length === 1 ? '' : 's'})`);
	if (files.length === 0) {
		results.push({ name, ok: true, detail: 'no files' });
		return;
	}
	const r = await $`bun test ${files}`.quiet();
	const output = r.stdout.toString() + r.stderr.toString();
	// biome-ignore lint/suspicious/noControlCharactersInRegex: \x1b is the ANSI escape being stripped
	const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
	const passM = clean.match(/(\d+) pass/);
	const failM = clean.match(/(\d+) fail/);
	const ok = r.exitCode === 0;
	if (!ok) {
		for (const l of clean.split('\n'))
			if (l.startsWith('✗') || l.startsWith('(fail)')) console.log(l);
	}
	results.push({
		name,
		ok,
		detail: `${passM?.[1] ?? '?'} pass / ${failM?.[1] ?? '0'} fail`,
	});
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const changed = await changedFiles();

if (changedOnly) {
	console.log(changed.join('\n'));
	process.exit(0);
}

console.log(`\x1b[1mVERIFY\x1b[0m — ${changed.length} changed file(s) vs ${base}`);

await typecheck();
await lint();

if (runTests) {
	await runTestFiles('tripwires', TRIPWIRES);
	const neighbours = await neighbourTests(changed);
	// Do not re-run a tripwire as a "neighbour".
	const only = neighbours.filter((f) => !TRIPWIRES.includes(f));
	await runTestFiles('neighbours', only);
} else {
	console.log('\n(--no-tests: skipping tripwires + neighbours)');
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
console.log('\n\x1b[1m─ VERIFY SUMMARY ─\x1b[0m');
let allOk = true;
for (const s of results) {
	const mark = s.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
	console.log(`  ${mark} ${s.name.padEnd(12)} ${s.detail}`);
	if (!s.ok) allOk = false;
}
console.log(allOk ? '\n\x1b[32mVERIFY GREEN\x1b[0m' : '\n\x1b[31mVERIFY RED\x1b[0m');
process.exit(allOk ? 0 : 1);
