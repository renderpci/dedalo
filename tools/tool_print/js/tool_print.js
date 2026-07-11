// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals */
/*eslint no-undef: "error"*/



/**
* TOOL_PRINT
*
* Visual print-layout tool. Section-scoped (shown in the section list toolbar
* and the record inspector, like tool_export). It inherits its target and data
* scope from the calling section:
*   - edit mode  → the single caller record (self.caller.section_id)
*   - list mode  → the records matching the user's current filter (self.sqo)
*
* The editor (render_tool_print) lets the user lay out a section's components
* on printable pages via a drag-and-drop canvas. Layout templates are saved per
* section_tipo as dd25 records (see print_layout_presets.js) and reloaded via
* self.current_template_id.
*
* Lifecycle: init → build → render (delegated to render_tool_print.edit).
*
* Exports:
*   tool_print — the constructor function; wire_tool stamps lifecycle prototypes.
*/

import {data_manager} from '../../../core/common/js/data_manager.js'
import {common} from '../../../core/common/js/common.js'
import {tool_common, wire_tool} from '../../../core/tools_common/js/tool_common.js'
import {render_tool_print, PRINT_MAX} from './render_tool_print.js'
import {ensure_portal_meta, is_relation_model} from './render_box_tool_print.js'
import {on_dragstart} from '../../tool_export/js/drag_tool_export.js'



/**
* TOOL_PRINT
* Constructor for tool_print instances.
*
* Declares every instance property used by the tool. wire_tool (called
* immediately below) stamps the shared lifecycle methods (render, destroy,
* refresh) and delegates the edit-render path to render_tool_print.edit.
*
* Instance properties (grouped by concern):
*
*   tool_common core:
*     id, model, mode, node, ar_instances, events_tokens, status, type,
*     caller, langs — seeded by tool_common.prototype.init.
*
*   caller context (resolved in init):
*     source             — rqo.source forwarded from the calling section.
*     sqo                — rqo.sqo forwarded from the calling section; contains
*                          section_tipo, filter_by_locators, limit, offset, etc.
*     target_section_tipo — the ontology tipo of the section being printed.
*     section_elements   — component context descriptors for the palette, loaded
*                          by get_section_elements_context in build.
*     section_elements_components_exclude — component models to omit from the
*                          palette (e.g. 'component_password' should never print).
*
*   preview record:
*     preview_section_id — section_id of the record used to fill placeholder
*                          content in the editor canvas. Resolved in priority order
*                          by init (caller.section_id_selected → caller.section_id
*                          → sqo.filter_by_locators → caller.ar_section_id → async
*                          fetch of first matching record in build).
*     fill_mode          — when true the canvas renders live component data instead
*                          of placeholder labels.
*
*   canvas / layout state:
*     layout             — plain-object layout blob (rows of cells) owned by
*                          canvas_tool_print; written by new_layout/load_layout
*                          and read by serialize_layout/layout_flow.
*     zoom               — current canvas zoom factor (1 = 100 %).
*     id_counter         — monotone counter used by canvas_tool_print to assign
*                          unique cell ids within the current session.
*     print_root         — the .print_root HTMLElement (the paginated canvas
*                          surface); the ONLY subtree that is printed — all chrome
*                          carries .no_print.
*     canvas_container   — wrapper element that hosts print_root plus chrome.
*     current_template_id — section_id of the dd25 template record that was last
*                          loaded/saved; null means the layout is unsaved.
*
*   dirty / palette helpers:
*     section_id         — incremented by get_section_id to produce temporary ids
*                          for palette component instances (never persisted).
*     dirty              — true if the in-memory layout has unsaved changes.
*/
export const tool_print = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.events_tokens		= null
	this.status				= null
	this.type				= null
	this.caller				= null
	this.langs				= null

	// caller context
	this.source				= null
	this.sqo				= null
	this.target_section_tipo= null
	this.section_elements	= []
	this.section_elements_components_exclude = ['component_password']

	// preview record (fills boxes in the editor / print)
	this.preview_section_id	= null
	this.fill_mode			= false

	// canvas / layout state
	this.layout				= null			// the in-memory layout blob
	this.zoom				= 1
	this.id_counter			= 0
	this.print_root			= null
	this.canvas_container	= null
	this.current_template_id= null			// section_id of the loaded template (null = unsaved)

	// tmp section id generator for the draggable palette
	this.section_id			= 0
	this.dirty				= false
}//end tool_print



/**
* COMMON FUNCTIONS
* Prototype wiring for tool_print.
*
* wire_tool stamps render / destroy / refresh onto tool_print.prototype and
* wires the concrete render method (render_tool_print.prototype.edit) as the
* tool's edit entry point, following the standard tool-common contract.
*
* Additional prototype assignments:
*   get_section_elements_context — from common; builds the flat list of
*       component context descriptors that populate the draggable palette.
*   calculate_component_path     — from common; resolves the canonical path
*       array for a component within the section hierarchy (used when building
*       drop payloads).
*   on_dragstart                 — reused from tool_export; encodes a
*       {drag_type:'add', path, ddo} JSON payload into the dataTransfer object
*       when the user starts dragging a component from the palette.
*/
wire_tool(tool_print, render_tool_print)

// extra prototypes
tool_print.prototype.get_section_elements_context	= common.prototype.get_section_elements_context
tool_print.prototype.calculate_component_path		= common.prototype.calculate_component_path
// palette drag (reuse tool_export's payload {drag_type:'add', path, ddo})
tool_print.prototype.on_dragstart					= on_dragstart



/**
* INIT
* Captures the caller context (source, sqo, target_section_tipo) and resolves
* the best available preview record id. Mirrors tool_export.prototype.init.
*
* Delegates first to tool_common.prototype.init (which seeds id, model, mode,
* type, caller, node, status, and tool_config from options), then performs
* tool_print-specific setup:
*
*   1. Calls caller.build(true) to populate the caller's rqo (source + sqo).
*      This is needed even in the modal path because the caller may not have
*      been built yet when the tool was opened.
*
*   2. Derives target_section_tipo from sqo.section_tipo (preferred) or
*      caller.section_tipo as fallback.
*
*   3. Resolves preview_section_id from the first non-null value in:
*        a. caller.section_id_selected (explicit user selection)
*        b. caller.section_id          (the record currently open in the editor)
*        c. sqo.filter_by_locators[0].section_id (edit-mode window path)
*        d. caller.ar_section_id[0]   (list already loaded)
*      If none is available here, build() fetches the first matching record.
*
* @param {Object} options - Tool options passed from open_tool; must include at
*   minimum the caller instance (options.caller) and lang (options.lang).
* @returns {Promise<boolean>} Resolves with the common_init sentinel value.
*/
tool_print.prototype.init = async function(options) {

	const self = this

	const common_init = await tool_common.prototype.init.call(this, options)

	try {

		// build the calling section to populate its rqo (source + sqo)
			if (!self.caller || typeof self.caller.build!=='function') {
				throw new Error('Caller build is not available.')
			}
			await self.caller.build(true)

		// self vars
			self.lang			= options.lang
			self.langs			= page_globals.dedalo_projects_default_langs
			self.events_tokens	= []
			self.ar_instances	= []

		// caller context
			self.source					= self.caller.rqo?.source || null
			self.sqo					= self.caller.rqo?.sqo || null
			self.target_section_tipo	= self.sqo?.section_tipo || self.caller.section_tipo

		// preview record: a record id is needed so dropped boxes show real data.
		// In a new-window open the caller is rebuilt and caller.section_id can be
		// null, but the viewed record is carried in sqo.filter_by_locators
		// (edit mode) or the section's loaded list. An async fallback runs in build.
			const locator_id = (self.sqo && Array.isArray(self.sqo.filter_by_locators) && self.sqo.filter_by_locators[0])
				? self.sqo.filter_by_locators[0].section_id
				: null
			self.preview_section_id = self.caller.section_id_selected
				|| self.caller.section_id
				|| locator_id
				|| (Array.isArray(self.caller.ar_section_id) ? self.caller.ar_section_id[0] : null)
				|| extract_section_ids(self.caller.datum)[0]   // list mode: first loaded record
				|| null

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Loads the section component palette and resolves the preview record, then
* delegates to tool_common.prototype.build for CSS loading and ddo_map setup.
*
* Two things happen beyond the generic build:
*
*   1. get_section_elements_context populates self.section_elements with the
*      flat descriptor list for all printable components of target_section_tipo.
*      component_password is excluded via section_elements_components_exclude
*      (passwords must never appear in a printed output).
*
*   2. If no preview_section_id was established in init (new-window path with no
*      locator context), get_record_ids is called with limit:1 to find the first
*      record that matches the caller sqo. Failure is non-fatal — the canvas
*      simply renders placeholder labels instead of real data.
*
* @param {boolean} [autoload=false] - passed through to tool_common.prototype.build;
*   when true the build also fetches the tool's own context data from the API.
* @returns {Promise<boolean>} Resolves with the common_build sentinel value.
*/
tool_print.prototype.build = async function(autoload=false) {

	const self = this

	const common_build = await tool_common.prototype.build.call(this, autoload)

	try {

		self.section_elements = await self.get_section_elements_context({
			section_tipo			: self.target_section_tipo,
			ar_components_exclude	: self.section_elements_components_exclude
		})

		// resolve a preview record if none was inherited from the caller, so
		// dropped boxes can show real data (use the first record of the filter)
			if (!self.preview_section_id) {
				try {
					const ids = await self.get_record_ids({ limit: 1 })
					self.preview_section_id = (ids && ids.length) ? ids[0] : null
				} catch (e) {
					console.warn('tool_print: could not resolve a preview record', e)
				}
			}

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* GET_SECTION_ID
* Temporary id generator required by render_components_list (palette).
*
* render_components_list needs a section_id per component slot to build unique
* DOM ids and instance keys for each draggable palette entry. This method
* provides a monotone counter-based value in the form 'tmp_print_N'. The ids
* are session-only — they are never persisted to the database.
*
* @returns {string} A unique temporary id of the form 'tmp_print_N' where N
*   increments with each call.
*/
tool_print.prototype.get_section_id = function() {
	const self		= this
	self.section_id	= ++self.section_id
	return 'tmp_print_' + self.section_id
}//end get_section_id



/**
* GET_RECORD_IDS
* Resolves the ordered list of section_id values to print.
*
* The set of records to print depends on how the tool was opened:
*
*   edit mode (caller.mode !== 'list'):
*     Returns [preview_section_id] — the single record currently open in the
*     section editor. Returns [] when no preview record was resolved.
*
*   list mode with explicit selection (sqo.filter_by_locators is non-empty):
*     The user has selected specific records in the list view. Returns the
*     section_id from each locator, preserving order and skipping nullish values.
*
*   list mode without explicit selection:
*     Runs the caller's sqo as a 'search' action to retrieve matching record ids.
*     options.limit overrides the sqo limit (used by build's preview fallback to
*     fetch just one id). Falls back to [preview_section_id] on API error.
*
* The API response shape is normalised: both `result.data` (v7) and
* `result.ar_records` (v6 compat) are accepted; each row may be a plain id
* scalar, or an object with section_id or id property.
*
* @param {Object} [options={}] - Optional overrides.
*   @param {number} [options.limit] - Maximum number of records to fetch in list
*     mode (defaults to sqo.limit ?? 50).
* @returns {Promise<Array<number|string>>} Resolves with the array of section_id
*   values (may be empty).
*/
tool_print.prototype.get_record_ids = async function(options={}) {

	const self = this

	// edit mode: just the caller record
		if (self.caller.mode!=='list') {
			return self.preview_section_id ? [ self.preview_section_id ] : []
		}

	// list mode with an explicit selection of records (filter_by_locators)
		if (self.sqo && Array.isArray(self.sqo.filter_by_locators) && self.sqo.filter_by_locators.length) {
			return self.sqo.filter_by_locators
				.map(l => l && l.section_id)
				.filter(id => id!==null && id!==undefined)
		}

	// list mode: reuse the CALLER section's OWN read request (the working query
	// that loaded the list — action 'read', source.model 'section'). Earlier this
	// used action 'search', which dd_core_api does not implement, so it always
	// returned nothing. IMPORTANT: never mutate the caller's rqo/sqo — clone it, so
	// the user returns to their list with the exact filter intact.
		const want = options.limit ?? (PRINT_MAX + 1)

		// cheap path: the caller already loaded the filtered page; if it covers what
		// we need (e.g. the limit:1 preview probe), use it with no extra request.
		const loaded = extract_section_ids(self.caller && self.caller.datum)
		if (loaded.length >= want) {
			return loaded.slice(0, want)
		}

		const base = self.caller && self.caller.rqo
		if (base) {
			try {
				const rqo = {
					action			: base.action || 'read',
					prevent_lock	: true,
					source			: structuredClone(base.source || {}),
					sqo				: structuredClone(base.sqo || self.sqo || {})
				}
				// fetch all matches up to the cap; don't persist this as the user's search
				rqo.sqo.limit		= want
				rqo.sqo.offset		= 0
				if (rqo.source) rqo.source.session_save = false
				const api_response = await data_manager.request({ body: rqo })
				self._last_record_total = api_response?.result?.total ?? api_response?.result?.pagination?.total ?? null
				const ids = extract_section_ids(api_response?.result)
				if (ids.length) return ids.slice(0, want)
			} catch (error) {
				console.error('tool_print get_record_ids error:', error)
			}
		}

		// last resort: whatever the caller had already loaded
		return loaded.slice(0, want)
}//end get_record_ids



/**
* PRINT_DDO_MAP
* Builds a `show.ddo_map` from the current template's component blocks — the set
* of components whose values the bulk read must hydrate. Each entry mirrors the
* shape a section's request_config uses ({section_tipo, tipo, parent, mode, model,
* view}); 'self' marks a component of the target section. The matching `mode` is
* what the datum lookup keys on later (see render_box_tool_print.get_datum_entry).
* @param {Object} self
* @param {string} target - target_section_tipo
* @returns {Array<Object>} ddo_map entries (de-duplicated by section_tipo|tipo|mode)
*/
const build_print_ddo_map = function(self, target) {
	const blocks = (self.layout?.flow?.rows || [])
		.flatMap(r => Array.isArray(r.cells) ? r.cells : [])
		.map(c => c && c.block)
		.filter(b => b && b.type==='component' && b.component_ref && b.component_ref.tipo)
	const seen = new Set()
	const ddo_map = []
	const RELATION = /portal|relation|autocomplete/
	const push = (e) => {
		const key = e.section_tipo + '|' + e.tipo + '|' + e.mode + '|' + (e.parent||'')
		if (seen.has(key)) return
		seen.add(key)
		ddo_map.push(e)
	}
	for (const b of blocks) {
		const ref = b.component_ref

		if (RELATION.test(ref.model)) {
			// PORTAL/RELATION: request it in edit mode with limit:0 so the read
			// returns ALL its relation rows (not the 10-row edit page) + its column
			// subdatum, in this single read. limit:0 is honored because the ddo
			// scrub now whitelists it (request_config_object::sanitize_client_ddo_map).
			push({
				section_tipo	: (ref.section_tipo===target) ? 'self' : ref.section_tipo,
				tipo			: ref.tipo,
				parent			: target,
				model			: ref.model,
				mode			: 'list',
				view			: ref.view || 'default',
				column_id		: ref.tipo,
				limit			: 0
			})
			// the portal's column children as SIBLING ddos (parent = portal tipo) —
			// how the server resolves a portal's columns (get_children_recursive).
			// A DEEP column (col.path: a chain through nested portals) emits one ddo
			// per chain segment, each parented to the previous (the same parent-link
			// resolution); intermediate portals carry limit:0 so all their rows resolve.
			const cols = (Array.isArray(b.table_columns) && b.table_columns.length ? b.table_columns : b.available_columns) || []
			let ci = 0
			const RELC = /portal|relation|autocomplete/
			cols.forEach((col) => {
				if (!col || col.type!=='component') return
				if (Array.isArray(col.path) && col.path.length) {
					let parent = ref.tipo
					for (const seg of col.path) {
						if (!seg || !seg.tipo || !seg.section_tipo) break
						const e = {
							section_tipo	: Array.isArray(seg.section_tipo) ? seg.section_tipo[0] : seg.section_tipo,
							tipo			: seg.tipo,
							parent			: parent,
							model			: seg.model,
							mode			: 'list',
							column_id		: 'col_' + (ci++),
							fixed_mode		: true
						}
						if (RELC.test(seg.model || '')) e.limit = 0   // intermediate portal: all rows
						push(e)
						parent = seg.tipo
					}
				} else if (col.tipo && col.section_tipo) {
					push({
						section_tipo	: Array.isArray(col.section_tipo) ? col.section_tipo[0] : col.section_tipo,
						tipo			: col.tipo,
						parent			: ref.tipo,
						model			: col.model,
						mode			: 'list',
						column_id		: 'col_' + (ci++),
						fixed_mode		: true
					})
				}
			})
			continue
		}

		// LITERAL: mode matches render_box_content's full_value_mode lookup
		// (edit for text_area to avoid truncation, list otherwise).
		push({
			section_tipo	: (ref.section_tipo===target) ? 'self' : ref.section_tipo,
			tipo			: ref.tipo,
			parent			: target,
			model			: ref.model,
			mode			: (ref.model==='component_text_area') ? 'edit' : 'list',
			view			: 'print'
		})
	}
	return ddo_map
}//end build_print_ddo_map



/**
* FETCH_PRINT_DATUM
* ONE bulk read that hydrates every template component for the given records — the
* way a section list loads its rows. Returns/stashes {context, data} on
* self._print_datum so render_box_content can build each cell with build(false)
* (no per-cell API call). Reuses the caller's working read source (action 'read',
* source.model 'section'); never mutates the caller's search (clone + session_save:false).
* @param {Object} record_ids - section_ids to hydrate
* @returns {Promise<Object|null>} { context, data } or null on failure
*/
tool_print.prototype.fetch_print_datum = async function(record_ids) {

	const self = this
	self._print_datum = null
	if (!Array.isArray(record_ids) || !record_ids.length) return null

	const target = Array.isArray(self.target_section_tipo) ? self.target_section_tipo[0] : self.target_section_tipo
	const base   = self.caller && self.caller.rqo
	if (!target || !base) return null

	// a portal with no user-configured columns needs its DEFAULT column set resolved
	// before the ddo_map is built, so the single read includes those columns (else
	// they'd fall back to slow per-cell builds, or render empty). Cached on the box,
	// so configured portals and repeat fetches skip this.
	const blocks = (self.layout?.flow?.rows || [])
		.flatMap(r => Array.isArray(r.cells) ? r.cells : [])
		.map(c => c && c.block)
		.filter(b => b && b.type==='component' && b.component_ref && is_relation_model(b.component_ref.model))
	for (const b of blocks) {
		if (!(Array.isArray(b.table_columns) && b.table_columns.length)) {
			await ensure_portal_meta(self, b, record_ids[0])
		}
	}

	const ddo_map = build_print_ddo_map(self, target)
	if (!ddo_map.length) return null

	// LIST mode: returns ALL the requested records in one read (edit mode is
	// single-record). Portals are requested with limit:0 in build_print_ddo_map so
	// they still expand to all their relation rows + column subdatum per record.
	const source = structuredClone(base.source || {})
	source.mode			= 'list'
	source.section_id	= null
	source.session_save	= false

	const rqo = {
		api_engine		: 'dedalo',
		type			: 'main',
		action			: base.action || 'read',
		prevent_lock	: true,
		source			: source,
		sqo				: {
			section_tipo		: [target],
			limit				: record_ids.length,
			offset				: 0,
			filter_by_locators	: record_ids.map(id => ({ section_tipo: target, section_id: id }))
		},
		show			: {
			ddo_map		: ddo_map,
			sqo_config	: { full_count: false, limit: record_ids.length, offset: 0, mode: 'list', operator: '$or' }
		}
	}

	try {
		const api_response = await data_manager.request({ body: rqo })
		const result = api_response?.result
		if (result && Array.isArray(result.data)) {
			self._print_datum = { context: result.context || [], data: result.data }
			return self._print_datum
		}
	} catch (e) {
		console.error('tool_print fetch_print_datum error:', e)
	}
	return null
}//end fetch_print_datum



/**
* EXTRACT_SECTION_IDS
* Pulls the matched record ids out of a section read response / loaded datum.
* The read returns a `sections` container element whose `entries` are the record
* locators ({section_tipo, section_id, …}); fall back to rows that directly carry
* section_id. De-duplicates while preserving order.
* @param {Object} datum - a read response (.result), its .data array, or .datum
* @returns {Array<number|string>} ordered, unique section_id values
*/
const extract_section_ids = function(datum) {
	const data = (datum && (datum.data || (datum.result && datum.result.data)))
		|| (Array.isArray(datum) ? datum : null)
	if (!Array.isArray(data)) return []
	const container = data.find(el => el && el.typo==='sections' && Array.isArray(el.entries))
		|| data.find(el => el && Array.isArray(el.entries) && el.entries[0] && el.entries[0].section_id!==undefined)
	const ids = container
		? container.entries.map(e => e && e.section_id)
		: data.map(r => r && (r.section_id ?? r.id))
	return [...new Set(ids.filter(id => id!==null && id!==undefined))]
}//end extract_section_ids



/**
* MARK_DIRTY
* Flags the current layout as having unsaved changes.
*
* Sets self.dirty = true, which is checked by the template-switching logic to
* confirm before discarding the current layout, and by the print trigger to
* decide whether a save prompt is needed. Also reveals the Save button if it
* has been created (self.button_save may be undefined before the editor renders).
*
* Called by every canvas mutation (add/remove/resize/reorder cell, column, row,
* etc.) to ensure no changes are lost silently.
*
* @returns {void}
*/
tool_print.prototype.mark_dirty = function() {
	const self = this
	self.dirty = true
	if (self.button_save) self.button_save.classList.remove('hide')
}//end mark_dirty



/**
* ON_CLOSE_ACTIONS
* Teardown hook invoked by the tool framework when the user closes the tool
* (via the modal close button or window.close).
*
* Performs tool_print-specific cleanup before the generic destroy path runs:
*
*   1. Removes the global keydown listener (_flow_key_handler) that wire_flow_keys
*      attached to document for canvas keyboard shortcuts (arrow-key cell navigation,
*      Delete key, etc.). Without this the handler would linger after close and
*      could interfere with other open tools or the main page.
*
*   2. In modal mode, explicitly calls destroy(true, true, true) to unmount the
*      component tree and release all event tokens. In window mode the browser
*      handles GC when the window is closed.
*
* @param {string} open_as - How the tool was opened: 'modal' or 'window'.
* @returns {Promise<boolean>} Always resolves with true.
*/
tool_print.prototype.on_close_actions = async function(open_as) {

	const self = this

	// remove the global flow keydown listener wired by wire_flow_keys
		if (self._flow_key_handler) {
			document.removeEventListener('keydown', self._flow_key_handler)
			self._flow_key_handler = null
		}

	if (open_as==='modal') {
		self.destroy(true, true, true)
	}


	return true
}//end on_close_actions



// @license-end
