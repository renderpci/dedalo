// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TREE_EDIT_PORTAL
* Tree-style edit-mode view for `component_portal`.
*
* This module implements the `'tree'` render path dispatched by
* `render_edit_component_portal.prototype.edit` when `self.context.view` is `'tree'`.
* It is suited for portals whose linked records form or belong to a hierarchical structure
* (e.g. thesaurus term portals in area_thesaurus), where the implicit ordering of linked
* items matters and the delete column is the only structural control column needed.
*
* Differences from the default view:
* - Only two expected structural columns: the section_record's own columns (supplied by
*   `self.columns_map`) plus a `remove` column appended by `rebuild_columns_map`.
*   When that expectation is violated (e.g. the user lacks delete permission and the
*   `remove` column is absent), the CSS grid template is recomputed dynamically via
*   `set_element_css` so the layout still fits.
* - The toolbar disables `button_add`, `button_link`, `button_list`, and
*   `button_fullscreen` unconditionally (all set to `false` in `show_interface`), leaving
*   only `button_tree` active.  The tree selector is the canonical way to attach new terms
*   in this view.
* - `get_section_records` is called in `'list'` mode (not `'tree'` mode) so the child
*   section records use their own list render, not a further recursive tree render.
* - Like other portal views, a `render_level='content'` early return lets callers
*   refresh only the record list without rebuilding the full wrapper.
*
* Exports:
*   `view_tree_edit_portal` — namespace constructor (never instantiated directly).
*   `view_tree_edit_portal.render` — async static entry point called by the dispatch layer.
*   `add_events` — re-exported thin wrapper around `add_wrapper_events`.
*
* @module view_tree_edit_portal
* @see render_edit_component_portal.js  for view-dispatch switch and all shared helpers.
* @see component_portal.js             for the constructor, data shape, and lifecycle.
* @see docs/core/components/component_portal.md for the full specification.
*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_section_records} from '../../section/js/section.js'
	import {set_element_css} from '../../page/js/css.js'
	import {
		render_column_remove,
		add_wrapper_events,
		get_buttons
	} from './render_edit_component_portal.js'



/**
* VIEW_TREE_EDIT_PORTAL
* Namespace constructor for the tree edit-mode portal view.
*
* Never instantiated — only the static `render` method is invoked by the dispatch layer in
* `render_edit_component_portal.prototype.edit`. Defined as a function to follow the
* Dédalo view-module pattern used by all sibling view modules.
*
* @returns {boolean} Always true.
*/
export const view_tree_edit_portal = function() {

	return true
}//end view_tree_edit_portal




/**
* RENDER
* Build (or partially refresh) the tree edit view for a portal instance.
*
* Two execution paths are controlled by `options.render_level`:
*
* - `'full'` (default): constructs the full wrapper with toolbar, grid layout, and
*   section records.  The `show_interface` flags are set here to suppress all toolbar
*   buttons except `button_tree`, which is the canonical interaction for this view.
*   When the effective column count differs from the expected value of 2
*   (content columns + remove), the CSS grid-template-columns is overridden via
*   `set_element_css` so the layout adapts (e.g. when permissions < 2 and the remove
*   column is absent, only 1 column is needed).
*
* - `'content'` (partial refresh): returns `content_data` directly without rebuilding
*   the outer wrapper.  The existing wrapper retains its events and CSS.  Callers use this
*   after pagination or filter changes.
*
* Side effects:
*   - Populates `self.columns_map` with the rebuilt column descriptor array (once per
*     render; subsequent calls return immediately via `self.fixed_columns_map`).
*   - Pushes all section_record instances onto `self.ar_instances` for lifecycle cleanup.
*   - Sets `self.show_interface` flags (unconditional — overwrites any previous values).
*   - May inject a dynamic CSS rule via `set_element_css` when column count ≠ 2.
*
* @param {Object} self - The `component_portal` instance.
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - `'full'` rebuilds the full wrapper;
*   `'content'` refreshes only the record list inside an existing wrapper.
* @returns {Promise<HTMLElement>} The rendered wrapper node (full path), or the
*   content_data node (content path).
*/
view_tree_edit_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map = await rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller	: self,
			mode	:'list'
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// show interface
		// (!) All toolbar buttons are forced off here except button_tree.
		// The tree selector is the only supported way to add terms in this view.
		self.show_interface.button_tree			= true
		self.show_interface.button_add			= false
		self.show_interface.button_link			= false
		self.show_interface.button_list			= false
		self.show_interface.button_fullscreen	= false

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			// label		: null,
			buttons			: buttons,
			add_styles		: ['portal','view_line'] // added to the wrapper before view style
		})
		// set pointers
		wrapper.content_data = content_data

		// size from style
		// if expected number of columns (2) change, updates the columns CSS
		// This happens, for sample, when user do not have enough permissions to delete
		if (self.columns_map.length!==2) {
			const items				= ui.flat_column_items(self.columns_map);
			const template_columns	= items.join(' '); // like 1fr auto'
			const css_object = {
				".content_data" : {
					"grid-template-columns" : template_columns
				}
			}
			const selector = `${self.section_tipo}_${self.tipo}.edit.view_${self.view}`
			set_element_css(selector, css_object)
		}

	// events
		add_events(self, wrapper)


	return wrapper
}//end render



/**
* ADD_EVENTS
* Delegates to shared add_wrapper_events
* @param {Object} self - The `component_portal` instance.
* @param {HTMLElement} wrapper - The portal's wrapper DOM node.
* @returns {boolean} The return value from `add_wrapper_events` (always true).
*/
export const add_events = function(self, wrapper) {

	return add_wrapper_events(self, wrapper)
}//end add_events



/**
* GET_CONTENT_DATA
* Render all received section records and place them into a `content_data` container div.
*
* Iterates `ar_section_record`, awaiting each record's `render()` call and appending the
* resulting node to a DocumentFragment before wrapping it in the standard `content_data`
* div produced by `ui.component.build_content_data`.
*
* Empty list handling: when `ar_section_record` is empty the fragment remains blank.
* A no-records placeholder node was considered but is currently commented out; the
* layout remains consistent regardless because the CSS grid columns are defined by
* `rebuild_columns_map` and `set_element_css`, not by the row count.
*
* The `button_close: null` option passed to `build_content_data` suppresses the
* close-button that some other views add to the content area header.
*
* @param {Object} self - The `component_portal` instance (forwarded for `build_content_data`).
* @param {Array} ar_section_record - Resolved section_record instances for the current page.
* @returns {Promise<HTMLElement>} The populated content_data div node.
*/
const get_content_data = async function(self, ar_section_record) {

	// build_values
		const fragment = new DocumentFragment()

		// add all section_record rendered nodes
			const ar_section_record_length	= ar_section_record.length
			if (ar_section_record_length===0) {

				// no records found case
				// const row_item = no_records_node()
				// fragment.appendChild(row_item)
			}else{
				const ar_promises = ar_section_record.map(rec => rec.render())
				const rendered_nodes = await Promise.all(ar_promises)

				for (let i = 0; i < ar_section_record_length; i++) {
					if (rendered_nodes[i]) {
						fragment.appendChild(rendered_nodes[i])
					}
				}
			}//end if (ar_section_record_length>0)

	// content_data
		const content_data = ui.component.build_content_data(self,{button_close: null})
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Assemble the column descriptor array used by section_record row renderers.
*
* Merges the base `self.columns_map` (provided by the server via the ontology /
* request config) with a synthetic `remove` column appended when the user has write
* permission (permissions > 1).  The `remove` column uses the shared
* `render_column_remove` helper from `render_edit_component_portal.js` and carries an
* `'auto'` width so the CSS grid allocates only the button's intrinsic size.
*
* The `self.fixed_columns_map` guard prevents the map from being rebuilt on partial
* refreshes (`render_level='content'`).  Once the flag is set to `true` the function
* returns the already-built map immediately, preserving any CSS grid rule written by
* `render`.
*
* Expected output column count:
*   - 1 column  — read-only (no remove column).
*   - 2 columns — edit mode (base columns + remove).
* The `render` function checks against the expected 2-column count and injects a CSS
* override when the actual count differs (e.g. when a custom columns_map has more entries).
*
* @param {Object} self - The `component_portal` instance.
* @returns {Promise<Array>} The assembled columns_map array. Each entry is an object
*   with at minimum `{ id, label, width, callback }`.
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// base_columns_map
		const base_columns_map = self.columns_map || []
		columns_map.push(...base_columns_map)

	// button_remove column
		if (self.permissions>1) {
			columns_map.push({
				id			: 'remove',
				label		: '', // get_label.delete || 'Delete',
				width		: 'auto',
				callback	: render_column_remove
			})
		}

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



// @license-end
