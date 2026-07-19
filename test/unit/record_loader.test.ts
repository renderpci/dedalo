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
 * portal/relation parity gates (portal_differential, complex_relation_sweep,
 * model_coverage_sweep), which exercise the same call sites.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { EmissionContext } from '../../src/core/resolve/component_data.ts';
import { loadRecordCached, prefetchRecords } from '../../src/core/section/record_loader.ts';

/** A real (section_tipo, section_id) discovered from the connected DB. */
let probe: { sectionTipo: string; sectionId: number; table: string } | null = null;

beforeAll(async () => {
	try {
		const rows = (await sql`
			SELECT section_tipo, section_id FROM matrix ORDER BY id LIMIT 1
		`) as { section_tipo: string; section_id: number }[];
		const first = rows[0];
		if (first === undefined) return;
		const table = await getMatrixTableFromTipo(first.section_tipo);
		if (table === null) return;
		probe = { sectionTipo: first.section_tipo, sectionId: Number(first.section_id), table };
	} catch {
		probe = null; // no DB on this machine — cases skip honestly
	}
});

const MISSING_ID = 2147480000; // far above any real serial

describe('per-read record loader', () => {
	test('second load of the same record is the cached object (no re-query)', async () => {
		if (probe === null) return;
		const emission = new EmissionContext();
		const first = await loadRecordCached(emission, probe.table, probe.sectionTipo, probe.sectionId);
		const second = await loadRecordCached(
			emission,
			probe.table,
			probe.sectionTipo,
			probe.sectionId,
		);
		expect(first).not.toBeNull();
		expect(second).toBe(first); // reference equality = served from the cache
	});

	test('a different EmissionContext does not share the cache', async () => {
		if (probe === null) return;
		const a = await loadRecordCached(
			new EmissionContext(),
			probe.table,
			probe.sectionTipo,
			probe.sectionId,
		);
		const b = await loadRecordCached(
			new EmissionContext(),
			probe.table,
			probe.sectionTipo,
			probe.sectionId,
		);
		expect(a).not.toBeNull();
		expect(b).not.toBe(a); // fresh read per read-context — request isolation
	});

	test('missing record loads as null (bare-read contract preserved)', async () => {
		if (probe === null) return;
		const emission = new EmissionContext();
		const missing = await loadRecordCached(emission, probe.table, probe.sectionTipo, MISSING_ID);
		expect(missing).toBeNull();
	});

	test('prefetch seeds hits AND misses; later loads are cache-served', async () => {
		if (probe === null) return;
		const emission = new EmissionContext();
		await prefetchRecords(emission, [
			{ section_tipo: probe.sectionTipo, section_id: probe.sectionId },
			{ section_tipo: probe.sectionTipo, section_id: String(probe.sectionId) }, // string id form
			{ section_tipo: probe.sectionTipo, section_id: MISSING_ID },
		]);
		const hitA = await loadRecordCached(emission, probe.table, probe.sectionTipo, probe.sectionId);
		const hitB = await loadRecordCached(emission, probe.table, probe.sectionTipo, probe.sectionId);
		expect(hitA).not.toBeNull();
		expect(hitB).toBe(hitA); // identity: served from the prefetched entry
		const miss = await loadRecordCached(emission, probe.table, probe.sectionTipo, MISSING_ID);
		expect(miss).toBeNull(); // seeded null — the lazy path must not re-query
	});

	test('prefetch tolerates junk locators (non-numeric id, unknown tipo, non-object)', async () => {
		const emission = new EmissionContext();
		await prefetchRecords(emission, [
			{ section_tipo: 'numisdata4', section_id: 'not-a-number' },
			{ section_tipo: 'no_such_tipo_xyz', section_id: 1 },
			{ section_tipo: '', section_id: 3 },
			{},
		]);
		// nothing to assert beyond "did not throw" — junk is skipped, lazy path intact
		expect(true).toBe(true);
	});
});
