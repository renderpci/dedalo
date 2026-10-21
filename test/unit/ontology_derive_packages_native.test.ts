/**
 * ONT-1 — the ontology UPDATE re-derives each imported TLD through the ONE writer,
 * `ontology_state.rebuildOntology`. TS-native write-path contract (audit 2026-09-26, Step 5).
 *
 * `dd_ontology(tld)` equals the parse of `matrix_ontology(<tld>0)` while the tld is active.
 * Before this gate the update's re-derive (`deriveOntologyPackages`) ran
 * `setRecordsInDdOntology({ wholeSection: true })` — an upsert-only per-record loop, outside a
 * transaction, through the unguarded primitive. So after an update:
 *   (a) a node the new package no longer carries stayed in dd_ontology forever (`orphaned`);
 *   (b) a record declaring another tld was upserted INTO that tld's namespace, where this
 *       tld's writer can never take it back (`foreign`), and the update said nothing.
 * And the activation driver (`tool_ontology` on an `ontology35` registry record) re-planted
 * only the `<tld>0` root of an active tld, leaving every node of it missing.
 *
 * Pinned (outcomes only):
 *   G1c deriveOntologyPackages sweeps the orphan, refuses the foreign record (no row in the
 *       other namespace) and NAMES it in `errors`;
 *   G1d rebuildOntology `mainNode: 'existing'` never mints a registry row and leaves a
 *       pre-planted `<tld>0` byte-identical when none exists; WITH a registry row it re-derives
 *       the root under its typology grouper by name and writes nothing of the grouper tld (no
 *       `ontologytype<N>` node, no `ontologytype0/<N>` record, no registry row) — 'ensure'
 *       (today's default) still mints: the positive control;
 *   G1f a node's `model` reaches its fixpoint in ONE derive: a model the release adds (used
 *       by instances below and above its id) or renames resolves in the same rebuild
 *       (ontology_state resolveModelsAgainstParse), and a model of ANOTHER staged tld reaches
 *       an instance staged before it (deriveOntologyPackages pass 2). Mutation-proven: drop
 *       either half and its legs go red;
 *   G1g a section whose records ALL lack a tld is an ERROR of the derive (rebuildFailure —
 *       fatal in the installer and the seed compiler), and the reconcile delete refuses an
 *       unsafe tld (internal.invariant) without deleting anything;
 *   G1h a GROUPER package's scoped import wipes the installation-made grouper records it does
 *       not carry (a thesaurus / tld of a typology the master lacks); the derive re-makes every
 *       typology still referenced — by a record's parent locator (hierarchytype) or by a
 *       `<tld>0` root's parent (ontologytype) — before the sweep, so the grouper node survives
 *       and the child's parent resolves. Control: the bare rebuild deletes the node (the
 *       situation reproduces the defect);
 *   G1e activation of an active tld whose projection is root-only brings every node back
 *       (inSync), in edit AND list mode; a converged tld is not re-derived (its node rows are
 *       not written — xmin — only its root re-planted); a tld with no projection stays empty
 *       (the control: no row ⇒ not active ⇒ this door cannot re-activate it).
 *
 * Driven DIRECTLY, not through `updateOntology` (its success leg is G1a in
 * ontology_update_shell_native): the import normalizes ontology7 to the target tld
 * (normalizeOntologyTld), so a foreign record cannot reach the re-derive through it.
 *
 * Activation semantics (pinned as PHP/HEAD has them): a tld is ACTIVE when dd_ontology holds
 * rows of it (getActiveTlds, PHP check_active_tld) — not the registry's hierarchy4 flag.
 *
 * Scratch: tlds `zzyda` (section zzyda0) + `zzydb`; registry rows of `zzyda` in
 * matrix_ontology_main (and their TM rows) are swept too; the scratch typology records
 * `ontologytype0/942611` + `hierarchytype0/942612` and their nodes. Zero residue asserted.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { deleteTldNodesExcept, readDdOntologyRow } from '../../src/core/db/dd_ontology.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { inspectOntology, rebuildOntology } from '../../src/core/ontology/ontology_state.ts';
import {
	HIERARCHY_TYPE_GROUP,
	HIERARCHY_TYPE_TLD,
	ONTOLOGY_TYPE_GROUP,
	ONTOLOGY_TYPE_TLD,
} from '../../src/core/ontology/ontology_tipos.ts';
import { deriveOntologyPackages } from '../../src/core/ontology/ontology_update.ts';
import type { StagedFile } from '../../src/core/ontology/ontology_update_target.ts';
import { createMainSection, createParentGrouper } from '../../src/core/ontology/ontology_write.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { toolOntologySetRecords } from '../../tools/tool_ontology/server/tool_ontology.ts';
import { refusalOf } from '../helpers/refusal.ts';

const OWN = 'zzyda';
const OTHER = 'zzydb';
const OWN_SECTION = `${OWN}0`;
const USER_ID = -1;
/**
 * A typology id no install carries, so the grouper `ontologytype<id>` and its matrix record
 * `ontologytype0/<id>` are ABSENT unless a door builds them (G1d): explicit and swept, never a
 * reserved band (there is none).
 */
const SCRATCH_TYPOLOGY = 942611;
const SCRATCH_GROUPER = `ontologytype${SCRATCH_TYPOLOGY}`;
/** G1h: a hierarchy typology no install carries (its `hierarchytype0/<id>` record, swept). */
const SCRATCH_HIERARCHY_TYPOLOGY = 942612;
const SCRATCH_HIERARCHY_GROUPER = `${HIERARCHY_TYPE_TLD}${SCRATCH_HIERARCHY_TYPOLOGY}`;

const DEVELOPER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const ctx = (options: Record<string, unknown>) =>
	({ principal: DEVELOPER, userId: DEVELOPER.userId, options }) as never;

async function seed(
	sectionId: number,
	declaredTld: string,
	term: string,
	relation: Record<string, unknown> = {},
	sectionTipo = OWN_SECTION,
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

/** The ontology6 (model) relation of a record whose model is `<modelSection>/<modelId>`. */
const modelOf = (modelSection: string, modelId: number) => ({
	ontology6: [
		{
			id: 1,
			type: 'dd151',
			section_id: modelId,
			section_tipo: modelSection,
			from_component_tipo: 'ontology6',
		},
	],
});

/** Rename a seeded record's lg-spa term in place (what a release does to a model's name). */
async function renameTerm(sectionTipo: string, sectionId: number, term: string): Promise<void> {
	await sql.unsafe(
		`UPDATE matrix_ontology SET string = jsonb_set(string, '{ontology5}', $3::text::jsonb)
		  WHERE section_tipo = $1 AND section_id = $2`,
		[sectionTipo, sectionId, JSON.stringify([{ id: 1, lang: 'lg-spa', value: term }])],
	);
	await clearOntologyDerivedCaches();
}

/** A hand-planted `<tld>0` with a DISTINCTIVE term, so an overwrite is visible. */
async function plantRoot(): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, tld, model, model_tipo, is_main, relations, term)
		 VALUES ($1, $2, 'section', 'dd6', true, $3::text::jsonb, $4::text::jsonb)`,
		[
			OWN_SECTION,
			OWN,
			JSON.stringify([{ tipo: 'ontology1' }, { tipo: 'dd1201' }]),
			JSON.stringify({ 'lg-spa': 'planted root' }),
		],
	);
	await clearOntologyDerivedCaches();
}

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

async function tiposOf(tld: string): Promise<string[]> {
	const rows = (await sql.unsafe('SELECT tipo FROM dd_ontology WHERE tld = $1 ORDER BY tipo', [
		tld,
	])) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

/** Registry rows (matrix_ontology_main / ontology35) naming the tld. */
async function registryIds(tld: string): Promise<number[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM matrix_ontology_main
		  WHERE section_tipo = 'ontology35' AND string->'hierarchy6' @> $1::text::jsonb
		  ORDER BY section_id`,
		[JSON.stringify([{ value: tld }])],
	)) as { section_id: number }[];
	return rows.map((row) => Number(row.section_id));
}

/** The row's xmin: it moves on ANY write to the row, even one that rewrites equal bytes. */
async function xminOf(tipo: string): Promise<string | null> {
	const rows = (await sql.unsafe('SELECT xmin::text AS x FROM dd_ontology WHERE tipo = $1', [
		tipo,
	])) as { x: string }[];
	return rows[0]?.x ?? null;
}

/** What building the scratch typology grouper would leave: its node and its matrix record. */
async function grouperFootprint(): Promise<{ node: unknown; record: number; registry: number }> {
	const records = (await sql.unsafe(
		`SELECT count(*)::int AS c FROM matrix_ontology WHERE section_tipo = 'ontologytype0' AND section_id = $1`,
		[SCRATCH_TYPOLOGY],
	)) as { c: number }[];
	const registry = (await sql.unsafe(
		`SELECT count(*)::int AS c FROM matrix_ontology_main WHERE section_tipo = 'ontology35'`,
	)) as { c: number }[];
	return {
		node: await rowOf(SCRATCH_GROUPER),
		record: records[0]?.c ?? 0,
		registry: registry[0]?.c ?? 0,
	};
}

/** Rows of the grouper record `<grouperTld>0/<typologyId>` in matrix_ontology (0 or 1). */
async function grouperRecordCount(grouperTld: string, typologyId: number): Promise<number> {
	const rows = (await sql.unsafe(
		'SELECT count(*)::int AS c FROM matrix_ontology WHERE section_tipo = $1 AND section_id = $2',
		[`${grouperTld}0`, typologyId],
	)) as { c: number }[];
	return rows[0]?.c ?? 0;
}

const kinds = (state: Awaited<ReturnType<typeof inspectOntology>>, kind: string) =>
	state.drift.filter((item) => item.kind === kind).map((item) => item.tipo);

async function sweep(): Promise<void> {
	await assertTestDatabase('ontology_derive_packages_native');
	for (const tld of [OWN, OTHER]) {
		for (const id of await registryIds(tld)) {
			await sql.unsafe(
				`DELETE FROM matrix_time_machine WHERE section_tipo = 'ontology35' AND section_id = $1`,
				[id],
			);
			await sql.unsafe(
				`DELETE FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND section_id = $1`,
				[id],
			);
		}
	}
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld IN ($1, $2) OR tipo IN ($3, $4)', [
		OWN,
		OTHER,
		SCRATCH_GROUPER,
		SCRATCH_HIERARCHY_GROUPER,
	]);
	for (const table of ['matrix_ontology', 'matrix_time_machine']) {
		await sql.unsafe(
			`DELETE FROM ${table}
			  WHERE (section_tipo = 'ontologytype0' AND section_id = $1)
			     OR (section_tipo = 'hierarchytype0' AND section_id = $2)`,
			[SCRATCH_TYPOLOGY, SCRATCH_HIERARCHY_TYPOLOGY],
		);
	}
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo IN ($1, $2)', [
		OWN_SECTION,
		`${OTHER}0`,
	]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo IN ($1, $2)', [
		OWN_SECTION,
		`${OTHER}0`,
	]);
	await clearOntologyDerivedCaches();
}

beforeEach(sweep);
afterAll(async () => {
	await sweep();
	expect(await tiposOf(OWN)).toEqual([]);
	expect(await tiposOf(OTHER)).toEqual([]);
	expect(await registryIds(OWN)).toEqual([]);
	expect(await rowOf(SCRATCH_HIERARCHY_GROUPER)).toBeNull();
	expect(await grouperRecordCount(HIERARCHY_TYPE_TLD, SCRATCH_HIERARCHY_TYPOLOGY)).toBe(0);
});

// ---------------------------------------------------------------------------
// G1c — the update's re-derive is the one writer's reconcile
// ---------------------------------------------------------------------------

describe('G1c: deriveOntologyPackages reconciles each imported tld', () => {
	const staged = [{ tld: OWN, sectionTipo: OWN_SECTION } as StagedFile];

	async function situation(): Promise<void> {
		await plantRoot();
		await seed(1, OWN, 'own one');
		await seed(2, OTHER, 'misfiled'); // parses to zzydb2 — NOT this tld's node
		await plantNode(`${OWN}77`, OWN, 'dropped upstream'); // no source record: an orphan
	}

	test('the orphan is swept and the own node projected', async () => {
		await situation();

		await deriveOntologyPackages(staged, USER_ID);
		expect(await readDdOntologyRow(`${OWN}77`)).toBeNull();
		expect(await readDdOntologyRow(`${OWN}1`)).not.toBeNull();
		expect(kinds(await inspectOntology(OWN), 'orphaned')).toEqual([]);
	});

	test('the foreign record writes NOTHING into the other namespace and is NAMED in errors', async () => {
		await situation();

		const outcome = await deriveOntologyPackages(staged, USER_ID);
		expect(await tiposOf(OTHER)).toEqual([]);
		expect(outcome.errors.join(' | ')).toContain(`${OWN_SECTION}/2 declares tld '${OTHER}'`);
	});
});

// ---------------------------------------------------------------------------
// G1h — a grouper package's import never takes the installation's groupers away
// ---------------------------------------------------------------------------

describe('G1h: installation-made grouper records survive a grouper package update', () => {
	/** What the scoped DELETE + COPY of a grouper package does to a record it does not carry. */
	async function packageImportWipes(grouperTld: string, typologyId: number): Promise<void> {
		await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1 AND section_id = $2', [
			`${grouperTld}0`,
			typologyId,
		]);
		await clearOntologyDerivedCaches();
	}

	/**
	 * A thesaurus descriptor of a typology the package lacks: hierarchy provisioning's grouper
	 * (createParentGrouper — the grouper tld itself is the installation's, so registration is
	 * skipped) and a `zzyda0/1` record whose parent locator points at it, projected.
	 */
	async function thesaurusOfScratchTypology(): Promise<void> {
		await assertTestDatabase('ontology_derive_packages_native');
		await createParentGrouper(
			HIERARCHY_TYPE_GROUP,
			HIERARCHY_TYPE_TLD,
			SCRATCH_HIERARCHY_TYPOLOGY,
			USER_ID,
			{ register: false },
		);
		await plantRoot();
		await seed(1, OWN, 'descriptor', {
			ontology15: [{ section_tipo: 'hierarchytype0', section_id: SCRATCH_HIERARCHY_TYPOLOGY }],
		});
		await rebuildOntology(OWN, USER_ID, { mainNode: 'existing' });
		expect((await readDdOntologyRow(`${OWN}1`))?.parent).toBe(SCRATCH_HIERARCHY_GROUPER);
		expect(await readDdOntologyRow(SCRATCH_HIERARCHY_GROUPER)).not.toBeNull();
		await packageImportWipes(HIERARCHY_TYPE_TLD, SCRATCH_HIERARCHY_TYPOLOGY);
	}

	test('control: the bare rebuild of the wiped grouper tld deletes the node (the defect)', async () => {
		await thesaurusOfScratchTypology();

		await rebuildOntology(HIERARCHY_TYPE_TLD, USER_ID, { mainNode: 'existing' });
		expect(await readDdOntologyRow(SCRATCH_HIERARCHY_GROUPER)).toBeNull();
	});

	test('a record parent (hierarchytype): the derive re-makes the record, the node survives', async () => {
		await thesaurusOfScratchTypology();
		// The grouper tld's own root is the package's (its definition provisioned it): the
		// re-make writes the typology record only, never re-registers the tld.
		const grouperRoot = await rowOf('hierarchytype0');

		const outcome = await deriveOntologyPackages(
			[{ tld: HIERARCHY_TYPE_TLD, sectionTipo: 'hierarchytype0' } as StagedFile],
			USER_ID,
		);
		expect(outcome.errors).toEqual([]);
		expect(await rowOf('hierarchytype0')).toEqual(grouperRoot);
		expect(outcome.messages.join(' | ')).toContain(
			`${HIERARCHY_TYPE_TLD}: re-made grouper record(s) ${SCRATCH_HIERARCHY_TYPOLOGY}`,
		);
		expect(await grouperRecordCount(HIERARCHY_TYPE_TLD, SCRATCH_HIERARCHY_TYPOLOGY)).toBe(1);
		const parent = (await readDdOntologyRow(`${OWN}1`))?.parent ?? '';
		expect(parent).toBe(SCRATCH_HIERARCHY_GROUPER);
		expect(await readDdOntologyRow(parent)).not.toBeNull();
		expect(kinds(await inspectOntology(HIERARCHY_TYPE_TLD), 'missing')).toEqual([]);
	});

	test('a root parent (ontologytype): a <tld>0 under a wiped typology keeps its grouper', async () => {
		await assertTestDatabase('ontology_derive_packages_native');
		await createParentGrouper(ONTOLOGY_TYPE_GROUP, ONTOLOGY_TYPE_TLD, SCRATCH_TYPOLOGY, USER_ID, {
			register: false,
		});
		await plantRoot();
		await sql.unsafe('UPDATE dd_ontology SET parent = $2 WHERE tipo = $1', [
			OWN_SECTION,
			SCRATCH_GROUPER,
		]);
		await packageImportWipes(ONTOLOGY_TYPE_TLD, SCRATCH_TYPOLOGY);

		const outcome = await deriveOntologyPackages(
			[{ tld: ONTOLOGY_TYPE_TLD, sectionTipo: 'ontologytype0' } as StagedFile],
			USER_ID,
		);
		expect(outcome.errors).toEqual([]);
		expect(await grouperRecordCount(ONTOLOGY_TYPE_TLD, SCRATCH_TYPOLOGY)).toBe(1);
		expect(await readDdOntologyRow(SCRATCH_GROUPER)).not.toBeNull();
	});

	test('nothing referenced, nothing re-made: a package-only update writes no grouper record', async () => {
		const outcome = await deriveOntologyPackages(
			[{ tld: HIERARCHY_TYPE_TLD, sectionTipo: 'hierarchytype0' } as StagedFile],
			USER_ID,
		);
		expect(outcome.messages.join(' | ')).not.toContain('re-made grouper record');
		expect(await grouperRecordCount(HIERARCHY_TYPE_TLD, SCRATCH_HIERARCHY_TYPOLOGY)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// G1f — a node's `model` is resolved against the projection being WRITTEN
// ---------------------------------------------------------------------------

describe('G1f: model columns reach the fixpoint inside one derive', () => {
	const modelOfRow = async (tipo: string) => (await readDdOntologyRow(tipo))?.model ?? null;

	test('a model ADDED by the release, used by instances below AND above its id, resolves in one pass', async () => {
		await plantRoot();
		await seed(1, OWN, 'instance below', modelOf(OWN_SECTION, 2));
		await seed(2, OWN, 'zz_model_new');
		await seed(3, OWN, 'instance above', modelOf(OWN_SECTION, 2));

		const outcome = await deriveOntologyPackages(
			[{ tld: OWN, sectionTipo: OWN_SECTION } as StagedFile],
			USER_ID,
		);
		expect(outcome.errors).toEqual([]);
		expect(await modelOfRow(`${OWN}1`)).toBe('zz_model_new');
		expect(await modelOfRow(`${OWN}3`)).toBe('zz_model_new');
		expect((await inspectOntology(OWN)).inSync).toBe(true);
	});

	test('a RENAMED model term reaches its instances in the same rebuild', async () => {
		await plantRoot();
		await seed(1, OWN, 'zz_model_old');
		await seed(2, OWN, 'instance', modelOf(OWN_SECTION, 1));
		await rebuildOntology(OWN, USER_ID, { mainNode: 'existing' });
		expect(await modelOfRow(`${OWN}2`)).toBe('zz_model_old');

		await renameTerm(OWN_SECTION, 1, 'zz_model_renamed');
		// inspect names the instance as stale BEFORE the rebuild (it compares with the fixpoint).
		const before = await inspectOntology(OWN);
		expect(before.drift.find((item) => item.tipo === `${OWN}2`)?.diffColumns).toContain('model');

		await rebuildOntology(OWN, USER_ID, { mainNode: 'existing' });
		expect(await modelOfRow(`${OWN}2`)).toBe('zz_model_renamed');
		expect((await inspectOntology(OWN)).inSync).toBe(true);
	});

	test('a model of ANOTHER staged tld, renamed, reaches an instance staged BEFORE it', async () => {
		await plantRoot();
		await sql.unsafe(
			`INSERT INTO dd_ontology (tipo, tld, model, model_tipo, is_main, relations, term)
			 VALUES ($1, $2, 'section', 'dd6', true, '[]'::jsonb, '{"lg-spa":"other root"}'::jsonb)`,
			[`${OTHER}0`, OTHER],
		);
		await seed(1, OTHER, 'zz_model_old', {}, `${OTHER}0`);
		await seed(1, OWN, 'instance', modelOf(`${OTHER}0`, 1));
		const staged = [
			{ tld: OWN, sectionTipo: OWN_SECTION } as StagedFile,
			{ tld: OTHER, sectionTipo: `${OTHER}0` } as StagedFile,
		];
		await deriveOntologyPackages(staged, USER_ID);
		expect(await modelOfRow(`${OWN}1`)).toBe('zz_model_old');

		await renameTerm(`${OTHER}0`, 1, 'zz_model_renamed');
		const outcome = await deriveOntologyPackages(staged, USER_ID);
		expect(outcome.errors).toEqual([]);
		expect(await modelOfRow(`${OWN}1`)).toBe('zz_model_renamed');
		expect((await inspectOntology(OWN)).inSync).toBe(true);
		expect((await inspectOntology(OTHER)).inSync).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// G1g — a WHOLESALE failure is an error, and the reconcile delete refuses an unsafe tld
// ---------------------------------------------------------------------------

describe('G1g: wholesale failure + the reconcile delete guard', () => {
	test('a <tld>0 whose records ALL lack a tld: deriveOntologyPackages names it in errors', async () => {
		await plantRoot();
		for (const id of [1, 2]) {
			await sql.unsafe(
				`INSERT INTO matrix_ontology (section_id, section_tipo, data, relation, string)
				 VALUES ($1, $2, $3::text::jsonb, '{}'::jsonb, $4::text::jsonb)`,
				[
					id,
					OWN_SECTION,
					JSON.stringify({ section_id: id, section_tipo: OWN_SECTION }),
					JSON.stringify({ ontology5: [{ id: 1, lang: 'lg-spa', value: `tldless ${id}` }] }),
				],
			);
		}
		await clearOntologyDerivedCaches();

		const outcome = await deriveOntologyPackages(
			[{ tld: OWN, sectionTipo: OWN_SECTION } as StagedFile],
			USER_ID,
		);
		expect(outcome.errors).toContain(
			`${OWN}: none of 2 record(s) of ${OWN_SECTION} declares a tld — nothing projected`,
		);
	});

	test('deleteTldNodesExcept refuses an unsafe tld with internal.invariant and deletes nothing', async () => {
		await plantRoot();
		await plantNode(`${OWN}5`, OWN, 'kept');
		const count = async () =>
			((await sql.unsafe('SELECT count(*)::int AS c FROM dd_ontology', [])) as { c: number }[])[0]
				?.c ?? -1;
		const before = await count();

		const refusal = await refusalOf(deleteTldNodesExcept(`${OWN}'; DROP TABLE x; --`, []));
		expect(refusal.code).toBe('internal.invariant');
		expect(await count()).toBe(before);
		expect(await tiposOf(OWN)).toEqual([OWN_SECTION, `${OWN}5`]);
	});
});

// ---------------------------------------------------------------------------
// G1d — `mainNode: 'existing'` never touches the registry
// ---------------------------------------------------------------------------

describe("G1d: rebuildOntology mainNode 'existing' vs 'ensure'", () => {
	test("'existing' with NO registry row: nodes projected, no row minted, the planted root byte-identical", async () => {
		await plantRoot();
		await seed(1, OWN, 'own one');
		const root = await rowOf(OWN_SECTION);
		expect(await registryIds(OWN)).toEqual([]);

		const outcome = await rebuildOntology(OWN, USER_ID, { mainNode: 'existing' });
		expect(outcome.errors).toEqual([]);
		expect(await registryIds(OWN)).toEqual([]);
		expect(await rowOf(OWN_SECTION)).toEqual(root);
		expect(await readDdOntologyRow(`${OWN}1`)).not.toBeNull();
	});

	test("'existing' WITH a registry row: the root is re-derived under its grouper by NAME; nothing outside the tld is written", async () => {
		await assertTestDatabase('ontology_derive_packages_native');
		await createMainSection({ tld: OWN, typology_id: SCRATCH_TYPOLOGY }, USER_ID);
		await clearOntologyDerivedCaches();
		await plantRoot();
		await seed(1, OWN, 'own one');
		const before = await grouperFootprint();
		expect(before).toEqual({ node: null, record: 0, registry: before.registry });

		const outcome = await rebuildOntology(OWN, USER_ID, { mainNode: 'existing' });
		expect(outcome.errors).toEqual([]);
		// The root comes from the registry row (no longer the planted one) …
		expect((await readDdOntologyRow(OWN_SECTION))?.parent).toBe(SCRATCH_GROUPER);
		// … and the grouper tld is untouched: no node, no ontologytype0/<N> record, no new
		// registry row (createParentGrouper would have built all three).
		expect(await grouperFootprint()).toEqual(before);
	});

	test("'ensure' (the default) still mints the registry row — the positive control", async () => {
		await plantRoot();
		await seed(1, OWN, 'own one');

		await rebuildOntology(OWN, USER_ID, { mainNode: 'ensure' });
		expect((await registryIds(OWN)).length).toBe(1);
		expect(await readDdOntologyRow(`${OWN}1`)).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// G1e — activation of a registry record re-derives the whole tld
// ---------------------------------------------------------------------------

describe('G1e: tool_ontology on an ontology35 registry record', () => {
	async function registryRow(): Promise<number> {
		await assertTestDatabase('ontology_derive_packages_native');
		const id = await createMainSection({ tld: OWN }, USER_ID);
		await clearOntologyDerivedCaches();
		return id;
	}

	test('an active tld with a root-only projection gets EVERY node back (inSync)', async () => {
		const registryId = await registryRow();
		await seed(1, OWN, 'own one');
		await seed(2, OWN, 'own two');
		await plantRoot(); // active (has rows), but its nodes are missing

		await toolOntologySetRecords(ctx({ section_tipo: 'ontology35', section_id: registryId }));
		expect(await tiposOf(OWN)).toEqual([OWN_SECTION, `${OWN}1`, `${OWN}2`]);
		const state = await inspectOntology(OWN);
		expect(kinds(state, 'missing')).toEqual([]);
		expect(state.inSync).toBe(true);
	});

	test('LIST mode over ontology35 (an sqo matching the registry record) re-derives the tld too', async () => {
		const registryId = await registryRow();
		await seed(1, OWN, 'own one');
		await seed(2, OWN, 'own two');
		await plantRoot();

		const response = await toolOntologySetRecords(
			ctx({
				section_tipo: 'ontology35',
				sqo: {
					section_tipo: ['ontology35'],
					filter_by_locators: [{ section_tipo: 'ontology35', section_id: String(registryId) }],
				},
			}),
		);
		expect(response.ok).toBe(true);
		expect(await tiposOf(OWN)).toEqual([OWN_SECTION, `${OWN}1`, `${OWN}2`]);
		expect((await inspectOntology(OWN)).inSync).toBe(true);
	});

	test('a CONVERGED tld is not re-derived: its nodes are not written, only its root re-planted', async () => {
		const registryId = await registryRow();
		await seed(1, OWN, 'own one');
		await plantRoot();
		await rebuildOntology(OWN, USER_ID, { mainNode: 'existing' });
		await clearOntologyDerivedCaches();
		expect((await inspectOntology(OWN)).inSync).toBe(true);
		const node = await xminOf(`${OWN}1`);
		const root = await xminOf(OWN_SECTION);

		await toolOntologySetRecords(ctx({ section_tipo: 'ontology35', section_id: registryId }));
		expect(await xminOf(`${OWN}1`)).toBe(node);
		expect(await xminOf(OWN_SECTION)).not.toBe(root);
		expect((await inspectOntology(OWN)).inSync).toBe(true);
	});

	test('a tld with NO projection stays empty — the control', async () => {
		const registryId = await registryRow();
		await seed(1, OWN, 'own one');

		await toolOntologySetRecords(ctx({ section_tipo: 'ontology35', section_id: registryId }));
		expect(await tiposOf(OWN)).toEqual([]);
	});
});
