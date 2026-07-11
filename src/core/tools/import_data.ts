/**
 * Import data engine (PHP component_common::conform_import_data +
 * unwrap_dedalo_data). Transforms a CSV cell into a v7 component dato.
 *
 * The critical invariant (round-trip): a raw export (`dedalo_raw`) wraps each dato
 * as {"dedalo_data": <dato>}; re-importing must reproduce the EXACT stored dato.
 * unwrapDedaloData strips the wrapper; conformImportData parses the JSON dato and
 * normalizes it. Because the JSON path is model-agnostic (only value-property
 * models wrap bare scalars into {value}), this core reproduces the round-trip for
 * EVERY component model. Per-model flat-string human input (date DMY, geo
 * "lat,lon", relation section-id lists) is additive and handled by callers/overrides.
 */

import { allComponentModels } from '../components/registry.ts';

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

/** PHP json_handler::is_json: a string whose first non-space char is [ or {. */
export function isJsonString(value: string): boolean {
	const trimmed = value.trimStart();
	return trimmed.startsWith('[') || trimmed.startsWith('{');
}

export interface UnwrapResult {
	/** The unwrapped inner dato re-encoded as a JSON string (or '' when empty). */
	value: string;
	/** Whether the {"dedalo_data":…} wrapper was recognized (its SOLE property). */
	wrapped: boolean;
	/** The dataframe array when the inner used the {dato, dataframe} envelope. */
	dataframe: unknown[] | null;
}

/**
 * Strip the dedalo_data wrapper (PHP unwrap_dedalo_data). Recognized only when
 * `dedalo_data` is the SOLE property — {"dedalo_data":1,"other":2} is a legit
 * component_json value and passes through unchanged.
 */
export function unwrapDedaloData(importValue: string): UnwrapResult {
	const result: UnwrapResult = { value: importValue, wrapped: false, dataframe: null };
	if (!isJsonString(importValue)) return result;
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
		if (innerKeys.length > 0 && innerKeys.every((k) => k === 'dato' || k === 'dataframe')) {
			const env = inner as { dato?: unknown; dataframe?: unknown };
			result.dataframe = Array.isArray(env.dataframe) ? env.dataframe : null;
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

/** A failed/warning report object (PHP fixed shape — the report depends on it). */
export interface ConformFailure {
	section_id: number;
	data: string;
	component_tipo: string;
	msg: string;
}

export interface ConformResult {
	/** The conformed dato: array of v7 items | lang-keyed object | null (clear). */
	result: unknown;
	errors: ConformFailure[];
	warnings?: ConformFailure[];
	msg: string;
}

export interface ConformInput {
	model: string;
	importValue: string;
	columnName: string;
	sectionId: number;
	componentTipo: string;
}

/**
 * Conform one CSV cell to a component dato (PHP component_common::
 * conform_import_data — the model-agnostic fallthrough). JSON cells parse to
 * their dato (round-trip); non-JSON non-empty cells wrap into {value} for
 * value-property models; empty cells (except '0') CLEAR (null).
 */
export function conformImportData(input: ConformInput): ConformResult {
	const isValueProperty = VALUE_PROPERTY_MODELS.has(input.model);
	const failure = (msg: string): ConformFailure => ({
		section_id: input.sectionId,
		data: input.importValue,
		component_tipo: input.componentTipo,
		msg,
	});

	let value: unknown;
	if (isJsonString(input.importValue)) {
		let decoded: unknown;
		let ok = true;
		try {
			decoded = JSON.parse(input.importValue);
		} catch {
			ok = false;
		}
		if (!ok || (decoded === null && input.importValue !== 'null')) {
			return {
				result: null,
				errors: [failure('IGNORED: JSON decode failed')],
				msg: 'Error. Request failed',
			};
		}
		value = decoded;
	} else if (input.importValue === '') {
		value = null; // empty cell → clear
	} else if (isValueProperty) {
		value = [{ value: input.importValue }];
	} else {
		// Non-JSON, non-empty, non-value-property: component_common leaves it as-is
		// (the per-model override is expected to handle the flat string).
		value = input.importValue;
	}

	const normalizeItems = (items: unknown[]): unknown[] =>
		items.map((v) => ((typeof v !== 'object' || v === null) && isValueProperty ? { value: v } : v));

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

	return { result: value, errors: [], msg: 'OK' };
}
