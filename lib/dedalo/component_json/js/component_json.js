"use strict";
/**
* COMPONENT_JSON
*
*
*/
var component_json = new function() {

	this.save_arguments = {}
	this.full_component = {}
	this.ar_component_json = []

	

	/**
	* INIT
	* @return 
	*/
	this.init = function( options ) {
	
		const self = this

		// options
			const editor_id			= options.editor_id
			const component_name	= options.component_name
			const wrapper_id		= options.wrapper_id
			const read_only			= options.read_only || false

		// editor_text_area
			const editor_text_area = document.getElementById(editor_id)
				// Hide real options container
				editor_text_area.style.display = "none"

		// create the editor
			const container			= document.getElementById(editor_id + '_container')
			const editor_options	= {
					mode	: 'code',
					modes	: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
					onError	: function (err) {
						alert(err.toString());
					},
					onChange : function () {
						//var json = editor.get();
						// Update hidden text area value
						//editor_text_area.value = editor.getText()
					}
				}
			const editor_value = JSON.parse(editor_text_area.value)	
			const editor 	   = new JSONEditor(container, editor_options, editor_value)
		
		// Save button. Send JSON text to input and force save
			const button_save = document.getElementById(editor_id  + '_save_document')
				if (button_save) {
					button_save.addEventListener("click",function(e){
						editor_text_area.value = editor.getText()
						self.Save(editor_text_area)
					}, false);
				}

		// Save on blur editor
			let last_value = editor.getText()
			editor.aceEditor.on("focus", function(e){
				last_value = editor.getText()
			})
			editor.aceEditor.on("blur", function(e){
				let current_value = editor.getText()
				if (current_value === last_value) {
					//console.log("No changes");
				}else{
					if(read_only===false) {
						editor_text_area.value = current_value
						self.Save(editor_text_area)
					}
				}
			})

		// Add click behavior to json editor position to top
			const wrap = editor_text_area.parentNode.parentNode
			wrap.addEventListener("dblclick",function(e){
				this.scrollIntoView({behavior: "instant", block: "end", inline: "nearest"});
			}, false)	

		return true
	}//end init



	/**
	* GET_DATO
	* @param DOM object component_obj
	* @return promise
	*/
	this.Save = function(component_obj) {
		
		// Exec general save
		const js_promise = component_common.Save(component_obj, this.save_arguments);

		return js_promise
	}//end Save



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		const self = this

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_number:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const input	= wrapper_obj.querySelector('input')
		const dato	= input.value || null

		return dato
	}//end get_dato



	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {

		const search_value = dato

		return search_value
	}//end get_search_value_from_dato


	
}//end component_json class