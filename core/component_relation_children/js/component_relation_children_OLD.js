/**
* COMPONENT_RELATION_CHILDREN
*
*
*
*/
var component_relation_children = new function() {

	'use strict';

	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_CORE_URL + '/component_relation_children/trigger.component_relation_children.php';

	// autocomplete_trigger_url . For service autocomplete
	this.autocomplete_trigger_url = DEDALO_CORE_URL + '/component_autocomplete_hi/trigger.component_autocomplete_hi.php';



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		const self = this

		const wrapper = document.getElementById('wrapper_' + options.uid)
			if (!wrapper) {
				alert("Error on get component wrapper from uid: " + options.uid); return false
			}
		
		// Check exists dom autocomplete_wrapper
		const autocomplete_wrapper = document.getElementById('aw_' + options.uid)
			if (!autocomplete_wrapper) {
				alert("Error on get component autocomplete_wrapper from uid: " + options.uid); return false
			}

		// Init autocomplete service
		service_autocomplete.init({
			component_js  		 : self,
			autocomplete_wrapper : autocomplete_wrapper
		})


		return true
	}//end init



	/**
	* SAVE (Deprecated!)
	*//*
	this.Save = function(component_obj) {
		alert("Deprecated!!")
	
		this.save_arguments.dato 		= this.get_dato( component_obj );
		this.save_arguments.url_trigger = this.url_trigger
			//return 	console.log(this.save_arguments);

		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				return alert("component_relation_children:Save: Sorry: wrap_div dom element not found")
			}

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

		jsPromise.then(function(response) {
		  	// Action post save
		  	component_common.load_component_by_wrapper_id(wrap_div.id);
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});
	};
	*/



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return string dato
	*	json encoded data
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_relation_children:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const component_obj = wrapper_obj.querySelector('input.relation_children_dato_hidden')
		if (typeof(component_obj)==="undefined" || !component_obj) {
			console.log("[component_relation_children:get_dato] Error. Invalid component_obj");
			return false
		}

		let dato = []
		if (component_obj.value && component_obj.value.length>0) {
			dato = JSON.parse(component_obj.value) || []
		}
		

		return dato
	}//end get_dato



	/**
	* SELECT_COMPONENT
	* Change the the css to open the search input 
	* Display the buttons and options
	*/
	this.select_component = function(obj_wrap) {

		const buttons_and_fields 			= obj_wrap.querySelector(".buttons_and_fields")
		const component_options_container 	= obj_wrap.querySelector(".component_options_container")

		if(buttons_and_fields) {
			buttons_and_fields.style.display = "flex";
		}
		if(component_options_container){
			component_options_container.classList.add("component_options_container_active")
			const autocomplete_wrapper = component_options_container.querySelector(".autocomplete_wrapper")
			if(autocomplete_wrapper){
				const input_search_field = autocomplete_wrapper.querySelector("input")
				input_search_field.focus()
				input_search_field.click()
			}
		}

		return true;
	};//end select_component



	/**
	* UNSELECT_COMPONENT
	* Remove the visualitzaction of the search input
	* Remove the visualitzaction the buttons and options
	*/
	this.unselect_component = function(obj_wrap){

		const buttons_and_fields = obj_wrap.querySelector(".buttons_and_fields")
		if(buttons_and_fields) {
			buttons_and_fields.style.display = "none";
		}

		const component_options_container = obj_wrap.querySelector(".component_options_container")
		if(component_options_container){
			component_options_container.classList.remove("component_options_container_active")
		}		

		return true;
	};//end unselect_component



	/**
	* OPEN_CHILDREN_SELECTOR_WINDOW
	* @return 
	*/
	var children_selector_window = null; // Global var
	this.opener_button = null;	// class var
	this.open_children_selector_window = function( button_obj ) {

		// Fix current button_obj as var
		this.opener_button = button_obj
		
		// context_name
		const context_name = 'select_children'
				
		const url = DEDALO_CORE_URL + '/main/?t=' + button_obj.dataset.target_section_tipo + '&context_name='+context_name
		const strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
			//strWindowFeatures=null
		if(children_selector_window === null || children_selector_window.closed) {
			children_selector_window = window.open(
			    url,
			    "children_selector_window",
			    strWindowFeatures
			);	
		}else{
			children_selector_window.focus();
		}

		return true
	}//end open_children_selector_window



	/**
	* ADD_RELATION_FROM_OPENED_WINDOW
	* Triggered from opened window button
	* @return 
	*/
	this.add_relation_from_opened_window = function( button_obj ) {

		const locator = button_obj.dataset.locator

		this.add_children(locator)

		// Close opened window
		if(children_selector_window) children_selector_window.close();

		return true
	}//end add_relation_from_opened_window



	/**
	* ADD_LOCATOR
	* Alias of add_children for unified interface
	* @return 
	*/
	this.add_locator = function(locator, wrap_div, ui) {
		
		return this.add_children(locator, wrap_div, ui)
	}//end add_locator



	/**
	* ADD_CHILDREN
	* Clone first DOM input element, update value with requested locator and
	* trigger save normally
	*/
	this.add_children = function(locator, wrap_div, ui) {

		const self = this

		// Children component data from received locator
		const locator_obj 		  = (typeof locator==='string') ? JSON.parse(locator) : locator
		const target_section_tipo = locator_obj.section_tipo
		const target_section_id   = locator_obj.section_id

		// WRAP_DIV
		if (typeof wrap_div==="undefined") {

			if (component_common.selected_wrap_div) {
				// From tree
				wrap_div = component_common.selected_wrap_div
				if (wrap_div === null ) {
					if(SHOW_DEBUG===true) console.log(component_common.selected_wrap_div);
					return alert("[component_relation_children.add_children] Sorry, wrap_div dom element not found")
				}
			}else{
				// From list
				if(self.opener_button===null) return alert("[component_relation_children.add_children] Error. Button obj not found: opener_button");

				// From component wrapper
				wrap_div = find_ancestor(self.opener_button, 'wrap_component')
					if (wrap_div === null ) {
						if(SHOW_DEBUG===true) console.log(self.opener_button);
						return alert("[component_relation_children.add_children] Sorry, wrap_div dom element not found")
					}
			}
		}

		switch(page_globals.modo){
			case 'edit':
				// SAVE
				const trigger_url  = self.url_trigger
				const trigger_vars = {
						mode 	 			: 'add_children',
						tipo 	 			: wrap_div.dataset.tipo,
						parent	 		  	: wrap_div.dataset.parent,
						section_tipo 		: wrap_div.dataset.section_tipo,
						target_section_tipo : target_section_tipo,
						target_section_id   : target_section_id,
					}
					//return console.log("[component_relation_children.add_children] trigger_vars",trigger_vars);
								
				let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
					if(SHOW_DEBUG===true) {
						console.log("[component_relation_children.add_children] response",response, wrap_div.id)
						//console.trace()
					}			

					// Response is bool value decoded from json trigger response
					if (response && response.result===true) {
						
						// Inspector msg
						const label = wrap_div.querySelector("label").innerHTML || "no label"
						const msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
						inspector.show_log_msg(msg);					
					}//end if (response===true)

					// Reloads always the component
					component_common.load_component_by_wrapper_id( wrap_div.id ).then(function(response){
						//let new_wrap = document.getElementById(wrap_div.id)						
					})

				})//end promise
				break;

			case "search":
			case "list":
				const hidden_input = wrap_div.querySelector("input.relation_children_dato_hidden")
				if (!hidden_input) {
					alert("[component_relation_children.add_locator] Error on get hidden_input")
					return false
				}

				// Get current hidden input value
				const current_input_value = hidden_input.value || '[]';
				//console.log(current_input_value); return;

				// parse josn string value to object
				const current_val = JSON.parse( current_input_value ) || []
					
					// check if value already exits
					for (let key in current_val) {
						if(JSON.stringify(current_val[key]) === JSON.stringify(locator)){
							console.log("[component_relation_children.add_locator] Value already exits. Ignored value: "+JSON.stringify(locator)+" => "+label);
							return false
						}
					}

				// Limit (optional, defined in 'propiedades' and set on init)
				const limit = parseInt(hidden_input.dataset.limit)							
				if(limit>0 && parseInt(current_val.length)>=limit) {
					// Warning. Limit reached
					alert("[component_relation_children.add_locator] Limit reached ("+limit+"). Skipped term !!"); return false
				}else{
					// Add value to current object
					current_val.push(locator)
				}
			
				// Set modified value to component input as text
				const value_string = JSON.stringify(current_val)
				hidden_input.value = value_string
				hidden_input.setAttribute("value", value_string)
				
				const ul_valor = wrap_div.querySelector('.css_relation_children_valor')
				
				// New li element
				const new_li = document.createElement('li')
				// button_delete
				const new_li_button_delete = document.createElement('div')
					new_li_button_delete.classList.add('icon_bs','link','css_relation_children_button_delete')
					new_li_button_delete.dataset.current_value = JSON.stringify(locator)
					new_li_button_delete.addEventListener('click', function(event){
						component_relation_children.delete(this)
					}, false);
				// label
				const new_li_label = document.createElement('span')
					new_li_label.innerHTML = ui.item.label

					new_li.appendChild(new_li_button_delete)
					new_li.appendChild(new_li_label)

				// Add created li to ul
				ul_valor.appendChild(new_li)

				// Search component modo case
				if (wrap_div.dataset.modo==="search") {
					component_common.fix_dato(hidden_input,'component_relation_children')
				}				
				break;
		}


		//return js_promise	
		return true
	}//end add_children



	/**
	* REMOVE_CHILDREN
	*/
	this.remove_children = function( button_obj ) {

		if (!confirm(get_label.seguro)) return false;

		// From component wrapper
		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("component_relation_children:remove_children: Sorry: wrap_div dom element not found")
			}
		// Values from wrapper
		const parent 				= parseInt(wrap_div.dataset.parent)
		const tipo 					= wrap_div.dataset.tipo
		const section_tipo 			= wrap_div.dataset.section_tipo
		// Values from button
		const current_value 		= JSON.parse(button_obj.dataset.current_value)
		const target_section_tipo 	= current_value.section_tipo
		const target_section_id 	= parseInt(current_value.section_id)
			
		const trigger_url  = this.url_trigger
		const trigger_vars = {
			mode 	 			: 'remove_children',
			tipo 	 			: tipo,
			parent	 			: parent,
			section_tipo 		: section_tipo,
			target_section_tipo : target_section_tipo,
			target_section_id	: target_section_id
		}; //return console.log(trigger_vars);

		// SAVE
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_relation_children.remove_children] response",response, wrap_div.id)
				//console.trace()
			}

			// Reloads always the component
			component_common.load_component_by_wrapper_id( wrap_div.id );

			if (response && response.result===true) {
				// Inspector msg
				var label = wrap_div.querySelector("label").innerHTML || "no label"
				var msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
				inspector.show_log_msg(msg);
			}
		})//end promise	

		return js_promise			
	}//end remove_children



	/**
	* DELETE . Only for search mode for the moment (NOT for edit)
	*/
	this.delete = function(btn_obj) {
	
		if (page_globals.modo!=='list') {
			console.log("Only for search mode for the moment");
			return false;
		}

		const value_to_remove = JSON.parse(btn_obj.dataset.current_value)
		
		// From component wrapper		
		const wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log("[component_relation_children:delete] btn_obj",btn_obj);
				return alert("[component_relation_children:delete] Sorry: wrap_div dom element not found")
			}

		// Set value to component hidden dato input		
		const input_text_hide = wrap_div.querySelector('input.relation_children_dato_hidden')
	
		let current_value = input_text_hide.value			
			current_value = JSON.parse(current_value)

		// Remove current value from array
		const len = current_value.length
		for(let i = len - 1; i >= 0; i--) {
			///console.log(current_value[i]); console.log(value_to_remove);
			if( JSON.stringify(current_value[i]) === JSON.stringify(value_to_remove) ) {			
			   current_value.splice(i, 1);
			   if(SHOW_DEBUG===true) {
					console.log("[component_relation_children:delete] deleted i:"+i+" "+JSON.stringify(value_to_remove)) ;
			   }
			}
		}

		// Update input value
		input_text_hide.value = JSON.stringify(current_value)			

		// Update showed text. Remove li element
		btn_obj.parentNode.remove();

		// Save when edit
		//if (page_globals.modo==='edit') {		
		//	this.Save(input_text_hide);
		//}

		// Search component modo case
		if (wrap_div.dataset.modo==="search") {
			component_common.fix_dato(input_text_hide,'component_relation_children')
		}
	}//end delete



	/**
	* LINK_TERM
	* Se llama aquí desde la ventana flotante del tesauro
	* @param object button_obj
	*	Botón del tesauro desde donde se hace click (contiene los datos su dataset)
	* @param object url_vars
	*	Objecto con las variables que la ventana del tesauro recibe y después vuelve a pasar de forma transparente
	*/
	this.link_term = function( section_id, section_tipo, label ) {
	
		var locator = {
			"section_id" 	: section_id,
			"section_tipo"  : section_tipo
		}

		return this.add_children( locator )
	}//end link_term



}//end component_relation_children