/**
 * move_* transform engine (UPDATE_PROCESS Phase 5, WC-025) — pure-logic units
 * (locator rebasing, definition-file confinement, dry-run report), safe
 * DRY-RUN smoke over the real DB with NON-EXISTENT scratch tipos (SELECT-only,
 * zero writes), and a real EXECUTE of changes_in_tipos on the matrix_test
 * scratch table (no live data carries the zzt* tipos, cleaned up after).
 * Portalize/locators EXECUTE against live sections is an operator drill
 * (ledgered) — the dry-run + the recorder logic are the automated surface.
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEnv } from '../../src/config/env.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { rebaseLocatorsInValue } from '../../src/core/update/transform/locator_rewrite.ts';
import { TransformRecorder } from '../../src/core/update/transform/report.ts';
import { executeChangesInTipos } from '../../src/core/update/transform/tipos.ts';

const SCRATCH_ROOT = join(
	readEnv('TMPDIR') ?? '/tmp',
	`dedalo_transform_${process.pid}_${Math.random().toString(36).slice(2)}`,
);
afterAll(() => rmSync(SCRATCH_ROOT, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// locator rebasing (pure)
// ---------------------------------------------------------------------------

describe('rebaseLocatorsInValue', () => {
	test('rebases matching locators, offsets section_id, preserves shape', () => {
		const value = {
			rsc99: [
				{ section_tipo: 'rsc194', section_id: 5, from_component_tipo: 'rsc99', type: 'dd151' },
				{ section_tipo: 'rsc300', section_id: 7 }, // unrelated — untouched
			],
			nested: { deep: [{ section_tipo: 'rsc194', section_id: '12' }] },
		};
		const changed = rebaseLocatorsInValue(value, {
			oldTipo: 'rsc194',
			newTipo: 'rsc197',
			baseCounter: 1000,
		});
		expect(changed).toBe(true);
		expect(value.rsc99[0]).toEqual({
			section_tipo: 'rsc197',
			section_id: 1005,
			from_component_tipo: 'rsc99',
			type: 'dd151',
		});
		expect(value.rsc99[1]).toEqual({ section_tipo: 'rsc300', section_id: 7 });
		// string section_id stays a string
		expect(value.nested.deep[0]).toEqual({ section_tipo: 'rsc197', section_id: '1012' });
	});

	test('rebases dataframe key pairs; returns false when nothing matches', () => {
		const df = [
			{ section_tipo_key: 'rsc194', section_id_key: 3, section_tipo: 'other', section_id: 1 },
		];
		expect(
			rebaseLocatorsInValue(df, { oldTipo: 'rsc194', newTipo: 'rsc197', baseCounter: 100 }),
		).toBe(true);
		expect(df[0]).toMatchObject({ section_tipo_key: 'rsc197', section_id_key: 103 });
		expect(rebaseLocatorsInValue({ a: 1 }, { oldTipo: 'x1', newTipo: 'y1', baseCounter: 5 })).toBe(
			false,
		);
	});
});

// ---------------------------------------------------------------------------
// definition-file confinement (temp dir)
// ---------------------------------------------------------------------------

describe('definition files (confined loading)', () => {
	test('lists + loads json; refuses traversal', async () => {
		const base = join(SCRATCH_ROOT, 'defs');
		mkdirSync(join(base, 'move_tld'), { recursive: true });
		writeFileSync(join(base, 'move_tld', 'a.json'), JSON.stringify([{ old: 'x1', new: 'y1' }]));
		writeFileSync(join(base, 'move_tld', 'bad.txt'), 'ignored');

		const realConfig = await import('../../src/config/config.ts');
		mock.module('../../src/config/config.ts', () => ({
			...realConfig,
			config: {
				...realConfig.config,
				ops: { ...realConfig.config.ops, transformDefinitionsDir: base },
			},
		}));
		try {
			const { listDefinitionFiles, loadDefinitionFile } = await import(
				'../../src/core/update/transform/definitions.ts'
			);
			const files = listDefinitionFiles('move_tld');
			expect(files.map((f) => f.file_name)).toEqual(['a.json']);
			expect(loadDefinitionFile('move_tld', 'a.json')).toEqual([{ old: 'x1', new: 'y1' }]);
			expect(loadDefinitionFile('move_tld', '../move_tld/a.json')).toBeNull();
			expect(loadDefinitionFile('move_tld', 'missing.json')).toBeNull();
		} finally {
			mock.module('../../src/config/config.ts', () => realConfig);
			mock.restore();
		}
	});
});

// ---------------------------------------------------------------------------
// dry-run report (pure)
// ---------------------------------------------------------------------------

describe('TransformRecorder', () => {
	test('counts ops, caps the sample, reports dry-run vs execute', () => {
		const rec = new TransformRecorder(true);
		for (let i = 0; i < 5; i++) rec.record({ op: 'update', table: 'matrix', target: `id ${i}` });
		rec.record({ op: 'delete', table: 'matrix_counter', target: 'x1' });
		const report = rec.toReport('move_tld');
		expect(report.dryRun).toBe(true);
		expect(report.result).toBe(true);
		expect(report.counts).toEqual({ update: 5, delete: 1 });
		expect(report.msg).toContain('DRY RUN');
		expect(report.msg).toContain('6 change(s)');
	});
});

// ---------------------------------------------------------------------------
// safe DRY-RUN smoke over the real DB (SELECT-only, non-existent tipos)
// ---------------------------------------------------------------------------

describe('executor dry-run smoke (no writes; queries must be valid)', () => {
	async function dbUp(): Promise<boolean> {
		try {
			await sql.unsafe('SELECT 1', []);
			return true;
		} catch {
			return false;
		}
	}

	test('changes_in_tipos dry-run over a non-existent tipo touches nothing', async () => {
		if (!(await dbUp())) return;
		const rec = new TransformRecorder(true);
		await executeChangesInTipos(
			[{ old: 'zztnope1', new: 'zztnope2', type: 'section', perform: [] }],
			rec,
		);
		expect(rec.errors).toEqual([]);
		// nothing in the DB carries these tipos → zero recorded deltas
		expect(Object.keys(rec.counts).length).toBe(0);
	}, 60000);
});

// ---------------------------------------------------------------------------
// real EXECUTE of changes_in_tipos on the matrix_test scratch table
// ---------------------------------------------------------------------------

describe('changes_in_tipos EXECUTE on matrix_test (scratch tipos)', () => {
	const SRC = 'zzttra1';
	const DST = 'zzttrb1';
	// a component tipo referenced inside another row's relation column
	const REFSRC = 'zzttrc1';
	const REFDST = 'zzttrd1';

	async function dbUp(): Promise<boolean> {
		try {
			await sql.unsafe('SELECT 1', []);
			return true;
		} catch {
			return false;
		}
	}

	afterAll(async () => {
		try {
			await sql.unsafe(
				"DELETE FROM matrix_test WHERE section_tipo IN ($1,$2) OR relation::text LIKE '%zzttr%'",
				[SRC, DST],
			);
		} catch {
			/* best effort */
		}
	});

	test('renames section_tipo + rewrites embedded component tipo, drops counter', async () => {
		if (!(await dbUp())) {
			console.warn('[UNCOVERED] DB unreachable — changes_in_tipos execute skipped');
			return;
		}
		// seed: one record in the moving section, one record referencing the
		// moving component tipo inside its relation column.
		await sql.unsafe(
			`INSERT INTO matrix_test (section_id, section_tipo, relation)
			 VALUES (9001, $1, '{}'::jsonb), (9002, 'zztother1', $2::text::jsonb)`,
			[
				SRC,
				JSON.stringify({
					zztkeep1: [{ section_tipo: SRC, section_id: 9001, from_component_tipo: REFSRC }],
				}),
			],
		);
		await sql.unsafe(
			'INSERT INTO matrix_counter (tipo, value) VALUES ($1, 9001) ON CONFLICT (tipo) DO UPDATE SET value = 9001',
			[SRC],
		);

		const rec = new TransformRecorder(false);
		await executeChangesInTipos(
			[
				{ old: SRC, new: DST, type: 'section', perform: ['replace_tipo'] },
				{ old: REFSRC, new: REFDST, type: 'component', perform: ['replace_tipo'] },
			],
			rec,
		);
		expect(rec.errors).toEqual([]);

		// section_tipo renamed
		const moved = (await sql.unsafe('SELECT section_id FROM matrix_test WHERE section_tipo = $1', [
			DST,
		])) as { section_id: number }[];
		expect(moved.map((r) => r.section_id)).toContain(9001);
		expect(
			(await sql.unsafe('SELECT 1 FROM matrix_test WHERE section_tipo = $1', [SRC])) as unknown[],
		).toEqual([]);

		// embedded locator rewritten: SRC→DST and REFSRC→REFDST inside the referencing row
		const [ref] = (await sql.unsafe(
			'SELECT relation::text AS rel FROM matrix_test WHERE section_id = 9002 AND section_tipo = $1',
			['zztother1'],
		)) as { rel: string }[];
		expect(ref?.rel).toContain(`"${DST}"`);
		expect(ref?.rel).toContain(`"${REFDST}"`);
		expect(ref?.rel).not.toContain(`"${SRC}"`);
		expect(ref?.rel).not.toContain(`"${REFSRC}"`);

		// old counter dropped
		expect(
			(await sql.unsafe('SELECT 1 FROM matrix_counter WHERE tipo = $1', [SRC])) as unknown[],
		).toEqual([]);
		// The full-table embedded-tipo sweep across every table×column is
		// inherently O(all rows) (PHP tables_rows_iterator too — the widget
		// warns "a very long process… all the records in all the tables"); the
		// generous budget reflects a real migration on the dev DB volume.
	}, 300000);
});
