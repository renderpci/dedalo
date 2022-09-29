/**
* COMPONENT_RADIO_BUTTON
*
*
*
*/
var component_radio_button = new function() {

	"use strict";


	this.radio_button_objects 	= {}
	this.save_arguments 		= {}


	/**
	* INIT
	* @return
	*/
	this.init = function( options) {

    	const self = this

		// mandatory
			if(options.mandatory && options.mandatory===true) {
				self.mandatory(options.wrapper_id)
			}

		// triggered_items (propiedades)
			const wrapper_obj 	 = document.getElementById(options.wrapper_id)
			const component_info = JSON.parse(wrapper_obj.dataset.component_info)
			const propiedades 	 = component_info.propiedades

		// triggers
			if (propiedades.js!==undefined) {
				window.ready(function(){

					const dato 			  = self.get_dato(wrapper_obj)
					const triggered_items = component_common.exec_component_triggers(propiedades.js, dato)
				})
			}


		return true
	};//end init



	/**
	* GET_DATO
	* update 13-01-2018
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const dato = []

		// ul list of inputs
		const li_nodes = wrapper_obj.getElementsByTagName('li') //wrapper_obj.querySelector('ul.radio_button_ul_list')

		// li elements
		//let li_nodes = parent_ul.childNodes

		const len = li_nodes.length
		for (let i = 0; i < len; i++) {
			let current_radio_button 		 = li_nodes[i].getElementsByTagName('input')[0]
			let current_radio_button_checked = current_radio_button.checked
			if(current_radio_button_checked===true){
				dato.push( JSON.parse(current_radio_button.value) )
			}
		}

		return dato
	};//end get_dato



	/**
	* GET_PREVIOUS_DATO(WRAP_DIV)
	* @return
	*/
	this.get_previous_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_previous_dato] Error. Invalid wrapper_obj");
			return false
		}
		const previous_dato = JSON.parse(wrapper_obj.dataset.dato)

		return previous_dato

	};//end get_previous_dato(wrap_div)



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
			console.error("Invalid dato for search (must be an array):", dato)
		}else{
			for (var i = 0; i < dato_parsed.length; i++) {
				search_value += JSON.stringify(dato_parsed[i])
				break; // Only one value is expected
			}
		}

		return search_value
	};//end get_search_value_from_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj, previous_dato) {

		const self = this

		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("[component_radio_button:Save]: Sorry: wrap_div dom element not found")
			}

		// Get dato specific
			//const previous_dato = JSON.parse(wrap_div.dataset.dato)
			const dato = self.get_dato(wrap_div)

			if (typeof previous_dato === 'undefined') {
				previous_dato = self.get_previous_dato(wrap_div)
			}

		// triggered_items (propiedades)
			const component_info = JSON.parse(wrap_div.dataset.component_info)
			const propiedades 	 = component_info.propiedades

			const exec_save = function(self, dato, component_obj, wrap_div) {

				// Save
				// Set for save
					self.save_arguments.dato = dato

				// Exec general save
					const js_promise = component_common.Save(component_obj, self.save_arguments);

					js_promise.then(function(response) {

						// mandatory test
						self.mandatory(wrap_div.id)

						component_common.load_component_by_wrapper_id(wrap_div.id)

					}, function(xhrObj) {
						console.log(xhrObj);
					});

				return js_promise;
			}//end exec_save


			// exec_component_triggers
				if (propiedades.js) {

					component_common.exec_component_triggers(
						propiedades.js, // object properties_js
						dato, // array|null dato
						null, // controller_data
						previous_dato, // array|null previous_dato
						function(to_save) { // call_back return promise
							// to_save is always bool
							if(to_save===false){
								console.warn("Warning. Component is not saved after exec_component_triggers")
								return component_common.load_component_by_wrapper_id(wrap_div.id)
								// return false
								// return Promise.resolve(false)
							}

							return exec_save(self, dato, component_obj, wrap_div)
						})
				}else{

					return exec_save(self, dato, component_obj, wrap_div)
				}

		return true
	}//end Save



	/**
	* MANDATORY
	* When input dataset mandatory var is true
	* Add class 'mandatory' to element (input) when content is empty
	*/
	this.mandatory = function(id_wrapper) {

		const wrapper = document.getElementById(id_wrapper)
			if (wrapper===null) {
				console.log("Error on select wrapper for id: "+id_wrapper);
				return false;
			}

		const radio_button_ul_list = wrapper.querySelector('ul.radio_button_ul_list')
		const ar_input_obj 	  	 = wrapper.querySelectorAll('input.css_radio_button')

		if (this.is_empty_value(ar_input_obj)===true) {
			radio_button_ul_list.classList.add('mandatory')
		}else{
			radio_button_ul_list.classList.remove('mandatory')
		}

		return true
	};//end mandatory



	/**
	* IS_EMPTY_VALUE
	* @return bool
	*/
	this.is_empty_value = function(ar_input_obj) {

		const len = ar_input_obj.length
		for (let i = len - 1; i >= 0; i--) {
			if (ar_input_obj[i].checked===true) {
				return false
			}
		}

		return true;
	};//end is_empty_value



	/**
	* CHECK_RADIO
	* Used in search mode to reset radio values
	* @return bool true
	*/
	this.check_radio = function(input, event) {

		if (event.altKey===true) {
			input.checked = false
			//get the wrap_div
			const wrap_div = find_ancestor(input, 'wrap_component')
			//set previous_dato
			const previous_dato = component_radio_button.get_previous_dato(wrap_div)

			// Fix dato as blank
			component_common.fix_dato(input,'component_radio_button')

			if(wrap_div.dataset.modo ==='edit'){
				component_radio_button.Save(input, previous_dato)
			}
		}

		return true
	};//end check_radio




}//end class
