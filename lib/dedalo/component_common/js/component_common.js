/**
* COMPONENT COMMON CLASS
*
*
*
*/
var component_common = new function() {

	this.url_trigger  = DEDALO_LIB_BASE_URL + '/component_common/trigger.component_common.php';
	this.save_async   = true;	// Default save async
	this.saving_state = 0;		// Default 0

	

	switch(page_globals.modo) {

		case 'edit' :
				$(function() {
					
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
				});//end $(document).ready(function()
				break;
	};	
	


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

		// Attach custom event to components save
		var save_event = new CustomEvent('component_save', {detail:component_obj})
	
		var start = new Date().getTime();

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
		if (!component_obj) {
			alert("ERROR on Save component data. Requested component_obj not found in DOM")
			return Promise.resolve(function(){return false});
		}

		/* JQUERY VERSION
		$component_obj = $(component_obj);
		// Component vars
		var name			= $component_obj.attr('name'),
			tipo			= $component_obj.data('tipo'),
			parent			= $component_obj.data('parent'),
			lang			= $component_obj.data('lang'),
			modo			= $component_obj.data('modo'),
			flag			= $component_obj.data('flag'),
			caller_tipo		= $component_obj.data('caller_tipo'),
			$wrap_div 		= $component_obj.parents('.wrap_component:first'),
			label			= $wrap_div.find('.css_label:first').text(),
			component_name 	= $wrap_div.data('component_name'),
			section_tipo 	= $component_obj.data('section_tipo'),
			debug_div 		= document.getElementById('inspector_debug'),
			show_spinner 	= typeof save_arguments['show_spinner']!='undefined' ? save_arguments['show_spinner'] : true
			*/


		/* NATIVE JS */
		// From component
		var name			= component_obj.getAttribute('name')
		var	id				= component_obj.id
		var	flag			= component_obj.dataset.flag
		var	caller_tipo		= component_obj.dataset.caller_tipo

		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				alert("load_rows: Sorry: wrap_div dom element not found")
				return Promise.resolve(function(){return false});
			}
			/*
			var role = component_obj.dataset.role
			if (role==='component_security_access') {

			}
			*/

		// tes if is tmp section
		/*
		var re = /tmp_/;
			if (wrap_div.dataset.parent.search(re)!==-1) {
				if(SHOW_DEBUG===true) {
					console.log("Ignored Save command on temp section");
				}				
				//return Promise.resolve(function(){return false});
			}*/

		var	tipo			= component_obj.dataset.tipo
		var	parent			= component_obj.dataset.parent
		var	lang			= component_obj.dataset.lang
		var	modo			= component_obj.dataset.modo || 'edit'
		var	section_tipo 	= component_obj.dataset.section_tipo
		
		var label_element 	= wrap_div.querySelector(".css_label")
		//var	label		= wrap_div.querySelector(".css_label") ? wrap_div.querySelector(".css_label").innerHTML : '' //$wrap_div.find('.css_label:first').text(),
		var	label			= (label_element!==null) ? label_element.innerHTML : ''
		var	component_name 	= wrap_div.dataset.component_name
						
			//wrap_div 		= component_obj.closest(".wrap_component"), 	  //$component_obj.parents('.wrap_component:first'),
			//wrap_div 		= $(component_obj).parents('.wrap_component:first')[0],			
		var debug_div 		= document.getElementById('inspector_debug')
		var show_spinner 	= typeof save_arguments['show_spinner']!=='undefined' ? save_arguments['show_spinner'] : true

		if(SHOW_DEBUG===true) {			
			console.log("[component_common:Save] -> Save sequence initied '"+label+"' "+"["+section_tipo+"-"+tipo+"-"+parent+"]")
		}


		// LOGIN : Login window don't save nothing
		if (modo==='login') {
			return Promise.resolve(function(){return false});
		}

		// DATO : Si se le pasa una variable save_arguments con el key 'dato', sobreescribe el dato por defecto
		if( save_arguments && typeof save_arguments.dato !== 'undefined' ) {
			var dato = save_arguments.dato;
		}else{
			var dato = this.common_get_dato(component_obj);		//alert("Saving dato:" + dato)	//component_obj.value ;  //return alert("id:" + id + " - tipo: " + tipo  + " - dato:" + dato );
		}
		//console.log(dato);	console.log(typeof dato); //return;

		// Trigger override
		var url_trigger = component_common.url_trigger
		if( save_arguments && typeof save_arguments.url_trigger !== 'undefined' ) {
			url_trigger = save_arguments.url_trigger
		}
		
	
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

		var mydata = {	'mode'			: 'Save',
						'parent'		: parent,
						'dato'			: JSON.stringify(dato), // Stringify dato
						'name'			: name,
						'tipo'			: tipo,
						'modo'			: modo,
						'lang'			: lang,
						'flag'			: flag,
						'caller_tipo'	: caller_tipo,
						'top_tipo'		: page_globals.top_tipo,
						'section_tipo'  : section_tipo,
					};
					//return console.log(mydata)

		if(show_spinner) html_page.loading_content( wrap_div, 1 );
		//if(show_spinner) html_page.loading_content( $wrap_div, 1 );

		// SAVING_STATE
		component_common.saving_state = 1;

		var jsPromise = Promise.resolve(

			// AJAX REQUEST
			$.ajax({
				url		: url_trigger,
				data	: mydata,
				type 	: "POST",
				async 	: component_common.save_async,
			})
			// DONE
			.done(function(received_data) {

				// DEBUG
					if(SHOW_DEBUG===true) {
						var end  = new Date().getTime();
						var time = end - start;
						console.log("[component_common:Save] -> Save response: "+received_data + " for tipo:" + tipo + " label:"+label +" - execution time: " +time+' ms' );
					}

				// INSPECTOR LOG INFO
					if (received_data.indexOf("Error")!==-1 || received_data.indexOf("error")!==-1 || received_data.indexOf("Failed")!==-1) {
						var msg = "<span class='error'>Failed Save!<br>" +received_data+ " for " + label + "</span>";
					}else{
						var msg = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
					}
					inspector.show_log_msg(msg);

					// INSPECTOR DEBUG INFO
					if( debug_div ) {
						debug_div.innerHtml = "";
						debug_div.innerHtml += "<div class=\"key\">saved</div><div class=\"value\">" + label + "</div><br>\n"
						debug_div.innerHtml += "<div class=\"key\">tipo</div><div class=\"value\">"  + tipo + "</div><br>\n"
						debug_div.innerHtml += "<div class=\"key\">chars</div><div class=\"value\">" + received_data.length + "</div><br>\n"
						debug_div.innerHtml += "<div class=\"key\">dato</div><div class=\"value\">"  + received_data.replace(/<br ?\/?>/g, " ") + "</div><br>\n"
					}

				// Fix changed content for time machine close dialog function
					changed_original_content = 1;

				// FILTER MASTER / SECURITY ACCESS : Refresh info of related components. Only in section 'Usuarios'
					// if (SHOW_DEBUG===true) console.log("cancel_update_components "+cancel_update_components)
					/*
					try {
						var wrap_filter_master 	 = document.querySelector('.css_wrap_filter_master'),
							wrap_security_access = document.querySelector('.css_wrap_security_access')

						if( typeof save_arguments!='undefined' && save_arguments['update_filter_master']==true && wrap_filter_master ) {
							var wrapper_id = wrap_filter_master.id	//$('.css_wrap_filter_master:first').attr('id');
							// Reload component (update showed data)
							component_common.load_component_by_wrapper_id(wrapper_id);
						}					
					}catch(error){
						if (SHOW_DEBUG===true) console.log(error);
					}
					*/

				// HIDE REFERENCE DATO DEFAULT LANG
					//var dato_reference = wrap_div.querySelector(".dato_refecence_default_lang");
					//if (dato_reference) {
					//	dato_reference.style.display = 'none'; //$(wrap_div).find('.dato_refecence_default_lang:first').hide(300);
					//}
					// var $dato_reference = $(wrap_div).find(".dato_refecence_default_lang");
					/*
					var dato_reference = wrap_div.querySelector(".dato_refecence_default_lang")
					if (typeof dato_reference!==undefined) {
						dato_reference.hide()
					}
					*/

				/*
				// RELOAD INSPECTOR TOOLS
				if (id<1)
				inspector.load_inspector_tools(wrap_div);
				*/

				// CALLBACK
					if(typeof save_arguments['callback'] === "function" ) {
						save_arguments['callback'](received_data);
					}
					//console.log(typeof save_arguments['callback'])
				
				eventDetail = {foo: 'bar'}

				// launch custom event
				window.dispatchEvent(save_event)
			})
			// FAIL ERROR
			.fail(function(error_data) {
				// Notify to log messages in top of page
				var msg = "<span class='error'>ERROR: on Save data id:" + id + " (Ajax error)<br>Data is NOT saved!</span>";
				inspector.show_log_msg(msg);
				if (SHOW_DEBUG===true) {
					console.log(msg);
					console.log(error_data);
				}
			})
			// ALWAYS
			.always(function() {
				if(show_spinner) html_page.loading_content( wrap_div, 0 );
				//if(show_spinner) html_page.loading_content( wrap_div, 0 );

				// SAVING_STATE
				component_common.saving_state = 0;
			})

		)//end promise

		return jsPromise;		
	};//end save



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

								// INDETERMINATE : Añadimos ':1' que será 'solo lectura' en admin_access
								if($(this).prop('indeterminate')==true) {
									//return String( $(this).val() +':1' );
									var estado = '1';

								// CHECKED : Añadimos ':2' que será 'lectura-escritura' en admin_access
								}else if($(this).prop('checked')===true) {
									//return String( $(this).val() +':2' );
									var estado = 2;

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
	};



	/**
	* SELECT_NEXT_COMPONENT
	*/
	this.select_next_component = function (current_ob) {

		// Blur current input
		//$(current_ob).blur();

		// Focus next input
		var $next_input_obj	= $(current_ob).parent().nextAll(":first").find(":input");		if($next_input_obj == null) return null;	  //if (SHOW_DEBUG===true) console.log(next_input_obj)
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
	};



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
	};


	
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
			if(DEBUG) {
				console.log("Error: Component not found: parent:"+parent+" tipo:"+tipo+" lang:"+lang)
				//alert("DEGUG ONLY: Error on update_component_by_parent_tipo_lang: Component not found.");
			}
			return false;
		}

		var wrapper_id 	= component_wrap.attr('id')
		var arguments 	= null
		var	callback 	= null

		return this.load_component_by_wrapper_id(wrapper_id, arguments, callback);
	};



	/**
	* UPDATE_COMPONENT_BY_AJAX
	*/
	this.update_component_by_ajax = function (id_matrix, callback) {
		return alert("No usar update_component_by_ajax. Usar en su lugar 'update_component_by_parent_tipo_lang' o 'load_component_by_wrapper_id' en su lugar");		
	};



	/**
	* LOAD_COMPONENT_BY_WRAPPER_ID
	*/
	this.load_component_by_wrapper_id = function (wrapper_id, arguments, callback) {

		if (!wrapper_id) {
			if (SHOW_DEBUG===true) {
				console.log("DEBUG WARNING: wrapper_id is mandatory!");
			}
			return false
		}

		var wrapper_obj	= document.getElementById(wrapper_id);	// $('#'+wrapper_id);
			if( !wrapper_obj ) {
				if (SHOW_DEBUG===true) {
					alert("DEBUG ONLY: load_component_by_wrapper_id Error: \nDebug:\n  wrapper_id not found! : " + wrapper_id);
				};
				return false;
			}

		// VARS ON WRAPPER DATASET
		var	tipo				= wrapper_obj.dataset.tipo,		// Required
			modo				= wrapper_obj.dataset.modo,
			from_modo			= wrapper_obj.dataset.from_modo,
			parent				= wrapper_obj.dataset.parent,
			section_tipo		= wrapper_obj.dataset.section_tipo,
			lang				= wrapper_obj.dataset.lang,
			context_name		= wrapper_obj.dataset.context_name,
			component_name 		= wrapper_obj.dataset.component_name,
			current_tipo_section= wrapper_obj.dataset.current_tipo_section // CURRENT_TIPO_SECTION : Usado al actualizar relation list

		// Wrap data modo test
		if (typeof modo=='undefined' || modo.length<2) {
			return alert("Error/Warning: wrapper_obj has no data modo");
		}
		if (section_tipo.length<2) {
			return alert("Error (load_component_by_wrapper_id): section_tipo is not defined. "+wrapper_id)
		}

		var mydata	= {
						'mode'					: 'load_component_by_ajax',
						'tipo'					: tipo,
						'modo'					: modo,
						'from_modo'				: from_modo,
						'parent'				: parent,
						'section_tipo'			: section_tipo,
						'lang'					: lang,
						'top_tipo'				: page_globals.top_tipo,
						'top_id'				: page_globals.top_id,
						'context_name'			: context_name,
						'current_tipo_section'	: current_tipo_section,
						'arguments'				: arguments, // arguments es un contenedor genérico donde se puede pasar cualquier cosa (es preferible usarlo como objeto)
					  }
					  //return console.log(mydata);

		var target	= wrapper_obj.querySelector(".content_data")
		if (!target) {
			return alert("load_component_by_wrapper_id Error: (content_data not found inside!) : " +wrapper_id);
		}

		//html_page.loading_content( wrapper_obj, 1 );

		var jsPromise = Promise.resolve(

			// AJAX REQUEST
			$.ajax({
				url		: this.url_trigger,
				data	: mydata,
				type 	: "POST"
			})
			// DONE
			.done(function(received_data) {

				//console.log( received_data )
				//var section_content = $(received_data).find('.css_section_content:first>*').html();
				// Replace container content with inner_content (only .content_data div)


				/* JQUERY WAY */
					$(target).html(
						$(received_data).find('.content_data:first>*')
						);


				/* PURE JAVASCRIPT WAY 	(Da problemas en algunos contextos como tool lang automatic transcription)
					// Parse received string as DOM data
					var tempDiv = document.createElement('div');
						tempDiv.innerHTML = received_data;
						//console.log(tempDiv);

					// Select div 'content_data' from tempDiv DOM
					var content = tempDiv.querySelector(".content_data")
						//console.log(content);

					// Replace old node with received updated node
					target.parentNode.replaceChild(content, target);

					// Exec possible javascript code inside (element init, etc.)
					var codes = target.getElementsByTagName("script");
					for(var i=0;i<codes.length;i++) {
						eval(codes[i].text);
					}
					*/

				//
				// RELOAD JS COMPONENT SCRIPT
				// To reload DOM event handlers to current component
				//
				// Data defined in component wrap like 'data-component_name=\"{$component_name}\"'
				//var component_name 	= wrapper_obj.dataset.component_name;
				// Apply only to certain components
				if (typeof component_name != "undefined") {

					// UPDATE GERERAL TAP STATE
					// Needed for portal component updates
					html_page.taps_state_update();

				}else{
					if (SHOW_DEBUG===true) console.log( "->load_component_by_wrapper_id: ALERT: component_name is undefined" )
				}

				if (SHOW_DEBUG===true) {
					console.log( "->load_component_by_wrapper_id: loaded wrapper: " + wrapper_id + " tipo:"+tipo+ " modo:"+modo )
					//console.log(mydata)
				}

				// Callback optional
				if (callback && typeof(callback) === "function") {
					callback( target );
				}

				// Focus loaded component
				if (top.changed_original_content == 1) {
					component_common.select_wrap( wrapper_obj );
				}

				// Return updated component data
				//return $target //console.log($target);
			})
			// FAIL ERROR
			.fail(function(error_data) {
				// Notify to log messages in top of page
				var msg = "<span class='error'>ERROR: on Load component</span>";
				inspector.show_log_msg(msg);
				if (SHOW_DEBUG===true) console.log(error_data);
			})
			// ALWAYS
			.always(function() {
				//html_page.loading_content( wrapper_obj, 0 );
			})
		)//end promise


		return jsPromise;
	};// end this.load_component_by_wrapper_id



	/**
	* LOAD_SECTION_BY_AJAX
	*/
	this.load_section_by_ajax = function (wrapper_id, callback) {

		// Locate component wrap on page
		//var section_wrapper = $('.wrap_component[data-id_matrix='+id_matrix+']');	//if (SHOW_DEBUG===true) console.log(section_wrapper)
		var wrapper_obj = $('#'+wrapper_id);

		// Verify component is located
		if (wrapper_obj.length!=1) { return alert("Error on load_section_by_ajax: Component wrapper_id:"+wrapper_id+" not found.") };

		var wrapper_obj_data = $(wrapper_obj).data();

		// vars
		var vars = new Object();
			vars.section_id			= wrapper_obj_data.id_matrix,
			vars.section_tipo 		= wrapper_obj_data.tipo,
			vars.section_modo 		= wrapper_obj_data.modo,
			vars.section_context	= wrapper_obj_data.context;
		// Verify vars values
		if(!test_object_vars(vars,'remove_resource_from_portal')) return false;
			//return console.log(vars)

		// target div
		var target 		=  wrapper_obj.find('.css_section_content').first();
			if($(target).length!=1) return alert("load_section_by_ajax Error: (css_section_content not found inside!) : " +wrapper_id);


		var mode 		= 'load_section_by_ajax';
		var mydata		= { 'mode':mode,
							'id':vars.section_id,
							'tipo':vars.section_tipo,
							'modo':vars.section_modo,
							'context':vars.section_context,
							'top_tipo':page_globals.top_tipo
						};
						//if (SHOW_DEBUG===true) console.log(mydata);

		//html_page.loading_content( wrapper_obj, 1 );

		var jsPromise = Promise.resolve(

			// AJAX REQUEST
			$.ajax({
				url		: this.url_trigger ,
				data	: mydata ,
				type 	: "POST"
			})
			// DONE
			.done(function(received_data) {

				//var section_content = $(received_data).find('.css_section_content:first>*').html();
				target.html( $(received_data).find('.css_section_content:first>*') );


				// Callback optional
				if (callback && typeof(callback) === "function") {
					callback();
				}
			})
			// FAIL ERROR
			.fail(function(error_data) {
				// Notify to log messages in top of page
				var msg = "<span class='error'>ERROR: on Load section</span>";
				inspector.show_log_msg(msg);
				if (SHOW_DEBUG===true) console.log(error_data);
			})
			// ALWAYS
			.always(function() {
				//html_page.loading_content( wrapper_obj, 0 );
			})
		)//end promise

		return jsPromise;
	};// end this.load_section_by_ajax



	/**
	* INSERT_HTML
	*//*
	this.insert_html = function(id, html) {
		var ele = document.getElementById(id);
		ele.innerHTML = html;
		var codes = ele.getElementsByTagName("script");
		for(var i=0;i<codes.length;i++) {
			eval(codes[i].text);
		}
	};
	*/



	/**
	* NO USADA TODAVÍA.. EN PRUEBAS
	*/
	/*
	this.reload_component_js_by_ajax_XXXXX = function (target_div, callback) {

		var component_name = $(target_div).data('component_name');
		var js_url = DEDALO_LIB_BASE_URL + '/'+component_name+'/js/'+component_name+'.js';

		// Usage
		$.cachedScript(js_url).done(function(script, textStatus) {
		  if (SHOW_DEBUG===true) console.log( textStatus );
		});

		return false;

		alert('component_name ' +js_url)
		if (SHOW_DEBUG===true) console.log(target_div)
		return false


		$.ajax({
			url: js_url,
			dataType:"script",
			success:function(data){
				$("head").append("<style>" + data + "</style>");
				//loading complete code here
			}
		});
	}
	*/



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

		if (typeof component_obj === undefined || typeof component_obj.dataset == "undefined" ) {
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

			var iframe_obj			= $(iframe_obj);
			//var height_adjustment	= height_adjustment;

			// SI EL PARENT ES UN IFRAME, ADAPTAMOS SU TAMAÑO AL TAMAÑO DEL CONTENIDO
			if( iframe_obj.length > 0 ) {

				var iframe_height	= iframe_obj.height();								//if (SHOW_DEBUG===true) console.log('+ iframe_obj: ' + iframe_obj + ' - iframe_height: ' + iframe_height  );

				// HEIGHT DEL CONTENIDO (iframe body)
				var content_obj			= iframe_obj.contents().find('body');
				var content_obj_height	= content_obj.height();							//if (SHOW_DEBUG===true) console.log('content_obj:' + content_obj + '  - content_obj_height: ' + content_obj_height  );

				// Ajustamos el alto del iframe al alto del contenido
				var height_final	=  parseInt(content_obj_height + height_adjustment);
				iframe_obj.height(height_final);										//if (SHOW_DEBUG===true) console.log('-> Resized parent iframe from ' +content_obj_height + ' to ' + height_final + " - height_adjustment:" +height_adjustment );
			}

		}catch(err){
			if (SHOW_DEBUG===true) console.log('!! resize_parent_iframe: ' + err)
		}
	};



	/**
	* SELECT WRAP
	*/
	this.select_wrap = function(obj_wrap, id_wrapper) {

		if (id_wrapper) {
			obj_wrap = document.getElementById(id_wrapper);
		}

		if (obj_wrap instanceof jQuery ) {
			obj_wrap = obj_wrap[0];	// object jquery case
		}
		

		// IS_SELECTED_COMPONENT. Verify is already selected to avoid double selections
		if( component_common.is_selected_component(obj_wrap) ) {
			return false;
		}

		// RESET_ALL_SELECTED_WRAPS . Reset all previous wrap selections
		this.reset_all_selected_wraps(false);

		// SELECT_COMPONENT . Change current wrap background for hilite
		component_common.select_component(obj_wrap)

		// UPDATE_INSPECTOR_INFO . Update inspector info
		inspector.update_inspector_info(obj_wrap);

		// INSPECTOR TOOLS RESET. Reset tools containes
		this.reset_tools_containers();

		// LOAD_INSPECTOR_TOOLS . Load proper inspector tools
		inspector.load_inspector_tools(obj_wrap);

		// UPDATE_LOCK_COMPONENTS_STATE when is defined in config. Update lock_components state (FOCUS)
		if(typeof lock_components!=='undefined') lock_components.update_lock_components_state( obj_wrap, 'focus' );
	};//end select_wrap



	/**
	* RESET ALL SELECTED WRAPS
	* @param bool exec_update_lock_components_state
	*/
	this.reset_all_selected_wraps = function( exec_update_lock_components_state ) {

		var elements = document.getElementsByClassName("selected_wrap");
			//console.log(elements);
		var len = elements.length
		for (var i = len - 1; i >= 0; i--) {

			var obj_wrap = elements[i];

			//obj_wrap.classList.remove("selected_wrap");
			component_common.unselect_component(obj_wrap)

			// Update lock_components state (BLUR)
			if (exec_update_lock_components_state) {
				if(typeof lock_components!='undefined') lock_components.update_lock_components_state( obj_wrap, 'blur' );
			}
		}
	};//end reset_all_selected_wraps



	/**
	* SELECT_COMPONENT
	* @param DOM object obj_wrap
	*/
	this.select_component = function(obj_wrap) {
		
		if (obj_wrap===null || typeof obj_wrap!=="object") {
			return false;
		}

		// EDIT HIDEN . Show hidden edit elements
		var hidden_elements = obj_wrap.querySelectorAll(".edit_hidden")
			var len = hidden_elements.length;
			for (var i = len - 1; i >= 0; i--) {
				hidden_elements[i].classList.add("edit_show")	
			}

		/* 
			var component_name = obj_wrap.dataset.component_name;
				if (typeof component_name==="undefined") {
					return false;
				}

			if (typeof window[component_name]==="undefined") {
				return false;
			}

			// If specific component method exists, we use it,
			// else we use common method
				
			if(typeof window[component_name]!=="undefined" && typeof window[component_name].select_component==='function') {
				var fn = window[component_name].select_component;
			    	fn(obj_wrap);
			}else{
				obj_wrap.classList.add("selected_wrap");
				//$(obj_wrap).find('select,input').first().focus();
				var component_input = obj_wrap.querySelector("select,input")
				if (component_input!==null) {
					component_input.focus()
				}
			}
			*/

		// Add class to current wrap
		obj_wrap.classList.add("selected_wrap");
		// Focus first input inside wrap
		var component_input = obj_wrap.querySelector("select,input[type=text]")
			if (component_input!==null) {
				component_input.focus()
			}

		return false;
	};//end select_component

	this.unselect_component = function(obj_wrap) {

		//$(obj_wrap).find('*').blur();
		obj_wrap.classList.remove("selected_wrap");	

		// EDIT HIDEN . Hide hidden edit elements
		var hidden_elements = obj_wrap.querySelectorAll(".edit_hidden")
			var len = hidden_elements.length
			for (var i = len - 1; i >= 0; i--) {
				hidden_elements[i].classList.remove("edit_show")
			}	
	};

	this.is_selected_component = function(obj_wrap) {
		if(obj_wrap && obj_wrap.classList.contains('selected_wrap')!==false) {
			return true
		}
		return false
	};



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
	};
	this.unlock_component = function(obj_wrap) {		
		obj_wrap.classList.remove("locked_wrap");
		// Add spinner overlay
		//$(obj_wrap).prepend('<div class="locked_wrap_overlay"><span></span></div>');
	};

	this.change_mode_component = function(component_obj, from_modo, to_modo){
			var wrap_div = find_ancestor(component_obj, 'wrap_component');
			wrapper_id = wrap_div.id;
			wrap_div.dataset.modo = to_modo;
			if(wrap_div.dataset.modo = to_modo){
				wrap_div.dataset.from_modo = from_modo;
				return this.load_component_by_wrapper_id(wrapper_id)
				//component_autocomplete_ts.refresh_component(null);
			}
	}



	/**
	* RESET_TOOLS_CONTAINERS
	*/
	this.reset_tools_containers = function () {
		var elements = document.getElementsByClassName("tools_container_div")
		var len = elements.length
		for (var i = len - 1; i >= 0; i--) {
			elements[i].innerHTML = '';
		}
		var inspector_tools_log = document.getElementById('inspector_tools_log')
		if (inspector_tools_log) {
			inspector_tools_log.innerHTML = '';
		}
		/*
		$('.tools_container_div').html('');
		$('#inspector_tools_log').html('');
		//$('#inspector_indexations').html('');
		//$('#inspector_relation_list_tag').html('');
		*/
	};



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

		var len = ar_tipo.length
		for (var i = 0; i < len; i++) {

			var tipo = ar_tipo[i];
	
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

		var len = ar_tipo.length
		for (var i = 0; i < len; i++) {
				
			var tipo = ar_tipo[i];	
			
			if (SHOW_DEBUG===true) console.log("-> triggered hide_section_group: "+tipo)

			var element = document.getElementById(tipo)				
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
		var prop_len = js_obj.length
		for (var i = prop_len - 1; i >= 0; i--) {
		
			var current_obj = js_obj[i];
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
		};
	};//end parse_propiedades_js



	/**
	* GET_WRAPPER_FROM_ELEMENT
	* Select parent wrapper of requested element inside
	*/
	this.get_wrapper_from_element = function(el, sel) {

		if(typeof sel=='undefined' || !sel) {
			var sel = '.wrap_component';	// Default value
		}
		
		//function findAncestor (el, sel) {
		    while ((el = el.parentElement) && !((el.matches || el.matchesSelector).call(el,sel)));
		    return el;
		//}
	}//end get_wrapper_from_element



	this.get_wrapper_id_from_element = function(el, sel) {

		var wrap_component_obj = component_common.get_wrapper_from_element(el, sel);

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
				alert("Error: more than one wrapper is found with this arguments")								
				break;

			case ar_wrapper.length<1 :
				if(page_globals.modo==='edit') {
					if(SHOW_DEBUG===true) {
						alert("[get_component_wrapper] Error: no wrapper is found with this arguments");
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
		

		var THESAURUS_TIPO = 'dd100'
		var url_vars = {
				t 					: THESAURUS_TIPO,
				menu 				: 'no',
				thesaurus_mode 		: 'relation',
				component_name 		: button_obj.dataset.component_name,
				hierarchy_types 	: button_obj.dataset.hierarchy_types,
				hierarchy_sections 	: button_obj.dataset.hierarchy_sections
			}
			//return 	console.log(url_vars);

		if (typeof button_obj.dataset.parent_area_is_model!=='undefined' && JSON.parse(button_obj.dataset.parent_area_is_model)===true) {
			url_vars.model = 1;
		}	
			
		var url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)

		relwindow = window.open(url ,'listwindow','status=yes,scrollbars=yes,resizable=yes,width=900,height=650');//resizable
		if (relwindow) relwindow.moveTo(-10,1);
		if (window.focus) { relwindow.focus() }
	};//end open_ts_window



	/**
	* test
	* @return dato
	*//*
	this.prototipe.test = function() {
		console.log("ERROR: function 'test' is not defined in component. please don't use component common function directly");
	};//end test
	*/



};// end component_common class