// JavaScript Document
/*
	UPLOAD
*/
$(document).ready(function() {

	switch(page_globals.modo) {

		case 'tool_upload' :
					/*
					 * jQuery File Upload Plugin JS Example 8.0.1
					 * https://github.com/blueimp/jQuery-File-Upload
					 *
					 * Copyright 2010, Sebastian Tschan
					 * https://blueimp.net
					 *
					 * Licensed under the MIT license:
					 * http://www.opensource.org/licenses/MIT
					 */
					/*jslint nomen: true, regexp: true */
					/*global $, window, navigator */
					$(function () {
						'use strict';

						// Initialize the jQuery File Upload widget:
						$('#fileupload').fileupload({
							// Uncomment the following to send cross-domain cookies:
							//xhrFields: {withCredentials: true},
							url: DEDALO_LIB_BASE_URL + '/component_tools/tool_upload/tool_upload_handler.php' //'server/php/'
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

						var mode	= 'upload_file';
						var mydata	= { 'mode': mode, 'target_filename': target_filename, 'target_dir': target_dir };

						// Load existing files:
						$('#fileupload').addClass('fileupload-processing');
						$.ajax({
							// Uncomment the following to send cross-domain cookies:
							//xhrFields: {withCredentials: true},
							url: $('#fileupload').fileupload('option', 'url'),
							dataType: 'json',
							data: mydata,
							context: $('#fileupload')[0]
						}).always(function () {
							$(this).removeClass('fileupload-processing');
						}).done(function (result) {
							$(this).fileupload('option', 'done')
								.call(this, null, {result: result});
						});

					});

					break;
	}//end switch

});









// TOOL UPLOAD CLASS
var tool_upload = new function() {

	// LOCAL VARS
	this.trigger_tool_upload_url = DEDALO_LIB_BASE_URL + '/component_tools/tool_upload/trigger.tool_upload.php' ;


	/**
	* LOAD TOOL UPLOAD (OPEN DIALOG WINDOW)
	* Open tool upload dialog window (from tool upload button in inspector)
	*/
	this.load_tool_upload = function ( btn_obj ) {

		var id_matrix			= $(btn_obj).data('id_matrix');
		var tipo				= $(btn_obj).data('tipo');
		var target_filename 	= $(btn_obj).data('target_filename');
		var target_dir 			= $(btn_obj).data('target_dir');

		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m=tool_upload&t='+tipo+'&id='+id_matrix;	//return alert(iframe_src)

		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Upload "+id_matrix ,
			modal: false,
			// Clear current content on close
			close: function(event, ui) {
				// Clean url
				$(this).attr( 'src', '');
			}
        });
		
		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe')
			.attr('src',iframe_src)
			.data({"target_filename": target_filename, "target_dir": target_dir })
			.dialog( "open" );

		return false;
	}
















};
//end tool_upload