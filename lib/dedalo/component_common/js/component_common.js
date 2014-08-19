// JavaScript Document

$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'edit' :	
				// OBJ SELECTOR
				var wrap_component_obj = $('.wrap_component');									
				// SELECT COMPONENT ON FOCUS WRAP
				/*
				$(document.body).on("focus", wrap_component_obj.selector, function(){													
					// Select current wrap
					component_common.select_wrap(this);
					return false;	
				});
				*/
				// SELECT COMPONENT ON CLICK WRAP
				$(document.body).on("click", wrap_component_obj.selector, function(e){
					//console.log(e)	
					//e.preventDefault();
   					e.stopPropagation();	// Prevents the event from bubbling up the DOM tree, preventing any parent handlers from being notified of the event.

					// Select current wrap
					component_common.select_wrap(this);
				});
				// BODY CLICK RESET ALL SELECTED WRAPS
				$(document.body).click(function(e) {
					e.stopPropagation();
					component_common.reset_all_selected_wraps();				   
				});			
				break;						
	}

});




/**
* COMPONENT COMMON CLASS
*/
var component_common = new function() {


	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_common/trigger.component_common.php' ;

	
	/**
	* SAVE
	* @param component_obj (DOM obj)
	* @param save_arguments (Array)
	*/
	this.Save = function (component_obj, save_arguments) {	
		
		//if (DEBUG) console.log(component_obj);	
			
		// Component vars
		var name			= $(component_obj).attr('name'),
			id				= $(component_obj).data('id_matrix'),
			tipo			= $(component_obj).data('tipo'),
			parent			= $(component_obj).data('parent'),
			lang			= $(component_obj).data('lang'),
			modo			= $(component_obj).data('modo'),
			flag			= $(component_obj).data('flag'),
			caller_tipo		= $(component_obj).data('caller_tipo'),
			wrap_div 		= $(component_obj).parents('.wrap_component:first'),
			label			= $(wrap_div).find('.css_label:first').text(),
			component_name 	= $(wrap_div).data('component_name');
		
		// LOGIN : Login window don't save nothing
		if (modo=='login') return false;


		// DATO : Si se le pasa una variable save_arguments con el key 'dato', sobreescribe el dato por defecto
		if( save_arguments && typeof save_arguments['dato'] !== 'undefined' ) {
			var dato 	= save_arguments['dato'];		
		}else{
			var dato	= this.common_get_dato(component_obj);		//alert("Saving dato:" + dato)	//component_obj.value ;  //return alert("id:" + id + " - tipo: " + tipo  + " - dato:" + dato );	
		}
		//return console.log(dato)				
		
		// Page var globals verify
		if (typeof parent=="undefined") return alert("Save Error: parent undefined! (Nothing is saved!)");
		if (typeof lang=="undefined") 	return alert("Save Error: lang undefined! (Nothing is saved!)");
			
		var debug_div	= $("#inspector_debug"),
			target_div	= $('#inspector_log');
		
		// Target div verify
		if( $(target_div).length != 1 ) return alert("Error: target_div not defined!");
	  				
		var mode 		= 'Save';
		var mydata		= { 'mode': mode, 'id': id, 'parent': parent, 'dato': dato, 'name': name, 'tipo': tipo, 'lang': lang, 'flag': flag, 'caller_tipo': caller_tipo };
			//console.log(mydata)
		

		html_page.loading_content( wrap_div, 1 );
			
		// AJAX REQUEST
		$.ajax({
			url		: component_common.url_trigger ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// DEBUG CONSOLE Console log
			if (DEBUG) console.log("->Save response: "+received_data + " for id: " + id + " label:"+label );					

			// ID MATRIX : SET ID Si el objeto se creó con id=NULL , se le asigna el id devuelto
			// Response new 'id_matrix' expected
			if ($.isNumeric(received_data) && received_data>0) {
				
				$(component_obj).data('id_matrix',received_data);			
					// data asigna el valor, pero no lo actualiza en DOM... usamos attr data-id_matrix para asegurarnos que cambia		
					$(component_obj).attr('data-id_matrix',received_data);
				
				$(component_obj).parents('.wrap_component').first().data('id_matrix',received_data);
					// data asigna el valor, pero no lo actualiza en DOM... usamos attr data-id_matrix para asegurarnos que cambia
					$(component_obj).parents('.wrap_component').first().attr('data-id_matrix',received_data);			

					if (DEBUG) console.log("->Save Set id_matrix on component and wrap id_matrix on save, id_matrix: " + received_data);
			}					
			
			// INSPECTOR LOG INFO			
			if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1) {
				var msg = "<span class='error'>Failed Save!<br>" +received_data+ " for " + label + "</span>";
			}else{
				var msg = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
			}
			inspector.show_log_msg(msg);

			// INSPECTOR DEBUG INFO
			// if (DEBUG) console.log($(debug_div))
			if($(debug_div).length>0) {

				var received_id_matrix = received_data;
				if(received_id_matrix.length > 12) received_id_matrix = 'no available';

				debug_div.html  ( "" );
				debug_div.append( "<div class=\"key\">saved</div><div class=\"value\">" + label + "</div><br>\n");					
				debug_div.append( "<div class=\"key\">id_matrix</div><div class=\"value\">" + received_id_matrix + "</div><br>\n");
				debug_div.append( "<div class=\"key\">tipo</div><div class=\"value\">" + tipo + "</div><br>\n");
				debug_div.append( "<div class=\"key\">chars</div><div class=\"value\">" + received_data.length + "</div><br>\n");
				debug_div.append( "<div class=\"key\">dato</div><div class=\"value\">" + received_data.replace(/<br ?\/?>/g, " ") + "</div><br>\n");							
			}		

			// Fix changed content for time machine close dialog function
			changed_original_content = 1;

			// FILTER MASTER / SECURITY ACCESS : Refresh info of related components. Only in section 'Usuarios'
			// if (DEBUG) console.log("cancel_update_components "+cancel_update_components)
			try {
				if( typeof save_arguments != 'undefined' && save_arguments['update_filter_master']==true && $('.css_wrap_filter_master').length > 0) {
					var wrapper_id = $('.css_wrap_filter_master:first').attr('id');
					// Reload component (update showed data)
					component_common.load_component_by_wrapper_id(wrapper_id);					
				}
				if( typeof save_arguments != 'undefined' && save_arguments['update_security_access']==true && $('.css_wrap_security_access').length > 0) {
					var wrapper_id = $('.css_wrap_security_access:first').attr('id');
					// Reload component (update showed data)
					component_common.load_component_by_wrapper_id(wrapper_id);						
				}
			}catch(error){
				if (DEBUG) console.log(error);
			}									
			
			// HIDE REFERENCE DATO DEFAULT LANG
			$(wrap_div).find('.dato_refecence_default_lang:first').hide(300);

			// RELOAD INSPECTOR TOOLS
			if (id<1)
			inspector.load_inspector_tools(wrap_div);

			// Callback
			if(typeof save_arguments['callback'] === "function" ) {
				save_arguments['callback'](received_data);
			}
			
			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on Save data id:" + id + "<br>Data is NOT saved!</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALLWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})
	}




	// GET DATO FORMATED
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
						var ar_childrens = $(obj).contents().filter('li');			//if (DEBUG) console.log( ar_childrens );					
						
						var len			= ar_childrens.length;
						var ar_values	= Array();

						if(ar_childrens && len >0) for(var i=0; i<len ; i++) {		
							
							// (SELECT BY NAME[value=i] IS IMPORTANT)
							var current_obj = ar_childrens[i];						//if (DEBUG) console.log( $(current_obj))
							var value		= $(current_obj).data('value');
							if( value ) ar_values.push(  value );					//if (DEBUG) console.log(value)	
						}					
						dato = ar_values;											//if (DEBUG) console.log(ar_values)					
						break;
				
			default :	dato = $(obj).val();
						break;
		}
		//if (DEBUG) console.log('-> common_get_dato: '+dato)	
		return dato;
	}


	// SELECT NEXT COMPONENT
	this.select_next_component = function (current_ob) {
		
		// Blur current input
		//$(current_ob).blur();	
		
		// Focus next input
		var next_input_obj	= $(current_ob).parent().nextAll(":first").find(":input");		if(next_input_obj == null) return null;	  //if (DEBUG) console.log(next_input_obj)
		$(next_input_obj).focus();
		
		// Unselect previous wrap
		//var next_wrap_obj	= $(current_ob).parent('.wrap_component:first');
		//$(current_ob).removeClass('selected_wrap');
		
		// Reset all wrap selections
		$('.wrap_component').each(function() {
			$(this).removeClass('selected_wrap');
		});	
		
		// Select next wrap
		var next_wrap_obj	= $(next_input_obj).parent('.wrap_component');
		component_common.select_wrap(next_wrap_obj);		
	}

	// RADIO BUTTON REBUILD CHECKS
	this.radio_button_rebuild_checks = function (ar_values, target_obj) {
		
		// Recorremos todos los elementos del radio button			
		var len		= target_obj.length;		
		if(target_obj && len >0) for(var i=0; i<len ; i++) {		
			
			//var target_checked	= $(target_obj[i]).is(':checked');
			var target_value	= $(target_obj[i]).val();
			
			// Reset checked state to false first
			$(target_obj[i]).prop('checked',false);		
			
			var is_in_array = inArray( target_value, ar_values );		//if (DEBUG) console.log('- is_in_array ' +is_in_array);
			
			if( is_in_array != -1 ) {
				
				$(target_obj[i]).prop('checked',true);					//if (DEBUG) console.log(' - checked :' +target_value);
			
			}else{
																		//if (DEBUG) console.log(' - unchecked :' +target_value);
			}		
		}	
	}

	// CHECK BOX REBUILD CHECKS
	this.check_box_rebuild_checks = function (ar_values, target_obj) {		
		return this.radio_button_rebuild_checks(ar_values, target_obj);		
	}

	// UPDATE_COMPONENT_BY_PARENT_TIPO_LANG	
	// En casos en los que no existe un id_matrix en el componente (por ejemplo el registro no existe en el idioma actual)
	// seleccionamos en el DOM por el resto de información (parent,tipo,lang)
	this.update_component_by_parent_tipo_lang = function (parent,tipo,lang) {
		// Locate component wrap on page
		var component_wrap = $('.wrap_component[data-parent='+parent+'][data-tipo='+tipo+'][data-lang='+lang+']');

		// Verify component is located
		if (component_wrap.length<1) {
			if(DEBUG) console.log("Error: Component not found: parent:"+parent+" tipo:"+tipo+" lang:"+lang)
			return alert("Error on update_component_by_parent_tipo_lang: Component not found.");
		}

		var wrapper_id 	= component_wrap.attr('id'),
			arguments 	= null,
			callback 	= null;

		return this.load_component_by_wrapper_id(wrapper_id, arguments, callback);
	}
	
	// UPDATE_COMPONENT_BY_AJAX	
	this.update_component_by_ajax = function (id_matrix, callback) {

		// Locate component wrap on page
		var component_wrap = $('.wrap_component[data-id_matrix='+id_matrix+']');	//if (DEBUG) console.log(component_wrap)

		// Verify component is located
		if (component_wrap.length<1) { return alert("Error on update_component_by_ajax: Component id:"+id_matrix+" not found.") };

		var wrapper_id 	= component_wrap.attr('id');
		var arguments 	= null;
		//var callback 	= null;
		
		return this.load_component_by_wrapper_id(wrapper_id, arguments, callback);			
	}


	/**
	* LOAD_COMPONENT_BY_WRAPPER_ID
	*/
	this.load_component_by_wrapper_id = function (wrapper_id, arguments, callback) {

		var wrapper_obj	= $('#'+wrapper_id);	

		// wrapper_obj verify
		if($(wrapper_obj).length<1) return alert("load_component_by_wrapper_id Error: \nDebug:\n  wrapper_id not found! : " +wrapper_id);

		// Wrap data modo test
		if (!$(wrapper_obj).data('modo')) return alert("Error/Warning: wrapper_obj has no data modo");

		// VARS ON WRAPPER
		var id			= $(wrapper_obj).data('id_matrix'), // Optional
			tipo		= $(wrapper_obj).data('tipo'),		// Required
			modo		= $(wrapper_obj).data('modo'),
			parent		= $(wrapper_obj).data('parent'),
			lang		= $(wrapper_obj).data('lang'),
			caller_id	= $(wrapper_obj).data('caller_id'),
			context		= $(wrapper_obj).data('context');

		// CURRENT_TIPO_SECTION : Usado al actualizar relation list
		var current_tipo_section = $(wrapper_obj).data('current_tipo_section');	// Usado al actualizar relation list
			//return console.log(current_tipo_section)

		var mode 		= 'load_component_by_ajax';
		var mydata		= { 'mode': mode, 'id': id, 'tipo': tipo, 'modo': modo, 'parent': parent, 'lang': lang, 'caller_id': caller_id, 'context':context, 'current_tipo_section': current_tipo_section };	//if (DEBUG) console.log(mydata);

		var target 		=  $(wrapper_obj).find('.content_data').first();
			if(!$(target).length) return alert("load_component_by_wrapper_id Error: (content_data not found inside!) : " +wrapper_id);
		
		//html_page.loading_content( wrapper_obj, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			//console.log( $(received_data).html() )

	        //var section_content = $(received_data).find('.css_section_content:first>*').html();	
			$(target).html( 
				$(received_data).find('.content_data:first>*') 
				);

			//
			// RELOAD JS COMPONENT SCRIPT
			// To reload DOM event handlers to current component
			//
			// Data defined in component wrap like 'data-component_name=\"{$component_name}\"'
			var component_name 	= $(wrapper_obj).data('component_name');
			// Apply only to certain components
			if (typeof component_name != "undefined") {
				
				if(component_name=='component_text_area') {
							
					// BTN_RELATE_FRAGMENT : BTN RELATION CURRENT TAG SHOW
					// Context
					var url_caller_id = get_current_url_vars()['caller_id'];	 //alert("url_caller_id: "+url_caller_id);
					//alert(typeof url_caller_id)
					if (typeof url_caller_id != "undefined") {
						$(function() {
						  // Handler for .ready() called.
						  $('.btn_relate_fragment').css('display','inline-block'); 	//alert("btn_relate_fragment: "+ $('.btn_relate_fragment').length);
						});
					};
					
				}
				
				// UPDATE GERERAL TAP STATE
				// Needed for portal component updates
				html_page.taps_state_update();
				
			}else{
				if (DEBUG) console.log( "->load_component_by_wrapper_id: ALERT: component_name is undefined" )
			}

			if (DEBUG) {
				//console.log( "->load_component_by_wrapper_id: loaded wrapper: " + wrapper_id + " tipo:"+tipo+ " modo:"+modo +" response:" +xhr.statusText +" data:")
				//console.log(mydata)
			}		

			// Callback optional
			if (callback && typeof(callback) === "function") {  
		        callback($(target));
		    }

		    // Focus loaded component
		    if (top.changed_original_content == 1) {						
				component_common.select_wrap(wrapper_obj);
			}

			// Return updated component data
			//return $(target) //console.log($(target));		
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on Load component</span>";
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALLWAYS
		.always(function() {
			//html_page.loading_content( wrapper_obj, 0 );
		});

	}// end this.load_component_by_wrapper_id


	/**
	* LOAD_SECTION_BY_AJAX
	*/
	this.load_section_by_ajax = function (wrapper_id, callback) {

		// Locate component wrap on page
		//var section_wrapper = $('.wrap_component[data-id_matrix='+id_matrix+']');	//if (DEBUG) console.log(section_wrapper)
		var wrapper_obj = $('#'+wrapper_id);

		// Verify component is located
		if (wrapper_obj.length!=1) { return alert("Error on load_section_by_ajax: Component wrapper_id:"+wrapper_id+" not found.") };

		// vars
		var vars = new Object();
			vars.section_id			= $(wrapper_obj).data('id_matrix'),
			vars.section_tipo 		= $(wrapper_obj).data('tipo'),
			vars.section_modo 		= $(wrapper_obj).data('modo'),
			vars.section_context	= $(wrapper_obj).data('context');
		// Verify vars values
		if(!test_object_vars(vars,'remove_resource_from_portal')) return false;
			//return console.log(vars)

		// target div
		var target 		=  $(wrapper_obj).find('.css_section_content').first();
			if($(target).length!=1) return alert("load_section_by_ajax Error: (css_section_content not found inside!) : " +wrapper_id);


		var mode 		= 'load_section_by_ajax';
		var mydata		= { 'mode':mode, 'id':vars.section_id, 'tipo':vars.section_tipo, 'modo':vars.section_modo, 'context':vars.section_context };	//if (DEBUG) console.log(mydata);

		//html_page.loading_content( wrapper_obj, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

	        //var section_content = $(received_data).find('.css_section_content:first>*').html();
			$(target).html( $(received_data).find('.css_section_content:first>*') );
			

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
			if (DEBUG) console.log(error_data);	
		})
		// ALLWAYS
		.always(function() {
			//html_page.loading_content( wrapper_obj, 0 );
		});
		
	}// end this.load_section_by_ajax


	


	/**
	* NO USADA TODAVÍA.. EN PRUEBAS
	*/
	this.reload_component_js_by_ajax_XXXXX = function (target_div, callback) {
			
		var component_name = $(target_div).data('component_name');
		var js_url = DEDALO_LIB_BASE_URL + '/'+component_name+'/js/'+component_name+'.js';

		// Usage
		$.cachedScript(js_url).done(function(script, textStatus) {
		  if (DEBUG) console.log( textStatus );
		});

		return false;

		alert('component_name ' +js_url)
		if (DEBUG) console.log(target_div)
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

	/**
	* PROPAGATE CHANGES TO SPAN DATO
	*/
	this.propagate_changes_to_span_dato = function (component_obj) {
		
		// On save, update possible dato in list (in portal x example)
		// data-tipo=\"{$tipo}\" data-id_matrix=\"{$id}\" data-parent=\"{$parent}\" data-lang=\"{$lang}\" [data-id_matrix='+$(component_obj).data('id_matrix')+']
		var matches = $('.css_span_dato[data-tipo='+$(component_obj).data('tipo')+'][data-parent='+$(component_obj).data('parent')+'][data-lang='+$(component_obj).data('lang')+']');
		if (matches.length>0) {
			jQuery.each(matches, function() {
		      $(this).html( $(component_obj).val() );
		      if (DEBUG) console.log("->propagate_changes_to_span_dato: n matches: "+ matches.length )
		   });
		};
	}


	// RESIZE IFRAME
	this.resize_iframe = function (iframe_obj, height_adjustment) {

		try {		
			// Iframe container		
			//var iframe_id		= 'security_access_iframe' ;							//alert(iframe_id)
			//var iframe_obj		= parent.$('#'+iframe_id);							if (DEBUG) console.log(iframe_obj);	//parent.$('.iframe_video');
			//var iframe_obj		= $('#'+iframe_id);										//if (DEBUG) console.log(iframe_obj);	//parent.$('.iframe_video');

			var iframe_obj			= $(iframe_obj);
			//var height_adjustment	= height_adjustment;

			// SI EL PARENT ES UN IFRAME, ADAPTAMOS SU TAMAÑO AL TAMAÑO DEL CONTENIDO		
			if( $(iframe_obj).length > 0 ) {
			
				var iframe_height	= iframe_obj.height();								//if (DEBUG) console.log('+ iframe_obj: ' + iframe_obj + ' - iframe_height: ' + iframe_height  );					
				
				// HEIGHT DEL CONTENIDO (iframe body)
				var content_obj			= iframe_obj.contents().find('body');
				var content_obj_height	= content_obj.height();							//if (DEBUG) console.log('content_obj:' + content_obj + '  - content_obj_height: ' + content_obj_height  );					
				
				// Ajustamos el alto del iframe al alto del contenido
				var height_final	=  parseInt(content_obj_height + height_adjustment);
				iframe_obj.height(height_final);										//if (DEBUG) console.log('-> Resized parent iframe from ' +content_obj_height + ' to ' + height_final + " - height_adjustment:" +height_adjustment );
			}		
			
		}catch(err){
			if (DEBUG) console.log('!! resize_parent_iframe: ' + err)
		}
	}


	/**
	* SELECT WRAP
	*/
	this.select_wrap = function (obj_warp) {
		
		// Verificamos si ya está seleccionado para evitar dobles acciones
		//if( $(obj_warp).hasClass('selected_wrap') != false  ) return false;	

		/*
		// Si ya está seleccionado, lo de-seleccionamos al volver a pinchar sobre el y vaciamos la info del inspector
		if( $(obj_warp).hasClass('selected_wrap') != false  ) {
			reset_all_selected_wraps();
			$('#inspector_tools').empty();
			return;
		}	
		*/
		
		// Reset all previous wrap selections
		this.reset_all_selected_wraps();

		//var current_obj_warp = $(obj_warp).first();	console.log(current_obj_warp);
		
		// Change current wrap background for hilite
		$(obj_warp).first().addClass('selected_wrap');
			
		// Update inspector info
		inspector.update_inspector_info(obj_warp);
		
		// Reset tools containes
		this.reset_tools_containers();
		
		// Load inspector tools
		inspector.load_inspector_tools(obj_warp);
		
		/* OLD MODE
		var label				= $(obj).find('label:first').text();		if (DEBUG) console.log(label);
		var mod_date			= $(obj).data('mod_date');
		var mod_by_user_name	= $(obj).data('mod_by_user_name');		
		$('.inspector_info').html('Selected: '+label+ '<br> Modified: ' +mod_date+ '<br> by user: '+mod_by_user_name);
		*/
	}
	/**
	* RESET ALL SELECTED WRAPS
	*/
	this.reset_all_selected_wraps = function () {
		$('.wrap_component').each(function() {
			$(this).removeClass('selected_wrap');
		});
	}
	this.reset_tools_containers = function () {
		$('.tools_container_div').html('');
		$('#inspector_tools_log').html('');		
		//$('#inspector_indexations').html('');
		//$('#inspector_relation_list_tag').html('');	
	}


	// SHOW
	this.show = function(ar_tipo, parent) {
		
		if( typeof ar_tipo != 'object' ) {
			return console.log("->show: Error on parse ar_tipo. Current element is not an valid array object")
		}

		for (var i=0; i<ar_tipo.length; i++) {

			var tipo = ar_tipo[i];
			var ar_vars = tipo;
			if(parent) ar_vars += '_'+ parent;
			
			if(DEBUG) console.log("-> triggered show: "+ar_vars)
			var selector = $( "div[id*='"+ar_vars+"']" )
			selector.slideDown(250);
		}
	}
	// HIDE
	this.hide = function(ar_tipo, parent) {

		if( typeof ar_tipo != 'object' ) {
			return console.log("->hide: Error on parse ar_tipo. Current element is not an valid array object")
		}

		for (var i=0; i<ar_tipo.length; i++) {

			var tipo = ar_tipo[i];
			var ar_vars = tipo;
			if(parent) ar_vars += '_'+ parent;
			
			if(DEBUG) console.log("-> triggered show: "+ar_vars)
			var selector = $( "div[id*='"+ar_vars+"']" )
			selector.slideUp(250);
		}
	}	
	
	/*
	array('js' => array(	
					array('trigger'	=> array(
											"1" => array('component_common.show('dd658')'),
											"3" => array('component_common.hide('dd658')')
											),
				),
		));
	*/
	// PARSE_PROPIEDADES_JS
	this.parse_propiedades_js = function(js_obj, wrapper_id) {
		
		//console.log(js_obj)

		// OBJ : test valid obj
		if( typeof js_obj != 'object' ) {
			return console.log("->parse_propiedades_js: Error on parse js_obj. Current element is not an valid object")
		}
		// WRAPPER_ID : test valid wrapper_id
		if( typeof wrapper_id == 'undefined' ) {
			return console.log("->parse_propiedades_js: Error on parse. Current wrapper_id is undefined")
		}

		
		// JS OBJECT : Recorremos los elementos del array 'js'
		for (var i=0; i<js_obj.length; i++) {
			
			var current_obj = js_obj[i];
				//console.log(current_obj)

			// Recorremos los elementos del objeto actual (dentro de 'js')
			for (var key in current_obj) {
				//console.log(key);

			  	// TRIGGER : key trigger
			  	if(key=='trigger') {

			  		// VARS : Extract vars
			  		var wrapper_obj 	= document.getElementById(wrapper_id);
			  		if( $(wrapper_obj).length!=1 ) return alert('invalid wrapper: '+wrapper_id)

			  		var	initial_value 	= wrapper_obj.dataset.dato,		//$('#'+wrapper_id).data('dato'),
			  			parent 			= wrapper_obj.dataset.parent, 	//$('#'+wrapper_id).data('parent')
			  			ar_test_values	= Object.keys(current_obj.trigger)
			  				//console.log(parent)

			  		
			  		// TRIGGER FUNCTIONS SCRIPT
					var trigger_functions = function(current_value) {
						
						// TEST VALUES : Iterate array of test values
						for (var i=0; i<ar_test_values.length; i++) {

							var current_test_value = ar_test_values[i];
								//console.log(current_test_value)

							if(current_test_value==current_value) {
								
								// ACTIONS : functions to exec
								var ar_actions = current_obj.trigger[current_test_value];
									//console.log(ar_actions)

								// ACTIONS EXEC : 
								for (var i=0; i < ar_actions.length; i++) {
									//console.log(ar_actions[i])

									// CURRENT ACTION : Resolve parent ($parent)
									var current_action = ar_actions[i]
									
									// PARENT : Add parent var as function argument
									current_action = replaceAll('\\)', ','+parent+'\)', current_action);
										//console.log(current_action)									

									// EXEC FUNCTION
									eval(current_action);

								}//end for actions exec (var i=0; i < ar_actions.length; i++) {

							}//end if(current_test_value==current_dato) {

						}//end test values for (var i=0; i<ar_test_values.length; i++) {

					}//end var trigger_functions


			  		// READY :
			  		$(document).ready(function() {
			  		//document.addEventListener('DOMContentLoaded',function(){	
						// DATO : current dato
						var current_dato = initial_value;
							//console.log('current_dato: '+current_dato+' - '+wrapper_id)

						// EXEC FUNCTIONS
						trigger_functions(current_dato)
					});
					
					// CHANGE : //wrapper_obj.onchange = function(event) {
					wrapper_obj.addEventListener('change',function(event){
						// DATO : New dato
						var new_dato = event.target.value;
							//console.log('new_dato '+new_dato)

						// EXEC FUNCTIONS
						trigger_functions(new_dato)
					});//end wrapper.onchange



				}//end if(key=='trigger') 

			}//end for (var key in current_obj) {
			

		};
	}

};// end component_common class





