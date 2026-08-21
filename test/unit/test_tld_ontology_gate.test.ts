/**
 * The generic `test` TLD ontology has ONE source of record:
 * `src/core/test_data/test_tld_ontology.json` (2026-08-19, generic-`test`-TLD
 * migration phase 1). The database is DERIVED from it — the installer and
 * `scripts/test_db_setup.ts` call `materializeTestTldOntology()`, which writes
 * `matrix_ontology` `<tld>0` records through `ontologyRecordFromNode` (the
 * inverse of the parser) and then lets `rebuildOntology(tld)` — the ONE
 * dd_ontology writer — produce the runtime rows.
 *
 * This gate is what makes that claim checkable, in four tiers:
 *
 *  (a) HERMETIC — the JSON is a valid ontology: node shape, tipo grammar, and
 *      every tipo a node REFERENCES resolves inside the JSON or to an allowed
 *      TLD. The refs that do NOT are frozen below with a reason each: the law
 *      (plan decision 1) allows only `test`/`test*` + dd, rsc, hierarchy,
 *      ontology, ontologytype, lg, and phase 2's clone script clears the rest.
 *      The list is SHRINK-ONLY — a new install-TLD reference fails here.
 *  (b) HERMETIC — the inverse parser puts each field in the component/column
 *      the parser reads it from.
 *  (c) DATABASE — the round trip is REAL: every materialized record parses back
 *      into exactly its JSON node, dd_ontology equals the JSON node for node
 *      (by the engine's own equality law, `nodeDiffColumns`), and
 *      `inspectOntology(tld).drift` is empty.
 *  (d) DATABASE — every `test` SECTION stores in `matrix_test` (plan decision 1:
 *      no test record ever lands in an install's table).
 *
 * The old (a) — "the JSON equals the `test` TLD inside the install seed" — is
 * GONE on purpose: the seed is no longer a source, and
 * `scripts/strip_test_tld_from_seed.ts` removes its copy of these rows.
 */

import { describe, expect, test } from 'bun:test';
import type { DdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import { readDdOntologyRow, searchDdOntology } from '../../src/core/db/dd_ontology.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { inspectOntology, nodeDiffColumns } from '../../src/core/ontology/ontology_state.ts';
import {
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
} from '../../src/core/ontology/ontology_tipos.ts';
import { parseSectionRecordToOntologyNode } from '../../src/core/ontology/parser.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../src/core/ontology/resolver.ts';
import { getSectionIdFromTipo } from '../../src/core/ontology/tld.ts';
import {
	coreClosure,
	loadTestTldOntologyDoc,
	materializeTestTldOntology,
	ontologyRecordFromNode,
} from '../../src/core/test_data/test_tld_materialize.ts';
import cloneMapJson from '../../src/core/test_data/test_tld_tipo_map.json';

const DOC = await loadTestTldOntologyDoc();
const NODES = DOC.nodes;
const TIPOS = new Set(NODES.map((node) => node.tipo));
/** Every TLD the document declares (phase 2 adds one `test*` per thesaurus). */
const TLDS = [...new Set(NODES.map((node) => node.tld ?? ''))].sort();

/** PHP's tipo grammar (api/handlers/dd_core_api.ts:52 and friends). */
const TIPO_RE = /^[a-z]{2,}[0-9]+$/;
/** Any tipo-shaped token inside a properties/propiedades blob. */
const TOKEN_RE = /\b[a-z]{2,}[0-9]+\b/g;

/**
 * The ONLY foreign TLDs a test node may reference (plan decision 1, user
 * 2026-08-19). Everything else — including `oh`, the country hierarchies and
 * every project TLD — is cloned into `test` instead.
 */
const ALLOWED_TLDS = new Set(['dd', 'rsc', 'hierarchy', 'ontology', 'ontologytype', 'lg']);

/** The database this suite is actually connected to. */
const currentDatabaseName = async (): Promise<string> =>
	((await sql`SELECT current_database() AS db`) as { db: string }[])[0]?.db ?? '';

const tldOf = (tipo: string): string => /^[a-z]{2,}/.exec(tipo)?.[0] ?? '';

/**
 * The still-foreign references the shipped ontology carries — FROZEN, with a
 * reason each, in `src/core/test_data/test_tld_foreign_refs.json`.
 *
 * The list is DATA, not code in this file, for one mechanical reason: the
 * install-TLD census (`scripts/lib/tld_census.ts`) scans `test/**` and would
 * read those tipos as THIS GATE binding eight installs. Comments are stripped
 * by the census, code strings are not.
 *
 * Phase 2's clone script retargets each entry at a `test` clone and deletes it
 * from the file; the set may only SHRINK (measured 2026-08-19: 28 tipos / 41
 * sites).
 */
const FOREIGN_REFS_PATH = 'src/core/test_data/test_tld_foreign_refs.json';
const FROZEN = (await import('../../src/core/test_data/test_tld_foreign_refs.json')).default as {
	probe_tipo: string;
	tokens: Record<string, { sites: string[]; reason: string }>;
};
const FROZEN_FOREIGN_REFS = FROZEN.tokens;
/** Every foreign reference in a set of nodes, as `tipo → sites`. */
function foreignRefs(nodes: readonly DdOntologyNode[]): Map<string, string[]> {
	const found = new Map<string, Set<string>>();
	for (const node of nodes) {
		const add = (token: string, field: string): void => {
			if (TIPOS.has(token) || ALLOWED_TLDS.has(tldOf(token))) return;
			const sites = found.get(token) ?? new Set<string>();
			sites.add(`${node.tipo}.${field}`);
			found.set(token, sites);
		};
		if (node.parent !== null && node.parent !== '') add(node.parent, 'parent');
		for (const relation of node.relations ?? [])
			add((relation as { tipo: string }).tipo, 'relations');
		if (node.properties !== null) {
			for (const token of JSON.stringify(node.properties).match(TOKEN_RE) ?? []) {
				add(token, 'properties');
			}
		}
		if (node.propiedades !== null) {
			for (const token of node.propiedades.match(TOKEN_RE) ?? []) add(token, 'propiedades');
		}
	}
	return new Map([...found].map(([token, sites]) => [token, [...sites].sort()]));
}

describe('test TLD ontology — the JSON source (hermetic)', () => {
	test('the document is a well-formed ontology: tld, tipo grammar, model, parent', () => {
		expect(NODES.length).toBeGreaterThan(200); // anti-vacuity: 217 today
		expect(TLDS.length).toBeGreaterThan(0);
		const broken: string[] = [];
		for (const node of NODES) {
			if (typeof node.tld !== 'string' || node.tld === '') broken.push(`${node.tipo}: no tld`);
			if (!TIPO_RE.test(node.tipo)) broken.push(`${node.tipo}: tipo grammar`);
			if (!node.tipo.startsWith(String(node.tld))) broken.push(`${node.tipo}: tipo ≠ tld prefix`);
			if (typeof node.model !== 'string' || node.model === '') {
				broken.push(`${node.tipo}: no model`);
			}
			if (!Object.hasOwn(node, 'parent')) broken.push(`${node.tipo}: no parent key`);
			// Only the `<tld>0` main node may be parentless (it is minted by the
			// rebuild from the ontology35 registry row, not from a source record).
			if (node.parent === null && node.is_main !== true) broken.push(`${node.tipo}: null parent`);
			if (node.is_main === true && node.tipo !== `${node.tld}0`) {
				broken.push(`${node.tipo}: is_main but not <tld>0`);
			}
		}
		expect(broken).toEqual([]);
	});

	test('every tipo a node references resolves — foreign refs are the frozen, shrink-only list', () => {
		const found = foreignRefs(NODES);
		const unknown = [...found.keys()].filter((tipo) => FROZEN_FOREIGN_REFS[tipo] === undefined);
		expect(
			unknown.sort(),
			`NEW install-TLD reference(s) in the test ontology (frozen list: ${FOREIGN_REFS_PATH}). The law (plan decision 1) allows only test/test* + ${[...ALLOWED_TLDS].join(', ')}: clone the target into the test TLD instead of pointing at an install's node.`,
		).toEqual([]);
		// SHRINK-ONLY: a frozen ref may disappear (phase 2 clears them), never grow
		// a new site.
		const grown: string[] = [];
		for (const [tipo, sites] of found) {
			const frozen = FROZEN_FOREIGN_REFS[tipo]?.sites ?? [];
			for (const site of sites) if (!frozen.includes(site)) grown.push(`${tipo} @ ${site}`);
		}
		expect(grown.sort()).toEqual([]);
		// Measured 2026-08-19: 28 tipos / 41 sites. Only ≤ is asserted.
		expect(found.size).toBeLessThanOrEqual(Object.keys(FROZEN_FOREIGN_REFS).length);
	});

	test('anti-vacuity: the scanner sees the whole document and DOES flag a foreign ref', () => {
		// It really walks the blobs: the document is token-rich.
		const tokens = NODES.flatMap(
			(node) => JSON.stringify(node.properties ?? {}).match(TOKEN_RE) ?? [],
		);
		expect(tokens.length).toBeGreaterThan(200); // 298 today
		// And a planted install reference is caught (not silently allowed).
		const planted = foreignRefs([
			{ ...(NODES[0] as DdOntologyNode), tipo: 'test999999', parent: FROZEN.probe_tipo },
		]);
		expect([...planted.keys()]).toContain(FROZEN.probe_tipo);
	});
});

describe('test TLD ontology — the inverse parser (hermetic)', () => {
	test('every node maps into the components/columns the parser reads back', () => {
		const wrong: string[] = [];
		for (const node of NODES) {
			const columns = ontologyRecordFromNode(node) as Record<
				string,
				Record<string, { value?: unknown; lang?: string }[]>
			>;
			const tld = String(columns.data?.section_tipo ?? '').replace(/0$/, '');
			if (tld !== node.tld) wrong.push(`${node.tipo}: record section_tipo`);
			if (columns.string?.[ONTOLOGY_TLD]?.[0]?.value !== node.tld) {
				wrong.push(`${node.tipo}: ${ONTOLOGY_TLD} (tld) not in the string column`);
			}
			if (node.term !== null) {
				const langs = (columns.string?.[ONTOLOGY_TERM] ?? []).map((item) => item.lang).sort();
				if (JSON.stringify(langs) !== JSON.stringify(Object.keys(node.term).sort())) {
					wrong.push(`${node.tipo}: ${ONTOLOGY_TERM} (term) langs`);
				}
			}
			const hasParent = columns.relation?.[ONTOLOGY_PARENT] !== undefined;
			if (hasParent !== (node.parent !== null)) wrong.push(`${node.tipo}: ${ONTOLOGY_PARENT}`);
			const hasModel = columns.relation?.[ONTOLOGY_MODEL] !== undefined;
			if (hasModel !== (node.model_tipo !== null)) wrong.push(`${node.tipo}: ${ONTOLOGY_MODEL}`);
			const hasRelations = columns.relation?.[ONTOLOGY_CONNECTED_TO] !== undefined;
			if (hasRelations !== (node.relations?.length ?? 0) > 0) {
				wrong.push(`${node.tipo}: ${ONTOLOGY_CONNECTED_TO}`);
			}
			// The flags are ALWAYS written (a missing ontology8 parses as `true`).
			if (columns.relation?.[ONTOLOGY_TRANSLATABLE] === undefined) {
				wrong.push(`${node.tipo}: ${ONTOLOGY_TRANSLATABLE} missing`);
			}
			if (columns.relation?.[ONTOLOGY_IS_MODEL] === undefined) {
				wrong.push(`${node.tipo}: ${ONTOLOGY_IS_MODEL} missing`);
			}
			const hasOrder = columns.number?.[ONTOLOGY_ORDER] !== undefined;
			if (hasOrder !== (node.order_number !== null)) wrong.push(`${node.tipo}: ${ONTOLOGY_ORDER}`);
			const hasCss = columns.misc?.[ONTOLOGY_CSS] !== undefined;
			if (hasCss !== (node.properties !== null && 'css' in node.properties)) {
				wrong.push(`${node.tipo}: ${ONTOLOGY_CSS} (properties.css)`);
			}
			const hasSource = columns.misc?.[ONTOLOGY_SOURCE] !== undefined;
			if (hasSource !== (node.properties !== null && 'source' in node.properties)) {
				wrong.push(`${node.tipo}: ${ONTOLOGY_SOURCE} (properties.source)`);
			}
			const hasPropiedades = columns.misc?.[ONTOLOGY_PROPIEDADES_V5] !== undefined;
			if (hasPropiedades !== (node.propiedades !== null)) {
				wrong.push(`${node.tipo}: ${ONTOLOGY_PROPIEDADES_V5} (propiedades)`);
			}
		}
		expect(wrong).toEqual([]);
	});

	test('anti-vacuity: a node WITHOUT properties writes no properties component', () => {
		const bare = NODES.find((node) => node.properties === null) as DdOntologyNode;
		const columns = ontologyRecordFromNode(bare) as Record<string, Record<string, unknown>>;
		expect(columns.misc?.[ONTOLOGY_PROPERTIES]).toBeUndefined();
		expect(columns.string?.[ONTOLOGY_TLD]).toBeDefined();
	});
});

describe('test TLD ontology — the database is derived from the JSON', () => {
	test('the fixed component→column map still matches the ontology itself', async () => {
		const expected: Record<string, string> = {
			[ONTOLOGY_PARENT]: 'relation',
			[ONTOLOGY_MODEL]: 'relation',
			[ONTOLOGY_CONNECTED_TO]: 'relation',
			[ONTOLOGY_TRANSLATABLE]: 'relation',
			[ONTOLOGY_IS_MODEL]: 'relation',
			[ONTOLOGY_TERM]: 'string',
			[ONTOLOGY_TLD]: 'string',
			[ONTOLOGY_CSS]: 'misc',
			[ONTOLOGY_SOURCE]: 'misc',
			[ONTOLOGY_PROPERTIES]: 'misc',
			[ONTOLOGY_PROPIEDADES_V5]: 'misc',
			[ONTOLOGY_ORDER]: 'number',
		};
		for (const [tipo, column] of Object.entries(expected)) {
			const model = await getModelByTipo(tipo);
			expect(model, tipo).not.toBeNull();
			expect(getColumnNameByModel(String(model)), tipo).toBe(column);
		}
	});

	test('every materialized record parses BACK into exactly its JSON node (round trip)', async () => {
		let parsed = 0;
		const diffs: string[] = [];
		for (const node of NODES) {
			// The main node has no source record — the rebuild mints it.
			if (node.is_main === true) continue;
			const sectionId = Number(getSectionIdFromTipo(node.tipo));
			const back = await parseSectionRecordToOntologyNode(`${node.tld}0`, sectionId);
			if (back === null) {
				diffs.push(`${node.tipo}: no record / unparseable`);
				continue;
			}
			parsed++;
			if (back.tipo !== node.tipo) diffs.push(`${node.tipo}: parsed as ${back.tipo}`);
			const columns = nodeDiffColumns(back, node);
			if (columns.length > 0) diffs.push(`${node.tipo}: ${columns.join(',')}`);
		}
		expect(diffs).toEqual([]);
		expect(parsed).toBeGreaterThan(200); // anti-vacuity
	});

	test('dd_ontology equals the JSON node for node, and no TLD has drift', async () => {
		for (const tld of TLDS) {
			const dbTipos = new Set(await searchDdOntology({ tld }));
			const jsonTipos = new Set(NODES.filter((node) => node.tld === tld).map((node) => node.tipo));
			expect([...dbTipos].filter((tipo) => !jsonTipos.has(tipo)).sort(), `${tld}: extra`).toEqual(
				[],
			);
			expect([...jsonTipos].filter((tipo) => !dbTipos.has(tipo)).sort(), `${tld}: missing`).toEqual(
				[],
			);
			const state = await inspectOntology(tld);
			expect(state.drift, `${tld} drift`).toEqual([]);
			expect(state.inSync, `${tld} inSync`).toBe(true);
		}
		const diffs: string[] = [];
		for (const node of NODES) {
			const row = await readDdOntologyRow(node.tipo);
			if (row === null) {
				diffs.push(`${node.tipo}: absent`);
				continue;
			}
			const columns = nodeDiffColumns(node, row);
			if (columns.length > 0) diffs.push(`${node.tipo}: ${columns.join(',')}`);
		}
		expect(diffs).toEqual([]);
	});

	test('the door is FAIL-CLOSED about which database it writes to', async () => {
		// Anti-vacuity for the guard itself: without it this door would delete and
		// rewrite every `<tld>0` record of whatever database it was pointed at.
		// Neither call changes the connection — both refuse before writing.
		await expect(materializeTestTldOntology()).rejects.toThrow(/REFUSING to write to database/);
		await expect(
			materializeTestTldOntology({ expectDatabase: 'dedalo_definitely_not_this_database' }),
		).rejects.toThrow(/REFUSING to write to database/);
		// And it ACCEPTS the database the suite is connected to — asserted through
		// the guard's own criterion, without writing anything.
		const live = await currentDatabaseName();
		expect(live).not.toBe('');
		await expect(
			materializeTestTldOntology({ expectDatabase: live, doc: { tld: 'zzq', nodes: [] } }),
		).resolves.toEqual({ tlds: [], nodes: 0, rebuilt: [], strays: [] });
	});

	test('every test SECTION stores in matrix_test (no test record in an install table)', async () => {
		const wrong: string[] = [];
		let checked = 0;
		for (const node of NODES) {
			if (node.model !== 'section') continue;
			// `<tld>0` is the ONTOLOGY section itself: it lives in matrix_ontology by
			// the section_id='0' rule, and holds the TLD's own node records.
			if (node.is_main === true) continue;
			checked++;
			const table = await getMatrixTableFromTipo(node.tipo);
			if (table !== 'matrix_test') wrong.push(`${node.tipo} → ${table}`);
		}
		expect(
			wrong.sort(),
			'plan decision 1: every `test` section carries relations:[{tipo:"test24"}] so its records land in matrix_test.',
		).toEqual([]);
		expect(checked).toBeGreaterThan(0); // anti-vacuity: 5 sections today
	});
});

describe('the install/suite split (materializeTestTldOntology scope)', () => {
	/**
	 * A fresh install materializes the CORE half only. These pin the property
	 * that makes that safe — the core must be CLOSED — and the property that
	 * makes it worth doing: it must be a small fraction of the file.
	 */
	test('the core is CLOSED: it names no test tipo this file defines but omits', async () => {
		const doc = await loadTestTldOntologyDoc();
		const core = await coreClosure(doc.nodes);
		const defined = new Set(doc.nodes.map((node) => node.tipo));
		const kept = new Set(core.map((node) => node.tipo));
		const dangling: string[] = [];
		for (const node of core) {
			for (const referenced of JSON.stringify(node).match(/test[a-z]*\d+/g) ?? []) {
				// A reference this file does not define is seed-shipped (dd/rsc/…) and
				// already present on any install; only an omitted SIBLING dangles.
				if (defined.has(referenced) && !kept.has(referenced))
					dangling.push(`${node.tipo} -> ${referenced}`);
			}
		}
		expect(
			[...new Set(dangling)],
			'an install would receive a Test area referencing nodes it was never given',
		).toEqual([]);
		expect(core.length).toBeGreaterThan(0); // anti-vacuity
	});

	test('the core carries the hand-authored Test area', async () => {
		const doc = await loadTestTldOntologyDoc();
		const kept = new Set((await coreClosure(doc.nodes)).map((node) => node.tipo));
		// test3 is the playground section every install shows; test45 its group.
		for (const tipo of ['test1', 'test3', 'test45']) {
			expect(kept.has(tipo), `${tipo} must reach an installation`).toBe(true);
		}
	});

	test('the core EXCLUDES the clone twins — that is the point of the split', async () => {
		const doc = await loadTestTldOntologyDoc();
		const core = await coreClosure(doc.nodes);
		// A large majority of the file is phase-2 clone twins, which exist so the
		// SUITE can replay a frozen store naming one installation. If this ratio
		// ever collapses, the split has stopped working and installs are carrying
		// another install's ontology again.
		expect(core.length).toBeLessThan(doc.nodes.length / 4);
		// And every clone that IS kept is kept for a reason: something in the core
		// names it (the closure above), never a blanket inclusion.
		const cloneMap = cloneMapJson as { map: Record<string, { target: string }> };
		const targets = new Set(Object.values(cloneMap.map).map((entry) => entry.target));
		const keptClones = core.filter((node) => targets.has(node.tipo)).map((node) => node.tipo);
		const coreOnly = core.filter((node) => !targets.has(node.tipo));
		const named = new Set(JSON.stringify(coreOnly).match(/test[a-z]*\d+/g) ?? []);
		const unreferenced = keptClones.filter((tipo) => !named.has(tipo));
		// Transitive: a clone may be named by another kept clone rather than by a
		// hand-authored node, so only report ones nothing in the core names at all.
		const allNamed = new Set(JSON.stringify(core).match(/test[a-z]*\d+/g) ?? []);
		expect(unreferenced.filter((tipo) => !allNamed.has(tipo))).toEqual([]);
	});
});
