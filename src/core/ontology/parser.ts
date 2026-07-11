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

import { type DdOntologyNode, readDdOntologyRow } from '../db/dd_ontology.ts';
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

/** A stored relation locator (parent, model, connected-to). */
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
 * pointed record. Null when the TLD cannot be resolved.
 */
export async function getTermIdFromLocator(locator: Locator): Promise<string | null> {
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
 * Parse one section record into a DdOntologyNode (or null when the record is not
 * a valid node — PHP returns null when the mandatory TLD is missing).
 */
export async function parseSectionRecordToOntologyNode(
	sectionTipo: string,
	sectionId: number | string,
): Promise<DdOntologyNode | null> {
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
		return null; // PHP: ignore record — TLD is mandatory.
	}
	const tld = String((tldItems[0] as { value?: unknown }).value ?? '');
	if (tld === '') {
		return null;
	}
	const tipo = `${tld}${sectionId}`;

	// Parent — null iff the parent locator points at the ontology main section.
	let parent: string | null = null;
	const parentItems = await resolved(ONTOLOGY_PARENT);
	const parentLocator = parentItems?.[0] as Locator | undefined;
	if (parentLocator !== undefined) {
		parent =
			parentLocator.section_tipo !== ONTOLOGY_MAIN_SECTION
				? await getTermIdFromLocator(parentLocator)
				: null;
	}

	// is_model — CANONICAL ONLY (never overwrite-aware).
	const isModelItems = await getComponentItems(canonicalRecord, ONTOLOGY_IS_MODEL);
	const isModel = isYesLocator(isModelItems);

	// Model — overwrite-aware; model = dd_ontology(model_tipo).term['lg-spa'] STRICT.
	let modelTipo: string | null = null;
	let model: string | null = null;
	const modelItems = await resolved(ONTOLOGY_MODEL);
	const modelLocator = modelItems?.[0] as Locator | undefined;
	if (modelLocator !== undefined) {
		modelTipo = await getTermIdFromLocator(modelLocator);
		if (modelTipo !== null) {
			const modelRow = await readDdOntologyRow(modelTipo);
			model = modelRow?.term?.[STRUCTURE_LANG] ?? null; // strict lg-spa, no fallback
		}
	}

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
			const relTermId = await getTermIdFromLocator(item as Locator);
			if (relTermId === null || relTermId === '') continue;
			relations.push({ tipo: relTermId });
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
	const propertiesOrNull: Record<string, unknown> | null =
		Object.keys(properties).length === 0 ? null : properties;

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

	return {
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
