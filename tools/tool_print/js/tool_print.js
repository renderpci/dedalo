// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* TOOL_PRINT
*
* Visual print-layout tool. Section-scoped (shown in the section list toolbar
* and the record inspector, like tool_export). It inherits its target and data
* scope from the calling section:
*   - edit mode → the single caller record (self.caller.section_id)
*   - list mode → the records from the user's current filter (self.sqo)
* The editor (render_tool_print) lets the user lay out the section's components
* on printable pages and save reusable layout templates per section_tipo.
*/

	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common, wire_tool} from '../../tool_common/js/tool_common.js'
	import {render_tool_print} from './render_tool_print.js'
	import {on_dragstart} from '../../tool_export/js/drag_tool_export.js'



/**
* TOOL_PRINT
* Tool constructor. Declares every instance property the tool uses.
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
	this.selected_box_id	= null
	this.print_root			= null
	this.canvas_container	= null
	this.current_template_id= null			// section_id of the loaded template (null = unsaved)

	// tmp section id generator for the draggable palette
	this.section_id			= 0
	this.dirty				= false
}//end tool_print



/**
* COMMON FUNCTIONS
* wire_tool assigns render/destroy/refresh and edit (from render_tool_print).
*/
	wire_tool(tool_print, render_tool_print)

	// extra prototypes
	tool_print.prototype.get_section_elements_context	= common.prototype.get_section_elements_context
	tool_print.prototype.calculate_component_path		= common.prototype.calculate_component_path
	// palette drag (reuse tool_export's payload {drag_type:'add', path, ddo})
	tool_print.prototype.on_dragstart					= on_dragstart



/**
* INIT
* Captures the caller context (source, sqo, target_section_tipo, mode) and the
* preview record id. Mirrors tool_export.prototype.init.
* @param object options
* @return bool common_init
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
				|| null

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Loads the section component palette after the generic tool build.
* @param bool autoload = false
* @return bool common_build
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
* @return string as 'tmp_print_1'
*/
tool_print.prototype.get_section_id = function() {
	const self		= this
	self.section_id	= ++self.section_id
	return 'tmp_print_' + self.section_id
}//end get_section_id



/**
* GET_RECORD_IDS
* Resolves the record ids to print: the single edit record, or the records
* matching the user's current filter (sqo) in list mode. Used by the print flow.
* @param object options - { limit }
* @return promise array of section_id
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

	// list mode: run the caller sqo to get the matching record ids
		const sqo = {...(self.sqo || {})}
		sqo.limit	= options.limit ?? (self.sqo?.limit ?? 50)
		sqo.offset	= self.sqo?.offset ?? 0

		const rqo = {
			action			: 'search',
			prevent_lock	: true,
			source			: create_source(self, 'get_record_ids'),
			sqo				: sqo
		}
		try {
			const api_response = await data_manager.request({ body: rqo })
			const rows = api_response?.result?.data || api_response?.result?.ar_records || []
			return rows
				.map(r => (r.section_id ?? r.id ?? r))
				.filter(id => id!==null && id!==undefined)
		} catch (error) {
			console.error('tool_print get_record_ids error:', error)
			return self.preview_section_id ? [ self.preview_section_id ] : []
		}
}//end get_record_ids



/**
* MARK_DIRTY
* Flags unsaved layout changes (used to warn before switching templates and to
* enable the Save button).
* @return void
*/
tool_print.prototype.mark_dirty = function() {
	const self = this
	self.dirty = true
	if (self.button_save) self.button_save.classList.remove('hide')
}//end mark_dirty



/**
* ON_CLOSE_ACTIONS
* @param string open_as - modal|window
* @return promise bool
*/
tool_print.prototype.on_close_actions = async function(open_as) {

	const self = this

	// destroy any component instances rendered into boxes
		if (Array.isArray(self.ar_instances)) {
			for (let i = self.ar_instances.length - 1; i >= 0; i--) {
				const inst = self.ar_instances[i]
				if (inst && typeof inst.destroy==='function') {
					try { inst.destroy() } catch (e) { /* noop */ }
				}
			}
		}

	if (open_as==='modal') {
		self.destroy(true, true, true)
	}


	return true
}//end on_close_actions



// @license-end
