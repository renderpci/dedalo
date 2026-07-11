// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_CORE_URL, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



/**
 * RENDER_MENU_MOBILE
 * Mobile-viewport menu renderer for the Dédalo main navigation bar.
 *
 * Responsibility: given the same flat `tree_datalist` array used by the desktop
 * `render_menu_tree.js`, build a vertically stacked, accordion-style DOM panel
 * that the caller (`view_default_edit_menu.js`) inserts into the page on first
 * tap of the hamburger icon.
 *
 * Key design choices vs. the desktop tree renderer:
 *  - No UL/LI hierarchy; items are plain `<div>` elements classed
 *    `menu_mobile_item` and `menu_mobile_children_container`.
 *  - Expand/collapse is controlled purely through CSS `hide` toggling; no
 *    position calculations are needed (the panel is full-width).
 *  - A parent item that has children gets a clickable *clone* of itself
 *    prepended into its own `children_container` so the user can still
 *    navigate to that item even after expanding the sub-list.
 *  - Navigation is published via `event_manager` 'user_navigation' events
 *    (same contract as the desktop tree), so section/area routing is handled
 *    identically regardless of which menu flavour is active.
 *  - `swap_tipo` in `item.config` lets the server redirect a menu entry to a
 *    different section tipo at render time (e.g. the Thesaurus virtual area
 *    always resolves to DEDALO_THESAURUS_TIPO = dd100).
 *
 * Exported symbols:
 *  - `render_menu` — builds and returns the top-level wrapper element.
 *
 * Internal (module-private):
 *  - `render_menu_node` — recursively builds each item + its children.
 */

// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		clone
	} from '../../common/js/utils/index.js'



/**
* RENDER_MENU
* Entry point for the mobile menu panel.
*
* Iterates over `self.data.tree_datalist` and renders only the top-level items
* (those whose `parent` property equals `options.tipo`, normally 'dd1').
* Each top-level item delegates recursively to `render_menu_node` to build the
* full accordion sub-tree beneath it.
*
* The returned wrapper is `<div class="menu_mobile_wrapper">`.  The caller
* (see `view_default_edit_menu.js`) is responsible for inserting it into the
* DOM, toggling its `hide` class, and subscribing to 'user_navigation' to
* auto-hide it after navigation.
*
* @param {Object} options - Configuration bag
* @param {Object} options.self - The live `menu` instance; must have `self.data.tree_datalist`
* @param {string} options.tipo - Root tipo whose direct children are rendered as top-level items (typically 'dd1')
* @returns {HTMLElement} The populated wrapper div (class 'menu_mobile_wrapper')
*/
export const render_menu = (options) => {

	// options
		const self		= options.self
		const tipo		= options.tipo

	// datalist
		const data		= self.data || []
		const datalist	= data.tree_datalist || []

	const wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'menu_mobile_wrapper'
	})

	const datalist_length = datalist.length
	for (let i = 0; i < datalist_length; i++) {
		const item = datalist[i]
		if (item.parent===tipo) {
			const node = render_menu_node(item, datalist)
			wrapper.appendChild(node)
		}
	}

	// // ontology button
	// if (self.ontology_link) {
	// 	const cloned_node = self.ontology_link.cloneNode(true);
	// 	cloned_node.classList.remove('top_item')
	// 	cloned_node.classList.add('menu_mobile_item')
	// 	cloned_node.addEventListener('click', self.open_ontology)
	// 	wrapper.append(cloned_node)
	// }


	return wrapper
}//end render_menu



/**
* RENDER_MENU_NODE
* Builds a `DocumentFragment` containing one accordion item for the mobile menu.
*
* Anatomy of the fragment:
*  ┌─ <div class="menu_mobile_item [with_children] [active]">  ← item label
*  └─ <div class="menu_mobile_children_container hide">        ← present only when children exist
*       ├─ <div class="menu_mobile_item">  ← cloned label (navigable shortcut to this parent)
*       ├─ (DocumentFragment for child[0])
*       └─ (DocumentFragment for child[N])
*
* Expand/collapse behaviour (mousedown handler on the item div):
*  - Items **with** children toggle the `active` class on themselves and the
*    `hide` class on their `children_container` reference.  `.children_container`
*    is attached directly as a property on the DOM element for O(1) access.
*  - Items **without** children trigger SPA navigation via:
*      event_manager.publish('user_navigation', { source: { tipo, model, mode, config } })
*    Before publishing, the item is `clone()`d to avoid mutating the shared
*    `datalist` entry, and `swap_tipo` (if present in `item.config`) overrides
*    the navigation tipo (used by the Thesaurus virtual areas, see
*    `class.menu.php::get_tree_datalist()`).
*
* The function is called recursively for every child of the current item.
*
* Expected shape of `item` (from server `tree_datalist`):
* ```json
* {
*   "label":  "Hallazgos",
*   "model":  "section",
*   "parent": "dd242",
*   "tipo":   "numisdata279",
*   "config": { "swap_tipo": "dd100" }   // optional
* }
* ```
*
* @param {Object} item - Single menu entry from `tree_datalist`
* @param {string} item.label  - Display label (HTML allowed but typically plain text)
* @param {string} item.model  - Dédalo model string (e.g. 'section', 'area_thesaurus')
* @param {string} item.parent - Tipo of this item's parent node
* @param {string} item.tipo   - Unique ontology identifier for this entry
* @param {Object} [item.config] - Optional server-side config; may contain `swap_tipo`
* @param {Array}  datalist - The full flat `tree_datalist` array (needed for recursive child resolution)
* @returns {DocumentFragment} Fragment containing the item div and, when applicable, its children container
*/
const render_menu_node = (item, datalist) => {

	const fragment = new DocumentFragment()

	// item label
		const menu_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'menu_mobile_item',
			inner_html		: item.label,
			parent			: fragment
		})
		const mousedown_handler = function(e) {
			if (this.classList.contains('with_children')) {
				// toggle accordion open/close for items that have a sub-list
				if (this.classList.contains('active')) {
					this.children_container.classList.add('hide')
					this.classList.remove('active')
				}else{
					this.children_container.classList.remove('hide')
					this.classList.add('active')
				}
			}else{
				// safe_item. Clone menu item before use it
				// (!) Clone so that swap_tipo below does not mutate the shared datalist entry
					const safe_item = clone(item)

				// swap_tipo
				// Server may redirect a virtual area to a real section tipo at runtime.
				// E.g. DEDALO_THESAURUS_VIRTUALS_AREA_TIPO → DEDALO_THESAURUS_TIPO (dd100).
					if (safe_item.config && safe_item.config.swap_tipo) {
						safe_item.tipo = safe_item.config.swap_tipo
					}

				// navigate
				// Publish the 'user_navigation' event; the page-level router handles
				// section/area loading (same contract as the desktop tree renderer).
				event_manager.publish('user_navigation', {
					source : {
						tipo	: safe_item.tipo,
						model	: safe_item.model,
						mode	: 'list',
						// this config comes from properties (used by section_tool to define the config of the section that its called)
						config	: safe_item.config || null
					}
				})
			}
		}
		menu_item.addEventListener('mousedown', mousedown_handler)

	// children
	// Filter the full datalist for direct children of this item in a single pass.
		const children = datalist.filter(el => el.parent===item.tipo)
		const children_length = children.length
		if (children_length>0) {

			// children_container
			// Starts hidden; revealed when the user taps this item's label.
			const children_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'menu_mobile_children_container hide',
				parent			: fragment
			})

			// update style
			// Mark this item as an accordion toggle so the mousedown handler
			// knows to expand/collapse instead of navigating.
			menu_item.classList.add('with_children')

			// set pointer
			// Store a direct DOM reference on the element itself so the
			// mousedown handler can toggle visibility without a querySelector.
			menu_item.children_container = children_container

			// add a copy of menu_item click-able
			// Prepend a navigable clone of this parent item inside its own
			// children_container.  This clone has 'with_children' removed so
			// it triggers navigation (not accordion toggle) when tapped.
				const clone = menu_item.cloneNode(true);
				clone.classList.remove('with_children')
				clone.addEventListener('mousedown', mousedown_handler)
				children_container.append(clone)

			// children iterate
			// Recurse for each direct child; the result fragments are appended
			// sequentially into children_container.
				for (let i = 0; i < children_length; i++) {
					const child			= children[i]
					const child_node	= render_menu_node(child, datalist)
					children_container.append(child_node)
				}
		}

	return fragment
}//end render_menu_node



// @license-end
