// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_dd_label} from './render_tool_dd_label.js'



/**
* TOOL_DD_LABEL
* Visual editor for tool i18n label tables stored as JSON in component_json (dd1372).
*
* Purpose and scope
* -----------------
* Dédalo tools can expose a JSON array of label objects — one per logical label key ×
* language combination — so that UI strings are editable through the normal Dédalo
* interface rather than being hard-coded.  This tool renders that array as an
* interactive matrix:
*
*   rows    = unique label keys (the `name` property of each datum object)
*   columns = one column per project language from `page_globals.dedalo_projects_default_langs`
*
* Each cell is a `contenteditable` div.  Changes are written back into the caller's
* JSON editor (component_json) immediately via `update_data`, but not persisted to the
* server until the user explicitly clicks the save button on the caller component.
*
* Activation context
* ------------------
* The tool is activated exclusively from section `dd1340` (tool registry), component
* `dd1372` (Tool labels field).  It reads the editor's *current in-memory value* — not
* the last-saved value — so unsaved edits are preserved across label-editing sessions.
*
* Data shape — `ar_data` (the label array)
* -----------------------------------------
* Each element is a plain object:
*   {
*     lang  : {string}  — IETF-style lang code, e.g. 'lg-eng', 'lg-spa'
*     name  : {string}  — machine-readable label key, e.g. 'save', 'cancel'
*     value : {string}  — the translated string for this key × language pair
*   }
* Multiple entries share the same `name` but differ in `lang`.  Entries are
* added/removed individually; there is no fixed schema of required names.
*
* Instance properties
* -------------------
* @property {string}           id            — Unique instance identifier (set by tool_common.init).
* @property {Object}           model         — Resolved tool model from context/API (tool_common).
* @property {string}           mode          — Current render mode (e.g. 'edit').
* @property {HTMLElement}      node          — Root DOM node of the rendered tool.
* @property {Array}            ar_instances  — Child component instances managed by this tool.
* @property {string}           status        — Lifecycle status string (e.g. 'active', 'destroyed').
* @property {Array}            events_tokens — Registered event subscription tokens for cleanup.
* @property {string}           type          — Tool type identifier ('tool_dd_label').
* @property {Object}           caller        — The component_json instance that opened this tool.
* @property {string}           last_value    — Stringified JSON snapshot of `ar_data` at the
*                                              last `update_data` call; used to skip redundant writes.
* @property {Array<Object>}    ar_data       — The live label array (see data shape above).
* @property {Array<string>}    ar_names      — Ordered, deduplicated list of `name` values derived
*                                              from `ar_data`; drives the row order in the matrix.
* @property {Array<Object>}    loaded_langs  — Language objects `{value, label}` from
*                                              `page_globals.dedalo_projects_default_langs`; one
*                                              column per entry in the matrix header.
* @property {Error|undefined}  error         — Set when `init` fails; causes `render` to fall back
*                                              to the error renderer supplied by tool_common.
*/
export const tool_dd_label = function () {

	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type
	this.caller

	// string last value. Stringified JSON value stored to check new values before save
	this.last_value

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_dd_label.prototype.render	= tool_common.prototype.render
	tool_dd_label.prototype.destroy	= common.prototype.destroy
	tool_dd_label.prototype.refresh	= common.prototype.refresh
	tool_dd_label.prototype.build	= tool_common.prototype.build
	tool_dd_label.prototype.edit	= render_tool_dd_label.prototype.edit



/**
* INIT
* Initialises the tool instance after the generic tool_common.init completes.
*
* Steps performed here (in addition to the base init):
*  1. Loads the project language list from `page_globals.dedalo_projects_default_langs`
*     into `self.loaded_langs` — these become the matrix columns.
*  2. Resolves the caller's first editor (`caller.editors[0]`) — the JSON editor
*     widget that owns the raw label data.
*  3. Reads the editor's *current in-memory value* (not the server-saved value), so
*     that unsaved changes the user may have made to the JSON field are preserved.
*     The editor may return either `{json: <Object>}` or `{text: <string>}` depending
*     on its internal parse state; both forms are normalised to a plain JS object.
*  4. Coerces the result to an array (`ar_data`), handling null and single-object cases.
*  5. Extracts the unique ordered list of `name` values into `self.ar_names` using a
*     Set to drive the matrix rows in render.
*
* If the caller has no editor, an Error is caught, stored in `self.error`, and logged;
* the base `common_init` return value is still returned so tool_common can display the
* error renderer.
*
* @param {Object} options - Initialisation options forwarded to tool_common.prototype.init.
* @returns {Promise<boolean>} common_init — The return value from tool_common.prototype.init.
*/
tool_dd_label.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// languages
			self.loaded_langs = page_globals.dedalo_projects_default_langs

		// editor
			const editor = self.caller?.editors?.[0];
			if (!editor) {
				throw new Error("Editor not found.");
			}

		// data.
			// Get directly from editor instead from component. This allow get the current
			// edited version even when user has not saved
			const editor_data = (function(){

				const data = editor.get()
				// editor can get json object or stringify json (it depends of process status and it can not controlled)
				const json_data	= data.json !== undefined
					? data.json
					: data.text===''
						? null
						: JSON.parse( data.text )

				return json_data
			})()

			// Ensure ar_data is always an array
			const ar_data = Array.isArray(editor_data)
				? editor_data
				: editor_data
					? [editor_data]
					: []

		// fix ar_data
			self.ar_data = ar_data

		// ar_names. Column names: Extract unique 'name' values from ar_data
			self.ar_names = [...new Set(self.ar_data.map(item => item.name))];

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* UPDATE_DATA
* Writes the current `ar_data` state back into the JSON editor and the caller component.
*
* Guards against redundant writes by comparing the serialised `ar_data` against
* `self.last_value` (the snapshot from the previous call).  If nothing has changed the
* function returns `undefined` early, avoiding spurious editor updates and "dirty" flags.
*
* When a change is detected:
*  1. A deep clone of `ar_data` is produced via `JSON.parse(JSON.stringify(...))` so
*     the editor receives an immutable value and cannot mutate the live array.
*  2. The clone is pushed into the editor via `editor.set({json: ...})`.
*  3. The caller component (component_json) is notified via `set_value(value, index)`;
*     index `0` targets the first (and only) data row of the component.
*  4. `last_value` is updated to prevent the next identical call from re-writing.
*
* (!) This function does NOT save to the server.  Persistence requires the user to
*     click the save button on the caller component_json.
*
* @returns {boolean|undefined} true when data was written; undefined when skipped (no change).
*/
tool_dd_label.prototype.update_data = function() {

	const self = this

	// inmutable_value. JSON editor prefers immutable
		const inmutable_value = JSON.parse(JSON.stringify(self.ar_data))

	// not changed value case
		if (self.last_value===JSON.stringify(inmutable_value)) {
			return
		}

	// editor
		const editor = self.caller.editors[0]
		editor.set({
			json : inmutable_value
		})

	// update caller (component_json) value
		self.caller.set_value(inmutable_value, 0)

	// last value. Set to compare with new calls
		self.last_value = JSON.stringify(inmutable_value)


	return true
}//end update_data



/**
* ON_CLOSE_ACTIONS
* Executes specific action on close the tool
* @param {string} open_as - Open mode: 'modal' or 'window'.
* @returns {Promise<boolean>}
*/
tool_dd_label.prototype.on_close_actions = async function(open_as) {

	const self = this

	if (open_as==='modal') {
		// self.caller.refresh() // never refresh caller (component_json)
		self.destroy(true, true, true)
	}

	return true
}//end on_close_actions



/**
* SAVE_LABEL_LANG_SEQUENCE
* Persists a single label cell edit into `ar_data`, then flushes via `update_data`.
*
* Called on every `blur` and Enter-keydown event from the `contenteditable` cells
* rendered by `render_tool_dd_label`.  Handles three distinct cases:
*
*  1. Empty value AND no existing record  →  no-op (early return).
*     Avoids creating dangling `{name, lang, value: ''}` entries.
*
*  2. Empty value WITH an existing record  →  the entry is removed from `ar_data`
*     (splice by index) and `update_data` is called.  This mirrors deletion semantics:
*     clearing a cell removes the label for that language.
*
*  3. Non-empty value:
*     a. If an existing record for (name × lang) is found, its `value` property is
*        updated in-place.
*     b. If no record exists yet, a new `{lang, name, value}` object is pushed into
*        `ar_data`.
*     In both sub-cases `update_data` is called to flush.
*
* The `key` parameter is a positional row index into `self.ar_names`, not a primary
* key.  The actual label key (`name`) is resolved via `self.ar_names[key]` so that
* the function remains correct even when rows have been dynamically reordered or
* removed in the same session.
*
* @param {string} value - The text entered by the user; empty string means "delete".
* @param {number} key   - Zero-based index of the row in `self.ar_names`.
* @param {string} lang  - Language code (e.g. 'lg-eng') identifying the column.
* @returns {void}
*/
tool_dd_label.prototype.save_label_lang_sequence = function (value, key, lang) {

	const self = this

	// key name
	const name = self.ar_names[key]

	// data
	const data = self.ar_data.find(item => item.name===name && item.lang===lang )

	// empty value and has not previous data set
	if( !value && typeof data==='undefined' ){
		return
	}

	// empty value with previous data set
	if( !value && typeof data!=='undefined' ){

		const index = self.ar_data.findIndex( item => item.name===name && item.lang===lang )

		if(index === -1){
			return
		}

		self.ar_data.splice(index, 1)

		// update_data. Updates caller data
		// update the data into the instance, prepared to save
		// (but is not saved directly, the user need click in the save button)
		self.update_data()
		return
	}

	if(typeof data!=='undefined'){

		// update data value
		data.value = value

	}else{

		const new_data = {
			lang	: lang,
			name	: name,
			value	: value
		}
		self.ar_data.push(new_data)
	}

	// update_data. Updates caller data
	// update the data into the instance, prepared to save
	// (but is not saved directly, the user needs click the save button)
	self.update_data()
}//end save_label_lang_sequence



// @license-end
