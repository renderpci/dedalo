"use strict";
/**
* COMPONENT_SELECT
*
*
*/
var component_select = new function() {


	this.save_arguments = {} // End save_arguments



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		const self = this
		
		if (options.mandatory && options.mandatory===true) {
			self.mandatory(options.id_wrapper)
		}

		// wrapper check and select
			const wrapper = document.getElementById(options.id_wrapper)
			if(!wrapper) {
				console.error("[component_select.init] wrapper not found!", options.id_wrapper)
				return;
			}

		// Check dato comparing wrapper dato and select dato
			const wrapper_dato 	= JSON.parse(wrapper.dataset.dato)
			const dato 			= self.get_dato(wrapper)
			if (dato.length===0 && wrapper_dato.length>0) {
				wrapper.innerHTML += '<div class="warning">Warning. Actual component dato is not in list values</div>';
			}

		// triggered_items (propiedades)
			const component_info = JSON.parse(wrapper.dataset.component_info)
			const propiedades 	 = component_info.propiedades
			if (propiedades.js) {
				window.ready(function(){
					self.exec_component_triggers(wrapper, propiedades, dato)
				})
			}

		return true
	};//end init



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const dato = []

		const component_obj = wrapper_obj.querySelector('select[data-role="component_select_selector"]')
		if (typeof(component_obj)==="undefined" || !component_obj) {
			console.log("[component_select:get_dato] Error. Invalid component_obj");
			return false
		}
		
		const select_value = component_obj.value
		if (select_value.length>0) {

			let value_obj = JSON.parse(select_value)

			// Add component specific properties
			if (value_obj) {
				// add from_component_tipo
				value_obj.from_component_tipo = wrapper_obj.dataset.tipo
				// add type
				value_obj.type = wrapper_obj.dataset.relation_type

				dato.push( value_obj )
			}			
		}		

		return dato
	};//end get_dato



	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {
		
		let search_value = ''
		let dato_parsed  = dato

		if (dato_parsed===null) {
			// Empty dato. Nothig to do
		}else if (!Array.isArray(dato_parsed)) {
			console.warn("Invalid dato for search (must be an array):", dato);
		}else{
			for (let i = 0; i < dato_parsed.length; i++) {
				search_value += JSON.stringify(dato_parsed[i])
				break; // Only one value is expected
			}
		}

		return search_value
	};//end get_search_value_from_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		const self = this

		const wrapper = find_ancestor(component_obj, 'wrap_component')
			if (wrapper === null ) {
				if(SHOW_DEBUG===true) {
					console.log("[component_select:Save] component_obj:",component_obj);
				} 
				return alert("[component_select:Save]: Sorry: wrapper dom element not found")
			}
		// Get dato
		const dato = self.get_dato(wrapper)

		// Store dato to save
		self.save_arguments.dato = dato

		// Exec general save
		const js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response){

			// mandatory test
			self.mandatory(wrapper.id)

			// triggered_items (propiedades)
			const component_info = JSON.parse(wrapper.dataset.component_info)
			const propiedades 	 = component_info.propiedades
			if (propiedades.js) {
				component_common.load_component_by_wrapper_id(wrapper.id)
			}

		})


		return js_promise
	};//end Save



	/**
	* EXEC_COMPONENT_TRIGGERS
	* @return 
	*/
	this.exec_component_triggers = function(wrapper, propiedades, dato) {
	
		let controller_data = []
		if(propiedades.controller === true){
			const controller = wrapper.querySelector(".components_controller")
			controller_data  = JSON.parse(controller.value) || [];
		}
		//console.log("[component_select.exec_component_triggers] controller_data",controller_data)
		
		const triggered_items = component_common.exec_component_triggers(propiedades.js, dato, controller_data)
		if(SHOW_DEBUG===true) {
			console.log("[component_select.exec_component_triggers] triggered_items:",triggered_items)
		}
		
		return true
	}//end exec_component_triggers



	/**
	* OPEN_SECTION
	* @return 
	*/
	this.open_section = function(button_obj) {
		
		let wrapper = find_ancestor(button_obj, 'wrap_component')
			if (wrapper === null ) {
				if(SHOW_DEBUG===true) {
					console.log("[component_select:open_section]", button_obj);
				}
				return alert("[component_select:open_section] Sorry: wrapper dom element not found")
			}

		let section_tipo = wrapper.dataset.referenced_section_tipo
			//console.log(section_tipo);

		let window_url	= DEDALO_LIB_BASE_URL + '/main/?t='+section_tipo
		let window_name	= "component_select_window";

		// Open and focus window
		let component_select_window=window.open(window_url, window_name, page_globals.float_window_features.small);
		component_select_window.focus()

		// REFRESH_COMPONENTS ADD PORTAL
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added
		wrapper = find_ancestor(button_obj, 'wrap_component')
			if (wrapper === null ) {
				if(SHOW_DEBUG===true) {
					console.log("[component_select:open_section] button_obj",button_obj);
				}
				return alert("[component_select:open_section] Sorry: wrapper dom element not found")
			}
		let wrapper_id = wrapper.id;
		//var wrapper_id = component_common.get_wrapper_id_from_element(button_obj);			
		html_page.add_component_to_refresh(wrapper_id);
	};//end open_section



	/**
	* MANDATORY
	* When input dataset mandatory var is true
	* Add class 'mandatory' to element (input) when content is empty
	*/
	this.mandatory = function(id_wrapper) {
	
		let wrapper = document.getElementById(id_wrapper)
			if (wrapper===null) {
				console.log("Error on select wrapper for id: "+id_wrapper);	
				return false;
			}

		let input_obj = wrapper.querySelector('select.css_select')

		if (this.is_empty_value(input_obj)===true) {
			input_obj.classList.add('mandatory')
		}else{
			input_obj.classList.remove('mandatory')
		}			
	};//end mandatory



	/**
	* IS_EMPTY_VALUE
	* @return bool
	*/
	this.is_empty_value = function(input_obj) {
		
		if (input_obj.value.length > 0) {
			return false
		}

		return true;
	};//end is_empty_value



	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {	
			
		obj_wrap.classList.add("selected_wrap");
		
		let select = obj_wrap.querySelector('select.css_select') //$(obj_wrap).find('select.css_select').first()
			if(select) {
				select.focus()				
			}				
		
		return false;
	};//end select_component



}//end component_select