// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL,Promise */
/*eslint no-undef: "error"*/



/**
* VIEW_DEFAULT_EDIT_PORTAL
* Default table-style edit-mode view for `component_portal`.
*
* This module implements the "default" render path dispatched by
* `render_edit_component_portal.prototype.edit` when `self.context.view` is `'default'`
* (or absent/unrecognised).  It is also the fallback used by the `'print'` view after
* forcing permissions to read-only.
*
* Layout produced:
*   wrapper
*     └── list_body  (CSS grid; column widths come from columns_map → set_element_css)
*           ├── header_wrapper_list  (built by build_header; hidden when list is empty)
*           └── content_data         (one row per section_record + optional references)
*     └── buttons  (add / link / tree / fullscreen — only rendered when permissions > 1)
*
* The number of grid columns is driven by `columns_map`, which is assembled in
* `rebuild_columns_map` and stored on `self` so that partial refreshes (`render_level='content'`)
* can skip the expensive rebuild step.
*
* Exports:
*   `view_default_edit_portal` — namespace constructor (never instantiated directly).
*   `view_default_edit_portal.render` — async static entry point called by the dispatch layer.
*
* @module view_default_edit_portal
* @see render_edit_component_portal.js  for the view-dispatch switch and all shared helpers.
* @see component_portal.js             for the constructor, data shape, and lifecycle.
* @see docs/core/components/component_portal.md for the full specification.
*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'
	import {
		render_column_id,
		render_column_component_info,
		render_column_remove,
		get_buttons,
		add_wrapper_events,
		build_header,
		render_references
	} from './render_edit_component_portal.js'



/**
* VIEW_DEFAULT_EDIT_PORTAL
* Namespace constructor for the default edit-mode portal view.
*
* Never instantiated — only the static `render` method is called by
* `render_edit_component_portal.prototype.edit`. Defined as a function to
* follow the Dédalo view-module pattern (enables `instanceof` checks and
* consistent module structure across all view modules).
*
* @returns {boolean} Always true.
*/
export const view_default_edit_portal = function() {

	return true
}//end view_default_edit_portal



/**
* RENDER
* Build (or partially refresh) the default tabular edit view for a portal instance.
*
* Two execution paths are controlled by `options.render_level`:
*
* - `'full'` (default): constructs the full DOM tree including the `list_body` grid
*   wrapper, the column header row, all section_record rows, the button toolbar, and
*   the outer component wrapper.  Drag-and-drop and autocomplete click handlers are
*   attached to the wrapper via `add_wrapper_events`.
*
* - `'content'`: only rebuilds the inner `content_data` node (the rows) and updates
*   the visibility of the existing `header_wrapper_list` to match whether the list
*   is non-empty.  The existing wrapper and list_body are left in place.  This path
*   is used by `self.refresh()` so that pagination changes avoid a full re-render.
*
* Side-effects:
* - Calls `rebuild_columns_map(self)`, which sets `self.columns_map` and
*   `self.fixed_columns_map = true` after the first build so subsequent partial
*   refreshes reuse the cached result.
* - Pushes all instantiated section_record instances onto `self.ar_instances` so
*   that `self.destroy()` can clean them up.
* - Injects a dynamic `<style>` rule via `set_element_css` to set the CSS Grid
*   `grid-template-columns` value for the `.list_body` element.  The selector is
*   scoped to `<section_tipo>_<tipo>.edit.view_<view>` to avoid collisions.
* - Sets `wrapper.list_body` and `wrapper.content_data` as DOM node properties for
*   fast access in subsequent refresh cycles.
*
* @param {Object} self - The `component_portal` instance being rendered.
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - `'full'` for a complete re-render;
*   `'content'` to only refresh the record rows inside an existing wrapper.
* @returns {Promise<HTMLElement>} The component wrapper (full render) or the
*   `content_data` node (content-only render).
*/
view_default_edit_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller	: self,
			mode	: 'list'
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			// show header_wrapper_list if is hidden
			const header_wrapper_list = self.node.list_body
				? self.node.list_body.querySelector(":scope >.header_wrapper_list")
				: null;
			if (header_wrapper_list) {
				if (ar_section_record.length>0) {
					header_wrapper_list.classList.remove('hide')
				}else{
					header_wrapper_list.classList.add('hide')
				}
			}

			return content_data
		}

	// header
		const list_header_node = build_header(columns_map, ar_section_record, self)

	// list_body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body'
		})

		const items				= ui.flat_column_items(columns_map);
		const template_columns	= items.join(' ')

		// new way on-the-fly css
		// Inject a scoped CSS rule so the .list_body grid tracks the active columns_map.
		// Using set_element_css avoids a style attribute on the element itself and lets
		// the rule be overridden by a theme stylesheet when needed.
			const css_object = {
				".list_body" : {
					"grid-template-columns" : template_columns
				}
			}
			const selector = `${self.section_tipo}_${self.tipo}.edit.view_${self.view}`
			set_element_css(selector, css_object)

		list_body.appendChild(list_header_node)
		list_body.appendChild(content_data)

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			list_body	: list_body,
			buttons		: buttons,
			add_styles	: ['portal'] // added to the wrapper before view style
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)

	// set pointers
	// Attach child nodes as named properties on the wrapper for O(1) access during refresh.
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data

	// service autocomplete + drag/drop
	// Attaches: click → activate_autocomplete; dragover/dragleave/drop on the wrapper
	// so that rows dropped outside a per-row drop zone are still handled correctly.
		add_wrapper_events(self, wrapper, {drag_drop: true})


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render all linked section_record instances and collect their nodes into a
* `content_data` container element.
*
* For each entry in `ar_section_record` the method calls `section_record.render()` —
* an async operation that builds the row's component cells according to `columns_map`.
* Rows are batched into a `DocumentFragment` and appended to `content_data` in a
* single DOM write to minimise layout thrashing.
*
* A numeric index pointer (`content_data[i] = section_record_node`) is stored on the
* container so that callers can quickly look up a specific row's DOM node by its
* zero-based position in the current page window.
*
* If `self.data.references` is populated (used by `component_relation_related` to
* expose back-reference links), a references block is appended after the rows.
*
* The empty-list branch (`ar_section_record_length === 0`) is a no-op by design;
* commented-out code shows an earlier approach of rendering a "no records" placeholder
* that was superseded by hiding the header row instead.
*
* @param {Object} self - The `component_portal` instance.
* @param {Array} ar_section_record - Array of `section_record` instances for the current
*   page, as returned by `get_section_records`.
* @returns {Promise<HTMLElement>} The populated `content_data` element, ready to be
*   inserted into `list_body`.
*/
const get_content_data = async function(self, ar_section_record) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// content_data node
		const content_data = ui.component.build_content_data(self)

		// section_record. Add all section_record rendered nodes
			const ar_section_record_length = ar_section_record.length
			if (ar_section_record_length===0) {

				// no records found case
				// const row_item = no_records_node()
				// fragment.appendChild(row_item)
			}else{

				// const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {

					const section_record	= ar_section_record[i]
					// const section_id		= section_record.section_id
					// const section_tipo	= section_record.section_tipo

					// section_record wrapper
						// const row_wrapper = ui.create_dom_element({
						// 	element_type	: 'div',
						// 	class_name		: 'row_wrapper section_record ' + ' ' + self.tipo + ' ' + self.mode + (self.mode==='tm' ? ' list' : '')
						// })
						// row_wrapper.addEventListener("click", (e) => {
						// 	// e.stopPropagation()
						// 	if (!e.target.classList.contains("row_active")) {
						// 		e.target.classList.add("row_active")
						// 	}
						// })

					// section_record NODE
						// const row_container = ui.create_dom_element({
						// 	element_type	: 'div',
						// 	class_name		: 'section_record_container',
						// 	parent			: row_wrapper
						// })
						const section_record_node = await section_record.render()
						// set the pointer
						content_data[i] = section_record_node

					// button_remove
						// if (self.permissions>1) {
						// 	const column = ui.create_dom_element({
						// 		element_type	: 'div',
						// 		class_name		: 'column remove_column',
						// 		parent			: row_wrapper
						// 	})
						// 	ui.create_dom_element({
						// 		element_type	: 'span',
						// 		class_name		: 'button remove',
						// 		dataset			: { key : i },
						// 		parent			: column
						// 	})
						// }

					// section record
						fragment.appendChild(section_record_node)
				}
			}//end if (ar_section_record_length===0)

		// references. Build references if exists
		// `self.data.references` is populated only on component_relation_related portals
		// that expose computed back-references; regular portals omit the property.
			if(self.data.references && self.data.references.length > 0){
				const references_node = render_references(self.data.references)
				fragment.appendChild(references_node)
			}

		// add fragment
			content_data.appendChild(fragment)


	// set node only when it is in DOM (to save browser resources)
		// const observer = new IntersectionObserver(async function(entries) {
		// 	const entry = entries[1] || entries[0]
		// 	if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
		// 		observer.disconnect();
		// 		const fragment = await build_values()
		// 		content_data.appendChild(fragment)
		// 	}
		// }, { threshold: [0] });
		// observer.observe(content_data);


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Assemble the full ordered list of column descriptors for the default table view,
* prepending the built-in ID column, inserting the caller-supplied `base_columns_map`
* from `self.columns_map`, and appending the optional `ddinfo` and remove-button columns.
*
* Each descriptor in the returned array is a plain object:
*   {
*     id       : {string}   — unique column key (e.g. 'section_id', 'remove', 'empty')
*     label    : {string}   — text for the column header cell
*     width    : {string}   [optional] — CSS grid track size, e.g. 'auto' or '1fr'
*     callback : {Function} [optional] — render function called per row for this column
*   }
*
* Column layout:
*   1. `section_id`  — the open-record / drag-handle cell (always first; rendered by
*      `render_column_id`).
*   2. `...base_columns_map` — zero or more data-component columns supplied by the
*      ontology/request-config (e.g. the component columns the cataloguer chose to display
*      inside the portal rows).
*   3. `ddinfo`      — optional component-info overlay column; included when
*      `self.add_component_info === true` (toggled by a developer tool for debugging).
*   4. `remove` / `empty` — the last column is the unlink/delete button when the portal
*      is editable (`permissions > 1` and `source.mode !== 'external'`).  For read-only or
*      external portals an empty placeholder column keeps the grid balanced.
*
* Once built, the result is memoised by setting `self.fixed_columns_map = true` so that
* subsequent `render_level='content'` refreshes skip this method entirely and reuse the
* cached `self.columns_map` value.
*
* @param {Object} self - The `component_portal` instance.
* @returns {Promise<Array>} The assembled columns_map array.
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
	// Memoisation guard: once fixed_columns_map is set, the array on self is authoritative.
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width		: 'auto',
			callback	: render_column_id
		})

	// base_columns_map
	// Merge the columns supplied by the ontology/request-config (may be an empty array
	// for portals that only show the ID + action columns).
		const base_columns_map = self.columns_map || []
		columns_map.push(...base_columns_map)

	// column component_info check
	// ddinfo is a developer/debug column that shows raw component-info strings per row.
	// It is enabled by setting self.add_component_info=true from the inspector or a tool.
		if (self.add_component_info===true) {
			columns_map.push({
				id			: 'ddinfo',
				label		: 'Info',
				callback	: render_column_component_info
			})
		}

	// button_remove
	// External portals (source.mode==='external') are read-only by convention even when
	// the user has edit permissions, so no remove column is shown.  Read-only permissions
	// (<= 1) also suppress the button.  In both cases an empty spacer column is added to
	// keep the grid-template-columns track count consistent with the header row.
		if (self.context?.properties?.source?.mode!=='external' && self.permissions>1) {
			columns_map.push({
				id			: 'remove',
				label		: '', // get_label.delete || 'Delete',
				width		: 'auto',
				callback	: render_column_remove
			})
		}else{
			columns_map.push({
				id		: 'empty',
				label	: '',
				width	: 'auto'
			})
		}

	// fixed as calculated
	// Mark the map as stable so refresh cycles skip rebuild_columns_map.
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



// @license-end
