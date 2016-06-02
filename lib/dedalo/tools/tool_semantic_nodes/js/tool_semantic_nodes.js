// JavaScript Document




// TOOL_SEMANTIC_NODES CLASS
var tool_semantic_nodes = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_semantic_nodes/trigger.tool_semantic_nodes.php' ;



	/**
	* OPEN_TS_WINDOW
	* Abrir listado de tesauro para hacer relaciones
	*/
	var relwindow ;
	this.open_ts_window = function(button_obj) {
	
		var modo 		= 'tesauro_rel',
			type 		= 7,
			rel_type 	= 'tool_semantic_nodes',
			wrapper_id 	= component_common.get_wrapper_id_from_element(button_obj),
			locator_section_tipo = button_obj.dataset.locator_section_tipo,
			locator_section_id 	 = button_obj.dataset.locator_section_id,
			ds_key 	 			 = button_obj.dataset.ds_key,
			semantic_wrapper_id  = button_obj.dataset.semantic_wrapper_id

			
		var url = DEDALO_LIB_BASE_URL + '/ts/ts_list.php?'
			url += 'modo=' + modo
			url += '&type=' + type
			url += '&rel_type=' + rel_type
			url += '&wrapper_id=' + wrapper_id
			url += '&locator_section_tipo=' + locator_section_tipo
			url += '&locator_section_id=' + locator_section_id
			url += '&ds_key=' + ds_key
			url += '&semantic_wrapper_id=' + semantic_wrapper_id

		relwindow = window.open(url ,'listwindow','status=yes,scrollbars=yes,resizable=yes,width=900,height=650');//resizable
		if (relwindow) relwindow.moveTo(-10,1);
		if (window.focus) { relwindow.focus() }
	}



	/**
	* ADD_INDEX
	* Note that button_obj is in tesaurus, not in portal
	*/
	this.add_index = function(button_obj, url_vars) {		
	
		var termino_id 			 = button_obj.dataset.termino_id,
			locator_section_tipo = url_vars.locator_section_tipo,
			locator_section_id 	 = url_vars.locator_section_id,
			ds_key 				 = url_vars.ds_key,
			semantic_wrapper_id  = url_vars.semantic_wrapper_id,
			semantic_wrapper 	 = document.getElementById(semantic_wrapper_id),
			wrapper_id 			 = url_vars.wrapper_id,
			wrapper 			 = document.getElementById(wrapper_id),
			tipo 				 = wrapper.dataset.tipo,
			parent 		 		= wrapper.dataset.parent,
			section_tipo 		 = wrapper.dataset.section_tipo		

		var mydata = {
				"mode" 		   			: 'add_index',
				"termino_id"			: termino_id,
				"tipo"  				: tipo,
				"parent"				: parent,
				"section_tipo" 			: section_tipo,
				"locator_section_tipo" 	: locator_section_tipo,
				"locator_section_id" 	: locator_section_id,
				"ds_key"				: ds_key,
				}
				//return console.log(mydata);

		semantic_wrapper.innerHTML = "<span class=\"blink\"> Loading.. </span>"

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {
			semantic_wrapper.outerHTML = received_data			
		})
		// FAIL ERROR 
		.fail(function(error_data) {			
		})
		// ALWAYS
		.always(function() {					
		})

	}//end add_index



	/**
	* REMOVE_INDEX
	*/
	this.remove_index = function(button_obj) {		
	
		var termino_id 			 = button_obj.dataset.termino_id,
			locator_section_tipo = button_obj.dataset.locator_section_tipo,
			locator_section_id 	 = button_obj.dataset.locator_section_id,
			ds_key 				 = button_obj.dataset.ds_key,			
			semantic_wrapper  	 = component_common.get_wrapper_from_element(button_obj,'.semantic_wrapper'),	
			wrapper			 	 = component_common.get_wrapper_from_element(button_obj),			
			tipo 		 		 = wrapper.dataset.tipo,
			parent 				 = wrapper.dataset.parent,
			section_tipo 		 = wrapper.dataset.section_tipo	

			//return 	console.log(semantic_wrapper);					

		var mydata = {
				"mode" 		   			: 'remove_index',
				"termino_id"			: termino_id,
				"tipo"  				: tipo,
				"parent"				: parent,
				"section_tipo" 			: section_tipo,
				"locator_section_tipo" 	: locator_section_tipo,
				"locator_section_id" 	: locator_section_id,
				"ds_key"				: ds_key,
				}
				//return console.log(mydata);

		semantic_wrapper.innerHTML = "<span class=\"blink\"> Loading.. </span>"

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {
			semantic_wrapper.outerHTML = received_data			
		})
		// FAIL ERROR 
		.fail(function(error_data) {			
		})
		// ALWAYS
		.always(function() {					
		})

	}//end remove_index
	
	




};//end tool_semantic_nodes