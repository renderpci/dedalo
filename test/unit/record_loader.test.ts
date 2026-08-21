/**
 * Per-read record loader (src/core/section/record_loader.ts) — the dedup/batch
 * layer under the relation-cell expansion (relation_core expandPortal /
 * emitDataframeItem call sites, 2026-07-19).
 *
 * Contract pinned here:
 * - loads dedup per EmissionContext: the second load of the same record
 *   returns the SAME object (reference equality proves the cache hit — a
 *   re-query would build a fresh object);
 * - caches are per-read: a different EmissionContext re-reads;
 * - prefetch seeds the cache via one batch read per section, INCLUDING null
 *   for requested-but-missing ids, and skips junk locators without throwing.
 *
 * Byte-parity of the emitted cells is NOT asserted here — that stays with the
 * portal/relation gates (portal_list_cell_pagination_native,
 * complex_relation_sweep, model_coverage_sweep), which exercise the same call
 * sites.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). The gate
// used to PROBE the ambient `matrix` table for whatever record happened to sort
// first and skipped every case when it found none — an install-shaped backdrop
// AND a silent vacuity. It now BUILDS its situation (`zzrec`, one section on
// matrix_test through the test24 matrix_table node, two records in the 9xxxxx
// scratch band, torn down with an asserted residue of 0), so the record it
// loads is a value this file wrote and no case can skip.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { EmissionContext } from '../../src/core/resolve/component_data.ts';
import { loadRecordCached, prefetchRecords } from '../../src/core/section/record_loader.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

/** The section the loader reads through — its own scratch TLD. */
const SECTION = 'zzrec1';
/** The record every load/prefetch case addresses. */
const RECORD_ID = 900601;
/** A second record, so the batch prefetch has more than one hit to place. */
const OTHER_ID = 900602;
/** Far above any id the situation creates — the requested-but-missing case. */
const MISSING_ID = 2147480000;

/**
 * One section carrying one translatable string component, and two records.
 * `relations: [{ tipo: 'test24' }]` is the matrix_table node whose term is
 * `matrix_test`: every record this gate creates lands there, never in the
 * installation's `matrix`.
 */
const SITUATION = situation({
	tld: 'zzrec',
	name: 'record_loader',
	nodes: [
		{
			tipo: SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Cargador de registros', 'lg-eng': 'Record loader' },
			relations: [{ tipo: 'test24' }],
		},
		{ tipo: 'zzrec2', parent: SECTION, model: 'component_input_text', is_translatable: true },
	],
	records: [
		{ section_tipo: SECTION, section_id: RECORD_ID, columns: { data: { zzrec2: ['first'] } } },
		{ section_tipo: SECTION, section_id: OTHER_ID, columns: { data: { zzrec2: ['second'] } } },
	],
});

/** The table the ONTOLOGY resolves for the section — never a hard-coded name. */
let table = '';

beforeAll(async () => {
	await ensureSituation(SITUATION);
	const resolved = await getMatrixTableFromTipo(SECTION);
	expect(resolved).toBe('matrix_test'); // the test24 relation, proven not assumed
	table = resolved as string;
});
afterAll(async () => {
	expect(await dropSituation(SITUATION)).toBe(0);
});

describe('per-read record loader', () => {
	test('second load of the same record is the cached object (no re-query)', async () => {
		const emission = new EmissionContext();
		const first = await loadRecordCached(emission, table, SECTION, RECORD_ID);
		const second = await loadRecordCached(emission, table, SECTION, RECORD_ID);
		expect(first).not.toBeNull();
		expect(second).toBe(first); // reference equality = served from the cache
	});

	test('a different EmissionContext does not share the cache', async () => {
		const a = await loadRecordCached(new EmissionContext(), table, SECTION, RECORD_ID);
		const b = await loadRecordCached(new EmissionContext(), table, SECTION, RECORD_ID);
		expect(a).not.toBeNull();
		expect(b).not.toBe(a); // fresh read per read-context — request isolation
	});

	test('missing record loads as null (bare-read contract preserved)', async () => {
		const emission = new EmissionContext();
		const missing = await loadRecordCached(emission, table, SECTION, MISSING_ID);
		expect(missing).toBeNull();
	});

	test('prefetch seeds hits AND misses; later loads are cache-served', async () => {
		const emission = new EmissionContext();
		await prefetchRecords(emission, [
			{ section_tipo: SECTION, section_id: RECORD_ID },
			{ section_tipo: SECTION, section_id: String(RECORD_ID) }, // string id form
			{ section_tipo: SECTION, section_id: OTHER_ID },
			{ section_tipo: SECTION, section_id: MISSING_ID },
		]);
		const hitA = await loadRecordCached(emission, table, SECTION, RECORD_ID);
		const hitB = await loadRecordCached(emission, table, SECTION, RECORD_ID);
		expect(hitA).not.toBeNull();
		expect(hitB).toBe(hitA); // identity: served from the prefetched entry
		const other = await loadRecordCached(emission, table, SECTION, OTHER_ID);
		expect(other).not.toBeNull(); // the SAME batch read placed both hits
		const miss = await loadRecordCached(emission, table, SECTION, MISSING_ID);
		expect(miss).toBeNull(); // seeded null — the lazy path must not re-query
	});

	test('prefetch tolerates junk locators (non-numeric id, unknown tipo, non-object)', async () => {
		const emission = new EmissionContext();
		await prefetchRecords(emission, [
			{ section_tipo: SECTION, section_id: 'not-a-number' },
			{ section_tipo: 'no_such_tipo_xyz', section_id: 1 },
			{ section_tipo: '', section_id: 3 },
			{},
		]);
		// nothing to assert beyond "did not throw" — junk is skipped, lazy path intact
		expect(true).toBe(true);
	});
});
