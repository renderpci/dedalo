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
 *  - OVERWRITE-AWARENESS (WC-2026-10-01-ontology-overwrite-scoped): a
 *    localontology0 record linked to this node by ONTOLOGY_OVERWRITE (ontology42)
 *    can supply replacement data. `resolved(tipo)` = overwrite items ?? canonical
 *    items — BUT only for the overwrite-aware fields. CANONICAL-ONLY (structure
 *    and stored-data shape, never changed by a local override): tld, is_model,
 *    is_translatable, order. term: merged PER LANG. properties: per TOP-LEVEL
 *    KEY (css/source included) — a stated key replaces whole, `null` in the
 *    override's ontology18 removes it. model/model_tipo, parent, relations,
 *    propiedades: override replaces when present.
 *    A localontology0 record is never a node itself — parsing one is refused.
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
import { DedaloError } from '../errors/dedalo_error.ts';
import { readComponentItems } from '../resolve/component_data.ts';
import {
	ONTOLOGY_CONNECTED_TO,
	ONTOLOGY_CSS,
	ONTOLOGY_IS_MODEL,
	ONTOLOGY_MAIN_SECTION,
	ONTOLOGY_MODEL,
	ONTOLOGY_ORDER,
	ONTOLOGY_OVERWRITE,
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
import { getTldFromTipo, LOCAL_ONTOLOGY_SECTION } from './tld.ts';

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
 * node, or null. Returns null for: localontology0 itself; a node whose CANONICAL
 * record says is_model (models are never overridden); no matching override.
 *
 * The link is ONE component, ONTOLOGY_OVERWRITE (ontology42). PHP matched a
 * locator in ANY relation of the local record, so an override's own parent
 * (ontology15) or relations (ontology10) made it the override of THAT node too —
 * measured: the parent node took the override's term and became its own parent
 * (WC-2026-10-01-ontology-overwrite-scoped). Model protection reads the canonical
 * record's ontology30, not dd_ontology: a model node not yet projected would
 * otherwise be overridable on its first parse. Several overrides of one node →
 * the lowest section_id wins (deterministic; PHP's LIMIT 1 had no order).
 */
export async function getOverwriteLocator(
	sectionTipo: string,
	sectionId: number | string,
	canonicalRecord?: MatrixRecord | null,
): Promise<Locator | null> {
	if (sectionTipo === LOCAL_ONTOLOGY_SECTION) {
		return null;
	}
	// Model protection: an existing model node is never overwritten.
	let record = canonicalRecord;
	if (record === undefined) {
		const table = await getMatrixTableFromTipo(sectionTipo);
		record = table === null ? null : await readMatrixRecord(table, sectionTipo, Number(sectionId));
	}
	if (isYesLocator(await getComponentItems(record, ONTOLOGY_IS_MODEL))) {
		return null;
	}
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "matrix_ontology"
		 WHERE section_tipo = $1
		   AND EXISTS (
		       SELECT 1
		       FROM jsonb_array_elements(
		            CASE WHEN jsonb_typeof(relation->$4) = 'array' THEN relation->$4 ELSE '[]'::jsonb END
		       ) AS loc
		       WHERE loc->>'section_tipo' = $2 AND loc->>'section_id' = $3
		   )
		 ORDER BY section_id ASC
		 LIMIT 1`,
		[LOCAL_ONTOLOGY_SECTION, sectionTipo, String(sectionId), ONTOLOGY_OVERWRITE],
	)) as { section_id: number }[];
	const row = rows[0];
	if (row === undefined) {
		return null;
	}
	return { section_tipo: LOCAL_ONTOLOGY_SECTION, section_id: Number(row.section_id) };
}

/** True for a plain JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The properties one record STATES; `undefined` = the component is empty. */
interface PropertySet {
	/** ontology18's keys (a non-object value states nothing). */
	keys: Record<string, unknown>;
	css: unknown;
	source: unknown;
}

async function readPropertySet(record: MatrixRecord | null): Promise<PropertySet> {
	const valueOf = async (tipo: string): Promise<unknown> =>
		((await getComponentItems(record, tipo))?.[0] as { value?: unknown } | undefined)?.value;
	const keys = await valueOf(ONTOLOGY_PROPERTIES);
	return {
		keys: isPlainObject(keys) ? { ...keys } : {},
		css: await valueOf(ONTOLOGY_CSS),
		source: await valueOf(ONTOLOGY_SOURCE),
	};
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
	// An override record is not a node: its tipo would be `<its tld><its own id>`,
	// a canonical-looking node that does not exist (measured: localontology0/1 →
	// `localontology1`). Its data reaches dd_ontology only through the node it
	// overrides. Callers skip the section (ontology_state, setRecordsInDdOntology);
	// this is the backstop.
	if (sectionTipo === LOCAL_ONTOLOGY_SECTION) {
		throw new DedaloError('ontology.invalid_node', {
			message: `parseSectionRecordToOntologyNode: '${LOCAL_ONTOLOGY_SECTION}/${sectionId}' is an override record, not a node — parse the node it overrides (${ONTOLOGY_OVERWRITE}) instead`,
			coordinates: { section_tipo: sectionTipo, section_id: String(sectionId) },
		});
	}

	// canonical record
	const canonicalTable = await getMatrixTableFromTipo(sectionTipo);
	const canonicalRecord =
		canonicalTable === null
			? null
			: await readMatrixRecord(canonicalTable, sectionTipo, Number(sectionId));

	// overwrite record (localontology0 override, when present)
	const overwriteLocator = await getOverwriteLocator(sectionTipo, sectionId, canonicalRecord);
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

	// TLD (mandatory) — CANONICAL ONLY. The tld IS the node's identity
	// (`<tld><section_id>`); an override's own ontology7 (`localontology` by the
	// create-door default) would re-home the node into another namespace.
	const tldItems = await getComponentItems(canonicalRecord, ONTOLOGY_TLD);
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

	// Translatable — default TRUE when missing. CANONICAL ONLY: it fixes how the
	// component's data is STORED (per lang vs lg-nolan), so a local flip would
	// orphan existing values. (PHP read the override, whose create-door default
	// is YES — every override silently made its node translatable.)
	const translatableItems = await getComponentItems(canonicalRecord, ONTOLOGY_TRANSLATABLE);
	const isTranslatable = translatableItems === null ? true : isYesLocator(translatableItems);

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
	const canonicalSet = await readPropertySet(canonicalRecord);
	const properties: Record<string, unknown> = { ...canonicalSet.keys };
	if (canonicalSet.css !== undefined) properties.css = canonicalSet.css;
	if (canonicalSet.source !== undefined) properties.source = canonicalSet.source;
	// Override: the TOP-LEVEL KEY is the unit. Each key the override states
	// replaces the canonical key WHOLE (no deep merge — css included); unstated
	// keys are kept; a key stated as `null` in the override's ontology18 REMOVES
	// it. Removing css/source in ontology18 while filling ontology16/17 is a
	// contradiction: refused, never resolved by picking a winner.
	if (overwriteRecord !== null) {
		const overwriteSet = await readPropertySet(overwriteRecord);
		const stated: Record<string, unknown> = { ...overwriteSet.keys };
		for (const [key, value] of [
			['css', overwriteSet.css],
			['source', overwriteSet.source],
		] as const) {
			if (value === undefined) continue;
			if (stated[key] === null) {
				throw new DedaloError('ontology.invalid_node', {
					message: `parseSectionRecordToOntologyNode: override ${String(overwriteLocator?.section_tipo)}/${String(overwriteLocator?.section_id)} of ${sectionTipo}/${sectionId} both removes '${key}' (null in ${ONTOLOGY_PROPERTIES}) and fills it (${key === 'css' ? ONTOLOGY_CSS : ONTOLOGY_SOURCE})`,
					coordinates: { section_tipo: sectionTipo, section_id: String(sectionId) },
				});
			}
			stated[key] = value;
		}
		for (const [key, value] of Object.entries(stated)) {
			if (value === null) delete properties[key];
			else properties[key] = value;
		}
	}
	const propertiesOrNull: Record<string, unknown> | null =
		Object.keys(properties).length === 0 ? null : properties;

	// Term — all langs. MERGED per lang with an override: a lang the override
	// fills wins, every other lang keeps the canonical value (an override naming
	// only lg-spa must not erase the node's other translations). Empty values in
	// the override do not count as filled.
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
	let term = await resolveTerm(canonicalRecord);
	const overwriteTerm = overwriteRecord !== null ? await resolveTerm(overwriteRecord) : null;
	if (overwriteTerm !== null) {
		const filled = Object.fromEntries(
			Object.entries(overwriteTerm).filter(([, value]) => value !== ''),
		);
		if (Object.keys(filled).length > 0) term = { ...(term ?? {}), ...filled };
	}

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
