// JavaScript Document
document.write('<scr'+'ipt src="'+'../../../lib/jquery/autosize/jquery.autosize-min.js" type="text/javascript" ></scr'+'ipt>');

/**
* COMPONENT_IMAGE
*/
var component_image = new function() {

	$(document).ready(function() {		
		
		switch(page_globals.modo) {
			
			case 'edit' :
					// OBJ SELECTOR
					var input_text_obj = $('.css_text_area:input');					
				
					// GET AND FIX OLD VALUE FROM ALL OBJS
					input_text_obj.each(function() {
						
						// if value has changed
						$(this).data('oldVal', $(this).val());
						
						// autoesize text area with jquery plugin
						//$(this).css('max-height','300px').autosize();
					});
					break;
		}
	});



}//end class