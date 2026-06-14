// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_FILTER
* Client-side search renderer for component_filter.
*
* Builds and manages the DOM for a `component_filter` instance when
* `mode === 'search'`. This module is mixed into `component_filter` via
* prototype assignment in `component_filter.js`:
*   `component_filter.prototype.search = render_search_component_filter.prototype.search`
*
* Responsibilities:
* - Renders a `q_operator` text input at the top of the content area that lets
*   the user supply an explicit SQL comparison operator override (e.g. `'='`,
*   `'LIKE'`).  On `change` the operator is written directly to
*   `self.data.q_operator` and the `change_search_element` event is published
*   so the enclosing search bar redraws with the updated preset.
* - Builds a hierarchical `<ul>` tree from `self.data.datalist` by:
*   1. Identifying root nodes — datalist items whose `parent` is `null`.
*   2. Recursively finding children by matching `el.parent.section_tipo` and
*      `el.parent.section_id` against each processed node.
*   3. Rendering each node with `get_input_element` (imported from the edit
*      renderer) and attaching child nodes to the `element_node.branch` property
*      exposed by `get_input_element`.
* - Each node's `value` locator is annotated with `from_component_tipo = self.tipo`
*   by `get_input_element` itself (not by this renderer) when the element is
*   rendered, so that the save layer can record which component issued the change.
*
* Note: Unlike `render_search_component_check_box`, this renderer re-uses
* `get_input_element` from the **edit** renderer rather than defining its own,
* so checked-state initialisation and change handling follow the edit-renderer
* contract (see `render_edit_component_filter.js` for details).
*
* Data shapes:
* - `self.data.datalist` — Array of datalist items, each shaped as:
*     `{label, section_id, section_tipo, parent, has_children, value, ...}`
*   where `parent` is either `null` (root node) or a locator
*     `{section_tipo, section_id}` pointing at the parent item.
* - `self.data.entries` — Array of currently-selected locators
*     `{section_id, section_tipo, ...}` representing the user's active filter.
* - `self.data.q_operator` — Optional string override for the SQL comparison
*   operator (e.g. `'='`, `'LIKE'`).  `null` means use the component default.
*
* Exports:
*   `render_search_component_filter` — constructor (prototype carrier only)
*
* @see render_edit_component_filter.js#get_input_element  Shared node renderer used here.
* @see component_filter.js                               Prototype assignment site.
* @see event_manager.js#publish                          Pub/sub bus for search-bar updates.
* @see class.component_filter.php                        Server-side counterpart and duplicate detection.
*/

// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_input_element} from './render_edit_component_filter.js'



/**
* RENDER_SEARCH_COMPONENT_FILTER
* Constructor function (no-op body; all methods live on the prototype).
* Mixed into `component_filter` via prototype assignment in `component_filter.js`.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_filter = function() {

	return true
}//end render_search_component_filter



/**
* SEARCH
* Entry point for the search-mode render lifecycle.
*
* Called by the component lifecycle when `mode === 'search'`. Builds the inner
* `content_data` subtree (q_operator input and a hierarchical checkbox tree)
* via `get_content_data`, then wraps it in `ui.component.build_wrapper_search`
* unless `render_level === 'content'`.
*
* When `render_level === 'content'` the method returns just the `content_data`
* element — this is used by partial-refresh paths that need to replace only the
* inner DOM without rebuilding the outer `wrapper_component` shell.
*
* The returned `wrapper` element exposes `wrapper.content_data` as a direct
* property so callers can reach the inner node without a DOM query.
*
* @param {Object} options - Render configuration passed by the lifecycle.
* @param {string} [options.render_level='full'] - `'content'` returns only
*   `content_data`; any other value (or omitted) returns the full wrapper.
* @returns {Promise<HTMLElement>} `wrapper_component` element (full render) or
*   `content_data` element (content-only render).
*/
render_search_component_filter.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data

	return wrapper
}//end search



/**
* GET_CONTENT_DATA
* Build the full search content area for a filter component.
*
* Produces two logical sections inside the standard `content_data` shell:
*   1. A `q_operator` text input at the top that lets the user supply an
*      explicit SQL comparison operator override.  On `change`, the operator
*      string is written to `self.data.q_operator` (reset to `null` when
*      cleared) and the `change_search_element` event is published so the
*      surrounding search bar redraws.
*   2. A `<ul class="branch">` tree populated by walking `self.data.datalist`:
*      - Root nodes are those whose `parent === null`.
*      - Children of each node are found by filtering datalist entries whose
*        `parent.section_tipo` and `parent.section_id` match the current node.
*      - Each node is rendered with the shared `get_input_element` (from the
*        edit renderer) and its children are recursively appended to the `branch`
*        sub-element that `get_input_element` attaches to the returned `<li>`.
*
* Note: The child-lookup in `get_children_node` performs a full scan of
* `datalist` for each node, giving O(n²) complexity.  This is acceptable
* because filter trees are always small (tens of items at most).
*
* Note: Unlike the edit renderer's `get_content_data`, this version does NOT
* sort root or child nodes — the server-returned order in `datalist` is
* preserved as-is.
*
* @param {Object} self - The component instance (`component_filter`).
* @returns {HTMLElement} `content_data` div populated with the q_operator input
*   and the hierarchical tree of filter options.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change',function () {
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// ul
		const ul_branch = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'branch',
			parent			: content_data
		})

	// get_children_node. Get tree nodes with children recursively
		const get_children_node = function(element){

			// Find all datalist items whose parent locator matches the current element.
			// Both section_tipo and section_id must match to identify the correct parent.
			const children_elements = datalist.filter(
				el => el.parent && el.parent.section_tipo === element.section_tipo
				&& el.parent.section_id === element.section_id
			)
			const children_elements_len = children_elements.length

			// Annotate element with has_children before passing to get_input_element,
			// which uses this flag to decide whether to render a collapsible branch.
			const has_children = (children_elements_len > 0)
				? true
				: false

			element.has_children = has_children

			// Delegate node rendering to the shared edit-renderer function.
			// get_input_element attaches a .branch <ul> sub-element to the returned
			// <li> when has_children is true — child nodes are appended there.
			const element_node = get_input_element(element, self)
			if(children_elements_len > 0) {
				for (let i = 0; i < children_elements_len; i++) {
					const current_child	= children_elements[i]
					const child_node	= get_children_node(current_child)
					element_node.branch.appendChild(child_node)
				}
			}

			return element_node;
		}

	// root nodes
		// Root nodes are identified by parent === null (top level of the filter tree).
		const root_elements		= datalist.filter(el => el.parent === null)
		const root_elements_len	= root_elements.length
		for (let i = 0; i < root_elements_len; i++) {
			const current_element	= root_elements[i]
			const element_node		= get_children_node(current_element)
			ul_branch.appendChild(element_node)

		}


	return content_data
}//end get_content_data



// @license-end
