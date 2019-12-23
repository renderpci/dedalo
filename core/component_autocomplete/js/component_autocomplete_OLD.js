/**
* COMPONENT_AUTOCOMPLETE
*
*
*
*/
var component_autocomplete = new function() {

	'use strict';

	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_autocomplete/trigger.component_autocomplete.php'
	this.ajax_container
	this.tipo
	this.parent
	this.current_tipo_section
	this.propiedades
	this.label
	this.wrapper_id
	this.cookie_name;
	this.limit = 0; // Max items to manage (zero to unlimited)
	this.save_arguments = {}


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		const self = this;

		const wrapper = document.getElementById(options.wrapper_id)	
			if (wrapper===null) {
				console.log("Error. Wrapper not found. " + options.wrapper_id);
				return false;
			}

		/*
		// Init filter by list
		self.init_filter_by_list({
			wrapper  	: wrapper,
			cookie_name : options.cookie_name,
			limit 		: options.limit
		})
		*/

		const autocomplete_wrapper = document.getElementById('aw_' + options.uid)
			if (!autocomplete_wrapper) {
				alert("Error on get component autocomplete_wrapper from uid: " + options.uid); return false
			}
	
		// Init autocomplete service
		service_autocomplete.init({
			component_js  		 : self,
			autocomplete_wrapper : autocomplete_wrapper
		})

		// Avoid component_options_container propagate click event and deselect current wrapper
		//const wrapper = document.getElementById(options.wrapper_id)
		/*wrapper.querySelector(".component_options_container").addEventListener("click", function(event) {
			event.preventDefault()
			event.stopPropagation()
		}, false);
		*/		

		return true
	};//end init



	/**
	* GET_DATO
	* dato is a string value from input hidden that contains a json encoded array of locators
	* @param DOM object wrapper_obj
	* @return string dato
	*/
	this.get_dato = function(wrapper_obj) {
	
		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_autocomplete:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const component_obj = wrapper_obj.querySelector('input[data-role="dato_hidden"]')
		if (typeof(component_obj)==="undefined" || !component_obj) {
			console.log("[component_autocomplete:get_dato] Error. Invalid component_obj");
			return false
		}

		let dato = []
		if (component_obj.value && component_obj.value.length>0) {
			dato = JSON.parse(component_obj.value) || []
		}
		

		return dato
	};//end get_dato



	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {
		
		const dato_parsed  = dato
		
		const search_value = JSON.stringify(dato_parsed)
		if(SHOW_DEBUG===true) {
			console.log("[component_autocomplete] search_value:",search_value, dato);
		}
		

		return search_value
	};//end get_search_value_from_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj, request_options) {

		const self = this
		
		if (!component_obj) {
			console.log("component_obj is null: ", component_obj);
			return false
		}		
		
		// From component wrapper
		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				alert("component_autocomplete:Save: Sorry: wrap_div dom element not found")
				return false
			}

		if(wrap_div.dataset.modo!=='edit' && wrap_div.dataset.modo!=='portal_list') {
			console.log("Ignored modo on save: ", wrap_div.dataset.modo )
			return false;
		}

		// save_options		
		const save_options = typeof request_options!=="undefined" ? request_options : {}
			//console.log("save_options:",save_options);

		// dato
		const dato = self.get_dato(wrap_div)
		
		// Set save_arguments
		self.save_arguments.dato = dato

		// Exec general save
		const js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {
				if(SHOW_DEBUG===true) {
					//console.log("[component_autocomplete.Save] response",response)
				}
				if (save_options.reload===true) {
					component_common.load_component_by_wrapper_id(wrap_div.id)
				}	
		}, function(xhrObj) {
			console.log("[component_autocomplete.Save] Error xhrObj",xhrObj);
		});


		return js_promise
	};//end Save



	/**
	* ON_SELECT
	* Default action on autocomplete select event
	* @return bool true
	*/
	this.on_select = function(options) {
		
		const self = this

		// Prevent set selected value to autocomplete input
		//options.event.preventDefault()
		
		// Clean input value
			options.input_obj.value = ''
		
		const input_obj 	= options.input_obj
		const wrap_div 		= options.wrap_div
		const hidden_input  = wrap_div.querySelector('[data-role="dato_hidden"]')
		const div_valor		= wrap_div.querySelector('[data-role="autocomplete_valor"]')

		// Base vars
			const ui 	= options.ui
			const label = ui.item.label
			const value = JSON.parse(ui.item.value)
	
		if (value && typeof value==='object') {

			// Input text hidden tracks component value
				const current_input_value 	= hidden_input.value || '[]'		
			
			// parse json stored array of locators value
				const current_val 			= JSON.parse( current_input_value )
			
			// New value selected in list. Parse to proper compare with ar locator values
				const new_value 			= value
			
			// check if value already exits
				for (let key in current_val) {
					//if (JSON.stringify(current_val[key]) === JSON.stringify(new_value)) {
					// Compare js objects, NOT stringify the objects (fail somtimes)
					if (is_obj_equal(current_val[key], new_value)) {
						console.log("Value already exists (1). Ignored value: "+JSON.stringify(new_value)+" => "+label)
						return;
					}
				}
			
			// limit check
				const current_val_length = current_val.length + 1
				const limit 			 = parseInt(wrap_div.dataset.limit)
				if (limit>0 && (current_val_length > limit)) {
					alert (get_label.exceeded_limit + " " + limit)
					return false
				}

			// Add new value to array
				current_val.push( new_value )

			//return console.log("current_val",current_val)
			//console.log(page_globals.modo);

			// input hidden . Set value to component input
				hidden_input.value = JSON.stringify(current_val)
				//console.log("hidden_input.value", hidden_input.value);
	
			// modo switch
				const modo = page_globals.modo				
				switch(modo){
					case 'edit': 
						// Save value 
							self.Save(hidden_input, {"reload":true})
						break;				
					case 'tool_import_files': 
						// Add value to list
							self.add_value_to_list(div_valor, value, label)				
						break;
					case 'tool_description': 
						// Save value 
							self.Save(hidden_input, {"reload":false})
						// Reload window to force reload component in tool_description mode again
							window.location.reload(false)
						break;
					case 'search':
					case 'list':
					default:
						// Component showed in search form
							component_common.fix_dato(input_obj,'component_autocomplete')
						// Add value to list
							self.add_value_to_list(div_valor, value, label)
						break;
				}
		}

		// Search component mode
		//if (wrap_div.dataset.modo==="search") {
		//	component_common.fix_dato(hidden_input,'component_autocomplete')
		//}				

		// Blur input
			options.input_obj.blur()

		return true
	};//end on_select



	/**
	* ADD_VALUE_TO_LIST
	* Add a new value to component list html (ul-li) 
	* @return bool
	*/
	this.add_value_to_list = function(div_valor, value, label) {

		// li element
			const new_li = common.create_dom_element({					
					element_type	: 'li',					
					parent			: div_valor
				})

		// button delete
			const button_delete = common.create_dom_element({					
					element_type	: 'div',
					class_name		: 'icon_bs link css_autocomplete_button_delete',
					dataset			: { current_value : JSON.stringify(value) },
					parent			: new_li
				})
				.addEventListener('click', function(event){
					component_autocomplete.delete(this)
				}, false)

		// label
			common.create_dom_element({
					element_type	: 'span',
					text_content 	: label,					
					parent			: new_li
				})

		return true
	};//end add_value_to_list



	/**
	* ADD_LOCATOR
	* @return 
	*/
	this.add_locator = function() {
		
		return true
	};//end add_locator



	/**
	* DELETE
	*/
	this.delete = function(btn_obj) {

		const self = this		

		const wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				return alert("[component_autocomplete:delete]: Sorry: wrap_div dom element not found")
			}

		if (wrap_div.dataset.modo==='edit') {
			if( !confirm( get_label.esta_seguro_de_borrar_este_registro ) ) return false;
		}

		const input_text_hide = wrap_div.querySelector('[data-role="dato_hidden"]')
			if (!input_text_hide) {
				return alert("[component_autocomplete:delete]: Sorry: input_text_hide dom element not found")
			}

		const tipo 				= wrap_div.dataset.tipo
		const parent 			= wrap_div.dataset.parent
		const section_tipo 		= wrap_div.dataset.section_tipo
		const value_to_remove 	= JSON.parse(btn_obj.dataset.current_value)


		let dato = input_text_hide.value;
			dato = JSON.parse(dato)

		if(SHOW_DEBUG===true) {
			console.log("[component_autocomplete:delete] Current dato :",dato);
			console.log("[component_autocomplete:delete] Dato to delete :",value_to_remove);
		}
	
		// Remove current value from array
		//dato.splice( dato.indexOf(value_to_remove), 1 );		
		// Remove current value from array
		const dato_len 				= dato.length
		const value_to_remove_str 	= JSON.stringify(value_to_remove)
		for(let i = dato_len - 1; i >= 0; i--) {
			if( JSON.stringify(dato[i]) === value_to_remove_str ) {
				dato.splice(i, 1)
			}
		}

		// UPDATE Final input value (dato stringnified)
		input_text_hide.value = JSON.stringify(dato);
	
		//switch(page_globals.modo) {
		switch(wrap_div.dataset.modo) {
			case 'edit' :
				// Save when edit
				const save = self.Save(input_text_hide)
				if (save) {
					save.then(function(response){
						if(SHOW_DEBUG===true) {
							//console.log("component_autocomplete.delete response: ",response);
						}
						// Update showed text. Remove li element
						btn_obj.parentNode.remove();
					})
				}
				if (page_globals.modo==="tool_description") {
					// Reload window to force reload component in tool_description mode again
					window.location.reload(false)
				}
				break;
			case 'search':
			case 'list':
				// Component showed in search form
				component_common.fix_dato(btn_obj,'component_autocomplete')
				// Update showed text. Remove li element
				btn_obj.parentNode.remove();
				break;
			default:
				wrap_div.dataset.dato = "[]"
				btn_obj.parentNode.remove();
				break;
		}
		
		return true
	};//end delete



	/**
	* SELECT_COMPONENT
	* Change the the css to open the search input 
	* Display the buttons and options
	*/
	this.select_component = function(obj_wrap) {

		if (page_globals.modo==='tool_time_machine') {
			return true;
		}
	
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
				if (input_search_field) {
					input_search_field.focus()
					input_search_field.click()
				}				
			}
		}

		return true;
	};//end select_component



	/**
	* UNSELECT_COMPONENT
	* Remove the visualization of the search input
	* Remove the visualization the buttons and options
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
	* NEW_ELEMENT
	*/
	this.new_element = function(button_obj) {

		const self = this

		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("component_autocomplete:new_element: Sorry: wrap_div dom element not found")
			}

		const id_wrapper = wrap_div.id

		//const wrap_div 				= document.getElementById(id_wrapper),	//$(button_obj).parents('.wrap_component:first'),
		const tipo 						= wrap_div.dataset.tipo
		const parent 					= wrap_div.dataset.parent
		const section_tipo				= wrap_div.dataset.section_tipo
		const ar_target_section_tipo 	= wrap_div.dataset.ar_target_section_tipo
		const target_section_tipo 		= button_obj.dataset.target_section_tipo
		const tipo_to_search 			= wrap_div.dataset.tipo_to_search
		const component_info 			= wrap_div.dataset.component_info
		const component_info_obj 		= JSON.parse(component_info)
		const propiedades 				= component_info_obj.propiedades
		const ajax_container 			= wrap_div.querySelector('[data-role="new_element_container"][data-tipo="'+tipo+'"]')

		//if (wrap_div.find('.component_autocomplete_new_element').length>0 ) {
		const component_autocomplete_new_element = ajax_container.querySelector('input.button_submit_new_element')
		if( component_autocomplete_new_element ) {

			ajax_container.innerHTML = ''
			ajax_container.style.display = 'none'
			if(SHOW_DEBUG===true) {
				console.log("Ya exite el component_autocomplete_new_element ("+id_wrapper+"). Lo ocultamos solamente")
			}			
			return false;

		}else{
			ajax_container.style.display = ''
			// Reset all
			//ajax_container.innerHTML = ''
			//ajax_container.style.display = 'block'

			// Remove all existing ajax_container
			/*let len = ar_ajax_container.length
			for (let i = len - 1; i >= 0; i--) {
				ar_ajax_container[i].innerHTML = '';
				ar_ajax_container[i].style.display = 'block'
			};*/
		}

		//html_page.loading_content( wrap_div, 1 );
		ajax_container.innerHTML = '<span class=""> Loading.. </span>'
		
		const trigger_url  = self.url_trigger
		const trigger_vars = { 
				mode				: 'new_element',
				tipo				: tipo,
				parent				: parent,
				section_tipo		: section_tipo,
				target_section_tipo : target_section_tipo,
				tipo_to_search		: tipo_to_search,
				top_tipo			: page_globals.top_tipo
			}; //return console.log(trigger_vars)

		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_autocomplete.new_element] response debug:",response.debug)
				}
				//html_page.loading_content( wrap_div, 0 );
				if (response===null) {
					ajax_container.innerHTML = "<pre>An error has occurred. Null data is received</pre>";
				}else{
					
					// Draw trigger html response		
					ajax_container.innerHTML = response.result;
					
					// Exec script inside html code
					exec_scripts_inside(ajax_container)

					// Focus first input text
					ajax_container.getElementsByTagName('input')[0].focus()

					// EVENT HANDLER FOR ENTER KEY (13)
					ajax_container.addEventListener("keypress", function(event){
						if (event.keyCode===13) {
							const button_submit = ajax_container.querySelector('.button_submit_new_element')
								button_submit.click();
						};
					})
				}
		}, function(error) {
				const msg = "<span class='error'>ERROR: on get new_element</span>";
				inspector.show_log_msg(msg);
				console.error("[component_autocomplete.new_element] Failed get_json!", error);
		})//end js_promise


		return js_promise
	};//end new_element



	/**
	* SUBMIT_NEW_ELEMENT
	*/
	this.submit_new_element = function(button_obj) {

		const self = this

		// From component wrapper
		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				return alert("component_autocomplete:submit_new_element: Sorry: wrap_div dom element not found")
			}

		//let	ajax_container  = self.ajax_container		
		//let	wrap_div 		= self.wrap_div		
		const target_section_tipo 	= button_obj.dataset.target_section_tipo
		const tipo 					= wrap_div.dataset.tipo
		const hidden_input 			= wrap_div.querySelector('input[data-role="dato_hidden"][data-tipo="'+tipo+'"]')
		const ajax_container 		= wrap_div.querySelector('[data-role="new_element_container"][data-tipo="'+tipo+'"]')
		const ar_wrappers 			= ajax_container.querySelectorAll('.wrap_component')

		// ar_data recoge en formato 'Object {rsc214: "vag"}' los datos de tipo-valor de los input text del formulario, para pasarlos al post
		const ar_data  	= {}
		let is_empty 	= false
		const len 	 	= ar_wrappers.length
		for (let i = 0; i < len; i++) {

			// wrap div
			const current_wrapper = ar_wrappers[i]

			let component_tipo 	= current_wrapper.dataset.tipo
			let component_name  = current_wrapper.dataset.component_name

			if ( (window[component_name].get_dato instanceof Function)===false ) {
				console.error("Skipped component_name:"+component_name+" (function get_dato not found in component class): ", window[component_name]);
				continue;
			}			

			// Get dato from components standar function 'get_dato'
			let dato = window[component_name].get_dato(current_wrapper)
				//console.log(component_name+" dato:",dato);
			
			// When first value is empty, alert and return
			if (i==0 && dato.length<1 && component_name==="component_input_text") {
				is_empty=true;
				return alert("Empty data")
			}else{
				ar_data[component_tipo] = dato
			}
		};//end for (let i = 0; i < len; i++)

		if (is_empty===true) {
			console.log("[component_autocomplete.submit_new_element] Empty data. Nothing is saved!");
			if(SHOW_DEBUG===true) {
				alert("Error on add")
			}
			return false;
		}		

		//ajax_container.style.display = 'none';
		ajax_container.innerHTML = '<span class=""> Loading.. </span>'
		
		const trigger_url  = self.url_trigger
		const trigger_vars = { 
				mode				: 'submit_new_element',
				tipo				: wrap_div.dataset.tipo,
				parent			  	: wrap_div.dataset.parent,
				section_tipo		: wrap_div.dataset.section_tipo,
				target_section_tipo : target_section_tipo,
				ar_data			  	: JSON.stringify(ar_data),
				top_tipo			: page_globals.top_tipo
			  }
			  //console.log("trigger_vars:",trigger_vars); return;
		
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_autocomplete.submit_new_element] response",response)
				}
				//html_page.loading_content( wrap_div, 0 );
				if (response===null) {
					ajax_container.innerHTML = "<pre>An error has occurred. Null data is received</pre>";
				}else{
					
					// Current stored dato
					const current_dato = self.get_dato(wrap_div)

					// Add trigger response dato locator to array
					if (current_dato && response.result) {

						// Add new locator to current dato
						current_dato.push( response.result )
						if(SHOW_DEBUG===true) {
							//console.log("[component_autocomplete.submit_new_element] current_dato:", current_dato);
						}

						// INPUT HIDDEN . Set new value to component input
						hidden_input.value = JSON.stringify(current_dato)

						// Save and reload
						self.Save(hidden_input,{"reload":true})
					}
				}
		}, function(error) {
				const msg = "<span class='error'>ERROR: on get submit_new_element</span>"
				inspector.show_log_msg(msg)
				console.error("[component_autocomplete.submit_new_element] Failed get_json!", error)
		})//end js_promise


		return js_promise;
	};//end submit_new_element



	/**
	* OPEN_ELEMENT. Tree mode
	* @param dom element button_obj
	* @return bool true
	*/
	this.open_element = function(button_obj) {

		const tipo = button_obj.dataset.section_tipo
		const id   = button_obj.dataset.section_id
		const modo = button_obj.dataset.modo
		const menu = button_obj.dataset.menu || 1

		let window_url  = '?t=' + tipo + '&id=' + id + '&m=' + modo
		const window_name = 'Edit element ' + tipo + ' ' + id

		let window_features = page_globals.float_window_features.small



		// REFRESH_COMPONENTS ADD PORTAL
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added
		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("component_autocomplete:open_element: Sorry: wrap_div dom element not found")
			}

		const component_info = JSON.parse(wrap_div.dataset.component_info)
		const external_data = component_info.external_data

		if(typeof external_data !== 'undefined'){
			const external_engine = external_data.reduce( (acumulator,item) => {
				return item.section_tipo === tipo ? item : acumulator
			}, false)
			if (external_engine) {
				const ui_base_url = external_engine.ui_base_url
				window_url = ui_base_url+id
				window_features = 'menubar=no,location=no,resizable=yes,scrollbars=yes,status=no,width=850,height=850'
			}
		}else{
			// Refresh component on come back to window	
			html_page.add_component_to_refresh(wrap_div.id);
		}

		const edit_elemet_window = window.open(window_url, window_name, window_features);
			  edit_elemet_window.focus()
		
		return true
	};//end open_element



};//end component_autocomplete