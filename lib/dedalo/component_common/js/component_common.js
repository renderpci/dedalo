"use strict";
/**
* COMPONENT COMMON CLASS
*
*
*/
var component_common = new function() {

	this.url_trigger  = DEDALO_LIB_BASE_URL + '/component_common/trigger.component_common.php';
	this.save_async   = true;	// Default save async
	this.saving_state = 0;		// Default 0

	this.changed_original_content = 0;	// Default 0. When fire 'set_tm_history_value_to_tm_preview' is set to 1

	switch(page_globals.modo) {

		case 'edit' :
				$(function() {
				//window.ready(function() {
					
					// SELECT COMPONENT ON CLICK WRAP				
					var wrap_component_obj = $('.wrap_component');
					// DOM ready
					$(document.body).on('click', wrap_component_obj.selector, function(e){

						//e.preventDefault();
						e.stopPropagation();	// Prevents the event from bubbling up the DOM tree, preventing any parent handlers from being notified of the event.

						// MENU : Close
						menu.close_all_drop_menu();

						// Select current wrap
						component_common.select_wrap(this);
					});
					/*
					let wrappers = document.querySelectorAll(".wrap_component")						
					let len 	 = wrappers.length					
					for (var i = 0; i < len; i++) {
						wrappers[i].addEventListener("click",function(e){
							e.stopPropagation(); // Prevents the event from bubbling up the DOM tree, preventing any parent handlers from being notified of the event.

							// MENU : Close
							menu.close_all_drop_menu()

							// Select current wrap
							component_common.select_wrap(this)
						},false)
					}*/

				});//end $(document).ready(function()
				break;
	}//end switch(page_globals.modo)



	/**
	* SAVE
	* @param obj component_obj 
	*	DOM obj
	* @param object save_arguments
	*	Optional
	* @param object event
	*	Optional
	*/
	this.Save = function (component_obj, save_arguments, event) {
	
		const start = new Date().getTime();	

		if(typeof event==='object') {
			event.stopPropagation();
		}

		// COMPONENT_OBJ verify
		if (component_obj instanceof jQuery) {
			if(SHOW_DEBUG===true) {
				console.log("[component_common:Save] Warning! Don't use JQUERY object on Save! . First element will be used, but change component_obj argument ASAP")
			}
			component_obj = component_obj[0]	// object jquery case
		}
		if (!component_obj || typeof component_obj!="object") {
			console.log("[component_common:Save] ERROR. component_obj not valid: ",component_obj);
			alert("ERROR on Save component data. Requested component_obj not found in DOM")
			return Promise.resolve(function(){return false});
		}

		// SAVE_EVENT . Attach custom event to components save
		let event_detail = {dataset: cloneDeep( component_obj.dataset )};
			//console.log("[Save] event_detail (cloneDeep):",event_detail);
		//let detail_component_obj = component_obj.cloneNode(true);
		let save_event = new CustomEvent('component_save', {detail:event_detail})
		//console.log("save_event",save_event);

		/* NATIVE JS */
		// From component		
		//let	id			= component_obj.id
		//let	flag		= component_obj.dataset.flag
		//let	caller_tipo		= component_obj.dataset.caller_tipo
		let name			= component_obj.name || component_obj.getAttribute('name')
		let caller_dataset  = component_obj.dataset.caller_dataset || null

		// From component wrapper
		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				alert("[component_common:Save] Sorry: wrap_div dom element not found")
				return Promise.resolve(function(){return false});
			}
		

		let	tipo			= component_obj.dataset.tipo
		let	parent			= component_obj.dataset.parent
		let	lang			= component_obj.dataset.lang
		let	modo			= component_obj.dataset.modo || 'edit'
		let	section_tipo 	= component_obj.dataset.section_tipo		
		let label_element 	= wrap_div.querySelector(".css_label")
		//let	label		= wrap_div.querySelector(".css_label") ? wrap_div.querySelector(".css_label").innerHTML : '' //$wrap_div.find('.css_label:first').text(),
		let	label			= (label_element!==null) ? label_element.innerHTML : ''
		//let	component_name 	= wrap_div.dataset.component_name			
		//let debug_div 		= document.getElementById('inspector_debug')
		let show_spinner 	= typeof save_arguments['show_spinner']!=='undefined' ? save_arguments['show_spinner'] : true

		if(SHOW_DEBUG===true) {			
			//console.log("[component_common:Save] -> Save sequence initied '"+label+"' "+"["+section_tipo+"-"+tipo+"-"+parent+"]")
		}

		// LOGIN : Login window don't save nothing
		if (modo==='login') {
			return Promise.resolve(function(){return false});
		}

		// DATO : Si se le pasa una variable save_arguments con el key 'dato', sobreescribe el dato por defecto
		let dato
		if( save_arguments && typeof save_arguments.dato!=="undefined" ) {
			dato = save_arguments.dato
		}else{
			dato = this.common_get_dato(component_obj);		//alert("Saving dato:" + dato)	//component_obj.value ;  //return alert("id:" + id + " - tipo: " + tipo  + " - dato:" + dato );
		}
		//console.log("dato",dato,typeof dato);

		if (typeof dato==="object" || typeof dato==="array") {			
			if(SHOW_DEBUG===true) {
				console.warn("[component_common:Save] dato is a object or array. Will be stringifyed for save")
			}
			dato = JSON.stringify(dato)		
		}

		// Trigger override
		/*
		let url_trigger = component_common.url_trigger
		if( save_arguments && typeof save_arguments.url_trigger !== 'undefined' ) {
			url_trigger = save_arguments.url_trigger
		}*/	
	
		// Page var globals verify
		if (typeof parent==='undefined' || parent<1) {
			console.log(component_obj);
			alert("Save Error: parent undefined! (Nothing is saved!)");
			return Promise.resolve(function(){return false})
		}
		if (typeof lang==='undefined') {
			alert("Save Error: lang undefined! (Nothing is saved!)");
			return Promise.resolve(function(){return false})
		}

		const trigger_vars = {	
				mode			: 'Save',
				parent			: parent,
				dato			: dato,
				name			: name,
				tipo			: tipo,
				modo			: modo,
				lang			: lang,
				//flag			: flag,
				//caller_tipo	: caller_tipo,				
				top_tipo		: page_globals.top_tipo,
				section_tipo  	: section_tipo,
				caller_dataset 	: caller_dataset
		};
		//console.log("trigger_vars", trigger_vars)

		if(show_spinner) html_page.loading_content( wrap_div, 1 );
		//if(show_spinner) html_page.loading_content( $wrap_div, 1 );

		// SAVING_STATE
		component_common.saving_state = 1;


		// PROMISE JSON XMLHttpRequest
		let js_promise = common.get_json_data(this.url_trigger, trigger_vars, this.save_async).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[component_common.Save] "+response.msg+" debug:", response.debug);	
			}
			

			// INSPECTOR LOG INFO
			if (response && response.result!==false) {				

				// Fix changed content for time machine close dialog function
				component_common.changed_original_content = 1;

				// CALLBACK
				if(typeof save_arguments['callback'] === "function" ) {
					save_arguments['callback'](response);
				}	

				// SAVE TRACK. Place this code at end of save
				if (tipo === 'rsc36') {
					const locator = {
						section_tipo 	: section_tipo,
						section_id 		: parent,
						component_tipo 	: tipo,
						lang 			: lang
					}
					component_common.set_save_track(locator)
				}
					
				// SAVING_STATE
				component_common.saving_state = 0;
				
				// launch custom event				
				//console.log("save_event",save_event);
				window.dispatchEvent(save_event)
				
				// DEBUG
				if(SHOW_DEBUG===true) {
					let end  = new Date().getTime(); let time = end - start;
					//console.log("[component_common:Save] -> Save response: "+response.msg + " for "+name+" tipo:" + tipo + " label:"+label +" - execution time: " +time+' ms' );
				}

				// Inspector msg
				var msg = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";				
				inspector.show_log_msg(msg);

				// MAINTENENCE CHECK
				if (response.maintenance && response.maintenance===true && SHOW_DEBUG!==true) {
					html_page.loading_content( wrap_div, 0 );
					html_page.loading_content( document.getElementById("html_page_wrap"), 1 );
					alert("Your data is saved but this site is going under maintenance now. \nThe login page will be loaded. Please login again in a while. \nSorry for the inconvenience");
					setTimeout(function(){
						window.location.reload(true);
					},500)
					return false;
				}
				
			}else{

				// Inspector msg
				var msg = "<span class='error'>Failed Save!<br>" +response.msg+ " for " + label + "</span>";
				inspector.show_log_msg(msg);
				if(SHOW_DEBUG===true) {
					console.warn("component_common.Save] response",response);
				}					
			}			


			if(show_spinner) html_page.loading_content( wrap_div, 0 );			
		}, function(error) {			
			// log
			console.error("[component_common.Save] Error.", error);
			
			inspector.show_log_msg( "<span class='error'>ERROR: on Save data:" + label + " (Ajax error)<br>Data is NOT saved!</span>" );			
			//if(show_spinner) html_page.loading_content( wrap_div, 0 );

			// SAVING_STATE
			component_common.saving_state = 0;

			if(show_spinner) html_page.loading_content( wrap_div, 0 );
		})

		return js_promise;		
	};//end Save



	/**
	* SET_SAVE_TRACK
	* @return 
	*/
	this.set_save_track = function(locator) {
		
		//var name = locator.section_tipo + '_' + locator.section_id + '_' + locator.component_tipo + '_' + locator.lang
		let name 				= 'components_save_track'		
		let	date 				= new Date()
		let	time 				= date.getTime()
		let clean_components 	= []
		let compoments 			= JSON.parse(readCookie(name))

		if(compoments){
			clean_components = compoments.filter(function(current_locator){
				return(current_locator.section_tipo !== locator.section_tipo ||
						current_locator.section_id != locator.section_id ||
						current_locator.component_tipo !== locator.component_tipo ||
						current_locator.lang !== locator.lang
						)
			})

		}
		if(SHOW_DEBUG===true) {
			console.log("[component_common.set_save_track] compoments:",compoments, "clean_components:",clean_components);
		}		

		locator.time 	= time
		clean_components.push(locator)

		let new_component 	= JSON.stringify(clean_components);

		createCookie(name, new_component, 30)

		// Updates component init_time data to avoid self unsync
		let component = document.querySelector('.wrap_component[data-tipo="'+locator.component_tipo+'"][data-parent="'+locator.section_id+'"][data-section_tipo="'+locator.section_tipo+'"][data-lang="'+locator.lang+'"]')
		if (component) {
			component.dataset.init_time = time
		}else{
			console.warn("[component_common.set_save_track] ERROR on locate wrapper. No init_time changes are made in current element. Locator: ",locator);
		}
	};//end set_save_track



	/**
	* GET_SAVE_TRACK
	* @return 
	*/
	this.get_save_track = function(locator) {

		let name 		= 'components_save_track'		
		let compoments 	= JSON.parse(readCookie(name))

		if(compoments){
			let ar_component = compoments.filter(function(curent_locator){
				return( curent_locator.section_tipo === locator.section_tipo &&
						curent_locator.section_id == locator.section_id &&
						curent_locator.component_tipo === locator.component_tipo &&
						curent_locator.lang === locator.lang)
			})
			//console.log(ar_component);
			return ar_component[0];
		}else{
			return false;
		}
	};//end get_save_track



	/**
	* COMMON_GET_DATO
	*/
	this.common_get_dato = function (obj) {

		var dato = null;

		switch( true ) {

			// CHECKBOX
			case $(obj).is("input:checkbox") :

						var name		= $(obj).attr('name');
						var ar_checkbox	= new Object();

						var ar_values	= $('[name="'+name+'"]:checked, [name="'+name+'"]:indeterminate').map(function() {

						   if( $(this).val() ) {

								var estado 

								// INDETERMINATE : Añadimos ':1' que será 'solo lectura' en admin_access
								if($(this).prop('indeterminate')==true) {
									//return String( $(this).val() +':1' );
									estado = 1;

								// CHECKED : Añadimos ':2' que será 'lectura-escritura' en admin_access
								}else if($(this).prop('checked')===true) {
									//return String( $(this).val() +':2' );
									estado = 2;

								// UNCHECKED
								}else{
									//var estado = 0;
								}
								var tipo 			= $(this).val();
								ar_checkbox[tipo] 	= parseInt(estado);
						   }

						 }).get();

						dato = ar_checkbox;		//console.log(dato); alert(dato)
						break;

			// RADIO BUTTON
			case $(obj).is("input:radio") :
						/*
						var name		= $(obj).attr('name');

						var ar_values	= $('[name="'+name+'"]:checked').map(function() {
						   if( $(this).val() )
						   return $(this).val();
						 }).get();

						console.log( $(obj).val() )
						*/
						dato = $(obj).val();	//console.log(dato)
						break;

			// UL LIST (PROJECT LANGS LIST, ETC)
			case $(obj).is('ul') :
						// Recorremos los elementos li que contienen los valores
						var ar_childrens = $(obj).contents().filter('li');			//if (SHOW_DEBUG===true) console.log( ar_childrens );

						var len			= ar_childrens.length;
						var ar_values	= Array();

						if(ar_childrens && len >0) for(var i=0; i<len ; i++) {

							// (SELECT BY NAME[value=i] IS IMPORTANT)
							var current_obj = ar_childrens[i];						//if (SHOW_DEBUG===true) console.log( $(current_obj))
							var value		= $(current_obj).data('value');
							if( value ) ar_values.push(  value );					//if (SHOW_DEBUG===true) console.log(value)
						}
						dato = ar_values;											//if (SHOW_DEBUG===true) console.log(ar_values)
						break;

			default :	dato = $(obj).val();
						break;
		}
		//if (SHOW_DEBUG===true) console.log('-> common_get_dato: '+dato)
		return dato;
	};//end common_get_dato



	/**
	* SELECT_NEXT_COMPONENT
	*/
	this.select_next_component = function (current_ob) {

		// Blur current input
		//$(current_ob).blur();

		// Focus next input
		var $next_input_obj	= $(current_ob).parent().nextAll(":first").find(":input");
		if($next_input_obj == null) return null;	  //if (SHOW_DEBUG===true) console.log(next_input_obj)
		$next_input_obj.focus();

		// Unselect previous wrap
		//var next_wrap_obj	= $(current_ob).parent('.wrap_component:first');
		//$(current_ob).removeClass('selected_wrap');

		// Reset all wrap selections
		$('.wrap_component').each(function() {
			$(this).removeClass('selected_wrap');
		});

		// Select next wrap
		var next_wrap_obj	= $next_input_obj.parent('.wrap_component');
		component_common.select_wrap(next_wrap_obj);
	};//end select_next_component



	/**
	* RADIO_BUTTON_REBUILD_CHECKS
	*/
	this.radio_button_rebuild_checks = function (ar_values, target_obj) {

		// Recorremos todos los elementos del radio button
		var len		= target_obj.length;
		if(target_obj && len >0) for(var i=0; i<len ; i++) {

			//var target_checked	= $(target_obj[i]).is(':checked');
			var target_value	= $(target_obj[i]).val();

			// Reset checked state to false first
			$(target_obj[i]).prop('checked',false);

			var is_in_array = inArray( target_value, ar_values );		//if (SHOW_DEBUG===true) console.log('- is_in_array ' +is_in_array);

			if( is_in_array != -1 ) {

				$(target_obj[i]).prop('checked',true);					//if (SHOW_DEBUG===true) console.log(' - checked :' +target_value);

			}else{
																		//if (SHOW_DEBUG===true) console.log(' - unchecked :' +target_value);
			}
		}
	};//end radio_button_rebuild_checks


	
	/**
	* CHECK_BOX_REBUILD_CHECKS
	*/
	this.check_box_rebuild_checks = function (ar_values, target_obj) {
		return this.radio_button_rebuild_checks(ar_values, target_obj);
	};



	/**
	* UPDATE_COMPONENT_BY_PARENT_TIPO_LANG
	* Alias of 'load_component_by_wrapper_id'
	* En casos en los que no existe un id_matrix en el componente (por ejemplo el registro no existe en el idioma actual)
	* seleccionamos en el DOM por el resto de información (parent,tipo,lang)
	*/
	this.update_component_by_parent_tipo_lang = function (parent,tipo,lang) {		

		if ( typeof lang == 'undefined' ) {
			// Locate component wrap on page
			var component_wrap = $('.wrap_component[data-parent='+parent+'][data-tipo='+tipo+']');
			if ($(component_wrap).length>1 ) return "Sorry more than one object exists for this selection. (update_component_by_parent_tipo_lang)";
		}else{
			// Locate component wrap on page
			var component_wrap = $('.wrap_component[data-parent='+parent+'][data-tipo='+tipo+'][data-lang='+lang+']');
		}

		// Verify component is located
		if (component_wrap.length<1) {
			if(SHOW_DEBUG===true) {			
				console.log("Error: Component not found: parent:"+parent+" tipo:"+tipo+" lang:"+lang)
				//alert("DEGUG ONLY: Error on update_component_by_parent_tipo_lang: Component not found.");
			}
			return false;
		}

		var wrapper_id 	= component_wrap.attr('id')	
		var	callback 	= null

		return this.load_component_by_wrapper_id(wrapper_id, null, callback);
	};



	/**
	* LOAD_COMPONENT_BY_WRAPPER_ID
	*/
	this.load_component_by_wrapper_id = function (wrapper_id, _arguments, callback) {

		let start = new Date().getTime();

		// WRAPPER_OBJ. Test valid wrapper id and dom wrapper
		if (!wrapper_id) {
			if (SHOW_DEBUG===true) {
				console.log("[component_common.load_component_by_wrapper_id] DEBUG WARNING: wrapper_id is mandatory!")
			}
			return false
		}
		let wrapper_obj	= document.getElementById(wrapper_id)
			if( !wrapper_obj ) {
				if (SHOW_DEBUG===true) {
					console.warn("[component_common.load_component_by_wrapper_id] ignored not existing wrapper ",wrapper_id);
					//console.trace();
					//alert("[component_common.load_component_by_wrapper_id] DEBUG ONLY: load_component_by_wrapper_id Error: \nDebug:\n  wrapper_id not found! : " + wrapper_id)
				}
				return false;
			}

		// CONTENT_DATA
		let content_data = wrapper_obj.querySelector(".content_data")
			if (!content_data) {				
				console.log("[component_common.load_component_by_wrapper_id] Error: (content_data not found inside!) : " +wrapper_id)
				return false;
			}

		// Test some important vars
		if (typeof wrapper_obj.dataset.modo=='undefined' || wrapper_obj.dataset.modo.length<2) {
			return alert("[component_common.load_component_by_wrapper_id] Error/Warning: wrapper_obj data modo empty");
		}
		if (wrapper_obj.dataset.section_tipo.length<2) {
			return alert("[component_common.load_component_by_wrapper_id] Error (load_component_by_wrapper_id): section_tipo is not defined. "+wrapper_id)
		}

		// CUSTOMEVENT. Attach custom event to components refresh
		let custom_event = new CustomEvent('load_component_by_wrapper_id', {detail:{wrapper_id:wrapper_id, _arguments:_arguments}})


		// VARS ON WRAPPER DATASET
		let	tipo				= wrapper_obj.dataset.tipo	// Required
		let modo				= wrapper_obj.dataset.modo
		let from_modo			= wrapper_obj.dataset.from_modo
		let parent				= wrapper_obj.dataset.parent
		let section_tipo		= wrapper_obj.dataset.section_tipo
		let lang				= wrapper_obj.dataset.lang
		let context_name		= wrapper_obj.dataset.context_name
		let component_name 		= wrapper_obj.dataset.component_name
		let current_tipo_section= wrapper_obj.dataset.current_tipo_section // CURRENT_TIPO_SECTION : Usado al actualizar relation list

		// COMPONENT_PORTAL . Component portal case (render component)
		// {"section_tipo":"oh1","section_id":9,"component_tipo":"oh27","model_name":"component_portal","lang":"lg-nolan","modo":"edit","unic_id":"_oh27_9_lg-nolan_edit__oh1"}
		if (component_name==='component_portal' && modo==='edit') {
			//if(_arguments && _arguments.render_component_html && _arguments.render_component_html==true) {

			//var component_info = JSON.parse(wrapper_obj.dataset.component_info)
			//console.log(component_info); console.log(component_info.propiedades.edit_view); return;
			//if (!component_info || !component_info.propiedades.edit_view || component_info.propiedades.edit_view==='view_single_line') {
			return section.render_component_html({
					"section_tipo" 		: section_tipo,
					"section_id" 		: parent,
					"component_tipo" 	: tipo,
					"model_name" 		: component_name,
					"lang" 				: lang,
					"modo" 				: modo,
					"unic_id" 			: wrapper_id
				})
			//}			
		}//end portal edit case


		// TRIGGER_VARS. Are sended to trigger php script by XMLHttpRequest 
		const trigger_vars = {
			mode					: 'load_component_by_ajax',
			tipo					: tipo,
			modo					: modo,
			from_modo				: from_modo,
			parent					: parent,
			section_tipo			: section_tipo,
			lang					: lang,
			top_tipo				: page_globals.top_tipo,
			top_id					: page_globals.top_id,
			context_name			: context_name,
			current_tipo_section	: current_tipo_section,
			arguments				: _arguments // arguments es un contenedor genérico donde se puede pasar cualquier cosa (es preferible usarlo como objeto)
		}
		//console.log("[component_common.load_component_by_wrapper_id] trigger_vars",trigger_vars);		


		// Set wrapper opacity as loading..
		html_page.loading_content( wrapper_obj, 1 );


		// PROMISE JSON XMLHttpRequest
		let js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[component_common.load_component_by_wrapper_id] response.debug", response.debug);
				if (!response || !response.result) {
					console.trace();
				}				
			}

			if (response && response.result) {

				/*let new_component_string = response.result;
				let parser = new DOMParser();
				let new_component = parser.parseFromString(new_component_string, "text/xml").querySelector(".content_data");*/

				let tempDiv = document.createElement('div');
					tempDiv.innerHTML = response.result;
				let new_component = tempDiv.querySelector(".wrap_component");
					if (!new_component) {
						console.error("[component_common.load_component_by_wrapper_id] Error. wrap_component not found in received data", response.result);
					}else{
						let parent_node = wrapper_obj.parentNode;
						if (!parent_node) {
							console.warn("[component_common.load_component_by_wrapper_id] Error. wrapper_obj.parentNode not found in received data", response.result);							
						}else{
							let js_promise = new Promise(function(resolve, reject) {
						
								// Replace wrapper
								if ( parent_node.replaceChild(new_component, wrapper_obj) ) {
									resolve("DOM updated!");
								}else{
									reject(Error("Error on append child"));
								}

							}).then(function(result) {
								
								// Run scripts after dom changes are finish
								exec_scripts_inside(new_component);

							}, function(err) {
								console.log("[insertAndExecute] error ",err);
							});

							//console.log(new_component,wrapper_obj);
							//parent_node.replaceChild(new_component, wrapper_obj);
							//exec_scripts_inside(new_component);
							//insertAndExecute(wrapper_obj, tempDiv)
						}							
					}//end if (!new_component)
				

				// Callback optional
				if (callback && typeof(callback) === "function") {
					callback( content_data );
				}

				// launch custom event
				window.dispatchEvent(custom_event)

			}else{
				// Notify to log messages in top of page
				var msg = "<span class='error'>ERROR: on Load component</span>";
				inspector.show_log_msg(msg);

				html_page.loading_content( wrapper_obj, 0 );
			}
			
			if (SHOW_DEBUG===true) {
				//console.log( "[component_common.load_component_by_wrapper_id]-> loaded wrapper: " + wrapper_id + " tipo:"+tipo+ " modo:"+modo )				
				var end  = new Date().getTime(); var time = end - start
				//console.log("[component_common:load_component_by_wrapper_id] -> execution time: " +time+' ms' )			
			}

			//html_page.loading_content( new_component, 0 );
		}, function(error) {			
			// log
			console.error("[component_common.load_component_by_wrapper_id] Error.", error);
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " Load component</span>" + error );
			
			html_page.loading_content( wrapper_obj, 0 );
		})


		return js_promise;
	};// end this.load_component_by_wrapper_id



	/**
	* PROPAGATE CHANGES TO SPAN DATO
	*/
	this.propagate_changes_to_span_dato = function( component_obj ) {	
		
		// COMPONENT_OBJ verify
		if (component_obj instanceof jQuery) {
			if(SHOW_DEBUG===true) {
				console.log("[component_common:propagate_changes_to_span_dato] Warning! Don't use JQUERY object on propagate_changes_to_span_dato! . First element will be used, but change component_obj argument ASAP")
			}
			component_obj = component_obj[0]	// object jquery case
		}

		if (typeof component_obj == "undefined" || typeof component_obj.dataset == "undefined" ) {
			return false;
		}
		if (!component_obj.dataset.tipo) {
			return false;
		}
		
		var tipo 		 = component_obj.dataset.tipo
		var section_tipo = component_obj.dataset.section_tipo
		var parent 		 = component_obj.dataset.parent

		// On save, update possible dato in list (in portal x example)
		var matches    = document.querySelectorAll('.css_span_dato[data-tipo="'+tipo+'"][data-parent="'+parent+'"][data-section_tipo="'+section_tipo+'"]');
		var len 	   = matches.length
		for (var i = len - 1; i >= 0; i--) {
			matches[i].innerHTML = component_obj.value
		}
		
		// Thesaurus case
		var section_id = parent;		
		var matches    = document.querySelectorAll('.list_thesaurus_element[data-type=term][data-tipo="'+tipo+'"][data-section_id="'+section_id+'"][data-section_tipo="'+section_tipo+'"]'); // 
		var len 	   = matches.length
		for (var i = len - 1; i >= 0; i--) {
			matches[i].innerHTML = component_obj.value
		}
	};//end propagate_changes_to_span_dato



	/**
	* RESIZE_IFRAME
	*/
	this.resize_iframe = function (iframe_obj, height_adjustment) {

		try {
			// Iframe container
			//var iframe_id		= 'security_access_iframe' ;							//alert(iframe_id)
			//var iframe_obj		= parent.$('#'+iframe_id);							if (SHOW_DEBUG===true) console.log(iframe_obj);	//parent.$('.iframe_video');
			//var iframe_obj		= $('#'+iframe_id);										//if (SHOW_DEBUG===true) console.log(iframe_obj);	//parent.$('.iframe_video');

			let iframe_obj			= $(iframe_obj);
			//var height_adjustment	= height_adjustment;

			// SI EL PARENT ES UN IFRAME, ADAPTAMOS SU TAMAÑO AL TAMAÑO DEL CONTENIDO
			if( iframe_obj.length > 0 ) {

				let iframe_height	= iframe_obj.height();								//if (SHOW_DEBUG===true) console.log('+ iframe_obj: ' + iframe_obj + ' - iframe_height: ' + iframe_height  );

				// HEIGHT DEL CONTENIDO (iframe body)
				let content_obj			= iframe_obj.contents().find('body');
				let content_obj_height	= content_obj.height();							//if (SHOW_DEBUG===true) console.log('content_obj:' + content_obj + '  - content_obj_height: ' + content_obj_height  );

				// Ajustamos el alto del iframe al alto del contenido
				let height_final	=  parseInt(content_obj_height + height_adjustment);
				iframe_obj.height(height_final);										//if (SHOW_DEBUG===true) console.log('-> Resized parent iframe from ' +content_obj_height + ' to ' + height_final + " - height_adjustment:" +height_adjustment );
			}

		}catch(err){
			if (SHOW_DEBUG===true) console.log('!! resize_parent_iframe: ' + err)
		}
	};//end resize_iframe



	/**
	* SELECT WRAP
	* @param dom object obj_wrap
	* @param string id_wrapper optional
	*/
	this.select_wrap = function(obj_wrap, id_wrapper) {

		if (id_wrapper) {
			obj_wrap = document.getElementById(id_wrapper);
		}

		if (obj_wrap instanceof jQuery ) {
			obj_wrap = obj_wrap[0];	// object jquery case
			if(SHOW_DEBUG===true) {
				console.warn("[component_common.select_wrap] received jquery element. Please update code for this call to avoid jquery object here.");
				console.trace();
			}
		}
		
		if (!obj_wrap) {
			if(SHOW_DEBUG===true) {
				console.log("[component_common.select_wrap] Stopped select_wrap. obj_wrap not found:", obj_wrap);
				console.trace();
			}
			return false;
		}

		// IS_SELECTED_COMPONENT. Verify is already selected to avoid double selections
		if( component_common.is_selected_component(obj_wrap) ) {
			return false;
		}

		// RESET_ALL_SELECTED_WRAPS . Reset all previous wrap selections
		this.reset_all_selected_wraps(true);

		// SELECT_COMPONENT . Change current wrap background for hilite
		component_common.select_component(obj_wrap)

		// UPDATE_INSPECTOR_INFO . Update inspector info
		inspector.update_inspector_info(obj_wrap);

		// INSPECTOR TOOLS RESET. Reset tools containers
		this.reset_tools_containers();

		// LOAD_INSPECTOR_TOOLS . Load proper inspector tools
		inspector.load_inspector_tools(obj_wrap);

		// UPDATE_LOCK_COMPONENTS_STATE when is defined in config. Update lock_components state (FOCUS)
		if(typeof lock_components!=="undefined") {
			lock_components.update_lock_components_state( obj_wrap, 'focus' );
			//console.log("[component_common.select_wrap] lock_components init",obj_wrap);
		}
	};//end select_wrap



	/**
	* RESET ALL SELECTED WRAPS
	* @param bool exec_update_lock_components_state
	*/
	this.reset_all_selected_wraps = function( exec_update_lock_components_state ) {

		let elements = document.querySelectorAll(".selected_wrap, .locked_wrap");
		const len = elements.length
		for (let i = len - 1; i >= 0; i--) {

			let obj_wrap = elements[i];

			// Unselect component
			component_common.unselect_component(obj_wrap)

			// Remove possible locked_wrap class
			obj_wrap.classList.remove("locked_wrap");

			// Update lock_components state (BLUR). exec_update_lock_components_state is bool value
			if(exec_update_lock_components_state===true && typeof lock_components!='undefined') {
				lock_components.update_lock_components_state( obj_wrap, 'blur' );
			}
		}

		return true
	};//end reset_all_selected_wraps



	/**
	* SELECT_COMPONENT
	* @param DOM object obj_wrap
	*/
	this.select_component = function(obj_wrap) {
		
		if (obj_wrap===null || typeof obj_wrap!=="object") {
			if(SHOW_DEBUG===true) {
				console.log("[component_common.select_component] Stopped select component. Invalid obj_wrap:", obj_wrap);
			}
			return false;
		}

		// EDIT HIDEN . Show hidden edit elements
		let hidden_elements = obj_wrap.querySelectorAll(".edit_hidden")
			const len = hidden_elements.length;
			for (let i = len - 1; i >= 0; i--) {
				hidden_elements[i].classList.add("edit_show")	
			}

		// Add class to current wrap
		obj_wrap.classList.add("selected_wrap");
		
		// Focus first input inside wrap
		let component_input = obj_wrap.querySelector("select,input[type=text]")
			if (component_input) {
				component_input.focus()
			}

		return true;
	};//end select_component



	/**
	* UNSELECT_COMPONENT
	* @param dom object obj_wrap
	*/
	this.unselect_component = function(obj_wrap) {

		obj_wrap.classList.remove("selected_wrap");
		obj_wrap.blur()
		
		// GLOBAL SELECTED CHECK
		let selected = this.getActiveElement( document )
			if(selected) {
				// General case
				selected.blur()
			}else{
				// Tinymce case
				let text_area = obj_wrap.querySelector("textarea")
				if (text_area) {
					try {
						// tinyMCE sometimes is not defined (textarea is used in input_text_large too)
						let ed = tinyMCE.get( text_area.id )
						if(ed){
							ed.getBody().blur();
						}
					}
					catch (e) {
						text_area.blur()
						//console.log(e)
					}					
				}
			}

		// EDIT HIDEN . Hide hidden edit elements
		let hidden_elements = obj_wrap.querySelectorAll(".edit_hidden")
			const len = hidden_elements.length
			for (var i = len - 1; i >= 0; i--) {
				hidden_elements[i].classList.remove("edit_show")
			}	
	};//end unselect_component



	/**
	* GETACTIVEELEMENT
	* Retrieve active element of document and preserve iframe priority MULTILEVEL!
	* @return HTMLElement
	**/
	this.getActiveElement = function( current_document ){

		current_document = current_document || window.document;

		// Check if the active element is in the main web or iframe
		if( current_document.body === current_document.activeElement 
			|| current_document.activeElement.tagName == 'IFRAME' ){
			// Get iframes
			let iframes = current_document.getElementsByTagName('iframe');
			for(let i = 0; i<iframes.length; i++ ){
				// Recall
				let focused = this.getActiveElement( iframes[i].contentWindow.document );
				if( focused !== false ){
					return focused; // The focused
				}
			}
		}else{
			return current_document.activeElement;
		} 

		return false;
	};//end getActiveElement



	/**
	* IS_SELECTED_COMPONENT
	* @return bool
	*/
	this.is_selected_component = function(obj_wrap) {
		if(obj_wrap && obj_wrap.classList.contains('selected_wrap')!==false) {
			return true
		}
		return false
	};//end is_selected_component



	/**
	* LOCK_COMPONENT
	*/
	this.lock_component = function(obj_wrap, full_username) {	
		obj_wrap.classList.add("locked_wrap");
		/*
		if (DEBUG || page_globals.page_globals===true) {
			if($(obj_wrap).find('label > span').length>0) {
				$(obj_wrap).find('label > span').html(full_username)
			}else{
				$(obj_wrap).find('label').append('<span class=\"locked_wrap_username\">'+full_username+'</span>')
			}			
		}
		*/
		// Add spinner overlay
		//$(obj_wrap).prepend('<div class="locked_wrap_overlay"><span></span></div>');		
	};//end lock_component



	/**
	* UNLOCK_COMPONENT
	*/
	this.unlock_component = function(obj_wrap) {		
		obj_wrap.classList.remove("locked_wrap");
		// Add spinner overlay
		//$(obj_wrap).prepend('<div class="locked_wrap_overlay"><span></span></div>');
	};//end unlock_component



	/**
	* CHANGE_MODE_COMPONENT
	*/
	this.change_mode_component = function(component_obj, from_modo, to_modo){
			let wrap_div 	= find_ancestor(component_obj, 'wrap_component');
			if(from_modo==='edit'){
				component_common.reset_all_selected_wraps(true)
			}
			component_common.select_component(wrap_div)
			let wrapper_id 	= wrap_div.id;
			wrap_div.dataset.modo = to_modo;
			if(wrap_div.dataset.modo = to_modo){
				wrap_div.dataset.from_modo = from_modo;
				return this.load_component_by_wrapper_id(wrapper_id)
				//component_autocomplete_ts.refresh_component(null);
			}
	}//end change_mode_component



	/**
	* RESET_TOOLS_CONTAINERS
	*/
	this.reset_tools_containers = function () {
		let elements = document.getElementsByClassName("tools_container_div")
		const len = elements.length
		for (let i = len - 1; i >= 0; i--) {
			elements[i].innerHTML = '';
		}
		let inspector_tools_log = document.getElementById('inspector_tools_log')
		if (inspector_tools_log) {
			inspector_tools_log.innerHTML = '';
		}
		/*
		$('.tools_container_div').html('');
		$('#inspector_tools_log').html('');
		//$('#inspector_indexations').html('');
		//$('#inspector_relation_list_tag').html('');
		*/
	};//end reset_tools_containers



	/**
	* SELECT_WRAP_ON_TAB_FOCUS
	*/
	this.select_wrap_on_tab_focus = function(obj, id_wrapper) {
		$(window).keyup(function (e) {
			e.stopPropagation();
			var code = (e.keyCode ? e.keyCode : e.which);
			if (code == 9 && document.activeElement == obj) {
			   //alert('I was tabbed!');
			   component_common.select_wrap(null, id_wrapper)
			   return true;
			}else{
				return false;
			}
		});
	};//end select_wrap_on_tab_focus



	/**
	* SHOW_SECTION_GROUP
	* @param array ar_tipo
	*	Array of section_group tipo
	* Section group is located by id (section_group id is the same as section_group tipo)
	*/
	this.show_section_group = function(ar_tipo, parent) {

		if( typeof ar_tipo !== 'object' ) {
			return console.log("->show_section_group: Error on parse ar_tipo. Current element is not an valid array object")
		}

		const len = ar_tipo.length
		for (let i = 0; i < len; i++) {

			let tipo = ar_tipo[i];
	
			if (SHOW_DEBUG===true) console.log("-> triggered show_section_group: "+tipo)

			var element = document.getElementById(tipo)
				if (element) {
					element.style.display = 'table'
				}
		}
	};//end show_section_group



	/**
	* HIDE_SECTION_GROUP
	* Section group is located by id (section_group id is the same as section_group tipo)
	*/
	this.hide_section_group = function(ar_tipo, parent) {

		if( typeof ar_tipo !== 'object' ) {
			return console.log("->hide_section_group: Error on parse ar_tipo. Current element is not an valid array object")
		}

		const len = ar_tipo.length
		for (let i = 0; i < len; i++) {
				
			let tipo = ar_tipo[i];	
			
			if (SHOW_DEBUG===true) console.log("-> triggered hide_section_group: "+tipo)

			let element = document.getElementById(tipo)
				if (element) {
					element.style.display = 'none'
				}
		}
	};//end hide_section_group



	/**
	* PARSE_PROPIEDADES_JS
	*/
	this.parse_propiedades_js = function(js_obj, wrapper_id) {

		// OBJ : test valid obj
		if( typeof js_obj !== 'object' ) {
			return console.log("->parse_propiedades_js: Error on parse js_obj. Current element is not an valid object")
		}
		// WRAPPER_ID : test valid wrapper_id
		if( typeof wrapper_id === 'undefined' ) {
			return console.log("->parse_propiedades_js: Error on parse. Current wrapper_id is undefined")
		}

		//return console.log(js_obj);

		// JS OBJECT : Recorremos los elementos del array 'js'
		const prop_len = js_obj.length
		for (let i = prop_len - 1; i >= 0; i--) {
		
			let current_obj = js_obj[i];
				//console.log(current_obj)

			// Recorremos los elementos del objeto actual (dentro de 'js')
			for (var key in current_obj) {
				//console.log(key);

				// TRIGGER : key trigger
				if(key==='trigger') {

					// VARS : Extract vars
					var wrapper_obj  = document.getElementById(wrapper_id)
						if(!wrapper_obj) return alert('invalid wrapper: '+wrapper_id)

					var	initial_value 	= wrapper_obj.dataset.dato
					var	parent 			= wrapper_obj.dataset.parent
					var	ar_test_values	= Object.keys(current_obj.trigger)
						// console.log(initial_value); //continue;

					// TRIGGER FUNCTIONS SCRIPT
					var trigger_functions = function(current_value) {
						// console.log(current_value); 	console.log(ar_test_values); 
						// TEST VALUES : Iterate array of test values
						for (var i=0; i<ar_test_values.length; i++) {

							var current_test_value = ar_test_values[i];
								//console.log(current_test_value===current_value); continue;
							
							if(current_test_value===current_value) {

								// ACTIONS : functions to exec
								var ar_actions = current_obj.trigger[current_test_value];
									//console.log(ar_actions); continue;

								// ACTIONS EXEC :
								var actions_len = ar_actions.length;
								for (var i = 0; i < actions_len; i++) {

									// CURRENT ACTION : Resolve parent ($parent)
									var current_action = ar_actions[i];
										//console.log(current_action); 

									// PARENT : Add parent var as function argument
									current_action = replaceAll('\\)', ','+parent+'\)', current_action);
										//console.log(current_action); continue;

									// EXEC FUNCTION
									//eval(current_action);
									
									// Encapsulate code in a function and execute as well
									var myFunc = new Function(current_action); 	//console.log(myFunc);
										myFunc();

									if (SHOW_DEBUG===true) {
										console.log("-> TRIGGERED ACTION IN parse_propiedades_js: "+current_action);
									}
								}//end for actions exec (var i=0; i < ar_actions.length; i++) {

							}//end if(current_test_value==current_dato) {

						}//end test values for (var i=0; i<ar_test_values.length; i++) {

					}//end var trigger_functions


					// READY :
					$(function() {
					//document.addEventListener('DOMContentLoaded',function(){
						// DATO : current dato
						var current_dato = initial_value;
							// console.log(current_dato); console.log('current_dato: '+current_dato+' - '+wrapper_id)

						// EXEC FUNCTIONS
						trigger_functions(current_dato)
					});

					// CHANGE : //wrapper_obj.onchange = function(event) {
					wrapper_obj.addEventListener('change',function(event){

						// DATO : New dato
						var new_dato = '['+event.target.value+']';	//JSON.parse(event.target.value);
						
						// EXEC FUNCTIONS
						trigger_functions(new_dato)
					});//end wrapper.onchange


				}//end if(key=='trigger')
			}//end for (var key in current_obj) 
		}
	};//end parse_propiedades_js



	/**
	* GET_WRAPPER_FROM_ELEMENT
	* Select parent wrapper of requested element inside
	*/
	this.get_wrapper_from_element = function(el, sel) {

		if(typeof sel=='undefined' || !sel) {
			sel = '.wrap_component';	// Default value
		}
		
		//function findAncestor (el, sel) {
			while ((el = el.parentElement) && !((el.matches || el.matchesSelector).call(el,sel)));
			return el;
		//}
	}//end get_wrapper_from_element



	/**
	* GET_WRAPPER_ID_FROM_ELEMENT
	*/
	this.get_wrapper_id_from_element = function(el, sel) {

		let wrap_component_obj = component_common.get_wrapper_from_element(el, sel);

		return wrap_component_obj.id || null;		
	}//end get_wrapper_id_from_element
	


	/**
	* GET_COMPONENT_WRAPPER
	* Resolve component_wrapper from tipo, parent, section_tipo
	*/
	this.get_component_wrapper = function(tipo, parent, section_tipo) {

		var component_wrapper = null;

		var ar_wrapper = document.querySelectorAll(".wrap_component[data-tipo='"+tipo+"'][data-parent='"+parent+"'][data-section_tipo='"+section_tipo+"']")
		//console.log(ar_wrapper)

		switch(true) {

			case ar_wrapper.length==1 :
				component_wrapper = ar_wrapper[0]; 
				break;

			case ar_wrapper.length>1 :				
					console.log("[component_common.get_component_wrapper] Error: more than one wrapper is found with this arguments")								
				break;

			case ar_wrapper.length<1 :
				if(page_globals.modo==='edit') {
					if(SHOW_DEBUG===true) {
						console.log("[component_common.get_component_wrapper] Error: no wrapper is found with this arguments");
					}					
				}else if(page_globals.modo==='list') {
					window.location.reload(false); // case processes for example
				}				
				break;
		}
		
		return component_wrapper;		
	}//end get_component_wrapper



	/**
	* OPEN_TS_WINDOW
	* Abrir listado de tesauro para hacer relaciones
	*/
	var relwindow = null
	this.selected_wrap_div = null;
	this.open_ts_window = function(button_obj) {
	
		// Fix current this.selected_wrap_div (Important)
		// Nota: el wrapper no cambia al actualizar el componente tras salvarlo, por lo que es seguro
		this.selected_wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (this.selected_wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_autocomplete_hi:open_ts_window: Sorry: this.selected_wrap_div dom element not found")
			}
			//console.log(button_obj.dataset.parent_area_is_model)		

		const THESAURUS_TIPO = 'dd100'
		let url_vars = {
				t 					: THESAURUS_TIPO,
				menu 				: 'no',
				thesaurus_mode 		: 'relation',
				component_name 		: button_obj.dataset.component_name,
				hierarchy_types 	: button_obj.dataset.hierarchy_types,
				hierarchy_sections 	: button_obj.dataset.hierarchy_sections,
			}
			//return console.log(url_vars);

		if (typeof button_obj.dataset.parent_area_is_model!=='undefined' && JSON.parse(button_obj.dataset.parent_area_is_model)===true) {
			url_vars.model = 1;
		}	
			
		let url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)

		relwindow = window.open(url ,'listwindow','status=yes,scrollbars=yes,resizable=yes,width=900,height=650');//resizable
		if (relwindow) relwindow.moveTo(-10,1);
		if (window.focus) { relwindow.focus() }

		return true
	};//end open_ts_window



	/**
	* GET_COMPONENT_JSON_DATA
	* @return js_promise
	*/
	this.get_component_json_data = function(component_obj) {
		
		// Get component json data to build the html object 
		let trigger_vars = {
			mode 			: 'get_component_json_data',
			component_tipo  : component_obj.component_tipo,
			section_tipo  	: component_obj.section_tipo,
			section_id  	: component_obj.section_id,
			modo  			: component_obj.modo,
			lang  			: component_obj.lang,
			dato  			: component_obj.dato || false,
			top_tipo  		: page_globals.top_tipo,
			top_id  		: page_globals.top_id || null,
			// portal 
			max_records 	: component_obj.max_records || null,
			//offset  		: component_obj.offset || 0,
		}
		if (component_obj.max_records) {
			trigger_vars.max_records = component_obj.max_records
		}
		if (component_obj.offset) {
			trigger_vars.offset = component_obj.offset
		}
		//console.log("[component_common:get_component_json_data] trigger_vars:",trigger_vars); //return false;
		
		let js_promise = common.get_json_data(component_common.url_trigger, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					//console.log("[component_common:get_component_json_data] response", response);
				}

				if (response===null) {
					if(SHOW_DEBUG===true) {
						console.log("[component_common:get_component_json_data] Error on get component json. Null is received because response is not json valid data (review server error logs for details)");
					}
					return false;
				}else{
					return response
				}
			})//end get_json_data then


		return js_promise;	
	};//end get_component_json_data



	/**
	* BUILD_COMPONENT_HTML
	* @return 
	*/
	this.build_component_html = function( component_obj, content_data ) {
		//console.log(component_obj); //return;
		//component_obj = cloneDeep(component_obj)

		let place_holder = document.getElementById(component_obj.unic_id)
			//console.log(place_holder);
			if (place_holder===null) {
				if(SHOW_DEBUG===true) {
					console.log("[component_common:build_component_html] Error on get component place_holder id: "+component_obj.unic_id);
				}
				return false;
			}	

			// WRAP
			let wrap = common.create_dom_element({
									element_type 	: 'div',							
									class_name 	 	: 'wrap_component css_wrap_'+component_obj.component_name.substring(10)+' wrap_component_'+component_obj.modo+' wrap_component_view_full wrap_component_'+component_obj.component_tipo,
									id 				:  component_obj.unic_id,
									data_set 		: {
														"tipo" 				: component_obj.component_tipo,
														"section_tipo" 		: component_obj.section_tipo,
														"parent" 			: component_obj.section_id,
														"lang" 				: component_obj.lang,
														"modo" 				: component_obj.modo,
														"component_name" 	: component_obj.component_name,
														"component_info" 	: component_obj.component_info,
														"target_section_tipo":component_obj.target_section_tipo || null
													  },
									title_label 	: null,
									text_node 		: null,
									draggable 		: null,
									parent 			: null,
									custom_function_events : null
								})
								//console.log(wrap);

			let label = common.create_dom_element({
									element_type 	: 'label',
									id 				: null,
									class_name 	 	: 'css_label label',
									data_set 		: null,
									title_label 	: null,
									text_node 		: component_obj.label,
									draggable 		: null,
									parent 			: null,
									custom_function_events : null
								})
			if (!content_data) {
			var content_data = common.create_dom_element({
									element_type 	: 'div',
									id 				: null,
									class_name 	 	: 'content_data',
									data_set 		: null,
									title_label 	: null,
									text_node 		: null,
									draggable 		: null,
									parent 			: null,
									custom_function_events : null
								})
			}


			wrap.appendChild(label)
			wrap.appendChild(content_data)


			// Replace component place holder
			 place_holder.parentNode.replaceChild(wrap, place_holder);
		

			// EXEC COMPONENTS HTML SCRIPTS
			exec_scripts_inside(wrap)


		return wrap;		
	};//end build_component_html



	/**
	* FAST_SWITCH_LANG
	* Reloads component in another lang using an html lang select
	* @param dom object selector_obj
	* @return promise
	*/
	this.fast_switch_lang = function(selector_obj) {
		
		// Value
		let value = selector_obj.value 
			//console.log(value);

		//var wrapper = component_common.get_wrapper_from_element(selector_obj)
		let id_wrapper 	= selector_obj.dataset.id_wrapper
		let wrapper 	= document.getElementById(id_wrapper)
			if (!wrapper) {
				alert("[component_common.fast_switch_lang] Error. wrapper not found: "+id_wrapper+ " value: "+value);
				return false
			}

		// Change dataset lang before reload to force load in wanted lang
		wrapper.dataset.lang = value

		// Add lang label to wrapper dataset for diverses uses		
		wrapper.dataset.lang_label = selector_obj.options[selector_obj.selectedIndex].innerHTML	

		// Change wrapper id for coherence with new lang
		wrapper.id = wrapper.id.replace(/(.*_)(lg-.{3})(_.*)/,'$1'+value+'$3')

		// Wrapper init time update
		let	date = new Date()
		let	time = date.getTime()
		wrapper.dataset.init_time = time

		//console.log("++++[component_common.fast_switch_lang]",wrapper);
	
		// Reload component in new lang
		let js_promise = component_common.load_component_by_wrapper_id(wrapper.id).then(function(response){
			// Updates selector dataset id_wrapper
			selector_obj.dataset.id_wrapper = wrapper.id
		})

		return js_promise
	};//end fast_switch_lang



	/**
	* UPDATE_COMPONENT_WITH_VALUE_STATE
	* @return 
	*/
	this.update_component_with_value_state = function(wrapper_obj) {

		if (!wrapper_obj) {
			return false
		}

		let with_value = false

		// Wrapper dataset dato
		if ( wrapper_obj.dataset.dato!=='[]' && wrapper_obj.dataset.dato!=='[""]' && wrapper_obj.dataset.dato!=='""' && wrapper_obj.dataset.dato!=='null' && wrapper_obj.dataset.dato.length>0) {			
			with_value = true
		}

		// Operator
		if (with_value===false) {
			let q_operator = wrapper_obj.querySelector("input.q_operator")		
			if (q_operator && q_operator.value.length>0) {
				with_value = true
			}
		}


		if (with_value===true) {
			wrapper_obj.classList.add("component_with_value")			
		}else{
			wrapper_obj.classList.remove("component_with_value")
		}

		if(SHOW_DEBUG===true) {
			//console.log("called update_component_with_value_state :",wrapper_obj );;
		}
		
		return true
	};//end update_component_with_value_state



	/**
	* FIX_DATO
	* Set component wrapper dato with updated current value 
	* Used in search mode
	* @return 
	*/
	this.fix_dato = function(button_obj, component_modelo_name) {
		if(SHOW_DEBUG===true) {
			//console.log("[component_common.fix_dato] component_modelo_name:",component_modelo_name);
			//console.log("window[component_modelo_name]:",button_obj,component_modelo_name,window[component_modelo_name]); return;
		}		

		let self = this

		if (typeof window[component_modelo_name].get_dato !== 'function') {
			console.error("Warning get_dato function not exists:",component_modelo_name);
		//	self.load_component_class(component_modelo_name)
			return false
		}		

		let component_js 	= window[component_modelo_name]
		let selected_wrap 	= find_ancestor(button_obj, 'wrap_component')
		let dato 			= component_js.get_dato(selected_wrap)			
					
		// Stringify dato
		dato = JSON.stringify(dato)

		// Fix dato in wrapper dataset
		selected_wrap.dataset.dato = dato

		// Mark as value set
		self.update_component_with_value_state(selected_wrap)

		// Operator (optional)		
		const operator_value = self.get_operator_value(selected_wrap)
		// Fix operator_value in wrapper dataset
		selected_wrap.dataset.q_operator = operator_value		


		if(SHOW_DEBUG===true) {
			console.log("[component_common.fix_dato] Fixed dato:", component_modelo_name, dato);
		}

		// Set as changed when in search context
		if (typeof search2!=="undefined") {
			search2.update_state({state:'changed'})
		}
		

		return true
	};//end fix_dato



	/**
	* GET_OPERATOR_VALUE
	* @return string q_operator
	*/
	this.get_operator_value = function(wrapper_obj) {
		
		let operator_value = null

		const operator_input = wrapper_obj.querySelector('input.q_operator')
		if (operator_input) {
			operator_value = operator_input.value
		}
		
		return operator_value
	};//end get_operator_value



	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* Every component have a specific conversion, but use this common method for fallback on
	* new components or when is not defined.
	* @see search2.js > recursive_groups
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {
		
		let search_value = ''
		let dato_parsed  = dato


		if (Array.isArray(dato_parsed)) {
			for (let i = 0; i < dato_parsed.length; i++) {
				if (typeof dato_parsed[i] === "object") {
					search_value += JSON.stringify(dato_parsed[i])
				}else{
					search_value += dato_parsed[i]
				}				
			}
		}else if (typeof dato == "object") {			
			for (var key in dato) {
				if (typeof dato[key] === "object") {
					search_value += JSON.stringify(dato[key])
				}else{
					search_value += dato[key]
				}
			}
		}else{
			search_value = dato_parsed
		}


		if(SHOW_DEBUG===true) {
			console.warn("[component_common.get_search_value_from_dato] Using fallback to generic search value formating !");
			console.log("search_value:",search_value);
		}			
		

		return search_value
	};//end get_search_value_from_dato



	/**
	* LOAD_COMPONENT_CLASS
	* @return 
	*/
	//this.track_loaded_models = []
	this.load_component_class = function(component_modelo_name, callback) {

		let self = this
	
		//if (self.track_loaded_models.indexOf(component_modelo_name)!==-1) {
		if(typeof window[component_modelo_name]!=="undefined") {
			return false
		}	
		
		// Component: url of js file
		let src = DEDALO_LIB_BASE_URL + '/' + component_modelo_name + '/js/' + component_modelo_name + '.js' + '?' + page_globals.dedalo_version
			//console.log("src:",src);

		// LOCAL VERSIONS
		if (USE_CDN!==false) {
			src = USE_CDN + src
		}

		// Load js file if not already loaded
		let load_js = common.load_script(src, function(e){
			// Callback here
			if (typeof callback==="function") {
				callback()
			}			
		})
		if(SHOW_DEBUG===true) {
			console.log("[load_component_class] load_js result:",load_js, src);
		}
		
		// Load css file too
		if (load_js===true) {

			// Create css url from js url		
			let css_url = src.replace(/\/js\//g, '/css/');
				css_url = css_url.replace(/\.js/g, '.css');
			// Load style file if not already loaded
			let load_style = common.load_style(css_url, function(e){
				// Callback here
				
			})
			if(SHOW_DEBUG===true) {
				console.log("[load_component_class] //// load_style result:",load_style, css_url);
			}
		}
		
		// Set model as loaded
		//self.track_loaded_models.push(component_modelo_name)	

		return true
	};//end load_component_class



	/**
	* INIT
	* Check if component script is loaded. If not, load and on finish, init the component
	* @return bool true
	*/
	this.init = function(options) {
		
		const component_name = options.component_name

		if(SHOW_DEBUG===true) {
			//console.log("options:",options);
			//console.log("typeof :", typeof window[component_name]);
			//console.log("++ loaded component_name:",component_name);
		}		

		if (typeof window[component_name]==="undefined") {
			
			// JS is not loaded
			component_common.load_component_class(component_name, function(e){				
				window[component_name].init(options)
			})
			
		}else{

			// JS already loaded
			window[component_name].init(options)
		}


		return true
	};//end init
	




};// end component_common class