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
 * `src/core/ontology/parser.ts parseSectionRecordToOntologyNode`. Every field
 * lands in the component the parser reads it from:
 *
 *   | node field        | component  | matrix column | note                      |
 *   |-------------------|------------|---------------|---------------------------|
 *   | parent            | ontology15 | relation      | locator, relation type dd47 |
 *   | model_tipo        | ontology6  | relation      | locator (dd151)           |
 *   | relations[]       | ontology10 | relation      | one locator per entry     |
 *   | is_translatable   | ontology8  | relation      | dd64/1 yes, dd64/2 no     |
 *   | is_model          | ontology30 | relation      | dd64/1 yes, dd64/2 no     |
 *   | term{lang:value}  | ontology5  | string        | one item per lang         |
 *   | tld               | ontology7  | string        | lg-nolan, MANDATORY       |
 *   | properties.css    | ontology16 | misc          |                           |
 *   | properties.source | ontology17 | misc          |                           |
 *   | properties (rest) | ontology18 | misc          |                           |
 *   | propiedades       | ontology19 | misc          | v5 legacy JSON text       |
 *   | order_number      | ontology41 | number        |                           |
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

import { canonicalizeStoredSectionId } from '../concepts/section_id.ts';
import type { DdOntologyNode } from '../db/dd_ontology.ts';
import type { MatrixJsonbColumn } from '../db/matrix.ts';
import { insertMatrixRecordWithExplicitId } from '../db/matrix_write.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import { DedaloError } from '../errors/index.ts';
import { clearOntologyDerivedCaches } from '../ontology/cache_invalidation.ts';
import { rebuildOntology } from '../ontology/ontology_state.ts';
import {
	DATA_NOLAN,
	ONTOLOGY_CONNECTED_TO,
	ONTOLOGY_CSS,
	ONTOLOGY_IS_MODEL,
	ONTOLOGY_MODEL,
	ONTOLOGY_ORDER,
	ONTOLOGY_PARENT,
	ONTOLOGY_PROPERTIES,
	ONTOLOGY_PROPIEDADES_V5,
	ONTOLOGY_SOURCE,
	ONTOLOGY_TERM,
	ONTOLOGY_TLD,
	ONTOLOGY_TRANSLATABLE,
	RELATION_TYPE_LINK,
	RELATION_TYPE_PARENT,
	SI_NO_NO,
	SI_NO_SECTION,
	SI_NO_YES,
} from '../ontology/ontology_tipos.ts';
import { addMainSection } from '../ontology/ontology_write.ts';
import { getSectionIdFromTipo, getTldFromTipo, safeTld } from '../ontology/tld.ts';
import { assertTestDatabase } from './test_database_marker.ts';

/** The one JSON source of the generic test ontology (repo-relative, for messages). */
export const TEST_TLD_JSON_PATH = 'src/core/test_data/test_tld_ontology.json';

/** The document shape of that file. `nodes` are plain `DdOntologyNode`s. */
export interface TestTldOntologyDoc {
	tld: string;
	nodes: DdOntologyNode[];
}

/** The jsonb columns of one materialized record — what the parser reads back. */
export type OntologyRecordColumns = Partial<Record<MatrixJsonbColumn, unknown>>;

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

/* --------------------------------------------------- the inverse parser */

/** A stored literal item, exactly as the parser reads it back ({id, lang, value}). */
function literalItem(id: number, lang: string, value: unknown): Record<string, unknown> {
	return { id, lang, value };
}

/**
 * A stored relation locator. `section_id` goes through the ONE canonical
 * door (WC-2026-08-10-section-id-int-canonical), same as
 * `ontology_write.relationLocator`.
 */
function relationLocator(
	id: number,
	type: string,
	targetTipo: string,
	fromComponentTipo: string,
): Record<string, unknown> {
	const tld = getTldFromTipo(targetTipo);
	const sectionId = getSectionIdFromTipo(targetTipo);
	if (tld === null || sectionId === null) {
		refuse(`'${targetTipo}' is not a <tld><id> tipo (referenced by ${fromComponentTipo})`, {
			tipo: targetTipo,
		});
	}
	return {
		id,
		type,
		section_id: canonicalizeStoredSectionId(sectionId),
		section_tipo: `${tld}0`,
		from_component_tipo: fromComponentTipo,
	};
}

/** The si/no locator a boolean flag is stored as (dd64/1 = yes, dd64/2 = no). */
function yesNoLocator(value: boolean, fromComponentTipo: string): Record<string, unknown> {
	return {
		id: 1,
		type: RELATION_TYPE_LINK,
		section_id: canonicalizeStoredSectionId(value ? SI_NO_YES : SI_NO_NO),
		section_tipo: SI_NO_SECTION,
		from_component_tipo: fromComponentTipo,
	};
}

/** A nullable tipo field the parser reads as "set" (present and non-empty). */
const isSetTipo = (value: string | null | undefined): value is string =>
	value !== null && value !== undefined && value !== '';

/** `relation` — parent, model, connected_to, and the two always-written flags. */
function relationColumnFromNode(node: DdOntologyNode): Record<string, unknown[]> {
	const relation: Record<string, unknown[]> = {};
	if (isSetTipo(node.parent)) {
		relation[ONTOLOGY_PARENT] = [
			relationLocator(1, RELATION_TYPE_PARENT, node.parent, ONTOLOGY_PARENT),
		];
	}
	if (isSetTipo(node.model_tipo)) {
		relation[ONTOLOGY_MODEL] = [
			relationLocator(1, RELATION_TYPE_LINK, node.model_tipo, ONTOLOGY_MODEL),
		];
	}
	if ((node.relations?.length ?? 0) > 0 && node.relations !== null) {
		relation[ONTOLOGY_CONNECTED_TO] = node.relations.map((item, index) =>
			relationLocator(index + 1, RELATION_TYPE_LINK, item.tipo, ONTOLOGY_CONNECTED_TO),
		);
	}
	// Always written: the parser reads a MISSING ontology8 as translatable=true.
	relation[ONTOLOGY_TRANSLATABLE] = [yesNoLocator(node.is_translatable, ONTOLOGY_TRANSLATABLE)];
	relation[ONTOLOGY_IS_MODEL] = [yesNoLocator(node.is_model, ONTOLOGY_IS_MODEL)];
	return relation;
}

/** `string` — the MANDATORY tld plus one term item per language. */
function stringColumnFromNode(node: DdOntologyNode, tld: string): Record<string, unknown[]> {
	// The tld is MANDATORY — a record without it parses into nothing at all.
	const string: Record<string, unknown[]> = { [ONTOLOGY_TLD]: [literalItem(1, DATA_NOLAN, tld)] };
	const items = Object.entries(node.term ?? {}).map(([lang, value]) => literalItem(1, lang, value));
	if (items.length > 0) string[ONTOLOGY_TERM] = items;
	return string;
}

/**
 * `propiedades` (v5 legacy) as the parser stores it back: parsed JSON when it
 * is JSON, otherwise the raw text verbatim (phpPrettyJsonEncode of a string is
 * that string, quoted), which is the only round-tripping choice.
 */
function propiedadesValue(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

/**
 * `misc` — the three components `properties` is the MERGE of (parser:
 * ontology18 first, then .css, then .source), so the split is by key, and a key
 * that is PRESENT-BUT-NULL still belongs to its own component; plus the v5
 * `propiedades` text.
 */
function miscColumnFromNode(node: DdOntologyNode): Record<string, unknown[]> {
	const misc: Record<string, unknown[]> = {};
	const allProperties = node.properties ?? {};
	const { css, source, ...restProperties } = allProperties;
	if (Object.hasOwn(allProperties, 'css')) misc[ONTOLOGY_CSS] = [{ id: 1, value: css }];
	if (Object.hasOwn(allProperties, 'source')) misc[ONTOLOGY_SOURCE] = [{ id: 1, value: source }];
	if (Object.keys(restProperties).length > 0) {
		misc[ONTOLOGY_PROPERTIES] = [{ id: 1, value: restProperties }];
	}
	if (isSetTipo(node.propiedades)) {
		misc[ONTOLOGY_PROPIEDADES_V5] = [{ id: 1, value: propiedadesValue(node.propiedades) }];
	}
	return misc;
}

/** The two identity facts every column needs, both REQUIRED by the parser. */
function nodeIdentity(node: DdOntologyNode): { tld: string; sectionId: number } {
	const tld = node.tld ?? getTldFromTipo(node.tipo);
	if (tld === null || safeTld(tld) === null) {
		refuse(`node '${node.tipo}' has no valid tld`, { tipo: node.tipo });
	}
	const sectionId = getSectionIdFromTipo(node.tipo);
	if (sectionId === null) refuse(`node '${node.tipo}' has no section_id part`, { tipo: node.tipo });
	return { tld, sectionId: Number(sectionId) };
}

/** `data` — the row's own coordinates plus the human label the list shows. */
function dataColumnFromNode(
	node: DdOntologyNode,
	tld: string,
	sectionId: number,
): OntologyRecordColumns['data'] {
	return {
		section_id: sectionId,
		section_tipo: `${tld}0`,
		label: node.term?.['lg-eng'] ?? node.term?.['lg-spa'] ?? node.tipo,
	};
}

/**
 * ONE ontology node → the jsonb columns of its `matrix_ontology` record — the
 * exact inverse of `parseSectionRecordToOntologyNode` (module header table).
 *
 * PURE: no database, no ontology lookups. The column each component lands in is
 * FIXED here rather than resolved through `getModelByTipo` +
 * `getColumnNameByModel`, because those are the very rows this door is
 * bootstrapping; the gate asserts the two agree, so a model change on an
 * `ontology*` component cannot drift silently.
 *
 * A component is OMITTED when the node's value is null/absent, which is
 * precisely how the parser reads "not set" (`getComponentItems` → null): an
 * absent `ontology15` parses to `parent: null`, an absent `ontology41` to
 * `order_number: null`. The one exception is `ontology8`: the parser DEFAULTS a
 * missing translatable flag to TRUE, so the flag is always written.
 *
 * The four per-column builders above are the halves of that inverse, split out
 * so each stays readable (and under the complexity cap).
 */
export function ontologyRecordFromNode(node: DdOntologyNode): OntologyRecordColumns {
	const { tld, sectionId } = nodeIdentity(node);
	const misc = miscColumnFromNode(node);
	const columns: OntologyRecordColumns = {
		data: dataColumnFromNode(node, tld, sectionId),
		relation: relationColumnFromNode(node),
		string: stringColumnFromNode(node, tld),
	};
	if (Object.keys(misc).length > 0) columns.misc = misc;
	if (node.order_number !== null) {
		columns.number = { [ONTOLOGY_ORDER]: [{ id: 1, value: node.order_number }] };
	}
	return columns;
}

/* -------------------------------------------------- the main-node registry */

/**
 * Write the `matrix_ontology_main` (`ontology35`) registry row a TLD's `<tld>0`
 * main node is derived from, taking BOTH of its variable fields straight out of
 * the JSON node:
 *
 *   node.term            → `hierarchy5`  (the main record's name, per language)
 *   node.parent          → `hierarchy9`  (the typology; `ontologytype<id>` IS
 *                                         the grouper the rebuild re-derives)
 *
 * Everything else the registry carries (project filter, language, active flags,
 * target section) is `addMainSection`'s own contract and is left to it —
 * IDEMPOTENT, reusing the row whose `hierarchy6` already names this TLD.
 *
 * The inverse is `createDdOntologyRootNode`: it builds `<tld>0` with
 * `parent = ontologytype<typology_id>` and `term = termFromNameData(name_data)`.
 * So writing the row from the node and letting the rebuild mint the node from
 * the row is a round trip, and the gate's "dd_ontology equals the JSON node for
 * node" check is what proves it closed.
 */
async function provisionOntologyMainRegistry(mainNode: DdOntologyNode): Promise<void> {
	const tld = mainNode.tld ?? getTldFromTipo(mainNode.tipo);
	if (tld === null) refuse(`main node '${mainNode.tipo}' has no tld`, { tipo: mainNode.tipo });
	// The typology grouper: `createParentGrouper` builds `ontologytype<id>`, so
	// the id is readable straight off the node's parent. A main node parented
	// anywhere else keeps the registry's default (PHP's 'others', 15).
	const typology = /^ontologytype([0-9]+)$/.exec(mainNode.parent ?? '');
	const nameData = Object.entries(mainNode.term ?? {}).map(([lang, value]) => ({
		id: 1,
		lang,
		value: String(value),
	}));
	await withTransaction(async () => {
		await addMainSection({
			tld,
			typology_id: typology === null ? null : Number(typology[1]),
			name_data: nameData.length > 0 ? nameData : null,
		});
	});
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
			await sql.unsafe(
				`DELETE FROM "${ONTOLOGY_TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
				[sectionTipo, sectionId],
			);
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
