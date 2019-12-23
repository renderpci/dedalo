


/**
* TOOL_TR_PRINT
*/
var tool_tr_print = new function() {

	/*
	$(function(){
		$('.panel-heading').on('click',function(){
			tool_tr_print.toggle_content(this)
		})
	})
	

	window.addEventListener('load', function() {
		tool_tr_print.get_path()
		tool_tr_print.get_dir_files( document.getElementById('button_read'))
	}, false);
	*/

	
	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_tr_print/trigger.tool_tr_print.php';


	/**
	* CHANGE_TOOL_LANG
	* @return 
	*/
	this.change_tool_lang = function(select_object) {

		var lang 	= select_object.value		
		var url  	= window.location.href
			if (url.indexOf('lang=')===-1) {
				url = url + '&lang=lg-eng'
			}
			
		var new_url = change_url_variable(url, 'lang', lang)

		window.location.href = new_url
	};//end change_tool_lang



	/**
	* show_header
	* @return 
	*/
	this.show_header = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var ar_elements = document.querySelectorAll('.tr_header')
		var len = ar_elements.length
		//console.log(ar_elements);

		if (checkbox_obj.checked===true) {
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = ''
			}
		}else{
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = 'none'
			}
		}
	};//end show_header



	/**
	* SHOW_TC
	* @return 
	*/
	this.show_tc = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var tc_elements = document.querySelectorAll('.column_tc, .tc')
		var len = tc_elements.length
		//console.log(tc_elements);

		if (checkbox_obj.checked===true) {
			for (var i = len - 1; i >= 0; i--) {
				tc_elements[i].style.display = ''
			}
		}else{
			for (var i = len - 1; i >= 0; i--) {
				tc_elements[i].style.display = 'none'
			}
		}
	};//end show_tc



	/**
	* SHOW_PERSONS
	* @return 
	*/
	this.show_persons = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var ar_elements = document.querySelectorAll('.person')
		var len = ar_elements.length
		//console.log(ar_elements);

		if (checkbox_obj.checked===true) {
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = ''
			}
		}else{
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = 'none'
			}
		}
	};//end show_persons



	/**
	* SHOW_INDEX
	* @return 
	*/
	this.show_index = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var ar_elements = document.querySelectorAll('.index')
		var len = ar_elements.length
		//console.log(ar_elements);

		if (checkbox_obj.checked===true) {
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = ''
			}
		}else{
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = 'none'
			}
		}
	};//end show_index



	/**
	* SHOW_INDEX_info
	* @return 
	*/
	this.show_index_info = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var ar_elements = document.querySelectorAll('.descriptors_container')
		var len = ar_elements.length
		//console.log(ar_elements);

		if (checkbox_obj.checked===true) {
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = ''
			}
		}else{
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = 'none'
			}
		}
	};//end show_index_info



	/**
	* SHOW_struct
	* @return 
	*/
	this.show_struct = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var ar_elements = document.querySelectorAll('.section_struct')
		var len = ar_elements.length
		//console.log(ar_elements);

		if (checkbox_obj.checked===true) {
			for (var i = len - 1; i >= 0; i--) {
				//ar_elements[i].style.display = ''
				ar_elements[i].classList.remove('section_struct_none')
			}
		}else{
			for (var i = len - 1; i >= 0; i--) {
				//ar_elements[i].style.display = 'none'
				ar_elements[i].classList.add('section_struct_none')
			}
		}
	};//end show_struct



	/**
	* SHOW_struct_info
	* @return 
	*/
	this.show_struct_info = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var ar_elements = document.querySelectorAll('.descriptors_struct_container')
		var len = ar_elements.length
		//console.log(ar_elements);

		if (checkbox_obj.checked===true) {
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = ''
				//ar_elements[i].classList.remove('descriptors_struct_container_none')
			}
		}else{
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = 'none'
				//ar_elements[i].classList.add('descriptors_struct_container_none')
			}
		}
	};//end show_struct_info



	/**
	* SHOW_lines
	* @return 
	*/
	this.show_lines = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var ar_elements = document.querySelectorAll('table.ar_tc_text td')
		var len = ar_elements.length
		//console.log(ar_elements);

		if (checkbox_obj.checked===true) {
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.border = ''
			}
		}else{
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.border = 'none'
			}
		}
	};//end show_lines



	/**
	* RESET_ALL_SHOWED
	* @return 
	*/
	this.reset_all_showed = function(checkbox_id) {

		// Hide div elements
		let ar_elements = [
			"original_text",
			"text_clean",
			"source_text",			
			"ar_tc_text",
			//"pseudo_vtt"
		]

		const len_elements = ar_elements.length
		for (let i = 0; i < len_elements; i++) {
			document.getElementById(ar_elements[i]).style.display = "none"
		}

		// Uncheck checkboxes		
		let ar_checkbox = [
			"show_original",
			"show_text_clean",
			"show_source",
			"show_ar_tc",
			//"show_pseudo_vtt"
		]
		const len_checkbox = ar_checkbox.length
		for (let i = 0; i < len_checkbox; i++) {
			let current_checkbox_id = ar_checkbox[i]
			if (current_checkbox_id!==checkbox_id) {
				document.getElementById(current_checkbox_id).checked = false
			}
		}
				

		return true
	};//end reset_all_showed



	/**
	* SHOW_ORIGINAL
	* @return 
	*/
	this.show_original = function(checkbox_obj) {

		if (checkbox_obj.checked===true) {

			// Hide others
			this.reset_all_showed( checkbox_obj.id )

			// Show current
			let original_text = document.getElementById('original_text')
				original_text.style.display = "block"

		}

		return true
	};//end show_original



	/**
	* SHOW_text_clean
	* @return 
	*/
	this.show_text_clean = function(checkbox_obj) {
		
		if (checkbox_obj.checked===true) {

			// Hide others
			this.reset_all_showed( checkbox_obj.id )

			// Show current
			let text_clean = document.getElementById('text_clean')
				text_clean.style.display = "block"

		}

		return true
	};//end show_text_clean



	/**
	* SHOW_SOURCE
	* @return 
	*/
	this.show_source = function(checkbox_obj) {

		if (checkbox_obj.checked===true) {

			// Hide others
			this.reset_all_showed( checkbox_obj.id )

			// Show current
			let source_text = document.getElementById('source_text')
				source_text.style.display = 'block'
		}

		return true
	};//end show_source



	/**
	* SHOW_AR_TC
	* @return 
	*/
	this.show_ar_tc = function(checkbox_obj) {

		if (checkbox_obj.checked===true) {

			// Hide others
			this.reset_all_showed( checkbox_obj.id )

			// Show current
			let ar_tc_text = document.getElementById('ar_tc_text')
				ar_tc_text.style.display = 'block'
		}

		return true
	};//end show_ar_tc



	/**
	* SHOW_PSEUDO_VTT
	* @return 
	*/
	this.show_pseudo_vtt = function(checkbox_obj) {

		if (checkbox_obj.checked===true) {

			// Hide others
			this.reset_all_showed( checkbox_obj.id )

			// Show current
			let pseudo_vtt = document.getElementById('pseudo_vtt')
				pseudo_vtt.style.display = "block"

		}

		return true
	};//end show_pseudo_vtt



	/**
	* PRINT
	* @return 
	*/
	this.print = function(button_obj) {
		window.print()
	};//end print



	/**
	* SAVE_VTT
	* @return 
	*/
	this.save_vtt = function(button_obj, file_name) {

		let pseudo_vtt 	= document.getElementById('pseudo_vtt')		
		let text 		= pseudo_vtt.firstChild.innerHTML
			text 		= text.replace(/--&gt;/g, "-->");

		// Build blob container
		let blob = new Blob([text], {type: "text/plain;charset=" + document.characterSet})
		
		// Save blob as file
		saveAs(blob, file_name)
		
		return true
	};//end save_vtt



	/**
	* SELECT_TEXT
	*/
	this.select_text = function(id) {
	    var sel, range;
	    var el = document.getElementById(id); //get element id
	    if (window.getSelection && document.createRange) { //Browser compatibility
	      sel = window.getSelection();
	      if(sel.toString() == ''){ //no text selection
	         window.setTimeout(function(){
	            range = document.createRange(); //range object
	            range.selectNodeContents(el); //sets Range
	            sel.removeAllRanges(); //remove all ranges from selection
	            sel.addRange(range);//add Range to a Selection.
	        },1);
	      }
	    }else if (document.selection) { //older ie
	        sel = document.selection.createRange();
	        if(sel.text == ''){ //no text selection
	            range = document.body.createTextRange();//Creates TextRange object
	            range.moveToElementText(el);//sets Range
	            range.select(); //make selection.
	        }
	    }
	}//end select_text



	/**
	* CHANGE_ALL_TIMECODES
	* @return 
	*//*
	this.change_all_timecodes = function( button_obj, save ) {
		
		var response_div 	  = document.getElementById('response_div')		
		var tc_content_right  = document.getElementById('tc_content_right')
		
		var tc_offset 	 = document.getElementById('tc_offset')
			if (tc_offset.value==="" || tc_offset.value===null) {
				response_div.innerHTML  = "<span style=\"color:red\">Ops.. Empty tc offset value</span>";
				tc_offset.focus()
				return false;
			}

		if (save===true) {
			if( !confirm(get_label.seguro) )  return false;	
		}	

		var trigger_vars = {
			mode 			: 'change_all_timecodes',
			tipo 			: tc_offset.dataset.tipo,
			section_tipo 	: tc_offset.dataset.section_tipo,
			parent 			: parseInt(tc_offset.dataset.parent),
			lang 			: tc_offset.dataset.lang,
			offset_seconds 	: parseInt(tc_offset.value),
			save 			: save,				
		}
		//return 	console.log(trigger_vars);

		html_page.loading_content( tc_content_right, 1 );

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				console.log("[tool_tr_print.change_all_timecodes] response",response);

				if (response===null) {
					response_div.innerHTML  = "<span style=\"color:red\">Error on change timecode tags</span>";							
				}else{							

					// msg
					response_div.innerHTML  = response.msg;

					// Reloads page
					if (save===true) {
						tc_content_right.innerHTML 		= "Reloading.."
						window.location.href 	= window.location.href
					}else{
						// result text
						tc_content_right.innerHTML 		= response.result
					}
				}

				html_page.loading_content( tc_content_right, 0 );												
		})

		return js_promise
	};//end change_all_timecodes */





};//end tool_tr_print