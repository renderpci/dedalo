// JavaScript Document

/**
* COMPONENT_HTML_TEXT CLASS
*
*/
var component_html_text = new function() {


	this.save_arguments = {}


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



	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {

		obj_wrap.classList.add("selected_wrap");
		var text_area = $(obj_wrap).find('textarea').first()
		if (text_area.length==1) {
			tinyMCE.get( text_area[0].id ).focus()
		}
	};



}//end class component-text_area
