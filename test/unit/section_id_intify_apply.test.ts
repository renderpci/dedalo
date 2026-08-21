/**
 * APPLY GATE — the destructive half of the section_id→int sweep
 * (WC-2026-08-10-section-id-int-canonical, plan P3b).
 *
 * Drives scripts/migrate_section_id_locators.ts sweepSurface() on a SCRATCH
 * surface (matrix_test + a synthetic tipo, scope-restricted so sibling tests'
 * rows are untouched): the FOR-UPDATE re-read write path, external skip,
 * purge classes, dry-run non-mutation, idempotent rerun — and the D6.2
 * restore-path normalization (normalizeRestoredSectionIds against the live
 * test playground, whose test3 IS an external zenon section).
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { afterAll, describe, expect, test } from 'bun:test';
import { type SurfaceStats, sweepSurface } from '../../scripts/migrate_section_id_locators.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import {
	listExternalSectionTipos,
	normalizeRestoredSectionIds,
} from '../../src/core/update/transform/section_id_restore.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TABLE = 'matrix_test';
const SECTION_TIPO = 'zzsidint1';
/** Distinct id per case: parallel files must not collide on one scratch row. */
let nextId = 910800;
const usedIds: number[] = [];

const EXTERNAL = new Set(['test7342']);

function freshStats(): SurfaceStats {
	return { scanned: 0, changedRows: 0, converted: 0, purged: 0, findingsByClass: new Map() };
}

async function seed(relation: Record<string, unknown>): Promise<number> {
	const sectionId = nextId++;
	usedIds.push(sectionId);
	await cleanScratchRecord(SECTION_TIPO, sectionId, TABLE);
	await createScratchRecord(SECTION_TIPO, sectionId, { relation }, { table: TABLE });
	return sectionId;
}

async function storedRelation(sectionId: number): Promise<Record<string, unknown>> {
	const record = await readMatrixRecord(TABLE, SECTION_TIPO, sectionId);
	return (record?.columns.relation ?? {}) as Record<string, unknown>;
}

afterAll(async () => {
	for (const id of usedIds) {
		await cleanScratchRecord(SECTION_TIPO, id, TABLE);
	}
});

describe('sweepSurface — the write half, scope-restricted scratch surface', () => {
	test('APPLY converts string addresses, preserves external refs verbatim', async () => {
		const sectionId = await seed({
			zztest1: [
				{ id: 1, type: 'dd151', section_tipo: 'test6813', section_id: '7' },
				{ id: 2, type: 'dd151', section_tipo: 'test7342', section_id: '001338683' },
				{ id: 3, type: 'dd151', section_tipo: 'test6813', section_id: 12 },
			],
		});
		const stats = freshStats();
		await sweepSurface(TABLE, 'relation', 'id', { externalTipos: EXTERNAL }, true, stats, {
			sectionTipo: SECTION_TIPO,
		});
		const relation = await storedRelation(sectionId);
		const entries = relation.zztest1 as Record<string, unknown>[];
		expect(entries[0]?.section_id).toBe(7);
		expect(entries[1]?.section_id).toBe('001338683');
		expect(entries[2]?.section_id).toBe(12);
		expect(stats.converted).toBeGreaterThanOrEqual(1);
		expect(stats.changedRows).toBeGreaterThanOrEqual(1);
	});

	test('idempotence: a second APPLY over the same surface changes zero rows', async () => {
		const stats = freshStats();
		await sweepSurface(TABLE, 'relation', 'id', { externalTipos: EXTERNAL }, true, stats, {
			sectionTipo: SECTION_TIPO,
		});
		expect(stats.changedRows).toBe(0);
		expect(stats.converted).toBe(0);
	});

	test('DRY-RUN reports but writes nothing', async () => {
		const sectionId = await seed({
			zztest1: [{ id: 1, type: 'dd151', section_tipo: 'test6813', section_id: '55' }],
		});
		const stats = freshStats();
		await sweepSurface(
			TABLE,
			'relation',
			'id',
			{ externalTipos: EXTERNAL },
			false, // dry-run
			stats,
			{ sectionTipo: SECTION_TIPO },
		);
		expect(stats.changedRows).toBeGreaterThanOrEqual(1);
		const entries = (await storedRelation(sectionId)).zztest1 as Record<string, unknown>[];
		expect(entries[0]?.section_id).toBe('55'); // untouched
		// clean up the still-string row so the idempotence test above stays honest
		const applyStats = freshStats();
		await sweepSurface(TABLE, 'relation', 'id', { externalTipos: EXTERNAL }, true, applyStats, {
			sectionTipo: SECTION_TIPO,
		});
		expect(applyStats.converted).toBe(1);
	});

	test('purge classes remove ONLY adjudicated junk elements (D17)', async () => {
		const sectionId = await seed({
			zztest1: [
				{ id: 1, type: 'dd151', section_tipo: 'test6813', section_id: '' },
				{ id: 2, type: 'dd151', section_tipo: 'test6813', section_id: '9' },
				{ id: 3, type: 'dd151', section_tipo: 'test6813', section_id: 'tmp' },
			],
		});
		const stats = freshStats();
		await sweepSurface(
			TABLE,
			'relation',
			'id',
			{ externalTipos: EXTERNAL, purgeClasses: new Set(['empty']) },
			true,
			stats,
			{ sectionTipo: SECTION_TIPO },
		);
		const entries = (await storedRelation(sectionId)).zztest1 as Record<string, unknown>[];
		expect(entries).toHaveLength(2);
		expect(entries[0]?.section_id).toBe(9);
		expect(entries[1]?.section_id).toBe('tmp'); // token: reported, never purged
		expect(stats.purged).toBe(1);
		expect(stats.findingsByClass.get('token')?.count).toBe(1);
	});
});

describe('restore-path normalization (D6.2) + external resolution (D15)', () => {
	test('listExternalSectionTipos resolves the playground external section (test3/zenon)', async () => {
		const externalTipos = await listExternalSectionTipos();
		expect(externalTipos.has('test3')).toBe(true);
	});

	test('normalizeRestoredSectionIds converges a historical payload on the canonical form', async () => {
		const columns: Record<string, unknown> = {
			relation: {
				zztest1: [
					{ id: 1, type: 'dd151', section_tipo: 'test6813', section_id: '7' },
					{ id: 2, type: 'dd151', section_tipo: 'test3', section_id: '001338683' },
				],
			},
		};
		await normalizeRestoredSectionIds(columns);
		const entries = (columns.relation as Record<string, unknown[]>).zztest1 as Record<
			string,
			unknown
		>[];
		expect(entries[0]?.section_id).toBe(7);
		// test3 IS external on the playground — the padded remote id survives.
		expect(entries[1]?.section_id).toBe('001338683');
	});
});
