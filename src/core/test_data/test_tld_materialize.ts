/**
 * Materialize the generic `test` TLD ontology INTO A DATABASE — the door that
 * makes `src/core/test_data/test_tld_ontology.json` the SOURCE OF RECORD.
 *
 * DIRECTION REVERSED (2026-08-19, generic-`test`-TLD migration phase 1). Until
 * now the JSON was EXPORTED from the install seed
 * (`scripts/export_test_tld_ontology.ts`, seed → JSON) and the seed's binary
 * `dd_ontology` rows were what an install actually got. From here the JSON is
 * the reviewable source and the database is DERIVED from it, through the
 * engine's own doors and in the engine's own order:
 *
 *   JSON node  --ontologyRecordFromNode-->  matrix_ontology record (`<tld>0`)
 *   matrix_ontology records  --rebuildOntology(tld)-->  dd_ontology rows
 *
 * dd_ontology is NEVER hand-written here. That is the whole point: the same
 * single writer (`ontology_state.rebuildOntology`) that an operator's "rebuild
 * ontology" button uses produces the runtime table, so a test database and a
 * fresh install carry exactly what the ontology area would produce, drift
 * included — `inspectOntology(tld).drift` is the honest check afterwards.
 *
 * `ontologyRecordFromNode` is the EXACT INVERSE of
 * `src/core/ontology/parser.ts parseSectionRecordToOntologyNode`; its
 * field → component map lives with it, in
 * `src/core/ontology/ontology_record_inverse.ts` (one copy, shared with the
 * production engine-ontology door).
 *
 * Two node fields are DERIVED by the parser and therefore written by nobody:
 *  - `tipo` = `<tld><section_id>` — it IS the record's address;
 *  - `is_main` = `tipo === <tld>0` — and the `<tld>0` node has NO source record
 *    at all: `rebuildOntology` mints it from the `matrix_ontology_main`
 *    (`ontology35`) registry row via `createDdOntologyRootNode`. So a main node
 *    in the JSON is materialized by the REBUILD, not by an insert here — but
 *    the registry row it reads is PROVISIONED here, from that same JSON node
 *    (`provisionOntologyMainRegistry` below), so a brand-new `test*` TLD needs
 *    no bootstrap row in the seed. `rebuildOntology` stays the single deriver:
 *    this door only puts the term and the typology where `ensureMainNode`
 *    already looks for them.
 *  - `model` is likewise derived (`dd_ontology[model_tipo].term['lg-spa']`), so
 *    the JSON's `model` string is a REDUNDANT twin of `model_tipo`; the gate
 *    asserts the two agree instead of this door trying to write it.
 *
 * `propiedades` round-trips by MEANING, not bytes: the parser re-encodes the
 * stored value with PHP's JSON_PRETTY_PRINT, while the seed's rows are
 * minified. `ontology_state.propiedadesDiffer` is the law that says those are
 * the same content — a rebuild normalizes them to the pretty form.
 *
 * MULTI-TLD by construction: every node carries its own `tld`, so the JSON can
 * (and, from phase 2, will) hold `test` plus one `test*` TLD per test
 * thesaurus. Nodes are grouped by `tld`, written into that TLD's own `<tld>0`
 * section, and each TLD is rebuilt separately.
 *
 * TEST-ONLY DOOR. It DELETES and rewrites `<tld>0` records, so it is
 * FAIL-CLOSED, in TWO layers:
 *   1. the caller NAMES the database it expects (`expectDatabase`, checked
 *      against `current_database()`) — a declaration by the caller;
 *   2. the database CARRIES the `dedalo_test_marker` row
 *      (`./test_database_marker.ts`) — a declaration by the database, which is
 *      what makes the guarantee mechanical rather than a convention.
 * A call that satisfies neither, or only the first, writes nothing at all.
 * `allowAnyDatabase` skips both and is the installer's carve-out: on a fresh
 * install this door writes the `test` TLD ONTOLOGY (definitions, no records)
 * into a database that IS the application's by definition. It is the ONLY
 * bypass in the tree (test/unit/test_db_marker_tripwire.test.ts asserts that).
 */

import type { DdOntologyNode } from '../db/dd_ontology.ts';
import { deleteMatrixRecord, insertMatrixRecordWithExplicitId } from '../db/matrix_write.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import { DedaloError } from '../errors/index.ts';
import { clearOntologyDerivedCaches } from '../ontology/cache_invalidation.ts';
import {
	ontologyRecordFromNode,
	provisionOntologyMainRegistry,
} from '../ontology/ontology_record_inverse.ts';
import { rebuildOntology } from '../ontology/ontology_state.ts';
import { getSectionIdFromTipo, getTldFromTipo, safeTld } from '../ontology/tld.ts';
import { assertTestDatabase } from './test_database_marker.ts';

/** The one JSON source of the generic test ontology (repo-relative, for messages). */
export const TEST_TLD_JSON_PATH = 'src/core/test_data/test_tld_ontology.json';

/** The document shape of that file. `nodes` are plain `DdOntologyNode`s. */
export interface TestTldOntologyDoc {
	tld: string;
	nodes: DdOntologyNode[];
}

// The inverse parser and the registry provisioner live in
// src/core/ontology/ontology_record_inverse.ts (shared with the PRODUCTION
// engine-ontology door, ontology/engine_ontology.ts); re-exported here so the
// gates that pinned them keep one import.
export {
	type OntologyRecordColumns,
	ontologyRecordFromNode,
} from '../ontology/ontology_record_inverse.ts';

export interface MaterializeResult {
	/** The TLDs found in the JSON, in the order they were materialized. */
	tlds: string[];
	/** Source records written (main nodes excluded — they have none). */
	nodes: number;
	/** `rebuildOntology` messages, one per TLD. */
	rebuilt: string[];
	/**
	 * Records of a `<tld>0` section that the JSON does NOT declare, as
	 * `<section_tipo>/<section_id>`. Reported, never deleted: a node someone
	 * added by hand is not this door's to remove — but it WILL show up in
	 * dd_ontology after the rebuild, so the gate must see it.
	 */
	strays: string[];
}

/* ------------------------------------------------------------------ guard */

function refuse(message: string, coordinates: Record<string, string | number> = {}): never {
	throw new DedaloError('internal.invariant', {
		message: `materializeTestTldOntology: ${message}`,
		coordinates,
	});
}

/**
 * FAIL-CLOSED database guard. This door DELETES and rewrites every `<tld>0`
 * ontology record of the TLDs it materializes, so a bare call writes NOTHING:
 * the caller must either name the database it expects to be connected to
 * (`expectDatabase`, checked against `current_database()`) or opt out
 * explicitly (`allowAnyDatabase`, which only the installer does — on a database
 * it has just restored from the seed, and which IS the application's by
 * definition).
 *
 * BOTH layers run. The name check is the caller's own declaration; the marker
 * check (`assertTestDatabase`) is the database's. `allowAnyDatabase` skips both
 * — it is the installer's carve-out and the ONLY one in the tree.
 *
 * The expected NAME is passed in rather than read from the environment here:
 * the rule that derives it (`DEDALO_TEST_DATABASE` else `<app db>_test`) has
 * ONE home, `test/helpers/test_database.ts`, shared by the setup script and the
 * test preload — and `src/` may not read an env key that the config catalog
 * does not document.
 */
async function assertAllowedDatabase(options: {
	allowAnyDatabase?: boolean;
	expectDatabase?: string;
}): Promise<void> {
	if (options.allowAnyDatabase === true) return;
	const rows = (await sql`SELECT current_database() AS db`) as { db: string }[];
	const live = rows[0]?.db ?? '';
	if (options.expectDatabase === undefined || options.expectDatabase === '') {
		refuse(
			`REFUSING to write to database '${live}': this door DELETES and rewrites every '<tld>0' ontology record, so it needs the caller to name the database it expects ({ expectDatabase: testDatabaseName() }) or to opt out explicitly ({ allowAnyDatabase: true } — the installer only).`,
			{ live },
		);
	}
	if (options.expectDatabase !== live) {
		refuse(
			`REFUSING to write to database '${live}': the caller expected '${options.expectDatabase}'. Nothing was written.`,
			{ live, expected: options.expectDatabase },
		);
	}
	// SECOND LAYER, and the one that is not a convention: the database must
	// SAY it is a disposable test database (src/core/test_data/test_database_marker.ts).
	// `expectDatabase` above only proves the caller and the connection agree on
	// a NAME — point `DEDALO_TEST_DATABASE` at a colleague's install or a
	// production restore and both agree, correctly, on the wrong database.
	await assertTestDatabase('materializeTestTldOntology');
}

/* ------------------------------------------------------------ the door */

/** Load the committed JSON source (dynamic import — only when a door runs). */
export async function loadTestTldOntologyDoc(): Promise<TestTldOntologyDoc> {
	const module = await import('./test_tld_ontology.json');
	return module.default as unknown as TestTldOntologyDoc;
}

/**
 * `<tld>0` ALWAYS lives in matrix_ontology (the section_id='0' rule in
 * resolver.getMatrixTableFromTipo) — a pure string fact, which is what makes
 * this door usable BEFORE the tld has any dd_ontology row at all.
 */
const ONTOLOGY_TABLE = 'matrix_ontology';

/** The tld a node declares — valid, and the prefix of the node's own tipo. */
function declaredTld(node: DdOntologyNode): string {
	const tld = node.tld ?? getTldFromTipo(node.tipo);
	if (tld === null || safeTld(tld) === null) {
		refuse(`node '${node.tipo}' declares no valid tld`, { tipo: node.tipo });
	}
	if (!node.tipo.startsWith(tld)) {
		refuse(`node '${node.tipo}' is not under its own tld '${tld}'`, { tipo: node.tipo, tld });
	}
	return tld;
}

/**
 * Group by the tld each node declares (never by the document's own `tld`: from
 * phase 2 the file carries the `test*` thesaurus TLDs as well).
 */
function groupNodesByTld(nodes: readonly DdOntologyNode[]): Map<string, DdOntologyNode[]> {
	const byTld = new Map<string, DdOntologyNode[]>();
	for (const node of nodes) {
		const tld = declaredTld(node);
		const list = byTld.get(tld);
		if (list === undefined) byTld.set(tld, [node]);
		else list.push(node);
	}
	return byTld;
}

/**
 * The SOURCE records of one TLD, keyed by section_id. The main node is skipped:
 * it has no source record — rebuildOntology mints it from the
 * matrix_ontology_main registry row (module header).
 */
function sourceRecordsBySectionId(
	nodes: readonly DdOntologyNode[],
	sectionTipo: string,
): Map<number, DdOntologyNode> {
	const wanted = new Map<number, DdOntologyNode>();
	for (const node of nodes) {
		if (node.is_main === true || node.tipo === sectionTipo) continue;
		const sectionId = Number(getSectionIdFromTipo(node.tipo));
		if (wanted.has(sectionId)) refuse(`duplicate node '${node.tipo}'`, { tipo: node.tipo });
		wanted.set(sectionId, node);
	}
	return wanted;
}

/** Delete-then-insert every source record of one TLD, in ONE transaction. */
async function writeOntologyRecords(
	sectionTipo: string,
	wanted: ReadonlyMap<number, DdOntologyNode>,
): Promise<void> {
	await withTransaction(async () => {
		for (const [sectionId, node] of wanted) {
			await deleteMatrixRecord(ONTOLOGY_TABLE, sectionTipo, sectionId);
			// Explicit-id insert: the id IS the node's identity, and the door
			// raises the tld's counter to GREATEST(value, id) on every row, so a
			// later auto-allocated node can never reuse one of these ids.
			await insertMatrixRecordWithExplicitId(
				ONTOLOGY_TABLE,
				sectionTipo,
				sectionId,
				ontologyRecordFromNode(node),
			);
		}
	});
}

/** Records present in the table that the JSON does NOT declare. */
async function straySectionIds(
	sectionTipo: string,
	wanted: ReadonlyMap<number, DdOntologyNode>,
): Promise<string[]> {
	const present = (await sql.unsafe(
		`SELECT section_id FROM "${ONTOLOGY_TABLE}" WHERE section_tipo = $1 ORDER BY section_id`,
		[sectionTipo],
	)) as { section_id: number }[];
	return present
		.filter((row) => !wanted.has(Number(row.section_id)))
		.map((row) => `${sectionTipo}/${row.section_id}`);
}

/**
 * The INSTALL half of the ontology: the hand-authored `test` Test area, plus
 * the transitive closure of whatever it references, and nothing else.
 *
 * WHY THE SPLIT EXISTS. Until 2026-08-21 a fresh install materialized the WHOLE
 * file. That was proportionate when the `test` TLD was the small hand-authored
 * playground; after the phase-2 clone it is 8474 nodes across 33 TLDs — twins
 * of OTHER installations' ontologies (`testmint`, `testimmovable`,
 * `testheritagecatalog`…), which exist so the SUITE can replay a frozen store
 * that names one install. A customer's database has no use for them, and
 * shipping ~8000 test-only nodes into every production ontology is a cost with
 * no return.
 *
 * DERIVED, NOT HAND-LISTED. The partition is computed from the committed,
 * append-only clone map: a node is a CLONE if it is a target in that map. The
 * core is then closed over what it actually needs — a hand-authored node whose
 * parent or whose properties name a clone drags that clone in, because an
 * install must not receive a subtree that dangles. Measured 2026-08-21: 217
 * hand-authored nodes close to 405, against 8474 for the whole file.
 *
 * A second JSON would have been the obvious move and the wrong one: two files
 * carrying the same nodes is a fork waiting to drift, and this repo's law is
 * link, never duplicate. One source, one derivation.
 */
/** The clone TARGETS: a node is a twin if the committed map mints it. */
async function cloneTargets(): Promise<Set<string>> {
	const { readFile } = await import('node:fs/promises');
	const mapPath = new URL('./test_tld_tipo_map.json', import.meta.url);
	const cloneMap = JSON.parse(await readFile(mapPath, 'utf8')) as {
		map: Record<string, { target: string }>;
	};
	return new Set(Object.values(cloneMap.map).map((entry) => entry.target));
}

/** Every `test*` tipo this node NAMES, anywhere in its JSON. */
function namedTestTipos(node: DdOntologyNode): string[] {
	return JSON.stringify(node).match(/test[a-z]*\d+/g) ?? [];
}

export async function coreClosure(all: readonly DdOntologyNode[]): Promise<DdOntologyNode[]> {
	const targets = await cloneTargets();
	const byTipo = new Map(all.map((node) => [node.tipo, node]));
	const keep = new Set<string>();
	const stack = all
		.filter((node) => node.tld === 'test' && !targets.has(node.tipo))
		.map((node) => node.tipo);

	while (stack.length > 0) {
		const tipo = stack.pop() as string;
		const node = keep.has(tipo) ? undefined : byTipo.get(tipo);
		// Absent from this file = seed-shipped (dd/rsc/hierarchy/…), already installed.
		if (node === undefined) continue;
		keep.add(tipo);
		// Anything it NAMES and this file DEFINES comes along, or the install
		// receives a reference it cannot resolve.
		for (const referenced of namedTestTipos(node)) stack.push(referenced);
	}
	return all.filter((node) => keep.has(node.tipo));
}

/**
 * Write the JSON ontology into the database and derive dd_ontology from
 * it, one TLD at a time. IDEMPOTENT: each record is deleted and re-inserted
 * from the JSON, and the rebuild rewrites the TLD's dd_ontology rows wholesale,
 * so a second run leaves no drift.
 */
export async function materializeTestTldOntology(
	options: {
		/** The database the caller expects to be connected to (`current_database()`). */
		expectDatabase?: string;
		/** Installer-only opt-out: a fresh install's database is the application's. */
		allowAnyDatabase?: boolean;
		/** Override the JSON source (tests). */
		doc?: TestTldOntologyDoc;
		/**
		 * WHICH HALF to materialize (see coreClosure):
		 *   'all'  — the whole file: the hand-authored Test area PLUS the 8225
		 *            clone twins the SUITE replays the frozen store against.
		 *            The default, and what a test database gets.
		 *   'core' — the hand-authored Test area and nothing else that is not
		 *            needed to make it resolve. What an INSTALLATION gets.
		 */
		scope?: 'all' | 'core';
	} = {},
): Promise<MaterializeResult> {
	await assertAllowedDatabase(options);
	const doc = options.doc ?? (await loadTestTldOntologyDoc());
	const nodes = options.scope === 'core' ? await coreClosure(doc.nodes) : doc.nodes;

	const byTld = groupNodesByTld(nodes);
	const result: MaterializeResult = { tlds: [...byTld.keys()], nodes: 0, rebuilt: [], strays: [] };

	for (const [tld, nodes] of byTld) {
		const sectionTipo = `${tld}0`;
		const mainNode = nodes.find((node) => node.is_main === true || node.tipo === sectionTipo);
		const wanted = sourceRecordsBySectionId(nodes, sectionTipo);
		await writeOntologyRecords(sectionTipo, wanted);
		result.nodes += wanted.size;
		result.strays.push(...(await straySectionIds(sectionTipo, wanted)));

		// The registry row FIRST: `rebuildOntology` → `ensureMainNode` reads the
		// `<tld>0` node's term and typology from it, and invents defaults when it
		// is missing (term `{lg-nolan: <tld>}` under `ontologytype15`). For a TLD
		// the seed has never heard of — every `test*` thesaurus TLD from phase 2
		// — that silent default is the difference between the JSON's main node
		// and the one the rebuild would mint, i.e. permanent drift.
		if (mainNode !== undefined) await provisionOntologyMainRegistry(mainNode);

		// dd_ontology is DERIVED — the same single writer an operator's "rebuild
		// ontology" uses. Never an upsert from here.
		const rebuild = await rebuildOntology(tld);
		if (!rebuild.ok) {
			refuse(`rebuildOntology('${tld}') failed: ${rebuild.errors.join(' | ')}`, { tld });
		}
		result.rebuilt.push(rebuild.msg);
	}

	await clearOntologyDerivedCaches();
	return result;
}
