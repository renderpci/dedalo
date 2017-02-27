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

		var target_obj  = document.getElementById('html_page_wrap')
			if (!target_obj) return console.log("[add_resource] Error on select target_obj in document");

		// PORTAL_TIPO
		var portal_tipo = page_globals.portal_tipo;
			if(typeof portal_tipo==='undefined' || portal_tipo===-1) return alert("Error: tool_portal.add_resource: portal_tipo is not valid! " +portal_tipo);

		// PORTAL_PARENT
		var portal_parent = page_globals.portal_parent; // _parent
			if(typeof portal_parent==='undefined' || portal_parent===-1) return alert("Error: tool_portal.add_resource: portal_parent is not valid! " +portal_parent);

		// SECTION_TIPO
		var portal_section_tipo = page_globals.portal_section_tipo;
			if(typeof portal_section_tipo==='undefined' || portal_section_tipo===-1) return alert("Error: tool_portal.add_resource: portal_section_tipo is not valid! " +portal_section_tipo);

		// REL LOCATOR etiqueta actual like '1604.0.0'	or '1241.dd87.2'
		var rel_locator = button_obj.dataset.rel_locator;
			if(typeof rel_locator==='undefined' || rel_locator===-1) return alert("Error: tool_portal.add_resource: rel_locator is not valid! " +rel_locator);

		// Portal wrapper on opener window
		//var wrapper_obj = window.opener.document.querySelector('.wrap_component_'+portal_tipo);
		//	if (!wrapper_obj) return console.log("[add_resource] Error on find wrapper_obj in window opener");

		var trigger_vars = {
				mode				 : 'add_resource',
				portal_tipo		 	 : portal_tipo,
				portal_parent		 : parseInt(portal_parent),
				portal_section_tipo  : portal_section_tipo,
				rel_locator		 	 : rel_locator,
				top_tipo			 : page_globals.top_tipo,							
			}
			//return console.log(trigger_vars);	

			// PREV LOCATOR
			// When url var 'locator' is received, we understand that action is replace previous locator for new locator
			// This happends ussually when new resource is created and we need only a seleted fragment of text (like bibliography)
			var url_vars = get_current_url_vars()
				trigger_vars.prev_locator = url_vars.locator || null;
				if (trigger_vars.prev_locator) { 
					trigger_vars.prev_locator = common.urldecode(trigger_vars.prev_locator) // locator is php urlencode
				}

		// Spinner loading
		html_page.loading_content( target_obj, 1 )


		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log(response)
			}

			// Remove loading overlap
			html_page.loading_content( target_obj, 0 )

			if (response===null || response.result===null) {
					console.log("Error on add_resource. Null is received from server. An error occurred on add_resource")
			}else{
				if(response.result===false) {
					// Alert error
					alert("[add_resource] Request failed: \n" + response.msg)
				}else{
					if(SHOW_DEBUG===true) {
						window.opener.console.log("DEBUG: Added resource locator:")
						window.opener.console.log(response)
					}
					//alert(response.msg)
					// Close current tool_portal window
					window.close()
				}
			}

		}, function(error) {
			//console.error("Failed search!", error);
			console.log(error)
			// Remove loading overlap
			html_page.loading_content( target_obj, 0 )
			// Top inspector msg
			top.inspector.show_log_msg( "<span class='error'>Error on add_resource</span>" + error )
		});

		return js_promise
	}//end add_resource
	


	/**
	* SHOW_MORE_TOGGLE
	* Change filter about section_creator_portal_tipo session data and reload current page
	* modes: show_more / show_filtered
	*/
	this.show_more_toggle = function(button_obj) {

		// reset search form. This remove the default 'filter_by_section_creator_portal_tipo' filter in search options
		var form = document.getElementById('search_form')
			if (form) {
				var tab_click = false
				search.reset_form(form, tab_click)
				button_obj.remove()
			}
		return;
		/* REMOVED. Now 'show_full' trigger form reset button and removes this button from DOM (tool_portal::show_more_toggle)
		var action 					   = button_obj.dataset.mode
		var	search_options_session_key = button_obj.dataset.search_options_session_key
		var body 					   = document.body
	
		// Add loading overlap
		html_page.loading_content( body, 1 );
		//$('body').fadeOut(150);

		var trigger_vars = {
			mode						: "show_more_toggle",
			action						: action,
			search_options_session_key 	: search_options_session_key,
			top_tipo					: page_globals.top_tipo
		}
		//console.log(trigger_vars)

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log(response)
			}			

			if (response===null || response.result===null) {
				
				alert("Error on show_more_toggle. Null is received from server. An error occurred")
				// Remove loading overlap
				html_page.loading_content( body, 0 )
			
			}else{
				if(response.result===false) {
					// Alert error
					alert("[show_more] Request failed: \n" + response.msg)
				}else{
					// Reload page
					location.reload();
				}
			}

		}, function(error) {
			//console.error("Failed search!", error);
			console.log(error)
			// Remove loading overlap
			html_page.loading_content( body, 0 )
			// Top inspector msg
			top.inspector.show_log_msg( "<span class='error'>Error on show_more_toggle</span>" + error )
		});

		return js_promise
		*/
	}//end show_more_toggle




};//end tool_portal