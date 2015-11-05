// JavaScript Document
// document.write('<scr'+'ipt src="'+DEDALO_LIB_BASE_URL+'/component_html_text/js/component_html_text_editor.js" type="text/javascript"></scr'+'ipt>');


/**
* COMPONENT_HTML_TEXT CLASS
*
*/
var component_html_text = new function() {

	this.save_arguments = {} 
	
	this.Save = function(component_obj) {		
		
		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

		// Update possible dato in list (in portal x example)
		component_common.propagate_changes_to_span_dato(component_obj);
	}

}//end class component-text_area
