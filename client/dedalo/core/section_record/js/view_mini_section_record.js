// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



/**
* VIEW_MINI_SECTION_RECORD
* Compact list-row renderer for a `section_record` instance.
*
* This module is one of three interchangeable view strategies for `section_record`
* (alongside `view_default_list_section_record` and `view_text_section_record`).
* It is selected when `self.context.view === 'mini'`.
*
* Responsibilities:
*   - `view_mini_section_record.render` — assemble a condensed row node from the
*     record's `columns_map`, rendering each column's component instances in parallel
*     and joining multiple instances per column with a configurable `fields_separator`.
*   - `build_id_column` — build the narrow action column that carries the "open in edit
*     mode" button; two RQO shapes are emitted depending on whether the caller is a
*     component or a section.
*   - `build_column_node` — create a bare wrapper `<div>` for a grid column, stamped
*     with CSS classes derived from `column_id` and the caller model.
*
* The "mini" view deliberately omits row-hover hilighting and responsive add-ons
* (both handled by `view_default_list_section_record`). It is used in compact contexts
* such as inline relation pickers or the thesaurus narrow-term lists.
*
* Imported helpers:
*   - `event_manager`          from `../../common/js/event_manager.js`
*   - `ui`                     from `../../common/js/ui.js`
*   - `render_column_node_callback` from `./view_default_list_section_record.js`
*/


// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {render_column_node_callback} from './view_default_list_section_record.js'



/**
* VIEW_MINI_SECTION_RECORD
* Constructor stub — this module uses a static-method pattern.
* All logic lives on `view_mini_section_record.render`; the constructor
* itself is never invoked directly and simply returns `true` as a no-op.
*/
export const view_mini_section_record = function() {

	return true
}//end view_mini_section_record



/**
* RENDER
* Build and return the compact row wrapper node for a `section_record` in list mode.
*
* Iterates `self.columns_map` in order. For each column:
*   1. If the column carries a `callback` function (e.g. tool_time_machine action
*      columns), `render_column_node_callback` creates the wrapper and the callback
*      supplies the inner content.
*   2. Otherwise, the component instances whose `column_id` matches the current
*      column are collected, rendered in parallel via `Promise.all`, then appended
*      into a shared column `<div>`. Multiple instances in the same column are
*      separated by `self.context.fields_separator` (defaults to ' | ').
*
* The returned node is a `<div>` whose id equals `self.id` and whose CSS class list
* encodes `[self.model, self.tipo, self.mode, 'view_' + view]`.
*
* A click listener on the wrapper adds the class `row_active` to the clicked element,
* providing minimal row-selection feedback without triggering full navigation.
*
* @param {Object} self    - The `section_record` instance being rendered.
*   @param {string}        self.id            - Stable DOM id for the wrapper element.
*   @param {string}        self.model         - Always 'section_record'.
*   @param {string}        self.tipo          - Ontology tipo of the owning component/section.
*   @param {string}        self.mode          - Render mode (e.g. 'list', 'search', 'tm').
*   @param {Object}        self.context       - Record context descriptor.
*   @param {string}        self.context.view  - Active view name, e.g. 'mini'.
*   @param {string}        [self.context.fields_separator] - Separator injected between
*                           sibling component nodes in the same column (default ' | ').
*   @param {Array}         self.columns_map   - Ordered column layout descriptors from
*                           `get_columns_map`. Each entry: { id, callback?, label, ... }.
*   @param {string}        self.section_tipo  - Ontology tipo of the parent section.
*   @param {string|number} self.section_id    - Record DB id within the parent section.
*   @param {number|null}   self.row_key       - 0-based index in the current page entries.
*   @param {number|null}   self.paginated_key - Position in the pagination window.
*   @param {Object}        self.caller        - The owning component or section instance.
*   @param {string|null}   self.matrix_id     - Time-machine matrix id; null in normal mode.
*   @param {Object}        self.locator       - Source locator { section_tipo, section_id, ... }.
* @param {Object} options  - Render configuration object (currently only `render_level` is read).
*   @param {string} [options.render_level='full'] - Rendering depth hint (reserved for future use).
* @returns {Promise<HTMLElement>} The fully populated row `<div>` node.
*/
view_mini_section_record.render = async function(self, options) {

	const render_level = options.render_level || 'full'

	// ar_columns_instances
	// Retrieve all child component instances aligned to the columns_map layout.
	// `get_ar_columns_instances_list` resolves context from datum and builds (but
	// does not yet render) one instance per component-in-column entry.
		const ar_columns_instances	= await self.get_ar_columns_instances_list()
		const columns_map			= self.columns_map

	const fragment = new DocumentFragment()

	// section_record wrapper
	// The wrapper id must equal self.id so that the owning section can locate
	// and replace this node during pagination or filter updates.
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: self.id
		})
		const ar_css = [
			self.model,
			self.tipo,
			self.mode,
			'view_'+self.context.view
		]
		wrapper.classList.add(...ar_css)

	// render the columns
	// Walk columns_map in declaration order so the DOM matches the configured
	// column sequence exactly, regardless of the order instances were resolved.
		const columns_map_length = columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const current_column = columns_map[i]

			// callback column case
			// (!) Note that many colum_id are callbacks (like tool_time_machine id column)
			// Callback columns provide their own content node via a caller-supplied function.
			// They bypass the normal instance-render pipeline entirely.
				if(current_column.callback && typeof current_column.callback==='function'){

					// column_node (standard section_record empty column to be filled with content_node)
						const column_node = render_column_node_callback(current_column, self)

					// content_node
					// Pass the minimum locator data the callback needs to build its node.
					// Note: unlike `view_default_list_section_record`, `ar_instances` is NOT
					// forwarded here — callbacks in the mini view receive only the locator properties.
						const content_node = current_column.callback({
							section_tipo		: self.section_tipo,
							section_id			: self.section_id,
							row_key				: self.row_key,
							paginated_key		: self.paginated_key,
							caller				: self.caller,
							matrix_id			: self.matrix_id, // tm var
							locator				: self.locator
						})
						if (content_node) {
							column_node.appendChild(content_node)
						}

					fragment.appendChild(column_node)
					continue;
				}

			// instances.get the specific instances for the current column
				const ar_instances = ar_columns_instances.filter(el => el.column_id === current_column.id)

			// loop the instances for select the parent node
				const ar_instances_length = ar_instances.length

			// render all instances in parallel before create the columns nodes (to get the internal nodes)
			// Parallel rendering avoids sequential await latency when a column holds
			// multiple component instances (e.g. a portal with several children).
			// Already-rendered instances (node !== null) short-circuit immediately.
				const ar_promises = []
				for (let k = 0; k < ar_instances_length; k++) {
					const current_promise = new Promise(function(resolve){
						const current_instance = ar_instances[k]

						// already rendered case
						if (current_instance.node!==null) {
							resolve(true)
						}else{
							current_instance.render()
							.then(function(){
								resolve(true)
							}).catch((errorMsg) => {
								console.error(errorMsg);
							})
						}
					})
					ar_promises.push(current_promise)
				}
				// nodes. Await all instances are parallel rendered
				await Promise.all(ar_promises)// render work done safely

			// create the column nodes and assign the instances nodes to it.
			// A single `column_node` is shared by all instances that share the same
			// `column_id`. On the first hit the node is created and cached; subsequent
			// hits find it in `ar_column_nodes` and append their content directly.
				const ar_column_nodes = []
				for (let j = 0; j < ar_instances_length; j++) {

					const current_instance = ar_instances[j]

					// check instance
						if (typeof current_instance==="undefined") {
							console.error("Undefined current_instance:", current_instance, j, ar_instances);
							continue;
						}
					// check if the current_instance has column_id if not a error was done by the common creating the columns.
						if (current_instance.column_id) {

							const ar_sub_columns_map = current_instance.columns_map || ar_instances

							// column. If column already exists, place the component node into the column.
							// Else, creates a new column and place it into the fragment
							const found_node	= ar_column_nodes.find(el => el.id === current_instance.column_id)
							const column_node	= found_node
								? found_node
								: (()=>{
									const new_column_node = build_column_node(current_instance, self, ar_sub_columns_map)
									ar_column_nodes.push(new_column_node)
									fragment.appendChild(new_column_node)

									return new_column_node
								  })()

							const current_instance_node	= current_instance.node
							column_node.appendChild(current_instance_node)

							// fields_separator. Skip the separator after the last instance in the column
							// to avoid a trailing delimiter. `fields_separator` defaults to ' | ' when
							// not set in context.
							if(j === ar_instances_length-1) continue
							// node_fields_separator
							ui.create_dom_element({
								element_type	: 'span',
								inner_html		: self.context.fields_separator || ' | ',
								parent			: column_node
							})

						}else{
							console.error("current_instance column_id not found:",current_instance);
						}
				}//end for (let j = 0; j < ar_instances_length; j++)

		}//end for (let i = 0; i < columns_map_length; i++)

	// wrapper filling
		wrapper.appendChild(fragment)

	// events
	// Minimal click feedback: marks the clicked element as the active row.
	// Unlike the default list view, this does NOT trigger full edit navigation —
	// that is the responsibility of an explicit edit button (see build_id_column).
		wrapper.addEventListener('click', (e) => {
			if (!e.target.classList.contains('row_active')) {
				e.target.classList.add('row_active')
			}
		})


	return wrapper
}//end render



/**
* BUILD_ID_COLUMN
* Build the narrow action column that houses the "open in edit mode" pen button.
*
* The button emits a `user_navigation` event (consumed by `page.js`) whose RQO
* shape depends on whether the record is called from a component or a section:
*
*   - **Component caller** (e.g. a relation picker embedded in a portal):
*     Uses `filter_by_locators` with the specific `section_id` so the edit
*     view opens exactly this record, regardless of which page it sits on.
*
*   - **Section caller** (the normal list view):
*     Uses the current pagination `offset` as the SQO `offset` and forwards
*     the caller's existing `sqo.filter` so the edit view inherits the same
*     filter the user applied in the list.
*
* The button is only rendered when `self.caller.permissions > 0` (i.e. the user
* has at least read-write access to the owning section).
*
* @param {Object} self - The `section_record` instance.
*   @param {Object}        self.caller               - Owning component or section instance.
*   @param {number}        self.caller.permissions   - Permission level (0 = read-only; >0 = edit allowed).
*   @param {string}        self.caller.type          - 'component' or 'section'.
*   @param {string}        self.caller.id            - Caller instance id (passed in RQO as `caller_id`).
*   @param {string}        self.caller.lang          - Active language tag.
*   @param {string}        self.caller.model         - Caller model name.
*   @param {Object}        self.caller.rqo           - Caller's current request-query object.
*   @param {number|null}   self.offset               - Pagination offset for the current page.
*   @param {string}        self.section_tipo         - Ontology tipo of the parent section.
*   @param {string|number} self.section_id           - Record DB id.
* @returns {HTMLElement} The `id_column` wrapper `<div>` (may be empty when permissions === 0).
*/
const build_id_column = function(self) {

	const permissions = self.caller.permissions

	// offset
	// The global pagination offset is used by the section-caller path to position
	// the edit view on the correct record without re-running the filter query.
		const offset = self.offset

	// id_column
		const id_column = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'column'
		})

	// button edit (pen)
	// Only add the button when the user has write permission on the owning section.
		if (permissions>0) {
			const button_edit = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button edit',
				parent			: id_column
			})
			button_edit.addEventListener('click', function(e){
				e.stopPropagation();

				// rqo
				// Build the navigation request-query object (RQO). Two shapes:
				//   • component caller — target the exact section_id via filter_by_locators
				//     so the edit mode opens on this specific record regardless of the
				//     section's current filter or pagination state.
				//   • non-component caller (section) — navigate by offset within the
				//     current filter, letting the section's own SQO drive record selection.
				const user_navigation_rqo = (self.caller.type==='component')
					? {
						caller_id	: self.caller.id,
						source		: {
							action			: 'search',
							model			: 'section',
							tipo			: self.section_tipo,
							section_tipo	: self.section_tipo,
							mode			: 'edit',
							lang			: self.caller.lang
						},
						sqo : {
							section_tipo		: [{tipo : self.section_tipo}],
							filter				: null,
							limit				: 1,
							offset				: offset,
							filter_by_locators	: [{
								section_tipo	: self.section_tipo,
								section_id		: self.section_id
							}]
						}
					}
					: {
						caller_id	: self.caller.id,
						source		: {
							action			: 'search',
							model			: self.caller.model,
							tipo			: self.section_tipo,
							section_tipo	: self.section_tipo,
							mode			: 'edit',
							lang			: self.caller.lang
						},
						sqo : {
							section_tipo	: [{tipo : self.section_tipo}],
							limit			: 1,
							offset			: offset,
							filter			: self.caller.rqo.sqo.filter || null
						}
					}
				event_manager.publish('user_navigation', user_navigation_rqo)
			})
		}


	return id_column
}//end build_id_column



/**
* BUILD_COLUMN_NODE
* Create a bare column wrapper `<div>` for the given component instance.
*
* The element receives a compound CSS class of the form:
*   `column column_<column_id> <caller_model> <mode>`
* and its DOM `id` is set to `column_id` so that the render loop can later
* locate it via `ar_column_nodes.find(el => el.id === current_instance.column_id)`.
*
* Unlike `render_column_node` in `view_default_list_section_record`, this helper
* does NOT attach responsive add-ons (`ui.make_column_responsive`) — the mini view
* is not used in contexts where the full responsive column behaviour is needed.
*
* @param {Object}    column_instance             - A component instance whose `column_id`
*                                                  identifies the grid column to create.
*   @param {string}  column_instance.column_id   - Target column identifier (maps to `columns_map[i].id`).
* @param {Object}    self                        - The parent `section_record` instance.
*   @param {Object}  self.caller                 - Owning component or section.
*   @param {string}  self.caller.model           - Caller model name, added as a CSS class.
*   @param {string}  self.mode                   - Render mode, added as a CSS class.
* @param {Array}     [ar_sub_columns_map]        - Sub-columns layout. Passed by the render loop
*                                                  for parity with `render_column_node`, but this
*                                                  function does not declare or use the third argument
*                                                  (JS silently discards extra arguments).
* @returns {HTMLElement} The new column `<div>` node, already stamped with id and CSS classes.
*/
const build_column_node = function(column_instance, self) {

	const column_id	= column_instance.column_id
	const model		= self.caller.model

	const column_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'column column_' + column_id + ' ' + model + ' ' + self.mode
	})
	column_node.id = column_id


	return column_node
}// end build_column_node



// @license-end
