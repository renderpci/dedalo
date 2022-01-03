/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_SECTION_RECORD
* Manage the components logic and appearance in client side
*/
export const render_list_section_record = function() {

	return true
}//end render_list_section_record



/**
* LIST
* Render node for use in list
* @param array ar_instances
* @return DOM node wrapper
*/
render_list_section_record.prototype.list = async function(options={}) {

	const self = this

	const render_level = options.render_level || 'full'
	
	// ar_columns_instances
		// const ar_instances = await self.get_ar_instances()
		const ar_columns_instances = await self.get_ar_columns_instances()
		const columns_map = await self.columns_map


	const fragment = new DocumentFragment()

	// render the columns
		const columns_map_length = columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const current_column = columns_map[i]

			// callback column case
				if(current_column.callback && typeof current_column.callback==='function'){

					const column_node	= render_column_node_callback(current_column, self)
					const content_node	= current_column.callback({
						section_tipo	: self.section_tipo,
						section_id		: self.section_id,
						row_key 		: self.row_key,
						offset 			: self.offset,
						caller			: self.caller
					})
					if (content_node) {
						column_node.appendChild(content_node)
					}

					fragment.appendChild(column_node)
					continue;
				}

			// get the specific instances for the current column
				const ar_instances = ar_columns_instances.filter(el => el.column_id === current_column.id)

			// loop the instances for select the parent node
				const ar_instances_length = ar_instances.length

			// render all instances in parallel before create the columns nodes (to get the internal nodes)
				const ar_promises = []
				for (let k = 0; k < ar_instances_length; k++) {
					const current_promise = new Promise(function(resolve, reject){
						const current_instance = ar_instances[k]
						// already rendered case
						if (typeof current_instance.node[0]!=='undefined') {
							resolve(true)
						}else{
							current_instance.render()
							.then(function(current_instance_node){
								if (!current_instance_node) {
									reject(current_instance_node)
									return
								}
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
									const new_column_node = render_column_node(current_instance, self, ar_sub_columns_map)
									ar_column_nodes.push(new_column_node)
									fragment.appendChild(new_column_node)

									return new_column_node
								  })()

							const current_instance_node	= current_instance.node[0]
							column_node.appendChild(current_instance_node)

						}else{
							console.error("current_instance column_id not found:",current_instance);
						}
				}//end for (let i = 0; i < ar_instances_length; i++)
		}//end for (let i = 0; i < columns_map_length; i++) {


	// // component_info
		// 	const component_info = self.get_component_info()
		// 	if (component_info){
		// 		const info_value = component_info.value.join('')
		// 		const info = ui.create_dom_element({
		// 			element_type	: 'div',
		// 			class_name		: 'column column_info',
		// 			inner_html		: info_value
		// 		})
		// 		//wrapper.appendChild(info)
		// 		fragment.appendChild(info)
		// 	}


	// wrapper.  section_record wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode + (self.mode==='tm' ? ' list' : '')
		})
		wrapper.addEventListener("click", (e) => {
			// e.stopPropagation()
			if (!e.target.classList.contains("row_active")) {
				e.target.classList.add("row_active")
			}
		})
		wrapper.appendChild(fragment)


	return wrapper
}//end render_list_section_record.prototype.list



/**
* BUILD_ID_COLUMN
* @param section_record instance self
* @return DOM element id_column
*/
	// const build_id_column = function(self) {

	// 	const permissions = self.caller.permissions

	// 	// offset
	// 		const offset = self.offset

	// 	// id_column
	// 		const id_column = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'column id_column'
	// 		})

	// 	// edit_line
	// 		const edit_line = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'edit_line',
	// 			parent			: id_column
	// 		})

	// 		// section id
	// 			const section_id_info = ui.create_dom_element({
	// 				element_type	: 'span',
	// 				class_name		: 'section_id',
	// 				text_content	: self.section_id,
	// 				parent			: edit_line
	// 			})

	// 		// initiator. Caller section defined
	// 			const initiator = self.caller.initiator || false
	// 				// console.log("initiator:",initiator);
	// 				// console.log("self.caller:",self.caller);

	// 		// button
	// 		switch(true) {

	// 			case (initiator && initiator.indexOf('component_')!==-1):
	// 			// case (self.caller.type==='component'):
	// 				// component portal caller (link)
	// 					const link_button = ui.create_dom_element({
	// 						element_type	: 'span',
	// 						class_name		: 'button link',
	// 						parent			: edit_line
	// 					})
	// 					link_button.addEventListener("click", function(e){
	// 						// top window event
	// 						top.event_manager.publish('initiator_link_' + initiator, {
	// 							section_tipo	: self.section_tipo,
	// 							section_id		: self.section_id
	// 						})
	// 					})
	// 				// button edit (pen)
	// 					if (permissions>0) {
	// 						const edit_button = ui.create_dom_element({
	// 							element_type	: 'span',
	// 							class_name		: 'button edit',
	// 							parent			: edit_line
	// 						})
	// 						edit_button.addEventListener("click", async function(e){
	// 							// navigate link
	// 								const user_navigation_options = {
	// 									tipo		: self.section_tipo,
	// 									section_id	: self.section_id,
	// 									model		: self.caller.model,
	// 									mode		: 'edit'
	// 								}
	// 								if(SHOW_DEBUG===true) {
	// 									console.log("// section_record build_id_column user_navigation_options initiator component:",user_navigation_options);
	// 								}
	// 								event_manager.publish('user_navigation', user_navigation_options)

	// 							// detail_section
	// 								// ( async () => {
	// 								// 	const options = {
	// 								// 		model 			: 'section',
	// 								// 		type 			: 'section',
	// 								// 		tipo  			: self.section_tipo,
	// 								// 		section_tipo  	: self.section_tipo,
	// 								// 		section_id 		: self.section_id,
	// 								// 		mode 			: 'edit',
	// 								// 		lang 			: page_globals.dedalo_data_lang
	// 								// 	}
	// 								// 	const current_data_manager	= new data_manager()
	// 								// 	const page_element_call 	= await current_data_manager.get_page_element(options)
	// 								// 	const page_element 			= page_element_call.result

	// 								// 	// detail_section instance. Create target section page element and instance
	// 								// 		const detail_section = await get_instance(page_element)

	// 								// 		// set self as detail_section caller (!)
	// 								// 			detail_section.caller = initiator

	// 								// 		// load data and render wrapper
	// 								// 			await detail_section.build(true)
	// 								// 			const detail_section_wrapper = await detail_section.render()

	// 								// 	// modal container (header, body, footer, size)
	// 								// 		const header = ui.create_dom_element({
	// 								// 			element_type	: 'div',
	// 								// 			text_content 	: detail_section.label
	// 								// 		})
	// 								// 		const modal = ui.attach_to_modal(header, detail_section_wrapper, null, 'big')
	// 								// 		modal.on_close = () => {
	// 								// 			detail_section.destroy(true, true, true)
	// 								// 		}
	// 								// })()

	// 							// iframe
	// 								// ( async () => {
	// 								// 	const iframe = ui.create_dom_element({
	// 								// 		element_type	: 'iframe',
	// 								// 		src 			: '../page/?tipo=' + self.section_tipo + '&section_id=' + self.section_id + '&mode=edit'
	// 								// 	})
	// 								// 	// modal container (header, body, footer, size)
	// 								// 		const header = ui.create_dom_element({
	// 								// 			element_type	: 'div',
	// 								// 			text_content 	: detail_section.label
	// 								// 		})
	// 								// 		const modal = ui.attach_to_modal(header, iframe, null, 'big')
	// 								// 		modal.on_close = () => {
	// 								// 			detail_section.destroy(true, true, true)
	// 								// 	}
	// 								// })()
	// 						})
	// 					}
	// 				break

	// 			case (initiator && initiator.indexOf('tool_time_machine')!==-1):
	// 				// button time machine preview (eye)
	// 					const edit_button_tm = ui.create_dom_element({
	// 						element_type	: 'span',
	// 						class_name		: 'button eye',
	// 						parent			: edit_line
	// 					})
	// 					edit_button_tm.addEventListener("click", function(e){
	// 						// publish event
	// 						event_manager.publish('tm_edit_record', {
	// 							tipo		: self.section_tipo,
	// 							section_id	: self.section_id,
	// 							matrix_id	: self.matrix_id,
	// 							date		: self.modification_date || null,
	// 							mode		: 'tm'
	// 						})
	// 					})
	// 				break

	// 			case (self.caller.config && self.caller.config.source_model==='section_tool'):

	// 				// button edit (pen)
	// 					if (permissions>0) {
	// 						const edit_button = ui.create_dom_element({
	// 							element_type	: 'div',
	// 							class_name		: '',
	// 							inner_html 		: " "+self.caller.config.tool_context.label,
	// 							parent			: edit_line
	// 						})
	// 						edit_button.addEventListener("click", function(e){
	// 							e.stopPropagation();

	// 							// tool_context (clone always to prevent modify original object)
	// 								const tool_context = JSON.parse( JSON.stringify(self.caller.config.tool_context) )

	// 							// parse ddo_map section_id
	// 								tool_context.tool_config.ddo_map.map(el => {
	// 									if (el.section_id==='self') {
	// 										el.section_id = self.section_id
	// 									}
	// 								})

	// 							// lang set
	// 								tool_context.lang = self.lang

	// 							event_manager.publish('load_tool', {
	// 								tool_context	: tool_context,
	// 								caller			: self.caller
	// 							})
	// 						})
	// 					}
	// 				break;

	// 			default:
	// 				// button edit (pen)
	// 					if (permissions>0) {
	// 						const edit_button = ui.create_dom_element({
	// 							element_type	: 'span',
	// 							class_name		: 'button edit',
	// 							parent			: edit_line
	// 						})
	// 						edit_button.addEventListener("click", function(e){
	// 							// edit_record(this, self)

	// 							// rqo
	// 							let user_navigation_rqo
	// 							if (self.caller.type==='component') {
	// 								user_navigation_rqo = {
	// 									caller_id	: self.caller.id,
	// 									source		: {
	// 										action			: 'search',
	// 										model			: 'section',
	// 										tipo			: self.section_tipo,
	// 										section_tipo	: self.section_tipo,
	// 										mode			: 'edit',
	// 										lang			: self.caller.lang
	// 									},
	// 									sqo : {
	// 										section_tipo		: [{tipo : self.section_tipo}],
	// 										filter				: null,
	// 										limit				: 1,
	// 										offset				: offset,
	// 										filter_by_locators	: [{
	// 											section_tipo : self.section_tipo,
	// 											section_id : self.section_id,
	// 										}]
	// 									}
	// 								}
	// 							}else{
	// 								user_navigation_rqo = {
	// 									caller_id	: self.caller.id,
	// 									source		: {
	// 										action			: 'search',
	// 										model			: self.caller.model,
	// 										tipo			: self.section_tipo,
	// 										section_tipo	: self.section_tipo,
	// 										mode			: 'edit',
	// 										lang			: self.caller.lang
	// 									},
	// 									sqo : {
	// 										section_tipo	: [{tipo : self.section_tipo}],
	// 										limit			: 1,
	// 										offset			: offset,
	// 										filter			: self.caller.rqo.sqo.filter || null
	// 									}
	// 								}
	// 							}
	// 							event_manager.publish('user_navigation', user_navigation_rqo)
	// 						})
	// 					}
	// 				// delete_line
	// 					if (permissions>1 && (initiator && initiator.indexOf('component_')!==-1)) {
	// 						const delete_line = ui.create_dom_element({
	// 							element_type	: 'div',
	// 							class_name		: 'delete_line',
	// 							parent			: id_column
	// 						})
	// 						const delete_button = ui.create_dom_element({
	// 							element_type	: 'span',
	// 							class_name		: 'button remove',
	// 							parent			: delete_line
	// 						})
	// 						delete_button.addEventListener("click", function(e){

	// 							delete_record(this, self)
	// 						})
	// 					}
	// 				break
	// 		}


	// 	return id_column
	// }//end build_id_column



/**
* RENDER_COLUMN_NODE
* @param object column from the columns_map
* @return DOM element column
*/
const render_column_node = function(component_instance, self, ar_instances){

	const column_id	= component_instance.column_id
	const model		= self.caller.model

	const column_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'column column_' + column_id + ' ' + model
	})
	// column_node.id = column_id

	if (model==='component_portal') {

		const children_length = ar_instances.length // column_node.children.length
		if (children_length>1) {

			const grid_template_columns_ar_value = []
			for (let i = 0; i < children_length; i++) {
				const width = '1fr'
				// get the grid column spaces
				grid_template_columns_ar_value.push(width)
			}
			// console.log("grid_template_columns_ar_value:",grid_template_columns_ar_value, children_length);

			Object.assign(
				column_node.style,
				{
					"grid-template-columns": grid_template_columns_ar_value.join(' '),
					// "display": "grid"
				}
			)
		}
	}

	// console.log("component.model:",component.model, component.tipo, column_node);

	return column_node
}//end render_column_node



/**
* RENDER_COLUMN_NODE_CALLBACK
* @param object column from the columns_map
* @return DOM element column
*/
const render_column_node_callback = function(column_obj, self){

	const column_id	= column_obj.id
	const model		= 'callback'

	const column_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'column column_' + column_id + ' ' + model
	})
	// column_node.id = column_id

	return column_node
}// end render_column_node_callback


