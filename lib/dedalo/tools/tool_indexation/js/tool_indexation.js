"use strict";
/**
*  TOOL_INDEXATION CLASS
*
*
*/
var tool_indexation = new function() {
	

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_indexation/trigger.tool_indexation.php'



	/**
	* INIT
	*/
	//this.inited = false
	this.init = function(data) {

		const self = this;
		
		//if (this.inited!==true) {

			// Set data vars
			self.textarea_lang = data.textarea_lang

			var current_tool_obj = self	

			// Init split pane
			Split(['#left_side', '#right_side'], {
				sizes: [45, 55],
				minSize: '40%'
			});

			// READY (EVENT)	
			window.ready(function(event){

				// DELETE_USER_SECTION_EVENTS
				try {
					// window opener sometimes is not in edit mode and not have loaded lock_components.js
					if(typeof lock_components!='undefined') {
						window.opener.lock_components.delete_user_section_locks()
					}
				}catch (e) {
					// statements to handle any exceptions
					console.log("->load event: no window.opener available. "+e);
					//console.log(e); // pass exception object to error handler
				}
				// Update lock_components state (FOCUS)				
				if(typeof lock_components!='undefined') {
					lock_components.update_lock_components_state( tool_indexation.get_tool_text_area_wrapper(), 'focus' );
				}
			})

		
			// LOAD (EVENT)			
			window.addEventListener("load", function (event) {
				tool_indexation.fix_height() 
				tool_indexation.select_tag_in_editor()				
			}, false)			


			// BEFOREUNLOAD (EVENT)
			window.addEventListener("beforeunload", function (event) {
				//console.log("-> triggered beforeunload event (tool_indexation)");
				event.preventDefault();

				if (tinymce.activeEditor.isDirty()) {

					// SAVE ON EXIT
					tool_indexation.save_on_exit();
					
					var confirmationMessage = "Leaving tool page.. ";
					event.returnValue  	= confirmationMessage;	// Gecko, Trident, Chrome 34+
					return confirmationMessage;					// Gecko, WebKit, Chrome <34
				}
			}, false)//end beforeunload
			

			// UNLOAD (EVENT)			
			window.addEventListener("unload", function (event) {
				//event.preventDefault();
			
				// Reload opener page list				
				if (window.opener && window.opener.page_globals.modo && window.opener.page_globals.modo==='list') {
					//window.opener.location.reload();
				
					// EDITING FROM PROCESSES
			
					// RELOAD_ROWS_LIST
					var call_uid = 'wrap_' + page_globals.section_tipo + '_' + 'list';	// wrap_dd1140_list
					window.opener.search.reload_rows_list(call_uid);

					window.opener.console.log("Reloading rows (reload_rows_list).. "+call_uid)

					// Update lock_components state (BLUR)
					if(typeof lock_components!='undefined') {
						lock_components.update_lock_components_state( self.get_tool_text_area_wrapper(), 'blur' );
					}
				}
			}, false)//end unload


			// VISIBILITYCHANGE (EVENT)
			document.addEventListener("visibilitychange", function(event) {
				if (document.hidden===true) return false;
				
				let locator = {
					section_tipo 	: page_globals.section_tipo,
					section_id 		: page_globals._parent,
					component_tipo 	: page_globals.tipo,
					lang 			: current_tool_obj.textarea_lang
				}
				if(SHOW_DEBUG===true) {
					console.warn("[tool_indexation.visibilitychange_action] locator:", locator);
				}				
				tool_common.update_tracking_status(event,{locator:locator})
			}, false)


			// RESIZE (EVENT)			
			window.addEventListener("resize", function (event) {
				//tool_indexation.fix_height()
			}, false)

		//}//end if (this.inited!==true)

		//this.inited = true
	};//end init



	/**
	* SAVE_ON_EXIT
	* Save text when user close window if changed
	*/
	this.save_on_exit = function() {

		// Save text_area
		const ed = tinymce.activeEditor;
		if (ed === null || typeof ed !== 'object') {
			if(window.opener)
			window.opener.console.log("-> tool_indexation:save_on_exit: Error: editor not found");
			return false;
		}
		if (ed.isDirty()) {

			if (SHOW_DEBUG===true) {
				if (window.opener)
				window.opener.console.log("-> tool_indexation:save_on_exit: ed isDirty. Text need save and saving_state = "+component_common.saving_state);
			}

			// IMPORTANT
			// Reselect always (lang selector updates component text area)
			//var text_area_obj = document.querySelector('textarea[data-role="text_area_indexation"]');
			const text_area_obj = document.getElementById(ed.id);
				//window.opener.console.log(typeof text_area_obj);

			//component_common.save_async = 1; // Set async false

			const jsPromise = component_text_area.Save(text_area_obj, null, ed);
				  jsPromise.then(function(response) {
					if(SHOW_DEBUG===true) {
						if(window.opener)
						window.opener.console.log("-> Saved and reloaded component from 'save_on_exit' ");
					}
					//window.opener.alert("Saved text")
				}, function(xhrObj) {
					//console.log(xhrObj);
				});
		}
	};//end save_on_exit



	/**
	* FIX_TOOL_VARS
	* 
	*/
	this.fix_tool_vars = function(tag_obj, tipo, parent, section_tipo, lang) {
		
		// Fix global selected_tag and selected_tipo for index		
		this.tag_obj 			= tag_obj
		this.tag_id 			= tag_obj.dataset.tag_id+"" // maintain value as text for now
		
		this.section_top_tipo 	= page_globals.top_tipo
		this.section_top_id 	= page_globals.top_id
		this.section_tipo 		= section_tipo
		this.section_id 		= parent+"" // maintain value as text for now
		this.component_tipo		= tipo					
		this.lang 				= lang
		this.locator 			= {
									section_top_tipo 	: this.section_top_tipo,
									section_top_id		: this.section_top_id,
									section_tipo		: this.section_tipo,
									section_id			: this.section_id,
									component_tipo		: this.component_tipo,
									tag_id 				: this.tag_id
								}
		return true
	};//end fix_tool_vars



	/**
	* FRAGMENT_INFO
	* Loads all fragment information in a container below the text editor 
	* for change tag state, delete tag or add indexation terms
	*/
	this.fragment_info = function(tag_obj, tipo, section_id, section_tipo, lang) {
		//return console.log(tagName+", "+tipo+", "+section_id+", "+section_tipo+", "+lang) 
		//return console.log(tag_obj)

		// Fix vars
		this.fix_tool_vars(tag_obj, tipo, section_id, section_tipo, lang)
			//console.log(this.tag_obj);

		// Target div container element
		const wrap_div = document.getElementById('indexation_page_list')

		const trigger_vars = {
				mode 		 	: 'fragment_info',
				section_tipo 	: this.section_tipo,
				section_id 	 	: this.section_id,
				component_tipo  : this.component_tipo,
				tag_id 	 		: this.tag_id,
				lang 		 	: this.lang,
				data 			: tag_obj.dataset.data
			}
			//console.log(trigger_vars); //return

		html_page.loading_content( wrap_div, 1 );

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_indexation.fragment_info] response",response);
				}

				if (response===null) {

					console.log("Error. null is received as response. An error has ocurred. See the log for more info");

				}else if (response.result!==false) {

					// Clean wrap_div
					if(wrap_div) {
						var myNode = wrap_div; while (myNode.firstChild) {
							myNode.removeChild(myNode.firstChild);
						}
					}								

					// Tag info
					const data =  {
						tag_label 				: get_label.etiqueta + " " + trigger_vars.tag_id,
						tag_options 			: {
													n : get_label.etiqueta_normal,
													d : get_label.etiqueta_borrada,
													r : get_label.etiqueta_revisar
												  },
						tag_options_selected	: tool_indexation.tag_obj.dataset.state,
						tipo					: tool_indexation.component_tipo,
						section_tipo			: tool_indexation.section_tipo,
						parent					: tool_indexation.section_id,
						lang					: tool_indexation.lang,
						tag_obj					: tool_indexation.tag_obj,
						rel_locator				: tool_indexation.locator,
						terminos_list_title		: get_label.descriptores,
						selected_fragment_text	: response.fragment_text,
						info_notes				: response.indexation_notes,
						posterframe				: response.posterframe,
						quality					: response.quality,
						video_id				: response.video_id,
						tag_id					: response.tag_id,
						av_locator				: response.av_locator,
						posterframe_file		: response.posterframe_file,
						posterframe_path		: response.posterframe_path,
					}

					Promise.resolve( tool_indexation.build_fragment_info(data, wrap_div) ).then(function(res){
	
						// Term list
						const ul = tool_indexation.build_term_list(response.indexations_list)
						
						// Clean and update terminos_list container
						const terminos_list_container = document.getElementById("terminos_list_container")
						if(terminos_list_container) {
							let myNode = terminos_list_container; while (myNode.firstChild) {
								myNode.removeChild(myNode.firstChild);
							}
							terminos_list_container.appendChild(ul)
						}
						// select_tab_active
						if (typeof section_tabs!=="undefined") {
							//section_tabs.select_tab_active()
							tool_indexation.select_tab_active()
						}						
					})														
				}
				html_page.loading_content( wrap_div, 0 );
		})

		return js_promise
	};//end fragment_info




	/**
	* SET_TAB_ACTIVE
	* @return 
	*/
	this.set_tab_active = function(button) {

		set_localStorage('section_tab_active', button.id)

		const container			= button.parentNode		
		
		// Buttons
		const button_tabs 		= container.getElementsByClassName('section_tab_label')
		const button_tabs_len	= button_tabs.length
		for (let i = button_tabs_len - 1; i >= 0; i--) {				
			if (button_tabs[i].classList.contains("section_tab_active")) {
				button_tabs[i].classList.remove("section_tab_active")
			}			
		}
		button.classList.add("section_tab_active")

		// Containers		
		const section_tabs 		= container.getElementsByClassName('section_tab')
		const section_tabs_len	= section_tabs.length
		for (let i = section_tabs_len - 1; i >= 0; i--) {
			if(section_tabs[i].id === button.id + '_content' ){
				section_tabs[i].style.display = 'table';
			}else{
				section_tabs[i].style.display = 'none';
			}
		}	
	};//end set_tab_active


	/**
	* SELECT_TAB_ACTIVE
	* @return 
	*/
	this.select_tab_active = function() {

		const self = this

		var selected = false

		const cookie_tab_active = get_localStorage('section_tab_active');		
		if (cookie_tab_active) {
			// Previously set on cookie
			var tab_active_element = document.getElementById(cookie_tab_active)
			if (tab_active_element)
				self.set_tab_active(tab_active_element)
				selected = true
		}
	
		if (selected===false) {
			const buttons 		= document.getElementsByClassName('section_tab_label')
			const buttons_len 	= buttons.length
			//const section_tabs 	= document.getElementsByClassName('section_tab')
			
			for (let i = buttons_len - 1; i >= 0; i--) {
				const button 	= buttons[i]
				if(button.classList.contains("section_tab_active")){				
					const content = document.getElementById(button.id + "_content")	
					content.style.display = 'table';
					return true
				}
			}
		}
	

		return false
	};//end select_tab_active



	/**
	* LOAD_INSPECTOR_INDEXATION_LIST
	* Loads tag indexations list in inspector when in modo "edit"
	*/
	this.load_inspector_indexation_list = function(tag_object, tipo, parent, section_tipo, lang) {
	
		if (typeof page_globals.context_name!=="undefined" && page_globals.context_name==="list_into_tool_portal") {
			return false;
		}

		// Fix vars
		this.fix_tool_vars(tag_object, tipo, parent, section_tipo, lang)

		const target_div = document.getElementById('inspector_indexations');

		const trigger_url  = this.url_trigger
		const trigger_vars = {
			mode 		 	: 'indexations_list',
			section_tipo 	: this.section_tipo,
			section_id 	 	: this.section_id,
			component_tipo  : this.component_tipo,
			tag_id 	 		: this.tag_id,			
			lang 		 	: this.lang
		}; //console.log(trigger_vars); return
		

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_indexation.load_inspector_indexation_list] response",response);
				}

				if (response.result!==false) {

					// Inspector label
					const label = document.createElement("div")
						label.classList.add("terminos_list_title")
					var t = document.createTextNode(get_label.etiqueta+" "+tool_indexation.tag_id)
						label.appendChild(t)

					// Term list
					const ul = tool_indexation.build_term_list(response.indexations_list)
					
					// Clean and update terminos_list container
					const terminos_list_container = document.getElementById("inspector_indexations")				
					while (terminos_list_container.firstChild) {
						terminos_list_container.removeChild(terminos_list_container.firstChild);
					}

					terminos_list_container.appendChild(label)
					terminos_list_container.appendChild(ul)
				}
		})

		return js_promise
	};//end load_inspector_indexation_list



	/**
	* BUILD_FRAGMENT_INFO
	* Create necessary html for show tag info (indexations and idex notes)
	* @return DOM node
	*/
	this.build_fragment_info = function( data, div ) {
	
		const self = this
		
		if (!div) {
			div = document.createElement('div')
		}

		// Common line
		const common_line = document.createElement('div')
			  common_line.classList.add('common_line')

		const fragment_info = document.createElement('div')
			  fragment_info.classList.add('fragment_id_info')

				var t = document.createTextNode(data.tag_label)
					fragment_info.appendChild(t)

				// Add element
				common_line.appendChild(fragment_info)

			const wrap_tag_state_selector = document.createElement('div')
				  wrap_tag_state_selector.classList.add('wrap_tag_state_selector')

				var t = document.createTextNode(get_label.estado)
					wrap_tag_state_selector.appendChild(t)

				const select = document.createElement('select')
					  select.classList.add('tag_state_selector')				
					//Create and append the options
					for(var k in data.tag_options){
						var option = document.createElement("option");
						option.value = k;
						option.text  = data.tag_options[k];
						if(k===data.tag_options_selected) option.selected = true
						select.appendChild(option);
					}
					select.addEventListener("change", function(e){
						//this.dataset.tag = tool_indexation.tag
						component_text_area.change_tag_state(this)
					})

				wrap_tag_state_selector.appendChild(select)

				// Add element
				common_line.appendChild(wrap_tag_state_selector)

			const div_delete_tag = document.createElement('div')
				  div_delete_tag.classList.add('div_delete_tag')			

				const icon_delete_tag = document.createElement('div')
					  icon_delete_tag.classList.add("icon_bs","tool_indexation_delete_icon","link")				
					  icon_delete_tag.title = "Delete tag"				

					  icon_delete_tag.addEventListener("click", function(e){
						tool_indexation.delete_tag(this, data)
					  })

				var label = document.createElement('label')				
				var t = document.createTextNode("Delete tag")
					label.appendChild(t)

				div_delete_tag.appendChild(icon_delete_tag)
				div_delete_tag.appendChild(label)			

				// Add element
				common_line.appendChild(div_delete_tag)

		// Add element
		div.appendChild(common_line)		

		// Tabs		
		const button_tab_2 = common.create_dom_element({
			element_type: "span",
			id 			: "section_tab_2",
			class_name 	: "section_tab_label",
			text_content: get_label.info || 'Info',
			parent 		: div
			})
			button_tab_2.addEventListener("click", function(e){
				self.set_tab_active(this)
			})
		const button_tab_1 = common.create_dom_element({
			element_type: "span",
			id 			: "section_tab_1",
			class_name 	: "section_tab_label section_tab_active",
			text_content: get_label.indexacion || 'Indexation',
			parent 		: div
			})
			button_tab_1.addEventListener("click", function(e){
				self.set_tab_active(this)
			})


		const tab_1 = document.createElement('section')
			  tab_1.id = "section_tab_1_content"
			  tab_1.classList.add("section_tab")
			  // Add element
			  div.appendChild(tab_1)			

			const icon_show_fragment = document.createElement('div')
				  icon_show_fragment.classList.add("icon_bs","tool_indexation_show_fragment","link")

				  icon_show_fragment.addEventListener("click", function(){
					tool_indexation.toggle_selected_fragment(this)
				  })

				// Add element
				tab_1.appendChild(icon_show_fragment)

			const selected_fragment = document.createElement('div')
				  selected_fragment.classList.add("selected_fragment")		
				  selected_fragment.innerHTML = data.selected_fragment_text // use innerHTML to parse the html content

				// Add element
				tab_1.appendChild(selected_fragment)

			const terminos_list = document.createElement('div')
				  terminos_list.classList.add("terminos_list")

				const terminos_list_title = document.createElement('div')
					  terminos_list_title.classList.add("terminos_list_title")

					var t = document.createTextNode(data.terminos_list_title)
					terminos_list_title.appendChild(t)

				const terminos_list_container = document.createElement('div')
					  terminos_list_container.id = "terminos_list_container"

					terminos_list.appendChild(terminos_list_container)

				// Add element
				tab_1.appendChild(terminos_list)


		const tab_2 = document.createElement('section')
			  tab_2.id = "section_tab_2_content"
			  tab_2.classList.add("section_tab")	
			  // Add element
			  div.appendChild(tab_2)

			if(data.posterframe){
				const posterframe = document.createElement('img')
				posterframe.src = data.posterframe
				posterframe.classList.add("posterframe")


				posterframe.addEventListener('click', function(){
					const iframe_obj = document.getElementById('videoFrame')

					if (iframe_obj && typeof videoFrame.player_get_current_time_in_seconds!=="undefined") {
						const seconds = videoFrame.player_get_current_time_in_seconds()

						const target_path = data.posterframe_path
						const target_file = data.posterframe_file

						const trigger_vars = {
							mode		: 'generate_posterframe',
							video_id	: data.video_id,
							tag_id		: data.tag_id,
							quality		: data.quality,
							seconds		: seconds,
							av_locator 	: data.av_locator,
							ar_target 	: {
								target_path : target_path,
								target_file : target_file
							}
						}

						const js_promise = common.get_json_data(tool_indexation.url_trigger, trigger_vars).then(function(response) {
							if(SHOW_DEBUG===true) {
								console.log("[tool_indexation.fragment_info] response",response);
							}

							if (response===null) {

								console.log("Error. null is received as response. An error has occurred. See the log for more info");

							}else if (response.result!==false) {
									console.log("response.result.posterframe:",response.posterframe);
								posterframe.src = response.posterframe
							}

					})

					}

				})

				// Add element
				tab_2.appendChild(posterframe)
			}

			if (data.info_notes && data.info_notes.html!==null) {
				var notes = document.createElement("div")
					notes.classList.add("indexation_notes")
					notes.innerHTML = data.info_notes.html
					// Add element
					tab_2.appendChild(notes)
			}else{
				const button_add_note = document.createElement('button')
					  button_add_note.classList.add("btn","btn-default")
					  button_add_note.addEventListener("click", function(e){
						tool_indexation.new_index_data_record(this, e)
					})

					var span = document.createElement('span')
						//span.classList.add("glyphicon","glyphicon-plus-sign")
						//span.setAttribute("aria-hidden", true)
						span.appendChild( document.createTextNode(get_label.nuevo) )
					button_add_note.appendChild(span)
					// Add element
					tab_2.appendChild(button_add_note)
			}

		return div
	};//end build_fragment_info



	/**
	* NEW_INDEX_DATA_RECORD
	* Insert a new record in table matrix_idexations and inject the locator in current tag dataset
	* @return 
	*/
	this.new_index_data_record = function(button_ob, evt) {
		
		const trigger_vars = {
			mode		: 'new_index_data_record',
			tag_id		: tool_indexation.tag_id,
		}
		//console.log(trigger_vars);

		const js_promise = common.get_json_data(tool_indexation.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_indexation.new_index_data_record] response",response);
				}
					
				if (response===null) {
					alert("Error on create new_index_data_record ")
				}else{
					
					var data = JSON.stringify(response.result)
						// Format data Important !!
						data = replaceAll('"', '\'', data);
							console.log(data);

					const new_data_obj = {
						data : data
					}

					let tag_obj  = tool_indexation.tag_obj
					let tag_data = {
						component_tipo 	: tool_indexation.component_tipo,
						type 			: tag_obj.dataset.type,
						tag_id 			: tag_obj.dataset.tag_id,
						id 				: tag_obj.id
					}

					// Update data in tag
					component_text_area.update_tag(tag_data, new_data_obj, true)

					// Update tab info
					tool_indexation.fragment_info(tool_indexation.tag_obj,
												  tool_indexation.component_tipo,
												  tool_indexation.section_id,
												  tool_indexation.section_tipo,
												  tool_indexation.lang) // tag_obj, tipo, parent, section_tipo, lang
				}	
		}, function(error) {
				console.log("[tool_indexation.new_index_data_record] error",error)
		});

		return js_promise
	};//end new_index_data_record



	/**
	* BUILD_TERM_LIST
	* @return 
	*/
	this.build_term_list = function(result) {

		const ul = document.createElement('ul')
								
		const len = result.length
		for (var i = 0; i < len; i++) {
			var element = result[i]
			
			if (page_globals.modo==='tool_indexation') {
	
				// Delete icon
				var icon = document.createElement('div')
					icon.classList.add('icon_bs','tool_indexation_delete_icon','link')
					icon.dataset.tipo  			= element.locator.from_component_tipo
					icon.dataset.section_tipo  	= element.section_tipo
					icon.dataset.section_id  	= element.section_id
					icon.dataset.term  			= element.term
					icon.dataset.locator 		= JSON.stringify(element.locator)

					// Click delete action
					icon.addEventListener("click", function (event) {
						tool_indexation.remove_index(this)
					});
			}else{

				// Label icon
				var icon = document.createElement('div')
					icon.classList.add('icon_bs','tool_current_indexation_icon','link')
			}		

			// Term
			var t  = document.createTextNode(element.term)
			
			// li
			var li = document.createElement('li')				
				li.appendChild(icon)
				li.appendChild(t)

			if(SHOW_DEBUG===true) {
				var t 	 = document.createTextNode(" ["+element.section_tipo+"-"+element.section_id+"] (V4)")
				var span = document.createElement('span')
					span.appendChild(t)
				li.appendChild(span)
			}

			ul.appendChild(li)
		}

		return ul
	};//end build_term_list



	/**
	* DELETE_TAG . Remove selected tag an all relations / indexes associated
	* Delete / remove current tag in all component langs, all references (inverse) in all portals and index record (matrix descriptors)
	* @param object button_obj
	*/
	this.delete_tag = function(button_obj, data) {

		// Confirm action
		if( !confirm( get_label.eliminar_etiqueta + "\n\n "+ tool_indexation.tag_id +"\n\n") )  return false;
		if( !confirm( get_label.atencion + "!! \n" + get_label.borrara_la_etiqueta_seleccionada ) )  return false;

		const trigger_vars = {
			mode 		 	: 'delete_tag',
			section_tipo 	: tool_indexation.locator.section_tipo,
			section_id 	 	: tool_indexation.locator.section_id,
			component_tipo  : tool_indexation.locator.component_tipo,
			tag_obj  		: tool_indexation.tag_obj,
			tag_id  		: tool_indexation.locator.tag_id,
			locator 	 	: tool_indexation.locator,
			lang 			: tool_indexation.lang,
			av_locator 		: data.av_locator || null
		}
		//return console.log(trigger_vars)

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_indexation.delete_tag] response",response)
				}

				if (!response || response.result!==true) {

					alert("Error on remove tag: "+ tool_indexation.locator.tag_id)
				}else{
					/*
					// Refresh fragment_info // tagName, tipo, parent, section_tipo, lang
					tool_indexation.fragment_info(tool_indexation.tag,
												  tool_indexation.component_tipo,
												  tool_indexation.section_id,
												  tool_indexation.section_tipo,
												  tool_indexation.lang)
					*/
					// Refresh component text area
					setTimeout(function(){
						component_text_area.load_tr( document.querySelector('.css_text_area'), tinymce.activeEditor );
					},1000)
					

					// Clean selected fragment info
					var indexation_page_list = document.getElementById('indexation_page_list')
						//indexation_page_list.html('');
						var myNode = indexation_page_list; while (myNode.firstChild) {
							myNode.removeChild(myNode.firstChild);
						}
				}
		})

		return js_promise
	};//end delete_tag



	/**
	* ADD_INDEX
	* @return promise
	*/
	this.add_index = function(section_id, section_tipo, label) {

		if(typeof this.locator==='undefined') {
			return alert(" Please select a tag before indexing! " );
		}

		const container = document.getElementById('terminos_list_container')
			if (!container) {
				return console.log("Error on locate div container terminos_list_container")
			}

		const trigger_vars = {
				mode 		 	: 'add_index',
				section_id 	 	: section_id,
				section_tipo 	: section_tipo,
				label 		 	: label,
				locator	 	 	: JSON.stringify(this.locator)
			}
		//console.log(trigger_vars);

		html_page.loading_content( container, 1 );

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_indexation.add_index] response",response);
				}

				/*
				// Clean and update container
				var myNode = container; while (myNode.firstChild) {
					myNode.removeChild(myNode.firstChild);
				}
				//container.appendChild(ul)
				*/

				if (!response) {
					console.error("[tool_indexation.add_index] Error. null response is received")
				}else{

					if (response.result===true) {
						// Refresh fragment_info
						// tagName, tipo, parent, section_tipo, lang
						tool_indexation.fragment_info(tool_indexation.tag_obj,
													  tool_indexation.component_tipo,
													  tool_indexation.section_id,
													  tool_indexation.section_tipo,
													  tool_indexation.lang)
					}else{
						if(SHOW_DEBUG===true) {
							console.warn("[tool_indexation.add_index] ", response.msg);
						}
					}											  
				}
				html_page.loading_content( container, 0 );
		})

		return js_promise
	};//end add_index



	/**
	* REMOVE_INDEX_V4
	* @return promise
	*/
	this.remove_index = function(button_obj) {

		// Confirm action
		var msg = html2text("Remove indexation ?\n" + button_obj.dataset.term + " ["+button_obj.dataset.section_tipo+"-"+button_obj.dataset.section_id+"]");
			if( !confirm(msg) ) return false;

		const trigger_vars = {
			mode 		 	: 'remove_index',
			section_tipo 	: button_obj.dataset.section_tipo,
			section_id 	 	: button_obj.dataset.section_id,
			component_tipo  : button_obj.dataset.tipo,
			term  			: button_obj.dataset.term,
			locator 	 	: button_obj.dataset.locator
		}
		//console.log(trigger_vars); 	return;

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_indexation.remove_index] response",response);
				}

				if (!response || response.result!==true) {
					alert("[tool_indexation.remove_index] \nError on remove index term: "+ button_obj.dataset.term)
				}else{
					// Refresh fragment_info // tagName, tipo, parent, section_tipo, lang
					tool_indexation.fragment_info(tool_indexation.tag_obj,
												  tool_indexation.component_tipo,
												  tool_indexation.section_id,
												  tool_indexation.section_tipo,
												  tool_indexation.lang)
				}
		})

		return js_promise
	};//end remove_index_v4



	/**
	* TOGGLE_SELECTED_FRAGMENT
	*/
	this.toggle_selected_fragment = function( button_obj ) {
		
		$(button_obj).next('.selected_fragment').toggle();		
	};



	/**
	* CREATE FRAGMENT
	* Crea las imágenes (con los tag) al principio y final del texto seleccionado
	* y salva los datos
	*/
	this.create_fragment = function ( button_obj, event ) {	//, component_name
		event.preventDefault()
		event.stopPropagation()

		var identificador_unico	= button_obj.dataset.identificador_unico
		var parent				= button_obj.dataset.parent
		var tipo				= button_obj.dataset.tipo
		var section_tipo		= button_obj.dataset.section_tipo
		var lang				= button_obj.dataset.lang
		var component_id		= identificador_unico		

		// Select current editor
		var ed = tinyMCE.get(component_id);
		//var ed = tinymce.activeEditor
			if ($(ed).length<1) { return alert("Editor " + component_id + " not found [1]!") };
		
		var current_text_area = document.getElementById(component_id);
			if (!current_text_area) {
				return alert("Editor " + component_id + " not found [2]!")
			}
		
		//var last_tag_index_id = parseInt(current_text_area.dataset.last_tag_index_id);
		var last_tag_index_id = parseInt( component_text_area.get_last_tag_id(ed, 'index') )
			//console.log(last_tag_index_id); return;
		
		var string_selected 	= ed.selection.getContent({format : 'raw'}); // Get the selected text in raw format
		var string_len 			= string_selected.length ;
			if(string_len<1) return alert("Please, select a text fragment before ! " +string_len);

		// New tag_id to use
		var tag_id = parseInt(last_tag_index_id+1);		//alert("new tag_id:"+last_tag_index_id + " "+component_id); return false;

		// State. Default is 'n' (normal)
		var state = 'n';

		// Final string to replace 
		var image_in  = component_text_area.build_dom_element_from_data('indexIn', tag_id, state, "label in "+tag_id, '')
		var image_out = component_text_area.build_dom_element_from_data('indexOut', tag_id, state, "label out "+tag_id, '')

		// Get selection range
		var range 		    = ed.selection.getRng(0)
		var range_clon 	    = range.cloneRange()
		// Save start and end position
		var startOffset 	= range_clon.startOffset
		var startContainer 	= range_clon.startContainer
			range_clon.collapse(false)	// Go to end of range position

		// Insert end out image
		range_clon.insertNode(image_out)		

		// Positioned to begin of range
		range_clon.setStart(startContainer, startOffset)
		// Insert note at begining of range
		range_clon.collapse(true) // Go to start of range position
		range_clon.insertNode(image_in)

		// Force dirty state
		ed.setDirty(true);		
		
		// Update last_tag_index_id data on current text area		
		//$(current_text_area).data('last_tag_index_id',tag_id);		
		current_text_area.dataset.last_tag_index_id = tag_id

		// FORCE UPDATE REAL TEXT AREA CONTENT (and save is triggered when text area changes)												
		//tinyMCE.triggerSave();	//console.log(tinyMCE)
		// TEXT EDITOR : Force save		
		var evt = null;
		//var js_promise = text_editor.save_command(ed, evt, current_text_area);
		var js_promise = component_text_area.Save(current_text_area, null, ed)
			js_promise.then(function(response) {
				// fragment_info
				tool_indexation.fragment_info(image_in, tipo, parent, section_tipo, lang);	//tag_obj, tipo, parent, section_tipo, lang	
			})			

		// Hide "Create New Fragment" button
		//$(button_obj).hide()
		button_obj.style.display = 'none'

		return true
	};//end create_fragment



	/**
	* UPDATE_TOP_ID
	* Update value of global page_globals.top_id on change selector value
	*/
	this.update_top_id = function(select_obj) {

		var value = select_obj.value
		if (value) {
			page_globals.top_id = value;
			//if(SHOW_DEBUG===true) console.log("[tool_indexation.update_top_id] Updated top_id to:",value);
		}

		return true;
	};//end update_top_id



	/**
	* SELECT_TAG_IN_EDITOR
	* Select first tag (index in) image in text editor and scroll to he 
	*/
	this.select_tag_in_editor = function() {
		
		try {
			if(tinyMCE.activeEditor && page_globals.tag_id) {

				var ed = tinyMCE.activeEditor

				// Select request tag
				//var tagname = '[id$=-'+page_globals.tag_id+'\\]]'
				var tagname 		 = ".index[data-tag_id='" +page_globals.tag_id+ "']"
				var selected_element = ed.dom.select(tagname)[0]
				if (selected_element) {
					// Select tag and scroll editor to show
					ed.selection.select(selected_element).scrollIntoView(false); //select the inserted element

					// Imitate user click on selected element to load fragment info
					selected_element.click()
				}
			}
		}catch(e) {
			//console.log("Error: "+e)
		}
	};//end select_tag_in_editor



	/**
	* FIX_HEIGHT
	*/
	this.fix_height = function() {
		
		if (page_globals.modo!=='tool_indexation') {
			return false;
		}

		//var current_height = window.innerHeight
		//document.getElementById('indexation_container').style.height = current_height+'px';
		//console.log( document.querySelector('div.indexation_page_text').offsetHeight );
		if(tinyMCE.activeEditor) {
			// Adjust height
			tinyMCE.activeEditor.theme.resizeTo(
				null,
				document.querySelector('div.indexation_page_text').clientHeight -20
			)
		}


		return true
	};//end fix_height



	/**
	* FAST_SWITCH_LANG
	* @return 
	*/
	this.fast_switch_lang = function(selector_obj) {

		const self = this

		// Exec standard component switch
		const js_promise = component_common.fast_switch_lang(selector_obj)

		js_promise.then(function(response){
			//update the lang in the init object
			self.textarea_lang = selector_obj.value

		})
		
	};//end fast_switch_lang



	/**
	* GET_tool_TEXT_AREA_WRAPPER
	* @return dom object
	*/
	this.get_tool_text_area_wrapper = function() {
		const text_preview_wrapper  = document.getElementById("indexation_page_text")
		const text_area_wrapper 	= text_preview_wrapper.querySelector("div.text_area_tool_indexation")

		return text_area_wrapper
	};//end get_tool_text_area_wrapper



};//end tool_indexation