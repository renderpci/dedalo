// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_INPUT_TEXT
* Dédalo client-side component for single-line, plain-text string fields.
*
* Responsibilities:
* - Holds one or more short text strings per record in `this.data.entries` (multi-value
*   via entries array; each entry is `{id, value, lang?}`).
* - Optionally validates input on each keystroke using a regex rule from
*   `context.properties.validation` (client-side shaping only; see `validate()`).
* - Optionally enforces uniqueness across the same `section_tipo` by querying the API
*   via `find_equal()` and surfacing an inline warning with a link to the conflicting record.
* - Delegates rendering to the per-mode render sub-modules:
*     - `render_edit_component_input_text`  → edit / line / text / mini / colorpicker / print
*     - `render_list_component_input_text`  → list / tm (time-machine reuses list)
*     - `render_search_component_input_text` → search
* - Inherits the full component lifecycle (init → build → render → save → destroy) from
*   `component_common` and `common`.
*
* Data shape (`this.data.entries`): Array of plain objects
*   `{ id: number|null, value: string, lang: string }`
* One entry per value item (translatable components hold one entry per language per item;
* search mode can hold SQO-filter objects instead of persisted datum objects).
*
* Relevant `context.properties` keys consumed by this component:
*   `unique`      – enables `find_equal` duplicate check on every change
*   `mandatory`   – toggles `mandatory` CSS class when the input is empty
*   `validation`  – `{mode, regex, options, replace, process}` object for `validate()`
*   `has_dataframe` – pairs the component with a component_dataframe for structured metadata
*
* @see component_common  Generic lifecycle, save, change_value, mode-switch.
* @see render_edit_component_input_text   Edit-mode view dispatch.
* @see render_list_component_input_text   List / TM view dispatch.
* @see render_search_component_input_text  Search-filter view and ontology7 TLD-split logic.
* @see docs/core/components/component_input_text.md  Full data-model and properties reference.
*/

// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common, create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {events_subscription} from './events_subscription.js'
	import {render_edit_component_input_text} from '../../component_input_text/js/render_edit_component_input_text.js'
	import {render_list_component_input_text} from '../../component_input_text/js/render_list_component_input_text.js'
	import {render_search_component_input_text} from '../../component_input_text/js/render_search_component_input_text.js'



/**
* COMPONENT_INPUT_TEXT
* Constructor. Declares all instance properties used throughout the lifecycle.
* All fields are initialised to null (or a sensible default); `component_common.init()`
* populates them from the options object passed at mount time.
*
* Property notes:
* - `find_equal_cache`      – per-instance Map keyed by value string; stores the matching
*                             `section_id` (or null when no duplicate) so repeated keystrokes
*                             do not re-query the API for the same string.
* - `find_equal_request_id` – monotonically incremented counter for stale-response detection;
*                             `find_equal()` discards any response whose counter no longer
*                             matches the current value, preventing race conditions when the
*                             user types faster than the API responds.
* - `search_q_operator_default` – Map of `component_tipo → q_operator` overrides used in
*                             search mode. The only built-in entry pins `ontology7` (TLD
*                             field) to exact-match `'=='` instead of the default `'like'`.
* - `minimum_width_px`      – CSS minimum-width hint read by the view layer to prevent the
*                             component from collapsing in compressed grid layouts.
* - `q_split`               – when true, the search layer allows the query string to be
*                             tokenised into sub-terms (space-split AND logic) server-side.
*                             Set to false per-instance to force whole-string matching.
*/
export const component_input_text = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null

	this.duplicates		= false

	// find_equal cache and concurrency control
	this.find_equal_cache		= new Map()
	this.find_equal_request_id	= 0

	// search_q_operator_default. Map of component tipos that will use default search operator
	this.search_q_operator_default = new Map([
		['ontology7', '=='] // Ontology TLD field
	])

	// ui
	this.minimum_width_px = 90 // integer pixels

	// search config
	this.q_split = true
}//end component_input_text



/**
* COMMON FUNCTIONS
* Extend component_input_text with shared prototype methods from component_common and common.
* No own implementations for these methods — all logic lives in the shared prototypes.
* The `tm` (Time Machine) render mode reuses the standard list renderer unchanged.
*/
// prototypes assign
	// lifecycle
	component_input_text.prototype.init					= component_common.prototype.init
	component_input_text.prototype.build				= component_common.prototype.build
	component_input_text.prototype.render				= common.prototype.render
	component_input_text.prototype.refresh				= common.prototype.refresh
	component_input_text.prototype.destroy				= common.prototype.destroy
	component_input_text.prototype.events_subscription	= events_subscription

	// change data
	component_input_text.prototype.save					= component_common.prototype.save
	component_input_text.prototype.update_data_value	= component_common.prototype.update_data_value
	component_input_text.prototype.update_datum			= component_common.prototype.update_datum
	component_input_text.prototype.change_value			= component_common.prototype.change_value
	component_input_text.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_input_text.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_input_text.prototype.list					= render_list_component_input_text.prototype.list
	component_input_text.prototype.tm					= render_list_component_input_text.prototype.list // TM view reuses the standard list renderer
	component_input_text.prototype.edit					= render_edit_component_input_text.prototype.edit
	component_input_text.prototype.search				= render_search_component_input_text.prototype.search

	component_input_text.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
* Initialises the component instance by delegating to the shared `component_common.prototype.init`.
* All property wiring (tipo, section_tipo, section_id, lang, context, data, parent, node …)
* happens inside that call; component_input_text-specific state is already set in the constructor.
*
* (!) Override of the prototype-assigned `component_common.prototype.init` — this method is
* declared AFTER the prototype block so it takes precedence on the instance chain. Any
* additional component-specific setup before/after the common call should be added here.
*
* @param {Object} options - Mount-time options object (tipo, section_tipo, section_id, mode,
*   lang, parent, caller, …) passed from the parent section or portal.
* @returns {Promise<boolean>} Resolves to the result of `component_common.prototype.init`,
*   which is `true` on success or `false` when the init could not complete.
*/
component_input_text.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await component_common.prototype.init.call(self, options);

	return common_init
}//end init



/**
* FIND_EQUAL
* Checks whether the given value already exists in the database for the same section_tipo,
* excluding the current record so a user editing an existing title is not warned about
* their own record.
*
* Two concurrency guards prevent race conditions and unnecessary API traffic:
*  1. Cache (`find_equal_cache`, keyed by value string) — returns a stored result immediately
*     on cache hit, avoiding a round-trip for repeated keystrokes with the same value.
*     The cache stores `null` for values with no duplicate (falsy, not cache-miss).
*     The render layer (`check_duplicates`) must invalidate the cache entry for the OLD value
*     before calling this method, because a rename might free the old string.
*  2. Request ID (`find_equal_request_id`) — a monotonically incrementing counter captured at
*     call start. If the counter has advanced by the time the API responds (i.e. the user
*     typed again while the request was in flight), the stale response is discarded and null
*     is returned rather than showing a potentially wrong warning.
*
* The SQO uses `skip_projects_filter: true` so that duplicates are detected across all
* projects in the installation, not only the current project's records. This is intentional
* for fields such as inventory numbers that must be globally unique.
* `ddo_map: []` in `show` suppresses component data in the response, reducing payload size.
*
* @param {string} value - The text string to look up. Empty strings return null immediately.
* @returns {Promise<number|null>} Resolves to the `section_id` (integer) of the first
*   matching record in the same `section_tipo`, or null when no duplicate is found or when
*   the response was discarded as stale.
*/
component_input_text.prototype.find_equal = async function(value) {

	const self = this

	// empty case
		if (!value || value.length<1) {
			return null
		}

	// cache hit
		const cache_key = value
		if (self.find_equal_cache.has(cache_key)) {
			if(SHOW_DEBUG===true) {
				console.log('---> find_equal cache hit for:', cache_key);
			}
			return self.find_equal_cache.get(cache_key)
		}

	// concurrency control: increment request ID and capture it
		const current_request_id = ++self.find_equal_request_id

	// sqo
		const sqo = {
			section_tipo			: [self.section_tipo],
			skip_projects_filter	: true,
			limit					: 1,
			filter					: {
				$and : [
					{
						q			: {value : value},
						q_operator	: '==',
						q_split		: false,
						path		: [
							{
								component_tipo	: self.tipo,
								model			: self.model,
								name			: self.label || '',
								section_tipo	: self.section_tipo
							}
						]
					},
					{
						q			: self.section_id,
						q_operator	: '!=',
						path		: [
							{
								component_tipo	: 'section_id',
								model			: 'component_section_id',
								name			: 'Dummy section id',
								section_tipo	: self.section_tipo
							}
						]
					}
				]
			}
		}

	// source
		const source = create_source(self, 'search')
		// prevent to write session for this temporal SQO
		source.session_save = false

	// show. Add empty ddo_map to minimize server resources use
		const show = {
			ddo_map : []
		}

	// load data
		const api_response = await data_manager.request({
			use_worker	: true,
			body		: {
				dd_api	: 'dd_core_api',
				action	: 'read',
				source	: source,
				show	: show,
				sqo		: sqo
			}
		})

	// stale request check: a newer call was made while we were waiting
		if (self.find_equal_request_id !== current_request_id) {
			if(SHOW_DEBUG===true) {
				console.log('---> find_equal stale response discarded for:', value);
			}
			return null
		}

	// debug
		if(SHOW_DEBUG===true) {
			console.warn('---> find_equal api_response', api_response);
		}

	// check api_response
		if (!api_response || !api_response.result) {
			console.error('Error on find_equal: invalid api_response', api_response);
			return null
		}

	// data
		const data = api_response.result.data || []

	// record data results from search
	// The 'sections' envelope is ALWAYS emitted (one item, tipo = the caller tipo,
	// which for this component-sourced search IS self.tipo), and its entries are
	// the MATCHED ROWS — so a no-duplicate result is a PRESENT item with an EMPTY
	// entries array, not a missing item. entries[0] must never be assumed.
		const record = data.find(item => item.tipo===self.tipo)
		const duplicate = record?.entries?.[0]
		if (duplicate) {
			const section_id = duplicate.section_id || null
			// cache the result
			self.find_equal_cache.set(cache_key, section_id)
			return section_id
		}

	// cache null result too (no duplicate found)
		self.find_equal_cache.set(cache_key, null)

	return null
}//end find_equal



/**
* VALIDATE
* Applies the client-side input-shaping rule defined in `context.properties.validation`
* to produce a sanitised version of the user's raw input. Called on every change event
* in the edit view (`change_handler`) when `context.properties.validation` is set.
*
* Supported shape for `context.properties.validation`:
* ```json
* {
*   "mode"    : "replace",
*   "regex"   : "[\\d\\s]",
*   "options" : "g",
*   "replace" : "",
*   "process" : "toLowerCase"
* }
* ```
*
* Only one mode is currently implemented: `"replace"`. It builds a `RegExp` from
* `validation.regex` and `validation.options`, then runs `String.prototype.replace`.
* If `validation.process` is present, the named method is called on the result (e.g.
* `"toLowerCase"` → `safe_value.toLowerCase()`). Unknown modes fall through the switch
* and return the original value unchanged.
*
* (!) `validation.process` is executed via property access on the string (e.g.
* `safe_value[validation.process]()`). Only standard `String.prototype` method names
* should appear in the ontology configuration — no input sanitisation is performed on the
* method name itself.
*
* Returns the original value immediately when it is an empty string (no validation needed
* for a clear-field action). If `validation.mode` is missing, a `console.warn` is emitted
* and the original value is returned unchanged.
*
* @param {string} value - The raw string from the input element.
* @returns {string} The shaped/safe version of the input, or the original value when no
*   transformation applies.
*/
component_input_text.prototype.validate = function( value ) {

	const self = this

	// empty string case
		if (value.length<1) {
			return value
		}

	// properties validation
	// sample definition in properties:
	//  "validation": {
	//		"mode": "replace",
	//		"regex": "[\\d\\s]",
	//		"options": "g",
	//		"replace": "",
	//		"process": "toLowerCase"
	// }
		const validation = self.context.properties.validation || {}
		if (!validation.mode) {
			console.warn('Undefined context.properties.validation !', self.context.properties );
			return value
		}

	// switch validation mode
	switch (validation.mode) {
		case 'replace': {
			// regex replace
				const re = new RegExp(
					validation.regex,
					validation.options || ''
				)
				const safe_value = value.replace(re, validation.replace)

			// process optional
				if (validation.process) {
					// like 'toLowerCase' to exec str.toLowerCase()
					return safe_value[validation.process]()
				}

			return safe_value
		}
		default:

			break;
	}

	return value
}//end validate




/**
* GET_FALLBACK_VALUE --> MOVED TO COMMON !
* Fallback-value resolution for missing language versions was extracted to component_common
* (`component_common::get_component_data_fallback`) so that all string-based components
* share a single implementation. The dead code below is preserved for historical reference.
* @returns {Array} values data with fallback markers applied
*/
	// component_input_text.prototype.get_fallback_value = (value, fallback_value)=>{

	// 	const fallback		= []
	// 	const value_length	= (value.length===0)
	// 		? 1
	// 		: value.length

	// 	for (let i = 0; i < value_length; i++) {

	// 		if(value[i]){

	// 			fallback.push(value[i])

	// 		}else{

	// 			const marked_value = (fallback_value && fallback_value[i])
	// 				? "<mark>"+fallback_value[i]+"</mark>"
	// 				: ""

	// 			fallback.push(marked_value)
	// 		}
	// 	}

	// 	return fallback
	// }//end get_fallback_value



// @license-end
