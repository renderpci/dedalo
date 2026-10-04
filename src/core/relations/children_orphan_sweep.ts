/**
 * COMPONENT_RELATION_CHILDREN ORPHAN-BYTES SWEEP — the kernel of
 * scripts/relation_children_orphan_sweep.ts
 * (WC-2026-10-02-relation-children-write-through).
 *
 * Until 2026-10-02 a save on a component_relation_children fell through to the
 * generic engine, which stored the client's locators under the CHILDREN tipo
 * in the host record's own `relation` column. No read consults those bytes —
 * the component is `derived` (its value is the computed "who declares me as
 * parent"), and its search reads the CHILD rows — so they are dead weight that
 * the old no-op save left behind (plus any forward children data an old
 * migration carried). This sweep finds every such key and, with `apply`,
 * removes it through the write chokepoint (`persistRecordKeys`, value null =
 * remove the key; the derived relation_search key goes with it). Nothing that
 * any read serves changes.
 *
 * DRY-RUN IS THE DEFAULT: every found key is reported with the bytes it holds —
 * the report is the record of what an `apply` removes (the bytes were never a
 * value, so no Time Machine row is written for them; keep the report).
 *
 * The children tipos are DERIVED from the ontology (every section's component
 * of model component_relation_children, virtual sections through their real
 * section), and every matrix table any section maps to is searched — no
 * hand list.
 */

import { assertMatrixTable, isMatrixTable } from '../db/matrix.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import {
	getMatrixTableFromTipo,
	getModelByTipo,
	getRecursiveChildrenTipos,
	getSectionRealTipo,
	listSectionNodes,
} from '../ontology/resolver.ts';
import { persistRecordKeys } from '../section_record/index.ts';

const CHILDREN_MODEL = 'component_relation_children';

/** One leftover key: the record it sits on and the bytes it holds. */
export interface ChildrenOrphanKey {
	table: string;
	sectionTipo: string;
	sectionId: number;
	tipo: string;
	value: unknown;
}

export interface ChildrenOrphanSweepResult {
	/** The children tipos searched (derived from the ontology). */
	childrenTipos: string[];
	/** The matrix tables searched. */
	tables: string[];
	/** Tables some section maps to that are not matrix record tables (not searched). */
	skippedTables: string[];
	found: ChildrenOrphanKey[];
	/** Keys removed (0 on a dry run). */
	removed: number;
}

export interface ChildrenOrphanSweepOptions {
	/** Remove the keys (default: report only). */
	apply: boolean;
	/** The actor the chokepoint's derived writes are attributed to. */
	actor: number;
	/** Restrict to these sections (record section_tipo); default: every section. */
	onlySections?: readonly string[];
	/** Restrict to these record ids (with `onlySections`; a gate's scratch records). */
	onlyIds?: readonly number[];
	log?: (line: string) => void;
}

/** The children tipos of one REAL section (its recursive component subtree). */
async function childrenTiposOf(realSectionTipo: string): Promise<string[]> {
	const tipos: string[] = [];
	for (const tipo of await getRecursiveChildrenTipos(realSectionTipo)) {
		if ((await getModelByTipo(tipo)) === CHILDREN_MODEL) tipos.push(tipo);
	}
	return tipos;
}

/** File the section's table as searched (a matrix record table) or skipped. */
async function noteTable(
	sectionTipo: string,
	tables: Set<string>,
	skippedTables: Set<string>,
): Promise<void> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return;
	if (isMatrixTable(table)) tables.add(table);
	else skippedTables.add(table);
}

/** Every component_relation_children tipo + every matrix table, from the ontology. */
async function census(
	onlySections: readonly string[] | undefined,
): Promise<{ tipos: string[]; tables: string[]; skippedTables: string[] }> {
	const sections = onlySections ?? (await listSectionNodes()).map((node) => node.tipo);
	const tipos = new Set<string>();
	const tables = new Set<string>();
	const skippedTables = new Set<string>();
	const walked = new Set<string>();
	for (const sectionTipo of sections) {
		await noteTable(sectionTipo, tables, skippedTables);
		// Virtual sections borrow their real section's components: walk each real once.
		const real = await getSectionRealTipo(sectionTipo);
		if (walked.has(real)) continue;
		walked.add(real);
		for (const tipo of await childrenTiposOf(real)) tipos.add(tipo);
	}
	return {
		tipos: [...tipos].sort(),
		tables: [...tables].sort(),
		skippedTables: [...skippedTables].sort(),
	};
}

/** The leftover keys of one table (one row per record × children tipo present). */
async function findInTable(
	table: string,
	tipos: readonly string[],
	options: ChildrenOrphanSweepOptions,
): Promise<ChildrenOrphanKey[]> {
	assertMatrixTable(table);
	// Lists bind as comma-joined TEXT (string_to_array): the driver does not bind
	// a JS array as a Postgres array. Tipos and ids carry no comma.
	const joined = (values: readonly (string | number)[] | undefined): string | null =>
		values === undefined ? null : values.join(',');
	const rows = (await sql.unsafe(
		`SELECT section_tipo, section_id, key AS tipo, relation->key AS value
		   FROM "${table}", unnest(string_to_array($1::text, ',')) AS key
		  WHERE relation ? key
		    AND ($2::text IS NULL OR section_tipo = ANY(string_to_array($2::text, ',')))
		    AND ($3::text IS NULL OR section_id::text = ANY(string_to_array($3::text, ',')))
		  ORDER BY section_tipo, section_id, key`,
		[joined(tipos), joined(options.onlySections), joined(options.onlyIds)],
	)) as { section_tipo: string; section_id: number; tipo: string; value: unknown }[];
	return rows.map((row) => ({
		table,
		sectionTipo: row.section_tipo,
		sectionId: Number(row.section_id),
		tipo: row.tipo,
		value: row.value,
	}));
}

/** Remove one leftover key through the write chokepoint (null = remove the key). */
async function removeKey(key: ChildrenOrphanKey, actor: number): Promise<void> {
	await withTransaction(() =>
		persistRecordKeys(
			{ table: key.table, sectionTipo: key.sectionTipo, sectionId: key.sectionId },
			[{ column: 'relation', key: key.tipo, value: null }],
			false,
			{ actor },
		),
	);
}

/** One report line per found key — the record of what an `apply` removes. */
function reportLine(key: ChildrenOrphanKey, apply: boolean): string {
	return `${apply ? 'REMOVE' : 'found '} ${key.table} ${key.sectionTipo}/${key.sectionId} relation.${key.tipo} = ${JSON.stringify(key.value)}`;
}

/** Every leftover key across the searched tables. */
async function findAll(
	tables: readonly string[],
	tipos: readonly string[],
	options: ChildrenOrphanSweepOptions,
): Promise<ChildrenOrphanKey[]> {
	const found: ChildrenOrphanKey[] = [];
	if (tipos.length === 0) return found;
	for (const table of tables) found.push(...(await findInTable(table, tipos, options)));
	return found;
}

/** Find (and with `apply`, remove) every leftover component_relation_children key. */
export async function sweepRelationChildrenOrphans(
	options: ChildrenOrphanSweepOptions,
): Promise<ChildrenOrphanSweepResult> {
	const log = options.log ?? (() => {});
	const { tipos, tables, skippedTables } = await census(options.onlySections);
	const found = await findAll(tables, tipos, options);
	for (const key of found) log(reportLine(key, options.apply));
	let removed = 0;
	if (options.apply) {
		for (const key of found) {
			await removeKey(key, options.actor);
			removed++;
		}
	}
	return { childrenTipos: tipos, tables, skippedTables, found, removed };
}
