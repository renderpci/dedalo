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
					tool_time_machine.section_list_load_rows_history(this);
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

	this.trigger_tool_time_machine_url	= DEDALO_LIB_BASE_URL + '/component_tools/tool_time_machine/trigger.tool_time_machine.php' ;
	var current_id_time_machine 		= null;	// Set on load_preview_component loaded html 
	
	

	/**
	* LOAD PREVIEW TM COMPONENT
	* Load by ajax, current component in 'tool_time_machine' mode whith data from last row in matrix_time_machine
	*/
	this.load_preview_component = function ( id_matrix, tipo, lang, id_time_machine, current_tipo_section) {
		
		var target_div				= $('#tm_component_time_machine');	

		//return alert(id_matrix +","+ tipo +","+ lang +","+ id_time_machine)
		
		if(target_div.length<1) {
			inspector.show_log_msg("Error: load_preview_component (target_div not found!)")
			return false;
		}

		// Set global value for current_tipo_section
		fixed_current_tipo_section = current_tipo_section;
		
		var mode 		= 'load_preview_component';
		var mydata		= { 'mode': mode, 'id': id_matrix, 'tipo': tipo, 'lang': lang , 'id_time_machine': id_time_machine, 'current_tipo_section': current_tipo_section };		
		var received_data;
		
		

		$.ajax({
			url			: this.trigger_tool_time_machine_url,
			data		: mydata,
			type		: "POST",
			beforeSend	: function() {
							html_page.loading_content( target_div, 1 );
						},
			success		: function(received_data) {
							target_div.html(received_data);

							// Portal case hide content and buttons
							if( typeof(component_portal) != 'undefined' ) {
								component_portal.hide_buttons_and_tr_edit_content();
							}
						},
			complete	: function(data) {
							html_page.loading_content( target_div, 0 );
						},
			error		: function(error_data) {
							inspector.show_log_msg("<span class='error'>Error on load_time_machine [load_preview_component] " + id_matrix + "</span>");
						}
		});//fin $.ajax			
	}

	/**
	* SET TIME MACHINE ROW VALUE TO TM PREVIEW COMPONENT
	*/
	this.set_tm_history_value_to_tm_preview = function ( obj ) {
		
		var id_matrix 		= $(obj).data('id_matrix');
		var tipo			= $(obj).data('tipo');
		var lang 			= $(obj).data('lang');
		var id_time_machine = $(obj).data('id_time_machine');
		var current_tipo_section = $(obj).data('current_tipo_section');
		

		tool_time_machine.load_preview_component( id_matrix, tipo, lang, id_time_machine, current_tipo_section);	
	}

	/**
	* ASSIGN TIME MACHINE VALUE (APPLY)
	*/
	this.assign_time_machine_value = function ( obj ) {
		
		//if (DEBUG) console.log(obj); return false;	
		
		var target_div				= top.$('.dialog_page_iframe'); 
		
		if(target_div.length<1) {
			inspector.show_log_msg("Error: load_preview_component (target_div not found!)")
			return false;
		}

		var id_matrix 				= $(obj).data('id_matrix');
		var tipo 					= $(obj).data('tipo');
		var id_time_machine 		= tool_time_machine.current_id_time_machine ; // set on load_preview_component 
		var current_tipo_section 	= fixed_current_tipo_section ; // Fixed global

		//return alert(id_matrix +","+ id_time_machine +","+ current_tipo_section)

		var mode 		= 'assign_time_machine_value';
		var mydata		= { 'mode': mode, 'id': id_matrix, 'tipo': tipo, 'id_time_machine': id_time_machine, 'current_tipo_section': current_tipo_section };	
		var received_data;
		
		$.ajax({
			url			: this.trigger_tool_time_machine_url,
			data		: mydata,
			type		: "POST",
			beforeSend	: function() {
							html_page.loading_content( target_div, 1 );
						},
			success		: function(received_data) {
				
							if (received_data=='ok') {

								// Notify time machine tool content is changed (on close action updates page component)
								top.changed_original_content = 1;

								// Close dialog modal window
								var callback = top.$("#dialog_page_iframe").dialog('close');
								
								// Update component
								//top.component_common.update_component_by_ajax(id_matrix, callback);

							}else{
								//inspector.show_log_msg("<span class='error'>" + received_data + "</span>");
								alert(received_data)
							}																														
						},
			complete	: function(data) {						
							html_page.loading_content( target_div, 0 );																					
						},
			error		: function(error_data) {
							inspector.show_log_msg("<span class='error'>Error on load_time_machine [assign_time_machine_value] " + id_matrix + "</span>");
						}
		});//fin $.ajax	
	}

	/**
	* ROWS HISTORY
	* Load by ajax, time machine history rows to select version
	*/
	/* DEPRECATED 
	this.load_rows_history = function ( id_matrix, tipo, lang, current_tipo_section ) {
		
		var target_div				= $('#tm_selector_time_machine');

		//return(alert(id_matrix +","+ lang))		
		
		if(target_div.length<1) {
			inspector.show_log_msg("Error: load_rows_history (target_div not found!)")
			return false;
		}
		
		var mode 		= 'load_rows_history';
		var mydata		= { 'mode': mode, 'id': id_matrix, 'tipo': tipo, 'lang': lang, 'current_tipo_section': current_tipo_section };		
		var received_data;
		
		$.ajax({
			url			: this.trigger_tool_time_machine_url,
			data		: mydata,
			type		: "POST",
			beforeSend	: function() {					
							html_page.loading_content( target_div, 1 );
						},
			success		: function(received_data) {						
							target_div.html(received_data);																					
						},
			complete	: function(data) {	
							html_page.loading_content( target_div, 0 );																									
						},
			error		: function(error_data) {				
							inspector.show_log_msg("<span class='error'>Error on load_time_machine [load_rows_history] " + id_matrix + "</span>")																													
						}
		});//fin $.ajax			
	}
	*/



	/**
	* SECTION LIST METHODS ################################################################
	*/


	/**
	* SECTION LIST LOAD ROWS HISTORY
	*//*
	PASADA AL COMMON !!!!!
	this.section_list_recover_section = function ( btn_obj ) {

		var id_time_machine	= $(btn_obj).data('id_time_machine'),
			tipo 			= $(btn_obj).data('tipo'),
			wrap_div		= $('#tm_list_container');
		
		// CONFIRM
		if( !confirm( 'Recover record ?' )) return false;


		html_page.loading_content( wrap_div, 1 );
		
		var mode 		= 'section_list_recover_section';
		var mydata		= { 'mode': mode, 'tipo': tipo, 'id_time_machine': id_time_machine };
		var trigger_url	= DEDALO_LIB_BASE_URL + '/component_tools/tool_time_machine/trigger.tool_time_machine.php' ;

		// AJAX REQUEST
		$.ajax({
			url			: trigger_url,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response != false) {
				// Alert error
				alert( received_data )
				//component_common.dd_alert(received_data);
			}else{
				// Reload page (in the future versions ajax load..)		
				window.location.href = window.location.href;
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on section_list_recover_section !</span> ");
		})
		// ALLWAYS
		.always(function() {			
			html_page.loading_content( wrap_div, 0 );
		});
		if (DEBUG) console.log("Fired section_list_recover_section: "+ id_time_machine + " " );	
	}
	*/


}//end class


