"use strict";
/**
* COMPONENT PORTAL CLASS
*
*
*/
var component_portal = new function() {

	this.portal_objects 		 = []
	this.url_trigger 			 = DEDALO_LIB_BASE_URL + '/component_portal/trigger.component_portal.php'
	this.save_arguments 		 = {} // End save_arguments
	// Fixed when user click on delete icon (open_delete_dialog)
	this.delete_obj 			 = null;
	this.delete_dialog_portal_id = "delete_dialog_portal"

	// Active button obj
	this.active_delete_button_obj = null



	/**
	* INIT
	* @return 
	*/
	this.init = function() {

		// DOM ready
		//$(function() 
		window.ready(function(){

			switch(page_globals.modo) {
				case 'tool_time_machine' :
						component_portal.hide_buttons_and_tr_edit_content();
						break;
				case 'tool_lang' :
						break;
				case 'edit' :
						break;
			}		
		});//end $(function()

		// Window load
		window.addEventListener("load", function (event) {
			// Add delete confirmation dialog text once
			component_portal.create_dialog_div()
		})	

	};//end init



	/**
	* CREATE_DIALOG_DIV
	* Add delete confirmation dialog text
	*/
	this.create_dialog_div = function() {
		
		let delete_dialog = this.build_delete_dialog({
			delete_dialog_portal_id : this.delete_dialog_portal_id
		})
		document.body.appendChild(delete_dialog);
	};//end create_dialog_div
	


	/**
	* BUILD_DELETE_DIALOG
	* @return DOM object modal_dialog
	*/
	this.build_delete_dialog = function(options) {

		let header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			let h4 = document.createElement("h4")
				h4.classList.add('modal-title')
			let	t = document.createTextNode(get_label.esta_seguro_de_borrar_este_registro)
				// Add
				h4.appendChild(t)
				header.appendChild(h4)

		let body = document.createElement("div")
			t = document.createTextNode("Loading..")
				// add
				body.appendChild(t)

		let footer = document.createElement("div")

			// <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
			let button_cancel = document.createElement("button")
				button_cancel.classList.add("btn","btn-default")
				button_cancel.dataset.dismiss = "modal"
				t = document.createTextNode(get_label.cancelar)
				// add
				button_cancel.appendChild(t)
				// add
				footer.appendChild(button_cancel)

			// <button type="button" class="btn btn-primary">Save changes</button>
			let button_delete_data = document.createElement("button")
				button_delete_data.classList.add("btn","btn-primary")
				button_delete_data.dataset.dismiss = "modal"
				t = document.createTextNode(get_label.borrar_solo_el_vinculo)
				// add
				button_delete_data.appendChild(t)
				button_delete_data.addEventListener("click", function (e) {
					//div_note_wrapper.parentNode.removeChild(div_note_wrapper)					
					component_portal.remove_locator_from_portal(component_portal.delete_obj,'delete_link')
				})
				// add
				footer.appendChild(button_delete_data)

			// <button type="button" class="btn btn-primary">Save changes</button>
			let button_delete_record = document.createElement("button")
				button_delete_record.classList.add("btn","btn-primary")
				button_delete_record.dataset.dismiss = "modal"
				t = document.createTextNode(get_label.borrar_el_recurso)
				// add
				button_delete_record.appendChild(t)
				button_delete_record.addEventListener("click", function (e) {
					//div_note_wrapper.parentNode.removeChild(div_note_wrapper)
					component_portal.remove_resource_from_portal(component_portal.delete_obj,'delete_all')
				})
				// add
				footer.appendChild(button_delete_record)		


		// modal dialog
		let modal_dialog = common.build_modal_dialog({
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
		let wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_portal:open_delete_dialog: Sorry: portal wrap_div dom element not found")
			}
		let label = wrap_div.querySelector("label.css_label").textContent || null


		// Add dialog id info to dialog body
		let rel_locator = JSON.parse(button_obj.dataset.rel_locator)
		let ref_id = rel_locator.section_id
		if (typeof rel_locator.tag_id!=="undefined") {
			ref_id += "-"+rel_locator.tag_id
		}
		let delete_dialog = document.getElementById(this.delete_dialog_portal_id)
		let modal_body = delete_dialog.querySelector(".modal-body")
			modal_body.innerHTML = label + ". " + get_label.registro + " ID: " + ref_id		
		
		// Open dialog
		$('#'+this.delete_dialog_portal_id).modal({
			show 	 : true,
			keyboard : true
		})

		return true		
	};//end open_delete_dialog



	/**
	* ACTIVE_PORTAL_TABLE_SORTABLE : Sort records 
	*/
	this.receive_instance = null
	this.active_portal_table_sortable = function(table_id, dragable_connectWith) {
	
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
		var current = this

		var table = document.getElementById(table_id)
		if (!table) {
			return false
		}
		var base_element = table.querySelector('.rows_wrapper')

		// Store instance table_object
		current.table_object = base_element
		
		// Store last sortable_action executed
		current.sortable_action = null
		
		// Table sortable
		$(base_element).sortable({
			cancel : "a,button,input,select",
			cursor : "move",
			//axis : 'y',	
			//delay : 150,	
			//containment : '#'+table_id, // Constrin moviment inside table body (parent)
			//start : 	draggin_start,
			//helper : fixHelperModified,
			activate : function(event, ui) {
			},
			receive : function(event, ui) {
				console.log("Event: receive "+current.unic_id); //return
				current.sortable_action = "receive"
				// Store current component instance to call it later (on remove)
				component_portal.receive_instance = current			
			},
			remove : function(event, ui) {
				console.log("Event: remove "+current.unic_id); //return
				current.sortable_action = "remove"				
				// SORT_REMOVE_ITEM . Item dragged from source portal is deleted here and portal is saved
				// On finish (return promise), call to previous stored component instance to add item after remove
				// This is the correct sequence order to save (remove,receive) but jquery call is inverse...
				current.sort_remove_item(ui.item[0]).then(function(e){
					// SORT_ADD_ITEM . Item dragged to target portal is added here and portal is saved
					component_portal.receive_instance.sort_add_item(ui.item[0]).then(function(e){ component_portal.receive_instance=null; })
				})		
			},			
			stop : function(event, ui) {
				console.log("Event: stop "+current.unic_id); //return				
				// SORT_ITEMS
				if (current.sortable_action !== 'remove' && current.sortable_action !== 'receive') {
					current.sortable_action = "stop"			
					current.sort_items()
				}else{
					current.sortable_action = "stop"
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
	this.sort_items = function() {

		var dato 	 			= this.dato
		var dato_len 			= dato.length

		var ar_elements_row 	= this.table_object.querySelectorAll('.portal_element_sortable')
		var ar_elements_row_len = ar_elements_row.length
		
		// Fill final_dato from dom elements
		var final_dato = []
		for (var i = 0; i < ar_elements_row_len; i++) {
			var current_locator = JSON.parse(ar_elements_row[i].dataset.dato)
			final_dato.push( current_locator )
		}

		// Add component dato locators not already existing in final_dato (not loaded items)
		for (var i = 0; i < dato_len; i++) {
			if ( component_portal.contains_locator(dato[i], final_dato)===false ) {
				final_dato.push(dato[i])
			}
		}
		
		// Compare old and new dato to check changes
		var changed = false
		const len = final_dato.length
		for (var i = 0; i < len; i++) {			
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

		this.dato = final_dato
		
		return this.Save()
	};//end sort_items



	/**
	* SORT_ADD_ITEM
	* @return promise Save
	*/
	this.sort_add_item = function(item) {

		const added_locator  	= JSON.parse(item.dataset.dato)
		const dato 	 		= this.dato
		const dato_len 		= dato.length

		var ar_elements_row 	= this.table_object.querySelectorAll('.portal_element_sortable')
		var ar_elements_row_len = ar_elements_row.length
			//console.log(ar_elements_row);
			//console.log("Add item : "+item.dataset.dato);

		// Test if item locator already exists in dato. If yes, remove and stop
		for (var i = 0; i < dato_len; i++) {
			if ( component_portal.contains_locator(added_locator, dato)===true ) {
				console.log("Stopped add and removed dragged item: "+item.dataset.dato);
				item.remove()
				return false;
			}
		}		
		
		// Fill final_dato from dom elements
		var final_dato = []
		for (var i = 0; i < ar_elements_row_len; i++) {
			var current_locator = JSON.parse(ar_elements_row[i].dataset.dato)
			final_dato.push( current_locator )
		}

		// Add component dato locators not already existing in final_dato (not loaded items)
		for (var i = 0; i < dato_len; i++) {
			if ( component_portal.contains_locator(dato[i], final_dato)===false ) {
				final_dato.push(dato[i])
			}
		}

		this.dato = final_dato
		//this.max_records++
		

		return this.Save();
	};//end sort_add_item



	/**
	* SORT_REMOVE_ITEM
	* @return promise Save
	*/
	this.sort_remove_item = function(item) {
		
		var removed_locator  = JSON.parse(item.dataset.dato)
		var dato 	 		 = this.dato
		var dato_len 		 = dato.length
		//console.log(dato);	console.log(removed_locator);

		// Iterate dato and add different to removed_locator elements to new array
		var final_dato = []
		for (var i = 0; i < dato_len; i++) {
			//console.log(dato[i]); 	console.log(i);
			var is_equal = component_portal.is_equal_locator( removed_locator, dato[i] )
			if ( is_equal===false ) {
				//dato.splice(i, 1);
				final_dato.push(dato[i])
			}
		}
		this.dato = final_dato
		
		return this.Save()
	};//end sort_remove_item



	/**
	* SAVE
	* @return 
	*/
	this.Save = function() {

		var current = this
		
		var trigger_vars = {
				mode 		 	: 'save',
				sortable_action : this.sortable_action,
				portal_tipo 	: this.component_tipo,
				portal_parent 	: this.section_id,
				section_tipo 	: this.section_tipo,
				dato 			: JSON.stringify(this.dato),
				top_tipo 		: page_globals.top_tipo,
			}
			console.log("[component_portal.Save] trigger_vars", trigger_vars ); //return
			

		var id_wrapper 		= this.unic_id
		var component_wrap 	= document.getElementById(id_wrapper)
		
		html_page.loading_content( component_wrap, 1 );

		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			//console.log(response);		

			if (response && response.result) {

				// Reload component by ajax (Recommended)
				component_common.load_component_by_wrapper_id(id_wrapper); // ,null,component_portal.active_portal_drag component_portal.active_portal_drag();wrapper_id, arguments, callback

				// Notify to inspector
				top.inspector.show_log_msg("<span class='ok'>Changed order</span>");
			}else{
				alert("[save_order] Warning: Null value is received. Check your server log for details");
			}
			
			if (SHOW_DEBUG===true) {
				console.log("->Save ["+ current.component_tipo+" - "+current.section_id+"]: " + response.msg)
				console.log(response.debug)
			}

			html_page.loading_content( component_wrap, 0 );
		}, function(error) {
			console.log(error);
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " save_order</span>" + error );
			html_page.loading_content( component_wrap, 0 );
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
	* NEW PORTAL RECORD
	* Create new section record and add to current portal
	*/
	this.new_portal_record = function (button_obj) {
			
		//var portal_id 		= $(button_obj).data('portal_id')
		let	portal_tipo 		= button_obj.dataset.portal_tipo
		let portal_parent		= button_obj.dataset.portal_parent
		let portal_section_tipo = button_obj.dataset.portal_section_tipo
		let	target_section_tipo	= button_obj.dataset.target_section_tipo

		// Test mandatory vars
		if (typeof target_section_tipo=='undefined' || target_section_tipo.length<3) {
			alert("[component_portal.new_portal_record] Error: target_section_tipo is empty! \n Nothing is done.")	
			return false;
		}

		// Component wrap
		let component_wrap = component_common.get_wrapper_from_element(button_obj)
			if (!component_wrap) {
				alert("[component_portal.new_portal_record] Error on select component wrap")
				return false;
			}
			let id_wrapper = component_wrap.id
			//console.log(component_wrap)

		var component_info = JSON.parse(component_wrap.dataset.component_info);
		var propiedades    = component_info.propiedades 
			//console.log(component_info); return;

		var trigger_vars	= {
			mode				: 'new_portal_record',
			portal_tipo		  	: portal_tipo,
			portal_parent 	  	: portal_parent,
			portal_section_tipo : portal_section_tipo,
			target_section_tipo : target_section_tipo,
			top_tipo 			: page_globals.top_tipo,
			top_id 				: page_globals.top_id || null
		}
		//return console.log("[component_portal.new_portal_record] trigger_vars",trigger_vars);		

		html_page.loading_content( component_wrap, 1 )

		var js_promise = common.get_json_data(component_portal.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_portal.new_portal_record] response", response);
			}

			if (response && response.result) {

				var received_data = response.result

				//console.log(received_data);
				// Response new 'id_matrix' expected
				if (Number.isInteger(received_data) && received_data>0) {

					// Notification msg ok
					var msg = "<span class='ok'>New portal record: " + received_data + "</span>";
						inspector.show_log_msg(msg);

					var created_record_id = parseInt(received_data)

					// Updating component portal way
					component_common.load_component_by_wrapper_id( id_wrapper ).then(function(response) {
														
						// Open window to edit new record created
						var element_id = 'portal_link_open_'+portal_section_tipo+'_'+created_record_id

						if (typeof propiedades.portal_link_open != "undefined" && propiedades.portal_link_open===false) {
							// Not open new window
						}else{
							// Open new window clicking new record edit record
							var portal_link_open = document.getElementById(element_id);
							if (portal_link_open) {
								portal_link_open.click()
							}else{
								alert("[new_portal_record] Error on locate element after reload component. element_id: "+element_id)
							}
						}
					}, function(xhrObj) {
						console.log("xhrObj",xhrObj);
					})//end jsPromise

				}else{
					// Warning msg
					var msg = "<span class='warning'>[component_portal.new_portal_record] Warning on create new_portal_record: \n" + received_data +"</span>. Please, reload page manually for update list" ;
						inspector.show_log_msg(msg);					
						alert( msg ) // msg.innerText || msg.textContent
				}

			}else{
				alert("[component_portal.new_portal_record] Warning: Null value is received. Check your server log for details");
			}
			
			if (SHOW_DEBUG===true) {
				console.log("[component_portal.new_portal_record]->Save ["+portal_tipo+" - "+portal_parent+"]: " +response.msg, response.debug)			
			}

			html_page.loading_content( component_wrap, 0 );
		}, function(error) {
			console.log(error);
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " save_order</span>" + error );
			html_page.loading_content( component_wrap, 0 );
		})
	

		return js_promise
	};//end new_portal_record



	/**
	* REMOVE RESOURCE FROM PORTAL
	*/
	this.remove_locator_from_portal = function (button_obj) {
		
		// Component wrap
		var component_wrap = component_common.get_wrapper_from_element(button_obj);
			if (!component_wrap) return alert("Error on select component wrap");
			var id_wrapper = component_wrap.id
			//console.log(component_wrap);

		var trigger_vars = {
				mode 		   	: 'remove_locator_from_portal',
				portal_tipo  	: component_wrap.dataset.tipo,
				portal_parent 	: component_wrap.dataset.parent,
				section_tipo	: component_wrap.dataset.section_tipo,
				rel_locator 	: button_obj.dataset.rel_locator,
				top_tipo		: page_globals.top_tipo
		}
		//return console.log("[component_portal.remove_locator_from_portal]", trigger_vars);	

		var locator_obj 		= JSON.parse(button_obj.dataset.rel_locator) || null;
		var locator_section_id 	= (typeof locator_obj.section_id!='undefined' ) ? locator_obj.section_id : null;		

		html_page.loading_content( component_wrap, 1 );

		var js_promise = common.get_json_data(component_portal.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_portal.remove_locator_from_portal] response", response);
				//console.log("[component_portal.remove_locator_from_portal] response.debug:" + response.debug)
			}

			if (response && response.result) {
				
				// Espected value string ok
				if(response.result===true) {
					
					// Notify to inspector
					top.inspector.show_log_msg("<span class='ok'>Removed portal locator "+locator_section_id+"</span>");				
				}else{
					// Error alert
					alert("[remove_locator_from_portal] Warning: " + response.msg, 'Warning');
				}

			}else{
				alert("[component_portal.remove_locator_from_portal] Warning: Null value is received. Check your server log for details");				
			}

			// Reload component by ajax
			component_common.load_component_by_wrapper_id(id_wrapper)			

			html_page.loading_content( component_wrap, 0 );
		}, function(error) {
			console.log(error);
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " save_order</span>" + error );
			html_page.loading_content( component_wrap, 0 );
		})
	

		return js_promise	
	};// /this.remove_locator_from_portal



	/**
	* REMOVE RESOURCE FROM PORTAL
	*/
	this.remove_resource_from_portal = function (button_obj, action) {
		
		// Component wrap		
		var component_wrap = component_common.get_wrapper_from_element(button_obj);
			if (!component_wrap) return alert("Error on select component wrap");
			var id_wrapper = component_wrap.id

		// Confirm action
		if( !confirm(get_label.seguro) )  return false;	

		var trigger_vars = {
			mode			: 'remove_resource_from_portal',
			portal_tipo		: component_wrap.dataset.tipo,
			portal_parent 	: component_wrap.dataset.parent,
			section_tipo	: component_wrap.dataset.section_tipo,
			rel_locator		: button_obj.dataset.rel_locator,
			top_tipo		: page_globals.top_tipo
		}
		//return console.log(mydata);

		var locator_obj 		= JSON.parse(button_obj.dataset.rel_locator) || null;
		var locator_section_id 	= (typeof locator_obj.section_id!='undefined' ) ? locator_obj.section_id : null;
			

		html_page.loading_content( component_wrap, 1 );

		var js_promise = common.get_json_data(component_portal.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_portal.remove_resource_from_portal] response", response);
			}

			if (response && response.result) {
				
				// Espected value string ok
				if(response.result===true) {					
					// Notify to inspector
					top.inspector.show_log_msg("<span class='ok'>Removed completely resource "+locator_section_id+"</span>");					
				}else{
					// Error alert
					alert("[component_portal.remove_resource_from_portal] Warning: " + response.msg, 'Warning');
				}

			}else{
				alert("[component_portal.remove_resource_from_portal] Warning: Null value is received. Check your server log for details");				
			}

			// Reload component by ajax
			component_common.load_component_by_wrapper_id(id_wrapper)			

			html_page.loading_content( component_wrap, 0 );
		}, function(error) {
			console.log(error);
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " save_order</span>" + error );
			html_page.loading_content( component_wrap, 0 );
		})
	

		return js_promise
	};// /this.remove_resource_from_portal



	/**
	* HIDE BUTTONS AND CONTENT
	* usado en los listados de time machine
	*/
	this.hide_buttons_and_tr_edit_content = function() {
		$(function(){	
			//$('.section_edit_in_portal_content, .btn_new_ep, .css_button_delete').hide(0);
			$('.delete_portal_link, .th_large_icon, TR[class*="portal_tr_edit_"]').remove(0);
		});
	};//end hide_buttons_and_tr_edit_content



	/**
	* PORTAL TAP STATE UPDATE
	* Update only specific style of row portal tabs. NOT affect if show or hide content (controled by: html_page.taps_state_update)
	*//*
	this.portal_tab_style_update__DEPRECATED = function() {
		
		$(function() {			
			//alert("called portal_tab_style_update")

			// TAP OBJ SELECTOR
			var portal_tab_title_obj = $('.section_edit_in_portal_td').children('.tab_title');

			// INITIAL ITERATION TO SHOW / HIDE TAPS	
			portal_tab_title_obj.each(function() {
				
				var tab_id = $(this).data('tab_id');					//alert( tab_id );	
				if(tab_id != null) {
					var tab_value	= get_localStorage(tab_id);			//alert("tab_value:"+tab_value)

					// TOOGLE DIV IF EXISTS COOKIE
					if(tab_value != 1) {
						component_portal.open_row_edit( $(this) );		//alert("tab_value is 1. open row "+tab_id)
					}
				}
				//$(this).next('.tab_content').toggle(0);
			});
			
		});
	};*/
	


	/**
	* OPEN_TR_EDIT
	*//*
	this.open_tr_edit__DEPRECATED = function (button_obj) {	
		
		// vars
		var vars = new Object();
			vars.portal_tr_edit = $(button_obj).data('portal_tr_edit'),
			vars.portal_tr_list = $(button_obj).data('portal_tr_list'),
			vars.id_wrapper		= $(button_obj).data('id_wrapper'),
			vars.common_row_id	= $(button_obj).data('common_row_id');
		// Verify vars values
		if(!test_object_vars(vars, 'open_tr_edit')) return false;

		// ROW EDIT : current html lengh
		var current_html_lenght = $('.portal_tr_edit_'+vars.common_row_id).find('.css_section_content').html().length ;

		// Close and clean all common rows edit
		// ROW EDIT : Hide
		$('.portal_tr_edit_'+vars.common_row_id).css('display','none');
		// ROW EDIT : Empty content html
		$('.portal_tr_edit_'+vars.common_row_id).find('.css_section_content').html('<div class=\"portal_loading_msg\">Loading..</div>');
		
		//$('.portal_tr_edit_'+vars.common_row_id).find('.css_section_content').each(function() {					  
		//  $(this).css('display','none');
		//  $(this).html('Loading..');		
		//});
		
		// ROW LIST : Show all common rows list
		$('.portal_tr_list_'+vars.common_row_id).css('display','table-row');
			
		$(function() {
			// Ajax load section
			if($('#'+vars.id_wrapper).length != 1) return alert("Error: wrong target_row_id:"+vars.id_wrapper+" n:"+$('#'+vars.id_wrapper).length);

			//if (current_html_lenght<100) {}
			component_common.load_section_by_ajax(vars.id_wrapper);	//, arguments, callback
						
			//console.log("called function")
		});//$(function()
		
		// ROW LIST : Hide current tr list
		$('#'+vars.portal_tr_list).css('display','none');

		// ROW EDIT : Show current tr edit		
		$('#'+vars.portal_tr_edit).css('display','table-row');			
	};//end open_tr_edit__DEPRECATED
	*/



	/**
	* CLOSE_TR_EDIT
	*//*
	this.close_tr_edit__DEPRECATED = function (button_obj) {
		
		// vars
		var vars = new Object();
			vars.portal_tr_edit = $(button_obj).data('portal_tr_edit'),
			vars.portal_tr_list = $(button_obj).data('portal_tr_list');
		// Verify vars values
		if(!test_object_vars(vars, 'close_tr_edit')) return false;

		// ROW EDIT : Close curent tr edit
		$('#'+vars.portal_tr_edit).css('display','none');//.find('.css_section_content').html('')

		// ROW LIST : Open current tr list
		$('#'+vars.portal_tr_list).css('display','table-row');
	};//end close_tr_edit__DEPRECATED
	*/

	

	/**
	* TOGGLE_MORE_ELEMENTS_CONTENT
	* Despliega los elementos plegados en los listados
	*//*
	this.toggle_more_elements_content = function (button_obj) {

		if ( $(button_obj).hasClass('portal_toggle_more_elements_minus') ) {
			// Is opened. Closing
			$(button_obj).parents('.row_portal_inside').first().find('.portal_more_elements_content').fadeOut(300)
			$(button_obj).removeClass('portal_toggle_more_elements_minus')

		}else{
			// Is close. Opening
			$(button_obj).parents('.row_portal_inside').first().find('.portal_more_elements_content').fadeIn(300)
			$(button_obj).addClass('portal_toggle_more_elements_minus')
		}
	};//end toggle_more_elements_content
	*/



	/**
	* OPEN_RECORD
	*/
	this.open_record = function(button_obj, url) {
	
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_portal:open_record: Sorry: wrap_div dom element not found")
			}			
			// Set portal as component to refresh
			html_page.add_component_to_refresh( wrap_div.id )

		var window_url	= url,
			window_name	= "Edit "+ encodeURIComponent(url),
			w_width		= screen.width,	
			w_height	= screen.height 

		
		if(SHOW_DEBUG===true) {
			// 01-05-2017 WORK
			window.location = window_url+"&menu=1";
			return false		
		}else{
			// Actual behavior
			var edit_window = window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height)
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
	
		var header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			var h4 = document.createElement("h4")
				h4.classList.add('modal-title')			
				// Add
				h4.appendChild(document.createTextNode(get_label.vincular_recurso))
				header.appendChild(h4)

		var body = document.createElement("div")
				var iframe = document.createElement("iframe")
					iframe.src = options.url
					iframe.style.width  = "100%"
					iframe.style.height = options.height
				// add
				body.appendChild(iframe)

		// modal dialog
		var modal_dialog = common.build_modal_dialog({
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
	*/
	this.render_html = function() {
		//console.log(this); //return;

		//if (this.component_tipo!='numisdata77' && this.component_tipo!='oh17' ) { return;}

		let self = this;

		// Place holder msg
		common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'loading blink',
									text_node 		: " Loading.. ",
									parent 			: document.getElementById(self.unic_id),
								})

		// DB ajax Call
		var js_promise = component_common.get_component_json_data(self).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_portal.render_html] response:", response);
			}			

			if (response && response.result) {

				let response_result = response.result		
			
				self.max_records 			= response_result.max_records
				self.component_info 	 	= (typeof(response_result.component_info)!="undefined") ? response_result.component_info : null			
				self.target_section_tipo 	= response_result.target_section_tipo || null
				self.label 					= response_result.label || null
				self.dato 					= response_result.dato || null
				let component_info 			= JSON.parse(self.component_info)	
				let edit_view 	   			= (component_info && typeof(component_info.propiedades.edit_view)!="undefined") ? component_info.propiedades.edit_view : null
				//edit_view = 'view_single_line'

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
					/*
						// TABLE
						// section_list_rows_content_div (container_fluid)
						var section_list_rows_content_div = common.create_dom_element({
												element_type 	: 'div',
												//id 				: "section_list_rows_content_div_" + self.component_tipo,
												id 				: "portal_table_" + self.component_tipo,
												class_name 	 	: 'container_fluid section_list_rows_content_div portal_table_wraper tbody '+ edit_view,
												parent 			: portal_section,
											})
						*/

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



	/**
	* BUILD_MORE_ITEMS_LINKS
	* @return DOM obj
	*/
	this.build_more_items_links = function(data) {

		var current = this
		var section_class_name = data.section_class_name
		var wrap = data.parent

		var showed_records = current.max_records + current.offset
			if (showed_records>current.n_rows) {
				showed_records = current.n_rows;
			}

		if (showed_records<current.n_rows) {

			var more_items_wrapper = common.create_dom_element({
								element_type 	: 'div',
								id 				: 'more_items_wrapper_' + current.component_tipo,
								class_name 	 	: 'more_items_wrapper ' + section_class_name,
								text_node 		: null,							
								parent 			: wrap,
							})
			
			var show_all_items = common.create_dom_element({
								element_type 	: 'a',								
								class_name 	 	: 'show_all_items ' + section_class_name,
								text_node 		: " Show all items ",
								custom_function_events : [{'type':'click','name':'component_portal.show_all_items','function_arguments':[current]}],
								parent 			: more_items_wrapper,
							})			

			var more_items_link = common.create_dom_element({
								element_type 	: 'a',
								id 				: 'more_items_' + current.component_tipo,
								class_name 	 	: 'more_items ' + section_class_name,
								text_node 		: " More items .. (" + showed_records + " of " + current.n_rows + ")",
								custom_function_events : [{'type':'click','name':'component_portal.get_more_items','function_arguments':[current]}],
								parent 			: more_items_wrapper,
							})

			// Fix var to modify later
			current.more_items_link = more_items_link

		}else{
			var more_items_wrapper = null
		}


		return more_items_wrapper
	};//end build_more_items_links



	/**
	* BUILD_ROWS
	* @return 
	*/
	this.build_rows = function(data) {
		
		var response 		= data.response 
		var parent 			= data.parent
		var column_width 	= data.column_width
		var edit_view 		= data.edit_view
		var result_len 		= data.result_len
		
		//console.log(response.propiedades.edit_view_options);
		switch(edit_view) {
			case "view_mosaic":
				var row_class_name 	= 'mosaic_li'
				var item_class_name = 'mosaic_item'
				if (typeof(response.propiedades.edit_view_options)!="undefined") {							
					var row_styles = {width  : response.propiedades.edit_view_options.element_width, height : response.propiedades.edit_view_options.element_height}
				}else{
					// Defaults
					var row_styles = null; //{width:'20%', height:'100px'}
				}
				column_width = null		
				break;
			default:
				var row_class_name 	 = 'table_row'
				var item_class_name  = 'column'
				var row_styles 		 = null
		}

		// columns		
		// console.log(response.rows_data_values);
		for (var i = 0; i < result_len; i++) {

			var row_obj = response.rows_data_values[i]
				
				if (typeof(row_obj)=="undefined") {

					console.log("key: "+i +" - result_len: "+result_len);
					console.log(response);
					return
				}

			// ROW 
			var table_row = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: row_class_name + ' portal_element_sortable',
									style 			: row_styles,
									data_set 		: {"dato":row_obj['locator']},									
									parent 			: parent,
								})
				
			// ITEMS (columns)							
			// Regular columns							
			for (var column_tipo in response.ar_columns) {					
				
				if (column_tipo==='edit') {continue;}
				
				// current_value
				var current_value = row_obj[column_tipo]
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
						var class_name = item_class_name + ' _tag_id ' + response.ar_columns[column_tipo].name
						break;
					default:
						var class_name = item_class_name + ' ' + response.ar_columns[column_tipo].name
						if(response.propiedades.hasOwnProperty('elements_list_mode')
							&& response.propiedades.elements_list_mode[column_tipo].hasOwnProperty('column_width')){
							column_width = response.propiedades.elements_list_mode[column_tipo].column_width
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
			switch(edit_view) {
				case 'view_single_line':
					var column_edit = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'column id_column',
									style 			: { "width" : column_width },
									inner_html 		: row_obj['edit']['edit'], // text_node | text_content | inner_html
									//parent 		: table_row,
								})
								table_row.insertBefore(column_edit, table_row.firstChild);
					var column_delete = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'column delete_column',
									style 			: { "width" : column_width },
									inner_html 		: row_obj['edit']['delete'], // text_node | text_content | inner_html
									parent 			: table_row,
								})
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
			exec_scripts_inside(table_row)	
		}//end for (var i = 0; i < result_len; i++)


		return true
	};//end build_rows



	/**
	* BUILD_
	* @return DOMB object
	*/
	this.build_header = function(data) {

		var response  	 = data.response
		var edit_view 	 = data.edit_view
		var column_width = data.column_width
		var parent 		 = data.parent
		var n_rows 		 = data.n_rows

		// On some views header is not showed
		if(edit_view==='view_mosaic' || n_rows<1) {
			return false;
		}
		
		// table_row_header
		var table_row_header = common.create_dom_element({
								element_type 	: 'div',
								class_name 	 	: 'table_row row_header',
								custom_function_events : [{'type':'dblclick','name':'component_portal.collapse_rows'}],
								parent 			: parent,
							})	

		// header columns
		for (var column_tipo in response.ar_columns) {
			// header column
			switch(column_tipo) {
				case 'edit':
					var class_name = 'column id_column '+ response.ar_columns[column_tipo].name
					break;
				case 'tag_id':
					var class_name = 'column _tag_id '+ response.ar_columns[column_tipo].name
					break;
				default:
					var class_name = 'column ' + response.ar_columns[column_tipo].name
					if(response.propiedades.hasOwnProperty('elements_list_mode')
						&& response.propiedades.elements_list_mode[column_tipo].hasOwnProperty('column_width')){
						column_width = response.propiedades.elements_list_mode[column_tipo].column_width
					}
			
			}
			


			var header_column = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: class_name,
									style 			: { "width" : column_width },
									text_node 		: response.ar_columns[column_tipo].label,
									parent 			: table_row_header,
								})
		}//end for (var i = 0; i < len; i++)
		if(edit_view==='view_single_line') {
			var header_column = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'column delete_column',
									style 			: { "width" : column_width },
									text_node 		: get_label.borrar,
									parent 			: table_row_header,
								})
		}

		return table_row_header
	};//end build_header



	/**
	* BUILD_ADD_BUTTONS
	* @return 
	*/
	this.build_add_buttons = function(data) {

		var response 	 = data.response 
		var content_data = data.parent
		var current  	 = data.current

		if(response.permissions>=2) {
		const len = response.ar_target_section_tipo.length
		for (var i = 0; i < len; i++) {
			var target_section_tipo = response.ar_target_section_tipo[i]
			// btn_new_ep
			var btn_new_ep = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'css_button_generic btn_new_ep',
									data_set 		: {
														portal_tipo 		: current.component_tipo,
														portal_parent 		: current.section_id,
														portal_section_tipo : current.section_tipo,
														target_section_tipo : target_section_tipo,
													  },
									parent 			: content_data,
									custom_function_events : [{'type':'click','name':'component_portal.new_portal_record'}],
								})
			var icon_new_ep = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'icon_bs link new_portal_record',
									parent 			: btn_new_ep,
								})
			var label_new_ep = common.create_dom_element({
									element_type 	: 'span',
									text_node 		: response.label,
									parent 			: btn_new_ep,
								})
			// btn_new_ep_find
			var btn_new_ep_find = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'css_button_generic btn_new_ep', // data-tipo="oh25" data-top_tipo="oh1" data-parent="1" data-section_tipo="oh1" data-target_section_tipo="rsc167"
									data_set 		: {
														tipo 				: current.component_tipo,
														top_tipo 			: page_globals.top_tipo,
														parent 				: current.section_id,
														section_tipo 		: current.section_tipo,
														target_section_tipo : target_section_tipo,
													  },
									parent 			: content_data,
									custom_function_events : [{'type':'click','name':'tool_common.open_tool_portal'}],
								})
			var icon_new_ep = common.create_dom_element({
									element_type 	: 'div',
									class_name 	 	: 'icon_bs link find_portal_record',
									parent 			: btn_new_ep_find,
								})
			var label_new_ep = common.create_dom_element({
									element_type 	: 'span',
									text_node 		: response.label,
									parent 			: btn_new_ep_find,
								})				
		}//end for (var i = 0; i < len; i++)
		}//end if(response.premissions>=2)

		// btn_new_ep_find
		let btn_view_toogle = common.create_dom_element({
								element_type 	: 'div',
								class_name 	 	: 'btn_view_toogle CREATED_IN_JS_BUILD_ADD_BUTTONS',
								data_set 		: {view : "full"},
								parent 			: content_data,
								custom_function_events : [{'type':'click','name':'component_portal.toggle_views'}],
							})
	};//end build_add_buttons
	


	/**
	* COLLAPSE_ROWS
	* @return 
	*/
	this.collapse_rows = function(button) {
		
		let container = button.parentNode;
		
		let ar_rows = container.querySelectorAll('.rows_wrapper')
		const len = ar_rows.length		
		for (var i = len - 1; i >= 0; i--) {
			if (ar_rows[i].style.display==='none') {
				ar_rows[i].style.display = ''				
			}else{
				ar_rows[i].style.display = 'none'
			}
		}
	};//end collapse_rows



	/**
	* GET_MORE_ITEMS
	* @return 
	*/
	this.get_more_items = function(button, event, instance, forced_offset) {
		//console.log(instance);
		var start = new Date().getTime();

		instance.max_records = instance.max_records || 5
		if (forced_offset) {
			instance.offset  = forced_offset
		}else{
			instance.offset  = parseInt(instance.offset) + parseInt(instance.max_records)
		}

		//console.log("instance.max_records: "+instance.max_records);
		//console.log("instance.offset: "+instance.offset);

		let wrap_div = component_common.get_wrapper_from_element(button)
			html_page.loading_content( wrap_div, 1 );

		component_common.get_component_json_data(instance).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("[component_portal.get_more_items] response",response);
				}

				if (response && response.result) {

					let response_result = response.result

					let showed_records = instance.max_records + instance.offset
					if (showed_records>instance.n_rows) {
						showed_records = instance.n_rows;
					}

					// Modify only more_items_link a content
					instance.more_items_link.innerHTML = " More items .. (" + showed_records + " of " + instance.n_rows + ")"

					//console.log("showed_records: " +showed_records + " - max_records: "+instance.max_records + " - offset: "+instance.offset + " - total: "+instance.n_rows );
					// Remove link "more items"
					if ( showed_records >= instance.n_rows ) {
						instance.more_items_links.remove() // Remove complete links wrapper
					}

					// ROWS
					let rows = instance.build_rows({
							response 	 : response_result, 
							column_width : instance.column_width,
							edit_view 	 : instance.edit_view,
							parent 		 : instance.rows_wrapper,
							result_len   : response_result.rows_data_values ? response_result.rows_data_values.length : 0 
						})
						

					// DEBUG
					if(SHOW_DEBUG===true) {
						let end  = new Date().getTime(); let time = end - start;
						console.log("[component_portal.get_more_items] -> Save response: "+ response.msg + " - execution time: " +time+' ms' );
					}

				}else{
					console.log("[component_portal.get_more_items] Error. response is null ", response );
				}

				html_page.loading_content( wrap_div, 0 );				
		})
	};//end get_more_items



	/**
	* SHOW_ALL_ITEMS
	* @return 
	*/
	this.show_all_items = function(button, event, instance) {
		
		let showed_records = instance.max_records + instance.offset
			if (showed_records>instance.n_rows) {
				showed_records = instance.n_rows;
			}

		instance.max_records = 10000

		let forced_offset	 = showed_records
			//console.log(showed_records);	console.log(instance); 


		instance.get_more_items(button, event, instance, forced_offset)
	};//end show_all_items



}//end class