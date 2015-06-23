// JavaScript Document	
$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'tool_time_machine' :
		case 'edit' :	/*
						$(".css_wrap_filter").on('change', "input:checkbox", function() {
							component_filter.Save(this);
						});
						*/
						// OBJ SELECTOR
						var radio_button_obj = $('.filter_checkbox:input:checkbox');
						
						$(document.body).on("change", radio_button_obj.selector, function(){
							component_filter.Save(this);
						});

						component_filter.check_filter_state();
						break;
	}

});

var component_filter = new function() {

	

	this.Save = function(component_obj) {

		var save_arguments = {	
						'callback' : component_filter.check_filter_state
						} // End save_arguments
						//console.log(save_arguments)
		
		// Exec general save
		component_common.Save(component_obj, save_arguments);

		// Update possible dato in select_lang		
		if( $('.css_wrap_select_lang').length == 1 ) {
			var wrapper_id = $('.css_wrap_select_lang').attr('id');
			component_common.load_component_by_wrapper_id(wrapper_id)
		}


	}//end Save


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

		for(var i=0; i<inputElements.length; ++i){
		      if(inputElements[i].checked){
		      	var val = inputElements[i].value;
				checked_values.push(val) ;	//console.log(checked_values+" i:"+i)	
		        //break; 
		      }
		}
		//console.log(checked_values)
		return checked_values;
	}


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


