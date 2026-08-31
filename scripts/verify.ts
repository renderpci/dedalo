/**
 * VERIFY — the "definition of done" gate for a Dédalo TS change.
 *
 * Deterministic, touched-file-aware. Runs the checks the audit + remediation
 * made load-bearing, in cost order, and stops nothing silently:
 *
 *   1. typecheck    — bunx tsc --noEmit (whole tree; zero-error rule)
 *   2. lint         — bunx biome check . (biome.jsonc; zero-error rule)
 *   2b. lint:browser — the shrink-only budget over the trees biome.jsonc excludes
 *   3. tripwires    — the invariant-enforcement tests (always, they are the
 *                     backbone: SQL confinement, no cross-request state, config
 *                     env, json_codec/locator, SCC, descriptor completeness,
 *                     COEX tags, boundary seam, client byte-identity, oracle
 *                     canary — the authoritative list is engineering/TRIPWIRES.md;
 *                     TRIPWIRES below must match it)
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

import { readFileSync } from 'node:fs';
import { $ } from 'bun';
// The neighbour selector lives in a lib so a gate can exercise it — verify.ts
// runs on import and cannot itself be imported (scripts/lib/neighbour_tests.ts).
import { neighbourTests } from './lib/neighbour_tests.ts';
// The per-test timeout the root suite runs under. Bun 1.4.0 ignores bunfig.toml's
// `[test] timeout`, so the number has to ride the command line — see
// scripts/lib/test_flags.ts for the measurement that proves it.
import { TEST_TIMEOUT_FLAG } from './lib/test_flags.ts';

$.throws(false); // we inspect exit codes ourselves; a red stage is data, not a crash

// ---------------------------------------------------------------------------
// The tripwires (engineering/TRIPWIRES.md). Kept explicit — this list IS the
// invariant backbone; if a tripwire is added, add it here too (ci_workflow_tripwire
// asserts this array equals that index EXACTLY, so neither can drift alone).
// ---------------------------------------------------------------------------
const TRIPWIRES = [
	'test/unit/sql_confinement_tripwire.test.ts',
	'test/unit/config_env_tripwire.test.ts',
	'test/unit/config_census_tripwire.test.ts',
	'test/unit/config_declaration_tripwire.test.ts',
	'test/unit/install_seed_drift_tripwire.test.ts',
	'test/unit/install_ip_gate_tripwire.test.ts',
	'test/unit/proxy_trust_tripwire.test.ts',
	'test/unit/password_cost_tripwire.test.ts',
	'test/unit/config_docs_tripwire.test.ts',
	'test/unit/module_state_tripwire.test.ts',
	'test/unit/diffusion_boundaries.test.ts',
	'test/unit/diffusion_dispatch_gate.test.ts',
	'test/unit/boundary_seam_tripwire.test.ts',
	'test/unit/coex_tag_tripwire.test.ts',
	'test/unit/descriptor_completeness_tripwire.test.ts',
	'test/unit/import_scc_tripwire.test.ts',
	'test/unit/ws_a_tripwires.test.ts',
	'test/unit/client_serving.test.ts',
	'test/unit/client_libs_tripwire.test.ts',
	'test/unit/dependency_integrity_tripwire.test.ts',
	'test/unit/media_protection_tripwire.test.ts',
	'test/unit/media_writer_discipline_tripwire.test.ts',
	'test/unit/media_job_target_tripwire.test.ts',
	'test/unit/media_alternate_versions_tripwire.test.ts',
	'test/unit/media_thumb_census_tripwire.test.ts',
	'test/unit/mcp_write_scope_tripwire.test.ts',
	'test/unit/agent_egress_tripwire.test.ts',
	'test/unit/matrix_copy_columns_tripwire.test.ts',
	'test/unit/matrix_counter_monotonic_tripwire.test.ts',
	'test/unit/tm_epoch_tripwire.test.ts',
	'test/unit/relogin_identity_tripwire.test.ts',
	'test/unit/pdf_extract_symmetry_tripwire.test.ts',
	'test/unit/ssrf_one_guard_tripwire.test.ts',
	'test/unit/lint_scope_tripwire.test.ts',
	'test/unit/compose_invocation_tripwire.test.ts',
	'test/unit/remove_sentinel_native.test.ts',
	'test/unit/client_relation_move_native.test.ts',
	'test/unit/tool_lossless_writeback_tripwire.test.ts',
	'test/unit/consultation_only_sections_tripwire.test.ts',
	'test/unit/tm_mode_retired_tripwire.test.ts',
	'test/unit/log_section_policy_tripwire.test.ts',
	'test/unit/root_user_hidden_tripwire.test.ts',
	'test/unit/test3_canonical_fixture.test.ts',
	'test/unit/update_ownership_tripwire.test.ts',
	'test/unit/release_archive_tripwire.test.ts',
	'test/unit/info_widget_registry_tripwire.test.ts',
	'test/unit/maintenance_widget_get_value_tripwire.test.ts',
	'test/unit/install_restart_supervisor_tripwire.test.ts',
	'test/unit/ci_workflow_tripwire.test.ts',
	'test/unit/local_db_stores_tripwire.test.ts',
	'test/unit/docs_current_engine_tripwire.test.ts',
	'test/unit/docs_locator_shape_tripwire.test.ts',
	'test/unit/css_build_tripwire.test.ts',
	'test/unit/css_token_duplication_tripwire.test.ts',
	'test/unit/wire_contract_tripwire.test.ts',
	'test/unit/verify_selector_selftest.test.ts',
	'test/unit/delete_inverse_lost_update_native.test.ts',
	'test/unit/duplicate_record_dataframe_native.test.ts',
	'test/unit/tm_lang_slice_restore_native.test.ts',
	'test/unit/csv_parser_conformance_native.test.ts',
	'test/unit/ingest_encoding_tripwire.test.ts',
	'test/unit/write_lang_provenance_native.test.ts',
	'test/unit/bulk_process_id_tripwire.test.ts',
	'test/unit/export_gate_b_native.test.ts',
	'test/unit/search_path_acl_native.test.ts',
	'test/unit/frontier_class_native.test.ts',
	'test/unit/build_context_secret_tripwire.test.ts',
	'test/unit/vendor_advisory_tripwire.test.ts',
	'test/unit/client_idempotency_tripwire.test.ts',
	'test/unit/theme_token_parity.test.ts',
	'test/unit/hierarchy_single_writer_tripwire.test.ts',
	'test/unit/ontology_single_writer_tripwire.test.ts',
	'test/unit/rag_index_scope_tripwire.test.ts',
	'test/unit/labels_tripwire.test.ts',
	'test/unit/matrix_index_asset_policy_agreement.test.ts',
	'test/unit/temporal_instance_tripwire.test.ts',
	'test/unit/client_caller_chain_tripwire.test.ts',
	'test/unit/tools_cache_invalidation.test.ts',
	'test/unit/no_remote_code_tripwire.test.ts',
	'test/unit/install_seal_tripwire.test.ts',
	'test/unit/xss_csp_tripwire.test.ts',
	'test/unit/error_report_xss_tripwire.test.ts',
	'test/unit/security_audit_2026_07_23_tripwire.test.ts',
	'test/unit/human_write_scope_tripwire.test.ts',
	'test/unit/tool_permission_census_tripwire.test.ts',
	'test/unit/diffusion_scope_tripwire.test.ts',
	'test/unit/diffusion_queue_stream_tripwire.test.ts',
	'test/unit/dataframe_scan_coverage_tripwire.test.ts',
	'test/unit/tool_header_contract_tripwire.test.ts',
	'test/unit/external_registry_totality_tripwire.test.ts',
	'test/unit/external_outbound_tripwire.test.ts',
	'test/unit/external_secret_confinement_tripwire.test.ts',
	'test/unit/external_isolation_tripwire.test.ts',
	'test/unit/external_egress_tripwire.test.ts',
	'test/unit/external_degradation_tripwire.test.ts',
	'test/unit/external_config_narrowing_census.test.ts',
	'test/unit/external_write_refusal_tripwire.test.ts',
	'test/unit/external_client_render_tripwire.test.ts',
	'test/unit/external_search_target_tripwire.test.ts',
	'test/unit/date_flat_value_single_source_tripwire.test.ts',
	'test/unit/crap_complexity_ratchet.test.ts',
	'test/unit/section_id_int_tripwire.test.ts',
	'test/unit/thesaurus_picker_tripwire.test.ts',
	'test/unit/tool_picker_wiring_tripwire.test.ts',
	'test/unit/error_throw_ratchet.test.ts',
	'test/unit/error_taxonomy_tripwire.test.ts',
	'test/unit/client_error_contract_tripwire.test.ts',
	'test/unit/migration_shared_row_tripwire.test.ts',
	'test/unit/generic_tld_tripwire.test.ts',
	'test/unit/parity_baseline_tripwire.test.ts',
	'test/unit/twin_map_tripwire.test.ts',
	'test/unit/mock_isolation_tripwire.test.ts',
	'test/unit/install_table_write_tripwire.test.ts',
	'test/unit/engine_install_tld_tripwire.test.ts',
	'test/unit/test_tld_ontology_gate.test.ts',
	'test/unit/test_db_marker_tripwire.test.ts',
	'test/unit/test_media_root_tripwire.test.ts',
	'test/unit/test_rag_db_tripwire.test.ts',
	'test/unit/test_timeout_tripwire.test.ts',
	'test/unit/test_baseline_tripwire.test.ts',
	'test/unit/scratch_tld_uniqueness_tripwire.test.ts',
	'test/unit/corpus_scope_ownership_tripwire.test.ts',
	'test/unit/runtime_paths_census_tripwire.test.ts',
	'test/unit/shard_partition_tripwire.test.ts',
	'test/unit/dbread_role_tripwire.test.ts',
	'test/unit/account_revocation_native.test.ts',
	'test/unit/dd128_write_census_tripwire.test.ts',
	'test/unit/tier_execution_tripwire.test.ts',
	'test/unit/tier_assignment_tripwire.test.ts',
	'test/unit/site_builder_pairing_tripwire.test.ts',
	'test/unit/site_builder_single_source_tripwire.test.ts',
	'test/unit/operator_commands_tripwire.test.ts',
	'test/unit/backup_restorability_native.test.ts',
	'test/unit/deploy_env_contract_tripwire.test.ts',
	'test/unit/catalog_behaviour_tripwire.test.ts',
	'test/unit/marc_identity_native.test.ts',
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

/**
 * The BROWSER trees biome.jsonc excludes (P1-17). `biome check .` cannot see
 * them, so a green lint above says nothing about ~315k lines of client code;
 * this measures them with the same rules against a shrink-only budget.
 */
async function lintBrowserBudget(): Promise<void> {
	banner('lint budget (browser trees)');
	const r = await $`bun run scripts/lint_browser_budget.ts`.nothrow().quiet();
	const ok = r.exitCode === 0;
	const out = (r.stdout.toString() + r.stderr.toString()).trim();
	console.log(out.split('\n').slice(-4).join('\n'));
	results.push({
		name: 'lint:browser',
		ok,
		detail: ok ? (out.split('\n').pop() ?? 'at budget') : 'budget exceeded (see above)',
	});
}

/**
 * Failing test names this run is allowed to see WITHOUT going red — the parity
 * tier's frozen corpus-bound reds (engineering/parity_baseline.json).
 *
 * WHY THIS EXISTS. The parity tier is red BY CONSTRUCTION: 100 of its cases are
 * frozen because they were harvested against one installation's records, which
 * the suite database does not and must not hold. Those files are ordinary
 * neighbours of src/ modules, so once the neighbour selector actually selected
 * anything (it selected NOTHING until 2026-08-27) every change touching a
 * widely-imported module reported VERIFY RED for failures that are not the
 * developer's and cannot be fixed here. A gate that is red for reasons the
 * reader cannot act on is a gate the reader learns to ignore — which is exactly
 * how this repo's verify went unread for 45 commits.
 *
 * So a frozen failure is FORGIVEN and COUNTED, never hidden; a failure that is
 * NOT in the baseline still reddens the stage. The baseline itself is
 * shrink-only and is guarded by parity_baseline_tripwire, so this cannot become
 * a way to silence a real regression.
 */
function frozenParityFailures(): Set<string> {
	try {
		const json = JSON.parse(readFileSync('engineering/parity_baseline.json', 'utf8')) as {
			files?: Record<string, string[]>;
		};
		const out = new Set<string>();
		for (const names of Object.values(json.files ?? {})) for (const n of names) out.add(n);
		return out;
	} catch {
		// No baseline, or unreadable: forgive NOTHING. Fail-closed by design —
		// a missing baseline must never become a blanket amnesty.
		return new Set<string>();
	}
}

async function runTestFiles(name: string, files: string[], forgiven?: Set<string>): Promise<void> {
	banner(`${name} (${files.length} file${files.length === 1 ? '' : 's'})`);
	if (files.length === 0) {
		results.push({ name, ok: true, detail: 'no files' });
		return;
	}
	const r = await $`bun test ${TEST_TIMEOUT_FLAG} ${files}`.quiet();
	const output = r.stdout.toString() + r.stderr.toString();
	// biome-ignore lint/suspicious/noControlCharactersInRegex: \x1b is the ANSI escape being stripped
	const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
	// ANCHORED to bun's own summary lines (` 181 pass`, ` 0 fail`), never a bare
	// substring: an unanchored /(\d+) fail/ matches log text a test EMITS — a
	// media case logging `ffmpeg pass 1 failed` made a clean 181/0 run report
	// "159 pass / 1 fail" while `ok` (the exit code) correctly said green.
	// A gate's own tally must not be readable out of arbitrary stdout.
	const passM = clean.match(/^\s*(\d+) pass$/m);

	// Split the failures into the ones the baseline already froze and the ones
	// it did not. A frozen failure is reported, not hidden — it just does not
	// redden the stage.
	const failedNames = clean
		.split('\n')
		.filter((l) => l.startsWith('(fail)'))
		.map((l) =>
			l
				.replace(/^\(fail\)\s*/, '')
				.replace(/\s*\[[\d.]+m?s\]\s*$/, '')
				.trim(),
		);
	const unfrozen =
		forgiven === undefined ? failedNames : failedNames.filter((n) => !forgiven.has(n));
	const frozenSeen = failedNames.length - unfrozen.length;

	const ok = r.exitCode === 0 || (failedNames.length > 0 && unfrozen.length === 0);
	if (!ok) {
		for (const l of clean.split('\n'))
			if (l.startsWith('✗') || l.startsWith('(fail)')) console.log(l);
	}
	const frozenNote = frozenSeen > 0 ? ` (${frozenSeen} frozen)` : '';
	results.push({
		name,
		ok,
		detail: `${passM?.[1] ?? '?'} pass / ${unfrozen.length} fail${frozenNote}`,
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

// TYPECHECK AND LINT RUN CONCURRENTLY. Both are whole-tree, independent and
// read-only; sequencing them only added their wall clocks together. Both
// verdicts are always recorded, so a red lint cannot mask a red typecheck.
// Their console output is buffered inside each stage and printed on completion,
// so a concurrent run still reads top-to-bottom rather than interleaving.
await Promise.all([typecheck(), lint(), lintBrowserBudget()]);
// Concurrency made the PUSH order a race, which made the summary's row order
// vary between runs — a verdict table that reshuffles is a verdict table people
// stop reading. Pin the two static stages to their declared order; the test
// stages below append after them, as they always did.
const STATIC_STAGE_ORDER = ['typecheck', 'lint', 'lint:browser'];
results.sort((a, b) => STATIC_STAGE_ORDER.indexOf(a.name) - STATIC_STAGE_ORDER.indexOf(b.name));

if (runTests) {
	await runTestFiles('tripwires', TRIPWIRES);
	const neighbours = await neighbourTests(changed);
	// Do not re-run a tripwire as a "neighbour".
	const only = neighbours.filter((f) => !TRIPWIRES.includes(f));
	await runTestFiles('neighbours', only, frozenParityFailures());

	// The site-builder daemon is its own package (publication/site_builder) — outside the
	// src/+test/ trees the neighbour scan covers — so its suite runs as a targeted stage
	// whenever the change touches it. Hermetic (no DB, no oracle); CI runs it always via
	// scripts/ci/hermetic.sh.
	//
	// NO --timeout HERE, DELIBERATELY. The root suite gets TEST_TIMEOUT_FLAG because it
	// LOST a number it had chosen: bunfig.toml declared `[test] timeout = 30000` and Bun
	// 1.4.0 silently ignored it. This package never made that claim —
	// publication/site_builder has NO bunfig.toml at all — the file does not exist, measured
	// 2026-08-25, so no timeout was ever declared (its sibling
	// publication/server_api/v2/bunfig.toml declares only coverage/coverageThreshold) — so
	// its green baseline was measured under bun's built-in 5000 ms cap and stays
	// comparable run to run. Widening it on no evidence would be silently loosening a
	// gate, not restoring one. Same reasoning, same wording, at the other exempt site:
	// scripts/ci/hermetic.sh daemon_gate().
	if (changed.some((f) => f.startsWith('publication/site_builder/'))) {
		banner('site_builder (tsc + bun test in publication/site_builder)');
		const r = await $`bash -c "cd publication/site_builder && bunx tsc --noEmit && bun test 2>&1"`
			.quiet()
			.nothrow();
		const text = r.stdout.toString() + r.stderr.toString();
		console.log(text.split('\n').slice(-6).join('\n'));
		const passM = text.match(/(\d+) pass/);
		const failM = text.match(/(\d+) fail/);
		const ok = r.exitCode === 0 && failM?.[1] === '0';
		results.push({
			name: 'site_builder',
			ok,
			detail: `${passM?.[1] ?? '?'} pass / ${failM?.[1] ?? '?'} fail`,
		});
	}
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
