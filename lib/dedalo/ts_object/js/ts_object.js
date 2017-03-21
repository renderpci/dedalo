/*

	TS_OBJECT
	Manage a single thesaurus row element

*/
var ts_object = new function() {


	this.trigger_url 		= DEDALO_LIB_BASE_URL + '/ts_object/trigger.ts_object.php'
	// Set on update element in DOM (refresh)
	this.element_to_hilite 	= null;
	// thesaurus_mode . Defines apperance of thesaurus
	this.thesaurus_mode 	= null;



	/**
	* INIT
	* Fix important vars for current object
	*/
	this.init = function() {
		var url_vars = get_current_url_vars()
			//console.log(url_vars);

		// THESAURUS_MODE
		this.thesaurus_mode = url_vars.thesaurus_mode || 'default'
		// component_name Caller component name for realtions
		this.component_name = url_vars.component_name || null

		//console.log(this.thesaurus_mode);
		//console.log(this.component_name);
	};//end init
	this.init()



	/**
	* MAKE_ELEMENT_CONTENT_SORTABLE
	* @return 
	*//*
	this.make_element_content_sortable__WORKING_HERE = function(element, sort_handler) {

		var fixHelperModified = function(e, tr) {
			var $originals = tr.children()
			var $helper = tr.clone()
			$helper.children().each(function(index) {
			        $(this).width($originals.eq(index).width())
			    });
		    return $helper
			}
		var updateIndex = function(e, ui) {
			    $('div.wrap_ts_object', ui.item.parent()).each(function (i) {
			        $(this).html(i + 1)
			    });
			}
		var draggin_start = function(event, ui) {
				var current_item = ui.item
				// console.log(ui.item[0])
			}

		// Element sortable
		$(element).sortable({
			//axis: 'y',
			//containment: '#'+table_id, // Constrin moviment inside table body (parent)
			//start: 	draggin_start,
		    //helper 		: fixHelperModified,
		    //stop 		: updateIndex,		    
			//connectWith : '#'+dragable_connectWith + ' .tbody',
			handle 		: "."+sort_handler,	//".ts_object_order_drag",
		    update 		: function(event, ui) {
		    	event.stopPropagation();
				//alert("update")
				console.log(ui)
			},
			activate: function( event, ui ) {
				//event.preventDefault(); // Necessary. Allows us to drop.
				
			}
		}).disableSelection();
	};//end make_element_content_sortable */
	


	/**
	* GET_CHILDRENS
	* Get the JSON data from the server using promise. When data is loaded build DOM element
	* Data is builded from parent info (current object section_tipo ansd section_id)
	* @return promise
	*/
	var start = null
	this.get_childrens = function( childrens_element ) {
		//console.log(childrens_element);
		if (SHOW_DEBUG===true) start = new Date().getTime()			
		
		var tipo 				= childrens_element.dataset.tipo
		var wrap 				= childrens_element.parentNode.parentNode
		var parent_section_id 	= wrap.dataset.section_id
		var parent_section_tipo = wrap.dataset.section_tipo
		var node_type 			= wrap.dataset.node_type || null
		var target_section_tipo = wrap.dataset.target_section_tipo		

		// Test vars
		if (!parent_section_tipo || typeof parent_section_tipo==="undefined") {
			return 	console.log("[get_childrens] Error. parent_section_tipo is not defined");
		}
		if (!parent_section_id || typeof parent_section_id==="undefined") {
			return 	console.log("[get_childrens] Error. parent_section_id is not defined");
		}
		if (!tipo || typeof tipo==="undefined") {
			if (SHOW_DEBUG===true) {
				console.log(new Error().stack);
			}			
			return 	console.log("[get_childrens] Error. tipo is not defined");
		}
		
		// CHILDRENS_CONTAINER . childrens_container is the div container inside current ts_object
		var childrens_container	= wrap.querySelector('[data-role="childrens_container"]')
			if (!childrens_container) {
				console.log(childrens_element);
				return alert("Error on find childrens_container!")
			}		
		
		// JSON GET CALL
		var trigger_vars = {
				mode 			: 'get_childrens_data',
				section_id 		: parent_section_id,
				section_tipo 	: parent_section_tipo,
				node_type 		: node_type,
				tipo 			: tipo,
			}
			if (SHOW_DEBUG===true) {
				//console.log(trigger_vars); //console.log(new Error().stack);
			}
			
		// get_json
		return ts_object.get_json(trigger_vars).then(function(response) {		
				
				// DOM_PARSE_childrens
				var ar_childrens_data = response
				var options = {
					target_section_tipo 	  : target_section_tipo,
					node_type 				  : node_type,
					clean_childrens_container : true
				}
				//var result = ts_object.dom_parse_childrens(ar_childrens_data, childrens_container, true, target_section_tipo, node_type) //ar_childrens_data, childrens_container, target_section_tipo, type
				var result = ts_object.dom_parse_childrens(ar_childrens_data, childrens_container, options)

				// UPDATES ARROW
				if (childrens_element && childrens_element.firstChild && childrens_element.dataset.type) {
					childrens_element.firstChild.classList.remove('arrow_spinner');

					// Update arrow state					
					//ts_object.update_arrow_state(childrens_element, true) // disabled temporally
				}

				if (DEBUG) {
					var end  = new Date().getTime();
					var time = end - start;
					//console.log("->get_childrens: [done] "+" - execution time: " +time+' ms' +')')
					start = new Date().getTime()
				}

		}, function(error) {
			console.error("Error. Failed get_json!", error);
		});
	};//end get_childrens



	/**
	* UPDATE_ARROW_STATE
	* Updates arrow state when updated wrap
	*/
	this.update_arrow_state = function(link_childrens_element, toggle) {
		console.log("Called update_arrow_state. toggle: " + JSON.stringify(toggle));
		//console.log(link_childrens_element);

		// Childrens_container
		var childrens_container = ts_object.get_my_parent_container(link_childrens_element, 'childrens_container')

		// Toggle_view_childrens
		if (childrens_container.classList.contains('js_first_load')===true || childrens_container.classList.contains('removed_from_view')===true) {
			ts_object.toggle_view_childrens(link_childrens_element)
		}
		
		// Childrens_container nodes > 0
		if (childrens_container.children.length===0) {
			if (toggle===true) {
				ts_object.toggle_view_childrens(link_childrens_element)
			}
			link_childrens_element.firstChild.classList.add('arrow_unactive')
		}else{
			link_childrens_element.firstChild.classList.remove('arrow_unactive')
		}		
	};//end update_arrow_state
	


	/**
	* DOM_PARSE_CHILDRENS
	* @param array ar_childrens_data
	*	Array of childrens of current term from json source trigger
	* @param DOM objec childrens_container
	*	childrens_container is 'childrens_container'
	*/
	// this.dom_parse_childrens = function(ar_childrens_data, childrens_container, clean_childrens_container, target_section_tipo, type) {
	this.dom_parse_childrens = function(ar_childrens_data, childrens_container, options) {
		//console.log(ar_childrens_data);

		if (!ar_childrens_data) {
			console.log("[dom_parse_childrens] Error. No ar_childrens_data received. Nothing is parsed")
			return false;
		}
		if (!childrens_container) {
			console.log("[dom_parse_childrens] Error. No childrens_container received. Nothing is parsed");
			return false;
		}
		// Element wrap div is parentNode of 'childrens_container' (childrens_container)
		//var wrap_div = childrens_container.parentNode
	
		// Options set values
		var clean_childrens_container 		= typeof options.clean_childrens_container!=='undefined' ? options.clean_childrens_container : true
		var target_section_tipo 			= typeof options.target_section_tipo!=='undefined' ? options.target_section_tipo : null
		var node_type 						= typeof options.node_type!=='undefined' ? options.node_type : 'thesaurus_node'
		var next_node_type 					= node_type
		var childrens_container_is_loaded 	= typeof options.childrens_container_is_loaded!=='undefined' ? options.childrens_container_is_loaded : false
		var show_arrow_opened 				= typeof options.show_arrow_opened!=='undefined' ? options.show_arrow_opened : false
		
		// Clean childrens container before build contents	
		if (clean_childrens_container===true) {
			// childrens_container.innerHTML = ''
			while (childrens_container.hasChildNodes()) {
				childrens_container.removeChild(childrens_container.lastChild);
			}
		}

		// Build DOM elements iterating ar_childrens_data
		var promise = new Promise(function(resolve) {

			var ar_childrens_data_len = ar_childrens_data.length
			for (var i = 0; i < ar_childrens_data_len; i++) {

				// Calculated once. Used in various calls
				var ch_len = ar_childrens_data[i].ar_elements.length

				// IS_DESCRIPTOR element is descriptor check
				var is_descriptor = ar_childrens_data[i].is_descriptor

				// IS_INDEXABLE element is indexable check
				var is_indexable = ar_childrens_data[i].is_indexable

				// WRAP_TS_OBJECT . ts_object wrapper
					if (node_type==='hierarchy_node') next_node_type = 'thesaurus_node'
					var dataset = {'section_tipo':ar_childrens_data[i].section_tipo,'section_id':ar_childrens_data[i].section_id,'node_type':next_node_type}
					if (target_section_tipo) {
						dataset.target_section_tipo = target_section_tipo
					}
					if (is_descriptor===true) {
						var wrap_container 		= childrens_container
						var wrap_class 			= "wrap_ts_object"
						var event_function 		= [ 
													{'type':'dragstart','name':'ts_object.on_dragstart'}
													,{'type':'dragend','name':'ts_object.on_drag_end'}
													,{'type':'drop','name':'ts_object.on_drop'}
													,{'type':'dragenter','name':'ts_object.on_dragenter'}
													,{'type':'dragover','name':'ts_object.on_dragover'}
													,{'type':'dragleave','name':'ts_object.on_dragleave'}
												  ]
					}else{
						// Default wrap_ts_object is place inside childrens container, but when current element is not descriptor, we place it into 'nd_container'
						var parent_nd_container  = null
						var wrapper_children 	 = childrens_container.parentNode.children
						var wrapper_children_len = wrapper_children.length
						for (var wrapper_children_i = wrapper_children_len - 1; wrapper_children_i >= 0; wrapper_children_i--) {
							if (wrapper_children[wrapper_children_i].dataset.role==='nd_container') {
								parent_nd_container = wrapper_children[wrapper_children_i];
								break
							}
						}
						// Clean always
						while (parent_nd_container.hasChildNodes()) {
							parent_nd_container.removeChild(parent_nd_container.lastChild);
						}
						var wrap_container 	= parent_nd_container
						var wrap_class 		= "wrap_ts_object wrap_ts_object_nd"
						var event_function 	= null
					}
					var wrap_ts_object 		= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_container,
																		class_name 				: wrap_class,
																		data_set 				: dataset,
																		draggable				: true,
																		custom_function_events	: event_function,
																	 })

				// ID COLUMN . id column content
					var id_colum_content 	= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: 'id_column_content',
																	 })

				// ELEMENTS CONTAINER . elements container
					var dataset 			= {'role' :'elements_container'}
					var elements_container 	= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: 'elements_container',
																		data_set 				: dataset,
																	 })

				// DATA CONTAINER . elements data container
					var dataset 			= {'role' :'data_container'}
					var data_container 		= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: 'data_container',
																		data_set 				: dataset,
																	 })

				// INDEXATIONS CONTAINER
					var indexations_container_id = 'u' + ar_childrens_data[i].section_tipo + '_' + ar_childrens_data[i].section_id					
					var indexations_container 	 = ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: 'indexations_container',
																		id 						: indexations_container_id,
																	 })

				// ND CONTAINER
					if (is_descriptor===true && node_type!=='hierarchy_node') {
					var dataset 			= {'role':'nd_container'}
					var nd_container 		= ts_object.create_dom_element({
																		element_type 			: 'div',
																		parent 		 			: wrap_ts_object,
																		class_name 	 			: 'nd_container',
																		data_set 	 			: dataset,
																	 })
						//nd_container.innerHTML = ar_childrens_data[i].ar_elements[0].value
						//console.log( ar_childrens_data[i].ar_elements[0].value );
					}

				// CHILDRENS CONTAINER . childrens container
					if (is_descriptor===true) {
					var childrens_c_class_name = (childrens_container_is_loaded===true) ? 'childrens_container' : 'childrens_container js_first_load'
					var dataset 			= {'role' :'childrens_container','section_id':ar_childrens_data[i].section_id}
					var childrens_c 		= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: childrens_c_class_name,
																		data_set 				: dataset
																	 })
					// Fix current main_div
					// Important. Fix global var current_main_div used by search to parse results
					current_main_div = childrens_c

					}//end if (is_descriptor===true)
				
				// ID_COLUM_CONTENT elements
					switch(ts_object.thesaurus_mode) {

						case 'relation':
							// hierarchy_node cannot be used as related  and not indexables too
							if (node_type==='hierarchy_node' || is_indexable===false) break;
							
							var event_function 		= [{'type':'click','name':'ts_object.link_term'}];
							var link_related 		= ts_object.create_dom_element({
																		element_type			: 'a',
																		parent 					: id_colum_content,
																		class_name 				: 'id_column_link ts_object_related',
																		custom_function_events 	: event_function,
																		title_label 			: 'add',
																	 })
													// related icon
													var add_icon 	= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: link_related,
																		class_name 				: 'icon_bs link new_autocomplete_ts ts_object_related_icon', //ts_object_add_icon
																	 })
							break;

						default:

							// ADD . button + add element
								if(is_descriptor===true) {
								var event_function 		= [{'type':'click','name':'ts_object.add_children'}];
								if (node_type==='hierarchy_node') {
									event_function 		= [{'type':'click','name':'ts_object.add_children_from_hierarchy'}];
								}			
								var link_add 			= ts_object.create_dom_element({
																			element_type			: 'a',
																			parent 					: id_colum_content,
																			class_name 				: 'id_column_link ts_object_add',
																			custom_function_events 	: event_function,
																			title_label 			: 'add',
																		 })
														// add icon
														var add_icon = ts_object.create_dom_element({
																			element_type			: 'div',
																			parent 					: link_add,
																			class_name 				: 'ts_object_add_icon',
																		 })
								}//if(is_descriptor===true)
							
							// MOVE DRAG . button drag element
								if(is_descriptor===true) {
								var event_function 		= [{'type':'mousedown','name':'ts_object.on_drag_mousedown'}];
								var link_drag 			= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: id_colum_content,
																		class_name 				: 'id_column_link ts_object_drag',
																		custom_function_events 	: event_function,
																		title_label 			: 'drag',
																	 })
													// drag icon
													var drag_icon = ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: link_drag,
																		class_name 				: 'ts_object_drag_icon',
																	 })
								}//if(is_descriptor===true)

							// DELETE . button delete element
								var event_function 	= [{'type':'click','name':'ts_object.delete'}];
								var link_delete 	= ts_object.create_dom_element({
																		element_type			: 'a',
																		parent 					: id_colum_content,
																		class_name 				: 'id_column_link ts_object_delete',
																		custom_function_events 	: event_function,
																		title_label 			: 'delete',
																	 })
													// delete icon
													var delete_icon = ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: link_delete,
																		class_name 				: 'ts_object_delete_icon',
																	 })

							// ORDER number element
								if(is_descriptor===true && node_type!=='hierarchy_node') {								
									
									//var event_function 		= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];
									var event_function 		= [{'type':'click','name':'ts_object.build_order_form'}];
									var order_number 		= ts_object.create_dom_element({
																			element_type			: 'a',
																			parent 					: id_colum_content,
																			class_name 				: 'id_column_link ts_object_order_number',
																			custom_function_events 	: event_function,
																			//data_set 				: order_dataset,
																			//title_label 			: null,
																			text_node 				: i+1,
																		 })							
								}//if(is_descriptor===true && node_type!=='hierarchy_node')
							
							// EDIT . button edit element
								//if (node_type!=='hierarchy_node') {
								var event_function 		= [{'type':'click','name':'ts_object.edit'}];
								var link_edit 			= ts_object.create_dom_element({
																		element_type			: 'a',
																		parent 					: id_colum_content,
																		class_name 				: 'id_column_link ts_object_edit',
																		custom_function_events 	: event_function,
																		title_label 			: 'edit',
																	 })
													// section_id number
													var section_id_number = ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: link_edit,
																		class_name 				: 'ts_object_section_id_number',
																		text_node 				: ar_childrens_data[i].section_id,
																	 })
													// edit icon
													var edit_icon 	= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: link_edit,
																		class_name 				: 'ts_object_edit_icon',
																	 })
								//}//end if (node_type!=='hierarchy_node')
						
					}//end switch(ts_object.thesaurus_mode)		

			
				// LIST_THESAURUS_ELEMENTS
				// Custom elements (buttons, etc)
				for (var j = 0; j < ch_len; j++) {
				
					var class_for_all 	 = 'list_thesaurus_element';
					var children_dataset = {
						tipo 			 : ar_childrens_data[i].ar_elements[j].tipo,
						type 			 : ar_childrens_data[i].ar_elements[j].type,
						//section_tipo	 : ar_childrens_data[i].section_tipo,
						//section_id 	 : ar_childrens_data[i].section_id,
						//modo 			 : ar_childrens_data[i].modo,
						//lang 			 : ar_childrens_data[i].lang,
						}
						//console.log(ar_childrens_data[i].ar_elements[j]);

					switch(true) {

						// TERM
						case (ar_childrens_data[i].ar_elements[j].type==='term'):
							// Overwrite dataset (we need section_id and section_tipo to select when content is updated)
							children_dataset.section_tipo = ar_childrens_data[i].section_tipo
							children_dataset.section_id   = ar_childrens_data[i].section_id
							var text_node = ar_childrens_data[i].ar_elements[j].value
							switch(ts_object.thesaurus_mode) {
								case 'relation':
									var event_function 	= [];
									break;
								default:
									var event_function 	= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];
									break;
							}							
							var element 		= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: elements_container,
																		class_name 				: class_for_all,
																		data_set 				: children_dataset,
																		custom_function_events 	: event_function,
																		text_node 				: text_node,
																	 })
							if (element && ts_object.element_to_hilite) {
								if(element.dataset.section_id == ts_object.element_to_hilite.section_id && element.dataset.section_tipo===ts_object.element_to_hilite.section_tipo) {
									// Hilite element
									// element.classList.add("element_hilite");
									ts_object.hilite_element(element)
								}
								//console.log(element); console.log(ts_object.element_to_hilite); console.log(ar_childrens_data[i].section_tipo); console.log(ar_childrens_data[i].section_id);													
							}
							// Term terminoID like [ts1_52]
							var term_add = " ["+ar_childrens_data[i].section_tipo+'_'+ar_childrens_data[i].section_id+"]"
								if(SHOW_DEBUG===true && node_type!=='hierarchy_node') {
									var a = "../ts_object/trigger.ts_object.php?mode=get_childrens_data&section_tipo="+ar_childrens_data[i].section_tipo+"&section_id="+ar_childrens_data[i].section_id+"&tipo=hierarchy49"
									term_add += "  <a href=\""+a+"\" target=\"blank\"> JSON</a>";
								}
							
							var element_span	= ts_object.create_dom_element({
																		element_type			: 'span',
																		parent 					: elements_container,
																		class_name 				: 'id_info',																		
																		text_node 				: term_add,
																	 })
							break;						
						
						// ND 
						case (ar_childrens_data[i].ar_elements[j].type==='link_childrens_nd'):
							
							var event_function 	= [{'type':'click','name':'ts_object.toggle_nd'}];
							var element 		= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: elements_container,
																		class_name 				: class_for_all,
																		data_set 				: children_dataset,
																		custom_function_events 	: event_function,
																		text_node 				: ar_childrens_data[i].ar_elements[j].value,
																	 })
							break;

						// ARROW ICON
						case (ar_childrens_data[i].ar_elements[j].type==='link_childrens'):
							
							// Case link open childrens (arrow)
							var event_function	= [{'type':'click','name':'ts_object.toggle_view_childrens'}];
							var element 		= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: elements_container,
																		class_name 				: class_for_all,
																		data_set 				: children_dataset,
																		custom_function_events 	: event_function,
																	 })
							
							var class_name  = 'ts_object_childrens_arrow_icon'
								if (ar_childrens_data[i].ar_elements[j].value==='button show childrens unactive') {
									class_name += ' arrow_unactive'
								}else if (show_arrow_opened===true){
									class_name += ' ts_object_childrens_arrow_icon_open'
								}							
							var arrow_icon 		= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: element,
																		class_name 				: class_name,
																	 })
							break;
						
						// INDEXATIONS
						case (ar_childrens_data[i].ar_elements[j].tipo==='hierarchy40'):

							// Indexations Container id
							//var indexations_container_id = 'u' + ar_childrens_data[i].section_tipo + '_' + ar_childrens_data[i].section_id

							// Build button
							var event_function 	= [{'type':'click',
													'name':'ts_object.show_indexations',
													'function_arguments':[ar_childrens_data[i].section_tipo,ar_childrens_data[i].section_id,ar_childrens_data[i].ar_elements[j].tipo,indexations_container_id]}]
							var element 		= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: elements_container,
																		class_name 				: class_for_all,
																		data_set 				: children_dataset,
																		custom_function_events 	: event_function,
																		text_node 				: ar_childrens_data[i].ar_elements[j].value,
																	 })
							// Build indexactions container							
							/*var indexations_container 	= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: wrap_ts_object,
																		class_name 				: 'indexations_container',
																		id 						: indexations_container_id,
																	 })*/
							break;

						// OTHERS
						default:

							// Case common buttons and links
							var event_function 	= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];
							var element 		= ts_object.create_dom_element({
																		element_type			: 'div',
																		parent 					: elements_container,
																		class_name 				: class_for_all,
																		data_set 				: children_dataset,
																		custom_function_events 	: event_function,
																		text_node 				: ar_childrens_data[i].ar_elements[j].value,
																	 })
							break;
					
					}//end switch(true)
				}//end for (var j = 0; j < ch_len; j++)

			}//for (var i = 0; i < len; i++) {

			resolve(childrens_c);
		});

		return promise
	};//end dom_parse_childrens



	/**
	* CREATE_DOM_ELEMENT
	*/
	this.create_dom_element = function(element_options){

		var element_type			= element_options.element_type
		var parent					= element_options.parent
		var class_name				= element_options.class_name
		var data_set				= element_options.data_set
		var custom_function_events	= element_options.custom_function_events
		var title_label				= element_options.title_label
		var text_node				= element_options.text_node
		var id 						= element_options.id
		var draggable				= element_options.draggable
		
		var element = document.createElement(element_type);

		// Add id property to element
		if(id){
			element.id = id;
		}

		// A element. Add href property to element
		if(element_type === 'a'){
			element.href = 'javascript:;';
		}
		
		// Class name. Add css classes property to element
		element.className = class_name;

		// Title . Add title attribute to element
		if(title_label){
			element.title = title_label;
		}
	
		// Dataset Add dataset values to element
		if(data_set){
			for (var key in data_set) {
				element.dataset[key] = data_set[key];
			}
		}

		// Click event attached to element
		if(custom_function_events){
			var len = custom_function_events.length;					
			for (var i = 0; i < len; i++) {
				var function_name 		= custom_function_events[i].name;
				var event_type	  		= custom_function_events[i].type;
				var function_arguments	= custom_function_events[i].function_arguments;
					

				// Create event caller
				this.create_custom_events(element, event_type, function_name, function_arguments)				
			}
			/*
				//element.onclick = function () { eval(click_event) };						
				var function_name = click_event;	//'ts_object.test_name2'
				element.addEventListener("click", function(e){				
					call_custom_function(function_name,this)				
				}, false);			
				}*/
		}//end if(custom_function_events){
		
		// Text content 
		if(text_node){
			//element.appendChild(document.createTextNode(TextNode));
			// Parse html text as object
			var el = document.createElement('span')
				el.innerHTML = text_node
			element.appendChild(el);			
		}

		// Append created element to parent
		if (parent) {
			parent.appendChild(element);
		}

		// Dragable
		if(draggable){
			element.draggable = draggable;
		}

		return element;
	};//end create_dom_element



	/**
	* CREATE_CUSTOM_EVENTS
	*/
	this.create_custom_events = function(element, event_type, function_name, function_arguments){

		// If empty arguments, creates empty array
		if (typeof function_arguments==='undefined') {
			function_arguments = []
		}
		// Reserve array keys 0 and 1 to use with object and event later
		function_arguments.unshift(null)
		function_arguments.unshift(null)
					
		return element.addEventListener(event_type, function(event){

			// Oveventrride arguments key 0 with actual DOM object
			function_arguments[0] = this

			// Oveventrride arguments key 1 with actual event
			function_arguments[1] = event

			call_custom_function(function_name, function_arguments)
		}, false);
	};//end create_custom_events



	/** 
	* ON_DRAG_MOUSEDOWN
	*/
	var source = false;
	var handle = '';
	this.on_drag_mousedown = function(obj, event) {
		//console.log("comineza");
		handle = event;
		//target = event.target;

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
		obj.ondrop = null;
		
		//if (handle.contains(target)) {
		if (handle) {
			event.stopPropagation();
			//event.dataTransfer.setData('text/plain', 'handle');
			source = obj;
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/html', obj.innerHTML);
		} else {
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
	this.on_drag_end = function() {
		//console.log("acaba");
		target = false;
		//handle = '';
		source = '';
		//window.onmouseup = null;
	};//end on_drag_end



	/** 
	* ON_ORDER_DRAG_MOUSEDOWN
	*/
	var order_source = false;
	var order_handle = '';
	this.on_order_drag_mousedown = function(obj, event) {
		console.log("on_order_drag_mousedown")
		order_handle = event;		
	};//end on_order_drag_mousedown



	/**
	* ON_ORDER_DRAGSTART
	*/
	this.on_order_dragstart = function(obj, event) {
		console.log("on_order_dragstart")
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
		console.log("on_order_drag_end ");
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
	* ON_ORDER_DROP
	*/
	this.on_order_drop = function(obj, event) {	
		event.preventDefault();
		event.stopPropagation();		
	
		 console.log("on_order_drop !!!!!!!!!")
		 return;

		// Remove drag_over class
		obj.classList.remove('drag_over')

		var wrap_source 			 = source // element thats move
		var wrap_target 			 = obj 	 // element on user leaves source wrap
		var element_childrens_target = wrap_target.querySelector('.list_thesaurus_element[data-type="link_childrens"]')
		var element_childrens_source = ts_object.old_parent_wrap.querySelector('.list_thesaurus_element[data-type="link_childrens"]')	
		var childrens_container 	 = wrap_target.querySelector('[data-role="childrens_container"]')
		//var term 					 = wrap_target.querySelector('.list_thesaurus_element[data-type="term"]')

			var nodes 	= obj.childNodes
			var len 	= nodes.length
			for (var i = len - 1; i >= 0; i--) {
				if (nodes[i].dataset.role === 'childrens_container'){
					div_childrens = nodes[i]; break;
				}
			}
			//source.innerHTML = obj.innerHTML;
			//obj.innerHTML = event.dataTransfer.getData('text/html');

			if (wrap_source===wrap_target) {
				console.log("Unable self drop (2)");
				return false;
			}

			if (div_childrens) {
				// Append child
				div_childrens.appendChild(wrap_source)

				// Update parent data
				ts_object.update_parent_data(wrap_source)
						
				// Updates element_childrens_target
				ts_object.update_arrow_state(element_childrens_target, true) 			

				// Updates element_childrens_source
				ts_object.update_arrow_state(element_childrens_source, false) 		
			}

		return true;

		
		var current_css_classes = childrens_container.classList
		if(current_css_classes.contains('js_first_load')) {

			/*
			current_css_classes.remove('js_first_load');
			if (button_arrow) {
				button_arrow.firstChild.classList.add('ts_object_childrens_arrow_icon_open', 'arrow_spinner');
			}
			*/		

			// Load element by ajax
			// Note that we send 'term' instead 'button_arrow', 
			// because if current element don't have childrens, 'button_arrow' not exists
			var jsPromise = ts_object.get_childrens(button_arrow)
				//console.log(jsPromise);		
				jsPromise.then(function(response) {

						//ts_object.toggle_view_childrens(button_arrow)
						//console.log("drop");
						
						//console.log(event.dataTransfer.getData('text/html'));
						var nodes 	= obj.childNodes
						var len 	= nodes.length
						for (var i = len - 1; i >= 0; i--) {
							if (nodes[i].dataset.role === 'childrens_container'){
								div_childrens = nodes[i]; break;
							}
						}

						if (div_childrens===childrens_container) {
							console.log("Unable self drop");
							//return false;
						}
						
						//source.innerHTML = obj.innerHTML;
						//obj.innerHTML = event.dataTransfer.getData('text/html');
						if (div_childrens) {
							// Append child
							div_childrens.appendChild(wrap_source)

							// Update parent data
							ts_object.update_parent_data(wrap_source)
						}

				}, function(error) {
					console.error("Failed on_drop!", error);
				});
		}else{

			/*
			if(current_css_classes.contains('removed_from_view')) {
				current_css_classes.remove('removed_from_view')
				if (button_arrow) {
					button_arrow.firstChild.classList.add('ts_object_childrens_arrow_icon_open')
				}
			}
			*/

			var nodes 	= obj.childNodes
			var len 	= nodes.length
			for (var i = len - 1; i >= 0; i--) {
				if (nodes[i].dataset.role === 'childrens_container'){
					div_childrens = nodes[i]; break;
				}
			}
			//source.innerHTML = obj.innerHTML;
			//obj.innerHTML = event.dataTransfer.getData('text/html');

			if (div_childrens===childrens_container) {
				console.log("Unable self drop (2)");
				//return false;
			}

			if (div_childrens) {
				// Append child
				div_childrens.appendChild(wrap_source)

				// Update parent data
				ts_object.update_parent_data(wrap_source)
			}
		}
	};//end on_drop



	/**
	* ON_DRAGENTER
	* @return 
	*/
	this.on_dragenter = function(obj, event) {
		//console.log("dragenter");
		//console.log(obj.dataset.tipo);
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
		//console.log("dragleave");

		// Remove drag_over class
		obj.classList.remove('drag_over')
	};//end on_dragleave



	/**
	* ON_DROP
	*/
	this.on_drop = function(obj, event) {
		event.preventDefault();
		event.stopPropagation();		

		// Remove drag_over class
		obj.classList.remove('drag_over')

		var wrap_source 			 = source // element thats move
		var wrap_target 			 = obj 	 // element on user leaves source wrap
		var element_childrens_target = wrap_target.querySelector('.list_thesaurus_element[data-type="link_childrens"]')
		var element_childrens_source = ts_object.old_parent_wrap.querySelector('.list_thesaurus_element[data-type="link_childrens"]')	
		var childrens_container 	 = wrap_target.querySelector('[data-role="childrens_container"]')
		//var term 					 = wrap_target.querySelector('.list_thesaurus_element[data-type="term"]')

			var nodes 	= obj.children // childNodes
			var len 	= nodes.length
			for (var i = len - 1; i >= 0; i--) {
				if (nodes[i].dataset.role === 'childrens_container'){
					div_childrens = nodes[i]; break;
				}
			}
			//source.innerHTML = obj.innerHTML;
			//obj.innerHTML = event.dataTransfer.getData('text/html');

			if (wrap_source===wrap_target) {
				console.log("Unable self drop (2)");
				return false;
			}

			if (div_childrens) {
				// Append child
				div_childrens.appendChild(wrap_source)

				// Update parent data
				ts_object.update_parent_data(wrap_source)
						
				// Updates element_childrens_target
				ts_object.update_arrow_state(element_childrens_target, true) 			

				// Updates element_childrens_source
				ts_object.update_arrow_state(element_childrens_source, false) 		
			}

		return true;

		
		var current_css_classes = childrens_container.classList
		if(current_css_classes.contains('js_first_load')) {

			/*
			current_css_classes.remove('js_first_load');
			if (button_arrow) {
				button_arrow.firstChild.classList.add('ts_object_childrens_arrow_icon_open', 'arrow_spinner');
			}
			*/		

			// Load element by ajax
			// Note that we send 'term' instead 'button_arrow', 
			// because if current element don't have childrens, 'button_arrow' not exists
			var jsPromise = ts_object.get_childrens(button_arrow)
				//console.log(jsPromise);		
				jsPromise.then(function(response) {

						//ts_object.toggle_view_childrens(button_arrow)
						//console.log("drop");
						
						//console.log(event.dataTransfer.getData('text/html'));
						var nodes 	= obj.children // childNodes
						var len 	= nodes.length
						for (var i = len - 1; i >= 0; i--) {
							if (nodes[i].dataset.role === 'childrens_container'){
								div_childrens = nodes[i]; break;
							}
						}

						if (div_childrens===childrens_container) {
							console.log("Unable self drop");
							//return false;
						}
						
						//source.innerHTML = obj.innerHTML;
						//obj.innerHTML = event.dataTransfer.getData('text/html');
						if (div_childrens) {
							// Append child
							div_childrens.appendChild(wrap_source)

							// Update parent data
							ts_object.update_parent_data(wrap_source)
						}

				}, function(error) {
					console.error("Failed on_drop!", error);
				});
		}else{

			/*
			if(current_css_classes.contains('removed_from_view')) {
				current_css_classes.remove('removed_from_view')
				if (button_arrow) {
					button_arrow.firstChild.classList.add('ts_object_childrens_arrow_icon_open')
				}
			}
			*/

			var nodes 	= obj.children //childNodes
			var len 	= nodes.length
			for (var i = len - 1; i >= 0; i--) {
				if (nodes[i].dataset.role === 'childrens_container'){
					div_childrens = nodes[i]; break;
				}
			}
			//source.innerHTML = obj.innerHTML;
			//obj.innerHTML = event.dataTransfer.getData('text/html');

			if (div_childrens===childrens_container) {
				console.log("Unable self drop (2)");
				//return false;
			}

			if (div_childrens) {
				// Append child
				div_childrens.appendChild(wrap_source)

				// Update parent data
				ts_object.update_parent_data(wrap_source)
			}
		}
	};//end on_drop



	/**
	* UPDATE_PARENT_DATA
	* @return 
	*/
	this.update_parent_data = function(wrap_ts_object) {

		// Old parent wrap (previous parent)
		var old_parent_wrap = ts_object.old_parent_wrap			
			if (!old_parent_wrap) {
				return console.log("[update_parent_data] Error on find old_parent_wrap"); 
			}

		// parent wrap (current droped new parent)
		var parent_wrap = wrap_ts_object.parentNode.parentNode;
			if(!parent_wrap) {
				return console.log("[update_parent_data] Error on find parent_wrap");
			}

		// element_childrens
		var element_childrens = parent_wrap.querySelector('.list_thesaurus_element[data-type="link_childrens"]')

		// If old and new wrappers are the same, no is necessary update data
		if (old_parent_wrap===parent_wrap) {
			console.log("[update_parent_data] New target and old target elements are the same. No is necessary update data");
			return false;
		}

		//var parent_node_type_element = parent_wrap.querySelector('.list_thesaurus_element[data-node_type]')
		//var parent_node_type 		 = parent_node_type_element.dataset.node_type

		var parent_node_type 		 = parent_wrap.dataset.node_type
		/*
		var parent_node_arrow_element = parent_wrap.querySelector('.list_thesaurus_element[data-type="link_childrens"]')
		var class_list 				  = parent_node_arrow_element.firstChild.classList
			class_list.remove('arrow_unactive','arrow_spinner')
			class_list.add("ts_object_childrens_arrow_icon_open")			
		*/
		var trigger_vars = {
			'mode' 		 			  : 'update_parent_data',
			'section_id' 			  : wrap_ts_object.dataset.section_id,
			'section_tipo' 			  : wrap_ts_object.dataset.section_tipo,
			'old_parent_section_id'   : old_parent_wrap.dataset.section_id,
			'old_parent_section_tipo' : old_parent_wrap.dataset.section_tipo,
			'parent_section_id' 	  : parent_wrap.dataset.section_id,
			'parent_section_tipo' 	  : parent_wrap.dataset.section_tipo,
			'parent_node_type' 		  : parent_node_type,
			'tipo' 		  			  : element_childrens.dataset.tipo
			}
			//return console.log(trigger_vars);

		// JSON GET CALL
		ts_object.get_json(trigger_vars).then(function(response) {
			//console.log(response);
			
			// hilite moved term
			var element = wrap_ts_object.querySelector('.list_thesaurus_element[data-type="term"]')
			if (element!==null)
				ts_object.hilite_element(element)
			
			// Update source wrap in DOM 
			//var element_childrens_source = old_parent_wrap.querySelector('.list_thesaurus_element[data-type="link_childrens"]')			
				//ts_object.get_childrens(element_childrens_source)			
		})
	};//end update_parent_data



	/**
	* TOGGLE_VIEW_CHILDRENS
	* @param DOM objec
	*/
	this.toggle_view_childrens = function(link_childrens_element) {
		//var jsPromise = Promise.resolve(function(){
			
		var result = null
		
		//var wrap 	= link_childrens_element.parentNode.parentNode
		//var nodes 	= wrap.children  //childNodes

		var childrens_container = ts_object.get_my_parent_container(link_childrens_element, 'childrens_container')
		
		// If is the first time that the childrens are loaded, remove the first class selector and send the query for get the childrens
		if (childrens_container.classList.contains('js_first_load')) {

			childrens_container.classList.remove('js_first_load');
			link_childrens_element.firstChild.classList.add('ts_object_childrens_arrow_icon_open', 'arrow_spinner');
			// Load element by ajax
			var result = ts_object.get_childrens(link_childrens_element);			
			//var childrens_container = ts_object.get_my_parent_container(link_childrens_element, 'childrens_container')
			//if (childrens_container.style.display==='none') {
			//	childrens_container.style.display = 'inline-table'
			//}

			// save_opened_elements
			ts_object.save_opened_elements(link_childrens_element,'add')
			
		}else{

			//the toggle view state with the class
			if(childrens_container.classList.contains('removed_from_view')){
				childrens_container.classList.remove('removed_from_view');
				link_childrens_element.firstChild.classList.add('ts_object_childrens_arrow_icon_open');

				// save_opened_elements
				ts_object.save_opened_elements(link_childrens_element,'add')

			}else{
				childrens_container.classList.add('removed_from_view');
				link_childrens_element.firstChild.classList.remove('ts_object_childrens_arrow_icon_open');

				// save_opened_elements
				ts_object.save_opened_elements(link_childrens_element,'remove')
			}
		}			
		
			/*
				var len = nodes.length					
				for (var i = len - 1; i >= 0; i--) {
					if (nodes[i].dataset.role === 'childrens_container'){
						//node selected
						var current_css_classes = nodes[i].classList
						//if is the first time that the childrens are loaded, remove the first class selector and send the query for get the childrens
						if(current_css_classes.contains('js_first_load')){
							current_css_classes.remove('js_first_load');
							link_childrens_element.firstChild.classList.add('ts_object_childrens_arrow_icon_open', 'arrow_spinner');
							// Load element by ajax
							var result = ts_object.get_childrens(link_childrens_element);						
							//var childrens_container = ts_object.get_my_parent_container(link_childrens_element, 'childrens_container')
							//if (childrens_container.style.display==='none') {
							//	childrens_container.style.display = 'inline-table'
							//}												
							break;
						}
						//the toggle view state with the class
						if(current_css_classes.contains('removed_from_view')){
							current_css_classes.remove('removed_from_view');
							link_childrens_element.firstChild.classList.add('ts_object_childrens_arrow_icon_open');
						}else{
							current_css_classes.add('removed_from_view');
							link_childrens_element.firstChild.classList.remove('ts_object_childrens_arrow_icon_open');
						}
						break;
					}
				}
			*/
			//var childrens_container = ts_object.get_my_parent_container(link_childrens_element, 'childrens_container')
			//childrens_container.style.display = 'inline-table'

		//})
		//return jsPromise		

		return result
	};//end toggle_view_childrens



	/**
	* SAVE_OPENED_ELEMENTS
	* @return 
	*/
	this.opened_elements = {}
	this.save_opened_elements = function(link_childrens_element, action) {

		if(SHOW_DEBUG!==true) {
			return false;
		}
		
		//console.log(link_childrens_element);

		var wrap 		= link_childrens_element.parentNode.parentNode
		//var parent_node = wrap.parentNode.parentNode
		//var parent  	= parent_node.dataset.section_tipo +'_'+ parent_node.dataset.section_id
		var key 		= wrap.dataset.section_tipo +'_'+ wrap.dataset.section_id


		if (action==='add') {
			
			var open_childrens_elements = wrap.getElementsByClassName('ts_object_childrens_arrow_icon_open')
			var len = open_childrens_elements.length

			for (var i = len - 1; i >= 0; i--) {
				var current_wrap 			= open_childrens_elements[i].parentNode.parentNode.parentNode
				var current_parent_node 	= current_wrap.parentNode.parentNode
				var current_parent  		= current_parent_node.dataset.section_tipo +'_'+ current_parent_node.dataset.section_id
				var current_key 			= current_wrap.dataset.section_tipo +'_'+ current_wrap.dataset.section_id

				this.opened_elements[current_key] = current_parent

			}

		}else{
			delete this.opened_elements[key]
			this.remove_children_from_opened_elements(key)
		}		
				
		//console.log(this.opened_elements);
	};//end save_opened_elements



	/**
	* REMOVE_CHILDREN_FROM_OPENED_ELEMENTS
	* @return 
	*/
	this.remove_children_from_opened_elements = function(parent_key) {

		for (var key in this.opened_elements) {
			var current_parent = this.opened_elements[key]
			if (current_parent == parent_key){
				delete this.opened_elements[key]
					console.log("Removed "+key);
				this.remove_children_from_opened_elements(key)
			}
		}		
		
	};//end remove_children_from_opened_elements


	
	/**
	* HILITE_ELEMENT
	* section_tipo, section_id
	* element.dataset.section_tipo, lement.dataset.section_id
	* @param dom object element
	* @return int len
	*/
	this.hilite_element = function( element, clean_others ) {
		
		// Locate all term elements
		// var type 	= 'term'; // [data-type="'+type+'"]
		// var matches = document.querySelectorAll('.list_thesaurus_element[data-section_tipo="'+section_tipo+'"][data-section_id="'+section_id+'"]');
		
		if (typeof clean_others==='undefined') {
			clean_others = true
		}
		//console.log(clean_others);

		// Remove current hilite elements
		if(clean_others!==false) {
			this.reset_hilites()			
		}		
		
		// Hilite only current element
		// element.classList.add("element_hilite");

		// Hilite all apperances of current component (can appears more than once)
		var matches = document.querySelectorAll('.list_thesaurus_element[data-type="'+element.dataset.type+'"][data-section_tipo="'+element.dataset.section_tipo+'"][data-section_id="'+element.dataset.section_id+'"]');
		var len = matches.length;
		for (var i = len - 1; i >= 0; i--) {		
			matches[i].classList.add("element_hilite");
		}

		return len
	};//end hilite_element



	/**
	* RESET_HILITES
	* Removes css class element_hilite from all elemens
	*/
	this.reset_hilites = function() {
		var matches = document.querySelectorAll('.element_hilite');
		var len 	= matches.length;
		for (var i = len - 1; i >= 0; i--) {
			matches[i].classList.remove("element_hilite");
		}
	};//end reset_hilites



	/**
	* REFRESH_ELEMENT
	* Reload selected element/s wrap in DOM 
	*/
	this.refresh_element = function( section_tipo, section_id ) {

		// Locate all term elements
		var type 	= 'term';
		var matches = document.querySelectorAll('.list_thesaurus_element[data-type="'+type+'"][data-section_tipo="'+section_tipo+'"][data-section_id="'+section_id+'"]');
		var len 	= matches.length;
			if (len===0) {
				console.log("[refresh_element] Error on match elements. Not terms found for section_tipo:"+section_tipo+", section_id:"+section_id+", type:"+type);
			}
		for (var i = len - 1; i >= 0; i--) {

			// element to hilite
			var term =  matches[i]
				//term.classList.add("arrow_spinner");
				ts_object.element_to_hilite = {'section_tipo' : section_tipo, 'section_id' : section_id}

			var parent_wrap 	  = matches[i].parentNode.parentNode.parentNode.parentNode
			var element_childrens = parent_wrap.querySelector('.list_thesaurus_element[data-type="link_childrens"]');			
				if(element_childrens) {					
					
					ts_object.get_childrens( element_childrens ).then(function(response) {
						var arrow_div = element_childrens.querySelector('.ts_object_childrens_arrow_icon')
						if (arrow_div && arrow_div.classList.contains('ts_object_childrens_arrow_icon_open')===false) {
							// Reopen arrow childrens
							//ts_object.toggle_view_childrens(element_childrens)
						}
					})
					
				}else{
					if (SHOW_DEBUG===true) {
						console.log(new Error().stack);
					}
					console.log("[refresh_element] Error on find element_childrens for section_tipo:"+section_tipo+", section_id:"+section_id+", type:"+type);
				}
				//console.log(element_childrens);
		}

		return len;
	};//end refresh_element



	/**
	* EDIT
	* section_id is optional. If not get, the function uses button_obj dataset section_id
	*/
	var edit_window = null; // Global var
	this.edit = function(button_obj, event, section_id, section_tipo) {

		var wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[edit] Error on find wrap");
			}
		
		var section_tipo 		= section_tipo || wrap.dataset.section_tipo
		var section_id 			= section_id || wrap.dataset.section_id
		var url 				= DEDALO_LIB_BASE_URL + '/main/?t='+section_tipo+'&id='+section_id+'&menu=no'
		var strWindowFeatures 	= "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
			//strWindowFeatures 	= null
			//console.log(url);	

		if(edit_window === null || edit_window.closed) { //  || edit_window.location.href!=url
	
			edit_window = window.open(
				url,
				"edit_window",
				strWindowFeatures
			);
			edit_window.addEventListener("beforeunload", function(e){
				// Refresh element after close edit window
				console.log("Edit window is closed for record "+section_id +". Calling refresh_element section_tipo:"+section_tipo+" section_id:"+section_id);
				ts_object.refresh_element(section_tipo, section_id)

			}, false);	
		}else{
			edit_window.focus();
		}
	};//end edit



	/**
	* ADD_CHILDREN
	* @param object button_obj
	*/
	this.add_children = function(button_obj) {

		var wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[add_children] Error on find wrap");
			}
		var children_element = wrap.querySelector('.list_thesaurus_element[data-type="link_childrens"]')
			if(!children_element) {
				return console.log("[add_children] Error on find children_element 'link_childrens'");
			}			
		var tipo = children_element.dataset.tipo
			if (!tipo) {
				return console.log("[add_children] Error on find tipo on children_element 'link_childrens'");
			}
		
		var trigger_vars = {
			'mode' 		 	: 'add_children',
			'section_id' 	: wrap.dataset.section_id,
			'section_tipo' 	: wrap.dataset.section_tipo,
			'node_type' 	: wrap.dataset.node_type || null,
			'tipo' 			: tipo
			}
			if(SHOW_DEBUG===true) console.log(trigger_vars);

		// JSON GET CALL
		// Response is int new created section id
		ts_object.get_json(trigger_vars).then(function(response) {
				//console.log(response)
				
				// Refresh childrens container 
				var update_childrens_promise = ts_object.get_childrens(children_element)

					// On childrens refresh is done, trigger edit button
					update_childrens_promise.then(function() {
						console.log("[add_children] update_childrens_promise done");
						//console.log(response);
						// Open edit window
						var new_section_id = response
						ts_object.edit(button_obj, null, new_section_id, wrap.dataset.section_tipo)
					})

			}, function(error) {
				console.error("Failed get_json!", error);
			});
	};//end add_children


	
	/**
	* ADD_CHILDREN_FROM_HIERARCHY
	* @return 
	*/
	this.add_children_from_hierarchy = function(button_obj) {
		
		var wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[add_children_from_hierarchy] Error on find wrap");
			}
		var children_element = wrap.querySelector('.list_thesaurus_element[data-type="link_childrens"]')
			if(!children_element) {
				return console.log("[add_children_from_hierarchy] Error on find children_element 'link_childrens'");
			}			
		var tipo = children_element.dataset.tipo
			if (!tipo) {
				return console.log("[add_children_from_hierarchy] Error on find tipo on children_element 'link_childrens'");
			}

			if (typeof wrap.dataset.target_section_tipo === 'undefined') {
				alert("Please, define a target_section_tipo in current hierarchy before add terms")
				return console.log("[add_children_from_hierarchy] Error on find target_section_tipo dataset on wrap");
			}
		
		var trigger_vars = {
			'mode' 		 			: 'add_children_from_hierarchy',
			'section_id' 			: wrap.dataset.section_id,
			'section_tipo' 			: wrap.dataset.section_tipo,
			'node_type' 			: wrap.dataset.node_type || null,
			'target_section_tipo' 	: wrap.dataset.target_section_tipo,
			'tipo' 					: tipo
			}
			if(SHOW_DEBUG===true) console.log(trigger_vars);

		// JSON GET CALL
		ts_object.get_json(trigger_vars).then(function(response) {
				console.log(response);
				
				// Refresh childrens container 
				var update_childrens_promise = ts_object.get_childrens(children_element)

					// On childrens refresh is done, trigger edit button
					update_childrens_promise.then(function() {
						console.log("[add_children_from_hierarchy] update_childrens_promise done.");
						//console.log(response);

						// Open edit window
						var new_section_id = response
						ts_object.edit(button_obj, null, new_section_id, wrap.dataset.target_section_tipo)
					})

			}, function(error) {
				console.error("Failed get_json!", error);
			});
	};//end add_children_from_hierarchy	
	


	/**
	* DELETE
	*/
	this.delete = function(button_obj) {

		if (!confirm("You are sure to delete current element?")) return false;

		var wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[delete] Error on find wrap");
			}

		// Get all wrap_ts_object wraps whit this section_tipo, section_id
		// Find wrap of wrap and inside, button list_thesaurus_element
		var ar_wrap_ts_object = document.querySelectorAll('.wrap_ts_object[data-section_id="'+wrap.dataset.section_id+'"][data-section_tipo="'+wrap.dataset.section_tipo+'"]')	//
		// return console.log(wrap.dataset.section_tipo); console.log(wrap.dataset.section_id); console.log(ar_wrap_ts_object);
			
		var trigger_vars = {
			'mode' 		 	: 'delete',
			'section_id' 	: wrap.dataset.section_id,
			'section_tipo' 	: wrap.dataset.section_tipo,
			'node_type' 	: wrap.dataset.node_type || null,
			}
			//return 	console.log(trigger_vars);

		// JSON GET CALL
		ts_object.get_json(trigger_vars).then(function(response) {
				//console.log(response);
				
				if (response===false) {
					alert("Sorry. You can't delete a element with childrens. Please, remove all childrens before delete.")
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
				// Refresh childrens container 
				var update_childrens_promise = ts_object.get_childrens(button_obj).then(function() {	
						// On childrens refresh is done, trigger edit button						
						console.log("update_childrens_promise done");
					})
				*/
			}, function(error) {
				console.error("Failed get_json!", error);
			});
	};//end delete


	
	/**
	* SHOW_component_editor
	* Open component editor bellow ts_object elements to edit current data
	*/
	this.show_component_editor = function(button_obj, html_data, role, callback) {

		// Locate current ts_object container
		// var wrap_ts_object = find_ancestor(button_obj, 'wrap_ts_object')
		var wrap_ts_object = button_obj.parentNode.parentNode;
			//console.log(wrap_ts_object);

		// Locate data_container
		// var data_container = wrap_ts_object.getElementsByClassName('data_container')[0]
		var nodes = wrap_ts_object.children //childNodes
		for (var i = nodes.length - 1; i >= 0; i--) {
			if (nodes[i].dataset.role === 'data_container'){
				var data_container = nodes[i];
				break;
			}
		}
		//console.log(data_container);
		if (typeof data_container==='undefined' ) {
			console.log("Error on locate data_container div");
			return false;
		}
		//data_container.style.minHeight = "42px"; // avoid flash on load elements			

		// Locate current element_data_div 
		// var element_data_div = data_container.querySelectorAll('[data-role="'+role+'"]')[0]
		var element_data_div = data_container.querySelector('[data-role="'+role+'"]')
			//console.log(element_data_div);

		if (element_data_div) {
			//console.log("Founded!!");

			if (element_data_div.style.display==='none') {
				// Hide all
				var all_element_data_div = data_container.children //childNodes; 
				var len = all_element_data_div.length
					for (var i = len - 1; i >= 0; i--) {
						all_element_data_div[i].style.display = 'none'
					}					
				// Show current
				element_data_div.style.display='table-cell'
			}else{
				element_data_div.style.display='none'
			}

		}else{
			//console.log("Not found");

			data_container.classList.add("loading_list_thesaurus_data")	

			element_data_div 			  = document.createElement("div");
			element_data_div.dataset.role = role;	//'related_terms'
			element_data_div.style.display='table-cell'

			// Hide all
			var all_element_data_div = data_container.children  //childNodes;
			var len = all_element_data_div.length;
				for (var i = len - 1; i >= 0; i--) {
					all_element_data_div[i].style.display = 'none'
				}

			// Callback optional
			if (callback && typeof(callback) === "function") {			

				// Exec callback
				var jsPromise = callback();

					jsPromise.then(function(response) {
						//console.log(response);

						// Parse html text as object
						var el = document.createElement('div')
						el.innerHTML = response

						// Pure javascript option (replace content and exec javascript code inside)
						insertAndExecute(element_data_div, el)

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
				var el = document.createElement('div')
				el.innerHTML = html_data

				// Pure javascript option (replace content and exec javascript code inside)
				insertAndExecute(element_data_div, el)

				// Add element to DOM
				data_container.appendChild(element_data_div);

				// Focus first input element
				ts_object.select_first_input_in_editor(element_data_div)

			}//end if (callback && typeof(callback) === "function")
			
		}//end if (element_data_div)
	};//end show_component_editor



	/**
	* SELECT_FIRST_INPUT_IN_EDITOR
	*/
	this.select_first_input_in_editor = function(element_data_div) {
		//console.log(element); return;

		// Focus first input element
		var first_input = element_data_div.querySelector('input')
			if (first_input) {

				// Select all content
				first_input.select()

				// Hide editor on change value
				first_input.addEventListener("change", function(e){	
					//ts_object.refresh_element(section_tipo, section_id)
					element_data_div.style.display = 'none'				
				}, false);
						
			}
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
	this.show_component_in_ts_object = function(button_obj) {

		var wrap 	  	= button_obj.parentNode.parentNode
		var section_tipo= wrap.dataset.section_tipo
		var section_id 	= wrap.dataset.section_id
		var tipo 		= button_obj.dataset.tipo
		var modo 		= 'edit'
		var lang 		= page_globals.dedalo_data_lang
		var html_data 	= '...';	//" show_component_in_ts_object here! "
		var role 	  	= 'component_input_text' + '_' + section_tipo + '_' + section_id + '_' + tipo

		ts_object.show_component_editor(button_obj, html_data, role, function(){

			var my_data = {
				"mode" 			: 'load_component_by_ajax',
				"section_tipo"  : section_tipo,
				"parent"  		: section_id,
				"tipo"  		: tipo,
				"modo"  		: modo,
				"lang"  		: lang
			}
			//return console.log(my_data);

			var jsPromise = Promise.resolve(
				$.ajax({
					url 	: component_common.url_trigger,
					type 	: 'POST',
					data 	: my_data,
				})
				.done(function( received_data ) {
					return received_data
				})
				.fail(function() {
					console.log("show_component_in_ts_object ajax error (fail)")
				})
				.always(function() {
					
				})
			)//end promise	

			return jsPromise
		})//end ts_object.show_component_editor		
	};//end show_component_in_ts_object



	/**
	* SHOW_INDEXATIONS : Carga el listado de fragmentos indexados 
	*/
	this.show_indexations = function(button_obj, event, section_tipo, section_id, component_tipo, container_id) {
		//console.log(button_obj); console.log(event); console.log(section_tipo); console.log(section_id);  //return;

		var target_div  = document.getElementById(container_id);
			if (!target_div) {
				return alert('show_indexations. Target div not exist for terminoID: '+terminoID+' !');
			}
	
		if(target_div.offsetHeight>0) {
			// si está visible, la ocultamos			
			target_div.style.display = 'none'
			return
		}else{

			target_div.innerHTML = "<div><span class=\"blink\">Loading indexations. Please wait..</span> <span class=\"css_spinner\"></span></div>"
			target_div.style.display = 'inline-table'
	
			// si no está visible, hacemos la búsqueda y cargamos los datos	
			var trigger_vars = {
				mode	 		: 'show_indexations',
				section_tipo 	: section_tipo,
				section_id 		: section_id,
				component_tipo 	: component_tipo
				}
				//return 	console.log(trigger_vars);

			// JSON GET CALL
			ts_object.get_json(trigger_vars).then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log(response);
					}
					
					target_div.innerHTML 	 = response.result
					target_div.style.display = 'inline-table'
					
				}, function(error) {
					console.error("Failed get_json!", error);
				});

			/*		
			var mydata	= { 'accion' 	: 'show_indexations',
							'terminoID' : terminoID,
							'top_tipo' 	: page_globals.top_tipo,
							'top_id' 	: page_globals.top_id
						};
						//console.log(mydata); return;
			
			target_div.innerHTML 	 = '<div class="indexations_spinner"><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /> Loading '+nIndexaciones+' indexations of '+termino+' ... </div>';
			target_div.style.display = visible_display_mode
			
			// AJAX CALL
			$.ajax({
				url			: DEDALO_LIB_BASE_URL + '/ts/trigger.Tesauro.php',
				data		: mydata,
				type		: "POST"
			})
			.done(function(received_data) {
				
				target_div.style.display = 'none'
				target_div.innerHTML = received_data				
				//target_div.slideDown(300);
				target_div.style.display = visible_display_mode
			})
			.fail( function(jqXHR, textStatus) {					
				alert("Error on show_indexations");
				//top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " [id_matrix] " + id_matrix + "</span>" + textStatus );
			})
			.always(function() {				
				//html_page.loading_content( target_obj, 0 );
			});//fin $.ajax			
			*/
		}//if (target_div.style.display == visible_display_mode)			
	};//end if (target_div.css( 'display') == visible_display_mode)



	/**
	* LINK_TERM
	* Add link to opener window for autocomplete_hi relations
	*/
	this.link_term = function(button_obj) {
		//console.log(window.parent);

		var source_window = window.opener || window.parent
			if (source_window===null) {
				return console.log("[link_term] Error on find window.opener / parent")
			}

		var wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[link_term] Error on find wrap")
			}

		// Component name is set fron url and sources from button dataset.component_name
		var component_name = ts_object.component_name
			if(typeof component_name==="undefined" || component_name==="undefined") {
				if(SHOW_DEBUG===true) {
					console.log(ts_object)
				}
				return console.log("[link_term] Error on find component_name")
			}			

		var label = wrap.querySelector('.list_thesaurus_element[data-type="term"]').firstChild.innerHTML
			
		var response = source_window[component_name].link_term(wrap.dataset.section_id, wrap.dataset.section_tipo, label)
			if(SHOW_DEBUG===true) {
				//console.log(response);
			}			

		return response
	};//end link_term



	/**
	* GET_JSON
	* XMLHttpRequest to trigger
	* @return Promise
	*/
	this.get_json = function(trigger_vars) {
		
		var	url = this.trigger_url;	//?mode=get_childrens_data';

		// Return a promise of XMLHttpRequest
		return common.get_json_data(url, trigger_vars)
	};//end get_json


	
	/**
	* PARSER_SEARCH_RESULT
	* @return 
	*/
	var ar_resolved = []
	var current_main_div = null;
	this.parse_search_result = function( data, main_div, is_recursion ) {
		
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
				                    "type": "link_childrens",
				                    "tipo": "hierarchy45",
				                    "value": "button show childrens"
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
				                    "type": "link_childrens",
				                    "tipo": "hierarchy49",
				                    "value": "button show childrens"
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
				                    "type": "link_childrens",
				                    "tipo": "hierarchy49",
				                    "value": "button show childrens"
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
				                    "type": "link_childrens",
				                    "tipo": "hierarchy49",
				                    "value": "button show childrens"
				                }
				            ]
				        }
				    ]
				]
		*/
		if(is_recursion===false) {
			ar_resolved = [] // reset array
			if(SHOW_DEBUG===true) {
				console.log(data);
			}
		}

		// iterate data object
		for (var key in data) {
			
			if (ar_resolved.indexOf(key) !== -1) {
				console.log("Skipped resolved key "+key);
				continue;
			}

			if(is_recursion===false) {
				// Calculate main div of each root element
				// Search childrens place
				main_div = document.querySelector('.hierarchy_root_node[data-section_id="'+data[key].section_id+'"] > .childrens_container')
				
				// Clean previous nodes from root
				if(!main_div) {
					console.log("Error on locate:  "+'.hierarchy_root_node[data-section_id="'+data[key].section_id+'"] > .childrens_container')
				}else{
					// Clean main div
					while (main_div.firstChild) {
					    main_div.removeChild(main_div.firstChild);
					}
				}
											
			}

			var element = data[key]
			var ar_childrens_data = []
				ar_childrens_data.push(element)
				//console.log(ar_childrens_data);

			var options = {
				clean_childrens_container 		: false, // Elements are added to existing main_div instead replace
				childrens_container_is_loaded 	: false,	 // Set childrens container as loaded
				show_arrow_opened 				: false,	 // Set icon arrow as opened
			}			
			if(!main_div) {
					console.log(ar_childrens_data);
			}
			var promise = ts_object.dom_parse_childrens(ar_childrens_data, main_div, options)
				/*
				.then(function(result) {
					//console.log(element.heritage);
					if (typeof element.heritage!=='undefined') {
						var h_data = element.heritage
						ts_object.parse_search_result(h_data, result)

						//var childrens_element = result.parentNode.querySelector('.elements_container > [data-type="link_childrens"]')
						//ts_object.update_arrow_state(childrens_element, true)
						
						console.log("parse_search_result case "+key);
					}else{
						console.log("else case "+key);
						//ts_object.dom_parse_childrens(ar_childrens_data, main_div, false)
					}
				})
				*/

			// Recursion when heritage is present
			// Note var current_main_div if set on each dom_parse_childrens call
			if (typeof element.heritage!=='undefined') {
				
				// Recursive parent element
				var h_data = element.heritage
				ts_object.parse_search_result(h_data, current_main_div, true)
				
			}else{

				// Last elements are the final found elements and must be hilite
				var element = current_main_div.parentNode.querySelector('.elements_container > [data-type="term"]')			
				ts_object.hilite_element(element, false)
							
			}			

			// Open arrows and fix childrens container state
			/*
			main_div.classList.remove('js_first_load')
			var childrens_element = main_div.parentNode.querySelector('.elements_container > [data-type="link_childrens"]')
			if (childrens_element.firstChild) {
				childrens_element.firstChild.classList.add('ts_object_childrens_arrow_icon_open')
				//console.log(childrens_element);
			}
			*/			

			ar_resolved.push(key)
		}//end for (var key in data)
		
		return true
	};//end parser_search_result



	/**
	* BUILD_ORDER_FORM
	* @return 
	*/
	this.build_order_form = function(button_obj, evt) {

		// Remove previous inputs
		var order_inputs = document.querySelectorAll('input.input_order')
		var len = order_inputs.length
		for (var i = order_inputs.length - 1; i >= 0; i--) {
			order_inputs[i].remove()
		}

		var old_value = parseInt(button_obj.textContent)

		var input = document.createElement('input')
			input.classList.add('id_column_link','input_order')
			input.value = old_value
			input.addEventListener("keyup", function(e){		
				e.preventDefault()
				//console.log(e.keyCode)
				if (e.keyCode === 13) {
				   //console.log(this.value)
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
	};//end build_order_form



	/**
	* SAVE_ORDER
	* @return 
	*/
	this.save_order = function(button_obj, new_value) {

		var old_value = parseInt(button_obj.textContent)
			//console.log("old_value: "+old_value+" - new_value: "+new_value)

		if (new_value===old_value) {
			if(SHOW_DEBUG===true) console.log("Value is not changed. ignored save_order action")
			return false
		}

		var element_wrap 		 = button_obj.parentNode.parentNode	
		var element_section_tipo = element_wrap.dataset.section_tipo
		var element_section_id 	 = element_wrap.dataset.section_id	
		
		var childrens 			 = button_obj.parentNode.parentNode.parentNode.querySelectorAll('.wrap_ts_object')
		var wrap 				 = button_obj.parentNode.parentNode.parentNode.parentNode;
		var link_childrens 		 = wrap.querySelector('[data-type="link_childrens"]')

		var ar_locators = []
		var len 		= childrens.length

		// Avoid set invalid values
		if (new_value>len){
			new_value = len // max value is array length
		}else if (new_value<1) {
			new_value = 1;    // min value is 1
		}		

		// Iterate elements
		for (var i = 0; i < len; i++) {
		
			var element = childrens[i]
			//console.log(element)

			var locator = {
				section_tipo : element.dataset.section_tipo,
				section_id 	 : element.dataset.section_id,
			}
			ar_locators.push( locator )
		}
		
		// Sort array with new keys
		ar_locators.move( parseInt(old_value)-1, parseInt(new_value)-1 )
		
		var trigger_vars = {
			mode 		 	: 'save_order',
			section_id 		: wrap.dataset.section_id,
			section_tipo 	: wrap.dataset.section_tipo,
			component_tipo 	: link_childrens.dataset.tipo,
			ar_locators		: JSON.stringify(ar_locators)
			}
			//if(SHOW_DEBUG===true) console.log(trigger_vars); return;

		// JSON GET CALL
		// Response is int new created section id
		ts_object.get_json(trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response)

			if (response.result && response.result!==false) {
				// Refresh element
				ts_object.refresh_element( element_section_tipo, element_section_id )
			}else{
				alert("Error on save order. "+ ts_object.msg )
			}			

		}, function(error) {
			console.error("Failed get_json!", error);
		});
	};//end save_order



	/**
	* TOGGLE_ND
	* @return 
	*/
	this.toggle_nd = function(button_obj) {

		var nd_container 			= ts_object.get_my_parent_container(button_obj, 'nd_container')
		var childrens_container 	= ts_object.get_my_parent_container(button_obj, 'childrens_container')
		var link_childrens_element 	= button_obj.parentNode.querySelector('[data-type="link_childrens"]')
			//console.log(nd_container.style.display);
		
		//console.log(nd_container.style.display);
		if (!nd_container.style.display || nd_container.style.display==='none') {
						
			// Load all childrens and hide descriptors
			// Load element by ajax
			ts_object.get_childrens(button_obj).then(function(response) {
								
				// Show hidden nd_container
				nd_container.style.display = 'inline-table'				

				// When not already opened childrens, hide it (all childrens descriptors and not are loaded together)
				var icon_arrow = link_childrens_element.firstChild 
				if (icon_arrow.classList.contains('ts_object_childrens_arrow_icon_open')) {
					console.log("Childrens are already loaded before");
				}else{
					// Childrens are NOT loaded before. Set as not loaded and hide
					childrens_container.classList.remove('js_first_load') // Set as already loaded
					childrens_container.classList.add('removed_from_view')	// Set as hidden				
					icon_arrow.classList.remove('ts_object_childrens_arrow_icon_open') // Allways remove state 'open' from arrow
				}				
			})
		
		}else{

			// Hide showed nd_container
			nd_container.style.display = 'none'
			//console.log("ocultado!!!");
		}		
	};//end toggle_nd



	/**
	* GET_MY_PARENT_CONTAINER
	* Returns current element (list_thesaurus_element) container of type inside his ts_element
	* @return object | null
	*/
	this.get_my_parent_container = function( button_obj, role ) {

		var parent_container = null

		var wrapper = button_obj.parentNode.parentNode 
			if (wrapper.dataset.node_type!=='thesaurus_node') {
				console.log("Error on get thesaurus_node wrapper !!!");
				return parent_container;
			}

		var wrapper_childrens 	  = wrapper.children
		var wrapper_childrens_len = wrapper_childrens.length
		for (var i = wrapper_childrens_len - 1; i >= 0; i--) {
			if (wrapper_childrens[i].dataset.role===role) {
				parent_container = wrapper_childrens[i];
				break
			}
		}

		return parent_container
	};//end get_my_parent_container


	


}//end ts_object