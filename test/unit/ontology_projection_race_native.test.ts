/**
 * ONT-1/2/3 UNDER CONCURRENCY — the whole-tld re-derive and the per-record / lifecycle doors
 * of the SAME tld are serialized, so node presence follows record presence. TS-native
 * write-path contract (audit 2026-09-26, closure r0 finding "rebuildOntology races the
 * lifecycle projections").
 *
 * The invariant `dd_ontology(tld) == parse(matrix_ontology(<tld>0))` is a read-modify-write:
 * rebuildOntology parses the records, then deletes orphans and upserts the parse; the
 * lifecycle hook (a record delete / undelete) and projectOntologyNode read and then write.
 * Under READ COMMITTED withTransaction alone orders none of it. The fix is ONE tld-scoped
 * advisory lock (dd_ontology.ts lockOntologyProjection) every such door takes before its
 * first read. Each leg holds one side's transaction OPEN, starts the other side, waits until
 * that side is BLOCKED in Postgres (a `Lock` wait in pg_stat_activity), then commits:
 *
 *   R1 rebuild vs a DELETE of `<tld>0/7`: pre-fix the rebuild parsed the still-visible record,
 *      its upsert waited on the deleted node row and re-inserted it after the commit — a node
 *      for a deleted record. Asserted: record gone ⇒ node gone, and the tld in sync.
 *   R2 rebuild vs an UNDELETE of `<tld>0/7`: the rebuild must wait for the undelete (pre-fix
 *      it ran straight through; the narrower window — the undelete committing between the
 *      rebuild's parse and its orphan delete — then removed the undeleted record's node).
 *      Asserted: blocked, then record present ⇒ node present, and the tld in sync.
 *   R3 the per-record door (insertDdOntologyRecord → projectOntologyNode, the explicit
 *      set-records path, outside any caller transaction) vs a DELETE: pre-fix the same
 *      stale-parse re-insert as R1. Asserted: record gone ⇒ node gone.
 *   R4 an UNDELETE racing the tld TEARDOWN (retractOntology): the birth's "is the tld
 *      projected?" root read must be ordered too, or a birth that read the root before the
 *      teardown committed re-plants a node into the torn-down tld. Asserted: no row of the tld.
 *   R5 an OVERRIDE delete racing the teardown: same check-then-act on the override's target
 *      ("only an already-projected node is re-parsed"). Asserted: no row of the tld.
 *   R6 the REGISTRY ACTIVATION (syncOntologyActivation, tool_ontology on an ontology35 record)
 *      racing the teardown's retract (closure r1): its "active? in sync?" decision and the
 *      `<tld>0` re-plant must be one unit under the lock, or an activation that decided before
 *      the retract committed re-plants the root while the registry row still exists (the
 *      teardown deletes it only later) — a torn-down tld that keeps a root and stays "active".
 *      R6a an in-sync tld, R6b a drifted one. Asserted: no row of the tld.
 *   R7 a rebuild with `onlyIfProjected` (the activation's re-derive) queued behind the retract:
 *      it re-asks "active?" under the lock and leaves the tld empty instead of re-deriving it
 *      from records the teardown has not deleted yet. Asserted: no row, `notProjected`.
 *   R0 lockOntologyProjection refuses outside a transaction (the xact lock would be a no-op
 *      there), resolves inside one, and an empty tld list is a no-op anywhere.
 *
 * The content legs (R2/R4/R5) run their events AS A DEVELOPER: the lifecycle's content
 * branches are developer-only and fail closed without a principal
 * (ontology_record_lifecycle_native L11/L11f).
 *
 * Mutation-checked 2026-10-21: the rebuild's lock removed → R1 + R2 red; projectOntologyNode's
 * lock removed → R3 red; unprojectOntologyNode's (the death) → R1 + R3 red; the governed
 * birth's lock before its root read → R4 red; the override lock before its target reads → R5 red;
 * (r1) the activation's lock dropped → R6a red (R6b stays green BY DESIGN: its re-derive
 * re-asks "active?" under the rebuild's own lock — that half is R7's); the rebuild's
 * `onlyIfProjected` re-check dropped → R7 red; the outside-transaction refusal dropped → R0 red.
 *
 * Scratch: tld `zzopr` (section `zzopr0`, owned by this file alone — it used to share `zzrc`
 * with reconcile_registry_native, whose TLD-wide sweep a parallel run would collide with) + the `localontology0`
 * override id OVERRIDE_ID (distinct from the other ontology gates'); swept before and after
 * (dd_ontology, matrix_ontology, matrix_time_machine, matrix_counter), zero residue asserted.
 * The rebuild runs with mainNode 'existing'; only R6 creates a registry row of `zzopr`
 * (createMainSection, matrix_ontology_main / ontology35), swept with its TM rows.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { lockOntologyProjection, readDdOntologyRow } from '../../src/core/db/dd_ontology.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	inspectOntology,
	rebuildOntology,
	retractOntology,
	syncOntologyActivation,
} from '../../src/core/ontology/ontology_state.ts';
import {
	createMainSection,
	insertDdOntologyRecord,
} from '../../src/core/ontology/ontology_write.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { runWithRequestContext } from '../../src/core/security/request_context.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { restoreSection } from '../../tools/tool_time_machine/server/tool_time_machine.ts';

const TLD = 'zzopr';
const SECTION = `${TLD}0`;
const ID = 7;
const NODE = `${TLD}${ID}`;
const USER_ID = -1;
const LOCAL = 'localontology0';
const OVERRIDE_ID = 990301;
/** How long a leg waits for the concurrent side to block (it blocks at once when serialized). */
const BLOCK_WAIT_MS = 10_000;

const DEVELOPER: Principal = Object.freeze({
	userId: USER_ID,
	isGlobalAdmin: true,
	isDeveloper: true,
});
/** Run `work` as a DEVELOPER (the lifecycle's content branches are developer-only). */
const asDeveloper = <T>(work: () => Promise<T>): Promise<T> =>
	runWithRequestContext(
		{ principal: DEVELOPER, session: null, requestId: 'ontology_projection_race', clientIp: '' },
		work,
	);

/** Registry rows (matrix_ontology_main / ontology35) naming the scratch tld. */
async function registryIds(): Promise<number[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM matrix_ontology_main
		  WHERE section_tipo = 'ontology35' AND string->'hierarchy6' @> $1::text::jsonb`,
		[JSON.stringify([{ value: TLD }])],
	)) as { section_id: number }[];
	return rows.map((row) => Number(row.section_id));
}

const loc = (sectionTipo: string, sectionId: number, from: string) => ({
	id: 1,
	type: 'dd151',
	section_id: sectionId,
	section_tipo: sectionTipo,
	from_component_tipo: from,
});

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

async function seedRecord(term: string): Promise<void> {
	await seed(SECTION, ID, TLD, term);
}

/** An override of `<SECTION>/<ID>` (the create-door defaults a real record carries). */
async function seedOverride(term: string): Promise<void> {
	await seed(LOCAL, OVERRIDE_ID, 'localontology', term, {
		ontology42: [loc(SECTION, ID, 'ontology42')],
		ontology8: [loc('dd64', 1, 'ontology8')],
		ontology30: [loc('dd64', 2, 'ontology30')],
	});
}

async function tldRows(): Promise<string[]> {
	const rows = (await sql.unsafe('SELECT tipo FROM dd_ontology WHERE tld = $1 ORDER BY tipo', [
		TLD,
	])) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

/** The `<tld>0` root — what makes the tld projected. */
async function plantRoot(): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, tld, model, model_tipo, is_main, relations, term)
		 VALUES ($1, $2, 'section', 'dd6', true, $3::text::jsonb, $4::text::jsonb)`,
		[
			SECTION,
			TLD,
			JSON.stringify([{ tipo: 'ontology1' }, { tipo: 'dd1201' }]),
			JSON.stringify({ 'lg-spa': TLD }),
		],
	);
	await clearOntologyDerivedCaches();
}

/** Root + record + its projected node. */
async function projectedRecord(): Promise<void> {
	await plantRoot();
	await seedRecord('race');
	expect(await insertDdOntologyRecord(SECTION, ID)).toBe(NODE);
}

async function recordExists(): Promise<boolean> {
	const rows = (await sql.unsafe(
		'SELECT 1 FROM matrix_ontology WHERE section_tipo = $1 AND section_id = $2',
		[SECTION, ID],
	)) as unknown[];
	return rows.length > 0;
}

/** The record's delete snapshot (tipo = section_tipo), newest first. */
async function deletedSnapshot(): Promise<{ id: number; data: unknown }> {
	const rows = (await sql.unsafe(
		`SELECT id, data FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2 AND tipo = $1
		  ORDER BY id DESC LIMIT 1`,
		[SECTION, ID],
	)) as { id: number; data: unknown }[];
	const row = rows[0];
	if (row === undefined) throw new Error(`no TM snapshot for ${SECTION}/${ID}`);
	return { id: Number(row.id), data: row.data };
}

/** Backends of this database (other than the probe's) waiting on a heavyweight lock. */
async function lockWaiters(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM pg_stat_activity
		  WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
		[],
	)) as { n: number }[];
	return Number(rows[0]?.n ?? 0);
}

/** True once `work` is blocked on a lock in Postgres; false if it settles (ran through) first. */
async function blockedBehind(work: Promise<unknown>): Promise<boolean> {
	let settled = false;
	work.then(
		() => {
			settled = true;
		},
		() => {
			settled = true;
		},
	);
	const deadline = Date.now() + BLOCK_WAIT_MS;
	while (Date.now() < deadline) {
		if (settled) return false;
		if ((await lockWaiters()) > 0) return true;
		await Bun.sleep(20);
	}
	return false;
}

/**
 * Run `holder` in a transaction kept OPEN until the concurrent side (`contender`, started
 * OUTSIDE that transaction) is blocked or done; then commit. Answers whether the contender
 * was blocked, and its result.
 */
async function interleave<T>(
	holder: () => Promise<unknown>,
	contender: () => Promise<T>,
): Promise<{ blocked: boolean; result: T }> {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let holding!: () => void;
	const held = new Promise<void>((resolve) => {
		holding = resolve;
	});
	const holderTx = withTransaction(async () => {
		await holder();
		holding();
		await gate;
	});
	// A holder that fails never reaches `holding`: surface its error instead of hanging.
	await Promise.race([held, holderTx]);
	// This continuation runs in the TEST's context (no ambient transaction), so the
	// contender opens its own transaction on another connection.
	const contended = contender();
	const blocked = await blockedBehind(contended);
	release();
	await holderTx;
	return { blocked, result: await contended };
}

async function sweep(): Promise<void> {
	await assertTestDatabase('ontology_projection_race_native');
	for (const id of await registryIds()) {
		for (const table of ['matrix_time_machine', 'matrix_ontology_main']) {
			await sql.unsafe(
				`DELETE FROM ${table} WHERE section_tipo = 'ontology35' AND section_id = $1`,
				[id],
			);
		}
	}
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [TLD]);
	await sql.unsafe(
		'DELETE FROM matrix_ontology WHERE section_tipo = $1 OR (section_tipo = $2 AND section_id = $3)',
		[SECTION, LOCAL, OVERRIDE_ID],
	);
	await sql.unsafe(
		'DELETE FROM matrix_time_machine WHERE section_tipo = $1 OR (section_tipo = $2 AND section_id = $3)',
		[SECTION, LOCAL, OVERRIDE_ID],
	);
	await sql.unsafe('DELETE FROM matrix_counter WHERE tipo = $1', [SECTION]);
	await clearOntologyDerivedCaches();
}

async function residue(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT (SELECT count(*) FROM dd_ontology WHERE tld = $1)
		      + (SELECT count(*) FROM matrix_ontology
		          WHERE section_tipo = $2 OR (section_tipo = $3 AND section_id = $4))
		      + (SELECT count(*) FROM matrix_time_machine
		          WHERE section_tipo = $2 OR (section_tipo = $3 AND section_id = $4))
		      + (SELECT count(*) FROM matrix_counter WHERE tipo = $2) AS n`,
		[TLD, SECTION, LOCAL, OVERRIDE_ID],
	)) as { n: number | string }[];
	return Number(rows[0]?.n ?? -1);
}

beforeEach(sweep);
afterAll(async () => {
	await sweep();
	expect(await residue()).toBe(0);
	expect(await registryIds()).toEqual([]);
});

describe('ONT under concurrency: node presence follows record presence', () => {
	test('R1 a rebuild racing a record DELETE never re-plants the deleted record’s node', async () => {
		await projectedRecord();

		const { blocked, result } = await interleave(
			() => deleteSectionRecord(SECTION, ID, USER_ID),
			() => rebuildOntology(TLD, USER_ID, { mainNode: 'existing' }),
		);
		expect(blocked).toBe(true);
		expect(result.errors).toEqual([]);
		expect(await recordExists()).toBe(false);
		expect(await readDdOntologyRow(NODE)).toBeNull();
		const state = await inspectOntology(TLD);
		expect(state.drift).toEqual([]);
	}, 30_000);

	test('R2 a rebuild racing a record UNDELETE waits for it; the undeleted record keeps its node', async () => {
		await projectedRecord();
		await deleteSectionRecord(SECTION, ID, USER_ID);
		expect(await readDdOntologyRow(NODE)).toBeNull();
		const snapshot = await deletedSnapshot();

		const { blocked, result } = await interleave(
			() => asDeveloper(() => restoreSection(snapshot.data, snapshot.id, SECTION, ID, USER_ID)),
			() => rebuildOntology(TLD, USER_ID, { mainNode: 'existing' }),
		);
		expect(blocked).toBe(true);
		expect(result.errors).toEqual([]);
		expect(await recordExists()).toBe(true);
		expect(await readDdOntologyRow(NODE)).not.toBeNull();
		const state = await inspectOntology(TLD);
		// Floor: the census read the undeleted record (an empty parse is not "in sync").
		expect(state.matrixNodes).toBe(1);
		expect(state.drift).toEqual([]);
	}, 30_000);

	test('R3 the per-record projection racing a record DELETE never re-plants the node', async () => {
		await projectedRecord();

		const { blocked, result } = await interleave(
			() => deleteSectionRecord(SECTION, ID, USER_ID),
			() => insertDdOntologyRecord(SECTION, ID),
		);
		expect(blocked).toBe(true);
		// The record is gone by the time the projection parses it: nothing to project.
		expect(result).toBeNull();
		expect(await recordExists()).toBe(false);
		expect(await readDdOntologyRow(NODE)).toBeNull();
	}, 30_000);

	test('R4 an undelete racing the tld teardown never re-plants a node into the torn-down tld', async () => {
		await projectedRecord();
		await deleteSectionRecord(SECTION, ID, USER_ID);
		const snapshot = await deletedSnapshot();
		expect(await tldRows()).toEqual([SECTION]);

		const { blocked } = await interleave(
			() => retractOntology(TLD),
			() => asDeveloper(() => restoreSection(snapshot.data, snapshot.id, SECTION, ID, USER_ID)),
		);
		expect(blocked).toBe(true);
		expect(await recordExists()).toBe(true);
		expect(await tldRows()).toEqual([]);
	}, 30_000);

	test('R5 an override delete racing the tld teardown never re-plants its target', async () => {
		await projectedRecord();
		await seedOverride('local');
		expect(await insertDdOntologyRecord(SECTION, ID)).toBe(NODE);
		expect((await readDdOntologyRow(NODE))?.term).toEqual({ 'lg-spa': 'local' });
		// Floor: the tld holds the root AND the target node before the teardown races in.
		expect((await tldRows()).length).toBeGreaterThan(1);

		const { blocked } = await interleave(
			() => retractOntology(TLD),
			() => asDeveloper(() => deleteSectionRecord(LOCAL, OVERRIDE_ID, USER_ID)),
		);
		expect(blocked).toBe(true);
		expect(await tldRows()).toEqual([]);
	}, 30_000);

	/** A projected tld WITH its registry row (what an activation re-plants the root from). */
	async function registeredTld(): Promise<number> {
		await projectedRecord();
		await assertTestDatabase('ontology_projection_race_native');
		const registryId = await createMainSection({ tld: TLD }, USER_ID);
		await clearOntologyDerivedCaches();
		expect(await registryIds()).toEqual([registryId]);
		return registryId;
	}

	test('R6a an IN-SYNC activation racing the retract never re-plants the torn-down root', async () => {
		const registryId = await registeredTld();
		// Floor: in sync, so the activation would take its root re-plant branch.
		expect((await inspectOntology(TLD)).inSync).toBe(true);

		const { blocked, result } = await interleave(
			() => retractOntology(TLD),
			() => syncOntologyActivation([registryId], USER_ID),
		);
		expect(blocked).toBe(true);
		expect(result.errors).toEqual([]);
		// The registry row still exists (the teardown deletes it later): only the lock ordered it.
		expect(await registryIds()).toEqual([registryId]);
		expect(await tldRows()).toEqual([]);
	}, 30_000);

	test('R6b a DRIFTED activation racing the retract never re-derives the torn-down tld', async () => {
		const registryId = await registeredTld();
		await sql.unsafe('DELETE FROM dd_ontology WHERE tipo = $1', [NODE]);
		await clearOntologyDerivedCaches();
		// Floor: drifted (the record's node is missing), so the activation would re-derive.
		expect((await inspectOntology(TLD)).inSync).toBe(false);

		const { blocked, result } = await interleave(
			() => retractOntology(TLD),
			() => syncOntologyActivation([registryId], USER_ID),
		);
		expect(blocked).toBe(true);
		expect(result.errors).toEqual([]);
		expect(await recordExists()).toBe(true);
		expect(await tldRows()).toEqual([]);
	}, 30_000);

	test('R7 a rebuild with onlyIfProjected queued behind the retract leaves the tld empty', async () => {
		await projectedRecord();

		const { blocked, result } = await interleave(
			() => retractOntology(TLD),
			() => rebuildOntology(TLD, USER_ID, { mainNode: 'existing', onlyIfProjected: true }),
		);
		expect(blocked).toBe(true);
		expect(result.notProjected).toBe(true);
		expect(result.applied).toEqual([]);
		expect(await recordExists()).toBe(true);
		expect(await tldRows()).toEqual([]);
	}, 30_000);

	test('R7 control: onlyIfProjected re-derives a tld that still holds rows', async () => {
		await projectedRecord();
		await sql.unsafe('DELETE FROM dd_ontology WHERE tipo = $1', [NODE]);
		await clearOntologyDerivedCaches();

		const result = await rebuildOntology(TLD, USER_ID, {
			mainNode: 'existing',
			onlyIfProjected: true,
		});
		expect(result.notProjected).toBeUndefined();
		expect(await tldRows()).toEqual([SECTION, NODE]);
	});
});

describe('R0 lockOntologyProjection is a transaction lock or a refusal', () => {
	test('refused outside a transaction, taken inside one; an empty list is a no-op anywhere', async () => {
		const refusal = await lockOntologyProjection([TLD]).then(
			() => null,
			(error: unknown) => error,
		);
		expect(refusal).toBeInstanceOf(DedaloError);
		expect((refusal as DedaloError).code).toBe('internal.invariant');
		expect((refusal as DedaloError).coordinates).toEqual({ tld: TLD });
		await expect(withTransaction(() => lockOntologyProjection([TLD]))).resolves.toBeUndefined();
		await expect(lockOntologyProjection([])).resolves.toBeUndefined();
	});
});
