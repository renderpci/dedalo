// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
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
* @return DocumentFragment
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
			// (self.mode==='tm' ? ' list' : ''),
			'view_'+self.context.view
		]
		wrapper.classList.add(...ar_css)

	// last data
		let last_data = null

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

			// text value of instance
				const text_value = []

			// create the column nodes (fields) and assign the instances nodes to it.
				for (let j = 0; j < ar_instances_length; j++) {

					const current_instance = ar_instances[j]

					last_data = {
						section_tipo	: current_instance.section_tipo,
						section_id		: current_instance.section_id
					}

					// check instance is valid
						if (typeof current_instance==='undefined') {
							console.error('Undefined current_instance:', current_instance, j, ar_instances);
							continue;
						}
					// check if the current_instance has column_id, if not, a error was done by the common creating the columns.
						if(!current_instance.column_id) {
							console.error('current_instance column_id not found:', current_instance);
							continue;
						}

					// add already rendered node
						const current_instance_node	= current_instance.node

						// check the view of the instance to get the correct content, if the instance has text convert to html else get the node
						switch (current_instance.context.view) {
							case 'text':
								// (!) Do not use here 'innerHTML +=' because removes the edit button events
								// extract text content from current_instance_node and add to the wrapper
								// this allow to remove on-the-fly intermediate section_record non necessary containers
								const temp_container		= document.createElement('span')
								temp_container.innerHTML	= current_instance_node.textContent
								const children				= temp_container.childNodes;
								const children_length		= children.length
								for (let c = 0; c < children_length; c++) {
									const current_child = children[c];
									wrapper.appendChild(current_child)

									add_fields_separator()
								}
								// added the values into an array to be checked
								text_value.push( current_instance_node.textContent )
								break;
							default:
								wrapper.appendChild(current_instance_node)
								add_fields_separator()
								break;
						}

						// ADD_FIELDS_SEPARATOR
						// check the node position and add fields separator
						// add values separator between values of the same column
						// sometimes the column could have more than 1 component (component_portal with 1 column that call more than 1 component)
						// sometimes the column could have more than 1 value as component_input_tex with more than 1 value ["value1","value2"]
						function add_fields_separator() {
							if(j < ar_instances_length-1) {
								const next_node_text = ar_instances[j+1].node
								if(next_node_text.textContent.length > 1){
									const value_separator = self.context.fields_separator || ' | '
									const node_fields_separator = document.createTextNode(value_separator)
									wrapper.appendChild(node_fields_separator)
								}
							}
						}

				}//end for (let j = 0; j < ar_instances_length; j++)

			// columns separator (between components inside the same column)
				if(i < columns_map_length-1 && columns_map[i+1].id!=='remove' && columns_map[i+1].id!=='section_id') {
					if(text_value.join('').length > 0){
						const fields_separator		= self.context.fields_separator || ', '
						const node_fields_separator	= document.createTextNode(fields_separator)
						wrapper.appendChild(node_fields_separator)
					}
				}

		}//end for (let i = 0; i < columns_map_length; i++)

		// empty values case. Only button edit is present
		// Indexation case could not resolve references values. In that case, fallback value to
		// section_tipo + section_id.
		// Note that checked node length take into account the button edit node, because is < 2 and not < 1
		const current_child_text_nodes = [...wrapper.childNodes].filter(el => el.nodeType === Node.TEXT_NODE)
		if (current_child_text_nodes.length===0 && last_data) {
			wrapper.insertAdjacentHTML('beforeend', ' ' + (last_data.section_tipo || '') +'_'+ (last_data.section_id || '') )
		}


	// component_info add if exists. (!) Removed 22-11-202 because is already added by the component (portal)
		// const component_info = self.get_component_info()
		// if (component_info){
		// 	const info_value	= '&nbsp;' + component_info.value.join('&nbsp;')
		// 	const info			= document.createElement('span')
		// 		  info.innerHTML= info_value
		// 	wrapper.append(...info.childNodes)
		// }


	return wrapper
}//end render



// @license-end
