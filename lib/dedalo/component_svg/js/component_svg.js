"use strict";
/**
* COMPONENT_SVG
* Manages the component's logic and apperance in client side
*
*
*/
var component_svg = new function() {


	// Object vars
	this.save_arguments 	= {}


	/**
	* INIT
	* @return 
	*/
	this.inited = {}
	this.init = function(options) {

		let self = this

		console.log("[component_svg.init] options:",options);

		switch(options.modo) {
			case 'edit':
				let wrapper_obj = document.getElementById(options.id_wrapper)

				// Add text_area element
				self.build_text_area(wrapper_obj, options.dato)

				// Add svg element
				self.build_svg_player(wrapper_obj, options.dato)
				break;
		}
		

		return true
	}//end init



	/**
	* BUILD_TEXT_AREA
	* @return 
	*/
	this.build_text_area = function(wrapper_obj, dato) {
		
		let self = this 

		common.create_dom_element({
			element_type			: 'textarea',
			parent 					: wrapper_obj,
			class_name 				: "svg_text",
			value 					: dato
		})

	};//end build_text_area



	/**
	 * BUILD_SVG_PLAYER
	 * @return 
	 */
	 this.build_svg_player = function(wrapper_obj, dato) {
	 	
	 	let self = this 

		var svg_obj = common.create_dom_element({
			element_type	: 'div',
			parent 			: wrapper_obj,
			class_name 		: "svg_player_div",
			inner_html 		: dato		
		})
		svg_obj.setAttribute("width", "100")
		svg_obj.setAttribute("height", "100")

		return true;
	 };//end build_svg_player 



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return array dato
	
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		let dato = []

		// ul list of inputs
		const parent_ul = wrapper_obj.getElementsByTagName('ul')[0] //wrapper_obj.querySelector('.content_data')
		
		// li elements
		const li_nodes = parent_ul.childNodes			

		const len = li_nodes.length
		for (let i = 0; i < len; i++) {
			let value = li_nodes[i].getElementsByTagName('input')[0].value
			if(value.length > 0){
				dato.push(value)
			}
		}

		return dato
	}//end get_dato
*/


	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {
		
		let search_value = ''
		const dato_parsed  = dato

		if (!Array.isArray(dato_parsed)) {
			console.error("Invalid dato for search (must be an array):", dato);
		}else{
			const dato_parsed_length = dato_parsed.length
			for (let i = 0; i < dato_parsed_length; i++) {
				search_value += dato_parsed[i]
			}
		}

		return search_value
	}//end get_search_value_from_dato
	
	
	

	/**
	* SAVE
	* @param object component_obj
	* @return promise js_promise
	*/
	this.Save = function(component_obj) {

		let self = this

		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(btn_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato specific
		let dato = self.get_dato(wrap_div)

		// Set for save
		self.save_arguments.dato = dato;	
		
		// Exec general save
		let js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {

			  	// Update possible dato in list (in portal x example)
				component_common.propagate_changes_to_span_dato(component_obj);

				// Exec mandatory test
				component_input_text.mandatory(wrap_div.id)

			}, function(xhrObj) {
			  	console.log(xhrObj);
			});

		return js_promise
	}//end Save



}//end component_svg