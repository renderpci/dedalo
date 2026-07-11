/**
 * Diffusion unpublish — target resolution (read-only vs the REAL diffusion
 * ontology) + the native executor contract: since the 2026-07-11 cutover
 * (DIFFUSION_PLAN P5 step 3) deleteDiffusionRecord routes sql targets ONLY
 * through the registered in-process executor (registerNativeDiffusionSqlDelete)
 * — a stubbed executor here asserts the exact engine-wire target shape
 * {database_name, table_name, section_ids, section_tipo}, the DEC-19
 * no-executor pending posture, and the dd1758 retry queue (retryPendingDiffusion
 * flips pending rows in place once the executor confirms — DIFFU-08).
 */

import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
	DIFFUSION_ACTIVITY_TABLE,
	type NativeSqlDeleteTarget,
	deleteDiffusionRecord,
	registerNativeDiffusionSqlDelete,
	resetNativeDiffusionSqlDeleteForTests,
} from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import { getSectionDiffusionTargets } from '../../src/core/diffusion_bridge/diffusion_map.ts';

// The executor seam is module-level process state shared across test files —
// never leave a stub behind (diffusion_native_delete.test.ts hygiene).
afterEach(() => {
	resetNativeDiffusionSqlDeleteForTests();
});

afterAll(async () => {
	resetNativeDiffusionSqlDeleteForTests();
	// reclaim the dd1758 log rows the synthetic unpublish calls write — on the
	// SCRATCH activity table (the preload seam; never matrix_activity_diffusion)
	const { sql } = await import('../../src/core/db/postgres.ts');
	for (const probeId of ['999998', '999999']) {
		await sql.unsafe(
			`DELETE FROM "${DIFFUSION_ACTIVITY_TABLE}"
			 WHERE section_tipo = 'dd1758'
			   AND relation->'dd1763' @> $1::text::jsonb`,
			[JSON.stringify([{ section_id: probeId, section_tipo: 'numisdata6' }])],
		);
	}
});

describe('diffusion unpublish', () => {
	test('numisdata6 resolves its REAL publish targets (mints tables)', async () => {
		const targets = await getSectionDiffusionTargets('numisdata6');
		const sqlTargets = targets.filter((t) => t.type === 'sql');
		expect(sqlTargets.map((t) => `${t.database_name}|${t.table_name}`).sort()).toEqual([
			'web_numisdata_mib_pre|mints',
			'web_numisdata_mib|mints',
		]);
		// test bench has NO diffusion.
		expect(await getSectionDiffusionTargets('test3')).toEqual([]);
	});

	test('the native executor receives the engine-wire shape and confirms deletions', async () => {
		const received: NativeSqlDeleteTarget[][] = [];
		registerNativeDiffusionSqlDelete(async (targets) => {
			received.push(targets);
			return {
				deleted: targets.map((t) => `${t.database_name}|${t.table_name}`),
				errors: [],
			};
		});

		const outcome = await deleteDiffusionRecord('numisdata6', 999999);
		expect(received.length).toBe(1);
		const targets = received[0] ?? [];
		expect(targets.length).toBe(2);
		expect(targets[0]).toEqual({
			database_name: 'web_numisdata_mib',
			table_name: 'mints',
			section_ids: [999999],
			section_tipo: 'numisdata6',
		});
		expect(outcome.deleted.sort()).toEqual([
			'web_numisdata_mib_pre|mints',
			'web_numisdata_mib|mints',
		]);
		expect(outcome.pending).toEqual([]);
	});

	test('no executor registered → sql targets become pending, never throws (DEC-19)', async () => {
		resetNativeDiffusionSqlDeleteForTests();
		// synthetic record id — its dd1758 rows are reclaimed in afterAll
		const outcome = await deleteDiffusionRecord('numisdata6', 999998);
		expect(outcome.deleted).toEqual([]);
		expect(outcome.pending.length).toBeGreaterThan(0);
	});
});

// dd1758 retry queue: a failing unpublish writes unpublish_pending (3) rows
// per element; retryPendingDiffusion re-runs against a now-working native
// executor and flips them IN PLACE to unpublished (2) — the PHP retry_pending
// + DIFFU-08 contract.
describe('diffusion pending retry queue (dd1758)', () => {
	const rowIds: number[] = [];

	afterAll(async () => {
		const { sql } = await import('../../src/core/db/postgres.ts');
		for (const id of rowIds) {
			await sql.unsafe(
				`DELETE FROM "${DIFFUSION_ACTIVITY_TABLE}" WHERE section_tipo = 'dd1758' AND section_id = $1`,
				[id],
			);
		}
	});

	test('fail → pending rows; retry against a working executor → flipped to unpublished', async () => {
		const { sql } = await import('../../src/core/db/postgres.ts');
		const { deleteDiffusionRecord, retryPendingDiffusion } = await import(
			'../../src/core/diffusion_bridge/diffusion_delete.ts'
		);
		const PROBE_ID = 987654; // synthetic record id — never a real numisdata6 id

		// purge PENDING leftovers previously interrupted runs may have stranded
		// ANYWHERE in the scratch table (this is the per-run test twin — the
		// dedalo_ts_test_ guard means these are never real dd1758 rows): stale
		// pending rows older than our probe rows starve the oldest-first
		// LIMIT in retryPendingDiffusion (the ledgered intermittent).
		await sql.unsafe(
			`DELETE FROM "${DIFFUSION_ACTIVITY_TABLE}"
			 WHERE section_tipo = 'dd1758'
			   AND relation->'dd1767' @> '[{"section_id":"3","section_tipo":"dd1774"}]'`,
		);
		await sql.unsafe(
			`DELETE FROM "${DIFFUSION_ACTIVITY_TABLE}"
			 WHERE section_tipo = 'dd1758' AND relation->'dd1763' @> $1::text::jsonb`,
			[JSON.stringify([{ section_id: String(PROBE_ID), section_tipo: 'numisdata6' }])],
		);

		// Phase 1: executor that confirms NOTHING → every element goes pending.
		registerNativeDiffusionSqlDelete(async () => ({
			deleted: [],
			errors: ['stub outage'],
		}));
		const first = await deleteDiffusionRecord('numisdata6', PROBE_ID);
		expect(first.deleted).toEqual([]);
		expect(first.pending.length).toBeGreaterThan(0);

		const pendingRows = (await sql.unsafe(
			`SELECT section_id, relation->'dd1766'->0->>'section_tipo' AS element_section,
			        string->'dd1765'->0->>'value' AS where_tipo,
			        number->'dd1764'->0->'value' AS record_id
			 FROM "${DIFFUSION_ACTIVITY_TABLE}"
			 WHERE section_tipo = 'dd1758'
			   AND relation->'dd1767' @> '[{"section_id":"3","section_tipo":"dd1774"}]'
			   AND relation->'dd1763' @> '[{"section_id":"987654","section_tipo":"numisdata6"}]'
			 ORDER BY section_id`,
		)) as Record<string, unknown>[];
		expect(pendingRows.length).toBe(2); // one per sql element (mib + mib_pre)
		for (const row of pendingRows) {
			rowIds.push(Number(row.section_id));
			expect(row.element_section).toBe('numisdata0'); // ontology-node locator
			expect(row.where_tipo).toBe('numisdata6');
			expect(Number(row.record_id)).toBe(PROBE_ID);
		}

		// Phase 2: executor recovers → retry flips the rows in place.
		registerNativeDiffusionSqlDelete(async (targets) => ({
			deleted: targets.map((t) => `${t.database_name}|${t.table_name}`),
			errors: [],
		}));
		const retry = await retryPendingDiffusion(10);
		expect(retry.retried).toBeGreaterThanOrEqual(2);

		const flipped = (await sql.unsafe(
			`SELECT relation->'dd1767'->0->>'section_id' AS action
			 FROM "${DIFFUSION_ACTIVITY_TABLE}"
			 WHERE section_tipo = 'dd1758' AND section_id = ANY($1::int[])`,
			[`{${rowIds.join(',')}}`],
		)) as { action: string }[];
		expect(flipped.map((row) => row.action)).toEqual(['2', '2']); // unpublished
	}, 30000);
});

// File-element unlinks: the rdf path derives from the element's
// service_name + the section's owl:Class term
// ('nmo:TypeSeriesItem' → 'nmo-typeseriesitem-…​.rdf' after sanitize);
// legacy '{base}_*.rdf' variants unlink too; a missing service_name (the
// LIVE numisdata325 config) is unresolvable → pending.
describe('diffusion published-file unlinks', () => {
	const FILE_ROOT = `${tmpdir()}/dedalo_ts_diffusion_files_${process.pid}`;

	afterAll(() => {
		rmSync(FILE_ROOT, { recursive: true, force: true });
	});

	test('live rdf element without service_name resolves to pending', async () => {
		const { resolvePublishedFilePath, unlinkPublishedFiles } = await import(
			'../../src/core/diffusion_bridge/diffusion_delete.ts'
		);
		// numisdata325 (the real rdf element) declares NO service_name.
		expect(await resolvePublishedFilePath('numisdata325', 'rdf', 'numisdata3', 1, FILE_ROOT)).toBe(
			null,
		);
		expect(await unlinkPublishedFiles('numisdata325', 'rdf', 'numisdata3', 1, FILE_ROOT)).toBe(
			false,
		);
	});

	test('sanitize + unlink flow (canonical + legacy variants, idempotent)', async () => {
		const { sanitizePublishedFileName, unlinkPublishedFiles } = await import(
			'../../src/core/diffusion_bridge/diffusion_delete.ts'
		);
		const { sql } = await import('../../src/core/db/postgres.ts');
		const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');

		expect(sanitizePublishedFileName('nmo:TypeSeriesItem_numisdata3_15657')).toBe(
			'nmotypeseriesitem-numisdata3-15657',
		);

		// Provision a synthetic rdf element WITH a service_name + owl:Class.
		await sql.unsafe(
			`INSERT INTO dd_ontology (tipo, parent, model, term, tld, is_model, is_translatable, is_main, order_number, properties)
			 VALUES ('zzr1', 'dd1190', 'diffusion_element', '{"lg-spa":"zzr element"}'::jsonb, 'zzr', false, false, false, 1,
			         '{"diffusion":{"type":"rdf","service_name":"testsvc"}}'::text::jsonb),
			        ('zzr2', 'zzr1', 'owl:Class', '{"lg-spa":"nmo:TestClass"}'::jsonb, 'zzr', false, false, false, 1, NULL)`,
		);
		await sql.unsafe(
			`UPDATE dd_ontology SET relations = '[{"tipo":"test3"}]'::jsonb WHERE tipo = 'zzr2'`,
		);
		try {
			const dir = `${FILE_ROOT}/rdf/testsvc`;
			mkdirSync(dir, { recursive: true });
			writeFileSync(`${dir}/nmotestclass-test3-7.rdf`, 'x'); // canonical
			writeFileSync(`${dir}/nmotestclass-test3-7_2024.rdf`, 'x'); // legacy
			writeFileSync(`${dir}/nmotestclass-test3-8.rdf`, 'x'); // OTHER record

			expect(await unlinkPublishedFiles('zzr1', 'rdf', 'test3', 7, FILE_ROOT)).toBe(true);
			expect(existsSync(`${dir}/nmotestclass-test3-7.rdf`)).toBe(false);
			expect(existsSync(`${dir}/nmotestclass-test3-7_2024.rdf`)).toBe(false);
			expect(existsSync(`${dir}/nmotestclass-test3-8.rdf`)).toBe(true); // untouched
			// idempotent second run
			expect(await unlinkPublishedFiles('zzr1', 'rdf', 'test3', 7, FILE_ROOT)).toBe(true);
			// xml/markdown scheme
			mkdirSync(`${FILE_ROOT}/markdown/testsvc`, { recursive: true });
			writeFileSync(`${FILE_ROOT}/markdown/testsvc/test3_7.md`, 'x');
			expect(await unlinkPublishedFiles('zzr1', 'markdown', 'test3', 7, FILE_ROOT)).toBe(true);
			expect(existsSync(`${FILE_ROOT}/markdown/testsvc/test3_7.md`)).toBe(false);
		} finally {
			await sql.unsafe(`DELETE FROM dd_ontology WHERE tld = 'zzr'`);
		}
	});
});
