/**
 * SEARCH-MODE OPERATOR TOOLTIPS (PHP component `search_operators_info()` +
 * search::search_options_title, core/search/trait.utils.php:366-395).
 *
 * When a component is built in 'search' mode (the search-filter panel /
 * get_section_elements_context), PHP stamps two fields onto its structure
 * context (class.common.php:2010-2013):
 *  - `search_operators_info`: an ordered {operator → label-KEY} map (the raw
 *    keys, NOT resolved), or `[]` when the model has none.
 *  - `search_options_title`: the rendered tooltip HTML the client shows under
 *    the selected search component (client common/js/ui.js build_wrapper_search:
 *    the `.hidden_tooltip` div is added ONLY when context.search_options_title
 *    is set), or `''` when empty.
 *
 * PHP defines the operator sets on per-FAMILY search traits and resolves them by
 * component class inheritance. This module mirrors that: the sets are verbatim
 * copies of the traits (order preserved — the client renders rows in map order),
 * keyed by the CANONICAL model (structure_context passes the alias-resolved
 * model, so component_autocomplete → component_portal → relation, etc., exactly
 * as PHP instantiates the replaced class in common.php:3915-22).
 *
 * Byte-verified against the live PHP oracle (lg-spa) for numisdata3 / rsc170 /
 * dd64 in test/parity/section_elements_context_differential.test.ts.
 */

/** One row of a component's operator tooltip: [operator token, label KEY]. */
export type SearchOperatorPair = readonly [operator: string, labelKey: string];

// Operator sets, verbatim from the PHP search traits (order matters).

/** trait.search_component_string_common (input_text / text_area / email). */
const STRING_OPERATORS: readonly SearchOperatorPair[] = [
	['!*', 'empty'],
	['*', 'no_empty'],
	['==', 'exactly'],
	['=', 'similar_to'],
	['!=', 'different_from'],
	['-', 'does_not_contain'],
	['!!', 'duplicated'],
	['text*', 'begins_with'],
	['*text', 'end_with'],
	["'text'", 'literal'],
];

/** trait.search_component_iri — like string but `==`,`!=`,`=` ordering differs. */
const IRI_OPERATORS: readonly SearchOperatorPair[] = [
	['!*', 'empty'],
	['*', 'no_empty'],
	['==', 'exactly'],
	['!=', 'different_from'],
	['=', 'similar_to'],
	['-', 'does_not_contain'],
	['!!', 'duplicated'],
	['text*', 'begins_with'],
	['*text', 'end_with'],
	["'text'", 'literal'],
];

/** trait.search_component_json — note `!!` maps to `duplicate` (not `duplicated`). */
const JSON_OPERATORS: readonly SearchOperatorPair[] = [
	['*', 'no_empty'],
	['!*', 'empty'],
	['=', 'similar_to'],
	['!=', 'different_from'],
	['-', 'does_not_contain'],
	['!!', 'duplicate'],
	['text*', 'begins_with'],
	['*text', 'end_with'],
	["'text'", 'literal'],
];

/** trait.search_component_date. */
const DATE_OPERATORS: readonly SearchOperatorPair[] = [
	['!*', 'empty'],
	['*', 'no_empty'],
	['>=', 'greater_than_or_equal'],
	['<=', 'less_than_or_equal'],
	['>', 'greater_than'],
	['<', 'less_than'],
];

/** trait.search_component_number. */
const NUMBER_OPERATORS: readonly SearchOperatorPair[] = [
	['*', 'no_empty'],
	['!*', 'empty'],
	['...', 'between'],
	['>=', 'greater_than_or_equal'],
	['<=', 'less_than_or_equal'],
	['>', 'greater_than'],
	['<', 'less_than'],
];

/** trait.search_component_section_id. */
const SECTION_ID_OPERATORS: readonly SearchOperatorPair[] = [
	['...', 'between'],
	[',', 'sequence'],
	['>=', 'greater_than_or_equal'],
	['<=', 'less_than_or_equal'],
	['>', 'greater_than'],
	['<', 'less_than'],
];

/**
 * trait.search_component_relation_common — inherited by every relation model
 * (portal/select/check_box/radio_button/publication/filter/…). NOTE:
 * component_relation_children carries an identical trait set but its CLASS
 * overrides search_operators_info() to `[]` to hide the picker
 * (class.component_relation_children.php:1495) — so it is EMPTY below, not here.
 */
const RELATION_OPERATORS: readonly SearchOperatorPair[] = [
	['!*', 'empty'],
	['*', 'no_empty'],
	['!=', 'different_from'],
	['!==', 'strict_different_from'],
];

/** trait.search_component_relation_index — index components only. */
const RELATION_INDEX_OPERATORS: readonly SearchOperatorPair[] = [
	['*', 'no_empty'],
	['!*', 'empty'],
];

/**
 * Canonical component model → operator set (PHP class-inheritance resolution,
 * flattened). Models absent here have NO search operators (the PHP base
 * component_common::search_operators_info returns []): media (3d/av/image/pdf/
 * svg), info/state, inverse, geolocation, password, security_access,
 * filter_records, and component_external (extends component_common — its
 * `relation` column does NOT give it relation operators). Those are pinned
 * explicitly in MODELS_WITHOUT_SEARCH_OPERATORS so a new model can't slip
 * through unclassified (search_operators_completeness.test.ts).
 */
const OPERATOR_SET_BY_MODEL: Readonly<Record<string, readonly SearchOperatorPair[]>> = {
	// string family
	component_input_text: STRING_OPERATORS,
	component_text_area: STRING_OPERATORS,
	component_email: STRING_OPERATORS,
	// dedicated non-relation families
	component_iri: IRI_OPERATORS,
	component_json: JSON_OPERATORS,
	component_date: DATE_OPERATORS,
	component_number: NUMBER_OPERATORS,
	component_section_id: SECTION_ID_OPERATORS,
	// relation family (component_relation_common inheritors)
	component_portal: RELATION_OPERATORS,
	component_check_box: RELATION_OPERATORS,
	component_radio_button: RELATION_OPERATORS,
	component_select: RELATION_OPERATORS,
	component_select_lang: RELATION_OPERATORS,
	component_publication: RELATION_OPERATORS,
	component_filter: RELATION_OPERATORS,
	component_filter_master: RELATION_OPERATORS,
	component_relation_model: RELATION_OPERATORS,
	component_relation_parent: RELATION_OPERATORS,
	component_relation_related: RELATION_OPERATORS,
	component_dataframe: RELATION_OPERATORS,
	// index override
	component_relation_index: RELATION_INDEX_OPERATORS,
};

/**
 * Canonical component models that emit an EMPTY operator tooltip (PHP returns
 * `[]`). Kept explicit — the completeness test asserts every canonical
 * component model is in exactly one of these two maps, so adding a model forces
 * a conscious classification.
 */
export const MODELS_WITHOUT_SEARCH_OPERATORS: ReadonlySet<string> = new Set([
	'component_3d',
	'component_av',
	'component_image',
	'component_pdf',
	'component_svg',
	'component_info',
	'component_inverse',
	'component_geolocation',
	'component_password',
	'component_security_access',
	'component_filter_records',
	'component_external',
	// relation trait set is suppressed by a class-level override (see above).
	'component_relation_children',
]);

/** Canonical component models this module classifies (for the drift guard). */
export const CLASSIFIED_SEARCH_OPERATOR_MODELS: ReadonlySet<string> = new Set([
	...Object.keys(OPERATOR_SET_BY_MODEL),
	...MODELS_WITHOUT_SEARCH_OPERATORS,
]);

/**
 * The ordered operator pairs for a CANONICAL component model (empty array when
 * the model has none). Mirrors PHP `$this->search_operators_info()`.
 */
export function searchOperatorsInfo(model: string): readonly SearchOperatorPair[] {
	return OPERATOR_SET_BY_MODEL[model] ?? [];
}

/**
 * The `search_operators_info` WIRE value: an ordered {operator → label-key}
 * object when the model has operators, else `[]` — matching PHP, which emits an
 * empty PHP array (JSON `[]`) and a keyed array (JSON object) respectively.
 */
export function searchOperatorsInfoWire(model: string): Record<string, string> | never[] {
	const pairs = searchOperatorsInfo(model);
	if (pairs.length === 0) return [];
	// Non-integer string keys preserve insertion order in JS objects (== PHP order).
	const wire: Record<string, string> = {};
	for (const [operator, labelKey] of pairs) wire[operator] = labelKey;
	return wire;
}

/**
 * PHP component_common::decorate_untranslated — an unresolved label KEY is
 * wrapped in <mark> (e.g. `strict_different_from`, which has no dictionary
 * entry, renders as `<mark>strict_different_from</mark>`).
 */
function resolveLabel(labels: Record<string, string>, key: string): string {
	return labels[key] ?? `<mark>${key}</mark>`;
}

/**
 * The `search_options_title` tooltip HTML (PHP search::search_options_title,
 * trait.utils.php:378). Empty string when the model has no operators. The output
 * is NOT escaped (matching PHP raw concatenation — the client inserts it via
 * insertAdjacentHTML); operators like `<`/`>` land verbatim inside the spans.
 */
export function buildSearchOptionsTitle(model: string, labels: Record<string, string>): string {
	const pairs = searchOperatorsInfo(model);
	if (pairs.length === 0) return '';
	let html = `<b>${resolveLabel(labels, 'search_options')}:</b>`;
	for (const [operator, labelKey] of pairs) {
		html += `<div class="search_options_title_item"><span>${operator}</span><span>${resolveLabel(
			labels,
			labelKey,
		)}</span></div>`;
	}
	return html;
}
