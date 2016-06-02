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
	* Añade la relación seleccionada desde el listado de registros (rows) o desde 
	* el botón add resource of current tag en component_text_area (etiquetas de indexación)
	* @param object button_obj
	*	DOM object
	*/
	this.add_resource = function (button_obj) {

		var target_obj = document.getElementById('html_page_wrap')	

		// Portal wrapper on opener window
		var wrapper_obj = window.opener.document.querySelectorAll('.wrap_component_'+button_obj.dataset.portal_tipo);
			//return console.log(wrapper_obj[0]);


		// PORTAL_TIPO
		var portal_tipo = button_obj.dataset.portal_tipo;
			if(typeof portal_tipo=='undefined' || portal_tipo==-1)	return alert("Error: tool_portal.add_resource: portal_tipo is not valid! " +portal_tipo);

		// PORTAL_PARENT
		var portal_parent = button_obj.dataset.portal_parent;
			if(typeof portal_parent=='undefined' || portal_parent==-1)	return alert("Error: tool_portal.add_resource: portal_parent is not valid! " +portal_parent);

		// SECTION_TIPO
		var portal_section_tipo = button_obj.dataset.portal_section_tipo;
			if(typeof portal_section_tipo=='undefined' || portal_section_tipo==-1)	return alert("Error: tool_portal.add_resource: portal_section_tipo is not valid! " +portal_section_tipo);

		// REL LOCATOR etiqueta actual like '1604.0.0'	or '1241.dd87.2'
		var rel_locator = button_obj.dataset.rel_locator;
			if(typeof rel_locator=='undefined' || rel_locator==-1)	return alert("Error: tool_portal.add_resource: rel_locator is not valid! " +rel_locator);	
		
		var mydata	= {
						'mode'				 : 'add_resource',
						'portal_tipo'		 : portal_tipo,
						'portal_parent'		 : portal_parent,
						'portal_section_tipo': portal_section_tipo,
						'rel_locator'		 : rel_locator,
						'top_tipo'			 : page_globals.top_tipo,							
					}
					//return 	console.log(mydata);

		// PREV LOCATOR
		// When url var 'locator' is received, we understand that action is replace previous locator for new locator
		// This happends ussually when new resource is created and we need only a seleted fragment of text (like bibliography)
		var url_vars = get_current_url_vars()
			mydata.prev_locator = url_vars.locator || null;
			if (mydata.prev_locator) { 
				mydata.prev_locator = decodeURI(mydata.prev_locator); // locator is php urlencode
			}		

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
				alert("[add_resource] Request failed: \n" + data_response);
			}else{
				// Espected value string ok
				if(data_response=='ok') {						
					/* NOT NECESSARY NOW (refresh is set in tool common)
					// Reload opener portal component
					if (wrapper_obj && wrapper_obj[0]) {
						var wrapper_obj_id = wrapper_obj[0].id;
						window.opener.component_common.load_component_by_wrapper_id(wrapper_obj_id);
					}else{
						// If no portal component is detected, reload all opener page
						window.opener.location.reload(false);
					}
					*/
					if (DEBUG) {
						window.opener.console.log("DEBUG: Added resource locator:")
						window.opener.console.log(rel_locator)
					}

					// Close current tool_portal window
					window.close()					
				
				}else{
					alert("[add_resource] Warning: " + data_response);
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