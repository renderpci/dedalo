/**
 * SCRATCH-TLD UNIQUENESS — every `zz*` scratch TLD has exactly ONE owner, and
 * the set of TLDs that violate that may only SHRINK.
 *
 * WHY THIS EXISTS (verified 2026-08-25).
 * `src/core/test_data/situations/situation.ts` validates only the SHAPE of a
 * scratch TLD (`/^zz[a-z]*$/`, RESERVED_TLD) — there is NO uniqueness check
 * anywhere in the engine — while `dropSituation` is TLD-WIDE DESTRUCTIVE:
 * `deleteTldNodes` + `DELETE FROM <table> WHERE section_tipo=$1` + the TM rows
 * + the `matrix_counter` row. Two test files sharing a zz TLD in different
 * processes: one deletes the other's ontology MID-RUN, and the victim's
 * failure names a missing node nowhere near the cause. The current
 * single-process runner serializes files, so the destruction is LATENT — this
 * gate exists so the Phase 3 shard partitioner inherits a named, shrink-only
 * debt instead of a landmine. Measured at the seed: 124 files carry a zz
 * literal across 165 TLDs; 20 TLDs are shared.
 *
 * ── THE OWNERSHIP RULE (one implementation: scripts/lib/test_components.ts) ──
 * A TLD is OWNED when exactly one file carries literals under it, or when
 * exactly one NAMED SHARED HELPER carries it and every other carrier IMPORTS
 * that helper (the helper is the owner; a consumer may spell the owner's tipos
 * in its assertions). Everything else is SHARED and must be listed below.
 *
 * The helper owners, VERIFIED against the tree at the seed (not assumed):
 * `test/helpers/{zzd_diffusion_fixture,zzbib_export_chain,zzexp_export_chain,
 * zzdif_diffusion_domain,observer_term_seed}.ts` each carry a scratch TLD
 * (zzd/zzbib/zzexp/zzdif/zzot). `acl_identity_fixture.ts` and
 * `hierarchy_pruning_fixture.ts` — named as owner candidates in the Phase 2
 * plan — own NO scratch TLD: their `zzacl`/`zzhp` tokens are record VALUES
 * (usernames, labels) in the reserved >=900000 id band, not ontology tipos,
 * and the census correctly does not count them.
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - The census reads SOURCE literals (comment-stripped). A tipo assembled
 *    from fragments (`'zz' + suffix`) is invisible — no file does that today,
 *    and doing it to dodge this gate would be adversarial, which a tripwire
 *    does not defend against (AGENTS.md: tripwires stop ACCIDENTS).
 *  - Sharing is a CO-LOCATION hazard, not proof of corruption today; the
 *    baseline is the honest record of the debt, not an approval list. Fixing
 *    an entry means giving the TLD one owner (usually: rename one side's TLD,
 *    or extract a shared helper) — never editing this list to get green.
 *
 * A LISTED ENTRY THAT HAS BECOME UNSHARED IS RED TOO (the mock_isolation
 * pattern): the list can only shrink, and it shrinks in the same commit that
 * fixes the sharing.
 *
 * HERMETIC: filesystem reads of tracked test source. No DB, no network.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
	censusFiles,
	classifySharedTlds,
	helperImportClosure,
	isHelperFile,
	zzTldCarriers,
} from '../../scripts/lib/test_components.ts';

/**
 * SHRINK-ONLY BASELINE, seeded from the tree 2026-08-25. Each entry PINS the
 * exact carrier set: a NEW carrier joining an already-shared TLD is refused
 * (sharing may not deepen), and a carrier that leaves must shrink the entry in
 * the same commit. `reason` records what the sharing IS, so the fix is legible.
 */
const SHARED_TLD_BASELINE: readonly { tld: string; carriers: readonly string[]; reason: string }[] =
	[
		{
			tld: 'zz',
			reason:
				'the bare reserved TLD: ontology/hierarchy/diffusion gates mint zz1-style scratch tipos directly, and generic_tld_tripwire spells it as its own scan grammar — 14 files, the widest split pending',
			carriers: [
				'test/unit/diffusion_rdfxml_writers.test.ts',
				'test/unit/diffusion_retry_queue_native.test.ts',
				'test/unit/generic_tld_tripwire.test.ts',
				'test/unit/hierarchy_generate_native.test.ts',
				'test/unit/hierarchy_state_native.test.ts',
				'test/unit/install_hierarchy_activate_native.test.ts',
				'test/unit/install_hierarchy_tools.test.ts',
				'test/unit/ontology_data_io.test.ts',
				'test/unit/ontology_delete_tld_native.test.ts',
				'test/unit/ontology_ingest.test.ts',
				'test/unit/ontology_update_restore_message_native.test.ts',
				'test/unit/ontology_update_schema_capture_native.test.ts',
				'test/unit/ontology_update_target_native.test.ts',
				'test/unit/search_date_and_ancestors_native.test.ts',
			],
		},
		{
			tld: 'zzabsent',
			reason: 'two gates independently spell an intentionally-absent tipo under the same TLD',
			carriers: [
				'test/unit/diffusion_compile_degrade_native.test.ts',
				'test/unit/section_elements_context_native.test.ts',
			],
		},
		{
			tld: 'zzbk',
			reason: 'ontology-delete backup drill and the tier-1 install drill mint the same backup TLD',
			carriers: [
				'test/unit/ontology_delete_tld_native.test.ts',
				'test/unit/tier1_install_native.test.ts',
			],
		},
		{
			tld: 'zzc',
			reason: 'three unrelated gates picked the same one-letter suffix for their scratch TLD',
			carriers: [
				'test/unit/database_info_consolidate_native.test.ts',
				'test/unit/diffusion_compile_degrade_native.test.ts',
				'test/unit/ontology_state_foreign_tld.test.ts',
			],
		},
		{
			tld: 'zzcnt',
			reason: 'count_native and get_element_context_native share the counter-scratch TLD',
			carriers: ['test/unit/count_native.test.ts', 'test/unit/get_element_context_native.test.ts'],
		},
		{
			tld: 'zzd',
			reason:
				'owned by test/helpers/zzd_diffusion_fixture.ts, but six files spell zzd tipos WITHOUT importing the owner — the diffusion cluster the Phase 2 finding measured as zzd0/zzd1/zzd4/zzd9/zzd7',
			carriers: [
				'test/helpers/zzd_diffusion_fixture.ts',
				'test/unit/diffusion_delete.test.ts',
				'test/unit/diffusion_delete_outcomes_native.test.ts',
				'test/unit/diffusion_retry_queue_native.test.ts',
				'test/unit/ontology_state_foreign_tld.test.ts',
				'test/unit/ontology_update_schema_capture_native.test.ts',
				'test/unit/ontology_update_shell_native.test.ts',
			],
		},
		{
			tld: 'zzdf',
			reason: 'two dataframe gates mint the same scratch TLD for their frame fixtures',
			carriers: [
				'test/unit/relations_save_dataframe_identity_native.test.ts',
				'test/unit/tool_export_raw_dataframe_native.test.ts',
			],
		},
		{
			tld: 'zzq',
			reason:
				'the situation module’s own gates plus test_db_marker_tripwire and transform_engine all reuse the situation-native example TLD',
			carriers: [
				'test/unit/situation_native.test.ts',
				'test/unit/test_db_marker_tripwire.test.ts',
				'test/unit/test_tld_ontology_gate.test.ts',
				'test/unit/tld.test.ts',
				'test/unit/transform_engine.test.ts',
			],
		},
		{
			tld: 'zzque',
			reason: 'the two upload-queue client gates share one queue-scratch TLD',
			carriers: [
				'test/unit/client_upload_queue.test.ts',
				'test/unit/client_upload_queue_render.test.ts',
			],
		},
		{
			tld: 'zzr',
			reason: 'a parity regenerate gate and two unit gates picked the same one-letter suffix',
			carriers: [
				'test/parity/regenerate_differential.test.ts',
				'test/unit/diffusion_delete.test.ts',
				'test/unit/relation_list_dataframe_cell_native.test.ts',
			],
		},
		{
			tld: 'zzreg',
			reason: 'model_section_native and request_config_source_cases share a registry-scratch TLD',
			carriers: [
				'test/unit/model_section_native.test.ts',
				'test/unit/request_config_source_cases.test.ts',
			],
		},
		{
			tld: 'zzsit',
			reason:
				'situation_native mints it; generic_tld_tripwire spells it in its own self-test grammar',
			carriers: ['test/unit/generic_tld_tripwire.test.ts', 'test/unit/situation_native.test.ts'],
		},
		{
			tld: 'zzt',
			reason:
				'eight ontology/transform gates all mint the obvious “zz-test” TLD — the largest raw collision after bare zz',
			carriers: [
				'test/unit/dd_ontology_write.test.ts',
				'test/unit/fixed_filter_expansion_native.test.ts',
				'test/unit/ontology_census_native.test.ts',
				'test/unit/ontology_recovery_file_native.test.ts',
				'test/unit/sibling_order_write_native.test.ts',
				'test/unit/transform_lang_native.test.ts',
				'test/unit/transform_tables_native.test.ts',
				'test/unit/ts_node_repository_native.test.ts',
			],
		},
		{
			tld: 'zztc',
			reason: 'ontology_census_native and widget_request_native share a census-scratch TLD',
			carriers: [
				'test/unit/ontology_census_native.test.ts',
				'test/unit/widget_request_native.test.ts',
			],
		},
		{
			tld: 'zztest',
			reason: 'user_stats_paging and with_transaction share the same scratch section TLD',
			carriers: ['test/unit/user_stats_paging.test.ts', 'test/unit/with_transaction.test.ts'],
		},
		{
			tld: 'zzti',
			reason: 'ontology_census_native and tags_info share a TLD',
			carriers: ['test/unit/ontology_census_native.test.ts', 'test/unit/tags_info.test.ts'],
		},
		{
			tld: 'zztl',
			reason: 'ontology_census_native and ontology_tld_native share a TLD',
			carriers: [
				'test/unit/ontology_census_native.test.ts',
				'test/unit/ontology_tld_native.test.ts',
			],
		},
		{
			tld: 'zztm',
			reason:
				'ontology_census_native and ontology_tld_native share a second TLD (the zztm x3 of the Phase 2 finding, minus the helper-owned consumer)',
			carriers: [
				'test/unit/ontology_census_native.test.ts',
				'test/unit/ontology_tld_native.test.ts',
			],
		},
		{
			tld: 'zztws',
			reason: 'tools_register_write and ws_a_write_path share the tools-write scratch TLD',
			carriers: ['test/unit/tools_register_write.test.ts', 'test/unit/ws_a_write_path.test.ts'],
		},
		{
			tld: 'zzz',
			reason: 'three gates picked the maximally-lazy TLD spelling',
			carriers: [
				'test/unit/ddinfo_from_ddo_native.test.ts',
				'test/unit/mcp_discovery.test.ts',
				'test/unit/tool_ontology_scope.test.ts',
			],
		},
	];

const CARRIERS = zzTldCarriers();
const CLOSURE = helperImportClosure();
const MEASURED = classifySharedTlds(CARRIERS, CLOSURE);
const MEASURED_BY_TLD = new Map(MEASURED.map((entry) => [entry.tld, entry]));
const BASELINE_BY_TLD = new Map(SHARED_TLD_BASELINE.map((entry) => [entry.tld, entry]));

describe('scratch zz TLD uniqueness — one owner per TLD (shrink-only)', () => {
	test('NO NEW shared TLD, and NO NEW carrier on an already-shared one', () => {
		const violations: string[] = [];
		for (const entry of MEASURED) {
			const pinned = BASELINE_BY_TLD.get(entry.tld);
			if (pinned === undefined) {
				violations.push(`NEW shared TLD '${entry.tld}': ${entry.carriers.join(', ')}`);
				continue;
			}
			const extra = entry.carriers.filter((file) => !pinned.carriers.includes(file));
			if (extra.length > 0) {
				violations.push(`TLD '${entry.tld}' gained carriers: ${extra.join(', ')}`);
			}
		}
		expect(
			violations,
			'dropSituation is TLD-WIDE destructive and situation.ts checks only the SHAPE of a zz TLD — ' +
				'two files on one TLD in parallel processes destroy each other. Mint a fresh TLD ' +
				'(or extract a shared test/helpers fixture that owns it and import it) instead of joining an existing one.',
		).toEqual([]);
	});

	test('the baseline is LIVE — an unshared entry or a departed carrier is red too', () => {
		const stale: string[] = [];
		for (const pinned of SHARED_TLD_BASELINE) {
			const measured = MEASURED_BY_TLD.get(pinned.tld);
			if (measured === undefined) {
				stale.push(`'${pinned.tld}' is no longer shared — delete its entry`);
				continue;
			}
			const gone = pinned.carriers.filter((file) => !measured.carriers.includes(file));
			if (gone.length > 0) {
				stale.push(`'${pinned.tld}' no longer carried by: ${gone.join(', ')} — shrink the entry`);
			}
		}
		expect(stale, 'fixed — shrink these entries in the same change that fixed them').toEqual([]);
	});

	test('POSITIVE CONTROL: a synthetic second owner MUST fail the matcher', () => {
		// Two plain test files on one TLD.
		const twoFiles = classifySharedTlds(
			new Map([['zzsyn', new Set(['test/unit/a.test.ts', 'test/unit/b.test.ts'])]]),
			new Map(),
		);
		expect(twoFiles).toEqual([
			{
				tld: 'zzsyn',
				carriers: ['test/unit/a.test.ts', 'test/unit/b.test.ts'],
				why: 'multiple-carriers',
			},
		]);
		// A helper owner whose consumer does NOT import it: still shared.
		const orphanConsumer = classifySharedTlds(
			new Map([['zzsyn', new Set(['test/helpers/syn_fixture.ts', 'test/unit/a.test.ts'])]]),
			new Map([['test/unit/a.test.ts', new Set<string>()]]),
		);
		expect(orphanConsumer.map((entry) => entry.why)).toEqual(['carrier-outside-helper-consumers']);
		// Two helpers on one TLD: shared no matter who imports whom.
		const twoHelpers = classifySharedTlds(
			new Map([['zzsyn', new Set(['test/helpers/a_fixture.ts', 'test/helpers/b_fixture.ts'])]]),
			new Map(),
		);
		expect(twoHelpers.map((entry) => entry.why)).toEqual(['multiple-helper-carriers']);
		// NEGATIVE control: the helper-ownership branch must acquit a consumer
		// that DOES import the owner — otherwise every fixture consumer would be
		// baselined and the helper convention would be dead.
		const properConsumer = classifySharedTlds(
			new Map([['zzsyn', new Set(['test/helpers/syn_fixture.ts', 'test/unit/a.test.ts'])]]),
			new Map([['test/unit/a.test.ts', new Set(['test/helpers/syn_fixture.ts'])]]),
		);
		expect(properConsumer).toEqual([]);
	});

	test('ANTI-VACUITY: the census actually sees the tree', () => {
		// Measured at the seed: 165 TLDs across 124 carrier files. A broken glob,
		// a broken literal matcher or an emptied scan must land RED here, never
		// green above.
		expect(CARRIERS.size).toBeGreaterThan(120);
		const carrierFiles = new Set([...CARRIERS.values()].flatMap((set) => [...set]));
		expect(carrierFiles.size).toBeGreaterThan(90);
		expect(censusFiles().length).toBeGreaterThan(700);
		// The helper-ownership branch is exercised by REAL data, not only by the
		// synthetic control: zzdif is carried by its helper alone and consumed
		// through imports, so it must be measured OWNED (absent from the shared
		// set) while the helper exists and is imported by at least one test file.
		const zzdifOwner = 'test/helpers/zzdif_diffusion_domain.ts';
		expect(existsSync(join(import.meta.dir, '..', '..', zzdifOwner))).toBe(true);
		expect([...(CARRIERS.get('zzdif') ?? [])]).toEqual([zzdifOwner]);
		expect(MEASURED_BY_TLD.has('zzdif')).toBe(false);
		const importers = [...CLOSURE.entries()].filter(
			([file, helpers]) => !isHelperFile(file) && helpers.has(zzdifOwner),
		);
		expect(importers.length).toBeGreaterThanOrEqual(2);
	});
});
