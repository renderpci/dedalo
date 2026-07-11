// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'



/**
* VIEW_DEFAULT_LIST_PORTAL
* Default list-mode view renderer for `component_portal`.
*
* Handles the common grid layout: iterates the portal's linked entries, renders
* each as a `section_record` child instance, and inserts the resulting nodes into
* a CSS-grid list body.  This view is the fallback for both 'default' and 'mosaic'
* portal views (see `render_list_component_portal.js`).
*
* The CSS grid column widths are computed on-the-fly from `self.columns_map` via
* `ui.flat_column_items()` and injected as a scoped stylesheet rule via
* `set_element_css()`.  The mosaic view is exempted because it does not use the
* column-based grid layout.
*
* Exported static methods:
*   view_default_list_portal.render(self, options) — entry point called by `list()`.
*
* Private helpers (module-scoped, not exported):
*   get_content_data(self, ar_section_record) — builds the content_data container.
*/
export const view_default_list_portal = function() {

	return true
}//end view_default_list_portal



/**
* RENDER
* Entry point for the default list view of a portal component.
*
* Orchestrates the full render pipeline:
*   1. Resolves the child view name from context (falls back to 'default').
*   2. Calls `get_section_records()` to obtain fully-built `section_record`
*      instances for every locator in `self.data.entries`.
*   3. Delegates to `get_content_data()` to render each record node.
*   4. Builds the list_body grid container and injects per-section CSS grid
*      column widths using `set_element_css()`.
*   5. Wraps everything in a standard list wrapper with an absorbing click
*      listener (prevents click propagation to the parent section).
*
* When `options.render_level === 'content'`, steps 4–5 are skipped and the
* raw content_data element is returned directly.  This path is used by the
* portal's refresh mechanism to replace only the inner record area without
* rebuilding the full outer shell.
*
* Side effects:
*   - Pushes all created `section_record` instances into `self.ar_instances`
*     so that `common.destroy()` can tear them down on unmount.
*   - Calls `set_element_css()` (async, not awaited here) to inject a scoped
*     CSS rule for `grid-template-columns` on the `.list_body` cell.
*     The key is scoped to `<section_tipo>_<tipo>.list.view_<view_name>` to
*     avoid collisions between different portals on the same page.
*
* @param {Object} self    - The `component_portal` instance being rendered.
* @param {Object} options - Render options forwarded from `list()`.
* @param {string} [options.render_level='full'] - 'full' returns the complete
*   wrapper element; 'content' returns only the inner content_data node.
* @returns {Promise<HTMLElement>} The wrapper (full) or content_data (content) node.
*/
view_default_list_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// view
		const children_view	= self.context.children_view || self.context.view || 'default'

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller	: self,
			view	: children_view
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// columns_map
		const columns_map = self.columns_map || []

	// fragment container
		const fragment = new DocumentFragment()

	// list_body
		const view_name = self.view || self.context.view || 'default'
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body ' + self.mode +  ' view_' + view_name,
			parent			: fragment
		})
		// flat columns create a sequence of grid widths taking care of sub-column space
		// like 1fr 1fr 1fr 3fr 1fr
		const items				= ui.flat_column_items(columns_map)
		const template_columns	= `${items.join(' ')}`
		// set CSS on-the fly js
			if (self.view!=='mosaic') {
				const css_object = {
					'.list_body' : {
						'grid-template-columns': template_columns
					}
				}
				set_element_css(
					`${self.section_tipo}_${self.tipo}.list.view_${view_name}`, // selector
					css_object
				)
			}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : true // bool set build autoload param on mode change (close button)
		})
		wrapper.classList.add('portal')
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data	= content_data
		wrapper.list_body		= list_body
		// click event capture
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
			// nothing to do in list mode, only catch click event
		})


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Renders all section_record instances and collects their DOM nodes into a
* single `content_data` container element.
*
* Uses `Promise.all()` to fan-out the per-record `render()` calls concurrently,
* then appends the resolved nodes via a `DocumentFragment` to minimise reflows.
* Records whose `render()` resolves to a falsy value are silently skipped — this
* covers records that failed to build (null returned by `get_instance()` inside
* `get_section_records()`).
*
* Returns an empty `content_data` immediately when `ar_section_record` is empty,
* avoiding unnecessary async work.
*
* @param {Object} self              - The `component_portal` instance being rendered.
* @param {Array}  ar_section_record - Array of built `section_record` instances
*   returned by `get_section_records()`.  May be empty.
* @returns {Promise<HTMLElement>} The populated `content_data` div element.
*/
const get_content_data = async function(self, ar_section_record) {

	// content_data
	const content_data = ui.component.build_content_data(self)
		  content_data.classList.add(self.mode, self.tipo)

	const section_record_count	= ar_section_record.length

	// empty cases
	if (section_record_count === 0) {
		return content_data;
	}

	// Render promises
	const render_promises = ar_section_record.map(record => record.render());

	// fragment
	const fragment = new DocumentFragment()

	// Add all section_record rendered nodes to the fragment
	const rendered_nodes = await Promise.all(render_promises);
	for (let i = 0; i < section_record_count; i++) {
		if (rendered_nodes[i]) {
			fragment.appendChild(rendered_nodes[i])
		}
	}

	// Append final fragment at end
	content_data.appendChild(fragment)


	return content_data
}//end get_content_data



// @license-end
