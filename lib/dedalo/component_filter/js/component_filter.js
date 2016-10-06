





var component_filter = new function() {
	

	this.component_filter_objects = {}
	
	
	switch(page_globals.modo) {
		case 'tool_time_machine' :
		case 'edit' :
			$(function() {
				component_filter.check_filter_state();
			});
			break;
	}
	
	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		var save_arguments = {	
						//'callback' : component_filter.check_filter_state
						} // End save_arguments
						//console.log(save_arguments)
		
		// Exec general save
		var jsPromise = component_common.Save(component_obj, save_arguments);

		jsPromise.then(function(response) {
		  	component_filter.check_filter_state();
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});

	};//end Save



	/**
	* GET_FILTER_CHECKED_VALUE
	* Get checked values
	*/
	this.get_filter_checked_values = function() {
		//console.log($(component_obj).val())
		//console.log(document.querySelector('.filter_checkbox:checked').value)
		var checked_values = []; 
		var inputElements = document.getElementsByClassName('filter_checkbox');	//console.log(inputElements.length)

		// If not exists 'inputElements' we are in read onl mode. Return 1 to avoid add class 'filter_without_selection'
		if (inputElements.length==0) return 1;

		var len = inputElements.length;
		for (var i = len - 1; i >= 0; i--) {
		      if(inputElements[i].checked){
		      	var val = inputElements[i].value;
				checked_values.push(val) ;	//console.log(checked_values+" i:"+i)	
		        //break; 
		      }
		}
		//console.log(checked_values)
		return checked_values;
	};
	


	/**
	* CHECK_FILTER_STATE
	*/
	this.check_filter_state = function() {
		setTimeout(function() {
			var checked_values = component_filter.get_filter_checked_values();
			if (checked_values.length<1) {
				//console.log("adding style")
				$('.css_wrap_filter').find('.css_label').addClass('filter_without_selection')
			}else{
				//console.log("removing style")
				$('.css_wrap_filter').find('.css_label').removeClass('filter_without_selection')
			}
		}, 1)
		
	}

}//end component_filter


