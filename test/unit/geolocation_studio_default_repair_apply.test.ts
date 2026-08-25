/**
 * Gate on the geolocation studio-default repair's DESTRUCTIVE HALF.
 *
 * The sibling gate (geolocation_studio_default_repair.test.ts) covers the pure
 * predicates. Everything that actually DESTROYS data was prose only:
 *   - repairUnit's row lock + re-adjudication on the LOCKED value
 *     ("the scan's verdict is a plan, never an authority to write"),
 *   - the fail-loud abort when the record vanished mid-run,
 *   - the FIT_VIEW array write and its time-machine row,
 *   - the CLI refusals: --table / --user mandatory, APPLY_ADJUDICATED.
 * Project law: the most destructive code in the change is the code that must be
 * tripwired. This file drives repairUnit for real, on a SCRATCH surface
 * (matrix_test + a synthetic section tipo, cleaned before and after), and the
 * refusals as a SUBPROCESS — parseArgs cannot be gated in-process because every
 * rejection path calls usage() → process.exit(1), which would kill the runner.
 *
 * NEVER a production record: every write here lands on zzgeorep1/9007xx.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { repairUnit, type Unit } from '../../scripts/repair_geolocation_studio_default.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { readMatrixKeyForUpdate, updateMatrixKeysData } from '../../src/core/db/matrix_write.ts';
import { readTimeMachineHistory } from '../../src/core/db/time_machine.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TABLE = 'matrix_test';
const SECTION_TIPO = 'zzgeorep1';
const GEO_TIPO = 'zzgeo1';
/** A second geolocation component on the same record — must never be touched. */
const SIBLING_TIPO = 'zzgeo2';
const REPAIR_USER = 424242;

const STUDIO_DEFAULT = { lat: '39.462571', lon: '-0.376295' };
const REAL = { lat: '41.6523', lon: '-4.7245' };

/** Distinct id per case: parallel files must not collide on one scratch row. */
let nextId = 900710;

function drawn(coordinates: [number, number]): unknown[] {
	return [
		{
			layer_data: {
				type: 'FeatureCollection',
				features: [{ type: 'Feature', geometry: { type: 'Point', coordinates } }],
			},
		},
	];
}

/** Create the scratch record and return the Unit a scan would have produced. */
async function scratch(
	items: unknown[],
	verdict: Unit['verdict'],
	extra: Record<string, unknown> = {},
): Promise<Unit> {
	const sectionId = nextId++;
	await cleanScratchRecord(SECTION_TIPO, sectionId, TABLE);
	await createScratchRecord(
		SECTION_TIPO,
		sectionId,
		{ geo: { [GEO_TIPO]: items, [SIBLING_TIPO]: [{ id: 1, ...REAL }], ...extra } },
		{ table: TABLE },
	);
	return {
		table: TABLE,
		sectionTipo: SECTION_TIPO,
		sectionId,
		componentTipo: GEO_TIPO,
		itemCount: items.length,
		verdict,
	};
}

async function storedGeo(sectionId: number): Promise<Record<string, unknown>> {
	const record = await readMatrixRecord(TABLE, SECTION_TIPO, sectionId);
	return (record?.columns.geo ?? {}) as Record<string, unknown>;
}

async function cleanAll(): Promise<void> {
	for (let id = 900710; id < nextId + 20; id++) {
		await cleanScratchRecord(SECTION_TIPO, id, TABLE);
	}
}

describe('repairUnit — the write half, on a scratch surface', () => {
	beforeAll(cleanAll);
	afterAll(cleanAll);

	test('CLEAR removes ONLY this component key; the sibling component survives', async () => {
		const unit = await scratch([{ id: 1, ...STUDIO_DEFAULT, zoom: 12, alt: 16 }], 'CLEAR');
		expect(await repairUnit(unit, REPAIR_USER)).toBe('done');

		const geo = await storedGeo(unit.sectionId);
		// #- key removal, not a column overwrite: the key is GONE, not emptied.
		expect(Object.hasOwn(geo, GEO_TIPO)).toBe(false);
		expect(geo[SIBLING_TIPO]).toEqual([{ id: 1, ...REAL }]);
	});

	test('CLEAR audits the transition to the MANDATORY --user, with an empty snapshot', async () => {
		const unit = await scratch([{ id: 1, ...STUDIO_DEFAULT }], 'CLEAR');
		await repairUnit(unit, REPAIR_USER);

		const history = await readTimeMachineHistory(SECTION_TIPO, unit.sectionId, GEO_TIPO);
		expect(history).toHaveLength(1);
		expect(Number(history[0]?.user_id)).toBe(REPAIR_USER);
		expect(history[0]?.lang).toBe('lg-nolan');
		expect(history[0]?.data).toEqual([]);
	});

	test('FIT_VIEW rewrites lat/lon and preserves id, zoom, alt and lib_data byte-for-byte', async () => {
		const libData = drawn([3.14754, 41.858199]);
		const unit = await scratch(
			[{ id: 7, ...STUDIO_DEFAULT, zoom: 13, alt: 16, lib_data: libData }],
			'FIT_VIEW',
		);
		expect(await repairUnit(unit, REPAIR_USER)).toBe('done');

		const geo = await storedGeo(unit.sectionId);
		expect(geo[GEO_TIPO]).toEqual([
			{ id: 7, lat: 41.858199, lon: 3.14754, zoom: 13, alt: 16, lib_data: libData },
		]);
		// The written value is what the TM row records — not the pre-repair one.
		const history = await readTimeMachineHistory(SECTION_TIPO, unit.sectionId, GEO_TIPO);
		expect(history[0]?.data).toEqual(geo[GEO_TIPO]);
		// And it is stable: a second run finds nothing to do.
		expect(await repairUnit(unit, REPAIR_USER)).toBe('changed');
	});

	test('the write is a single-key set: a concurrent component in the same column is not clobbered', async () => {
		const unit = await scratch([{ id: 1, ...STUDIO_DEFAULT, lib_data: drawn([1, 2]) }], 'FIT_VIEW');
		// A third component appears in `geo` after the scan, as a concurrent save would.
		await updateMatrixKeysData(TABLE, SECTION_TIPO, unit.sectionId, [
			{ column: 'geo', key: 'zzgeo3', value: [{ id: 1, lat: 1, lon: 1 }] },
		]);
		expect(await repairUnit(unit, REPAIR_USER)).toBe('done');

		const geo = await storedGeo(unit.sectionId);
		expect(geo.zzgeo3).toEqual([{ id: 1, lat: 1, lon: 1 }]);
		expect(geo[SIBLING_TIPO]).toEqual([{ id: 1, ...REAL }]);
	});
});

describe('repairUnit — TOCTOU: the scan verdict is a PLAN, never an authority', () => {
	beforeAll(cleanAll);
	afterAll(cleanAll);

	/**
	 * The window is between the UNLOCKED scan and the row lock: once repairUnit
	 * holds FOR UPDATE nothing else can write until COMMIT. So the honest
	 * simulation is a Unit carrying the scan's verdict against a row that has
	 * since changed — exactly what a curator saving mid-run produces.
	 */
	test('an operator saved a REAL coordinate after the scan: skipped as changed, value intact', async () => {
		const unit = await scratch([{ id: 1, ...STUDIO_DEFAULT }], 'CLEAR');
		await updateMatrixKeysData(TABLE, SECTION_TIPO, unit.sectionId, [
			{ column: 'geo', key: GEO_TIPO, value: [{ id: 1, ...REAL }] },
		]);

		expect(await repairUnit(unit, REPAIR_USER)).toBe('changed');
		const geo = await storedGeo(unit.sectionId);
		expect(geo[GEO_TIPO]).toEqual([{ id: 1, ...REAL }]);
		// Nothing was written, so nothing was audited.
		expect(await readTimeMachineHistory(SECTION_TIPO, unit.sectionId, GEO_TIPO)).toHaveLength(0);
	});

	test('the component became MIXED after the scan: the CLEAR is refused, not applied', async () => {
		const unit = await scratch([{ id: 1, ...STUDIO_DEFAULT }], 'CLEAR');
		await updateMatrixKeysData(TABLE, SECTION_TIPO, unit.sectionId, [
			{
				column: 'geo',
				key: GEO_TIPO,
				value: [
					{ id: 1, ...STUDIO_DEFAULT },
					{ id: 2, ...REAL },
				],
			},
		]);

		expect(await repairUnit(unit, REPAIR_USER)).toBe('changed');
		expect((await storedGeo(unit.sectionId))[GEO_TIPO]).toHaveLength(2);
	});

	test('the geometry was deleted after the scan: FIT_VIEW never degrades into a CLEAR', async () => {
		const unit = await scratch([{ id: 1, ...STUDIO_DEFAULT, lib_data: drawn([1, 2]) }], 'FIT_VIEW');
		await updateMatrixKeysData(TABLE, SECTION_TIPO, unit.sectionId, [
			{ column: 'geo', key: GEO_TIPO, value: [{ id: 1, ...STUDIO_DEFAULT }] },
		]);

		// Verdict is now CLEAR, the plan said FIT_VIEW ⇒ skip. A repair that trusted
		// the plan would have removed the key.
		expect(await repairUnit(unit, REPAIR_USER)).toBe('changed');
		expect((await storedGeo(unit.sectionId))[GEO_TIPO]).toEqual([{ id: 1, ...STUDIO_DEFAULT }]);
	});

	test('the record vanished mid-run: FAIL LOUD, never continue silently', async () => {
		const unit = await scratch([{ id: 1, ...STUDIO_DEFAULT }], 'CLEAR');
		await cleanScratchRecord(SECTION_TIPO, unit.sectionId, TABLE);

		expect(repairUnit(unit, REPAIR_USER)).rejects.toThrow(/record vanished mid-run/);
	});

	/**
	 * The `affected === 0` abort cannot be reached from outside: repairUnit holds
	 * the row lock, so between its read and its UPDATE the row cannot disappear.
	 * It is a belt-and-braces guard, and this is the invariant that makes it
	 * unreachable — asserted here so the guard is not "simplified away" together
	 * with the lock.
	 */
	test('the lock is what makes the write safe: FOR UPDATE outside a transaction is refused', () => {
		expect(readMatrixKeyForUpdate(TABLE, SECTION_TIPO, 900700, 'geo', GEO_TIPO)).rejects.toThrow(
			/wrap the read-modify-write in withTransaction/,
		);
	});
});

// ---------------------------------------------------------------------------
// The CLI refusals — subprocess, because usage() exits the process.
// ---------------------------------------------------------------------------

const SCRIPT = new URL('../../scripts/repair_geolocation_studio_default.ts', import.meta.url)
	.pathname;

async function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	const child = Bun.spawn([process.execPath, SCRIPT, ...args], { stdout: 'pipe', stderr: 'pipe' });
	const [stdout, stderr] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { code: await child.exited, stdout, stderr };
}

describe('CLI refusals — no scope and no actor are ever implied', () => {
	/**
	 * Every case below must die in parseArgs, BEFORE the script opens a
	 * connection. "zero rows changed" is asserted structurally: the run never
	 * printed its banner or its `scanned N record(s)` line, so no discovery and
	 * no write ever happened. (These invocations run against the configured DB;
	 * a refusal that leaked past parseArgs would show up here immediately.)
	 */
	function refused(result: { code: number; stdout: string }): void {
		expect(result.code).toBe(1);
		expect(result.stdout).toBe('');
	}

	test('no --table: there is no sweep-everything invocation', async () => {
		const result = await run('--user', '1');
		refused(result);
		expect(result.stderr).toContain('--table is mandatory');
	});

	test('no --user: time-machine attribution is never guessed', async () => {
		const result = await run('--table', 'matrix');
		refused(result);
		expect(result.stderr).toContain('--user is mandatory');
	});

	test('no arguments at all is refused', async () => {
		refused(await run());
	});

	test('a non-allowlisted table is refused', async () => {
		const result = await run('--table', 'matrix_evil', '--user', '1');
		refused(result);
		expect(result.stderr).toContain("table 'matrix_evil' is not allowlisted");
	});

	test('an unknown argument is refused (no silent typo tolerance)', async () => {
		const result = await run('--table', 'matrix', '--user', '1', '--force');
		refused(result);
		expect(result.stderr).toContain("unknown argument '--force'");
	});

	test('--apply on an UNADJUDICATED table is refused, and does not say "edit the constant"', async () => {
		const result = await run('--table', 'matrix_dd', '--user', '1', '--apply');
		refused(result);
		expect(result.stderr).toContain("--apply is not authorised for table 'matrix_dd'");
		expect(result.stderr).toContain('written, measured artifact');
		// The old text told operators to add the table themselves. An adjudication
		// is a reviewed artifact, not a one-line edit — the refusal must not
		// instruct anyone to defeat it.
		expect(result.stderr).not.toContain('add the table');
	});

	/**
	 * APPLY_ADJUDICATED is pinned through the usage banner rather than by
	 * running --apply: the write path is reserved to a human. Adding a table to
	 * that constant must break this test, so the addition comes with the
	 * adjudication that authorises it.
	 */
	/** The adjudicated set as the script itself reports it, from the usage banner. */
	async function adjudicatedTables(): Promise<string[]> {
		const { stderr } = await run('--table', 'matrix');
		const line = stderr
			.split('\n')
			.find((row) => row.includes('--apply is accepted only for:'))
			?.trim();
		expect(line).toBeDefined();
		return (line ?? '').replace('--apply is accepted only for:', '').trim().split(', ');
	}

	test('APPLY_ADJUDICATED is EXACTLY the two adjudicated tables', async () => {
		expect(await adjudicatedTables()).toEqual(['matrix', 'matrix_hierarchy']);
	});

	test('every adjudicated table carries its provenance block in the header', async () => {
		const source = await Bun.file(SCRIPT).text();
		for (const table of await adjudicatedTables()) {
			// The evidence bullet beside APPLY_ADJUDICATED — the artifact the
			// refusal text demands. An entry without one is an unadjudicated table
			// wearing an authorisation.
			expect([table, source.includes(`*  - \`${table}\` —`)]).toEqual([table, true]);
		}
	});
});
