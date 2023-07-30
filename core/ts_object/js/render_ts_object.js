// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_current_url_vars */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	// import {ts_object} from './ts_object.js'




/**
* RENDER_TS_LINE
* Render standard complete ts line with term ans buttons
* @param object options
* @return DOM DocumentFragment
*/
export const render_ts_line = function(options) {

	// options
		const self						= options.self
		const child_data				= options.child_data
		const indexations_container_id	= options.indexations_container_id
		const show_arrow_opened			= options.show_arrow_opened
		const is_descriptor				= options.is_descriptor
		const mode						= options.mode

	// DocumentFragment
		const fragment = new DocumentFragment()

	// LIST_THESAURUS_ELEMENTS
	// Custom elements (buttons, etc)
	const child_data_len = child_data.ar_elements.length
	for (let j = 0; j < child_data_len; j++) {

		const class_for_all		= 'list_thesaurus_element';
		const children_dataset	= {
			tipo	: child_data.ar_elements[j].tipo,
			type	: child_data.ar_elements[j].type
		}

		switch(true) {

			// TERM
			case (child_data.ar_elements[j].type==='term'):

				// overwrite dataset (we need section_id and section_tipo to select when content is updated)
					children_dataset.section_tipo	= child_data.section_tipo
					children_dataset.section_id		= child_data.section_id

				// term_text
					const term_text = Array.isArray( child_data.ar_elements[j].value )
						? child_data.ar_elements[j].value.join(' ')
						: child_data.ar_elements[j].value

				// des
					// switch(ts_object.thesaurus_mode) {
					// 	case 'relation':
					// 		var event_function 	= [];
					// 		break;
					// 	default:
					// 		var event_function 	= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];
					// 		break;
					// }

				// term_node
					const term_node_span = ui.create_dom_element({
						element_type	: 'span',
						class_name		: is_descriptor ? '' : 'no_descriptor',
						inner_html		: term_text
					})
					const term_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: class_for_all + ' term',
						data_set		: children_dataset,
						parent			: fragment
					})
					term_node.appendChild(term_node_span)
					term_node.addEventListener('click', (e)=>{
						e.stopPropagation()

						if(self.thesaurus_mode==='relation'){
							return // ignore relation click
						}

						term_node.classList.add('loading')

						// show_component_in_ts_object
						self.show_component_in_ts_object(term_node, e)
						.then(function(response){

							term_node.classList.remove('loading')
						})
					})

				// element_to_hilite
					if (self.element_to_hilite) {
						if(		term_node.dataset.section_id == self.element_to_hilite.section_id
							&& 	term_node.dataset.section_tipo===self.element_to_hilite.section_tipo) {
							// hilite element
							self.hilite_element(term_node)
						}
					}

				// id_info. Like '[hierarchy1_246]' (Term terminoID )
					// let term_add = " ["+child_data.section_tipo+'_'+child_data.section_id+"]"
					// if(SHOW_DEBUG===true) { //  && node_type!=='hierarchy_node'
					// 	const current_link_children = child_data.ar_elements.filter(item => item.type==="link_children")[0]
					// 	if (current_link_children) {
					// 		const children_tipo = current_link_children.tipo
					// 		const a = "../ts_object/trigger.ts_object.php?mode=get_children_data&section_tipo="+child_data.section_tipo+"&section_id="+child_data.section_id+"&tipo="+children_tipo+"&node_type=thesaurus_node"
					// 		term_add += "  <a href=\""+a+"\" target=\"blank\"> JSON</a>";
					// 	}
					// }
					ui.create_dom_element({
						element_type	: 'span',
						parent			: fragment,
						class_name		: 'id_info',
						inner_html		: " ["+child_data.section_tipo+'_'+child_data.section_id+"]"
					})
				break;

			// ND
			case (child_data.ar_elements[j].type==='link_children_nd'):

				const element_children_nd = ui.create_dom_element({
					element_type	: 'div',
					class_name		: class_for_all + ' default term nd',
					data_set		: children_dataset,
					text_node		: child_data.ar_elements[j].value,
					parent			: fragment
				})
				element_children_nd.addEventListener('mousedown', fn_child_nd_click)
				function fn_child_nd_click(e) {
					e.stopPropagation()

					element_children_nd.classList.add('loading')

					self.toggle_nd(element_children_nd, e)
					.then(function(response){

						element_children_nd.classList.remove('loading')
					})
				}
				break;

			// ARROW ICON
			case (child_data.ar_elements[j].type==='link_children'):

				// Case link open children (arrow)
				// var event_function	= [{'type':'click','name':'ts_object.toggle_view_children'}];
				const element_link_children = ui.create_dom_element({
					element_type	: 'div',
					parent			: fragment,
					class_name		: class_for_all + ' arrow_icon',
					data_set		: children_dataset
				})
				element_link_children.addEventListener('mousedown', (e)=>{
					e.stopPropagation()
					self.toggle_view_children(element_link_children, e)
				})

				const ar_class = ['ts_object_children_arrow_icon']
				if (child_data.ar_elements[j].value==='button show children unactive') {
					ar_class.push('arrow_unactive')
				}else if (show_arrow_opened===true){
					ar_class.push('ts_object_children_arrow_icon_open')
				}

				const arrow_icon = ui.create_dom_element({
					element_type	: 'div',
					class_name		: ar_class.join(' '),
					parent			: element_link_children,
				})
				break;

			// INDEXATIONS AND STRUCTURATIONS
			case (child_data.ar_elements[j].model==='component_relation_index'):
			case (child_data.ar_elements[j].tipo==='hierarchy40'):
			case (child_data.ar_elements[j].tipo==='ww34'):
			case (child_data.ar_elements[j].tipo==='hierarchy91'):

				if (   child_data.ar_elements[j].tipo==='hierarchy40' && child_data.permissions_indexation>=1
					|| child_data.ar_elements[j].tipo==='ww34' && child_data.permissions_indexation>=1
					|| child_data.ar_elements[j].tipo==='hierarchy91' && child_data.permissions_structuration>=1
					) {

					// element_show_indexations. Build button
					const element_show_indexations	= ui.create_dom_element({
						element_type	: 'div',
						class_name		: class_for_all + ' show_indexations',
						data_set		: children_dataset,
						text_node		: child_data.ar_elements[j].value, // generates a span with the value like '<span>U:37</span>'
						parent			: fragment
					})
					element_show_indexations.addEventListener('mousedown', (e)=>{
						e.stopPropagation()

						element_show_indexations.classList.add('loading')

						self.show_indexations({
							button_obj		: element_show_indexations,
							event			: e,
							section_tipo	: child_data.section_tipo,
							section_id		: child_data.section_id,
							component_tipo	: child_data.ar_elements[j].tipo,
							container_id	: indexations_container_id,
							value			: null
						})
						.then(function(response){

							element_show_indexations.classList.remove('loading')
						})
					})
					// Build indexations container
						// var indexations_container = ui.create_dom_element({
						// 	element_type	: 'div',
						// 	parent			: wrap_ts_object,
						// 	class_name		: 'indexations_container',
						// 	id				: indexations_container_id,
						// })
				}
				break;

			// IMG
			case (child_data.ar_elements[j].type==='img'):

				if(child_data.ar_elements[j].value) {

					// let event_function 	= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];
					const element_img = ui.create_dom_element({
						element_type	: 'div',
						class_name		: class_for_all + ' term_img',
						data_set		: children_dataset,
						parent			: fragment
					})
					element_img.addEventListener('mousedown', (e)=>{
						e.stopPropagation()

						element_img.classList.add('loading')

						self.show_component_in_ts_object(element_img, e)
						.then(function(response){
							element_img.classList.remove('loading')
						})
					})
					// image
					ui.create_dom_element({
						element_type	: 'img',
						parent			: element_img,
						src				: child_data.ar_elements[j].value
					})
				}
				break;

			// OTHERS
			default:

				const current_value = child_data.ar_elements[j].value

				// Case common buttons and links
				const element_show_component = ui.create_dom_element({
					element_type	: 'div',
					class_name		: class_for_all + ' default',
					data_set		: children_dataset,
					text_node		: current_value, // creates a span node with the value inside
					parent 			: fragment
				})
				element_show_component.addEventListener('mousedown', (e)=>{
					e.stopPropagation()

					element_show_component.classList.add('loading')

					self.show_component_in_ts_object(element_show_component, e)
					.then(function(response){
						element_show_component.classList.remove('loading')
					})
				})
				break;
		}//end switch(true)
	}//end for (var j = 0; j < ch_len; j++)


	return fragment
}//end render_ts_line



/**
* RENDER_TS_PAGINATION
* Render pagination button with events
* @param object options
* @return DOM button_show_more
*/
export const render_ts_pagination = function(options) {

	// options
		const childrens_container		= options.childrens_container
		const element_children_target	= options.element_children_target
		const pagination				= options.pagination


	// button_show_more
		const button_show_more = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button show_more',
			inner_html		: get_label.show_more || 'Show more',
			parent			: childrens_container
		})
		button_show_more.addEventListener('click', function(e) {
			e.stopPropagation()

			// loading
				button_show_more.classList.add('hide')
				const spinner = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'css_spinner loading_rows',
					parent			: childrens_container
				})

			// debug
				// console.log('++++++ ar_childrens_data:', ar_childrens_data);
				// console.log('++++++ childrens_container:', childrens_container);
				// console.log('++++++ childrens_container.parentNode:', childrens_container.parentNode);
				// console.log('++++++ options:', options);
				// console.log('++++++ element_children_target.dataset.tipo:', element_children_target.dataset.tipo);

			const section_tipo	= childrens_container.parentNode.dataset.section_tipo
			const section_id	= childrens_container.parentNode.dataset.section_id
			const tipo			= element_children_target.dataset.tipo // usually 'hierarchy45'

			const trigger_vars = {
				mode				: 'get_childrens_data',
				section_id			: section_id,
				section_tipo		: section_tipo,
				tipo				: tipo,
				node_type			: 'thesaurus_node',
				target_section_tipo	: target_section_tipo,
				pagination			: {
					total	: pagination.total,
					limit	: pagination.limit,
					offset	: pagination.limit + pagination.offset
				}
			}
			self.get_json(trigger_vars)
			.then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[ts_object.get_childrens] response",response);
				}

				spinner.remove()

				if (response && response.result) {

					// pagination update
						const new_pagination	= response.pagination
						pagination.offset		= new_pagination.offset
						const last_item			= pagination.limit + pagination.offset

					// remove current button
						button_show_more.remove()

					// render more child
						build_ts_list(response.result)

					// add pagination if is needed
						if (pagination.total && pagination.limit && pagination.total>last_item) {
							build_ts_pagination()
						}

				}else{
					console.error("[ts_object.get_childrens] Error, response is null");
					button_show_more.classList.remove('hide')
				}

				if(SHOW_DEBUG===true) {
					//var end = new Date().getTime();
					//console.log("[ts_object.get_childrens] js execution time: " + (end - start_time) +' ms' +')')
					//start = new Date().getTime()
				}
			}, function(error) {
				console.error("Error. Failed get_json!", error);
			});
		})//end click


	button_show_more
}//end render_ts_pagination



/**
* RENDER_TS_LIST
* Render a list of child nodes
* @param object options
* @return array ar_children_c
*/
export const render_ts_list = function(options) {

	// options
		const self							= options.self
		const ar_children_data				= options.ar_children_data
		const node_type						= options.node_type
		let next_node_type					= options.next_node_type
		const target_section_tipo			= options.target_section_tipo
		const children_container			= options.children_container
		const parent_nd_container			= options.parent_nd_container
		const children_container_is_loaded	= options.children_container_is_loaded
		const show_arrow_opened				= options.show_arrow_opened
		const mode							= options.mode

	const ar_children_c = []

	const ar_children_data_len = ar_children_data.length
	for (let i = 0; i < ar_children_data_len; i++) {

		// ch_len. Calculated once. Used in various calls
			// const ch_len = ar_children_data[i].ar_elements.length

		// is_descriptor element is descriptor check
			const is_descriptor = ar_children_data[i].is_descriptor

		// is_indexable element is index-able check
			const is_indexable = ar_children_data[i].is_indexable

		// wrap_ts_object . ts_object wrapper
			if (node_type==='hierarchy_node') {
				next_node_type = 'thesaurus_node'
			}

			// dataset
				const dataset = {
					section_tipo	: ar_children_data[i].section_tipo,
					section_id		: ar_children_data[i].section_id,
					node_type		: next_node_type
				}
				if (target_section_tipo) {
					dataset.target_section_tipo = target_section_tipo
				}

			// DES
				// if (is_descriptor===true) {
				// 	var wrap_container 		= children_container
				// 	var wrap_class 			= "wrap_ts_object"
				// 	var event_function 		= [
				// 								{'type':'dragstart','name':'ts_object.on_dragstart'}
				// 								,{'type':'dragend','name':'ts_object.on_drag_end'}
				// 								,{'type':'drop','name':'ts_object.on_drop'}
				// 								,{'type':'dragenter','name':'ts_object.on_dragenter'}
				// 								,{'type':'dragover','name':'ts_object.on_dragover'}
				// 								,{'type':'dragleave','name':'ts_object.on_dragleave'}
				// 							  ]
				// }else{
				// 	// Default wrap_ts_object is placed inside children container, but when current element is not descriptor, we place it into 'nd_container'
				// 	//if (typeof parent_nd_container==="undefined") {
				// 		//var parent_nd_container  = null
				// 		//var wrapper_children 	 = children_container.parentNode.children
				// 		//var wrapper_children_len = wrapper_children.length
				// 		//for (var wrapper_children_i = wrapper_children_len - 1; wrapper_children_i >= 0; wrapper_children_i--) {
				// 		//	if (wrapper_children[wrapper_children_i].dataset.role==='nd_container') {
				// 		//		parent_nd_container = wrapper_children[wrapper_children_i];
				// 		//		break
				// 		//	}
				// 		//}
				// 		//// Clean always
				// 		//while (parent_nd_container && parent_nd_container.hasChildNodes()) {
				// 		//	parent_nd_container.removeChild(parent_nd_container.lastChild);
				// 		//}
				// 	//}
				// 	var wrap_container 	= parent_nd_container
				// 	// var wrap_class 		= "wrap_ts_object wrap_ts_object_nd"
				// 	var event_function 	= null
				// }

			const wrap_ts_object = ui.create_dom_element({
				element_type	: 'div',
				parent			: is_descriptor===true ? children_container : parent_nd_container,
				class_name		: is_descriptor===true ? "wrap_ts_object" : "wrap_ts_object wrap_ts_object_nd",
				data_set		: dataset,
				draggable		: true
			})
			if (is_descriptor===true) {
				wrap_ts_object.addEventListener("dragstart",(e)=>{
					self.on_dragstart(wrap_ts_object, e)
				})
				wrap_ts_object.addEventListener("dragend",(e)=>{
					self.on_drag_end(wrap_ts_object, e)
				})
				wrap_ts_object.addEventListener("drop",(e)=>{
					self.on_drop(wrap_ts_object, e)
				})
				wrap_ts_object.addEventListener("dragenter",(e)=>{
					self.on_dragenter(wrap_ts_object, e)
				})
				wrap_ts_object.addEventListener("dragover",(e)=>{
					self.on_dragover(wrap_ts_object, e)
				})
				wrap_ts_object.addEventListener("dragleave",(e)=>{
					self.on_dragleave(wrap_ts_object, e)
				})
			}


		// ID COLUMN . id column content
			const id_colum_content 	= ui.create_dom_element({
				element_type	: 'div',
				parent			: wrap_ts_object,
				class_name		: 'id_column_content'
			})

		// ELEMENTS CONTAINER . elements container
			const elements_container = ui.create_dom_element({
				element_type	: 'div',
				parent			: wrap_ts_object,
				class_name		: 'elements_container',
				data_set		: {
					role : 'elements_container'
				}
			})

		// DATA CONTAINER . elements data container
			const data_container = ui.create_dom_element({
				element_type	: 'div',
				parent			: wrap_ts_object,
				class_name		: 'data_container',
				data_set		: {
					role : 'data_container'
				}
			})

		// INDEXATIONS CONTAINER
			const indexations_container_id	= 'u' + ar_children_data[i].section_tipo + '_' + ar_children_data[i].section_id +'_'+ (new Date()).getTime()
			const indexations_container		= ui.create_dom_element({
				element_type	: 'div',
				parent			: wrap_ts_object,
				class_name		: 'indexations_container',
				id				: indexations_container_id
			})

		// ND CONTAINER
			if (is_descriptor===true && node_type!=='hierarchy_node') {
				const nd_container = ui.create_dom_element({
					element_type	: 'div',
					parent			: wrap_ts_object,
					class_name		: 'nd_container',
					data_set		: {
						role : 'nd_container'
					}
				})
			}

		// CHILDREN CONTAINER . children container
			if (is_descriptor===true) {
				const children_c_class_name = (children_container_is_loaded===true)
					? 'children_container'
					: 'children_container js_first_load'
				const children_c = ui.create_dom_element({
					element_type	: 'div',
					parent			: wrap_ts_object,
					class_name		: children_c_class_name,
					data_set		: {
						role		:'children_container',
						section_id	: ar_children_data[i].section_id
					}
				})
				// Fix current main_div
				// Important. Fix global var self.current_main_div used by search to parse results
				self.current_main_div = children_c

				// Add to ar_children_c
				ar_children_c.push(children_c)
			}//end if (is_descriptor===true)


			// ID_COLUM_CONTENT elements
				switch(self.thesaurus_mode) {

					case 'relation':
						// hierarchy_node cannot be used as related  and not indexable too
						if (node_type==='hierarchy_node' || is_indexable===false) break;

						// link_related
							const link_related = ui.create_dom_element({
								element_type	: 'a',
								parent			: id_colum_content,
								class_name		: 'id_column_link ts_object_related',
								title_label		: 'add'
							})
							const current_label_term = ar_children_data[i].ar_elements.find(el => el.type==='term')
							link_related.data = {
								section_tipo	: ar_children_data[i].section_tipo,
								section_id		: ar_children_data[i].section_id,
								label			: current_label_term ? current_label_term.value : ''
							}
							link_related.addEventListener('click', (e)=>{
								e.stopPropagation()

								// source window. Could be different than current (like iframe)
									// const source_window = window.opener || window.parent
									// if (source_window===null) {
									// 	console.warn("[link_term] Error on find window.opener / parent")
									// 	return false
									// }

								// publish event link_term
									if (!self.linker) {
										console.warn(`Error. self.linker is not defined.
											Please set ts_object linker property with desired target component portal:`, self);
										return false
									}
									// linker id. A component_portal instance is expected as linker
									const linker_id = self.linker.id
									// source_window.event_manager.publish('link_term_' + linker_id, {
									event_manager.publish('link_term_' + linker_id, {
										section_tipo	: ar_children_data[i].section_tipo,
										section_id		: ar_children_data[i].section_id,
										label			: current_label_term ? current_label_term.value : ''
									})
							})
						// related icon
							ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'button arrow_link', // ts_object_add_icon
								parent			: link_related
							})
						break;

					default:

						// ADD . button + add element
							if (ar_children_data[i].permissions_button_new>=2) {
								if(is_descriptor===true) {
									const link_add = ui.create_dom_element({
										element_type	: 'a',
										class_name		: 'id_column_link ts_object_add',
										title_label		: 'add',
										parent			: id_colum_content
									})
									link_add.addEventListener('click', function(){

										// mode set in dataset
											this.dataset.mode = (node_type==='hierarchy_node') ? "add_child_from_hierarchy" : "add_child"

										// add_child
											self.add_child(this)
											.then(function(response){

												// vars from response
													// new_section_id . Generated as response by the trigger add_child
														const new_section_id 	= response.result
													// section_tipo. When dataset target_section_tipo exists, is hierarchy_node. Else is normal node
														const section_tipo 	  	= response.wrap.dataset.target_section_tipo || response.wrap.dataset.section_tipo
													// button_obj. button plus that user clicks
														const button_obj 		= response.button_obj
													// children_element. list_thesaurus_element of current wrapper
														const children_element 	= self.get_link_children_from_wrap(response.wrap)
														if(!children_element) {
															return console.log("[ts_object.add_child] Error on find children_element 'link_children'");
														}

												// refresh children container
													self.get_children(children_element)
													.then(function(){
														// Open editor in new window
														self.edit(button_obj, null, new_section_id, section_tipo)
													})
											})
									})//end link_add.addEventListener("click", function(e)

									// add_icon_link_add
										ui.create_dom_element({
											element_type	: 'div',
											class_name		: 'ts_object_add_icon',
											parent			: link_add
										})
								}//if(is_descriptor===true)
							}//end if (ar_children_data[i].permissions_button_new>=2) {

						// MOVE DRAG . button drag element
							if (ar_children_data[i].permissions_button_new>=2) {
								if(is_descriptor===true) {
									// var event_function 	= [{'type':'mousedown','name':'ts_object.on_drag_mousedown'}];
									const link_drag = ui.create_dom_element({
										element_type	: 'div',
										parent			: id_colum_content,
										class_name		: 'id_column_link ts_object_drag',
										title_label		: 'drag'
									})
									link_drag.addEventListener("mousedown",(e)=>{
										self.on_drag_mousedown(link_drag, e)
									})
									// drag icon
									ui.create_dom_element({
										element_type	: 'div',
										parent			: link_drag,
										class_name		: 'ts_object_drag_icon'
									})
								}//if(is_descriptor===true)
							}

						// DELETE . button delete element
							if (ar_children_data[i].permissions_button_delete>=2) {
								// var event_function 	= [{'type':'click','name':'ts_object.delete'}];
								const link_delete 	= ui.create_dom_element({
									element_type	: 'a',
									parent			: id_colum_content,
									class_name		: 'id_column_link ts_object_delete',
									title_label		: 'delete'
								})
								link_delete.addEventListener('click', (e)=>{
									e.stopPropagation()
									self.delete(link_delete)
								})
								// delete icon
								ui.create_dom_element({
									element_type	: 'div',
									parent			: link_delete,
									class_name		: 'ts_object_delete_icon'
								 })
							}//end if (ar_children_data[i].permissions_button_delete>=2)

						// ORDER number element
							if (ar_children_data[i].permissions_button_new>=2) {
								if(is_descriptor===true && node_type!=='hierarchy_node' && mode!=='search') {
									// var event_function = [{'type':'click','name':'ts_object.build_order_form'}];
									const order_number = ui.create_dom_element({
										element_type	: 'a',
										parent			: id_colum_content,
										class_name		: 'id_column_link ts_object_order_number',
										text_node		: i+1
									})
									order_number.addEventListener('click', (e)=>{
										e.stopPropagation()
										self.build_order_form(order_number, e)
									})
								}//if(is_descriptor===true && node_type!=='hierarchy_node')
							}

						// EDIT . button edit element
							//if (node_type!=='hierarchy_node') {
							// var event_function 		= [{'type':'click','name':'ts_object.edit'}];
							const link_edit = ui.create_dom_element({
								element_type	: 'a',
								parent			: id_colum_content,
								class_name		: 'id_column_link ts_object_edit',
								title_label		: 'edit'
							})
							link_edit.addEventListener('mousedown', (e)=>{
								e.stopPropagation()
								self.edit(link_edit, e)
							})
							// section_id number
							const section_id_number = ui.create_dom_element({
								element_type	: 'div',
								parent			: link_edit,
								class_name		: 'ts_object_section_id_number',
								text_node		: ar_children_data[i].section_id
							})
							// edit icon
							const edit_icon = ui.create_dom_element({
								element_type	: 'div',
								parent			: link_edit,
								class_name		: 'ts_object_edit_icon'
							})
							//}//end if (node_type!=='hierarchy_node')

				}//end switch(ts_object.thesaurus_mode)

		// LIST_THESAURUS_ELEMENTS
			// const ts_line_node = build_ts_line( ar_children_data[i], indexations_container_id )
			const ts_line_node = render_ts_line({
				self						: self,
				child_data					: ar_children_data[i],
				indexations_container_id	: indexations_container_id,
				show_arrow_opened			: show_arrow_opened,
				is_descriptor				: is_descriptor
			})
			elements_container.appendChild(ts_line_node)
	}//end for (let i = 0; i < ar_childrens_data_len; i++)


	return ar_children_c
}//end render_ts_list



// @license-end
