/**
 * TEST-CORPUS SCOPE OWNERSHIP — every `ensureTestCorpus`/`dropTestCorpus`
 * scope has one owning test file, and the set that violates that may only
 * SHRINK.
 *
 * WHY THIS EXISTS (verified 2026-08-25). `ensureTestCorpus(scope?)` is
 * delete-then-insert and `dropTestCorpus(scope?)` is asserted to residue 0 —
 * two files driving the same scope in parallel processes corrupt each other's
 * substrate mid-assertion. Worse, an UNSCOPED call is the WHOLE 446-record /
 * 36-section corpus: the two unscoped callers conflict with EVERY scoped
 * caller, which is precisely what welds all 54 corpus files into one connected
 * component and makes a naive cost-balanced shard bin-pack INCORRECT, not
 * merely suboptimal (the Phase 2 finding; census:
 * scripts/lib/test_components.ts, the ONE implementation of the measure —
 * this gate computes nothing itself).
 *
 * The current single-process runner serializes files, so the corruption is
 * LATENT; the baselines below are the honest record of the debt the Phase 3
 * partitioner must treat as co-location constraints.
 *
 * ── THE THREE CLASSES, each with its own shrink-only list ────────────────────
 *  1. SHARED SCOPES — a section tipo driven by more than one file. Fixing one
 *     means giving the scope a single owner (usually: the smaller gate builds
 *     its own situation instead of borrowing the corpus section).
 *  2. UNSCOPED CALLERS — whole-corpus delete-then-insert. Exactly two exist
 *     and both are load-bearing; they are listed BY NAME because each is the
 *     welding edge of the component.
 *  3. UNRESOLVED SCOPES — an argument the census's static evaluator cannot
 *     read. NEVER silently narrowed: an unresolved caller is modelled as
 *     conflicting with every corpus caller (over-welding is the safe direction
 *     for a scheduler), and must be listed here with the reason its scope is
 *     dynamic.
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - The census reads SOURCE. Its evaluator covers the shapes the tree
 *    actually writes (string/array literals, file-local consts, spreads,
 *    literal templates, the pilot `seed('tld', N)` concat) — anything else is
 *    REFUSED into class 3 rather than guessed at, so a new dynamic shape
 *    cannot pass silently, but neither can this gate tell you its tipos.
 *  - One owner per scope says nothing about ORDER within a file, and nothing
 *    about scopes whose sections OVERLAP a whole-corpus call — that conflict
 *    is class 2's, recorded there.
 *
 * A LISTED ENTRY THAT HAS BECOME UNSHARED (or a caller that became scoped,
 * or resolvable) IS RED TOO: the lists only shrink, in the same commit as the
 * fix.
 *
 * NOTE ON SPELLING: the `rsc*` scope names below are built with `seed()`
 * (the sanctioned seed-shipped-TLD spelling, see generic_tld_tripwire's
 * header) so this gate does not itself become a new textual install-TLD
 * binding in the generic_tld ratchet.
 *
 * HERMETIC: filesystem reads of tracked test source. No DB, no network.
 */

import { describe, expect, test } from 'bun:test';
import {
	type CorpusCall,
	corpusCalls,
	corpusOwnership,
	sharedCorpusScopes,
} from '../../scripts/lib/test_components.ts';

/** Seed-shipped TLD spelling (rsc/dd are seed TLDs — generic_tld_tripwire header). */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/**
 * Class 1 — SHRINK-ONLY. Each entry PINS the exact owner set: a new file
 * joining an already-shared scope is refused, a departed owner must shrink the
 * entry in the same commit.
 */
const SHARED_SCOPE_BASELINE: readonly {
	scope: string;
	owners: readonly string[];
	reason: string;
}[] = [
	{
		scope: 'dd128',
		reason:
			'the users section: five parity gates and test_db_marker_tripwire all re-ensure the corpus users (the marker gate is the third axis of the Phase 2 finding — it also holds zzq and restoreCanonicalTest3)',
		owners: [
			'test/parity/activity_read_differential.test.ts',
			'test/parity/component_datalist_lifecycle_differential.test.ts',
			'test/parity/count_differential.test.ts',
			'test/parity/projects_filter_differential.test.ts',
			'test/parity/root_user_hidden_differential.test.ts',
			'test/unit/test_db_marker_tripwire.test.ts',
		],
	},
	{
		scope: seed('rsc', 167),
		reason: 'seed-shipped media section shared by three parity gates',
		owners: [
			'test/parity/component_datalist_lifecycle_differential.test.ts',
			'test/parity/indexation_grid_differential.test.ts',
			'test/parity/tool_component_read_differential.test.ts',
		],
	},
	{
		scope: seed('rsc', 170),
		reason: 'seed-shipped image section shared by six parity gates',
		owners: [
			'test/parity/component_datalist_lifecycle_differential.test.ts',
			'test/parity/component_image_context_differential.test.ts',
			'test/parity/media_files_info_differential.test.ts',
			'test/parity/model_coverage_sweep.test.ts',
			'test/parity/tool_component_read_differential.test.ts',
			'test/parity/tool_export_differential.test.ts',
		],
	},
	{
		scope: seed('rsc', 197),
		reason: 'seed-shipped section shared by two parity gates',
		owners: [
			'test/parity/autocomplete_search_differential.test.ts',
			'test/parity/get_data_differential.test.ts',
		],
	},
	{
		scope: seed('rsc', 205),
		reason: 'seed-shipped keywords thesaurus shared by seven parity gates',
		owners: [
			'test/parity/component_datalist_lifecycle_differential.test.ts',
			'test/parity/get_data_differential.test.ts',
			'test/parity/indexation_grid_differential.test.ts',
			'test/parity/model_coverage_sweep.test.ts',
			'test/parity/relation_index_get_data_differential.test.ts',
			'test/parity/relation_inverse_differential.test.ts',
			'test/parity/tool_export_breakdown_differential.test.ts',
		],
	},
	{
		scope: seed('rsc', 332),
		reason: 'seed-shipped section shared by three parity gates',
		owners: [
			'test/parity/get_data_differential.test.ts',
			'test/parity/read_raw_differential.test.ts',
			'test/parity/tool_export_breakdown_differential.test.ts',
		],
	},
	{
		scope: 'test6099',
		reason:
			'the mint-types twin: 12 owners — with test6099 in diffusion_export_unified’s scope it is one of the two bridges that weld the parity and unit clusters',
		owners: [
			'test/parity/autocomplete_search_differential.test.ts',
			'test/parity/get_widget_data_differential.test.ts',
			'test/parity/model_coverage_sweep.test.ts',
			'test/parity/multihop_order_differential.test.ts',
			'test/parity/multihop_search_differential.test.ts',
			'test/parity/tool_component_read_differential.test.ts',
			'test/parity/tool_export_breakdown_differential.test.ts',
			'test/parity/tool_export_differential.test.ts',
			'test/unit/diffusion_export_unified.test.ts',
			'test/unit/read_facade_routing.test.ts',
			'test/unit/search_count_shape.test.ts',
			'test/unit/search_related.test.ts',
		],
	},
	{
		scope: 'test6100',
		reason: 'the hierarchy twin: nine owners across both tiers',
		owners: [
			'test/parity/autocomplete_hi_search_differential.test.ts',
			'test/parity/autocomplete_search_differential.test.ts',
			'test/parity/model_coverage_sweep.test.ts',
			'test/parity/projects_filter_differential.test.ts',
			'test/parity/relation_inverse_differential.test.ts',
			'test/parity/sqo_differential.test.ts',
			'test/parity/tool_component_read_differential.test.ts',
			'test/unit/read_facade_routing.test.ts',
			'test/unit/sqo_session.test.ts',
		],
	},
	{
		scope: 'test6101',
		reason: 'shared by three parity gates',
		owners: [
			'test/parity/indexation_grid_differential.test.ts',
			'test/parity/projects_filter_differential.test.ts',
			'test/parity/sqo_differential.test.ts',
		],
	},
	{
		scope: 'test6310',
		reason: 'the diffusion-scope and record-scope gates share one twin section',
		owners: ['test/unit/diffusion_scope_gate.test.ts', 'test/unit/record_scope_gates.test.ts'],
	},
	{
		scope: 'test6810',
		reason: 'shared by two parity gates',
		owners: [
			'test/parity/autocomplete_hi_search_differential.test.ts',
			'test/parity/model_coverage_sweep.test.ts',
		],
	},
	{
		scope: 'testcatalogs1',
		reason: 'shared by two parity gates and one unit search gate',
		owners: [
			'test/parity/model_coverage_sweep.test.ts',
			'test/parity/sqo_differential.test.ts',
			'test/unit/search_filter_by_list_function.test.ts',
		],
	},
	{
		scope: 'testcult1',
		reason: 'shared by two parity gates',
		owners: [
			'test/parity/relation_index_get_data_differential.test.ts',
			'test/parity/tool_export_differential.test.ts',
		],
	},
	{
		scope: 'testimmovable1',
		reason: 'the ts_object family: six parity gates drive the same immovable twin',
		owners: [
			'test/parity/delete_children_guard_differential.test.ts',
			'test/parity/indexation_grid_differential.test.ts',
			'test/parity/ts_mutations_differential.test.ts',
			'test/parity/ts_mutations_hardening.test.ts',
			'test/parity/ts_node_read_differential.test.ts',
			'test/parity/ts_search_differential.test.ts',
		],
	},
	{
		scope: 'testmint1',
		reason:
			'the flagship mint twin: 27 owners, the single hottest scope — with test6099 in diffusion_export_unified’s scope it bridges the two largest clusters of the component',
		owners: [
			'test/parity/autocomplete_search_differential.test.ts',
			'test/parity/component_section_id_differential.test.ts',
			'test/parity/component_tools_differential.test.ts',
			'test/parity/context_differential.test.ts',
			'test/parity/count_differential.test.ts',
			'test/parity/datalist_differential.test.ts',
			'test/parity/default_ddo_map_differential.test.ts',
			'test/parity/get_data_differential.test.ts',
			'test/parity/model_coverage_sweep.test.ts',
			'test/parity/multihop_order_differential.test.ts',
			'test/parity/multihop_search_differential.test.ts',
			'test/parity/projects_filter_differential.test.ts',
			'test/parity/read_differential.test.ts',
			'test/parity/read_raw_differential.test.ts',
			'test/parity/related_count_differential.test.ts',
			'test/parity/request_config_differential.test.ts',
			'test/parity/resolve_data_differential.test.ts',
			'test/parity/section_terms_differential.test.ts',
			'test/parity/sqo_differential.test.ts',
			'test/parity/tool_export_breakdown_differential.test.ts',
			'test/parity/tool_export_differential.test.ts',
			'test/unit/diffusion_export_unified.test.ts',
			'test/unit/matrix_read.test.ts',
			'test/unit/matrix_write_roundtrip.test.ts',
			'test/unit/raw_view.test.ts',
			'test/unit/request_config_source_cases.test.ts',
			'test/unit/search_related.test.ts',
		],
	},
	{
		scope: 'testterr1',
		reason: 'shared by two parity gates and one unit gate',
		owners: [
			'test/parity/indexation_grid_differential.test.ts',
			'test/parity/tool_export_differential.test.ts',
			'test/unit/request_config_source_cases.test.ts',
		],
	},
];

/**
 * Class 2 — the whole-corpus callers, BY NAME, each the welding edge of the
 * connected component. Shrink-only: scoping one of these is the single
 * highest-leverage decomposition step Phase 3 has.
 */
const UNSCOPED_CALLER_BASELINE: readonly { file: string; reason: string }[] = [
	{
		file: 'test/unit/json_codec_roundtrip.test.ts',
		reason:
			'ensures/drops the WHOLE corpus (with the expect(dropTestCorpus()).toBe(0) residue assertion) to round-trip every jsonb shape the corpus holds — conflicts with every scoped caller by construction',
	},
	{
		file: 'test/unit/test_corpus_fixture.test.ts',
		reason:
			'the corpus door’s OWN gate: whole-corpus ensure/drop is the contract under test — the one file for which an unscoped call is the point, not a shortcut',
	},
];

/**
 * Class 3 — statically unreadable scopes, file:line, with why each is dynamic.
 * Shrink-only; a NEW dynamic scope shape must be listed here in the same
 * change that introduces it (or better: written resolvably).
 */
const UNRESOLVED_SCOPE_BASELINE: readonly { file: string; reason: string }[] = [
	{
		file: 'test/parity/complex_relation_sweep.test.ts',
		reason:
			'scope is [...new Set(CASES.map((sweep) => sweep.section)), seed(…)] — derived from the sweep table at runtime; the census refuses to guess it',
	},
	{
		file: 'test/unit/test_corpus_fixture.test.ts',
		reason:
			'scope is [String(users?.section_tipo)] — read back from loadTestCorpus() at runtime by the door’s own seed-section test (the file is ALSO a class-2 unscoped caller)',
	},
];

const CALLS = corpusCalls();
const OWNERSHIP = corpusOwnership(CALLS);
const MEASURED_SHARED = sharedCorpusScopes(OWNERSHIP);
const MEASURED_BY_SCOPE = new Map(MEASURED_SHARED.map((entry) => [entry.scope, entry]));
const BASELINE_BY_SCOPE = new Map(SHARED_SCOPE_BASELINE.map((entry) => [entry.scope, entry]));

describe('test-corpus scope ownership — one owner per scope (shrink-only)', () => {
	test('NO NEW shared scope, and NO NEW owner on an already-shared one', () => {
		const violations: string[] = [];
		for (const entry of MEASURED_SHARED) {
			const pinned = BASELINE_BY_SCOPE.get(entry.scope);
			if (pinned === undefined) {
				violations.push(`NEW shared scope '${entry.scope}': ${entry.owners.join(', ')}`);
				continue;
			}
			const extra = entry.owners.filter((file) => !pinned.owners.includes(file));
			if (extra.length > 0) {
				violations.push(`scope '${entry.scope}' gained owners: ${extra.join(', ')}`);
			}
		}
		expect(
			violations,
			'ensureTestCorpus is delete-then-insert and dropTestCorpus asserts residue 0 — two files ' +
				'driving one scope in parallel processes corrupt each other. Build your own situation ' +
				'(src/core/test_data/situations) instead of joining a corpus scope another gate owns.',
		).toEqual([]);
	});

	test('NO NEW whole-corpus caller (the welding edges are named and closed)', () => {
		const pinned = UNSCOPED_CALLER_BASELINE.map((entry) => entry.file);
		const measured = [...OWNERSHIP.unscopedFiles].sort();
		expect(
			measured.filter((file) => !pinned.includes(file)),
			'an UNSCOPED ensureTestCorpus()/dropTestCorpus() is the whole 446-record corpus and conflicts ' +
				'with EVERY scoped caller — it welds the entire corpus tier into one co-location component. Pass a scope.',
		).toEqual([]);
		// Shrink-only in reverse: a caller that became scoped leaves the list.
		expect(
			pinned.filter((file) => !measured.includes(file)),
			'fixed — delete these names in the same change that scoped them',
		).toEqual([]);
	});

	test('NO NEW statically-unreadable scope (never silently narrowed)', () => {
		const pinned = UNRESOLVED_SCOPE_BASELINE.map((entry) => entry.file);
		const measured = [...new Set(OWNERSHIP.unresolvedCalls.map((call) => call.file))].sort();
		expect(
			measured.filter((file) => !pinned.includes(file)),
			'the census cannot read this scope argument, so it must model the file as conflicting with ' +
				'every corpus caller — write the scope resolvably (literals / file-local consts / seed()) or list it here with its reason.',
		).toEqual([]);
		expect(
			pinned.filter((file) => !measured.includes(file)),
			'fixed — delete these names in the same change that made the scope resolvable',
		).toEqual([]);
	});

	test('POSITIVE CONTROL: synthetic conflicts MUST fail the matcher', () => {
		const synthetic: CorpusCall[] = [
			{ file: 'test/unit/a.test.ts', line: 1, scope: ['testsyn1'] },
			{ file: 'test/unit/b.test.ts', line: 1, scope: ['testsyn1', 'testsyn2'] },
			{ file: 'test/unit/c.test.ts', line: 1, scope: 'unscoped' },
			{ file: 'test/unit/d.test.ts', line: 1, scope: 'unresolved' },
		];
		const ownership = corpusOwnership(synthetic);
		expect(sharedCorpusScopes(ownership)).toEqual([
			{ scope: 'testsyn1', owners: ['test/unit/a.test.ts', 'test/unit/b.test.ts'] },
		]);
		expect([...ownership.unscopedFiles]).toEqual(['test/unit/c.test.ts']);
		expect(ownership.unresolvedCalls.map((call) => call.file)).toEqual(['test/unit/d.test.ts']);
		// NEGATIVE control: a single-owner scope is NOT reported.
		expect(MEASURED_BY_SCOPE.has('testsyn2')).toBe(false);
		expect(sharedCorpusScopes(corpusOwnership([synthetic[0] as CorpusCall]))).toEqual([]);
	});

	test('ANTI-VACUITY: the census actually sees the corpus callers', () => {
		// Measured at the seed: 54 caller files, 27 distinct scope tipos, 100+
		// call sites. An emptied or broken scan must land RED here.
		expect(OWNERSHIP.allCallers.size).toBeGreaterThan(45);
		expect(OWNERSHIP.scopeFiles.size).toBeGreaterThan(20);
		expect(CALLS.length).toBeGreaterThan(90);
		// The evaluator must keep reading the real shapes: a const-array scope
		// (raw_view's CORPUS_SCOPE = [SAMPLE_SECTION_TIPO]) and a seed() scope
		// (relation_inverse's [TYPE_SECTION, seed('rsc', 205)]) both resolve —
		// the exact forms whose loss once flipped 80+ calls to `unresolved`.
		expect(OWNERSHIP.scopeFiles.get('testmint1')?.has('test/unit/raw_view.test.ts')).toBe(true);
		expect(
			OWNERSHIP.scopeFiles
				.get(seed('rsc', 205))
				?.has('test/parity/relation_inverse_differential.test.ts'),
		).toBe(true);
	});
});
