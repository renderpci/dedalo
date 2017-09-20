/**
* BUTTON_DELETE
*
*
*/
"use strict"
var button_delete = new function() {


	this.url_trigger = DEDALO_LIB_BASE_URL + '/button_delete/trigger.button_delete.php';
	this.delete_obj  = null



	/**
	* LOAD (EVENT)
	*/
	window.addEventListener("load", function (event) {
		
		// Create dialog div once
		button_delete.create_dialog_div()
	});//end load



	/**
	* CREATE_DIALOG_DIV
	* Add delete confirmation dialog text
	*/
	this.create_dialog_div = function() {

		if (page_globals.modo!=='list') return false;
		
		var delete_dialog = this.build_delete_dialog()
		document.body.appendChild(delete_dialog);
	};//end create_dialog_div



	/**
	* BUILD_DELETE_DIALOG
	* @return DOM obj modal_dialog
	*/
	this.build_delete_dialog = function(options) {

		var header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			var h4 = document.createElement("h4")
				h4.classList.add('modal-title')
				t = document.createTextNode(get_label.esta_seguro_de_borrar_este_registro)
				// Add
				h4.appendChild(t)
				header.appendChild(h4)

		var body = document.createElement("div")
			var t = document.createTextNode("Loading..")
				// add
				body.appendChild(t)

		var footer = document.createElement("div")

			// <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
			var button_cancel = document.createElement("button")
				button_cancel.classList.add("btn","btn-default")
				button_cancel.dataset.dismiss = "modal"
				var t = document.createTextNode(get_label.cancelar)
				// add
				button_cancel.appendChild(t)
				// add
				footer.appendChild(button_cancel)

			// <button type="button" class="btn btn-primary">Save changes</button>
			var button_delete_data = document.createElement("button")
				button_delete_data.classList.add("btn","btn-primary")
				//button_delete_data.dataset.dismiss = "modal"
				var t = document.createTextNode(get_label.borrar_solo_datos)
				// add
				button_delete_data.appendChild(t)
				button_delete_data.addEventListener("click", function (e) {
					//div_note_wrapper.parentNode.removeChild(div_note_wrapper)					
					button_delete.Del('delete_data');
				})
				// add
				footer.appendChild(button_delete_data)

			// <button type="button" class="btn btn-primary">Save changes</button>
			var button_delete_record = document.createElement("button")
				button_delete_record.classList.add("btn","btn-primary")
				//button_delete_record.dataset.dismiss = "modal"
				var t = document.createTextNode(get_label.borrar_registro_completo)
				// add
				button_delete_record.appendChild(t)
				button_delete_record.addEventListener("click", function (e) {
					//div_note_wrapper.parentNode.removeChild(div_note_wrapper)
					button_delete.Del('delete_record')
				})
				// add
				footer.appendChild(button_delete_record)		


		// modal dialog
		var modal_dialog = common.build_modal_dialog({
			id 		: "delete_dialog",
			header 	: header,
			body 	: body,
			footer 	: footer
		})
		

		return modal_dialog
	};//end build_delete_dialog



	/**
	* OPEN_DELETE_DIALOG
	* @return 
	*/
	this.open_delete_dialog = function(button_obj) {
		
		// Fix selected button as selected
		this.delete_obj = button_obj
	
		// Add info to dialog body
		var label 		  = document.getElementById('current_section_label').textContent || null		
		var delete_dialog = document.getElementById('delete_dialog')
		var modal_body 	  = delete_dialog.querySelector(".modal-body")
			modal_body.innerHTML = label +". "+ get_label.registro + " ID: " + this.delete_obj.dataset.section_id		

		$(delete_dialog).modal({
			show 	 : true,
			keyboard : true
		})

		return true
	};//end open_delete_dialog
	


	/**
	* DEL
	* Delete record with options (modo)
	*/
	this.Del = function (modo) {
		
		// Test fixed button
		if(button_delete.delete_obj==null || button_delete.delete_obj.length==0) {
			return( alert(" Del : button_delete.delete_obj is null ") )
		}

		// BUTTON_DELETE_ACTIONS
			var button_delete_actions = JSON.parse(button_delete.delete_obj.dataset.button_delete_actions)
		
		// DATA COMMON
			var data	= {
				mode 	 		: 'Del',
				modo 			: modo,
				section_tipo	: button_delete.delete_obj.dataset.tipo,
				section_id 	 	: parseInt(button_delete.delete_obj.dataset.section_id),
				top_tipo 		: page_globals.top_tipo
			}
			if(SHOW_DEBUG===true) {
				//console.log("Del data",data)
			}		


		// DELETE_ACTION_PRE
			if (typeof button_delete_actions.delete_action_pre!=='undefined') {
				
				// ar_parts like button_delete.person_used to [button_delete,person_used]
				var ar_parts = button_delete_actions.delete_action_pre.split(".");
				
				// Exec function
				// Function window[ar_parts[0]][ar_parts[1]] mus return a js promise always with a bool response.result (Important!)
				window[ar_parts[0]][ar_parts[1]](data).then(function(response) {
						if(SHOW_DEBUG===true) {
							console.log("button_delete_actions response",response, window[ar_parts[0]][ar_parts[1]])
						}					
						
						if (response.result===false) {
							// Continue normal delete
							var delete_record_action_promise = button_delete.delete_record_action(data)
						}
				})
			}else{

				var delete_record_action_promise = button_delete.delete_record_action(data)
			}


		// DELETE_ACTION_POST
			if (typeof button_delete_actions.delete_action_post!=='undefined') {

				// ar_parts like button_delete.person_used to [button_delete,person_used]
				var ar_parts = button_delete_actions.delete_action_post.split(".");

				// On finish delete action exec current
				delete_record_action_promise.then(function(response) {
					// Exec function
					window[ar_parts[0]][ar_parts[1]](data)
				})
			}


		// Always close delete dialog
		if (typeof delete_record_action_promise!="undefined") {
			delete_record_action_promise.then(function(response) {
				var delete_dialog = document.getElementById('delete_dialog')
				if (delete_dialog) {
					//$(delete_dialog).modal('hide')
					delete_dialog.style.display = "none"
				}
			})
		}		

		return true;	
	};//end Del



	/**
	* DELETE_RECORD_ACTION
	* @return js promise
	*/
	this.delete_record_action = function(data) {

		var trigger_vars = cloneDeep(data)

		// Return a promise of XMLHttpRequest
		common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[button_delete.delete_record_action] response",response)
					console.trace()
				}

				if (response && response.result) {
					// Reload the current page
					setTimeout(function(){
						window.location.href = window.location.href
					},1)					
				}else{
					// Alert error
					alert("[button_delete.delete_record_action] Error on delete ")
					console.log("[button_delete.delete_record_action] Error on delete: ",reponse)
					console.trace()
				}
		},function(error) {
			console.log("[button_delete.delete_record_action] error:",error);
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on Del data id:" + id + "<br>Data is NOT deleted!</span>";				
			inspector.show_log_msg(msg);
		})

		//return js_promise
	};//end delete_record_action



	/**
	* PERSON_USED
	* PASAR AL TEXT AREA !!!
	* @return js promise
	*/
	this.person_used = function(data) {
		//console.log(locator)

		var locator = {
			section_tipo : data.section_tipo,
			section_id 	 : data.section_id,
		}

		var trigger_vars = {
				mode 	: 'person_used',
				locator : JSON.stringify(locator)
			}
			//return console.log(trigger_vars)

		var url_trigger = DEDALO_LIB_BASE_URL + '/component_text_area/trigger.component_text_area.php';

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(url_trigger, trigger_vars).then(function(response) {
				//if(SHOW_DEBUG===true) console.log(response)
				if (response && response.result && response.result.length>0) {
					alert("WARNING!\nCurrent person is used in some transcriptions. \nPlease remove current person tags in all transcriptions before delete this person. \n Audiovisuals used id: " + response.join(', ') )
					return true
				}else{
					return false
				}
			})
	};//end person_used



};//end button__delete