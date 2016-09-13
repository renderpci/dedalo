




// COMPONENT_SELECT_LANG
var component_select_lang = new function() {

	this.save_arguments = {}


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		var dato = component_obj.value;
			//console.log( dato );
		this.save_arguments.dato = dato;
		
		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

			jsPromise.then(function(response) {
			  	// Update realted text area if exists
				if (typeof component_obj.dataset.related_component_text_area!='undefined' 
					&& component_obj.dataset.related_component_text_area.length>0
					&& component_obj.value.length>0
					) {
					component_select_lang.update_related_component_text_area(component_obj);
				}
			}, function(xhrObj) {
			  	console.log(xhrObj);
			});

	};//end Save



	/**
	* UPDATE_RELATED_COMPONENT_TEXT_AREA
	*/
	this.update_related_component_text_area = function(component_obj) {
		
		var data = {
			lang : component_obj.value,
			tipo : component_obj.dataset.related_component_text_area,
			parent : page_globals._parent,
			section_tipo : page_globals.section_tipo,
		}
		//return console.log(data);

		component_text_area.reload_component_with_lang(data)

	}//end update_related_component_text_area



}//end component_select_lang