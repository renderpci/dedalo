/**
* COMPONENT PORTAL CLASS
*
*
*
*/
var component_portal = new function() {

	'use strict';

	this.portal_objects 		 = []
	this.url_trigger 			 = DEDALO_LIB_BASE_URL + '/component_portal/trigger.component_portal.php'
	this.save_arguments 		 = {} // End save_arguments
	// Fixed when user click on delete icon (open_delete_dialog)
	this.delete_obj 			 = null;
	this.delete_dialog_portal_id = "delete_dialog_portal"

	// Active button obj
	this.active_delete_button_obj = null

	// Component instace fixed vars
	// Unic identificator for curretncomponent
	this.uid = null
	


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		const self = this

		// DOM ready
		//$(function() 
		window.ready(function(){

			switch(page_globals.modo) {
				case 'tool_time_machine' :
					self.hide_buttons_and_tr_edit_content();
					break;
				case 'tool_lang' :
					break;
				case 'edit' :
					break;
			}		
		});//end $(function()

		// Fix instance vars
		self.uid = options.uid
		

		// $init_options->id_wrapper 		= $id_wrapper;
		// $init_options->uid 				= $identificador_unico;
		// $init_options->context 			= $context;
		// $init_options->permissions 		= $permissions;

		const wrapper = document.getElementById(options.id_wrapper)
			if (!wrapper) {
				alert("[component_portal.init] Error on get component wrap")
				return false;
			}
		
		if(SHOW_DEBUG===true) {
			//console.log("[component_portal.init] options:",options);
		}
		
		self.render_html(wrapper, options.dato, true)
		
		return true
	};//end init



	/**
	* BUILD_DELETE_DIALOG
	* @return DOM object modal_dialog
	*/
	this.build_delete_dialog = function(options) {

		const header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			const h4 = document.createElement("h4")
				h4.classList.add('modal-title')
			let	t = document.createTextNode(get_label.esta_seguro_de_borrar_este_registro)
				// Add
				h4.appendChild(t)
				header.appendChild(h4)

		const body = document.createElement("div")
		let body_content = document.createTextNode("Loading..")
			if (typeof options.body!="undefined") {
				body_content = options.body
			}
			// add
			body.appendChild(body_content)
			

		const footer = document.createElement("div")

			// <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
			const button_cancel = document.createElement("button")
				button_cancel.classList.add("btn","btn-default")
				button_cancel.dataset.dismiss = "modal"
				t = document.createTextNode(get_label.cancelar)
				// add
				button_cancel.appendChild(t)
				// add
				footer.appendChild(button_cancel)

			// <button type="button" class="btn btn-primary">Save changes</button>
			const button_delete_data = document.createElement("button")
				button_delete_data.classList.add("btn","btn-warning")
				button_delete_data.dataset.dismiss = "modal"
				t = document.createTextNode(get_label.borrar_solo_el_vinculo)
				// add
				button_delete_data.appendChild(t)
				button_delete_data.addEventListener("click", function (e) {
					//div_note_wrapper.parentNode.removeChild(div_note_wrapper)					
					component_portal.remove_element(component_portal.delete_obj,'delete_link')
				})
				// add
				footer.appendChild(button_delete_data)

			// <button type="button" class="btn btn-primary">Save changes</button>
			if (options.permission_target_section_delete >=2 ) {
			const button_delete_record = document.createElement("button")
				button_delete_record.classList.add("btn","btn-danger")
				button_delete_record.dataset.dismiss = "modal"
				t = document.createTextNode(get_label.borrar_el_recurso)
				// add
				button_delete_record.appendChild(t)
				button_delete_record.addEventListener("click", function (e) {
					//div_note_wrapper.parentNode.removeChild(div_note_wrapper)
					component_portal.remove_element(component_portal.delete_obj,'delete_all')
				})
				// add
				footer.appendChild(button_delete_record)
			}	


		// modal dialog
		const modal_dialog = common.build_modal_dialog({
			id 		: options.delete_dialog_portal_id,
			header 	: header,
			body 	: body,
			footer 	: footer
		})
		

		return modal_dialog
	};//end build_delete_dialog



	/**
	* OPEN_DELETE_DIALOG
	* @param object button_obj
	*/
	this.open_delete_dialog = function(button_obj) {

		// Fix selected button as selected
		component_portal.delete_obj = button_obj

		// Get portal name
		// From component wrapper
		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) //console.log(button_obj);
				return alert("component_portal:open_delete_dialog: Sorry: portal wrap_div dom element not found")
			}
		const label = wrap_div.querySelector("label.css_label").textContent || null


		// Add dialog id info to dialog body
		const rel_locator = JSON.parse(button_obj.dataset.rel_locator)
		let ref_id = rel_locator.section_id
		if (typeof rel_locator.tag_id!=="undefined") {
			ref_id += "-"+rel_locator.tag_id
		}

		const body_content = document.createElement("div")
			body_content.innerHTML = label + ". " + get_label.registro + " ID: " + ref_id

		const delete_dialog = this.build_delete_dialog({
			delete_dialog_portal_id 		 : this.delete_dialog_portal_id,
			body 							 : body_content,
			permission_target_section_delete : button_obj.dataset.permission_target_section_delete
		})
		
		// Open dialog
		$(delete_dialog).modal({
			show 	  : true,
			keyboard  : true,
			cssClass  : 'modal_big'
		}).on('shown.bs.modal', function (e) {

		}).on('hidden.bs.modal', function (e) {
			// Removes modal element from DOM on close
			this.remove()
		})


		return true		
	};//end open_delete_dialog



	/**
	* ACTIVE_PORTAL_TABLE_SORTABLE : Sort records 
	*/
	this.receive_instance = null
	this.active_portal_table_sortable = function(table_id, dragable_connectWith) {

		const self = this
	
		// console.log("dragable_connectWith: "+dragable_connectWith);
		// Helper functions
		/*
		var fixHelperModified = function(e, tr) {
			var $originals = tr.children()
			var $helper = tr.clone()
			$helper.children().each(function(index) {
					$(this).width($originals.eq(index).width())
				});
			return $helper
			}
		var updateIndex = function(e, ui) {
				$('td.index', ui.item.parent()).each(function (i) {
					$(this).html(i + 1)
				});
			}
		var draggin_start = function(event, ui) {
				var current_item = ui.item
				// console.log(ui.item[0])
			}
		*/

		const table = document.getElementById(table_id)
		if (!table) {
			return false
		}
		const base_element 	= table.querySelector('.rows_wrapper')

		// Store instance table_object
		self.table_object = base_element
		
		// Store last sortable_action executed
		self.sortable_action = null
		
		// Table sortable
		$(base_element).sortable({
			cancel : "a,button,input,select",
			cursor : "move",
			//axis : 'y',	
			//delay : 150,	
			//containment : '#'+table_id, // Constrain moviment inside table body (parent)
			//start : 	draggin_start,
			//helper : fixHelperModified,
			activate : function(event, ui) {
			},
			receive : function(event, ui) {
				if(SHOW_DEBUG===true) {
					//console.log("[component_portal] Event: receive "+self.uid); //return
				}
				self.sortable_action = "receive"
				// Store self component instance to call it later (on remove)
				component_portal.receive_instance = self

				// Target wrapper update after finish
				//let wrapper = component_common.get_wrapper_from_element(event.target)
				//if (wrapper && parseInt(wrapper.dataset.n_rows)<=1) {
				//	console.log("++ receive wrapper.dataset.n_row:",wrapper.dataset.n_rows, wrapper.id)
				//	component_common.load_component_by_wrapper_id(wrapper.id)
				//}
			},
			remove : function(event, ui) {
				if(SHOW_DEBUG===true) {
					//console.log("[component_portal] Event: remove ",self.uid); //return
				}
				self.sortable_action = "remove"

				// SORT_REMOVE_ITEM . Item dragged from source portal is deleted here and portal is saved
				// On finish (return promise), call to previous stored component instance to add item after remove
				// This is the correct sequence order to save (remove,receive) but jquery call is inverse...
				self.sort_remove_item(ui.item[0], event).then(function(){

					// Source wrapper update after finish
					const source_wrapper = component_common.get_wrapper_from_element(table)
					if (source_wrapper) {
						if (parseInt(source_wrapper.dataset.n_rows)<=1) {
							// Reload whole component to remove header
							component_common.load_component_by_wrapper_id(source_wrapper.id)
							//console.log("//// Updating source wrapper","n_rows before:",source_wrapper.dataset.n_rows);
						}else{
							// Only update wrapper dataset n_rows
							source_wrapper.dataset.n_rows = parseInt(source_wrapper.dataset.n_rows) -1;
							//console.log("//// Updating source wrapper dataset only","n_rows after:",source_wrapper.dataset.n_rows);
						}
					}

					// SORT_ADD_ITEM . Item dragged to target portal is added here and portal is saved
					self.receive_instance.sort_add_item(ui.item[0], event).then(function(e){ component_portal.receive_instance=null; })					

						// Target wrapper update after finish
						const target_wrapper = component_common.get_wrapper_from_element(ui.item[0])
						if (target_wrapper) {
							if (parseInt(target_wrapper.dataset.n_rows)<=1) {
								component_common.load_component_by_wrapper_id(target_wrapper.id)
								//console.log("//// Updating target wrapper","n_rows before:",target_wrapper.dataset.n_rows);
							}
						}
				})//end sort_remove_item
			},
			stop : function(event, ui) {
				if(SHOW_DEBUG===true) {
					//console.log("[component_portal]  Event: stop ",self.uid); //return
				}			
				// SORT_ITEMS
				if (self.sortable_action !== "remove" && self.sortable_action !== "receive") {
					self.sortable_action = "stop"			
					self.sort_items(this)
				}else{
					self.sortable_action = "stop"
				}							
			},
		}).disableSelection();		
	
		
		// Add dragable_connectWith like '"portal_table_".$propiedades->dragable_connectWith'
		if (dragable_connectWith && dragable_connectWith.length>13) {
			//console.log(table_id +" -> "+ dragable_connectWith);
			$(base_element).sortable( "option", "connectWith", '#'+dragable_connectWith+' .rows_wrapper')
		}else
		// Custom disable option
		if(dragable_connectWith==='none') {
			//console.log(table_id)
			$(base_element).sortable("disable")
		}
		
		return true
	};//end active_portal_table_sortable



	/**
	* SORT_ITEMS
	* @return promise
	*/
	this.sort_items = function(element) {

		const self = this
	
		const wrapper 	= component_common.get_wrapper_from_element(element)
		const dato		= JSON.parse(wrapper.dataset.dato)
		const dato_len	= dato.length

		const ar_elements_row 		= wrapper.querySelectorAll('.portal_element_sortable')
		const ar_elements_row_len 	= ar_elements_row.length

		// Fill final_dato from dom elements
		const final_dato = []
		for (let i = 0; i < ar_elements_row_len; i++) {
			let current_locator = JSON.parse(ar_elements_row[i].dataset.dato)
			final_dato.push( current_locator )
		}

		// Add component dato locators not already existing in final_dato (not loaded items)
		for (let i = 0; i < dato_len; i++) {
			if ( component_portal.contains_locator(dato[i], final_dato)===false ) {
				final_dato.push(dato[i])
			}
		}
		
		// Compare old and new dato to check changes
		var changed = false
		const len 	= final_dato.length
		for (let i = 0; i < len; i++) {			
			if( component_portal.is_equal_locator(final_dato[i], dato[i])===false ) {
				changed = true;	break;
			}
		}
		if (changed===false) {
			if(SHOW_DEBUG===true) {
				console.log("No changes are made in sort portal");
			}
			return false
		}

		//self.dato = final_dato
		wrapper.dataset.dato = JSON.stringify(final_dato)

		
		return self.Save(wrapper)
	};//end sort_items



	/**
	* SORT_ADD_ITEM
	* @return promise Save
	*/
	this.sort_add_item = function(item, event) {

		const self = this
	
		const wrapper 		= component_common.get_wrapper_from_element(item)

		const added_locator = JSON.parse(item.dataset.dato)
		const dato 	 		= JSON.parse(wrapper.dataset.dato) // this.dato
		const dato_len 		= dato.length

		const ar_elements_row 		= self.table_object.querySelectorAll('.portal_element_sortable')
		const ar_elements_row_len 	= ar_elements_row.length
			//console.log(ar_elements_row);
			//console.log("Add item : "+item.dataset.dato);

		// Test if item locator already exists in dato. If yes, remove and stop
		for (let i = 0; i < dato_len; i++) {
			if ( component_portal.contains_locator(added_locator, dato)===true ) {
				console.log("Stopped add and removed dragged item: "+item.dataset.dato);
				item.remove()
				return false;
			}
		}		
		
		// Fill final_dato from dom elements
		const final_dato = []
		for (let i = 0; i < ar_elements_row_len; i++) {
			let current_locator = JSON.parse(ar_elements_row[i].dataset.dato)
			final_dato.push( current_locator )
		}

		// Add component dato locators not already existing in final_dato (not loaded items)
		for (let i = 0; i < dato_len; i++) {
			if ( component_portal.contains_locator(dato[i], final_dato)===false ) {
				final_dato.push(dato[i])
			}
		}

		//this.dato = final_dato
		wrapper.dataset.dato = JSON.stringify(final_dato)
		//this.max_records++		

		return this.Save(wrapper);
	};//end sort_add_item



	/**
	* SORT_REMOVE_ITEM
	* @return promise Save
	*/
	this.sort_remove_item = function(item, event) {
	
		const self = this

		const wrapper = component_common.get_wrapper_from_element(event.target)

		const removed_locator  	= JSON.parse(item.dataset.dato)
		const dato 	 		 	= JSON.parse(wrapper.dataset.dato) //this.dato
		const dato_len 		 	= dato.length
		//console.log(dato);	console.log(removed_locator);

		// Iterate dato and add different to removed_locator elements to new array
		const final_dato = []
		for (let i = 0; i < dato_len; i++) {
			//console.log(dato[i]); 	console.log(i);
			var is_equal = component_portal.is_equal_locator( removed_locator, dato[i] )
			if ( is_equal===false ) {
				//dato.splice(i, 1);
				final_dato.push(dato[i])
			}
		}
		//this.dato = final_dato
		wrapper.dataset.dato = JSON.stringify(final_dato)
		
		return this.Save(wrapper)
	};//end sort_remove_item


	/**
	* GET_DATO
	* update 13-01-2018
	* @return array of locators 
	*/
	this.get_dato = function(wrapper_obj) {

		return false;
		/* Removed 21-08-2017
		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_iri:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const component_obj = {
			component_tipo  : wrapper_obj.dataset.tipo,
			section_tipo  	: wrapper_obj.dataset.section_tipo,
			section_id  	: wrapper_obj.dataset.parent,
			modo  			: wrapper_obj.dataset.modo,
			lang  			: wrapper_obj.dataset.lang,
		}

		return new Promise(function(resolve, reject) {
			// DB ajax Call
			const js_promise = component_common.get_component_json_data(component_obj).then(function(response){

				if (response && response.result) {

					const response_result 	= response.result
					const dato 				= response_result.dato || null
					resolve(dato);

				}else{

					// Data response is not valid
					//alert("[component_portal.render_html] Error on render portal data ");
					console.error("[component_portal.get_dato] ERROR on get dato portal data. Invalid trigger response: ",response, component_obj);
				}

			})//end js_promise then
		})
		*/
	};//end get_dato



	/**
	* SAVE
	* @return 
	*/
	this.Save = function(element) {

		const self = this
	
		let wrapper
		if (element.dataset.component_info) {
			wrapper = element
		}else{
			wrapper = component_common.get_wrapper_from_element(element)
		}		

		const tipo 		 = wrapper.dataset.tipo
		const section_id = wrapper.dataset.parent

		html_page.loading_content( wrapper, 1 );
		
		const trigger_url  = self.url_trigger
		const trigger_vars = {
				mode 		 	: 'save',
				sortable_action : self.sortable_action,
				portal_tipo 	: wrapper.dataset.tipo,
				portal_parent 	: wrapper.dataset.parent,
				section_tipo 	: wrapper.dataset.section_tipo,
				dato 			: wrapper.dataset.dato,
				top_tipo 		: page_globals.top_tipo,
			}
			//console.log("[component_portal.Save] trigger_vars", trigger_vars ); return

		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
			//console.log(response);		

			if (response && response.result) {

				// Reload component by ajax (Recommended)
				//component_common.load_component_by_wrapper_id(wrapper.id); // ,null,component_portal.active_portal_drag component_portal.active_portal_drag();wrapper_id, arguments, callback

				// Notify to inspector
				const order_change = get_label.order_change
				top.inspector.show_log_msg("<span class='ok'>"+order_change+"</span>");
			}else{
				alert("[save_order] Warning: Null value is received. Check your server log for details");
			}
			
			if (SHOW_DEBUG===true) {
				console.log("->Save ["+ tipo+" - "+section_id+"]: " + response.msg)
				console.log(response.debug)
			}

			html_page.loading_content( wrapper, 0 );
		}, function(error) {
			console.log(error);
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " save_order</span>" + error );
			html_page.loading_content( wrapper, 0 );
		})

		return js_promise
	};//end Save

	

	/**
	* IS_EQUAL_LOCATOR
	* @return bool
	*/
	this.is_equal_locator = function(a, b) {
		//	console.log(a); 	console.log(b);		
		if (a.section_tipo == b.section_tipo && a.section_id == b.section_id) {
			return true;
		}

		return false;
	};//end is_equal_locator



	/**
	* CONTAINS_LOCATOR
	* @return bool
	*/
	this.contains_locator = function(obj, list) {

		const len = list.length	
		for (var i = 0; i < len; i++) {
			if ( component_portal.is_equal_locator(obj, list[i])===true ) {
				return true			
			}
		}

	    return false;
	};//end contains_locator



	/**
	* ADD_NEW_ELEMENT
	* Create new section record and add to current portal
	*/
	this.add_new_element = function (button_obj, wrapper) {
		
		const self = this		

		const portal_tipo 			= wrapper.dataset.tipo
		const portal_parent			= wrapper.dataset.parent
		const portal_section_tipo 	= wrapper.dataset.section_tipo
		const target_section_tipo	= JSON.parse(wrapper.dataset.target_section_tipo)[0]
		const n_rows				= wrapper.dataset.n_rows
		const component_info		= JSON.parse(wrapper.dataset.component_info);
		const propiedades 			= component_info.propiedades
		const rows_limit			= propiedades.rows_limit

		// Test mandatory vars
		if (typeof target_section_tipo==='undefined' || target_section_tipo.length<3) {
			alert("[component_portal.add_new_element] Error: target_section_tipo is empty! \n Nothing is done.")	
			return false;
		}

		// rows_limit check
		if(rows_limit <= n_rows){
			const exceeded_limit = get_label.exceeded_limit
			top.inspector.show_log_msg("<span class='warning'>"+exceeded_limit+rows_limit+"</span>")
			return false;	
		}
			
		// Trigger get json data
		const trigger_url 	= component_portal.url_trigger
		const trigger_vars	= {
			mode				: 'add_new_element',
			portal_tipo		  	: portal_tipo,
			portal_parent 	  	: portal_parent,
			portal_section_tipo : portal_section_tipo,
			target_section_tipo : target_section_tipo,
			top_tipo 			: page_globals.top_tipo,
			top_id 				: page_globals.top_id || null,
			propiedades 		: propiedades
		}; //return console.log("[component_portal.add_new_element] trigger_vars",trigger_vars);

		html_page.loading_content( wrapper, 1 )

		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_portal.add_new_element] response", response);
			}

			if (response && response.result) {

				const created_record_id = parseInt(response.section_id)

				// Response new 'section_id' expected
				if ( Number.isInteger(created_record_id) && created_record_id>0 ) {
					
					// Notification msg ok
					var msg = "<span class='ok'>New portal record: " + created_record_id + "</span>";
						inspector.show_log_msg(msg);

					// Open window to edit new record created
					const element_id = 'portal_link_open_' + portal_tipo + '_' + portal_section_tipo + '_' + created_record_id
					
					// goto_last_page_promise
					const goto_last_page_promise = self.goto_last_page(button_obj, wrapper).then(function(goto_last_page_response){

						if(Promise && goto_last_page_promise) {
							//component_html_promise.then(function(build_component_html_response){
							//	resolve("Render component done");
							//})

							// Show possible hidden row_header always
							const row_header = wrapper.querySelector(".row_header")
							if (row_header && row_header.classList.contains("row_header_hide")) {
								row_header.classList.remove("row_header_hide")
							}
			
							if (typeof propiedades.portal_link_open!=="undefined" && propiedades.portal_link_open===false) {
								// Not open new window

							}else{
								// Open new window clicking new record edit record
								html_page.loading_content( wrapper, 1 );						
								const portal_link_open = document.getElementById(element_id);
								if (portal_link_open) {
									portal_link_open.click()
								}else{
									alert("[add_new_element] Error on locate element after reload component. element_id: " + element_id)
								}
							}
						}//end if(Promise && goto_last_page_promise)
					})					

				}else{
					// Warning msg
					var msg = "<span class='warning'>[component_portal.add_new_element] Warning on create add_new_element: \n" + created_record_id + "</span>. Please, reload page manually for update list" ;
						inspector.show_log_msg(msg)
						alert( msg ) // msg.innerText || msg.textContent
				}				

			}else{
				alert("[component_portal.add_new_element] Warning: Null value is received. Check your server log for details");
			}
			
			//if (SHOW_DEBUG===true) {
				//console.log("[component_portal.add_new_element]->Save ["+portal_tipo+" - "+portal_parent+"]: " +response.msg, response.debug)
			//}

			html_page.loading_content( wrapper, 0 );
		}, function(error) {
			console.log(error);
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " save_order</span>" + error );
			html_page.loading_content( wrapper, 0 );
		})
	

		return js_promise
	};//end add_new_element



	/**
	* REMOVE RESOURCE FROM PORTAL
	*/
	this.remove_element = function (button_obj, remove_mode) {
		
		// Component wrap
		const wrapper = component_common.get_wrapper_from_element(button_obj);
			if (!wrapper) return alert("Error on select component wrap");
		
		html_page.loading_content( wrapper, 1 );

		const trigger_url  = component_portal.url_trigger
		const trigger_vars = {
				mode 		   	: 'remove_element',
				remove_mode 	: remove_mode,
				tipo  			: wrapper.dataset.tipo,
				parent 			: wrapper.dataset.parent,
				section_tipo	: wrapper.dataset.section_tipo,
				locator 		: JSON.parse(button_obj.dataset.rel_locator)			
		}
		//return console.log("[component_portal.remove_element]", trigger_vars)

		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_portal.remove_element] response", response);
				//console.log("[component_portal.remove_element] response.debug:" + response.debug)
			}

			if (response && response.result) {
				
				// Espected value string ok
				if(response.result===true) {
					
					// Notify to inspector
					top.inspector.show_log_msg("<span class='ok'>Removed portal locator</span>");				
				}else{
					// Error alert
					alert("[remove_element] Warning: " + response.msg, 'Warning');
				}

			}else{
				alert("[component_portal.remove_element] Warning: Null value is received. Check your server log for details");				
			}

			// Reload component by ajax
			component_common.load_component_by_wrapper_id(wrapper.id)			

			html_page.loading_content( wrapper, 0 );
		}, function(error) {

			console.log(error);
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on [remove_element] save_order</span>" + error );
			html_page.loading_content( wrapper, 0 );
		})
	

		return js_promise	
	};//end this.remove_element



	/**
	* HIDE BUTTONS AND CONTENT
	* usado en los listados de time machine
	*/
	this.hide_buttons_and_tr_edit_content = function() {
		$(function(){	
			//$('.section_edit_in_portal_content, .btn_new_ep, .css_button_delete').hide(0);
			$('.delete_portal_link, .th_large_icon, TR[class*="portal_tr_edit_"]').remove(0);
		});

		return true
	};//end hide_buttons_and_tr_edit_content



	/**
	* OPEN_RECORD
	*/
	this.open_record = function(button_obj, url) {
	
		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("component_portal:open_record: Sorry: wrap_div dom element not found")
			}			
			// Set portal as component to refresh
			html_page.add_component_to_refresh( wrap_div.id )

		const window_url	= url
		const window_name	= "Edit "+ encodeURIComponent(url)
		
		if(SHOW_DEBUG===true) {
			// 01-05-2017 WORK
			window.location = window_url+"&menu=1";
			return false		
		}else{
			// Actual behavior
			let edit_window = window.open(window_url,window_name)
			if(edit_window) edit_window.focus()
		}			
			
		/* 
		if ( /context/.test(url) ) {
			// Open and focus window
			var edit_window = window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
				edit_window.focus()
			
		}else{
			//window.location = window_url;
			var edit_window = window.location.href = url;			
		}
		*/

		// Onclose edit record window, main window will be reloaded to update contents
		/* NOT NECESSRY ANYMORE
		edit_window.onbeforeunload = function () {
		   edit_window.location.reload();
		}
		*/

		return false;		
	};//end open_record	


	
	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {
		//e.stopPropagation();
		obj_wrap.classList.add("selected_wrap");
		//$(obj_wrap).find('a').first().focus();
	};//end select_component



	this.toggle_views = function(event){
		
		console.log(event);
	};//end toggle_views



	/**
	* BUILD_select_DIALOG
	* @return DOM object modal_dialog
	*/
	this.build_select_dialog = function(options) {
	
		const header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			const h4 = document.createElement("h4")
				h4.classList.add('modal-title')			
				// Add
				h4.appendChild(document.createTextNode(get_label.vincular_recurso))
				header.appendChild(h4)

		const body = document.createElement("div")
				const iframe = document.createElement("iframe")
					iframe.src = options.url
					iframe.style.width  = "100%"
					iframe.style.height = options.height
				// add
				body.appendChild(iframe)

		// modal dialog
		const modal_dialog = common.build_modal_dialog({
			id 		: options.dialog_id,
			header 	: header,
			body 	: body,
			footer 	: false,
			animation : false,
			modal_dialog_class : ["modal-dialog-big"]
		})
		

		return modal_dialog
	};//end build_select_dialog



	/**
	* RENDER_HTML
	* Builds all component html from basic json data
	* 1 - Request component json_build_options with trigger (component common get_component_json_data)
	* 2 - With received json_build_options, create all (rows, headers, etc.)
	* @return 
	*//*
	this.render_html = function() {
		//console.log(this); //return;

		//if (this.component_tipo!='numisdata77' && this.component_tipo!='oh17' ) { return;}

		const self = this;

		// Place holder msg
		common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'loading blink',
									text_node 		: " Loading.. ",
									parent 			: document.getElementById(self.unic_id),
								})

		// DB ajax Call
		const js_promise = component_common.get_component_json_data(self).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_portal.render_html] response:", response);				
			}			

			if (response && response.result) {

				const response_result = response.result		
			
				self.max_records 			= response_result.max_records
				self.component_info 	 	= (typeof(response_result.component_info)!="undefined") ? response_result.component_info : null			
				self.target_section_tipo 	= response_result.target_section_tipo || null
				self.label 					= response_result.label || null
				self.dato 					= response_result.dato || null
				const component_info 		= JSON.parse(self.component_info)	
				const edit_view 	   		= (component_info && typeof(component_info.propiedades.edit_view)!=="undefined") ? component_info.propiedades.edit_view : null
				
					console.log("edit_view:",edit_view);


				// CONTENT_DATA
				let content_data = common.create_dom_element({
											element_type 	: 'div',
											id 				: null,
											class_name 	 	: 'content_data',
											data_set 		: null,
											title_label 	: null,
											text_node 		: null,
											draggable 		: null,
											parent 			: null,
											custom_function_events : null,
										})
				
				// BUTTONS ADD
				// console.log(response.result.context);
				if (response.result.context.context_name=="tool_time_machine") {
					// No buttons are add
				}else{
					self.build_add_buttons({
						response 	 : response_result,
						parent 	 	 : content_data,
						current 	 : self,
					})
				}				
					
				
				let result_len 	 = response_result.rows_data_values ? response_result.rows_data_values.length : 0 						
				//if (result_len>0) {

					let n_columns 	 = Object.keys(response_result.ar_columns).length
						if(edit_view==='view_single_line') n_columns++
					let column_width = (100 / n_columns) + "%"				


					// SECTION				
					let section_class_name 	= ''
					let portal_section = common.create_dom_element({
											element_type 	: 'section',
											id 				: 'portal_table_' + self.component_tipo,
											class_name 	 	: 'portal_section ' + edit_view + ' ' + section_class_name,
											parent 			: content_data,
										})
					
						// TABLE
						// section_list_rows_content_div (container_fluid)
						// var section_list_rows_content_div = common.create_dom_element({
						// 						element_type 	: 'div',
						// 						//id 				: "section_list_rows_content_div_" + self.component_tipo,
						// 						id 				: "portal_table_" + self.component_tipo,
						// 						class_name 	 	: 'container_fluid section_list_rows_content_div portal_table_wraper tbody '+ edit_view,
						// 						parent 			: portal_section,
						// 					})
						

					// Fix some util vars
					self.column_width 		= column_width
					self.edit_view 	 		= edit_view 
					self.portal_section 	= portal_section
					self.result_len 		= result_len
					self.offset 			= 0
					self.n_rows 			= response_result.n_rows
					
					// HEADER
					var header = self.build_header({
							response 	 : response_result, 
							column_width : column_width,
							edit_view 	 : edit_view,
							result_len   : result_len,
							parent 		 : portal_section,
							n_rows 		 : self.n_rows,
						})

					// ROWS WRAPPER
					let wrapper_class_name
					switch(edit_view) {
						case "view_mosaic":
							wrapper_class_name 	= 'mosaic_ul'
							break;
						default:
							wrapper_class_name 	= ''
					}
					self.rows_wrapper = common.create_dom_element({
										element_type 	: 'div',
										class_name 	 	: 'rows_wrapper ' + wrapper_class_name,
										parent 			: portal_section,
									})
			
					// ROWS
					let rows = self.build_rows({
							response 	 : response_result, 
							column_width : column_width,
							edit_view 	 : edit_view,						
							result_len   : result_len,
							parent 		 : self.rows_wrapper,
						})
					
				//}//end if (result_len>0) {


				// WRAP
				let wrap = component_common.build_component_html(self, content_data)


				// EXEC COMPONENTS HTML SCRIPTS
				//exec_scripts_inside(wrap)


				// MORE ITEMS LINK
				self.more_items_links = self.build_more_items_links({
								section_class_name  : section_class_name,
								parent 		 		: wrap,							
						})			

				// Sortable init
				self.active_portal_table_sortable('portal_table_'+self.component_tipo, response_result.dragable_connectWith)

			}else{

				// Data response is not valid
				//alert("[component_portal.render_html] Error on render portal data ");
				console.error("[component_portal.render_html] ERROR on render portal data. Invalid trigger response: ",response);
			}

		})//end js_promise then
		
		
		return js_promise
	};//end render_html
	*/



	/**
	* RENDER_HTML
	* @return promise
	*/
	this.render_html = function(wrapper, dato, is_init) {
		
		const self = this		
	
		return new Promise(function(resolve, reject) {
			// DB ajax Call
			// Get component data from DB
			const component_json_data_promise = self.build_component_json_data(wrapper, dato)

			// Build component html
			component_json_data_promise.then(function(response){
				if(SHOW_DEBUG===true) {
					//console.log("[render_html] response:",response);
				}
				if (!response || !response.result) {
					//console.log("[render_html] wrapper:",wrapper);
					reject("Render component error! "+wrapper.dataset.label+" "+wrapper.dataset.tipo)
				}else{
					const component_html_promise = self.build_component_html(wrapper, response.result)
		
					if(Promise && component_html_promise) {
						component_html_promise.then(function(build_component_html_response){

							// Emit event like save . Attach custom event to render_html like save component
								const event_detail 	= {dataset: cloneDeep( wrapper.dataset )};
								const save_event 	= new CustomEvent('component_save', {detail:event_detail})								
								window.dispatchEvent(save_event)

							resolve("Render component done")
						})
					}
				}				
			})
		})
	};//end render_html



	/**
	* BUILD_COMPONENT_JSON_DATA
	* @return 
	*/
	this.build_component_json_data = function(wrapper, dato) {
		
		const self = this
		
		const component_info 	= JSON.parse(wrapper.dataset.component_info)

		html_page.loading_content( wrapper, 1 );

		const trigger_url  = self.url_trigger
		const trigger_vars = {
				mode 				: "build_component_json_data",
				tipo				: wrapper.dataset.tipo,
				section_tipo 		: wrapper.dataset.section_tipo,
				parent 				: wrapper.dataset.parent,
				modo 				: wrapper.dataset.modo,
				lang 				: wrapper.dataset.lang,
				top_tipo 			: page_globals.top_tipo,
				propiedades 		: component_info.propiedades,
				context 			: JSON.parse(wrapper.dataset.context),
				dato 				: dato, // used only when in tool time machine context
				build_options 		: {
					max_records : wrapper.dataset.max_records || 10,
					offset 		: wrapper.dataset.offset || 0
				}			
		}; //console.log("[component_autocomplete.autocomplete] trigger_vars",trigger_vars); return

		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response_data) {
				if(SHOW_DEBUG===true) {
					//console.log("[component_portal.build_component_json_data] response_data",response_data)
				}
				html_page.loading_content( wrapper, 0 )													

				return response_data

		}, function(error) {
				html_page.loading_content( wrapper, 0 )
				console.error("[component_portal.build_component_json_data] Failed get_json!", error);
		});

		return js_promise
	};//end build_component_json_data



	/**
	* BUILD_COMPONENT_HTML
	* @return 
	*/
	this.build_component_html = function(wrapper, component_json_data) {

		const self = this

		if (typeof(component_json_data)==="undefined" || !component_json_data) {
			// Data response is not valid
			//alert("[component_portal.render_html] Error on render portal data ");
			console.warn("[component_portal.render_html] ERROR on render portal data. Invalid trigger response: ",component_json_data, wrapper)
			return false
		}

		return new Promise(function(resolve, reject) {

			// clean wrapper
			while (wrapper.firstChild) {
				wrapper.removeChild(wrapper.firstChild);
			}
			
			const component_info 	 	= (typeof(wrapper.dataset.component_info)!=="undefined") ? JSON.parse(wrapper.dataset.component_info) : null			
			const tipo 					= wrapper.dataset.tipo
			const target_section_tipo 	= wrapper.dataset.target_section_tipo || null
			const label 				= wrapper.dataset.label || null
			const dato 					= wrapper.dataset.dato || null			
			const edit_view 	   		= (component_info && typeof(component_info.propiedades.edit_view)!=="undefined") ? component_info.propiedades.edit_view : null
			const permissions 			= component_json_data.permissions
			
			const n_rows 				= wrapper.dataset.n_rows
			const max_records 			= wrapper.dataset.max_records
			const offset 				= wrapper.dataset.offset


			const label_obj 	= common.create_dom_element({
										element_type 	: 'label',
										class_name 	 	: 'css_label label',
										text_node 		: label,
										parent 			: wrapper
									})			
			const content_data 	= common.create_dom_element({
										element_type 	: 'div',
										class_name 	 	: 'content_data',
										parent 			: wrapper
									})
			
			// 
			// CONTENT_DATA .  Create custom content data container		
			
				// BUTTONS ADD
				// console.log("context", component_json_data.context);
				if (component_json_data.context && component_json_data.context.context_name==="tool_time_machine") {
					// No buttons are add
				}else{
					self.build_add_buttons({
						parent 	 	 		: content_data, // DOM place where buttons are added
						component_json_data : component_json_data,
						wrapper 			: wrapper
					})
				}

				// BUTTONS PAGINATION
				self.build_pagination({
						parent 				: content_data, // DOM place where buttons are added
						component_json_data : component_json_data,
						wrapper 			: wrapper
					})

				
				const result_len = component_json_data.rows_data_values ? component_json_data.rows_data_values.length : 0
				
				let n_columns  = component_json_data.ar_columns.length // Object.keys(component_json_data.ar_columns).length		
					if(edit_view && edit_view==='view_single_line') n_columns++
				let column_width = (100 / n_columns) + "%"

				// SECTION				
				let section_class_name 	= ''
				let portal_section = common.create_dom_element({
										element_type 	: 'section',
										id 				: 'portal_table_' + tipo,
										class_name 	 	: 'portal_section ' + edit_view + ' ' + section_class_name,
										parent 			: content_data,
									})
				
					// TABLE
					// section_list_rows_content_div (container_fluid)
					//var section_list_rows_content_div = common.create_dom_element({
					//						element_type 	: 'div',
					//						//id 				: "section_list_rows_content_div_" + self.component_tipo,
					//						id 				: "portal_table_" + self.component_tipo,
					//						class_name 	 	: 'container_fluid section_list_rows_content_div portal_table_wraper tbody '+ edit_view,
					//						parent 			: portal_section,
					//					})			
				
				// HEADER
				const header = self.build_header({
						response 	 	: component_json_data, 
						column_width 	: column_width,
						edit_view 	 	: edit_view,
						result_len   	: result_len,
						parent 		 	: portal_section,
						n_rows 		 	: n_rows,
					})

				// ROWS WRAPPER
				let rows_wrapper_class_name
				switch(true) {
					case (edit_view && edit_view==="view_mosaic"):
						rows_wrapper_class_name 	= "mosaic_ul"
						break;
					case (edit_view && edit_view.length>0):
						rows_wrapper_class_name 	= edit_view
						break;
					default:
						rows_wrapper_class_name 	= ''
				}	
				const rows_wrapper = common.create_dom_element({
						element_type 	: 'div',
						class_name 	 	: 'rows_wrapper ' + rows_wrapper_class_name,
						parent 			: portal_section
					})	
				// ROWS
				const rows = self.build_rows({
						response 	 	: component_json_data, 
						column_width 	: column_width,
						edit_view 	 	: edit_view,
						result_len   	: result_len,
						parent 		 	: rows_wrapper,
					})				
			

			// MORE ITEMS LINK		
			const more_items_links = self.build_more_items_links({
						section_class_name  : section_class_name,
						parent 		 		: wrapper
				})

			// Exec scripts inside global wrapper
			exec_scripts_inside(wrapper)

			// Sortable init
			//if (component_json_data.dragable_connectWith) {
				if (edit_view.startsWith("view_tool_description")) {
					if(SHOW_DEBUG===true) {
						//console.log("Skip table_sortable in this edit_view : "+edit_view);
					}
				}else{
					self.active_portal_table_sortable('portal_table_'+ tipo, component_json_data.dragable_connectWith)
				}				
			//}

			resolve("build_component_html done")

		})//end promise
	};//end build_component_html



	/**
	* BUILD_PAGINATION
	* @return 
	*/
	this.build_pagination = function(options) {
	
		const self = this

		// Options vars
		const parent 				= options.parent
		const component_json_data 	= options.component_json_data		
		const wrapper 				= options.wrapper

		const max_records 			= parseInt(wrapper.dataset.max_records)
		const offset 				= parseInt(wrapper.dataset.offset)
		const n_rows 				= parseInt(wrapper.dataset.n_rows)
		
		const maximun_showed 		= max_records + offset

		if(SHOW_DEBUG===true) {
			if (wrapper.dataset.tipo==="mdcat1477") {
				console.log("[component_portal.build_pagination] ","n_rows:",n_rows,"max_records:",max_records,"offset:",offset,"maximun_showed:",maximun_showed,"tipo:",wrapper.dataset.tipo,"label:",wrapper.dataset.label)
			}
		}		

		if (n_rows>max_records) {

			// BUTTON  NEXT >
			const btn_pagination_right = common.create_dom_element({
					element_type 	: "div",
					class_name 	 	: "portal_btn_pagination portal_btn_pagination_right", //  icon_bs paginator_next_icon
					parent 			: parent,
					inner_html 		: ">"
				})
				if (maximun_showed<n_rows) {
					btn_pagination_right.classList.add("active")
					btn_pagination_right.addEventListener("click",function(e){
						
						let new_offset = offset + max_records

						// wrapper edit
						wrapper.dataset.offset = new_offset

						self.render_html(wrapper)
					})
				}


			// BUTTON PREV <
			const btn_pagination_left = common.create_dom_element({
					element_type 	: "div",
					class_name 	 	: "portal_btn_pagination portal_btn_pagination_left", // icon_bs paginator_prev_icon
					parent 			: parent,
					inner_html 		: "<"
				})
				if (offset > 0) {
					btn_pagination_left.classList.add("active")
					btn_pagination_left.addEventListener("click",function(e){
						
						let new_offset = offset - max_records

						// wrapper edit
						wrapper.dataset.offset = new_offset
						
						self.render_html(wrapper)
					})
				}		
		}
		

		return true
	};//end build_pagination



	/**
	* BUILD_ROWS
	* @return 
	*/
	this.build_rows = function(data) {
		
		if(SHOW_DEBUG===true) {
			console.log("portal_data "+data.response.label, data);
		}
			
		// vars
			const response 		= data.response 
			const parent 		= data.parent
			const edit_view 	= data.edit_view
			const wrapper 		= component_common.get_wrapper_from_element(parent)
			const tipo 			= wrapper.dataset.tipo
			let column_width 	= data.column_width
		
		// rows styles 
			switch(true) {
				case (edit_view && edit_view==="view_mosaic") :
					var row_class_name 	= 'mosaic_li'
					var item_class_name = 'mosaic_item'
					if (typeof(response.propiedades.edit_view_options)!=="undefined") {
						var row_styles = {width  : response.propiedades.edit_view_options.element_width, height : response.propiedades.edit_view_options.element_height}
					}else{
						// Defaults
						var row_styles = null; //{width:'20%', height:'100px'}
					}
					column_width = null
					break;
				case (edit_view && edit_view.startsWith("view_tool_description")) :				
					var row_class_name 	= 'view_tool_description_li'
					var item_class_name = 'view_tool_description_item'
					if (typeof(response.propiedades.edit_view_options)!=="undefined") {
						var row_styles = {width  : response.propiedades.edit_view_options.element_width, height : response.propiedades.edit_view_options.element_height}
					}else{
						// Defaults
						var row_styles = null; //{width:'20%', height:'100px'}
					}
					column_width = null
					break;
				case (edit_view && edit_view!=="view_single_line" && edit_view.length>0) :
					var row_class_name 	= edit_view + '_li'
					var item_class_name = edit_view + '_item'
					if (typeof(response.propiedades.edit_view_options)!=="undefined") {
						var row_styles = {width  : response.propiedades.edit_view_options.element_width, height : response.propiedades.edit_view_options.element_height}
					}else{
						// Defaults
						var row_styles = null
					}
					column_width = null		
					break;
				default:
					var row_class_name 	 = 'table_row'
					var item_class_name  = 'column'
					var row_styles 		 = null
			}
	
		// columns 
			// console.log("++++++ ar_columns",response.ar_columns);
			const columns_len = response.ar_columns.length 
			const result_len  = data.result_len
			for (let i = 0; i < result_len; i++) {

				const row_obj = response.rows_data_values[i]				
					if (typeof(row_obj)==="undefined") {
						console.log("key: "+i +" - result_len: "+result_len);
						console.log(response);
						return
					}

				// Row 
					const table_row = common.create_dom_element({
											element_type 	: 'div',
											class_name 	 	: row_class_name + ' portal_element_sortable portal_item_'+tipo,
											style 			: row_styles,
											data_set 		: {"dato":row_obj['locator']},
											parent 			: parent,
										})
					
				// Items (columns) 
					// Regular columns
					for (let z = 0; z < columns_len; z++) {
						
						let column_tipo = response.ar_columns[z].tipo
						let column_name = response.ar_columns[z].name
						
						if (column_tipo==='edit') {continue;}
						
						// current_value
						let current_value = row_obj[column_tipo]
							//console.log(column_tipo); //console.log(current_value); //console.log(response.rows_data_values);
						// Scripts inside
						/*
						if (current_value.indexOf('<script>') !== -1) { // section.render_component_html

							// Exec script code
							var div = document.createElement("div");	//console.log(div);
								div.innerHTML = current_value
								exec_scripts_inside( div )
						}*/
						switch(column_tipo) {					
							case 'tag_id':
								var class_name = item_class_name + ' _tag_id ' + column_name
								break;
							default:
								if(column_tipo.startsWith('ds_')){
									let ds_colum    = column_tipo.slice(3);
									var class_name 	= item_class_name +' ' + column_name
									if(response.propiedades.hasOwnProperty('elements_list_mode')
										&& response.propiedades.elements_list_mode[ds_colum]
										&& response.propiedades.elements_list_mode[ds_colum].hasOwnProperty('column_width')){
										column_width = response.propiedades.elements_list_mode[ds_colum].column_width
									}
								}else{
									var class_name = item_class_name + ' ' + column_name
									if(response.propiedades.hasOwnProperty('elements_list_mode')
										&& response.propiedades.elements_list_mode[column_tipo]
										&& response.propiedades.elements_list_mode[column_tipo].hasOwnProperty('column_width')){
										column_width = response.propiedades.elements_list_mode[column_tipo].column_width
									}
								}
						}							
						var column = common.create_dom_element({
												element_type 	: 'div',
												class_name 	 	: class_name,
												style 			: { "width" : column_width },
												inner_html 		: current_value, // text_node | text_content | inner_html
												parent 			: table_row,
											})				
					}//end for (var column_tipo in response.ar_columns)
		
				// Edit / delete column/s 
					switch(true) {
						case (edit_view==='view_single_line') :
							var column_edit = common.create_dom_element({
											element_type 	: 'div',
											class_name 	 	: 'column id_column',
											style 			: { "width" : column_width },
											inner_html 		: row_obj['edit']['edit'], // text_node | text_content | inner_html
											//parent 		: table_row,
										})
										table_row.insertBefore(column_edit, table_row.firstChild);
										common.create_dom_element({
											element_type 	: 'div',
											class_name 	 	: 'column delete_column',
											style 			: { "width" : column_width },
											inner_html 		: row_obj['edit']['delete'], // text_node | text_content | inner_html
											parent 			: table_row,
										})
							break;
						case (edit_view.startsWith("view_tool_description")) :

							break;
						default:
							var column_edit = common.create_dom_element({
											element_type 	: 'div',
											class_name 	 	: 'column id_column',
											style 			: { "width" : column_width },
											inner_html 		: row_obj['edit']['edit'] + row_obj['edit']['delete'], // text_node | text_content | inner_html
											//parent 		: table_row,
										})
										table_row.insertBefore(column_edit, table_row.firstChild);

					}

				// EXEC COMPONENTS HTML SCRIPTS
				//exec_scripts_inside(table_row)	
			}//end for (var i = 0; i < result_len; i++)
	
		// WORKING HERE (!)
		/*
			if(SHOW_DEBUG===true && DEVELOPMENT_SERVER===true && data.response.json_rows!==undefined && data.response.json_rows.length>0) {

				console.log("data.response.json_rows:",data.response.json_rows);
				const portal_test_container = common.create_dom_element({
												element_type 	: 'div',
												class_name 	 	: "portal_test_container",
												parent 			: wrapper
											})

				for (let i = 0; i < data.response.json_rows.length; i++) {
					const row 		 = data.response.json_rows[i]
					const ar_columns = row.ar_columns

					const row_container = common.create_dom_element({
												element_type 	: 'div',
												class_name 	 	: "row_container",
												data_set 		: {
													section_tipo : row.section_tipo,
													section_id 	: row.section_id
												},
												parent 			: portal_test_container
											})

					for (let j = 0; j < ar_columns.length; j++) {
						const column = ar_columns[j]
						common.create_dom_element({
													element_type 	: 'div',
													class_name 	 	: "component_wrapper_container",
													parent 			: row_container,
													inner_html 		: column.value
												})
					}						
				}

			}//end if(SHOW_DEBUG===true && DEVELOPMENT_SERVER===true && data.response.json_rows!==undefined && data.response.json_rows.length>0)
			
		*/

		return true
	};//end build_rows



	/**
	* BUILD_HEADER
	* @param object data
	* @return DOMB object
	*/
	this.build_header = function(data) {
	
		const response 		= data.response
		const edit_view 	= data.edit_view		
		const parent 		= data.parent
		const n_rows 		= data.n_rows
		const ar_columns 	= response.ar_columns
		let column_width 	= data.column_width

		// In some views, header is not showed
		//if((edit_view && edit_view!=="view_single_line" && edit_view.length>0) || n_rows<1) {
		if((edit_view && edit_view!=="view_single_line" && edit_view.length>0)) {
			return false;
		}
		
		const row_header_hide = (n_rows<1) ? ' row_header_hide' : '';
		
		// table_row_header
		const table_row_header = common.create_dom_element({
				element_type 			: 'div',
				class_name 	 			: 'table_row row_header' + row_header_hide,
				parent 					: parent,
				custom_function_events 	: [{'type':'dblclick','name':'component_portal.collapse_rows'}]
			})

		// header columns
		let class_name
		const columns_len = ar_columns.length 
		for (let i = 0; i < columns_len; i++) {
			
			const column 		= ar_columns[i]
			const column_tipo = column.tipo	
	
			// header column
			switch(column_tipo) {
				case 'edit':				
					class_name = 'column id_column '+ column.name
					break;
				case 'tag_id':
					class_name = 'column _tag_id '+ column.name
					break;
				default:
					if(column_tipo.startsWith('ds_')){
						let ds_colum = column_tipo.slice(3);
						class_name 	 = 'column ' + column.name
						if(response.propiedades.hasOwnProperty('elements_list_mode')
							&& response.propiedades.elements_list_mode[ds_colum]
							&& response.propiedades.elements_list_mode[ds_colum].hasOwnProperty('column_width')){
							column_width = response.propiedades.elements_list_mode[ds_colum].column_width
						}
					}else{
						class_name = 'column ' + column.name
						if(response.propiedades.hasOwnProperty('elements_list_mode')!==false
							&& response.propiedades.elements_list_mode[column_tipo]
							&& response.propiedades.elements_list_mode[column_tipo].hasOwnProperty('column_width')){
							column_width = response.propiedades.elements_list_mode[column_tipo].column_width
						}
					}
					break;
			}			

			// header_column
			common.create_dom_element({
				element_type 	: 'div',
				class_name 	 	: class_name,
				style 			: { "width" : column_width },
				text_node 		: column.label,
				parent 			: table_row_header
			})
		}//end for (var i = 0; i < len; i++)
		
		if(edit_view==='view_single_line') {
			common.create_dom_element({
					element_type 	: 'div',
					class_name 	 	: 'column delete_column',
					style 			: { "width" : column_width },
					text_node 		: get_label.borrar,
					parent 			: table_row_header,
			})
		}//end if(edit_view==='view_single_line')

		return table_row_header
	};//end build_header



	/**
	* BUILD_ADD_BUTTONS
	* @return bool
	*/
	this.build_add_buttons = function(options) {

		const self = this 

		// Options vars
		const wrapper 					= options.wrapper
		const parent 					= options.parent
		const component_json_data 		= options.component_json_data
		
		// Propiedades add_buttons. Set to false to skip build_add_buttons
		if (typeof (component_json_data.propiedades.add_buttons)!=="undefined" && component_json_data.propiedades.add_buttons===false) {
			return false
		}	

		const permissions 				= component_json_data.permissions
		const component_tipo 			= wrapper.dataset.tipo
		const section_tipo 				= wrapper.dataset.section_tipo
		const section_id 				= wrapper.dataset.parent		
		const ar_target_section_tipo 	= JSON.parse(wrapper.dataset.target_section_tipo)
		const n_rows 					= wrapper.dataset.n_rows
		const label						= wrapper.dataset.label	

		if(permissions>=2) {
		const len = ar_target_section_tipo.length
		for (let i = 0; i < len; i++) {

			let target_section_tipo = ar_target_section_tipo[i]
			
			// btn_new_ep
			const btn_new_ep = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'css_button_generic btn_new_ep btn_portal_new',
									data_set 		: {
														portal_tipo 		: component_tipo,
														portal_parent 		: section_id,
														portal_section_tipo : section_tipo,
														target_section_tipo : target_section_tipo,
														n_rows 				: n_rows,
													  },
									parent 			: parent
									//custom_function_events : [{'type':'click','name':'component_portal.add_new_element'}],
								})
								btn_new_ep.addEventListener("click", function(e){
									self.add_new_element(this, wrapper)
								},false)
				common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'icon_bs link new_portal_record',
									parent 			: btn_new_ep,
								})
				common.create_dom_element({
									element_type 	: 'span',
									inner_html 		: label,
									parent 			: btn_new_ep,
								})
			// btn_new_ep_find
			const btn_new_ep_find = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'css_button_generic btn_new_ep btn_portal_find', // data-tipo="oh25" data-top_tipo="oh1" data-parent="1" data-section_tipo="oh1" data-target_section_tipo="rsc167"
									data_set 		: {
														tipo 				: component_tipo,
														top_tipo 			: page_globals.top_tipo,
														parent 				: section_id,
														section_tipo 		: section_tipo,
														target_section_tipo : target_section_tipo,
													  },
									parent 			: parent,
									custom_function_events : [{'type':'click','name':'tool_common.open_tool_portal'}],
								})
				common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'icon_bs link find_portal_record',
									parent 			: btn_new_ep_find,
								})
				common.create_dom_element({
									element_type 	: 'span',
									inner_html 		: label,
									parent 			: btn_new_ep_find,
								})				
		}//end for (var i = 0; i < len; i++)
		}//end if(response.premissions>=2)

		// btn_new_ep_find
		const btn_view_toogle = common.create_dom_element({
								element_type 	: 'div',
								class_name 	 	: 'btn_view_toogle CREATED_IN_JS_BUILD_ADD_BUTTONS',
								data_set 		: {view : "full"},
								parent 			: parent,
								custom_function_events : [{'type':'click','name':'component_portal.toggle_views'}],
							})

		return true
	};//end build_add_buttons



	/**
	* BUILD_MORE_ITEMS_LINKS
	* @return DOM obj
	*/
	this.build_more_items_links = function(options) {
		
		const self = this

		// Options vars
		const section_class_name 	= options.section_class_name
		const wrapper 			 	= options.parent

		const component_tipo	 	= wrapper.dataset.tipo
		const max_records 			= parseInt(wrapper.dataset.max_records)
		const offset 				= parseInt(wrapper.dataset.offset)
		const n_rows 				= parseInt(wrapper.dataset.n_rows)			

		let showed_records = max_records + offset
			if (showed_records>n_rows) {
				showed_records = n_rows;
			}

		if(SHOW_DEBUG===true) {
			//console.log("[component_portal.build_more_items_links] max_records",max_records,"offset",offset,"n_rows",n_rows); //return
			//console.log("build_more_items_links - showed_records:",showed_records,"n_rows",n_rows,"max_records:",max_records,"offset:",offset);
		}		

		if (showed_records<n_rows) {

			const more_items_wrapper = common.create_dom_element({
								element_type 	: 'div',
								id 				: 'more_items_wrapper_' + component_tipo,
								class_name 	 	: 'more_items_wrapper ' + section_class_name,
								text_node 		: null,
								parent 			: wrapper,
							})
			
			const show_all_items_btn = common.create_dom_element({
								element_type 	: 'a',								
								class_name 	 	: 'show_all_items ' + section_class_name,
								text_node 		: " Show all items [" +n_rows+ "]",
								//custom_function_events : [{'type':'click','name':'component_portal.show_all_items','function_arguments':[self]}],
								parent 			: more_items_wrapper,
							})
							show_all_items_btn.addEventListener("click",function(e){
								// show_all_items
								self.show_all_items(this, wrapper)
							},false)

			const show_more_items_btn = common.create_dom_element({
								element_type 	: 'a',								
								class_name 	 	: 'more_items ' + section_class_name,
								text_node 		: " Show more items ",
								parent 			: more_items_wrapper,
							})
							show_more_items_btn.addEventListener("click",function(e){
								// show_more_items
								self.show_more_items(this, wrapper)
							},false)							

			/*
			var more_items_link = common.create_dom_element({
								element_type 	: 'a',
								id 				: 'more_items_' + component_tipo,
								class_name 	 	: 'more_items ' + section_class_name,
								text_node 		: " More items .. (" + showed_records + " of " + n_rows + ")",
								custom_function_events : [{'type':'click','name':'component_portal.get_more_items','function_arguments':[self]}],
								parent 			: more_items_wrapper,
							})*/

			// Fix var to modify later
			//self.more_items_link = more_items_link

		}else{

			var more_items_wrapper = null
		}


		return more_items_wrapper
	};//end build_more_items_links
	


	/**
	* COLLAPSE_ROWS
	* @return 
	*/
	this.collapse_rows = function(button) {
		
		const container = button.parentNode;		
		const ar_rows 	= container.querySelectorAll('.rows_wrapper')
		const len 		= ar_rows.length		
		for (let i = len - 1; i >= 0; i--) {
			if (ar_rows[i].style.display==='none') {
				ar_rows[i].style.display = ''				
			}else{
				ar_rows[i].style.display = 'none'
			}
		}
	};//end collapse_rows



	/**
	* SHOW_ALL_ITEMS
	* @return promise
	*/
	this.show_all_items = function(button, wrapper) {

		const self = this

		// Modify wrapper
		wrapper.dataset.max_records = 9999 
		wrapper.dataset.offset 		= 0

		const js_promise = self.render_html(wrapper)

		return js_promise
	};//end show_all_items



	/**
	* SHOW_more_ITEMS
	* @return 
	*/
	this.show_more_items = function(button, wrapper) {

		const self = this

		const new_max_records = parseInt(wrapper.dataset.max_records) + 10  

		// Modify wrapper
		wrapper.dataset.max_records = new_max_records
		
		const js_promise = self.render_html(wrapper)

		return js_promise
	};//end show_more_items



	/**
	* GOTO_LAST_PAGE
	* @return 
	*/
	this.goto_last_page = function(button, wrapper) {

		const self = this

		const max_records 	= parseInt(wrapper.dataset.max_records)
		const offset 		= parseInt(wrapper.dataset.offset)
		const n_rows 		= parseInt(wrapper.dataset.n_rows)

		const last_offset 	= Math.floor(n_rows / max_records) * max_records

		// Modify wrapper
		// wrapper.dataset.max_records = 9999
		wrapper.dataset.offset = last_offset

		const js_promise = self.render_html(wrapper)

		return js_promise
	};//end goto_last_page



}//end class