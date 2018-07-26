"use strict"
/**
* COMPONENT_RELATION_RELATED
*
*
*/
var component_relation_related = new function() {


	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_LIB_BASE_URL + '/component_relation_related/trigger.component_relation_related.php';

	// autocomplete_trigger_url . For service autocomplete
	this.autocomplete_trigger_url = DEDALO_LIB_BASE_URL + '/component_autocomplete_hi/trigger.component_autocomplete_hi.php';



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
	};//end init



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {
	
		const self = this		
		
		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("component_relation_related:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato specific
		let dato = self.get_dato(wrap_div)

		// Set for save
		self.save_arguments.dato = dato

		// Exec general save
		const js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {

				// Action post save
		  		component_common.load_component_by_wrapper_id(wrap_div.id);

				}, function(xhrObj) {
				  	console.log(xhrObj);
				});

		return js_promise
	}//end Save



	/**
	* GET_DATO
	* @return array dato
	*//*
	this.get_dato = function( component_obj ) {
		
		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				return alert("component_relation_related:get_dato: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_related_input"]')
	
		// DATO. Iterate each input and store their value in the array 'dato'
		var dato = []
		var len  = input_elements.length
		for (var i = len - 1; i >= 0; i--) {
			
			var element = input_elements[i]
			if(element.value.length>1) {
				var locator = null;
				try {
				  locator = JSON.parse(element.value)
				} catch (e) {
				  console.log(e.message); // "missing ; before statement"
				  //return alert(e.message) 
				}
				if(locator)	dato.push( locator )
			}
		}

		return dato
	};//end get_dato
	*/



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return string dato
	*	json encoded data
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_relation_related:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const component_obj = wrapper_obj.querySelector('input.relation_related_dato_hidden')
		if (typeof(component_obj)==="undefined" || !component_obj) {
			console.log("[component_relation_related:get_dato] Error. Invalid component_obj");
			return false
		}

		let dato = []
		if (component_obj.value && component_obj.value.length>0) {
			dato = JSON.parse(component_obj.value) || []
		}
		

		return dato
	};//end get_dato


	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");		
		
		// If only one is present, we focus it on click wrapper
		let ar_input_text = obj_wrap.querySelectorAll('[data-role="component_relation_related_input"]')
			if (ar_input_text.length===1) {
				let input_text = ar_input_text[0]
				if(input_text) {
					input_text.focus();
				}
			}				
		
		return false;
	}//end select_component



	/**
	* OPEN_RELATED_SELECTOR_WINDOW
	* @return 
	*/
	var related_selector_window = null; // Global var
	this.opener_button = null;	// class var
	this.open_related_selector_window = function( button_obj ) {

		// Fix current button_obj as var
		this.opener_button = button_obj

		// context_name
		const context_name = 'select_related'
		
		const url = DEDALO_LIB_BASE_URL + '/main/?t=' + button_obj.dataset.target_section_tipo + '&context_name='+context_name
		const strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";

		if(related_selector_window === null || related_selector_window.closed) {
			related_selector_window = window.open(
			    url,
			    "related_selector_window",
			    strWindowFeatures
			);	
		}else{
			related_selector_window.focus();
		}
	};//end open_related_selector_window



	/**
	* ADD_RELATION_FROM_OPENED_WINDOW
	* Triggered from opened window button
	* @return 
	*/
	this.add_relation_from_opened_window = function( button_obj ) {

		let locator = button_obj.dataset.locator
		this.add_locator(locator)		

		// Close opened window
		if(related_selector_window) related_selector_window.close();
	};//end add_relation_from_opened_window



	/**
	* ADD_LOCATOR
	* Clone first DOM input element, update value with requested locator and
	* trigger save normally
	*/
	this.add_locator = function(locator, wrap_div, ui) {

		const self = this		

		// Related component data from received locator
		const locator_obj 			= (typeof locator==="string") ? JSON.parse(locator) : locator
		const target_section_tipo 	= locator_obj.section_tipo
		const target_section_id   	= locator_obj.section_id
	
		// WRAP_DIV
		if (typeof wrap_div==="undefined") {
			
			if (component_common.selected_wrap_div) {
				// From tree
				wrap_div = component_common.selected_wrap_div
				if (wrap_div === null ) {
					if(SHOW_DEBUG===true) console.log("add_locator selected_wrap_div",component_common.selected_wrap_div)
					return alert("component_relation_related:add_locator: Sorry: wrap_div dom element not found")
				}
			}else{
				// From list
				if(this.opener_button===null) return alert("Error. Button obj not found: opener_button")

				// From component wrapper
				wrap_div = find_ancestor(this.opener_button, 'wrap_component')
					if (wrap_div === null ) {
						if(SHOW_DEBUG===true) console.log("add_locator opener_button",this.opener_button)
						return alert("component_relation_related:add_locator: Sorry: wrap_div dom element not found")
					}
			}
		}
		
		const modo = wrap_div.dataset.modo // page_globals.modo
		switch(modo){
			case 'edit':
				// SAVE
				const trigger_url  = this.url_trigger
				const trigger_vars = {
						mode 	 			: 'add_related',
						tipo 	 			: wrap_div.dataset.tipo,
						parent	 		  	: wrap_div.dataset.parent,
						section_tipo 		: wrap_div.dataset.section_tipo,
						target_section_tipo : target_section_tipo,
						target_section_id   : target_section_id,
				}
				//console.log("[component_relation_related.add_locator] trigger_vars",trigger_vars); return

				let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
					if(SHOW_DEBUG===true) {
						console.log("[component_relation_related.add_locator] response",response)
					}

					// Reloads always the component
					component_common.load_component_by_wrapper_id( wrap_div.id )

					// Response is bool value decoded from json trigger response
					if (response && response.result===true) {
						
						// Inspector msg
						const label = wrap_div.querySelector("label").innerHTML
						const msg   = "<span class='ok'>" + label + " " + get_label.guardado + "</span>";
						inspector.show_log_msg(msg);
					}//end if (response===true) {
				})//end promise
				break;

			case "search":
			case "list":
				const hidden_input = wrap_div.querySelector("input.relation_related_dato_hidden")
				if (!hidden_input) {
					alert("[component_relation_related.add_locator] Error on get hidden_input")
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
							console.log("[component_autocomplete_hi.add_locator] Value already exits. Ignored value: "+JSON.stringify(locator)+" => "+label);
							return false
						}
					}

				// Limit (optional, defined in 'propiedades' and set on init)
				const limit = parseInt(hidden_input.dataset.limit)							
				if(limit>0 && parseInt(current_val.length)>=limit) {
					// Warning. Limit reached
					alert("[component_autocomplete_hi.add_locator] Limit reached ("+limit+"). Skipped term !!"); return false
				}else{
					// Add value to current object
					current_val.push(locator)
				}
		
				// Set modified value to component input as text
				const value_string = JSON.stringify(current_val)
				hidden_input.value = value_string
				hidden_input.setAttribute("value", value_string)

				const ul_valor = wrap_div.querySelector('.css_relation_related_valor')				
				
				// New li element
				const new_li = document.createElement('li')
				// button_delete
				const new_li_button_delete = document.createElement('div')
					new_li_button_delete.classList.add('icon_bs','link','css_relation_related_button_delete')
					new_li_button_delete.dataset.current_value = JSON.stringify(locator)
					new_li_button_delete.addEventListener('click', function(event){
						component_relation_related.delete(this)
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
					component_common.fix_dato(hidden_input,'component_relation_related')
				}
				break;
		}		


		//return js_promise
		return true
	};//end add_locator



	/**
	* REMOVE_LOCATOR
	* @return 
	*//*
	this.remove_locator = function( button_obj ) {

		if (page_globals.modo==='edit') {
			if (!confirm(get_label.seguro)) return false;
		}

		const locator = JSON.parse(button_obj.dataset.current_value)

		// From component wrapper
		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("component_relation_related:remove_locator: Sorry: wrap_div dom element not found")
			}

		const trigger_vars = {
				mode 	 			: 'remove_related',
				tipo 	 			: wrap_div.dataset.tipo,
				parent	 			: parseInt(wrap_div.dataset.parent),
				section_tipo 		: wrap_div.dataset.section_tipo,
				locator_to_delete 	: locator,
		}; //return console.log("[component_relation_related.remove_locator] trigger_vars",trigger_vars);

			// SAVE
		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){				
				if(SHOW_DEBUG===true) {
					console.log("[component_relation_related.remove_locator] response",response)
				}

				// Reloads always the component
				component_common.load_component_by_wrapper_id( wrap_div.id );

				if (response && response.result===true) {
					// Inspector msg
					const label = wrap_div.querySelector("label").innerHTML
					const msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
					inspector.show_log_msg(msg);
				}
			})//end promise
		

		return js_promise
	};//end remove_locator
	*/



	/**
	* DELETE . Only for search mode for the moment (NOT for edit)
	*/
	this.delete = function(btn_obj) {
	
		//if (page_globals.modo!=='list') {
		//	console.log("Only for search mode for the moment");
		//	return false;
		//}

		const self = this

		const value_to_remove = JSON.parse(btn_obj.dataset.current_value)
		
		// From component wrapper		
		const wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log("[component_relation_related:delete] btn_obj",btn_obj);
				return alert("[component_relation_related:delete] Sorry: wrap_div dom element not found")
			}

		// Set value to component hidden dato input		
		const input_text_hide = wrap_div.querySelector('input.relation_related_dato_hidden')
	
		let current_value = input_text_hide.value			
			current_value = JSON.parse(current_value)

		// Remove current value from array
		const len = current_value.length
		for(let i = len - 1; i >= 0; i--) {
			///console.log(current_value[i]); console.log(value_to_remove);
			if( JSON.stringify(current_value[i]) === JSON.stringify(value_to_remove) ) {			
			   current_value.splice(i, 1);
			   if(SHOW_DEBUG===true) {
					console.log("[component_relation_related:delete] deleted i:"+i+" "+JSON.stringify(value_to_remove)) ;
			   }
			}
		}

		// Update input value
		input_text_hide.value = JSON.stringify(current_value)			

		// Update showed text. Remove li element
		btn_obj.parentNode.remove();

		// Save when edit
		if (wrap_div.dataset.modo==='edit') {		
			self.Save(input_text_hide);
		}

		// Search component modo case
		if (wrap_div.dataset.modo==="search") {
			component_common.fix_dato(input_text_hide,'component_relation_related')
		}
	}//end delete



	/**
	* SHOW_RELATED_TERMS
	* Show and hide related terms data in ts_object content_data div
	*/
	this.show_related_terms = function(button_obj) {
		
		const html_data = " Hi html_data! "
		const role 	  	= 'related_terms'

		return ts_object.show_list_thesaurus_data(button_obj, html_data, role)
	};//end show_related_terms



	/**
	* OPEN_REALATED
	*/
	this.open_realated = function(button_obj) {

		let url = DEDALO_LIB_BASE_URL + '/main/?'
			url += 'm=edit&'
			url += 't=' + button_obj.dataset.section_tipo +'&'
			url += 'id=' + button_obj.dataset.section_id

		let relwindow = window.open(url ,'relwindow');
	};//end open_realated



	/**
	* LINK_TERM
	* Se llama aquí desde la ventana flotante del tesauro
	* @param object button_obj
	*	Botón del tesauro desde donde se hace click (contiene los datos su dataset)
	* @param object url_vars
	*	Objecto con las variables que la ventana del tesauro recibe y después vuelve a pasar de forma transparente
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		const locator = {
			"section_id" 	: section_id,
			"section_tipo"  : section_tipo
		}

		return this.add_locator( locator )
	};//end link_term



}//end component_relation_related