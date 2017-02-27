


/**
* tool_tc
*/
var tool_tc = new function() {

	/*
	$(function(){
		$('.panel-heading').on('click',function(){
			tool_tc.toggle_content(this)
		})
	})
	

	window.addEventListener('load', function() {
		tool_tc.get_path()
		tool_tc.get_dir_files( document.getElementById('button_read'))
	}, false);
	*/

	
	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_tc/trigger.tool_tc.php';
	


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
	* CHANGE_ALL_TIMECODES
	* @return 
	*/
	this.change_all_timecodes = function( button_obj, save ) {
		
		var response_div = document.getElementById('response_div')		
		var tc_content_right 	 = document.getElementById('tc_content_right')
		
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





};//end tool_tc