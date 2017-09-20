"use strict";
/**
* TOOL_IMPORT_DEDALO_CSV
*
*
*/
var tool_import_dedalo_csv = new function() {

	/*
	$(function(){
		$('.panel-heading').on('click',function(){
			tool_import_dedalo_csv.toggle_content(this)
		})
	})
	*/
	this.dir_files_element = null
	
	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_import_dedalo_csv/trigger.tool_import_dedalo_csv.php';

	window.addEventListener('load', function() {
		tool_import_dedalo_csv.get_path()
		tool_import_dedalo_csv.get_dir_files( document.getElementById('button_read'))
	}, false);
	


	/**
	* GET_DIR_FILES
	*/
	this.get_dir_files = function( obj, event ) {
		
		let files_path = document.getElementById('files_path').value;
			if (files_path.length===0) { 
				return false;
			}

		var response_div = document.getElementById('get_dir_files_response')
			// Clean response_div
			response_div.innerHTML="<span class=\"css_spinner\"><span class=\"blink\">Processing. Please wait..</span></span>";
		
		const trigger_vars = {
				mode : 'get_dir_files',
				dir  : files_path
		}

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_import_dedalo_csv.get_dir_files] response",response);
				}

				if (response===null) {
					alert("[tool_import_dedalo_csv.get_dir_files] Error. Null response");
				}else{
					// Clean response_div
					while (response_div.firstChild) {
						response_div.removeChild(response_div.firstChild);
					}

					// Iterate files found
					var len = response.files.length
					if (len==0) {
						response_div.innerHTML = response.msg
					}else{						
						for (var i = 0; i < len; i++) {
							// Add checkboes
							var file 	  = response.files[i]
							var file_info = response.files_info[file] || null
							var checkbox  = tool_import_dedalo_csv.create_checkbox(file, file_info)
							response_div.appendChild(checkbox)
						}

						// Add submit button
						var input 			= document.createElement('input')
							input.type 		= 'button'
							input.id 		= 'button_checkbox'
							input.value 	= 'Import'
							input.className = 'btn btn-default btn-sm'
							input.classList.add('submit_button')

							input.addEventListener('click', function(event){
								tool_import_dedalo_csv.import_seleted_files( files_path )
							}, false);

						response_div.appendChild(input)

						// Store element
						tool_import_dedalo_csv.dir_files_element = response_div
					}
				}//end if (response===null)

		}, function(error) {
			console.log("[tool_import_dedalo_csv.get_dir_files] error",error)
		});


		return js_promise
	};//end get_dir_files



	/**
	* GET_SSE
	* @return 
	*/
	this.get_sse = function(url_trigger, trigger_vars) {
					
		var url_vars = build_url_arguments_from_vars(trigger_vars)
			if(SHOW_DEBUG===true) {
				console.log("get_sse url_vars",url_vars);
			}			
		var source 	 = new EventSource(url_trigger+"?"+url_vars);
			if(SHOW_DEBUG===true) {
				console.log("get_sse source",source);
			}
	};//end get_sse




	/**
	* GET_SELECTED_FILES
	* @return 
	*/
	this.get_selected_files = function() {

		// Is fixed before (on read csv files)
		var read_files_response_div = tool_import_dedalo_csv.dir_files_element
			if (!read_files_response_div) {
				console.log("[get_selected_files] Error on read 'read_files_response_div' ")
				return false;
			}
		
		var checkboxes 			= read_files_response_div.querySelectorAll('input[type="checkbox"]');
		var selected_files  	= []
		var input_section_tipo 	= read_files_response_div.querySelectorAll('input[type="text"]');
		var ar_section_tipo 	= []

		var len = checkboxes.length
		for (var i = 0; i < len; i++) {
			if( checkboxes[i].checked ) {
				// No empty section tipo is accepted
				if (!input_section_tipo[i].value) {
					input_section_tipo[i].focus()
					//import_seleted_files_response_div.innerHTML="Sorry. Empty section tipo for file: "+checkboxes[i].value;
					//alert("Sorry. Empty section tipo for file: "+checkboxes[i].value)
					return false
				}
				// Store as object
				selected_files.push({
					file 		 : checkboxes[i].value,
					section_tipo : input_section_tipo[i].value
				})
			}
		}

		return selected_files
	};//end get_selected_files



	/**
	* IMPORT_SELETED_FILES
	* @return 
	*/
	this.import_seleted_files = function(files_path) {

		var import_seleted_files_response_div = document.getElementById('import_seleted_files_response')
			import_seleted_files_response_div.innerHTML=''		

		// Selected files
		var selected_files = this.get_selected_files()
		if (selected_files===false) {
			import_seleted_files_response_div.innerHTML="Sorry. Empty section tipo for file";
			return false
		}
		if(selected_files.length===0) {
			import_seleted_files_response_div.innerHTML="<span class=\"\">Sorry. No CSV files are selected</span>";
			return false
		}		

		const trigger_vars = {
				mode  	: 'import_seleted_files',
				files 	: JSON.stringify(selected_files),
				dir 	: files_path
			}
			//return console.log(trigger_vars);
		
		// Add spinner
		import_seleted_files_response_div.innerHTML="<span class=\"css_spinner\"><span class=\"blink\">Processing. Please wait..</span></span>";

		//return this.get_sse(this.url_trigger, trigger_vars)

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_import_dedalo_csv.import_seleted_files] response",response)
				}

				// Clean response_div
				while (import_seleted_files_response_div.firstChild) {
					import_seleted_files_response_div.removeChild(import_seleted_files_response_div.firstChild);
				}

				if (response && response.result) {
					import_seleted_files_response_div.innerHTML += "<div>"+response.msg+"</div>";
					import_seleted_files_response_div.innerHTML += "<pre>"+ JSON.stringify(response, null, 2) +"</pre>";									
				}else{
					import_seleted_files_response_div.innerHTML += "<div class=\"error\">Error. Null is received</div>";
				}		
		}, function(error) {
			console.log("[tool_import_dedalo_csv.import_seleted_files] error",error)
		})


		return js_promise
	};//end import_seleted_files



	/**
	* RENAME_FILES
	* @return 
	*/
	this.rename_files = function( button_obj ) {
		
		var import_seleted_files_response_div = document.getElementById('rf_import_seleted_files_response')
			import_seleted_files_response_div.innerHTML=''

		// Selected files
		var selected_files = this.get_selected_files()
		if (selected_files===false) {
			import_seleted_files_response_div.innerHTML="Sorry. Empty section tipo for file";
			return false
		}
		if(selected_files.length===0) {
			import_seleted_files_response_div.innerHTML="<span class=\"\">Sorry. No CSV file is selected</span>";
			return false
		}else if(selected_files.length>1) {
			import_seleted_files_response_div.innerHTML="<span class=\"\">Sorry. Only one CSV file is accepted at once</span>";
			return false
		}

		var rf_files_path = document.getElementById('rf_files_path')
		var images_dir 	  = rf_files_path.value
			if (images_dir.length<1) {
				import_seleted_files_response_div.innerHTML="<span class=\"\">Sorry, files path is empty</span>";
				rf_files_path.focus()
				return false
			}
		/*
		var input_component_tipo 		= document.getElementById('input_component_tipo')
		var input_component_tipo_value  = input_component_tipo.value
			if (input_component_tipo_value.length<3) {
				import_seleted_files_response_div.innerHTML="<span class=\"\">Sorry, component tipo is empty</span>";
				input_component_tipo.focus()
				return false
			}
		*/
		var files_path = document.getElementById('files_path').value;
			if (files_path.length<3) {
				import_seleted_files_response_div.innerHTML="<span class=\"\">Sorry, files path is empty</span>";
				return false;
			}
			// Removes possible final slash
			files_path = files_path.replace(/\/$/, "");

		var csv_file_path = files_path + '/' + selected_files[0].file

		var conserve_original_files = document.getElementById('conserve_original_files')
			var action = 'copy'
			if (conserve_original_files.checked!==true) {
				action = 'rename'
			}

		
		// 'csv_file_path','images_dir','section_tipo','component_tipo','old_name_column','action'
		const trigger_vars = {
				mode  			: 'rename_files',
				csv_file_path 	: csv_file_path,
				section_tipo 	: selected_files[0].section_tipo,
				images_dir 		: images_dir,		
				//component_tipo 	: input_component_tipo_value,
				action 			: action,
				old_name_column : 1 // Fixed. Note tha number 1 is the second column (array count starts with 0)
			}
			//return console.log(trigger_vars);
		
		// Add spinner
		import_seleted_files_response_div.innerHTML="<span class=\"css_spinner\"><span class=\"blink\">Processing. Please wait..</span></span>";

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_import_dedalo_csv.rename_files] response",response)
				}

				// Clean response_div
				while (import_seleted_files_response_div.firstChild) {
					import_seleted_files_response_div.removeChild(import_seleted_files_response_div.firstChild);
				}

				// Show response
				if (response && response.result) {
					if(response.msg.length) {
						var len = response.msg.length
						for (var i = 0; i < len; i++) {
							//import_seleted_files_response_div.innerHTML += "<div>"+response.msg[i]+"</div>";
						}
					}																		
					import_seleted_files_response_div.innerHTML += "<pre>"+ JSON.stringify(response, null, 2) +"</pre>"
				}else{

					import_seleted_files_response_div.innerHTML += "<pre>Error. Null response is received</pre>"
				}					
										
		}, function(error) {
			console.log("[tool_import_dedalo_csv.rename_files] error",error)
		})


		return js_promise
	};//end rename_files



	/**
	* CREATE_CHECKBOX
	* @return 
	*/
	this.create_checkbox = function(file_name, file_info) {

		var checkbox_wrap = document.createElement('div')
			checkbox_wrap.classList = "checkbox_row_wrap"

		var input 		= document.createElement('input')
			input.type 	= 'checkbox'
			input.id 	= 'checkbox_' + file_name
			input.value = file_name
			input.className = 'checkbox_file'

		// Add label
		var new_label = document.createElement("label");
			new_label.setAttribute("for", 'checkbox_' + file_name);
			new_label.innerHTML = file_name;

		// Add input section tipo
		var input_section_tipo				= document.createElement('input')
			input_section_tipo.type 		= 'text'
			input_section_tipo.className 	= 'input_section_tipo'
			input_section_tipo.placeholder 	= 'section tipo'

			// Filename search section tipo with regular expresion
			var re = /^.+[-|_](.+).csv$/
			var found = file_name.match(re);
			//console.log(found);
			if (found && typeof found[1]!=='undefined') {
				input_section_tipo.value = found[1]
			}		

		// Add info of first row
		var info_first_row = document.createElement('div')
			info_first_row.innerHTML 	= file_info
			info_first_row.className 	= 'file_info'

		// Add delete file button
		var delete_button = document.createElement('input')
			delete_button.type = "button"
			delete_button.value = "Delete file"
			delete_button.classList = "btn btn-default btn-sm delete_file"
			delete_button.addEventListener("click", function(e) {
				tool_import_dedalo_csv.delete_csv_file(this, file_name)
			})

		checkbox_wrap.appendChild(delete_button);
		checkbox_wrap.appendChild(input);
		checkbox_wrap.appendChild(new_label);
		checkbox_wrap.appendChild(input_section_tipo);
		checkbox_wrap.appendChild(info_first_row);		

		info_first_row.addEventListener('click', function(event){
										event.preventDefault()
										var el = checkbox_wrap.querySelector("pre")
										if(el)
											el.style.display = (el.style.display !== 'none' ? 'none' : '' );
									}, false);
		
		// <input type="checkbox" class="css_check_box" >
		return checkbox_wrap;
	};//end create_checkbox



	/**
	* DELETE_CSV_FILE
	* @return 
	*/
	this.delete_csv_file = function(button_obj, file_name) {
		
		if (!confirm("Are you sure to delete file: "+file_name+"?")) return false

		var files_path = document.getElementById('files_path').value;

		const trigger_vars = {
				mode 		: 'delete_csv_file',
				dir  		: files_path,
				file_name 	: file_name,
			}
			//return console.log(trigger_vars);

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_import_dedalo_csv.delete_csv_file] response ", response);
				}
				if (response===null) {
					alert("[tool_import_dedalo_csv.delete_csv_file] Error on delete file. Null response");
				}else{
					if (response.result && response.result === true) {
						// Remove current file row from DOM				
						button_obj.parentNode.parentNode.removeChild(button_obj.parentNode);
					}else{
						alert(response.msg);
					}
				}				
		}, function(error) {
				console.log("[tool_import_dedalo_csv.delete_csv_file] error",error)
		})


		return js_promise 
	};//end delete_csv_file



	/**
	* TRIGGER_CALL
	*//*
	var current_trigger = null
	this.trigger_call = function(obj) {

		var mydata = {};
			for (var key in obj.dataset) {
			  	console.log(key, obj.dataset[key]);
			  	mydata[key] = obj.dataset[key]
			}
			//return console.log(mydata)

		var response_div_id = obj.dataset.mode + '_response';

		var wrap_div = document.getElementById(response_div_id);
		wrap_div.innerHTML = "<span class=\"css_spinner\"><span class=\"blink\">Processing. Please wait..</span></span>";
			html_page.loading_content( wrap_div, 1 );

		if (current_trigger) {
			console.log("Sorry. Active trigger prevent twice calls. Please wait finishes current action: "+current_trigger);
			wrap_div.innerHTML = "<div>Please wait finishes current action</div>" + wrap_div.innerHTML;
			return false;
		}

		current_trigger = obj.dataset.mode

		// AJAX REQUEST
		$.ajax({
			url		: tool_import_dedalo_csv.url_trigger ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {
			
			try {
				if (received_data !== null && typeof received_data === 'object') {
					wrap_div.innerHTML = "<div>"+received_data.msg+"</div>";
					return received_data
				}				
			} catch (e) {
				console.log(e);
				if (DEBUG) console.log(received_data);
				wrap_div.innerHTML = "<pre>"+received_data+"</pre>";
			}		
			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on trigger_call: " + error_data + " (Ajax error)</span>";
			alert(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
			current_trigger = null
		})
	}//end trigger_call */



	/**
	* SET_PATH
	*/
	this.set_path = function(input_obj) {
		set_localStorage('tool_import_dedalo_csv_path', input_obj.value);
	};//end set_path



	/**
	* GET_PATH
	*/
	this.get_path = function() {

		var cookie_tool_import_dedalo_csv_path = get_localStorage('tool_import_dedalo_csv_path');
			// console.log(cookie_tool_import_dedalo_csv_path);
		if (cookie_tool_import_dedalo_csv_path) {
			// Previously set on cookie
			var element = document.getElementById('files_path')
				element.value = cookie_tool_import_dedalo_csv_path
		}
	};//end get_path



	/**
	* UPLOAD_COMPLETE
	* @return 
	*/
	this.upload_complete = function() {
		tool_import_dedalo_csv.get_dir_files( document.getElementById('button_read') )
	};//end upload_complete



};//end tool_import_dedalo_csv