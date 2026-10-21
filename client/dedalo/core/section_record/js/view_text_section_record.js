// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_SECTION_RECORD
* Pure-text view renderer for section_record in list/search mode.
*
* This is one of three view strategies dispatched by `render_list_section_record.prototype.list`
* when `self.context.view === 'text'`. The other two are `view_default_list_section_record`
* (full column-grid layout) and `view_mini_section_record` (compact inline layout).
*
* Unlike the default and mini views, this renderer produces no structural column wrappers.
* Instead it concatenates all non-empty component nodes directly into the record wrapper,
* joining multiple instances within the same column with a `fields_separator` span, and
* injecting a `column_separator` span between successive columns. This makes it suitable
* for compact label generation, portal pickers, and any context where a flat text-like
* representation of a record is preferred over a structured grid.
*
* Column separators (one `separator` between groups; `fields_separator` inside a
* group; both from `context.fields_separator`):
*   - A DATA column is always separated from its neighbours.
*   - Two adjacent CALLBACK columns stay glued (indexation portals append the tag,
*     ddinfo and info callbacks as one suffix).
*   - 'remove' and 'section_id' control columns take no separator before or after them.
*   - An empty column (an empty ddinfo fragment included) is dropped from the join,
*     so the separator lands between the columns that DO render. The old "peek at
*     the next column" separator was never emitted when an intermediate ddinfo was
*     empty, gluing the following column on ("Latina" + "Agrupador" → "LatinaAgrupador").
*
* Component instances are rendered in parallel via Promise.all before their nodes are
* inspected. An instance node is skipped (treated as empty, `is_empty_instance_node`)
* when its childNodes list is empty, OR its textContent (trimmed) is empty AND its
* first child is not an IMG or SPAN element. A CALLBACK column is skipped only when
* it returns no child nodes at all: its output is meaningful DOM even with no text
* (an icon-only button).
*
* Main export: `view_text_section_record.render` — static async method called by
* `render_list_section_record.prototype.list`.
*/
export const view_text_section_record = function() {

	return true
}//end view_text_section_record



/**
* IS_EMPTY_INSTANCE_NODE
* Empty test for a COMPONENT instance node: a node contributes nothing when it
* has no children, or when it has no text and its first child is neither an IMG
* nor an inline SPAN (those carry content without text).
*
* NOT for callback columns: their output is meaningful DOM (a wrapper with an
* icon-only button included), so a callback column is skipped only when it
* returns no child nodes at all.
*
* @param {Node|null} node
* @returns {boolean}
*/
const is_empty_instance_node = function(node) {

	if (!node || node.childNodes.length===0) {
		return true
	}

	const first_child = node.firstChild

	return node.textContent.trim()==='' &&
		first_child.tagName !== 'IMG' &&
		first_child.tagName !== 'SPAN'
}//end is_empty_instance_node



/**
* RENDER
* Produce the flat-text DOM node for a single section_record row.
*
* Iterates `self.columns_map` in order and collects one group per NON-EMPTY
* column; the groups are joined after the loop:
*   1. Callback columns — invoked with the record's locator context. Their result
*      becomes a group of its own (an empty result, e.g. an empty ddinfo, joins
*      nothing).
*   2. Regular columns — all component instances matching `column_id` are rendered
*      in parallel; their non-empty nodes are joined by `fields_separator` spans.
*
* Column separator rule (one `separator` between groups; `fields_separator`
* inside a group):
*   - 'remove' and 'section_id' control columns take no separator before OR after
*     them,
*   - two consecutive CALLBACK columns take none either (indexation portals append
*     tag/ddinfo/info callbacks as one glued suffix), while a data column is always
*     separated — so `term | (empty ddinfo) | model` reads `term | model`, never
*     `termmodel`.
*
* (!) `options.render_level` is read but currently unused — it is accepted for API
* parity with other view renderers that may use it in the future.
*
* @param {Object} self    - The section_record instance being rendered. Expected
*   properties: `id`, `model`, `tipo`, `mode`, `context` (with `view`,
*   `fields_separator`), `columns_map`, `section_tipo`, `section_id`,
*   `row_key`, `paginated_key`, `offset`, `caller`, `matrix_id`, `locator`.
*   The method `self.get_ar_columns_instances_list()` must be available and must
*   return a Promise resolving to an Array of component instances, each carrying
*   a `column_id`, `status`, `node`, and `render()` method.
* @param {Object} options - Render options forwarded from list().
* @param {string} [options.render_level='full'] - Rendering depth hint; accepted
*   for API parity but not currently acted on by this renderer.
* @returns {Promise<HTMLElement>} The wrapper `<div>` element containing all
*   non-empty component nodes for this record, ready to be inserted into the DOM.
*/
view_text_section_record.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// ar_columns_instances
		const ar_columns_instances	= await self.get_ar_columns_instances_list()
		const columns_map			= self.columns_map

	// section_record wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: self.id
		})
		const ar_css = [
			self.model,
			self.tipo,
			self.mode,
			'view_' + self.context.view
		]
		wrapper.classList.add(...ar_css)

	// column_groups. One entry per NON-EMPTY column, in order, joined after the
	// loop. `is_data` + `control` + `separator_before` carry the rule described in
	// the header.
		const column_groups = []
		const separator = self.context.fields_separator || ' | '

	// push_group — appends one column's nodes and decides its preceding separator
		const push_group = function(nodes, is_data, column_id) {

			const previous	= column_groups[column_groups.length-1]
			const control	= column_id==='remove' || column_id==='section_id'

			column_groups.push({
				nodes				: nodes,
				is_data				: is_data,
				control				: control,
				separator_before	: previous!==undefined &&
					!control &&
					!previous.control &&
					(previous.is_data || is_data)
			})
		}

	// columns. Render the columns_map items
		const columns_map_length = columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const current_column = columns_map[i]

			// callback column case (section_id, tag, ddinfo, info, …)
			// Callback columns skip the normal instance-render pipeline entirely; their
			// output is one group (subject to the callback/control separator rule).
				if(current_column.callback && typeof current_column.callback==='function'){

					// content_node
						const content_node = current_column.callback({
							section_tipo		: self.section_tipo,
							section_id			: self.section_id,
							row_key				: self.row_key,
							paginated_key		: self.paginated_key,
							offset				: self.offset,
							caller				: self.caller,
							matrix_id			: self.matrix_id, // tm var
							locator				: self.locator
						})

					// empty callback output (an empty ddinfo fragment) joins nothing
						if (content_node && content_node.childNodes.length>0) {
							push_group([content_node], false, current_column.id)
						}
					continue;
				}

			// instances. Get the specific instances for the current column
				const ar_instances			= ar_columns_instances.filter(el => el.column_id === current_column.id)
				const ar_instances_length	= ar_instances.length

			// render all instances in parallel before create the columns nodes (to get the internal nodes)
				const ar_promises = []
				for (let k = 0; k < ar_instances_length; k++) {
					const current_promise = new Promise(function(resolve){

						const current_instance = ar_instances[k]

						// already rendered case
						if (current_instance.status==='rendered' && current_instance.node!==null) {
							resolve(true)
						}else{
							current_instance.render()
							.then(()=>{
								resolve(true)
							})
							.catch((errorMsg) => {
								console.error(errorMsg);
								resolve(false)
							})
						}
					})
					ar_promises.push(current_promise)
				}
				// nodes. Await all instances are parallel rendered
				await Promise.all(ar_promises)// render work done safely

			// text value of instance
				const ar_nodes = []

			// create the column nodes (fields) and assign the instances nodes to it.
				for (let j = 0; j < ar_instances_length; j++) {

					const current_instance = ar_instances[j]

					// check instance is valid
						if (typeof current_instance==='undefined') {
							console.error('Undefined current_instance:', current_instance, j, ar_instances);
							continue;
						}
					// check if the current_instance has column_id, if not, an error was done by the common creating the columns.
						if(!current_instance.column_id) {
							console.error('current_instance column_id not found:', current_instance);
							continue;
						}

					// add already rendered node
						const current_instance_node	= current_instance.node

					// if the node is empty do not use it (image/span-only nodes are not empty)
						if (is_empty_instance_node(current_instance_node)) {
							continue
						}

						ar_nodes.push( current_instance_node )
				}//end for (let j = 0; j < ar_instances_length; j++)

			// collect the column nodes. Multiple instances sharing the same column_id
			// (e.g. multilingual component variants) are joined by the fields_separator.
				if (ar_nodes.length>0) {
					push_group(ar_nodes, true, current_column.id)
				}

		}//end for (let i = 0; i < columns_map_length; i++)

	// join columns. `separator` between groups, `separator` inside a group too
		for (let i = 0; i < column_groups.length; i++) {

			const group = column_groups[i]

			if (group.separator_before) {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'separator column_separator',
					inner_html		: separator,
					parent			: wrapper
				})
			}

			for (let k = 0; k < group.nodes.length; k++) {
				if (k>0) {
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'separator fields_separator',
						inner_html		: separator,
						parent			: wrapper
					})
				}
				wrapper.appendChild(group.nodes[k])
			}
		}


	return wrapper
}//end render



// @license-end
