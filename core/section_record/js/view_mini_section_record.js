// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {render_column_node_callback} from './view_default_list_section_record.js'



/**
* VIEW_MINI_SECTION_RECORD
* Manage the components logic and appearance in client side
*/
export const view_mini_section_record = function() {

	return true
}//end view_mini_section_record



/**
* MINI
* Render node for use in list
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_mini_section_record.render = async function(self, options) {

	const render_level = options.render_level || 'full'

	// ar_columns_instances
		const ar_columns_instances	= await self.get_ar_columns_instances_list()
		const columns_map			= self.columns_map

	const fragment = new DocumentFragment()

	// section_record wrapper
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
		const columns_map_length = columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const current_column = columns_map[i]

			// callback column case
			// (!) Note that many colum_id are callbacks (like tool_time_machine id column)
				if(current_column.callback && typeof current_column.callback==='function'){

					// column_node (standard section_record empty column to be filled with content_node)
						const column_node = render_column_node_callback(current_column, self)

					// content_node
						const content_node = current_column.callback({
							section_tipo		: self.section_tipo,
							section_id			: self.section_id,
							row_key				: self.row_key,
							paginated_key		: self.paginated_key,
							caller				: self.caller,
							matrix_id			: self.matrix_id, // tm var
							modification_date	: self.modification_date || null, // tm var
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
		wrapper.addEventListener('click', (e) => {
			if (!e.target.classList.contains('row_active')) {
				e.target.classList.add('row_active')
			}
		})


	return wrapper
}//end render



/**
* BUILD_ID_COLUMN
* @param object self
* 	section_record instance
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
			const button_edit = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button edit',
				parent			: id_column
			})
			button_edit.addEventListener('click', function(e){
				e.stopPropagation();

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
* @param object column_instance
* 	column from the columns_map
* @param object self
* @return HTMLElement column_node
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
