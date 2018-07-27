"use strict"
/**
* COMPONENT_TEMPLATE
*
*
*/
var component_template = new function() {



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init
	


		
	switch(page_globals.modo) {
		
		case 'edit' :
			$(function() {	
				// OBJ SELECTOR
				var input_text_obj = $('.css_text_area:input');			
				// GET AND FIX OLD VALUE FROM ALL OBJS
				input_text_obj.each(function() {
					
					// if value has changed
					$(this).data('oldVal', $(this).val());
					
					// autoesize text area with jquery plugin
					//$(this).css('max-height','300px').autosize();
				});
			});
			break;
	}



}//end class