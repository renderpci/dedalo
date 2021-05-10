"use strict";
/**
*  INSPECTOR CLASS
*
*
*/
var inspector = new function() {


	// SIDEBAR STATE
	this.sidebar_state = 'isopen'
	this.css_section_content
	//this.sidebar

	this.selected_tipo				= null
	this.selected_wrap				= null
	this.component_history_active	= false // defines is component history is loaded on component focus. Default false


	this.max_screen_width = 960
	this.url_trigger 	  = DEDALO_LIB_BASE_URL + '/component_common/trigger.component_common.php'



	/**
	* INIT
	* @return
	*/
	this.init = function(data) {

		const self = this

		// READY (EVENT)
			window.ready(function(){

				switch(page_globals.modo) {

					case 'edit' :

						// Set selectors
						self.css_section_content  = document.querySelector(".css_section_content") //$('.css_section_content').first()
						//self.sidebar 			  = document.getElementById("sidebar"); //$('#sidebar')

						// ARRANGE POSITION IN DIALOG WINDOW
						if (html_page.on_dialog_window === 1) {
							//$('#button_toggle_inspector').addClass('button_toggle_inspector_in_dialog')
							document.getElementById("button_toggle_inspector").addClass('button_toggle_inspector_in_dialog')
						};

						// AVOID RESET COMPONENT SELECT ON CLICK
						//$('#inspector_div').find('.tab_content').click(function(e) {
						//	e.stopPropagation();
						//});
						document.getElementById("inspector_div").addEventListener("click",function(e){
							e.stopPropagation();
						},false)
						break;

					default:

						break;
				}//end switch(page_globals.modo)
			})

		// component_save event
			window.addEventListener('component_save', function(e){
				if (self.selected_tipo===e.detail.dataset.tipo) {
					self.show_component_tm_history({
						tipo			: e.detail.dataset.tipo,
						section_tipo	: e.detail.dataset.section_tipo,
						section_id		: e.detail.dataset.section_id || e.detail.dataset.parent,
						lang			: e.detail.dataset.lang,
					})
				}
			}, false)

		return true
	};//end init



	/**
	* TOGGLE SIDEBAR (INSPECTOR)
	*/
	this.toggle_sidebar = function() {

		if(this.sidebar_state!=='isopen') {
			this.close_content()
			this.open_inspector()
			// fix state
			this.sidebar_state = 'isopen'
		}else{
			this.open_content()
			this.close_inspector()
			// fix state
			this.sidebar_state = 'isclose'
		}


		return true
	};



	/**
	* OPEN MAIN INSPECTOR
	*/
	this.open_inspector = function() {
		const sidebar = document.getElementById("sidebar")
		if (sidebar) {
			sidebar.style.display = ""
		}
	};



	/**
	* CLOSE MAIN INSPECTOR
	*/
	this.close_inspector = function() {
		const sidebar = document.getElementById("sidebar")
		if (sidebar) {
			sidebar.style.display = "none"
		}
	};



	/**
	* OPEN INSPECTOR CONTENT
	*/
	this.open_content = function(content_div_id) {
		var section_content_selector = this.css_section_content  //$('.css_section_content').first();
		if (typeof content_div_id !== 'undefined') {
			section_content_selector = $('#'+content_div_id)
		}
		$(section_content_selector).animate(0).css('width', '99.9%')
	};


	/**
	* CLOSE INSPECTOR CONTENT
	*/
	this.close_content = function(content_div_id) {
		var section_content_selector = this.css_section_content;	//$('.css_section_content').first();
		if (typeof content_div_id !== 'undefined') {
			section_content_selector = $('#'+content_div_id)
		}
		if (window.innerWidth > inspector.max_screen_width) {
			$(section_content_selector).animate(0).css('width', '80%')
		}
	};


	/**
	* SHOW LOG MSG (In inspector log with delayed hide)
	*/
	this.show_log_msg = function (msg, delay_secs) {

		// Place span save label in inspector if exists
		const inspector_log = document.getElementById('inspector_log')

		if (inspector_log) {

			if( typeof delay === 'undefined') delay_secs = 10000 * 3

			// Span save label
			const span_save = document.createElement("span")
				span_save.classList.add("span_save")
				span_save.innerHTML = msg
				span_save.addEventListener("click", function(event){
					this.remove()
				})

			inspector_log.appendChild(span_save)

			setTimeout(function(){
				span_save.remove()
			},9000)

			//console.warn( '[inspector.show_log_msg] Inspector msg: ' , msg )
		}else{
			console.warn( '[inspector.show_log_msg]Inspector msg: ' , msg )
		}

		return true
	};//end show_log_msg



	/**
	* SHOW_COMPONENT_TM_HISTORY
	* @return bool true
	*/
	this.show_component_tm_history_status = 'ready'
	this.show_component_tm_history = function(options) {

		const self = this

		// status
			if (self.component_history_active===false) {
				return false
			}

		if (self.show_component_tm_history_status!=='ready') {
			// prevent overload the tm_history request
			setTimeout(function(){
				self.show_component_tm_history(options)
			}, 1000)
			return false
		}

		self.show_component_tm_history_status = 'loading'

		// options
			const tipo			= options.tipo
			const section_tipo	= options.section_tipo
			const section_id	= options.section_id
			const lang			= options.lang

		// vars
			const wrap_component_history	= document.getElementById('wrap_component_history')
			const wrap_info_line_tm			= document.getElementById('wrap_info_line_tm')



		if (wrap_component_history && wrap_info_line_tm) {
			const tool_time_machine_instance = Object.assign({}, tool_time_machine) // force clone tool_time_machine prevent vars overwriting
			tool_time_machine_instance.load_component_time_machine_list({
				tipo					: tipo,
				section_tipo			: section_tipo,
				section_id				: section_id,
				lang					: lang,
				limit					: 30,
				wrap_component_history	: wrap_component_history,
				wrap_info_line_tm		: wrap_info_line_tm,
				selected_wrap			: self.selected_wrap
			})
			.then(function(response){				
				self.show_component_tm_history_status = 'ready'							
			})
		}

		return true
	};//end show_component_tm_history



	/**
	* COMPONENT_TM_HISTORY_TOGGLE
	* Open / activate or close / deactivate the show_component_tm_history list.
	* @return bool true
	*/
	this.component_tm_history_toggle = function(button) {

		const self = this

		// default id closed
		const component_history_active = self.component_history_active

		// container
		const component_history_content = document.getElementById('component_history_content')

		if (component_history_active===true) {

			component_history_content.classList.add("hide")
			button.classList.remove("time_machine_list_button_off")

			self.component_history_active = false			

		}else{

			component_history_content.classList.remove("hide")
			button.classList.add("time_machine_list_button_off")

			self.component_history_active = true

			if (self.selected_wrap) {

				// time machine component history
				self.show_component_tm_history({
					tipo			: self.selected_wrap.dataset.tipo,
					section_tipo	: self.selected_wrap.dataset.section_tipo,
					section_id		: self.selected_wrap.dataset.parent,
					lang			: self.selected_wrap.dataset.lang
				})
			}
		}
		
		return true
	};//end component_tm_history_toggle



	/**
	* UPDATE INSPECTOR INFO
	* Update inspector info when wrap is selected
	*/
	this.previous_update_inspector_info_caller = null
	this.update_inspector_info = function (obj_wrap) {
		
		const self = this

		// Legacy JQuery nodes
		if (obj_wrap instanceof jQuery ) {
			if(SHOW_DEBUG===true) {
				console.warn("[inspector.update_inspector_info] WARNING: Don't use jQuery objects here!");
				console.trace();
			}
			obj_wrap = obj_wrap[0]	// object jquery case
		}
		// Verify wrap is valid
		if (!obj_wrap) {
			if(SHOW_DEBUG===true) {
				console.log('[inspector.update_inspector_info] Error on get obj_wrap. Stopped update_inspector_info. obj_wrap:', obj_wrap)
				console.trace();
			}
			return false
		}
		// Click body or no wrap component elements case
	 	if ( typeof obj_wrap.dataset.tipo==='undefined' ) {
	 		return false
	 	}

		const tipo				= obj_wrap.dataset.tipo
		const current_parent	= obj_wrap.dataset.parent || obj_wrap.dataset.section_id
		const lang				= obj_wrap.dataset.lang
		const dato				= obj_wrap.dataset.dato || ''
		const component_name 	= obj_wrap.dataset.component_name || null

		// prevent edit_note mode
			if (obj_wrap.dataset.modo && obj_wrap.dataset.modo==='edit_note') {
				return false
			}

		// fix vars
			self.selected_tipo = tipo
			self.selected_wrap = obj_wrap

		// Page var globals verify
		if( typeof current_parent==="undefined" || !current_parent ) {
			console.log('Error: current_parent not defined! (update_inspector_info) ', obj_wrap)
			return false
		}

		// Reset some content
		// inspector_indexations clean
		const inspector_indexations  = document.getElementById('inspector_indexations')
		if (inspector_indexations) {
			// Clean node
			while (inspector_indexations.firstChild) {
				inspector_indexations.removeChild(inspector_indexations.firstChild);
			}
		}
		// inspector_tools clean
		const inspector_tools  = document.getElementById('inspector_tools')
		if (inspector_tools) {
			// Clean node
			while (inspector_tools.firstChild) {
				inspector_tools.removeChild(inspector_tools.firstChild);
			}
		}

		// component time machine history
			const wrap_info_line_tm = document.getElementById('wrap_info_line_tm')
			if (wrap_info_line_tm) {
				// Clean node
				while (wrap_info_line_tm.firstChild) {
					wrap_info_line_tm.removeChild(wrap_info_line_tm.firstChild);
				}
			}
			const wrap_component_history = document.getElementById('wrap_component_history')
			if (wrap_component_history) {
				// Clean node
				while (wrap_component_history.firstChild) {
					wrap_component_history.removeChild(wrap_component_history.firstChild);
				}
			}

		// INSPECTOR_INFO. HTML TO INSPECTOR
		const inspector_info = document.getElementById('inspector_info')
		if (inspector_info) {
			// Clean node
			while (inspector_info.firstChild) {
				inspector_info.removeChild(inspector_info.firstChild);
			}

			// SECTION_LABEL. label in top bar (menu)
			//const current_section_label = document.getElementById('current_section_label');

			const is_section = (obj_wrap.dataset.section_info) ? true : false;
			switch(is_section) {
				case true:
					// Section info
					const section_info = JSON.parse(obj_wrap.dataset.section_info)

					if(SHOW_DEBUG===true) {
						console.log("section_info:",section_info);
					}

					// Update page vars
					page_globals._parent = section_info.section_id

					// Top bar (menu) section_id_label info
					const current_section_id_label = document.getElementById('current_section_id_label');
					if (current_section_id_label) {
						current_section_id_label.innerText = section_info.section_id
					}

					// Section name
						common.create_dom_element({ element_type : 'div',
													parent 		 : inspector_info,
													class_name 	 : "key capitalize",
													text_node 	 : get_label["seccion"]
												 })
						common.create_dom_element({ element_type : 'div',
													parent 		 : inspector_info,
													class_name 	 : "value value_bold",
													//text_node  : section_info.label ? unescape(decodeURI(section_info.label)) : null
													//text_node  : current_section_label.firstChild.nodeValue
													text_node 	 : page_globals.section_name || null
												 })

					// Section ID
						common.create_dom_element({ element_type : 'div',
													parent 		 : inspector_info,
													class_name 	 : "key capitalize",
													text_node 	 : "ID"
												 })
						common.create_dom_element({ element_type : 'div',
													parent 		 : inspector_info,
													class_name 	 : "value value_bold",
													text_node 	 : section_info.section_id
												 })

					// Section created date and user
						common.create_dom_element({ element_type : 'div',
													parent 		 : inspector_info,
													class_name 	 : "key capitalize",
													text_node 	 : get_label["creado"]
												 })
						common.create_dom_element({ element_type : 'div',
													parent 		 : inspector_info,
													class_name 	 : "value value_bold",
													text_node 	 : section_info.created_date +" "+ section_info.created_by_user_name
												 })

					// Section modified date and user
						common.create_dom_element({ element_type : 'div',
													parent 		 : inspector_info,
													class_name 	 : "key capitalize",
													text_node 	 : get_label["modificado"]
												 })
						common.create_dom_element({ element_type : 'div',
													parent 		 : inspector_info,
													class_name 	 : "value value_bold",
													text_node 	 : section_info.modified_date +" "+ section_info.modified_by_user_name
												 })

						// Section publication first
							if (section_info.publication_first.value) {
								common.create_dom_element({ element_type : 'div',
															parent 		 : inspector_info,
															class_name 	 : "key capitalize",
															text_node 	 : section_info.publication_first.label
														 })
								common.create_dom_element({ element_type : 'div',
															parent 		 : inspector_info,
															class_name 	 : "value value_bold",
															text_node 	 : section_info.publication_first.value +" "+ section_info.publication_first_user.value
														 })
							}

						// Section publication last
							if (section_info.publication_last.value) {
								common.create_dom_element({ element_type : 'div',
															parent 		 : inspector_info,
															class_name 	 : "key capitalize",
															text_node 	 : section_info.publication_last.label
														 })
								common.create_dom_element({ element_type : 'div',
															parent 		 : inspector_info,
															class_name 	 : "value value_bold",
															text_node 	 : section_info.publication_last.value +" "+ section_info.publication_last_user.value
														 })
							}
					break;
				default:
					// Component info
					// Section name
					common.create_dom_element({ element_type : 'div',
												parent 		 : inspector_info,
												class_name 	 : "key capitalize",
												text_node 	 : get_label["seccion"]
											 })
					common.create_dom_element({ element_type : 'div',
												parent 		 : inspector_info,
												class_name 	 : "value value_bold",
												//text_node  : current_section_label.firstChild.nodeValue
												text_node 	 : page_globals.section_name || null
											 })
					// Section ID
					common.create_dom_element({ element_type : 'div',
												parent 		 : inspector_info,
												class_name 	 : "key capitalize",
												text_node 	 : "ID"
											 })
					common.create_dom_element({ element_type : 'div',
												parent 		 : inspector_info,
												class_name 	 : "value value_bold",
												text_node 	 : page_globals._parent
											 })
					// Name of selected component
					let component_label		 = "";
					const label_objs = obj_wrap.getElementsByTagName('label')
					  if (label_objs.length) {
						component_label = label_objs[0].innerHTML
					  }
					common.create_dom_element({ element_type : 'div',
												parent 		 : inspector_info,
												class_name 	 : "key capitalize",
												text_node 	 : get_label["seleccionado"]
											 })
					common.create_dom_element({ element_type : 'div',
												parent 		 : inspector_info,
												class_name 	 : "value value_bold",
												text_node 	 : component_label
											 })
					break;
			}//end if (inspector_info)
		}


		// INSPECTOR_DEBUG
		if(SHOW_DEVELOPER===true) {
		const inspector_debug = document.getElementById('inspector_debug')
		if (inspector_debug) {
			// Clean node
			while (inspector_debug.firstChild) {
				inspector_debug.removeChild(inspector_debug.firstChild);
			}

			// Parent
			common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "key",
										text_node 	 : "parent"
									 })
			common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "value",
										text_node 	 : current_parent
									 })
			//common.create_dom_element({ element_type : 'br', parent : inspector_debug })
			// Tipo
			common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "key",
										text_node 	 : "tipo"
									 })
			const tipo_value = common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "value"
									 })
									common.create_dom_element({ element_type : 'div',
										parent 		 : tipo_value,
										text_content : tipo
									 })

			//common.create_dom_element({ element_type : 'br', parent : inspector_debug })
			// Component name
			common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "key",
										text_node 	 : "model"
									 })
			const model_value = common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "value"
									 })
									common.create_dom_element({ element_type : 'div',
										parent 		 : model_value,
										text_content : component_name
									 })
			//common.create_dom_element({ element_type : 'br', parent : inspector_debug })
			// Component name
			common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "key",
										text_node 	 : "lang"
									 })
			const lang_value = common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "value"
									 })
									common.create_dom_element({ element_type : 'div',
										parent 		 : lang_value,
										text_content : lang
									 })
			//common.create_dom_element({ element_type : 'br', parent : inspector_debug })

			// Dato
			let dato_trim = String(dato)
				if (dato.length>255) {
					dato_trim = dato_trim.substring(0, 255) + ".."
				}
			// Strip html tags
			const tmp = document.createElement("div")
				tmp.innerHTML = dato_trim
				dato_trim = tmp.innerText || tmp.textContent

			common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "key",
										text_node 	 : "dato"
									 })
			common.create_dom_element({ element_type : 'div',
										parent 		 : inspector_debug,
										class_name 	 : "value",
										text_node 	 : dato_trim
									 })
		}//end inspector_debug
		}


		return false
	}//end update_inspector_info



	/**
	* LOAD INSPECTOR TOOLS BUTTONS
	* Load inspector tools buttons whe wrap is selected
	*/
	this.previous_load_inspector_tools_caller = null
	this.load_inspector_tools = function (obj_wrap) {

		const self = this

		if (obj_wrap instanceof jQuery ) {
			obj_wrap = obj_wrap[0]	// object jquery case
		}
		if (!obj_wrap) {
			if(SHOW_DEBUG===true) console.log("Error on get obj_wrap. Stopped load_inspector_tools")
			return false
		}

	 	// Click body or no wrap component elements case
	 	if ( typeof obj_wrap.dataset.tipo == 'undefined' ) {
	 		return false
	 	}

	 	if ( typeof obj_wrap.dataset.parent == 'undefined' || !obj_wrap.dataset.parent ) {
	 		console.log("[inspector.load_inspector_tools] Error: wrap dataset parent is not set: ", obj_wrap.dataset )
			alert("[inspector.load_inspector_tools] Error: wrap dataset parent is not set " + obj_wrap.dataset.parent)
	 		return false
	 	}

	 	// prevent edit_note mode
			if (obj_wrap.dataset.modo && obj_wrap.dataset.modo==='edit_note') {
				return false
			}

		const tipo					= obj_wrap.dataset.tipo
		const current_parent		= obj_wrap.dataset.parent
		const lang					= obj_wrap.dataset.lang
		const context_name			= obj_wrap.dataset.component_name
		const current_tipo_section	= obj_wrap.dataset.current_tipo_section	//return alert('load_inspector_tools \nid:'+id_matrix + " \ntipo:"+tipo + " \ncurrent_tipo_section:"+current_tipo_section)
		const section_tipo			= obj_wrap.dataset.section_tipo

		// target_obj. inspector object. target result div
			const target_obj = document.getElementById('inspector_tools')
			if(!target_obj) {
				if(SHOW_DEBUG===true) {
					if (page_globals.modo==="edit") {
						console.warn("[inspector.load_inspector_tools] Error. DOM element target_obj 'inspector_tools' not found", target_obj)
					}
				}
				return false; //alert("Error: load_inspector_tools (target_obj not found!)");
			}
			// Clear target_obj content
			while (target_obj.firstChild) {
			    target_obj.removeChild(target_obj.firstChild);
			}

		// time machine component history
			self.show_component_tm_history({
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: current_parent,
				lang			: lang
			})

		try {
			
			const component_info	= JSON.parse(obj_wrap.dataset.component_info)
			const ar_tools_name		= (component_info && typeof component_info.ar_tools_name!='undefined')
				? component_info.ar_tools_name
				: []

			// add tool_docu always at the end of tools
				if (section_tipo!=='dd1500') {
					ar_tools_name.push('tool_docu')
				}

			const len = ar_tools_name.length
			if (len > 0) {
				for (let i = 0; i < len; i++) {

					const tool_name	= ar_tools_name[i]
					const label		= get_label[tool_name]
					const title		= get_label.abrir + ' ' + get_label.herramienta

					// Skip add tool_indexation and tool_transcription when in resource section
					if( /rsc/i.test(page_globals.top_tipo) && ( /tool_indexation/i.test(tool_name) || /tool_structuration/i.test(tool_name) ) ) { // || /tool_transcription/i.test(tool_name)
						continue;
					}
					// HTML TO INSPECTOR
					// Container tool div
					const tool_button = inspector.build_tool_button({
						tool_name		: tool_name,
						label			: label,
						title			: title,
						tipo			: tipo,
						parent			: current_parent,
						section_tipo	: section_tipo,
						lang			: lang,
						context_name	: context_name
					})

					const tool_inspector_div = document.createElement("div")
					tool_inspector_div.classList.add('tool_inspector_div')

					tool_inspector_div.appendChild(tool_button)

					target_obj.appendChild(tool_inspector_div)
				}//end for
			}//end if (ar_tools_name.length>0)

		}catch(err) {
			if(SHOW_DEBUG===true) {
				console.warn("[inspector.load_inspector_tools] Error catch: ", err)
			}
		}

		return true
	}//end load_inspector_tools



	/**
	* BUILD_TOOL_BUTTON
	* @param object data
	* @return dom object tool_button
	*/
	this.build_tool_button = function(data) {
		//console.log("[inspector.build_tool_button] data:", data);

		const tool_button = document.createElement("div")
			tool_button.classList.add('link')
			tool_button.dataset.tipo 			= data.tipo
			tool_button.dataset.parent 			= data.parent
			tool_button.dataset.section_tipo 	= data.section_tipo
			tool_button.dataset.lang 			= data.lang
			tool_button.dataset.tab_id 			= "img_lang_" + data.tipo + '_' + data.parent
			tool_button.dataset.context_name 	= data.context_name
			tool_button.dataset.title 			= data.title
			common.create_custom_events(tool_button, "click", "tool_common.open_" + data.tool_name)

		const icon = document.createElement("div")
			icon.classList.add('icon_bs', data.tool_name + "_icon")

		const span = document.createElement("span")
			span.appendChild( document.createTextNode(data.label) )

		tool_button.appendChild(icon)
		tool_button.appendChild(span)


		return tool_button
	}//end build_tool_button



	/**
	* OPEN_DATA_LINK
	* @return
	*/
	this.open_data_link = function(button) {

		const url = DEDALO_LIB_BASE_URL + "/json/" + page_globals.section_tipo + "/" + page_globals._parent
		window.open(url);

		return true
	};//end open_data_link



	/**
	* TRIGGER_URL
	*//*
	this.trigger_url = function(url, button_obj) {

		html_page.loading_content( button_obj, 1 )

		// AJAX
		$.ajax({
			url			: url,
			data		: {},
			type		: 'GET'
		})
		.done(function(received_data) {
			//console.log(received_data);
			var msg = "Updated \n";
			if(SHOW_DEBUG===true) {
				msg += "<hr>DEBUG INFO [received_data]: \n"+received_data
			};
			alert(msg);
		})
		.fail(function(error_data) {
			alert("Error \n\n" + error_data);
		})
		.always(function() {
			html_page.loading_content( button_obj, 0 )
		});
	}*/


}// end inspector
