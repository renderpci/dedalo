
// READY
jQuery(document).ready(function($) {
	
	$('html, body').animate({
				        scrollTop: 0
				    }, 200);
	
});

/**
* TOOL_UPLOAD CLASS
*/ 
var tool_import_zotero = new function() {

	this.trigger_url = DEDALO_LIB_BASE_URL + '/tools/tool_import_zotero/trigger.tool_import_zotero.php?top_tipo='+page_globals.top_tipo ;


	/**
	* UPLOAD_COMPLETE | Overwrite tool_upload.uploadComplete
	*/
	this.upload_complete_DEPRECATED = function(evt) {
		
		clearInterval(parent.intervalTimer);

		var uploadResponse = document.getElementById('uploadResponse');

		uploadResponse.innerHTML = evt.target.responseText; // Response 

		uploadResponse.style.display = 'block';
		
		uploading 	= 'no';
		
		// HIDE SOME UPLOAD FORM ELEMENTS
		//$('.row, #fileInfo').hide(0);
		$('#fileInfo').hide(0);

		// Load preview table
		tool_import_zotero.load_preview_table();


	}//end uploadComplete



	/**
	* LOAD_PREVIEW_TABLE 
	* Ajax load preview html
	*/
	this.load_preview_table = function(button_obj) {
		/*
		$( '#wrap_preview' ).after(function() {
		  return "<span class=\"processing_msg\">Processing files. Please wait..</span>";
		}).hide(0);
		*/
		var button_tipo = $(button_obj).data('button_tipo');
		var url = DEDALO_LIB_BASE_URL + '/tools/tool_import_zotero/html/preview.php?button_tipo='+button_tipo;
		$("#wrap_preview").load(url, function(){
			//setTimeout(function() {
				$('html, body').animate({
								        scrollTop: $("#wrap_preview").offset().top -5
								    }, 200);
				$('#wrap_process').html('');
				$('#button_import_files').fadeIn(300)
			//}, 10)			

		}); //>*
	}


	/**
	* PROCESS_FILE
	* @param obj button_obj
	*/
	this.process_file = function(button_obj) {
		//console.log(button_obj);

		$( button_obj ).after(function() {
		  return " <span class=\"processing_msg\">Processing file. Please wait..</span>";
		}).hide(300);		 

		var wrap_div 	= $('#wrap_process'),
			ar_input 	= $( ".form_preview input:checkbox" ),
			button_tipo = $(button_obj).data('button_tipo')
			//return 	console.log(button_tipo)					

		if( $(wrap_div).length!= 1 ) return alert("Error on get wrap_div");

		var checkbox_values = {};
		$.each( ar_input, function( key, value ) {
		  	checkbox_values[key] = $(value).prop('checked');
		});
		//return console.log(checkbox_values);

		// Spinner ON
		html_page.loading_content( wrap_div, 1 );	//'.table_preview'
		$('.table_preview').css('opacity','0.5');
		
		var mydata = {
			'mode' 			  : 'process_file',
			'checkbox_values' : checkbox_values,
			'button_tipo' 	  : button_tipo // Store custom properties if need overwrite
		}

		// AJAX REQUEST
		$.ajax({
		  	url		: this.trigger_url,
			data	: mydata,
			type	: "POST",
		})
		// DONE
		.done(function(data_response) {
			//console.log(data_response);
		  	
		  	// Search 'error' string in response
			var error_response = /error/i.test(data_response);								

			// If data_response contain 'error' show alert error with (data_response) else reload the page
			//if(error_response) {
				// Alert error
				//alert("[trigger process_file] Request failed: \n" + data_response +' '+ $(data_response).text() );
			//}else{
				$('.processing_msg').html("<h1>Ok "+get_label.fichero_de_zotero_procesado_correctamente+"</h1>");
				$('#wrap_process').html(data_response);
				$('.form_elements').css('margin-bottom','10px');
				
				$('html, body').animate({
								        scrollTop: $(".processing_msg").offset().top -5
								    }, 200);
				
				$('#button_import_files').hide();
			//}			
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[trigger] Request failed: " + textStatus ;
			wrap_div.html(" <span class='error'>Error on call trigger " + msg + "</span>");
		 	alert( msg );
		})
		// ALWAYS
		.always(function() {
			// Spinner OFF
			html_page.loading_content( wrap_div, 0 );
			$('.table_preview').css('opacity','1');
		})
		
		return false;
	}

	
}//end class