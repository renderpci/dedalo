// JavaScript Document
/*
	tool_portal
*/



// TOOL_PORTAL CLASS
var tool_portal = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_portal/trigger.tool_portal.php' ;

	// Global var. Set when load fragment info	
	this.selected_tag;
	this.selected_tipo;
	this.selected_rel_locator;


	/**
	* ADD RESOURCE
	* Añade la relación seleccionada desde el listado de registros (rows) o desde el botón add resource of current tag en component_text_area (etiquetas de indexación)
	*/
	this.add_resource = function (button_obj) {

		var button_obj 			= $(button_obj),
			target_obj 			= $('#html_page_wrap'),
			dialog_page_iframe 	= top.$("#dialog_page_iframe")

		//console.log(button_obj)
		// PORTAL_TIPO
		var portal_tipo = button_obj.data('portal_tipo');
			if(typeof portal_tipo=='undefined' || portal_tipo==-1)	return alert("Error: tool_portal.add_resource: portal_tipo is not valid! " +portal_tipo);

		// PORTAL_PARENT
		var portal_parent = button_obj.data('portal_parent');
			if(typeof portal_parent=='undefined' || portal_parent==-1)	return alert("Error: tool_portal.add_resource: portal_parent is not valid! " +portal_parent);

		// SECTION_TIPO
		var portal_section_tipo = button_obj.data('portal_section_tipo');
			if(typeof portal_section_tipo=='undefined' || portal_section_tipo==-1)	return alert("Error: tool_portal.add_resource: portal_section_tipo is not valid! " +portal_section_tipo);

		// REL LOCATOR etiqueta actual like '1604.0.0'	or '1241.dd87.2'
		var rel_locator = button_obj.data('rel_locator');
			if(typeof rel_locator=='undefined' || rel_locator==-1)	return alert("Error: tool_portal.add_resource: rel_locator is not valid! " +rel_locator);	

			//return alert( "add_resource test pasado. caller_id:"+caller_id+" rel_locator:"+rel_locator+" tipo:"+tipo  );	
		
		var mydata	= {
						'mode'				 : 'add_resource',
						'portal_tipo'		 : portal_tipo,
						'portal_parent'		 : portal_parent,
						'rel_locator'		 : rel_locator,
						'top_tipo'			 : page_globals.top_tipo,
						'portal_section_tipo': portal_section_tipo		
					  }
		//return console.log(mydata)

		// Spinner loading
		html_page.loading_content( target_obj, 1 );
		
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		.done(function(data_response) {

			// If data_response contain 'error' show alert error with (data_response) else reload the page
			if(/error/i.test(data_response)) {
				// Alert error
				alert("[add_resource] Request failed: \n" + data_response + $(data_response).text() );
			}else{
				// Espected value string ok
				if(data_response=='ok') {

					//alert("Resource added!", 'Info', function(){
						dialog_page_iframe.dialog("close");
					//});
					if (DEBUG) {
						console.log("DEBUG: Added resource locator:")
						console.log(rel_locator)
					}
				
				}else{
					alert("[add_resource] Warning: " + data_response);
					dialog_page_iframe.dialog("close"); // Update portal anyway
				}
			}
		})
		.fail( function(jqXHR, textStatus) {
			alert("resource error!")
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + "</span>" + textStatus );
		})
		.always(function() {
			html_page.loading_content( target_obj, 0 );
		})

	}//end add_resource
	


	
	
	/**
	* SHOW_MORE_TOGGLE
	* Change filter about section_creator_portal_tipo session data and reload current page
	* modes: show_more / show_filtered
	*/
	this.show_more_toggle = function(button_obj) {
		
		var mode 					   = $(button_obj).data('mode'),
			search_options_session_key = $(button_obj).data('search_options_session_key')

		//html_page.loading_content( $('body'), 1 );
		$('body').fadeOut(150);

		var mydata = {
			'mode' 						: mode,
			'search_options_session_key': search_options_session_key,
			'top_tipo'					: page_globals.top_tipo
		}
		//console.log(mydata);
		// AJAX CALL
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(data_response) {

			// If data_response contain 'error' show alert error with (data_response) else reload the page
			if(/error/i.test(data_response)) {
				// Alert error
				alert("[show_more] Request failed: \n" + data_response );
			}else{
				// Reload page
				location.reload();
			}
		})
		.fail( function(jqXHR, textStatus) {
			// log
			alert( "<span class='error'>Error on " + getFunctionName() + " [show_more] " + "</span>" + textStatus );
		})
		.always(function() {
			html_page.loading_content( $('body'), 0 );
		})
	}//end show_more_toggle




};//end tool_portal