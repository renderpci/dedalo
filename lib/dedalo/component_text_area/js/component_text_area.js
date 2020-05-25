"use strict";
/**
* COMPONENT TEXT AREA CLASS
*
*/
// Global var. Set when load fragment
/* revisar el uso de estas variables hoy dia */
var selected_rel_locator;
var selected_tag;
var selected_tipo;
var component_text_area = new function() {


	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_text_area/trigger.component_text_area.php';

	/*
	// Prevent bootstrap dialog from blocking focusin
	$(document).on('focusin', function(e) {
		if ($(e.target).closest(".mce-window").length) {
			e.stopImmediatePropagation();
		}
	});
	*/

	// CLASS GLOBAL VARS
	// Fix this values on select elements in text editor
	this.section_tipo
	this.section_id
	this.component_tipo
	this.wrapper_id
	this.lang

	// TAG_OBJ
	// Set on select tag in editor
	this.tag_obj

	// SELECTED_TAG_DATA
	// Set on select tag in editor
	this.selected_tag_data

	/*
	// Current selected obj
	this.selected = {
		section_tipo 	: null,
		section_id 		: null,
		component_tipo 	: null,
		wrapper_id 		: null,
		lang 			: null,
		tag_obj 		: null
	}*/



	/**
	* INIT
	* @return
	*/
	this.inited = false
	this.init = function(data) {

		const self = this

		if(SHOW_DEBUG===true) {
			//console.log("[component_text_area:init] data", data);
		}

		// WRAPPER_OBJ
			// Default
			let id_wrapper  = 'wrapper_' + data.uid
			// Overwrited
			if (typeof data.id_wrapper!=="undefined") {
				id_wrapper  = data.id_wrapper
			}
			data.wrapper_id 	= id_wrapper
			const wrapper_obj 	= document.getElementById(id_wrapper)
				if (!wrapper_obj) {
					// PORTAL_LIST case . In this modo is the portal who launch exc of components javascript code
					if (data.modo!=="portal_list") {
						// Error on find wrapper
						let msg = "[component_text_area:init] ERROR. wrapper_obj not found! ("+id_wrapper+")"
						console.log(msg, "id_wrapper: ",id_wrapper)
						//alert(msg)
					}
					return false
				}

		// TRACK INIT TIME
			// Set dataset init time at wrapper dom object
			let date = new Date();	let time = date.getTime()
			wrapper_obj.dataset.init_time = time
				//console.log(wrapper_obj.dataset);

		// Fix component vars
			self.section_tipo 		= wrapper_obj.dataset.section_tipo
			self.section_id 		= wrapper_obj.dataset.parent
			self.component_tipo 	= wrapper_obj.dataset.tipo
			self.lang 				= wrapper_obj.dataset.lang
			self.wrapper_id 		= id_wrapper //wrapper_obj.dataset.id*/


		// UID for init object tracking (not add lang never here!)
		const init_uid = self.section_tipo +"_"+ self.section_id +"_"+ self.component_tipo

		// Init text editor
		switch(data.modo) {
			case ('portal_list') :
				// Nothing to init
				break;
			case ('tool_structuration') :
				// Init text editor (content editable)
				text_editor.init(data)

				/*
				var text_preview = document.getElementById('text_preview')
				// ACTIVATE_CONTENT_TAGS
					// tool_structuration method is called every time that text_preview div content is ajax updated
					tool_structuration.activate_content_tags(text_preview, wrapper_obj)


				// Re init tool
				//tool_structuration.init({textarea_lang:self.lang})
				*/
				break;
			default:
				// Init tinyMCE editor
				mce_editor.init(data.uid, data.modo, data.propiedades)
		}
		//console.log("self.inited A",self.inited);
		//if( self.inited===false ) {

			// MULTILANG TOOL. Add tool lang multi button
			let component_tools_container = wrapper_obj.querySelector('.component_tools_container')
			if (	component_tools_container===null
				&& (page_globals.modo==='edit' || wrapper_obj.dataset.modo==='edit_note' || page_globals.modo==='list')
				&& wrapper_obj.dataset.lang!=='lg-nolan' ) {

				let tool_button = inspector.build_tool_button({ tool_name	: 'tool_lang_multi',
																label 		: get_label['tool_lang_multi'],
																title 		: get_label['tool_lang_multi'],
																tipo		: wrapper_obj.dataset.tipo,
																parent 		: wrapper_obj.dataset.parent,
																section_tipo: wrapper_obj.dataset.section_tipo,
																lang  		: wrapper_obj.dataset.lang,
																context_name: "tool_lang_multi"
																})

					component_tools_container = document.createElement("div")
					component_tools_container.classList.add('component_tools_container', 'edit_hidden')
					component_tools_container.appendChild(tool_button)

				wrapper_obj.appendChild(component_tools_container)
			}//edn if (page_globals.modo==='edit')

			// TAG PERSONS. load_tags_person on demand
			if (typeof data.load_tags_person!="undefined" && data.load_tags_person==true) {
				// Wait to finish load document before trigger self
				window.addEventListener("load", function (event) {
					self.load_tags_person(null, true);
				})
			}
		//}//end if( inited===false ) {
		//console.log(self);

		self.inited = true


		return true
	}//end init



	/**
	* SET_RELOAD_ON_SAVE
	*/
	this.reload_on_save = true
	this.set_reload_on_save = function(value) {
		this.reload_on_save = value
		if(SHOW_DEBUG===true) {
			console.log("[component_text_area.set_reload_on_save]:", component_text_area.reload_on_save);
		}
	}//end set_reload_on_save



	/**
	* SET_CONTENT_IS_CHANGED
	* @return bool
	*/
	this.content_is_changed = false
	this.set_content_is_changed = function(value) {
		// Set class var
		component_text_area.content_is_changed = value
		if(SHOW_DEBUG===true) {
			console.log("component_text_area.content_is_changed:", component_text_area.content_is_changed);
		}
	}//end set_content_is_changed



	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {

		obj_wrap.classList.add("selected_wrap");

		const text_area = obj_wrap.querySelector("textarea")
		if (text_area && tinyMCE.activeEditor) {
			tinyMCE.get( text_area.id ).focus()

			return true
		}
		/*
		var text_area = $(obj_wrap).find('textarea').first()
		if (text_area.length===1 && tinyMCE.activeEditor) {
			tinyMCE.get( text_area[0].id ).focus()
		}*/

		return false
	}//end select_component



	/**
	* IS_TINY
	* @return bool
	*/
	this.is_tiny = function(ed) {
		if (ed === null || typeof ed !== 'object' || ed.type!='setupeditor') {
			// USING DIV AS EDITOR (LIKE STRUCT)
			var is_tiny = false;
		}else{
			// USING TINYMCE EDITOR
			var is_tiny = true;
		}
		return is_tiny
	}//end is_tiny



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return string dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		let dato = ""

		if (wrapper_obj.dataset.modo==="search") {

			// Value is inside input text
			const input_text  = wrapper_obj.getElementsByTagName('input')[0]

			// Value from input text
			dato = input_text.value

		}else{

			// Search text_preview div
			let text_preview_div = wrapper_obj.querySelector('#text_preview')
			if (text_preview_div) {

				// Text inside div content editable
				dato = text_preview_div.innerHTML

			}else{

				// Get textarea only for get the id of tinyMCE editor
				const textarea  = wrapper_obj.getElementsByTagName('textarea')[0]
				const ed 		= tinyMCE.get(textarea.id)

				// Text from main text editor content instead text area content
				dato = ed.getContent({format : 'raw'});
			}
		}


		return dato
	}//end get_dato



	/**
	* SAVE_TEXT_PREVIEW
	* @return
	*/
	this.save_text_preview = function(editor_obj) {
		/*
		if (this.content_is_changed===false) {
			if(SHOW_DEBUG===true) {
				console.log("Unnecessary save content id Not changed.");
			}
			return false;
		}*/
		/*
		var key = 'text_preview'
		if (localStorage[key] && editor_obj.innerHTML == localStorage[key]) {
			if(SHOW_DEBUG===true) {
				console.log("Unnecessary save content id Not changed.");
			}
			return false;
		}*/

		const component_obj 	= editor_obj //component_common.get_wrapper_from_element(editor_obj)
		const save_arguments 	= null
		const ed 				= null

		// Ser load after save as false
		component_text_area.set_reload_on_save(false)

		let js_promise = this.Save(component_obj, save_arguments, ed)


		return js_promise
	}//end save_text_preview



	/**
	* SAVE
	* Save supports save from tinymce editor and from div like struct
	* @param dom object component_obj
	*	Mandatory. Normally is dom element textarea or text_preview (case tool structuration), but wrapper is accepted too
	* @param object save_arguments
	*	Optional. An json object with all save_arguments. Normally is null to force to calculate in save method
	* @param dom object ed
	*	Optional. Normally is the text editor (tinyMCE object)
	*/
	this.Save = function(component_obj, save_arguments, ed) {

		const self = this

		if (typeof component_obj=="undefined" || !component_obj) {
			console.log("[component_text_area.Save] component_obj",component_obj);
			//console.trace();
		}

		// WRAPPER CASE. Check if component_obj is a wrapper
		const is_wrapper = component_obj.classList.contains('wrap_component');
		if (is_wrapper===true) {
			// Search text_preview div
			const text_preview_div = wrapper.querySelector('#text_preview')
			if (text_preview_div) {
				component_obj = text_preview_div
			}else{
				var textarea  = document.getElementsByTagName('textarea')[0]
				component_obj = textarea
				ed 			  = tinyMCE.get(textarea.id)
			}
		}

		// TEXT AREA . Hidden
		if (component_obj === null || typeof component_obj !== 'object') {
			alert("[component_text_area.Save] Error: component_text_area is empty")
			return false;
		}

		// SAVE ARGUMENTS
		if (save_arguments === null || typeof save_arguments !== 'object') {
			save_arguments = {}
		}


		// TEXT EDITOR OBJECT SELECT FALLBACK
		if (self.is_tiny(ed)===false) {
			// USING DIV AS EDITOR (LIKE STRUCT)
			var is_tiny = false;

			// ISDIRTY . Content has change ?
			if(component_text_area.content_is_changed===false) {
				if(SHOW_DEBUG===true) {
					console.warn("[component_text_area.Save] content_is_changed:", component_text_area.content_is_changed, "Nothing is saved because content_is_changed is false (no changes are detected in editor)");
				}
				return false;
			}

			// Prepare container content
			var container  = component_obj // container is self received div

		}else{
			// USING TINYMCE EDITOR
			var is_tiny = true;

			// ISDIRTY . Content has change ?
			// console.log(ed.isDirty())
			if(ed.isDirty()===false) {
				if(SHOW_DEBUG===true) {
					//console.log("[component_text_area.Save]-> Info: Nothing is saved because ed.isDirty() is false (no changes are detected in editor) isDirty:",ed.isDirty());
				}
				return false;
			}

			// Saving from main text editor content instead text area content
			var dato = ed.getContent({format : 'raw'});
				//console.log(dato);

			// Prepare container content
			var container = document.createElement("div")
				container.innerHTML = dato

			// As already using own editor spinner, don't use here component spinner
			save_arguments.show_spinner = false;
		}



		// PREPROCESS_TEXT_TO_SAVE. Clean dato
			const clean_start = new Date().getTime();
			const dato_clean  = self.preprocess_text_to_save(container)
				if (dato_clean) {
					save_arguments.dato = dato_clean;
				}else{
					console.log("[component_text_area.Save] Error on preprocess_text_to_save !! Saving unprocessed dato !!")
					save_arguments.dato = dato;
				}

			if(SHOW_DEBUG===true) {
				let time 	= new Date().getTime() - clean_start
				console.log("[component_text_area.Save] clean exec in ms:",time);
				//console.log("[component_text_area.render_all_tags] time: " +time+ " ms")
			}

		//console.log("save_arguments.dato",save_arguments.dato);

		/*
		if (ed === null || typeof ed !== 'object') {
			alert("[Save] Error: editor is empty")
			return false;
		}*/

		// FORCE UPDATE REAL TEXT AREA CONTENT (and save is triggered when text area changes)
		//tinyMCE.triggerSave(); // Force update all textareas	//console.log(tinyMCE);
		//ed.save(); // Force update current textarea content
		//console.log(ed.isDirty());


		// FORCE UPDATE REAL TEXT AREA CONTENT
			//tinyMCE.triggerSave();		//alert(ed.getContent())
			//ed.save();

			//var c = component_common.get_wrapper_from_element(component_obj)
			//console.log( c); return;
			//console.log(component_obj); return
		const wrapper = component_common.get_wrapper_from_element(component_obj)
		// SAVE COMPONENT_COMMON . Exec general save
		const js_promise = component_common.Save(component_obj, save_arguments).then(function(response) {
			if(SHOW_DEBUG===true) {
				//console.log("save_arguments",save_arguments);
				//console.log("[component_text_area:Save] reload_on_save: ", component_text_area.reload_on_save);
				//console.log("[component_text_area.Save] self.get_dato():",self.get_dato(wrapper));
			}

			// Reload TR processed text
			if (is_tiny===true) {
				if (component_text_area.reload_on_save===true) {
					component_text_area.load_tr( wrapper, ed )
				}
			}else{
				if (component_text_area.reload_on_save===true) {

					component_text_area.load_tr( wrapper, null )
				}
				// Restore var content_is_changed to default value
				component_text_area.content_is_changed = false
			}

			const str_component_info = wrapper.dataset.component_info
			const component_info 	 = JSON.parse(str_component_info)
			const properties 		 = component_info.propiedades

			// alt_save case (defined in propiedades)
			if(properties.hasOwnProperty('alt_save')){

				const component_tipo = properties.alt_save.component_tipo
				const section_id 	 = wrapper.dataset.parent
				const lang 		 	 = wrapper.dataset.lang

				component_common.update_component_by_parent_tipo_lang(section_id, component_tipo, lang)
			}

			// Update possible dato in list (in portal x example)
			//component_common.propagate_changes_to_span_dato(component_obj);
		}, function(xhrObj) {
			console.log(xhrObj);
		});


		return js_promise;
	}//end Save



	/**
	* PREPROCESS_TEXT_TO_SAVE
	* Replace <section> tags to internal Dédalo tags
	* Unify text content format
	* @return string
	*/
	this.preprocess_text_to_save = function(container) {

		if (!container) {
			console.log("[component_text_area.preprocess_text_to_save] Error. container element is not valid", container)
			return false;
		}

		//const start = new Date().getTime();

		// Clone to avoid affect existing DOM elements
		const cloned_text = container.cloneNode(true)

		// SECTION TAGS (STRUCT)
			// Iterate all section elements
			const section_elements 			= cloned_text.getElementsByTagName('section')
			const ar_section_id 			= []
			const ar_section_id_duplicates 	= []
			if (section_elements) {
				//console.log(section_elements)
				const section_elements_len = section_elements.length
				for (let i = section_elements_len - 1; i >= 0; i--) {
					// Convert section tags to dedalo internal labels
					// <section class="section_struct text_unselectable" id="section_2" data-state="n" data-label="" data-data="{'section_tipo':'rsc370','section_id':'3'}">..</section>
					// [struct-a-1-1-data:{'section_tipo':'rsc370','section_id':'3'}:data]...[/struct-a-1-1-data:{'section_tipo':'rsc370','section_id':'3'}:data]
					let tag_id 		= section_elements[i].dataset.tag_id
					let state 		= section_elements[i].dataset.state
					let label 		= section_elements[i].dataset.label
					let data 		= section_elements[i].dataset.data
					// Compose Dédalo tags
					let tag_in  	= component_text_area.build_dedalo_tag('structIn', tag_id, state, label, data)
					let tag_out 	= component_text_area.build_dedalo_tag('structOut', tag_id, state, label, data)
					let final_string= tag_in + section_elements[i].innerHTML + tag_out

					// Replaces tag content string with new created
					section_elements[i].innerHTML = final_string

					// Unwrap section tag node (removes tags and leaves only contents)
					component_text_area.unwrap_element(section_elements[i]);

					// Check if current tag already exists (duplicates)
					if(ar_section_id.indexOf(tag_id) !== -1) {
						// Duplication detected!
						ar_section_id_duplicates.push(tag_id)
					}

					ar_section_id.push(tag_id)
				}//end for (var i = len - 1; i >= 0; i--) {
			}//end section_elements
			//console.log("ar_section_id",ar_section_id);
			if (ar_section_id_duplicates.length>0) {
				if(SHOW_DEBUG===true) {
				console.log("DEBUG Warning: Duplicate structuration tags found! \nDuplicates: ",ar_section_id_duplicates)	//.join(',')+" \nThis may be because you have inadvertently copied labels more than once from the source text. Please contact your administrator to fix this inconsistency");
				}
			}


		// REFERENCE TAGS
			// Iterate all reference elements
			const reference_elements = cloned_text.getElementsByTagName('reference')
			if (reference_elements) {
				//console.log(reference_elements)
				const reference_elements_len = reference_elements.length
				for (let i = reference_elements_len - 1; i >= 0; i--) {
					// Convert section tags to dedalo internal labels
					// <reference class="reference_struct text_unselectable" id="reference_2" data-state="n" data-label="" data-data="{'reference_tipo':'rsc370','reference_id':'3'}">..</reference>
					// [reference-a-1-1-data:{'reference_tipo':'rsc370','reference_id':'3'}:data]...[/reference-a-1-1-data:{'reference_tipo':'rsc370','reference_id':'3'}:data]
					let tag_id 		= reference_elements[i].dataset.tag_id
					let state 		= reference_elements[i].dataset.state
					let label 		= reference_elements[i].dataset.label
					let data 		= reference_elements[i].dataset.data
					// Compose Dédalo tags
					let tag_in  	= component_text_area.build_dedalo_tag('referenceIn', tag_id, state, label, data)
					let tag_out 	= component_text_area.build_dedalo_tag('referenceOut', tag_id, state, label, data)
					let final_string= tag_in + reference_elements[i].innerHTML + tag_out

					// Replaces tag content string with new created
					reference_elements[i].innerHTML = final_string

					// Unwrap section tag node (removes tags and leaves only contents)
					component_text_area.unwrap_element(reference_elements[i]);
				}//end for (var i = len - 1; i >= 0; i--) {
			}//end reference_elements

		// IMG TAGS (INDEX,TC,SVG,GEO,PERSON,ETC.)
			//const image_elements = cloned_text.getElementsByTagName('img')
			const image_elements = cloned_text.querySelectorAll('img') // ! use querySelectorAll to avoid loop problems on i++
			if (image_elements) {
				const ar_svg_used_tag_id = []
				const image_elements_len = image_elements.length

				//for (let i = image_elements_len - 1; i >= 0; i--) {
				for (let i = 0; i < image_elements_len; i++) {

					const current_element = image_elements[i]

					//console.log("image_elements[i]:",i,image_elements[i].dataset.tag_id,parseInt(image_elements[i].dataset.tag_id));
					let current_tag_id = current_element.dataset.tag_id

					// svg . Keep current svg tag_id for renumerate on the fly
						if (current_element.dataset.type==="svg") {

							current_tag_id = parseInt(current_tag_id)

							if(current_tag_id<1) current_tag_id = 1

							// console.log("ar_svg_used_tag_id.indexOf(current_tag_id):",ar_svg_used_tag_id.indexOf(current_tag_id), ar_svg_used_tag_id, current_tag_id);
							// If is zero or already exits, renumerate
							if(ar_svg_used_tag_id.indexOf( current_tag_id ) > -1) {
								// Renumerate
								current_tag_id = Math.max.apply(Math, ar_svg_used_tag_id) + 1
							}
							ar_svg_used_tag_id.push( current_tag_id )
						}

					// Build dedalo tag from node image dataset	info
					const final_string = this.build_dedalo_tag(current_element.dataset.type, current_tag_id, current_element.dataset.state, current_element.dataset.label, current_element.dataset.data)

					if (final_string) {
						// Replaces tag content string with new created
						current_element.innerHTML = final_string
						// Unwrap section tag node (removes tags and leaves only contents)
						component_text_area.unwrap_element(current_element)
					}
				}
			}//end if (image_elements)


		let temp_elements = []

		// REMOVE TEMPORAL ELEMENTS
		temp_elements = cloned_text.getElementsByTagName('h2')
		const h2_len = temp_elements.length
			for (let i = h2_len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}

		// REMOVE TEMPORAL HEADER (TOC)
		temp_elements = cloned_text.getElementsByTagName('header')
		const header_len = temp_elements.length
			for (let i = header_len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}

		// REMOVE FAKE CARET
		temp_elements = cloned_text.getElementsByTagName('caret')
		const caret_len = temp_elements.length
			for (let i = caret_len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}

		// REMOVE <p> (And change </p> by <br>)
		temp_elements = cloned_text.getElementsByTagName("p")
		const p_len = temp_elements.length
			for (let i = p_len - 1; i >= 0; i--) {
				// Add tag <br> after </p>
				let new_element = document.createElement("br")
				temp_elements[i].parentNode.insertBefore(new_element, temp_elements[i].nextSibling);
				// Unwrap tag p content (removes tags and leaves only contents)
				component_text_area.unwrap_element(temp_elements[i]);
			}


		if(SHOW_DEBUG===true) {
			//const end  	= new Date().getTime()
			//const time 	= end - start
			//console.log("[component_text_area.preprocess_text_to_save] exec in ms:",time);
			//console.log("[component_text_area.render_all_tags] time: " +time+ " ms")
		}

		return cloned_text.innerHTML
	}//end preprocess_text_to_save



	/**
	* LOAD_TR
	* Load text editor content without load component html
	*/
	this.load_tr = function(wrapper_obj, ed) {

		if (typeof wrapper_obj!=='object' || typeof wrapper_obj.dataset==='undefined') {
			console.log("[component_text_area.load_tr] Error. Invalid wrapper_obj: ", wrapper_obj)
			return false;
		}

		const trigger_vars = {
				mode		 : 'load_tr',
				parent		 : wrapper_obj.dataset.parent,
				tipo		 : wrapper_obj.dataset.tipo,
				lang		 : wrapper_obj.dataset.lang,
				section_tipo : wrapper_obj.dataset.section_tipo,
				top_tipo	 : page_globals.top_tipo,
				top_id		 : page_globals.top_id,
		}
		//console.log("[component_text_area.load_tr] trigger_vars",trigger_vars)

		const is_tiny = component_text_area.is_tiny(ed)

		if (is_tiny===true) {
			ed.setProgressState(true); // Show progress en texto
		}else{
			html_page.loading_content( wrapper_obj, 1 );
		}

		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.load_tr] response", response);
			}

			if (!response) {

				alert("[component_text_area.load_tr] Warning: Null value is received. Check your server log for details");

			}else{

				if (response.result!==false) {

					const updated_received_data = response.result

					// INSPECTOR LOG INFO
					/*
					if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1) {
						var msg = "<span class='error'>Failed!<br>" +received_data+ "</span>";
						console.log(msg);
					}
					*/
					if (is_tiny===true) {
						// TINYMCE EDITOR
						if ( /Auth error/i.test(updated_received_data) ) {
							ed.setProgressState(false); // Hide progress en texto
							ed.setDirty(true); 			// Force dirty state
							// "To keep the changes, DO NOT CLOSE THIS WINDOW. Log on to another browser window and then return to this window and save the content (pressing the 'Save' button)"
							alert("[component_text_area.load_tr] Error on save: "+updated_received_data+"<hr>"+ get_label.conservar_los_cambios_transcripcion)
						}else{
							//console.log(updated_received_data);
							ed.setContent(updated_received_data);
							ed.save()

							// Render tc tags with canvas
							//window.setTimeout(function(){
							//	let render_all_tags_promise = component_text_area.render_all_tags(ed, "tc", true)
							//}, 1)

							// FORCE UPDATE REAL TEXT AREA CONTENT
							//tinyMCE.triggerSave();		//alert(ed.getContent())
						}
					}else{
						// TEXT PREVIEW (STRUCTURATION) EDITOR
						if (response.result!==false) {

							const component_obj = wrapper_obj.querySelector('#text_preview')
							// Inject contents
							component_obj.innerHTML = response.result

							//tool_structuration.update_titles_on_save=false

							// activate_content_tags
							text_editor.activate_content_tags(component_obj, wrapper_obj)

							// Render tc tags with canvas
							//window.setTimeout(function(){
							//	let render_all_tags_promise = component_text_area.render_all_tags(component_obj, "tc", false)
							//}, 1)
						}
					}

				}else{
					alert("[component_text_area.load_tr] Warning: msg details: "+ response.msg);
				}
			}

			if (is_tiny===true) {
				ed.setProgressState(false); 	// Hide progress en texto
			}else{
				html_page.loading_content( wrapper_obj, 0 );
			}
		}, function(error) {
			console.log("[component_text_area.load_tr] error:",error);
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " save_order</span>" + error );
			if (is_tiny===true) {
				ed.setProgressState(false); 	// Hide progress en texto
			}else{
				html_page.loading_content( wrapper_obj, 0 );
			}
		})

		return js_promise
	}//end load_tr



	/**
	* BUILD_DEDALO_TAG
	* Unified way of create dedalo custom tags from javascript
	* @return string tag
	*/
	this.build_dedalo_tag = function(type, tag_id, state, label, data) {

		const valid_types = ["indexIn","indexOut","structIn","structOut","tc","tc2","svg","draw","geo","page","person","note","image","referenceIn","referenceOut"]
			if (valid_types.includes(type)===false) {
				console.log("[build_dedalo_tag] Invalid tag type:",type);
				alert("[build_dedalo_tag] Invalid tag type: " + type)
				return false
			}

		// Bracket_in is different for close tag
		const bracket_in = (type.indexOf("Out")!==-1) ? "[/" : "["

		// Removes sufixes 'In' and 'Out'
		const type_name = type.replace(/In|Out/, '')

		// Label truncate and replace - avoid future errors
		if (typeof label === "undefined") {
			label = ''
		}else{
			label = label.substring(0,22)
			label = replaceAll('-', '_', label)
		}

		let dedalo_tag = null
		switch(type) {
			case "tc":
				dedalo_tag = tag_id
				break;
			default:
				dedalo_tag = bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "-" + "data:" + data + ":data]"
		}

		return dedalo_tag
	}//end build_dedalo_tag



	/**
	* BUILD_DOM_ELEMENT_FROM_DATA
	* @return
	*/
	this.images_factory_url = "../../../inc/btn.php"
	this.build_dom_element_from_data = function(type, tag_id, state, label, data) {

		if (type==='tc') {

			var node_type = 'img'

			// TC exception
			let tc = tag_id
			var element = document.createElement(node_type)
				element.src = this.images_factory_url + "/" + "[TC_" + tc + "_TC]"
				element.id  = "[TC_" + tc + "_TC]"
				element.classList.add(type)
				element.dataset.type 	= type // Like indexIn . Note that is NOT type_name, is different for In and Out
				element.dataset.tag_id 	= "[TC_" + tc + "_TC]"
				element.dataset.state 	= 'n'
				element.dataset.label 	= tc
				element.dataset.data 	= tc
		/*
		}else if (type==='referenceIn') {

			var node_type = 'a'

			// Bracket_in is different for close tag
			var bracket_in = (type.indexOf("Out")!==-1) ? "[/" : "["

			// Removes sufixes 'In' and 'Out'
			var type_name = type.replace(/In|Out/, '');

			var element = document.createElement(node_type)
				//element.src = ""
				element.id  = bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "]" // Temporal way of build node id
				element.classList.add(type_name)
				element.dataset.type 	= type // Like referenceIn . Note that is NOT type_name, is different for In and Out
				element.dataset.tag_id 	= tag_id
				element.dataset.state 	= state
				element.dataset.label 	= label
				element.dataset.data 	= data
		*/
		}else{

			var node_type = 'img'

			// Bracket_in is different for close tag
			let bracket_in = (type.indexOf("Out")!==-1) ? "[/" : "["

			// Removes sufixes 'In' and 'Out'
			let type_name = type.replace(/In|Out/, '');

			var element = document.createElement(node_type)
				element.src = this.images_factory_url + "/" + bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "]"
				element.id  = bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "]" // Temporal way of build node id
				element.classList.add(type_name)
				element.dataset.type 	= type // Like indexIn . Note that is NOT type_name, is different for In and Out
				element.dataset.tag_id 	= tag_id
				element.dataset.state 	= state
				element.dataset.label 	= label
				element.dataset.data 	= data
		}
		//console.log(element);

		return element
	}//end build_dom_element_from_data



	/**
	* GET_TAGS
	* @return array ar_tags
	*	Array of dom object (normally images)
	*/
	this.get_tags = function (related_tipo, tag_type) {

		let ar_tags = []

		// ID . Get editor id from related tipo
		const component_text_area = document.querySelector('textarea[data-tipo="'+related_tipo+'"]')
			if (!component_text_area) {
				if(SHOW_DEBUG===true) {
					console.log("[component_text_area.get_tags] Error component_text_area not found for related_tipo:",related_tipo);
				}
				return false;
			}

		const component_text_area_id = component_text_area.id

		// ED . Select text editor
		const ed = tinymce.get(component_text_area_id)
		if (ed) {
			// Select nodes of type tag_type
			ar_tags = ed.dom.select('[data-type="'+tag_type+'"]')
		}else{
			console.warn("No editor found ! ", component_text_area_id);
		}


		return ar_tags
	}//end get_tags



	/**
	* GET_LAST_TAG_ID
	* @param ed
	*	Text editor instance (tinyMCE)
	* @param tag_type
	*	Class name of image searched like 'geo'
	*/
	this.get_last_tag_id = function(container, tag_type) {

		var ar_id_final = [0];

		switch(tag_type) {
			case 'struct':
				// SECTION : Select all sections in text
				var ar_struct_tags = container.getElementsByTagName('section')
					//console.log(ar_struct_tags)

				// ITERATE TO FIND TIPO_TAG
				var i_len = ar_struct_tags.length
				for (let i = i_len - 1; i >= 0; i--) {

					// current tag like [svg-n-1]
					var current_tag = ar_struct_tags[i].id;
					var ar_parts 	= current_tag.split('_');
					var number 	 	= parseInt(ar_parts[1]);

					// Insert id formated as number in final array
					ar_id_final.push(number)
				}
				break;

			case 'reference':
				// REFERENCE : Select all reference in text
				var ar_tags = container.getElementsByTagName('reference')
					//console.log(ar_tags)

				// ITERATE TO FIND TIPO_TAG
				var i_len = ar_tags.length
				for (let i = i_len - 1; i >= 0; i--) {

					// current tag like [svg-n-1]
					var current_tag = ar_tags[i].id;
					var ar_parts 	= current_tag.split('_');
					var number 	 	= parseInt(ar_parts[1]);

					// Insert id formated as number in final array
					ar_id_final.push(number)
				}
				break;

			default:
				// like img as id: [index-n-1--label-data:**]

				if (this.is_tiny(container)===false) {
					var ar_img = container.querySelectorAll('img.'+tag_type)
				}else{
					// IMG : Select all images in text area
					var ed = container
					// Select with tiny dom selector an image with class : tag_type
					var ar_img = ed.dom.select('img.'+tag_type);
				}

				// ITERATE TO FIND TIPO_TAG (filter by classname: svg,etc.)
				var i_len = ar_img.length
				for (let i = i_len - 1; i >= 0; i--) {

					var number 		= 0;
					var current_tag = ar_img[i].id;
					var ar_parts 	= current_tag.split('-');
					var number 	 	= parseInt(ar_parts[2]);

					// Insert id formated as number in final array
					ar_id_final.push(number)
				}
				break;
		}

		// LAST ID
		const last_tag_id = Math.max.apply(null, ar_id_final);
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.get_last_tag_id] last_tag_id of type: " + tag_type +" -> ", last_tag_id )
			}


		return parseInt(last_tag_id);
	}//end get_last_tag_id



	/**
	* GET_WRAPPER_FROM_TAG
	* @return
	*//*
	this.get_wrapper_from_tag = function(tag_element) {

		let wrapper = component_common.get_wrapper_from_element(tag_element)
		if (!wrapper) {
			// Is not conten editable editor. Try search tinymce editor
			let tinymce_body = component_common.get_wrapper_from_element(tag_element, '#tinymce')
			if (!tinymce_body) {
				console.error("[component_text_area.get_wrapper_from_tag] Error on locate tinymce_body",tinymce_body);
			}
			wrapper 	 	 = document.getElementById("wrapper_"+tinymce_body.dataset.id)
			if (!wrapper) {
				console.error("[component_text_area.get_wrapper_from_tag] Error on locate wrapper",wrapper);
			}
		}

		return wrapper;
	}//end get_wrapper_from_tag*/



	/**
	* CHANGE_TAG_STATE
	* @param obj
	*/
	this.change_tag_state = function (select_obj) {
		if(SHOW_DEBUG===true) {
			//console.log("[change_tag_state] select_obj:",select_obj, " tag_obj:", this.tag_obj, "component_text_area.selected_tag_data:", component_text_area.selected_tag_data);
			//console.log("[component_text_area.change_tag_state] selected_tag_data",component_text_area.selected_tag_data);
		}

		/*
		var tag_obj 		= data.tag_obj
		var related_tipo 	= data.component_tipo
		*/
		// Note: 'this.tag_obj' is a dom element fixed in class text_area from editor events when user makes click on image element
		const tag_obj 	= component_text_area.tag_obj
		const save 		= true

		if(SHOW_DEBUG===true) {
			//console.log("[component_text_area:change_tag_state] change_tag_state tag_obj",tag_obj); return
		}

		// Get new state from select
		const	new_state = select_obj.value
			//console.log("tag_id:"+tag_id+" - current_state:"+current_state+" - new_state:"+new_state);
			if (!new_state) {
				if(SHOW_DEBUG===true) {
					console.log("[component_text_area:change_tag_state] Value not changed, Stoped save");
				}
				return false;
			}

		const new_data_obj = {
			state : new_state
		}

		// Get selected_tag_data from already fixed (in create_new_note) global class var
		const tag_data = component_text_area.selected_tag_data

		if(SHOW_DEBUG===true) {
			//console.log("[component_text_area:change_tag_state] selected_tag_data",tag_data); //return;
		}

		return this.update_tag(tag_data, new_data_obj, save);
	}//end change_tag_state



	/**
	* UPDATE_TAG
	* Edit selected tag and add or modify datasets
	*/
	this.update_tag = function(tag_data, new_data_obj, save) {

		if (typeof tag_data == "undefined") {
			alert("Please select tag");
			console.error("[component_text_area.update_tag] ERROR. Stopped update_tag. Empty tag_data:", tag_data);
			console.trace();
			return false
		}

		const related_tipo = tag_data.component_tipo
		if (typeof related_tipo==="undefined") {
			console.error("[component_text_area.update_tag] ERROR. Stopped update_tag. Invalid related_tipo :", related_tipo);
			return false
		}
		let related_lang = tag_data.lang

		/*
		var type 	= tag_obj.dataset.type
		var tag_id 	= tag_obj.dataset.tag_id*/
		let type 	= tag_data.type
		let tag_id 	= tag_data.tag_id

		let container = this.get_related_editor(related_tipo, related_lang)
		if (!container) {
			console.error("[component_text_area.update_tag] ERROR. Stopped update_tag. Empty container related_editor :", container, related_tipo);
			return false
		}
		if(SHOW_DEBUG===true) {
			//console.log("[component_text_area.update_tag] container :", container); return;
		}


		// DOM Selection pattern
		if (type.indexOf('In')!==-1 || type.indexOf('Out')!==-1) {
			var type_name = type.replace(/In|Out/, '');
			// Selects elements with data start with 'type_name' like 'indexIn'
			var selection_pattern = '[data-type^="'+type_name+'"][data-tag_id="'+tag_id+'"]'
		}else{
			var selection_pattern = '[data-type="'+type+'"][data-tag_id="'+tag_id+'"]'
		}

		//var is_tiny = (typeof container.type!="undefined" && container.type==="setupeditor") ? true : false;
		const is_tiny = this.is_tiny(container)
			//console.log(container);

		if(SHOW_DEBUG===true) {
			//console.log("[component_text_area.update_tag] selection_pattern:", selection_pattern);
			//console.log("[component_text_area.update_tag] is_tiny: ", is_tiny, container);
		}

		// Select current tag in dom
		if (is_tiny===true) {
			//console.log("selection_pattern",selection_pattern);
			// tinyMCE editor
			var ed = container
			var current_elements = ed.dom.select(selection_pattern)
			if (!current_elements.length) {
				alert("[component_text_area.update_tag] Error on dom select (tinymce) tag to update_tag tag_id:" +tag_id + " type:" + type)
				return false;
			}
		}else{
			// Standard dom container
			var current_elements = container.querySelectorAll(selection_pattern)
			if (!current_elements.length) {
				alert("[component_text_area.update_tag] Error on dom select (textpreview) tag to update_tag tag_id:" +tag_id + " type:" + type)
				return false;
			}
		}
		if(SHOW_DEBUG===true) {
			//console.log(current_elements); return;
		}

		// Iterate and update tag state
		const len = current_elements.length
		for (let i = len - 1; i >= 0; i--) {
			// Set new state to dataset of each dataset
			for (let key in new_data_obj) {
			  current_elements[i].dataset[key] = new_data_obj[key]
			}
		}

		// Update editor
		if (is_tiny===true) {
			ed.focus();
			// Force ed dirty state
			ed.setDirty(true);	 // Force dirty state

			if (typeof save!="undefined" && save===true) {
				// text_area element and ed share the same id
				let current_component_text_area = document.getElementById(ed.id)

				// Set editor to refresh
				if (page_globals.modo==='edit') {
					page_globals.components_to_refresh.push("wrapper_"+ed.id)
				}

				// Save modified content
				return component_text_area.Save( current_component_text_area, null, ed );
			}
		}else{

			if (typeof save!="undefined" && save===true) {

				//component_text_area.reload_on_save=false
				//console.log(component_text_area.reload_on_save);
				//return component_text_area.Save( container, null, null );

				//tool_structuration.update_titles_on_save = false

				return tool_structuration.save_structuration_text()
				/*
				var current_component_text_area = component_common.get_wrapper_from_element(container)

				// Save modified content
				return component_text_area.Save( current_component_text_area, null, container ); */
			}
		}

		return true
	}//end update_tag



	/**
	* GET_RELATED_EDITOR
	* @return object related_editor
	*/
	this.get_related_editor = function(related_tipo, related_lang) {

		if(SHOW_DEBUG===true) {
			//console.log("[component_text_area.get_related_editor] related_tipo", related_tipo, "related_lang",related_lang);
			//console.log("component_text_area.selected_tag_data",component_text_area.selected_tag_data);
		}

		// WRAPPER
			if (typeof related_lang=="undefined" || !related_lang) {
				var wrapper = document.querySelector('.wrap_component[data-tipo="'+related_tipo+'"]')
				if(SHOW_DEBUG===true) {
					console.warn("[component_text_area.get_related_editor] related_lang is undefined. Selected without lang!");
				}
			}else{
				var wrapper = document.querySelector('.wrap_component[data-tipo="'+related_tipo+'"][data-lang="'+related_lang+'"]')
			}

			if (!wrapper) {
				console.log("[component_text_area.get_related_editor] ERROR. No wrapper found with tipo: ", related_tipo);
				return false
			}

		const textarea = wrapper.querySelector('textarea')
			//console.log("[component_text_area.get_related_editor] textarea", textarea, wrapper);

		let related_editor
		if (textarea) {
			// ED container
			related_editor = tinymce.get(textarea.id)
		}else{
			// Struct container
			related_editor = wrapper.getElementsByClassName('text_area_tool_structuration')[0]
		}

		//console.log("[component_text_area.get_related_editor] related_editor", related_editor);

		return related_editor
	}//end get_related_editor



	/**
	* UPDATE_SVG_TAG
	* @param string tagOriginal
	* @param int id
	* @param string state (like 'n')
	* @param string data
	* @return string tagNew
	*//*
	this.update_svg_tag = function(tagOriginal, id, state, data){

		// Format data Important !!
		data = replaceAll('"', '\'', data);

		var ed = tinyMCE.activeEditor;
		console.log(ed);
			console.log(ed.type);
		return

		// TEXT_AREA : Get current content
		var texto = ed.getContent({format : 'raw'});

		// TAG : Build new tag
		var tagNew = this.tag_svg.pre + state + '-' + id  + '-data:' + data + this.tag_svg.post;

		// TEXT : Repalce content text
		texto = texto.replace(tagOriginal, tagNew)

		// TEXT_AREA : Set updated content
		ed.setContent(texto,{format : 'raw'});

		ed.setDirty(true);	// Force dirty state

		// SAVE : Save component data
		var text_area_component = $('.css_text_area')[0],
			evt = null
		component_text_area.Save( text_area_component, null, ed )
		//mce_editor.save_command(ed,evt,text_area_component);

		return tagNew;
	}//end update_svg_tag
	*/


	/**
	* UPDATE_GEO_TAG
	* @see component_geolocation
	*//*
	this.update_geo_tag = function(tag_id, state, data, related_tipo) {

		// DATA . Format data. Change double quotes with single quotes
			data = replaceAll('"', '\'', data);
				//console.log(data);

		// ID component_text_area_id
			var component_text_area_id 	= document.querySelector('textarea[data-tipo="'+related_tipo+'"]').id;

		// ED
			var ed = tinymce.get(component_text_area_id)

			// Select current tag in ed dom
			var current_element = ed.dom.select('[data-type="geo"][data-tag_id="'+tag_id+'"]')
			if (current_element.length!==1) {
				alert("Error on select geo tag "+tag_id);
				return false;
			}else{
				current_element = current_element[0]
			}

			// Set new data to dataset
			current_element.dataset.data = data
				//console.log(current_element)

			// Force dirty state
			ed.setDirty(true);

		// COMPONENT_TEXT_AREA select current_component text area
			var current_component = document.getElementById(component_text_area_id)

		// SAVE : Save component
			var save_arguments = {}
			component_text_area.Save( current_component, save_arguments, ed )

		//return tagNew;
	}//end update_geo_tag
	*/



	/**
	* AV_EDITOR_KEY_UP : CAPTURE AND MANAGE KEYBOARD EVENTS
	*/
	this.av_editor_key_up = function(e) {

		// MODO : Only 'tool_transcription' is used
		if(page_globals.modo!='tool_transcription') return;

		try{
			switch(e.keyCode) {
				//case 27 : 	// Key ESC(27) llamamos a la función de control de video / rec. posición TC
				case parseInt(videoFrame.av_media_player_play_pause_key) :
						component_text_area.videoPlay(e);
						if(SHOW_DEBUG===true) {
							console.log('[component_text_area.av_editor_key_up]->text editor videoPlay ed.onKeyUp: ', e.keyCode);
						}
						break;

				//case 113 : 	// Key F2 (113) Write tc tag in text
				case parseInt(videoFrame.av_media_player_insert_tc_key) :
						component_text_area.get_and_write_tc_tag(e);
						if(SHOW_DEBUG===true) {
							console.log('[component_text_area.av_editor_key_up]->text editor write_tc_tag ed.onKeyUp: ', e.keyCode);
						}
						break;
				default:
						if(SHOW_DEBUG===true) {
							console.log('[component_text_area.av_editor_key_up] Unassigned keycode: ', e.keyCode);
						}
						break;
			}
		}catch(e){
			if(SHOW_DEBUG===true) console.log("[component_text_area.av_editor_key_up] ", e)
		}
	}//end av_editor_key_up



	/*
	* LOAD_FRAGMENT_INFO_IN_INDEXATION
	* Alias of tool_indexation.fragment_info()
	*/
	this.load_fragment_info_in_indexation = function(tag_obj, tipo, parent, section_tipo, lang) {
		return tool_indexation.fragment_info(tag_obj, tipo, parent, section_tipo, lang)
	}//end load_fragment_info_in_indexation



	/**
	* LOAD RELATION
	* Carga el botón correspondiente a la etiqueta seleccionada (ni mas ni menos)
	*/
	this.load_relation__DEPRECATED = function(tagName, tipo, parent, section_tipo) {

		// alert(tagName +' '+ tipo+' '+ parent)
		// Catch no operacional modes : Sólo se usará en modo 'edit'
		if (page_globals.modo!='edit') { return false };

		// VARS VALIDATE : Comprueba variables válidas
		if(typeof( tagName )==='undefined')		return alert("Error: load_relation: tagName is not defined!");
		if(typeof( tipo )==='undefined')		return alert("Error: load_relation: tipo is not defined!");

		// INSPECTOR : CARGA DATOS RELACIONADOS A LA ETIQUETA EN INSPECTOR
			// Ajax load inspector_indexation_list from trigger.tool_indexation
			tool_indexation.load_inspector_indexation_list(tagName, tipo, parent, section_tipo, lang);

			// Ajax load inspector_relation_list_tag from trigger.tool_indexation
			// DESACTIVA DE MOMENTO
			//tool_relation.load_inspector_relation_list_tag(tagName, tipo, parent);


		// Target div (contains all data info required for create the component to load)
		//var wrapper_id 	= 'relations_ajax_div_'+tipo;
		//var target_obj 	= $('#'+wrapper_id);
		const target_obj 	= document.getElementById('relations_ajax_div_'+tipo);

		// Usamos caller_id para pasar el tag al componente (no hay otra forma mejor de momento..)
		//$(target_obj).data('caller_id',tagName);
		target_obj.dataset.caller_id = tagName


		/*
		if(SHOW_DEBUG===true) console.log("->load_relation loading tag data on div wrapper: "+wrapper_id + " from tagName:"+tagName+" - tipo:"+tipo)
		var arguments = null;
		// Ajax load component from trigger.component_common
		component_common.load_component_by_wrapper_id(wrapper_id, arguments,
							function(){
								// Callback function rebuild taps
								// component_text_area.build_relation_taps(wrapper_id); // DEPRECATED !!
							});
		*/
		// Fix global selected_tag and selected_tipo for index
		selected_tag 	= tagName;
		selected_tipo 	= tipo;

		//component_text_area.build_relation_taps(wrapper_id);
	}//end load_relation



	/**
	* SHOW_BUTTON_LINK_FRAGMET_TO_PORTAL
	* Carga el botón correspondiente a la etiqueta seleccionada (toma ya..)
	*/
	this.show_button_link_fragmet_to_portal = function(tag_obj, tipo, parent, section_tipo) {

		let	tag_id 		= tag_obj.dataset.tag_id
		let button_id 	= 'btn_relate_fragment_'+tipo
		let	button_obj 	= document.getElementById(button_id)
			if (!button_obj) {
				console.warn("[component_text_area:show_button_link_fragmet_to_portal] Unable select button_obj by id: ", button_id);
				return false;
			}

		// Build locator to enable save in portal
		const locator = {
			section_tipo  	: section_tipo,
			section_id 		: parent,
			component_tipo 	: tipo,
			tag_id 			: tag_id
		}
		const locator_string = JSON.stringify(locator);
			//return 	console.log(locator_string);

		// Update locator data in button for tool_portal task
		button_obj.dataset.rel_locator = locator_string;

		// Update label tag id
		button_obj.querySelector('span').innerHTML = tag_id

		// Show button
		button_obj.style.display = 'inline-block'

		return false;
	}// end show_button_link_fragmet_to_portal



	/**
	* LOAD FRAGMENT INFO
	* Used in modo 'tool_lang' to change tags state
	*/
	this.load_fragment_info = function(tag_obj, tipo, lang) {

		// Target div (contains all data info required for create the component to load)
		const wrapper_id 	= 'fragment_info_div_'+tipo+'_'+lang;
		const target_obj  = document.getElementById(wrapper_id);

		// Usamos caller_id para pasar el tag al componente (no hay otra forma mejor de momento..)
		// $target_obj.data('caller_id',tagName);
		target_obj.dataset.caller_id = tag_obj.dataset.tag_id

		if(SHOW_DEBUG===true) console.log("[component_text_area:load_fragment_info] loading tag data on div wrapper: "+wrapper_id + " from tag:"+tag_obj.dataset.tag_id+" - tipo:"+tipo+" - lang:"+lang)

		return component_common.load_component_by_wrapper_id(
								wrapper_id,
								null
								);
	}//end this.load_fragment_info


	// LOGINDEXCHANGES
	this.logIndexChanges = function (tagName) {
		alert("Captured logIndexChanges: "+tagName)
	}
	// LOADFR
	this.loadFr = function (tagName) {
		alert("Captured loadFr: "+tagName)
	}



	/**
	* GOTO TIME
	* Captura el comando y le pasa la gestión a av player
	*/
	this.goto_time = function (timecode) {

		//alert("Captured goto_time: "+tagName)
		if(SHOW_DEBUG===true) {
			//console.log("[component_text_area.goto_time]->component_text_area goto_time captured and passed: ", timecode)
			//var timecode = component_text_area.tag_to_timecode(tagName);
		}

		const iframe_obj = document.getElementById('videoFrame')

		//if ($('#videoFrame').length>0 ) {
		if (iframe_obj && typeof videoFrame.goto_time!=="undefined") {
			return videoFrame.goto_time(timecode)
		}else{
			return top.goto_time(timecode);
		}
	}//end goto_time



	/**
	* VIDEO PLAY
	* Captura el comando y le pasa la gestión a av player
	*/
	this.videoPlay = function (e) {

		if(SHOW_DEBUG===true) {
			console.log("[component_text_area.videoPlay]->component_text_area videoPlay captured and passed: ", e.keyCode)
		}

		//var videoFrame = document.getElementById("videoFrame")
		//console.log("videoFrame",videoFrame );

		if ($('#videoFrame').length>0 ) {
			return videoFrame.videoPlay(e)
		}else{
			return top.videoPlay(e);
		}
	}//end videoPlay



	/**
	* WRITE_TC_TAG
	* Captura el comando y le pasa la gestión a av player
	*/
	this.get_and_write_tc_tag = function (e) {
		if(SHOW_DEBUG===true) {
			console.log("[component_text_area.get_and_write_tc_tag]->component_text_area get_and_write_tc_tag captured and passed: ", e.keyCode);
		}

		if ( $('#videoFrame').length>0 ) {
			return videoFrame.get_and_write_tc_tag(e);
		}else{
			return top.get_and_write_tc_tag(e);
		}
	}//end get_and_write_tc_tag



	/**
	* TAG TO ID
	*/
	this.get_tag_id = function (tag){
		alert("GET_TAG_ID");

		var matches = tag.match(/\[\/?[\w]+-[a-z]-([0-9]{1,6})((-.{0,8})?-data:.*?:data)?\]/);
		if (matches===null) {
			console.log("[component_text_area.get_tag_id] Error on get tag id from tag: ", tag);
			return false
		}
		var tag_id  = matches[1]

		return parseInt(tag_id);
	}//end get_tag_id



	/**
	* TAG TO STATE . Resolve state from tag
	*/
	this.get_tag_state = function (tag) {
		alert("get_tag_state");
		// Unificamos etiquetas a tag_in
		var matches = tag.match(/\[\/?[\w]+-([a-z])-[0-9]{1,6}(-(.{0,8})-data:.*?:data)?\]/);
		if (matches===null) {
			console.log("[component_text_area.get_tag_state] Error on get tag state from tag: ", tag);
			return false
		}
		var state  = matches[1]

		return state;
	}//end get_tag_state



	/**
	* GET TAG LABEL. Resolve label from tag
	*/
	this.get_tag_label = function (tag) {
		alert("get_tag_label");
		// Unificamos etiquetas a tag_in
		var matches = tag.match(/\[\/?[\w]+-[a-z]-[0-9]{1,6}-(.{0,8})-data:.*?:data\]/);
		if (matches===null) {
			console.log("[component_text_area:get_tag_label] Warning: tag without label: ", tag);
			return false
		}
		var label  = matches[1]

		return label;
	}//end get_tag_label



	/**
	* GET TAG DATA. Resolve data from tag
	*/
	this.get_tag_data = function (tag) {
		return alert("DEPERECATED !!!");
		/*
		// Unificamos etiquetas a tag_in
		var matches = tag.match(/\[\/?[\w]+-[a-z]-[0-9]{1,6}-.{0,8}-data:(.*?):data\]/);
		if (matches===null) {
			console.log("Warning: tag without data: "+tag);
			return false
		}
		var data = matches[1]

		return data;*/
	}//end get_tag_data



	/**
	* GET_DATA_LOCATOR_FROM_tag
	* @return object locator
	*/
	this.get_data_locator_from_tag = function( tag_obj ) {

		if (tag_obj.dataset.data && tag_obj.dataset.data.length>0) {
			var locator_str = tag_obj.dataset.data
				locator_str = replaceAll('\'', '"', locator_str)
			var locator = JSON.parse(locator_str)
				//console.log(locator);
		}else{
			var locator = null
		}

		return locator
	}//end get_data_locator_from_tag



	/**
	* TAG TO TIMECODE
	*/
	this.tag_to_timecode = function (tag) {
		// tag format [TC_00:00:00.000_TC]
		var str = tag.replace("[TC_","");
			str = str.replace("_TC]","");

		return str;
	}//end tag_to_timecode



	/**
	* ESCAPE TAG
	*/
	this.escape_tag = function (tag) {
		return tag.replace(/(["<>\/*+^$[\]\\{}|])/g, "\\$1")
	};



	/**
	* TEXT AREA HILIGHT SELECTED TEXT
	*/
	/*
	this.HighlightText = function (ed,tag,tipo){

		return false;

		var id = component_text_area.get_tag_id(tag);
		var state = component_text_area.get_tag_state(tag);
		var comprobacion = tag.indexOf("/");
		if (comprobacion >= 0){
			var tag_entrada=tag.replace("[/","[");
			var tag_salida = tag;
		}else{
			var tag_entrada=tag;
			var tag_salida=tag.replace("[","[/");
		}

		//ed.getBody().setAttribute('contenteditable', false);

		var range = ed.selection.dom.createRng();

		range.setStartBefore(ed.getBody().getElementById(tag_entrada));
		range.setEndAfter(ed.getBody().lastChild);
		ed.selection.setRng(range);
		var thisNode = ed.selection.getNode().id;

		if(SHOW_DEBUG===true) console.log(thisNode);
		return false;

		var image_in= component_text_area.build_index_in_img(id,state); //.replace(/([?"<>\/*+^$[\]\\(){}|])/g, "\\$1");
		var image_out= component_text_area.build_index_out_img(id,state);//.replace(/([?"<>\/*+^$[\]\\(){}|])/g, "\\$1");

		//var inicio = tinyMCE.activeEditor.selection.setContent(image_in);
		//alert(tag_entrada + ' '+ tag_salida)

		//var tt = $(ed.getBody()).find('[index-n-4]' );
		//if(SHOW_DEBUG===true) console.log(tt);
		var range = document.createRange();
		//var start = ed.getContent();
		//var seleccion = ed.selection.getContent();
		var entrada = ed.dom.select('img.'+tag_entrada );
		var salida = ed.dom.select('img.'+tag_salida );

		//range.setStart(seleccion, 0);
		//range.setEnd(elemento, 0);
		//ed.selection.setRng(range);
		//var textNode = tt.getElementsByTagName('img#'+tag_entrada)[0].firstChild;
		if(SHOW_DEBUG===true) console.log(entrada);


		//var ed = tinyMCE.activeEditor;
		var contenido = ed.getContent();


		//var node2selectArray = ed.dom.select('img' ); if(SHOW_DEBUG===true) console.log('node2selectArray: ');if(SHOW_DEBUG===true) console.log(node2selectArray);
		//var node2select = node2selectArray[2];
		//ed.selection.select(node2select);
		//return false;

		var range 	 = ed.selection.getRng();						//if(SHOW_DEBUG===true) console.log(range)
		//var textNode = ed.getBody();								if(SHOW_DEBUG===true) console.log(textNode)
		var node2selectArray = ed.dom.select(new RegExp('index-n-4', "gi"));	if(SHOW_DEBUG===true) console.log(node2selectArray); //return false; //tinyMCE.get('[index-n-4]');
		var textNode = node2selectArray[0];							if(SHOW_DEBUG===true) console.log(textNode);return false;

		var start 	= 0;
		var end 	= 0;
		range.setStart(textNode, start);
		range.setEnd(textNode, end);	//return false;
		ed.selection.setRng(range);
		return false;

		ed.selection.select(ed.dom.select('img')[0]);return false;

		//var contenido = tinyMCE.activeEditor.getBody().innerHTML;
		if(SHOW_DEBUG===true) console.log('contenido: '+contenido);

		var range = ed.selection.getRng(1);
		if(SHOW_DEBUG===true) console.log('range: '+range);
		//return false;

		var rng2 = range.cloneRange();

		rng2.setStartBefore($(ed.getBody()).find(tag_entrada));
		rng2.setEndBefore($(ed.getBody()).find(tag_salida).get(0));
		//return false;

		//range.setStart(contenido, image_in);
		//range.setEnd(contenido, image_out);
		ed.selection.setRng(rng2);

		if(SHOW_DEBUG===true) console.log('inicio: '+inicio);

		//var contenido = tinyMCE.activeEditor.getBody().innerHTML;

		//var pattern = new RegExp(image_in+'(.*?)'+image_out);			if(SHOW_DEBUG===true) console.log('pattern: '+pattern);
		//var newContent = contenido.replace(pattern, "XXXX <span class=\"hilite\">($1)</span> XXX ");

		//var image_in	= component_text_area.get_tinymce_index_in_img(id);	if(SHOW_DEBUG===true) console.log('pattern: '+pattern);

		//var pattern		= new RegExp(image_in,'g');
		//var newContent 	= contenido.replace(pattern, "XX ($1)");		//if(SHOW_DEBUG===true) console.log('newContent: '+newContent);

		//var image_out	= component_text_area.get_tinymce_index_out_img(id);
		//newContent 	= newContent.replace(image_out, "($1)</span>");		//if(SHOW_DEBUG===true) console.log('newContent: '+newContent);

		//var newContent ="hola2;";
		//ed.focus();
		//ed.setContent(newContent);

		return ;
	}//end HighlightText
	*/



	/**
	* RELOAD_COMPONENT_WITH_LANG
	* Configures the current component_text_area wrapper and reloads
	*/
	this.reload_component_with_lang = function(data) {

		const selector = '[role="wrap_component_text_area"][data-tipo="'+data.tipo+'"][data-section_tipo="'+data.section_tipo+'"][data-parent="'+data.parent+'"]'
		const wrapper  = document.querySelector(selector);
			//console.log(wrapper);
		if (wrapper && typeof wrapper!=='undefined') {

			// Update wrapper dataset lang
			wrapper.dataset.lang = data.lang

			// Update wrapper id
			var ar_parts = wrapper.id.split('_');
			if (typeof ar_parts[4]!=='undefined' && ar_parts[4].indexOf('lg-') > -1) {
				ar_parts[4] = data.lang
				wrapper.id = ar_parts.join(['_']); // separador =
			}else{
				console.error("[component_text_area:reload_component_with_lang] Error: Lang of wrapper_id not found!", wrapper);
			}
			// console.log(wrapper.id);

			// Reload component_text_area
			component_common.load_component_by_wrapper_id(wrapper.id)
		}
	}//end reload_component_with_lang



	/**
	* LINK_TERM
	* Re-send request to proper class
	*/
	this.link_term = function(section_id, section_tipo, label) {
		if(page_globals.modo === "tool_structuration"){
			tool_structuration.add_index(section_id, section_tipo, label)
		}else{
			tool_indexation.add_index(section_id, section_tipo, label)
		}
	}//end link_term



	/**
	* GET_LAST_ELEMENT
	* @return
	*/
	this.get_last_element = function(ed, type) {

		const last_tag_id = this.get_last_tag_id(ed, type)

		if (this.is_tiny(ed)===true) {
			var ar_elements  = ed.dom.select('[data-type="'+type+'"]')
		}else{
			var ar_elements  = ed.querySelectorAll('[data-type="'+type+'"]')
		}

		const len = ar_elements.length
		for (let i = len - 1; i >= 0; i--) {

			if (ar_elements[i].dataset.tag_id==last_tag_id) {
				//console.log(ar_elements[i]);
				return ar_elements[i]
			}
		}

		return null;
	}//end get_last_element



	/**
	* UNWRAP_ELEMENT
	* @return
	*/
	this.unwrap_element = function(el) {
		// get the element's parent node
		const parent = el.parentNode;

		// move all children out of the element
		while (el.firstChild) parent.insertBefore(el.firstChild, el);

		// remove the empty element
		parent.removeChild(el);
	}//end unwrap_element




	/*	PERSON
	----------------------------------------------------------------------------------------- */



	/**
	* LOAD_TAGS_PERSON
	* @return promise
	*/
	this.load_tags_person = function(button_obj, hide) {

		const start = new Date().getTime();

		if (!button_obj) {
			var button_obj = document.querySelector('[data-role="text_area_transcription"]')
		}

		// From component wrapper
		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log("[component_text_area.load_tags_person] button_obj", button_obj);
				return alert("component_text_area:load_tags_person: Sorry: wrap_div dom element not found")
			}

		const editor_panel = wrap_div.querySelector('.content_data')
			if (editor_panel === null ) {
				return alert("component_text_area:load_tags_person: Sorry: editor_panel dom element not found")
			}
		var persons_overlay = document.getElementById('persons_overlay')
			if (!persons_overlay) {
					persons_overlay = document.createElement('div')
					persons_overlay.id = 'persons_overlay'
					persons_overlay.style.display = ''
			}else{
				if (persons_overlay.style.display==='none') {
					persons_overlay.style.display = '';
				}else{
					persons_overlay.style.display = 'none';
				}
				return false
			}

		const trigger_vars = {
			mode 		 : 'load_tags_person',
			tipo 		 : wrap_div.dataset.tipo,
			parent 		 : wrap_div.dataset.parent,
			section_tipo : wrap_div.dataset.section_tipo,
			lang 		 : wrap_div.dataset.lang,
			top_tipo 	 : page_globals.top_tipo // Important !
		}
		//return console.log("[component_text_area.load_tags_person] trigger_vars", trigger_vars);

		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.load_tags_person] response", response);
			}

			editor_panel.appendChild(persons_overlay)

			if (response===null) {
				persons_overlay.innerHTML = "<div>null value was received</div>"
			}else{
				var parse_tags_person = component_text_area.parse_tags_person(response.result)
				persons_overlay.appendChild(parse_tags_person)
			}


			const button_close = document.createElement('div')
				button_close.classList.add('button_close')
				button_close.addEventListener('click', function() {
					//html_page.close_content(this.parentNode)
					//persons_overlay.remove()
					persons_overlay.style.display = 'none';
				});
				persons_overlay.appendChild(button_close)

			 if (SHOW_DEBUG===true) {
				let time = new Date().getTime() - start;
				//console.log("[component_text_area:load_tags_person] execution time: " +time+' ms');
			 }

			// Unactive overlay
			// html_page.loading_content( wrap_div, 0 );

			if (hide===true) {
				persons_overlay.style.display = 'none';
			}
		})

		return js_promise
	}//end load_tags_person



	/**
	* PARSE_TAGS_PERSON
	* @return dom element wrap
	*/
	this.parse_tags_person = function(data) {

		const ul = document.createElement('ul')

		const len = data.length
		for (let i = 0; i < len; i++) {

			var element = data[i]
			var li = document.createElement('li')
			// Tag image
			var container = document.createElement('div')
				//container.innerHTML = element.tag_image
				//var tag_id = component_text_area.get_last_tag_id('person') + 1 //  tag_type, note_number, state, label, data
				//console.log(data[i].data);
				var data_safe = JSON.stringify(data[i].data);	//replaceAll('"', '\'', JSON.stringify(data[i].data));
				container = component_text_area.build_dom_element_from_data('person', data[i].tag_id, data[i].state, data[i].label, data_safe)
				li.appendChild(container)

			// Key info
			var t 	  	 = document.createTextNode('Keyboard: Control + '+i)
			var key_info = document.createElement('strong')
				key_info.appendChild(t)
				li.appendChild(key_info)
			// Name
			/*
			var t 	  = document.createTextNode('Name')
			var label = document.createElement('label')
				label.appendChild(t)
				li.appendChild(label)
			*/
			var t  = document.createTextNode(element.full_name)
			var span  = document.createElement('span')
				span.appendChild(t)
				li.appendChild(span)

			// Rol
			var t 	  = document.createTextNode('('+element.role+')')
			var label = document.createElement('label')
				label.appendChild(t)
				li.appendChild(label)

			// LI click add event click
			var info = {
				state  : data[i].state,
				tag_id : data[i].tag_id,
				label  : data[i].label,
				data   : data[i].data, // locator
			}
			li.dataset.info = JSON.stringify(info)
			// Event click
			/**/
			li.addEventListener("mousedown", function (evt) {
				evt.preventDefault()
				evt.stopPropagation()

				var info_obj = JSON.parse(this.dataset.info)
				// console.log(info);
				// Insert tag
				// Select text editor
				/*
				if (component_text_area.is_tiny()) {

				}

				return	console.log(data);*/
				var ed = tinyMCE.activeEditor
				component_text_area.insert_person_image(ed, info_obj.tag_id, info_obj.state, info_obj.label, info_obj.data, evt)

				// Close persons selector
				component_text_area.load_tags_person()
			});

			ul.appendChild(li)
		}

		var t  = document.createTextNode('Persons') // get_label.personas
		var h1 = document.createElement('h1')
			h1.appendChild(t)

		var wrap = document.createElement('div')
			wrap.appendChild(h1)
			wrap.appendChild(ul)

		// keyboard event add
		if (tinymce.activeEditor) {
			tinymce.activeEditor.on('keydown', function(evt) {

				for (var j = 0; j < len; j++) {
					if (evt.ctrlKey==1 && evt.keyCode==j+48) {
						//console.log("presed key: "+j);
						component_text_area.insert_person_image(this, data[j].tag_id, data[j].state, data[j].label, data[j].data, evt)
					}
				}
			});
		}

		return wrap
	}//end parse_tags_person



	/**
	* INSERT_PERSON_IMAGE
	* Build and insert a image full html code from vars
	* (info_obj.tag_id, info_obj.state, info_obj.label, info_obj.data, evt)
	* @return bool
	*/
	this.insert_person_image = function(ed, tag_id, state, label, data, evt) {
		evt.preventDefault()
		evt.stopPropagation()

		// reload_on_save. Set temporally not reload on save component
		component_text_area.set_reload_on_save(false);

		// data stringify
			data = JSON.stringify(data) || ''

			// Format data Important !!
			data = replaceAll('"', '\'', data);

		const last_tag_id = component_text_area.get_last_tag_id(ed, 'person')

		// IMG : Create and insert image in text // type, tag_id, state, label, data
		const img = component_text_area.build_dom_element_from_data('person', last_tag_id + 1, state, label, data)

		// Select text editor

			// Insert html on editor
			ed.selection.setContent( img.outerHTML, {format:'raw'} )

			ed.setDirty(true); // Set editor content as changed
			ed.isNotDirty = false; // Force not dirty state

		// Restore default save behaviour after add image
		setTimeout(function(){

			component_text_area.set_reload_on_save(true);
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.insert_person_image] Set person ", label)
				console.log("[component_text_area.insert_person_image] ed.isDirty: ", ed.isDirty())
			}

		}, 300)


		// ed.focus();
		// ed.setDirty(true); // Set editor content as changed
		// ed.isNotDirty = false; // Force not dirty state

		//component_text_area.saveable = true;

		// // Update editor
		// var ed = tinyMCE.activeEditor;
		// 	ed.setContent(img_html + " "); //, {format : 'raw'}
		// 	ed.focus();
		// 	ed.setDirty(true);	// Force dirty state

		// // Save modified content
		// var input_text_area = document.querySelector('.css_text_area')
		// 	if (input_text_area) {
		// 		return component_text_area.Save( input_text_area, null, ed );
		// 	}

		return true
	}//end insert_person_image



	/**
	* SHOW_PERSON_INFO
	* @return promise
	*/
	this.show_person_info = function( ed, evt, text_area_component ) {

		if (!evt.target.dataset) {
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.show_person_info] evt.target: ", evt.target);
				console.log("[component_text_area.show_person_info] Person info is only available in transcription mode. ", page_globals.modo);
			}
			//return false;
		}


		//if(SHOW_DEBUG!==true) return false; // Working here !!!
		var tag_obj = evt.target
		var label 	= tag_obj.dataset.label
		var div_id  = 'person_info' + label
			//console.log(div_id); return;

		// Hide others
		var ar_labels = document.querySelectorAll('div.person_info_float')
		var len = ar_labels.length; //console.log(len)
		for (var i = len - 1; i >= 0; i--) {
			if(ar_labels[i].label!==div_id) {
				ar_labels[i].style.display = 'none';
			}
		}

		if (this.is_tiny(ed)===true) {
			var label_x = evt.x - 25
			var label_y = evt.y + 50
		}else{
			var label_x = evt.layerX - 25
			var label_y = evt.layerY + 50
		}


		var div = document.getElementById(div_id)
		if (div) {
			if (div.style.display==='none') {
				div.style.display = '';
			}else{
				div.style.display = 'none';
			}
			div.style.left = label_x +'px';
			div.style.top  = label_y +'px';
			return false;
		}

		//var text_area_tool_transcription = document.querySelector('.text_area_tool_transcription')
		var text_area_tool_transcription = document.getElementById(this.wrapper_id)

		//console.log(id);
		var locator = this.get_data_locator_from_tag(tag_obj)
			//console.log(locator); return;

		var trigger_vars = {
				mode 	: 'show_person_info',
				locator : JSON.stringify(locator)
			}
			//console.log("trigger_vars",trigger_vars)

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log("[component_text_area.show_person_info] response:", response);
					}

					if (response && response.result) {
						var t_name 	= document.createTextNode(response.result.full_name)
						var t_role 	= document.createTextNode(" ("+response.result.role+") ")
						var t_x 	= document.createTextNode("x")
						var div = document.createElement('div')
							div.classList.add('person_info_float')
							div.id 		   = div_id
							div.style.left = label_x +'px';
							div.style.top  = label_y +'px';

							// Append text
							div.appendChild(t_name)
							div.appendChild(t_role)

							// Close link
							var a_close = document.createElement('a')
								a_close.appendChild(t_x)
								a_close.addEventListener("click", function (e) {
									this.parentNode.style.display = 'none'
								});
								div.appendChild(a_close)

						// Add to text_area_tool_transcription container
						if(text_area_tool_transcription) text_area_tool_transcription.appendChild(div)
					}else{
						alert("Error. response is null")
					}
			})

		return js_promise
	}//end show_person_info




	/*	NOTES
	----------------------------------------------------------------------------------------- */



	/**
	* CREATE_NEW_NOTE
	* Build a new annotation when user clicks on text editor button
	*
	* @return
	*/
	this.create_new_note = function(ed, evt, text_area_component) {

		// Select text editor
		//var ed 		 	= tinyMCE.activeEditor
		let tag_type 	= 'note'
		let last_tag_id = component_text_area.get_last_tag_id(ed, tag_type)
		let note_number = parseInt(last_tag_id) + 1

		const trigger_vars = {
			mode 		 	: 'create_new_note',
			note_number		: note_number,
		}
		//console.log(trigger_vars); return;

		let js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.create_new_note] response", response);
			}

			if (response===null) {
				alert("Error on create annotation tag")
			}else{

				let label = note_number
				let state = 'a'
				let data  = JSON.stringify(response.result)
					data  = replaceAll('"', '\'', data); // Format data Important !!

				// IMG : Create and insert image in text
				//var img_html = component_text_area.build_note_img(label, state, data)
				let img = component_text_area.build_dom_element_from_data(tag_type, note_number, state, label, data)

				if (component_text_area.is_tiny(ed)===false) {
					// Insert html on editor
					let selection = document.getSelection()
						//console.log(selection)
					let rg = selection.getRangeAt( 0 )
						//console.log(rg)
						// Set collapse false to go to end of range
						rg.collapse(false);
						// Insert node
						rg.insertNode(img)

					tool_structuration.update_titles_on_save=false

					component_text_area.set_reload_on_save(false)
					component_text_area.set_content_is_changed(true)

					var component_obj = ed

				}else{
					let img_html 	= img.outerHTML

					ed.selection.collapse()

					// Insert html on editor
					ed.selection.setContent( img_html, {format:'raw'} )

					// Set editor as modified and save
					ed.setDirty(true)

					var component_obj = text_area_component
				}

				let text_area_wrapper = component_common.get_wrapper_from_element(component_obj)

				// Fix data in global class
				// Fix selected_tag_data
				component_text_area.selected_tag_data = {
					type 			: tag_type,
					tag_id 			: note_number,
					component_tipo 	: text_area_wrapper.dataset.tipo,
					lang 			: text_area_wrapper.dataset.lang
				}
				if(SHOW_DEBUG===true) {
					console.log("[component_text_area.create_new_note] Fixed class var selected_tag_data:",component_text_area.selected_tag_data);
				}


				// Save text area
				var js_promise_save = component_text_area.Save( component_obj, null, ed )
				if (js_promise_save) {
					js_promise_save.then(function(response){

						setTimeout(function(){
							// On finish save, select created tag (the last) and trigger click action
							if (component_text_area.is_tiny(ed)===false) {
								var last_tag_obj = component_text_area.get_last_element(ed, 'note')
								if (last_tag_obj) {

									// Fix var
									component_text_area.tag_obj = last_tag_obj

									// Click event of section tag
									img.addEventListener("click", function(evt_click){
										// Show note info
										component_text_area.show_note_info( ed, evt_click, component_obj )
									},false)

									img.click()
								}
							}else{
								var last_tag_obj = component_text_area.get_last_element(ed, 'note')
								if (last_tag_obj) {
									// Select image in text editor
									ed.selection.select(last_tag_obj).click(); //select the inserted element // .scrollIntoView(false)
									// Trigger exec click on selected tag
									//last_tag_obj.click();
								}
							}
						},150)
					});
				}
			}
		})

		return js_promise
	}//end create_new_note



	/**
	* SHOW_NOTE_INFO
	* @return promise js_promise
	*/
	this.show_note_info = function( ed, evt, text_area_component ) {

		//console.log("[component_text_area.show_note_info] ed, evt, text_area_component", ed, evt, text_area_component);

		let tag_obj 	 = evt.target
		let tag 		 = evt.target.id
		let locator 	 = component_text_area.get_data_locator_from_tag( tag_obj )
		let section_tipo = locator.section_tipo
		let section_id 	 = locator.section_id
		let tag_id 		 = tag_obj.dataset.tag_id


		if(SHOW_DEBUG===true) {
			//console.log("[component_text_area.show_note_info] selected_tag_editor", component_text_area.selected_tag_editor);
			//console.log("component_text_area.tag_obj",component_text_area.tag_obj);
			//console.warn("[component_text_area.show_note_info]component_text_area.selected_tag_data",component_text_area.selected_tag_data);
		}

		const trigger_vars = {
				mode			: 'show_note_info',
				section_tipo	: section_tipo,
				section_id		: section_id,
				lang			: text_area_component.dataset.lang
			}
			//console.log("[component_text_area.show_note_info] trigger_vars ",trigger_vars); //return

		let js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.show_note_info] response", response);
			}

			if (response===null) {
				alert("Error on show_note_info. See server log for details")
			}else{

				//$('#div_note_wrapper').remove()

				// Build note_dialog
				let note_dialog = component_text_area.build_note_dialog({
						wrapper_id 		 	: "div_note_wrapper",
						evt 	  			: evt,
						response  		 	: response,
						tag_id 				: tag_id,
						ed 				 	: ed,
						text_area_component : text_area_component
				})
				document.body.appendChild(note_dialog)
				exec_scripts_inside(note_dialog)


				// Open dialog Bootstrap modal
				$(note_dialog).modal({
					show 	  : true,
					keyboard  : true,
					cssClass  : 'modal'
				}).on('shown.bs.modal', function (e) {
					// Focus text area field
					if (component_text_area.is_tiny(ed)===true) {
						tinymce.execCommand('mceFocus',false,ed.id);
					}else{
						if(SHOW_DEBUG===true) {
							console.log("[component_text_area.show_note_info] not is tiny");
						}
					}

					/*
					// UID for init object tracking (not add lang never here!)
					var div_note_wrapper  		= document.getElementById('div_note_wrapper')
					var text_area_note_wrapper 	= div_note_wrapper.querySelector('.css_wrap_text_area')
						init_uid = text_area_note_wrapper.dataset.section_tipo +"_"+ text_area_note_wrapper.dataset.parent +"_"+ text_area_note_wrapper.dataset.tipo
						*/
				}).on('hidden.bs.modal', function (e) {

					// Update lock_components state (BLUR)
					if(typeof lock_components!='undefined') {
						// Unlock all components of current section on close note dialog
						lock_components.delete_user_section_locks({
							section_id   : section_id,
							section_tipo : section_tipo
						})
					}

					// Removes modal element from DOM on close
					$(this).remove()
					/*
					// Delete init property to force reinit on new click over note
					delete component_text_area.inited[init_uid]
					if(SHOW_DEBUG===true) {
						console.log("[component_text_area.show_note_info] Deleted property inited:", init_uid);
					}*/
				})
			}
		})

		return js_promise
	}//end show_note_info



	/**
	* BUILD_NOTE_DIALOG
	* @return DOM object
	*/
	this.build_note_dialog = function( options ) {

		let wrapper_id = options.wrapper_id
		let older_div_note_wrapper = document.getElementById(wrapper_id)
			if (older_div_note_wrapper) {
				older_div_note_wrapper.parentNode.removeChild(older_div_note_wrapper)
			}
		// note wrapper
		let div_note_wrapper = document.createElement("div")
			div_note_wrapper.id = wrapper_id


		let header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			let h4 = document.createElement("h4")
				h4.classList.add('modal-title')
				// Add
				h4.appendChild( document.createTextNode("Note " + options.tag_id + " - Created by user "+options.response.created_by_user_name) )
				header.appendChild(h4)


		let body = document.createElement("div")
			// component_text element
			let component_text = document.createElement("div")
				component_text.innerHTML = options.response.component_text_html
				body = component_text
				//exec_scripts_inside(component_text)

		let footer = document.createElement("div")

			// Button delete <button type="button" class="btn btn-warning">Warning</button>
			let button_delete = document.createElement("button")
				button_delete.classList.add("btn","btn-warning","btn-sm","button_delete_note")
				button_delete.dataset.dismiss = "modal"
				button_delete.addEventListener('click', function(e) {

					if (!options.evt.target) {
						// New tag case. Select last tag
						var current_tag_obj = component_text_area.get_last_element(options.ed, 'note')
					}else{
						// Normal selection case
						var current_tag_obj = options.evt.target
					}

					// Fix current tag_obj
					component_text_area.tag_obj = current_tag_obj

					// Inject options tag_obj
					options.tag_obj = current_tag_obj

					component_text_area.delete_note(this, options)
				})
				button_delete.appendChild( document.createTextNode(get_label.borrar) )
				// Add
				footer.appendChild(button_delete)

			// created_date
			let created_date = document.createElement("div")
				created_date.classList.add('created_date')
				created_date.appendChild( document.createTextNode("Created date "+options.response.created_date) )
				// Add
				footer.appendChild(created_date)

			// Button ok <button type="button" class="btn btn-warning">OK</button>
			let button_ok = document.createElement("button")
				button_ok.classList.add("btn","btn-success","btn-sm","button_ok_note")
				button_ok.dataset.dismiss = "modal"
				button_ok.addEventListener('click', function(e) {
					//let ed = tinyMCE.activeEditor
					let ed = options.ed
					if (component_text_area.is_tiny(ed)) {
						ed.save()
					}
				})
				button_ok.appendChild( document.createTextNode("  OK  ") )
				// Add
				footer.appendChild(button_ok)


		// modal dialog
		let modal_dialog = common.build_modal_dialog({
			id 		: wrapper_id,
			header 	: header,
			footer  : footer,
			body 	: body
		})

		div_note_wrapper.appendChild(modal_dialog)


		return modal_dialog
	}//end build_note_dialog



	/**
	* DELETE_NOTE
	* @return
	*/
	this.delete_note = function( button_obj, options ) {

		if (!confirm(get_label.borrar + " " +get_label.etiqueta+ " " +options.tag_id+" ?")) {
			return false;
		}
		if(SHOW_DEBUG===true) {
			//console.log(options); return;
		}

		// Editor where is the note tag (note is NOT the current tinymce.activeEditor)
		var ed 			 = options.ed
		var text_area_obj= options.text_area_component
		var tag_obj 	 = options.tag_obj
		var locator		 = component_text_area.get_data_locator_from_tag( tag_obj )

		var trigger_vars = {
			mode			: 'delete_note',
			section_tipo	: locator.section_tipo,
			section_id		: locator.section_id,
			lang			: this.lang,
		}
		//console.log(trigger_vars); return;
		//console.log(tag_obj); return;

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log("[component_text_area.delete_note] response:", response);

			if (response===null) {
				alert("Error on delete_note")
			}else{

				if (component_text_area.is_tiny(ed)===true) {
					// CASE TINYMCE

					// Remove image in editor
					var image_note = ed.selection.getNode()
					if (image_note && image_note.nodeName==='IMG') {
						// Image is already selected
					}else{
						// Image is created and deleted. Locate last image note
						image_note = component_text_area.get_last_element(ed,'note');
					}

					if (image_note && image_note.nodeName==='IMG') {
						// Remove img
						ed.dom.remove(image_note)

						// Set editor as modified and save
						ed.setDirty(true)
						component_text_area.Save( text_area_obj, null, ed )
					}
				}else{
					// CASE PREVIEW TEXT EDITOR (STRUCTURATION)

					// Remove tag from DOM
					tag_obj.remove()

					// Config save to avoid update toc titles
					tool_structuration.update_titles_on_save=false

					// Save
					tool_structuration.save_structuration_text()
				}//end if (component_text_area.is_tiny(ed)===true)
			}
		})

		return js_promise
	}//end delete_note




	/*	REFERENCES
	----------------------------------------------------------------------------------------- */



	/**
	* CREATE_NEW_REFERENCE
	* @return
	*/
	this.create_new_reference = function(ed, evt, text_area_component) {
		//console.log(ed);	console.log(evt);	console.log(text_area_component);

		if (this.is_tiny(ed)===true) {
			var string_selected = ed.selection.getContent({format:'raw'}) // Get the selected text in raw format
			var component_obj 	= text_area_component
		}else{
			var selObj 	 		= window.getSelection();
			var string_selected = selObj.toString();
			var component_obj 	= ed
		}

		const string_len 		= string_selected.length
			if(string_len<1) return alert("Please, select a text fragment before ! " + string_len)


		// LAST_TAG_ID
		if (this.is_tiny(ed)===true) {
			var container   = document.createElement('div')
				container.innerHTML = ed.getContent()
		}else{
			var container = ed
		}
		let last_tag_id = parseInt( component_text_area.get_last_tag_id(container, 'reference') )
			//console.log(last_tag_id); return;

		// New tag_id to use
		let new_id = parseInt(last_tag_id+1)
			//console.log(new_id); return;

		// State. Default is 'n' (normal)
		let state = 'n'

		// Daata
		let data = '[]'

		// Create new DOM element
		let el = document.createElement("reference")
			el.classList.add('reference')
			el.id 				= 'reference_'+ new_id
			el.dataset.state 	= state
			el.dataset.tag_id 	= new_id
			el.dataset.label 	= 'reference '+ new_id
			el.dataset.data  	= data

		let tag_obj_id = el.id

		// Inject selection
		el.innerHTML = string_selected
			//console.log(el.outerHTML); return

		if (this.is_tiny(ed)===true) {

			// Set content to text editor
			var reference_string =  " "+el.outerHTML.trim()+" "
			ed.selection.setContent(reference_string, {format:'raw'})

			setTimeout(function(){
				var tag_obj = ed.dom.select('#'+tag_obj_id); //console.log(tag_obj);
				if (tag_obj.length===1) {
					tag_obj[0].click()
				}
			},300)

		}else{
			var selRange = selObj.getRangeAt(0);

			// Remove current selection (data is already copied into new div element)
			selRange.deleteContents()

			// Insert created node and contents in same range position
			selRange.insertNode(el)

			// Add listener
			el.addEventListener("click", function(evt){
				// Show reference info

				component_text_area.show_reference_info( ed, evt, component_obj )
			},false)

			setTimeout(function(){
				var tag_obj = document.getElementById(tag_obj_id);
				if (tag_obj) {
					tag_obj.click()
				}
			},300)
		}

		/*
		// Force dirty state
		ed.setDirty(true);

		// Save
		var js_promise = component_text_area.Save(text_area_component, null, ed)
			js_promise.then(function(response) {
				// Action on finish save
				// console.log(response);
				setTimeout(function(){
					var tag_obj = ed.dom.select('#'+tag_obj_id); //console.log(tag_obj);
					if (tag_obj.length===1) {
						tag_obj[0].click()
					}
				},300)

			})*/
	}//end create_new_reference



	/**
	* SHOW_REFERENCE_INFO
	* @return promise js_promise
	*/
	this.show_reference_info = function( ed, evt, text_area_component ) {

		const tag_obj 	= evt.target
		const tag_id 	= tag_obj.dataset.tag_id

		// Actual data
			const data = replaceAll("'", '"', tag_obj.dataset.data)
			//console.log(data);

		// trigger
			const trigger_url  = component_text_area.url_trigger
			const trigger_vars = {
				mode	: 'show_reference_info',
				lang	: text_area_component.dataset.lang,
				data 	: data
			}; //console.log(trigger_vars); return;

		// get_json_data promise
			const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_text_area.show_reference_info] response:", response);
				}

				if (response===null) {

					alert("Error on show_reference_info. See server log for details")

				}else{

					// reference_dialog build
					const reference_dialog = component_text_area.build_reference_dialog({
						"evt" 	  	 			: evt,
						"response"   			: response,
						"tag_id" 	 			: tag_id,
						"ed" 		 			: ed,
						"text_area_component" 	: text_area_component
					})
					document.body.appendChild(reference_dialog)
					exec_scripts_inside(reference_dialog)

					const wrapper = reference_dialog.querySelector('.css_wrap_component_autocomplete_hi')

					// Open dialog Bootstrap modal
					$(reference_dialog).modal({
						show 	  : true,
						keyboard  : true,
						cssClass  : 'modal'
					}).on('shown.bs.modal', function (e) {
						// Focus first input on show dialog
						if (wrapper) {
							wrapper.click()
						}
					}).on('hidden.bs.modal', function (e) {
						// Get first input on show dialog
						// Update lock_components state (BLUR)
						if(wrapper && typeof lock_components!=='undefined') {
							// Unlock all components of current section on close note dialog
							lock_components.delete_user_section_locks({
								section_id   : wrapper.dataset.parent,
								section_tipo : wrapper.dataset.section_tipo
							})
						}
						// Removes modal element from DOM on close
						$(this).remove()
					})
				}
			})

		return js_promise
	}//end show_reference_info



	/**
	* BUILD_REFERENCE_DIALOG
	* @return DOM object
	*/
	this.build_reference_dialog = function( options ) {

		const wrapper_id = "div_reference_wrapper"
		const older_div_wrapper = document.getElementById(wrapper_id)
			if (older_div_wrapper) {
				older_div_wrapper.parentNode.removeChild(older_div_wrapper)
			}
		// reference wrapper
		const div_wrapper 	 = document.createElement("div")
			  div_wrapper.id = wrapper_id

		const header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			const h4 = document.createElement("h4")
				h4.classList.add('modal-title')
				// Add
				h4.appendChild( document.createTextNode("Reference " + options.tag_id) )
				header.appendChild(h4)

		const body = document.createElement("div")
			// component_autocomplete / hi element
			const component = document.createElement("div")
				component.classList.add('reference_container')
				component.innerHTML = options.response.component_html
				body.appendChild(component)
				//exec_scripts_inside(component)


		const footer = document.createElement("div")
			// DELETE Button delete <button type="button" class="btn btn-warning">Warning</button>
			const button_delete = document.createElement("button")
				button_delete.classList.add("btn","btn-warning","btn-sm","button_delete_reference")
				button_delete.dataset.dismiss = "modal"
				button_delete.addEventListener('click', function() {
					component_text_area.delete_reference(this, options)
				})
				button_delete.appendChild( document.createTextNode(get_label.borrar) )
				// Add
				footer.appendChild(button_delete)

			// APPLY Button ok <button type="button" class="btn btn-warning">OK</button>
			const button_ok = document.createElement("button")
				button_ok.classList.add("btn","btn-success","btn-sm","button_apply_reference")
				button_ok.dataset.dismiss = "modal"
				button_ok.addEventListener('click', function() {
					component_text_area.update_reference(this, options)
				})
				button_ok.appendChild( document.createTextNode("  "+get_label["aplicar"]+"  ") )
				// Add
				footer.appendChild(button_ok)

		// modal dialog
		const modal_dialog = common.build_modal_dialog({
			id 		: wrapper_id,
			header 	: header,
			footer  : footer,
			body 	: body
		})
		div_wrapper.appendChild(modal_dialog)


		return modal_dialog
	}//end build_reference_dialog



	/**
	* DELETE_REFERENCE
	* @return
	*/
	this.delete_reference = function(button_obj, options) {
		//console.log(options);

		if (!options.evt.target) {
			console.log("Error [delete_reference]. options.evt.target not found ");
			return false
		}

		this.unwrap_element(options.evt.target)

		const ed 			= options.ed
		const component_obj = options.text_area_component

		if (this.is_tiny(ed)===true) {
			// Set editor as dirty
			ed.setDirty(true) // Force dirty state

			// Save
			var js_promise = component_text_area.Save( component_obj, null, ed )

		}else{

			// Config save to avoid update toc titles
			tool_structuration.update_titles_on_save=false

			// Save
			tool_structuration.save_structuration_text(null)
		}

		return true
	}//end delete_reference



	/**
	* UPDATE_REFERENCE
	* @return bool
	*/
	this.update_reference = function(button_obj, options) {
		//console.log(button_obj); console.log(options); return;

		if (!options.evt.target) {
			console.log("[component_text_area.update_reference] Error. options.evt.target not found ", options.evt.target);
			return false
		}

		// Get actual value
		const div_reference_wrapper = document.getElementById('div_reference_wrapper')
			if (!div_reference_wrapper) {
				console.log("[component_text_area.update_reference] Error. div_reference_wrapper not found ", div_reference_wrapper);
				return false
			}

		// dato_hidden. select in DOM
		const input = div_reference_wrapper.querySelector("input[data-role='dato_hidden']");
			if (!input) {
				console.log("[component_text_area.update_reference] Error. input not found (maybe you don't have privileges)", input);
				return false
			}
		const value = JSON.parse(input.value)
			//console.log(value);
			if (!value || value.length<1) {
				console.log("[component_text_area.update_reference] Error. value.length < 1 ", value);
				return false
			}

		// Set value to text reference tag dataset
		let data = JSON.stringify(value)
					// Format data Important !!
					data = replaceAll('"', "'", data)
					//console.log(data);

		if (options.evt.target.dataset.data!==data) {

			// Replaces dataset 'data' value with new data
			options.evt.target.dataset.data = data

			const ed = options.ed

			if (this.is_tiny(ed)===true) {
				// Set editor as dirty
				ed.setDirty(true) // Force dirty state
				var component_obj = options.text_area_component

				var js_promise = component_text_area.Save( component_obj, null, ed ).then(function(response){
						if(SHOW_DEBUG===true) {
							console.log("[component_text_area.update_reference] Save response:", response, options);
						}
					})
			}else{
				var component_obj = ed
				// Save
				tool_structuration.save_structuration_text(null, false)
			}
		}

		return true
	}//end update_reference



	/*	GEO
	----------------------------------------------------------------------------------------- */



	/**
	* LOAD_TAGS_GEO
	* @return
	*/
	this.load_tags_geo = function(ed, evt, text_area_component) {
		if(SHOW_DEBUG===true) {
			//console.log("+++++++ text_area_component:",text_area_component);;
		}
		//mce_editor.write_tag('geo', ed, evt, text_area_component)
		// Select text editor

		const tag_type = 'geo'

		mce_editor.write_tag(tag_type, ed, evt, text_area_component)
		ed.setDirty(true)

		return true;
		/*
		var last_tag_id = component_text_area.get_last_tag_id(ed, tag_type)
		var note_number = parseInt(last_tag_id) + 1

		const trigger_vars = {
			mode 		 	: 'create_new_note',
			note_number		: note_number,
		}
		//console.log(trigger_vars); return;

		const js_promise = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log("[component_text_area.create_new_note] response", response);

			if (response===null) {
				alert("Error on create annotation tag")
			}else{

				var label = note_number
				var state = 'a'
				var data  = JSON.stringify(response.result)
					data  = replaceAll('"', '\'', data); // Format data Important !!

				// IMG : Create and insert image in text
				//var img_html = component_text_area.build_note_img(label, state, data)
				var img = component_text_area.build_dom_element_from_data(tag_type, note_number, state, label, data)

				if (component_text_area.is_tiny(ed)===false) {
					// Insert html on editor
					var selection = document.getSelection()
						//console.log(selection)
					var rg = selection.getRangeAt( 0 )
						//console.log(rg)
						// Set collapse false to go to end of range
						rg.collapse(false);
						// Insert node
						rg.insertNode(img)

					tool_structuration.update_titles_on_save=false

					component_text_area.set_reload_on_save(false)
					component_text_area.set_content_is_changed(true)

					var component_obj = ed

				}else{
					var img_html 	= img.outerHTML

					ed.selection.collapse()

					// Insert html on editor
					ed.selection.setContent( img_html, {format:'raw'} )

					// Set editor as modified and save
					ed.setDirty(true)

					var component_obj = text_area_component
				}


				// Save
				var js_promise_save = component_text_area.Save( component_obj, null, ed )
				if (js_promise_save) {
					js_promise_save.then(function(response){

						setTimeout(function(){
							// On finish save, select created tag (the last) and trigger click action
							if (component_text_area.is_tiny(ed)===false) {
								var last_tag_obj = component_text_area.get_last_element(ed, 'note')
								if (last_tag_obj) {

									// Fix var
									component_text_area.tag_obj = last_tag_obj

									// Click event of section tag
									img.addEventListener("click", function(evt_click){
										// Show note info
										component_text_area.show_note_info( ed, evt_click, text_area_component )
									},false)

									img.click()
								}
							}else{
								var last_tag_obj = component_text_area.get_last_element(ed, 'note')
								if (last_tag_obj) {
									// Select image in text editor
									ed.selection.select(last_tag_obj).click(); //select the inserted element // .scrollIntoView(false)
									// Trigger exec click on selected tag
									//last_tag_obj.click();
								}
							}
						},150)
					});
				}
			}
		})

		return js_promise;
		*/
	}//end load_tags_geo



	/*	IMAGE TAG
	----------------------------------------------------------------------------------------- */



	/**
	* CREATE_NEW_IMAGE_TAG
	* Build a new image tag when user clicks on text editor button
	* Auto open selector editor 'show_image_info'
	* @return prdom elementmise
	*/
	this.create_new_image_tag = function(ed, evt, text_area_component) {

		const self = this

		// Select text editor
		const tag_type 		= 'image'
		const last_tag_id 	= component_text_area.get_last_tag_id(ed, tag_type)
		const tag_number 	= parseInt(last_tag_id) + 1
		const tag_state 	= 'a'
		const tag_label 	= tag_number
		const tag_data 		= '[]'

		// img : Create and insert image in text
			const img = component_text_area.build_dom_element_from_data(tag_type, tag_number, tag_state, tag_label, tag_data)

		// Insert html on editor
			ed.selection.collapse()

			// Insert html on editor
			ed.selection.setContent( img.outerHTML, {format:'raw'} )

			// Set editor as modified and save
			ed.setDirty(true)


		// Select image in text editor and exec auto click event
			const last_tag_obj = component_text_area.get_last_element(ed, tag_type)
			last_tag_obj.click()


		return last_tag_obj
	}//end create_new_image_tag



	/**
	* SHOW_IMAGE_INFO
	* @return
	*/
	this.show_image_info = function(ed, evt, text_area_component) {

		const text_area_wrapper = component_common.get_wrapper_from_element(text_area_component)

		const component_tipo = text_area_wrapper.dataset.tipo
		const data 	 	 	 = evt.target.dataset.data
		const tag_id 		 = evt.target.dataset.tag_id


		const trigger_url 	= component_text_area.url_trigger
		const trigger_vars 	= {
				mode			: 'show_image_info',
				component_tipo	: component_tipo,
				data 			: JSON.parse(data) || []
				// data 			: [{
				// 	section_tipo : "rsc170",
				// 	section_id 	 : 1,
				// 	from_component_tipo : "hierarchy102"
				// }]
			}

		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.show_image_info] response", response);
			}

			if (response===null) {
				alert("Error on show_image_info. See server log for details")
			}else{

				//$('#div_note_wrapper').remove()
					console.log("response.component_html:",response.component_html);

				// Build dialog
				const dialog = component_text_area.build_image_dialog({
						wrapper_id 		 	: "div_note_wrapper",
						evt 	  			: evt,
						component_html  	: response.component_html,
						tag_id 				: tag_id,
						ed 				 	: ed,
						text_area_component : text_area_component
				})
				document.body.appendChild(dialog)
				exec_scripts_inside(dialog)


				// Open dialog Bootstrap modal
				$(dialog).modal({
					show 	  : true,
					keyboard  : true,
					cssClass  : 'modal'
				}).on('shown.bs.modal', function (e) {
					// Focus text area field
					tinymce.execCommand('mceFocus', false, ed.id);
				}).on('hidden.bs.modal', function (e) {
					// Update lock_components state (BLUR)
					// if(typeof lock_components!=='undefined') {
					// 	// Unlock all components of current section on close note dialog
					// 	lock_components.delete_user_section_locks({
					// 		section_id   : section_id,
					// 		section_tipo : section_tipo
					// 	})
					// }
					// Removes modal element from DOM on close
					$(this).remove()
				})
			}
		})

		return js_promise
	};//end show_image_info



	/**
	* BUILD_IMAGE_DIALOG
	* @return DOM object
	*/
	this.build_image_dialog = function(options) {
	console.log("options:",options);

		// const older_div_note_wrapper = document.getElementById(wrapper_id)
		// 	console.log("older_div_note_wrapper:",older_div_note_wrapper,wrapper_id);
		// 	if (older_div_note_wrapper) {
		// 		older_div_note_wrapper.parentNode.removeChild(older_div_note_wrapper)
		// 	}

		const wrapper_id 			= options.wrapper_id
		const evt 					= options.evt
		const component_html 		= options.component_html
		const tag_id 				= options.tag_id
		const ed 					= options.ed
		const text_area_component	= options.text_area_component

		// wrapper
		const div_wrapper = document.createElement("div")
			div_wrapper.id = wrapper_id

		const header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			let h4 = document.createElement("h4")
				h4.classList.add('modal-title')
				// Add
				h4.appendChild( document.createTextNode("Image " + tag_id) )
				header.appendChild(h4)

		const body = document.createElement("div")
			  body.innerHTML = component_html

		const footer = document.createElement("div")

			// Button delete <button type="button" class="btn btn-warning">Warning</button>
			  const button_delete = document.createElement("button")
					button_delete.classList.add("btn","btn-warning","btn-sm","button_delete_note")
					button_delete.dataset.dismiss = "modal"
					button_delete.addEventListener('click', function(e) {

						if (!evt.target) {
							// New tag case. Select last tag
							var current_tag_obj = component_text_area.get_last_element(ed, 'image')
						}else{
							// Normal selection case
							var current_tag_obj = evt.target
						}

						// Fix current tag_obj
						component_text_area.tag_obj = current_tag_obj

						// Inject options tag_obj
						options.tag_obj = current_tag_obj

						component_text_area.delete_note(this, options)
					})
					button_delete.appendChild( document.createTextNode(get_label.borrar) )
					// Add
					footer.appendChild(button_delete)

			// Button ok <button type="button" class="btn btn-warning">OK</button>
			  const button_ok = document.createElement("button")
				  	button_ok.classList.add("btn","btn-success","btn-sm","button_ok_note")
				  	button_ok.dataset.dismiss = "modal"
				  	button_ok.addEventListener('click', function(e) {
						ed.save()
					})
					button_ok.appendChild( document.createTextNode("  OK  ") )
					// Add
					footer.appendChild(button_ok)


		// modal dialog
		const modal_dialog = common.build_modal_dialog({
			id 		: wrapper_id,
			header 	: header,
			footer  : footer,
			body 	: body
		})

		div_wrapper.appendChild(modal_dialog)


		return modal_dialog
	}//end build_image_dialog



	/*	STRUCTURATION INFO
	----------------------------------------------------------------------------------------- */

	/**
	* SHOW_STRUCTURATION_INFO
	* @return
	*/
	this.show_structuration_info = function(ed, evt, text_area_component) {

		let tag_obj 	 		= evt.target
		let section_struct		= find_ancestor(tag_obj, 'section_struct')
		let struct_data_locator = section_struct.dataset.data
		let struct_locator 		= JSON.parse(replaceAll('\'', '"', struct_data_locator))
		let tag 		 		= section_struct.id
		let tag_id 		 		= section_struct.dataset.tag_id
		let wrap_component		= find_ancestor(text_area_component, 'wrap_component')
		// Target div container element

		const trigger_vars = {
			mode 		 	: 'show_structuration_info',
			section_tipo 	: struct_locator.section_tipo,
			section_id 	 	: struct_locator.section_id,
			lang 			: text_area_component.dataset.lang,
			data 			: struct_locator
		}

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
					console.log("[component_text_area.show_structuration_info] response",response);;
			}

			// Build structuration_info
				const structuration_info = component_text_area.build_structuration_info({
						wrapper_id 		 	: "div_structuration_wrapper",
						response  		 	: response,
						tag_id 				: tag_id,
						ed 				 	: ed,
						text_area_component : text_area_component,
						label 				: tag_obj.innerHTML,
						wrap_component 		: wrap_component
				})
				document.body.appendChild(structuration_info)
				exec_scripts_inside(structuration_info)

				// Open dialog Bootstrap modal
				$(structuration_info).modal({
					show 	  : true,
					keyboard  : true,
					cssClass  : 'modal'
				}).on('shown.bs.modal', function (e) {
					// Focus text area field
					if (component_text_area.is_tiny(ed)===true) {
						tinymce.execCommand('mceFocus',false,ed.id);
					}else{
						if(SHOW_DEBUG===true) {
							console.log("[component_text_area.show_note_info] not is tiny");
						}
					}
				}).on('hidden.bs.modal', function (e) {
					// Removes modal element from DOM on close
					$(this).remove()
				})
		})

		return js_promise
	}//end show_structuration_info



	/**
	* BUILD_REFERENCE_DIALOG
	* @return DOM object
	*/
	this.build_structuration_info = function( options ) {

		const wrapper_id = "div_structuration_wrapper"
		const older_div_wrapper = document.getElementById(wrapper_id)
			if (older_div_wrapper) {
				older_div_wrapper.parentNode.removeChild(older_div_wrapper)
			}
		// note wrapper
		let div_wrapper = document.createElement("div")
			div_wrapper.id = wrapper_id


		let header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			let h4 = document.createElement("h4")
				h4.classList.add('modal-title')
				// Add
				//h4.appendChild( document.createTextNode("Structuration " + options.tag_id) )
				h4.appendChild( document.createTextNode( get_label["selected_text"] + ":  " + options.label) )
				header.appendChild(h4)

		let body = document.createElement("div")
			// components element
			let components = document.createElement("div")
				components.classList.add('structuration_container')
				components.innerHTML = options.response.structuration_info.html
				body = components
				//exec_scripts_inside(components)


		let footer = document.createElement("div")

			// APPLY Button ok <button type="button" class="btn btn-warning">OK</button>
			let button_ok = document.createElement("button")
				button_ok.classList.add("btn","btn-success","btn-sm","button_apply_structuration")
				button_ok.dataset.dismiss = "modal"
				button_ok.addEventListener('click', function() {
						//let ed = tinyMCE.activeEditor
						let ed = options.ed
						if (component_text_area.is_tiny(ed)) {
							component_text_area.load_tr(options.wrap_component, ed)
						}
				})
				button_ok.appendChild( document.createTextNode("  "+get_label["aplicar"]+"  ") )
				// Add
				footer.appendChild(button_ok)

		// modal dialog
		const modal_dialog = common.build_modal_dialog({
			id 		: wrapper_id,
			header 	: header,
			footer  : footer,
			body 	: body
		})
		div_wrapper.appendChild(modal_dialog)


		return modal_dialog
	}//end build_reference_dialog



	/* RENDER_TAG_IMAGES. Create image element of the tag and insert into the <img on the fly
	----------------------------------------------------------------------------------------- */



	/**
	* RENDER_ALL_TAGS
	* @return js promise
	*/
	this.render_all_tags = function(container, type, is_tiny) {
		return true; // Unactive now !!
		/*
		// Render tc tags with canvas
		//var start = new Date().getTime();

		let js_promise = new Promise((resolve, reject) => {
			const start = new Date().getTime()
			//window.setTimeout(function(){
				let ar_tc_tags = []
				switch(type) {
					case "tc":
					default:
						if (is_tiny===true) {
							let ed = container
							ar_tc_tags = ed.dom.select('img[data-type="tc"]')
						}else{
							ar_tc_tags = container.querySelectorAll('img[data-type="tc"]')
						}
						break;
				}

				const len = ar_tc_tags.length
				for (let i = 0; i < len; i++) {
					component_text_area.create_tag_image(ar_tc_tags[i])
				}

				if(SHOW_DEBUG===true) {
					const time = new Date().getTime() - start
					console.log("[component_text_area.render_all_tags] "+type+" tags rendered:",len," in ms:",time)
				}
			//}, 1)
		});//end js_promise


		return js_promise;
		*/
	}//end render_all_tags



	/**
	* RENDER_TAG_IMAGE
	* @return
	*/
	var total = 0
	this.render_tag_image = function(label, type) {
		//let label = '00:00:00.000';
		//let start = new Date().getTime();

	    // Create an empty canvas element
	    const canvas = document.createElement("canvas");
		switch(type){
			case "tc":

				canvas.width = 164;
				canvas.height = 30;

			    // Copy the image contents to the canvas
				let ctx = canvas.getContext("2d");
				//ctx.fillRect(0, 0, 300, 300);
				// Set rectangle and corner values
				const x = 0;
				const y = 0;
				let width = 164;
				let height = 30;
				let radius = 30;
				let semi_radius = 15; // radius/2
			    //ctx.drawImage(img, 0, 0);



				// Reference rectangle without rounding, for size comparison
				//ctx.fillRect(200, 50, width, height);

			    // Set faux rounded corners
				ctx.lineJoin = "round";
				ctx.lineWidth = radius;

				// Change origin and dimensions to match true size (a stroke makes the shape a bit larger)
				//ctx.strokeRect(x+(radius/2), y+(radius/2), width-radius, height-radius);
				//ctx.fillRect(x+(radius/2), y+(radius/2), width-radius, height-radius);

				ctx.strokeRect(x+(semi_radius), y+(semi_radius), width-radius, height-radius);
				ctx.fillRect(x+(semi_radius), y+(semi_radius), width-radius, height-radius);
				/*
								ctx.beginPath();
								ctx.moveTo(x + radius, y);
								ctx.lineTo(x + width - radius, y);
								ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
								ctx.lineTo(x + width, y + height - radius);
								ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
								ctx.lineTo(x + radius, y + height);
								ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
								ctx.lineTo(x, y + radius);
								ctx.quadraticCurveTo(x, y, x + radius, y);
								ctx.closePath();
								ctx.fill();


								//fill the rectangle to black
							    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
				*/
				//add label to rect

				//ctx.font="24px Arial"; // Oxygen , san_francisco_displayregular,
				ctx.font="24px Tahoma";
				ctx.textAlign="center";
				ctx.textBaseline = "middle";
				ctx.fillStyle = "#23ED0B";

				/*
				let retina = window.devicePixelRatio > 1;
				if (!retina) {
			    	//canvas.width = canvas.width/2
					//canvas.height = 30/2;

					width  = width/2;
					height = height/2;
					radius = radius/2;
					semi_radius = Math.floor(semi_radius/2); // radius/2
					//ctx.font="12px Tahoma";
				}*/

				ctx.fillText(label,x+(width/2),y+(height/2)-0);

				break
		}//end switch (type)


	    // Get the data-URL formatted image
	    // Firefox supports PNG and JPEG. You could check img.src to
	    // guess the original format, but be aware the using "image/jpg"
	    // will re-encode the image.
	    const dataURL = canvas.toDataURL("image/png");

	    //if(SHOW_DEBUG===true) {
	    	//let end = new Date().getTime(); let time = (end - start);
	    	//console.log("render_tag_image time secs",time);
	    	//total = total + time
	    	//console.log(total);
	    //}

	    return dataURL //.replace(/^data:image\/(png|jpg);base64,/, "");
	}//end render_tag_image


	/**
	* CREATE_TAG_IMAGE
	* @return
	*/
	this.create_tag_image = function(img_object) {

		const label = img_object.dataset.label
		const type  = img_object.dataset.type

		//WORKER TOO NEW!!! is not possible do with canvas elements (09-2017)
		/*
		let render_tag = new Worker( DEDALO_LIB_BASE_URL + '/component_text_area/js/render_tag_image.js');

		render_tag.postMessage({
								"label": label,
								"type": type
								});


		 render_tag.onmessage = function(event) {
		    var response = event.data;
		     let image = response.image;
		     img_object.src = image
		  };
		  */

		const data = this.render_tag_image(label, type);
		img_object.src = data
	}//end create_tag_image



}//end class component_text_area






/**
* GOTO TIME CAPTURE CALL
*/
function goto_time(timecode) {
	if(SHOW_DEBUG===true) {
		console.log("[component_text_area]->goto_time captured and ignored call in page edit context for tc ", timecode)
	}
	return null;
}//end goto_time


