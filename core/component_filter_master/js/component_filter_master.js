/**
* COMPONENT_FILTER_MASTER
*
*
*
*/
var component_filter_master = new function() {

	'use strict';

	
	this.save_arguments = {}



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {		

		return true
	};//end init



	/**
	* GET_DATO
	* @return 
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_filter_master:get_dato] Error. Invalid wrapper_obj");
			return false
		}		

		const dato = []

		// ul list of inputs
		const parent_ul = wrapper_obj.getElementsByTagName('ul')[0] //wrapper_obj.querySelector('ul.filter_projects_list')
		if (typeof(parent_ul)==="undefined" || !parent_ul) {
			console.log("[component_filter_master:get_dato] Error. Invalid parent_ul");
			return false
		}
		
		// li elements
		const li_nodes = parent_ul.childNodes

		const len = li_nodes.length
		for (let i = 0; i < len; i++) {
			const checkbox_item 	= li_nodes[i].getElementsByTagName('input')[0]
			const checked 		= checkbox_item.checked			
			if(checked===true) {
				let checkbox_value 	= JSON.parse(checkbox_item.value)					
				dato.push( checkbox_value)		
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
		
		const size = Object.keys(dato).length		
		if (size>0) {
			search_value = JSON.stringify(dato)
		}		
	
		return search_value
	};//end get_search_value_from_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		const self = this

		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato
		const dato = self.get_dato(wrap_div)
		
		// Asign to save
		self.save_arguments.dato = dato		
		
		// Exec general save
		const js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {
		  			
		}, function(xhrObj) {
		  	console.log("xhrObj",xhrObj);
		});


		return js_promise
	};//end Save

	

}//end component_filter_master