/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_MINI_SECTION_RECORD
* Manage the components logic and appearance in client side
*/
export const render_mini_section_record = function() {

	return true
}//end render_mini_section_record



/**
* MINI
* Render node for use in list
* @param array ar_instances
* @return DOM node wrapper
*/
render_mini_section_record.prototype.mini = async function(options={}) {

	const self = this

	const render_level = options.render_level || 'full'

	// ar_columns_instances
		// const ar_instances = await self.get_ar_instances()
		const ar_columns_instances = await self.get_ar_columns_instances_list()
		const columns_map = await self.columns_map

	const fragment = new DocumentFragment()

	// section_record wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode + (self.mode==='tm' ? ' list' : '')
		})

	// id column
		if (self.caller.model==='section' || self.caller.mode==='edit') {
			const id_column = build_id_column(self)
			fragment.appendChild(id_column)
		}

	// render the columns
		const columns_map_length = columns_map.length
		for (let i = 0; i < columns_map_length; i++) {
			const current_colum = columns_map[i]
			// get the specific instances for the current column
			const ar_instances = ar_columns_instances.filter(el => el.column_id === current_colum.id)

			// loop the instances for select the parent node
				const ar_instances_length = ar_instances.length

			// render all instances in parallel before create the columns nodes (to get the internal nodes)
				const ar_promises = []
				for (let k = 0; k < ar_instances_length; k++) {
					const current_promise = new Promise(function(resolve){
						const current_instance = ar_instances[k]

						// already rendered case
						if (typeof current_instance.node[0]!=='undefined') {
							resolve(true)
						}else{
							current_instance.render()
							.then(function(current_instance_node){
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

							const current_instance_node	= current_instance.node[0]
							column_node.appendChild(current_instance_node)

							if(j === ar_instances_length-1) continue
							const node_divisor = ui.create_dom_element({
								element_type	: 'span',
								inner_html		: self.caller.divisor || ' | ',
								parent			: column_node
							})

						}else{
							console.error("current_instance column_id not found:",current_instance);
						}
				}//end for (let i = 0; i < ar_instances_length; i++)

		}


	// component_info
		const component_info = self.get_component_info()
		if (component_info){
			const info_value = component_info.value.join('')
			const info = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'column column_info',
				inner_html		: info_value
			})
			//wrapper.appendChild(info)
			fragment.appendChild(info)
		}


	// wrapper filling
		wrapper.appendChild(fragment)

	// events
		wrapper.addEventListener("click", (e) => {
			// e.stopPropagation()
			if (!e.target.classList.contains("row_active")) {
				e.target.classList.add("row_active")
			}
		})


	return wrapper
}//end render_mini_section_record.prototype.list



/**
* BUILD_ID_COLUMN
* @param section_record instance self
* @return DOM element id_column
*/
const build_id_column = function(self) {

	const permissions = self.caller.permissions

	// offset
		const offset = self.offset

	// id_column
		const id_column = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'column'
		})

		// button edit (pen)
			if (permissions>0) {
				const edit_button = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button edit',
					parent			: id_column
				})
				edit_button.addEventListener("click", function(e){
					// edit_record(this, self)

					// rqo
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
									section_tipo : self.section_tipo,
									section_id : self.section_id,
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
* @param object column from the columns_map
* @return DOM element column
*/
const build_column_node = function(column_instance, self, ar_instances){

	const column_id	= column_instance.column_id
	const model		= self.caller.model

	const column_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'column column_' + column_id + ' ' + model + ' ' + self.mode
	})
	column_node.id = column_id

	return column_node
}// end build_column_node



/**
* DELETE_RECORD
* Navigate to selected record in edit mode
*/
const delete_record = (button, self) => {

	confirm(`delete_record:
		section_tipo: ${self.section_tipo}
		section_id: ${self.section_id}`)


	return false
}//end delete_record


