/**
 * deleteDiffusionRecord outcome branches + resolvePublishedFilePath, against a
 * SCRATCH diffusion ontology (tld `zzd`, see test/helpers/zzd_diffusion_fixture.ts).
 *
 * WHY A SCRATCH ONTOLOGY. The pre-existing gates (diffusion_delete.test.ts,
 * diffusion_native_delete.test.ts) bind to the LIVE numisdata_mib elements;
 * this database's dd_ontology predates `properties.diffusion.type`, so those
 * elements resolve `type:'unknown'`, `sqlTargets` is empty, and the case named
 * "no executor registered → pending" in fact passes through the FILE-UNLINK
 * branch. With our own elements every branch below is reachable and exact.
 *
 * ISOLATION. DIFFUSION_ACTIVITY_TABLE is pinned to a table private to these
 * two files BEFORE diffusion_delete.ts is imported (the const is computed at
 * module load), so dd1758 row counts are exact and can never be satisfied — or
 * corrupted — by another test file's rows. The executor is a module singleton
 * shared across the whole run: afterEach drops it.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sql } from '../../src/core/db/postgres.ts';
import { getSectionDiffusionTargets } from '../../src/core/diffusion_bridge/diffusion_map.ts';
import {
	countZzdOntology,
	dropZzdOntology,
	FILE_SECTION,
	SQL_KEY_ONE,
	SQL_KEY_TWO,
	SQL_SECTION,
	seedZzdOntology,
} from '../helpers/zzd_diffusion_fixture.ts';

// MUST precede the diffusion_delete import (DIFFUSION_ACTIVITY_TABLE is a
// module-load const). The prefix guard in resolveActivityTable() accepts it.
const SCRATCH_ACTIVITY_TABLE = 'dedalo_ts_test_zzd_activity';
process.env.DIFFUSION_ACTIVITY_TABLE = SCRATCH_ACTIVITY_TABLE;

const {
	DIFFUSION_ACTIVITY_TABLE,
	deleteDiffusionRecord,
	registerNativeDiffusionSqlDelete,
	resetNativeDiffusionSqlDeleteForTests,
	resolvePublishedFilePath,
	retryPendingDiffusion,
	unlinkPublishedFiles,
} = await import('../../src/core/diffusion_bridge/diffusion_delete.ts');
if (DIFFUSION_ACTIVITY_TABLE !== SCRATCH_ACTIVITY_TABLE) {
	throw new Error(
		`activity-table seam not applied (got '${DIFFUSION_ACTIVITY_TABLE}') — diffusion_delete.ts was imported before the override`,
	);
}

const FILE_ROOT = `${tmpdir()}/dedalo_ts_zzd_diffusion_${process.pid}`;

/** dd1758 rows of one processed record (dd1763), ordered by element. */
async function activityRowsFor(
	sectionTipo: string,
	sectionId: number,
): Promise<{ element: string | null; elementId: string | null; action: string | null }[]> {
	return (await sql.unsafe(
		`SELECT relation->'dd1766'->0->>'section_tipo' AS element,
		        relation->'dd1766'->0->>'section_id'   AS "elementId",
		        relation->'dd1767'->0->>'section_id'   AS action
		 FROM "${DIFFUSION_ACTIVITY_TABLE}"
		 WHERE section_tipo = 'dd1758'
		   AND relation->'dd1763' @> $1::text::jsonb
		 ORDER BY relation->'dd1766'->0->>'section_id'`,
		[JSON.stringify([{ section_id: String(sectionId), section_tipo: sectionTipo }])],
	)) as { element: string | null; elementId: string | null; action: string | null }[];
}

/** Drop every scratch-range dd1758 row of the private activity table. */
async function purgeScratchActivityRows(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM "${DIFFUSION_ACTIVITY_TABLE}"
		 WHERE section_tipo = 'dd1758'
		   AND (relation->'dd1763'->0->>'section_id') ~ '^932[0-9]{3}$'`,
	);
}

beforeAll(async () => {
	// Materialize the private activity table through the module's own bootstrap
	// (ensureActivityTable is internal; retryPendingDiffusion calls it and, on a
	// table private to this file, selects nothing).
	await retryPendingDiffusion(1);
	const { preCount } = await seedZzdOntology();
	// Standing hygiene: the scratch tld must be EMPTY before the fixture lands.
	expect(preCount).toBe(0);
	mkdirSync(FILE_ROOT, { recursive: true });
});

beforeEach(async () => {
	await purgeScratchActivityRows();
});

afterEach(() => {
	resetNativeDiffusionSqlDeleteForTests();
});

afterAll(async () => {
	resetNativeDiffusionSqlDeleteForTests();
	await purgeScratchActivityRows();
	const residue = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${DIFFUSION_ACTIVITY_TABLE}"
		 WHERE section_tipo = 'dd1758'
		   AND (relation->'dd1763'->0->>'section_id') ~ '^932[0-9]{3}$'`,
	)) as { n: number }[];
	expect(residue[0]?.n).toBe(0);
	await dropZzdOntology();
	expect(await countZzdOntology()).toBe(0);
	rmSync(FILE_ROOT, { recursive: true, force: true });
});

describe('scratch diffusion fixture', () => {
	test('the sql section resolves exactly the two scratch targets', async () => {
		const targets = await getSectionDiffusionTargets(SQL_SECTION);
		expect(
			targets
				.map(
					(target) =>
						`${target.type}:${target.element_tipo}:${target.database_name}|${target.table_name}`,
				)
				.sort(),
		).toEqual([
			'sql:zzd1:zzd_probe_db|zzd_probe_table',
			'sql:zzd4:zzd_probe_db_two|zzd_probe_table_two',
		]);
	});

	test('the file section resolves only file-type targets (no sql)', async () => {
		const targets = await getSectionDiffusionTargets(FILE_SECTION);
		expect(targets.map((target) => `${target.type}:${target.element_tipo}`).sort()).toEqual([
			'rdf:zzd7',
			'xml:zzd8',
		]);
		expect(targets.filter((target) => target.type === 'sql')).toEqual([]);
	});
});

describe('deleteDiffusionRecord — sql outcomes', () => {
	test('the executor receives the engine-wire shape; full confirmation → deleted', async () => {
		const seen: unknown[][] = [];
		registerNativeDiffusionSqlDelete(async (targets) => {
			seen.push(targets);
			return { deleted: targets.map((t) => `${t.database_name}|${t.table_name}`), errors: [] };
		});

		const outcome = await deleteDiffusionRecord(SQL_SECTION, 932001, false);

		expect(seen.length).toBe(1);
		expect(seen[0]).toEqual([
			{
				database_name: 'zzd_probe_db',
				table_name: 'zzd_probe_table',
				section_ids: [932001],
				section_tipo: SQL_SECTION,
			},
			{
				database_name: 'zzd_probe_db_two',
				table_name: 'zzd_probe_table_two',
				section_ids: [932001],
				section_tipo: SQL_SECTION,
			},
		]);
		expect(outcome.deleted.sort()).toEqual([SQL_KEY_ONE, SQL_KEY_TWO].sort());
		expect(outcome.pending).toEqual([]);
		// logActivity=false (the retry caller's posture) writes NO ledger row
		expect(await activityRowsFor(SQL_SECTION, 932001)).toEqual([]);
	});

	test('partial confirmation splits deleted/pending and ledgers one dd1758 row per element', async () => {
		registerNativeDiffusionSqlDelete(async () => ({ deleted: [SQL_KEY_TWO], errors: [] }));

		const outcome = await deleteDiffusionRecord(SQL_SECTION, 932002, true, 77);

		expect(outcome.deleted).toEqual([SQL_KEY_TWO]);
		expect(outcome.pending).toEqual([SQL_KEY_ONE]);
		// one row per ELEMENT: zzd1 unconfirmed → unpublish_pending (3),
		// zzd4 confirmed → unpublished (2). dd1766 is the ontology-node locator.
		expect(await activityRowsFor(SQL_SECTION, 932002)).toEqual([
			{ element: 'zzd0', elementId: '1', action: '3' },
			{ element: 'zzd0', elementId: '4', action: '2' },
		]);
	});

	test('an executor that throws resolves to all-pending and still ledgers (never rejects)', async () => {
		registerNativeDiffusionSqlDelete(async () => {
			throw new Error('zzd executor outage');
		});

		const outcome = await deleteDiffusionRecord(SQL_SECTION, 932003, true, 77);

		expect(outcome.deleted).toEqual([]);
		// the throw aborts the per-target split BEFORE any pending push
		expect(outcome.pending).toEqual([]);
		expect(await activityRowsFor(SQL_SECTION, 932003)).toEqual([
			{ element: 'zzd0', elementId: '1', action: '3' },
			{ element: 'zzd0', elementId: '4', action: '3' },
		]);
	});

	test('DEC-19: no registered executor → pending keys, ZERO ledger rows, loud console.error', async () => {
		resetNativeDiffusionSqlDeleteForTests();
		const errors: string[] = [];
		const realError = console.error;
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(' '));
		};
		let outcome: Awaited<ReturnType<typeof deleteDiffusionRecord>>;
		try {
			outcome = await deleteDiffusionRecord(SQL_SECTION, 932004, true, 77);
		} finally {
			console.error = realError;
		}

		expect(outcome.deleted).toEqual([]);
		expect(outcome.pending.sort()).toEqual([SQL_KEY_ONE, SQL_KEY_TWO].sort());
		// the DEC-19 branch returns BEFORE logUnpublishOutcome — the deliberate
		// fresh-install no-op posture (no ledger rows to retry).
		expect(await activityRowsFor(SQL_SECTION, 932004)).toEqual([]);
		expect(errors.filter((line) => line.includes('DEC-19')).length).toBe(1);
		expect(errors[0]).toContain('2 sql publication target(s)');
	});

	test('a section with no diffusion targets is a silent no-op (no executor call, no ledger)', async () => {
		// baseline: test38 participates in no diffusion output in this database
		expect(await getSectionDiffusionTargets('test38')).toEqual([]);
		let calls = 0;
		registerNativeDiffusionSqlDelete(async () => {
			calls++;
			return { deleted: [], errors: [] };
		});

		const outcome = await deleteDiffusionRecord('test38', 932005, true, 77);

		expect(outcome).toEqual({ deleted: [], pending: [] });
		expect(calls).toBe(0);
		expect(await activityRowsFor('test38', 932005)).toEqual([]);
	});
});

describe('deleteDiffusionRecord — file-type elements', () => {
	test('KNOWN-RED (D10): a file-only section never reaches the dd1758 ledger', async () => {
		let calls = 0;
		registerNativeDiffusionSqlDelete(async () => {
			calls++;
			return { deleted: [], errors: [] };
		});

		const outcome = await deleteDiffusionRecord(FILE_SECTION, 932010, true, 77);

		// zzd8 declares a service_name and nothing is published → idempotent
		// success; zzd7 declares none → unresolvable → pending.
		expect(outcome.deleted).toEqual(['xml:zzd8']);
		expect(outcome.pending).toEqual(['rdf:zzd7']);
		expect(calls).toBe(0); // no sql target → the executor is never consulted

		// D10 — PINNED CURRENT BEHAVIOUR, NOT THE INTENT: `if (sqlTargets.length
		// === 0) return outcome;` (diffusion_delete.ts:218) returns before
		// logUnpublishOutcome (:260), so a file-only section's FAILED unlink
		// produces a pending outcome with no dd1758 row and retryPendingDiffusion
		// can never see it. Once D10 is fixed this becomes:
		//   [{ element:'zzd0', elementId:'7', action:'3' },
		//    { element:'zzd0', elementId:'8', action:'2' }]
		expect(await activityRowsFor(FILE_SECTION, 932010)).toEqual([]);
	});
});

describe('resolvePublishedFilePath', () => {
	test('xml and markdown: folder is the type, extension is per-type', async () => {
		expect(await resolvePublishedFilePath('zzd8', 'xml', FILE_SECTION, 7, FILE_ROOT)).toBe(
			`${FILE_ROOT}/xml/testsvc/zzd9_7.xml`,
		);
		// folder 'markdown', extension 'md' — the pair a refactor would unify
		expect(await resolvePublishedFilePath('zzd8', 'markdown', FILE_SECTION, 7, FILE_ROOT)).toBe(
			`${FILE_ROOT}/markdown/testsvc/zzd9_7.md`,
		);
	});

	test('rdf: the owl:Class child whose relations name the section provides the file name', async () => {
		expect(await resolvePublishedFilePath('zzd8', 'rdf', FILE_SECTION, 7, FILE_ROOT)).toBe(
			`${FILE_ROOT}/rdf/testsvc/nmotestclass-zzd9-7.rdf`,
		);
		// no owl:Class relates test3 → unresolvable
		expect(await resolvePublishedFilePath('zzd8', 'rdf', 'test3', 7, FILE_ROOT)).toBe(null);
	});

	test('an unknown type falls through to the rdf resolution', async () => {
		expect(await resolvePublishedFilePath('zzd8', 'unknown', FILE_SECTION, 7, FILE_ROOT)).toBe(
			`${FILE_ROOT}/rdf/testsvc/nmotestclass-zzd9-7.rdf`,
		);
	});

	test('empty media root and a missing service_name both resolve to null', async () => {
		expect(await resolvePublishedFilePath('zzd8', 'xml', FILE_SECTION, 7, '')).toBe(null);
		// zzd7 declares diffusion.type but no service_name (the live rdf config)
		expect(await resolvePublishedFilePath('zzd7', 'rdf', FILE_SECTION, 7, FILE_ROOT)).toBe(null);
		// an element outside the ontology has no properties row at all
		expect(await resolvePublishedFilePath('zzd_absent1', 'xml', FILE_SECTION, 7, FILE_ROOT)).toBe(
			null,
		);
	});

	test('the legacy {base}_*.rdf sweep fires for rdf only, never for another type', async () => {
		const dir = `${FILE_ROOT}/rdf/testsvc`;
		mkdirSync(dir, { recursive: true });
		const canonical = `${dir}/nmotestclass-zzd9-7.rdf`;
		const legacy = `${dir}/nmotestclass-zzd9-7_2024.rdf`;
		const other = `${dir}/nmotestclass-zzd9-8.rdf`;
		for (const path of [canonical, legacy, other]) writeFileSync(path, 'x');

		// type 'unknown' resolves the SAME path but takes no legacy sweep
		expect(await unlinkPublishedFiles('zzd8', 'unknown', FILE_SECTION, 7, FILE_ROOT)).toBe(true);
		expect(existsSync(canonical)).toBe(false);
		expect(existsSync(legacy)).toBe(true);

		// type 'rdf' sweeps the legacy variants of the SAME base
		writeFileSync(canonical, 'x');
		expect(await unlinkPublishedFiles('zzd8', 'rdf', FILE_SECTION, 7, FILE_ROOT)).toBe(true);
		expect(existsSync(canonical)).toBe(false);
		expect(existsSync(legacy)).toBe(false);
		expect(existsSync(other)).toBe(true); // another record is untouched
		// nothing left to remove → still true (idempotent)
		expect(await unlinkPublishedFiles('zzd8', 'rdf', FILE_SECTION, 7, FILE_ROOT)).toBe(true);
		// unresolvable → false (the caller's pending marker)
		expect(await unlinkPublishedFiles('zzd7', 'rdf', FILE_SECTION, 7, FILE_ROOT)).toBe(false);
	});
});
