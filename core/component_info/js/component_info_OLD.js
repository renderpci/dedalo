"use strict"
/**
* COMPONENT_INFO
*
*
*/
var component_info = new function() {



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init



	this.update_info = function(button_obj) {

		// From component wrapper
		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("component_info:update_info: Sorry: wrap_div dom element not found")
			}

		return component_common.load_component_by_wrapper_id(wrap_div.id);
	}//end update_info



}//end component_info