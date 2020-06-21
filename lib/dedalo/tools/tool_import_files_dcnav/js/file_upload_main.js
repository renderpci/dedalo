/*
 * jQuery File Upload Plugin JS Example 8.9.1
 * https://github.com/blueimp/jQuery-File-Upload
 *
 * Copyright 2010, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/MIT
 */

/* global $, window */

$(function () {
	
	'use strict';

	// Initialize the jQuery File Upload widget:
	$('#fileupload').fileupload({
		// Uncomment the following to send cross-domain cookies:
		//xhrFields: {withCredentials: true},
		url: upload_handler_url
	});

	// Enable iframe cross-domain access via redirect option:
	$('#fileupload').fileupload(
		'option',
		'redirect',
		window.location.href.replace(
			/\/[^\/]*$/,
			'/cors/result.html?%s'
		)        
	);

	
   
	$('#fileupload').fileupload('option', {            
		// Enable image resizing, except for Android and Opera,
		// which actually support image resizing, but fail to
		// send Blob objects via XHR requests:
		disableImageResize: true,
		maxFileSize: 1 * 1024 * 1024 * 1024, // 1 GB
		//acceptFileTypes: /(\.|\/)(gif|jpe?g|psd|png|tif?f|pdf)$/i        
	});
	
	// Load existing files:
	$('#fileupload').addClass('fileupload-processing');
	$.ajax({
		// Uncomment the following to send cross-domain cookies:
		//xhrFields: {withCredentials: true},
		url: $('#fileupload').fileupload('option', 'url'),
		dataType: 'json',
		context: $('#fileupload')[0]
	}).always(function () {
		$(this).removeClass('fileupload-processing');
	}).done(function (result) {
		
		// result is one object with array (files) of current images like 'Object {files: Array[1]}'
		// if currently have images, show button import		
		var n = result.files.length ;
		update_button_state(n)

		$(this).fileupload('option', 'done')
			.call(this, $.Event('done'), {
				result: result
			});
	});


	// BUTTON_IMPORT_IMAGES 
	$('#button_import_images').hide(0)

	$('#fileupload')
		.bind('fileuploaddone', function (e, data) {
			var n = data.getNumberOfFiles()
			update_button_state(n);
		})
		.bind('fileuploaddestroy', function (e, data) {
			var n = $("#fileupload .template-download:not('.ui-state-error')").length -1;
			update_button_state(n)
		})


	function update_button_state(n) {		
		if (n>=1) {
			$('#button_import_images').fadeIn(400, function(){
				update_destination_state(n)
				;})
			
		}else {
			$('#button_import_images').fadeOut(400);
		}
	}


	function update_destination_state(n) {

		const control_field_destination	= document.getElementById("control_field_destination")
		if (control_field_destination && control_field_destination.checked === true) {
		
			const file_processor 	 = document.querySelectorAll("span.target_component_span")
			const file_processor_len = file_processor.length
			
			if(file_processor_len < n){
					return setTimeout(function(e){
						update_destination_state(n)
					},400)
			}
			
			for (let i = file_processor_len - 1; i >= 0; i--) {
				const file_name 	= file_processor[i].dataset.file_name
				const file_hashCode = file_processor[i].dataset.hashcode
				
				tool_import_files.fix_target_portal_tipo(file_name, file_hashCode, true)
			}
		}

		return true
	}//end update_destination_state
	


});//end $(function () 

