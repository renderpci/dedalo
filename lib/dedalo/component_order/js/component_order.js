"use strict"
/**
* component_order
*
*/
var component_order = new function() {


	this.save_arguments = {}
	this.trigger_url 	= DEDALO_LIB_BASE_URL + '/component_order/trigger.component_order.php';



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		


		return true
	};//end init
	
	

	/**
	* GET_DATO
	* @return string dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_order:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		let component_obj = wrapper_obj.querySelector('input[data-role="component_order_input"]')

		if (typeof(component_obj)=="undefined" || !component_obj) {
			console.log("[component_order:get_dato] Error. Invalid component_obj");
			return false
		}

		let dato = component_obj.value
		

		return dato
	};//end get_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		let self = this

		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato specific
		let dato = self.get_dato(wrap_div)

		// Set for save
		self.save_arguments.dato = dato;

		// Exec general save
		let js_promise = component_common.Save(component_obj, this.save_arguments);

			js_promise.then(function(response) {
			  	// Update possible dato in list (in portal x example)
				//component_common.propagate_changes_to_span_dato(component_obj);
				if(page_globals.section_tipo==='dd100') {
					component_order.close_thesaurus_editor(component_obj)
				}
			}, function(xhrObj) {
			  	console.log(xhrObj);
			});


		return js_promise
	};//end Save



	/**
	* CLOSE_THESAURUS_EDITOR
	* @return 
	*/
	this.close_thesaurus_editor = function(component_obj) {
		//console.log(component_obj);
		let section_tipo = component_obj.dataset.section_tipo
		let section_id 	 = component_obj.dataset.parent

		ts_object.refresh_element(section_tipo, section_id)
	};//end close_thesaurus_editor



}//end component_order