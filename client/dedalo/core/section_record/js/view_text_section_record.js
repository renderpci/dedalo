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
* Special columns handled by callback (e.g. tool_time_machine id, ddinfo):
*   - Callback columns are appended directly without a column separator.
*   - 'ddinfo' callback columns are pre-rendered to detect emptiness; an empty ddinfo
*     column is skipped entirely so that it never contributes a trailing separator.
*   - 'remove' and 'section_id' virtual column ids suppress the following column separator.
*
* Component instances are rendered in parallel via Promise.all before their nodes are
* inspected. An instance node is skipped (treated as empty) when:
*   - Its childNodes list is empty, OR
*   - Its textContent (trimmed) is empty AND the first child is not an IMG or SPAN element.
*
* Main export: `view_text_section_record.render` — static async method called by
* `render_list_section_record.prototype.list`.
*/
export const view_text_section_record = function() {

	return true
}//end view_text_section_record



/**
* RENDER
* Produce the flat-text DOM node for a single section_record row.
*
* Iterates `self.columns_map` in order. For each column:
*   1. Callback columns — invoked immediately with the record's locator context and
*      their result node appended directly to the wrapper. The loop continues to the
*      next column without injecting a column separator.
*   2. Regular columns — all component instances matching `column_id` are rendered in
*      parallel. Non-empty instance nodes are joined by `fields_separator` spans and
*      appended to the wrapper. A `column_separator` span is then appended between
*      successive non-empty columns (see guard conditions below).
*
* Column separator guard: the separator after column[i] is suppressed when:
*   - No non-empty instances were produced for column[i], OR
*   - This is the last column (i === columns_map_length - 1), OR
*   - The next column's id is 'remove' or 'section_id' (virtual/action columns), OR
*   - The next column is a 'ddinfo' callback whose output is empty.
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

	// columns. Render the columns_map items
		const columns_map_length = columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const current_column = columns_map[i]

			// callback column case
			// (!) Note that many colum_id are callbacks (like tool_time_machine id column)
			// Callback columns skip the normal instance-render pipeline entirely; their
			// output is appended directly to the wrapper and the loop continues so that
			// no column separator is emitted after them.
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

					wrapper.appendChild(content_node)
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

					// if the node is empty do not use it
					// An instance is treated as empty when it has no child nodes at all, or when its
					// visible text is blank and the first child is not an image or inline SPAN element
					// (images and SPANs are valid non-textual content that should not be suppressed).
						const empty = current_instance_node.childNodes.length===0 ||
							(
								current_instance_node.textContent.trim()==='' &&
								current_instance_node.firstChild.tagName !== 'IMG' &&
								current_instance_node.firstChild.tagName !== 'SPAN'
							)
						if (empty) {
							continue
						}

						ar_nodes.push( current_instance_node )
				}//end for (let j = 0; j < ar_instances_length; j++)

			// join instances nodes, fields, with separator between them
			// Multiple instances sharing the same column_id (e.g. multilingual component variants)
			// are separated by the fields_separator so they read as a single concatenated value.
				const value_separator = self.context.fields_separator || ' | '
				const ar_nodes_length = ar_nodes.length
				for (let k = 0; k < ar_nodes_length; k++) {
					wrapper.appendChild(ar_nodes[k])
					if(k < ar_nodes_length -1) {
						const node_fields_separator = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'separator fields_separator',
							inner_html		: value_separator
						})
						wrapper.appendChild(node_fields_separator)
					}
				}

			// columns separator (between components inside the same column)
			// The separator is only emitted when: (a) this column produced at least one node,
			// (b) there is a next column, (c) the next column is not a virtual action column
			// ('remove', 'section_id'), and (d) if the next column is a 'ddinfo' callback,
			// its content is not empty (to avoid a trailing separator before blank metadata).
				if(ar_nodes_length > 0 && i < columns_map_length-1 && columns_map[i+1].id!=='remove' && columns_map[i+1].id!=='section_id') {

					// ddinfo case. Check i f is empty the content
						if (columns_map[i+1].id==='ddinfo' && typeof columns_map[i+1].callback==='function') {
							const content_node = columns_map[i+1].callback({
								section_tipo	: self.section_tipo,
								section_id		: self.section_id,
								caller			: self.caller
							})
							if (!content_node.textContent || !content_node.textContent.length) {
								continue; // skip empty ddinfo
							}
						}

					const fields_separator		= self.context.fields_separator || ', '
					const node_fields_separator = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'separator column_separator',
						inner_html		: fields_separator
					})
					wrapper.appendChild(node_fields_separator)
				}

		}//end for (let i = 0; i < columns_map_length; i++)


	return wrapper
}//end render



// @license-end
