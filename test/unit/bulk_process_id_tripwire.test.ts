/**
 * BULK-PROCESS ATTRIBUTION (P0-7 — audit DATA-20).
 *
 * A bulk run is revertable as ONE operation only because every Time Machine row
 * it writes carries the run's dd800 `bulk_process_id`: `bulk_revert_process` is
 * keyed on exactly that column. The shared MARC21/Zotero/RDF executor wrote its
 * TM rows with NULL there — no `withTransaction`, no bulk id, no try/catch — so
 * a 10 000-record import through that door could not be undone at all, and the
 * mitigation the far worse DATA-01 (wrong write language) leaned on did not
 * exist on those doors.
 *
 * TWO RULES, one census:
 *
 *   1. Every bulk executor's DATA writes carry a non-null bulk_process_id.
 *   2. A bulk door whose dd800 create FAILED must REFUSE, not proceed: an
 *      unattributable run is worse than no run, because nothing can take it
 *      back. The mint is ATOMIC — a failed label leaves no orphan row in the
 *      operator's Processes list — and a run with NOTHING to write mints no
 *      dd800 at all: an empty run is not an event.
 *
 * CENSUS IS TOTAL and DERIVED: the door list is every file that mints a dd800
 * record, found by scanning `src/` and `tools/`. A new bulk door is RED until it
 * declares which of the two failure postures it takes.
 *
 * The behavioural half drives the executor against the suite database on a
 * scratch `test3` record in the reserved ≥ 900000 band, removed at both ends.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { config } from '../../src/config/config.ts';
import { BULK_PROCESS_TIPOS } from '../../src/core/concepts/section.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { readComponentItems } from '../../src/core/resolve/component_data.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import * as create_record from '../../src/core/section/record/create_record.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import * as save_component from '../../src/core/section/record/save_component.ts';
import { importMappedRecords } from '../../src/core/tools/import_execute.ts';

/**
 * The REAL module, snapshotted at import time. `mock.module` is process-GLOBAL
 * and `mock.restore()` does NOT revert it, so the failed-mint case below
 * re-installs these exports in an afterEach — otherwise every file that runs
 * after this one in the same bun process inherits a broken createSectionRecord.
 */
const REAL_CREATE_RECORD = { ...create_record };
/** Same treatment for the write engine — the atomic-mint case below fails ONE save. */
const REAL_SAVE_COMPONENT = { ...save_component };

const SECTION = 'test3';
const TEXT = 'test52'; // test3's own component_input_text
const TABLE = 'matrix_test';
const USER = 987673;
/** Scratch ids owned by THIS gate (reserved ≥ 900000 band). */
const IMPORT_ID = 941721;
const CREATED_MARKER_ID = 941722;
const ROLLBACK_ID = 941723;

const REPO_ROOT = join(import.meta.dir, '..', '..');
const bulkProcessIds: number[] = [];

/** Remember a run's dd800 for the sweep. Null = the run minted none (empty run). */
function rememberBulkProcess(id: number | null): void {
	if (id !== null) bulkProcessIds.push(id);
}
let ready = false;
/** Why the setup failed, verbatim, so the readiness case can name the cause. */
let setupError = '';

/**
 * REFUSE TO RUN VACUOUSLY (2026-08-27 review). `if (!ready) return;` reports a
 * PASS with zero assertions — bun cannot tell it from a case that ran — so the
 * closure of a BLOCKING attribution defect was silently green on a DB-less box.
 * Every DB-touching case below calls this instead and goes RED.
 */
function requireReady(): void {
	if (!ready) {
		throw new Error(
			`the suite database is unavailable (${setupError}) — this case proves a bulk-attribution rule and cannot be skipped into green. Build the suite database with \`bun run test:db:setup\`.`,
		);
	}
}

beforeAll(async () => {
	try {
		await createSectionRecord(SECTION, USER, new Date(), IMPORT_ID, { conflictTolerant: true });
		await createSectionRecord(SECTION, USER, new Date(), CREATED_MARKER_ID, {
			conflictTolerant: true,
		});
		await createSectionRecord(SECTION, USER, new Date(), ROLLBACK_ID, { conflictTolerant: true });
		ready = true;
	} catch (error) {
		ready = false;
		setupError = error instanceof Error ? error.message : String(error);
	}
});

/**
 * FIRST, AND IT FAILS RATHER THAN SKIPS: a run where the database never answered
 * has proved nothing about attribution. Reported as its own case so the reason
 * is visible once instead of as N identical failures.
 */
test('the suite database is reachable (else every case in this file is vacuous)', () => {
	expect(ready ? 'ready' : `suite database unavailable: ${setupError}`).toBe('ready');
});

afterAll(async () => {
	if (!ready) return;
	for (const id of [IMPORT_ID, CREATED_MARKER_ID, ROLLBACK_ID]) {
		await sql.unsafe(`DELETE FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`, [
			SECTION,
			id,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, id],
		);
	}
	const bulkTable = (await getMatrixTableFromTipo('dd800')) ?? 'matrix_dd';
	for (const id of bulkProcessIds) {
		await sql.unsafe(`DELETE FROM ${bulkTable} WHERE section_tipo = $1 AND section_id = $2`, [
			'dd800',
			id,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`,
			['dd800', id],
		);
	}
});

/* ══════════════════════════ THE CENSUS ══════════════════════════ */

/**
 * Every file that mints a dd800 bulk-process record, with the posture it takes
 * when that mint FAILS.
 *
 *   'refuse'  — the failure propagates and no data row is touched. The rule.
 *   'proceed' — the failure is swallowed and the run continues UNATTRIBUTABLE.
 *               An OPEN defect, enumerated so it cannot spread quietly.
 */
const BULK_DOORS: ReadonlyMap<string, { onCreateFailure: 'refuse' | 'proceed'; reason: string }> =
	new Map([
		[
			'src/core/tools/import_execute.ts',
			{
				onCreateFailure: 'refuse',
				reason:
					'The shared MARC21/Zotero/RDF executor. createBulkProcessRecord runs before the record loop and its throw propagates out of importMappedRecords, so a run that cannot be attributed writes nothing (audit DATA-20). The mint is ONE transaction (row + label + file), so a failure leaves no orphan dd800; a run with no mapped records mints nothing at all.',
			},
		],
		[
			'tools/tool_import_dedalo_csv/server/index.ts',
			{
				onCreateFailure: 'refuse',
				reason:
					'The CSV door: createBulkProcessRecord is awaited before the plan is executed and is not caught, so a failed mint fails the file.',
			},
		],
		[
			'tools/tool_update_cache/server/index.ts',
			{
				onCreateFailure: 'refuse',
				reason:
					'The regenerate sweep awaits createSectionRecord(dd800) uncaught before the row loop; a failure aborts the run.',
			},
		],
		[
			'tools/tool_propagate_component_data/server/index.ts',
			{
				onCreateFailure: 'proceed',
				reason:
					'OPEN: createBulkProcess() catches its own failure and returns null, and the null is threaded straight into every TM row — so a propagation whose dd800 mint failed is written with NULL bulk_process_id and cannot be reverted as one operation. Outside P0-7’s edit scope; the same defect class as DATA-20, on the propagation door instead of the import door.',
			},
		],
		[
			'tools/tool_time_machine/server/bulk_revert.ts',
			{
				onCreateFailure: 'proceed',
				reason:
					'OPEN: createRevertBulkProcess() is explicitly "best-effort" — it returns null on failure and the revert proceeds, so a revert whose own dd800 mint failed is itself irreversible. Same class as the propagation door; outside P0-7’s edit scope.',
			},
		],
	]);

/** Doors still allowed to proceed unattributably. FROZEN — this list may only shrink. */
const OPEN_PROCEED_DOORS = new Set([
	'tools/tool_propagate_component_data/server/index.ts',
	'tools/tool_time_machine/server/bulk_revert.ts',
]);

function censusBulkDoors(): string[] {
	const glob = new Glob('**/*.ts');
	const doors: string[] = [];
	for (const [root, prefix] of [
		[join(REPO_ROOT, 'src'), 'src/'],
		[join(REPO_ROOT, 'tools'), 'tools/'],
	] as [string, string][]) {
		for (const rel of glob.scanSync(root)) {
			const path = `${prefix}${rel}`;
			if (path.endsWith('.test.ts')) continue;
			const lines = readFileSync(join(root, rel), 'utf8').split('\n');
			// A dd800 MINT: createSectionRecord() addressed at the bulk-process
			// section, however the tipo is spelled (the constant, or a file-local
			// alias of it). Comment lines are prose, not a mint.
			const mints = lines.some((line) => {
				const trimmed = line.trim();
				if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
					return false;
				}
				return /createSectionRecord\(\s*BULK_PROCESS_(?:TIPOS\.section|SECTION_TIPO)/.test(line);
			});
			if (mints) doors.push(path);
		}
	}
	return doors.sort();
}

describe('census — every dd800 bulk door declares its create-failure posture', () => {
	const doors = censusBulkDoors();

	test('the census is TOTAL: no undeclared bulk door', () => {
		const undeclared = doors.filter((path) => !BULK_DOORS.has(path));
		if (undeclared.length > 0) {
			throw new Error(
				`File(s) mint a dd800 bulk-process record with no declared failure posture:\n  ${undeclared.join('\n  ')}\nA bulk run is revertable ONLY through its dd800 id (bulk_revert_process keys on matrix_time_machine.bulk_process_id). A door whose mint failed must REFUSE — an unattributable bulk write cannot be taken back. Add an entry to BULK_DOORS.`,
			);
		}
		expect(undeclared).toEqual([]);
	});

	test('the census stays honest — no entry for a file that no longer mints one', () => {
		expect([...BULK_DOORS.keys()].filter((path) => !doors.includes(path))).toEqual([]);
	});

	test('no NEW door may swallow a failed dd800 mint (the open list is frozen)', () => {
		const proceeding = [...BULK_DOORS.entries()]
			.filter(([, entry]) => entry.onCreateFailure === 'proceed')
			.map(([path]) => path);
		const unexpected = proceeding.filter((path) => !OPEN_PROCEED_DOORS.has(path));
		if (unexpected.length > 0) {
			throw new Error(
				`Bulk door(s) proceed after a FAILED dd800 mint:\n  ${unexpected.join('\n  ')}\nThe run's TM rows then carry NULL bulk_process_id and the whole operation becomes irreversible. Refuse instead.`,
			);
		}
		expect(unexpected).toEqual([]);
		// Shrink-only: an entry fixed upstream must be removed from the open list.
		expect([...OPEN_PROCEED_DOORS].filter((path) => !proceeding.includes(path))).toEqual([]);
	});
});

/* ═════════════════ THE TM ROWS, MEASURED ON THE SUITE DB ═════════════════ */

async function tmRows(sectionId: number): Promise<{ tipo: string; bulk: number | null }[]> {
	const rows = (await sql.unsafe(
		`SELECT tipo, bulk_process_id FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId],
	)) as { tipo: string; bulk_process_id: number | null }[];
	return rows.map((row) => ({ tipo: row.tipo, bulk: row.bulk_process_id }));
}

describe('the shared import executor attributes every TM row it writes', () => {
	test('an UPDATE run stamps the run id on the record’s TM rows', async () => {
		requireReady();
		const report = await importMappedRecords(
			[{ sectionId: IMPORT_ID, fields: [{ component_tipo: TEXT, values: ['attributed'] }] }],
			SECTION,
			USER,
			{ bulkLabel: 'bulk_process_id_tripwire update run' },
		);
		rememberBulkProcess(report.bulkProcessId);
		expect(report.failed).toEqual([]);
		expect(Number.isFinite(report.bulkProcessId)).toBe(true);

		const rows = await tmRows(IMPORT_ID);
		expect(rows.length).toBeGreaterThan(0);
		// EVERY row, not "some": a single NULL row is a hole in the revert.
		expect(rows.filter((row) => row.bulk === null)).toEqual([]);
		expect([...new Set(rows.map((row) => row.bulk))]).toEqual([report.bulkProcessId]);
	});

	test('a CREATE run’s TM rows carry the same run id', async () => {
		requireReady();
		const report = await importMappedRecords(
			[{ sectionId: null, fields: [{ component_tipo: TEXT, values: ['created row'] }] }],
			SECTION,
			USER,
			{ bulkLabel: 'bulk_process_id_tripwire create run' },
		);
		rememberBulkProcess(report.bulkProcessId);
		expect(report.created).toBe(1);
		const createdId = report.createdIds[0] as number;
		try {
			const rows = (await sql.unsafe(
				`SELECT bulk_process_id FROM matrix_time_machine
				  WHERE section_tipo = $1 AND section_id = $2`,
				[SECTION, createdId],
			)) as { bulk_process_id: number | null }[];
			expect(rows.length).toBeGreaterThan(0);
			expect(rows.filter((row) => row.bulk_process_id === null)).toEqual([]);
			expect([...new Set(rows.map((row) => row.bulk_process_id))]).toEqual([report.bulkProcessId]);
		} finally {
			await sql.unsafe(`DELETE FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`, [
				SECTION,
				createdId,
			]);
			await sql.unsafe(
				`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`,
				[SECTION, createdId],
			);
		}
	});

	test('a per-record failure is REPORTED, not thrown away with the whole run', async () => {
		requireReady();
		// A component tipo that resolves no model: the record itself still writes,
		// and the run keeps its report — the executor used to let an engine fault
		// escape and discard createdIds with it.
		const report = await importMappedRecords(
			[
				{ sectionId: IMPORT_ID, fields: [{ component_tipo: 'test999999', values: ['x'] }] },
				{ sectionId: CREATED_MARKER_ID, fields: [{ component_tipo: TEXT, values: ['survivor'] }] },
			],
			SECTION,
			USER,
		);
		rememberBulkProcess(report.bulkProcessId);
		expect(report.failed.map((entry) => entry.msg).join('\n')).toContain('IGNORED');
		// The SECOND record still landed, attributed.
		const rows = await tmRows(CREATED_MARKER_ID);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.filter((row) => row.bulk === null)).toEqual([]);
	});
});

/* ═══════════ A FAILED dd800 MINT REFUSES, MEASURED ═══════════ */

describe('a run whose dd800 mint FAILS writes nothing', () => {
	afterEach(() => {
		mock.module('../../src/core/section/record/create_record.ts', () => REAL_CREATE_RECORD);
	});

	test('the executor propagates the mint failure and touches no data row', async () => {
		requireReady();
		const before = await tmRows(IMPORT_ID);
		// Non-vacuous: the earlier runs left rows here, so "unchanged" is a real claim.
		expect(before.length).toBeGreaterThan(0);
		mock.module('../../src/core/section/record/create_record.ts', () => ({
			...REAL_CREATE_RECORD,
			createSectionRecord: async () => {
				throw new Error('dd800 mint unavailable (gate)');
			},
		}));
		const attempt = importMappedRecords(
			[{ sectionId: IMPORT_ID, fields: [{ component_tipo: TEXT, values: ['must not land'] }] }],
			SECTION,
			USER,
		);
		await expect(attempt).rejects.toThrow('dd800 mint unavailable (gate)');
		mock.module('../../src/core/section/record/create_record.ts', () => REAL_CREATE_RECORD);
		// NOT "the run reported a failure" — the run must not have HAPPENED. An
		// unattributable bulk write cannot be taken back, so it must never exist.
		expect(await tmRows(IMPORT_ID)).toEqual(before);
	});
});

/* ═══════════ ONE TRANSACTION PER RECORD, MEASURED ═══════════ */

describe('a mid-record failure leaves NO half-written record', () => {
	/** test3's component_geolocation — NOT translatable, so it writes under lg-nolan. */
	const GEO = 'test100';

	test('a field that throws rolls back the fields written before it in the same record', async () => {
		requireReady();
		// The second field throws for a REAL reason: the run's data language is one
		// this installation does not declare, so the translatable field's save is
		// refused at the chokepoint (P0-7). The FIRST field is non-translatable and
		// writes under lg-nolan, which is always accepted — so if the record were
		// not transaction-wrapped, its coordinate would survive the failure.
		const report = await runWithRequestLangs(
			{ applicationLang: config.menu.applicationLang, dataLang: 'lg-zzz' },
			() =>
				importMappedRecords(
					[
						{
							sectionId: ROLLBACK_ID,
							fields: [
								{ component_tipo: GEO, values: ['41.3874, 2.1686'] },
								{ component_tipo: TEXT, values: ['never lands'] },
							],
						},
					],
					SECTION,
					USER,
				),
		);
		rememberBulkProcess(report.bulkProcessId);
		expect(report.failed.map((entry) => entry.msg).join('\n')).toContain(
			'the record was not written',
		);

		const table = (await getMatrixTableFromTipo(SECTION)) ?? TABLE;
		const record = await readMatrixRecord(table, SECTION, ROLLBACK_ID);
		const geo = record === null ? null : readComponentItems(record, GEO, 'component_geolocation');
		// THE POINT: the coordinate the first field wrote is gone with the record's
		// transaction. Before P0-7 this executor had no withTransaction at all.
		expect(geo ?? []).toEqual([]);
		expect(await tmRows(ROLLBACK_ID)).toEqual([]);
	});
});

/* ═══════ AN EMPTY RUN MINTS NOTHING ═══════ */

describe('a run with NOTHING to write files no bulk process', () => {
	test('no mapped records → no dd800, and nothing to revert', async () => {
		requireReady();
		// Every caller can reach the executor with an empty set: a MARC21 batch
		// whose files all failed to parse, a Zotero/RDF export with no subjects.
		// A dd800 minted for that is an event that never happened, sitting in the
		// operator's Processes list forever — and the one bulk id no revert can
		// ever be about.
		const bulkTable = (await getMatrixTableFromTipo('dd800')) ?? 'matrix_dd';
		const countRows = async (): Promise<number> => {
			const rows = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM ${bulkTable} WHERE section_tipo = $1`,
				['dd800'],
			)) as { n: number }[];
			return rows[0]?.n ?? 0;
		};
		const before = await countRows();
		const report = await importMappedRecords([], SECTION, USER, { bulkLabel: 'empty run' });
		rememberBulkProcess(report.bulkProcessId);
		expect(report.bulkProcessId).toBeNull();
		expect(report).toMatchObject({ created: 0, updated: 0, failed: [], createdIds: [] });
		expect(await countRows()).toBe(before);
	});
});

/* ═══════ THE MINT IS ATOMIC ═══════ */

describe('a dd800 whose label save FAILS leaves no orphan', () => {
	afterEach(() => {
		mock.module('../../src/core/section/record/save_component.ts', () => REAL_SAVE_COMPONENT);
	});

	test('the row the failed mint created is rolled back with it', async () => {
		requireReady();
		// The mint is: create the dd800 row, then save its label. Failing the LABEL
		// correctly refuses the run — but without the transaction it left the row
		// behind: an unlabelled process record, attributed to nothing, that no
		// revert will ever name.
		let mintedId: number | null = null;
		mock.module('../../src/core/section/record/save_component.ts', () => ({
			...REAL_SAVE_COMPONENT,
			saveComponentData: async (request: { componentTipo: string; sectionId: number }) => {
				if (request.componentTipo === BULK_PROCESS_TIPOS.label) {
					mintedId = request.sectionId;
					throw new Error('dd800 label save unavailable (gate)');
				}
				return await REAL_SAVE_COMPONENT.saveComponentData(
					request as Parameters<typeof REAL_SAVE_COMPONENT.saveComponentData>[0],
				);
			},
		}));
		const attempt = importMappedRecords(
			[{ sectionId: IMPORT_ID, fields: [{ component_tipo: TEXT, values: ['must not land'] }] }],
			SECTION,
			USER,
		);
		await expect(attempt).rejects.toThrow('dd800 label save unavailable (gate)');
		mock.module('../../src/core/section/record/save_component.ts', () => REAL_SAVE_COMPONENT);

		// The id is captured from the mint itself, so this is immune to anything
		// else writing dd800 rows concurrently.
		expect(mintedId).not.toBeNull();
		const bulkTable = (await getMatrixTableFromTipo('dd800')) ?? 'matrix_dd';
		const rows = (await sql.unsafe(
			`SELECT section_id FROM ${bulkTable} WHERE section_tipo = $1 AND section_id = $2`,
			['dd800', mintedId],
		)) as { section_id: number }[];
		expect(rows).toEqual([]);
	});
});
