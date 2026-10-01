/**
 * Ontology parser — PHP ontology::parse_section_record_to_ontology_node
 * (class.ontology.php:1811). Turns ONE matrix_ontology (or matrix_ontology_main)
 * section record into the DdOntologyNode the write layer upserts into dd_ontology.
 *
 * The record is the source of truth (edited in the ontology area); dd_ontology is
 * the derived runtime table. Each field is read off a specific component of the
 * record (ontology5 term, ontology7 tld, …) with these hard-won subtleties, all
 * pinned against live PHP:
 *
 *  - OVERWRITE-AWARENESS: a local override record (localontology0) can supply
 *    replacement data. `resolved(tipo)` = overwrite items ?? canonical items —
 *    BUT only for the overwrite-aware fields. is_model is read CANONICAL-ONLY
 *    (a local override must never change structural model-ness); model/model_tipo
 *    ARE overwrite-aware (code beats the docblock in PHP).
 *  - parent: null iff the parent locator points at the ontology main section
 *    (ontology35) — the dd1/dd2 roots; otherwise the parent's term-id.
 *  - model: dd_ontology(model_tipo).term['lg-spa'] STRICT — no lang fallback.
 *  - is_translatable: defaults TRUE when the component is missing.
 *  - order_number / properties: `(int)` cast / empty→SQL NULL (never {}).
 *  - propiedades (v5 legacy): the value re-encoded via phpPrettyJsonEncode so the
 *    stored TEXT is byte-identical to PHP json_encode(..., JSON_PRETTY_PRINT).
 *
 * Only db/dd_ontology.ts, db/matrix*.ts, resolver.ts and resolve/component_data
 * are called here — plus one direct read-only jsonb probe for the overwrite scan
 * (a related-search that no matrix helper expresses), parameterized + tipo-gated.
 *
 * LEDGER: the request_config validate-on-save warning (PHP :1973, non-blocking)
 * is not reproduced — it only logs; it never changes the parsed node.
 */

import { isValidTipo } from '../concepts/ontology.ts';
import {
	type DdOntologyNode,
	ddOntologyIdentifierViolations,
	readDdOntologyRow,
} from '../db/dd_ontology.ts';
import { type MatrixRecord, readMatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { readComponentItems } from '../resolve/component_data.ts';
import {
	ONTOLOGY_CONNECTED_TO,
	ONTOLOGY_CSS,
	ONTOLOGY_IS_MODEL,
	ONTOLOGY_MAIN_SECTION,
	ONTOLOGY_MODEL,
	ONTOLOGY_ORDER,
	ONTOLOGY_PARENT,
	ONTOLOGY_PROPERTIES,
	ONTOLOGY_PROPIEDADES_V5,
	ONTOLOGY_SOURCE,
	ONTOLOGY_TERM,
	ONTOLOGY_TLD,
	ONTOLOGY_TRANSLATABLE,
	SI_NO_YES,
	STRUCTURE_LANG,
} from './ontology_tipos.ts';
import { getMatrixTableFromTipo, getModelByTipo } from './resolver.ts';
import { getTldFromTipo } from './tld.ts';

/**
 * A stored relation locator (parent, model, connected-to).
 *
 * KEPT UNION (WC-2026-08-10-section-id-int-canonical): these come off the
 * ontology records' RAW jsonb relation column — pre-sweep installs still hold
 * the string form, and the id is only ever consumed as text (`<tld><id>` term
 * ids) or through a tolerant Number(), never re-persisted as an address.
 */
interface Locator {
	section_tipo?: string;
	section_id?: string | number;
	[extra: string]: unknown;
}

/**
 * Read the raw items of one component off a matrix record (PHP
 * get_node_component_data). Resolves the component's model from the ontology,
 * then reads its slice of the typed jsonb column. Returns null when absent/empty
 * (PHP `empty()`), so the `?? ` fallbacks below behave like PHP's.
 */
async function getComponentItems(
	record: MatrixRecord | null,
	componentTipo: string,
): Promise<unknown[] | null> {
	if (record === null) return null;
	const model = await getModelByTipo(componentTipo);
	if (model === null) return null;
	const items = readComponentItems(record, componentTipo, model);
	return items !== null && items.length > 0 ? items : null;
}

/**
 * PHP get_overwrite (:3268): find the localontology0 record that OVERRIDES this
 * node, or null. Returns null for: localontology0 itself; a canonical node that
 * is already a model (models are never overridden); no matching override.
 *
 * The match is PHP's related-search — a localontology0 record whose relation
 * column points at (section_tipo, section_id). Expressed as one parameterized
 * jsonb probe (no matrix helper models a related-search); the target coords are
 * bound, the table is a fixed identifier.
 */
export async function getOverwriteLocator(
	sectionTipo: string,
	sectionId: number | string,
): Promise<Locator | null> {
	const LOCAL_SECTION = 'localontology0';
	if (sectionTipo === LOCAL_SECTION) {
		return null;
	}
	// Model protection: an existing model node is never overwritten.
	const tld = getTldFromTipo(sectionTipo);
	if (tld !== null) {
		const canonicalNode = await readDdOntologyRow(`${tld}${sectionId}`);
		if (canonicalNode?.is_model === true) {
			return null;
		}
	}
	// Scan localontology0 records for a relation locator pointing at the node.
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "matrix_ontology"
		 WHERE section_tipo = $1
		   AND EXISTS (
		       SELECT 1
		       FROM jsonb_each(COALESCE(relation, '{}'::jsonb)) AS kv(key, val),
		            jsonb_array_elements(CASE WHEN jsonb_typeof(val) = 'array' THEN val ELSE '[]'::jsonb END) AS loc
		       WHERE loc->>'section_tipo' = $2 AND loc->>'section_id' = $3
		   )
		 LIMIT 1`,
		[LOCAL_SECTION, sectionTipo, String(sectionId)],
	)) as { section_id: number }[];
	const row = rows[0];
	if (row === undefined) {
		return null;
	}
	return { section_tipo: LOCAL_SECTION, section_id: Number(row.section_id) };
}

/**
 * PHP get_term_id_from_locator (:2207): the locator's canonical term-id
 * (`<tld><section_id>`). Fast path: TLD from the section_tipo string. Slow
 * fallback (rare — section_tipo not in `<tld>0` form): read ontology7 off the
 * pointed record. Null when the TLD cannot be resolved — AND (SURF-1) when the
 * composed reference is not a tipo (`isValidTipo`): the same "unresolvable
 * reference → null" rule, extended to a section_id like `'5a'` or `'1 OR'`,
 * which used to compose into `zzm5a` / `zzgs1 OR` and be projected into
 * dd_ontology as an identifier.
 */
export async function getTermIdFromLocator(locator: Locator): Promise<string | null> {
	const composed = await composeTermIdFromLocator(locator);
	return composed !== null && isValidTipo(composed) ? composed : null;
}

/**
 * The raw `<tld><section_id>` a locator composes to, BEFORE the grammar check —
 * the parser needs the raw value to REPORT a defective reference (SURF-1);
 * every other caller wants getTermIdFromLocator's checked answer.
 */
async function composeTermIdFromLocator(locator: Locator): Promise<string | null> {
	const sectionTipo = String(locator.section_tipo ?? '');
	const sectionId = locator.section_id;
	if (sectionId === undefined || sectionId === null) return null;

	let tld = getTldFromTipo(sectionTipo);
	if (tld === null || tld === '') {
		// Slow fallback: read the tld component off the pointed record.
		const table = await getMatrixTableFromTipo(sectionTipo);
		if (table === null) return null;
		const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
		const items = await getComponentItems(record, ONTOLOGY_TLD);
		const value = (items?.[0] as { value?: unknown } | undefined)?.value;
		if (value === undefined || value === null || value === '') return null;
		tld = String(value);
	}
	return `${tld}${sectionId}`;
}

/** True when a stored radio-button locator points at the si/no "yes" record (dd64/1). */
function isYesLocator(items: unknown[] | null): boolean {
	const first = items?.[0] as Locator | undefined;
	if (first === undefined) return false;
	return Number(first.section_id) === SI_NO_YES;
}

/**
 * A reference the parser composed from a source record but could NOT project:
 * it breaks the dd_ontology identifier grammar (db/dd_ontology.ts
 * ddOntologyIdentifierViolations — a non-tipo, or longer than its column). The
 * node is still parsed; the defective value is dropped from it (`parent` /
 * `model_tipo` → null, a `relations` entry skipped, `properties.alias_of`
 * deleted — the alias reader then refuses the node as `missing`), and the
 * defect is REPORTED by the caller, never swallowed.
 */
export interface OntologyNodeDefect {
	column: 'parent' | 'model_tipo' | 'relations' | 'alias_of';
	/** The raw value as the record composed it. */
	value: unknown;
}

/** A parsed node plus the references it could not carry (see OntologyNodeDefect). */
export interface ParsedOntologyNode {
	node: DdOntologyNode | null;
	defects: OntologyNodeDefect[];
}

/**
 * Parse one section record into a DdOntologyNode (or null when the record is not
 * a valid node — PHP returns null when the mandatory TLD is missing). Every
 * defect is logged, one warning each; a caller that REPORTS them (the rebuild,
 * ontology_state.ts) uses parseSectionRecordToOntologyNodeWithDefects instead.
 */
export async function parseSectionRecordToOntologyNode(
	sectionTipo: string,
	sectionId: number | string,
): Promise<DdOntologyNode | null> {
	const { node, defects } = await parseSectionRecordToOntologyNodeWithDefects(
		sectionTipo,
		sectionId,
	);
	for (const defect of defects) {
		console.warn(
			`[ontology_parser] ${sectionTipo}/${sectionId}: ${defect.column} ${(JSON.stringify(defect.value) ?? '').slice(0, 64)} is not a valid identifier — dropped from node ${JSON.stringify(node?.tipo ?? null)} (SURF-1; fix the source record)`,
		);
	}
	return node;
}

/** The identifier-grammar verdict of one reference value for its dd_ontology column. */
function referenceIsValid(column: 'parent' | 'model_tipo', value: string): boolean {
	return ddOntologyIdentifierViolations({ tipo: 'dd1', [column]: value }).length === 0;
}

/** Overwrite-aware component items of the record being parsed. */
type ResolvedItems = (componentTipo: string) => Promise<unknown[] | null>;

/** A composed reference, or null + a defect when it breaks its column's grammar. */
async function projectReference(
	column: 'parent' | 'model_tipo',
	locator: Locator,
	defects: OntologyNodeDefect[],
): Promise<string | null> {
	const composed = await composeTermIdFromLocator(locator);
	if (composed === null || referenceIsValid(column, composed)) return composed;
	defects.push({ column, value: composed });
	return null;
}

/** One related-term entry: null when it composes to nothing, or (a defect) when it breaks the tipo grammar. */
async function projectRelation(
	locator: Locator,
	defects: OntologyNodeDefect[],
): Promise<{ tipo: string } | null> {
	const relTermId = await composeTermIdFromLocator(locator);
	if (relTermId === null || relTermId === '') return null;
	if (isValidTipo(relTermId)) return { tipo: relTermId };
	defects.push({ column: 'relations', value: relTermId });
	return null;
}

/** The node's parent: null at the ontology main section, or when invalid (a defect). */
async function projectParent(
	resolved: ResolvedItems,
	defects: OntologyNodeDefect[],
): Promise<string | null> {
	const parentLocator = (await resolved(ONTOLOGY_PARENT))?.[0] as Locator | undefined;
	if (parentLocator === undefined || parentLocator.section_tipo === ONTOLOGY_MAIN_SECTION) {
		return null;
	}
	return projectReference('parent', parentLocator, defects);
}

/** model_tipo + model (= dd_ontology(model_tipo).term['lg-spa'] STRICT, no lang fallback). */
async function projectModel(
	resolved: ResolvedItems,
	defects: OntologyNodeDefect[],
): Promise<{ modelTipo: string | null; model: string | null }> {
	const modelLocator = (await resolved(ONTOLOGY_MODEL))?.[0] as Locator | undefined;
	if (modelLocator === undefined) return { modelTipo: null, model: null };
	const modelTipo = await projectReference('model_tipo', modelLocator, defects);
	if (modelTipo === null) return { modelTipo, model: null };
	const modelRow = await readDdOntologyRow(modelTipo);
	return { modelTipo, model: modelRow?.term?.[STRUCTURE_LANG] ?? null };
}

/**
 * The properties column (empty → null). properties.alias_of is an identifier too
 * (the alias reader, the search re-key): a defective one is dropped, never projected.
 */
function projectProperties(
	properties: Record<string, unknown>,
	defects: OntologyNodeDefect[],
): Record<string, unknown> | null {
	let projected = properties;
	if (
		Object.hasOwn(properties, 'alias_of') &&
		ddOntologyIdentifierViolations({ tipo: 'dd1', properties }).length > 0
	) {
		defects.push({ column: 'alias_of', value: properties.alias_of });
		const { alias_of: _defective, ...rest } = properties;
		projected = rest;
	}
	return Object.keys(projected).length === 0 ? null : projected;
}

/**
 * parseSectionRecordToOntologyNode, returning the defects instead of logging
 * them (SURF-1 W5). The node never carries a reference that breaks the
 * identifier grammar — see OntologyNodeDefect.
 */
export async function parseSectionRecordToOntologyNodeWithDefects(
	sectionTipo: string,
	sectionId: number | string,
): Promise<ParsedOntologyNode> {
	const defects: OntologyNodeDefect[] = [];
	// canonical record
	const canonicalTable = await getMatrixTableFromTipo(sectionTipo);
	const canonicalRecord =
		canonicalTable === null
			? null
			: await readMatrixRecord(canonicalTable, sectionTipo, Number(sectionId));

	// overwrite record (localontology0 override, when present)
	const overwriteLocator = await getOverwriteLocator(sectionTipo, sectionId);
	let overwriteRecord: MatrixRecord | null = null;
	if (overwriteLocator !== null) {
		const overwriteTable = await getMatrixTableFromTipo(String(overwriteLocator.section_tipo));
		overwriteRecord =
			overwriteTable === null
				? null
				: await readMatrixRecord(
						overwriteTable,
						String(overwriteLocator.section_tipo),
						Number(overwriteLocator.section_id),
					);
	}

	/** overwrite items ?? canonical items (PHP $get_resolved_data). */
	const resolved = async (componentTipo: string): Promise<unknown[] | null> => {
		if (overwriteRecord !== null) {
			const fromOverwrite = await getComponentItems(overwriteRecord, componentTipo);
			if (fromOverwrite !== null) return fromOverwrite;
		}
		return getComponentItems(canonicalRecord, componentTipo);
	};

	// TLD (mandatory)
	const tldItems = await resolved(ONTOLOGY_TLD);
	if (tldItems === null) {
		return { node: null, defects }; // PHP: ignore record — TLD is mandatory.
	}
	const tld = String((tldItems[0] as { value?: unknown }).value ?? '');
	if (tld === '') {
		return { node: null, defects };
	}
	const tipo = `${tld}${sectionId}`;

	// Parent — null iff the parent locator points at the ontology main section.
	const parent = await projectParent(resolved, defects);

	// is_model — CANONICAL ONLY (never overwrite-aware).
	const isModelItems = await getComponentItems(canonicalRecord, ONTOLOGY_IS_MODEL);
	const isModel = isYesLocator(isModelItems);

	// Model — overwrite-aware; model = dd_ontology(model_tipo).term['lg-spa'] STRICT.
	const { modelTipo, model } = await projectModel(resolved, defects);

	// Order — canonical only, (int) cast, empty → null.
	let orderNumber: number | null = null;
	const orderItems = await getComponentItems(canonicalRecord, ONTOLOGY_ORDER);
	const orderValue = (orderItems?.[0] as { value?: unknown } | undefined)?.value;
	if (orderValue !== undefined && orderValue !== null && orderValue !== '') {
		orderNumber = Math.trunc(Number(orderValue));
	}

	// Translatable — default TRUE when missing (overwrite-aware).
	const resolveTranslatable = async (record: MatrixRecord | null): Promise<boolean> => {
		const items = await getComponentItems(record, ONTOLOGY_TRANSLATABLE);
		if (items === null) return true; // PHP default
		return isYesLocator(items);
	};
	const isTranslatable =
		overwriteRecord !== null
			? await resolveTranslatable(overwriteRecord)
			: await resolveTranslatable(canonicalRecord);

	// is_main
	const isMain = tipo === `${tld}0`;

	// Relations — overwrite-aware, but overwrite only overrides when it HAS them.
	const resolveRelations = async (
		record: MatrixRecord | null,
	): Promise<{ tipo: string }[] | null> => {
		const items = await getComponentItems(record, ONTOLOGY_CONNECTED_TO);
		if (items === null) return null;
		const relations: { tipo: string }[] = [];
		for (const item of items) {
			const relation = await projectRelation(item as Locator, defects);
			if (relation !== null) relations.push(relation);
		}
		return relations.length > 0 ? relations : null;
	};
	let relations = overwriteRecord !== null ? await resolveRelations(overwriteRecord) : null;
	relations = relations ?? (await resolveRelations(canonicalRecord));

	// Propiedades (v5 legacy) — pretty-printed TEXT, empty → null.
	let propiedades: string | null = null;
	const propV5Items = await resolved(ONTOLOGY_PROPIEDADES_V5);
	const propV5Value = (propV5Items?.[0] as { value?: unknown } | undefined)?.value;
	if (propV5Value !== undefined && propV5Value !== null && propV5Value !== '') {
		propiedades = phpPrettyJsonEncode(propV5Value);
	}

	// Properties (ontology18) + .css (ontology16) + .source (ontology17), empty→null.
	const propItems = await resolved(ONTOLOGY_PROPERTIES);
	const propertiesValue = (propItems?.[0] as { value?: unknown } | undefined)?.value;
	const properties: Record<string, unknown> =
		propertiesValue !== undefined &&
		propertiesValue !== null &&
		typeof propertiesValue === 'object' &&
		!Array.isArray(propertiesValue)
			? { ...(propertiesValue as Record<string, unknown>) }
			: {};
	const cssItems = await resolved(ONTOLOGY_CSS);
	const cssValue = (cssItems?.[0] as { value?: unknown } | undefined)?.value;
	if (cssItems !== null && cssValue !== undefined) {
		properties.css = cssValue;
	}
	const sourceItems = await resolved(ONTOLOGY_SOURCE);
	const sourceValue = (sourceItems?.[0] as { value?: unknown } | undefined)?.value;
	if (sourceItems !== null && sourceValue !== undefined) {
		properties.source = sourceValue;
	}
	const propertiesOrNull = projectProperties(properties, defects);

	// Term — all langs (overwrite-aware, only overrides when it HAS a term).
	const resolveTerm = async (
		record: MatrixRecord | null,
	): Promise<Record<string, string> | null> => {
		const items = await getComponentItems(record, ONTOLOGY_TERM);
		if (items === null) return null;
		const term: Record<string, string> = {};
		for (const item of items) {
			const literal = item as { lang?: string; value?: unknown };
			if (typeof literal.lang === 'string') {
				term[literal.lang] = String(literal.value ?? '');
			}
		}
		return term;
	};
	let term = overwriteRecord !== null ? await resolveTerm(overwriteRecord) : null;
	term = term ?? (await resolveTerm(canonicalRecord));

	const node: DdOntologyNode = {
		tipo,
		parent,
		term,
		model,
		order_number: orderNumber,
		relations,
		tld,
		properties: propertiesOrNull,
		model_tipo: modelTipo,
		is_model: isModel,
		is_translatable: isTranslatable,
		is_main: isMain,
		propiedades,
	};
	return { node, defects };
}

/**
 * Encode a value byte-identically to PHP `json_encode($v, JSON_PRETTY_PRINT)`
 * (used for the dd_ontology.propiedades TEXT column). PHP's default flags — with
 * ONLY JSON_PRETTY_PRINT set — escape forward slashes (`\/`) and all non-ASCII
 * as `\uXXXX`, indent 4 spaces, and put `": "` after object keys. Empty
 * object/array render as `{}` / `[]`.
 *
 * LEDGER: float formatting uses JS default (`String(n)`); a PHP `x.0` float would
 * differ, but v5 propiedades are legacy string/object blobs — no floats observed.
 */
export function phpPrettyJsonEncode(value: unknown): string {
	return encodePretty(value, 0);
}

function encodePretty(value: unknown, depth: number): string {
	if (value === null || value === undefined) return 'null';
	switch (typeof value) {
		case 'boolean':
			return value ? 'true' : 'false';
		case 'number':
			return Number.isFinite(value) ? String(value) : 'null';
		case 'string':
			return encodePhpJsonString(value);
		case 'object': {
			const indent = '    '.repeat(depth + 1);
			const closeIndent = '    '.repeat(depth);
			if (Array.isArray(value)) {
				if (value.length === 0) return '[]';
				const parts = value.map((item) => indent + encodePretty(item, depth + 1));
				return `[\n${parts.join(',\n')}\n${closeIndent}]`;
			}
			const entries = Object.entries(value as Record<string, unknown>).filter(
				([, entry]) => entry !== undefined,
			);
			if (entries.length === 0) return '{}';
			const parts = entries.map(
				([key, entry]) => `${indent}${encodePhpJsonString(key)}: ${encodePretty(entry, depth + 1)}`,
			);
			return `{\n${parts.join(',\n')}\n${closeIndent}}`;
		}
		default:
			return 'null';
	}
}

/** PHP json_encode string escaping (default flags): escapes ", \, /, controls, non-ASCII. */
function encodePhpJsonString(text: string): string {
	let out = '"';
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		const char = text[index] as string;
		switch (char) {
			case '"':
				out += '\\"';
				break;
			case '\\':
				out += '\\\\';
				break;
			case '/':
				out += '\\/';
				break;
			case '\b':
				out += '\\b';
				break;
			case '\f':
				out += '\\f';
				break;
			case '\n':
				out += '\\n';
				break;
			case '\r':
				out += '\\r';
				break;
			case '\t':
				out += '\\t';
				break;
			default:
				if (code < 0x20 || code >= 0x80) {
					out += `\\u${code.toString(16).padStart(4, '0')}`;
				} else {
					out += char;
				}
		}
	}
	return `${out}"`;
}
