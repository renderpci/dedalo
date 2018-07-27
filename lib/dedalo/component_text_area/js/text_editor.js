"use strict";
/**
* TEXT_EDITOR CLASS
*
*
*/
var text_editor = new function() {


	// CONTEXT : Get from url
	this.context_name = get_current_url_vars()['context_name'];

	//if (typeof context_name=='undefined') {
	//	return alert("Error on read context_name")


	/**
	* IS_CONTENT_EDITABLE
	* @return 
	*/
	this.is_content_editable = false
	//this.is_content_editable = function() {
	//	return this.is_content_editable
	//};//end is_content_editable
	//};


	/**
	* INIT
	* @return 
	*/
	this.inited = false
	this.init = function(options) {

		//console.log("options",options);		

		// Set wrapper_id, modo, properties, role
		let wrapper_id 	= options.wrapper_id 
		let modo 		= options.modo
		let properties 	= options.properties
		let role 		= options.role	

		let self = this;		

		if(SHOW_DEBUG===true) {
			console.log("[text_editor.init] *** options:",options)	
		}			
		
		// dom wrapper
		let text_area_wrapper = self.get_text_wrapper_obj(wrapper_id)
			if(!text_area_wrapper) {
				// Error on find wrapper
				var msg = "[text_editor:init] ERROR. text_area_wrapper not found! ("+self.wrapper_id+")"
				console.log(msg, "wrapper_id: ",self.wrapper_id)
				alert(msg)
				return false
			}

		// dom div content editable
		let text_preview = self.get_text_preview_obj(wrapper_id)

		// Render tc tags with canvas
		//window.setTimeout(function(){
		//	let render_all_tags_promise = component_text_area.render_all_tags(text_preview, "tc", false)
		//}, 1)

		switch(modo) {
			case "tool_structuration":
				tool_structuration.lang 		 = text_area_wrapper.dataset.lang
				tool_structuration.original_lang = text_area_wrapper.dataset.original_lang

				let indexation_page_list = document.getElementById("indexation_page_list")
				if (indexation_page_list) {
					// Delete contents
					while (indexation_page_list.firstChild) indexation_page_list.removeChild(indexation_page_list.firstChild)
				}
				break;
		}

		if (role==="source_lang") {
			// content_editable
			self.set_content_editable(true, wrapper_id)	
			self.change_edition_options("unlock")	
		}else{
			self.change_edition_options("lock")
		}

		// Tag listeners. Activate the tags listeners and refresh the toc
		self.activate_content_tags(text_preview, text_area_wrapper)		

		// Keyboard custom events
		self.activate_keyboard_custom(text_preview)
		

		return false;

			//self.remove_fake_caret();
			//if (self.inited) {return false;}	
			
				// capture the keyboard return key for incompatibility

				text_preview.addEventListener("keydown", function(e){
					if (e.keyCode===13 && e.shiftKey===false) {
						if(SHOW_DEBUG===true) {
							console.log("text_editor:init] keydown preventDefault event:",e);			
						}
						// Stop basic Enter key action. Use shift + enter to add text return line
						e.preventDefault()
						//text_editor.change_key_return(e)
					}
				},false)
				/*
				text_preview.addEventListener("keyup", function(e){
					var key = 'text_preview'
					localStorage[key] = self.innerHTML;
				},false)*/
			
				//console.log("text_editor.wrapper_id: ",text_editor.wrapper_id);	
			

			// console.log("text_preview.style.opacity:",text_preview.style.opacity, typeof text_preview.style.opacity);
			if (text_preview.style.opacity=="0") {
				text_preview.style.opacity = 1	
			}	
	};//end init



	/**
	* CHANGE_EDITION_OPTIONS
	* @return 
	*/
	this.change_edition_options = function(mode) {
		
		let display = "none"

		if (mode=='unlock') {
			display = ""
		}
		
		let ar_hide_on_not_source = document.querySelectorAll(".hide_on_not_source")
		for (let i = 0; i < ar_hide_on_not_source.length; i++) {
			ar_hide_on_not_source[i].style.display = display
		}


	};//end change_edition_options



	/**
	* ACTIVATE_CONTENT_TAGS
	* @see set_section_titles
	* @see build_toc
	* @return 
	*/
	this.activate_content_tags = function(text_preview, text_area_wrapper) {

		let self = this;

		if (!text_area_wrapper) {
			console.log("[text_editor.activate_content_tags] ERROR. (Stop activate content tags) text_area_wrapper not found with id: ", component_text_area.wrapper_id);
			return false
		}

		let js_promise = new Promise((resolve, reject) => {
			const start = new Date().getTime()		
			
			// STRUCTURATION TAGS . iterate all section elements and add click listeners etc
			let select_event_name = "mouseup";
			let section_elements = text_preview.getElementsByTagName('section')
			let len = section_elements.length
				for (let i = len - 1; i >= 0; i--) {
					let current_element = section_elements[i]
					//var current_element = section_elements[i].cloneNode(true); // Clone to clear all previous listeners
					// Click event of section tag
					current_element.addEventListener(select_event_name, function(e){
						tool_structuration.select_area(this, e, text_area_wrapper.id);									
					},false)

					// sync_class_to_state
					self.sync_class_to_state(current_element)
				}

				// Prepend TOC
				//self.add_toc(text_preview)

			// TITLES TOC
			self.set_section_titles(section_elements, text_area_wrapper.dataset.lang, text_area_wrapper.id).then(function(){
				// Build toc
				text_editor.build_toc(text_preview, null, section_elements, 0)
			})
			
			// IMG GROUP (NOTES, ETC..)
			const other_elements = text_preview.getElementsByTagName('img')
			const oe_len 		 = other_elements.length
				for (let i = oe_len - 1; i >= 0; i--) {
					let current_img = other_elements[i]
					//var current_img = other_elements[i].cloneNode(true); // Clone to clear all previous listeners
					switch(true) {

						case current_img.classList.contains('note'):
							current_img.addEventListener("click", function(evt){

								// SELECTED_TAG_DATA
								// Fix selected_tag_data var in class component_text_area						
								component_text_area.selected_tag_data = {
									id 				: evt.target.id,
									type 			: evt.target.dataset.type,
									tag_id 			: evt.target.dataset.tag_id,
									state 			: evt.target.dataset.state,
									label 			: evt.target.dataset.label,
									data 			: evt.target.dataset.data,
									component_tipo 	: text_area_wrapper.dataset.tipo,
									lang 		 	: text_area_wrapper.dataset.lang
								}								
								
								// Fix text area selection values
								component_text_area.section_tipo 	= text_area_wrapper.dataset.section_tipo
								component_text_area.section_id 		= text_area_wrapper.dataset.parent
								component_text_area.component_tipo 	= text_area_wrapper.dataset.tipo
								component_text_area.lang 			= text_area_wrapper.dataset.lang
								component_text_area.wrapper_id 		= text_area_wrapper.id
								component_text_area.tag_obj 		= evt.target							
								/*
								// Fix selected tag data
								component_text_area.selected_tag_data = {
																		component_tipo 	: text_area_wrapper.dataset.tipo,
																		//tag_obj 		: evt.target,																	
																		//wrapper_id 	: text_area_wrapper.id,																	
																		}*/																	
								// Show note info
								component_text_area.show_note_info( text_preview, evt, text_area_wrapper ) //text_area_component												
							},false)
							break;

						case current_img.classList.contains('person'):
							current_img.addEventListener("click", function(evt){
								//component_text_area.load_tags_person(self);
								component_text_area.show_person_info( text_preview, evt, text_area_wrapper )
							},false)
							break;
						/*
						case current_img.classList.contains('tc'):
							current_img.addEventListener("click", function(evt){								
								let timecode = evt.target.dataset.data
								component_text_area.goto_time(timecode);
							},false)
							break;*/						
					}
				}//end for (var i = len - 1; i >= 0; i--) {

			// REFERENCES
			const reference_elements = text_preview.getElementsByTagName('reference')
			const ref_len = reference_elements.length
				for (let i = ref_len - 1; i >= 0; i--) {
					let current_element = reference_elements[i]
					//var current_element = other_elements[i].cloneNode(true); // Clone to clear all previous listeners
					current_element.addEventListener("click", function(evt){	
						
						// SELECTED_TAG_DATA
						// Fix selected_tag_data var in class component_text_area
						component_text_area.selected_tag_data = {
							id 				: evt.target.id,
							type 			: evt.target.dataset.type,
							tag_id 			: evt.target.dataset.tag_id,
							state 			: evt.target.dataset.state,
							label 			: evt.target.dataset.label,
							data 			: evt.target.dataset.data,
							component_tipo 	: text_area_wrapper.dataset.tipo,
							lang 		 	: text_area_wrapper.dataset.lang
						}
										
						// Fix text area selection values
						component_text_area.section_tipo 	= text_area_wrapper.dataset.section_tipo
						component_text_area.section_id 		= text_area_wrapper.dataset.parent
						component_text_area.component_tipo 	= text_area_wrapper.dataset.tipo
						component_text_area.lang 			= text_area_wrapper.dataset.lang
						component_text_area.wrapper_id 		= text_area_wrapper.id
						// Fix tag_obj var in class component_text_area
						//component_text_area.tag_obj 		= evt.target
						
						// Show reference info
						component_text_area.show_reference_info( text_preview, evt, text_area_wrapper )
					},false)
				}

			if(SHOW_DEBUG===true) {
				const end  	= new Date().getTime()
				const time 	= end - start
				console.log("[text_editor.activate_content_tags] Ok content tags activated in ms: ",time)
			}
		});//end js_promise

		
		return js_promise;
	};//end activate_content_tags



	/**
	* AUTOMATIC_ORDER
	* @return 
	*/
	this.n_order = 0
	this.n_order_children = 0
	this.order_solved = []
	this.automatic_order = function(section_elements, level) {
	
		const len = section_elements.length
		for (let i = 0; i < len; i++) {

			var ar_h2 = section_elements[i].getElementsByTagName("h2")	

			if( typeof ar_h2[0]==="undefined") continue;

			if (this.order_solved.indexOf(ar_h2[0])!==-1 ) {
				continue;
			}
			//console.log(ar_h2);	

			// Select inside label
			if (level===0) {
				var span_order = ar_h2[0].getElementsByClassName("order")[0]
				// Delete contents
				while (span_order.firstChild) span_order.removeChild(span_order.firstChild)
				span_order.appendChild( document.createTextNode(++this.n_order) ) // is empty on create

			}else{

				//console.log(section_elements[i].parentNode );
				var parent_section = find_ancestor(section_elements[i], 'section_struct')
					//console.log(parent_section);
					
				// Calculate parent order					
				if(parent_section) {
					
					var parent_order = parent_section.getElementsByClassName('order');
					//if (parent_order.length<1) continue;
					parent_order = parent_order[0]
						//console.log(parent_order);

					var current_order = section_elements[i].getElementsByClassName('order');
					//if(current_order.length<1) continue;
					current_order = current_order[0]
						//console.log(current_order);

					// Compose final string
					current_order.innerHTML = parent_order.innerHTML + "." +  ++this.n_order_children
				}
			}

			// Iterate childrems if exists
			var section_childrens = section_elements[i].getElementsByTagName('section')
			if (section_childrens.length>0) {
				this.n_order_children = 0
				this.automatic_order(section_childrens, level+1) // Recursion
			}

			// mark as solved
			this.order_solved.push(ar_h2[0])		
		}//end for
	};//end automatic_order



	/**
	* BUILD_TOC
	* @return 
	*/
	this.toc_solved = []
	this.build_toc = function(text_preview, toc, section_elements, level) {
	
		// Prepend TOC if not exists
		let current_toc = text_preview.querySelector("header")
		if (!current_toc) {
			var toc = document.createElement("header")
				toc.classList.add("toc","text_unselectable")
				toc.contentEditable = false
				if(SHOW_DEBUG===true) {
					toc.style.display = "none"
				}				
				toc.id = "toc"
				text_preview.insertBefore(toc, text_preview.firstChild)

				toc.appendChild( document.createTextNode("Table of Contents") )	
		}

		if (typeof level === "undefined") {
			level = 0
		}
		//var section_elements = text_preview.querySelectorAll("section")
		//	console.log(section_elements);
		
		const section_elements_len = section_elements.length
		for (let i = 0; i < section_elements_len; i++) {
							
			//this.build_toc(text_preview, toc, section_childrens, level+1)
			/*
			var j_len  = section_childrens.length
			for (var j = 0; j < len; j++) {
				ar_buffer.push(section_childrens[j])
			}*/
			
			let ar_h2 = section_elements[i].getElementsByTagName("h2")
			if (ar_h2[0]) {
				//console.log(ar_h2[0]);

				if (this.toc_solved.indexOf(ar_h2[0])!==-1 ) {
					continue;
				}				
				
				// Clone and inject in TOC
				let cloned = ar_h2[0].cloneNode(true)
					cloned.style.paddingLeft = (level * 20) +"px"

				toc.appendChild( cloned )

				// mark as solved
				this.toc_solved.push(ar_h2[0])

				// Iterate childrems if exists
				let section_childrens = section_elements[i].getElementsByTagName('section')
				if (section_childrens.length>0) {					
					this.build_toc(text_preview, cloned, section_childrens, level+1)
				}				

			}//end if (ar_h2[0])								
		}
	};//end build_toc



	/**
	* SYNC_CLASS_TO_STATE
	* Sync tag state with proper class
	*/
	this.sync_class_to_state = function(tag_element) {

		// Reset
		tag_element.classList.remove("deleted","to_review")

		// Add proper class
		switch(tag_element.dataset.state) {
			case "d" :
				tag_element.classList.add("deleted")
				break;
			case "r" :
				tag_element.classList.add("to_review")
				break;
			default:
				// Not add style for now
		}

		return tag_element
	};//end sync_class_to_state



	/**
	* SET_SECTION_TITLES
	* Add DOM headers to section nodes
	* @return 
	*/
	this.set_section_titles = function(section_elements, lang, wrapper_id) { 
		//console.log("[text.editor.set_section_titles] wrapper_id:",wrapper_id);

		
		//tool_structuration.get_tool_text_preview(wrapper_id)
		let wrapper_obj 	= this.get_text_wrapper_obj(wrapper_id)
		let text_preview 	= this.get_text_preview_obj(wrapper_id)

		let ar_locators = []
		const len = section_elements.length
		for (let i = len - 1; i >= 0; i--) {
			ar_locators.push(section_elements[i].dataset.data)
		}
	
		if(SHOW_DEBUG===true) {
			//console.log("[text_editor.set_section_titles] section_elements:",section_elements);
			//console.log("[text_editor.set_section_titles] ar_locators:",ar_locators);
		}

		const trigger_vars = {
			mode 		: "set_section_titles",
			ar_locators : JSON.stringify(ar_locators),
			lang 		: lang || wrapper_obj.dataset.lang
		}		
		//console.log("[text_editor.set_section_titles] trigger_vars",trigger_vars,arguments.callee.caller);		

		let js_promise = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[text_editor.set_section_titles] response:",response);
			}
				
			if (!response || !response.result) {
				alert("[text_editor:set_section_titles] Error on set_section_titles (null). See server log to obtain details")
			}else{
				
				// Create new h2 tags
				for (let i = 0; i < len ; i++) {
					
					// Clear existing h2 tag inside section
					// console.log("section_elements[i]:",section_elements[i]);
					let current_section = section_elements[i]			
					let current_h2  	= current_section.getElementsByTagName('h2')
						//console.log("+++++ current_h2",current_h2);
					if (current_h2 && current_h2.length>=1) {
						current_h2[0].remove()
					}					

					let locator_string = section_elements[i].dataset.data

					let header = document.createElement("h2")
						header.contentEditable = false
						/*
						header.addEventListener("click",function(e){
							event.stopPropagation() 
						},false)*/
					
					/*
					if(response.result[locator_string] && response.result[locator_string].order) {
						var order = document.createElement("span")
							order.classList.add('order')
							order.appendChild( document.createTextNode( response.result[locator_string].order ) )
						// Append
						header.appendChild(order)
					}*/
					// Add empty span order
					let order = document.createElement("span")
						order.classList.add('order')							
						// Append
						header.appendChild(order)

					
					if (response.result[locator_string] && response.result[locator_string].title ) {
						let title = document.createElement("label")
							title.classList.add('title')
							title.appendChild( document.createTextNode( response.result[locator_string].title ) )
						// Append
						header.appendChild(title)
					}					
					//console.log(header);

					// Insert element before first children
					if (header)
					section_elements[i].insertBefore(header, section_elements[i].firstChild);
				}				
			}			
		}).then(function(){
				
			// Reset all counters and order vars
			text_editor.order_solved 	= []
			text_editor.n_order 		= 0
			text_editor.n_order_children = 0

			//var text_preview 	 	 = document.getElementById('text_preview')		
			let all_section_elements = text_preview.getElementsByTagName('section') 
			//console.log(all_section_elements);
			text_editor.automatic_order(all_section_elements, 0)	

			/*
			// Mix order info in cascade like 1, 1.1, 1.1.1, etc.
			for (var i = 0; i < len ; i++) {									
			
				// Calculate parent order					
				if(section_elements[i].parentNode && section_elements[i].parentNode.tagName==='SECTION') {
					
					var parent_order = section_elements[i].parentNode.getElementsByClassName('order');
					if (parent_order.length<1) continue;
					parent_order = parent_order[0]

					var current_order = section_elements[i].getElementsByClassName('order');
					if(current_order.length<1) continue;
					current_order = current_order[0]

					// Compose final string
					current_order.innerHTML = parent_order.innerHTML + "." + current_order.innerHTML						
				}
			}
			*/
		})

		return js_promise
	};//end set_section_titles



	/**
	* GET_TEXT_PREVIEW_OBJ
	* @return dom object | null
	*/
	this.get_text_preview_obj = function(wrapper_id) {
		let wrapper 	 = this.get_text_wrapper_obj(wrapper_id)
		let text_preview = wrapper.querySelector('#text_preview')

		return text_preview
	};//end get_text_preview_obj



	/**
	* GET_TEXT_WRAPPER_OBJ
	* @return dom object | null
	*/
	this.get_text_wrapper_obj = function(wrapper_id) {
		if (typeof wrapper_id=="undefined") {
			alert("[text_editor.get_text_wrapper_obj] Error on locate wrapper. Undefined wrapper_id")
			return null;
		}
		let wrapper = document.getElementById(wrapper_id)
			if (!wrapper) {
				alert("[text_editor.get_text_wrapper_obj] Error on locate wrapper. Incorrect wrapper_id")
				return null;
			}

		return wrapper
	};//end get_text_wrapper_obj



	/**
	* SET_CONTENT-EDITABLE
	* @return bool
	*/
	this.set_content_editable = function(value, wrapper_id) {
		this.is_content_editable = value || false

		let text_preview = this.get_text_preview_obj(wrapper_id); //document.getElementById(wrapper_id).querySelector('#text_preview')
		let ar_elements  = text_preview.querySelectorAll('.index, .tc, .person, .page, .geo, .svg') // .note,
		const len 		 = ar_elements.length

		if (this.is_content_editable===true) {
			for (let i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = ''
			}
			// Remove virtual caret
			//text_editor.remove_fake_caret()
			// Set attribute
			text_preview.contentEditable = true
			// Set class var
			this.is_content_editable = true

		}else{
			for (let i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = 'none'
			}
			// Set attribute
			text_preview.contentEditable = false
			// Set class var
			this.is_content_editable = false
		}

		return true
	};//end set_content-editable



	/**
	* TOGGLE_TOC
	* @return 
	*/
	this.toggle_toc = function(editor) {
		
		let toc = editor.querySelector('header.toc')

		if (toc.style.display!=='none') {
			toc.style.display = 'none'
		}else{
			toc.style.display = ''
		}
	};//end toggle_toc



	/**
	* ACTIVATE_KEYBOARD_CUSTOM
	* @return 
	*/
	this.activate_keyboard_custom = function(text_preview) {
		
		text_preview.addEventListener("keydown", function(e){
			if (e.keyCode===13 && e.shiftKey===false) {
				if(SHOW_DEBUG===true) {
					console.log("keydown preventDefault event:",e);
				}
				// Stop basic Enter key action. Use shift + enter to add text return line
				e.preventDefault()
				//text_editor.change_key_return(e)
			}
		},false)
	};//end activate_keyboard_custom




	/**
	* CHANGE_KEY_RETURN
	* Avoid enter key behaviour in webkit when press in content editable elements 
	*//*
	this.change_key_return = function(event) {

		if (event.which != 13)
			return true;

		var docFragment = document.createDocumentFragment();

		//add a new line
		var newEle = document.createTextNode('\n');
		docFragment.appendChild(newEle);

		//add the br, or p, or something else
		newEle = document.createElement('br');
		docFragment.appendChild(newEle);

		//make the br replace selection
		var range = window.getSelection().getRangeAt(0);
		range.deleteContents();
		range.insertNode(docFragment);

		//create a new range
		range = document.createRange();
		range.setStartAfter(newEle);
		range.collapse(true);

		//make the cursor there
		var sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);

		return false;
	};//end change_key_return
	*/


	/**
	* REMOVE_FAKE_CARET
	* @return 
	*//*
	this.remove_fake_caret = function(target) {

		//var target_obj = target || document
		var target_obj = document
	
		// REMOVE TEMPORAL TAG (FAKE CARET)
		var temp_elements = target_obj.getElementsByTagName('caret')
		var len = temp_elements.length
			for (var i = len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}
	};//end remove_fake_caret
	*/




};//end text_editor class