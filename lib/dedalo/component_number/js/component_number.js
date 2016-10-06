





var component_number = new function() {


	this.save_arguments = {}


	switch(page_globals.modo) {
		
		case 'tool_time_machine' :
		case 'tool_lang' :
		case 'edit' :
			$(function() {
				var number_obj = $('.css_number:input');
				$(number_obj).on("change", function(){
					component_number.Save(this);
				});
			});
			break;

	};//end switch

	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

		jsPromise.then(function(response) {
		  	// Update possible dato in list (in portal x example)
			component_common.propagate_changes_to_span_dato(component_obj);
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});		
	};


	

}//end component_number