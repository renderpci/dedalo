// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG, get_label */
/*eslint no-undef: "error"*/



/**
* RENDER_SERVICE_TIME_MACHINE_LIST
* Client-side rendering entry point and shared rendering utilities for the
* service_time_machine list views.
*
* This module contains:
*   - The `render_service_time_machine_list` constructor, whose `.list` prototype
*     method is mixed into `service_time_machine` instances as both `.list` and `.tm`.
*   - `common_render` — the shared DOM-building routine used by every view variant
*     ('default', 'mini', 'history', 'tool'). Handles paginator, column-grid CSS,
*     list header, and content rows.
*   - `get_content_data` — renders all pre-built section_record instances in parallel
*     and wraps the result in a `content_data` div.
*   - `rebuild_columns_map` — one-shot filter/transform pass over the raw columns_map
*     that is resolved once per service instance (guarded by `self.fixed_columns_map`).
*
* View routing:
*   'default'  → view_default_time_machine_list  (full grid with header, used in tool)
*   'mini'     → view_mini_time_machine_list      (inspector sidebar, fewer columns)
*   'history'  → view_history_time_machine_list   (inspector history tab, no header)
*   'tool'     → view_tool_time_machine_list      (tool_time_machine; custom column-id UI)
*
* Exports: render_service_time_machine_list, common_render, get_content_data, rebuild_columns_map
*/

// imports
	import {set_element_css} from '../../../../core/page/js/css.js'
	import {get_section_records} from '../../../../core/section/js/section.js'
	import {ui} from '../../../../core/common/js/ui.js'
	import {view_default_time_machine_list} from './view_default_time_machine_list.js'
	import {view_mini_time_machine_list} from './view_mini_time_machine_list.js'
	import {view_tool_time_machine_list} from './view_tool_time_machine_list.js'
	import {view_history_time_machine_list} from './view_history_time_machine_list.js'



/**
* RENDER_SERVICE_TIME_MACHINE_LIST
* Constructor for the prototype carrier used by service_time_machine.
* The constructor itself does nothing; its `.list` prototype method is assigned
* onto service_time_machine instances via service_time_machine.js:
*   service_time_machine.prototype.list = render_service_time_machine_list.prototype.list
*   service_time_machine.prototype.tm   = render_service_time_machine_list.prototype.list
*/
export const render_service_time_machine_list = function() {

	return true
}//end render_service_time_machine_list



/**
* LIST
* Entry point for rendering the time-machine list in the current view.
* Called as `self.list(options)` or `self.tm(options)` on a service_time_machine instance.
* Reads `self.view` (defaulting to 'default') and delegates to the matching
* view-specific render function, each of which ultimately calls `common_render`.
*
* Supported views:
*   'mini'    — compact inspector sidebar variant (suppresses matrix_id / bulk_process_id columns)
*   'history' — inspector history tab (suppresses matrix_id, where, bulk_process_id; no header)
*   'tool'    — tool_time_machine variant with custom column-id restore/preview button
*   'default' — full-featured grid with paginator and column header
*
* @param {Object} options - Rendering options forwarded verbatim to the view's render function.
*   Notable keys: `render_level` ('full'|'content'), `no_header` {boolean}.
* @returns {Promise<HTMLElement>} The outer wrapper element produced by the chosen view.
*/
render_service_time_machine_list.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.view || 'default'

	switch(view) {

		case 'mini':
			// used by inspector
			return view_mini_time_machine_list.render(self, options)

		case 'history':
			// used by inspector
			return view_history_time_machine_list.render(self, options)

		case 'tool':
			// used by tool_time_machine
			return view_tool_time_machine_list.render(self, options)

		case 'default':
		default:
			return view_default_time_machine_list.render(self, options)
	}
}//end list



/**
* COMMON_RENDER
* Shared DOM-building routine for all service_time_machine list views.
* Called by every view variant after any view-specific pre-processing (e.g.
* narrowing `self.config.ignore_columns`). Produces a complete wrapper element
* containing the paginator, list header (optional), and content rows.
*
* Side effects on `self`:
*   - `self.columns_map` — replaced with the output of `rebuild_columns_map`.
*   - `self.ar_instances` — reset to the array of freshly built section_record instances;
*     this allows `common.prototype.destroy` to clean them up on the next lifecycle cycle.
*
* The CSS grid-template-columns for the list body is resolved from `self.columns_map` via
* `ui.flat_column_items`, then injected with `set_element_css` scoped to the component's
* unique CSS selector, so multiple concurrent lists do not collide.
*
* When `render_level === 'content'`, the function returns early with only the
* `content_data` element (skipping the wrapper, paginator and list header). This is
* used for pagination refresh to replace only the row area in the DOM.
*
* @param {Object} self - The service_time_machine instance being rendered.
* @param {Object} options - Rendering options.
* @param {string} [options.render_level='full'] - 'full' builds the whole wrapper;
*   'content' returns only the inner content_data element (for pagination refreshes).
* @param {boolean} [options.no_header=false] - When true, the column header row is
*   omitted even when records exist.
* @returns {Promise<HTMLElement>} The outer wrapper div (render_level='full') or the
*   content_data div (render_level='content').
*/
export const common_render = async function(self, options) {

	// options
		const render_level	= options.render_level || 'full'
		const no_header		= options.no_header || false

	// columns_map
		const columns_map = await rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record. section_record instances (initialized and built)
		const ar_section_record	= await get_section_records({
			caller : self,
			mode : 'tm',
			view : 'line',
			// namespace child instances by view so concurrent TM lists of the same
			// record (e.g. inspector 'mini' + 'history') don't collide in the registry
			id_variant : (self.id_variant || self.model) + '_' + self.view
		})
		// store to allow destroy later. Clear first to avoid duplication on refresh
		self.ar_instances = []
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(ar_section_record, self)
		if (render_level==='content') {
			return content_data
		}

	// fragment
		const fragment = new DocumentFragment()

	// paginator container node
		const paginator_div = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_container',
			parent			: fragment
		})
		self.paginator.mode = 'mini'
		await self.paginator.build()
		self.paginator.render()
		.then(paginator_wrapper =>{
			paginator_div.appendChild(paginator_wrapper)
		})

	// list_body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body',
			parent			: fragment
		})
		// flat columns create a sequence of grid widths taking care of sub-column space
		// like 1fr 1fr 1fr 3fr 1fr
		const items				= ui.flat_column_items(columns_map)
		const template_columns	= self.config.template_columns
			? self.config.template_columns
			: items.join(' ')
		const css_object = {
			'.list_body' : {
				'grid-template-columns': template_columns
			}
		}
		const selector = `${self.config.id}.${self.section_tipo+'_'+self.tipo}.view_${self.view}`
		set_element_css(selector, css_object)

	// list_header_node. Create and append if ar_instances is not empty
		if (ar_section_record.length>0 && no_header!==true) {
			const list_header_node = ui.render_list_header(columns_map, self)
			list_body.appendChild(list_header_node)
		}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_${self.model} ${self.model} ${self.config.id} ${self.section_tipo+'_'+self.tipo} view_${self.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data


	return wrapper
}//end common_render



/**
* GET_CONTENT_DATA
* Renders previously built section_record instances into a single `content_data` div.
* When there are no records, a localized "no records found" placeholder is shown instead.
* Rendering is parallelized via `Promise.all` to avoid sequential awaits per row;
* rendered nodes are then appended in original order to preserve the sort returned
* by the server.
*
* Note that `self` here is a service_time_machine instance, not a generic section.
* The resulting `content_data` element receives two CSS classes beyond 'content_data':
* `self.mode` (always 'list' for this service) and `self.type` (always 'tm').
*
* @param {Array} ar_section_record - Array of already-built section_record instances
*   (output of `get_section_records` called with mode='tm').
* @param {Object} self - The service_time_machine instance; provides `self.mode` and
*   `self.type` for CSS class names on the container.
* @returns {Promise<HTMLElement>} A div.content_data element containing either the row
*   nodes or the "no records found" placeholder.
*/
export const get_content_data = async function(ar_section_record, self) {

	// fragment
		const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {

			// no records found case

			const no_records_found_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'no_records',
				inner_html		: get_label.no_records || 'No records found'
			})
			fragment.appendChild(no_records_found_node)
		}else{

			// rows

			// parallel render
			const ar_promises = ar_section_record.map(record => record.render())
            const section_record_nodes = await Promise.all(ar_promises)

            // once rendered, append it preserving the order
            section_record_nodes.forEach(node => {
				if(node) {
					fragment.appendChild(node)
				}
            })
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* One-shot filter pass over the raw columns_map that removes any columns listed in
* `self.config.ignore_columns`. After the first call the result is frozen by setting
* `self.fixed_columns_map = true`, so subsequent calls (e.g. on pagination refresh)
* return the already-computed map without re-processing.
*
* The commented-out `switch` block (dd201/dd197 short-label overrides) is intentionally
* left in place as a reference for callers that need to relabel columns for narrow widths.
*
* Note: `ignore_columns` defaults to an empty array when not present in config. The
* commented-out entry 'matrix_id' (dd1573) shows a column that is filtered at the view
* level instead (view_mini / view_history set config.ignore_columns before calling
* common_render, so the guard here is a fallback).
*
* @param {Object} self - The service_time_machine instance. Must expose:
*   `self.fixed_columns_map` {boolean|null} — falsy on first call; set to true after.
*   `self.columns_map` {Array|Promise<Array>} — the raw columns_map (may be a Promise
*     if the caller assigned an unresolved Promise from `get_columns_map`).
*   `self.config.ignore_columns` {Array<string>} — optional list of column `id` values
*     to exclude from the rendered grid.
* @returns {Promise<Array>} Filtered columns_map array ready for use by common_render.
*/
export const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// columns base
		const base_columns_map = await self.columns_map

	// ignore_columns
		const ignore_columns = (self.config.ignore_columns
			? self.config.ignore_columns
			: [
				// 'matrix_id' // matrix_id dd1573
			  ])

	// modify list and labels
		const base_columns_map_length = base_columns_map.length
		for (let i = 0; i < base_columns_map_length; i++) {
			const el = base_columns_map[i]

			// ignore some columns
				if (ignore_columns.includes(el.id)) {
					continue;
				}

			// short label (for small width columns)
				// switch (el.tipo) {
				// 	case 'dd201':
				// 		el.label = 'Date'
				// 		break;
				// 	case 'dd197':
				// 		el.label = 'User'
				// 		break;
				// }

			columns_map.push(el)
		}

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



// @license-end
