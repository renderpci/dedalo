


/**
*  TOOL_INDEXATION CLASS
*/
var tool_indexation = new function() {

	// LOCAL VARS
	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/tools/tool_indexation/trigger.tool_indexation.php';



	/**
	* FIX_HEIGHT
	*/
	this.fix_height = function() {

		if (page_globals.modo!=='tool_indexation') {
			return false;
		}

		var current_height = window.innerHeight
    	document.getElementById('indexation_container').style.height = current_height+'px';
    	if(tinyMCE.activeEditor) {
    		// Adjust height
	    	tinyMCE.activeEditor.theme.resizeTo(
		        null,
		        250
		    );
    	}	   
	};//end fix_height

	
	window.addEventListener("load", function (event) {
		//tool_indexation.fix_height() 
		tool_indexation.select_tag_in_editor()
	});

	window.addEventListener("resize", function (event) {
	    tool_indexation.fix_height()
	});



	/**
	* FIX_TOOL_VARS
	* @return 
	*/
	this.fix_tool_vars = function(tagName, tipo, parent, section_tipo, lang) {
		
		// Fix global selected_tag and selected_tipo for index
		this.section_top_tipo 	= page_globals.top_tipo
		this.section_top_id 	= page_globals.top_id
		this.section_tipo 		= section_tipo
		this.section_id 		= parent+"" // maintain value as text for now
		this.component_tipo		= tipo
		this.tag 				= tagName
		this.tag_id 			= component_text_area.tag_to_id(tagName)+"" // maintain value as text for now	
		this.tag_state 			= component_text_area.tag_to_state(tagName)	
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
	this.fragment_info = function(tagName, tipo, parent, section_tipo, lang) {
		//console.log(tagName+", "+tipo+", "+parent+", "+section_tipo+", "+lang)

		// Fix vars
		this.fix_tool_vars(tagName, tipo, parent, section_tipo, lang)		

		// Target div container element
		var wrap_div = document.getElementById('indexation_page_list')

		var trigger_vars = {
			mode 		 	: 'fragment_info',
			section_tipo 	: this.section_tipo,
			section_id 	 	: this.section_id,
			component_tipo  : this.component_tipo,
			tag_id 	 		: this.tag_id,
			tagName 		: this.tag,
			lang 		 	: this.lang
		}
		//console.log(trigger_vars);

		html_page.loading_content( wrap_div, 1 );

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
							if(SHOW_DEBUG===true) console.log(response)

							if (response.result!==false) {

								// Clean wrap_div
								if(wrap_div) {
									var myNode = wrap_div; while (myNode.firstChild) {
										myNode.removeChild(myNode.firstChild);
									}
								}								

								// Tag info
								var data =  {
									tag_label 				: get_label.etiqueta + " " + component_text_area.tag_to_id(tagName),
									tag_options 			: {
																n : get_label.etiqueta_normal,
																d : get_label.etiqueta_borrada,
																r : get_label.etiqueta_revisar
															  },
									tag_options_selected	: tool_indexation.tag_state,
									tipo 					: tool_indexation.component_tipo,
									section_tipo 			: tool_indexation.section_tipo,
									parent 					: tool_indexation.section_id,
									lang 					: tool_indexation.lang,
									tag 					: tool_indexation.tag,
									rel_locator 			: tool_indexation.locator,
									terminos_list_title 	: get_label.descriptores,
									selected_fragment_text 	: response.fragment_text
								}
								Promise.resolve( tool_indexation.build_fragment_info(data, wrap_div) ).then(function(res){

									// Term list
									var ul = tool_indexation.build_term_list(response.indexations_list)
									
									// Clean and update terminos_list container
									var terminos_list_container = document.getElementById("terminos_list_container")
									if(terminos_list_container) {
										var myNode = terminos_list_container; while (myNode.firstChild) {
											myNode.removeChild(myNode.firstChild);
										}
										terminos_list_container.appendChild(ul)
									}
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
	this.load_inspector_indexation_list = function(tagName, tipo, parent, section_tipo, lang) {

		// Fix vars
		this.fix_tool_vars(tagName, tipo, parent, section_tipo, lang)

		var trigger_vars = {
			mode 		 	: 'indexations_list',
			section_tipo 	: this.section_tipo,
			section_id 	 	: this.section_id,
			component_tipo  : this.component_tipo,
			tag_id 	 		: this.tag_id,
			tagName 		: this.tag,
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
									var t = document.createTextNode(get_label.etiqueta+" "+tool_indexation.tag_id)
										label.appendChild(t)

									// Term list
									var ul = tool_indexation.build_term_list(response.indexations_list)
									
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

		var fragment_info = document.createElement('div')
			fragment_info.classList.add('fragment_id_info')

			var t = document.createTextNode(data.tag_label)
				fragment_info.appendChild(t)

			// Add element
			div.appendChild(fragment_info)

		var wrap_tag_state_selector = document.createElement('div')
			wrap_tag_state_selector.classList.add('wrap_tag_state_selector')

			var t = document.createTextNode(get_label.estado)
				wrap_tag_state_selector.appendChild(t)

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
					this.dataset.tag = tool_indexation.tag
					component_text_area.change_tag_state(this)
				})

			wrap_tag_state_selector.appendChild(select)

			// Add element
			div.appendChild(wrap_tag_state_selector)

		var div_delete_tag = document.createElement('div')
			div_delete_tag.classList.add('div_delete_tag')			

			var icon_delete_tag = document.createElement('div')
				icon_delete_tag.classList.add("icon_bs","tool_indexation_delete_icon","link")				
				icon_delete_tag.title = "Delete tag"				

				icon_delete_tag.addEventListener("click", function(e){
					tool_indexation.delete_tag(this)
				})

			var label = document.createElement('label')				
			var t = document.createTextNode("Delete tag")
				label.appendChild(t)

			div_delete_tag.appendChild(icon_delete_tag)
			div_delete_tag.appendChild(label)			

			// Add element
			div.appendChild(div_delete_tag)

		var icon_show_fragment = document.createElement('div')
			icon_show_fragment.classList.add("icon_bs","tool_indexation_show_fragment","link")

			icon_show_fragment.addEventListener("click", function(){
				tool_indexation.toggle_selected_fragment(this)
			})

			// Add element
			div.appendChild(icon_show_fragment)

		var selected_fragment = document.createElement('div')
			selected_fragment.classList.add("selected_fragment")		
			selected_fragment.innerHTML = data.selected_fragment_text // use innerHTML to parse the html content

			// Add element
			div.appendChild(selected_fragment)

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
			div.appendChild(terminos_list)


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
	this.delete_tag = function(button_obj) {

		// Confirm action
		if( !confirm( get_label.eliminar_etiqueta + "\n\n "+ tool_indexation.tag +"\n\n") )  return false;
		if( !confirm( get_label.atencion + "!! \n" + get_label.borrara_la_etiqueta_seleccionada ) )  return false;

		var trigger_vars = {
			mode 		 	: 'delete_tag',
			section_tipo 	: tool_indexation.locator.section_tipo,
			section_id 	 	: tool_indexation.locator.section_id,
			component_tipo  : tool_indexation.locator.component_tipo,
			tag  			: tool_indexation.tag,
			tag_id  		: tool_indexation.locator.tag_id,
			locator 	 	: tool_indexation.locator,
			lang 			: tool_indexation.lang
		}
		//return console.log(trigger_vars)

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
							if(SHOW_DEBUG===true) console.log(response)

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
								component_text_area.load_tr( document.querySelector('.css_text_area'), tinymce.activeEditor );

								// Clean selected fragment info
								var indexation_page_list = document.getElementById('indexation_page_list')
									//indexation_page_list.html('');
									var myNode = indexation_page_list; while (myNode.firstChild) {
										myNode.removeChild(myNode.firstChild);
									}
							}
						})

		return js_promise

		/*
			button_obj = $(button_obj);

			var tag 				 = button_obj.data('tag'),
				rel_locator 		 = JSON.stringify(button_obj.data('rel_locator')), // Convert to string for consistency
				parent 				 = button_obj.data('parent'),
				section_tipo 		 = button_obj.data('section_tipo'),
				tipo 				 = button_obj.data('tipo'),
				indexation_page_list = $('#indexation_page_list'),
				wrapper_id 			 = $('.css_wrap_text_area').first().attr('id'), 
				target_obj 			 = $('#'+wrapper_id)  // Target div (contains all data info required for create the component to load)

				if (target_obj.length<1) { return alert("Sorry. wrapper_id not found: " + wrapper_id) };		
			

			// Confirm action
			if( !confirm( get_label.eliminar_etiqueta + "\n\n "+ tag +"\n\n") )  return false;

			if( !confirm( get_label.atencion + "!! \n" + get_label.borrara_la_etiqueta_seleccionada ) )  return false;

			var mode 	= 'delete_tag';
			var mydata	= { 'mode': mode,
							'section_tipo':section_tipo,
							'parent': parent,
							'tipo': tipo,
							'tag': tag,
							'rel_locator': rel_locator,
							'top_tipo':page_globals.top_tipo
						 };
						//return alert( JSON.stringify(mydata)  )

			// AJAX REQUEST
			$.ajax({
				url		: DEDALO_LIB_BASE_URL + '/tools/tool_indexation/trigger.tool_indexation.php',
				data	: mydata,
				type	: "POST"
			})
			// DONE
			.done(function(received_data) {

				if (DEBUG) console.log("->delete_tag received_data: "+received_data)
				
				// Expected response is string 'ok'
				if (received_data=='ok') {
					// Reload component in DOM
					
					//var arguments = null;
					//component_common.load_component_by_wrapper_id(wrapper_id, arguments);				

					var ed = tinymce.activeEditor;
					component_text_area.load_tr( $('.css_text_area')[0], ed );

					// Clean selected fragment info
					indexation_page_list.html('');

				}else{
					alert("->delete_tag error: "+received_data)
				}						
			})
			// FAIL ERROR 
			.fail(function(error_data) {					
				inspector.show_log_msg(" <span class='error'>ERROR: on delete_tag !</span> ");
			})
			// ALWAYS
			.always(function() {			
				//html_page.loading_content( wrapper_id, 0 );
			});
			*/
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
		//console.log(trigger_vars);

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
								tool_indexation.fragment_info(tool_indexation.tag,
															  tool_indexation.component_tipo,
															  tool_indexation.section_id,
															  tool_indexation.section_tipo,
															  tool_indexation.lang)
															  
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
								tool_indexation.fragment_info(tool_indexation.tag,
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
	this.create_fragment = function ( button_obj ) {	//, component_name

		var identificador_unico	= button_obj.dataset.identificador_unico
		var parent				= button_obj.dataset.parent
		var section_tipo		= button_obj.dataset.section_tipo
		var lang				= button_obj.dataset.lang
		var component_id		= identificador_unico;

		//return console.log( lang );

		// Select current editor
		var ed = tinyMCE.get(component_id);
		//var ed = tinymce.activeEditor
			if ($(ed).length<1) { return alert("Editor " + component_id + " not found [1]!") };	

		if (DEBUG) console.log( ed.selection.getContent({format : 'text'}) )

		/*
		var current_text_area = $('#'+component_id);
			if ($(current_text_area).length<1) { return alert("Editor " + component_id + " not found [2]!") };
		*/
		var current_text_area = document.getElementById(component_id);
			if (!current_text_area) {
				return alert("Editor " + component_id + " not found [2]!")
			}

		/*
		var last_tag_index_id = $(current_text_area).data('last_tag_index_id');
		*/
		var last_tag_index_id = parseInt(current_text_area.dataset.last_tag_index_id);
			//console.log(last_tag_index_id);
		
		var string_selected 	= ed.selection.getContent({format : 'raw'}); // Get the selected text in raw format
		var string_len 			= string_selected.length ;
			if(string_len<1) return alert("Please, select a text fragment before ! " +string_len);

		// New tag_id to use
		var tag_id = parseInt(last_tag_index_id+1);		//alert("new tag_id:"+last_tag_index_id + " "+component_id); return false;

		// State. Default is 'n' (normal)
		var state = 'n';

		// Final string to replace 
		var final_string = component_text_area.build_index_in_img(tag_id,state) + string_selected + component_text_area.build_index_out_img(tag_id,state);
		//return alert(final_string)
		
		// Add new formated string to replace the selected text
		var replace = ed.selection.setContent( final_string );	
			//if (DEBUG) console.log(replace)

		ed.setDirty(true);	// Force dirty state	
		
		// Update last_tag_index_id data on current text area
		/*
		$(current_text_area).data('last_tag_index_id',tag_id);
		*/
		current_text_area.dataset.last_tag_index_id = tag_id;


		// FORCE UPDATE REAL TEXT AREA CONTENT (and save is triggered when text area changes)												
		//tinyMCE.triggerSave();	//console.log(tinyMCE)
		// TEXT EDITOR : Force save		
		var evt = null;
		text_editor.save_command(ed, evt, current_text_area);

		
		// Load current tag relation info
		var tagName = component_text_area.tag_index.in_pre + 'n-' + tag_id + component_text_area.tag_index.in_post;;			
		//var tipo 	= $('#'+ed.id).parents('.wrap_component').first().data('tipo');
		var tipo 	= current_text_area.dataset.tipo;
		if(typeof(tagName)==='undefined' || typeof(tipo)==='undefined' || typeof(parent)==='undefined') {
			alert("Impossible load relation. Insuficient data: \n tagName:"+tagName+" - tipo:"+tipo);
		}else{
			this.fragment_info(tagName, tipo, parent, section_tipo, lang);	//tagName, tipo, id_matrix //alert("Calling fragment_info with arguments: "+ tagName + " " + tipo)
		}

		// Hide "Create New Fragment" button
		$(button_obj).hide()

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



};//end tool_indexation