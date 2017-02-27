

var changed_original_content = 0;	// Default 0. When fire 'set_tm_history_value_to_tm_preview' is set to 1


// TOOL LANG CLASS
var tool_lang = new function() {

	// LOCAL VARS
	this.trigger_tool_lang_url = DEDALO_LIB_BASE_URL + '/tools/tool_lang/trigger.tool_lang.php' ;
	this.last_target_lang;
	
	// GLOBAL PARAGRAPH INITIAL VALUES
	var paragraphsLeftNumber	= null;
	var paragraphsRightNumber	= null;


	window.addEventListener("resize", function (event) {
		tool_lang.fix_height_of_texteditor();		
	});

	window.addEventListener("load", function (event) {
		switch(page_globals.modo){		
			case 'tool_lang':
				// Update page paragraphs counters
				setTimeout(function(){
					tool_lang.writeLeftParagraphsNumber();
					tool_lang.writeRightParagraphsNumber();
				}, 1000)
				tool_lang.fix_height_of_texteditor()
				break;
		}
	});


	$(function() {			
		switch(page_globals.modo){
			case 'edit':
					/*
					// OBJ SELECTOR BUTTON OPEN DIALOG WINDOW
					var button_lang_open = $('.tool_lang_icon');
						
						// LIVE EVENT CLICK TO BUTTON (ICON) LOAD TOOL
						$(document.body).on("click", button_lang_open.selector, function(){
							
							// LOAD TOOL (OPEN DIALOG WINDOW)
							tool_lang.load_tool_lang(this,true);
						});
					*/
					break;

			case 'tool_lang':
					
					// Set selector selected option (stored as cookie) and load target selected lang
					var last_target_lang = get_localStorage('last_target_lang');
					if (typeof last_target_lang !== 'undefined') {
						// Set selector as stored lang
						var selector_obj = document.getElementsByClassName('tool_lang_selector_target')[0]; //$('.tool_lang_selector_target').first();
						selector_obj.value = last_target_lang;
							//console.log(last_target_lang)
						tool_lang.load_target_component(selector_obj)
					};
					break;			
		}
	});//end $(function()



	/**
	* LOAD SOURCE LANG (LEFT)
	* Load component source on the left side
	*/
	this.load_source_component = function ( selector_obj ) {
		
		if( selector_obj.value.length === 0) return null;

		var tipo 	= $(selector_obj).data('tipo'),
			parent 	= $(selector_obj).data('parent'),
			lang 	= selector_obj.value;

		if (DEBUG) console.log("->load_source_lang - lang:"+lang+" tipo:"+tipo+" parent:"+parent);

		var wrap_div = $('#wrap_tool_lang_component_source');

		html_page.loading_content( wrap_div, 1 );
		
		var mode 		= 'load_source_component';
		var mydata		= {
						'mode': mode,
						'tipo': tipo,
						'parent': parent,
						'lang': lang,
						'top_tipo': page_globals.top_tipo,
						'section_tipo': page_globals.section_tipo,
						};	//return console.log(mydata)

		// AJAX REQUEST
		$.ajax({
			url			: this.trigger_tool_lang_url,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {
			$(wrap_div).html(received_data);
			tool_lang.fix_height_of_texteditor()
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on load_source_component !</span> ");
		})
		// ALWAYS
		.always(function() {			
			html_page.loading_content( wrap_div, 0 );
		});
	}//end load_source_component



	/**
	* LOAD TARGET LANG (LEFT)
	* Load component target on the right side
	*/
	this.load_target_component = function ( selector_obj ) {
	
		if( !selector_obj.value ) {
			return null;
		}
		
		var tipo 		 = selector_obj.dataset.tipo
		var parent 		 = selector_obj.dataset.parent
		var	section_tipo = selector_obj.dataset.section_tipo
		var	tool_name 	 = selector_obj.dataset.tool_name
		var	tool_locator = selector_obj.dataset.tool_locator
		var	lang 		 = selector_obj.value


		//if (DEBUG) console.log("->load_target_lang :lang"+lang+" tipo:"+tipo+" parent:"+parent);

		var wrap_div	= $('#wrap_tool_lang_component_target');

		html_page.loading_content( wrap_div, 1 );
			
		var mode 		= 'load_target_component';
		var mydata		= {
							'mode': mode,
							'tipo': tipo,
							'parent': parent,
							'section_tipo': section_tipo,
							'lang': lang,
							'tool_name' : tool_name,
							'tool_locator' : tool_locator,
							'top_tipo': page_globals.top_tipo							
						}
						//return console.log(mydata);

		// AJAX REQUEST
		$.ajax({
			url			: this.trigger_tool_lang_url,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			$(wrap_div).html(received_data)

			// Update tol_lang header
			tool_lang.update_tool_header(tipo, parent, section_tipo, lang, tool_name, tool_locator);

			// Store last_target_lang
			set_localStorage('last_target_lang',lang)

			tool_lang.fix_height_of_texteditor()
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			inspector.show_log_msg(" <span class='error'>ERROR: on load_target_component !</span> ");
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		});
	}//end load_target_component



	/**
	* UPDATE_TOOL_HEADER . Update header state (component_state)
	* vars: caller_component_tipo, caller_element
	*/
	this.update_tool_header = function(tipo, parent, section_tipo, lang, tool_name, tool_locator) {

		//if(DEBUG) console.log('->update_tool_header:' + caller_component_tipo + ' '+caller_element)

		var wrap_div	= $('.header_tool');

		html_page.loading_content( wrap_div, 1 );
			
		var mode 		= 'update_tool_header';
		var mydata		= {
							'mode': mode,
							'tipo': tipo,
							'parent': parent,
							'section_tipo': section_tipo,
							'lang': lang,
							'tool_name': tool_name,
							'tool_locator': tool_locator,
							'top_tipo': page_globals.top_tipo							
						}
						//return 	console.log(mydata);

		// AJAX REQUEST
		$.ajax({
			url			: this.trigger_tool_lang_url,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {
			$(wrap_div).html(received_data);

			// Cargamos component_state js y css si no están ya cargados
			var filename = DEDALO_LIB_BASE_URL + "/component_state/js/component_state.js";
			//common.checkloadjscssfile(filename, 'js');
			// JS . El js lo cargaremos de nuevo en cada llamada para que actualice el handler del checkbox
			jQuery.cachedScript(filename);		
			// CSS . Verificamos si está cargado el css. Si no lo está, forzamos su carga
			/*
			filename = DEDALO_LIB_BASE_URL + "/component_state/css/component_state.css";
			common.checkloadjscssfile(filename, 'css');
			*/		
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			inspector.show_log_msg(" <span class='error'>ERROR: on update_tool_header !</span> ");
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		});
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
		text_editor.init(id, 'text_editor_hideAll.css');

		// select all
		tinymce.activeEditor.selection.select(tinymce.activeEditor.getBody(), true);		
	};//end select_source_text



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
	};//end toggleEditor



	/**
	* RELOAD SOURCE COMPONENT
	*/
	this.reload_source_component = function() {

		var id = $('#wrap_tool_lang_component_source').find('.css_text_area:input').first().attr('id'); 
		
		// unload editor
		this.toggleEditor(id);				
		
		// load editor
		text_editor.init(id);		
	}



	/**
	* AUTOMATIC_TRANSLATION . TRADUCCION AUTOMATICA
	*/
	this.automatic_translation = function(button_obj) {
		//alert("traduccion_automatica")

		//var wrap_tool_lang_source = $('#wrap_tool_lang_component_source').find('.wrap_component').first();
		//var wrap_tool_lang_target = $('#wrap_tool_lang_component_target').find('.wrap_component').first();

		var wrap_tool_lang_component_source = document.getElementById('wrap_tool_lang_component_source'),
			wrap_tool_lang_source 			= wrap_tool_lang_component_source.querySelector(".wrap_component")

		var wrap_tool_lang_component_target = document.getElementById('wrap_tool_lang_component_target'),
			wrap_tool_lang_target 			= wrap_tool_lang_component_target.querySelector(".wrap_component")


			if( !wrap_tool_lang_target ) {
				//$('.tool_lang_selector_target').focus();
				document.querySelector(".tool_lang_selector_target").focus();
					//console.log( get_label.seleccione_un_idioma_de_destino  );
				return alert( get_label.seleccione_un_idioma_de_destino );
			}
		

		// Source lang
		var source_lang = wrap_tool_lang_source.dataset.lang;	//return alert(source_lang)
			if (source_lang.length<5)
				return alert("Error: target lang is not valid: "+target_lang);

		// Target lang
		var target_lang = wrap_tool_lang_target.dataset.lang;	//return alert(target_lang)
			if (target_lang.length<5)
				return alert("Error: target lang is not valid: "+target_lang);
		
		// Tipo
		var tipo = wrap_tool_lang_target.dataset.tipo
			if (tipo.length<3)
				return alert("Error: tipo is not valid: "+tipo);

		
		// Parent
		var parent = wrap_tool_lang_target.dataset.parent ;
			if ( typeof parent === 'undefined' || !parent || parent.length<1 ) {
				console.log(parent);
				return alert("Error: parent is not valid: "+parent);
			}
			
		// Select and verify target text
		try {
			var target_text	= wrap_tool_lang_target.querySelector("textarea").value;	//$(wrap_tool_lang_target).find('input,textarea').first().val();
			if( target_text.length > 2 ) {	// avoid overwrite yet translated text				
				// Confirm action
				if( !confirm( get_label.esta_seguro_de_sobreescribir_el_texto ) )  return false;
			}
		}catch(error){
			if (DEBUG) console.log(error)
		}									
		
		//return alert('target_text '+ target_text  + " " + target_text.length); 

		var wrap_div = wrap_tool_lang_target;

		html_page.loading_content( wrap_div, 1 );

		//return 	console.log(wrap_tool_lang_target.id);			
		
		try{
			var mydata  = {
						'mode' 		  : "automatic_translation",
						'source_lang' : source_lang,
						'target_lang' : target_lang,
						'tipo'		  : tipo,
						'parent'	  : parseInt(parent),
						'top_tipo'	  : page_globals.top_tipo,
						'section_tipo': page_globals.section_tipo
					};
					//return 	console.log(mydata);	
			
			// AJAX REQUEST
			$.ajax({
				url			: this.trigger_tool_lang_url,
				data		: mydata,
				type		: "POST"
			})
			// ALWAYS
			.always(function() {
				html_page.loading_content( wrap_div, 0 );
			})
			// DONE
			.done(function(data_response) {
				if (DEBUG) 	console.log(data_response);				
	
				// If data_response contain 'error' show alert error with (data_response) else ...
				if(/error/i.test(data_response)) {
					// error ocurred
					var msg = "<span class='warning'>Warning on automatic translation: \n" + data_response +"</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )

				}else{
										
					// Verificamos que el dato recibido (data_response) corresponde a un número y no a un mensaje aleatorio
					var regex = new RegExp('^[0-9]+$');
						if( regex.test(data_response.trim())!==true ) {
							//console.log(data_response);
							return alert("Warning: translation was done but an unexpected message was received: "+data_response)
						}
						//console.log(data_response);
					
					// all is ok (id matrix is received -new or existent-)
					var wrapper_id = wrap_tool_lang_target.id;	// $(wrap_tool_lang_target).attr('id');					
						//console.log(wrapper_id);

					// Exec load_component_by_wrapper_id as promise
					var jsPromise_lang = component_common.load_component_by_wrapper_id( wrapper_id, null, tool_lang.writeRightParagraphsNumber );					
						jsPromise_lang.then(function(response) {

							tool_lang.fix_height_of_texteditor()

						}, function(xhrObj) {
							console.log(xhrObj);
						});
					
					//var msg = "<span class='ok'>Automatic translation: " + data_response + "</span>";
					//inspector.show_log_msg(msg);
					top.changed_original_content=1;			 										
				}							
								
			})
			// FAIL ERROR 
			.fail(function(error_data) {					
				inspector.show_log_msg("<span class='error'>ERROR: on automatic_translation !</span>");
			})
			

		}catch(err){ 
			if (DEBUG) console.log("!! AUTOMATIC_TRANSLATION ERROR: "+err);
		}	
	}//end automatic_translation



	/**
	* COPY SOURCE TEXT TO TARGET
	*/
	this.copy_source_text_to_target = function(btn_obj) {

		var wrap_tool_lang_source = $('#wrap_tool_lang_component_source').find('input,textarea').first();	

		var source_text 	= $(wrap_tool_lang_source).val();	//return alert(source_text);
		if (source_text.length<2)
			return alert("Warning: source_text is empty: "+source_text);

		try {
			var wrap_tool_lang_component_target = $('#wrap_tool_lang_component_target').find('input,textarea').first();
			if($(wrap_tool_lang_component_target).length<1) {
				$('.tool_lang_selector_target').focus();
				return alert("Please select one target lang");
			}

			var target_text	= $(wrap_tool_lang_component_target).val();	//return alert(target_text);
			if( target_text.length > 2 ) {	// avoid overwrite yet translated text				
				// Confirm action
				if( !confirm( get_label.esta_seguro_de_sobreescribir_el_texto ) )  return false;
			}
		}catch(error){if (DEBUG) console.log(error)}
		//return alert(source_text+" <br>"+target_text)

		try {
			
			// CASE TINYMCE
			if ( $('#wrap_tool_lang_component_target').find('textarea').first().length >0) {
				
				var input_element = $('#wrap_tool_lang_component_target').find('textarea').first();

				// Select current source editor and get attr id
				var id 			= $(input_element).attr('id'); //return alert(id);
				var target_ed	= tinyMCE.get(id);		
				//var target_text	= target_ed.getContent();
				
				target_ed.setContent(source_text);

				// Force sync content textarea / tinymce
				tinyMCE.triggerSave();

				component_text_area.Save( $(input_element)[0], null, tinyMCE.activeEditor );

			
			// CASE INPUT
			}else
			if ( $('#wrap_tool_lang_component_target').find('input').first().length >0 ) {

				var input_element = $('#wrap_tool_lang_component_target').find('input').first();
				
				$(input_element).val( source_text );

				component_input_text.Save( $(input_element) );
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
			url			: this.trigger_tool_lang_url,
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
		
		var text_area 	= $('#wrap_tool_lang_component_source').find('textarea').first();

		if ( $(text_area).length <1 ) { 
			if (DEBUG) console.warn('writeLeftParagraphsNumber: element textarea not found in #wrap_tool_lang_component_source');
			return false
		};

		try{

			var ed_id	= $(text_area).attr('id'); 
			var ed		= tinyMCE.get(ed_id);	
			var text	= ed.getContent() ; 		//alert(text)//textoG = encodeURI(textoG);
			
			var arr 	= text.split('<br />');
			var np 		= arr.length ;
		
			paragraphsLeftNumber = parseInt(np+0);	
			
			$('#nParagrapsLeft').hide().html( paragraphsLeftNumber ).fadeIn(300);

			return paragraphsLeftNumber ;
			
		}catch(err){
			if (DEBUG) console.log('writeLeftParagraphsNumber: '+err);
		}	
	}//end writeLeftParagraphsNumber



	/**
	* WRITE TARGET (RIGHT) PARAGRAPHS NUMBER 
	*/
	this.writeRightParagraphsNumber = function() {

		var source_text_area 	= $('#wrap_tool_lang_component_source').find('textarea').first();

		if ( $(source_text_area).length <1 ) { 
			if (DEBUG) console.warn('writeRightParagraphsNumber: element textarea not found in #wrap_tool_lang_component_source');
			return false
		};
		if(tool_lang.paragraphsLeftNumber==null) tool_lang.writeLeftParagraphsNumber();

		var target_text_area 	= $('#wrap_tool_lang_component_target').find('textarea').first();

		if ( $(target_text_area).length <1 ) { 
			if (DEBUG) console.log('->Error: writeRightParagraphsNumber: element textarea not found in #wrap_tool_lang_component_target');
			return false
		};
				
		try{

			var ed_id	= $(target_text_area).attr('id');
			var ed		= tinyMCE.get(ed_id);	
			var text	= ed.getContent(); 		//alert(text)//textoG = encodeURI(textoG);
			
			var arr 	= text.split('<br />');
			var np 		= arr.length ;
		
			paragraphsRightNumber = parseInt(np+0);		//alert(paragraphsRightNumber)
			
			$('#nParagrapsRight').hide().html( paragraphsRightNumber ) ;
			
			// If number of paragraphs is different, hilite number in red			
			if( parseInt(paragraphsLeftNumber) != parseInt(paragraphsRightNumber) ) {
				$('#nParagrapsRight').addClass('nParagrapsRight_red');	//alert(paragraphsLeftNumber + " " +paragraphsRightNumber)
				//$('.propagate_marks_btnBTNgrey').removeClass().addClass("propagate_marks_btnBTNred");
			}else{
				$('#nParagrapsRight').removeClass('nParagrapsRight_red');
				//$('.propagate_marks_btnBTNred').removeClass().addClass("propagate_marks_btnBTNgrey");	
			}
			$('#nParagrapsRight').fadeIn(300);

			return paragraphsRightNumber ;
						
		}catch(err){
			if (DEBUG) console.log('->Error: writeRightParagraphsNumber: '+err+ "\n ed_id:"+ed_id);
		}	
	}//end writeRightParagraphsNumber



	/**
	* FIX_HEIGHT_OF_TEXTEDITOR
	*/
	this.fix_height_of_texteditor = function() {

		if (page_globals.modo!='tool_lang') {
			return false;
		}

		$(function() {
			
			if (tinyMCE==undefined || !tinyMCE || typeof tinyMCE===undefined) return;

			try {
				//console.log(tinyMCE.editors);
				var len = tinyMCE.editors.length
				for (var i = len - 1; i >= 0; i--) {
					//console.log( tinyMCE.editors[i] )

					 tinyMCE.editors[i].theme.resizeTo(
						null,
						window.innerHeight - 280
					);
				}			  

			}catch(e) {
				console.log("Error: "+e)
			}
		})
	}//end fix_height_of_texteditor




};//end tool_lang class