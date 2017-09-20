"use strict";
/**
*  TOOL_STRUCTURATION CLASS
*
*
*/
var tool_structuration = new function() {


	// LOCAL VARS
	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/tools/tool_structuration/trigger.tool_structuration.php'

	// Current component vars
	this.component_tipo = null
	this.section_tipo 	= null
	this.section_id 	= null
	this.is_new_record = false

	// Original text lang of text area
	this.original_lang 		 = null
	this.original_lang_label = null	



	/**
	* INIT
	* @return 
	*/
	//this.inited = false
	this.init = function(data) {
		
		if(SHOW_DEBUG===true) {
			//console.log("[tool_struturation.init} +++ data",data);;
		}		

		var self = this;

		// Default
		self.wrapper_id  = data.uid		

		//if (self.inited===false) {
			
			// Activate split pane
			Split(['#left_side', '#right_side'], {
				sizes: [40, 60],
				minSize: '40%'
			});


			// READY (EVENT)
			window.ready(function(){
				// fix_height
				//tool_structuration.fix_height(self.wrapper_id)

				setTimeout(function(){
					let tesaurus_frame = document.getElementById("tesaurus_frame")
						tesaurus_frame.src = tesaurus_frame.dataset.url	
					document.getElementById("tesaurus_frame_loading").remove()
				},300)
				
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
					lock_components.update_lock_components_state( self.get_tool_text_area_wrapper(), 'focus' );
				}
			});


			// LOAD (EVENT)
			window.addEventListener("load", function (event) {
				// Select tag if received via url to global_page vars
				if (page_globals.tag_id.length > 0) {
					self.select_tag(page_globals.tag_id, self.wrapper_id)					
				}				

				//document.getElementById("toc").style.display = "none"


			}, false)
			

			// BEFOREUNLOAD (EVENT)			
			window.addEventListener("beforeunload", function (event) {
				//console.log("-> triggered beforeunload event (tool_transcription)");
				event.preventDefault();

				if ( component_text_area.content_is_changed===true ) {
					// SAVE ON EXIT
					//tool_structuration.save_structuration_text(null, false); // Only with blur works well
					
					var confirmationMessage = "Leaving tool structuration page.. ";
					event.returnValue  	= confirmationMessage;	// Gecko, Trident, Chrome 34+
					return confirmationMessage;              	// Gecko, WebKit, Chrome <34									
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


			// RESIZE (EVENT)
			window.addEventListener("resize", function (event) {
				tool_structuration.fix_height(self.wrapper_id)
			});			
		

			// KEYUP (EVENT)
			window.addEventListener('keyup', function(e){
				tool_structuration.av_editor_key_up(e)
			}, false)


			// KEYDOWN (EVENT)
			window.addEventListener('keydown', function(e){
				tool_structuration.av_editor_key_down(e)
			}, false)
			

			// LOAD_COMPONENT_BY_WRAPPER_ID (EVENT)
			// Is triggered when component is saved and reloaded
			/* PASADO AL TEXT AREA
			window.addEventListener('load_component_by_wrapper_id', function(e){
				//console.log("-------[load_component_by_wrapper_id]",e);

				var loaded_wrapper_id = e.detail.wrapper_id
				if (loaded_wrapper_id==text_area_wrapper.id) {
					// Re init tool		
					tool_structuration.init({textarea_lang:self.textarea_lang})

					if (tool_structuration.tags_vissible!==true) {
						tool_structuration.tags_vissible=true
						setTimeout(function(){
							tool_structuration.toggle_tags(null)
						},100)
					}
					console.log("[tool_structuration.init] fired event load_component_by_wrapper_id ",e);
				}				
			})*/


			// VISIBILITYCHANGE (EVENT)
			document.addEventListener("visibilitychange", function(e) {
				if (document.hidden===true) return false;
				
				let tool_text_area_wrapper = self.get_tool_text_area_wrapper()
				let locator = {
					section_tipo 	: page_globals.section_tipo,
					section_id 		: page_globals._parent,
					component_tipo 	: page_globals.tipo,
					lang 			: tool_text_area_wrapper.dataset.lang //self.textarea_lang
				}
				if(SHOW_DEBUG===true) {
					console.warn("[tool_structuration.visibilitychange_action] locator:", locator)
				}
				tool_common.update_tracking_status(e,{locator:locator})				
			}, false)


			// COMPONENT_SAVE HOOK (EVENT)
			// Event triggered when component_text_area is saved 
			var _id_wrapper = self.id_wrapper		
			window.addEventListener('component_save', function(e){
				// When is saved input "title", capture and update titles in editor
				if(e.detail.dataset.tipo==="rsc372") {

					// In some cases we don't need update titles on save
					if (tool_structuration.update_titles_on_save===false) return false;

					// Removes current is exists (avoid duplicate on update)
					if(tool_structuration.tag_obj) {
						
						// CHAPTER TITLE UPDATE
						let text_area_wrapper = self.get_tool_text_area_wrapper()						
						let section_elements = [tool_structuration.tag_obj]
						let lang 			 = null						
						text_editor.set_section_titles(section_elements, lang, text_area_wrapper.id)						
					}
				}
				/*
				return 	console.log("component_save addEventListener",e.detail.dataset);
				// Filter action only to text_preview / chapter title elements save
				// This avoid trigger this action when notes, etc. are saved
				if (!e.detail.id || (e.detail.id!=='text_preview' && e.detail.nodeName!=='INPUT')) {
					console.log("[tool_structuration:init] Skip save postprocessing action on non text_preview / chapter title element")
					return false
				}else{
					console.log("[tool_structuration:init] Postprocessing save action..");
				}*/				
			}, false)			

		//}//end if (this.inited!==true)		

		this.inited = true
	};//end init



	/**
	* GET_tool_TEXT_PREVIEW
	* @return dom object
	*/
	this.get_tool_text_preview = function(wrapper_id) {
		let text_area_wrapper   = null
		let text_preview 		= null

		if (typeof wrapper_id!=="undefined") {
			// Calcualte wrapper from wrapper_id
			text_area_wrapper = document.getElementById(wrapper_id)
		}else{
			// Look inside tool container
			text_area_wrapper = this.get_tool_text_area_wrapper()
		}

		if (text_area_wrapper) {
			text_preview = text_area_wrapper.querySelector("#text_preview")
		}		

		return text_preview || null
	};//end get_tool_text_preview



	/**
	* GET_tool_TEXT_AREA_WRAPPER
	* @return dom object
	*/
	this.get_tool_text_area_wrapper = function() {
		const text_preview_wrapper  = document.getElementById("text_preview_wrapper")
		const text_area_wrapper 	= text_preview_wrapper.querySelector("div.text_area_tool_indexation")

		return text_area_wrapper
	};//end get_tool_text_area_wrapper



	/**
	* UPDATE_VIEW
	* Updates selected tag object if is selected. Else updates all nodes
	* @return 
	*/
	this.update_view = function(button_obj) {

		var self = this

		self.n_order = 0
		var text_preview 		= self.get_tool_text_preview()
		var text_area_wrapper 	= self.get_tool_text_area_wrapper()

		var id_wrapper = text_area_wrapper.id


		var section_elements = text_preview.getElementsByTagName('section') // iterate later all section elements and add click listeners etc
		

		if (typeof self.tag_obj==="undefined" || self.tag_obj===null) {
			

			// Removes current is exists (avoid duplicate on update)
			var h2  = text_preview.getElementsByTagName('h2')
			var len = h2.length
			if (len>0) {
				for (var i = len - 1; i >= 0; i--) {
					h2[i].remove()
				}
			}			

			// Updates all titles
			var js_promise = text_editor.set_section_titles(section_elements, '' ,id_wrapper)

		}else{

			// Updates only selected title
			//console.log(self.tag_obj);
			/*
			// Removes current is exists (avoid duplicate on update)
			var h2  = self.tag_obj.getElementsByTagName('h2')[0];
			if (h2) h2.remove()*/

			var h2  = text_preview.getElementsByTagName('h2')
			var len = h2.length
			if (len>0) {
				for (var i = len - 1; i >= 0; i--) {
					h2[i].remove()
				}
			}

			// Updates current title (send always as array)
			//var js_promise = text_editor.set_section_titles( [self.tag_obj] )
			var js_promise = text_editor.set_section_titles(section_elements, '' , id_wrapper)

		}

		// Promise resolve action
		js_promise.then(function(){
			var toc = text_preview.querySelector('#toc') //document.getElementById("toc")

			// Delete wrap contents
			while (toc.firstChild) toc.removeChild(toc.firstChild)	
			
			//toc.appendChild( document.createTextNode("Table of Contents") )	

			// Update toc
			text_editor.toc_solved = []
			text_editor.build_toc(text_preview, toc, section_elements, 0)
		})
		
	};//end update_view



	/**
	* FIX_TOOL_VARS
	* 
	*/
	this.fix_tool_vars = function(tag_obj, tipo, parent, section_tipo, lang) {
		
		// Fix global selected_tag and selected_tipo for index
		this.section_top_tipo 	= page_globals.top_tipo
		this.section_top_id 	= page_globals.top_id
		this.section_tipo 		= section_tipo
		this.section_id 		= parent +"" // maintain value as text for now
		this.component_tipo		= tipo
		this.tag_obj 			= tag_obj
		this.tag_id 			= tag_obj.dataset.tag_id +"" // maintain value as text for now	
		this.tag_state 			= tag_obj.dataset.state	
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
	* SELECTION UTILS
	*/
	this.isOrContains = function isOrContains(node, container) {
		while (node) {
			if (node === container) {
				return true;
			}
			node = node.parentNode;
		}
		return false;
	}
	this.elementContainsSelection = function(el) {
		var sel;

		if (window.getSelection) {	    	  	
			sel = window.getSelection();
			if (sel.rangeCount > 0) {
				
				for (var i = 0; i < sel.rangeCount; ++i) {
					//console.log(sel.getRangeAt(i).commonAncestorContainer)
					//console.log(el)
					if (!tool_structuration.isOrContains(sel.getRangeAt(i).commonAncestorContainer, el)) {
						return false;
					}
				}
				return true;
			}
		} else if ( (sel = document.selection) && sel.type != "Control") {
			return tool_structuration.isOrContains(sel.createRange().parentElement(), el);
		}
		return false;
	}//end elementContainsSelection



	/**
	* FIX_VALID_SELECTION
	* pseudo method to have start point of selection correction. NO used really for now
	* solved with body = unselectable text
	*/
	this.fix_valid_selection__PSEUDO_CODE = function() {

		var ref_range = document.createRange();
		ref_range.selectNode(document.getElementsByTagName('p')[0]);

		onmouseup = function(e){
		var selection = window.getSelection();
			var range = selection.getRangeAt(0);
				
		   var   compare_start = range.compareBoundaryPoints(range.START_TO_START , ref_range);
			var   compare_end = range.compareBoundaryPoints(range.END_TO_END , ref_range);
			  
			  if (compare_start === -1){
						 console.log(compare_start)
				   range.setStart(ref_range.startContainer,ref_range.startOffset)
			  }
					if (compare_end === 1){
						 console.log(compare_end)
				   range.setEnd(ref_range.endContainer,ref_range.endOffset)
			  }
		};
	};//end fix_valid_selection



	/**
	* SELECT_AREA
	* Reset all other areas and select current
	*/
	this.select_area = function(el, event, wrapper_id) {

		this.remove_fake_caret()

		var text_preview = this.get_tool_text_preview(wrapper_id)	//document.getElementById(wrapper_id).querySelector('#text_preview')

		if (event) {
			//event.preventDefault()
			event.stopPropagation() // WARNING !! REVIEW THIS DESACTIVE OPTION 16-05-2017 (to enable cater on all elements)

			// Set caret
			tool_structuration.set_caret(event);
		}
		
		// make global container unselectable
			//if(el===text_preview) {
			if(el.id == "text_preview") {
					alert("1");
				// make current selected element, selectable
				text_preview.classList.remove('text_unselectable')
				text_preview.classList.add('text_selectable','text_active')	
			}else{
				text_preview.classList.remove('text_selectable','text_active')
				text_preview.classList.add('text_unselectable')
			}			

		// iterate all section elements
		var section_elements = text_preview.getElementsByTagName('section')
			//console.log(section_elements)
			var len = section_elements.length
			for (var i = len - 1; i >= 0; i--) {
				if (section_elements[i]===el) {
					// make current selected element, selectable
					el.classList.remove('text_unselectable')
					el.classList.add('text_selectable','text_active')	
				}else{
					section_elements[i].classList.remove('text_selectable','text_active')
					section_elements[i].classList.add('text_unselectable')		
				}
			}
			//el.classList.remove('text_unselectable')
			//el.classList.add('text_selectable','text_active')


		// LANG FAST SWITCH ADDONS
			var wrapper = component_common.get_wrapper_from_element(text_preview)
			// Set lang again. Prevents text area fast witch lang updates
			this.lang 				 = wrapper.dataset.lang
			this.original_lang_label = wrapper.dataset.lang_label || this.original_lang_label


		// Show fragment info
		this.fragment_info(el, this.component_tipo, this.section_id, this.section_tipo, this.lang, wrapper_id)
	
	};//end select_area



	/**
	* CREATE_AREA
	* Inserts a new tag section in text around selected text and save result to db
	* @return js promise
	*/
	this.selected_section = null
	this.create_area = function(button_obj, evt, wrapper_id) {

		var self = this;

		// ignore wrapper_id (when lang changes, is not valid..)
		//wrapper_id = undefined
		let wrapper = this.get_tool_text_area_wrapper()
		wrapper_id = wrapper.id

		// Select text container
		var text_preview = this.get_tool_text_preview(wrapper_id) //document.getElementById(wrapper_id).querySelector('#text_preview')
			//console.log("[tool_structuration:create_area] text_preview",text_preview); return;
		
		// Clean info log div
		let tool_info_log = document.getElementById('tool_info_log')
			tool_info_log.innerHTML = ""

		let valid_selection = this.elementContainsSelection(text_preview)
			if (valid_selection===false) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_structuration:create_area] Invalid selection area catched. Create area process is stopped");
				}
				tool_info_log.innerHTML = "<span class=\"warning\">Invalid selection area [create_area]</span>"
				if(SHOW_DEBUG===true) {
					console.log( "[tool_structuration:create_area] Selected text: ", window.getSelection().toString() )
				}				
				return false;
			}else{
				tool_info_log.innerHTML = "Ok. Valid selection area [create_area]"
			}		

		var selObj = document.getSelection()
			//console.log(selObj)

			var selectedText = selObj.toString();
			if (selectedText.length<=1) {
				tool_info_log.innerHTML = "Invalid selection area. Select at least 2 chars [create_area]"
				return false;
			}

		var rg = selObj.getRangeAt(0)
			//console.log(rg)

			var last_tag_id = component_text_area.get_last_tag_id(text_preview, 'struct')
			var new_id 		= ++last_tag_id

		// Create new DOM element
		var div = document.createElement("section")
			div.classList.add('section_struct','text_unselectable') // 
			div.id = 'section_'+ new_id
			div.dataset.state 	= 'n'
			div.dataset.tag_id 	= new_id
			div.dataset.label 	= 'struct '+new_id
			div.dataset.data  	= ''
			//div.contentEditable = false
			
			// Click event of section tag
			div.addEventListener("mouseup", function(e){
				self.select_area(this, e)				
			},false)

		var html_content = rg.extractContents() 
			div.appendChild( html_content )			

		// Remove current selection (data is already copied into new div element)
		rg.deleteContents()

		// Insert extra blank space after
		rg.collapse(false);
		let after_element = document.createTextNode( '\u00A0' ) //document.createElement("br")
		rg.insertNode( after_element ) // &nbsp; document.createTextNode("<br>")

		// Insert created node and contents in same range position
		rg.collapse(true)
		rg.insertNode(div)
		
		



		// Fix selected section on click
		self.selected_section = div			

		// Create record associated	in DB
		return self.create_new_struct(new_id, wrapper_id) // is js_promise
	};//end create_area



	/**
	* CREATE_NEW_STRUCT
	* Insert new record 'struct' in table matrix_structurations and inject locator in 
	* selected tag section dataset
	* @return js promise
	*/
	this.create_new_struct = function(new_id, wrapper_id) {
		//console.log(new_id)

		var self = this;

		const trigger_vars = {
				mode		: 'create_new_struct',
				tag_id		: new_id,
			}
		//console.log(trigger_vars); return

		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_structuration.create_new_struct] response",response);
				}
					
				if (response===null) {
					alert("Error on create_new_struct record (null). Maybe your structuration table is not ready or you don't have permission to create records here. See server log to obtain more details")
				}else{
					// SECTION : Update data container in section tag
					self.update_tag_section_data(new_id, response.result, wrapper_id)	

					// Fix as new record
					self.is_new_record = true

					self.remove_fake_caret()
				}			
			})

		return js_promise
	};//end create_new_struct



	/**
	* UPDATE_TAG_SECTION_DATA
	* Inject data in dataset of tag
	* @return bool
	*/
	this.update_tag_section_data = function(tag_id, data, wrapper_id) {

		// Selects tag section in text_editor
		var text_preview 	= this.get_tool_text_preview(wrapper_id) //document.getElementById(wrapper_id).querySelector('#text_preview')
		var id 				= 'section_' + tag_id
		var section_tag 	= text_preview.querySelector('#'+id)
		//var section_tag = document.getElementById(id)

		if (!section_tag) {
			return alert("Error on select section tag "+id)
		}
		
		data = JSON.stringify(data)
				// Format data Important !!
				data = replaceAll('"', '\'', data);
		
		// Inject dataset
		section_tag.dataset.data = data
		//console.log(section_tag)

		// Save content (note that second argument is reload_on_save=false)
		this.save_structuration_text(null, false)

		// Select in dom
		this.select_area(section_tag, null) // , event

		return true
	};//end update_tag_section_data



	/**
	* SAVE_STRUCTURATION_TEXT
	* Alias of component_text_area Save()
	* @return js promise
	*/
	this.update_titles_on_save = true
	this.save_structuration_text = function(button_obj, reload_on_save, wrapper_id) {

		let self = this;

		// Reload content on save
		if (typeof(reload_on_save)=="undefined" || typeof(reload_on_save)!="boolean") {
			reload_on_save = true // Default is true
		}
		component_text_area.set_reload_on_save(reload_on_save)

		// Fix content_is_changed
		component_text_area.set_content_is_changed(true)

		// Select text_preview element (component_obj)
		//var wrapper_obj   = document.getElementById(wrapper_id)		
		//var component_obj = wrapper_obj.querySelector("#text_preview")
		let component_obj = self.get_tool_text_preview(wrapper_id)
		let tool_info_log = document.getElementById('tool_info_log')
		
		let js_promise = component_text_area.Save(component_obj, null, null).then(function(){							

				tool_info_log.innerHTML = "Saved " 

				// Reset to default state
				self.update_titles_on_save = true 
		
				/*
				//if (tool_structuration.tags_vissible!==true) {
					tool_structuration.tags_vissible=true
					tool_structuration.toggle_tags(null)
				//}	*/
				if (self.tags_vissible!==true) {
					self.tags_vissible=true
					setTimeout(function(){						
						self.toggle_tags(null)						
					},100)
				}				
			})

		return js_promise;		
	};//end save_structuration_text



	/**
	* REMOVE_AREA
	* Delete selected area (section tag) (not content) and save updated text (transcription) to db
	* Struct notes are not deleted anytime
	* @return bool
	*/
	this.remove_area = function(button_obj) {

		var self = this

		// tool_structuration_delete_icon action
		if (self.lang!==self.original_lang) {
			alert("Opss. Yo can't delete chapter from non source lang (" + self.original_lang_label +" "+ self.original_lang +")");
		}
		

		let tool_info_log = document.getElementById('tool_info_log')
			tool_info_log.innerHTML = ""

		var text_preview = self.get_tool_text_preview()

		var selected_element = text_preview.getElementsByClassName('text_active')[0]
			if (selected_element) {

				// Remove header h2
				var h2   = selected_element.getElementsByTagName('h2')[0]
				if (h2) {
					var label_obj = h2.getElementsByClassName('title')[0];
					var title 	  = typeof(label_obj)!=="undefined" ? label_obj.innerHTML : "No title"
				}
				if (typeof title==="undefined") { title='No title.' }
				if (!confirm( get_label.esta_seguro_de_borrar_este_registro + "\n\n" + title + "\n")) return false;

				if (h2) {
					/*
					var span  = h2.getElementsByTagName('span')[1]
					var title = span ? span.innerHTML : "No title"				
					if (!confirm( get_label.esta_seguro_de_borrar_este_registro + "\n\n" + title + "\n")) return false;					
					*/
					// Removes current is exists (avoid duplicate on update)				
					h2.remove()					
				}				

				if (selected_element.tagName==='SECTION') {

					// Deletes tag in db and related indexations
					self.delete_tag(selected_element).then(function(){
						
						// Replace selected section by his contents
						component_text_area.unwrap_element(selected_element)

						// Save content
						//self.save_structuration_text()

						tool_info_log.innerHTML = "Removed area"

						// Updates fragment info
						var wrap_div = document.getElementById('indexation_page_list')
						// Delete wrap contents		
						while (wrap_div.firstChild) wrap_div.removeChild(wrap_div.firstChild)	

					})									
					
					return true
				}
			}else{
				tool_info_log.innerHTML = "Invalid selection area [remove_area]"
			}

		return false
	};//end remove_area



	/**
	* GET_PARENT_SECTION
	* @return 
	*/
	this.get_parent_section = function(range) {
		
		console.log(range)
	};//end get_parent_section	



	/**
	* CHANGE_SECTION_TAG_STATE
	* @param object select_obj
	*/
	this.change_section_tag_state = function (select_obj, wrapper_id) {

		// Note: 'this.tag_obj' is fixed in text_editor when user makes click on image element
		var tag_obj 		= this.tag_obj		
		var	current_state 	= this.tag_obj.dataset.state		
		var related_tipo 	= this.component_tipo		
	
		// Get new state from select
		var	new_state 		= select_obj.value
			//console.log("tag_id:"+tag_id+" - current_state:"+current_state+" - new_state:"+new_state);
			if (!new_state) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_structuration:change_section_tag_state] Value not changed, Stoped save");
				}
				return false;
			}

		var new_data_obj = {
			state : new_state
		}

		// SYNC_CLASS_TO_STATE
		tag_obj.dataset.state = new_state		
		text_editor.sync_class_to_state(tag_obj)

		// UPDATE_TITLES_ON_SAVE
		tool_structuration.update_titles_on_save = false

		// RELOAD_ON_SAVE
		component_text_area.reload_on_save = false

		// Save content (note that second argument is reload_on_save=false)
		return this.save_structuration_text(null, false, wrapper_id)

		// Select in dom
		//this.select_area(tag_obj, null) // , event
	}//end change_section_tag_state



	/**
	* FRAGMENT_INFO
	* Loads all fragment information in a container below the text editor 
	* for change tag state, delete tag or add indexation terms
	*/
	this.fragment_info = function(tag_obj, tipo, parent, section_tipo, lang, wrapper_id) {
		//console.log(tag_obj+", "+tipo+", "+parent+", "+section_tipo+", "+lang)

		var self = this;

		// Target div container element
		var wrap_div = document.getElementById('indexation_page_list')	

		if (!tag_obj.dataset || typeof tag_obj.dataset.tag_id==="undefined" ) {
			// Delete wrap contents		
			while (wrap_div.firstChild) wrap_div.removeChild(wrap_div.firstChild);
			return false;
		}

		// Fix vars
		self.fix_tool_vars(tag_obj, tipo, parent, section_tipo, lang)

		if (!wrapper_id) {
			let text_area_wrapper = self.get_tool_text_area_wrapper()
			wrapper_id = text_area_wrapper.id
		}
		

		// Target div container element
		var wrap_div = document.getElementById('indexation_page_list')

		const trigger_vars = {
				mode 		 	: 'fragment_info',
				section_tipo 	: self.section_tipo,
				section_id 	 	: self.section_id,
				component_tipo  : self.component_tipo,
				tag_id 	 		: self.tag_id,
				lang 		 	: self.lang,
				data 			: tag_obj.dataset.data
			}
		//console.log(trigger_vars); return;

		html_page.loading_content( wrap_div, 1 );

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_structuration.fragment_info] response:",response)
				}

				if (response===null) {

					console.error("[tool_structuration:fragment_info] Error. null is received as response. An error has ocurred. See the log for more info");

				}else if (response.result!==false) {

					// Clean wrap_div
					if(wrap_div) {
						while (wrap_div.firstChild) {
							wrap_div.removeChild(wrap_div.firstChild);
						}
					}

					// Tag info
					let data =  {
						tag_label 				: get_label.etiqueta + " " + tag_obj.dataset.label,
						tag_options 			: {
													n : get_label.etiqueta_normal,
													d : get_label.etiqueta_borrada,
													r : get_label.etiqueta_revisar
												  },
						tag_options_selected	: tool_structuration.tag_obj.dataset.state,
						tipo 					: tool_structuration.component_tipo,
						section_tipo 			: tool_structuration.section_tipo,
						parent 					: tool_structuration.section_id,
						lang 					: tool_structuration.lang,
						tag 					: tool_structuration.tag,
						rel_locator 			: tool_structuration.locator,
						terminos_list_title 	: get_label.descriptores,
						selected_fragment_text 	: response.fragment_text,
						info_notes 				: response.struct_notes,
						wrapper_id 				: wrapper_id,
					}
					Promise.resolve( tool_structuration.build_fragment_info(data, wrap_div) ).then(function(res){

						// Term list
						var ul = tool_structuration.build_term_list(response.indexations_list)
						
						// Clean and update terminos_list container
						var terminos_list_container = document.getElementById("terminos_list_container")
						if(terminos_list_container) {
							var myNode = terminos_list_container; while (myNode.firstChild) {
								myNode.removeChild(myNode.firstChild);
							}
							terminos_list_container.appendChild(ul)
						}
						// select_tab_active
						section_tabs.select_tab_active()

						// focus title field
						if(tool_structuration.is_new_record===true) {
							var indexation_page_list = document.getElementById('indexation_page_list')
							var title_fields = indexation_page_list.getElementsByClassName('css_input_text')
							if (title_fields) {
								title_fields[0].focus()
							}
							tool_structuration.is_new_record = false
						}									
						
					})
				}
				html_page.loading_content( wrap_div, 0 );
			});


		return js_promise
	};//end fragment_info



	/**
	* LOAD_INSPECTOR_INDEXATION_LIST
	* Loads tag indexations list in inspector when in modo "edit"
	*/
	this.load_inspector_indexation_list = function(tag_obj, tipo, parent, section_tipo, lang) {

		// Fix vars
		this.fix_tool_vars(tag_obj, tipo, parent, section_tipo, lang)

		const trigger_vars = {
				mode 		 	: 'indexations_list',
				section_tipo 	: this.section_tipo,
				section_id 	 	: this.section_id,
				component_tipo  : this.component_tipo,
				tag_id 	 		: this.tag_id,
				lang 		 	: this.lang
			}
		//return console.log(trigger_vars);

		var target_div = document.getElementById('inspector_indexations');

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) console.log(response)

				if (response.result!==false) {

					// Inspector label
					var label = document.createElement("div")
						label.classList.add("terminos_list_title")
					var t = document.createTextNode(get_label.etiqueta+" "+tool_structuration.tag_id)
						label.appendChild(t)

					// Term list
					var ul = tool_structuration.build_term_list(response.indexations_list)
					
					// Clean and update terminos_list container
					var terminos_list_container = document.getElementById("inspector_indexations")
					var myNode = terminos_list_container; while (myNode.firstChild) {
						myNode.removeChild(myNode.firstChild);
					}

					terminos_list_container.appendChild(label)
					terminos_list_container.appendChild(ul)
				}
			})

		return js_promise
	};//end load_inspector_indexation_list



	/**
	* BUILD_FRAGMENT_INFO
	* @return 
	*/
	this.build_fragment_info = function( data, div ) {
		if (!div) {
			var div = document.createElement('div')
		}
		//return console.log("[tool_structuration.build_fragment_info] data",data);

		var self = this

		// Common line
		var common_line = document.createElement('div')
			common_line.classList.add('common_line')

		var fragment_info = document.createElement('div')
				fragment_info.classList.add('fragment_id_info')
				fragment_info.appendChild(document.createTextNode(data.tag_label))
				// Add element
				common_line.appendChild(fragment_info)

			var wrap_tag_state_selector = document.createElement('div')
				wrap_tag_state_selector.classList.add('wrap_tag_state_selector')				
				wrap_tag_state_selector.appendChild( document.createTextNode(get_label.estado) )

				var select = document.createElement('select')
					select.classList.add('tag_state_selector')				
					//Create and append the options
					for(var k in data.tag_options){
						var option = document.createElement("option");
						option.value = k;
						option.text = data.tag_options[k];
						if(k===data.tag_options_selected) option.selected = true
						select.appendChild(option);
					}
					select.addEventListener("change", function(e){
						//this.dataset.tag = tool_structuration.tag
						tool_structuration.change_section_tag_state(this, data.wrapper_id)
					})

				wrap_tag_state_selector.appendChild(select)

				// Add element
				common_line.appendChild(wrap_tag_state_selector)
	
			if (self.lang===self.original_lang) {
			let div_delete_tag = document.createElement('div')
				div_delete_tag.classList.add("div_delete_tag","hide_on_not_source")

				let icon_delete_tag = document.createElement('div')
					icon_delete_tag.classList.add("icon_bs","tool_structuration_delete_icon","link")				
					icon_delete_tag.title = "Delete selected chapter"
					icon_delete_tag.addEventListener("click", function(e){
						tool_structuration.remove_area(this)
					})
				div_delete_tag.appendChild(icon_delete_tag)	

				let label = document.createElement('label')					
					label.appendChild( document.createTextNode("Delete chapter") )
				
				div_delete_tag.appendChild(label)

				// Add element
				common_line.appendChild(div_delete_tag)
			}

		// Add element
		div.appendChild(common_line)		

		// Tabs
		var radio_1 = document.createElement('input')
			radio_1.type 	= "radio"
			radio_1.id 		= "section_tab_1"
			radio_1.name 	= "tabs"			
			radio_1.checked = true
			radio_1.addEventListener("click", function(e){
				section_tabs.set_tab_active(this)
			})
			var radio_1_label = document.createElement('label')
				radio_1_label.htmlFor = radio_1.id
				radio_1_label.appendChild( document.createTextNode( get_label.indexacion) )

		var radio_2 = document.createElement('input')
			radio_2.type 	= "radio"
			radio_2.id 		= "section_tab_2"
			radio_2.name 	= "tabs"			
			//radio_2.checked = true
			radio_2.addEventListener("click", function(e){
				section_tabs.set_tab_active(this)
			})
			var radio_2_label = document.createElement('label')
				radio_2_label.htmlFor = radio_2.id
				//radio_2_label.appendChild( document.createTextNode( (get_label.info || 'Info') + " (" +this.original_lang_label +")" ) )
				radio_2_label.appendChild( document.createTextNode( (get_label.info || 'Info') + " (" +this.lang +")" ) )
			
			// Add element
			div.appendChild(radio_2)
			div.appendChild(radio_2_label)
			// Add element
			div.appendChild(radio_1)
			div.appendChild(radio_1_label)

		var tab_1 = document.createElement('section')
			tab_1.id = "section_tab_1_content"
			tab_1.classList.add("section_tab")
			// Add element
			div.appendChild(tab_1)
			

			var icon_show_fragment = document.createElement('div')
				icon_show_fragment.classList.add("icon_bs","tool_structuration_show_fragment","link")

				icon_show_fragment.addEventListener("click", function(){
					tool_structuration.toggle_selected_fragment(this)
				})

				// Add element
				tab_1.appendChild(icon_show_fragment)

			var selected_fragment = document.createElement('div')
				selected_fragment.classList.add("selected_fragment")		
				selected_fragment.innerHTML = data.selected_fragment_text // use innerHTML to parse the html content

				// Add element
				tab_1.appendChild(selected_fragment)

			var terminos_list = document.createElement('div')
				terminos_list.classList.add("terminos_list")

				var terminos_list_title = document.createElement('div')
					terminos_list_title.classList.add("terminos_list_title")

					var t = document.createTextNode(data.terminos_list_title)
					terminos_list_title.appendChild(t)

				var terminos_list_container = document.createElement('div')
					terminos_list_container.id = "terminos_list_container"

					terminos_list.appendChild(terminos_list_container)

				// Add element
				tab_1.appendChild(terminos_list)


		var tab_2 = document.createElement('section')
			tab_2.id = "section_tab_2_content"
			tab_2.classList.add("section_tab")	
			// Add element
			div.appendChild(tab_2)			
		
			if (data.info_notes && data.info_notes.html) {
				var notes = document.createElement("div")
					notes.innerHTML = data.info_notes.html
					setTimeout(function() {
						exec_scripts_inside(notes)
					},10)				
					
					// Add element
					tab_2.appendChild(notes)
			}else{
				/*
				var button_add_note = document.createElement('button')
					button_add_note.classList.add("btn","btn-default")
					button_add_note.addEventListener("click", function(e){
						tool_structuration.new_index_data_record(this, e)
					})

					var span = document.createElement('span')
						//span.classList.add("glyphicon","glyphicon-plus-sign")
						//span.setAttribute("aria-hidden", true)
						span.appendChild( document.createTextNode(get_label.nuevo) )
					button_add_note.appendChild(span)
					// Add element
					tab_2.appendChild(button_add_note)*/
				var notes = document.createElement("div")
					notes.appendChild( document.createTextNode("Sorry. No record was created. Please review your permissions for struct info notes section (rsc370)") )
					// Add element
					tab_2.appendChild(notes)
			}
			//console.log(div);	

		return div
	};//end build_fragment_info



	/**
	* BUILD_TERM_LIST
	* @return 
	*/
	this.build_term_list = function(result) {

		var ul = document.createElement('ul')
								
		var len = result.length
		for (var i = 0; i < len; i++) {
			var element = result[i]
			
			if (page_globals.modo==='tool_structuration') {
	
				// Delete icon
				var icon = document.createElement('div')
					icon.classList.add('icon_bs','tool_structuration_delete_icon','link')
					icon.dataset.tipo  			= element.locator.from_component_tipo
					icon.dataset.section_tipo  	= element.section_tipo
					icon.dataset.section_id  	= element.section_id
					icon.dataset.term  			= element.term
					icon.dataset.locator 		= JSON.stringify(element.locator)

					// Click delete action
					icon.addEventListener("click", function (event) {
						tool_structuration.remove_index(this)
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
	this.delete_tag = function(button_obj) {

		var self = this;

		// tool_structuration_delete_icon action
		if (self.lang!==self.original_lang) {
			alert("Opss. Yo can't delete tag from non source lang (" + self.original_lang_label +" "+ self.original_lang +")");
			return false;
		}

		// Confirm action
		//if( !confirm( get_label.eliminar_etiqueta + "\n\n "+ tool_structuration.tag_id +"\n\n") )  return false;
		if( !confirm( get_label.atencion + "!! \n" + get_label.borrara_la_etiqueta_seleccionada ) )  return false;

		const trigger_vars = {
				mode 		 	: 'delete_tag',
				section_tipo 	: tool_structuration.locator.section_tipo,
				section_id 	 	: tool_structuration.locator.section_id,
				component_tipo  : tool_structuration.locator.component_tipo,
				tag_obj 		: tool_structuration.tag_obj,
				tag_id  		: tool_structuration.locator.tag_id,
				locator 	 	: tool_structuration.locator,
				lang 			: tool_structuration.lang
			}
		//return console.log(trigger_vars)

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) console.log(response)

				if (!response || response.result!==true) {

					alert("Error on remove tag: "+ tool_structuration.locator.tag_id)

				}else{
					
					//tool_structuration.tag_obj = null;
					//tool_structuration.update_view(null)
				}
			})

		return js_promise		
	};//end delete_tag



	/**
	* ADD_INDEX
	* @return 
	*/
	this.add_index = function(section_id, section_tipo, label, wrapper_id) {

		var self = this;

		// tool_structuration_delete_icon action
		if (self.lang!==self.original_lang) {
			alert("Opss. Yo can't add index from non source lang (" + self.original_lang_label +" "+ self.original_lang +")");
			return false;
		}

		if(typeof this.locator==='undefined') {
			alert(" Please select a tag before indexing! " );
			return false
		}		

		let container = document.getElementById('terminos_list_container')
			if (!container) {
				console.log("[tool_structuration:add_index] Error on locate div container terminos_list_container")
				return false
			}

		const trigger_vars = {
				mode 		 	: 'add_index',
				section_id 	 	: section_id,
				section_tipo 	: section_tipo,
				label 		 	: label,
				locator	 	 	: JSON.stringify(this.locator)
			}
		//console.log(trigger_vars); return;

		html_page.loading_content( container, 1 );

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) console.log(response)

				/*
				// Clean and update container
				var myNode = container; while (myNode.firstChild) {
					myNode.removeChild(myNode.firstChild);
				}
				//container.appendChild(ul)
				*/

				if (!response || response.result!==true) {
					console.log("Error on add index term: "+ label)
				}else{
					/**/
					// Refresh fragment_info
					// tagName, tipo, parent, section_tipo, lang
					tool_structuration.fragment_info(tool_structuration.tag_obj,
												  tool_structuration.component_tipo,
												  tool_structuration.section_id,
												  tool_structuration.section_tipo,
												  tool_structuration.lang,
												  wrapper_id)
												  
				}
				html_page.loading_content( container, 0 );
			})

		return js_promise
	};//end add_index



	/**
	* REMOVE_INDEX_V4
	* @return 
	*/
	this.remove_index = function(button_obj) {

		var self = this;

		// tool_structuration_delete_icon action
		if (self.lang!==self.original_lang) {
			alert("Opss. Yo can't remove index from non source lang (" + self.original_lang_label +" "+ self.original_lang +")");
			return false;
		}

		// Confirm action
		var msg = html2text("Remove indexation ?\n" + button_obj.dataset.term + " ["+button_obj.dataset.section_tipo+"-"+button_obj.dataset.section_id+"]");
			if( !confirm(msg) ) return false;


		let text_area_wrapper = self.get_tool_text_area_wrapper()
		var wrapper_id = text_area_wrapper.id		

		const trigger_vars = {
				mode 		 	: 'remove_index',
				section_tipo 	: button_obj.dataset.section_tipo,
				section_id 	 	: button_obj.dataset.section_id,
				component_tipo  : button_obj.dataset.tipo,
				term  			: button_obj.dataset.term,
				locator 	 	: button_obj.dataset.locator
			}

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_structuration.remove_index] response",response)
				}

				if (!response || response.result!==true) {

					alert("Error on remove index term: "+ button_obj.dataset.term)

				}else{
					// Refresh fragment_info // tagName, tipo, parent, section_tipo, lang
					self.fragment_info( tool_structuration.tag_obj,
										tool_structuration.component_tipo,
										tool_structuration.section_id,
										tool_structuration.section_tipo,
										tool_structuration.lang,
										wrapper_id)
				}
			});

		return js_promise
	};//end remove_index_v4



	/**
	* TOGGLE_SELECTED_FRAGMENT
	*/
	this.toggle_selected_fragment = function( button_obj ) {
		$(button_obj).next('.selected_fragment').toggle();		
	};



	/**
	* UPDATE_TOP_ID
	* Update value of global page_globals.top_id on change selector value
	*/
	this.update_top_id = function(select_obj) {

		var value = select_obj.value

		if (value) {
			page_globals.top_id = value;
			//if (DEBUG) console.log("[tool_structuration.update_top_id] Updated top_id to:",value);
		}
		return false;
	};//end update_top_id



	/**
	* TOGGLE_TAGS
	* @return 
	*/
	this.tags_vissible = true
	this.toggle_tags = function(button) {
	
		if (!button) {
			if(SHOW_DEBUG===true) {
				console.log("[tool_structuration.toggle_tags] ERROR button is null:",button)
			}
			return false;
		}
		var text_preview = this.get_tool_text_preview()
		
		var ar_elements = text_preview.querySelectorAll('.index, .tc, .person, .page, .geo, .svg') // .note,
		var len = ar_elements.length
		//console.log(ar_elements);

		if (this.tags_vissible!==true) {
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = ''
			}
			this.tags_vissible = true
			text_preview.contentEditable = true
			this.remove_fake_caret()
			button.classList.add("button_border_active")
		}else{
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = 'none'
			}
			this.tags_vissible = false
			text_preview.contentEditable = false
			button.classList.remove("button_border_active")
		}

		return true
	};//end toggle_tags



	/**
	* FIX_HEIGHT
	*/
	this.fix_height = function(wrapper_id) {

		if (page_globals.modo!=='tool_structuration') {
			return false;
		}

		let text_preview = this.get_tool_text_preview(wrapper_id)	//document.getElementById(wrapper_id).querySelector('#text_preview')
		if (!text_preview) {
			// Try resolve wrapper_id
			text_preview = this.get_tool_text_preview()
			if(SHOW_DEBUG===true) {
				//console.log("[tool_structuration.fix_height] trying resolve text_preview without wrapper_id ",text_preview);
			}
		}
		if (text_preview) {			
			let current_height = window.innerHeight
			text_preview.style.height = (current_height -340) +45 +'px';
			//document.getElementById('text_preview').style.height = (current_height -340) +45 +'px';	
		}			
	};//end fix_height



	/**
	* SET_CARET
	* @return 
	*/
	this.set_caret = function(e) {
	
		// Remove existing caret
		this.remove_fake_caret()

		if (this.tags_vissible === true) {
			return false;
		}

		var selObj 	 = window.getSelection();
			if(SHOW_DEBUG===true) {
				console.log("Called set_caret with type: " + selObj.type);	
			}
			if (selObj.type!=='Caret') {
				return false;
			}

		// Create range from selection
		var selRange = selObj.getRangeAt(0);

		var selected_node = selRange.startContainer.parentNode.nodeName
			if (selected_node==='REFERENCE') {
				return false;
			}

		// Insert caret
		var caret = document.createElement("caret")
			caret.classList.add("text_caret","blink")

			setTimeout(function(){
				selRange.insertNode(caret)
			}, 0)		

		return false;

		/*
		// Get range data from click event
		var range_data = this.get_range_data_from_click(e)

		if (range_data.textNode.parentNode.nodeName==="SPAN" 
			|| range_data.textNode.parentNode.nodeName==="HEADER" 
			|| range_data.textNode.parentNode.nodeName==="H2"
			|| range_data.textNode.parentNode.nodeName==="LABEL") {
			console.log("Ignored caret point");
			return false;
		}	
		
		var caret = document.createElement("caret")
			//caret.id = 'caret'
			caret.classList.add("text_caret","blink")


		// only split TEXT_NODEs
		if (range_data.textNode.nodeType == 3) {
			var replacement = range_data.textNode.splitText(range_data.offset);			
			range_data.textNode.parentNode.insertBefore(caret, replacement);
		}else{
			range_data.range.insertNode(caret); // No standard
		}
		*/
	};//end set_caret



	/**
	* REMOVE_FAKE_CARET
	* @return 
	*/
	this.remove_fake_caret = function(target) {

		//var target_obj = target || document
		let target_obj = document
	
		// REMOVE TEMPORAL TAG (FAKE CARET)
		let temp_elements = target_obj.getElementsByTagName('caret')
		const len = temp_elements.length
			for (let i = len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}
	};//end remove_fake_caret



	/**
	* AV_EDITOR_KEY_UP : CAPTURE AND MANAGE KEYBOARD EVENTS
	*/
	this.av_editor_key_up = function(e) {

		// MODO : Only 'tool_structuration' is used
		if(page_globals.modo!='tool_structuration') return;

		//if(SHOW_DEBUG===true) console.log('->tool structuration av_editor_key_up:videoPlay ed.onKeyUp: '+e.keyCode);

		try{
			switch(e.keyCode) {
				//case 27 : 	// Key ESC(27) llamamos a la función de control de video / rec. posición TC
				case parseInt(videoFrame.av_media_player_play_pause_key) :
					component_text_area.videoPlay(e);
					if(SHOW_DEBUG===true) console.log('->tool structuration av_editor_key_up:videoPlay ed.onKeyUp: '+e.keyCode);
					break;
			}
		}catch(e){
			if(DEBUG) console.log(e)
		}
	};//end av_editor_key_up



	/**
	* AV_EDITOR_KEY_UP : CAPTURE AND MANAGE KEYBOARD EVENTS
	*/
	this.av_editor_key_down = function(e) {

		// MODO : Only 'tool_structuration' is used
		if(page_globals.modo!='tool_structuration') return;

		//if(SHOW_DEBUG===true) console.log('->tool structuration av_editor_key_up:videoPlay ed.onKeyDown: '+e.key);

		try{
			switch(e.key) {
			case '<' :
					//e.insertContent("[")
					e.preventDefault();
					var endTextNode = document.createTextNode('[');

					var selection = window.getSelection();
					var range = selection.getRangeAt(0);
						//range.collapse(false);
						range.insertNode(endTextNode)
					alert("Warning! This key is reserved and will be replaced for safe char. Key: " + e.key);
					break;

			case '>' :
					//e.insertContent("[")
					e.preventDefault();
					var endTextNode = document.createTextNode(']');

					var selection = window.getSelection();
					var range = selection.getRangeAt(0);
						
						range.insertNode(endTextNode)
					alert("Warning! This key is reserved and will be replaced for safe char. Key: " + e.key);
					break;
				}


				}catch(e){
			if(DEBUG) console.log(e)
		}
	};//end av_editor_key_up



	/**
	* SELECT_TAG
	* @return 
	*/
	this.select_tag = function(tag_id, wrapper_id) {

		// Selects wrapper	
		var text_preview = this.get_tool_text_preview(wrapper_id) //wrapper.querySelector('#text_preview')

		var tag_obj 	 = text_preview.querySelector('section[data-tag_id="'+tag_id+'"]')
		if (tag_obj) {
			this.select_area(tag_obj, null, wrapper_id)	

			// Scrool to element
			let topPos = tag_obj.offsetTop;
			text_preview.scrollTop = topPos -50;
		}
		

		return true
	};//end select_tag



	/**
	* FAST_SWITCH_LANG
	* @return 
	*/
	this.fast_switch_lang = function(selector_obj) {

		// Exec standard component switch
		var js_promise = component_common.fast_switch_lang(selector_obj)

		var text_preview = this.text_preview
		return true		
	};//end fast_switch_lang



	/**
	* PLACE_BROKEN_TAG_IN_APROXIMATE_POSITION
	* @return 
	*/
	this.place_broken_tag_in_aproximate_position = function(button_obj) {
		var target_lang_container = this.get_tool_text_preview()
		
		// DELETED TAGS
		// Get current tags with state "deleted" (d)
		let deleted_tags = target_lang_container.querySelectorAll("section[data-state=\"d\"]")
			//console.log("deleted_tags",deleted_tags);

		const trigger_vars = {
				mode 		 	: 'get_source_dato_lang',
				section_tipo 	: this.section_tipo,
				section_id 	 	: this.section_id,
				component_tipo  : this.component_tipo,
				lang 		 	: this.lang
			}

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) console.log(response)

				if (response.result!==false) {

					// Inspector source_lang_container
					var source_lang_container = document.createElement("div")
					source_lang_container.innerHTML = response.result
						console.log(source_lang_container);
			
					deleted_tags.forEach(function(deleted_tag){
						//console.log(deleted_tag);
						let curent_id = deleted_tag.id
						let source_element 				= source_lang_container.querySelector('#'+curent_id)
						let source_reference_element 	= source_element.previousElementSibling
						
						let ar_text =[]
						var current = source_reference_element.nextSibling
						while(current.id !== source_element.id){
							 ar_text.push( current)
							 current =  current.nextSibling
						}

						let scr_text_between 			= source_reference_element.nextSibling

						let src_element_tag_id 			= source_reference_element.dataset.tag_id
						let src_element_type 			= source_reference_element.dataset.type

						let target_reference_element = target_lang_container.querySelector('[data-tag_id="'+src_element_tag_id+'"][data-type="'+src_element_type+'"]')
						if(target_reference_element !== null){

							target_reference_element.parentNode.insertBefore(deleted_tag, target_reference_element.nextSibling);
								console.log(ar_text);

						}else{

						}

					})
				}
			})
	};//end place_broken_tag_in_aproximate_position



};//end tool_structuration