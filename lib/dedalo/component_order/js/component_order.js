





var component_order = new function() {


	this.save_arguments = {}
	this.trigger_url 	= DEDALO_LIB_BASE_URL + '/component_order/trigger.component_order.php';
	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		this.save_arguments = this.get_dato(component_obj);

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

			jsPromise.then(function(response) {
			  	// Update possible dato in list (in portal x example)
				//component_common.propagate_changes_to_span_dato(component_obj);
			}, function(xhrObj) {
			  	console.log(xhrObj);
			});
	};//end Save



	/**
	* GET_DATO
	* @return string dato
	*/
	this.get_dato = function(component_obj) {

		var dato = component_obj.value

		return dato
	};//end get_dato



	/**
	* SHOW_COMPONENT_IN_ROW_THESAURUS
	* Show and hide component data in row_thesaurus content_data div
	* @param object button_obj
	*/
	this.show_component_in_row_thesaurus = function(button_obj) {

		var html_data = '...';	//" show_component_in_row_thesaurus here! "
		var role 	  = 'component_order_data' + '_' + button_obj.dataset.section_tipo + '_' + button_obj.dataset.parent + '_' + button_obj.dataset.tipo

		row_thesaurus.show_list_thesaurus_data(button_obj, html_data, role, function(){

			var my_data = {
				"mode" 			: 'load_component_by_ajax',
				"section_tipo"  : button_obj.dataset.section_tipo,
				"parent"  		: button_obj.dataset.parent,
				"tipo"  		: button_obj.dataset.tipo,
				"modo"  		: button_obj.dataset.modo,
				"lang"  		: button_obj.dataset.lang
			}
			//return console.log(my_data);

			var jsPromise = Promise.resolve(
				$.ajax({
					url 	: component_common.url_trigger,
					type 	: 'POST',
					data 	: my_data,
				})
				.done(function( received_data ) {
					return received_data
				})
				.fail(function() {
					console.log("show_component_in_row_thesaurus ajax error (fail)")
				})
				.always(function() {
					
				})
			)//end promise	

			return jsPromise

		})//end row_thesaurus.show_list_thesaurus_data
		
	};//end show_component_in_row_thesaurus

	
	

}//end component_order