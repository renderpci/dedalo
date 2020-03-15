/**
*	TS_OBJECT
*	Manage a single thesaurus row element
*
*
*/

import {ui} from '../../common/js/ui.js'
import * as instances from '../../common/js/instances.js'

export const ts_object = new function() {

	// class vars
		this.trigger_url 		= DEDALO_CORE_URL + '/ts_object/trigger.ts_object.php'
		// Set on update element in DOM (refresh)
		this.element_to_hilite 	= null;
		// thesaurus_mode . Defines apperance of thesaurus
		this.thesaurus_mode 	= null;



	/**
	* INIT
	* Fix important vars for current object
	*/
	this.init = function() {
		
		const url_vars = get_current_url_vars()
		
		// THESAURUS_MODE
		this.thesaurus_mode = url_vars.thesaurus_mode || 'default'
		// component_name Caller component name for relations
		this.component_name = url_vars.component_name || null

	};//end init
	//this.init(); // Auto init !



	/**
	* GET_CHILDREN
	* Get the JSON data from the server using promise. When data is loaded build DOM element
	* Data is builded from parent info (current object section_tipo and section_id)
	* @return promise
	*/
	//var start = null
	this.get_children = function(children_element) {
		
		if (SHOW_DEBUG===true) {
			//let start_time = new Date().getTime()	
		}			
		
		const tipo 					= children_element.dataset.tipo
		const wrap 					= children_element.parentNode.parentNode
		const parent_section_id 	= wrap.dataset.section_id
		const parent_section_tipo 	= wrap.dataset.section_tipo
		const node_type 			= wrap.dataset.node_type || null
		const target_section_tipo 	= wrap.dataset.target_section_tipo

		// Test vars
		if (!parent_section_tipo || typeof parent_section_tipo==="undefined") {
			console.log("[get_children] Error. parent_section_tipo is not defined");
			return false
		}
		if (!parent_section_id || typeof parent_section_id==="undefined") {
			console.log("[get_children] Error. parent_section_id is not defined");
			return false
		}
		if (!tipo || typeof tipo==="undefined") {
			if (SHOW_DEBUG===true) {
				console.log(new Error().stack);
			}
			console.error("[get_children] Error. tipo is not defined");	
			return false
		}
		
		// CHILDREN_CONTAINER . children_container is the div container inside current ts_object
		/* old way
		var children_container	= wrap.querySelector('div[data-role="children_container"]')
			if (!children_container) {
				console.log(children_element);
				return alert("Error on find children_container!")
			}*/
		let children_container 	= null
		const wrap_children 		= wrap.childNodes
		const wrap_children_len 	= wrap_children.length
		for (let i = wrap_children_len - 1; i >= 0; i--) {
			if(wrap_children[i].dataset.role && wrap_children[i].dataset.role==="children_container") {
				children_container = wrap_children[i]
				break;
			}
		}
		if (children_container===null) {
			alert("[ts_object.get_children] Error on select children_container");
			return false;
		}
		
		// JSON GET CALL
			const trigger_vars = {
				mode 			: 'get_children_data',
				section_id 		: parent_section_id,
				section_tipo 	: parent_section_tipo,
				node_type 		: node_type,
				tipo 			: tipo,
			}			
			//return console.log("[ts_object.get_children] trigger_vars", trigger_vars); //console.log(new Error().stack);
			
		// AJAX REQUEST
			const js_promise = ts_object.get_json(trigger_vars).then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log("[ts_object.get_children] response",response);
					}				

					if (response && response.result) {
						// DOM_PARSE_children
						const ar_children_data = response.result
						const options = {
							target_section_tipo 	  : target_section_tipo,
							node_type 				  : node_type,
							clean_children_container : true
						}
						//var result = ts_object.dom_parse_children(ar_children_data, children_container, true, target_section_tipo, node_type) //ar_children_data, children_container, target_section_tipo, type
						const result = ts_object.dom_parse_children(ar_children_data, children_container, options)
						// UPDATES ARROW
						if (children_element && children_element.firstChild && children_element.dataset.type) {
							children_element.firstChild.classList.remove('arrow_spinner');

							// Update arrow state					
							//ts_object.update_arrow_state(children_element, true) // disabled temporally
						}
					}else{
						console.log("[ts_object.get_children] Error, response is null");
					}				

					if(SHOW_DEBUG===true) {
						//var end = new Date().getTime();
						//console.log("[ts_object.get_children] js execution time: " + (end - start_time) +' ms' +')')
						//start = new Date().getTime()
					}
			}, function(error) {
				console.error("Error. Failed get_json!", error);
			});

		return js_promise
	};//end get_children



	/**
	* UPDATE_ARROW_STATE
	* Updates arrow state when updated wrap
	*/
	this.update_arrow_state = function(link_children_element, toggle) {
		//console.log("Called update_arrow_state. toggle: " + JSON.stringify(toggle));
		if(SHOW_DEBUG===true) {
			//console.log("[update_arrow_state link_children_element]",link_children_element, toggle);
		}		

		// Children_container
			const children_container = ts_object.get_my_parent_container(link_children_element, 'children_container')

		// Toggle_view_children
			if (children_container.classList.contains('js_first_load')===true || children_container.classList.contains('removed_from_view')===true) {
				ts_object.toggle_view_children(link_children_element)
			}
		
		// Children_container nodes > 0
			if (children_container.children.length===0) {
				if (toggle===true) {
					ts_object.toggle_view_children(link_children_element)
				}
				link_children_element.firstChild.classList.add('arrow_unactive')
			}else{
				link_children_element.firstChild.classList.remove('arrow_unactive')
			}

		return true	
	};//end update_arrow_state
	


	/**
	* DOM_PARSE_CHILDREN
	* @param array ar_children_data
	*	Array of children of current term from json source trigger
	* @param DOM objec children_container
	*	children_container is 'children_container'
	*/
	// this.dom_parse_children = function(ar_children_data, children_container, clean_children_container, target_section_tipo, type) {
	this.dom_parse_children = function(ar_children_data, children_container, options) {
		
		const self = this

		if (!ar_children_data) {
			console.log("[dom_parse_children] Error. No ar_children_data received. Nothing is parsed")
			return false;
		}
		if (!children_container) {
			console.log("[dom_parse_children] Error. No children_container received. Nothing is parsed");
			return false;
		}
		// Element wrap div is parentNode of 'children_container' (children_container)
		//var wrap_div = children_container.parentNode
	
		// Options set values
		const clean_children_container 		= typeof options.clean_children_container!=='undefined' ? options.clean_children_container : true
		const target_section_tipo 			= typeof options.target_section_tipo!=='undefined' ? options.target_section_tipo : null
		const node_type 					= typeof options.node_type!=='undefined' ? options.node_type : 'thesaurus_node'
		let next_node_type 					= node_type
		const children_container_is_loaded 	= typeof options.children_container_is_loaded!=='undefined' ? options.children_container_is_loaded : false
		const show_arrow_opened 			= typeof options.show_arrow_opened!=='undefined' ? options.show_arrow_opened : false
		
		// Clean children container before build contents
			if (clean_children_container===true) {
				// children_container.innerHTML = ''
				while (children_container.hasChildNodes()) {
					children_container.removeChild(children_container.lastChild);
				}
			}

		// nd_container
			let parent_nd_container  	= null
			const wrapper_children 	 	= children_container.parentNode.children
			const wrapper_children_len 	= wrapper_children.length
			for (let i = wrapper_children_len - 1; i >= 0; i--) {
				if (wrapper_children[i].dataset.role==='nd_container') {
					parent_nd_container = wrapper_children[i];
					break
				}
			}
			// Clean always
			while (parent_nd_container && parent_nd_container.hasChildNodes()) {
				parent_nd_container.removeChild(parent_nd_container.lastChild);
			}

		// Build DOM elements iterating ar_children_data
		const promise = new Promise(function(resolve) {

			const ar_children_c = []
			const ar_children_data_len = ar_children_data.length
			for (let i = 0; i < ar_children_data_len; i++) {

				// ch_len. Calculated once. Used in various calls
					const ch_len = ar_children_data[i].ar_elements.length
	
				// is_descriptor element is descriptor check
					const is_descriptor = ar_children_data[i].is_descriptor

				// is_indexable element is indexable check
					const is_indexable = ar_children_data[i].is_indexable

				// wrap_ts_object . ts_object wrapper
					if (node_type==='hierarchy_node') next_node_type = 'thesaurus_node'
					let dataset = {'section_tipo':ar_children_data[i].section_tipo,'section_id':ar_children_data[i].section_id,'node_type':next_node_type}
					if (target_section_tipo) {
						dataset.target_section_tipo = target_section_tipo
					}
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
					const wrap_ts_object 		= ui.create_dom_element({
																		element_type			: 'div',
																		parent 					: is_descriptor===true ? children_container : parent_nd_container,
																		class_name 				: is_descriptor===true ? "wrap_ts_object" : "wrap_ts_object wrap_ts_object_nd",
																		data_set 				: dataset,
																		draggable				: true,
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
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: 'id_column_content'
																	 })

				// ELEMENTS CONTAINER . elements container
					const elements_container = ui.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: 'elements_container',
																		data_set 				: {role :'elements_container'}
																	 })

				// DATA CONTAINER . elements data container
					const data_container 	= ui.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: 'data_container',
																		data_set 				: {role :'data_container'}
																	 })

				// INDEXATIONS CONTAINER
					const indexations_container  = ui.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: 'indexations_container',
																		id 						: 'u' + ar_children_data[i].section_tipo + '_' + ar_children_data[i].section_id
																	 })

				// ND CONTAINER
					if (is_descriptor===true && node_type!=='hierarchy_node') {
						const nd_container 		= ui.create_dom_element({
																		element_type 			: 'div',
																		parent 		 			: wrap_ts_object,
																		class_name 	 			: 'nd_container',
																		data_set 	 			: {role : 'nd_container'}
																	 })
					}

				// CHILDREN CONTAINER . children container
					if (is_descriptor===true) {
						const children_c_class_name = (children_container_is_loaded===true) ? 'children_container' : 'children_container js_first_load'
						const children_c 		= ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: wrap_ts_object,
																			class_name 				: children_c_class_name,
																			data_set 				: {role :'children_container',section_id : ar_children_data[i].section_id}
																		 })
						// Fix current main_div
						// Important. Fix global var self.current_main_div used by search to parse results
						self.current_main_div = children_c
						
						// Add to ar_children_c
						ar_children_c.push(children_c)
					}//end if (is_descriptor===true)
				
				// ID_COLUM_CONTENT elements
					switch(ts_object.thesaurus_mode) {

						case 'relation':
							// hierarchy_node cannot be used as related  and not indexables too							
							if (node_type==='hierarchy_node' || is_indexable===false) break;
							
								// var event_function 		= [{'type':'click','name':'ts_object.link_term'}];
								const link_related 		= ui.create_dom_element({
																			element_type		: 'a',
																		parent 					: id_colum_content,
																		class_name 				: 'id_column_link ts_object_related',
																		title_label 			: 'add',
																	 })
														link_related.addEventListener("click",(e)=>{
															self.link_term(link_related, e)
														})
														// related icon
														const add_icon 	= ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: link_related,
																			class_name 				: 'icon_bs link new_autocomplete_ts ts_object_related_icon', //ts_object_add_icon
																		 })
							break;

						default:

							// ADD . button + add element
								if (ar_children_data[i].permissions_button_new>=2) {
									if(is_descriptor===true) {										
										const link_add 			= ui.create_dom_element({
																				element_type			: 'a',
																				parent 					: id_colum_content,
																				class_name 				: 'id_column_link ts_object_add',																			
																				title_label 			: 'add',
																			})
											// link_add event click
												link_add.addEventListener("click", function(e){
												
													// mode set in dataset
														this.dataset.mode = (node_type==='hierarchy_node') ? "add_children_from_hierarchy" : "add_children"
																																		
													// add_children
														ts_object.add_children(this).then(function(response){

															// vars from response
																// new_section_id . Generated as response by the trigger add_children
																	const new_section_id 	= response.result
																// section_tipo. When dataset target_section_tipo exists, is hierarchy_node. Else is normal node
																	const section_tipo 	  	= response.wrap.dataset.target_section_tipo || response.wrap.dataset.section_tipo
																// button_obj. button plus tha user clicks
																	const button_obj 		= response.button_obj
																// children_element. list_thesaurus_element of current wrapper
																	const children_element 	= ts_object.get_link_children_from_wrap(response.wrap)
																	if(!children_element) {
																		return console.log("[ts_object.add_children] Error on find children_element 'link_children'");
																	}

															// refresh children container 
																ts_object.get_children(children_element).then(function(){
																	// Open editor in new window
																		ts_object.edit(button_obj, null, new_section_id, section_tipo)
																})
														})																		
												})//end link_add.addEventListener("click", function(e)

										// add icon
										const add_icon_link_add = ui.create_dom_element({
															element_type			: 'div',
															parent 					: link_add,
															class_name 				: 'ts_object_add_icon',
														 })
									}//if(is_descriptor===true)
								}//end if (ar_children_data[i].permissions_button_new>=2) {
							
							// MOVE DRAG . button drag element
								if (ar_children_data[i].permissions_button_new>=2) {
									if(is_descriptor===true) {
										// var event_function 	= [{'type':'mousedown','name':'ts_object.on_drag_mousedown'}];
										const link_drag 		= ui.create_dom_element({
																				element_type			: 'div',
																				parent 					: id_colum_content,
																				class_name 				: 'id_column_link ts_object_drag',
																				title_label 			: 'drag'
																			})
																link_drag.addEventListener("mousedown",(e)=>{
																	self.on_drag_mousedown(link_drag, e)
																})
																// drag icon
																const drag_icon = ui.create_dom_element({
																					element_type			: 'div',
																					parent 					: link_drag,
																					class_name 				: 'ts_object_drag_icon'
																				})
									}//if(is_descriptor===true)
								}

							// DELETE . button delete element
								if (ar_children_data[i].permissions_button_delete>=2) {
									// var event_function 	= [{'type':'click','name':'ts_object.delete'}];
									const link_delete 	= ui.create_dom_element({
																			element_type			: 'a',
																			parent 					: id_colum_content,
																			class_name 				: 'id_column_link ts_object_delete',
																			title_label 			: 'delete',
																		 })
														link_delete.addEventListener("click",(e)=>{
															self.delete(link_delete, e)
														})
														// delete icon
														const delete_icon = ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: link_delete,
																			class_name 				: 'ts_object_delete_icon',
																		 })
								}//end if (ar_children_data[i].permissions_button_delete>=2)

							// ORDER number element
								if (ar_children_data[i].permissions_button_new>=2) {
									if(is_descriptor===true && node_type!=='hierarchy_node') {								
										
										// var event_function 		= [{'type':'click','name':'ts_object.build_order_form'}];
										const order_number 		= ui.create_dom_element({
																				element_type			: 'a',
																				parent 					: id_colum_content,
																				class_name 				: 'id_column_link ts_object_order_number',
																				text_node 				: i+1,
																			 })
																order_number.addEventListener("click",(e)=>{
																	self.build_order_form(order_number, e)
																})

									}//if(is_descriptor===true && node_type!=='hierarchy_node')
								}
							
							// EDIT . button edit element
								//if (node_type!=='hierarchy_node') {
								// var event_function 		= [{'type':'click','name':'ts_object.edit'}];
								const link_edit 		= ui.create_dom_element({
																		element_type			: 'a',
																		parent 					: id_colum_content,
																		class_name 				: 'id_column_link ts_object_edit',
																		title_label 			: 'edit',
																	 })
														link_edit.addEventListener("click",(e)=>{
															self.edit(link_edit, e)
														})
														// section_id number
														const section_id_number = ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: link_edit,
																			class_name 				: 'ts_object_section_id_number',
																			text_node 				: ar_children_data[i].section_id,
																		 })
														// edit icon
														const edit_icon = ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: link_edit,
																			class_name 				: 'ts_object_edit_icon',
																		 })

								//}//end if (node_type!=='hierarchy_node')
						
					}//end switch(ts_object.thesaurus_mode)		

			
				// LIST_THESAURUS_ELEMENTS
				// Custom elements (buttons, etc)
					for (let j = 0; j < ch_len; j++) {
				
						const class_for_all 	 = 'list_thesaurus_element';
						const children_dataset = {
							tipo 			 : ar_children_data[i].ar_elements[j].tipo,
							type 			 : ar_children_data[i].ar_elements[j].type
							//section_tipo	 : ar_children_data[i].section_tipo,
							//section_id 	 : ar_children_data[i].section_id,
							//modo 			 : ar_children_data[i].modo,
							//lang 			 : ar_children_data[i].lang,
							}
						switch(true) {

							// TERM
							case (ar_children_data[i].ar_elements[j].type==='term'):
								// Overwrite dataset (we need section_id and section_tipo to select when content is updated)
								children_dataset.section_tipo = ar_children_data[i].section_tipo
								children_dataset.section_id   = ar_children_data[i].section_id
								const text_node = ar_children_data[i].ar_elements[j].value
								// switch(ts_object.thesaurus_mode) {
								// 	case 'relation':
								// 		var event_function 	= [];
								// 		break;
								// 	default:
								// 		var event_function 	= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];
								// 		break;
								// }							
								const element_term 		= ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: elements_container,
																			class_name 				: class_for_all,
																			data_set 				: children_dataset,
																			text_node 				: text_node,
																		 })

								if(ts_object.thesaurus_mode !=='relation'){
										element_term.addEventListener("click",(e)=>{
												self.show_component_in_ts_object(element_term, e)
											})
								}
							
								if (element_term && ts_object.element_to_hilite) {
									if(element_term.dataset.section_id == ts_object.element_to_hilite.section_id && element_term.dataset.section_tipo===ts_object.element_to_hilite.section_tipo) {
										// Hilite element
										ts_object.hilite_element(element_term)									
									}
								}
								// Term terminoID like [ts1_52]
									let term_add = " ["+ar_children_data[i].section_tipo+'_'+ar_children_data[i].section_id+"]"
										if(SHOW_DEBUG===true && node_type!=='hierarchy_node') {
											const current_link_children 	= ar_children_data[i].ar_elements.filter(item => item.type==="link_children")[0]
											if (current_link_children) {
												const children_tipo = current_link_children.tipo
												const a = "../ts_object/trigger.ts_object.php?mode=get_children_data&section_tipo="+ar_children_data[i].section_tipo+"&section_id="+ar_children_data[i].section_id+"&tipo="+children_tipo+"&node_type=thesaurus_node"
												term_add += "  <a href=\""+a+"\" target=\"blank\"> JSON</a>";
											}										
										}
								
								const element_span	= ui.create_dom_element({
																			element_type			: 'span',
																			parent 					: elements_container,
																			class_name 				: 'id_info',																		
																			inner_html 				: term_add,
																		 })
								break;						
							
							// ND 
							case (ar_children_data[i].ar_elements[j].type==='link_children_nd'):
								
								// var event_function 	= [{'type':'click','name':'ts_object.toggle_nd'}];
								const element_children_nd	= ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: elements_container,
																			class_name 				: class_for_all,
																			data_set 				: children_dataset,
																			text_node 				: ar_children_data[i].ar_elements[j].value,
																		 })
									element_children_nd.addEventListener("click",(e)=>{
												self.toggle_nd(element_children_nd, e)
											})
								break;

							// ARROW ICON
							case (ar_children_data[i].ar_elements[j].type==='link_children'):
								
								// Case link open children (arrow)
								// var event_function	= [{'type':'click','name':'ts_object.toggle_view_children'}];
								const element_link_children 		= ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: elements_container,
																			class_name 				: class_for_all,
																			data_set 				: children_dataset,
																		 })
											element_link_children.addEventListener("click",(e)=>{
												self.toggle_view_children(element_link_children, e)
											})
								
								let class_name  = 'ts_object_children_arrow_icon'
									if (ar_children_data[i].ar_elements[j].value==='button show children unactive') {
										class_name += ' arrow_unactive'
									}else if (show_arrow_opened===true){
										class_name += ' ts_object_children_arrow_icon_open'
									}							
								const arrow_icon 		= ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: element_link_children,
																			class_name 				: class_name,
																		 })
								break;
							
							// INDEXATIONS ADN STRUCTURATIONS
							case (ar_children_data[i].ar_elements[j].tipo==='hierarchy40'):
							case (ar_children_data[i].ar_elements[j].tipo==='hierarchy91'):

								if (   ar_children_data[i].ar_elements[j].tipo==='hierarchy40' && ar_children_data[i].permissions_indexation>=1
									|| ar_children_data[i].ar_elements[j].tipo==='hierarchy91' && ar_children_data[i].permissions_structuration>=1 ) {

									// Build button
									// var event_function 	= [{'type':'click',
									// 						'name':'ts_object.show_indexations',
									// 						'function_arguments':[ar_children_data[i].section_tipo,ar_children_data[i].section_id,ar_children_data[i].ar_elements[j].tipo,indexations_container_id]}]
									const element_show_indexations	= ui.create_dom_element({
																				element_type			: 'div',
																				parent 					: elements_container,
																				class_name 				: class_for_all,
																				data_set 				: children_dataset,
																				text_node 				: ar_children_data[i].ar_elements[j].value,
																		 })
										element_show_indexations.addEventListener("click",(e)=>{
											self.show_indexations(element_show_indexations, e, ar_children_data[i].section_tipo, ar_children_data[i].section_id, ar_children_data[i].ar_elements[j].tipo, indexations_container_id)
										})
									// Build indexactions container 
										/*var indexations_container 	= ui.create_dom_element({
																				element_type			: 'div',
																				parent 					: wrap_ts_object,
																				class_name 				: 'indexations_container',
																				id 						: indexations_container_id,
																			 })*/
								}
								break;

							case (ar_children_data[i].ar_elements[j].type==='img'):

								if(ar_children_data[i].ar_elements[j].value){

									// let event_function 	= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];								
		 							const element_img 		= ui.create_dom_element({
																				element_type			: 'div',
																				parent 					: elements_container,
																				class_name 				: class_for_all + ' term_img',
																				data_set 				: children_dataset,
																			 })
						 									element_img.addEventListener("click",(e)=>{
																self.show_component_in_ts_object(element_img, e)
															})

		 							const image 		= ui.create_dom_element({
																				element_type			: 'img',
																				parent 					: element_img,
																				src 					: ar_children_data[i].ar_elements[j].value,
																			 })

								}
								
								break;
							// OTHERS
							default:

								// Case common buttons and links
								// var event_function 	= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];
								const element_show_component	= ui.create_dom_element({
																			element_type			: 'div',
																			parent 					: elements_container,
																			class_name 				: class_for_all,
																			data_set 				: children_dataset,
																			text_node 				: ar_children_data[i].ar_elements[j].value,
																		 })
																element_show_component.addEventListener("click",(e)=>{
																	self.show_component_in_ts_object(element_show_component, e)
																})
								break;
						
						}//end switch(true)
					}//end for (var j = 0; j < ch_len; j++)

				
			}//for (var i = 0; i < len; i++) {

			resolve(ar_children_c);
		});

		return promise
	};//end dom_parse_children	



	/** 
	* ON_DRAG_MOUSEDOWN
	*/
	var source = false;
	var handle = '';
	this.on_drag_mousedown = function(obj, event) {
		if(SHOW_DEBUG===true) {
			console.log("ts_object.on_drag_mousedown");
		}		

		// handle . set with event value	
			handle = event		

		//obj.ondrop = null;
		//obj.addEventListener ("dragend", ts_object.on_drag_end, true);
		//window.addEventListener ("mouseup", ts_object.on_drop_mouseup, false);
		//window.onmouseup = ts_object.on_drop_mouseup;
		//console.log(window.onmouseup);		
	};//end on_drag_mousedown	



	/**
	* ON_DRAGSTART
	*/
	this.old_parent_wrap = null
	this.on_dragstart = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("ts_object.on_dragstart:",typeof handle);
		}		

		// obj ondrop set as null
			obj.ondrop = null		
		
		// if (handle.contains(target)) 
			if (handle) {
				event.stopPropagation();
				//event.dataTransfer.setData('text/plain', 'handle');
				source = obj;
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('text/html', obj.innerHTML);
			}else{
				event.preventDefault();
			}

		// Fix class var 'old_parent_wrap'
			ts_object.old_parent_wrap = obj.parentNode.parentNode;
			if(!ts_object.old_parent_wrap) {
				console.log("[on_dragstart] Error on find old_parent_wrap");
			}
		//console.log(event);
		//obj.parentNode.parentNode.removeEventListener("drop", 'ts_object.on_drop');
	};//end on_dragstart	



	/**
	* ON_DRAG_END
	* @return 
	*/
	var target
	this.on_drag_end = function() {
		if(SHOW_DEBUG===true) {
			console.log("on_drag_end");
		}		

		// target set as false
			target = false;

		// source. set as blank
			source = '';		
		
		//handle = '';		
		//window.onmouseup = null;
	};//end on_drag_end



	/** 
	* ON_ORDER_DRAG_MOUSEDOWN
	*/
	var order_source = false;
	var order_handle = '';
	this.on_order_drag_mousedown = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("on_order_drag_mousedown");
		}		
		
		order_handle = event;		
	};//end on_order_drag_mousedown



	/**
	* ON_ORDER_DRAGSTART
	*/
	this.on_order_dragstart = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("on_order_dragstart");
		}
		
		obj.ondrop = null;
		
		//if (handle.contains(target)) {
		if (order_handle) {
			event.stopPropagation();
			//event.dataTransfer.setData('text/plain', 'order_handle');
			order_source = obj;
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/html', obj.innerHTML);
		} else {
			event.preventDefault();
		}	
	};//end on_order_dragstart



	/**
	* ON_ORDER_DRAG_END
	* @return 
	*/
	this.on_order_drag_end = function() {
		if(SHOW_DEBUG===true) {
			//console.log("on_order_drag_end ");;
		}
		
		target = false;
		//handle = '';
		order_source = '';
	};//end on_order_drag_end



	/**
	* ON_ORDER_DRAGOVER
	* @param DOM object obj 
	* 	Is the whole ts_object target wrapper 
	*/
	this.on_order_dragover = function(obj, event) {
		event.preventDefault(); // Necessary. Allows us to drop.
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

		// Add drag_over class
		//obj.classList.add('drag_over')
	};//end on_order_dragover



	/**
	* ON_DRAGENTER
	* @return 
	*/
	this.on_dragenter = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("dragenter");
			//console.log(obj.dataset.tipo);;
		}
		
		//event.dataTransfer.dropEffect = "copy";	
	};//end on_dragenter


	/**
	* ON_DRAGOVER
	* @param DOM object obj 
	* 	Is the whole ts_object target wrapper 
	*/
	this.on_dragover = function(obj, event) {
		event.preventDefault(); // Necessary. Allows us to drop.
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

		// Add drag_over class
		obj.classList.add('drag_over')
	};//end on_dragover



	/**
	* ON_DRAGLEAVE
	* @return 
	*/
	this.on_dragleave = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("dragleave");;
		}		

		// Remove drag_over class
			obj.classList.remove('drag_over')
	};//end on_dragleave



	/**
	* ON_DROP
	*/
	this.on_drop = function(obj, event) {
		event.preventDefault();
		event.stopPropagation();

		const self = this

		// debug
			if(SHOW_DEBUG===true) {
				// console.log("source:",JSON.parse(event.dataTransfer.getData("application/json")))
				//console.log("source:",source);
				//console.log("obj:",obj, event);
				// return true
			}			

		// Remove drag_over class
			obj.classList.remove('drag_over')

		// wraps
			const wrap_source = source 	// element thats move
			const wrap_target = obj 	// element on user leaves source wrap
			if (wrap_source === wrap_target) {
				console.log("[ts_object.on_drop] Unable self drop (2) wrap_source is equal wrap_target");
				return false;
			}

		// div_children
			let div_children 	= null
			const nodes 		= obj.children // childNodes
			const nodes_len 	= nodes.length
			for (let i = nodes_len - 1; i >= 0; i--) {
				if (nodes[i].dataset.role === 'children_container'){
					div_children = nodes[i]; break;
				}
			}
			if (div_children===null) {
				console.log("[ts_object.on_drop] Unable self drop (3) div_children not found in nodes:",nodes);
				return false;
			}

		// data_transfer_json case
			const data_transfer_json = event.dataTransfer.getData("application/json")
			if (data_transfer_json.length>0) {				
				
				// parse from event.dataTransfer
					const data_obj = JSON.parse(data_transfer_json)

				if(SHOW_DEBUG===true) {
					// console.log("wrap_target:",wrap_target);
					// console.log("obj:",obj); 
					// console.log("-- event:",event);
					// console.log("ts_object.on_drop event called !!!!! with data_obj:", data_obj);
				}				

				// add children
					const button_obj = event.target
					// set mode to button for add_children
						button_obj.dataset.mode = (wrap_target.dataset.section_tipo==='hierarchy1') ? 'add_children_from_hierarchy' : 'add_children';									
					ts_object.add_children(button_obj).then(function(response){
						if(SHOW_DEBUG===true) {
							//console.log("response:",response);
						}

						// falback
							if (typeof data_obj.manager!=="undefined" && typeof data_obj.fallback!=="undefined") {
								
							 	// set_new_thesaurus_value on finish add_children
							 		if (typeof window[data_obj.manager][data_obj.fallback]==="function") {
										// call fallback
							 				window[data_obj.manager][data_obj.fallback](response, data_obj, wrap_target)
							 		}else{
							 			// error notification
							 				console.error("Error on exec callback. Method not available: ", data_obj.manager, data_obj.fallback);
							 		}
							}					 	
					 })				

				return true // stop execution here
			}

		//var element_children_target = wrap_target.querySelector('.list_thesaurus_element[data-type="link_children"]')
		const element_children_target = ts_object.get_link_children_from_wrap(wrap_target)
		//var element_children_source = ts_object.old_parent_wrap.querySelector('.list_thesaurus_element[data-type="link_children"]')
		const element_children_source = ts_object.get_link_children_from_wrap(ts_object.old_parent_wrap)


		new Promise(function(resolve, reject) {					
			// Append child	
			if ( div_children.appendChild(wrap_source) ) {
				resolve("DOM updated!");
			}else{
				reject(Error("Error on append child"));
			}
		}).then(function(result) {

			// Update parent data (returns a promise after http request finish)	 
			ts_object.update_parent_data(wrap_source).then(function(response){

				// Updates element_children_target
				ts_object.update_arrow_state(element_children_target, true) 			

				// Updates element_children_source
				ts_object.update_arrow_state(element_children_source, false)

				if(SHOW_DEBUG===true) {
					console.log("[ts_object.on_drop] Finish on_drop 3");
				}			
			})
			
		});//end js_promise

		
		/* OLD way
			// Append child
			div_children.appendChild(wrap_source)

			// Update parent data
			ts_object.update_parent_data(wrap_source)
					
			// Updates element_children_target
			ts_object.update_arrow_state(element_children_target, true)

			// Updates element_children_source
			ts_object.update_arrow_state(element_children_source, false) */		
	

		return true;
	};//end on_drop



	/**
	* UPDATE_PARENT_DATA
	* @return promise
	*/
	this.update_parent_data = function(wrap_ts_object) {

		/* NOTA:
			QUEDA PENDIENTE RESETEAR EL ESTADO DE LAS FLECHAS SHOW CHILDREN DE LOS HIJOS CUANDO SE ACTUALZA EL PADRE
			PORQUE SI NO NO SE PUEDE VOLVER A ABRIR UN LISTADO DE HIJOS (FLECHA)
		*/

		// Old parent wrap (previous parent)
		const old_parent_wrap = ts_object.old_parent_wrap			
			if (!old_parent_wrap) {
				console.log("[ts_object.update_parent_data] Error on find old_parent_wrap");
				return Promise.resolve(function(){return false});
			}

		// parent wrap (current droped new parent)
		const parent_wrap = wrap_ts_object.parentNode.parentNode;
			if(!parent_wrap) {
				console.log("[ts_object.update_parent_data] Error on find parent_wrap");
				return Promise.resolve(function(){return false});
			}

		// element_children
		//var element_children = parent_wrap.querySelector('.list_thesaurus_element[data-type="link_children"]')
		const element_children = ts_object.get_link_children_from_wrap(parent_wrap)

		// If old and new wrappers are the same, no is necessary update data
		if (old_parent_wrap===parent_wrap) {
			console.log("[ts_object.update_parent_data] New target and old target elements are the same. No is necessary update data");
			return Promise.resolve(function(){return false});
		}

		//var parent_node_type_element = parent_wrap.querySelector('.list_thesaurus_element[data-node_type]')
		//var parent_node_type 		 = parent_node_type_element.dataset.node_type

		const parent_node_type = parent_wrap.dataset.node_type
		/*
		var parent_node_arrow_element = parent_wrap.querySelector('.list_thesaurus_element[data-type="link_children"]')
		var class_list 				  = parent_node_arrow_element.firstChild.classList
			class_list.remove('arrow_unactive','arrow_spinner')
			class_list.add("ts_object_children_arrow_icon_open")			
		*/
		const trigger_vars = {
				mode 		 			: 'update_parent_data',
				section_id 				: wrap_ts_object.dataset.section_id,
				section_tipo 			: wrap_ts_object.dataset.section_tipo,
				old_parent_section_id   : old_parent_wrap.dataset.section_id,
				old_parent_section_tipo : old_parent_wrap.dataset.section_tipo,
				parent_section_id 	  	: parent_wrap.dataset.section_id,
				parent_section_tipo 	: parent_wrap.dataset.section_tipo,
				parent_node_type 		: parent_node_type,
				tipo 		  			: element_children.dataset.tipo
			}

		// json get call
			const js_promise = ts_object.get_json(trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[ts_object.update_parent_data] response",response)
				}
				
				// hilite moved term
					const element = wrap_ts_object.querySelector('.list_thesaurus_element[data-type="term"]')
					if (element!==null)
						ts_object.hilite_element(element)

				// toggle_view_children()
				
				// Update source wrap in DOM 
				//var element_children_source = old_parent_wrap.querySelector('.list_thesaurus_element[data-type="link_children"]')			
					//ts_object.get_children(element_children_source)			
			})

		return js_promise
	};//end update_parent_data



	/**
	* TOGGLE_VIEW_CHILDREN
	* @param DOM objec
	*/
	this.toggle_view_children = function(link_children_element, event) {
		//var jsPromise = Promise.resolve(function(){
			
		let result = null
		
		//var wrap 	= link_children_element.parentNode.parentNode
		//var nodes 	= wrap.children  //childNodes

		const children_container = ts_object.get_my_parent_container(link_children_element, 'children_container')
		
		// If is the first time that the children are loaded, remove the first class selector and send the query for get the children
		if (children_container.classList.contains('js_first_load')) {

			children_container.classList.remove('js_first_load');
			link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open', 'arrow_spinner');
			
			// Load element by ajax
				result = ts_object.get_children(link_children_element);			
			
			//var children_container = ts_object.get_my_parent_container(link_children_element, 'children_container')
			//if (children_container.style.display==='none') {
			//	children_container.style.display = 'inline-table'
			//}

			// save_opened_elements
			ts_object.save_opened_elements(link_children_element,'add')
			
		}else{

			//the toggle view state with the class
			if(children_container.classList.contains('removed_from_view')){
				children_container.classList.remove('removed_from_view');
				link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open');

				// Load element by ajax
					if (typeof event!=="undefined" && event.altKey===true) {
						result = ts_object.get_children(link_children_element);
					}

				// save_opened_elements
				ts_object.save_opened_elements(link_children_element,'add')

			}else{
				children_container.classList.add('removed_from_view');
				link_children_element.firstChild.classList.remove('ts_object_children_arrow_icon_open');

				// save_opened_elements
				ts_object.save_opened_elements(link_children_element,'remove')
			}
		}			
		
			/*
				var len = nodes.length					
				for (var i = len - 1; i >= 0; i--) {
					if (nodes[i].dataset.role === 'children_container'){
						//node selected
						var current_css_classes = nodes[i].classList
						//if is the first time that the children are loaded, remove the first class selector and send the query for get the children
						if(current_css_classes.contains('js_first_load')){
							current_css_classes.remove('js_first_load');
							link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open', 'arrow_spinner');
							// Load element by ajax
							var result = ts_object.get_children(link_children_element);						
							//var children_container = ts_object.get_my_parent_container(link_children_element, 'children_container')
							//if (children_container.style.display==='none') {
							//	children_container.style.display = 'inline-table'
							//}												
							break;
						}
						//the toggle view state with the class
						if(current_css_classes.contains('removed_from_view')){
							current_css_classes.remove('removed_from_view');
							link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open');
						}else{
							current_css_classes.add('removed_from_view');
							link_children_element.firstChild.classList.remove('ts_object_children_arrow_icon_open');
						}
						break;
					}
				}
			*/
			//var children_container = ts_object.get_my_parent_container(link_children_element, 'children_container')
			//children_container.style.display = 'inline-table'

		//})
		//return jsPromise		

		return result
	};//end toggle_view_children



	/**
	* SAVE_OPENED_ELEMENTS
	* @return 
	*/
	this.opened_elements = {}
	this.save_opened_elements = function(link_children_element, action) {

		if(SHOW_DEBUG!==true) {
			return false;
		}
		
		const wrap 		= link_children_element.parentNode.parentNode
		//var parent_node = wrap.parentNode.parentNode
		//var parent  	= parent_node.dataset.section_tipo +'_'+ parent_node.dataset.section_id
		const key 		= wrap.dataset.section_tipo +'_'+ wrap.dataset.section_id


		if (action==='add') {
			
			const open_children_elements = wrap.getElementsByClassName('ts_object_children_arrow_icon_open')
			const len = open_children_elements.length

			for (let i = len - 1; i >= 0; i--) {
				let current_wrap 			= open_children_elements[i].parentNode.parentNode.parentNode
				let current_parent_node 	= current_wrap.parentNode.parentNode
				let current_parent  		= current_parent_node.dataset.section_tipo +'_'+ current_parent_node.dataset.section_id
				let current_key 			= current_wrap.dataset.section_tipo +'_'+ current_wrap.dataset.section_id

				this.opened_elements[current_key] = current_parent

			}

		}else{
			delete this.opened_elements[key]
			this.remove_children_from_opened_elements(key)
		}

		return true
	};//end save_opened_elements



	/**
	* REMOVE_CHILDREN_FROM_OPENED_ELEMENTS
	* @return 
	*/
	this.remove_children_from_opened_elements = function(parent_key) {

		for (let key in this.opened_elements) {
			let current_parent = this.opened_elements[key]
			if (current_parent == parent_key){
				delete this.opened_elements[key]
				if(SHOW_DEBUG===true) {
					console.log("[remove_children_from_opened_elements] Removed key ",key)
				}				
				this.remove_children_from_opened_elements(key)
			}
		}		
		
		return true
	};//end remove_children_from_opened_elements


	
	/**
	* HILITE_ELEMENT
	* section_tipo, section_id
	* element.dataset.section_tipo, lement.dataset.section_id
	* @param dom object element
	* @return int len
	*/
	this.hilite_element = function(element, clean_others) {
		
		// Locate all term elements
		// var type 	= 'term'; // [data-type="'+type+'"]
		// var matches = document.querySelectorAll('.list_thesaurus_element[data-section_tipo="'+section_tipo+'"][data-section_id="'+section_id+'"]');
		
		if (typeof clean_others==='undefined') {
			clean_others = true
		}

		// Remove current hilite elements
			if(clean_others!==false) {
				this.reset_hilites()
			}
			
		// Hilite only current element
			// element.classList.add("element_hilite");

		// Hilite all apperances of current component (can appears more than once)
			const matches = document.querySelectorAll('.list_thesaurus_element[data-type="'+element.dataset.type+'"][data-section_tipo="'+element.dataset.section_tipo+'"][data-section_id="'+element.dataset.section_id+'"]');
			const len 	  = matches.length;
			for (let i = len - 1; i >= 0; i--) {		
				matches[i].classList.add("element_hilite");
			}

		return len
	};//end hilite_element



	/**
	* RESET_HILITES
	* Removes css class element_hilite from all elemens
	*/
	this.reset_hilites = function() {

		const matches 	= document.querySelectorAll('.element_hilite');
		const len 		= matches.length;
		for (let i = len - 1; i >= 0; i--) {
			matches[i].classList.remove("element_hilite");
		}

		return true
	};//end reset_hilites



	/**
	* REFRESH_ELEMENT
	* Reload selected element/s wrap in DOM 
	*/
	this.refresh_element = function(section_tipo, section_id) {

		// Locate all term elements
		const type 		= 'term';
		const matches 	= document.querySelectorAll('.list_thesaurus_element[data-type="'+type+'"][data-section_tipo="'+section_tipo+'"][data-section_id="'+section_id+'"]');
		const len 		= matches.length;
			if (len===0) {
				console.log("[refresh_element] Error on match elements. Not terms found for section_tipo:"+section_tipo+", section_id:"+section_id+", type:"+type);
			}
		for (let i = len - 1; i >= 0; i--) {

			// element to hilite
			let term =  matches[i]
				//term.classList.add("arrow_spinner");
				ts_object.element_to_hilite = {'section_tipo' : section_tipo, 'section_id' : section_id}

			let parent_wrap 	  = matches[i].parentNode.parentNode.parentNode.parentNode
			let element_children = ts_object.get_link_children_from_wrap(parent_wrap)

				if(element_children) {					
					
					ts_object.get_children( element_children ).then(function(response) {
						var arrow_div = element_children.querySelector('.ts_object_children_arrow_icon')
						if (arrow_div && arrow_div.classList.contains('ts_object_children_arrow_icon_open')===false) {
							// Reopen arrow children
							//ts_object.toggle_view_children(element_children)
						}
					})
					
				}else{
					if (SHOW_DEBUG===true) {
						console.log(new Error().stack);
					}
					console.log("[refresh_element] Error on find element_children for section_tipo:"+section_tipo+", section_id:"+section_id+", type:"+type);
				}
		}

		return len;
	};//end refresh_element



	/**
	* EDIT
	* section_id is optional. If not get, the function uses button_obj dataset section_id
	*/
	this.edit_window = null; // Class var
	this.edit = function(button_obj, event, section_id, section_tipo) {

		//console.log("typeof button_obj:", typeof button_obj, "button_obj:", button_obj, "button_obj.parentNode", button_obj.parentNode);
		if (!button_obj.parentNode) {
			console.warn("[ts_object.edit] Ognored empty button action ", button_obj);
			return false
		}
	
		const wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				console.error("[ts_object.edit] Error on find wrap", wrap);
				return false
			}

		if (typeof section_id==="undefined") {
			section_id = wrap.dataset.section_id
		}

		if (typeof section_tipo==="undefined") {
			section_tipo = wrap.dataset.section_tipo
		}		
		
		let url = DEDALO_CORE_URL + '/main/?t='+section_tipo+'&id='+section_id+'&menu=no'
		if (area_thesaurus.model_view===true) {
			url += "&model=1"
		}

		const strWindowFeatures 	= "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
			//strWindowFeatures 	= null
			//console.log(url);	

		if(ts_object.edit_window === null || ts_object.edit_window.closed) { //  || edit_window.location.href!=url || ts_object.edit_window.closed
	
			ts_object.edit_window = window.open(
				url,
				"edit_window",
				strWindowFeatures
			);
			ts_object.edit_window.addEventListener("beforeunload", function(e){
				// Refresh element after close edit window
				//console.log("Edit window is closed for record "+section_id +". Calling refresh_element section_tipo:"+section_tipo+" section_id:"+section_id);
				ts_object.refresh_element(section_tipo, section_id)

			}, false);	
		}else{

			const current_query = ts_object.edit_window.location.href.split("?")[1]
			const new_query 	= url.split("?")[1]
			if (current_query!==new_query) {
				ts_object.edit_window.location.href = url
			}			
			ts_object.edit_window.focus();
		}
	};//end edit



	/**
	* ADD_CHILDREN
	* @param object button_obj
	*/
	this.add_children = function(button_obj) {

		// wrap
			//const wrap = button_obj.parentNode.parentNode;
			const wrap = find_ancestor(button_obj, "wrap_ts_object")
				if(!wrap) {
					console.log("[add_children] Error on find wrap");
					return false
				}
		
		// children_element
			const children_element = ts_object.get_link_children_from_wrap(wrap)
				if(!children_element) {
					console.log("[ts_object.add_children] Error on find children_element 'link_children'");
					return false
				}

		// tipo
			const tipo = children_element.dataset.tipo
				if (!tipo) {
					console.log("[ts_object.add_children] Error on find tipo on children_element 'link_children'");
					return false
				}

		// mode
			const mode = button_obj.dataset.mode || "add_children"

		// target_section_tipo check on add_children_from_hierarchy mode
			if (mode==="add_children_from_hierarchy") {
				if (typeof wrap.dataset.target_section_tipo==='undefined') {
					alert("Please, define a target_section_tipo in current hierarchy before add terms")
					console.log("[ts_object.add_children] Error on find target_section_tipo dataset on wrap");
					return false
				}
			}
		
		// trigger_vars
			const trigger_vars = {
					mode 		 		: mode, // default is 'add_children',
					section_id 			: wrap.dataset.section_id,
					section_tipo 		: wrap.dataset.section_tipo,
					node_type 			: wrap.dataset.node_type || null,
					tipo 				: tipo,
					target_section_tipo : wrap.dataset.target_section_tipo || null
				}
				//if(SHOW_DEBUG===true) console.log("trigger_vars", trigger_vars); return ;

		// JSON GET CALL
		// Response is int new created section id
		const js_promise = ts_object.get_json(trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[ts_object.add_children] response",response)
				}				
				
				if (response===null) {
					
					// Server script error
						alert("Error on add_children. See server log for details");
				
				}else{

					if (response.result===false) {

						// Problems on add
							alert(response.msg);

					}else{
						// All is OK
							// Refresh children container 
							// ts_object.get_children(children_element).then(function(){
							// 	// On children refresh is done, trigger edit button
							// 	console.log("[ts_object.add_children] update_children_promise done");
							// 	//console.log(response);
							// 	// Open edit window
							// 	let new_section_id = response.result
							// 	ts_object.edit(button_obj, null, new_section_id, wrap.dataset.section_tipo)
							// })

						// Add section tipo to response
							response.wrap 		= wrap
							response.button_obj = button_obj

						
						return response
					}
				}

			}, function(error) {
				console.error("Failed get_json!", error);
			});

		return js_promise
	};//end add_children


	
	/**
	* ADD_CHILDREN_FROM_HIERARCHY
	* @return 
	*//*
	this.add_children_from_hierarchy = function(button_obj) {
		
		const wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[ts_object.add_children_from_hierarchy] Error on find wrap");
			}
		//var children_element = wrap.querySelector('.list_thesaurus_element[data-type="link_children"]')
		const children_element = ts_object.get_link_children_from_wrap(wrap)	
			if(!children_element) {
				return console.log("[ts_object.add_children_from_hierarchy] Error on find children_element 'link_children'");
			}			
		const tipo = children_element.dataset.tipo
			if (!tipo) {
				return console.log("[ts_object.add_children_from_hierarchy] Error on find tipo on children_element 'link_children'");
			}

			if (typeof wrap.dataset.target_section_tipo === 'undefined') {
				alert("Please, define a target_section_tipo in current hierarchy before add terms")
				return console.log("[ts_object.add_children_from_hierarchy] Error on find target_section_tipo dataset on wrap");
			}
		
		const trigger_vars = {
				mode 		 			: 'add_children_from_hierarchy',
				section_id 				: wrap.dataset.section_id,
				section_tipo 			: wrap.dataset.section_tipo,
				node_type 				: wrap.dataset.node_type || null,
				tipo	 				: tipo,
				target_section_tipo 	: wrap.dataset.target_section_tipo		
			}
			//return console.log("[ts_object.add_children_from_hierarchy] trigger_vars",trigger_vars);

		// JSON GET CALL
		const js_promise = ts_object.get_json(trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					if (response) {
						response.trigger_vars = trigger_vars
					}
					console.log("[ts_object.add_children_from_hierarchy] response", response);
				}				
				
				// Refresh children container 
				const update_children_promise = ts_object.get_children(children_element)

					// On children refresh is done, trigger edit button
					update_children_promise.then(function() {
						//console.log("[ts_object.add_children_from_hierarchy] update_children_promise done.");
						//console.log(response);

						// Open edit window
						const new_section_id = response.result
						ts_object.edit(button_obj, null, new_section_id, wrap.dataset.target_section_tipo)
					})

			}, function(error) {
				console.error("[ts_object.add_children_from_hierarchy] Failed get_json!", error);
			});

		return js_promise
	};//end add_children_from_hierarchy	
	*/


	/**
	* DELETE
	*/
	this.delete = function(button_obj) {

		if (!confirm("You are sure to delete current element?")) return false;

		const wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				console.log("[delete] Error on find wrap");
				return false
			}

		// Get all wrap_ts_object wraps whit this section_tipo, section_id
		// Find wrap of wrap and inside, button list_thesaurus_element
		const ar_wrap_ts_object = document.querySelectorAll('.wrap_ts_object[data-section_id="'+wrap.dataset.section_id+'"][data-section_tipo="'+wrap.dataset.section_tipo+'"]')	//
			
		const trigger_vars = {
				mode 		 	: 'delete',
				section_id 		: wrap.dataset.section_id,
				section_tipo 	: wrap.dataset.section_tipo,
				node_type 		: wrap.dataset.node_type || null,
			}
			//return console.log("[ts_object.delete] trigger_vars",trigger_vars);

		// JSON GET CALL
		const js_promise = ts_object.get_json(trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[ts_object.delete] response",response);
				}				
				
				if (response.result===false) {
					alert("Sorry. You can't delete a element with children. Please, remove all children before delete.")
				}else{
					// Remove all DOM apperances of current wrap_ts_object
					/*
					var len = ar_wrap_ts_object.length
					for (var i = 0; i < ar_wrap_ts_object.length; i++) {
						ar_wrap_ts_object[i].parentNode.removeChild(ar_wrap_ts_object[i])
					}
					*/
					ts_object.refresh_element(wrap.dataset.section_tipo, wrap.dataset.section_id)
				}
				/*
				// Refresh children container 
				var update_children_promise = ts_object.get_children(button_obj).then(function() {	
						// On children refresh is done, trigger edit button						
						console.log("update_children_promise done");
					})
				*/
			}, function(error) {
				console.error("Failed get_json!", error);
			});

		return js_promise
	};//end delete


	
	/**
	* SHOW_component_editor
	* Open component editor bellow ts_object elements to edit current data
	*/
	this.show_component_editor = function(button_obj, html_data, role, callback) {
	
		// wrap_ts_object. Locate current ts_object container
			// var wrap_ts_object = find_ancestor(button_obj, 'wrap_ts_object')
			const wrap_ts_object = button_obj.parentNode.parentNode;		

		// data_container. Locate data_container
			// var data_container = wrap_ts_object.getElementsByClassName('data_container')[0]
			const nodes 		= wrap_ts_object.children //childNodes
			const nodes_length 	= nodes.length
			for (let i = nodes_length - 1; i >= 0; i--) {
				if (nodes[i].dataset.role==='data_container'){
					var data_container = nodes[i];
					break;
				}
			}
			if (typeof data_container==='undefined' ) {
				console.log("[show_component_editor] Error on locate data_container div")
				return false;
			}
			//data_container.style.minHeight = "42px"; // avoid flash on load elements

		// element_data_div. Locate current element_data_div 
			// var element_data_div = data_container.querySelectorAll('[data-role="'+role+'"]')[0]
			let element_data_div = data_container.querySelector('[data-role="'+role+'"]')

		if (element_data_div) {
			// element_data_div found

			// force remove elements
				//element_data_div.remove()

			// force remove elements all
				const all_element_data_div 	   = data_container.children // childNodes; 
				const all_element_data_div_len = all_element_data_div.length
					for (let i = all_element_data_div_len - 1; i >= 0; i--) {
						all_element_data_div[i].remove()
					}			

			// if (element_data_div.style.display==='none') {
			// 	// Hide all
			// 		let all_element_data_div 	 = data_container.children // childNodes; 
			// 		let all_element_data_div_len = all_element_data_div.length
			// 			for (let i = all_element_data_div_len - 1; i >= 0; i--) {
			// 				all_element_data_div[i].style.display = 'none'
			// 			}
			// 	// Show current
			// 		element_data_div.style.display = 'table-cell'
			// }else{
			// 	// hide
			// 		element_data_div.style.display = 'none'
			// }

		}else{
			// element_data_div not found

			data_container.classList.add("loading_list_thesaurus_data")	

			// element_data_div
				element_data_div 			  = document.createElement("div");
				element_data_div.dataset.role = role;
				element_data_div.style.display='table-cell'
				element_data_div.classList.add("sgc_edit")
			

			// Hide all
				let all_element_data_div = data_container.children  //childNodes;
				const len = all_element_data_div.length;
					for (let i = len - 1; i >= 0; i--) {
						all_element_data_div[i].style.display = 'none'
					}
			
			// Callback optional
			if (callback && typeof(callback)==="function") {

				// Exec callback
					const jsPromise = callback();

					jsPromise.then(function(response) {
						
						// Parse html text as object
							let el = document.createElement('div')
								el.innerHTML = response

						// Pure javascript option (replace content and exec javascript code inside)
							insertAndExecute(element_data_div, el)

						// remove loading class
							data_container.classList.remove("loading_list_thesaurus_data")

						// Add element to DOM
							data_container.appendChild(element_data_div);

						// Focus first input element
							ts_object.select_first_input_in_editor(element_data_div)

					}, function(xhrObj) {
						console.log(xhrObj);
					});

			}else{

				// Parse html text as object
					let el = document.createElement('div')
						el.innerHTML = html_data

				// Pure javascript option (replace content and exec javascript code inside)
					insertAndExecute(element_data_div, el)

				// Add element to DOM
					data_container.appendChild(element_data_div);

				// Focus first input element
					ts_object.select_first_input_in_editor(element_data_div)

			}//end if (callback && typeof(callback) === "function")
			
		}//end if (element_data_div)

		return true
	};//end show_component_editor



	/**
	* SELECT_FIRST_INPUT_IN_EDITOR
	*/
	this.select_first_input_in_editor = function(element_data_div) {

		// Focus first input element
			const first_input = element_data_div.querySelector('input')
				if (first_input) {
					// Select all content
					first_input.select()
					// Hide editor on change value
					first_input.addEventListener("change", function(e){	
						//ts_object.refresh_element(section_tipo, section_id)
						element_data_div.style.display = 'none'
					}, false);
				}

		return true
	};//end select_first_input_in_editor



	/**
	* SHOW_EDIT_OPTIONS
	*//*
	this.show_edit_options = function(object){
		return false;		
		//var parent_wrap = object.parentNode.parentNode.querySelectorAll('.id_column_content')[0]
		var parent_wrap = document.querySelectorAll('.id_column_content')
		var len = parent_wrap.length
		for (var i = len - 1; i >= 0; i--) {
			parent_wrap[i].classList.remove('visible_element')
		}
		//parent_wrap.classList.remove('visible_element')
			//console.log(parent_wrap);
		

		var id_column_content = object.querySelectorAll('.id_column_content')[0];		
		id_column_content.classList.add('visible_element')
			//console.log('entrar');
	};//show_edit_options
	*/


	/**
	* HIDE_EDIT_OPTIONS
	*//*
	this.hide_edit_options = function(object){
		return false;
		var id_column_content = object.querySelectorAll('.id_column_content')[0];		
		id_column_content.classList.remove('visible_element')
			//console.log('salir');
	};//hide_edit_options
	*/



	/**
	* SHOW_COMPONENT_IN_ts_object
	* Show and hide component data in ts_object content_data div
	* @param object button_obj
	*/
	this.show_component_in_ts_object = async function(button_obj) {
				
		const wrap 	  		= button_obj.parentNode.parentNode;
		const section_tipo 	= wrap.dataset.section_tipo
		const section_id 	= wrap.dataset.section_id
		const tipo 			= button_obj.dataset.tipo
		const modo 			= 'edit'
		const lang 			= page_globals.dedalo_data_lang
		const html_data 	= '...';	//" show_component_in_ts_object here! "
		//const role 	  	= 'component_input_text' + '_' + section_tipo + '_' + section_id + '_' + tipo
		const role 	  		= section_tipo + '_' + section_id + '_' + tipo

		const current_component = await instances.get_instance({
				section_tipo 	: section_tipo,
				section_id 		: section_id,
				tipo 			: tipo,
				mode 			: modo
		})

		await current_component.build(true)
		const component_node = await current_component.render()

		const element_data_contanier = wrap.querySelector(':scope > [data-role="data_container"]')


		const all_element_data_div 	   = element_data_contanier.children // childNodes; 
		const all_element_data_div_len = all_element_data_div.length
			for (let i = all_element_data_div_len - 1; i >= 0; i--) {
				all_element_data_div[i].remove()
			}

			element_data_contanier.appendChild(component_node)




		return component_node;


		const loaded_promise = ts_object.show_component_editor(button_obj, html_data, role, function(){

			const trigger_url  = component_common.url_trigger
			const trigger_vars = {
					mode 			: 'load_component_by_ajax',
					section_tipo  	: section_tipo,
					parent  		: section_id,
					tipo  			: tipo,
					modo  			: modo,
					lang  			: lang,
					top_tipo 		: page_globals.top_tipo
			}
			//return console.log("[ts_object.show_component_in_ts_object] response",trigger_vars);

			// JSON GET CALL
			const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log("[ts_object.show_component_in_ts_object] response",response);
					}
					
					if (response && response.result) {
						return response.result
					}else{
						return false
					}
					
			}, function(error) {
					console.log("show_component_in_ts_object ajax error (fail)")
					console.error("Failed get_json!", error);
			})//end promise	
	
			
			return js_promise						
		})//end ts_object.show_component_editor	

		return loaded_promise	
	};//end show_component_in_ts_object



	/**
	* SHOW_INDEXATIONS : Carga el listado de fragmentos indexados 
	*/
	this.show_indexations = function(button_obj, event, section_tipo, section_id, component_tipo, container_id) {

		const target_div = document.getElementById(container_id);
			if (!target_div) {
				alert('show_indexations. Target div not exist for terminoID: '+terminoID+' !')
				return false
			}

		let js_promise
	
		if(target_div.offsetHeight>0) {

			// si está visible, la ocultamos			
			target_div.style.display = 'none'
			
			js_promise = new Promise((resolve, reject) => {
			   resolve("Hidden target_div")	  
			});

		}else{

			target_div.innerHTML = "<div><span class=\"blink\">Loading indexations. Please wait..</span> <span class=\"css_spinner\"></span></div>"
			target_div.style.display = 'inline-table'
	
			// si no está visible, hacemos la búsqueda y cargamos los datos	
			const trigger_vars = {
					mode	 		: 'show_indexations',
					section_tipo 	: section_tipo,
					section_id 		: section_id,
					component_tipo 	: component_tipo
				}

			// JSON GET CALL
			js_promise = ts_object.get_json(trigger_vars).then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log("[ts_object.show_indexations] response",response);
					}
					
					if (response && response.result) {
						target_div.innerHTML 	 = response.result
						target_div.style.display = 'inline-table'
					}else{
						target_div.innerHTML = "<div>Sorry. A broken link was found</div>"
						setTimeout(function(){
							target_div.innerHTML     = ""
							target_div.style.display = "none"
						},4000)
						console.log("An error was happened. null value is received. See server log for details.");
					}
					
				}, function(error) {
					console.error("Failed get_json!", error);
				});			
		}//end if(target_div.offsetHeight>0)


		return js_promise
	};//end show_indexations



	/**
	* LINK_TERM
	* Add link to opener window for autocomplete_hi relations
	*/
	this.link_term = function(button_obj) {

		const source_window = window.opener || window.parent
			if (source_window===null) {
				console.log("[link_term] Error on find window.opener / parent")
				return false
			}

		const wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				console.log("[link_term] Error on find wrap")
				return false
			}

		// Component name is set fron url and sources from button dataset.component_name
		const component_name = ts_object.component_name
			if(typeof component_name==="undefined" || component_name==="undefined") {
				if(SHOW_DEBUG===true) {
					console.log("[link_term] Error on find component_name ts_object",ts_object)
				}
				return false
			}
		
		let label = " "
		if(wrap.querySelector('.list_thesaurus_element[data-type="term"]').hasChildNodes()){
			const wrap_term = wrap.querySelector('.list_thesaurus_element[data-type="term"]')			
			label = wrap_term.firstChild.innerHTML;
		}
			
		if (typeof source_window[component_name]==="undefined") {
			console.error("Error on get source_window component_name,",component_name);
			return false
		}

		const response = source_window[component_name].link_term(wrap.dataset.section_id, wrap.dataset.section_tipo, label)
				

		return response
	};//end link_term



	/**
	* GET_JSON
	* XMLHttpRequest to trigger
	* @return Promise
	*/
	this.get_json = function(trigger_vars) {
		
		const url = this.trigger_url;	//?mode=get_children_data';

		// Return a promise of XMLHttpRequest
		return this.get_json_data(url, trigger_vars)
	};//end get_json


	/**
	* GET_JSON
	* XMLHttpRequest to trigger
	* @return Promise
	*/
	this.get_json_data = function(trigger_url, trigger_vars, async, content_type) {
		
		const url = trigger_url;	//?mode=get_children_data';
		
		// ASYNC
		if (typeof async==="undefined" || async!==false) {
			async = true
		}
		
		const data_send = JSON.stringify(trigger_vars)
		//console.log("[get_json_data] data_send:",data_send); 
	
		// Create new promise with the Promise() constructor;
		// This has as its argument a function
		// with two parameters, resolve and reject
		return new Promise(function(resolve, reject) {
			// Standard XHR to load an image
			const request = new XMLHttpRequest();
				
				// Open connection as post					
					request.open("POST", url, async);

				//request.timeout = 30 * 1000 * 60 ; // time in milliseconds
				//request.ontimeout = function () {
				//    console.error("The request for " + url + " timed out.");
				//};
	
				// codification of the header for POST method, in GET no is necesary
					if (typeof content_type==="undefined") {
						content_type = "application/json"
					}
					request.setRequestHeader("Content-type", content_type); // application/json OR application/x-www-form-urlencoded				

				request.responseType = 'json';
				// When the request loads, check whether it was successful
				request.onload = function(e) {
				  if (request.status === 200) {
					// If successful, resolve the promise by passing back the request response
					resolve(request.response);
				  }else{
					// If it fails, reject the promise with a error message
					reject(Error('Reject error don\'t load successfully; error code: ' + request.statusText));
				  }
				};
				request.onerror = function(e) {			
				  // Also deal with the case when the entire request fails to begin with
				  // This is probably a network error, so reject the promise with an appropriate message
				  reject(Error('There was a network error. data_send: '+url+"?"+ data_send + "statusText:" + request.statusText));
				};

				// Send the request
				request.send(data_send);
		});
	};//end get_json


	
	/**
	* PARSER_SEARCH_RESULT
	* @return 
	*/	
	this.current_main_div = null;
	var ar_resolved = [];
	this.parse_search_result = function( data, main_div, is_recursion ) {
		//console.log("data:",data,is_recursion, main_div);
		const self = this		

		/*
		var data = [
				    [
				        {
				            "section_tipo": "hierarchy1",
				            "section_id": "1",
				            "modo": "edit",
				            "lang": "lg-spa",
				            "ar_elements": [
				                {
				                    "type": "term",
				                    "tipo": "hierarchy5",
				                    "value": "hierarchy1"
				                },
				                {
				                    "type": "link_children",
				                    "tipo": "hierarchy45",
				                    "value": "button show children"
				                }
				            ]
				        },
				        {
				            "section_tipo": "ts1",
				            "section_id": "65",
				            "modo": "edit",
				            "lang": "lg-spa",
				            "ar_elements": [
				                {
				                    "type": "link",
				                    "tipo": "hierarchy42",
				                    "value": 0
				                },
				                {
				                    "type": "term",
				                    "tipo": "hierarchy25",
				                    "value": "76"
				                },
				                {
				                    "type": "icon",
				                    "tipo": "hierarchy49",
				                    "value": "CH"
				                },
				                {
				                    "type": "link_children",
				                    "tipo": "hierarchy49",
				                    "value": "button show children"
				                }
				            ]
				        },
				        {
				            "section_tipo": "ts1",
				            "section_id": "73",
				            "modo": "edit",
				            "lang": "lg-spa",
				            "ar_elements": [
				                {
				                    "type": "link",
				                    "tipo": "hierarchy42",
				                    "value": 0
				                },
				                {
				                    "type": "term",
				                    "tipo": "hierarchy25",
				                    "value": "80"
				                },
				                {
				                    "type": "icon",
				                    "tipo": "hierarchy49",
				                    "value": "CH"
				                },
				                {
				                    "type": "link_children",
				                    "tipo": "hierarchy49",
				                    "value": "button show children"
				                }
				            ]
				        },
				        {
				            "section_tipo": "ts1",
				            "section_id": "74",
				            "modo": "edit",
				            "lang": "lg-spa",
				            "ar_elements": [
				                {
				                    "type": "link",
				                    "tipo": "hierarchy42",
				                    "value": 0
				                },
				                {
				                    "type": "term",
				                    "tipo": "hierarchy25",
				                    "value": "78"
				                },
				                {
				                    "type": "icon",
				                    "tipo": "hierarchy49",
				                    "value": "CH"
				                },
				                {
				                    "type": "link_children",
				                    "tipo": "hierarchy49",
				                    "value": "button show children"
				                }
				            ]
				        }
				    ]
				]
		*/
		//if(is_recursion===false) {
		//	ar_resolved = [] // reset array
		//	if(SHOW_DEBUG===true) {
		//		console.log("[ts_object.parse_search_result] data",data);
		//	}
		//}

		// iterate data object
		for (var key in data) {

			let element = data[key]

			if (ar_resolved.indexOf(key) !== -1) {
				if(SHOW_DEBUG===true) {
					console.log("[ts_object.parse_search_result] Skipped resolved key "+key);
				}				

				// Recursive parent element
				//let h_data = element.heritage
				//ts_object.parse_search_result(h_data, self.current_main_div, true)
				continue;
			}

			if(is_recursion===false) {
				// Calculate main div of each root element
				// Search children place
				main_div = document.querySelector('.hierarchy_root_node[data-section_id="'+element.section_id+'"]>.children_container')
				if (main_div) {
					// Clean main div (Clean previous nodes from root)
					while (main_div.firstChild) {
					    main_div.removeChild(main_div.firstChild);
					}
				}else{
					//console.log("[ts_object.parse_search_result] Error on locate main_div:  "+'.hierarchy_root_node[data-section_id="'+element.section_id+'"] > .children_container')					
				}
			}

			if(!main_div) {
				ar_resolved = [] // reset array
				console.warn("[ts_object.parse_search_result] Warn: No main_div found! ", '.hierarchy_root_node[data-section_id="'+element.section_id+'"]>.children_container ', element);

			}else{
			
				let ar_children_data = []
					ar_children_data.push(element)
		
				const options = {
					clean_children_container 		: false, // Elements are added to existing main_div instead replace
					children_container_is_loaded 	: false, // Set children container as loaded
					show_arrow_opened 				: false, // Set icon arrow as opened
				}			
				
				const promise = ts_object.dom_parse_children(ar_children_data, main_div, options)
			}
				/*
				.then(function(result) {
					//console.log(element.heritage);
					if (typeof element.heritage!=='undefined') {
						var h_data = element.heritage
						ts_object.parse_search_result(h_data, result)

						//var children_element = result.parentNode.querySelector('.elements_container > [data-type="link_children"]')
						//ts_object.update_arrow_state(children_element, true)
						
						console.log("parse_search_result case "+key);
					}else{
						console.log("else case "+key);
						//ts_object.dom_parse_children(ar_children_data, main_div, false)
					}
				})
				*/

			// Recursion when heritage is present
			// Note var self.current_main_div is set on each dom_parse_children call
			if (typeof element.heritage!=='undefined') {
				
				// Recursive parent element
				let h_data = element.heritage
				ts_object.parse_search_result(h_data, self.current_main_div, true);
				
			}else{

				// Last elements are the final found elements and must be hilite
				element = self.current_main_div.parentNode.querySelector('.elements_container > [data-type="term"]')
				ts_object.hilite_element(element, false);											
			}

			// Open arrows and fix children container state
			/*
			main_div.classList.remove('js_first_load')
			var children_element = main_div.parentNode.querySelector('.elements_container > [data-type="link_children"]')
			if (children_element.firstChild) {
				children_element.firstChild.classList.add('ts_object_children_arrow_icon_open')
				//console.log(children_element);
			}
			*/
			//ar_resolved.push(key);	
			
		}//end for (var key in data)
		
		return true
	};//end parser_search_result



	/**
	* BUILD_ORDER_FORM
	* @return 
	*/
	this.build_order_form = function(button_obj, evt) {

		// Remove previous inputs
			const order_inputs = document.querySelectorAll('input.input_order')
			const len = order_inputs.length
			for (let i = len - 1; i >= 0; i--) {
				order_inputs[i].remove()
			}

		const old_value = parseInt(button_obj.textContent)

		const input = document.createElement('input')
			input.classList.add('id_column_link','input_order')
			input.value = old_value
			input.addEventListener("keyup", function(e){		
				e.preventDefault()				
				if (e.keyCode === 13) {				   
				   ts_object.save_order(button_obj, parseInt(this.value) )
				   //this.remove()
				}
			}, false);
			input.addEventListener("blur", function(e){
				e.preventDefault()
				this.remove()
				button_obj.style.display = ''
			}, false);		

		// Add input element after
			button_obj.parentNode.insertBefore(input, button_obj.nextSibling);

		// Hide button_obj
			button_obj.style.display = 'none'

		// Focus and select new input element
			input.focus();
			input.select();

		return true
	};//end build_order_form



	/**
	* SAVE_ORDER
	* @return 
	*/
	this.save_order = function(button_obj, new_value) {

		const old_value = parseInt(button_obj.textContent)

		if (new_value===old_value) {
			if(SHOW_DEBUG===true) {
				console.log("[ts_object.save_order] Value is not changed. ignored save_order action")
			}
			return false
		}

		let element_wrap 		 = button_obj.parentNode.parentNode
		let element_section_tipo = element_wrap.dataset.section_tipo
		let element_section_id 	 = element_wrap.dataset.section_id		
		//let children 		 = button_obj.parentNode.parentNode.parentNode.querySelectorAll('.wrap_ts_object')
		let children 			 = element_wrap.parentNode.childNodes
		const children_len 	 = children.length
		let wrap 				 = element_wrap.parentNode.parentNode

		// LINK_CHILDREN . Search component_relation_children tipo from wrap
		let link_children 		 = this.get_link_children_from_wrap(wrap)		
			if (link_children===null) {
				alert("[ts_object.save_order] Error on get list_thesaurus_element. save_order is skipped");
				return false;
			}

		// Avoid set invalid values
		if (new_value>children_len){
			new_value = children_len // max value is array length
		}else if (new_value<1) {
			new_value = 1;    // min value is 1
		}		

		// Iterate children elements
		let ar_locators = []
		for (let i = 0; i < children_len; i++) {
			
			ar_locators.push({
				section_tipo : children[i].dataset.section_tipo,
				section_id 	 : children[i].dataset.section_id
			})
		}
		
		// Sort array with new keys
		ar_locators.move( parseInt(old_value)-1, parseInt(new_value)-1 )
		
		const trigger_vars = {
				mode 		 	: 'save_order',
				section_id 		: wrap.dataset.section_id,
				section_tipo 	: wrap.dataset.section_tipo,
				component_tipo 	: link_children.dataset.tipo,
				ar_locators		: ar_locators // JSON.stringify(
			}
			if(SHOW_DEBUG===true) console.log("[ts_object.save_order] trigger_vars",trigger_vars);

		// JSON GET CALL
		// Response is int new created section id
		const js_promise = ts_object.get_json(trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[ts_object.save_order] response", response)
			}

			if (response.result && response.result!==false) {
				// Refresh element
				ts_object.refresh_element( element_section_tipo, element_section_id )
			}else{
				alert("[ts_object.save_order] Error on save order. "+ ts_object.msg )
			}			

		}, function(error) {
			console.error("[ts_object.save_order] Failed get_json!", error);
		});

		return js_promise
	};//end save_order



	/**
	* TOGGLE_ND
	* @return 
	*/
	this.toggle_nd = function(button_obj) {

		const nd_container = ts_object.get_my_parent_container(button_obj, 'nd_container')
			if (!nd_container) {
				if(SHOW_DEBUG===true) {
					console.log("[ts_object.toggle_nd] Error on locate nd_container from button_obj",button_obj);
				}
				return false
			}
		const children_container 	 = ts_object.get_my_parent_container(button_obj, 'children_container')
		//var link_children_element 	= button_obj.parentNode.querySelector('[data-type="link_children"]')
		const wrap 					 = button_obj.parentNode.parentNode
		const link_children_element = ts_object.get_link_children_from_wrap(wrap)
		
		//console.log(nd_container.style.display);
		if (!nd_container.style.display || nd_container.style.display==='none') {
						
			// Load all children and hide descriptors
				// Load element by ajax
				ts_object.get_children(button_obj).then(function(response) {
									
					// Show hidden nd_container
					nd_container.style.display = 'inline-table'				

					// When not already opened children, hide it (all children descriptors and not are loaded together)
					let icon_arrow = link_children_element.firstChild 
					if (icon_arrow.classList.contains('ts_object_children_arrow_icon_open')) {
						console.log("[ts_object.toggle_nd] Children are already loaded before");
					}else{
						// Children are NOT loaded before. Set as not loaded and hide
						children_container.classList.remove('js_first_load') // Set as already loaded
						children_container.classList.add('removed_from_view')	// Set as hidden				
						icon_arrow.classList.remove('ts_object_children_arrow_icon_open') // Allways remove state 'open' from arrow
					}
				})
		
		}else{

			// Hide showed nd_container
				nd_container.style.display = 'none'
		}		
	};//end toggle_nd



	/**
	* GET_MY_PARENT_CONTAINER
	* Returns current element (list_thesaurus_element) container of type inside his ts_element
	* @return object | null
	*/
	this.get_my_parent_container = function( button_obj, role ) {

		let parent_container = null

		const wrapper = button_obj.parentNode.parentNode 
			if (wrapper.dataset.node_type!=='thesaurus_node') {
				console.log("Error on get thesaurus_node wrapper !!!");
				return parent_container;
			}

		const wrapper_children 	= wrapper.children
		const wrapper_children_len = wrapper_children.length
		for (let i = wrapper_children_len - 1; i >= 0; i--) {
			if (wrapper_children[i].dataset.role===role) {
				parent_container = wrapper_children[i]
				break
			}
		}

		return parent_container
	};//end get_my_parent_container



	/**
	* GET_LINK_CHILDREN_FROM_WRAP
	* @return DOM element link_children
	*/
	this.get_link_children_from_wrap = function(wrap) {
		
		// LINK_CHILDREN . Search component_relation_children tipo from wrap
		let link_children = null; //wrap.querySelector('[data-type="link_children"]')

		// check valid wrap by class
			if (wrap.classList.contains("wrap_ts_object")===false) {
				console.error("Error. Invalid received wrap. Expected wrap class is wrap_ts_object. wrap:",wrap);
				return link_children
			}

		if(SHOW_DEBUG===true) {
			// console.log("[get_link_children_from_wrap] wrap",wrap);	//console.log("link_children",link_children);	;
		}
			
		const child_one 		= wrap.childNodes
		const child_one_len = child_one.length
		for (let i = child_one_len - 1; i >= 0; i--) {
			
			if (child_one[i].dataset.role && child_one[i].dataset.role==="elements_container") {
				
				const child_two 	= child_one[i].childNodes
				const child_two_len = child_two.length				
				for (let j = 0; j < child_two_len; j++) {
					if(child_two[j].dataset.type && child_two[j].dataset.type==="link_children") {
						link_children = child_two[j]
						break;
					}
				}
				break;
			}
		}
		if (link_children===null) {
			if(SHOW_DEBUG===true) {
				console.warn("[ts_object.get_link_children_from_wrap] Error on locate link_children from wrap: ",wrap);
			}
		}

		return link_children;
	};//end get_link_children_from_wrap

	

}//end ts_object