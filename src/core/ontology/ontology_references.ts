/**
 * ONTOLOGY REFERENCE CLASSIFIER — which tipos an ontology NEEDS from other
 * ontologies, measured from its nodes. PURE: no SQL, no I/O; the callers feed it
 * rows (dd_ontology rows, or the raw lines of a `<tld>.copy.gz` package).
 *
 * ONE measurement for three consumers: the installer's post-import verification
 * (an installed TLD referencing a tipo the installation does not hold), the
 * vendored-package gate (the vendored `oh` file references only core TLDs, so it
 * is installable alone) and the seed gate (the core seed's own foreign
 * references are an exact pinned set — engineering/install_seed_contract.json).
 *
 * WHAT IS MEASURED — the three STRUCTURAL fields of a node, nothing else:
 *   - `parent`    (ontology15 on a matrix_ontology record)
 *   - `model`     (ontology6 → dd_ontology.model_tipo)
 *   - `relations` (ontology10 → dd_ontology.relations[].tipo)
 *
 * THE CLASSES (the declared allow-list is a RULE, never a list of tipos):
 *   - `graft`      a PARENT in a TLD outside the measured set: the node hangs
 *                  itself into another ontology's tree. Inert when that tree is
 *                  absent — the node is simply not reachable from it.
 *   - `diffusion`  a relation FROM a node whose model descends from the
 *                  `diffusion` model grouper (DIFFUSION_MODEL_ROOT): publication
 *                  structure names what is PUBLISHED, which may be absent.
 *   - `dependency` everything else — a model, a relation of a working node, a
 *                  parent inside the set: it must resolve, or the ontology does
 *                  not work.
 *
 * HONEST LIMIT: tipos embedded in `properties` (request_config sqo/ddo_map,
 * observe, source…) are NOT measured. A node that names a foreign tipo only
 * there is invisible to this classifier; the gates built on it say "no
 * structural dependency is missing", never "nothing is missing".
 */

import { splitCopyRow } from '../db/copy_text.ts';
import { MATRIX_COPY_COLUMNS } from '../db/matrix_write.ts';
import { DedaloError } from '../errors/index.ts';
import {
	DIFFUSION_MODEL_ROOT,
	ONTOLOGY_CONNECTED_TO,
	ONTOLOGY_MODEL,
	ONTOLOGY_PARENT,
} from './ontology_tipos.ts';
import { getTldFromTipo } from './tld.ts';

/** The structural field a reference comes from. */
export type ReferenceField = 'parent' | 'model' | 'relations';

/** One reference FROM a node TO a tipo. */
export interface OntologyReference {
	from: string;
	fromTld: string;
	field: ReferenceField;
	to: string;
	/** The model tipo of the `from` node (null when it has none). */
	fromModel: string | null;
}

export type ReferenceClass = 'dependency' | 'graft' | 'diffusion';

/** Why each SOFT class may stay unresolved (prose for reports; no tipo literals). */
export const SOFT_REFERENCE_CLASSES: Readonly<
	Record<Exclude<ReferenceClass, 'dependency'>, string>
> = Object.freeze({
	graft:
		'a node hung under a parent of another ontology: inert while that ontology is absent (the node is unreachable from its tree, and works where it is reached)',
	diffusion:
		'a publication-structure relation (the node model descends from the diffusion model grouper): it names what is published, which may legitimately be absent',
});

/** A tipo test: a set of tipos, or a predicate. */
export type TipoTest = ReadonlySet<string> | ((tipo: string) => boolean);

/** One node as dd_ontology stores it (the structural columns only). */
export interface ReferenceRow {
	tipo: string;
	tld?: string | null;
	parent: string | null;
	model_tipo: string | null;
	relations: readonly { tipo?: unknown }[] | null;
}

function asPredicate(test: TipoTest): (tipo: string) => boolean {
	return typeof test === 'function' ? test : (tipo: string) => test.has(tipo);
}

/** The TLD of a tipo ('' when it has none — a malformed tipo never matches a TLD set). */
function tldOf(tipo: string): string {
	return getTldFromTipo(tipo) ?? '';
}

/** One reference, or none when the target is empty. */
function reference(
	from: string,
	fromTld: string,
	fromModel: string | null,
	field: ReferenceField,
	to: unknown,
): OntologyReference[] {
	return typeof to === 'string' && to !== '' ? [{ from, fromTld, field, to, fromModel }] : [];
}

/** Every reference of one dd_ontology-shaped row. */
function referencesOfRow(row: ReferenceRow): OntologyReference[] {
	const fromTld = row.tld ?? tldOf(row.tipo);
	const model = row.model_tipo;
	return [
		...reference(row.tipo, fromTld, model, 'parent', row.parent),
		...reference(row.tipo, fromTld, model, 'model', model),
		...(row.relations ?? []).flatMap((item) =>
			reference(row.tipo, fromTld, model, 'relations', item?.tipo),
		),
	];
}

/** Every structural reference of dd_ontology-shaped rows. */
export function referencesOfRows(rows: readonly ReferenceRow[]): OntologyReference[] {
	return rows.flatMap(referencesOfRow);
}

// ---------------------------------------------------------------------------
// COPY package lines (matrix_ontology records)
// ---------------------------------------------------------------------------

const SECTION_ID_INDEX = MATRIX_COPY_COLUMNS.indexOf('section_id');
const SECTION_TIPO_INDEX = MATRIX_COPY_COLUMNS.indexOf('section_tipo');
const RELATION_INDEX = MATRIX_COPY_COLUMNS.indexOf('relation');
const ONTOLOGY_SECTION_RE = /^([a-z]+)0$/;

interface StoredLocator {
	section_tipo?: unknown;
	section_id?: unknown;
}

/** `<tld>0` + id → `<tld><id>`; null for any other locator (a main-registry parent included). */
function locatorTipo(locator: StoredLocator | undefined): string | null {
	const match = ONTOLOGY_SECTION_RE.exec(String(locator?.section_tipo ?? ''));
	if (match === null || locator?.section_id === undefined || locator.section_id === null) {
		return null;
	}
	return `${match[1]}${String(locator.section_id)}`;
}

/**
 * The relation column of one decoded COPY row (SQL NULL → {}). An unparsable
 * column THROWS: a measurement that silently dropped a record's references
 * would report a corrupt package as clean.
 */
function relationColumn(fields: readonly (string | null)[]): Record<string, StoredLocator[]> {
	const raw = fields[RELATION_INDEX] ?? null;
	if (raw === null) return {};
	try {
		return (JSON.parse(raw) as Record<string, StoredLocator[]> | null) ?? {};
	} catch {
		throw new DedaloError('internal.invariant', {
			message: `ontology references: the relation column of ${String(fields[SECTION_TIPO_INDEX])}/${String(fields[SECTION_ID_INDEX])} is not JSON`,
		});
	}
}

/** One COPY line as a dd_ontology-shaped row (null when it is not an ontology record). */
function rowOfCopyLine(line: string): ReferenceRow | null {
	const fields = splitCopyRow(line);
	const match = ONTOLOGY_SECTION_RE.exec(fields[SECTION_TIPO_INDEX] ?? '');
	if (match === null) return null;
	const relation = relationColumn(fields);
	return {
		tipo: `${match[1]}${fields[SECTION_ID_INDEX] ?? ''}`,
		tld: match[1] as string,
		parent: locatorTipo(relation[ONTOLOGY_PARENT]?.[0]),
		model_tipo: locatorTipo(relation[ONTOLOGY_MODEL]?.[0]),
		relations: (relation[ONTOLOGY_CONNECTED_TO] ?? []).map((locator) => ({
			tipo: locatorTipo(locator),
		})),
	};
}

/**
 * Every structural reference of raw `<tld>.copy.gz` lines (MATRIX_COPY_COLUMNS
 * order): parent = ontology15, model = ontology6, relations = ontology10; a
 * locator `{section_tipo: '<tld>0', section_id: n}` is the tipo `<tld><n>`.
 */
export function referencesOfCopyRows(lines: readonly string[]): OntologyReference[] {
	return lines.flatMap((line) => {
		const row = line === '' ? null : rowOfCopyLine(line);
		return row === null ? [] : referencesOfRow(row);
	});
}

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

/**
 * The model tipos that descend from `root` (root included), from model rows'
 * parent links (dd_ontology rows WHERE is_model, or any superset).
 */
export function diffusionModelSet(
	rows: readonly { tipo: string; parent: string | null }[],
	root: string = DIFFUSION_MODEL_ROOT,
): Set<string> {
	const children = childrenByParent(rows);
	const found = new Set<string>([root]);
	const queue = [root];
	for (let tipo = queue.shift(); tipo !== undefined; tipo = queue.shift()) {
		const fresh = (children.get(tipo) ?? []).filter((child) => !found.has(child));
		for (const child of fresh) found.add(child);
		queue.push(...fresh);
	}
	return found;
}

/** parent → child tipos. */
function childrenByParent(
	rows: readonly { tipo: string; parent: string | null }[],
): Map<string, string[]> {
	const children = new Map<string, string[]>();
	for (const row of rows) {
		const key = row.parent ?? '';
		const siblings = children.get(key);
		if (siblings === undefined) children.set(key, [row.tipo]);
		else siblings.push(row.tipo);
	}
	return children;
}

/** The class of one reference (rules in the header). */
export function classifyReference(
	ref: OntologyReference,
	ownTlds: ReadonlySet<string>,
	isDiffusionModel: TipoTest,
): ReferenceClass {
	if (ref.field === 'parent' && !ownTlds.has(tldOf(ref.to))) return 'graft';
	if (ref.field === 'relations' && isDiffusionModelOf(ref, isDiffusionModel)) return 'diffusion';
	return 'dependency';
}

function isDiffusionModelOf(ref: OntologyReference, isDiffusionModel: TipoTest): boolean {
	return ref.fromModel !== null && asPredicate(isDiffusionModel)(ref.fromModel);
}

/** The dependency-class references whose target is NOT present. */
export function danglingDependencies(
	refs: readonly OntologyReference[],
	ownTlds: ReadonlySet<string>,
	isPresent: TipoTest,
	isDiffusionModel: TipoTest,
): OntologyReference[] {
	const present = asPredicate(isPresent);
	return refs.filter(
		(ref) => classifyReference(ref, ownTlds, isDiffusionModel) === 'dependency' && !present(ref.to),
	);
}

/** The TLDs outside `ownTlds` that dependency-class references point into, sorted. */
export function foreignDependencyTlds(
	refs: readonly OntologyReference[],
	ownTlds: ReadonlySet<string>,
	isDiffusionModel: TipoTest,
): string[] {
	const foreign = new Set<string>();
	for (const ref of refs) {
		if (classifyReference(ref, ownTlds, isDiffusionModel) !== 'dependency') continue;
		const tld = tldOf(ref.to);
		if (!ownTlds.has(tld)) foreign.add(tld);
	}
	return [...foreign].sort();
}
