/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_section_record = function() {

	return true
}//end render_section_record



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_section_record.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.component.build_wrapper_edit(self, {
			label 		 : null,
			content_data : current_content_data
		})


	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data_edit
*/
const content_data_edit = async function(self) {

	const ar_instances = await self.get_ar_instances()

	const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		// loop the instances for select the parent node
		const ar_instances_length = ar_instances.length
		for (let i = 0; i < ar_instances_length; i++) {

			if (typeof ar_instances[i]==="undefined") {
				console.warn(`Skipped undefined instance key ${i} from ar_instances:`, ar_instances);
				console.log("self:",self);
				continue;
			}

			const current_instance 		= ar_instances[i]
			const current_instance_node = current_instance.node[0] || await current_instance.render()

			// get the parent node inside the context
				const parent_grouper = current_instance.context.parent_grouper
			
			// if the item has the parent the section_tipo is direct children of the section_record
			// else we has other item parent
			if(parent_grouper===self.section_tipo || self.mode==="list"){

				fragment.appendChild(current_instance_node)

			}else{

				// component_filter case . Send to inspector
					if (current_instance.model==='component_filter') {

						ui.place_element({
							source_node 		: current_instance_node,
							source_instance 	: self,
							target_instance 	: self.caller.inspector,
							container_selector 	: ".project_container",
							target_selector 	: ".wrapper_component.component_filter",
							place_mode 			: 'replace' // add | replace
						})

						continue;
					}

				// get the parent instance like section group or others
				const parent_instance = ar_instances.find(instance =>  instance.tipo===parent_grouper
																	&& instance.section_id===current_instance.section_id
																	&& instance.section_tipo===current_instance.section_tipo)
				// if parent_istance exist go to apped the current instace to it.
				if(typeof parent_instance!=="undefined"){

					const parent_node = parent_instance.node[0] || await parent_instance.render()

					// move the node to his father
					if (parent_instance.type==="grouper" && self.mode!=="list") {
						// append inside content data of groupper
						if (!parent_node || !current_instance_node) {
							console.log("---error: parent_node:",parent_node, ' - current_instance_node:',current_instance_node);
						}
							//console.log("============== parent_node:",parent_node);
							//console.log("==============  current_instance_node:",current_instance_node);
						const grouper_content_data_node = parent_node.querySelector(":scope >.content_data")
						grouper_content_data_node.appendChild(current_instance_node)
					}else{
						parent_node.appendChild(current_instance_node)
					}
				}else{
					// direct attach (list mode and safe fallback)
					fragment.appendChild(current_instance_node)
				}
			}
		}//end for (let i = 0; i < ar_instances_length; i++)


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



/**
* LIST
* Render node for use in list
* @param array ar_instances
* @return DOM node wrapper
*/
render_section_record.prototype.list = async function(options={render_level : 'full'}) {

	const self = this

	const ar_instances = await self.get_ar_instances()

	const fragment = new DocumentFragment()

	// section_record wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id 				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode + (self.mode==='tm' ? ' list' : '')
		})

	// id column
		const id_column = build_id_column(self)
		fragment.appendChild(id_column)

	// regular columns
		let n_colums 					= 0
		let n_relation_columns 			= 0
		const ar_grid_columns 			= [] // remember add id column
		const components_with_relations = get_components_with_subcolumns()

	// loop the instances for select the parent node
		const ar_instances_length = ar_instances.length
		for (let i = 0; i < ar_instances_length; i++) {

			const current_instance = ar_instances[i]

			if (typeof current_instance==="undefined") {
				console.error("Undefined current_instance:", current_instance, i, ar_instances);
				continue;
			}

			// modification date . generic component
				// if (current_instance.tipo==='dd201') {
				// 	self.modification_date = current_instance.data.value
				// }

			const current_instance_node = await current_instance.render()

			// add
				fragment.appendChild(current_instance_node)

			// grid . add columns
				if (components_with_relations.indexOf(current_instance.model)!==-1) {

					// grid . calculate recursively all children columns to set the total grid fr in current section_record
					n_colums = recursive_relation_columns(current_instance, self.datum)

				}else{

					// grid
					n_colums = 1
				}
				ar_grid_columns.push(n_colums)

		}//end for (let i = 0; i < ar_instances_length; i++)

	// grid css calculation assign
		const ar_grid_columns_fr = ar_grid_columns.map(n => n + "fr");
		const id_column_width 	 = self.caller.id_column_width // from section init
		Object.assign(
			wrapper.style,
			{
				"grid-template-columns": id_column_width + " " + ar_grid_columns_fr.join(" ")
			}
		)

	// component_info
		const component_info = self.get_component_info()
		if (component_info){
			const info_value = component_info.value.join('')
			const info = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info',
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
			e.target.classList.add("row_active")
		},false)


	return wrapper
}//end render_section_record.prototype.list



/**
* BUILD_ID_COLUMN
* @param section_record instance self
* @return DOM element id_column
*/
const build_id_column = function(self) {

	const permissions = self.caller.permissions

	// id_column
		const id_column = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'id_column'
		})

	// edit_line
		const edit_line = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'edit_line',
			parent 			: id_column
		})

		// section id
			const section_id_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'section_id',
				text_content 	: self.section_id,
				parent 			: edit_line
			})

		// initiator. Caller section defined
			const initiator = self.caller.initiator || false
		
		// button
		switch(true) {

			case (initiator && initiator.indexOf('component_')!==-1):
				// component portal caller (link)
					const link_button = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button link',
						parent 			: edit_line
					})
					link_button.addEventListener("click", function(e){
						// top window event
						top.event_manager.publish('initiator_link_' + initiator, {
							section_tipo : self.section_tipo,
							section_id 	 : self.section_id
						})
					})
				// button edit (pen)
					if (permissions>0) {
						const edit_button = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button edit',
							parent 			: edit_line
						})
						edit_button.addEventListener("click", async function(e){
							// navigate link
								event_manager.publish('user_action', {
									tipo 		: self.section_tipo,
									section_id 	: self.section_id,
									mode 		: 'edit'
								})

							// detail_section
								// ( async () => {
								// 	const options = {
								// 		model 			: 'section',
								// 		type 			: 'section',
								// 		tipo  			: self.section_tipo,
								// 		section_tipo  	: self.section_tipo,
								// 		section_id 		: self.section_id,
								// 		mode 			: 'edit',
								// 		lang 			: page_globals.dedalo_data_lang
								// 	}
								// 	const current_data_manager	= new data_manager()
								// 	const page_element_call 	= await current_data_manager.get_page_element(options)
								// 	const page_element 			= page_element_call.result

								// 	// detail_section instance. Create target section page element and instance
								// 		const detail_section = await get_instance(page_element)

								// 		// set self as detail_section caller (!)
								// 			detail_section.caller = initiator

								// 		// load data and render wrapper
								// 			await detail_section.build(true)
								// 			const detail_section_wrapper = await detail_section.render()

								// 	// modal container (header, body, footer, size)
								// 		const header = ui.create_dom_element({
								// 			element_type	: 'div',
								// 			text_content 	: detail_section.label
								// 		})
								// 		const modal = ui.attach_to_modal(header, detail_section_wrapper, null, 'big')
								// 		modal.on_close = () => {
								// 			detail_section.destroy(true, true, true)
								// 		}
								// })()

							// iframe
								// ( async () => {
								// 	const iframe = ui.create_dom_element({
								// 		element_type	: 'iframe',
								// 		src 			: '../page/?tipo=' + self.section_tipo + '&section_id=' + self.section_id + '&mode=edit'
								// 	})
								// 	// modal container (header, body, footer, size)
								// 		const header = ui.create_dom_element({
								// 			element_type	: 'div',
								// 			text_content 	: detail_section.label
								// 		})
								// 		const modal = ui.attach_to_modal(header, iframe, null, 'big')
								// 		modal.on_close = () => {
								// 			detail_section.destroy(true, true, true)
								// 	}
								// })()
						})
					}
				break

			case (initiator && initiator.indexOf('tool_time_machine')!==-1):
				// button time machine preview (eye)
					const edit_button_tm = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button eye',
						parent 			: edit_line
					})
					edit_button_tm.addEventListener("click", function(e){
						// publish event
						event_manager.publish('tm_edit_record', {
							tipo 		: self.section_tipo,
							section_id 	: self.section_id,
							matrix_id 	: self.matrix_id,
							date 		: self.modification_date || null,
							mode 		: 'tm'
						})
					})
				break

			default:
				// button edit (pen)
					if (permissions>0) {
						const edit_button = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button edit',
							parent 			: edit_line
						})
						edit_button.addEventListener("click", function(e){
							// edit_record(this, self)
							event_manager.publish('user_action', {
								tipo 		: self.section_tipo,
								section_id 	: self.section_id,
								mode 		: 'edit'
							})
						})
					}
				// delete_line
					if (permissions>1 && self.caller.model!=='component_portal') {
						const delete_line = ui.create_dom_element({
							element_type	: 'div',
							class_name 		: 'delete_line',
							parent 			: id_column
						})
						const delete_button = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button remove',
							parent 			: delete_line
						})
						delete_button.addEventListener("click", function(e){
							delete_record(this, self)
						})
					}
				break
		}
	

	return id_column
};//end build_id_column




/**
* RECURSIVE_RELATION_COLUMNS
* Updates var 'ar_relations_columns' recursively
*/
const recursive_relation_columns = function(current_instance, datum) {

	let n_relation_columns 	  = 0
	const component_childrens = datum.context.filter(instance => instance.parent===current_instance.tipo)

	if(component_childrens.length>0) {

		const components_with_relations = get_components_with_subcolumns()

		component_childrens.forEach(function(element){

			if (components_with_relations.indexOf(element.model)!==-1) {

				n_relation_columns += recursive_relation_columns(element, datum)
			}else{
				n_relation_columns++
			}
		})
	}else{
		n_relation_columns++
	}

	return n_relation_columns
}//end recursive_relation_columns



/**
* GET_COMPONENTS_WITH_SUBCOLUMNS
* Return an array of component models with relations (equivalent to method class.component_relation_common.php)
*/
const get_components_with_subcolumns = () => {
	return [
			// 'component_autocomplete',
			//'component_autocomplete_hi',
			//'component_check_box',
			//'component_filter',
			//'component_filter_master',
			'component_portal',
			//'component_publication',
			//'component_radio_button',
			//'component_relation_children',
			//'component_relation_index',
			//'component_relation_model',
			//'component_relation_parent',
			//'component_relation_related',
			//'component_relation_struct',
			//'component_select',
			//'component_select_lang'
	]
}//end get_components_with_subcolumns



// /**
// * EDIT_RECORD
// * Navigate to selected record in edit mode
// */
// const edit_record = (button, self) => {

	// 	// old mode (new url)
	// 		const url = `?t=${self.section_tipo}&id=${self.section_id}`
	// 		return window.location.href = url;

	// 	// section element
	// 		const element = {
	// 			model 		 	: self.caller.model,
	// 			section_tipo 	: self.section_tipo,
	// 			section_id 		: self.section_id,
	// 			mode 			: "edit",
	// 			lang 			: self.lang,
	// 			sqo_context 	: {
	// 				show : [
	// 					{
	// 						typo : "sqo",
	// 						section_tipo : [self.section_tipo],
	// 						filter : false,
	// 						filter_by_locators : [
	// 							{
	// 								section_tipo : self.section_tipo,
	// 								section_id : self.section_id
	// 							}
	// 	                	],
	// 						select : [],
	// 						limit : 1,
	// 						offset : 0,
	// 						full_count : false
	// 					},
	// 					{
	// 						typo : "ddo",
	// 						type : "section",
	// 						model : "section",
	// 						tipo : self.section_tipo,
	// 						section_tipo : self.section_tipo,
	// 						mode : "edit"
	// 					}
	// 				]
	// 			}
	// 		}
	// 		console.log("element:",element);

	// 	// update page node
	// 		const update_page = async () => {

	// 			// const main = document.getElementById("main")
	// 			// 	  main.classList.add("loading")

	// 			// page instance (recycle actual)
	// 				const page = await get_instance({
	// 					model : 'page'
	// 				})

	// 				page.elements = [element]
	// 					console.log("page:",page);

	// 			// page instance build and render
	// 				//const build 	= await page.build()
	// 				//const wrapper_page 	= await page.render()
	// 				const refresh = await page.refresh()
	// 					console.log("refresh:",refresh);

	// 				if (refresh===true) {
	// 					const state = {'page_id': page.id}
	// 					const title = ''
	// 					const url 	= "?t=test65"//window.location.href

	// 					history.pushState(state, title, url)
	// 				}

	// 			// main add and restore class
	// 				// while (main.firstChild) {
	// 				// 	main.removeChild(main.firstChild);
	// 				// }
	// 				// main.appendChild(wrapper_page)
	// 		 	// 	main.classList.remove("loading","hide")

	// 		}
	// 		update_page()


	// 	return false
// }//end edit_record



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
