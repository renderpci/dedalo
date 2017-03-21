// JavaScript Document

// Global var. Set when load fragment
var selected_rel_locator;
var selected_tag;
var selected_tipo;


/**
* COMPONENT TEXT AREA CLASS
*
*/
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


	// Fix this values on select elements in text editor
	this.section_tipo
	this.section_id
	this.component_tipo
	this.wrapper_id
	this.lang
	this.tag_obj

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

	this.reload_on_save = true


	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");
		var text_area = $(obj_wrap).find('textarea').first()
		if (text_area.length===1 && tinyMCE.activeEditor) {
			tinyMCE.get( text_area[0].id ).focus()
		}
	}//end select_component



	/**
	* SAVE
	* Save supports save from tinymce editor and from div like struct
	*/
	this.Save = function(component_obj, save_arguments, ed) {

		// TEXT AREA . Hidden
		if (component_obj === null || typeof component_obj !== 'object') {
			alert("[Save] Error: component_text_area is empty")
			return false;
		}

		// SAVE ARGUMENTS
		if (save_arguments === null || typeof save_arguments !== 'object') {
			save_arguments = {}
		}

		// TEXT EDITOR OBJECT SELECT FALLBACK
		if (ed === null || typeof ed !== 'object') {
			// USING DIV AS EDITOR (LIKE STRUCT)
			var is_tiny = false;

			// Prepare container content
			var container  = component_obj // container is self received div

		}else{
			// USING TINYMCE EDITOR
			var is_tiny = true;

			// ISDIRTY . Content has change ?
			// console.log(ed.isDirty())
			if(ed.isDirty()===false) {
				if(SHOW_DEBUG===true) {
					console.log("[Save]-> Info: Nothing is saved because ed.isDirty() is false (no changes are detected in editor)");
				}
				return false;
			}

			// Saving from main text editor content instead text area content
			var dato = ed.getContent({format : 'raw'});				
				//console.log(dato);

				// Prepare container content
				var container = document.createElement("div")
					container.innerHTML = dato				
		}

		var dato_clean = this.preprocess_text_to_save(container)
			if (dato_clean) {
				save_arguments.dato = dato_clean;
			}else{
				console.log("Error on preprocess_text_to_save !! Saving unprocessed dato")
				save_arguments.dato = dato;
			}

		/*
		if (ed === null || typeof ed !== 'object') {
			alert("[Save] Error: editor is empty")
			return false;
		}*/

		// FORCE UPDATE REAL TEXT AREA CONTENT (and save is triggered when text area changes)
		//tinyMCE.triggerSave(); // Force update all textareas	//console.log(tinyMCE);
		//ed.save(); // Force update current textarea content
		//console.log(ed.isDirty());		

		
		// As already using own editor spinner, don't use here component spinner
		save_arguments.show_spinner = false;			
			

		// FORCE UPDATE REAL TEXT AREA CONTENT
			//tinyMCE.triggerSave();		//alert(ed.getContent())
			//ed.save();

			//var c = component_common.get_wrapper_from_element(component_obj)
			//console.log( c); return;
			//console.log(component_obj); return

		// SAVE COMPONENT_COMMON . Exec general save
		var jsPromise = component_common.Save(component_obj, save_arguments);

			// Update editor and component content on finish save
			jsPromise.then(function(response) {

			  	// Reload TR processed text
			  	if (component_text_area.reload_on_save===true && is_tiny===true) {
			  		component_text_area.load_tr( component_obj, ed )
			  	}				

			  	if (is_tiny===false) {

			  	}
				// Update possible dato in list (in portal x example)
				//component_common.propagate_changes_to_span_dato(component_obj);
			}, function(xhrObj) {
			  	console.log(xhrObj);
			});

		return jsPromise;
	};//end Save



	/**
	* PREPROCESS_TEXT_TO_SAVE
	* Replace <section> tags to internal Dédalo tags
	* Unify text content format
	* @return string
	*/
	this.preprocess_text_to_save = function(container) {

		if (!container) {
			console.log("Error on preprocess_text_to_save. container element is not valid")
			return false;
		}
		
		// Clone to avoid affect existing DOM elements
		var cloned_text = container.cloneNode(true)		

		// SECTION TAGS (STRUCT)
		// Iterate all section elements
		var section_elements = cloned_text.getElementsByTagName('section')
		if (section_elements) {
			//console.log(section_elements)
			var len = section_elements.length
			for (var i = len - 1; i >= 0; i--) {				
				// Convert section tags to dedalo internal labels
				// <section class="section_struct text_unselectable" id="section_2" data-state="n" data-label="" data-data="{'section_tipo':'rsc370','section_id':'3'}">..</section>
				// [struct-a-1-1-data:{'section_tipo':'rsc370','section_id':'3'}:data]...[/struct-a-1-1-data:{'section_tipo':'rsc370','section_id':'3'}:data]
				var tag_id 		= section_elements[i].dataset.tag_id
				var state 		= section_elements[i].dataset.state
				var label 		= section_elements[i].dataset.label
				var data 		= section_elements[i].dataset.data
				// Compose Dédalo tags
				//var tag_struct_in  = component_text_area.build_tag_struct_in(tag_id,state,label,data)
				var tag_struct_in  = component_text_area.build_dedalo_tag('structIn', tag_id, state, label, data)
				//var tag_struct_out = component_text_area.build_tag_struct_out(tag_id,state,label,data)
				var tag_struct_out = component_text_area.build_dedalo_tag('structOut', tag_id, state, label, data)
				var final_string   = tag_struct_in + section_elements[i].innerHTML + tag_struct_out

				// Replaces tag content string with new created
				section_elements[i].innerHTML = final_string
				
				// Unwrap section tag node (removes tags and leaves only contents)
				component_text_area.unwrap_element(section_elements[i]);
			}//end for (var i = len - 1; i >= 0; i--) {
		}//end section_elements


		// IMG TAGS (INDEX,TC,SVG,GEO,PERSON,ETC.)
		var image_elements = cloned_text.getElementsByTagName('img')
		if (image_elements) {
			var len = image_elements.length
			for (var i = len - 1; i >= 0; i--) {
				// Build dedalo tag from node image dataset	info		
				var final_string = this.build_dedalo_tag(image_elements[i].dataset.type, image_elements[i].dataset.tag_id, image_elements[i].dataset.state, image_elements[i].dataset.label, image_elements[i].dataset.data) 
				if (final_string) {
					// Replaces tag content string with new created
					image_elements[i].innerHTML = final_string
					// Unwrap section tag node (removes tags and leaves only contents)
					component_text_area.unwrap_element(image_elements[i]);
				}
			}
		}//end if (image_elements)

		// REMOVE TEMPORAL ELEMENTS
		var temp_elements = cloned_text.getElementsByTagName('h2')
		var len = temp_elements.length
			for (var i = len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}
		// REMOVE TEMPORAL HEADER (TOC)
		var temp_elements = cloned_text.getElementsByTagName('header')
		var len = temp_elements.length
			for (var i = len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}
			

		return cloned_text.innerHTML
	};//end preprocess_text_to_save



	/**
	* LOAD_TR
	* Load text editor content without load component html
	*/
	this.load_tr = function(component_obj, ed) {

		if (typeof component_obj!=='object' || typeof component_obj.dataset==='undefined') {
			console.log("[load_tr] Error on load_tr. Invalid component_obj: ")
			return false;
		}		

		var mydata = {	mode		 : 'load_tr',
						parent		 : component_obj.dataset.parent,
						tipo		 : component_obj.dataset.tipo,
						lang		 : component_obj.dataset.lang,
						section_tipo : component_obj.dataset.section_tipo,
						top_tipo	 : page_globals.top_tipo,
						top_id		 : page_globals.top_id,
					}
					//return console.log(mydata)

		//html_page.loading_content( component_obj, 1 );
		ed.setProgressState(true); // Show progress en texto

		//var jsPromise = Promise.resolve(

			// AJAX REQUEST
			$.ajax({
				url		: component_text_area.url_trigger,
				data	: mydata,
				type 	: "POST",
				async   : component_common.save_async
			})
			// DONE
			.done(function(response) {
				if (SHOW_DEBUG===true) {
					console.log(response);
				}

				if (response===null) {
					return alert("[load_tr] Error on load_tr. null value is received")
				}else if (response.result===false) {
					return alert("[load_tr] Error on load_tr. false value is received")
				}

				var updated_received_data = response.result				

				// INSPECTOR LOG INFO
				/*
				if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1) {
					var msg = "<span class='error'>Failed!<br>" +received_data+ "</span>";
					console.log(msg);
				}
				*/
				if ( /Auth error/i.test(updated_received_data) ) {
					ed.setProgressState(false); // Hide progress en texto
					ed.setDirty(true); 			// Force dirty state
					// "To keep the changes, DO NOT CLOSE THIS WINDOW. Log on to another browser window and then return to this window and save the content (pressing the 'Save' button)"
					alert("[load_tr] Error on save: "+updated_received_data+"<hr>"+ get_label.conservar_los_cambios_transcripcion)
				}else{
					//console.log(updated_received_data);
					ed.setContent(updated_received_data);
					ed.save()

					// FORCE UPDATE REAL TEXT AREA CONTENT
					//tinyMCE.triggerSave();		//alert(ed.getContent())
				}
			})
			// FAIL ERROR
			.fail(function(error_data) {
				if(SHOW_DEBUG===true) console.log(error_data);
			})
			// ALWAYS
			.always(function() {
				//html_page.loading_content( component_obj, 0 );
				ed.setProgressState(false); 	// Hide progress en texto
			})
		//)//end promise
		//return jsPromise;
	};//end load_tr



	/**
	* BUILD_DEDALO_TAG
	* Unified way of create dedalo custom tags from javascript
	* @return string tag
	*/
	this.build_dedalo_tag = function(type, tag_id, state, label, data) {
		
		var valid_types = ["indexIn","indexOut","structIn","structOut","tc","tc2","svg","geo","page","person","note"]
			if (valid_types.includes(type)===false) {
				return alert("Invalid build_dedalo_tag type: " + type)
			}

		// Bracket_in is different for close tag
		var bracket_in = (type.indexOf("Out")!==-1) ? "[/" : "["

		// Removes sufixes 'In' and 'Out'
		var type_name = type.replace(/In|Out/, '');

		// Label truncate and replace - avoid future errors
		label = label.substring(0,22);
		label = replaceAll('-', '_', label)

		switch(type) {
			case "tc":
				var dedalo_tag = tag_id
				break;			
			default:
				var dedalo_tag = bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "-" + "data:" + data + ":data]"
		}

		return dedalo_tag
	};//end build_dedalo_tag



	/**
	* BUILD_DOM_ELEMENT_FROM_DATA
	* @return 
	*/
	this.images_factory_url = "../../../inc/btn.php"
	this.build_dom_element_from_data = function(type, tag_id, state, label, data) {
		
		var node_type = 'img'

		if (type==='tc') {

			// TC exception
			var tc = tag_id
			var element = document.createElement(node_type)
				element.src = this.images_factory_url + "/" + "[TC_" + tc + "_TC]"
				element.id  = "[TC_" + tc + "_TC]"
				element.classList.add(type)
				element.dataset.type 	= type // Like indexIn . Note that is NOT type_name, is different for In and Out
				element.dataset.tag_id 	= "[TC_" + tc + "_TC]"
				element.dataset.state 	= 'n'
				element.dataset.label 	= tc
				element.dataset.data 	= tc

		}else{

			// Bracket_in is different for close tag		
			var bracket_in = (type.indexOf("Out")!==-1) ? "[/" : "["

			// Removes sufixes 'In' and 'Out'
			var type_name = type.replace(/In|Out/, '');

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
		console.log(element);		

		return element
	};//end build_dom_element_from_data



	/**
	* GET_TAGS
	* @return array ar_tags
	*	Array of dom object (normally images)
	*/
	this.get_tags = function (related_tipo, tag_type) {

		// ID . Get editor id from related tipo
		var component_text_area_id = document.querySelector('textarea[data-tipo="'+related_tipo+'"]').id

		// ED . Select text editor
		var ed = tinymce.get(component_text_area_id)

		// Select nodes of type tag_type
		var ar_tags = ed.dom.select('[data-type="'+tag_type+'"]')
				
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
				for (var i = i_len - 1; i >= 0; i--) {		
					
					// current tag like [svg-n-1]
					var current_tag = ar_struct_tags[i].id;
					var ar_parts 	= current_tag.split('_');
					var number 	 	= parseInt(ar_parts[1]);
			
					// Insert id formated as number in final array
					ar_id_final.push(number)
				}
				break;

			default:
				// like img as id: [index-n-1--label-data:**]
				// IMG : Select all images in text area
				var ed = container
				// Select with tiny dom selector an image with class : tag_type				
				var ar_img = ed.dom.select('img.'+tag_type);
				// ITERATE TO FIND TIPO_TAG (filter by classname: svg,etc.)
				var i_len = ar_img.length
				for (var i = i_len - 1; i >= 0; i--) {				
					
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
		var last_tag_id = Math.max.apply(null, ar_id_final);
			console.log("last_tag_id of type: " + tag_type +" -> "+ last_tag_id )		

		return parseInt(last_tag_id);
	}//end get_last_tag_id



	/**
	* CHANGE_TAG_STATE
	* @param obj
	*/
	this.change_tag_state = function (select_obj) {
		/*
		var tag_obj 		= data.tag_obj
		var related_tipo 	= data.component_tipo
		*/
		// Note: 'this.tag_obj' is fixed in text_editor when user makes click on image element
		var tag_obj 		= this.tag_obj
		var	tag_id 			= this.tag_obj.dataset.tag_id
		var	type 			= this.tag_obj.dataset.type
		var	current_state 	= this.tag_obj.dataset.state
		var	current_label 	= this.tag_obj.dataset.label
		var	current_data 	= this.tag_obj.dataset.data
		var related_tipo 	= this.component_tipo
		var save 			= true

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
		
		return this.update_tag(tag_obj, new_data_obj, related_tipo, save);
	}//end change_tag_state



	/**
	* UPDATE_TAG
	* Edit selected tag and add or modify datasets
	*/
	this.update_tag = function(tag_obj, new_data_obj, related_tipo, save) {
	
		var type 	= tag_obj.dataset.type
		var tag_id 	= tag_obj.dataset.tag_id

		var container = this.get_related_editor(related_tipo)

		// DOM Selection pattern
		if (type.indexOf('In')!==-1 || type.indexOf('Out')!==-1) {
			var type_name = type.replace(/In|Out/, '');
			// Selects elements with data start with 'type_name' like 'indexIn'
			var selection_patern = '[data-type^="'+type_name+'"][data-tag_id="'+tag_id+'"]'
		}else{
			var selection_patern = '[data-type="'+type+'"][data-tag_id="'+tag_id+'"]'
		}

		var is_tiny = (typeof container.type!="undefined" && container.type==="setupeditor") ? true : false;
					
		// Select current tag in dom
		if (is_tiny) {
			// tinyMCE editor
			var ed = container
			var current_elements = ed.dom.select(selection_patern)
		}else{
			// Standard dom container
			var current_elements = container.querySelectorAll(selection_patern)
		}
		
		if (!current_elements.length) {
			alert("Error on select tag to update_tag " + tag_id + " " + type)
			return false;
		}

		var len = current_elements.length
		for (var i = len - 1; i >= 0; i--) {
			// Set new state to dataset of each dataset
			for (var key in new_data_obj) {
			  current_elements[i].dataset[key] = new_data_obj[key]
			}			
		}

		// Update editor
		if (is_tiny) {
			ed.focus();
			// Force ed dirty state
			ed.setDirty(true);	 // Force dirty state

			if (typeof save!="undefined" && save===true) {
				// text_area element and ed share the same id
				var current_component_text_area = document.getElementById(ed.id)

				// Save modified content
				return component_text_area.Save( current_component_text_area, null, ed );
			}			
		}else{
			alert("Sorry. Not implemented yet");
		}		
	};//end update_tag



	/**
	* GET_RELATED_EDITOR
	* @return object related_editor
	*/
	this.get_related_editor = function(related_tipo) {

		// WRAPPER
			var wrapper = document.querySelector('.wrap_component[data-tipo="'+related_tipo+'"]')

			var textarea = wrapper.querySelector('textarea')

			if (textarea) {
				// ED container
				var related_editor = tinymce.get(textarea.id)
			}else{
				// Struct container
				var related_editor = wrapper.getElementsByClassName('text_area_tool_structuration')[0]
			}		
		
		return related_editor
	};//end get_related_editor



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
		//text_editor.save_command(ed,evt,text_area_component);

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
							component_text_area.videoPlay(e);				if(SHOW_DEBUG===true) console.log('->text editor videoPlay ed.onKeyUp: '+e.keyCode);
							break;

				//case 113 : 	// Key F2 (113) Write tc tag in text
				case parseInt(videoFrame.av_media_player_insert_tc_key) :
							component_text_area.get_and_write_tc_tag(e);	if(SHOW_DEBUG===true) console.log('->text editor write_tc_tag ed.onKeyUp: '+e.keyCode);
							break;
			}
		}catch(e){
			if(DEBUG) console.log(e)
		}
	};//end av_editor_key_up



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
		var target_obj 	= document.getElementById('relations_ajax_div_'+tipo);

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
	};//end load_relation



	/**
	* SHOW_BUTTON_LINK_FRAGMET_TO_PORTAL
	* Carga el botón correspondiente a la etiqueta seleccionada (toma ya..)
	*/
	this.show_button_link_fragmet_to_portal = function(tag_obj, tipo, parent, section_tipo) {
		
		var	tag_id 		= tag_obj.dataset.tag_id
		var button_id 	= 'btn_relate_fragment_'+tipo
		var	button_obj 	= document.getElementById(button_id)
			if (!button_obj) {
				console.log("[show_button_link_fragmet_to_portal] Unable select button_obj by id: "+button_id);
				return false;
			}		

		// Build locator to enable save in portal
		var locator = {
				'section_tipo'  : section_tipo,
				'section_id' 	: parseInt(parent),
				'component_tipo': tipo,
				'tag_id' 		: tag_id,
			}
			locator_string = JSON.stringify(locator); 
			//return 	console.log(locator_string);

		// Update locator data in button for tool_portal task
		button_obj.dataset.rel_locator = locator_string;

		// Update label tag id
		$(button_obj).find('span').html( tag_id )
		
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
		var wrapper_id 	= 'fragment_info_div_'+tipo+'_'+lang;
		var target_obj  = document.getElementById(wrapper_id);

		// Usamos caller_id para pasar el tag al componente (no hay otra forma mejor de momento..)
		// $target_obj.data('caller_id',tagName);
		target_obj.dataset.caller_id = tag_obj.dataset.tag_id

		if(SHOW_DEBUG===true) console.log("->load_fragment_info loading tag data on div wrapper: "+wrapper_id + " from tag:"+tag_obj.dataset.tag_id+" - tipo:"+tipo+" - lang:"+lang)
		var arguments = null;

		return component_common.load_component_by_wrapper_id(
								wrapper_id,
								arguments
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
		if(DEBUG) console.log("->component_text_area goto_time captured and passed: "+timecode)
		//var timecode = component_text_area.tag_to_timecode(tagName);

		if ($('#videoFrame').length>0 ) {
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
		if(DEBUG) console.log("->component_text_area videoPlay captured and passed: "+e.keyCode)
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
		if(DEBUG) console.log("->component_text_area get_and_write_tc_tag captured and passed: "+e.keyCode);
		if ( $('#videoFrame').length>0 ) {
			return videoFrame.get_and_write_tc_tag(e);
		}else{
			return top.get_and_write_tc_tag(e);
		}
	};



	/**
	* TAG TO ID
	*/
	this.get_tag_id = function (tag){
	
		var matches = tag.match(/\[\/?[\w]+-[a-z]-([0-9]{1,6})((-.{0,8})?-data:.*?:data)?\]/); 
		if (matches===null) {
			console.log("Error on get tag id from tag: "+tag);
			return false
		}
		var tag_id  = matches[1]
	
		return parseInt(tag_id);
	};



	/**
	* TAG TO STATE . Resolve state from tag
	*/
	this.get_tag_state = function (tag) {

		// Unificamos etiquetas a tag_in
		var matches = tag.match(/\[\/?[\w]+-([a-z])-[0-9]{1,6}(-(.{0,8})-data:.*?:data)?\]/);
		if (matches===null) {
			console.log("Error on get tag state from tag: "+tag);
			return false
		}
		var state  = matches[1]
	
		return state;
	};
	

	/**
	* GET TAG LABEL. Resolve label from tag
	*/
	this.get_tag_label = function (tag) {

		// Unificamos etiquetas a tag_in
		var matches = tag.match(/\[\/?[\w]+-[a-z]-[0-9]{1,6}-(.{0,8})-data:.*?:data\]/);
		if (matches===null) {
			console.log("Warning: tag without label: "+tag);
			return false
		}
		var label  = matches[1]
	
		return label;
	};



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
	};



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
	};//end get_data_locator_from_tag



	/**
	* TAG TO TIMECODE
	*/
	this.tag_to_timecode = function (tag) {
		// tag format [TC_00:00:00.000_TC]
		var str = tag.replace("[TC_","");
			str = str.replace("_TC]","");

		return str;
	};



	/**
	* ESCAPE TAG
	*/
	this.escape_tag = function (tag) {
		return tag.replace(/(["<>\/*+^$[\]\\{}|])/g, "\\$1")
	};


	/**
	* TESAURO OPEN WINDOW TREE
	*//*
	this.open_tesauro = function (obj) {

		var current_tipo 	= $(obj).data('tipo');
	  	var caller_tipo 	= $(obj).data('caller_tipo');
		var caller_id 		= $(obj).data('parent');

		// Dialog Title
		$("#dialog_page_iframe").dialog({
			// Change title
			title: 'Add tesauro index',
			// Clear current content on close
			close: function(event, ui) {
	            //$(this).attr( 'src', '');
	        },
	        modal: false,
	        width: 800,
	        height:600,
	        position: { my: "left top", at: "left top", of: obj }
        });

		var iframe_src 	 	= DEDALO_LIB_BASE_URL + "/../../ts/ts_list.php?modo=tesauro_rel&type=4&current_tipo="+current_tipo+"&caller_id="+caller_id+"&caller_tipo="+caller_tipo;

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)
		if( $('#dialog_page_iframe').attr('src').length < 12 ) //about:blank
		$('#dialog_page_iframe').attr('src',iframe_src);
		$('#dialog_page_iframe').dialog( "open" );

		// Fix global var selected_rel_locator
		selected_rel_locator = $(obj).data('rel_locator');

		return false;
	};//end open_tesauro
	*/



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
	}
	*/


	/**
	* RELOAD_COMPONENT_WITH_LANG
	* Configures the current component_text_area wrapper and reloads
	*/
	this.reload_component_with_lang = function(data) {

		var selector = '[role="wrap_component_text_area"][data-tipo="'+data.tipo+'"][data-section_tipo="'+data.section_tipo+'"][data-parent="'+data.parent+'"]'
		var wrapper  = document.querySelector(selector);
			//console.log(wrapper);
		if (wrapper && typeof wrapper!=='undefined') {		

			// Update wrapper dataset lang
			wrapper.dataset.lang = data.lang

			// Update wrapper id
			var ar_parts = wrapper.id.split('_');
			if (typeof ar_parts[4]!=='undefined' && ar_parts[4].indexOf('lg-') > -1) {
				ar_parts[4] = data.lang
				wrapper.id = ar_parts.join([separador = '_']);
			}else{
				console.log("Error[reload_component_with_lang]: Lang of wrapper_id not found!");
			}
			// console.log(wrapper.id);

			// Reload component_text_area
			component_common.load_component_by_wrapper_id(wrapper.id)
		}
	}//end reload_component_with_lang



	/**
	* LOAD_TAGS_PERSON
	* @return 
	*/
	this.load_tags_person = function(button_obj, hide) {

		var start = new Date().getTime();

		if (!button_obj) {
			var button_obj = document.querySelector('[data-role="text_area_transcription"]')
		}
		
		// From component wrapper
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_text_area:load_tags_person: Sorry: wrap_div dom element not found")
			}
		var editor_panel = wrap_div.querySelector('.content_data')
			if (editor_panel === null ) {
				return alert("component_text_area:load_tags_person: Sorry: editor_panel dom element not found")
			}
		var persons_overlay = document.getElementById('persons_overlay')
			if (!persons_overlay) {
				var persons_overlay = document.createElement('div')
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
		
		var trigger_vars = {
			mode 		 : 'load_tags_person',
			tipo 		 : wrap_div.dataset.tipo,
			parent 		 : wrap_div.dataset.parent,
			section_tipo : wrap_div.dataset.section_tipo,
			lang 		 : wrap_div.dataset.lang,
			top_tipo 	 : page_globals.top_tipo // Important !
		}
		//return console.log(trigger_vars);

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
					
			editor_panel.appendChild(persons_overlay)

			if (response===null) {
				persons_overlay.innerHTML = "<div>null value was received</div>"
			}else{
				var parse_tags_person = component_text_area.parse_tags_person(response.result)			
				persons_overlay.appendChild(parse_tags_person)
			}


			var button_close = document.createElement('div')
				button_close.classList.add('button_close')
				button_close.addEventListener('click', function() {
					//html_page.close_content(this.parentNode)
					//persons_overlay.remove()
					persons_overlay.style.display = 'none';
				});
			 	persons_overlay.appendChild(button_close)

			 if (SHOW_DEBUG===true) {
			 	var end  = new Date().getTime();
				var time = end - start;
				console.log("load_tags_person execution time: " +time+' ms');
			 }

			// Unactive overlay
			// html_page.loading_content( wrap_div, 0 );

			if (hide===true) {
				persons_overlay.style.display = 'none';
			}
		})
	};//end load_tags_person



	/**
	* PARSE_TAGS_PERSON
	* @return 
	*/
	this.parse_tags_person = function(data) {
		
		var ul 	 = document.createElement('ul')

		var len = data.length
		for (var i = 0; i < len; i++) {
		
			var element = data[i]
			var li = document.createElement('li')
			// Tag image
			var container = document.createElement('div')	
				//container.innerHTML = element.tag_image
				//var tag_id = component_text_area.get_last_tag_id('person') + 1 //  tag_type, note_number, state, label, data
				console.log(data[i].data);
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
		tinymce.activeEditor.on('keydown', function(evt) {
		    			
			for (var j = 0; j < len; j++) {
				if (evt.ctrlKey==1 && evt.keyCode==j+48) {
					//console.log("presed key: "+j);
					component_text_area.insert_person_image(this, data[j].tag_id, data[j].state, data[j].label, data[j].data, evt)					
				}
			}
		});		
		
		return wrap
	};//end parse_tags_person



	/**
	* INSERT_PERSON_IMAGE
	* Build and insert a image full html code from vars
	*/
	this.insert_person_image = function(ed, tag_id, state, label, data, evt) {	 //info_obj.tag_id, info_obj.state, info_obj.label, info_obj.data, evt)
		evt.preventDefault()
		evt.stopPropagation()

		// Set component to not reload on save temporally
		component_text_area.reload_on_save = false;

		var data = JSON.stringify(data)
			if (!data) data = ''

			// Format data Important !!
			data = replaceAll('"', '\'', data);

		var last_tag_id = component_text_area.get_last_tag_id(ed, 'person')
		
		// IMG : Create and insert image in text // type, tag_id, state, label, data
		var img = component_text_area.build_dom_element_from_data('person', last_tag_id + 1, state, label, data)
		
		// Select text editor

			// Insert html on editor
			ed.selection.setContent( img.outerHTML, {format:'raw'} )

			ed.setDirty(true); // Set editor content as changed
			ed.isNotDirty = false; // Force not dirty state				

		// Restore default save behaviour after add image
		setTimeout(function(){
			
			component_text_area.reload_on_save = true;

			console.log("Set person "+label);
			console.log(ed.isDirty());

		}, 300)

		

		/*
		ed.focus();		
		ed.setDirty(true); // Set editor content as changed
		ed.isNotDirty = false; // Force not dirty state
		*/

		//component_text_area.saveable = true;

		/*
			// Update editor
			var ed = tinyMCE.activeEditor;
				ed.setContent(img_html + " "); //, {format : 'raw'}
				ed.focus();
				ed.setDirty(true);	// Force dirty state

			// Save modified content
			var input_text_area = document.querySelector('.css_text_area')
				if (input_text_area) {
					return component_text_area.Save( input_text_area, null, ed );	
				}
				*/		
	};//end insert_person_image



	/**
	* SHOW_PERSON_INFO
	* @return 
	*/
	this.show_person_info = function( evt ) {
	
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

		var label_x = evt.x - 25
		var label_y = evt.y + 50

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
			//return console.log(trigger_vars)

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
							if(SHOW_DEBUG===true) {
								console.log(response); 
							}

							var t_name 	= document.createTextNode(response.full_name)
							var t_role 	= document.createTextNode(" ("+response.role+") ")
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

						})

		return js_promise
	};//end show_person_info


	
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
	};//end link_term



	/**
	* CREATE_NEW_NOTE
	* Build a new annotation when user clicks on text editor button
	* 
	* @return 
	*/
	this.create_new_note = function() {

		// Select text editor
		var ed 		 	= tinyMCE.activeEditor
		var tag_type 	= 'note'
		var last_tag_id = component_text_area.get_last_tag_id(ed, tag_type) 
		var note_number = parseInt(last_tag_id) + 1
		//console.log(last_tag_id)

		var trigger_vars = {
			mode 		 	: 'create_new_note',
			note_number		: note_number,
		}
		//console.log(trigger_vars);

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
				
			if (response===null) {
				alert("Error on create annotation tag")
			}else{
				
				var label = note_number
				var state = 'a'
				var data = JSON.stringify(response.result)
					// Format data Important !!
					data = replaceAll('"', '\'', data);

				// IMG : Create and insert image in text
				//var img_html = component_text_area.build_note_img(label, state, data)
				var img 		= component_text_area.build_dom_element_from_data(tag_type, note_number, state, label, data) 
				var img_html 	= img.outerHTML
					console.log(img);
				// Insert html on editor
<<<<<<< HEAD
				ed.selection.setContent( img_html, {format:'raw'} )
=======
				ed.selection.setContent(  img_html , {format:'raw'} )
>>>>>>> origin/master

				// Set editor as modified and save
				ed.setDirty(true)
				component_text_area.Save( document.getElementById(ed.id), null, ed ).then(function(response){
					// On finish save, select created tag (the last) and trigger click action
					var last_tag_obj = component_text_area.get_last_element(ed, 'note')
					if (last_tag_obj) {
						// Select image in text editor
						ed.selection.select(last_tag_obj); //select the inserted element // .scrollIntoView(false)
						// Trigger exec click on selected tag
						last_tag_obj.click();
					}
				})							
			}			
		})

		return js_promise
	};//end create_new_note



	/**
	* SHOW_NOTE_INFO
	* @return 
	*/
	this.show_note_info = function( evt ) {
	
		var tag_obj 	 = evt.target
		var tag 		 = evt.target.id
		var locator 	 = component_text_area.get_data_locator_from_tag( tag_obj ) 
		var section_tipo = locator.section_tipo
		var section_id 	 = locator.section_id
		var tag_id 		 = tag_obj.dataset.tag_id
		var editor_id	 = tinymce.activeEditor.id

		/* For fixed falues
		var component_tipo  = this.component_tipo
		var section_id 		= this.section_id
		var section_tipo 	= this.section_tipo
		var tag_id 		 	= this.get_tag_id(this.tag)
		*/

		var trigger_vars = {
			mode			: 'show_note_info',
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: this.lang,
		}
		//console.log(trigger_vars);
		

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
			
			if (response===null) {
				alert("Error on show_note_info")
			}else{				
				
				// note_dialog
				var note_dialog = component_text_area.build_note_dialog({
					evt 	  : evt,
					response  : response,
					tag_id 	  : tag_id,
					editor_id : editor_id
				})
				document.body.appendChild(note_dialog)

				// Open modal
				$('#div_note_wrapper').modal('show')	
			}			
		})

		return js_promise			
	};//end show_note_info



	/**
	* BUILD_NOTE_DIALOG
	* @return DOM object
	*/
	this.build_note_dialog = function( options ) {
	
		var wrapper_id = "div_note_wrapper"
		var older_div_note_wrapper = document.getElementById(wrapper_id)
			if (older_div_note_wrapper) {
				older_div_note_wrapper.parentNode.removeChild(older_div_note_wrapper)
			}		
		// note wrapper		
		var div_note_wrapper = document.createElement("div")
			div_note_wrapper.id = wrapper_id

		
		var header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			var h4 = document.createElement("h4")
				h4.classList.add('modal-title')
				t = document.createTextNode("Note " + options.tag_id + " - Created by user "+options.response.created_by_user_name)
				// Add
				h4.appendChild(t)
				header.appendChild(h4)


		var body = document.createElement("div")
			// component_text element
			var component_text = document.createElement("div")
				component_text.innerHTML = options.response.component_text_html
				exec_scripts_inside(component_text)	
				body = component_text


		var footer = document.createElement("div")
			// Button delete <button type="button" class="btn btn-warning">Warning</button>
			var button_delete = document.createElement("button")
				button_delete.classList.add("btn","btn-warning","btn-sm","button_delete_note")
				button_delete.dataset.dismiss = "modal"
				button_delete.addEventListener('click', function() {
					component_text_area.delete_note(this, options)
				})
				t = document.createTextNode(get_label.borrar)
				button_delete.appendChild(t)
				// Add
				footer.appendChild(button_delete)

			// created_date
			var created_date = document.createElement("div")
				created_date.classList.add('created_date')
				t = document.createTextNode("Created date "+options.response.created_date)
				created_date.appendChild(t)
				// Add
				footer.appendChild(created_date)

			// Button ok <button type="button" class="btn btn-warning">OK</button>
			var button_ok = document.createElement("button")
				button_ok.classList.add("btn","btn-success","btn-sm","button_ok_note")
				button_ok.dataset.dismiss = "modal"
				button_ok.addEventListener('click', function() {
					var ed = tinyMCE.activeEditor
					ed.save()
				})
				t = document.createTextNode("  OK  ")
				button_ok.appendChild(t)
				// Add
				footer.appendChild(button_ok)	
			

		// modal dialog
		var modal_dialog = common.build_modal_dialog({
			id 		: wrapper_id,
			header 	: header,
			footer  : footer,
			body 	: body
		})	
		div_note_wrapper.appendChild(modal_dialog)

		
		return modal_dialog
	};//end build_note_dialog



	/**
	* DELETE_NOTE
	* @return 
	*/
	this.delete_note = function( button_obj, options ) {

		if (!confirm(get_label.borrar + " " +get_label.etiqueta+" "+options.tag_id)) {
			return false;
		}	
		
		// Editor where is the note tag (note is NOT the current tinymce.activeEditor)
		var ed 			 = tinymce.get(options.editor_id)
		var tag_obj 	 = options.evt.target
		var locator		 = component_text_area.get_data_locator_from_tag( tag_obj )
		var trigger_vars = {
			mode			: 'delete_note',
			section_tipo	: locator.section_tipo,
			section_id		: locator.section_id,
			lang			: this.lang,
		}

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
			
			if (response===null) {
				alert("Error on delete_note")
			}else{

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
					component_text_area.Save( document.getElementById(ed.id), null, ed );
				}				
			}			
		})

		return js_promise
	};//end delete_note



	/**
	* GET_LAST_ELEMENT
	* @return 
	*/
	this.get_last_element = function(ed, type) {

		var last_tag_id 	= this.get_last_tag_id(ed, type)
		var ar_elements  	= ed.dom.select('[data-type="'+type+'"]')
		
		var len = ar_elements.length
		for (var i = len - 1; i >= 0; i--) {

			if (ar_elements[i].dataset.tag_id==last_tag_id) {
				return ar_elements[i]
			}
		}

		return null;
	};//end get_last_element	
	


	/**
	* UNWRAP_ELEMENT
	* @return 
	*/
	this.unwrap_element = function(el) {
		// get the element's parent node
		var parent = el.parentNode;

		// move all children out of the element
		while (el.firstChild) parent.insertBefore(el.firstChild, el);

		// remove the empty element
		parent.removeChild(el);
	};//end unwrap_element


	
}//end class component_text_area

			









/**
* GOTO TIME CAPTURE CALL
*/
function goto_time(timecode) {
	if(DEBUG) console.log("->goto_time captured call in page edit context for tc "+timecode)
	return null;
}


