/**
 * THE RELATION INSERT CHOKEPOINT — `validateRelationInserts`
 * (src/core/relations/save.ts), the ONE door every stored locator passes
 * through, and the four constraints it now enforces (picker plan step 2 + the
 * batch wire of step 10).
 *
 * WHY THIS FILE EXISTS. Until this landing the door normalized shape and
 * deduped, and checked NOTHING about the target section, the principal's grant
 * on it, the term's own selectability or `properties.data_limit` — which had
 * ZERO occurrences in src/ and lived only in `component_portal.js`. A rule that
 * lives in the renderer is an invariant with no gate, and here it guards stored
 * data: a forged, stale or simply bypassed client could persist a locator into
 * a section the operator cannot see, or blow through a declared cap. So every
 * refusal below is asserted at the door, not at the UI.
 *
 * THE ASSERTIONS ARE ON OUTCOMES, NOT ON A BOOLEAN. The batch form answers one
 * `{locator, status, code, reason}` per submitted entry, in submission order —
 * a partially refused batch must COMMIT the accepted rows and NAME the refused
 * ones, because dropping an entry with no outcome row is exactly the silent
 * scope narrowing this codebase forbids. Cases that would pass on a
 * degenerate/empty answer are paired with their control (the same locator,
 * accepted, one field different), so nothing here can be vacuously green.
 *
 * SCRATCH SURFACES, all deleted in afterAll (and pre-swept in beforeAll):
 *  - a self-provisioned scratch thesaurus (`ontology/hierarchy_state.ts
 *    ensureHierarchy`, THE single writer) carrying one SELECTABLE term and one
 *    that is not — selectability is a per-node fact of a term's own record, so
 *    it cannot be asserted against a live thesaurus whose flags an operator may
 *    flip;
 *  - scratch caller nodes (synthetic tld) declaring one target each;
 *  - one test3 host record + two throwaway identities.
 * Provisioning grants the creating user's PROFILE level 2 over the new
 * sections, so it runs as a THROWAWAY user — never the superuser, whose profile
 * dd234/2 is a real record holding thousands of live grants.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { deleteTldNodes } from '../../src/core/db/dd_ontology.ts';
import { updateMatrixKeyData } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { ensureHierarchy } from '../../src/core/ontology/hierarchy_state.ts';
import {
	type RelationInsertBatchResult,
	type RelationInsertContext,
	validateRelationInserts,
} from '../../src/core/relations/save.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { type Principal, resolvePrincipal } from '../../src/core/security/permissions.ts';
import { runWithRequestContext } from '../../src/core/security/request_context.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

/** The scratch thesaurus (synthetic tld — no real install uses it). */
const TLD = 'zzpq';
/** Its descriptor section: a VIRTUAL section over hierarchy20, exactly like es1. */
const TERMS = `${TLD}1`;
const CALLER_TLD = 'zzwt';
/** Targets test3; declares no view and no cap. */
const PLAIN = 'zzwt1';
/** Targets the REAL section rsc2 — the virtual-resolution case (rsc170 → rsc2). */
const VIRTUAL = 'zzwt2';
/** Targets the scratch thesaurus and declares view:'tree' — the picker caller. */
const TREE = 'zzwt3';
/** Targets test3 with `properties.data_limit: 2`. */
const CAPPED = 'zzwt4';
/** Targets test3 with a literal `properties.data_limit: 0`. */
const FORBIDDEN = 'zzwt5';
/** Targets the scratch thesaurus, no view — isolates the TARGET gate. */
const THESAURUS_PLAIN = 'zzwt6';

const HOST = 'test3';
const HOST_ID = 926201;
/** Records that exist in the canonical test3 playground. */
const IN_TARGET = [1, 2, 27];
/** A section no caller here declares. */
const OFF_TARGET_SECTION = 'test65';

const siNo = (tipo: string, yes: boolean) => [
	{
		id: 1,
		type: 'dd151',
		section_tipo: 'dd64',
		section_id: yes ? 1 : 2,
		from_component_tipo: tipo,
	},
];

interface Identity {
	userId: number;
	profileId: number;
	principal: Principal;
}

let hierarchyId = 0;
let provisioner: Identity | undefined;
/** Holds NO grant on test3 — the read-grant gate's subject. */
let ungranted: Identity | undefined;
let superuser: Principal;
let unselectableTermId = 0;

async function buildIdentity(
	grants: { tipo: string; section_tipo: string; value: number }[],
): Promise<Identity> {
	const profileId = await createSectionRecord('dd234', -1);
	const userId = await createSectionRecord('dd128', -1);
	await updateMatrixKeyData('matrix_users', 'dd128', userId, 'relation', 'dd1725', [
		{
			id: 1,
			type: 'dd151',
			section_tipo: 'dd234',
			section_id: String(profileId),
			from_component_tipo: 'dd1725',
		},
	]);
	await updateMatrixKeyData(
		'matrix_profiles',
		'dd234',
		profileId,
		'misc',
		'dd774',
		grants.map((grant, index) => ({ id: index + 1, ...grant })),
	);
	return { userId, profileId, principal: await resolvePrincipal(userId) };
}

const targetConfig = (target: string) => ({
	request_config: [{ sqo: { section_tipo: [{ value: [target], source: 'section' }] } }],
});

async function buildCallerNode(tipo: string, properties: Record<string, unknown>): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, parent, model, tld, term, is_model, is_translatable, is_main, properties)
		 VALUES ($1, $2, 'component_portal', $3, $4::text::jsonb, false, false, false, $5::text::jsonb)`,
		[
			tipo,
			// Orphan parent: no section walk can reach these nodes.
			`${CALLER_TLD}x`,
			CALLER_TLD,
			JSON.stringify({ 'lg-spa': `scratch insert caller ${tipo}` }),
			JSON.stringify(properties),
		],
	);
}

async function purgeScratch(): Promise<void> {
	await deleteTldNodes(TLD);
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [CALLER_TLD]);
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [`${TLD}0`]);
	await sql.unsafe('DELETE FROM matrix_hierarchy WHERE section_tipo IN ($1, $2)', [
		TERMS,
		`${TLD}2`,
	]);
	for (const sectionTipo of [`${TLD}0`, TERMS, `${TLD}2`]) {
		await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [sectionTipo]);
		await sql.unsafe('DELETE FROM matrix_counter WHERE tipo = $1', [sectionTipo]);
	}
	await sql.unsafe(
		`DELETE FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND string @> $1::text::jsonb`,
		[JSON.stringify({ hierarchy6: [{ value: TLD }] })],
	);
	const registry = (await sql.unsafe(
		`SELECT section_id FROM matrix_hierarchy_main WHERE section_tipo = 'hierarchy1' AND string @> $1::text::jsonb`,
		[JSON.stringify({ hierarchy6: [{ value: TLD }] })],
	)) as { section_id: number }[];
	const ids = new Set(registry.map((row) => Number(row.section_id)));
	if (hierarchyId !== 0) ids.add(hierarchyId);
	for (const id of ids) {
		await sql.unsafe(
			`DELETE FROM matrix_hierarchy_main WHERE section_tipo = 'hierarchy1' AND section_id = $1`,
			[id],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'hierarchy1' AND section_id = $1`,
			[id],
		);
	}
	await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
		HOST,
		HOST_ID,
	]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		HOST,
		HOST_ID,
	]);
	// The dd542 activity rows the save chokepoint writes for the scratch host.
	await sql.unsafe(
		`DELETE FROM matrix_activity
		 WHERE section_tipo = 'dd542'
		   AND misc->'dd551'->0->'value'->>'section_id' = $1
		   AND misc->'dd551'->0->'value'->>'section_tipo' = $2`,
		[String(HOST_ID), HOST],
	);
	for (const identity of [provisioner, ungranted]) {
		if (identity === undefined) continue;
		for (const [table, sectionTipo, sectionId] of [
			['matrix_profiles', 'dd234', identity.profileId],
			['matrix_users', 'dd128', identity.userId],
		] as [string, string, number][]) {
			await sql.unsafe(`DELETE FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`, [
				sectionTipo,
				sectionId,
			]);
			await sql.unsafe(
				'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
				[sectionTipo, sectionId],
			);
		}
	}
	await clearOntologyDerivedCaches();
}

/** The caller context both insert doors share, for a scratch portal caller. */
const context = (componentTipo: string, existingItems: unknown[] = []): RelationInsertContext => ({
	componentTipo,
	model: 'component_portal',
	hostSectionTipo: HOST,
	hostSectionId: HOST_ID,
	translatable: false,
	lang: 'lg-nolan',
	existingItems,
});

/**
 * Run the door inside a request scope. Identity is ALS-scoped and read PER
 * CALL by the door itself, so the principal must ride the scope — never a
 * parameter and never module state.
 */
function asPrincipal<T>(principal: Principal | undefined, fn: () => Promise<T>): Promise<T> {
	return runWithRequestContext(
		{ principal, session: null, requestId: 'relation_insert_target_gate', clientIp: '127.0.0.1' },
		fn,
	);
}

/** `[status, code]` per outcome — the compact shape most cases assert on. */
const codes = (result: RelationInsertBatchResult) =>
	result.outcomes.map((outcome) => [outcome.status, outcome.code ?? null]);

/** Insert one locator through the REAL save path (not the door in isolation). */
async function saveInserts(
	componentTipo: string,
	values: Record<string, unknown>[],
): Promise<number> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const dispatched = await dispatchRqo(
		{
			action: 'save',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				typo: 'source',
				type: 'component',
				model: 'component_portal',
				tipo: componentTipo,
				section_tipo: HOST,
				section_id: String(HOST_ID),
				mode: 'edit',
				lang: 'lg-nolan',
				action: null,
			},
			data: {
				section_id: String(HOST_ID),
				section_tipo: HOST,
				tipo: componentTipo,
				lang: 'lg-nolan',
				from_component_tipo: componentTipo,
				changed_data: values.map((value) => ({ action: 'insert', id: null, value })),
			},
		} as never,
		{
			requestId: 'relation_insert_target_gate',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal: superuser,
		} as never,
	);
	return dispatched.status;
}

/** What the host record actually holds for a component, straight from jsonb. */
async function storedLocators(componentTipo: string): Promise<Record<string, unknown>[]> {
	const rows = (await sql.unsafe(
		'SELECT relation->$1 AS items FROM matrix_test WHERE section_tipo = $2 AND section_id = $3',
		[componentTipo, HOST, HOST_ID],
	)) as { items: Record<string, unknown>[] | null }[];
	return rows[0]?.items ?? [];
}

beforeAll(async () => {
	if (!DB_READY) return;
	await purgeScratch();

	const occupied = (await sql.unsafe(
		'SELECT section_id FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
		[HOST, HOST_ID],
	)) as unknown[];
	if (occupied.length > 0) {
		throw new Error(
			`relation insert gate: ${HOST}/${HOST_ID} is occupied after the sweep — refusing to write over a record this gate did not create.`,
		);
	}

	provisioner = await buildIdentity([]);
	ungranted = await buildIdentity([]);
	superuser = await resolvePrincipal(-1);

	hierarchyId = await createSectionRecord('hierarchy1', provisioner.userId);
	const registry = (column: 'string' | 'relation', tipo: string, value: unknown) =>
		updateMatrixKeyData('matrix_hierarchy_main', 'hierarchy1', hierarchyId, column, tipo, value);
	await registry('string', 'hierarchy6', [{ id: 1, lang: 'lg-nolan', value: TLD }]);
	await registry('string', 'hierarchy5', [{ id: 1, lang: 'lg-spa', value: 'ZZ insert scratch' }]);
	await registry('relation', 'hierarchy9', [
		{
			type: 'dd151',
			section_tipo: 'hierarchy13',
			section_id: '1',
			from_component_tipo: 'hierarchy9',
		},
	]);
	const provisioned = await ensureHierarchy(hierarchyId, provisioner.userId);
	if (!provisioned.ok) {
		throw new Error(
			`relation insert gate: the scratch thesaurus did not provision (${provisioned.msg}; ${provisioned.errors.join('; ')}) — the selectability cases below would be vacuous.`,
		);
	}
	// The NON-selectable sibling of the provisioned root term (flag NO).
	unselectableTermId = await createSectionRecord(TERMS, provisioner.userId);
	await updateMatrixKeyData(
		'matrix_hierarchy',
		TERMS,
		unselectableTermId,
		'relation',
		'hierarchy24',
		siNo('hierarchy24', false),
	);

	await buildCallerNode(PLAIN, { source: targetConfig(HOST) });
	await buildCallerNode(VIRTUAL, { source: targetConfig('rsc2') });
	await buildCallerNode(TREE, { view: 'tree', source: targetConfig(TERMS) });
	await buildCallerNode(CAPPED, { data_limit: 2, source: targetConfig(HOST) });
	await buildCallerNode(FORBIDDEN, { data_limit: 0, source: targetConfig(HOST) });
	await buildCallerNode(THESAURUS_PLAIN, { source: targetConfig(TERMS) });
	await sql.unsafe('INSERT INTO matrix_test (section_id, section_tipo) VALUES ($1, $2)', [
		HOST_ID,
		HOST,
	]);
	await clearOntologyDerivedCaches();
}, 180000);

afterAll(async () => {
	if (!DB_READY) return;
	await purgeScratch();
});

describe.if(DB_READY)('the insert door — the TARGET constraint', () => {
	test('a locator inside the caller’s declared target is ACCEPTED', async () => {
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts([{ section_tipo: HOST, section_id: IN_TARGET[0] }], context(PLAIN)),
		);
		expect(codes(result)).toEqual([['accepted', null]]);
		expect(result.total).toBe(1);
		// The accepted VALUE is the normalized locator the caller will persist.
		expect(result.outcomes[0]?.value?.from_component_tipo).toBe(PLAIN);
	});

	test('a locator OUTSIDE it is refused, naming the code and the declaration', async () => {
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts(
				[{ section_tipo: OFF_TARGET_SECTION, section_id: 1 }],
				context(PLAIN),
			),
		);
		expect(codes(result)).toEqual([['refused', 'off_target']]);
		expect(result.total).toBe(0);
		expect(result.outcomes[0]?.reason).toContain(OFF_TARGET_SECTION);
		expect(result.outcomes[0]?.reason).toContain(HOST);
	});

	test('a VIRTUAL section is accepted against its real target (rsc170 → rsc2)', async () => {
		// The comparison law resolves BOTH sides, so a caller declaring the real
		// section and a locator naming the virtual one are the same thing.
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts([{ section_tipo: 'rsc170', section_id: 1 }], context(VIRTUAL)),
		);
		expect(codes(result)).toEqual([['accepted', null]]);
	});

	test('a DIFFERENT thesaurus is NOT a target just because it shares a real section', async () => {
		// Every thesaurus is a virtual section over hierarchy20 (es1, ad1, and the
		// scratch one alike). A caller that declares ONE thesaurus must not accept
		// a term from another: the whole point of the declaration is which
		// vocabulary this component links into.
		//
		// MEASURED TODAY: accepted. `relations/picker_constraint.ts` real-resolves
		// the declared targets AND the incoming section, so both sides read
		// 'hierarchy20' and every thesaurus is every other thesaurus's target —
		// the write-path face of the same collapse the picker read shows.
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts([{ section_tipo: 'es1', section_id: 1 }], context(THESAURUS_PLAIN)),
		);
		expect(codes(result)).toEqual([['refused', 'off_target']]);
		// …and its OWN thesaurus still passes, so this is a narrowing, not a wall.
		const own = await asPrincipal(superuser, () =>
			validateRelationInserts([{ section_tipo: TERMS, section_id: 1 }], context(THESAURUS_PLAIN)),
		);
		expect(codes(own)).toEqual([['accepted', null]]);
	});
});

describe.if(DB_READY)('the insert door — the READ GRANT on the linked section', () => {
	test('a principal with no read on the target cannot persist a locator into it', async () => {
		expect(ungranted).toBeDefined();
		const refused = await asPrincipal(ungranted?.principal, () =>
			validateRelationInserts([{ section_tipo: HOST, section_id: IN_TARGET[0] }], context(PLAIN)),
		);
		expect(codes(refused)).toEqual([['refused', 'target_not_readable']]);
		expect(refused.outcomes[0]?.reason).toContain(HOST);

		// The CONTROL: the identical locator, accepted for a principal that may
		// read the section. The refusal is the grant and nothing else.
		const accepted = await asPrincipal(superuser, () =>
			validateRelationInserts([{ section_tipo: HOST, section_id: IN_TARGET[0] }], context(PLAIN)),
		);
		expect(codes(accepted)).toEqual([['accepted', null]]);
	});
});

describe.if(DB_READY)('the insert door — SELECTABILITY is re-asked at the write', () => {
	test('a non-selectable term is refused even though the client sent it', async () => {
		// A rendered affordance is not an authorization: the tree may be stale,
		// forged or simply bypassed, so the term's own flag is read again here.
		const refused = await asPrincipal(superuser, () =>
			validateRelationInserts(
				[{ section_tipo: TERMS, section_id: unselectableTermId }],
				context(TREE),
			),
		);
		expect(codes(refused)).toEqual([['refused', 'term_not_selectable']]);
		expect(refused.outcomes[0]?.reason).toContain(TERMS);

		// The CONTROL: the SELECTABLE sibling, same caller, same section, accepted.
		const accepted = await asPrincipal(superuser, () =>
			validateRelationInserts([{ section_tipo: TERMS, section_id: 1 }], context(TREE)),
		);
		expect(codes(accepted)).toEqual([['accepted', null]]);
	});
});

describe.if(DB_READY)('the insert door — the SELECTION CAP (properties.data_limit)', () => {
	test('data_limit ABSENT means uncapped — absence is not zero', async () => {
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts(
				[1, 2, 27, 3, 4].map((id) => ({ section_tipo: HOST, section_id: id })),
				context(PLAIN),
			),
		);
		expect(codes(result).every(([status]) => status === 'accepted')).toBe(true);
		expect(result.total).toBe(5);
	});

	test('a literal data_limit 0 means NONE may be linked', async () => {
		// The client's `if (data_limit && …)` guard reads 0 as "no limit" (JS
		// truthiness). The server does not: 0 is an answer.
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts(
				[{ section_tipo: HOST, section_id: IN_TARGET[0] }],
				context(FORBIDDEN),
			),
		);
		expect(codes(result)).toEqual([['refused', 'selection_limit']]);
		expect(result.total).toBe(0);
	});

	test('an insert past the cap is refused, naming the limit', async () => {
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts([{ section_tipo: HOST, section_id: 27 }], {
				...context(CAPPED),
				// The component already holds its two.
				existingItems: [
					{ section_id: 1, section_tipo: HOST, type: 'dd151', from_component_tipo: CAPPED },
					{ section_id: 2, section_tipo: HOST, type: 'dd151', from_component_tipo: CAPPED },
				],
			}),
		);
		expect(codes(result)).toEqual([['refused', 'selection_limit']]);
		expect(result.outcomes[0]?.reason).toContain('2');
	});
});

describe.if(DB_READY)('the insert door — a BATCH is validated as a SET', () => {
	test('one off-target entry in a batch of three commits the other two and names it', async () => {
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts(
				[
					{ section_tipo: HOST, section_id: IN_TARGET[0] },
					{ section_tipo: OFF_TARGET_SECTION, section_id: 9 },
					{ section_tipo: HOST, section_id: IN_TARGET[1] },
				],
				context(PLAIN),
			),
		);
		// Outcomes are per entry, in SUBMISSION order — never a compacted list.
		expect(codes(result)).toEqual([
			['accepted', null],
			['refused', 'off_target'],
			['accepted', null],
		]);
		expect(result.total).toBe(2);
		expect(result.outcomes[1]?.locator.section_tipo).toBe(OFF_TARGET_SECTION);
	});

	test('a batch that collectively exceeds data_limit refuses ONLY the overflow', async () => {
		// The reason the cap lives on the batch and not on the request: three
		// picks each individually under a limit of 2 collectively break it.
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts(
				IN_TARGET.map((id) => ({ section_tipo: HOST, section_id: id })),
				context(CAPPED),
			),
		);
		expect(codes(result)).toEqual([
			['accepted', null],
			['accepted', null],
			['refused', 'selection_limit'],
		]);
		expect(result.total).toBe(2);
	});

	test('a duplicate of an already stored row DEDUPS — refused, named, and not an error', async () => {
		const stored = {
			section_id: IN_TARGET[0],
			section_tipo: HOST,
			type: 'dd151',
			from_component_tipo: PLAIN,
		};
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts(
				[
					{ section_tipo: HOST, section_id: IN_TARGET[0] },
					{ section_tipo: HOST, section_id: IN_TARGET[1] },
				],
				context(PLAIN, [stored]),
			),
		);
		expect(codes(result)).toEqual([
			['refused', 'duplicate'],
			['accepted', null],
		]);
		// The row set grew by exactly the one new entry — the duplicate neither
		// threw nor counted.
		expect(result.total).toBe(2);
	});

	test('two identical picks WITHIN one batch collapse, exactly as two saves would', async () => {
		const result = await asPrincipal(superuser, () =>
			validateRelationInserts(
				[
					{ section_tipo: HOST, section_id: IN_TARGET[0] },
					{ section_tipo: HOST, section_id: IN_TARGET[0] },
				],
				context(PLAIN),
			),
		);
		expect(codes(result)).toEqual([
			['accepted', null],
			['refused', 'duplicate'],
		]);
		expect(result.total).toBe(1);
	});
});

describe.if(DB_READY)('the insert door — wired into the SAVE path, under concurrency', () => {
	test('an off-target locator sent through the save API stores NOTHING', async () => {
		// The door in isolation is not the contract; the contract is that no save
		// route reaches the matrix around it.
		const status = await saveInserts(PLAIN, [{ section_tipo: OFF_TARGET_SECTION, section_id: 1 }]);
		expect(status).toBe(200); // refused per locator, not a transport error
		expect(await storedLocators(PLAIN)).toEqual([]);

		// The CONTROL: an in-target locator through the same route DOES store.
		await saveInserts(PLAIN, [{ section_tipo: HOST, section_id: IN_TARGET[0] }]);
		const stored = await storedLocators(PLAIN);
		expect(stored.length).toBe(1);
		expect(stored[0]?.section_tipo).toBe(HOST);
	});

	test('two batches racing the same component do not JOINTLY exceed data_limit', async () => {
		// Each batch is legal on its own (2 ≤ 2). Only the row lock the save
		// chokepoint takes — plus the cap being re-resolved INSIDE that
		// transaction — stops them from landing four rows between them.
		expect((await storedLocators(CAPPED)).length).toBe(0);
		await Promise.all([
			saveInserts(CAPPED, [
				{ section_tipo: HOST, section_id: 1 },
				{ section_tipo: HOST, section_id: 2 },
			]),
			saveInserts(CAPPED, [
				{ section_tipo: HOST, section_id: 27 },
				{ section_tipo: HOST, section_id: 3 },
			]),
		]);
		expect((await storedLocators(CAPPED)).length).toBe(2);
	}, 60000);
});
