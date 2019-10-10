// JavaScript Document
/*
	TOOL_PDF_VERSIONS
*/




// TOOL transcription CLASS
var tool_pdf_versions = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_pdf_versions/trigger.tool_pdf_versions.php' ;

	/**
	* CHANGE MEDIA QUALITY	
	this.thumb_default_url;
	this.change_media_quality = function ( button_obj ) {

		if ( typeof(this.thumb_default_url)=='undefined' ) {
			this.thumb_default_url = $('.thumb_container').find('.pdf_object_thumb').attr('data');	//return alert(this.thumb_default_url);
		};
		
		var quality 	= $(button_obj).data('quality'),
			pdf_id 		= $(button_obj).data('pdf_id'),
			tipo 		= $(button_obj).data('tipo')

		var src_target 	= media_base_path + '/' + quality +'/' + pdf_id + '.' + media_extension;
			if(SHOW_DEBUG===true) console.log('->change_media_quality: '+src_target)

		var mediaObj 	= $('.thumb_container').find('.pdf_object_thumb').first();
			//return alert( $(mediaObj).length )

		var wrap_div 	= $(button_obj).parents('.wrap_tool:first');
		html_page.loading_content( wrap_div, 1 );		

		try{
			
			if($(mediaObj).length==1) {

				if ( $(mediaObj).attr("data")==src_target ) {
					// Restore source media
					$(mediaObj).attr("data", this.thumb_default_url);			
				}else{
					// Change source media
					$(mediaObj).attr("data", src_target);
				}				
			}else{
				alert("mediaObj not found")
			}

		}catch(err){ 
			alert(err) 
		}
		
		html_page.loading_content( wrap_div, 0 );	
	}
	*/


	/**
	* VIEW_PDF
	*/
	this.view_pdf = function(button_obj) {

		var pdf_id			  = $(button_obj).data('pdf_id'),
			quality			  = $(button_obj).data('quality'),
			aditional_path	  = $(button_obj).data('aditional_path'),
			initial_media_path= $(button_obj).data('initial_media_path')
		
		var src_target 		= media_base_path + initial_media_path + '/' + quality + aditional_path + '/' + pdf_id + '.' + media_extension;

		//alert( $(window).width() + ' - '+ $(window).height())	

		var window_url		= src_target ,	
			window_name		= "View pdf "+pdf_id,
			w_width			= $(window).width(),
			w_height		= $(window).height();

		// Open and focus window
		pdf_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
		pdf_window.focus();
	}

	/**
	* FILE EXISTS
	*/
	this.file_exists = function(button_obj, time) {
		
		if (typeof time == 'undefined') time = 5000;

		var pdf_id 				= $(button_obj).data('pdf_id'),
			quality				= $(button_obj).data('quality'),
			aditional_path		= $(button_obj).data('aditional_path'),
			initial_media_path	= $(button_obj).data('initial_media_path')

		if(SHOW_DEBUG===true) console.log("->file_exists vars:" +pdf_id+' '+quality+' '+time);

		var mode 		= 'file_exists';
		var mydata		= { 'mode': mode,
							'pdf_id': pdf_id,
							'quality': quality,
							'aditional_path': aditional_path,
							'initial_media_path': initial_media_path,
							'top_tipo':page_globals.top_tipo
						  };

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			if (received_data!=0) {

				var ar = pdf_id.split("-");
				var tipo = ar[0];
				component_pdf.update_component(tipo)
				
			}else{
				// Loop
				setTimeout(function() {
					time = time + 1000;
        			component_pdf.file_exists(button_obj, time);
        		}, time);
			}
			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on file_exists data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
		})

	};//end file_exists


	/**
	* DOWNLOAD FILE
	*/
	this.download_file = function(button_obj) {
		
		var pdf_id 				= $(button_obj).data('pdf_id'),
			quality				= $(button_obj).data('quality'),
			parent				= $(button_obj).data('parent'),
			aditional_path		= $(button_obj).data('aditional_path'),
			initial_media_path	= $(button_obj).data('initial_media_path'),
			extension			= $(button_obj).data('extension');
	
		var myurl = this.url_trigger + '?mode=download_file&pdf_id='+pdf_id +'&quality=' + quality +'&aditional_path=' + aditional_path + '&initial_media_path=' + initial_media_path + '&parent=' + parent +'&top_tipo='+page_globals.top_tipo ;
	
		if ( !confirm( get_label.descargar + ' ' + pdf_id + ' ['+quality+']' ) ) return false;
		
		try{ 
			//location.href	= myurl ;
			window.open(myurl, get_label.descargar);		
		}catch(err){ 
			alert(err) 
		}
		if(SHOW_DEBUG===true) console.log("->dowload_file vars:" +pdf_id+' '+quality);
	};

	/**
	* DELETE VERSION
	*/
	this.delete_version = function(button_obj) {
		
		if( !confirm( get_label.borrar + ' '+ get_label.fichero + ' ?') ) return false;

		var pdf_id 				= $(button_obj).data('pdf_id'),
			quality				= $(button_obj).data('quality'),			
			tipo 				= $(button_obj).data('tipo'),
			parent 				= $(button_obj).data('parent'),
			aditional_path		= $(button_obj).data('aditional_path'),
			initial_media_path	= $(button_obj).data('initial_media_path')	

		if(SHOW_DEBUG===true) console.log("->delete_version vars:" +pdf_id+' '+quality);

		var mode 		= 'delete_version';
		var mydata		= { 'mode': mode,
							'pdf_id': pdf_id,
							'quality': quality,							
							'tipo': tipo,
							'parent': parent,
							'aditional_path': aditional_path,
							'initial_media_path': initial_media_path,
							'top_tipo':page_globals.top_tipo
						  };

		var wrap_div 	= $(button_obj).parents('.wrap_tool:first');
		html_page.loading_content( wrap_div, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// Warning msg
				var msg = "<span class='error'>Error when delete file: \n" + received_data + "</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )
			}else{
				// Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					inspector.show_log_msg(msg);

				// Hide buttons and info
				//$(button_obj).hide();				

				//var ar = pdf_id.split("-");
				//var tipo = ar[0];
				//component_av.update_component(tipo);
				location.reload();
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on delete_version data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	};//end delete_version

		
	



	



};
//end tool_pdf_versions