/**
 * ONT-3 — an ontology record's LIFECYCLE moves its dd_ontology node with it, inside the same
 * transaction. TS-native write-path contract (audit 2026-09-26, Step 5).
 *
 * `dd_ontology(tld)` is the projection of `matrix_ontology(<tld>0)`. Before this gate the record
 * delete doors removed the matrix row and left its node behind (an `orphaned` node every
 * resolver still served: PHP's delete removed it), and the Time Machine undelete put the row
 * back without its node (`missing`, until someone pressed "set records"). An override record
 * (`localontology0`, ontology42 → a canonical node) died or came back without the node it
 * overrides being re-parsed, so the runtime kept serving a term whose source was gone.
 *
 * Pinned (outcomes only, each leg its own situation):
 *   L1 deleteSectionRecord removes the node (no orphan);
 *   L2 restoreSection (TM undelete, absent-row path) re-projects it (no missing drift);
 *   L3 restoreAbsentSectionRow (bulk revert's undelete) re-projects it;
 *   L1b/L9c a delete (deleteSectionRecord / deleteSectionData) rolled back by its outer
 *      transaction: the node is already gone INSIDE the unit and byte-identical after the
 *      rollback;
 *   L4 an undelete rolled back by its outer transaction: the node is visible INSIDE the unit
 *      and absent after the rollback;
 *      The two halves of "the projection rides the transaction" are proven separately:
 *      a DETACHED projection (runDetachedFromTransaction) survives the rollback — red on the
 *      "after" assertion; a POST-COMMIT one (registerCommitAction / the obligation-ledger
 *      drain) is invisible inside the unit — red on the "inside" assertion. Mutation-checked
 *      2026-10-21 on each door: detached death (L1b), post-commit death (L9c), post-commit
 *      birth (L4);
 *   L5 a FOREIGN record (`zzlca0/2` declaring `zzlcb`) never touches `zzlcb2` on delete or
 *      undelete, and its undelete is not blocked (the tipo is derived from the ADDRESS);
 *   L6a an override's delete re-projects its target to the canonical term; L6b its undelete
 *      re-projects the override term again;
 *   L7 an override whose target is NOT projected creates no canonical node either way;
 *   L8 an undelete into a tld whose root `<tld>0` is not projected writes no node;
 *   L9 deleteSectionData removes the node (PHP parity); L9b on an OVERRIDE it re-projects the
 *      target from the locked PRE-WIPE relation (mutation: a null relation image → red);
 *   L10 only the namespace refusal is tolerated by a birth: a grammar / constraint
 *      `ontology.invalid_node` from the re-projection (forced at the write door — no parse
 *      reaches one today) aborts the undelete, row and node both absent;
 *   L11 WHO MAY PROJECT CONTENT (closure r0): the lifecycle is reached by plain section grants
 *      (a TM undelete, a bulk revert, an override delete), while writing a record's parse into
 *      the live dd_ontology is developer-only (tool_ontology set_records_in_dd_ontology). Under
 *      a NON-developer principal: L11a a governed undelete restores the record and writes NO
 *      node (`missing` drift for tool_ontology); L11b an override delete and L11c its undelete
 *      leave the target node byte-identical; L11d a governed delete still removes the node
 *      (owner decision D3 — removal is not content). L11e the same undelete under a DEVELOPER
 *      principal projects (the positive control: the context wrapper itself blocks nothing).
 *      Mutation-checked 2026-10-21: the principal check dropped → L11a/b/c red.
 *      L11f (closure r1) NO principal FAILS CLOSED — there is no implicit "system": an
 *      override delete with no request scope at all (the stdio MCP surface runs its principal's
 *      writes outside one) leaves its target byte-identical, and a governed undelete inside an
 *      UNAUTHENTICATED scope writes no node. Mutation-checked 2026-10-21: the old
 *      `principal === undefined ||` restored → L11f red (both halves).
 *   L1-L10 therefore run their events AS A DEVELOPER (devTest — the door's realistic actor: a
 *   developer's TM undelete / override delete); the removal legs would pass under anyone (D3).
 *
 * RED-FIRST, honestly: L1/L2/L3/L6a/L6b/L9 are red at the pre-fix sha (the finding). L4/L5/L7/L8 are
 * GUARDS of the fix's own edges and are green pre-fix BY CONSTRUCTION — no projection exists to
 * misbehave; their proof is mutation (detached projection / tipo from the snapshot / existence
 * check dropped / root guard dropped → red). L2/L3 remove the node explicitly after the delete
 * so the undelete leg does not depend on L1's half being fixed.
 *
 * Scratch: tlds `zzlca` (section zzlca0) + `zzlcb` (zzlcb0); `localontology0` ids LOCAL_IDS
 * (distinct from ontology_overwrite_native's); L9b plants the `localontology0` ROOT only when
 * the suite DB lacks it, and removes only what it planted. Swept before and after, zero
 * residue asserted (dd_ontology, matrix_ontology, matrix_time_machine, matrix_counter — the
 * explicit-id undeletes raise the scratch sections' counters).
 */

import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as ddOntology from '../../src/core/db/dd_ontology.ts';
import { deleteDdOntologyNode, readDdOntologyRow } from '../../src/core/db/dd_ontology.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { inspectOntology } from '../../src/core/ontology/ontology_state.ts';
import { insertDdOntologyRecord } from '../../src/core/ontology/ontology_write.ts';
import {
	deleteSectionData,
	deleteSectionRecord,
} from '../../src/core/section/record/delete_record.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { runWithRequestContext } from '../../src/core/security/request_context.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import {
	restoreAbsentSectionRow,
	restoreSection,
} from '../../tools/tool_time_machine/server/tool_time_machine.ts';

const OWN = 'zzlca';
const OTHER = 'zzlcb';
const OWN_SECTION = `${OWN}0`;
const OTHER_SECTION = `${OTHER}0`;
const LOCAL = 'localontology0';
const LOCAL_IDS = [990101, 990102] as const;
const USER_ID = -1;

const NON_DEVELOPER: Principal = Object.freeze({
	userId: USER_ID,
	isGlobalAdmin: true,
	isDeveloper: false,
});
const DEVELOPER: Principal = Object.freeze({
	userId: USER_ID,
	isGlobalAdmin: true,
	isDeveloper: true,
});
/** Run `work` as `principal` (the request-context backstop the lifecycle reads); undefined = an unauthenticated scope. */
const as = <T>(principal: Principal | undefined, work: () => Promise<T>): Promise<T> =>
	runWithRequestContext(
		{ principal, session: null, requestId: 'ontology_record_lifecycle', clientIp: '' },
		work,
	);
/** A leg whose events run as a DEVELOPER (content projection is developer-only, L11). */
const devTest = (name: string, body: () => Promise<void>): void => {
	test(name, () => as(DEVELOPER, body));
};

const loc = (sectionTipo: string, sectionId: number, from: string, type = 'dd151') => ({
	id: 1,
	type,
	section_id: sectionId,
	section_tipo: sectionTipo,
	from_component_tipo: from,
});
const YES = (from: string) => [loc('dd64', 1, from)];
const NO = (from: string) => [loc('dd64', 2, from)];

async function seed(
	sectionTipo: string,
	sectionId: number,
	declaredTld: string,
	term: string,
	relation: Record<string, unknown> = {},
): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_ontology (section_id, section_tipo, data, relation, string)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb, $5::text::jsonb)`,
		[
			sectionId,
			sectionTipo,
			JSON.stringify({ section_id: sectionId, section_tipo: sectionTipo }),
			JSON.stringify(relation),
			JSON.stringify({
				ontology7: [{ id: 1, lang: 'lg-nolan', value: declaredTld }],
				ontology5: [{ id: 1, lang: 'lg-spa', value: term }],
			}),
		],
	);
	await clearOntologyDerivedCaches();
}

/** An override of `<OWN_SECTION>/<target>` (the create-door defaults a real record carries). */
async function seedOverride(localId: number, target: number, term: string): Promise<void> {
	await seed(LOCAL, localId, 'localontology', term, {
		ontology42: [loc(OWN_SECTION, target, 'ontology42')],
		ontology8: YES('ontology8'),
		ontology30: NO('ontology30'),
	});
}

/** The `<tld>0` main node — what makes a tld "projected" (the root the birth guard asks for). */
async function plantRoot(tld: string): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, tld, model, model_tipo, is_main, relations, term)
		 VALUES ($1, $2, 'section', 'dd6', true, $3::text::jsonb, $4::text::jsonb)`,
		[
			`${tld}0`,
			tld,
			JSON.stringify([{ tipo: 'ontology1' }, { tipo: 'dd1201' }]),
			JSON.stringify({ 'lg-spa': tld }),
		],
	);
	await clearOntologyDerivedCaches();
}

/** A canonical node planted directly (no source record) — the foreign-record target. */
async function plantNode(tipo: string, tld: string, term: string): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, tld, model, term, is_model, is_translatable, is_main)
		 VALUES ($1, $2, 'component_input_text', $3::text::jsonb, false, true, false)`,
		[tipo, tld, JSON.stringify({ 'lg-spa': term })],
	);
	await clearOntologyDerivedCaches();
}

async function rowOf(tipo: string): Promise<unknown> {
	const rows = (await sql.unsafe('SELECT to_jsonb(d) AS row FROM dd_ontology d WHERE tipo = $1', [
		tipo,
	])) as { row: unknown }[];
	return rows[0]?.row ?? null;
}

async function termOf(tipo: string): Promise<string | null> {
	const row = await readDdOntologyRow(tipo);
	return (row?.term as Record<string, string> | null)?.['lg-spa'] ?? null;
}

async function matrixRowExists(sectionTipo: string, sectionId: number): Promise<boolean> {
	const rows = (await sql.unsafe(
		'SELECT 1 FROM matrix_ontology WHERE section_tipo = $1 AND section_id = $2',
		[sectionTipo, sectionId],
	)) as unknown[];
	return rows.length > 0;
}

/** The delete's own whole-record TM snapshot (tipo = section_tipo), newest first. */
async function deletedSnapshot(
	sectionTipo: string,
	sectionId: number,
): Promise<{ id: number; data: unknown }> {
	const rows = (await sql.unsafe(
		`SELECT id, data FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2 AND tipo = $1
		  ORDER BY id DESC LIMIT 1`,
		[sectionTipo, sectionId],
	)) as { id: number; data: unknown }[];
	const row = rows[0];
	if (row === undefined) throw new Error(`no TM snapshot for ${sectionTipo}/${sectionId}`);
	return { id: Number(row.id), data: row.data };
}

const kinds = (state: Awaited<ReturnType<typeof inspectOntology>>, kind: string) =>
	state.drift.filter((item) => item.kind === kind).map((item) => item.tipo);

async function scratchTipos(): Promise<string[]> {
	const rows = (await sql.unsafe(
		'SELECT tipo FROM dd_ontology WHERE tld IN ($1, $2) ORDER BY tipo',
		[OWN, OTHER],
	)) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

/** Whether THIS file planted the `localontology0` root (an ambient one is never touched). */
let plantedLocalRoot = false;

/**
 * The `localontology0` root (the virtual of ontology1 an install holding overrides projects),
 * planted ONLY when the suite DB lacks it — the projection row of an existing core section, not
 * a new definition — and removed by the sweep only when this file planted it.
 */
async function plantLocalRoot(): Promise<void> {
	if ((await readDdOntologyRow(LOCAL)) !== null) return;
	await assertTestDatabase('ontology_record_lifecycle_native');
	plantedLocalRoot = true;
	await plantRoot('localontology');
}

async function sweep(): Promise<void> {
	await assertTestDatabase('ontology_record_lifecycle_native');
	if (plantedLocalRoot) {
		await sql.unsafe('DELETE FROM dd_ontology WHERE tipo = $1', [LOCAL]);
		plantedLocalRoot = false;
	}
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld IN ($1, $2)', [OWN, OTHER]);
	await sql.unsafe(
		'DELETE FROM matrix_ontology WHERE section_tipo IN ($1, $2) OR (section_tipo = $3 AND section_id IN ($4, $5))',
		[OWN_SECTION, OTHER_SECTION, LOCAL, ...LOCAL_IDS],
	);
	await sql.unsafe(
		'DELETE FROM matrix_time_machine WHERE section_tipo IN ($1, $2) OR (section_tipo = $3 AND section_id IN ($4, $5))',
		[OWN_SECTION, OTHER_SECTION, LOCAL, ...LOCAL_IDS],
	);
	await sql.unsafe('DELETE FROM matrix_counter WHERE tipo IN ($1, $2)', [
		OWN_SECTION,
		OTHER_SECTION,
	]);
	await clearOntologyDerivedCaches();
}

/** Every scratch row this file can leave, outside dd_ontology (matrix, TM, counters). */
async function scratchSourceResidue(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT (SELECT count(*) FROM matrix_ontology
		          WHERE section_tipo IN ($1, $2) OR (section_tipo = $3 AND section_id IN ($4, $5)))
		      + (SELECT count(*) FROM matrix_time_machine
		          WHERE section_tipo IN ($1, $2) OR (section_tipo = $3 AND section_id IN ($4, $5)))
		      + (SELECT count(*) FROM matrix_counter WHERE tipo IN ($1, $2)) AS n`,
		[OWN_SECTION, OTHER_SECTION, LOCAL, ...LOCAL_IDS],
	)) as { n: number | string }[];
	return Number(rows[0]?.n ?? -1);
}

beforeEach(sweep);
afterAll(async () => {
	await sweep();
	expect(await scratchTipos()).toEqual([]);
	expect(await scratchSourceResidue()).toBe(0);
});

/** zzlca0 root + zzlca0/<id> seeded and projected through today's primitive. */
async function projectedOwnRecord(sectionId: number, term = `own ${sectionId}`): Promise<void> {
	await plantRoot(OWN);
	await seed(OWN_SECTION, sectionId, OWN, term);
	expect(await insertDdOntologyRecord(OWN_SECTION, sectionId)).toBe(`${OWN}${sectionId}`);
	expect(await termOf(`${OWN}${sectionId}`)).toBe(term);
}

describe('L1/L9: deleting an ontology record removes its node', () => {
	devTest('L1 deleteSectionRecord: the node is gone, no orphaned drift', async () => {
		await projectedOwnRecord(1);

		const result = await deleteSectionRecord(OWN_SECTION, 1, USER_ID);
		expect(result.removed).toBe(true);
		expect(await matrixRowExists(OWN_SECTION, 1)).toBe(false);
		expect(await readDdOntologyRow(`${OWN}1`)).toBeNull();
		expect(kinds(await inspectOntology(OWN), 'orphaned')).toEqual([]);
	});

	devTest('L9 deleteSectionData: the node is gone', async () => {
		await projectedOwnRecord(4);

		await deleteSectionData(OWN_SECTION, 4, USER_ID);
		expect(await readDdOntologyRow(`${OWN}4`)).toBeNull();
	});
});

describe('L1b/L9c: a delete rolled back by its outer transaction keeps its node', () => {
	/**
	 * Run `door` inside an outer transaction that throws AFTER it: inside, the node must
	 * already be gone (the removal is IN the unit, not queued after COMMIT); after the
	 * rollback, the node must be byte-identical (the removal was not detached either).
	 */
	async function rolledBackDelete(sectionId: number, door: () => Promise<unknown>): Promise<void> {
		await projectedOwnRecord(sectionId);
		const before = await rowOf(`${OWN}${sectionId}`);
		expect(before).not.toBeNull();
		let insideTx: unknown = 'not reached';
		const probe = new Error('rollback probe');
		await expect(
			withTransaction(async () => {
				await door();
				insideTx = await readDdOntologyRow(`${OWN}${sectionId}`);
				throw probe;
			}),
		).rejects.toBe(probe);
		expect(insideTx).toBeNull();
		expect(await matrixRowExists(OWN_SECTION, sectionId)).toBe(true);
		expect(await rowOf(`${OWN}${sectionId}`)).toEqual(before);
	}

	devTest('L1b deleteSectionRecord', async () => {
		await rolledBackDelete(11, () => deleteSectionRecord(OWN_SECTION, 11, USER_ID));
	});

	devTest('L9c deleteSectionData', async () => {
		await rolledBackDelete(12, () => deleteSectionData(OWN_SECTION, 12, USER_ID));
	});
});

describe('L2/L3/L4: undeleting an ontology record re-projects its node, transactionally', () => {
	/** Delete zzlca0/1 and make sure its node is gone, whatever the delete half does. */
	async function deletedOwnRecord(): Promise<{ id: number; data: unknown }> {
		await projectedOwnRecord(1);
		await deleteSectionRecord(OWN_SECTION, 1, USER_ID);
		await deleteDdOntologyNode(`${OWN}1`);
		expect(await readDdOntologyRow(`${OWN}1`)).toBeNull();
		return deletedSnapshot(OWN_SECTION, 1);
	}

	devTest(
		'L2 restoreSection (TM undelete): the node equals the parse, no missing drift',
		async () => {
			const snapshot = await deletedOwnRecord();

			await restoreSection(snapshot.data, snapshot.id, OWN_SECTION, 1, USER_ID);
			expect(await matrixRowExists(OWN_SECTION, 1)).toBe(true);
			expect(await termOf(`${OWN}1`)).toBe('own 1');
			const state = await inspectOntology(OWN);
			// Floor: the drift census below read the restored record (an empty parse is not "in sync").
			expect(state.matrixNodes).toBeGreaterThanOrEqual(1);
			expect(kinds(state, 'missing')).toEqual([]);
			expect(kinds(state, 'stale')).toEqual([]);
		},
	);

	devTest('L3 restoreAbsentSectionRow (bulk revert undelete): the node is back', async () => {
		const snapshot = await deletedOwnRecord();

		const written = await restoreAbsentSectionRow(
			snapshot.data,
			snapshot.id,
			OWN_SECTION,
			1,
			{ userId: USER_ID },
			USER_ID,
		);
		expect(written).not.toBeNull();
		expect(await termOf(`${OWN}1`)).toBe('own 1');
		expect(kinds(await inspectOntology(OWN), 'missing')).toEqual([]);
	});

	devTest(
		'L4 an undelete rolled back by its outer transaction: node visible INSIDE, absent after',
		async () => {
			const snapshot = await deletedOwnRecord();

			let insideTx: unknown = null;
			const probe = new Error('L4 rollback probe');
			await expect(
				withTransaction(async () => {
					await restoreAbsentSectionRow(
						snapshot.data,
						snapshot.id,
						OWN_SECTION,
						1,
						{ userId: USER_ID },
						USER_ID,
					);
					insideTx = await readDdOntologyRow(`${OWN}1`);
					throw probe;
				}),
			).rejects.toBe(probe);
			// In the unit (a post-COMMIT / ledger-drain projection would not be visible here) …
			expect(insideTx).not.toBeNull();
			// … and of it (a detached projection would survive the rollback).
			expect(await matrixRowExists(OWN_SECTION, 1)).toBe(false);
			expect(await readDdOntologyRow(`${OWN}1`)).toBeNull();
		},
	);
});

describe('L5: a FOREIGN record never touches the namespace its ontology7 names', () => {
	devTest(
		'delete leaves zzlcb2 byte-identical; undelete succeeds and writes neither zzlcb2 nor zzlca2',
		async () => {
			await plantRoot(OWN);
			await plantRoot(OTHER);
			await plantNode(`${OTHER}2`, OTHER, 'CANON');
			await seed(OWN_SECTION, 2, OTHER, 'FOREIGN');
			const canonical = await rowOf(`${OTHER}2`);
			expect(canonical).not.toBeNull();

			await deleteSectionRecord(OWN_SECTION, 2, USER_ID);
			expect(await rowOf(`${OTHER}2`)).toEqual(canonical);

			const snapshot = await deletedSnapshot(OWN_SECTION, 2);
			await restoreSection(snapshot.data, snapshot.id, OWN_SECTION, 2, USER_ID);
			expect(await matrixRowExists(OWN_SECTION, 2)).toBe(true);
			expect(await rowOf(`${OTHER}2`)).toEqual(canonical);
			expect(await readDdOntologyRow(`${OWN}2`)).toBeNull();
		},
	);
});

describe('L6/L7: an override record re-projects the node it overrides', () => {
	/** zzlca0/3 'canon' overridden by localontology0/LOCAL_IDS[0] 'local', projected. */
	async function overriddenNode(): Promise<void> {
		await plantRoot(OWN);
		await seed(OWN_SECTION, 3, OWN, 'canon');
		await seedOverride(LOCAL_IDS[0], 3, 'local');
		expect(await insertDdOntologyRecord(OWN_SECTION, 3)).toBe(`${OWN}3`);
		expect(await termOf(`${OWN}3`)).toBe('local');
	}

	devTest(
		'L6a delete the override → the target is re-projected with the canonical term',
		async () => {
			await overriddenNode();

			await deleteSectionRecord(LOCAL, LOCAL_IDS[0], USER_ID);
			expect(await termOf(`${OWN}3`)).toBe('canon');
			expect(kinds(await inspectOntology(OWN), 'stale')).toEqual([]);
		},
	);

	devTest('L6b undelete the override → the target carries the override term again', async () => {
		await overriddenNode();
		await deleteSectionRecord(LOCAL, LOCAL_IDS[0], USER_ID);
		// Stand on its own: re-parse now (the override is gone → canon), whatever L6a's half does.
		await insertDdOntologyRecord(OWN_SECTION, 3);
		expect(await termOf(`${OWN}3`)).toBe('canon');

		const snapshot = await deletedSnapshot(LOCAL, LOCAL_IDS[0]);
		await restoreSection(snapshot.data, snapshot.id, LOCAL, LOCAL_IDS[0], USER_ID);
		expect(await termOf(`${OWN}3`)).toBe('local');
		expect(kinds(await inspectOntology(OWN), 'stale')).toEqual([]);
	});

	devTest(
		'L9b deleteSectionData on the override → the target is re-projected from the pre-wipe locators',
		async () => {
			// The wipe empties what the section DECLARES: the override section must resolve as an
			// install that holds overrides projects it (`localontology0` root → ontology1). Planted
			// only when absent, removed by the sweep only then (plantLocalRoot).
			await plantLocalRoot();
			await overriddenNode();

			await deleteSectionData(LOCAL, LOCAL_IDS[0], USER_ID);
			expect(await termOf(`${OWN}3`)).toBe('canon');
			expect(kinds(await inspectOntology(OWN), 'stale')).toEqual([]);
		},
	);

	devTest(
		'L7 an override of an UNPROJECTED node creates no canonical node, on delete or undelete',
		async () => {
			await plantRoot(OWN);
			await seed(OWN_SECTION, 6, OWN, 'canon');
			await seedOverride(LOCAL_IDS[1], 6, 'local');
			expect(await readDdOntologyRow(`${OWN}6`)).toBeNull();

			await deleteSectionRecord(LOCAL, LOCAL_IDS[1], USER_ID);
			expect(await readDdOntologyRow(`${OWN}6`)).toBeNull();
			const snapshot = await deletedSnapshot(LOCAL, LOCAL_IDS[1]);
			await restoreSection(snapshot.data, snapshot.id, LOCAL, LOCAL_IDS[1], USER_ID);
			expect(await readDdOntologyRow(`${OWN}6`)).toBeNull();
		},
	);
});

describe('L8: a birth never re-plants a tld that is not projected', () => {
	devTest('undelete into a tld without its <tld>0 root writes no node', async () => {
		// No plantRoot(OTHER): the tld is torn down / inactive.
		await seed(OTHER_SECTION, 9, OTHER, 'unprojected');
		await deleteSectionRecord(OTHER_SECTION, 9, USER_ID);
		const snapshot = await deletedSnapshot(OTHER_SECTION, 9);

		await restoreSection(snapshot.data, snapshot.id, OTHER_SECTION, 9, USER_ID);
		expect(await matrixRowExists(OTHER_SECTION, 9)).toBe(true);
		expect(await readDdOntologyRow(`${OTHER}9`)).toBeNull();
		expect(await scratchTipos()).toEqual([]);
	});
});

describe('L10: only the namespace refusal is tolerated by a birth', () => {
	devTest(
		'a grammar / constraint refusal of the re-projection aborts the undelete (no row, no node)',
		async () => {
			await projectedOwnRecord(13);
			await deleteSectionRecord(OWN_SECTION, 13, USER_ID);
			const snapshot = await deletedSnapshot(OWN_SECTION, 13);
			// No record reaches a grammar refusal through the parser today (defective references are
			// dropped, the address check precedes the write): the write door's refusal is forced.
			const spy = spyOn(ddOntology, 'upsertDdOntologyNode').mockImplementation(async () => {
				throw new DedaloError('ontology.invalid_node', { message: 'L10 forced grammar refusal' });
			});
			try {
				const outcome = await restoreSection(
					snapshot.data,
					snapshot.id,
					OWN_SECTION,
					13,
					USER_ID,
				).catch((error: unknown) => error);
				expect(spy).toHaveBeenCalled();
				expect(String((outcome as Error)?.message ?? outcome)).toContain(
					'L10 forced grammar refusal',
				);
			} finally {
				spy.mockRestore();
			}
			expect(await matrixRowExists(OWN_SECTION, 13)).toBe(false);
			expect(await readDdOntologyRow(`${OWN}13`)).toBeNull();
		},
	);
});

describe('L11: content projection is developer-only; removal is not', () => {
	/** Delete zzlca0/<id> (node removed) and answer its snapshot. */
	async function deletedOwnRecord(sectionId: number): Promise<{ id: number; data: unknown }> {
		await projectedOwnRecord(sectionId);
		await deleteSectionRecord(OWN_SECTION, sectionId, USER_ID);
		expect(await readDdOntologyRow(`${OWN}${sectionId}`)).toBeNull();
		return deletedSnapshot(OWN_SECTION, sectionId);
	}

	test('L11a a non-developer undelete restores the record and writes no node (missing drift)', async () => {
		const snapshot = await deletedOwnRecord(21);

		await as(NON_DEVELOPER, () =>
			restoreSection(snapshot.data, snapshot.id, OWN_SECTION, 21, USER_ID),
		);
		expect(await matrixRowExists(OWN_SECTION, 21)).toBe(true);
		expect(await readDdOntologyRow(`${OWN}21`)).toBeNull();
		expect(kinds(await inspectOntology(OWN), 'missing')).toEqual([`${OWN}21`]);
	});

	test('L11e the same undelete as a DEVELOPER projects the node', async () => {
		const snapshot = await deletedOwnRecord(22);

		await as(DEVELOPER, () => restoreSection(snapshot.data, snapshot.id, OWN_SECTION, 22, USER_ID));
		expect(await termOf(`${OWN}22`)).toBe('own 22');
	});

	/** zzlca0/<id> 'canon' overridden by LOCAL_IDS[0] 'local', projected (term 'local'). */
	async function overriddenOwnNode(sectionId: number): Promise<void> {
		await plantRoot(OWN);
		await seed(OWN_SECTION, sectionId, OWN, 'canon');
		await seedOverride(LOCAL_IDS[0], sectionId, 'local');
		expect(await insertDdOntologyRecord(OWN_SECTION, sectionId)).toBe(`${OWN}${sectionId}`);
		expect(await termOf(`${OWN}${sectionId}`)).toBe('local');
	}

	test('L11b a non-developer override delete leaves the target node untouched (stale drift)', async () => {
		await overriddenOwnNode(23);
		const overridden = await rowOf(`${OWN}23`);

		await as(NON_DEVELOPER, () => deleteSectionRecord(LOCAL, LOCAL_IDS[0], USER_ID));
		expect(await matrixRowExists(LOCAL, LOCAL_IDS[0])).toBe(false);
		expect(await rowOf(`${OWN}23`)).toEqual(overridden);
		expect(kinds(await inspectOntology(OWN), 'stale')).toEqual([`${OWN}23`]);
	});

	test('L11c a non-developer override undelete leaves the target node untouched', async () => {
		await overriddenOwnNode(25);
		// A developer's delete re-projects the canonical term (L6a).
		await as(DEVELOPER, () => deleteSectionRecord(LOCAL, LOCAL_IDS[0], USER_ID));
		expect(await termOf(`${OWN}25`)).toBe('canon');
		const canonical = await rowOf(`${OWN}25`);

		const snapshot = await deletedSnapshot(LOCAL, LOCAL_IDS[0]);
		await as(NON_DEVELOPER, () =>
			restoreSection(snapshot.data, snapshot.id, LOCAL, LOCAL_IDS[0], USER_ID),
		);
		expect(await matrixRowExists(LOCAL, LOCAL_IDS[0])).toBe(true);
		expect(await rowOf(`${OWN}25`)).toEqual(canonical);
	});

	test('L11d a non-developer delete still removes the node (D3: removal is not content)', async () => {
		await projectedOwnRecord(24);

		await as(NON_DEVELOPER, () => deleteSectionRecord(OWN_SECTION, 24, USER_ID));
		expect(await matrixRowExists(OWN_SECTION, 24)).toBe(false);
		expect(await readDdOntologyRow(`${OWN}24`)).toBeNull();
	});

	test('L11f no principal FAILS CLOSED (1): an override delete with NO request scope leaves its target untouched', async () => {
		// How the stdio MCP surface runs a principal's delete: no runWithRequestContext at all.
		await overriddenOwnNode(26);
		const overridden = await rowOf(`${OWN}26`);
		await deleteSectionRecord(LOCAL, LOCAL_IDS[0], USER_ID);
		expect(await matrixRowExists(LOCAL, LOCAL_IDS[0])).toBe(false);
		expect(await rowOf(`${OWN}26`)).toEqual(overridden);
		expect(kinds(await inspectOntology(OWN), 'stale')).toEqual([`${OWN}26`]);
	});

	test('L11f no principal FAILS CLOSED (2): an undelete in an UNAUTHENTICATED scope writes no node', async () => {
		const snapshot = await deletedOwnRecord(27);
		await as(undefined, () => restoreSection(snapshot.data, snapshot.id, OWN_SECTION, 27, USER_ID));
		expect(await matrixRowExists(OWN_SECTION, 27)).toBe(true);
		expect(await readDdOntologyRow(`${OWN}27`)).toBeNull();
	});
});
