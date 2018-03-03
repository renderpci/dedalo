"use strict";
/**
* COMPONENT_JSON CLASS
*
*
*/
var component_json = new function() {

	this.save_arguments = {}
	this.full_component = {}
	this.ar_component_json = []


	window.ready(function(){
		//component_json.init()
	})

	

	/**
	* INIT
	* @return 
	*/
	this.init = function( data ) {
	
		let self = this

		let editor_id = data.editor_id

		let editor_text_area = document.getElementById(editor_id)
			// Hide real data container
			editor_text_area.style.display = "none"	
				

		// create the editor
		let container = document.getElementById(editor_id + '_container')
		let options   = {
				mode: 'code',
				modes: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
				onError: function (err) {
				  alert(err.toString());
				},
				onChange: function () {
			       //var json = editor.get();
			       // Update hidden text area value
			       //editor_text_area.value = editor.getText()
			    }			    
			}
		let editor_value = JSON.parse(editor_text_area.value)	
		let editor 		 = new JSONEditor(container, options, editor_value)
		
		// Save button. Send JSON text to input and force save
		let button_save = document.getElementById(editor_id  + '_save_document')
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
				editor_text_area.value = current_value
				self.Save(editor_text_area)
			}			
		})

		// Add click behavior to json editor position to top
		let wrap = editor_text_area.parentNode.parentNode
			wrap.addEventListener("dblclick",function(e){			
				document.documentElement.scrollTop = wrap.offsetTop //-50		
			}, false)	

	};//end init
	


	this.Save = function(component_obj) {
		
		// Exec general save
		var js_promise = component_common.Save(component_obj, this.save_arguments);

		return js_promise
	};


	
}//end component_json class