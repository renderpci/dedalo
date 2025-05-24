// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_SECTION_RECORD
* Manage the components logic and appearance in client side
*/
export const view_text_section_record = function() {

	return true
}//end view_text_section_record



/**
* RENDER
* Render as text nodes
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_section_record.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// ar_columns_instances
		const ar_columns_instances	= await self.get_ar_columns_instances_list()
		const columns_map			= await self.columns_map

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
							modification_date	: self.modification_date || null, // tm var
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
				if(ar_nodes_length > 0 && i < columns_map_length-2 && columns_map[i+1].id!=='remove' && columns_map[i+1].id!=='section_id') {

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
