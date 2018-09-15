"use strict";
/**
* TOOL_TIME_MACHINE CLASS
*/
//var changed_original_content 		= 0	// Default 0. When fire 'set_tm_history_value_to_tm_preview' is set to 1
var fixed_current_tipo_section 		   	// Set on load_time_machine function
var tool_time_machine = new function() {


	this.trigger_tool_time_machine_url	= DEDALO_LIB_BASE_URL + "/tools/tool_time_machine/trigger.tool_time_machine.php"
	this.current_id_time_machine 		= null	// Set on load_preview_component loaded html 	
	

	this.limit  	= 100
	this.offset 	= 0
	this.loaded_all = false

	this.first_date = false
	this.last_date  = false


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		const self = this

		
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
							tool_time_machine.assign_time_machine_value(this);		//if(SHOW_DEBUG===true) console.log(this)
						});
					*/
					break;
			}			
		});//end $(function()

		
		// LOAD	WINDOW EVENT	
		window.addEventListener("load", function (event) {
			tool_time_machine.fix_height_of_texteditor()
		});//end window load event

		// RESIZE	WINDOW EVENT	
		window.addEventListener("resize", function (event) {
			tool_time_machine.fix_height_of_texteditor()
		});//end window load event


		// Load preview component
		self.load_preview_component(options.tipo, options.parent, options.lang, null, options.section_tipo);


		// Load rows (first list of rows bellow)
		self.load_rows({
			limit  : self.limit,
			offset : self.offset
		})

	};//end init



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

		const wrapper_obj = document.getElementById('tm_component_time_machine')
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
		const trigger_url 	= this.trigger_tool_time_machine_url
		const trigger_vars 	= {
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
		let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
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

		if (typeof tool_time_machine.current_id_time_machine==="undefined" || !tool_time_machine.current_id_time_machine) {
			if(SHOW_DEBUG===true) {
				console.log("tool_time_machine",tool_time_machine)
			}
			return alert("[tool_time_machine.assign_time_machine_value] Error. current_id_time_machine not found")
		}

		const parent 				= button_obj.dataset.parent
		const tipo 					= button_obj.dataset.tipo
		const section_tipo 			= button_obj.dataset.section_tipo
		const lang 					= button_obj.dataset.lang
		const id_time_machine 		= tool_time_machine.current_id_time_machine // set on load_preview_component 
		const current_tipo_section 	= fixed_current_tipo_section // Fixed global
	
		const trigger_url  = this.trigger_tool_time_machine_url
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
			}; //return console.log("[tool_time_machine.assign_time_machine_value] trigger_vars",trigger_vars);
		
		const wrapper_obj = document.getElementById('html_page_wrap')
		html_page.loading_content( wrapper_obj, 1 );

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
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
	this.section_records_recover_section = function(button_obj) {

		// CONFIRM
		if( !confirm( 'Recover record ?' )) return false;

		const id_time_machine	= button_obj.dataset.id_time_machine
		const tipo 				= button_obj.dataset.tipo // section tipo
		const wrapper_obj		= document.getElementById('tm_list_container')		
		
		const trigger_url 	= this.trigger_tool_time_machine_url
		const trigger_vars 	= {
				mode			 	  	: 'section_records_recover_section',
				current_tipo_section 	: tipo,
				id_time_machine	  		: id_time_machine,
				top_tipo		 	  	: page_globals.top_tipo
			}; //return console.log("[tool_time_machine.section_records_recover_section] trigger_vars",trigger_vars)

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
		
		const lang = select_obj.value
		if (lang && lang.length>1) {

			// Reloads window 
			const current_url 	= window.location.href 
			const new_url 		= change_url_variable(current_url, 'lang', lang)

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
			
		if (typeof tinymce==="undefined" || !tinymce) {
			return false;
		}

		const tm_component_time_machine = document.getElementById("tm_component_time_machine")
		if (tm_component_time_machine) {

			//const h = $('#tm_component_time_machine').height();
			const h 		= tm_component_time_machine.offsetHeight // clientHeight | offsetHeight
			const h_adjust 	= -150	

			try {				

				const ar_editors = tinymce.editors
				const t_len 	 = ar_editors.length
				for (let i = 0; i < t_len; i++) {
					
					const editor = ar_editors[i]
					
					if (editor && typeof editor.theme!=="undefined") {
						//tinyMCE.activeEditor.theme.resizeTo(
						editor.theme.resizeTo(
							null,
							h + h_adjust
						);
						if(SHOW_DEBUG===true) {
							console.log("[tool_time_machine.fix_height_of_texteditor] resized tinymce editor to : ",h + h_adjust );
						}						
					}					
				}

			}catch(e) {
				console.log("Error: "+e)
			}
		}		
		

		return true
	}//end fix_height_of_texteditor



	/**
	* LOAD_ROWS
	* @return 
	*/
	this.load_rows = function(options) {
		
		const self = this

		const wrapper_obj 			 = document.getElementById('time_machine_record_rows')
		const wrap_time_machine_page = document.getElementById("wrap_time_machine_page")					

		const offset = options.offset || self.offset
		const limit  = options.limit  || self.limit
			
		const trigger_url 	= this.trigger_tool_time_machine_url
		const trigger_vars 	= { 
				mode			: 'load_rows',
				tipo 			: wrap_time_machine_page.dataset.tipo,
				parent 			: wrap_time_machine_page.dataset.parent,
				section_tipo 	: wrap_time_machine_page.dataset.section_tipo,
				lang 			: wrap_time_machine_page.dataset.lang,
				limit 			: limit,
				offset 			: offset
			};	// console.log("[tool_time_machine.load_rows] trigger_vars",trigger_vars)

		html_page.loading_content( wrapper_obj, 1 );

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(this.trigger_tool_time_machine_url, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[tool_time_machine.load_rows] response", response)
			}
			if (response && response.result) {

				if (options.load_all && options.load_all===true) {
					self.loaded_all = true
				}

				// Set first date (order is old to recent). Is set once with more recent record
				const first_element = response.result[0]
				if (!self.last_date && first_element.date) {
					self.first_date = first_element.date
				}				

				// Set last date (order is old to recent)
				const last_element = response.result[response.result.length - 1];
				if (last_element.date) {
					self.last_date = last_element.date
				}

				// Update rows_list
				self.build_rows_list(response.result, wrapper_obj).then(function(){
					// Update info_rows	after			
					self.build_info_rows(response.result, wrapper_obj)
				})		
				
			}else{
				console.error("[tool_time_machine.load_rows] Error. invalid response", response);				
			}		
			
			html_page.loading_content( wrapper_obj, 0 );
		}, function(error) {
			// log
			console.log("[tool_time_machine.load_rows] Error.", error);
			html_page.loading_content( wrapper_obj, 0 );
		})


		return js_promise
	};//end load_rows



	/**
	* BUILD_ROWS_LIST
	* @return promise
	*/
	this.build_rows_list = function(rows_data, wrapper_obj) {

		const js_promise = new Promise(function(resolve, reject) {
		
			const rows_data_length = rows_data.length
			for (let i = 0; i < rows_data_length; i++) {
				
				const row_obj = rows_data[i]

				const row = common.create_dom_element({
						element_type 	: 'div',
						class_name	 	: 'css_time_machine_record_line',
						parent			: wrapper_obj,
						data_set 		: {
							parent 				 : row_obj.parent,
							tipo 				 : row_obj.component_tipo,
							current_tipo_section : row_obj.current_tipo_section,
							lang 				 : row_obj.lang,
							id_time_machine 	 : row_obj.id_time_machine
						}
					})
					row.addEventListener("click", function(){
						tool_time_machine.set_tm_history_value_to_tm_preview(this)
					},false)

				const date_info = common.create_dom_element({
						element_type 	: 'span',
						class_name	 	: 'date_info',
						parent			: row,
						text_content 	: row_obj.date + " " + row_obj.mod_user_name + " (" + row_obj.userID + ")"
					})

				const button_back = common.create_dom_element({
						element_type 	: 'div',
						class_name	 	: 'css_image_go_back div_image_link',
						parent			: row,
						title 			: "Show tm value (" + row_obj.id_time_machine + ")"
					})

				const sample_data = common.create_dom_element({
						element_type 	: 'span',
						class_name	 	: 'sample_data',
						parent			: row,
						text_content 	: row_obj.dato_string
					})

			}//end for (let i = 0; i < rows_data_length; i++)
			

			resolve("ok")
		});


		return js_promise
	};//end build_rows_list



	/**
	* BUILD_INFO_ROWS
	* @return 
	*/
	this.build_info_rows = function(rows_data, wrapper_obj) {

		const self = this		

		// info_rows
		const info_rows = document.getElementById("info_rows")
		// Clean
		while (info_rows.firstChild) {
		    info_rows.removeChild(info_rows.firstChild)
		}

		const rows 				= wrapper_obj.childNodes
		const total_rows		= rows.length // Existing rows in dom
		const total_rows_data 	= rows_data.length // Loaded rows in current ajax request

		const is_last = (self.loaded_all===true || total_rows_data<self.limit)
	
		console.log("self.loaded_all:",self.loaded_all);		

		let showed_text = ''
		if (is_last) {
			showed_text = "Showed all " + total_rows 
		}else{
			showed_text = "Showed last " + total_rows
		}		

		const showed = common.create_dom_element({
						element_type 	: 'span',
						class_name	 	: 'showed',
						parent			: info_rows,
						text_content 	: showed_text
					})
			if (self.first_date && self.last_date) {
				const showed_date_text = "(" + self.last_date + " - " + self.first_date +")"
				const showed_date = common.create_dom_element({
						element_type 	: 'span',
						class_name	 	: 'showed_date',
						parent			: showed,
						text_content 	: showed_date_text
					})
				
			}


		if (is_last===true) {
			return true;
		}		

		const load_more = common.create_dom_element({
						element_type 	: 'span',
						class_name	 	: 'load_more link',
						parent			: info_rows,
						text_content 	: get_label["load_more"] || "Load more"
					})
					load_more.addEventListener("click", function(){
						self.load_rows({
							offset  : total_rows,
							limit 	: self.limit
						})
					},false)

		const load_all = common.create_dom_element({
						element_type 	: 'span',
						class_name	 	: 'load_all link',
						parent			: info_rows,
						text_content 	: get_label["load_all"] || "Load all"
					})
					load_all.addEventListener("click", function(){
						self.load_rows({
							offset   : total_rows,
							limit  	 : 1000000,
							load_all : true
						})
					},false)
		
		return true;
	};//end build_info_rows




}//end class