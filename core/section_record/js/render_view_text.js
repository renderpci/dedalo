/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_VIEW_TEXT
* Manage the components logic and appearance in client side
*/
export const render_view_text = function() {

	return true
}//end render_view_text



/**
* MINI
* Render node for use in list
* @param array ar_instances
* @return DOM node wrapper
*/
render_view_text.render = async function(self, options) {

	const render_level = options.render_level || 'full'

	// ar_columns_instances
		const ar_columns_instances = await self.get_ar_columns_instances_list()
		const columns_map = await self.columns_map

	const fragment = new DocumentFragment()

	// section_record wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode + (self.mode==='tm' ? ' list' : '')
		})


	// render the columns
		const columns_map_length = columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const current_colum = columns_map[i]

			// instances.get the specific instances for the current column
				const ar_instances = ar_columns_instances.filter(el => el.column_id === current_colum.id)

			// loop the instances for select the parent node
				const ar_instances_length = ar_instances.length

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

			// create the column nodes and assign the instances nodes to it.
				const ar_column_nodes = []
				for (let j = 0; j < ar_instances_length; j++) {

					const current_instance = ar_instances[j]

					// check instance
						if (typeof current_instance==="undefined") {
							console.error("Undefined current_instance:", current_instance, j, ar_instances);
							continue;
						}
						// check if the current_instance has column_id, if not, a error was done by the common creating the columns.
						if (current_instance.column_id) {

							const ar_sub_columns_map = current_instance.columns_map || ar_instances

							// column. If column already exists, place the component node into the column.
							// Else, creates a new column and place it into the fragment
							// const found_node	= ar_column_nodes.find(el => el.id === current_instance.column_id)
							// const column_node	= found_node
							// 	? found_node
							// 	: (()=>{
							// 		const new_column_node = build_column_node(current_instance, self, ar_sub_columns_map)
							// 		ar_column_nodes.push(new_column_node)
							// 		fragment.appendChild(new_column_node)

							// 		return new_column_node
							// 	  })()

							const current_instance_node	= current_instance.node
							fragment.appendChild(current_instance_node)

							if(j === ar_instances_length-1) continue
							const node_value_separator = document.createTextNode(' | ')

							fragment.appendChild(node_value_separator)

						}else{
							console.error("current_instance column_id not found:",current_instance);
						}
				}//end for (let i = 0; i < ar_instances_length; i++)

		}


	// component_info
		const component_info = self.get_component_info()
		if (component_info){
			const info_value = component_info.value.join('')
			const info = document.createTextNode(info_value)
			fragment.appendChild(info)
		}


	return fragment
}//end render_view_text.prototype.list

