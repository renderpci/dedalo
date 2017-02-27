


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
	* SHOW_original
	* @return 
	*/
	this.show_original = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var source_text 	= document.getElementById('source_text')
		var original_text 	= document.getElementById('original_text')
		var ar_tc_text 		= document.getElementById('ar_tc_text')

		if (checkbox_obj.checked===true) {
			if(source_text)
			source_text.style.display   = 'none'
			if(original_text)
			original_text.style.display = 'block'
			ar_tc_text.style.display 	= 'none'

			// Uncheck source
			var show_source = document.getElementById('show_source')
				show_source.checked = false

		}else{
			if(source_text)
			source_text.style.display   = 'none'
			if(original_text)
			original_text.style.display = 'none'
			ar_tc_text.style.display 	= 'block'
		}

	};//end show_original



	/**
	* SHOW_SOURCE
	* @return 
	*/
	this.show_source = function(checkbox_obj) {
		//console.log(checkbox_obj.checked);

		var source_text 	= document.getElementById('source_text')
		var original_text 	= document.getElementById('original_text')
		var ar_tc_text 		= document.getElementById('ar_tc_text')

		if (checkbox_obj.checked===true) {
			if(source_text)
			source_text.style.display   = 'block'
			if(original_text)
			original_text.style.display = 'none'
			ar_tc_text.style.display 	= 'none'

			// Uncheck original
			var show_original = document.getElementById('show_original')
				show_original.checked = false

		}else{
			if(source_text)
			source_text.style.display 	= 'none'
			if(original_text)
			original_text.style.display = 'none'
			ar_tc_text.style.display 	= 'block'
		}
	};//end show_source



	/**
	* PRINT
	* @return 
	*/
	this.print = function(button_obj) {
		window.print()
	};//end print



	/**
	* CHANGE_ALL_TIMECODES
	* @return 
	*/
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
							//console.log(response);

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
	};//end change_all_timecodes





};//end tool_tr_print