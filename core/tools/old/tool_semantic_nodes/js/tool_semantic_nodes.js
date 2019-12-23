/**
* TOOL_SEMANTIC_NODES CLASS
*
*
*
*/
var tool_semantic_nodes = new function() {


	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_semantic_nodes/trigger.tool_semantic_nodes.php' ;
	//this.button_obj  = null;


	/**
	* OPEN_TS_WINDOW
	* Abrir listado de tesauro para hacer relaciones
	*/
	this.open_ts_window = function(button_obj) {
			console.log("aqui");

		// Fix current element
		tool_semantic_nodes.button_obj = button_obj	

		tool_semantic_nodes.wrapper_id = component_common.get_wrapper_id_from_element(button_obj)
		//this.get_wrapper_id_from_element = function(el, sel)

		// Call standar components open ts window
		component_common.open_ts_window(button_obj)
	}//end open_ts_window
	


	/**
	* LINK_TERM
	* @return promise
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		var new_ds_locator = {
			"section_id" 	: section_id,
			"section_tipo"  : section_tipo
		}

		return this.add_index(new_ds_locator)
	};//end link_term



	/**
	* ADD_INDEX
	* Note that button_obj is in tesaurus, not in portal
	*/
	this.add_index = function(new_ds_locator) {

		var button_obj = tool_semantic_nodes.button_obj			
			if(!button_obj) {
				alert("Error on find button_obj")
				return
			}

		var semantic_wrapper  = document.getElementById(button_obj.dataset.semantic_wrapper_id)
		var component_wrapper = document.getElementById(tool_semantic_nodes.wrapper_id)
			if(!component_wrapper) {
				alert("Error on find component_wrapper")
				return
			}

		var trigger_vars = {
			mode 						: 'add_index',
			component_tipo 				: component_wrapper.dataset.tipo,
			parent 		 				: component_wrapper.dataset.parent,
			section_tipo 				: component_wrapper.dataset.section_tipo,
			portal_locator_section_tipo : button_obj.dataset.portal_locator_section_tipo,
			portal_locator_section_id 	: button_obj.dataset.portal_locator_section_id,
			new_ds_locator				: JSON.stringify(new_ds_locator),
			ds_key 						: button_obj.dataset.ds_key
		}
		//return console.log("[tool_semantic_nodes.add_index]",trigger_vars)

		semantic_wrapper.innerHTML = "<span class=\"blink\"> Loading.. </span>"

		// Ajax call
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_semantic_nodes.add_index] response",response)
				}
				
				if (response===null) {
					alert("Error on add_index semantic node")
				}else if(response.result) {
					semantic_wrapper.outerHTML = response.result	
				}

		}, function(error) {
			semantic_wrapper.innerHTML = JSON.stringify(error)
			console.error("[tool_semantic_nodes.add_index] Failed get_json!", error);
		})


		return js_promise	
	}//end add_index



	/**
	* REMOVE_INDEX
	*/
	this.remove_index = function(button_obj) {

		if (!confirm(get_label.seguro)) return false;

		var semantic_wrapper  = document.getElementById(button_obj.dataset.semantic_wrapper_id)
		var component_wrapper = this.selected_wrap_div = find_ancestor(button_obj, 'wrap_component')

		var trigger_vars = {
				mode 						: 'remove_index',
				component_tipo 				: component_wrapper.dataset.tipo,
				parent 		 				: component_wrapper.dataset.parent,
				section_tipo 				: component_wrapper.dataset.section_tipo,
				portal_locator_section_tipo : button_obj.dataset.portal_locator_section_tipo,
				portal_locator_section_id 	: button_obj.dataset.portal_locator_section_id,
				new_ds_locator				: button_obj.dataset.locator_ds,
				ds_key 						: button_obj.dataset.ds_key
			}
		//return console.log("[tool_semantic_nodes.remove_index]",trigger_vars)

		// Ajax call
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_semantic_nodes.remove_index] response",response)
				}
				
				if (response===null) {
					alert("Error on add_index semantic node")
				}else if(response.result) {
					semantic_wrapper.outerHTML = response.result
				}

		}, function(error) {
				semantic_wrapper.innerHTML = JSON.stringify(error)
				console.error("[tool_semantic_nodes.remove_index] Failed get_json!", error);
		})


		return js_promise		
	}//end remove_index
	


};//end tool_semantic_nodes