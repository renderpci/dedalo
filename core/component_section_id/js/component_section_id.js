// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_SECTION_ID
* Client-side facade component that surfaces a section's integer primary key (`section_id`)
* as a first-class Dédalo component, allowing the record id to be displayed, filtered, and
* exported alongside regular component values.
*
* Responsibilities:
* - Display the read-only section id in edit, list, and tm (Time Machine) modes.
* - Provide an interactive numeric search input in search mode, with operators such as
*   ranges (`100...200`), comma-separated id lists (`1,5,8`), and comparison operators
*   (`>=50`, `!=123`). Multi-line paste is normalised to a comma-separated sequence.
* - Validate raw user input via `validate_input()`, stripping non-digit characters for
*   safety and consistency with the server-side SQO numeric parser.
* - Report emptiness via `is_empty()` so the section search UI can hilite this component's
*   wrapper whenever it carries an active search value.
*
* This component is a **virtual, read-only** facade:
* - The id is owned by the section-row integer column `section_id`, NOT by a JSONB data
*   column. `set_data()` and `save()` on the server are intentional no-ops.
* - No tools are wired (`get_tools()` returns `[]` on the server side).
* - Not translatable; always uses `lg-nolan` (`DEDALO_DATA_NOLAN`).
* - The special tipo `dd1573` (`DEDALO_TIME_MACHINE_COLUMN_ID`) maps to the `id` column
*   instead of `section_id` (resolved in the PHP `get_order_path()`).
*
* Data shape: `this.data.entries` is an `Array` containing a single integer (the id)
* or `[null]` when no id is available. In search mode the entries hold filter value objects.
*
* Render sub-modules:
* - `render_edit_component_section_id`  → edit / line / print views
* - `render_list_component_section_id`  → list / tm (tm reuses the list renderer)
* - `render_search_component_section_id` → search view (the only interactive mode)
*
* @see component_common  Generic lifecycle: init → build → render → save → destroy.
* @see render_edit_component_section_id   Edit-mode view dispatch.
* @see render_list_component_section_id   List / TM view dispatch.
* @see render_search_component_section_id  Search-filter view and numeric input handling.
* @see docs/core/components/component_section_id.md  Full data-model and search-operator reference.
*/

// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_section_id} from './render_edit_component_section_id.js'
	import {render_list_component_section_id} from './render_list_component_section_id.js'
	import {render_search_component_section_id} from './render_search_component_section_id.js'



/**
* COMPONENT_SECTION_ID
* Constructor. Declares the standard instance properties shared by all Dédalo components.
* All fields are initialised to null; `component_common.prototype.init()` populates them
* from the options object received at mount time.
*
* Property notes (component-specific context):
* - `model`        – always `'component_section_id'` for this class.
* - `tipo`         – ontology tipo of this component instance, e.g. `'dd784'`.
* - `section_tipo` – ontology tipo of the owning section, e.g. `'dd153'`.
* - `section_id`   – integer id of the current record; also the value this component
*                    surfaces. Populated by `component_common.prototype.init()`.
* - `mode`         – render mode: `'edit'`, `'list'`, `'tm'`, or `'search'`.
* - `lang`         – always `'lg-nolan'` (non-translatable component).
* - `section_lang` – active language of the owning section; unused here (no translations).
* - `context`      – structure context object loaded from the ontology; holds `view`,
*                    `properties`, `tools`, etc.
* - `data`         – client datum object; `data.entries` is an Array with the section id
*                    as its single element (e.g. `[1]`), or `[null]` when unavailable.
* - `parent`       – tipo of the parent grouper / section that contains this component.
* - `node`         – reference to the component's root DOM node once rendered.
* - `id`           – unique DOM-level identifier assigned by the lifecycle layer.
*/
export const component_section_id = function(){

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
	this.id				= null
}//end component_section_id



/**
* COMMON FUNCTIONS
* Extend component_section_id with shared prototype methods from component_common and common.
* No own implementations are required for these methods; all logic lives in the shared prototypes.
*
* Notes:
* - `tm` (Time Machine) reuses the standard list renderer unchanged — both modes display the
*   record id read-only; only the data source differs (current vs. historical snapshot).
* - `save` and `update_data_value` are inherited from component_common but are effectively
*   no-ops on the server for this component: the id is not stored in the JSONB data column.
* - `build_rqo` builds the request query object used to fetch context + data from the API.
*/
	// lifecycle
	component_section_id.prototype.init					= component_common.prototype.init
	component_section_id.prototype.build				= component_common.prototype.build
	component_section_id.prototype.render				= common.prototype.render
	component_section_id.prototype.refresh				= common.prototype.refresh
	component_section_id.prototype.destroy				= common.prototype.destroy

	// change data
	component_section_id.prototype.save					= component_common.prototype.save
	component_section_id.prototype.update_data_value	= component_common.prototype.update_data_value
	component_section_id.prototype.update_datum			= component_common.prototype.update_datum
	component_section_id.prototype.change_value			= component_common.prototype.change_value
	component_section_id.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_section_id.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_section_id.prototype.list					= render_list_component_section_id.prototype.list
	component_section_id.prototype.tm					= render_list_component_section_id.prototype.list // TM mode reuses the list renderer; data source differs (historical snapshot)
	component_section_id.prototype.edit					= render_edit_component_section_id.prototype.edit
	component_section_id.prototype.search				= render_search_component_section_id.prototype.search

	component_section_id.prototype.change_mode			= component_common.prototype.change_mode



/**
* IS_EMPTY
* Determines whether the component currently holds an active (non-empty) value.
* Called by the search UI to decide whether to apply a visual "has value" highlight
* on the component's wrapper element.
*
* Checks `this.data.entries`: an empty array means no filter value has been entered yet.
* A first entry that is truthy (non-null, non-zero, non-empty string) means the user has
* typed a search query. The double-check on `entries[0]` guards against a sparse array or
* an entry that was explicitly set to a falsy value (e.g. `null` after a clear action).
*
* (!) `this.data` is accessed via optional chaining (`?.`) because in the brief window
* between construction and `init()` completion the data object may not yet be populated.
*
* @returns {boolean} `true` when the component has no active value; `false` when it does.
*/
component_section_id.prototype.is_empty = function() {

	const entries = this.data?.entries || []

	if(entries.length === 0) {
		return true
	}

	// Double check first entry exists (safety)
	if(entries[0]) {
		return false
	}

	return true
}//end is_empty



/**
* VALIDATE_INPUT
* Strips all non-digit characters from the raw user input, constraining the value to
* whole positive integers only.
*
* Called by the search view's `input` event handler on every keystroke so that the text
* field only ever contains digits. This client-side gate complements the server-side
* numeric cast applied in the search trait, preventing invalid strings from reaching the
* SQL layer.
*
* Note: the search operators (`...`, `,`, `>`, `<`, `=`, `!=`) are handled at a higher
* level in the paste handler and the search render layer; this method is intentionally
* digit-only and does NOT preserve operator characters. The search render view's input
* handler (`render_search_component_section_id`) uses its own broader regex
* (`/[^\d.,><=]/g`) to accommodate operators — `validate_input` is the stricter variant
* used when the component is wired up outside of search mode.
*
* @param {string} value - Raw string from the input element.
* @returns {string} The input with every non-digit character removed; may be an empty string.
*/
component_section_id.prototype.validate_input = function( value ) {

	value = value.replace(/[^\d]/g, '');

	return value
}//end validate_input



// @license-end
