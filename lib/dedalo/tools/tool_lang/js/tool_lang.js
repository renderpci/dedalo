"use strict"
//var changed_original_content = 0;	// Default 0. When fire 'set_tm_history_value_to_tm_preview' is set to 1
/**
* TOOL_LANG
*
*/
var tool_lang = new function() {

	// LOCAL VARS
	this.textarea_lang
	this.trigger_url = DEDALO_LIB_BASE_URL + '/tools/tool_lang/trigger.tool_lang.php'
	this.last_target_lang
	
	// GLOBAL PARAGRAPH INITIAL VALUES
	this.paragraphsLeftNumber	= null
	this.paragraphsRightNumber	= null

	this.selector_source_selected_lang
	this.selector_target_selected_lang



	/**
	* INIT
	*/
	this.inited = false
	this.init = function(data) {

		var self = this;
		
		if (self.inited!==true) {

			// Set data vars
			self.textarea_lang = data.textarea_lang


			// READY (EVENT)
			//$(function() {
			window.ready(function(){
				
				// TARGET LANG. Set selector selected option (stored as cookie) and load target selected lang
				let last_target_lang = get_localStorage('last_target_lang');
				if (typeof last_target_lang !== 'undefined') {
					// Set selector as stored lang
					var selector_obj 		= document.getElementsByClassName('tool_lang_selector_target')[0]; //$('.tool_lang_selector_target').first();
						selector_obj.value 	= last_target_lang;
						//console.log(last_target_lang)
					tool_lang.render_component(selector_obj)
				}							
			});//end $(function()			


			// LOAD (EVENT)
			window.addEventListener("load", function (event) {
				switch(page_globals.modo){
					case 'tool_lang':
						// Update page paragraphs counters
						setTimeout(function(){
							tool_lang.writeLeftParagraphsNumber();
							tool_lang.writeRightParagraphsNumber();
						}, 1500)


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
							lock_components.update_lock_components_state( self.get_tool_text_area_source_lang_wrapper(), 'focus' );
						}
						break;
				}
			}, false);			


			// BEFOREUNLOAD (EVENT)
			window.addEventListener("beforeunload", function (event) {
				//console.log("-> triggered beforeunload event (tool_transcription)");
				event.preventDefault();

				if (tinymce.activeEditor.isDirty()) {

					// SAVE ON EXIT
					tool_lang.save_on_exit();
					
					var confirmationMessage = "Leaving tool page.. ";
					event.returnValue  	= confirmationMessage;	// Gecko, Trident, Chrome 34+
					return confirmationMessage;					// Gecko, WebKit, Chrome <34
				}
			}, false)//end beforeunload

			
			// UNLOAD (EVENT)			
			window.addEventListener("unload", function (event) {
				//event.preventDefault();
				// Reload opener page list
				if (window.opener && window.opener.page_globals && window.opener.page_globals.modo && window.opener.page_globals.modo==='list') {
					//window.opener.location.reload();
				
					// EDITING FROM PROCESSES
			
					// RELOAD_ROWS_LIST
					var call_uid = 'wrap_' + page_globals.section_tipo + '_' + 'list';	// wrap_dd1140_list
					window.opener.search.reload_rows_list(call_uid);

					window.opener.console.log("Reloading rows (reload_rows_list).. "+call_uid)
					
					// Update lock_components state (BLUR)
					if(typeof lock_components!='undefined') {
						lock_components.update_lock_components_state( self.get_tool_text_area_source_lang_wrapper(), 'blur' );
					}
				}
			}, false);//end unload


			// BLUR
			/*window.addEventListener("blur", function(event){
				var wrap_tool_lang_component_source = document.getElementById('wrap_tool_lang_component_source')
				var wrap_tool_lang_source 			= wrap_tool_lang_component_source.querySelector(".wrap_component")
				
				// PSEUDO CODE TEST only valid for tinyMCE
				var textarea  	  = wrap_tool_lang_source.getElementsByTagName('textarea')[0]				
				if (textarea) {
					var	component_obj = textarea
					var	ed 			  = tinyMCE.get(textarea.id)
					mce_editor.save_command(ed,null,textarea)
				}
			})*/


			// RESIZE (EVENT)
			window.addEventListener("resize", function (event) {
				tool_lang.fix_height_of_texteditor()
			}, false);


			// VISIBILITYCHANGE (EVENT)
			document.addEventListener("visibilitychange", function(event) {
				if (document.hidden===true) return false;

				let wrap_tool_lang_component_source = document.getElementById('wrap_tool_lang_component_source')
				let wrap_tool_lang_source 			= wrap_tool_lang_component_source.querySelector(".wrap_component")
				let source_lang 					= wrap_tool_lang_source.dataset.lang
				let locator = {
					section_tipo 	: page_globals.section_tipo,
					section_id 		: page_globals._parent,
					component_tipo 	: page_globals.tipo,
					lang 			: source_lang
				}
				if(SHOW_DEBUG===true) {
					//console.warn("[tool_lang.visibilitychange_action] source locator:", locator)
				}				
				tool_common.update_tracking_status(event,{locator:locator})

				let wrap_tool_lang_component_target = document.getElementById('wrap_tool_lang_component_target')					
				let	wrap_tool_lang_target 			= wrap_tool_lang_component_target.querySelector(".wrap_component")
				if (wrap_tool_lang_target) {
					let target_lang 				= wrap_tool_lang_target.dataset.lang			
					let target_locator = {
						section_tipo 	: page_globals.section_tipo,
						section_id 		: page_globals._parent,
						component_tipo 	: page_globals.tipo,
						lang 			: target_lang
					}
					if(SHOW_DEBUG===true) {
						//console.warn("[tool_lang.visibilitychange_action] target locator:", locator)
					}
					tool_common.update_tracking_status(event,{locator:target_locator})
				}				
			}, false);//end visibilitychange


		}//end if (this.inited!==true)

		if(SHOW_DEBUG===true) {
			//console.log("selector_source_selected_lang",this.selector_source_selected_lang);
			//console.log("selector_target_selected_lang",this.selector_target_selected_lang);
		}
		

		this.inited = true
	}//end init



	/**
	* SAVE_ON_EXIT
	* Save text when user close window if changed
	*/
	this.save_on_exit = function() {

		// Save text_area
		var ed = tinymce.activeEditor;
		if (ed === null || typeof ed !== 'object') {
			if(window.opener)
			window.opener.console.log("-> tool_lang:save_on_exit: Error: editor not found");
			return false;
		}
		if (ed.isDirty()) {

			if (SHOW_DEBUG===true) {
				if (window.opener)
				window.opener.console.log("-> tool_lang:save_on_exit: ed isDirty. Text need save and saving_state = "+component_common.saving_state);
			}

			// IMPORTANT
			// Reselect always (lang selector updates component text area)
			//var text_area_obj = document.querySelector('textarea[data-role="text_area_indexation"]');
			var text_area_obj = document.getElementById(ed.id);
				//window.opener.console.log(typeof text_area_obj);

			//component_common.save_async = 1; // Set async false

			var jsPromise = component_text_area.Save(text_area_obj, null, ed);
				jsPromise.then(function(response) {
					if (DEBUG) {
						if(window.opener)
						window.opener.console.log("-> Saved and reloaded component from 'save_on_exit' ");
					}
					//window.opener.alert("Saved text")
				}, function(xhrObj) {
					//console.log(xhrObj);
				});
		}
	}//end save_on_exit



	/**
	* CHECK_EQUAL_LANGS
	* Compares source and target select values and avoid that user selects the same value
	* @return bool
	*/
	this.check_equal_langs = function(selector_obj) {

		//console.log("selector_target_selected_lang:",this.selector_target_selected_lang,"selector_source_selected_lang:",this.selector_source_selected_lang);
	
		let compare_to = null
		if (selector_obj.dataset.role==="selector_source") {
			// CASE CHANGING SOURCE SELECTOR
			compare_to = this.selector_target_selected_lang
		}else if (selector_obj.dataset.role==="selector_target") {
			// CASE CHANGING TARGET SELECTOR
			compare_to = this.selector_source_selected_lang			
		}


		// Comapre current with oposite selector value
		if (selector_obj.value == compare_to) {
			return true
		}		

		return false;
	}//end check_equal_langs



	/**
	* RESTORE_previous_VALUE
	* Restore select value after user try to select a invalid value
	* @return bool
	*/
	this.restore_previous_value = function(selector_obj) {
		
		if (selector_obj.dataset.role==="selector_source") {
			// CASE CHANGING SOURCE SELECTOR			
			selector_obj.value = this.selector_source_selected_lang
		}else 
		if (selector_obj.dataset.role==="selector_target") {		
			// CASE CHANGING TARGET SELECTOR		
			selector_obj.value = this.selector_target_selected_lang			
		}

		return true
	}//end restore_previous_value



	/**
	* RENDER_COMPONENT
	* Loads renderer component in right place (source/target container) depending on selector role
	* @return promise
	*/
	this.render_component = function(selector_obj) {
		//console.log("render_component selector_obj",selector_obj);
		// 'tipo','parent','modo','lang','section_tipo','role'

		const role = selector_obj.dataset.role
		const lang = selector_obj.value
			if (lang.length<5) {
				this.restore_previous_value(selector_obj)
				console.log("[tool_lang.render_component] invalid lang ",lang);
				return false
			}
		const tool_locator = selector_obj.dataset.tool_locator

		var trigger_vars = {
				mode 		: 'render_component',
				tipo 		: selector_obj.dataset.tipo,
				parent 		: selector_obj.dataset.parent,
				modo 		: 'edit',
				lang 		: lang,
				section_tipo: selector_obj.dataset.section_tipo,
				role 		: role
			}
			//return console.log("trigger_vars",trigger_vars);

		// CHECK_EQUAL_LANGS
		var equal = this.check_equal_langs(selector_obj)
		if (equal===true) {
			// Change selector to previous state
			this.restore_previous_value(selector_obj)
			// Alerts of forgoten action
			this.alert_source_and_target_langs_error();
			return false
		}		

		switch(role) {
			case 'selector_source':
					var wrap_div = document.getElementById('wrap_tool_lang_component_source')
					break;
			case 'selector_target':
					var wrap_div = document.getElementById('wrap_tool_lang_component_target')
					break;
		}
		wrap_div.innerHTML = "Loading.."

		html_page.loading_content( wrap_div, 1 )

		var js_promise = common.get_json_data(this.trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_lang.render_component] "+role+" response",response)
				}
				
				if (response && response.result) {				
					switch(role) {
						case 'selector_source':							
								//wrap_div.style.opacity = 0;
								wrap_div.innerHTML = response.result
								exec_scripts_inside( wrap_div ) //.then((successMessage) => { })
								//wrap_div.style.opacity = 1;
								// Fix new value
								tool_lang.selector_source_selected_lang = lang
								break;
						case 'selector_target':							
								//wrap_div.style.opacity = 0;
								wrap_div.innerHTML = response.result
								exec_scripts_inside( wrap_div )//.then((successMessage) => { })
								// Fix new value
								tool_lang.selector_target_selected_lang = lang
								// Store last_target_lang
								set_localStorage('last_target_lang',lang)																
								break;
					}
					// Update tol_lang header
					tool_lang.update_tool_header(trigger_vars.tipo, trigger_vars.parent, trigger_vars.section_tipo, trigger_vars.lang, tool_locator);

					//var component_state_place	= document.getElementById("component_state_place")
					//	console.log("component_state_place",component_state_place);
					//var component_state_wrapper = component_state_place.querySelector(".css_wrap_state")
					//component_common.load_component_by_wrapper_id(component_state_wrapper.id)

				}else{
					alert("[tool_lang.render_component] Error. Null response is received")
				}
				html_page.loading_content( wrap_div, 0 )
		}, function(error) {
				console.error("[tool_lang.render_component] Failed get_json!", error)
				html_page.loading_content( wrap_div, 0 )
		})//end js_promise

		return js_promise
	}//end render_component



	/**
	* ALERT_SOURCE_AND_TARGET_LANGS_ERROR
	* Open and error alert when the source and target langs are the same 
	*/
	this.alert_source_and_target_langs_error = function() {

		var header = document.createElement("h3")
			header.appendChild( document.createTextNode("Warning!") )

		var dialog_body = document.createElement("h4")
			dialog_body.appendChild( document.createTextNode(get_label.error_source_target_lang) )

		var modal_dialog = common.build_modal_dialog({
			id 	 	: 'alert_source_and_target_langs_error',
			header 	: header,
			body 	: dialog_body
		})
		document.body.appendChild(modal_dialog);
		// Open dialog
		/*
		$('#'+tool_common.tool_dialog_id).modal({
			show 	 : true,
			keyboard : true
		})*/
		// Open Bootstrap modal
		$('#'+'alert_source_and_target_langs_error').modal({
				show 	  : true,
				keyboard  : true,
				cssClass  : 'modal'
		}).on('shown.bs.modal', function (e) {

		}).on('hidden.bs.modal', function (e) {
			// Removes modal element from DOM on close
			this.remove()
		})
	}//end alert_source_and_target_langs_error



	/**
	* UPDATE_TOOL_HEADER . Update header state (component_state)
	* vars: caller_component_tipo, caller_element
	*/
	this.update_tool_header = function(tipo, parent, section_tipo, lang, tool_locator) {
		
		var wrap_div	= document.getElementById("component_state_place")	//$('#component_state_place');		
		
		const trigger_vars		= {
				mode 			: 'update_tool_header',
				tipo 			: tipo,
				parent 			: parent,
				section_tipo 	: section_tipo,
				lang 			: lang,				
				tool_locator 	: tool_locator,
				top_tipo 		: page_globals.top_tipo
			}
			//return console.log("[tool_lang.update_tool_header] trigger_vars",trigger_vars);

		html_page.loading_content( wrap_div, 1 );

		let js_promise = common.get_json_data(this.trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_lang.update_tool_header] response",response)
				}
				
				if (response && response.result!==false) {				
					
					//$(wrap_div).html(response.result);
					wrap_div.innerHTML = response.result
					exec_scripts_inside( wrap_div )//.then((successMessage) => { })
					
				}else{
					alert("[tool_lang.update_tool_header] Error. Null response is received")
				}
				//html_page.loading_content( wrap_div, 0 )
		}, function(error) {
				console.error("[tool_lang.update_tool_header] Failed get_json!", error)
				//html_page.loading_content( wrap_div, 0 )
		})//end js_promise

		return js_promise
	}//end update_tool_header



	/**
	* SELECT SOURCE TEXT
	* Select all source text.
	* Reload editor with css'hideAll.css' and trigger selection later in loadLeftText
	*/
	this.select_source_text = function() {

		// Select current source editor and get attr id
		var id = $('#wrap_tool_lang_component_source').find('.css_text_area:input').first().attr('id'); //return alert(id);
		
		// unload editor
		this.toggleEditor(id);				
		
		// load editor
		component_text_area.init(id, 'text_editor_hideAll.css');

		// select all
		tinymce.activeEditor.selection.select(tinymce.activeEditor.getBody(), true);		
	}//end select_source_text



	/**
	* TOOGLE tinyMCE editor
	* Load / unload tinyMCE editor selected by id
	*/
	this.toggleEditor = function(id) {
		try{
			if (!tinyMCE.get(id)) {
				tinyMCE.execCommand('mceAddControl', false, id);
			}else{
				tinyMCE.execCommand('mceRemoveControl', false, id);
				$('#texto').css({'visibility':'visible'});
				return
			}
		}catch(e){alert(e)}
	}//end toggleEditor



	/**
	* RELOAD SOURCE COMPONENT
	*/
	this.reload_source_component = function() {

		var id = $('#wrap_tool_lang_component_source').find('.css_text_area:input').first().attr('id'); 
		
		// unload editor
		this.toggleEditor(id);				
		
		// load editor
		component_text_area.init(id);		
	}//end reload_source_component



	/**
	* AUTOMATIC_TRANSLATION . TRADUCCION AUTOMATICA
	*/
	this.automatic_translation = function(button_obj) {
		//alert("traduccion_automatica")

		//var wrap_tool_lang_source = $('#wrap_tool_lang_component_source').find('.wrap_component').first();
		//var wrap_tool_lang_target = $('#wrap_tool_lang_component_target').find('.wrap_component').first();

		var wrap_tool_lang_component_source = document.getElementById('wrap_tool_lang_component_source')
		var	wrap_tool_lang_source 			= wrap_tool_lang_component_source.querySelector(".wrap_component")

		var wrap_tool_lang_component_target = document.getElementById('wrap_tool_lang_component_target')
		var	wrap_tool_lang_target 			= wrap_tool_lang_component_target.querySelector(".wrap_component")
			if( !wrap_tool_lang_target ) {
				//$('.tool_lang_selector_target').focus();
				document.querySelector(".tool_lang_selector_target").focus();
					//console.log( get_label.seleccione_un_idioma_de_destino  );
				return alert( get_label.seleccione_un_idioma_de_destino );
			}
		

		// Source lang
		var source_lang = wrap_tool_lang_source.dataset.lang;	//return alert(source_lang)
			if (source_lang.length<5){
				return alert("Error: target lang is not valid: "+target_lang);
			}

		// Target lang
		var target_lang = wrap_tool_lang_target.dataset.lang;	//return alert(target_lang)
			if (target_lang.length<5){
				return alert("Error: target lang is not valid: "+target_lang);
			}
		
		// Tipo
		var tipo = wrap_tool_lang_target.dataset.tipo
			if (tipo.length<3){
				return alert("Error: tipo is not valid: "+tipo);
			}
		
		// Parent
		var parent = wrap_tool_lang_target.dataset.parent ;
			if ( typeof parent === 'undefined' || !parent || parent.length<1 ) {
				console.log(parent);
				return alert("Error: parent is not valid: "+parent);
			}

		// Select and verify target text
		var textarea = wrap_tool_lang_target.querySelector("textarea")
		var input 	 = wrap_tool_lang_target.querySelector("input")
			if (textarea) {
				if(textarea.value.length>2) {
					if( !confirm( get_label.esta_seguro_de_sobreescribir_el_texto ) )  return false;
				}
			}else if (input) {
				if(input.value.length>2) {
					if( !confirm( get_label.esta_seguro_de_sobreescribir_el_texto ) )  return false;
				}
			}else{
				console.log("[tool_lang.automatic_translation] Any input found to target text!");
				return false;
			}

		let inspector_log = document.getElementById("inspector_log")

		var trigger_vars = {
				mode 		  	: "automatic_translation",
				source_lang 	: source_lang,
				target_lang 	: target_lang,
				tipo		 	: tipo,
				parent	  		: parseInt(parent),
				top_tipo	  	: page_globals.top_tipo,
				section_tipo 	: page_globals.section_tipo
			}
			//return console.log("[tool_lang.automatic_translation] trigger_vars:",trigger_vars);	

		let wrap_div = wrap_tool_lang_target
		html_page.loading_content( wrap_div, 1 );

		var js_promise = common.get_json_data(this.trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_lang.automatic_translation] response",response)
				}
				//html_page.loading_content( wrap_div, 0 );			
				if (response && response.result) {					

					// Exec load_component_by_wrapper_id as promise
					component_common.load_component_by_wrapper_id( wrap_tool_lang_target.id, null, null ).then(function(response) {							
							setTimeout(tool_lang.writeRightParagraphsNumber, 600)							
						}, function(xhrObj) {
							console.log("xhrObj:",xhrObj);
						});
					
					//inspector.show_log_msg(msg);
					top.component_common.changed_original_content = 1;
				}else{
					//inspector_log.innerHTML = "<pre>An error has occurred. Null data is received</pre>";
					alert("[tool_lang.automatic_translation] \nAn error has occurred. Null data is received");
				}

				html_page.loading_content( wrap_div, 0 );
		}, function(error) {
				console.error("[tool_lang.automatic_translation] Failed get_json!", error)
				html_page.loading_content( wrap_div, 0 );
		})//end js_promise


		return js_promise
	}//end automatic_translation



	/**
	* COPY SOURCE TEXT TO TARGET
	*/
	this.copy_source_text_to_target = function(btn_obj) {

		var wrap_tool_lang_component_source = document.getElementById("wrap_tool_lang_component_source")
			// Check invalid target
			if(wrap_tool_lang_component_source==null) {
				return alert("Warning: source_text is not found");
			}
		var wrap_tool_lang_component_target = document.getElementById("wrap_tool_lang_component_target")
			// Check invalid target
			if(wrap_tool_lang_component_target==null) {
				return alert("Please select a target lang");
			}
		//return 	console.log("wrap_tool_lang_component_target:",wrap_tool_lang_component_target);

		// SOURCE
		switch(true) {
			case (wrap_tool_lang_component_source.querySelector("input,textarea")!==null) :
				var wrap_tool_lang_source = wrap_tool_lang_component_source.querySelector("input,textarea")				
				var source_text = wrap_tool_lang_source.value
				break;
			case (wrap_tool_lang_component_source.querySelector(".text_area_content")!==null) :
				var wrap_tool_lang_source = wrap_tool_lang_component_source.querySelector(".text_area_content")
				var source_text = wrap_tool_lang_source.innerHTML
				break;
		}

		// TARGET
		var wrap_tool_lang_target = wrap_tool_lang_component_target.querySelector("input,textarea")
		var target_text = wrap_tool_lang_target.value
		//return console.log("source_text:",source_text,"target_text:",target_text);

		// Check empty source
		if (source_text.length<2) {
			return alert("Warning: source_text is empty: "+source_text);
		}

		// Check no empty target
		if (target_text.length>2) {
			if( !confirm( get_label.esta_seguro_de_sobreescribir_el_texto ) )  return false;
		}

		try {
			var text_area_element	= wrap_tool_lang_component_target.querySelector("textarea")
			var input_element 		= wrap_tool_lang_component_target.querySelector("input")

			// CASE TINYMCE
			// if ( $('#wrap_tool_lang_component_target').find('textarea').first().length >0) {
			if (text_area_element) {
				
				//var input_element = $('#wrap_tool_lang_component_target').find('textarea').first();	

				// Select current source editor and get attr id
				//var id 			= $(input_element).attr('id'); //return alert(id);
				var id  		= text_area_element.id
				var target_ed	= tinyMCE.get(id);		
				//var target_text	= target_ed.getContent();

				//target_ed.focus();				
				target_ed.setContent(source_text);

				// Set editor as dirty				
				target_ed.setDirty(true) // Force dirty state		
				target_ed.isNotDirty = false; // Force not dirty state
				
				// Force sync content textarea / tinymce
				//tinyMCE.triggerSave();

				// Resolve wrapper
				let wrapper = component_common.get_wrapper_from_element(text_area_element)	
				
				//component_text_area.Save( text_area_element, null, target_ed );
				window[wrapper.dataset.component_name].Save( text_area_element, null, target_ed );
			
			// CASE INPUT
			//}else if ( $('#wrap_tool_lang_component_target').find('input').first().length >0 ) {
			}else if ( input_element ) {
				//var input_element = $('#wrap_tool_lang_component_target').find('input').first();				
				
				// Set new value
				//$(input_element).val( source_text );
				input_element.value = source_text

				// Fire event change (force to allow save)
				//$(input_element).trigger( "change" );
				input_element.onchange()

				//component_input_text.Save( $(input_element) );
				component_input_text.Save( input_element )
			};			

		}catch(error){if (DEBUG) console.log(error)}		
	}//end copy_source_text_to_target



	/**
	* PROPAGATE MARKS
	*
	*/
	this.propagate_marks = function() {

		if(DEBUG) {

			return alert("en proceso.. \n\
				\nFalta: \
				\n 1- Al crear un fragmento, crear las marcas (en posición calculada aproximada) en el resto de idiomas en modo 'r' \
				\n 2- Propagar las marcas (cálculo 'propagator') en modo 'solo nuevas' y 'recrear todas'\
				")

		}else{
			return alert("Sorry, inactive option temporarily")
		}





		// Ony for textareas (tinymce) Verify this
		var first_text_area = $('#wrap_tool_lang_component_source').find('textarea').first();		
		if ( $(first_text_area).length <1 ) {
			alert("propagate_marks is not possible for this component");
			return false;
		}

		// Verify match source and target number of paragraph
		var same_n_paragraphs 		= this.validate_translation();	if(!same_n_paragraphs){ alert('Nothing propagated!'); return false; }
		
		var rpAlltags 				= $('#rpAlltags:checked').val() ;	
		var confirmAllIndexReview 	= $('#confirmAllIndexReview:checked').val();
		
		var ed_id	= $('#wrap_tool_lang_component_target').find('textarea').first().attr('id');
		var ed		= tinyMCE.get(ed_id);		//alert(ed)
		var texto	= ed.getContent();
		var mode	= 'propagate_marks';			//alert(texto)
		var mydata	= {
			'mode': mode,
			'sourceID': sourceID,
			'targetID': targetID,
			'texto': texto,
			'ar_indexID_click':ar_indexID_click.toString(),
			'rpAlltags': rpAlltags,
			'confirmAllIndexReview': confirmAllIndexReview,
			'top_tipo': page_globals.top_tipo,
			'section_tipo': page_globals.section_tipo
		};
		
		return alert( mydata.toString() )
			/*
			$.ajax({			
				url			: '../trans/trans_trigger.php',
				data		: mydata,
				type		: 'POST',
				beforeSend	: function() {
								ed.setProgressState(1); 		// Show progress en texto 
								$('#propagate_marks_btn').hide(0);			// Hide propagate_marks_btn btn
							},
				error		: function(){
								alert('PROPAGATE: ' +errorNetwork);							
							},
				success		: function(data){
								alert(data);							
								if(indexID>0) {
									//alert(window.location.href);
									var mySplitResult = window.location.href.split("?");
									var url = mySplitResult[0] + "?sourceID="+sourceID+"&targetID="+targetID+"&indexID=review";
									if(url!=-1) window.location = url ; return false;
								}							
								loadText();
								update_logIndexChanges();		// update list of index to review after save text
								$("#rpAlltags").removeAttr("checked"); 					
							},
				complete	: function(){						
								ed.setProgressState(0); 		// Hide progress en texto	
								$('#propagate_marks_btn').hide(0);			// Show propagate_marks_btn btn			
							}
			});	
			*/
		// Hide propagate_marks_btn btn
		$('#propagate_marks_btn').hide(0);			

		// AJAX REQUEST
		$.ajax({
			url			: this.trigger_url,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {
			alert(received_data);
			$(wrap_div).html(received_data)				
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg("<span class='error'>PROPAGATE ERROR: no data is saved!</span>");
		})
		// ALWAYS
		.always(function() {
			// Reset checkbox
			$("#rpAlltags").removeAttr("checked");
			// Show propagate_marks_btn btn
			$('#propagate_marks_btn').show(0);	
			html_page.loading_content( wrap_div, 0 );
		});
	}//end propagate marks



	/**
	* VALIDATE TRANSLATION
	* Verify number of paragraphs from source and target fields is the same
	*/
	this.validate_translation = function () {
	
		this.writeRightParagraphsNumber();
	
		if (paragraphsLeftNumber != paragraphsRightNumber) {
		
			var msg  = "Two langs must be have same number of paragraphs ! \n\n Please match number of paragraphs for make this translation accessible and searchable. \n\n source lang: "+paragraphsLeftNumber+ "\n target lang: "+paragraphsRightNumber;	
			//msg 	+= "\n\n If you continue, you save the current text, but you will lose all marks (tc and indexes), and this translation is set not available for consultation.";
			alert(msg);
			return false;   	
		}
		
		msjExit = 1;	// avoid alert msg on leave this page (defined to 0 in page vars)	  
		return true ;  
	}//end validate_translation
	


	/**
	* WRITE SOURCE (LEFT) PARAGRAPHS NUMBER 
	*/
	this.writeLeftParagraphsNumber = function() {
	return null;
		//var text_area 	= $('#wrap_tool_lang_component_source').find('textarea').first();
		let wrapper 	= document.getElementById("wrap_tool_lang_component_source")
		let text_area 	= wrapper.getElementsByTagName('textarea')			
			if (!text_area || text_area.length<1) {
				if(SHOW_DEBUG===true) {
					console.warn('[tool_lang.writeLeftParagraphsNumber] element textarea not found in #wrap_tool_lang_component_source');
				}
				return false
			}

		let ed = tinyMCE.get(text_area.id);
		if (!ed) {
			return false;
		}
		let text = ed.getContent()
		let arr  = text.split('<br />')
	
		this.paragraphsLeftNumber = arr.length;	
		
		//$('#nParagrapsLeft').hide().html( paragraphsLeftNumber ).fadeIn(300);
		let nParagrapsLeft = document.getElementById("nParagrapsLeft")
			if (nParagrapsLeft) {
				nParagrapsLeft.innerHTML = this.paragraphsLeftNumber
			}				
			//nParagrapsLeft.style.opacity = 1
		if(SHOW_DEBUG===true) {
			console.log("[tool_lang.writeLeftParagraphsNumber] paragraphsLeftNumber",this.paragraphsLeftNumber);
			//console.trace();
		}

		return this.paragraphsLeftNumber
		/*
		try{
	
		}catch(err){
			console.log('writeLeftParagraphsNumber: ',err);
		}*/	
	}//end writeLeftParagraphsNumber



	/**
	* WRITE TARGET (RIGHT) PARAGRAPHS NUMBER 
	*/
	this.writeRightParagraphsNumber = function() {
	return null;
		let LeftParagraphsNumber = this.paragraphsLeftNumber	//tool_lang.writeLeftParagraphsNumber()
			//console.log("LeftParagraphsNumber:",LeftParagraphsNumber);
			if (!LeftParagraphsNumber || LeftParagraphsNumber<1) {
				if(SHOW_DEBUG===true) {
					console.warn('[tool_lang.writeRightParagraphsNumber] LeftParagraphsNumber is empty');
				}
				return false
			}

		
		let wrapper 	= document.getElementById("wrap_tool_lang_component_target")
		let text_area 	= wrapper.getElementsByTagName('textarea')
			if (!text_area || text_area.length<1) {
				if(SHOW_DEBUG===true) {
					console.warn('[tool_lang.writeRightParagraphsNumber] element textarea not found in #wrap_tool_lang_component_target');
				}
				return false
			}
				
		
		let ed		= tinyMCE.get(text_area.id);
		if (!ed) {
			return false;
		}
		let text	= ed.getContent(); 		//alert(text)//textoG = encodeURI(textoG);		
		let arr 	= text.split('<br />');		
	
		this.paragraphsRightNumber = arr.length		//alert(paragraphsRightNumber)
		
		//$('#nParagrapsRight').hide().html( paragraphsRightNumber ) ;
		let nParagrapsRight = document.getElementById("nParagrapsRight")
			nParagrapsRight.innerHTML = this.paragraphsRightNumber
		
		// If number of paragraphs is different, hilite number in red			
		if( parseInt(this.paragraphsLeftNumber) != parseInt(this.paragraphsRightNumber) ) {
			//$('#nParagrapsRight').addClass('nParagrapsRight_red');	//alert(paragraphsLeftNumber + " " +paragraphsRightNumber)
			nParagrapsRight.classList.add("nParagrapsRight_red")
			//$('.propagate_marks_btnBTNgrey').removeClass().addClass("propagate_marks_btnBTNred");
		}else{
			//$('#nParagrapsRight').removeClass('nParagrapsRight_red');
			nParagrapsRight.classList.remove("nParagrapsRight_red")
			//$('.propagate_marks_btnBTNred').removeClass().addClass("propagate_marks_btnBTNgrey");	
		}
		//$('#nParagrapsRight').fadeIn(300);
		if(SHOW_DEBUG===true) {
			console.log("[tool_lang.writeRightParagraphsNumber]",this.paragraphsRightNumber);
		}

		return this.paragraphsRightNumber

		/*
		try{					
		}catch(err){
			console.log('->Error: writeRightParagraphsNumber: ',err);
		}*/
	}//end writeRightParagraphsNumber



	/**
	* FIX_HEIGHT_OF_TEXTEDITOR
	*/
	this.fix_height_of_texteditor = function() {
		
		if (page_globals.modo!=="tool_lang" || typeof tinyMCE=="undefined" || !tinyMCE) {
			return false
		}
	
		// Resize editor height
		let warp_height = window.innerHeight - 250
		let len = tinyMCE.editors.length		
		for (var i = 0; i < len; i++) {
			if (warp_height>100 && tinyMCE.editors[i].theme) {
				tinyMCE.editors[i].theme.resizeTo ('100%', warp_height)
			}
		}	

		return true
	}//end fix_height_of_texteditor



	/**
	* UPDATE_TOP_ID
	* Update value of global page_globals.top_id on change selector value
	*/
	this.update_top_id = function(select_obj) {

		var value = select_obj.value

		if (value) {
			page_globals.top_id = value;
			if(SHOW_DEBUG===true) {
				//console.log("[tool_lang.update_top_id] Updated top_id to: "+value);
			}
		}
		return false;
	}//end update_top_id



	/* STRUCTURATION TITLES MANAGER
	------------------------------------------------------------------ */



	/**
	* DELETE_STRUCTURATION
	* @return bool
	*/
	this.delete_structuration = function(ed, evt, text_area_component) {

		// NODE . Get current text area selected node in editor
		var node = ed.selection.getNode()

		// SECTION . Get section element from current node iterating parent nodes
		var section = null
		while(section===null) {
			if (node.dataset && node.dataset.type==="struct") {
				section = node
				//console.log("struct",node);
			}else{
				//console.log("iteration",node);
				if (node.id && node.id=="tinymce") {
					break;
				}
				node = node.parentNode
			}
		}
		// NOT SECTION FOUND
		if (section===null) {
			alert("No structuration section (chapter) selected");
			return false;
		}

		let title = section.getElementsByClassName("title")[0]
		if (title) {
			title = title.innerHTML
		}
		
		// Remove previous selections
		//ed.dom.removeClass(ed.selection.getNode(), 'text_active')
		// Activate selected section
		//section.classList.add("text_active")
		if (confirm("Delete chapter: " + title + "\n\n" + get_label.seguro)) {
			// Delete title h2 element too
			let child_nodes = section.childNodes;			
			let to_delete = []
			for (var i = 0; i < child_nodes.length; i++) {
				if(child_nodes[i].tagName == "H2"){
					to_delete.push(child_nodes[i])
				}
			}
			for (var i = 0; i < to_delete.length; i++) {
				//console.log("deleted node number",i);
				section.removeChild(to_delete[i])
			}

			// Unwrap element removes section tag from dom
			component_text_area.unwrap_element(section)
			
			// Set editor as dirty
			ed.setDirty(true); // Set editor content as changed
			ed.isNotDirty = false; // Force not dirty state

			// Let the user decide when saves..			
		}	
		
		return true
	};//end delete_structuration



	/**
	* ADD_STRUCTURATION
	* @return 
	*/
	this.selected_section_id = null
	this.add_structuration = function(ed, evt, text_area_component) {
		
		// Selection. Check valid user text selection in editor
		var text = ed.selection.getContent({'format': 'html'});
		if(!text || text.length < 2) {
			alert("No text is selected!")
			return false;
		}

		tool_lang.selected_section_id = "temporal_structuration_id"

		// Wrap selection into a section tag
		ed.execCommand('mceInsertContent', false, '<section id="'+tool_lang.selected_section_id+'" class="section_struct text_selectable text_unselectable text_active">'+text+'</section>');
		//console.log("text",text);

		tool_lang.selected_section_id

		// Set editor as NOT dirty to avoid save when dialog is open
		ed.setDirty(false);
		ed.isNotDirty = true;

		// Open a dialog with all source lang existing structuration elements to select one		
		this.open_structuration_selector( 	"add_structuration",
											text_area_component.dataset.section_tipo,
											text_area_component.dataset.parent,
											text_area_component.dataset.tipo,
											text_area_component.dataset.lang )
		
		return true
	};//end add_structuration



	/**
	* CHANGE_STRUCTURATION
	* @return 
	*/	
	this.change_structuration = function(ed, evt, text_area_component) {
		
		// NODE . Get current text area selected node in editor
		let node = ed.selection.getNode()

		// SECTION . Get section element from current node iterating parent nodes
		let section = null
		while(section===null) {
			if (node.dataset && node.dataset.type==="struct") {
				section = node
				//console.log("struct",node);
			}else{
				//console.log("iteration",node);
				if (node.id && node.id=="tinymce") {
					break;
				}
				node = node.parentNode
			}
		}
		// NOT SECTION FOUND
		if (section===null) {
			alert("No structuration section (chapter) selected");
			return false;
		}
		
		// Remove previous selections
		//ed.dom.removeClass(ed.selection.getNode(), 'text_active')
		// Activate selected section
		//section.classList.add("text_active")
		//if (confirm(get_label.seguro)) {
			
			// Changes the chapter section id to enable update later
			//section.id = "temporal_structuration_id"
			tool_lang.selected_section_id = section.id

			// Set editor as NOT dirty to avoid save when dialog is open
			ed.setDirty(false);
			ed.isNotDirty = true;

			// Open a dialog with all source lang existing structuration elements to select one		
			this.open_structuration_selector(	"change_structuration", 
												text_area_component.dataset.section_tipo,
												text_area_component.dataset.parent,
												text_area_component.dataset.tipo,
												text_area_component.dataset.lang )
		//}

		
		return true
	};//end change_structuration



	/**
	* OPEN_STRUCTURATION_SELECTOR
	* @return 
	*/
	this.open_structuration_selector = function(action, section_tipo, section_id, component_tipo, lang) {

		const url_trigger  = this.trigger_url;
		const trigger_vars = {
			mode 		 	: "open_structuration_selector",
			section_tipo 	: section_tipo,
			section_id   	: section_id,
			component_tipo 	: component_tipo,
			lang 			: lang
		}
		//return console.log(trigger_vars);

		let wrap_div = document.getElementById("wrap_tool_lang_component_target")
		html_page.loading_content( wrap_div, 1 )


		let js_promise = common.get_json_data(url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.open_structuration_selector] response", response);
			}

			if (!response) {
				
				alert("[component_text_area.open_structuration_selector] Warning: Null value is received. Check your server log for details");	
			
			}else{

				// TARGET_LANG_CONTAINER . Inject received text to container and parse as dom
				let target_lang_container = document.createElement("div")
					target_lang_container.innerHTML = response.result
					//console.log("target_lang_container",target_lang_container);				

				let ar_section 		= target_lang_container.getElementsByTagName("section")
				let ar_section_len 	= ar_section.length 
				let ar_list = []
				for (var i = 0; i < ar_section_len; i++) {				
					//console.log("element",ar_section[i])			
					ar_list.push({
						id 			 : ar_section[i].id,
						class 		 : ar_section[i].classList,
						dataset 	 : ar_section[i].dataset,
						title 		 : ar_section[i].getElementsByTagName('h2')[0].firstChild.innerHTML || "",
						already_used : (tinymce.activeEditor.dom.get(ar_section[i].id)!==null) ? true : false	
					})
				}
				//console.log("ar_list",ar_list); return

				// Build dialog elements
				let header = document.createElement("h3")
					header.appendChild( document.createTextNode("Select a source lang title to set to selected chapter") )

				let body 	= document.createElement("div")
					body.classList.add("body_dialog_structuration_selector")					
				let ul 		= document.createElement("ul")
				for (var i = 0; i < ar_list.length; i++) {					
					let li = document.createElement("li")
						li.dataset.info = JSON.stringify(ar_list[i])
						//li.dataset.dismiss = "modal"

					let title = ar_list[i].title.length > 0 ? ar_list[i].title : "no title"
						title += " [" + ar_list[i].dataset.tag_id + "]"						

					if(ar_list[i].already_used===true) {
						li.classList.add("unactivated")
						title += " (already used)"
					}else{
						li.classList.add("activated")
						li.addEventListener('click', function(e) {
							tool_lang.set_title_to_chapter(this, e)
						}, false);
					}

					li.appendChild( document.createTextNode(title) )					

					ul.appendChild(li)
				}
				body.appendChild(ul)
				
				// modal dialog
				let modal_dialog = common.build_modal_dialog({
					id 			: "open_structuration_selector",
					header 		: header,
					footer  	: null,
					body 	 	: body
				})
				// Open dialog Bootstrap modal
				$(modal_dialog).modal({
					show 	  : true,
					keyboard  : true,
					//cssClass  : 'modal'
				}).on('shown.bs.modal', function (e) {
					html_page.loading_content( wrap_div, 0 )
				}).on('hidden.bs.modal', function (e) {
					// Check if section element is changed
					if (action==="add_structuration") {
						//let section = tinymce.activeEditor.dom.get('temporal_structuration_id')
						let section = tinymce.activeEditor.dom.get( tool_lang.selected_section_id )
						if (section) {
							// Verify don't delete a valid and configurated section tag (temporal section don't have dataset.data yet)
							let ds_data = section.dataset.data
							if (typeof ds_data=="undefined") {
								component_text_area.unwrap_element(section);
							}						
						}
					}					
					// Removes modal element from DOM on close					
					$(this).remove()							
				})
			}	
			
		}, function(error) {
			console.log("[component_text_area.open_structuration_selector] error:",error)	
			html_page.loading_content( wrap_div, 0 )
		})
	};//end open_structuration_selector



	/**
	* SET_TITLE_TO_CHAPTER
	* @return 
	*/
	this.set_title_to_chapter = function(button_obj, event) {
		//console.log("set_title_to_chapter button_obj",button_obj);
		//console.log("set_title_to_chapter event",event);

		const info = JSON.parse(button_obj.dataset.info)
			if(SHOW_DEBUG===true) {
				console.log("[tool_lang.set_title_to_chapter] info",info);;
			}
			

		let ed = tinymce.activeEditor

		// Search current selected target section
		//let section = ed.dom.get('temporal_structuration_id') //tinymce.activeEditor.dom.addClass('someid', 'someclass');
		let section = ed.dom.get( tool_lang.selected_section_id ) 
			//console.log("setion",section);
			
		if (section) {

			// Check if already exists to avoid duplicates
			//var target_lang_container = ed.getContent({'format': 'html'});
			//var ar_section = target_lang_container.getElementsByTagName("section")
			//var ar_section = ed.dom.select("section")
			// console.log("ar_section",ar_section); return;

			let existsing_same_section = ed.dom.get(info.id)
			if (existsing_same_section===null) {
				// Configure dom element to mimic source lang equivalent
				section.id 				= info.id 
				section.dataset.data 	= info.dataset.data 
				section.dataset.label 	= info.dataset.label 
				section.dataset.state 	= info.dataset.state 
				section.dataset.tag_id 	= info.dataset.tag_id 
				section.dataset.type 	= info.dataset.type 

				// Set editor as dirty
				ed.setDirty(true); // Set editor content as changed
				ed.isNotDirty = false; // Force not dirty state

				// Allow selected button (li) to close dialog here
				button_obj.dataset.dismiss = "modal"

				// Save content editor
				let component_obj = document.getElementById(ed.id)
				component_text_area.Save(component_obj, null, ed) 		

				return true	
			}else{
				if (existsing_same_section.dataset.state==="d") {
					component_text_area.unwrap_element(existsing_same_section);
					// Set editor as dirty
					ed.setDirty(true); // Set editor content as changed
					ed.isNotDirty = false; // Force not dirty state
					console.log("[tool_lang.set_title_to_chapter] Removed deleted existing section ");
				}
				// Check again
				existsing_same_section = ed.dom.get(info.id)
				if (existsing_same_section!==null) {
					alert("[tool_lang.set_title_to_chapter] \nError: selected section '"+info.dataset.label +"' already exists in current lang");
				}
				return false
			}			
		}else{
			console.log("[tool_lang.set_title_to_chapter] Error on find section");
			return false
		}		
	};//end set_title_to_chapter



	/**
	* GET_TOOL_TEXT_AREA_SOURCE_LANG_WRAPPER
	* @return dom object
	*/
	this.get_tool_text_area_source_lang_wrapper = function() {
		const text_preview_wrapper  = document.getElementById("wrap_tool_lang_component_source") // wrap_tool_lang_component_target
		const text_area_wrapper 	= text_preview_wrapper.querySelector("div.text_area_tool_lang")

		return text_area_wrapper
	};//end get_tool_text_area_source_lang_wrapper



};//end tool_lang class