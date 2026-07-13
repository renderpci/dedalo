/**
 * PER-MODEL IMPORT CONFORM — the parsers that turn a HUMAN-authored CSV cell
 * into a v7 component dato.
 *
 * PHP implements these as `conform_import_data()` overrides on ten component
 * classes. Here they are named-as-DATA facets: a descriptor declares
 * `importConform: 'date'` and the id resolves to an entry in IMPORT_CONFORM
 * below (the same shape as `emitHook` / `resolveData`), so descriptors import no
 * engine module and the import SCC stays at 1.
 *
 * THE DIVISION OF LABOUR (import_data.ts owns the first half):
 *   1. unwrapDedaloData strips the {"dedalo_data": …} export envelope;
 *   2. a cell that IS json (PHP is_json — decode-verified, see isJson) takes the
 *      MODEL-AGNOSTIC round-trip path in most models: the stored dato comes back
 *      exactly as it was exported;
 *   3. a cell that is NOT json is human input, and THAT is what these parsers
 *      are for — '12-03-1998', '1.234,56', '41.38, 2.17', 'lg-spa, lg-eng',
 *      '273,418'. Without a facet such a cell is REFUSED (never written as a
 *      silent clear) — see conformImportData's fallback.
 *
 * Each facet is async because several must consult the ontology (a relation's
 * target section, a number's int/float type) or the DB (a lang code's record).
 *
 * WARNINGS vs ERRORS: an error REJECTS the cell (the component keeps its old
 * value, the row is reported in `failed`); a warning ACCEPTS it and flags it
 * (`warnings`). In the whole PHP tree exactly ONE conform produces a warning —
 * component_select_lang, for a lang that exists but is not a project lang. That
 * asymmetry is deliberate, not an omission.
 */

import type { ImportConformId } from '../components/types.ts';
import type { ConformFailure, ConformResult } from './import_data.ts';

/** Context a facet needs beyond the cell itself (resolved by the caller). */
export interface ImportConformContext {
	model: string;
	componentTipo: string;
	/** The section being imported INTO — a relation's target set is resolved against it. */
	sectionTipo: string;
	sectionId: number;
	/** The FULL csv header cell — carries the suffix (tipo_dmy, tipo_<section_tipo>). */
	columnName: string;
	/** The component's save lang ('lg-nolan' when the component is not translatable). */
	lang: string;
	/** True when the cell arrived inside a {"dedalo_data":…} wrapper (component_json needs it). */
	wrapped: boolean;
	/** The column map's decimal separator (component_number: ',' or '.'). */
	decimal?: string;
}

/** A cell pre-decoded once by the caller (PHP is_json + json_handler::decode). */
export interface JsonCell {
	isJson: boolean;
	decoded: unknown;
}

export type ImportConformFn = (
	value: string,
	json: JsonCell,
	ctx: ImportConformContext,
) => Promise<ConformResult>;

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

const ok = (result: unknown, warnings: ConformFailure[] = []): ConformResult => ({
	result,
	errors: [],
	warnings,
	msg: 'OK',
});

function issue(ctx: ImportConformContext, msg: string, data: unknown): ConformFailure {
	return { section_id: ctx.sectionId, data, component_tipo: ctx.componentTipo, msg };
}

const fail = (ctx: ImportConformContext, msg: string, data: unknown): ConformResult => ({
	result: null,
	errors: [issue(ctx, msg, data)],
	warnings: [],
	msg: 'Error. Request failed',
});

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** PHP's gettype() names, for the messages that embed them. */
function phpType(value: unknown): string {
	if (value === null) return 'NULL';
	if (Array.isArray(value)) return 'array';
	switch (typeof value) {
		case 'string':
			return 'string';
		case 'number':
			return Number.isInteger(value) ? 'integer' : 'double';
		case 'boolean':
			return 'boolean';
		case 'object':
			return 'object';
		default:
			return 'unknown';
	}
}

/** PHP to_string() for message interpolation: scalars raw, structures as JSON. */
function asText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/**
 * PHP component_common::is_plain_bracket_string (:4891): a literal that LOOKS
 * like a JSON string-array is refused rather than stored as text. Note the
 * asymmetry — '[Ac]' is fine (it is not json and does not look like one).
 */
function isPlainBracketString(value: string): boolean {
	return !(value.startsWith('["') || value.endsWith('"]'));
}

/** The first key of an object, or ''. */
function firstKey(value: Record<string, unknown>): string {
	return Object.keys(value)[0] ?? '';
}

/** Whether an object is lang-keyed ({"lg-eng":[…], …}). */
function isLangKeyed(value: unknown): value is Record<string, unknown> {
	return isObject(value) && firstKey(value).startsWith('lg-');
}

/** PHP empty(): '' and '0' are both empty — callers add the '0' exception where PHP does. */
function isEmptyString(value: string): boolean {
	return value === '';
}

// ---------------------------------------------------------------------------
// component_date (PHP core/component_date :983-1250)
// ---------------------------------------------------------------------------

interface DdDate {
	year?: number;
	month?: number;
	day?: number;
	hour?: number;
	minute?: number;
	second?: number;
}

/**
 * Parse ONE date token into a dd_date. The token's field ORDER comes from the
 * column-name suffix — 'tipo_dmy' / 'tipo_mdy' / anything else = ymd (PHP :1004,
 * the ONLY source of the order: there is no locale sniffing).
 *
 * Separators '-' and '.' normalize to '/'; a leading '/' after that means the
 * year was negative ('-205/05/21'), and '//' restores a negative trailing year
 * ('2000//200' → '2000/-200').
 */
function parseDateToken(token: string, order: string): { date: DdDate; error: string | null } {
	let text = token.replace(/[-.]/g, '/');
	if (text.startsWith('/')) text = `-${text.slice(1)}`;
	text = text.replace(/\/\//g, '/-');

	const parts = text.split('/');
	const int = (raw: string | undefined): number => Number.parseInt(raw ?? '', 10);
	const date: DdDate = {};

	if (parts.length === 1) {
		date.year = int(parts[0]);
		return { date, error: null };
	}
	if (parts.length === 2) {
		if (order === 'dmy') {
			date.month = int(parts[0]);
			date.year = int(parts[1]);
			return { date, error: null };
		}
		if (order === 'mdy') {
			// PHP :1102 — an mdy pair is ambiguous (month/day? month/year?) and is refused.
			return { date, error: `IGNORED: Invalid mdy date format for current_date: ${token}` };
		}
		date.year = int(parts[0]);
		date.month = int(parts[1]);
		return { date, error: null };
	}
	if (parts.length === 3) {
		if (order === 'dmy') {
			date.day = int(parts[0]);
			date.month = int(parts[1]);
			date.year = int(parts[2]);
		} else if (order === 'mdy') {
			date.month = int(parts[0]);
			date.day = int(parts[1]);
			date.year = int(parts[2]);
		} else {
			date.year = int(parts[0]);
			date.month = int(parts[1]);
			date.day = int(parts[2]);
		}
		return { date, error: null };
	}
	// >3 parts: PHP builds nothing and stores an EMPTY dd_date. Refuse instead —
	// storing an empty date silently destroys the cell's meaning.
	return { date, error: `IGNORED: malformed data ${token}` };
}

/** dd_date range validation (PHP dd_date::get_errors, validation mode). */
function ddDateErrors(date: DdDate): string[] {
	const errors: string[] = [];
	const range = (name: keyof DdDate, min: number, max: number): void => {
		const value = date[name];
		if (value === undefined) return;
		if (!Number.isFinite(value)) errors.push(`${name} is not a number`);
		else if (value < min || value > max) errors.push(`${name} out of range: ${value}`);
	};
	if (date.year !== undefined && !Number.isFinite(date.year)) errors.push('year is not a number');
	range('month', 1, 12);
	range('day', 1, 31);
	range('hour', 0, 23);
	range('minute', 0, 59);
	range('second', 0, 59);
	return errors;
}

const conformDate: ImportConformFn = async (value, json, ctx) => {
	// JSON: the stored dato round-trips. PHP picks the component's OWN lang key when
	// the export was lang-keyed (:992-998) — not a generic lg-* scan.
	if (json.isJson) {
		const decoded = json.decoded;
		const picked =
			isObject(decoded) && decoded[ctx.lang] !== undefined ? decoded[ctx.lang] : decoded;
		return validateDateItems(picked, ctx, value);
	}

	if (isEmptyString(value)) return ok(null);

	// The suffix is the date ORDER: 'test145_dmy' → dmy.
	const order = ctx.columnName.split('_')[1] ?? 'ymd';

	const items: Record<string, DdDate>[] = [];
	for (const row of value.split('|')) {
		const bounds = row.split('<>');
		const item: Record<string, DdDate> = {};
		for (const [index, rawBound] of bounds.entries()) {
			const token = rawBound.trim();
			if (token === '') continue;
			const mode = index === 0 ? 'start' : 'end';
			const { date, error } = parseDateToken(token, order);
			if (error !== null) return fail(ctx, error, value);
			item[mode] = date;
		}
		if (Object.keys(item).length > 0) items.push(item);
	}
	if (items.length === 0) return ok(null);
	return validateDateItems(items, ctx, value);
};

/** The shared validation pass (PHP :1158-1233) — runs on both branches. */
function validateDateItems(value: unknown, ctx: ImportConformContext, raw: string): ConformResult {
	if (value === null || value === undefined) return ok(null);
	const items = Array.isArray(value) ? value : [value];
	if (items.length === 0) return ok(null);

	const ddErrors: string[] = [];
	for (const item of items) {
		if (!isObject(item)) {
			return fail(
				ctx,
				`IGNORED: malformed data, expected date object and get: ${phpType(item)}`,
				raw,
			);
		}
		for (const bound of ['start', 'end'] as const) {
			const date = item[bound];
			if (date === null || date === undefined) continue;
			if (!isObject(date)) continue;
			ddErrors.push(...ddDateErrors(date as DdDate));
		}
	}
	if (ddErrors.length > 0) {
		const failure = issue(ctx, `IGNORED: malformed data ${asText(raw)}`, raw);
		// PHP :1227 attaches the dd_date error list as a FIFTH property.
		(failure as ConformFailure & { errors: string[] }).errors = ddErrors;
		return { result: null, errors: [failure], warnings: [], msg: 'Error. Request failed' };
	}
	return ok(items);
}

// ---------------------------------------------------------------------------
// component_number (PHP core/component_number :543-649)
// ---------------------------------------------------------------------------

/**
 * PHP component_number::string_to_number (:395-443). The DECIMAL separator comes
 * from the column map (the "Decimal" dropdown in the mapper UI), NOT from a
 * locale: ',' means '1.234,56' (thousands '.'), anything else means '1,234.56'.
 * Currency symbols and units are stripped.
 */
function stringToNumber(raw: string, decimal: string | undefined, type: string): number | null {
	let text = raw;
	if (decimal === ',') {
		text = text.replaceAll('.', '');
		text = text.replaceAll(',', '.');
	} else {
		text = text.replaceAll(',', '');
	}
	text = text.replace(/[^-.,0-9]/g, '');
	if (text === '') return null;
	const parsed = type === 'int' ? Number.parseInt(text, 10) : Number.parseFloat(text);
	return Number.isFinite(parsed) ? parsed : null;
}

const conformNumber: ImportConformFn = async (value, json, ctx) => {
	const wrapScalars = (items: unknown[]): unknown[] =>
		items.map((item) => (isObject(item) ? item : { value: item }));

	if (json.isJson) {
		const decoded = json.decoded;
		if (Array.isArray(decoded)) return ok(wrapScalars(decoded));
		if (isLangKeyed(decoded)) {
			// PHP takes the FIRST lang group only (:571) — number is not translatable,
			// so a lang-keyed export carries one group in practice.
			const group = decoded[firstKey(decoded)];
			return ok(wrapScalars(Array.isArray(group) ? group : [group]));
		}
		if (isObject(decoded)) {
			if ('value' in decoded) return ok([decoded]);
			return fail(ctx, `IGNORED: object without value property ${asText(value)}`, value);
		}
		return ok(null);
	}

	// '0' is a legitimate number — the ONE value PHP's empty() would swallow.
	if (isEmptyString(value)) return ok(null);

	const { getPropertiesByTipo } = await import('../ontology/resolver.ts');
	const properties = (await getPropertiesByTipo(ctx.componentTipo)) as { type?: unknown } | null;
	const type = typeof properties?.type === 'string' ? properties.type : 'float';

	const parsed = stringToNumber(value, ctx.decimal, type);
	if (parsed === null) return fail(ctx, `IGNORED: malformed data ${asText(value)}`, value);
	return ok([{ value: parsed }]);
};

// ---------------------------------------------------------------------------
// component_email (PHP core/component_email :278-376)
// ---------------------------------------------------------------------------

const conformEmail: ImportConformFn = async (value, json, ctx) => {
	const normalize = (items: unknown[]): unknown[] =>
		items.map((item) => (isObject(item) && 'value' in item ? item : { value: item }));

	if (json.isJson) {
		const decoded = json.decoded;
		if (Array.isArray(decoded)) return ok(normalize(decoded));
		if (isLangKeyed(decoded)) {
			const group = decoded[firstKey(decoded)];
			return ok(normalize(Array.isArray(group) ? group : [group]));
		}
		if (isObject(decoded)) {
			if ('value' in decoded) return ok([decoded]);
			return fail(ctx, `IGNORED: object without value property ${asText(value)}`, value);
		}
		return ok(null);
	}

	if (isEmptyString(value)) return ok(null);

	// The multi-value separator is ' | ' (space-pipe-space), not a bare pipe: an
	// address may legitimately contain '|' in its local part.
	const items = value
		.split(' | ')
		.map((part) => part.trim())
		.filter((part) => part !== '')
		.map((part) => ({ value: part }));
	return ok(items.length > 0 ? items : null);
};

// ---------------------------------------------------------------------------
// component_geolocation (PHP core/component_geolocation :495-702)
// ---------------------------------------------------------------------------

interface GeoItem {
	lat: number;
	lon: number;
	zoom: number;
	alt: number;
	lib_data?: unknown[];
}

/** PHP $conform_item (:517-553): the coordinate + layer validator. */
function conformGeoItem(source: Record<string, unknown>): { item: GeoItem | null; error: string } {
	const lat = source.lat;
	const lon = source.lon;
	const numeric = (v: unknown): boolean =>
		(typeof v === 'number' && Number.isFinite(v)) ||
		(typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
	if (!numeric(lat) || !numeric(lon)) {
		return { item: null, error: 'lat and lon numeric properties are mandatory' };
	}
	const latNum = Number(lat);
	const lonNum = Number(lon);
	if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
		return { item: null, error: 'lat or lon values are out of range' };
	}
	const item: GeoItem = {
		lat: latNum,
		lon: lonNum,
		// PHP always sets both, defaulting a missing/non-numeric value.
		zoom: numeric(source.zoom) ? Math.trunc(Number(source.zoom)) : 16,
		alt: numeric(source.alt) ? Math.trunc(Number(source.alt)) : 0,
	};
	if (source.lib_data !== undefined && source.lib_data !== null) {
		if (!Array.isArray(source.lib_data)) {
			return { item: null, error: 'lib_data must be an array of layers' };
		}
		for (const layer of source.lib_data) {
			const data = isObject(layer) ? (layer.layer_data as Record<string, unknown>) : null;
			if (
				!isObject(layer) ||
				layer.layer_id === undefined ||
				!isObject(data) ||
				data.type !== 'FeatureCollection' ||
				!Array.isArray(data.features)
			) {
				return {
					item: null,
					error: 'lib_data layers must define layer_id and layer_data as GeoJSON FeatureCollection',
				};
			}
		}
		item.lib_data = source.lib_data;
	}
	return { item, error: '' };
}

const conformGeolocation: ImportConformFn = async (value, json, ctx) => {
	if (json.isJson) {
		let decoded = json.decoded;
		if (isLangKeyed(decoded)) {
			decoded = decoded[firstKey(decoded)];
			if (decoded === null || decoded === undefined) return ok(null);
		}

		// A bare GeoJSON FeatureCollection: the map centre is the first Point.
		if (isObject(decoded) && decoded.type === 'FeatureCollection') {
			const features = decoded.features;
			if (!Array.isArray(features)) {
				return fail(ctx, 'IGNORED: FeatureCollection without features array', value);
			}
			let centre: [number, number] | null = null;
			for (const feature of features) {
				if (!isObject(feature)) continue;
				const geometry = feature.geometry as Record<string, unknown> | undefined;
				const coords = geometry?.coordinates;
				if (geometry?.type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
					centre = [Number(coords[0]), Number(coords[1])];
					break;
				}
			}
			if (centre === null) {
				return fail(
					ctx,
					'IGNORED: FeatureCollection without any Point feature to set the map center',
					value,
				);
			}
			for (const feature of features) {
				if (!isObject(feature)) continue;
				const properties = isObject(feature.properties) ? feature.properties : {};
				if (properties.layer_id === undefined) properties.layer_id = 1;
				feature.properties = properties;
			}
			// GeoJSON is [lon, lat] — the stored dato is lat/lon. Do not swap this back.
			const { item, error } = conformGeoItem({
				lat: centre[1],
				lon: centre[0],
				lib_data: [{ layer_id: 1, layer_data: decoded }],
			});
			if (item === null) return fail(ctx, `IGNORED: malformed data. ${error}`, value);
			return ok([item]);
		}

		const items = Array.isArray(decoded) ? decoded : isObject(decoded) ? [decoded] : null;
		if (items === null) return fail(ctx, 'IGNORED: unrecognized geolocation data', value);
		const conformed: GeoItem[] = [];
		for (const source of items) {
			if (!isObject(source)) {
				return fail(
					ctx,
					`IGNORED: malformed data. Expected object item and get: ${phpType(source)}`,
					value,
				);
			}
			const { item, error } = conformGeoItem(source);
			if (item === null) return fail(ctx, `IGNORED: malformed data. ${error}`, value);
			conformed.push(item);
		}
		return ok(conformed.length > 0 ? conformed : null);
	}

	if (isEmptyString(value)) return ok(null);

	// The flat human form: 'lat, lon[, zoom[, alt]]' — LAT FIRST (the opposite of GeoJSON).
	const parts = value.split(',').map((part) => part.trim());
	if (parts.length < 2 || parts.length > 4) {
		return fail(
			ctx,
			`IGNORED: malformed coordinates. Expected 'lat, lon[, zoom[, alt]]' and get: ${asText(value)}`,
			value,
		);
	}
	for (const part of parts) {
		if (part === '' || !Number.isFinite(Number(part))) {
			return fail(ctx, `IGNORED: malformed coordinates. Non numeric value: ${part}`, value);
		}
	}
	const { item, error } = conformGeoItem({
		lat: parts[0],
		lon: parts[1],
		zoom: parts[2],
		alt: parts[3],
	});
	if (item === null) return fail(ctx, `IGNORED: malformed coordinates. ${error}`, value);
	return ok([item]);
};

// ---------------------------------------------------------------------------
// component_input_text (PHP core/component_input_text :239-334)
// ---------------------------------------------------------------------------

/**
 * input_text's normalizer. A scalar wraps into {value} (it is a value-property
 * model); an OBJECT wraps only if it is neither a value item nor a locator —
 * which is what lets a locator ride through an input_text column untouched.
 */
function normalizeInputTextItems(items: unknown[]): unknown[] {
	return items.map((item) => {
		if (!isObject(item)) return { value: item };
		if (!('value' in item) && !('section_id' in item)) return { value: item };
		return item;
	});
}

const conformInputText: ImportConformFn = async (value, json, ctx) => {
	if (json.isJson) {
		const decoded = json.decoded;
		if (Array.isArray(decoded)) return ok(normalizeInputTextItems(decoded));
		if (isLangKeyed(decoded)) {
			// Stays an OBJECT: the executor saves each lang separately (set_data_lang).
			const out: Record<string, unknown> = {};
			for (const [lang, langValue] of Object.entries(decoded)) {
				out[lang] = normalizeInputTextItems(Array.isArray(langValue) ? langValue : [langValue]);
			}
			return ok(out);
		}
		if (isObject(decoded)) return ok(normalizeInputTextItems([decoded]));
		return ok(null);
	}

	if (!isPlainBracketString(value)) {
		return fail(ctx, `IGNORED: malformed data ${asText(value)}`, value);
	}
	// '0' is a legitimate text value.
	if (value === '') return ok(null);
	return ok([{ value }]);
};

// ---------------------------------------------------------------------------
// component_text_area (PHP core/component_text_area :2097-2253)
// ---------------------------------------------------------------------------

/**
 * PHP $normalize_value (:2109-2148): text_area stores HTML, so a plain-text cell
 * is paragraph-wrapped and its line breaks become paragraph breaks.
 */
function normalizeTextAreaValue(raw: unknown): string | null {
	let text: string;
	if (typeof raw === 'number') text = String(raw);
	else if (typeof raw === 'string') text = raw;
	else return null; // non-string: PHP drops it
	if (text === '') return null;
	if (!text.startsWith('<p>')) text = `<p>${text}`;
	if (!text.endsWith('</p>')) text = `${text}</p>`;
	text = text.replace(/(<\/? ?br>)/gi, '</p><p>');
	text = text.replace(/(\r\n|\r|\n)/g, '</p><p>');
	return text;
}

function normalizeTextAreaItems(items: unknown[]): unknown[] {
	const out: unknown[] = [];
	for (const item of items) {
		const normalized = normalizeTextAreaValue(item);
		if (normalized === null) continue;
		out.push({ value: normalized });
	}
	return out;
}

/** An already-shaped item {id, value, lang}: normalize `value` IN PLACE, keep the rest. */
function normalizeTextAreaItem(item: Record<string, unknown>): Record<string, unknown> {
	if (!('value' in item)) return item;
	const normalized = normalizeTextAreaValue(item.value);
	// PHP falls back to the ORIGINAL when normalize drops the value (e.g. value:'').
	return { ...item, value: normalized ?? item.value };
}

const conformTextArea: ImportConformFn = async (value, json, ctx) => {
	const normalizeMixed = (items: unknown[]): unknown[] => {
		const out: unknown[] = [];
		for (const item of items) {
			if (isObject(item)) out.push(normalizeTextAreaItem(item));
			else out.push(...normalizeTextAreaItems([item]));
		}
		return out;
	};

	if (json.isJson) {
		const decoded = json.decoded;
		if (Array.isArray(decoded)) return ok(normalizeMixed(decoded));
		if (isLangKeyed(decoded)) {
			const out: Record<string, unknown> = {};
			for (const [lang, langValue] of Object.entries(decoded)) {
				out[lang] = normalizeMixed(Array.isArray(langValue) ? langValue : [langValue]);
			}
			return ok(out);
		}
		if (isObject(decoded)) return ok([normalizeTextAreaItem(decoded)]);
		return ok(null);
	}

	if (!isPlainBracketString(value)) {
		return fail(ctx, `IGNORED: malformed data ${asText(value)}`, value);
	}
	if (value === '') return ok(null);
	return ok(normalizeTextAreaItems([value]));
};

// ---------------------------------------------------------------------------
// component_json (PHP core/component_json :615-742)
// ---------------------------------------------------------------------------

const conformJson: ImportConformFn = async (value, json, ctx) => {
	if (value === '') return ok(null);

	// The cell came out of a {"dedalo_data": …} wrapper: it IS the stored dato and
	// must round-trip verbatim. This is the ONLY reason `wrapped` exists — an
	// unwrapped '[{"value":1}]' is a literal JSON VALUE for this component, not a
	// dato, and must be stored as one (see below).
	if (ctx.wrapped) {
		if (!Array.isArray(json.decoded)) {
			return fail(ctx, 'IGNORED: dedalo_data wrapper must contain an array of items', value);
		}
		for (const item of json.decoded) {
			if (!isObject(item) || !('value' in item)) {
				return fail(ctx, 'IGNORED: dedalo_data items must be objects with a value property', value);
			}
		}
		return ok(json.decoded);
	}

	if (json.isJson) {
		const decoded = json.decoded;
		// Legacy lang-keyed export: exactly one lg-* key holding a non-empty array.
		if (isObject(decoded)) {
			const keys = Object.keys(decoded);
			const only = keys[0];
			if (keys.length === 1 && only?.startsWith('lg-')) {
				const group = decoded[only];
				if (Array.isArray(group) && group.length > 0) {
					return ok(
						group.map((item) => (isObject(item) && 'value' in item ? item : { value: item })),
					);
				}
			}
		}
		// The whole decoded structure is ONE json value.
		return ok([{ value: decoded }]);
	}

	// Not json: a bare scalar ('42', 'true') decodes to its native type; anything
	// else stays the raw string. Either way it is one monovalue.
	let scalar: unknown = value;
	try {
		scalar = JSON.parse(value);
	} catch {
		scalar = value;
	}
	return ok([{ value: scalar }]);
};

// ---------------------------------------------------------------------------
// component_relation_common (PHP core/component_relation_common :3550-3736)
// ---------------------------------------------------------------------------

/** PHP safe_section_id: an integer, optionally negative. No surrounding space. */
const SAFE_SECTION_ID = /^-?[0-9]+$/;
/** PHP safe_tipo. */
const SAFE_TIPO = /^[a-z]{2,}[0-9]+$/;

const conformRelation: ImportConformFn = async (value, json, ctx) => {
	const decoded = json.isJson ? json.decoded : value;

	if (
		decoded === null ||
		decoded === undefined ||
		decoded === '' ||
		(Array.isArray(decoded) && decoded.length === 0)
	) {
		return ok(null); // a valid CLEAR
	}

	const { getRelationTypeByTipo } = await import('../relations/save.ts');
	const relationType = await getRelationTypeByTipo(ctx.componentTipo);

	// The SCALAR form: a list of section_ids, '273,418'. The target section comes
	// from the column-name suffix ('rsc85_rsc197' → rsc197) — the CSV is otherwise
	// ambiguous whenever a component can point at more than one section.
	if (typeof decoded === 'string' || typeof decoded === 'number') {
		const suffix = ctx.columnName.split('_')[1];
		let targetSectionTipo = suffix ?? '';
		if (targetSectionTipo === '') {
			const { getElementTargetSectionTipos } = await import('../relations/request_config/build.ts');
			const targets = await getElementTargetSectionTipos(ctx.componentTipo, ctx.sectionTipo);
			if (targets.length > 1) {
				return fail(
					ctx,
					'IGNORED: Trying to import multiple section_tipo without clear target ',
					value,
				);
			}
			targetSectionTipo = targets[0] ?? '';
			if (!SAFE_TIPO.test(targetSectionTipo)) {
				return fail(ctx, 'IGNORED: Trying to import invalid target_section_tipo', value);
			}
		}

		const locators: Record<string, unknown>[] = [];
		for (const rawId of String(decoded).split(',')) {
			if (!SAFE_SECTION_ID.test(rawId)) {
				return fail(ctx, 'IGNORED: Trying to import invalid section_id', value);
			}
			const locator: Record<string, unknown> = {
				section_tipo: targetSectionTipo,
				section_id: rawId,
				from_component_tipo: ctx.componentTipo,
			};
			// component_relation_parent carries no type.
			if (relationType !== '') locator.type = relationType;
			locators.push(locator);
		}
		return ok(locators);
	}

	// The LOCATOR form: the exported dato.
	const items = Array.isArray(decoded) ? decoded : [decoded];
	const locators: Record<string, unknown>[] = [];
	for (const item of items) {
		if (
			!isObject(item) ||
			item.section_tipo === undefined ||
			item.section_tipo === null ||
			item.section_tipo === '' ||
			item.section_id === undefined ||
			item.section_id === null ||
			item.section_id === ''
		) {
			return fail(ctx, 'IGNORED: Trying to import invalid locator', value);
		}
		const locator: Record<string, unknown> = { ...item };
		if (locator.type === undefined && relationType !== '') locator.type = relationType;
		if (locator.from_component_tipo === undefined) locator.from_component_tipo = ctx.componentTipo;
		locators.push(locator);
	}
	return ok(locators);
};

// ---------------------------------------------------------------------------
// component_select_lang (PHP core/component_select_lang :485-581)
// ---------------------------------------------------------------------------

/** The langs section (DEDALO_LANGS_SECTION_TIPO). */
const LANGS_SECTION_TIPO = 'lg1';
const LANG_CODE = /^lg-[a-z0-9]+$/;

const conformSelectLang: ImportConformFn = async (value, json, ctx) => {
	// Collect the lang CODES, if this cell is in code form at all.
	let codes: string[] | null = null;
	if (json.isJson) {
		const decoded = json.decoded;
		if (
			Array.isArray(decoded) &&
			decoded.length > 0 &&
			decoded.every((item) => typeof item === 'string')
		) {
			codes = (decoded as string[]).map((code) => code.trim());
		}
	} else if (value !== '') {
		const tokens = value
			.split(',')
			.map((token) => token.trim())
			.filter((token) => token !== '');
		if (tokens.length > 0 && tokens.every((token) => LANG_CODE.test(token))) codes = tokens;
	}

	// Not code form (a locator array, or a bare section_id list): the generic
	// relation conform owns it.
	if (codes === null) return conformRelation(value, json, ctx);

	const { getLangSectionIdByCode } = await import('../relations/select_lang.ts');
	const { config } = await import('../../config/config.ts');
	const projectLangs = config.menu.projectsDefaultLangs;

	const { getRelationTypeByTipo } = await import('../relations/save.ts');
	const relationType = await getRelationTypeByTipo(ctx.componentTipo);

	const locators: Record<string, unknown>[] = [];
	const warnings: ConformFailure[] = [];
	for (const code of codes) {
		const sectionId = await getLangSectionIdByCode(code);
		if (sectionId === null) {
			return fail(ctx, `IGNORED: invalid lang code ${asText(code)}`, value);
		}
		// The lang EXISTS but is not one of the project's languages: import it (the
		// data is not wrong), but say so — nobody will be able to see it until the
		// project's lang list includes it. This is the ONLY warning in the engine.
		if (!projectLangs.includes(code)) {
			warnings.push(
				issue(
					ctx,
					`WARNING: lang ${code} was imported, but it will not be accessible until the project languages include it`,
					value,
				),
			);
		}
		const locator: Record<string, unknown> = {
			section_tipo: LANGS_SECTION_TIPO,
			section_id: String(sectionId),
			from_component_tipo: ctx.componentTipo,
		};
		if (relationType !== '') locator.type = relationType;
		locators.push(locator);
	}
	return ok(locators, warnings);
};

// ---------------------------------------------------------------------------
// component_iri (PHP core/component_iri :566-1036)
// ---------------------------------------------------------------------------

function hasProtocol(value: string): boolean {
	return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * One iri record: 'https://…' | '<label>, https://…' | '<label_id>, https://…'.
 *
 * A NUMERIC label token is a dd1706 label record id and is stored as-is. A TEXT
 * label ('nomisma, https://…') requires a lookup-or-create in dd1706 — PHP does
 * it inside conform (save_label_dataframe_from_string). That write path is NOT
 * ported, so the cell is REFUSED rather than silently imported without its label.
 */
function conformIriRecord(
	record: string,
	fieldsSeparator: string,
	ctx: ImportConformContext,
): { item: Record<string, unknown> | null; error: string | null } {
	const fields = record.split(fieldsSeparator).map((field) => field.trim());
	const first = fields[0] ?? '';
	const item: Record<string, unknown> = {};

	if (hasProtocol(first)) {
		item.iri = first;
	} else if (first !== '' && /^[0-9]+$/.test(first)) {
		item.label_id = Number.parseInt(first, 10);
	} else if (first !== '') {
		return {
			item: null,
			error: `IGNORED: an iri text label ('${first}') needs a lookup-or-create in the label section (dd1706), which is not ported — import the label's record id instead`,
		};
	}
	const second = fields[1] ?? '';
	if (hasProtocol(second)) item.iri = second;

	if (Object.keys(item).length === 0) {
		return { item: null, error: `IGNORED: malformed data ${asText(record)}` };
	}
	return { item, error: null };
}

const conformIri: ImportConformFn = async (value, json, ctx) => {
	const { getPropertiesByTipo } = await import('../ontology/resolver.ts');
	const properties = (await getPropertiesByTipo(ctx.componentTipo)) as {
		records_separator?: unknown;
		fields_separator?: unknown;
	} | null;
	const recordsSeparator =
		typeof properties?.records_separator === 'string' ? properties.records_separator : ' | ';
	const fieldsSeparator =
		typeof properties?.fields_separator === 'string' ? properties.fields_separator : ', ';

	if (json.isJson) {
		const decoded = json.decoded;

		if (isLangKeyed(decoded)) {
			const out: Record<string, unknown> = {};
			for (const [lang, langValue] of Object.entries(decoded)) {
				const items = Array.isArray(langValue) ? langValue : [langValue];
				const conformed: unknown[] = [];
				for (const item of items) {
					if (isObject(item)) {
						if (typeof item.iri !== 'string') {
							return fail(
								ctx,
								`IGNORED: malformed data, iri must be a string ${asText(value)}`,
								value,
							);
						}
						const iri = item.iri.trim();
						if (!hasProtocol(iri)) {
							return fail(ctx, `IGNORED: malformed data ${asText(value)}`, value);
						}
						conformed.push({ ...item, iri });
						continue;
					}
					if (typeof item === 'string') {
						const { item: built, error } = conformIriRecord(item, fieldsSeparator, ctx);
						if (built === null) return fail(ctx, error ?? 'IGNORED: malformed data', value);
						conformed.push(built);
					}
				}
				out[lang] = conformed;
			}
			return ok(out);
		}

		const items = Array.isArray(decoded) ? decoded : isObject(decoded) ? [decoded] : null;
		if (items === null) {
			return fail(ctx, `IGNORED: expected array and get: ${phpType(decoded)}`, value);
		}
		const conformed: unknown[] = [];
		for (const item of items) {
			if (isObject(item)) {
				if (item.iri !== undefined && typeof item.iri !== 'string') {
					return fail(ctx, `IGNORED: malformed data, iri must be a string ${asText(value)}`, value);
				}
				if (typeof item.iri === 'string' && !hasProtocol(item.iri.trim())) {
					return fail(ctx, `IGNORED: malformed data ${asText(value)}`, value);
				}
				conformed.push(item);
				continue;
			}
			if (typeof item === 'string') {
				const { item: built, error } = conformIriRecord(item, fieldsSeparator, ctx);
				if (built === null) return fail(ctx, error ?? 'IGNORED: malformed data', value);
				conformed.push(built);
			}
		}
		if (conformed.length === 0) {
			return fail(ctx, `IGNORED: object without iri data ${asText(value)}`, value);
		}
		return ok(conformed);
	}

	if (!isPlainBracketString(value)) {
		return fail(ctx, `IGNORED: malformed data ${asText(value)}`, value);
	}
	if (value === '') return ok(null);

	const hasRecords = value.includes(recordsSeparator);
	const hasFields = value.includes(fieldsSeparator);
	if (!hasRecords && !hasFields && !hasProtocol(value)) {
		return fail(ctx, `IGNORED: malformed data ${asText(value)}`, value);
	}
	const conformed: unknown[] = [];
	for (const record of value.split(recordsSeparator)) {
		const { item, error } = conformIriRecord(record.trim(), fieldsSeparator, ctx);
		if (item === null) return fail(ctx, error ?? 'IGNORED: malformed data', value);
		conformed.push(item);
	}
	return ok(conformed);
};

// ---------------------------------------------------------------------------

/** id → implementation (the descriptor names the id; nothing imports a model module). */
export const IMPORT_CONFORM: Record<ImportConformId, ImportConformFn> = {
	date: conformDate,
	email: conformEmail,
	geolocation: conformGeolocation,
	input_text: conformInputText,
	iri: conformIri,
	json: conformJson,
	number: conformNumber,
	relation: conformRelation,
	select_lang: conformSelectLang,
	text_area: conformTextArea,
};
