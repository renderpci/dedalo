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


		// Load rows (first list of rows below)
		self.load_rows({
			limit	: self.limit,
			offset	: self.offset
		})
		.then(function(response){

			// drag split divisor
				$('#divisor').draggable({
					axis: 'y'
					,containment: 'parent'
					,helper: 'clone'
					, start: function(event, ui) { 
						$(this).attr('start_offset',$(this).offset().top);
						$(this).attr('start_next_height',$(this).next().height());
					}
					,drag: function (event, ui) {
						const prev_element=$(this).prev();
						const next_element=$(this).next();
						const y_difference=$(this).attr('start_offset')-ui.offset.top;
						prev_element.height(ui.offset.top-prev_element.offset().top);
						next_element.height(parseInt($(this).attr('start_next_height'))+y_difference);
					} 
				});
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
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[tool_time_machine.load_preview_component] response", response)
			}

			if (response===null) {
				if (SHOW_DEBUG===true) {
					console.log("[tool_time_machine.load_preview_component] Error. invalid response", response);
				}
				inspector.show_log_msg("<span class='error'>Error on load_time_machine [load_preview_component] " + id_time_machine + "</span>");

			}else{

				// Inject html
					wrapper_obj.innerHTML = response.result

				// Exec js fix vars in preview html
					exec_scripts_inside( wrapper_obj )

				// Portal case hide content and buttons
					if( typeof(component_portal) !== 'undefined' ) {
						component_portal.hide_buttons_and_tr_edit_content();
					}

				// Fix text editor height
					setTimeout(function(){
						tool_time_machine.fix_height_of_texteditor()					
					},10)
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
	* @return promise
	*/
		// this.section_records_load_rows_history = function(button_obj) {

		// 	// LOAD TOOL (AJAX LOAD BOTTOM ROWS HISTORY)
		// 	let tipo 		= button_obj.dataset.tipo
		// 	let	wrapper_obj	= document.getElementById('tm_list_container')
		// 		if (!wrapper_obj) {
		// 				alert("Error on get wrap tm_list_container");
		// 		}				

		// 	// swap visibility
		// 	if( wrapper_obj.style.display !== 'none' ) {	// $(wrapper_obj).css('display')
		// 		//$(wrapper_obj).hide(100);
		// 		wrapper_obj.style.display = "none"
		// 		return false;
		// 	}

		// 	wrapper_obj.innerHTML = "<span class=\"loading blink\"> Loading.. </span>"
			
		// 	const trigger_url  = this.trigger_tool_time_machine_url
		// 	const trigger_vars = {
		// 			mode 					: 'section_records_load_rows_history',
		// 			current_tipo_section 	: tipo,
		// 			top_tipo 				: page_globals.top_tipo
		// 		}
		// 		//return console.log("[tool_time_machine.section_records_load_rows_history] trigger_vars",trigger_vars)

		// 	//html_page.loading_content( wrapper_obj, 1 );

		// 	// PROMISE JSON XMLHttpRequest
		// 	const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
		// 		if (SHOW_DEBUG===true) {
		// 			console.log("[tool_time_machine.section_records_load_rows_history] response", response)
		// 		}

		// 		if (response && response.result) {

		// 			wrapper_obj.innerHTML = response.result

		// 			// Exec js fix vars in preview html
		// 			exec_scripts_inside( wrapper_obj )

		// 			wrapper_obj.style.display = ""

		// 			/*
		// 			$(wrapper_obj)
		// 				.hide(0)
		// 				.html(received_data)
		// 				.fadeIn(100);*/
					
		// 		}else{
		// 			console.log("[tool_time_machine.section_records_load_rows_history] Error. invalid response", response);
		// 			inspector.show_log_msg("<span class='error'>Error on load_time_machine [section_records_load_rows_history]</span>");
		// 		}		
				
		// 		html_page.loading_content( wrapper_obj, 0 );
		// 	}, function(error) {
		// 		// log
		// 		console.log("[tool_time_machine.section_records_load_rows_history] Error.", error);			
		// 		html_page.loading_content( wrapper_obj, 0 );
		// 	})

		// 	return js_promise
		// };//end section_records_load_rows_history



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
	* @return promise
	*/
	this.load_rows = function(options={}) {
		
		const self = this

		// options
			const offset	= options.offset || self.offset
			const limit		= options.limit  || self.limit
			const load_all	= options.load_all || null

		const wrapper_obj 			 = document.getElementById('time_machine_record_rows')
		const wrap_time_machine_page = document.getElementById("wrap_time_machine_page")
			
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


		return new Promise(function(resolve, reject){

			// PROMISE JSON XMLHttpRequest
			common.get_json_data(trigger_url, trigger_vars).then(function(response){
				if (SHOW_DEBUG===true) {
					console.log("[tool_time_machine.load_rows] response", response)
				}
				if (response && response.result) {

					// Case component without history
						if (response.result.length===0) {
							const apply_and_save_link = document.querySelector(".apply_and_save_link")
							if (apply_and_save_link) {
								apply_and_save_link.classList.add("hide")
							}
							resolve(response)
							return true
						}

					// loaded_all set
						if (load_all===true) {
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

					// get tm_notes data
						const tm_notes_promise = self.get_tm_notes({
							id_time_machine : response.result.map((el)=> parseInt(el.id_time_machine))
						})

					// Update rows_list (render list nodes)
						self.build_rows_list(response.result, wrapper_obj, tm_notes_promise)
						.then(function(){
							// Update info_rows	after
							self.build_info_rows(response.result, wrapper_obj)
						})
						
				}else{
					console.error("[tool_time_machine.load_rows] Error. invalid response", response);
				}

				html_page.loading_content( wrapper_obj, 0 );
				
				resolve(response)
				
			}, function(error) {
				// log
				console.error("[tool_time_machine.load_rows] Error.", error);
				html_page.loading_content( wrapper_obj, 0 );

				reject(error)
			})
		})
	};//end load_rows



	/**
	* BUILD_ROWS_LIST
	* @return promise
	*/
	this.build_rows_list = function(rows_data, wrapper_obj, tm_notes_promise) {

		const self = this

		return new Promise(function(resolve, reject) {
			
			// Clean grid_images_container html
				while (wrapper_obj.firstChild) {
					wrapper_obj.removeChild(wrapper_obj.firstChild);
				}

			const tm_notes = []
		
			const rows_data_length = rows_data.length
			for (let i = 0; i < rows_data_length; i++) {
				
				const row_obj = rows_data[i]

				// row
					const row = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'css_time_machine_record_line',
						data_set		: {
							parent					: row_obj.parent,
							tipo					: row_obj.component_tipo,
							current_tipo_section	: row_obj.current_tipo_section,
							lang					: row_obj.lang,
							id_time_machine			: row_obj.id_time_machine
						},
						parent			: wrapper_obj
					})
					row.addEventListener("click", function(){
						tool_time_machine.set_tm_history_value_to_tm_preview(this)
					})

				// date_info
					const date_info = common.create_dom_element({
						element_type	: 'span',
						class_name		: 'date_info',
						text_content	: row_obj.date + " " + row_obj.mod_user_name + " (" + row_obj.userID + ")",
						parent			: row
					})

				// button_back
					const button_back = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'css_image_go_back div_image_link',
						title			: "Show tm value (" + row_obj.id_time_machine + ")",
						parent			: row
					})

				// sample_data
					const sample_data = common.create_dom_element({
						element_type	: 'span',
						class_name		: 'sample_data',
						text_content	: row_obj.dato_string,
						parent			: row
					})

				// tm_notes
					const tm_note = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'tm_note hide',
						parent			: row
					})
					tm_note.id_time_machine = row_obj.id_time_machine
					tm_note.addEventListener("click", function(e){
						e.stopPropagation()
					})
					tm_notes.push(tm_note)

			}//end for (let i = 0; i < rows_data_length; i++)

			
			// add found notes to tm_note nodes
				tm_notes_promise.then(function(rows){
					for (let i = tm_notes.length - 1; i >= 0; i--) {
						
						const node = tm_notes[i]

						const found_row	= rows.find((el)=> el.id_time_machine==node.id_time_machine)
						if (found_row) {
							// NOTE EXIST
							const icon_sticky = common.create_dom_element({
								element_type	: 'img',
								class_name		: 'icon_sticky orange',
								src				: DEDALO_LIB_BASE_URL + '/themes/default/icon_sticky_orange.svg',
								title_label 	: get_label.abrir,
								parent			: node
							})
							icon_sticky.addEventListener("click", function(e){
								self.load_tm_note_component(found_row.section_id)
								.then(function(component_html){
									if (component_html) {
										self.build_note_dialog({
											row				: found_row,
											component_html	: component_html
										})
									}
								})
							})
							const note_string = found_row.note
								? found_row.note.replace(/(\r\n|\n|\r|\<br\>)/gm, " ")
								: '';
							const note_text = common.create_dom_element({
								element_type	: 'span',
								class_name		: 'note_text',
								inner_html		: note_string,
								parent			: node
							})						

						}else{
							// NOTE NOT EXIST
							const icon_sticky = common.create_dom_element({
								element_type	: 'img',
								class_name		: 'icon_sticky',
								src				: DEDALO_LIB_BASE_URL + '/themes/default/icon_sticky_grey.svg',
								title_label 	: get_label.crear +" "+ get_label.nuevo,
								parent			: node
							})
							icon_sticky.addEventListener("click", function(e){
								self.add_tm_note(node.id_time_machine)
								.then(function(note_section_id){
									if (note_section_id) {
										self.load_tm_note_component(note_section_id)
										.then(function(component_html){
											if (component_html) {
												self.build_note_dialog({
													row				: {
														section_id : note_section_id
													},
													component_html	: component_html
												})
											}
										})
									}
								})
							})							
						}
						node.classList.remove("hide")
					}
				})


			resolve("ok")
		});
	};//end build_rows_list



	/**
	* BUILD_INFO_ROWS
	* @return DOM node info_rows
	*/
	this.build_info_rows = function(rows_data, wrapper_obj) {

		const self = this

		// params
			const rows				= wrapper_obj.childNodes
			const total_rows		= rows.length // Existing rows in dom
			const total_rows_data	= rows_data.length // Loaded rows in current ajax request

		// info_rows
			const info_rows = document.getElementById("info_rows")
			// Clean
			while (info_rows.firstChild) {
				info_rows.removeChild(info_rows.firstChild)
			}		

		// is_last
			const is_last = (self.loaded_all===true || total_rows_data<self.limit)	
			// console.log("self.loaded_all:",self.loaded_all)	

		// showed
			const showed_text = (is_last)
				? "Showed all "  + total_rows
				: "Showed last " + total_rows
			const showed = common.create_dom_element({
				element_type	: 'span',
				class_name		: 'showed',
				text_content	: showed_text,
				parent			: info_rows				
			})
			if (self.first_date && self.last_date) {
				const showed_date = common.create_dom_element({
					element_type	: 'span',
					class_name		: 'showed_date',
					text_content	: "(" + self.last_date + " - " + self.first_date +")",
					parent			: showed					
				})				
			}

		// No is_last case. buttons are necessary
			if (is_last!==true) {
				
				// load more button
				const load_more = common.create_dom_element({
					element_type	: 'span',
					class_name		: 'load_more link',
					parent			: info_rows,
					text_content	: get_label["load_more"] || "Load more"
				})
				load_more.addEventListener("click", function(){
					self.load_rows({
						offset	: total_rows,
						limit	: self.limit
					})
				},false)

				// load all button
				const load_all = common.create_dom_element({
					element_type	: 'span',
					class_name		: 'load_all link',
					parent			: info_rows,
					text_content	: get_label["load_all"] || "Load all"
				})
				load_all.addEventListener("click", function(){
					self.load_rows({
						offset		: total_rows,
						limit		: 1000000,
						load_all	: true
					})
				},false)
			}
		
		

		return info_rows;
	};//end build_info_rows



	/**
	* GET_TM_NOTES
	* Connect to database and search all records with match between code and id_time_machine
	* in section rsc832 (Time machine notes)
	* @return promise
	*	resolve array of rows
	*/
	this.get_tm_notes = function(options) {
		
		const self = this

		// options
			const id_time_machine = options.id_time_machine
		
		return new Promise(function(resolve){

			const trigger_url	= self.trigger_tool_time_machine_url
			const trigger_vars	= { 
				mode			: 'get_tm_notes',
				id_time_machine	: id_time_machine
			}

			common.get_json_data(trigger_url, trigger_vars)
			.then(function(response){

				const data = response.result

				resolve(data)
			})			
		})
	};//end get_tm_notes



	/**
	* LOAD_tm_NOTE_COMPONENT
	* @return promise
	*/
	this.load_tm_note_component = function(section_id) {

		const component_tipo	= 'rsc329'
		const section_tipo		= 'rsc832'

		return new Promise(function(resolve){
			
			const trigger_url  = component_common.url_trigger
			const trigger_vars = {
				mode			: 'load_component_by_ajax',
				tipo			: component_tipo,
				modo			: 'edit_note',
				parent			: section_id,
				section_tipo	: section_tipo,
				lang			: page_globals.dedalo_data_lang,
				top_tipo		: page_globals.top_tipo,
				top_id			: page_globals.top_id
			}
			common.get_json_data(trigger_url, trigger_vars)
			.then(function(response){
				
				const component_text_html = response.result

				resolve(component_text_html)
			})
		})
	};//end load_tm_note_component



	/**
	* BUILD_NOTE_DIALOG
	* @return DOM object
	*/
	this.build_note_dialog = function( options ) {

		const self = this
		
		// options
			const row				= options.row
			const component_html	= options.component_html

		// vars
			const section_id	= row.section_id
			const section_tipo	= row.section_tipo || 'rsc832'
			const user_name		= row.user_name
			const date			= row.date
	
		// div_note_wrapper
			const div_note_wrapper = document.createElement("div")			

		// header
			const header = document.createElement("div")
			const h4 = document.createElement("h4")
			h4.classList.add('modal-title')
			const info_head = (user_name)
				? "Note " + section_id + " - Created by user "+ user_name
				: "Note " + section_id
			h4.appendChild( document.createTextNode(info_head) )
			header.appendChild(h4)

		// body
			const body = common.create_dom_element({
				element_type	: 'div',
				class_name		: 'modal_body',
				inner_html		: component_html
			})

		// footer
			const footer = document.createElement("div")

			// Button delete <button type="button" class="btn btn-warning">Warning</button>
				const button_delete = common.create_dom_element({
					element_type	: 'button',
					class_name		: 'btn btn-warning btn-sm button_delete_note',
					inner_html		: get_label.borrar,
					dataset			: {
						dismiss : "modal"
					},
					parent			: footer
				})
				button_delete.addEventListener("click", function(e){
					self.delete_tm_note(section_id)
					.then(function(response){
						if (response) {
							modal_dialog.remove()							
						}
					})
				})

			// created_date
				// 	console.log("row.dd199:",row.dd199);
				// const date_data = 
				// const date = component_date.format_date()
				const date_text = (date)
					? "Created date: "+row.date
					: ""
				const created_date = common.create_dom_element({
					element_type	: 'div',
					class_name		: 'created_date',
					inner_html		: date_text,
					parent			: footer
				})

			// Button ok <button type="button" class="btn btn-warning">OK</button>
				const button_ok = common.create_dom_element({
					element_type	: 'button',
					class_name		: 'btn btn-success btn-sm button_ok_note',
					inner_html		: "  OK  ",
					dataset			: {
						dismiss : "modal"
					},
					parent			: footer
				})
				button_ok.addEventListener('click', function(e) {
					const ed = tinyMCE.activeEditor
					if (ed && component_text_area.is_tiny(ed)) {
						ed.save()
					}
				})


		// modal dialog
			const modal_dialog = common.build_modal_dialog({
				id		: 'div_note_wrapper',
				header	: header,
				footer	: footer,
				body	: body
			})

		// Open dialog Bootstrap modal
			$(modal_dialog).modal({
				show 	  : true,
				keyboard  : true,
				cssClass  : 'modal'
			}).on('shown.bs.modal', function (e) {
				// Focus text area field
				const ed = tinyMCE.activeEditor
				if (ed && component_text_area.is_tiny(ed)===true) {
					tinymce.execCommand('mceFocus',false,ed.id);
				}
			}).on('hidden.bs.modal', function (e) {
				// Removes modal element from DOM on close
				$(this).remove()
				// refresh rows list
				self.load_rows({
					limit	: self.limit,
					offset	: self.offset
				})		
			})

		return modal_dialog
	}//end build_note_dialog



	/**
	* ADD_TM_NOTE
	* @return promise
	*/
	this.add_tm_note = function(id_time_machine) {
		
		const self = this

		// confirm dialog
			// if (!confirm(get_label.seguro + " " + id_time_machine)) {
			// 	return Promise.resolve(false);
			// }

		return new Promise(function(resolve){
			
			const trigger_url  = self.trigger_tool_time_machine_url
			const trigger_vars = {
				mode			: 'add_tm_note',
				id_time_machine	: id_time_machine
			}
			
			common.get_json_data(trigger_url, trigger_vars)
			.then(function(response){
				console.log("add_tm_note response:",response);
				
				const section_id = response.result

				resolve(section_id)
			})
		})
	};//end add_tm_note



	/**
	* DELETE_TM_NOTE
	* @return promise
	* 	resolve bool
	*/
	this.delete_tm_note = function(section_id) {

		const self = this

		// confirm dialog
			if (!confirm(get_label.esta_seguro_de_borrar_este_registro)) {
				return Promise.resolve(false);
			}

		const section_tipo = 'rsc832'

		return new Promise(function(resolve){
			
			const trigger_url  = button_delete.url_trigger
			const trigger_vars = {
				mode			: 'Del',
				section_tipo	: section_tipo,
				section_id		: section_id,
				modo			: 'delete_record',
				top_tipo		: section_tipo
			}
			
			common.get_json_data(trigger_url, trigger_vars)
			.then(function(response){
				console.log("delete_tm_note response:",response);
				
				// expected true for success and false for error on delete
				const delete_result = response.result

				resolve(delete_result)
			})
		})
	};//end delete_tm_note



}//end class