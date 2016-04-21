// JavaScript Document

/*
	TIME MACHINE
*/
$(document).ready(function() {

	switch(page_globals.modo){

		case 'edit':
			/*
			// OBJ SELECTOR BUTTON OPEN TIME MACHINE WINDOW
			var button_tm_open = $('DIV.tool_time_machine_icon');
				
				// LIVE EVENT CLICK TO BUTTON (ICON) LOAD TOOL
				$(document.body).on("click", button_tm_open.selector, function(){
					
					// LOAD TOOL (OPEN DIALOG WINDOW)
					tool_time_machine.load_time_machine(this,true);
				});
			*/
			break;

		case 'list':
			/*
			// OBJ SELECTOR BUTTON OPEN TIME MACHINE WINDOW
			var button_tm_open = $('DIV.tool_time_machine_icon');
				
				// LIVE EVENT CLICK TO BUTTON (ICON) LOAD TOOL
				$(document.body).on("click", button_tm_open.selector, function(){
					
					// LOAD TOOL (AJAX LOAD BOTTOM ROWS)
					tool_time_machine.section_records_load_rows_history(this);
				});
			*/
			break;
			
		case 'tool_time_machine':
			/*
			// OBJ SELECTOR BUTTON SET VALUE TO TM INPUT PREVIEW
			var button_tm_go_back = $('DIV .css_time_machine_record_line');
			
				// LIVE EVENT CLICK TO BUTTON (ICON)		
				$(document.body).on("click", button_tm_go_back.selector, function(){			
					
					// SET TM VALUE TO COMPONENT PREVIEW
					tool_time_machine.set_tm_history_value_to_tm_preview(this);
				});		
			*/	
			/*
			// OBJ SELECTOR BUTTON SET VALUE TO REAL COMPONENT (APPLY AND SAVE)
			var button_tm_aplicate = $('DIV.apply_and_save_link');
			
				// LIVE EVENT CLICK TO BUTTON (ICON)
				//$(document.body).on("click", button_tm_aplicate.selector, function(){
					// APPLY AND ASSIGN CURRENT VALUE TO REAL COMPONENT
					tool_time_machine.assign_time_machine_value(this);		//if (DEBUG) console.log(this)
				});
			*/

			break;

	}
	
		
});


var changed_original_content 		= 0;	// Default 0. When fire 'set_tm_history_value_to_tm_preview' is set to 1
var fixed_current_tipo_section 		   ;	// Set on load_time_machine function

// TOOL_TIME_MACHINE CLASS
var tool_time_machine = new function() {

	this.trigger_tool_time_machine_url	= DEDALO_LIB_BASE_URL + '/tools/tool_time_machine/trigger.tool_time_machine.php' ;
	var current_id_time_machine 		= null;	// Set on load_preview_component loaded html 
	
	

	/**
	* LOAD PREVIEW TM COMPONENT
	* Load by ajax, current component in 'tool_time_machine' mode whith data from last row in matrix_time_machine
	*/
	this.load_preview_component = function ( tipo, parent, lang, id_time_machine, current_tipo_section) {
		
		//console.log(tool_time_machine.current_id_time_machine); return false;

		var target_div = $('#tm_component_time_machine');		
			if(target_div.length!=1) {
				inspector.show_log_msg("Error: load_preview_component (target_div not found!)");
				return false;
			}
	
		// Set global value for current_tipo_section
		fixed_current_tipo_section = current_tipo_section;

		if (!id_time_machine) {
			id_time_machine = tool_time_machine.current_id_time_machine
		};
		
		var mydata	= {
						'mode'					: 'load_preview_component',
						'tipo'					: tipo,
						'parent'				: parent,
						'lang'					: lang ,
						'id_time_machine'		: id_time_machine,
						'current_tipo_section'	: current_tipo_section,
						'top_tipo'				: page_globals.top_tipo
					}
					//return 	console.log(mydata)
		
		html_page.loading_content( target_div, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.trigger_tool_time_machine_url,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			//console.log(received_data)
			target_div.html(received_data);

			// Portal case hide content and buttons
			if( typeof(component_portal) != 'undefined' ) {
				component_portal.hide_buttons_and_tr_edit_content();
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			inspector.show_log_msg("<span class='error'>Error on load_time_machine [load_preview_component] " + id_matrix + "</span>");
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( target_div, 0 );
		});
	}



	/**
	* SET TIME MACHINE ROW VALUE TO TM PREVIEW COMPONENT
	*/
	this.set_tm_history_value_to_tm_preview = function ( obj ) {
		
		var parent 				 = $(obj).data('parent'),
			tipo				 = $(obj).data('tipo'),
			lang 				 = $(obj).data('lang'),
			id_time_machine 	 = $(obj).data('id_time_machine'),
			current_tipo_section = $(obj).data('current_tipo_section')		

		tool_time_machine.load_preview_component( tipo, parent, lang, id_time_machine, current_tipo_section);	
	}


	/**
	* ASSIGN TIME MACHINE VALUE (APPLY)
	*/
	this.assign_time_machine_value = function ( obj ) {	
		/*
		var target_div 			= top.$('#dialog_page_iframe')
			if(target_div.length<1) {
				inspector.show_log_msg("Error: load_preview_component (target_div not found!)")
				return false;
			}
		*/
		var target_div = document.getElementById('html_page_wrap')

		var parent 					= obj.dataset.parent,
			tipo 					= obj.dataset.tipo,
			section_tipo 			= obj.dataset.section_tipo,
			lang 					= obj.dataset.lang,
			id_time_machine 		= tool_time_machine.current_id_time_machine, // set on load_preview_component 
			current_tipo_section 	= fixed_current_tipo_section // Fixed global
	
		var mydata	= { 'mode' 					: 'assign_time_machine_value',
						'parent' 				: parent,
						'tipo' 					: tipo,
						'section_tipo' 			: section_tipo,
						'lang' 					: lang,
						'id_time_machine' 		: id_time_machine,
						'current_tipo_section' 	: current_tipo_section,
						'top_tipo' 				: page_globals.top_tipo
					}
					//return console.log(mydata);
		
		html_page.loading_content( target_div, 1 );

		// AJAX REQUEST
		$.ajax({
		  	url		: this.trigger_tool_time_machine_url,
			data	: mydata,
			type	: "POST",
		})
		// DONE
		.done(function(data_response) {
			//console.log(data_response);		  	
		  	if (/error/i.test(data_response)) {
				alert(data_response)
			}else{
				// Notify time machine tool content is changed (on close action updates page component)
				//top.changed_original_content = 1;
				window.opener.changed_original_content = 1;

				// Close dialog modal window
				//var callback = target_div.dialog('close');	//top.$("#dialog_page_iframe")
				window.close();							

			}
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			//var msg = "[trigger] Request failed: " + textStatus ;
			//wrap_div.html(" <span class='error'>Error on call trigger " + msg + "</span>");
			inspector.show_log_msg("<span class='error'>Error on load_time_machine [assign_time_machine_value] " + id_matrix + "</span>");
		 	alert( msg );
		})
		// ALWAYS
		.always(function() {
			// Spinner OFF
			html_page.loading_content( target_div, 0 );	
		})
		
	}//end assign_time_machine_value



	/**
	* SECTION_RECORDS_RECOVER_SECTION
	*/
	this.section_records_recover_section = function ( button_obj ) {

		button_obj = $(button_obj)

		var id_time_machine	= button_obj.data('id_time_machine'),
			tipo 			= button_obj.data('tipo'), // section tipo
			wrap_div		= $('#tm_list_container')
		
		// CONFIRM
		if( !confirm( 'Recover record ?' )) return false;
		
		var myurl 	= DEDALO_LIB_BASE_URL + '/tools/tool_time_machine/trigger.tool_time_machine.php',
			mydata	= { 
						'mode'			 	  : 'section_records_recover_section',
						'current_tipo_section': tipo,
						'id_time_machine'	  : id_time_machine,
						'top_tipo'		 	  : page_globals.top_tipo
					  }
					  //return console.log(mydata)
		html_page.loading_content( wrap_div, 1 );
		
		// AJAX REQUEST
		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// Alert error
				alert( received_data )				
			}else{
				// RELOAD_ROWS_LIST
				var call_uid = 'wrap_' + tipo + '_' + 'list';	// wrap_dd1140_list
				search.reload_rows_list(call_uid);

				// HIDE CURRENT TM LIST
				wrap_div.fadeOut('250');
				/*
				setTimeout(function() {
					var current_options = wrap_div.find('.css_section_list_wrap').first().data('options');
					//console.log( current_options.filter_by_id.length )

					if (current_options.filter_by_id.length>1) {
						$.each( current_options.filter_by_id, function( index, item ) {
							//console.log(current_options.filter_by_id)
							if (typeof item =='undefined') return;
							var current_key = item.section_id_matrix;
							if (current_key==id_time_machine) {
								// Delete element of array
								current_options.filter_by_id.splice(index,1);	//console.log("deleted var "+current_key)
								// Update wrap data options and reload current tm list
								wrap_div.find('.css_section_list_wrap').first().data('options',current_options);
								var call_uid = 'wrap_' + tipo + '_' + 'list_tm';	// wrap_dd1140_list_tm
								return search.reload_rows_list(call_uid);
							}
						});
					}else{
						// Last record is recovered. Hide tm list
						wrap_div.fadeOut('250');
					}					
				}, 10)
				*/
			}			
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on section_records_recover_section !</span> ");
		})
		// ALWAYS
		.always(function() {			
			html_page.loading_content( wrap_div, 0 );
		});
		if (DEBUG) console.log("Fired section_records_recover_section: "+ id_time_machine + " " );	
	}




}//end class




window.onload = function(event) {
	fix_height_of_texteditor()
};
window.onresize = function(event) {
    //fix_height_of_texteditor() 
};


// Automatically change the height of the editor based on window resize
function fix_height_of_texteditor() {

	if (page_globals.modo!='tool_time_machine') {
		return false;
	};

	$(document).ready(function() {
		
	    if (typeof tinymce=='undefined' || tinymce==undefined || !tinymce ) return;
   	

	    try {

			//var w = $('#tm_component_time_machine').width();	
		    var h = $('#tm_component_time_machine').height();
		    	console.log(h)
		    var h_adjust = 100	

		    var ar_editors = tinymce.editors
	    	
    		for (var i = 0; i < ar_editors.length; i++) {

    			var editor = ar_editors[i]

    			//tinyMCE.activeEditor.theme.resizeTo(
    			editor.theme.resizeTo(
			        null,
			        h + h_adjust
			    );
    		}		    
		    

		}catch(e) {
			console.log("Error: "+e)
		}
    })

}//end fix_height_of_texteditor


