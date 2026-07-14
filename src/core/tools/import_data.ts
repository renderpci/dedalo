/**
 * Import data engine (PHP component_common::conform_import_data +
 * unwrap_dedalo_data). Turns a CSV cell into a v7 component dato.
 *
 * TWO PATHS, and the difference is the whole design:
 *
 *   - a cell that IS json is the STORED DATO coming back (a `dedalo_raw` export
 *     wraps each dato as {"dedalo_data": <dato>}). Re-importing it must reproduce
 *     the dato EXACTLY — the round-trip invariant. This path is mostly
 *     model-agnostic, so it works for every component model, ported or not.
 *   - a cell that is NOT json is HUMAN input ('12-03-1998', '1.234,56',
 *     '41.38, 2.17', '273,418'). Parsing it is model-specific: each model
 *     declares an `importConform` facet (tools/import_conform.ts) and that facet
 *     owns the cell.
 *
 * Without a facet a flat cell is REFUSED (a loud error on the row), never
 * written. This matters: a refused cell leaves the record's existing value
 * intact, whereas "conform to null and save" would CLEAR it — a silent
 * destruction of data the CSV never meant to touch. PHP is laxer here (it stores
 * the raw string and corrupts the column); we do not copy that.
 */

import { allComponentModels, getImportConformId } from '../components/registry.ts';
import { IMPORT_CONFORM, type ImportConformContext, type JsonCell } from './import_conform.ts';

/**
 * PHP component_common::$components_using_value_property (bare scalar →
 * {value}). DERIVED from the descriptor facet `importValueProperty` (S2-26)
 * — a new model opts in by declaring the facet, never by editing this file.
 * CANONICAL names only (PHP's list is canonical; legacy aliases resolve to
 * their canonical model before import conforming). Membership is pinned by
 * test/unit/descriptor_completeness_tripwire.test.ts.
 */
export const VALUE_PROPERTY_MODELS: ReadonlySet<string> = new Set(
	allComponentModels()
		.filter((descriptor) => descriptor.importValueProperty === true)
		.map((descriptor) => descriptor.model),
);

/**
 * PHP json_handler::is_json (:190): TRUE only when the string DECODES to an array
 * or an object. Not a first-character sniff — '[Ac]' starts with '[' and is not
 * json, and PHP therefore treats it as literal text. (Our previous first-char
 * check called it a JSON decode failure and rejected the cell.) Bare scalars
 * ('5', 'true', 'null') are likewise NOT json here, which is why the string
 * branch ever sees a number at all.
 */
export function isJson(value: string): boolean {
	const trimmed = value.trimStart();
	if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return false;
	try {
		const decoded = JSON.parse(value);
		return decoded !== null && typeof decoded === 'object';
	} catch {
		return false;
	}
}

/** Decode a cell once: {isJson, decoded} — the shape every facet receives. */
export function decodeCell(value: string): JsonCell {
	if (!isJson(value)) return { isJson: false, decoded: null };
	return { isJson: true, decoded: JSON.parse(value) as unknown };
}

export interface UnwrapResult {
	/** The unwrapped inner dato re-encoded as a JSON string (or '' when empty). */
	value: string;
	/** Whether the {"dedalo_data":…} wrapper was recognized (its SOLE property). */
	wrapped: boolean;
	/** The dataframe array when the inner used the {dato, dataframe} envelope. */
	dataframe: unknown[] | null;
	/**
	 * False when the envelope carried ONLY frames ({"dataframe":[…]} with no
	 * `dato`): the component's own data must then be left UNTOUCHED — only the
	 * frames are written. Distinct from an empty dato, which CLEARS.
	 */
	hasDato: boolean;
}

/**
 * Strip the dedalo_data wrapper (PHP unwrap_dedalo_data). Recognized only when
 * `dedalo_data` is the SOLE property — {"dedalo_data":1,"other":2} is a legit
 * component_json value and passes through unchanged.
 */
export function unwrapDedaloData(importValue: string): UnwrapResult {
	const result: UnwrapResult = {
		value: importValue,
		wrapped: false,
		dataframe: null,
		hasDato: true,
	};
	if (!isJson(importValue)) return result;
	let decoded: unknown;
	try {
		decoded = JSON.parse(importValue);
	} catch {
		return result;
	}
	if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) return result;
	const keys = Object.keys(decoded);
	if (keys.length !== 1 || keys[0] !== 'dedalo_data') return result;

	let inner = (decoded as { dedalo_data: unknown }).dedalo_data;
	// The {dato, dataframe} envelope (dataframe-paired components).
	if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
		const innerKeys = Object.keys(inner);
		if (
			innerKeys.includes('dataframe') &&
			innerKeys.every((k) => k === 'dato' || k === 'dataframe')
		) {
			const env = inner as { dato?: unknown; dataframe?: unknown };
			result.dataframe = Array.isArray(env.dataframe) ? env.dataframe : null;
			result.hasDato = Object.hasOwn(env, 'dato');
			inner = env.dato ?? null;
		}
	}
	if (inner === null) {
		result.value = '';
		result.wrapped = false;
	} else {
		// PHP JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES — JS JSON.stringify
		// already leaves unicode + slashes unescaped, matching byte-for-byte.
		result.value = JSON.stringify(inner);
		result.wrapped = true;
	}
	return result;
}

/** A failed/warning report object (the report's ImportRowIssue is built from it). */
export interface ConformFailure {
	section_id: number;
	data: unknown;
	component_tipo: string;
	msg: string;
}

export interface ConformResult {
	/** The conformed dato: array of v7 items | lang-keyed object | null (clear). */
	result: unknown;
	errors: ConformFailure[];
	/** Accepted, but flagged for a human (today: only component_select_lang). */
	warnings: ConformFailure[];
	msg: string;
}

export interface ConformInput {
	model: string;
	importValue: string;
	columnName: string;
	/** The section being imported INTO (a relation resolves its targets against it). */
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
	/** The component's save lang ('lg-nolan' when not translatable). */
	lang?: string;
	/** True when the cell came out of a {"dedalo_data":…} wrapper. */
	wrapped?: boolean;
	/** The column map's decimal separator (component_number). */
	decimal?: string;
}

/**
 * Conform one CSV cell to a component dato.
 *
 * Order: the model's `importConform` facet owns the cell when it has one (it
 * handles BOTH its json and its flat forms — the model particularities live
 * there, not here). Otherwise: a json cell round-trips through the generic
 * normalizer, an empty cell clears, and a flat cell is REFUSED.
 */
export async function conformImportData(input: ConformInput): Promise<ConformResult> {
	const json = decodeCell(input.importValue);
	const conformId = getImportConformId(input.model);

	if (conformId !== undefined) {
		const ctx: ImportConformContext = {
			model: input.model,
			componentTipo: input.componentTipo,
			sectionTipo: input.sectionTipo,
			sectionId: input.sectionId,
			columnName: input.columnName,
			lang: input.lang ?? 'lg-nolan',
			wrapped: input.wrapped ?? false,
			decimal: input.decimal,
		};
		return IMPORT_CONFORM[conformId](input.importValue, json, ctx);
	}

	// --- no facet: the generic path -----------------------------------------
	const isValueProperty = VALUE_PROPERTY_MODELS.has(input.model);
	const failure = (msg: string): ConformFailure => ({
		section_id: input.sectionId,
		data: input.importValue,
		component_tipo: input.componentTipo,
		msg,
	});

	if (json.isJson) {
		const normalizeItems = (items: unknown[]): unknown[] =>
			items.map((v) =>
				(typeof v !== 'object' || v === null) && isValueProperty ? { value: v } : v,
			);
		let value: unknown = json.decoded;
		if (Array.isArray(value)) {
			value = normalizeItems(value);
		} else if (value !== null && typeof value === 'object') {
			const keys = Object.keys(value);
			const firstKey = keys[0];
			if (firstKey?.startsWith('lg-')) {
				const obj = value as Record<string, unknown>;
				for (const lang of keys) {
					const langValue = obj[lang];
					obj[lang] = normalizeItems(Array.isArray(langValue) ? langValue : [langValue]);
				}
			} else {
				const item = isValueProperty && !('value' in value) ? { value } : value;
				value = [item];
			}
		}
		return { result: value, errors: [], warnings: [], msg: 'OK' };
	}

	// '0' is a value, not an absence (PHP's one empty() exception).
	if (input.importValue === '') {
		return { result: null, errors: [], warnings: [], msg: 'OK' };
	}

	if (isValueProperty) {
		return {
			result: [{ value: input.importValue }],
			errors: [],
			warnings: [],
			msg: 'OK',
		};
	}

	// A flat cell for a model with no flat form. Writing it would either store a
	// raw string in a structured column (PHP's behavior — corruption) or flatten
	// to [] and CLEAR the record's existing value. Refuse, loudly and per-cell.
	return {
		result: null,
		errors: [
			failure(
				`IGNORED: '${input.model}' has no flat-value import form — the cell was NOT written, and the existing value was left untouched`,
			),
		],
		warnings: [],
		msg: 'Error. Request failed',
	};
}
