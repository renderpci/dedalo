"use strict";
/**
* TOOL_TIME_MACHINE CLASS
*/
//var changed_original_content 		= 0	// Default 0. When fire 'set_tm_history_value_to_tm_preview' is set to 1
var fixed_current_tipo_section 		   	// Set on load_time_machine function
var tool_time_machine = new function() {


	this.trigger_tool_time_machine_url	= DEDALO_LIB_BASE_URL + "/tools/tool_time_machine/trigger.tool_time_machine.php"
	this.current_id_time_machine 		= null	// Set on load_preview_component loaded html 	
	

	this.limit				= 50
	this.offset				= 0
	this.offset_previous	= 0
	this.loaded_all			= false

	this.first_date = false
	this.last_date  = false

	this.total_loaded = 0


	this.tipo
	this.section_tipo
	this.section_id
	this.lang

	this.wrap_component_history
	this.wrap_info_line_tm
	this.tm_component_time_machine


	/**
	* INIT
	* @param object options
	* @return bool true
	*/
	this.init = function(options={}) {

		const self = this

		// options
			const tipo			= options.tipo
			const section_id	= options.parent
			const section_tipo	= options.section_tipo
			const lang			= options.lang

		// fix vars
			self.tipo						= tipo
			self.section_tipo				= section_tipo
			self.section_id					= section_id
			self.lang						= lang
			self.wrap_component_history		= document.getElementById('time_machine_record_rows')
			self.wrap_info_line_tm			= document.getElementById('info_rows')
			self.tm_component_time_machine	= document.getElementById("tm_component_time_machine")

		// ready event
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
		
		// load	window event
			window.addEventListener("load", function (event) {
				tool_time_machine.fix_height_of_texteditor()
			});//end window load event

		// resize window event
			window.addEventListener("resize", function (event) {
				tool_time_machine.fix_height_of_texteditor()
			});//end window load event

		// preview component
			self.load_preview_component(tipo, section_id, lang, null, section_tipo)

		// Load rows (first list of rows below)
			self.render_list({
				limit	: self.limit,
				offset	: self.offset
			})			

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
		

		return true
	};//end init



	/**
	* SET TIME MACHINE ROW VALUE TO TM PREVIEW COMPONENT
	* Alias of load_preview_component
	* @return promise
	*/
	this.set_tm_history_value_to_tm_preview = function(obj) {

		const parent				= obj.dataset.parent
		const tipo					= obj.dataset.tipo
		const lang					= obj.dataset.lang
		const id_time_machine		= obj.dataset.id_time_machine
		const current_tipo_section	= obj.dataset.current_tipo_section

		return tool_time_machine.load_preview_component(tipo, parent, lang, id_time_machine, current_tipo_section);	
	}//end set_tm_history_value_to_tm_preview



	/**
	* LOAD PREVIEW TM COMPONENT
	* Load by ajax, current component in 'tool_time_machine' mode whith data from last row in matrix_time_machine
	* @return promise
	*/
	this.load_preview_component = function(tipo, parent, lang, id_time_machine, current_tipo_section) {
		
		const self = this

		const wrapper_obj = self.tm_component_time_machine
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
	* @return promise
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
	* SECTION_RECORDS_RECOVER_SECTION
	* @return promise
	*/
	this.section_records_recover_section = function(button_obj) {

		// CONFIRM
		if( !confirm( 'Recover record ?' )) return false;

		const id_time_machine	= button_obj.dataset.id_time_machine
		const tipo				= button_obj.dataset.tipo // section tipo
		const wrapper_obj		= document.getElementById('tm_list_container')		
		
		const trigger_url	= this.trigger_tool_time_machine_url
		const trigger_vars	= {
				mode					: 'section_records_recover_section',
				current_tipo_section	: tipo,
				id_time_machine			: id_time_machine,
				top_tipo				: page_globals.top_tipo
			}; //return console.log("[tool_time_machine.section_records_recover_section] trigger_vars",trigger_vars)

		html_page.loading_content( wrapper_obj, 1 );

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(this.trigger_tool_time_machine_url, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[tool_time_machine.section_records_recover_section] response", response)
			}

			if (response && response.result) {

				// RELOAD_ROWS_LIST
				const call_uid = 'wrap_' + tipo + '_' + 'list';	// wrap_dd1140_list
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

		return true
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

		const tm_component_time_machine = self.tm_component_time_machine
		if (tm_component_time_machine) {

			//const h = $('#tm_component_time_machine').height();
			const h			= tm_component_time_machine.offsetHeight // clientHeight | offsetHeight
			const h_adjust	= -150	

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
	* RENDER_LIST
	* Load DB time machine records and render list and info DOm elements
	* @return promise
	*/
	this.render_list = function(options) {

		const self = this

		// options
			const tipo						= options.tipo || self.tipo
			const section_tipo				= options.section_tipo || self.section_tipo
			const section_id				= options.section_id || self.section_id
			const lang						= options.lang || self.lang
			const offset					= options.offset || self.offset
			const limit						= options.limit  || self.limit
			const load_all					= options.load_all || null
			const wrap_component_history	= options.wrap_component_history || self.wrap_component_history
			const wrap_info_line_tm			= options.wrap_info_line_tm || self.wrap_info_line_tm
			const render_info				= typeof options.render_info!=='undefined' ? options.render_info : true
			const append					= typeof options.append!=='undefined' ? options.append : false
			const context					= options.context || 'default'


		return new Promise(function(resolve){

			html_page.loading_content(wrap_component_history, 1);		

			self.load_rows({
				tipo			: tipo,
				section_id		: section_id,
				section_tipo	: section_tipo,
				lang			: lang,
				limit			: limit,
				offset			: offset
			})
			.then(function(response){

				if (response.result && response.result.length>0) {

					const rows_data = response.result

					// Update rows_list (render list nodes)
						self.render_rows_list(rows_data, wrap_component_history, append, context)
						.then(function(response){
							
							// Update info_rows	
							if (render_info===true) {
								self.render_rows_list_info(rows_data, wrap_info_line_tm, context)
							}
						})
					
				}else{

					// Case component without history
						const apply_and_save_link = document.querySelector(".apply_and_save_link")
						if (apply_and_save_link) {
							apply_and_save_link.classList.add("hide")
						}
				}

				html_page.loading_content(wrap_component_history, 0);

				resolve(response)
			})		
		})
	};//end render_list



	/**
	* LOAD_ROWS
	* Connect to the tm trigger and search records list for current component
	* @param object options
	* @return promise
	* 	Resolve object response
	*/
	this.load_rows = function(options={}) {
		
		const self = this

		// options
			const offset		= options.offset || self.offset
			const limit			= options.limit  || self.limit
			const load_all		= options.load_all || null
			const tipo			= options.tipo || self.tipo
			const section_tipo	= options.section_tipo || self.section_tipo
			const section_id	= options.section_id || self.section_id
			const lang			= options.lang || self.lang

		// trigger
			const trigger_url	= this.trigger_tool_time_machine_url
			const trigger_vars	= { 
				mode			: 'load_rows',
				tipo			: tipo,
				parent			: section_id,
				section_tipo	: section_tipo,
				lang			: lang,
				limit			: limit,
				offset			: offset
			};

		return new Promise(function(resolve, reject){
			
			// PROMISE JSON XMLHttpRequest
			common.get_json_data(trigger_url, trigger_vars).then(function(response){
				if (SHOW_DEBUG===true) {
					console.log("[tool_time_machine.load_rows] response", response)
				}
				if (response && response.result && response.result.length>0) {
					
					// loaded_all set
						self.loaded_all = (load_all===true)

					// total loaded
						self.total_loaded = (load_all===true)
							? response.result.length
							: self.total_loaded + response.result.length

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
					
				}else{
					if (!response) {
						console.warn("[tool_time_machine.load_rows] Warning. invalid response", response);
					}					
				}
				
				resolve(response)
				
			}, function(error) {
				// log
				console.error("[tool_time_machine.load_rows] Error.", error);
				reject(error)
			})
		})
	};//end load_rows



	/**
	* RENDER_ROWS_LIST
	* Creates DOM nodes based on records found in tm search
	* @param array rows_data
	*	Current time machine search result records
	* @param DOM node target_wrapper
	*	Target DOM node where place result nodes
	* @param bool append
	*	Defines if new result nodes will be added or to replace existing nodes
	* @param string context
	*	Inform about current context call to allow create custom elements or not (like button_back)
	* @return promise
	*	Resolve DOM fragment
	*/
	this.render_rows_list = function(rows_data, target_wrapper, append, context) {

		const self = this

		return new Promise(function(resolve, reject) {
			
			// Clean grid_images_container html
				if (append!==true) {
					while (target_wrapper.firstChild) {
						target_wrapper.removeChild(target_wrapper.firstChild);
					}
				}
			
			const fragment = new DocumentFragment()

			const tm_notes_nodes = []
		
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
						parent			: fragment
					})
					row.addEventListener("click", function(){
						tool_time_machine.set_tm_history_value_to_tm_preview(this)
					})

				// date_info
					const date_info = common.create_dom_element({
						element_type	: 'span',
						class_name		: 'date_info',
						text_content	: row_obj.date + " " + row_obj.mod_user_name + " (" + row_obj.userID + ")",
						title_label		: row_obj.mod_user_name,
						parent			: row
					})

				// button_back
					if (context==='default') {
						const button_back = common.create_dom_element({
							element_type	: 'div',
							class_name		: 'css_image_go_back div_image_link',
							title			: "Show tm value (" + row_obj.id_time_machine + ")",
							parent			: row
						})
					}

				// sample_data
					const sample_data_string = row_obj.dato_string.replace(/(\r\n|\n|\r|\<br\>)/gm, " ");					
					const sample_data_string_tooltip = row_obj.dato_string
						? (()=>{
							let value
							try {
								value = JSON.stringify(JSON.parse(row_obj.dato_string), null, 2)
							}catch(error){
								value = sample_data_string
							}
							return value
						  })()
						: null
					const sample_data = common.create_dom_element({
						element_type	: 'span',
						class_name		: 'sample_data',
						text_content	: sample_data_string,
						title_label		: sample_data_string_tooltip,
						parent			: row
					})

				// tm_notes
					const tm_note = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'tm_note hide',
						parent			: row
					})
					tm_note.id_time_machine	= row_obj.id_time_machine
					tm_note.permissions		= (row_obj.userID==page_globals.user_id) ? 2 : 1;
					tm_note.user_id			= row_obj.userID
					tm_note.addEventListener("click", function(e){
						e.stopPropagation()
					})
					tm_notes_nodes.push(tm_note)

			}//end for (let i = 0; i < rows_data_length; i++)

			// tm notes
				self.get_tm_notes({
					id_time_machine : rows_data.map((el)=> parseInt(el.id_time_machine))
				})
				.then(function(notes_rows){
					// add found notes to tm_note nodes
					const tm_notes_nodes_length = tm_notes_nodes.length
					for (let i = tm_notes_nodes_length - 1; i >= 0; i--) {
						
						const node			= tm_notes_nodes[i]
						const permissions	= node.permissions;
						
						const found_row	= notes_rows.find((el)=> el.id_time_machine==node.id_time_machine)
						if (found_row) {
							// NOTE EXIST
							const icon_url = (permissions>=2)
								? DEDALO_LIB_BASE_URL + '/themes/default/icon_sticky_green.svg'
								: DEDALO_LIB_BASE_URL + '/themes/default/icon_sticky_orange.svg'
							const icon_sticky = common.create_dom_element({
								element_type	: 'img',
								class_name		: 'icon_sticky orange',
								src				: icon_url,
								title_label 	: get_label.abrir,
								parent			: node
							})
							icon_sticky.addEventListener("click", function(e){
								const load_promise = (permissions>1)
									? self.load_tm_note_component(found_row.section_id, permissions)
									: Promise.resolve(found_row.note || ' ')
								
								load_promise.then(function(component_html){
									if (component_html) {
										self.build_note_dialog({
											row				: found_row,
											component_html	: component_html,
											permissions		: permissions
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
								title_label		: note_string,
								parent			: node
							})

						}else{
							// NOTE NOT EXIST
							if (permissions>1) {
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
											self.load_tm_note_component(note_section_id, permissions)
											.then(function(component_html){
												if (component_html) {
													self.build_note_dialog({
														row				: {
															section_id : note_section_id
														},
														component_html	: component_html,
														permissions		: permissions
													})
												}
											})
										}
									})
								})
							}
						}
						node.classList.remove("hide")
					}
				})//end tm notes

			// target_wrapper
			target_wrapper.appendChild(fragment)	


			resolve(fragment)
		});
	};//end render_rows_list



	/**
	* RENDER_ROWS_LIST_INFO
	* Render statistic info about displayed tm records
	* @param array rows_data
	*	Current tm search result
	* @param DOM node target_wrapper
	*	Target DOM node where place result nodes 
	* @return DOM node info_rows
	*/
	this.render_rows_list_info = function(rows_data, target_wrapper) {

		const self = this

		// params
			const total_rows		= self.wrap_component_history.childNodes.length // Count existing rows in dom
			const total_rows_data	= rows_data.length // Loaded rows in current ajax request

		// info_rows
			const info_rows = target_wrapper
			if (!info_rows) {
				console.warn("[render_rows_list_info] info_rows container not found!");
				return
			}
			// Clean
			while (info_rows.firstChild) {
				info_rows.removeChild(info_rows.firstChild)
			}

		// is_last
			const is_last = (self.loaded_all===true || total_rows_data<self.limit)

		// showed
			const showed_text = (is_last)
				? "Displayed all "  + total_rows
				: "Displayed last " + total_rows
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
						self.render_list({
							offset		: total_rows,
							limit		: self.limit,
							append		: true
						})
					})

				// load all button
					const load_all = common.create_dom_element({
						element_type	: 'span',
						class_name		: 'load_all link',
						parent			: info_rows,
						text_content	: get_label["load_all"] || "Load all"
					})
					load_all.addEventListener("click", function(){
						self.render_list({
							offset		: total_rows,
							limit		: 1000000,
							load_all	: true
						})
					})
			}//end if (is_last!==true)		
		

		return info_rows;
	};//end render_rows_list_info



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
	* LOAD_TM_NOTE_COMPONENT
	* @return promise
	*/
	this.load_tm_note_component = function(section_id, permissions) {

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
				top_id			: page_globals.top_id,
				permissions		: permissions
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
			const permissions		= options.permissions

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
				if (permissions>1) {
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
				}

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
				if (permissions>1) {
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
				}

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
				const new_limit = self.total_loaded
				self.render_list({
					limit	: new_limit, // self.limit,
					offset	: self.offset_previous,
					append	: false
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



	/**
	* LOAD_COMPONENT_TIME_MACHINE_LIST
	* Is called from inspector
	* @return promise
	*/
	this.load_component_time_machine_list = function(options) {

		const self = this

		// options
			const tipo						= options.tipo
			const section_tipo				= options.section_tipo
			const section_id				= options.section_id
			const lang						= options.lang
			const wrap_component_history	= options.wrap_component_history
			const wrap_info_line_tm			= options.wrap_info_line_tm
			const limit						= options.limit || 30
			const offset					= options.offset || 0

		// fix initials
			self.tipo					= tipo
			self.section_tipo			= section_tipo
			self.section_id				= section_id
			self.lang					= lang
			self.limit					= limit
			self.offset					= offset
			self.offset_previous		= 0
			self.wrap_component_history	= wrap_component_history
			self.wrap_info_line_tm		= wrap_info_line_tm

		// render_list promise
		return self.render_list({
			limit				: limit,
			offset				: offset,
			tipo				: tipo,
			section_tipo		: section_tipo,
			section_id			: section_id,
			lang				: lang,
			context				: 'inspector'
		})
	};//end load_component_time_machine_list



}//end class