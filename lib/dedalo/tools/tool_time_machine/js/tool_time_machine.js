"use strict";
/**
* TOOL_TIME_MACHINE CLASS
*/
//var changed_original_content 		= 0	// Default 0. When fire 'set_tm_history_value_to_tm_preview' is set to 1
var fixed_current_tipo_section 		   	// Set on load_time_machine function
var tool_time_machine = new function() {


	this.trigger_tool_time_machine_url	= DEDALO_LIB_BASE_URL + "/tools/tool_time_machine/trigger.tool_time_machine.php"
	this.current_id_time_machine 		= null	// Set on load_preview_component loaded html 	
	

	$(function() {

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
	});//end $(function()


	/**
	* LOAD
	*/
	window.addEventListener("load", function (event) {
		tool_time_machine.fix_height_of_texteditor()
	});//end window load event



	/**
	* SET TIME MACHINE ROW VALUE TO TM PREVIEW COMPONENT
	*/
	this.set_tm_history_value_to_tm_preview = function ( obj ) {

		let parent 				 = obj.dataset.parent
		let	tipo				 = obj.dataset.tipo
		let	lang 				 = obj.dataset.lang
		let	id_time_machine 	 = obj.dataset.id_time_machine
		let	current_tipo_section = obj.dataset.current_tipo_section

		if(SHOW_DEBUG===true) {
			//console.log("set_tm_history_value_to_tm_preview obj",obj);;
		}

		tool_time_machine.load_preview_component(tipo, parent, lang, id_time_machine, current_tipo_section);	
	}//end set_tm_history_value_to_tm_preview



	/**
	* LOAD PREVIEW TM COMPONENT
	* Load by ajax, current component in 'tool_time_machine' mode whith data from last row in matrix_time_machine
	*/
	this.load_preview_component = function(tipo, parent, lang, id_time_machine, current_tipo_section) {
		if(SHOW_DEBUG===true) {
			//console.log("[tool_time_machine.load_preview_component] id_time_machine:", id_time_machine);
		}

		let wrapper_obj = document.getElementById('tm_component_time_machine')
			if(!wrapper_obj) {
				inspector.show_log_msg("Error: load_preview_component (wrapper_obj not found!)");
				return false;
			}
	
		// Set global value for current_tipo_section
		fixed_current_tipo_section = current_tipo_section;

		if (!id_time_machine) {
			id_time_machine = tool_time_machine.current_id_time_machine
		}
		
		// TRIGGER_VARS
		const trigger_vars = {
				mode				: 'load_preview_component',
				tipo				: tipo,
				parent				: parent,
				lang				: lang ,
				id_time_machine		: id_time_machine,
				current_tipo_section: current_tipo_section,
				top_tipo			: page_globals.top_tipo
			}
			//return console.log("trigger_vars",trigger_vars)

		html_page.loading_content( wrapper_obj, 1 );

		// PROMISE JSON XMLHttpRequest
		let js_promise = common.get_json_data(this.trigger_tool_time_machine_url, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[tool_time_machine.load_preview_component] response", response)
			}

			if (response===null) {
				if (SHOW_DEBUG===true) {
					console.log("[tool_time_machine.load_preview_component] Error. invalid response", response);
				}
				inspector.show_log_msg("<span class='error'>Error on load_time_machine [load_preview_component] " + id_time_machine + "</span>");

			}else{

				wrapper_obj.innerHTML = response.result

				// Exec js fix vars in preview html
				exec_scripts_inside( wrapper_obj )

				// Portal case hide content and buttons
				if( typeof(component_portal) !== 'undefined' ) {
					component_portal.hide_buttons_and_tr_edit_content();
				}

				// Fix text editor height
				//setTimeout(function(){
					tool_time_machine.fix_height_of_texteditor()
				//},80)
			}
				
			
			html_page.loading_content( wrapper_obj, 0 );
		}, function(error) {
			// log
			console.log("[tool_time_machine.load_preview_component] Error.", error);			
			html_page.loading_content( wrapper_obj, 0 );
		})

		return js_promise
	}//end load_preview_component



	/**
	* ASSIGN TIME MACHINE VALUE (APPLY)
	*/
	this.assign_time_machine_value = function ( button_obj ) {

		if (typeof tool_time_machine.current_id_time_machine=="undefined" || !tool_time_machine.current_id_time_machine) {
			if(SHOW_DEBUG===true) {
				console.log("tool_time_machine",tool_time_machine)
			}
			return alert("[tool_time_machine.assign_time_machine_value] Error. current_id_time_machine not found")
		}

		let parent 					= button_obj.dataset.parent
		let tipo 					= button_obj.dataset.tipo
		let section_tipo 			= button_obj.dataset.section_tipo
		let lang 					= button_obj.dataset.lang
		let id_time_machine 		= tool_time_machine.current_id_time_machine // set on load_preview_component 
		let current_tipo_section 	= fixed_current_tipo_section // Fixed global
	
		const trigger_vars = {
				mode 					: 'assign_time_machine_value',
				parent 					: parent,
				tipo 					: tipo,
				section_tipo 			: section_tipo,
				lang 					: lang,
				id_time_machine 		: id_time_machine,
				current_tipo_section 	: current_tipo_section,
				top_tipo 				: page_globals.top_tipo,
				top_id 					: page_globals.top_id
			}
			//return console.log("[tool_time_machine.assign_time_machine_value] trigger_vars",trigger_vars);
		
		let wrapper_obj = document.getElementById('html_page_wrap')
		html_page.loading_content( wrapper_obj, 1 );

		// PROMISE JSON XMLHttpRequest
		let js_promise = common.get_json_data(this.trigger_tool_time_machine_url, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[tool_time_machine.assign_time_machine_value] response", response)
			}

			if (response && response.result) {

				// Notify time machine tool content is changed (on close action updates page component)
				//top.component_common.changed_original_content = 1;
				if (window.opener && window.opener.component_common) {
					window.opener.component_common.changed_original_content = 1
				}

				// Close dialog modal window
				//var callback = wrapper_obj.dialog('close');	//top.$("#dialog_page_iframe")
				window.close();	
				
			}else{
				console.log("[tool_time_machine.assign_time_machine_value] Error. invalid response", response);
				inspector.show_log_msg("<span class='error'>Error on load_time_machine [assign_time_machine_value] " + id_time_machine + "</span>");
			}		
			
			html_page.loading_content( wrapper_obj, 0 );
		}, function(error) {
			// log
			console.log("[tool_time_machine.assign_time_machine_value] Error.", error);			
			html_page.loading_content( wrapper_obj, 0 );
		})

		return js_promise
	}//end assign_time_machine_value



	/**
	* SECTION_RECORDS_LOAD_ROWS_HISTORY
	* @return 
	*/
	this.section_records_load_rows_history = function(button_obj) {		

		// LOAD TOOL (AJAX LOAD BOTTOM ROWS HISTORY)
		let tipo 		= button_obj.dataset.tipo
		let	wrapper_obj	= document.getElementById('tm_list_container')
			if (!wrapper_obj) {
					alert("Error on get wrap tm_list_container");
			}				

		// swap visibility
		if( wrapper_obj.style.display !== 'none' ) {	// $(wrapper_obj).css('display')
			//$(wrapper_obj).hide(100);
			wrapper_obj.style.display = "none"
			return false;
		}

		wrapper_obj.innerHTML = "<span class=\"loading blink\"> Loading.. </span>"
		
		const trigger_url  = this.trigger_tool_time_machine_url
		const trigger_vars = {
				mode 					: 'section_records_load_rows_history',
				current_tipo_section 	: tipo,
				top_tipo 				: page_globals.top_tipo
			}
			//return console.log("[tool_time_machine.section_records_load_rows_history] trigger_vars",trigger_vars)

		//html_page.loading_content( wrapper_obj, 1 );

		// PROMISE JSON XMLHttpRequest
		let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[tool_time_machine.section_records_load_rows_history] response", response)
			}

			if (response && response.result) {

				wrapper_obj.innerHTML = response.result

				// Exec js fix vars in preview html
				exec_scripts_inside( wrapper_obj )

				wrapper_obj.style.display = ""

				/*
				$(wrapper_obj)
					.hide(0)
					.html(received_data)
					.fadeIn(100);*/
				
			}else{
				console.log("[tool_time_machine.section_records_load_rows_history] Error. invalid response", response);
				inspector.show_log_msg("<span class='error'>Error on load_time_machine [section_records_load_rows_history]</span>");
			}		
			
			html_page.loading_content( wrapper_obj, 0 );
		}, function(error) {
			// log
			console.log("[tool_time_machine.section_records_load_rows_history] Error.", error);			
			html_page.loading_content( wrapper_obj, 0 );
		})

		return js_promise
	};//end section_records_load_rows_history



	/**
	* SECTION_RECORDS_RECOVER_SECTION
	*/
	this.section_records_recover_section = function ( button_obj ) {

		// CONFIRM
		if( !confirm( 'Recover record ?' )) return false;

		let id_time_machine	= button_obj.dataset.id_time_machine
		let	tipo 			= button_obj.dataset.tipo // section tipo
		let	wrapper_obj		= document.getElementById('tm_list_container')		
		
		const trigger_vars = { 
				mode			 	  	: 'section_records_recover_section',
				current_tipo_section 	: tipo,
				id_time_machine	  		: id_time_machine,
				top_tipo		 	  	: page_globals.top_tipo
			}
			//return console.log("[tool_time_machine.section_records_recover_section] trigger_vars",trigger_vars)

		html_page.loading_content( wrapper_obj, 1 );

		// PROMISE JSON XMLHttpRequest
		let js_promise = common.get_json_data(this.trigger_tool_time_machine_url, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[tool_time_machine.section_records_recover_section] response", response)
			}

			if (response && response.result) {

				// RELOAD_ROWS_LIST
				let call_uid = 'wrap_' + tipo + '_' + 'list';	// wrap_dd1140_list
				search.reload_rows_list(call_uid);

				// HIDE CURRENT TM LIST
				// wrapper_obj.fadeOut('250');
				wrapper_obj.style.display = "none"
				
			}else{
				console.log("[tool_time_machine.section_records_recover_section] Error. invalid response", response);
				inspector.show_log_msg("<span class='error'>Error on load_time_machine [section_records_recover_section] " + id_time_machine + "</span>");
				alert("[tool_time_machine.section_records_recover_section] Error. invalid response");
			}		
			
			html_page.loading_content( wrapper_obj, 0 );
		}, function(error) {
			// log
			console.log("[tool_time_machine.section_records_recover_section] Error.", error);			
			html_page.loading_content( wrapper_obj, 0 );
		})

		return js_promise
	}//end section_records_recover_section



	/**
	* CHANGE_TOOL_LANG_SOURCE
	* @return 
	*/
	this.change_tool_lang_source = function(select_obj) {
		
		let lang = select_obj.value
		if (lang && lang.length>1) {

			// Reloads window 
			let current_url = window.location.href 
			let new_url 	= change_url_variable(current_url, 'lang', lang)

			window.location.href = new_url
		}
	}//end change_tool_lang_source



	/**
	* FIX_HEIGHT_OF_TEXTEDITOR
	* Automatically change the height of the editor based on window resize
	*/
	this.fix_height_of_texteditor = function() {

		if (page_globals.modo!=='tool_time_machine') {
			return false;
		}

		$(function() {
			
			if (typeof tinymce=="undefined" || tinymce==undefined || !tinymce ) return;   	

			try {
				//if(SHOW_DEBUG===true) {
					console.log("Called fix_height_of_texteditor");;
				//}

				//var w = $('#tm_component_time_machine').width();
				var h = $('#tm_component_time_machine').height();
				
				var h_adjust = 100	

				var ar_editors = tinymce.editors
				var t_len = ar_editors.length
				for (var i = 0; i < t_len; i++) {
					var editor = ar_editors[i]
					
					if (editor && typeof editor.theme != "undefined") {						
						//tinyMCE.activeEditor.theme.resizeTo(
						editor.theme.resizeTo(
							null,
							h + h_adjust
						);
					}					
				}

			}catch(e) {
				console.log("Error: "+e)
			}
		})
	}//end fix_height_of_texteditor




}//end class