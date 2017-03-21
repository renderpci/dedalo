/**
*  TOOL_STRUCTURATION CLASS
*
*
*
*/
var tool_structuration = new function() {

	// LOCAL VARS
	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/tools/tool_structuration/trigger.tool_structuration.php';

	// Current component vars
	this.component_tipo = null
	this.section_tipo 	= null
	this.section_id 	= null

	this.tool_info_log

	/**
	* FIX_HEIGHT
	*/
	this.fix_height = function() {

		if (page_globals.modo!=='tool_structuration') {
			return false;
		}

		var current_height = window.innerHeight
    	document.getElementById('indexation_container').style.height = current_height+'px';
    	if(tinyMCE.activeEditor) {
    		// Adjust height
	    	tinyMCE.activeEditor.theme.resizeTo(
		        null,
		        400
		    );
    	}	   
	};//end fix_height


	
	window.addEventListener("load", function (event) {
		tool_structuration.fix_height() 
		//tool_structuration.select_tag_in_editor()
	});

	window.addEventListener("resize", function (event) {
	    tool_structuration.fix_height()
	});



	/**
	* INIT
	* @return 
	*/
	this.init = function() {

		// Activate split pane
		Split(['#left_side', '#right_side'], {
			sizes: [40, 60],
			minSize: '40%'
		});

		this.tool_info_log = document.getElementById('tool_info_log')

		var text_preview = document.getElementById('text_preview')	

		// Prepend TOC
		var toc = document.createElement("header")
			toc.classList.add("toc","text_unselectable")
			toc.id = "toc"
			toc.appendChild( document.createTextNode("Table of Contents") )	
		text_preview.insertBefore(toc, text_preview.firstChild)
			

		// iterate all section elements and add click listeners etc
		var section_elements = text_preview.getElementsByTagName('section')
			
			var len = section_elements.length
			for (var i = len - 1; i >= 0; i--) {
				// Click event of section tag
				section_elements[i].addEventListener("click", function(e){
					tool_structuration.select_area(this, e)
				},false)

				// sync_class_to_state
				this.sync_class_to_state(section_elements[i])
			}


			//console.log(section_elements)
			var js_promise = this.set_section_titles(section_elements).then(function(){

				// this.build_toc
				tool_structuration.build_toc(toc, section_elements, 0)				
			})
			

		window.addEventListener('component_save', function(e){
			//console.log(e);

			// In some cases we don't need update titles on save
			if (tool_structuration.update_titles_on_save===false) return false;

			// Removes current is exists (avoid duplicate on update)
			var h2  = tool_structuration.tag_obj.getElementsByTagName('h2')
			if (h2 && typeof h2[0]!="undefined") h2[0].remove()			
			tool_structuration.set_section_titles([tool_structuration.tag_obj])
		})

	};//end init



	/**
	* BUILD_TOC
	* @return 
	*/
	this.toc_solved = []
	this.build_toc = function(toc, section_elements, level) {

		if (typeof level === "undefined") {
			level = 0
		}
		//var section_elements = text_preview.querySelectorAll("section")
		//	console.log(section_elements);
		
		var len = section_elements.length
		for (var i = 0; i < len; i++) {			
							
			//this.build_toc(toc, section_childrens, level+1)
			/*
			var j_len  = section_childrens.length
			for (var j = 0; j < len; j++) {
				ar_buffer.push(section_childrens[j])
			}*/			
			
			var ar_h2 = section_elements[i].getElementsByTagName("h2")			
			if (ar_h2[0]) {
				//console.log(ar_h2[0]);

				if (this.toc_solved.indexOf(ar_h2[0])!==-1 ) {
					continue;
				}
				
				// Clone and inject in TOC
				var cloned = ar_h2[0].cloneNode(true)
					cloned.style.paddingLeft = (level * 20) +"px"
				toc.appendChild( cloned )

				// mark as solved
				this.toc_solved.push(ar_h2[0])

				// Iterate childrems if exists
				var section_childrens = section_elements[i].getElementsByTagName('section')
				if (section_childrens.length>0) {
					this.build_toc(cloned, section_childrens, level+1)
				}				

			}//end if (ar_h2[0])								
		}
	};//end build_toc



	/**
	* SYNC_CLASS_TO_STATE
	* Sync tag state with proper class
	*/
	this.sync_class_to_state = function(tag_obj) {

		// Reset
		tag_obj.classList.remove("deleted","to_review")

		// Add proper class
		switch(tag_obj.dataset.state) {
			case "d" :
				tag_obj.classList.add("deleted")
				break;
			case "r" :
				tag_obj.classList.add("to_review")
				break;
			default:
				// Not add style for now
		}

		return tag_obj
	};//end sync_class_to_state



	/**
	* SET_SECTION_TITLES
	* Add DOM headers to section nodes
	* @return 
	*/
	this.set_section_titles = function(section_elements) { 
		
		var ar_locators = []
		var len = section_elements.length
		for (var i = len - 1; i >= 0; i--) {
			ar_locators.push(section_elements[i].dataset.data)
		}
		//console.log(ar_locators);

		var trigger_vars = {
			mode 		: "set_section_titles",
			ar_locators : JSON.stringify(ar_locators),
			lang 		: this.lang
		}

		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
				
			if (response===null) {
				alert("Error on set_section_titles (null). See server log to obtain details")
			}else{
				
				for (var i = 0; i < len ; i++) {

					var locator_string = section_elements[i].dataset.data

					var header = document.createElement("h2")

					if(response.result[locator_string] && response.result[locator_string].order) {
						var order = document.createElement("span")
							order.classList.add('order')
							order.appendChild( document.createTextNode( response.result[locator_string].order ) )
						// Append
						header.appendChild(order)
					}
					
					if (response.result[locator_string] && response.result[locator_string].title ) {
						var title = document.createElement("label")
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
		})

		return js_promise
	};//end set_section_titles



	/**
	* UPDATE_VIEW
	* Updates selected tag object if is selected. Else updates all nodes
	* @return 
	*/
	this.update_view = function(button_obj) {

		var text_preview 	 = document.getElementById('text_preview')		
		var section_elements = text_preview.getElementsByTagName('section') // iterate later all section elements and add click listeners etc
		
		if (typeof this.tag_obj==="undefined" || this.tag_obj===null) {
			

			// Removes current is exists (avoid duplicate on update)
			var h2  = text_preview.getElementsByTagName('h2')
			var len = h2.length
			if (len>0) {
				for (var i = len - 1; i >= 0; i--) {
					h2[i].remove()
				}
			}			

			// Updates all titles
			var js_promise = this.set_section_titles(section_elements)

		}else{

			// Updates only selected title
			console.log(this.tag_obj);

			// Removes current is exists (avoid duplicate on update)
			var h2  = this.tag_obj.getElementsByTagName('h2')[0];
			if (h2) h2.remove()

			// Updates current title (send always as array)
			var js_promise = this.set_section_titles( [this.tag_obj] )
		}


		js_promise.then(function(){

			var toc = document.getElementById("toc")

			// Delete wrap contents
			while (toc.firstChild) toc.removeChild(toc.firstChild)	
			
			toc.appendChild( document.createTextNode("Table of Contents") )	

			// Update toc
			tool_structuration.toc_solved = []
			tool_structuration.build_toc(toc, section_elements, 0)
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
	}



	/**
	* SELECT_AREA
	* Reset all other areas and select current
	*/
	this.select_area = function(el, event) {
		event.preventDefault()
		event.stopPropagation()
		
		// make global container unselectable
		var text_preview = document.getElementById('text_preview')
			if(text_preview==el) {
				// make current selected element, selectable
				el.classList.remove('text_unselectable')
				el.classList.add('text_selectable','text_active')
			}else{
				text_preview.classList.add('text_unselectable')
				text_preview.classList.remove('text_selectable','text_active')
			}			

		// iterate all section elements
		var section_elements = text_preview.getElementsByTagName('section')
			//console.log(section_elements)
			var len = section_elements.length
			for (var i = len - 1; i >= 0; i--) {
				if (section_elements[i]==el) {
					// make current selected element, selectable
					el.classList.remove('text_unselectable')
					el.classList.add('text_selectable','text_active')					
				}else{
					section_elements[i].classList.add('text_unselectable')
					section_elements[i].classList.remove('text_selectable','text_active')
				}				
			}

		// Show fragment info
		this.fragment_info(el, this.component_tipo, this.section_id, this.section_tipo, this.lang)

		//console.log(el);
		//this.tool_info_log.innerHTML = JSON.stringify(el)		
	};//end select_area
	


	/**
	* CREATE_AREA
	* Inserts a new tag section in text around selected text and save result to db
	* @return js promise
	*/
	this.selected_section = null
	this.create_area = function(button_obj) {

		// Select text container
		var text_preview = document.getElementById('text_preview')
			//console.log(text_preview);
		
		// Clean info log div
		this.tool_info_log.innerHTML = ""

		var valid_selection = this.elementContainsSelection(text_preview)
			if (valid_selection===false) {
				if(SHOW_DEBUG===true) {
					console.log("Invalid selection area catched");
				}
				this.tool_info_log.innerHTML = "Invalid selection area [create_area]"
				return false;
			}

		var range = document.createRange()
			//console.log(range)		

		var selection = document.getSelection()
			//console.log(selection)

		var rg = selection.getRangeAt(0)
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
			div.addEventListener("click", function(e){
				tool_structuration.select_area(this, e)
			},false)

		var html_content = rg.extractContents() 
			div.appendChild( html_content )

			// Fix selected section on click
			tool_structuration.selected_section = div

		// Remove current selection (data is already copied into new div element)
		rg.deleteContents()

		// Insert created node and contents in same range position
		//rg.collapse(false)
		rg.insertNode(div)
			

		// Create record associated	in DB
		return js_promise = this.create_new_struct(new_id)
	};//end create_area



	/**
	* REMOVE_AREA
	* Delete selected area (section tag) (not content) and save updated text (transcription) to db
	* Struct notes are not deleted anytime
	* @return bool
	*/
	this.remove_area = function(button_obj) {

		this.tool_info_log.innerHTML = ""

		var text_preview = document.getElementById('text_preview')

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
					this.delete_tag(selected_element).then(function(){
						
						// Replace selected section by his contents
						component_text_area.unwrap_element(selected_element)

						// Save content
						//this.save_structuration_text()

						this.tool_info_log.innerHTML = "Removed area"

						// Updates fragment info
						var wrap_div = document.getElementById('indexation_page_list')
						// Delete wrap contents		
						while (wrap_div.firstChild) wrap_div.removeChild(wrap_div.firstChild)	

					})									
					
					return true
				}
			}else{
				this.tool_info_log.innerHTML = "Invalid selection area [remove_area]"
			}

		return false
	};//end remove_area

	

	/**
	* CREATE_NEW_NODE_RECORD
	* Insert new record 'struct' in table matrix_structurations and inject locator in 
	* selected tag section dataset
	* @return js promise
	*/
	this.create_new_struct = function(new_id) {
		//console.log(new_id)

		var trigger_vars = {
			mode		: 'create_new_struct',
			tag_id		: new_id,
		}
		//console.log(trigger_vars); return

		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
				
			if (response===null) {
				alert("Error on create_new_struct (null). See server log to obtain details")
			}else{
				// SECTION : Update data container in section tag
				tool_structuration.update_tag_section_data(new_id, response.result)	
			}			
		})

		return js_promise
	};//end create_new_node_record



	/**
	* UPDATE_TAG_SECTION_DATA
	* Inject data in dataset of tag
	* @return bool
	*/
	this.update_tag_section_data = function(tag_id, data) {

		// Selects tag section in dom
		var id 			= 'section_' + tag_id
		var section_tag = document.getElementById(id)

		if (!section_tag) {
			return alert("Error on select section tag "+id)
		}
		
		data = JSON.stringify(data)
				// Format data Important !!
				data = replaceAll('"', '\'', data);
		
		// Inject dataset
		section_tag.dataset.data = data
		//console.log(section_tag)

		// Save content
		this.save_structuration_text()

		// Select in dom
		this.select_area(section_tag, event)

		return true
	};//end update_tag_section_data



	/**
	* GET_PARENT_SECTION
	* @return 
	*/
	this.get_parent_section = function(range) {
		
		console.log(range)
	};//end get_parent_section



	/**
	* SAVE_STRUCTURATION_TEXT
	* Alias of component_text_area Save()
	* @return js promise
	*/
	this.update_titles_on_save = true
	this.save_structuration_text = function(button_obj) {

		var component_text_area_obj = document.getElementById('text_preview')

		var js_promise = component_text_area.Save(component_text_area_obj, null, null)
			js_promise.then(function(){
				this.tool_info_log.innerHTML = "Saved " 

				// Reset to default state
				tool_structuration.update_titles_on_save = true 
			})
		return js_promise;		
	};//end save_structuration_text



	/**
	* CHANGE_TAG_STATE
	* @param obj
	*/
	this.change_tag_state = function (select_obj) {
		
		// Note: 'this.tag_obj' is fixed in text_editor when user makes click on image element
		var tag_obj 		= this.tag_obj		
		var	current_state 	= this.tag_obj.dataset.state		
		var related_tipo 	= this.component_tipo		
	
		// Get new state from select
		var	new_state 		= select_obj.value
			//console.log("tag_id:"+tag_id+" - current_state:"+current_state+" - new_state:"+new_state);
			if (!new_state) {
				if(SHOW_DEBUG===true) {
					console.log("[change_tag_state] Value not changed, Stoped save");
				}
				return false;
			}

		var new_data_obj = {
			state : new_state
		}

		tag_obj.dataset.state = new_state		
		this.sync_class_to_state(tag_obj)

		tool_structuration.update_titles_on_save = false

		return this.save_structuration_text()
	}//end change_tag_state
	



	/**
	* FRAGMENT_INFO
	* Loads all fragment information in a container below the text editor 
	* for change tag state, delete tag or add indexation terms
	*/
	this.fragment_info = function(tag_obj, tipo, parent, section_tipo, lang) {
		//console.log(tag_obj+", "+tipo+", "+parent+", "+section_tipo+", "+lang)

		// Target div container element
		var wrap_div = document.getElementById('indexation_page_list')

		if (!tag_obj.dataset || typeof tag_obj.dataset.tag_id==="undefined" ) {
			// Delete wrap contents		
			while (wrap_div.firstChild) wrap_div.removeChild(wrap_div.firstChild);
			return false;
		}

		// Fix vars
		this.fix_tool_vars(tag_obj, tipo, parent, section_tipo, lang)

		// Target div container element
		var wrap_div = document.getElementById('indexation_page_list')

		var trigger_vars = {
			mode 		 	: 'fragment_info',
			section_tipo 	: this.section_tipo,
			section_id 	 	: this.section_id,
			component_tipo  : this.component_tipo,
			tag_id 	 		: this.tag_id,
			lang 		 	: this.lang,
			data 			: tag_obj.dataset.data
		}
		//console.log(trigger_vars); return;

		html_page.loading_content( wrap_div, 1 );

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
							if(SHOW_DEBUG===true) console.log(response)

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
								var data =  {
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
								})														
							}
							html_page.loading_content( wrap_div, 0 );
						})

		return js_promise
	};//end fragment_info



	/**
	* LOAD_INSPECTOR_INDEXATION_LIST
	* Loads tag indexations list in inspector when in modo "edit"
	*/
	this.load_inspector_indexation_list = function(tag_obj, tipo, parent, section_tipo, lang) {

		// Fix vars
		this.fix_tool_vars(tag_obj, tipo, parent, section_tipo, lang)

		var trigger_vars = {
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
		//console.log(data);

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
						tool_structuration.change_tag_state(this)
					})

				wrap_tag_state_selector.appendChild(select)

				// Add element
				common_line.appendChild(wrap_tag_state_selector)

			var div_delete_tag = document.createElement('div')
				div_delete_tag.classList.add('div_delete_tag')			

				var icon_delete_tag = document.createElement('div')
					icon_delete_tag.classList.add("icon_bs","tool_structuration_delete_icon","link")				
					icon_delete_tag.title = "Delete area"
					icon_delete_tag.addEventListener("click", function(e){
						tool_structuration.remove_area(this)
					})

				var label = document.createElement('label')					
					label.appendChild( document.createTextNode("Delete area") )

				div_delete_tag.appendChild(icon_delete_tag)
				div_delete_tag.appendChild(label)			

				// Add element
				common_line.appendChild(div_delete_tag)

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
				radio_2_label.appendChild( document.createTextNode( get_label.info || 'Info' ) )
			
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

		// Confirm action
		//if( !confirm( get_label.eliminar_etiqueta + "\n\n "+ tool_structuration.tag_id +"\n\n") )  return false;
		if( !confirm( get_label.atencion + "!! \n" + get_label.borrara_la_etiqueta_seleccionada ) )  return false;

		var trigger_vars = {
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
	this.add_index = function(section_id, section_tipo, label) {

		if(typeof this.locator==='undefined') {
			return alert(" Please select a tag before indexing! " );
		}

		var container = document.getElementById('terminos_list_container')
			if (!container) {
				return console.log("Error on locate div container terminos_list_container")
			}

		var trigger_vars = {
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
															  tool_structuration.lang)
															  
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

		// Confirm action
		var msg = html2text("Remove indexation ?\n" + button_obj.dataset.term + " ["+button_obj.dataset.section_tipo+"-"+button_obj.dataset.section_id+"]");
			if( !confirm(msg) ) return false;

		var trigger_vars = {
			mode 		 	: 'remove_index',
			section_tipo 	: button_obj.dataset.section_tipo,
			section_id 	 	: button_obj.dataset.section_id,
			component_tipo  : button_obj.dataset.tipo,
			term  			: button_obj.dataset.term,
			locator 	 	: button_obj.dataset.locator
		}
		console.log(trigger_vars)

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
							if(SHOW_DEBUG===true) console.log(response)

							if (!response || response.result!==true) {

								alert("Error on remove index term: "+ button_obj.dataset.term)
							}else{
								// Refresh fragment_info // tagName, tipo, parent, section_tipo, lang
								tool_structuration.fragment_info( tool_structuration.tag_obj,
																  tool_structuration.component_tipo,
																  tool_structuration.section_id,
																  tool_structuration.section_tipo,
																  tool_structuration.lang)
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
	* UPDATE_TOP_ID
	* Update value of global page_globals.top_id on change selector value
	*/
	this.update_top_id = function(select_obj) {

		var value = select_obj.value

		if (value) {
			page_globals.top_id = value;
			if (DEBUG) console.log("Updated top_id to: "+value);
		}
		return false;
	};//end update_top_id



	/**
	* SELECT_TAG_IN_EDITOR
	* Select first tag (index in) image in text editor and scroll to he 
	*/
	this.select_tag_in_editor = function() {
		
		try {
			if(tinyMCE.activeEditor) {
				// Select request tag
				var tagname = '[id$=-'+page_globals.tag_id+'\\]]'
				var ed = tinyMCE.activeEditor
					ed.selection.select(ed.dom.select(tagname)[0]).scrollIntoView(false); //select the inserted element
	    	}
    	}catch(e) {
			//console.log("Error: "+e)
		}
	};//end select_tag_in_editor



	/**
	* TOGGLE_TAGS
	* @return 
	*/
	this.tags_vissible = true
	this.toggle_tags = function(button) {

		var text_preview = document.getElementById('text_preview')
		
		var ar_elements = text_preview.querySelectorAll('.index, .tc, .note')
		var len = ar_elements.length
		//console.log(ar_elements);

		if (this.tags_vissible!==true) {
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = ''
			}
			this.tags_vissible = true
		}else{
			for (var i = len - 1; i >= 0; i--) {
				ar_elements[i].style.display = 'none'
			}
			this.tags_vissible = false
		}
	};//end toggle_tags




};//end tool_structuration