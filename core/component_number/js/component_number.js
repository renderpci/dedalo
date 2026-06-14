// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_NUMBER
* Dédalo client-side component for numeric fields (integers and floating-point numbers).
*
* Responsibilities:
* - Holds one or more numeric values per record in `this.data.entries`, where each entry
*   is a plain object `{ id: number|null, value: number|null }`.  Numbers are non-translatable:
*   the component always works with `lang = DEDALO_DATA_NOLAN` and never exposes a language
*   selector or `tool_lang`.
* - Cleans raw user input on every keystroke via `clean_value()` (normalises comma → dot,
*   strips non-numeric characters) and applies the configured type+precision contract on the
*   `change` event via `fix_number_format()`.
* - Exposes `get_steps()` so edit views can set the HTML `<input step>` attribute to a
*   value consistent with the configured precision (e.g. `0.01` for precision 2).
* - Delegates rendering to per-mode sub-modules:
*     - `render_edit_component_number`   → edit / line / mini / print views
*     - `render_list_component_number`   → list / tm (Time Machine reuses list)
*     - `render_search_component_number` → search (preserves `...` range operator)
* - Inherits the full component lifecycle (init → build → render → save → destroy) and
*   all data-mutation methods from `component_common` and `common`.
*
* Data shape (`this.data.entries`): Array of plain objects
*   `{ id: number|null, value: number|null }`
* There is no `lang` key because the component is non-translatable.
*
* Format contract (`context.properties`):
*   `type`      – `"int"` | `"float"` (default `"float"`): controls how values are rounded.
*   `precision` – integer number of decimal places (default `2`); only relevant when `type`
*                 is `"float"`.
*
* (!) Legacy ontology before 04/07/2024 used the wrong object form `"type":{"float":2}`.
* Both `get_format_number()` and the PHP class carry explicit guards for this shape.
*
* @see component_common   Generic lifecycle, save, change_value, mode-switch.
* @see render_edit_component_number   Edit-mode view dispatch and `change_handler`.
* @see render_list_component_number   List / TM view dispatch.
* @see render_search_component_number  Search-filter view (range `...` operator preserved).
* @see docs/core/components/component_number.md  Full data-model and properties reference.
*/

// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_number} from '../../component_number/js/render_edit_component_number.js'
	import {render_list_component_number} from '../../component_number/js/render_list_component_number.js'
	import {render_search_component_number} from '../../component_number/js/render_search_component_number.js'



/**
* COMPONENT_NUMBER
* Constructor. Declares all instance properties used throughout the component lifecycle.
* Actual values are populated by `component_common.prototype.init()` at mount time.
*
* Property notes:
* - `minimum_width_px` – CSS minimum-width hint (in pixels) read by the view layer to
*   prevent the component from collapsing in compressed grid layouts. The number component
*   has a narrower default (80 px) than text-based components because numeric values are
*   shorter.
*/
export const component_number = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	// ui
	this.minimum_width_px = 80 // integer pixels
}//end component_number



/**
* COMMON FUNCTIONS
* Extend component_number with shared prototype methods from component_common and common.
* No own implementations for the delegated methods — all logic lives in the shared
* prototypes.  The `tm` (Time Machine) render mode intentionally reuses the standard list
* renderer unchanged, so numbers display consistently in both list and TM contexts.
*/
// prototypes assign
	// lifecycle
	component_number.prototype.init					= component_common.prototype.init
	component_number.prototype.build				= component_common.prototype.build
	component_number.prototype.render				= common.prototype.render
	component_number.prototype.refresh				= common.prototype.refresh
	component_number.prototype.destroy				= common.prototype.destroy

	// change data
	component_number.prototype.save					= component_common.prototype.save
	component_number.prototype.update_data_value	= component_common.prototype.update_data_value
	component_number.prototype.update_datum			= component_common.prototype.update_datum
	component_number.prototype.change_value			= component_common.prototype.change_value
	component_number.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_number.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_number.prototype.list					= render_list_component_number.prototype.list
	component_number.prototype.tm					= render_list_component_number.prototype.list
	component_number.prototype.edit					= render_edit_component_number.prototype.edit
	component_number.prototype.search				= render_search_component_number.prototype.search

	component_number.prototype.change_mode			= component_common.prototype.change_mode



/**
* GET_FORMAT_NUMBER
* Applies the ontology-configured type/precision contract to a numeric value and returns
* the rounded result as a JavaScript number.  This is the canonical formatting step shared
* by `fix_number_format()` (input parsing pipeline) and, on the PHP side, by
* `set_format_form_type()`.
*
* Behaviour by `type`:
*   - `"float"` (default): rounds to `precision` decimal places using `Number.toFixed()`,
*     then converts back to a native JS number (e.g. `85.3568` with precision 2 → `85.36`).
*   - `"int"` (or any other value): calls `Number.toFixed()` with zero decimals, then
*     converts to a native JS number (e.g. `85.35` → `85`).
*
* Default values when `context.properties` is absent or incomplete:
*   `type`      → `"float"`
*   `precision` → `2`
*
* (!) Note: ontology created before 04/07/2024 used an incorrect nested-object form like
* `"type": {"float": 2}`.  This function reads `context.properties?.type` as a string; the
* legacy shape would yield `[object Object]` for `type`, which falls through to the `int`
* path (toFixed(0)).  If a number component rounds unexpectedly, inspect the ontology node.
*
* @param {Object} self   - The component_number instance (`this` context from the caller).
* @param {number} number - The numeric value to format.  Must pass `isNaN` check before
*   this function is called; returns `null` if `isNaN(number)` is true.
* @returns {number|null} The rounded number, or `null` when the input is NaN.
*/
const get_format_number = function ( self, number ) {

	// If the number is NaN (e.g., "" or just "-")
	// or if the number only contained a minus sign which resulted in 0,
	// then it's not a valid number.
	if (isNaN(number)) {
		console.error('Invalid number (isNaN):', number);
		return null;
	}

	// get properties or default values
	// (!) Note that Ontology previous to 04/07/2024 used a wrong object format like "type":{"float":2}
	const type		= self.context.properties?.type || 'float'
	const precision	= self.context.properties?.precision || 2

	const format_number = (type === 'float')
		? number.toFixed( precision )
		: number.toFixed();

	return Number( format_number )
}//end get_format_number



/**
* CLEAN_VALUE
* Normalises raw user input to a string that contains only the characters accepted by
* numeric parsing: digits `0-9`, one decimal dot `.`, and a leading minus sign `-`.
* This is called on every `input` event (live, keystroke-by-keystroke) so the user sees
* their input corrected in real time without waiting for the `change` event.
*
* Transformations applied in order:
*  1. Cast to string (safe even if `value` is a number, null, or undefined).
*  2. Replace all commas with dots (Spanish/French `17,2` → `17.2`).
*  3. Remove every character that is not `0-9`, `.`, or `-`.
*  4. Return `null` if the result is empty (no numeric characters at all).
*  5. Allow only one minus sign and only at the start of the string (strips
*     embedded or trailing hyphens).
*
* (!) Multiple dots are intentionally NOT collapsed here because the search mode uses the
* `...` range operator (e.g. `10...20`).  Collapsing multiple dots is deferred to
* `fix_number_format()`, which is only invoked in edit mode on the `change` event.
*
* @param {string|number|null} value - Raw value from the input element.
* @returns {string|null} Cleaned numeric string (may still contain multiple dots), or
*   `null` when the input contained no valid numeric characters.
*/
component_number.prototype.clean_value = function( value ) {

	// Ensure the input is treated as a string to prevent errors
	// if value is null, undefined, or a number.
	const string_value = String(value);

	// Replace commas with dots
	const fixed_value = string_value.replace(/,/g, '.');

	// remove non accepted chars
	let cleaned = fixed_value.replace(/[^0-9.-]/g, '');

	if (!cleaned.length) {
		return null;
	}

	// Handling multiple dots: note that the search allows the use of the '...' operator.
	// Do not remove the dots here; do it in 'fix_number_format' instead.

	// Handle minus sign – only allow one at the start
	if (cleaned.includes('-')) {
		cleaned = (cleaned.startsWith('-') ? '-' : '') + cleaned.replace(/-/g, '');
	}


	return cleaned
}//end clean_value



/**
* FIX_NUMBER_FORMAT
* Full parsing pipeline: takes a raw user string (possibly already partly cleaned by
* `clean_value()`) and returns a properly formatted JavaScript number according to the
* ontology type/precision contract, or `null` when the input is not a valid number.
*
* This method is called on the `change` event (when the user leaves the input field), NOT
* on every keystroke.  The result is what gets persisted via `change_value()`.
*
* Pipeline stages:
*  1. Guard: return `null` for `null`, `undefined`, or `""`.
*  2. `clean_value()` — normalise separators and strip forbidden characters.
*     Returns `null` for non-numeric input; guarded before `split()` to avoid a TypeError
*     (UIUX-02: `null.split('.')` threw on previously unsanitised input).
*  3. Multiple-dot collapse — keeps only the first dot as the decimal separator
*     (e.g. `3.1.4` → `3.14`); the search range operator `1...7` is never passed here
*     because search mode skips `fix_number_format` entirely.
*  4. `Number()` conversion — produces NaN for edge cases; guarded and returns `null`.
*  5. `get_format_number()` — rounds to the configured type/precision.  Its result is
*     checked for NaN as a safety net (UIUX-02 guard).
*
* The decimal separator on output is always `.` (JS standard).  Display-layer
* internationalisation (e.g. thousands separator, localised decimal comma) is applied in
* the view, never persisted.
*
* @param {string|number|null} value - Raw or partly-cleaned input value.
* @returns {number|null} Parsed and formatted number, or `null` when `value` cannot be
*   interpreted as a valid number.
*/
component_number.prototype.fix_number_format = function( value ) {

	const self = this

	// Initial check for null, undefined, or empty string.
	// Also handles if value is a number 0, which would be falsy but valid.
	// For robust string handling, String(value) is still recommended as in clean_value.
	if (value === null || value === undefined || value === '') {
		return null;
	}

	// 1. Clean the input string using the existing clean_value function.
	//    clean_value is expected to return a cleaned string (e.g., "17.2") or null.
	let cleaned_string = self.clean_value(value);

	// UIUX-02: clean_value returns null for input with no numeric chars. Guard
	// BEFORE split() — calling null.split('.') threw a TypeError on non-numeric input.
	if (cleaned_string === null) {
		return null;
	}

	// Handle multiple dots - keep only the first one
	const parts = cleaned_string.split('.');
	if (parts.length > 2) {
		cleaned_string = parts[0] + '.' + parts.slice(1).join('');
	}

	// 2. Convert the cleaned string to a JavaScript number.
	const numeric_value = Number(cleaned_string);

	// If the conversion results in NaN (e.g., cleanedString was "" or just "-")
	// or if the cleanedString only contained a minus sign which resulted in 0,
	// then it's not a valid number.
	if (isNaN(numeric_value)) {
		return null;
	}

	// 3. Apply additional formatting using get_format_number.
    //    Since get_format_number returns a NUMBER, we can directly use its result.
    const final_formatted_number = get_format_number(self, numeric_value);

    // 4. Final check: Ensure that get_format_number itself didn't return NaN.
    //    This is a safety net in case get_format_number has edge cases where it
    //    might produce an invalid number (e.g., if it attempts a division by zero).
    if (isNaN(final_formatted_number)) {
        // Log a warning if get_format_number behaved unexpectedly.
        console.error("get_format_number returned NaN for input:", numeric_value);
        return null;
    }


    return final_formatted_number;
}//end fix_number_format



/**
* GET_STEPS
* Derives the HTML `<input step>` attribute value from the ontology type/precision
* configuration so that the browser's native number-spinner increments in a quantity
* that matches the component's precision contract.
*
* Algorithm:
*   - For `type: "float"` with `precision N`: produces `"0.0…01"` (N-1 zeros, then "1"),
*     e.g. precision 2 → step `0.01`, precision 4 → step `0.001`.
*   - For `type: "int"`: produces step `1` (integer increments).
*
* Implementation note: `base = 0` is formatted with `toFixed(precision - 1)` to get the
* leading `"0."` and the correct number of zeros, then `"1"` is concatenated.  The result
* is cast to `Number` so the caller receives a numeric primitive (e.g. `0.01`, not the
* string `"0.01"`).
*
* Reads directly from `self.context.properties` (not the optional-chain form used by
* `get_format_number`), so `context.properties` must exist before this method is called.
*
* @returns {number} The step value to assign to the input element (e.g. `0.01` for
*   `precision: 2`, or `1` for `type: "int"`).
*/
component_number.prototype.get_steps = function() {

	const self = this

	// get properties or default values
	const type		= self.context.properties.type || 'float'
	const precision	= self.context.properties.precision || 2

	const base = 0

	const string_steps = (type === 'float')
		? base.toFixed( precision -1 )
		: base.toFixed();

	const steps = string_steps+'1'

	return Number( steps )
}//end get_steps



// @license-end
