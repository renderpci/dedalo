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
		let section_content_selector = this.css_section_content  //$('.css_section_content').first();
		if (typeof content_div_id !== 'undefined') {
			section_content_selector = $('#'+content_div_id)
		}
		$(section_content_selector).animate(0).css('width', '99.9%')
	};

	
	/**
	* CLOSE INSPECTOR CONTENT 
	*/
	this.close_content = function(content_div_id) {
		let section_content_selector = this.css_section_content;	//$('.css_section_content').first();
		if (typeof content_div_id !== 'undefined') {
			section_content_selector = $('#'+content_div_id)
		}
		if (window.innerWidth > inspector.max_screen_width) {
			$(section_content_selector).animate(0).css('width', '80%')
		}
	};


	/**
	* SHOW LOG MSG (In inspector log with delayed hide)
	*
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
	}//end show_log_msg



	/**
	* UPDATE INSPECTOR INFO
	* Update inspector info when wrap is selected
	*/
	this.previous_update_inspector_info_caller = null
	this.update_inspector_info = function (obj_warp) {

		if (obj_warp instanceof jQuery ) {
			obj_warp = obj_warp[0]	// object jquery case
		}
		if (!obj_warp) {
			if(SHOW_DEBUG===true) {
				console.log('[inspector.update_inspector_info] Error on get obj_warp. Stopped update_inspector_info. obj_warp:', obj_warp)
				console.trace();
			}
			return false
		}

		// Click body or no wrap component elements case
	 	if ( typeof obj_warp.dataset.tipo==='undefined' ) {
	 		return false
	 	}

		let mode			= 'update_inspector_info'
		let tipo			= obj_warp.dataset.tipo
		let current_parent	= obj_warp.dataset.parent
		let lang			= obj_warp.dataset.lang
		let dato			= obj_warp.dataset.dato || ''
		let component_name 	= obj_warp.dataset.component_name
		let target_obj		= document.getElementById('inspector_info')
		let debug_div		= document.getElementById('inspector_debug')
		let mod_date 		= ''
		let mod_by_user_name= ''

		let label = "";
		let label_objs = obj_warp.getElementsByTagName('label')
			if (label_objs.length) {				
				label = label_objs[0].innerHTML
			}

		// Page var globals verify
		if( typeof current_parent ==='undefined' || !current_parent ) {
			console.log('Error: current_parent not defined! (update_inspector_info) ' + current_parent)
			return false
		}

		// Reset some content
		//$('#inspector_indexations').html('');
		//$('#inspector_relation_list_sections').html('');
		const ii  = document.getElementById('inspector_indexations')
			if(ii) ii.innerHTML=''

		// COMPONENT_INFO : MOD_DATE		
		if (typeof obj_warp.dataset.component_info !== 'undefined' && obj_warp.dataset.component_info.length>0) {
			try {
			   var component_info = JSON.parse(obj_warp.dataset.component_info)
			   if ( typeof component_info.mod_date !== 'undefined' ) {
					mod_date = component_info.mod_date
				}
				if (typeof component_info.mod_by_user_name !== 'undefined' ) {
					mod_by_user_name = component_info.mod_by_user_name
				}	
			}
			catch (e) {
			   console.log(e)
			}			
		}
			
		
		// HTML TO INSPECTOR
		if (target_obj) {
			
			// Clean node
			while (target_obj.firstChild) {
				target_obj.removeChild(target_obj.firstChild);
			}

			// Name of selected component		
			const label_div = common.create_dom_element({ element_type : 'div',
														parent 		 : target_obj,
														class_name 	 : "key capitalize",
														text_node 	 : get_label.seleccionado
													 })			
			const value_div = common.create_dom_element({ element_type : 'div',
														parent 		 : target_obj,
														class_name 	 : "value value_bold",
														text_node 	 : label
													 })			
			
			if(SHOW_DEVELOPER===true) {
			if (debug_div) {
				// Clean node
				while (debug_div.firstChild) {
					debug_div.removeChild(debug_div.firstChild);
				}
				// Parent
				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "key",
											text_node 	 : "parent"
										 })
				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "value",
											text_node 	 : current_parent
										 })
				common.create_dom_element({ element_type : 'br', parent : debug_div })

				// Tipo
				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "key",
											text_node 	 : "tipo"
										 })
				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "value",
											text_node 	 : tipo
										 })
				common.create_dom_element({ element_type : 'br', parent : debug_div })

				// Component name
				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "key",
											text_node 	 : "model"
										 })
				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "value",
											text_node 	 : component_name
										 })
				common.create_dom_element({ element_type : 'br', parent : debug_div })

				// Component name
				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "key",
											text_node 	 : "lang"
										 })
				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "value",
											text_node 	 : lang
										 })
				common.create_dom_element({ element_type : 'br', parent : debug_div })
			
				// Dato
				let dato_trim = String(dato)
					if (dato.length>255) {
						dato_trim = dato_trim.substring(0, 255) + ".."
					}
				// Strip html tags
				const tmp = document.createElement("DIV")
					tmp.innerHTML = dato_trim
					dato_trim = tmp.innerText || tmp.textContent

				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "key",
											text_node 	 : "dato"
										 })
				common.create_dom_element({ element_type : 'div',
											parent 		 : debug_div,
											class_name 	 : "value",
											text_node 	 : dato_trim
										 })
			}
			}
		}

		return false
	}//end update_inspector_info



	/**
	* LOAD INSPECTOR TOOLS BUTTONS
	* Load inspector tools buttons whe wrap is selected
	*/
	this.previous_load_inspector_tools_caller = null
	this.load_inspector_tools = function (obj_warp) {

		if (obj_warp instanceof jQuery ) {
			obj_warp = obj_warp[0]	// object jquery case
		}
		if (!obj_warp) {
			if(SHOW_DEBUG===true) console.log("Error on get obj_warp. Stopped load_inspector_tools")
			return false
		}	 	 

	 	// Click body or no wrap component elements case
	 	if ( typeof obj_warp.dataset.tipo == 'undefined' ) {
	 		return false
	 	}

	 	if ( typeof obj_warp.dataset.parent == 'undefined' || !obj_warp.dataset.parent ) {
	 		console.log("[inspector.load_inspector_tools] Error: wrap dataset parent is not set: ", obj_warp.dataset )
			alert("[inspector.load_inspector_tools] Error: wrap dataset parent is not set " + obj_warp.dataset.parent)
	 		return false
	 	}

		let tipo				 = obj_warp.dataset.tipo
		let	current_parent		 = obj_warp.dataset.parent
		let	lang				 = obj_warp.dataset.lang
		let	context_name		 = obj_warp.dataset.component_name
		let	current_tipo_section = obj_warp.dataset.current_tipo_section	//return alert('load_inspector_tools \nid:'+id_matrix + " \ntipo:"+tipo + " \ncurrent_tipo_section:"+current_tipo_section)
		let	section_tipo 		 = obj_warp.dataset.section_tipo		

		// inspector object. target result div
		let target_obj = document.getElementById('inspector_tools')
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

		try {
			let ar_tools_name  = []				
			let component_info = JSON.parse(obj_warp.dataset.component_info)
			if (component_info && typeof component_info.ar_tools_name!='undefined') {
				ar_tools_name = component_info.ar_tools_name
			}
			
			let len = ar_tools_name.length
			if (len > 0) {				
				for (let i = 0; i < len; i++) {

					const tool_name = ar_tools_name[i]
					const label 	= get_label[tool_name]
					const title 	= get_label.abrir + ' ' + get_label.herramienta

					// Skip add tool_indexation and tool_transcription when in resource section
					if( /rsc/i.test(page_globals.top_tipo) && ( /tool_indexation/i.test(tool_name) || /tool_structuration/i.test(tool_name) ) ) { // || /tool_transcription/i.test(tool_name)
						continue;
					}
					// HTML TO INSPECTOR
					// Container tool div					 
					const tool_button = inspector.build_tool_button({'tool_name'		: tool_name,
																	'label' 		: label,
																	'title' 		: title,
																	'tipo' 			: tipo,
																	'parent' 		: current_parent,
																	'section_tipo'  : section_tipo,
																	'lang'  		: lang,
																	'context_name'	: context_name
																	})

					const tool_inspector_div = document.createElement("div")
						tool_inspector_div.classList.add('tool_inspector_div')

					tool_inspector_div.appendChild(tool_button)

					target_obj.appendChild(tool_inspector_div)
				}//end for				
			}//end if (ar_tools_name.length>0) 
		}catch(err) {
			if(SHOW_DEBUG===true) {
				console.log("[inspector.load_inspector_tools] Error catch: ", err)
			}
		}

		return true
	}//end load_inspector_tools



	/**
	* BUILD_TOOL_BUTTON
	* @param object data
	* @return dom object tool_button
	*/
	this.build_tool_button = function( data ) {
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


