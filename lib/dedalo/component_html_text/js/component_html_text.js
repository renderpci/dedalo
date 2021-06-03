"use strict";
/**
* COMPONENT_HTML_TEXT CLASS
*
*
*/
var component_html_text = new function() {



	this.save_arguments = {}

	// SELECTED_TAG_DATA
	// Set on select tag in editor
	this.selected_tag_data

	// TAG_OBJ
	// Set on select tag in editor
	this.tag_obj



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		// wrapper
			const wrapper_id  = "wrapper_" + options.uid
			const wrapper_obj = document.getElementById(wrapper_id)
			if (!wrapper_obj) {
				console.error("[component_html_text.init] Error: wrapper_obj not found. wrapper_id:",wrapper_id);
				return false;
			}

		// plupload plugin load
			const plupload_url = DEDALO_ROOT_WEB + "/lib/tinymce/plupload/js/plupload.full.min.js";
			common.load_script(plupload_url)


		// Load text editor (tinny)
			const text_editor_url = DEDALO_LIB_BASE_URL + '/component_html_text/js/component_html_text_editor.js';
			common.load_script(text_editor_url).then(function(response){
				// Init tiny editor
				window.ready(function(){
					component_html_text_editor.init(options.uid, options.modo, options.propiedades_json)
				})		
			})		


		// Add tool lang multi button
			if ( (page_globals.modo==='edit' || page_globals.modo==='tool_lang') && options.traducible==='si') {

				const tool_button = inspector.build_tool_button({ tool_name	: 'tool_lang_multi',
																label 		: get_label['tool_lang_multi'],
																title 		: get_label['tool_lang_multi'],
																tipo		: wrapper_obj.dataset.tipo,
																parent 		: wrapper_obj.dataset.parent,
																section_tipo: wrapper_obj.dataset.section_tipo,
																lang  		: wrapper_obj.dataset.lang,
																context_name: "tool_lang_multi"
																})		
				
				const component_tools_container = document.createElement("div")
					  component_tools_container.classList.add('component_tools_container')
					  component_tools_container.appendChild(tool_button)

				wrapper_obj.appendChild(component_tools_container)
			}//end if (page_globals.modo==='edit')



		return true
	};//end init



	/**
	* GET_DATO
	* update 13-01-2018
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_html_text:get_dato] Error. Invalid wrapper_obj")
			return false
		}

		
		const input_field	= wrapper_obj.querySelector('[data-role="input_field"]')
		const dato			= input_field.value;


		return dato;
	};//end get_dato



	/**
	* SAVE
	* @return promise
	*/
	this.Save = function(component_obj) {

		const self = this

		return new Promise(function(resolve){			
		
			// Exec general save
			component_common.Save(component_obj, self.save_arguments)
			.then(function(response) {
			  	// Update possible dato in list (in portal x example)
				component_common.propagate_changes_to_span_dato(component_obj);

				resolve(true)
			})
		})
	};//end Save



	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {

		obj_wrap.classList.add("selected_wrap");
		var text_area = $(obj_wrap).find('textarea').first()
		if (text_area.length==1) {
			tinyMCE.get( text_area[0].id ).focus()
		}
	};//end select_component



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




	/*	REFERENCES
	----------------------------------------------------------------------------------------- */



	/**
	* GET_LAST_TAG_ID
	* @param ed
	*	Text editor instance (tinyMCE)
	* @param tag_type
	*	Class name of image searched like 'geo'
	*/
	this.get_last_tag_id = function(container, tag_type) {

		const ar_id_final = [0];

		switch(tag_type) {			

			case 'reference':
				// REFERENCE : Select all reference in text
				const ar_tags = container.getElementsByTagName('reference')
					//console.log(ar_tags)

				// ITERATE TO FIND TIPO_TAG
				const i_len = ar_tags.length
				for (let i = i_len - 1; i >= 0; i--) {

					// current tag like [svg-n-1]
					const current_tag	= ar_tags[i].id;
					const ar_parts		= current_tag.split('_');
					const number		= parseInt(ar_parts[1]);

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
	* CREATE_NEW_REFERENCE
	* @return
	*/
	this.create_new_reference = function(ed, evt, text_area_component) {
		//console.log(ed);	console.log(evt);	console.log(text_area_component);

		const component_obj		= text_area_component
		const string_selected	= ed.selection.getContent({format:'raw'}) // Get the selected text in raw format		
		const string_len		= string_selected.length
			if(string_len<1) return alert("Please, select a text fragment before ! " + string_len)

		// LAST_TAG_ID
			const container = document.createElement('div')
			container.innerHTML	= ed.getContent()
			const last_tag_id	= parseInt( component_html_text.get_last_tag_id(container, 'reference') )

		// New tag_id to use
			const new_id = parseInt(last_tag_id+1)

		// State. Default is 'n' (normal)
			const state = 'n'

		// Data
			const data = '[]'

		// Create new DOM element
			const el = document.createElement("reference")
			el.classList.add('reference')
			el.id				= 'reference_'+ new_id
			el.dataset.state	= state
			el.dataset.tag_id	= new_id
			el.dataset.label	= 'reference '+ new_id
			el.dataset.data		= data		

		// Inject selection
			el.innerHTML = string_selected

		// Set content to text editor
			const reference_string = " "+el.outerHTML.trim()+" "
			ed.selection.setContent(reference_string, {format:'raw'})

		// auto click
			setTimeout(function(){
				const tag_obj = ed.dom.select('#'+el.id);
				if (tag_obj.length===1) {
					tag_obj[0].click()
				}
			}, 600)

		/*
		// Force dirty state
		ed.setDirty(true);

		// Save
		var js_promise = component_html_text.Save(text_area_component, null, ed)
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
		
		// trigger
			const trigger_url  = DEDALO_LIB_BASE_URL + '/component_text_area/trigger.component_text_area.php';
			const trigger_vars = {
				mode	: 'show_reference_info',
				lang	: text_area_component.dataset.lang,
				data 	: data
			};
			// console.log(trigger_vars); return;

		// get_json_data promise
			const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_html_text.show_reference_info] response:", response);
				}

				if (response===null) {
					alert("Error on show_reference_info. See server log for details")
					return false
				}

				// reference_dialog build
					const reference_dialog = component_html_text.build_reference_dialog({
						"evt"					: evt,
						"response"				: response,
						"tag_id"				: tag_id,
						"ed"					: ed,
						"text_area_component"	: text_area_component
					})
					document.body.appendChild(reference_dialog)
					exec_scripts_inside(reference_dialog)

				// component autocomplete_hi wrapper
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
					component_html_text.delete_reference(this, options)
				})
				button_delete.appendChild( document.createTextNode(get_label.borrar) )
				// Add
				footer.appendChild(button_delete)

			// APPLY Button ok <button type="button" class="btn btn-warning">OK</button>
			const button_ok = document.createElement("button")
				button_ok.classList.add("btn","btn-success","btn-sm","button_apply_reference")
				button_ok.dataset.dismiss = "modal"
				button_ok.addEventListener('click', function() {
					component_html_text.update_reference(this, options)
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
		
		// Set editor as dirty
		ed.setDirty(true) // Force dirty state
		ed.save(); // updates this instance's textarea

		// Save
		const js_promise = component_html_text.Save( component_obj, null, ed )
		

		return js_promise
	}//end delete_reference



	/**
	* UPDATE_REFERENCE
	* @return bool
	*/
	this.update_reference = function(button_obj, options) {
		//console.log(button_obj); console.log(options); return;

		if (!options.evt.target) {
			console.error("[component_html_text.update_reference] Error. options.evt.target not found ", options.evt.target);
			return false
		}

		// Get actual value
		const div_reference_wrapper = document.getElementById('div_reference_wrapper')
			if (!div_reference_wrapper) {
				console.error("[component_html_text.update_reference] Error. div_reference_wrapper not found ", div_reference_wrapper);
				return false
			}

		// dato_hidden. select in DOM
		const input = div_reference_wrapper.querySelector("input[data-role='dato_hidden']");
			if (!input) {
				console.error("[component_html_text.update_reference] Error. input not found (maybe you don't have privileges)", input);
				return false
			}
		const value = JSON.parse(input.value)
			//console.log(value);
			if (!value || value.length<1) {
				console.warn("[component_html_text.update_reference] Error. value.length < 1 ", value);
				return false
			}

		// Set value to text reference tag dataset
			const data = replaceAll('"', "'", JSON.stringify(value)) // Format data Important !!					

		if (options.evt.target.dataset.data!==data) {

			// Replaces dataset 'data' value with new data
			options.evt.target.dataset.data = data

			const component_obj = options.text_area_component
			// component_obj.value = component_obj.value + " "

			const ed = options.ed
			
			// Set editor as dirty
			ed.setDirty(true) // Force dirty state
			ed.save(); // updates this instance's textarea			

			setTimeout(function(){			
				component_html_text.Save(component_obj, null, ed)
				.then(function(response){
					if(SHOW_DEBUG===true) {
						console.log("[component_html_text.update_reference] Save response:", response);
						console.log("[component_html_text.update_reference] options:", options);
					}
				})
			}, 150)
		}

		return true
	}//end update_reference



}//end class component-text_area