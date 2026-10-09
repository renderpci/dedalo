/**
 * THE ENGINE-OWNED ONTOLOGY — the sections the engine itself writes AND the
 * components it reads for a wire contract, defined in the repository and
 * materialized into every installation.
 *
 * WHY A TLD OF ITS OWN (2026-10-01, closure Step 3 / TOOLS-4). The AI spend
 * ledger (security/ai_spend.ts) is standard-schema state: a section with
 * components, one record per (user, UTC day) — never a bespoke table. A section
 * needs ontology nodes, and the engine needs them on EVERY installation the
 * moment its code ships. The master `dd` ontology cannot carry them: it is
 * authored on the ontology master, not in this repository, and an ontology
 * update replaces the `dd` TLD wholesale — a node the engine planted there
 * would be wiped by the next update. The ontology update imports PER TLD (the
 * manifest's files, ontology_update.ts), so a TLD the master never serves is
 * never touched by it. Hence `ddengine`: owned by this repository, its source
 * of record `./engine_ontology.json`, reserved for the engine.
 *
 * THE DOOR IS THE ENGINE'S OWN, in the engine's order (the same law as the
 * test-TLD door, test_data/test_tld_materialize.ts):
 *
 *   JSON node --ontologyRecordFromNode--> matrix_ontology `ddengine0` record
 *             (persistRecordColumns — the whole-record chokepoint, unstamped)
 *   the main node --provisionOntologyMainRegistry--> the ontology35 registry row
 *   matrix_ontology records --rebuildOntology('ddengine')--> dd_ontology rows
 *
 * dd_ontology is NEVER written here: rebuildOntology is its one writer.
 *
 * IDEMPOTENT AND CHEAP WHEN CURRENT. `engineOntologyDrift` compares every JSON
 * node with its dd_ontology row by the engine's own equality law
 * (`nodeDiffColumns`); nothing differs → nothing is written. Any difference — a
 * fresh install, a release that changed a node, an operator's edit of an
 * engine node — rewrites EVERY source record from the JSON and rebuilds the
 * TLD: the repository is the source of record, and an edit made in the
 * database is drift by definition. Records of `ddengine0` the JSON does not
 * declare are REPORTED as strays, never deleted (not this door's to remove).
 *
 * A COMPONENT THE ENGINE READS (2026-10-09, installer unification A5).
 * `ddengine11` "Required ontologies" (ontology_tipos.ts ONTOLOGY_DEPENDENCIES)
 * is a component_portal → ontology35 placed in hierarchy1's "Relations" group
 * (`hierarchy60`), so it renders in the Ontologies-main (ontology35, virtual of
 * hierarchy1) edit form — and, the real section being shared, in the thesaurus
 * registry (hierarchy1) form too, where nothing reads it. The ontology export
 * reads it into ontology.json `active_ontologies[i].dependencies` (data_io.ts),
 * which the installer follows (WC-2026-10-09-ontology-manifest-dependencies).
 * It cannot live in the master ontology for the same reason as the ledger: an
 * update replaces a TLD wholesale, and a tipo cannot be pre-allocated on the
 * master for every installation. `ddengine` ships with the code, is
 * materialized on every install INCLUDING the master, and the master's editors
 * fill it in the normal edit form. A node of this file may therefore hang under
 * another TLD's parent (`parent` is not ownership — the TIPO is); the door
 * still owns and rewrites only `ddengine` records.
 *
 * WHO CALLS IT: boot (server.ts, after the schema migrations — a code update
 * reaches an installation through a restart, so boot IS the update lane), the
 * installer (install/db_restore.ts), the suite setup (scripts/test_db_setup.ts)
 * and the suite preload (test/preload/engine_state.ts — the boot twin for a
 * `bun test` process). A failure is LOUD and never fatal to boot: every
 * consumer of an engine section fails CLOSED without it (ai_spend refuses with
 * `ai.budget_unavailable`).
 *
 * ONE PROCESS AT A TIME, by deployment: boot is single-flight per install, and
 * the doors below are idempotent (whole-record overwrite, wholesale rebuild),
 * so a rare concurrent second run converges on the same rows.
 *
 * Gates: test/unit/ai_spend_budget_native.test.ts (the engine-ontology legs:
 * dd_ontology ≡ the JSON node for node, `inspectOntology` drift-free, a second
 * run writes nothing, a damaged node is healed, every node is under the
 * engine TLD); test/unit/ontology_dependencies_native.test.ts (ddengine11
 * materialized under hierarchy60, in the ontology35 edit context, read by the
 * export census).
 */

import type { DdOntologyNode } from '../db/dd_ontology.ts';
import { readDdOntologyRow } from '../db/dd_ontology.ts';
import type { MatrixWriteValues } from '../db/matrix_write.ts';
import { sql } from '../db/postgres.ts';
import { DedaloError } from '../errors/index.ts';
import { persistRecordColumns } from '../section_record/record_write.ts';
import { clearOntologyDerivedCaches } from './cache_invalidation.ts';
import {
	ontologyRecordFromNode,
	provisionOntologyMainRegistry,
} from './ontology_record_inverse.ts';
import { nodeDiffColumns, rebuildOntology } from './ontology_state.ts';
import { getSectionIdFromTipo, getTldFromTipo } from './tld.ts';

/** The engine-owned TLD. Reserved: an installation must not author a thesaurus under it. */
export const ENGINE_TLD = 'ddengine';

/** Its source of record (repo-relative, for messages). */
export const ENGINE_ONTOLOGY_JSON_PATH = 'src/core/ontology/engine_ontology.json';

/** The document shape of that file. */
export interface EngineOntologyDoc {
	tld: string;
	nodes: DdOntologyNode[];
}

/** What one `ensureEngineOntology` run did. */
export interface EnsureEngineOntologyResult {
	/** False when every node already matched (nothing was written). */
	changed: boolean;
	/** The drift found BEFORE the run, one line per node (`<tipo>: <columns>`). */
	drift: string[];
	/** Source records written (main node excluded — it has none). */
	written: number;
	/** `ddengine0` records the JSON does not declare, as `ddengine0/<id>` — reported, never deleted. */
	strays: string[];
}

/** `<tld>0` ALWAYS lives in matrix_ontology (resolver.getMatrixTableFromTipo's '0' rule). */
const ONTOLOGY_TABLE = 'matrix_ontology';
const MAIN_SECTION_TIPO = `${ENGINE_TLD}0`;

/** The engine actor: the door writes as the system (-1), unstamped, like every provisioner. */
const ENGINE_ACTOR = -1;

function refuse(message: string, coordinates: Record<string, string | number> = {}): never {
	throw new DedaloError('internal.invariant', {
		message: `engine ontology: ${message}`,
		coordinates,
	});
}

/** Load the committed JSON source. */
export async function loadEngineOntologyDoc(): Promise<EngineOntologyDoc> {
	const module = await import('./engine_ontology.json');
	return module.default as unknown as EngineOntologyDoc;
}

/**
 * Every node must sit under the engine TLD and carry its own tipo grammar —
 * a definitions file that names another TLD would let this door rewrite
 * records it does not own.
 */
function assertOwnNodes(doc: EngineOntologyDoc): DdOntologyNode {
	if (doc.tld !== ENGINE_TLD) refuse(`the document declares tld '${doc.tld}'`, { tld: doc.tld });
	const seen = new Set<string>();
	for (const node of doc.nodes) assertOwnNode(node, seen);
	const main = doc.nodes.find((node) => node.tipo === MAIN_SECTION_TIPO);
	if (main?.is_main !== true) refuse(`the document has no main node '${MAIN_SECTION_TIPO}'`);
	return main;
}

/** One node: under the engine TLD (its declared tld AND its tipo's), and not a duplicate. */
function assertOwnNode(node: DdOntologyNode, seen: Set<string>): void {
	if (node.tld !== ENGINE_TLD || getTldFromTipo(node.tipo) !== ENGINE_TLD) {
		refuse(`node '${node.tipo}' is not under the engine tld`, { tipo: node.tipo });
	}
	if (seen.has(node.tipo)) refuse(`duplicate node '${node.tipo}'`, { tipo: node.tipo });
	seen.add(node.tipo);
}

/**
 * The drift between the JSON and dd_ontology, by the engine's own equality law
 * (`nodeDiffColumns`). Empty = current. One line per differing node.
 */
export async function engineOntologyDrift(doc?: EngineOntologyDoc): Promise<string[]> {
	const source = doc ?? (await loadEngineOntologyDoc());
	const drift: string[] = [];
	for (const node of source.nodes) {
		const row = await readDdOntologyRow(node.tipo);
		if (row === null) {
			drift.push(`${node.tipo}: missing`);
			continue;
		}
		const columns = nodeDiffColumns(node, row);
		if (columns.length > 0) drift.push(`${node.tipo}: ${columns.join(',')}`);
	}
	return drift;
}

/**
 * The FULL record a node is stored as: the inverse parser's columns, plus an
 * EMPTY bag for every column the node leaves unset — persistRecordColumns
 * replaces the columns it is given and keeps the others, so an omitted `misc`
 * would let a removed property survive the rewrite.
 */
function fullRecordColumns(node: DdOntologyNode): MatrixWriteValues {
	const columns = ontologyRecordFromNode(node) as MatrixWriteValues;
	return { misc: {}, number: {}, ...columns } as MatrixWriteValues;
}

/** `ddengine0` records present in the table that the JSON does not declare. */
async function strayRecords(declared: ReadonlySet<number>): Promise<string[]> {
	const present = (await sql.unsafe(
		`SELECT section_id FROM "${ONTOLOGY_TABLE}" WHERE section_tipo = $1 ORDER BY section_id`,
		[MAIN_SECTION_TIPO],
	)) as { section_id: number }[];
	return present
		.filter((row) => !declared.has(Number(row.section_id)))
		.map((row) => `${MAIN_SECTION_TIPO}/${row.section_id}`);
}

/**
 * Materialize the engine ontology when it differs from the JSON; a no-op when
 * it does not. THROWS (`internal.invariant`) when the definitions are not the
 * engine's own, when the rebuild fails, or when the round trip leaves drift.
 */
export async function ensureEngineOntology(
	options: { doc?: EngineOntologyDoc } = {},
): Promise<EnsureEngineOntologyResult> {
	const doc = options.doc ?? (await loadEngineOntologyDoc());
	const main = assertOwnNodes(doc);
	const drift = await engineOntologyDrift(doc);
	const declared = new Set(doc.nodes.map((node) => Number(getSectionIdFromTipo(node.tipo))));
	if (drift.length === 0) {
		return { changed: false, drift, written: 0, strays: await strayRecords(declared) };
	}
	const written = await writeSourceRecords(doc);
	await deriveEngineOntology(main);
	const residual = await engineOntologyDrift(doc);
	if (residual.length > 0) {
		refuse(`the round trip left drift: ${residual.join('; ')}`, { tld: ENGINE_TLD });
	}
	return { changed: true, drift, written, strays: await strayRecords(declared) };
}

/**
 * Every non-main node's `ddengine0` source record, rewritten WHOLE from the JSON
 * (persistRecordColumns — the whole-record chokepoint, unstamped). The main node
 * has no source record: the rebuild mints it from the registry row.
 */
async function writeSourceRecords(doc: EngineOntologyDoc): Promise<number> {
	const nodes = doc.nodes.filter((node) => node.tipo !== MAIN_SECTION_TIPO);
	for (const node of nodes) {
		await persistRecordColumns(
			{
				table: ONTOLOGY_TABLE,
				sectionTipo: MAIN_SECTION_TIPO,
				sectionId: Number(getSectionIdFromTipo(node.tipo)),
			},
			fullRecordColumns(node),
			false,
			{ actor: ENGINE_ACTOR },
		);
	}
	return nodes.length;
}

/** The registry row FIRST (the rebuild mints `ddengine0` from it), then dd_ontology by its one writer. */
async function deriveEngineOntology(main: DdOntologyNode): Promise<void> {
	await provisionOntologyMainRegistry(main);
	const rebuild = await rebuildOntology(ENGINE_TLD, ENGINE_ACTOR);
	if (!rebuild.ok) {
		refuse(`rebuildOntology('${ENGINE_TLD}') failed: ${rebuild.errors.join(' | ')}`);
	}
	await clearOntologyDerivedCaches();
}
