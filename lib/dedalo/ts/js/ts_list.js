// JavaScript Document


// DOCUMENT READY
$(function() { 

	/*
	// AJAX RESPONSES (Monitoriza todos los request ajax)
	$(document)
	.ajaxSuccess(function( event, xhr, settings ) {

		// DEBUG : Show ajax data to debug
		if(DEBUG==true) {
			//$( "#log_messages" ).append("<br>Triggered ajaxComplete handler. The result is " +  xhr.responseHTML );
			var data_formated = replaceAll('&','<br>',settings.data )
			//$( "#inspector_log" ).append("<hr>" + data_formated );
			//$( "#log_messages" ).append("<hr>" + data_formated );
			console.log("-> Ajax: settings Obj:")
			console.log(settings)
		}
	})
	.ajaxError(function( event, jqxhr, settings, exception ) {
	  	// ERROR : Notify ajax call failed		
		if(DEBUG==true) {
			console.log(exception)
			console.log(settings)
			alert("Error on ajax call. url:"+settings.url)
		}else{
			alert("Error on ajax call.")
		}		
	});
	//alert(DEBUG);
	*/

  
   // OPEN COOKIE TRACKED DIVS
	if( cookieOpenDivsArray != -1 && typeof terminoIDresalte != 'undefined' ) {
		ts.openTrackedDivs(terminoIDresalte);
	}	
	
	// KEYBOARD FUNCIONS
	$("body").keydown(function(e){
		//console.log(e.keyCode);	    
	    // CONTROL + D (ctrlKey+77) SHOW/HIDE INSPECTOR
	    if (e.ctrlKey==1 && e.keyCode==77) { // m=77	 
	        // do something
	        ts.toggleModelo();  
	    }

	    if (e.ctrlKey==1 && e.keyCode==84) { // t=84	 
	        // do something
	        $( ".tesauro_button_show_tr" ).each(function( index ) {
			  //console.log( index + ": " + $( this ).text() );
			  var tipo = $(this).data('tipo')
			  multiToogle(tipo,'block','none')
			});       
	    }
	});

	// SORT TR ORDER
	var button_obj = $('.tesauro_button_show_tr');
	$(document.body).on('click', button_obj.selector, function(e){
		
		 $( ".tesauro_tr_sortable" ).sortable({
			update: function( event, ui ) {
			  	
			  	// Recorremos los elementos li que contienen los valores
				var ar_childrens = $(this).contents().filter('li');			//if (DEBUG) console.log( ar_childrens );					
				
				var len			= ar_childrens.length;
				var ar_values	= [];

				if(ar_childrens && len >0) for(var i=0; i<len ; i++) {		
					
					// (SELECT BY NAME[value=i] IS IMPORTANT)
					var current_obj = ar_childrens[i],
						tipo		= current_obj.dataset.tipo

					if( tipo ) ar_values.push( tipo );	
				}					
				dato = ar_values;
				
				var current_termino_id = $(this).data('termino_id');
				ts.update_tr_order(current_termino_id, dato, $(this));

			}//update
		});
		return false;
	});

	
});//end dom ready



/**
* TS CLASS
*/
var ts = new function() {

	
	this.trigger_url 			= DEDALO_LIB_BASE_URL + '/ts/trigger.Tesauro.php';
	this.descriptors_trigger 	= DEDALO_LIB_BASE_URL + '/descriptors/trigger.descriptors.php';

	/**
	* SHOW_INDEXATIONS : Carga el listado de fragmentos indexados 
	*/
	this.show_indexations = function(button, terminoID, termino, nIndexaciones) {
		
		var target_div  = document.getElementById('u'+terminoID);
		if (!target_div) {
			return alert('show_indexations. Target div not exist !');
		}
		
		termino = urldecode(termino);
		
		
		if(target_div.style.display == 'block') {
			// si está visible, la ocultamos			
			target_div.style.display = 'none'

		}else{
			// si no está visible, hacemos la búsqueda y cargamos los datos			
			var mydata	= { 'accion' 	: 'show_indexations',
							'terminoID' : terminoID,
							'top_tipo' 	: page_globals.top_tipo,
							'top_id' 	: page_globals.top_id
						};
						//console.log(mydata); return;
			
			target_div.innerHTML 	 = '<div class="indexations_spinner"><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /> Loading '+nIndexaciones+' indexations of '+termino+' ... </div>';
			target_div.style.display = 'block'
			
			// AJAX CALL
			$.ajax({
				url			: this.trigger_url,
				data		: mydata,
				type		: "POST"
			})
			.done(function(received_data) {
				
				target_div.style.display = 'none'
				target_div.innerHTML = received_data				
				//target_div.slideDown(300);
				target_div.style.display = 'block'
			})
			.fail( function(jqXHR, textStatus) {					
				alert("Error on show_indexations");
				//top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " [id_matrix] " + id_matrix + "</span>" + textStatus );
			})
			.always(function() {				
				//html_page.loading_content( target_obj, 0 );
			});//fin $.ajax			
			
		}//if (target_div.style.display == 'block')
			
	}//end if (target_div.css( 'display') == 'block')
	

	/**
	* validate_form
	*/
	this.validate_form = function() {

		return true;
		/*
		var selected_tipo = document.forms["form1"]["tipo"].value;
			//console.log(selected_tipo)

		if (selected_tipo==null || selected_tipo=="") {
			alert("Por favor, seleccione tipo");
			document.getElementById("tipo").focus();
			return false;
		}
		*/
	}

	
	/*
	* Abrir listado de tesauro para hacer relaciones
	*//*
	var relwindow ;
	this.abrirTSlist = function(modo,type) {
		
		var theUrl = '../lib/dedalo/ts/ts_list.php?modo=' + modo +'&type=' + type ;
		relwindow = window.open(theUrl ,'listwindow','status=yes,scrollbars=yes,resizable=yes,width=900,height=650');//resizable
		if (relwindow) relwindow.moveTo(-10,1);
		if (window.focus) { relwindow.focus() }
		//return false;
	}
	*/

	/*
	* OPENTRACKEDDIVS
	* Abrimos secuencialmente todos los divs cuyos terminoID estén contenidos en el array "openDivs"
	* Se inicia al cargar la página, tras leer la cookie
	*/
	this.openTrackedDivs = function(terminoIDresalte) {

		var le = false ;
		if(openDivs && openDivs.length) le = openDivs.length ;
		
		//openDivs.reverse()
		//console.log('->ts.openTrackedDivs openDivs: ')
		//console.log(openDivs)
		
		//alert(" ts.openTrackedDivs: "+ terminoIDresalte+"\n le: "+le+"\n openDivs: "+openDivs ) 
		/*
		if(le!=-1) for (var x=0; x < le ; x++){			
			try {
				
				var terminoID 	= openDivs[x],
					div_destino = 'div_' + terminoID,
					//modo 		= 'manual',
					slide 		= 'block' ;
				
				if(terminoID!=-1) {
					ts.load_tree(terminoID, div_destino, modo, slide, terminoIDresalte); //ts.load_tree(terminoID, div_destino, modo, slide, terminoIDresalte, target, accion)
				}
				console.log('terminoID: '+terminoID)
				
			}catch(err){
				if (DEBUG) console.log("-> ts.openTrackedDivs error: " + err);	
			}	
		}
		return true;
		*/
		
		// Create a deferred object
		var dfd = $.Deferred();
		
		// Add handlers to be called when dfd is resolved
		dfd.done(function() {

			// Loop
			if(le>0) for(var x=0; x < le ; x++) {

				if( typeof openDivs[x] != 'undefined' && openDivs[x].length>0 ) {

					var terminoID 	= openDivs[x],
						div_destino = 'div_' + terminoID,
						slide 		= 'block' ;

					//console.log("terminoID "+terminoID + " x:"+x);			
			    	
					ts.load_tree(terminoID, div_destino, modo, slide, terminoIDresalte);
					//console.log("deferred: "+terminoID +" - ")
				}							
			    
			}//end if(le!=-1) for(var x=0; x < le ; x++)
		});//end done
		//console.log(dfd)

		// Resolve deferred obj
		dfd.resolve();

	}//end ts.openTrackedDivs


	/**
	* TOGGLEMODELO
	*/
	this.visibleModelo = 0 ;
	this.toggleModelo = function() {
		if(this.visibleModelo==0){
			$('.btnModelo').show();
			this.visibleModelo = 1
		}else{
			$('.btnModelo').hide();
			this.visibleModelo = 0
		}
	};


	/**
	* EDIT_INLINE
	*/
	this.edit_inline = function(button_obj) {
		
		//if(ts_lang!='') return(alert(" Edit inline only in main lang... \n Use the button edit to modify translations.")) 
			
		var termino_span_obj		= $(button_obj);
		var terminoID 				= termino_span_obj.attr('alt');		//alert(id)		
		var termino					= termino_span_obj.text();			// extract only text
		var isTranslationPreview 	= function() {
			// verifica si el texto que se muestra es un preview para un termino no traducido (con estilo <span class='unTranslated'>)
			var string 	= termino_span_obj.html();	
			var reg 	= /^<span/;
			var reg2 	= /^<mark/;
			if(reg.test(string) || reg2.test(string)) {			
				return true;
			}else{
				return false;
			}
		}
		
		var input_field_html	= '<input class="input_field_inline" type="text" name="input_field_'+terminoID+'" id="input_field_'+terminoID+'" value="'+termino+'" title="To validate changes press enter" >';
		var close_img_html		= '<img   class="close_img_inline"   src="../themes/default/x-icon-orange.png" id="close_img_'+terminoID+'" >';
		
		// hide termino and add input field
		termino_span_obj.hide().after( input_field_html + close_img_html );
		
		var input_field_obj		= $('#input_field_'+terminoID);
		var close_img_obj		= $('#close_img_'+terminoID);
		
		$(input_field_obj, close_img_obj).hide().fadeIn(300).focus();
		
		$('#close_img_'+terminoID).click(function() { 
			//alert("clixk") 
			save_sequence(false);
		});

		input_field_obj.keypress(function(event) {
			if ( event.which == 13 ) {
				
				save_sequence();
			}
		});		
		input_field_obj.blur(function() {
						  
			  save_sequence(false);
		});		
		
		var save_sequence = function(save) {
			
			// set and save content alert . If save id false, only remove input field
			// si el termino del input es igual al original no lo guardamos a menos que sea un preview de traducción	
			if(save!==false && (termino != input_field_obj.val() || isTranslationPreview()==true) ) {			  
				
				ts.saveDescriptorFromList(input_field_obj, terminoID, input_field_obj.val() );
				
				termino_span_obj.html( input_field_obj.val() );
			}
			
			// remove element
			input_field_obj.remove();
			close_img_obj.remove();
			termino_span_obj.show(300);	
		}				
	};//end edit_inline


	/**
	* MOSTRARINFO
	*/
	this.mostrarInfo = function(div,e,n) {

		var divTexto = document.getElementById("info");
		if(n=='n') divTexto = document.getElementById("infoN");
		
		if(divTexto.style.display == "block") {
			divTexto.style.display = "none";
		}else{
			// capturamos la posición del icono que envia la orden
			var posX = div.x + 18 ;
			var posY = div.y + 15 ;
			
			// posicionamos la caja
			divTexto.style.top 	= posY+'px' ;
			divTexto.style.left = posX+'px' ;
			
			divTexto.style.display = "block";
		
			//alert(e.clientX + "-" + e.clientY);
			//alert(div.x)
		}	
	};//end mostrarinfo


	/**
	* LOAD_TREE
	* Carga el arbol jerárquico de Navegación temática
	* Si accion == buildTree lo construye completo
	* Si accion == list construye el primer nivel 
	* Si se llama con la función "ts.openTrackedDivs", construirá como "list" todos los divs almacenados en la cookie de forma recursiva
	*/
	this.load_tree = function(terminoID, div_destino, modo, slide, terminoIDresalte, target, reloaded) {
		
		//return alert('load_tree: \n\n terminoID:'+terminoID + ' \n div_destino:'+div_destino + "\n terminoIDresalte:"+terminoIDresalte+"\n modo:"+ modo+"\n accion:"+ accion+"\n target:"+ target)
		
		var div		= document.getElementById(div_destino);
		var time	= 300;

		//console.log(div)
		
		if( !div ) {

			if( typeof terminoID === 'undefined' || terminoID.length===0 ) return false
			/*
			* Fijamos como cerrado el div actual.
			* Si NO existe el div, paso la orden de eliminarlo del listado de divs abiertos
			*/
			actualizarPostAjax(terminoID,0)	//setTimeout("alert('No existe elemento "+terminoID+" ')",1000);
							
		}else{
					
			var index = loadedDivs.indexOf(terminoID); // Find the index in array 'loadedDivs'
			
			/*
			* asincronico : Por defecto, las cargas ajax serán sincrónicas, es decir, cuando acabe una empieza la siguiente.
			* En caso de abrir manualmente las flechas (target=manual), la haremos asincrónica para que la percepción del usuario sea mas fluida
			*/
			var my_async = false ; if(target=='manual') my_async = true 	//alert('target: ' +div_destino + ' - my_async:'+ my_async)

			
			/*
			* Si NO está en el array de loadedDivs, es que NO está cargado y por tanto ejecutamos el ajax
			*/
			if(index === -1) {
				//alert(' load_tree 	\n terminoID:'+terminoID +' \n div_destino:'+div_destino + "\n terminoIDresalte:"+terminoIDresalte+"\n modo:"+ modo+"\n index:"+ index  )
			
				var divJQobj 	= $('#'+div_destino); // objeto div reconocible por jquery
				var accion		= 'listadoHijos';
				var mydata		= {
									'accion'			: accion,
									'modo'				: modo,
									'terminoID'		  	: terminoID,
									'terminoIDresalte'	: terminoIDresalte,
									'ts_lang'			: ts_lang,
									'type'				: type,
									'top_tipo'			: page_globals.top_tipo
								};
				var myURL		= this.trigger_url
				
				if(modo=="buildTree") {
					$(divJQobj)
						.html('<div id="spinnerDiv"> Building Thesaurus  <br> <img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /><br> Please wait</div>')
				}else{					
					$(divJQobj)
						.html('<div style="margin-left:55px"><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /></div>')
						.css({'display':'block'})
				}

				// AJAX CALL
				//jQuery.ajaxQueue({
				//$.ajaxq ("MyQueue", {
				$.ajax({
					url		: myURL,
					data	: mydata,
					type	: 'GET',
					async	: my_async,
					success : function( data_response ) {
						if(accion=="buildTree") {
							//$(divJQobj).hide();
							$(divJQobj)
								.css({'background-color':'#CCC'})
								.fadeIn(time)
							//$(divJQobj).fadeIn(time)
						}else{
							//$(divJQobj).hide()
							$(divJQobj).html(data_response)

							if(slide=='block'){
								$(divJQobj).css({'display':'block'}) // se usa sólo al cargar la página
							}else{
								$(divJQobj).slideDown(time, function(){ })
							}

							// Fijamos como abierto el div actual
							actualizarPostAjax(terminoID,1)
						}//if modo=="list"
						//return 1;
					}
				})
				.fail( function(jqXHR, textStatus) {
					alert("Load tree error "+textStatus)
				})
				/*
				// DONE
				.done(function(data_response) {

					if(accion=="buildTree") {
						//$(divJQobj).hide();
						$(divJQobj).css({'background-color':'#CCC'});
						$(divJQobj).fadeIn(time);
						//$(divJQobj).fadeIn(time);					
					}else{									
						//$(divJQobj).hide();				
						$(divJQobj).html(data_response);					
						// Fijamos como abierto el div actual									
						actualizarPostAjax(terminoID,1);

						if(slide=='block'){
							$(divJQobj).css({'display':'block'}); // se usa sólo al cargar la página
						}else{
							$(divJQobj).slideDown(time, function(){ });
						}										
					}//if modo=="list"
					//return 1;
				})				
				.always(function() {

				});
				*/
			
			}//if(index==-1)			
			
		}//if(div==null)	
		
	};//end load_tree



	/**
	* ACTUALIZARLIST : Actualiza la rama recibida (desde le parent hacia abajo)
	*/
	this.actualizarList = function(parent, current_terminoID) {
		
		// Reset all resalted termns
		$('.resalte').first().removeClass('resalte');

		

		// Set parent and term as not loaded in cookie 'loadedDivTrack' (accion=0)		
		var accion	= 0 ;
		loadedDivTrack(parent,accion) ; // elimina parent como cargado en el array "loadedDivs"	
		loadedDivTrack(current_terminoID,accion) ; // elimina terminoID como cargado en el array "loadedDivs"
		
		// Force reset all loaded divs (empty array value)
		/*		
		remove_localStorage('cookieLoadedDivs');// Reset cookie loaded divs
		remove_localStorage('cookieOpenDivs');// Reset cookie loaded divs
		resetView();
		openDivs.length = 0;
		cookieOpenDivsArray.length = 0;
		loadedDivs.length = 0;
		cookieOpenDivsString = null;
		cookieOpenDivsArray.length = 0;
		*/
		loadedDivs.length = 0	//alert("parent:"+parent)


		// TREE : load tree from parent term to update only changed branch
		var div_destino 		= 'div_' + parent 
		var slide				= ''
		var terminoIDresalte 	= current_terminoID
		var target				= 'manual'

		ts.load_tree(parent, div_destino, modo, slide, terminoIDresalte, target)

		/*
		$(function() {
			var ref_obj = $("#textoTermino_"+current_terminoID);
			var ref_top = $(ref_obj).offset().top - 40;
			console.log('actualizarList top: '+ref_top);
			// Handler for .ready() called.
			//$("html, body").animate({ scrollTop: ref_top }, 600);
		});
		*/	
	};//end actualizarList



	/**
	* ToggleTS : Gestiona abrir y cerrar los divs a través de las flechas del termino
	*/
	this.ToggleTS = function(terminoID, accion, force ) {

		var div_terminoID = document.getElementById('div_'+terminoID)
		
		//alert("ToggleTS \n\n terminoID:"+terminoID + " accion:"+accion + " modo:"+modo +" div_terminoID.style.display:"+ div_terminoID.style.display)

		if ( div_terminoID.style.display === "none" || force==1 ) {  
			// ABRIMOS MANUALMENTE
				var x = loadedDivs.indexOf(terminoID) ; // buscamos este div en el array de divs cargados. Si existe, su contenido ya fué cargado		
				
				if(accion==='abrir' && x === -1)	// si no hay cookie (x), cargamos los hijos de este termino
				{
					var div_destino 		= 'div_' + terminoID
					var slide				= ''
					var terminoIDresalte 	= ''
					var target				= 'manual'

					ts.load_tree(terminoID, div_destino, modo, slide, terminoIDresalte, target)				
									
				}else{								// Mostramos el contenido (los hijos) del termino acual (ya fueron cargados previamente, x==1)
					
					$('#div_'+terminoID).slideDown(300, function(){ })
				}
				
				var estado = 'open'; flechasTSestado(terminoID,estado)
			
		} else {
			// CERRAMOS MANUALMENTE
				$('#div_'+terminoID).slideUp(300, function(){	
					div_terminoID.style.display = "none"									   
				});
				
				openDivTrack(terminoID,0); // Elimina terminoID como abierto en el array "openDivs"
				var estado = 'close'; flechasTSestado(terminoID,estado) // fija el aspecto de las flechas
		}
	};//end ToggleTS



	/**
	* ADD_INDEX_COMMON
	* Redirige las llamadas de indexación desde el tesauro
	* @param object obj
	*/
	this.add_index_common = function(obj) {		

		// URL_VARS
		// Recoge todas las variable del la url actual y las pasa en la siguiente llamada
		var url_vars = get_current_url_vars()

		// En función del rel_type, ejecutaremos una ación u otra
		var rel_type = url_vars.rel_type
		switch(rel_type) {

			case 'tool_semantic_nodes':
				// Editando en dedalo 4 para asignar relaciones remánticas en tool_semantic_nodes
				window.opener.tool_semantic_nodes.add_index( obj, url_vars );
				break;

			case 'autocomplete_ts_tree':				
				// Editando en dedalo 4 para asignar locator a autocomplete_ts
				window.opener.component_autocomplete_ts.add_index( obj, url_vars );
				break;

			default:
				// Editando en dedalo 4 para asignar relaciones
				if ( parent.page_globals.modo.indexOf("tesauro") == -1 ) {	
					// return alert("edit d4")	
					parent.tool_indexation.add_index(obj);	

				// Editando desde tesauro edit términos relacionados
				}else{
					var terminoID = $(obj).data('termino_id');	
					//return alert('Editando desde tesauro edit térmionos relacionados '+terminoID)
				  	window.opener.linkTS(terminoID);
				}
				break;
		}	

		return false;
	};//end add_index_common



	/**
	* UPDATE_TR_ORDER
	*/
	this.update_tr_order = function(terminoID, dato, obj) {
	
		var mydata = { 'accion' 	: 'update_tr_order',
						'terminoID' : terminoID,
						'dato' 		: dato,
						'top_tipo' 	: page_globals.top_tipo
					}
						//return 	console.log(mydata);

		// AJAX REQUEST
		$.ajax({
		  	url			: ts.trigger_url,
			data		: mydata,
			type		: "POST",
		  	dataType	: "html"
		})
		// DONE
		.done(function(data_response) {
			
		  	// Search 'error' string in response
			var error_response = /error/i.test(data_response); // If data_response contain 'error' show alert error with (data_response) else reload the page
			if(error_response) {
				// Alert error
				alert("[update_tr_order] Request failed: \n" + data_response + $(data_response).text() );
			}else{			
				//alert("Ok. TR order updated! "+data_response)
				//console.log(obj)
				$(obj).fadeOut(0).fadeIn(150);
			}
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[update_tr_order] Request failed: " + textStatus ;
		 	alert( msg );
		})
		// ALWAYS
		.always(function() {		
		})

	};//end update_tr_order



	/**
	* OPENTSEDIT : Abre la ventana de edición del termino (ts_edit.php)
	*/
	var editwindow  ;
	this.openTSedit = function(terminoID) {
		
		//alert('terminoID:'+terminoID+' parent:'+parent)	
		var theUrl = DEDALO_LIB_BASE_URL + "/ts/ts_edit.php?terminoID="+terminoID ;
		editwindow = window.open(theUrl ,'editwindow','status=yes,scrollbars=no,resizable=yes,width=720,height=540');
		//if (newwindow) newwindow.moveTo(-10,1);
		
		try{	
			if(window.focus) {
				
				screenW = screen.width;
				screenH = screen.height;		
				editwindow.moveTo(screenW-720,0);	//alert(screenW +" " +screenH)	
				
				editwindow.focus();
			}
		}catch(err){
			alert("Error focus window (openTSedit). \n\nPlease disable 'Block Pop-Up Windows' option in your browser ")
		}
	}//end opentsedit



	/*
	* GO2TERMINO : Busca el termino seleccionado y recarga la página con la selección
	* Debe abrir todos sus padres secuenciamete y luego remarcar el término
	*/
	this.go2termino = function(terminoID) {
		//alert("go2termino: "+terminoID +"	\n"+modo)
		var myurl = this.trigger_url + "?modo="+modo+"&terminoID="+terminoID+"&accion=searchTSform";
		window.location = myurl ; 
	}



	/*
	* DELETE_TERM : Petición AJAX borrado Tesauro
	*/
	this.delete_term = function(divContTesauroID, terminoID, children, indexaciones, parent, termino) {
		
		//return alert('function delete_term\n\n divContTesauroID:' + divContTesauroID + '\n terminoID:' + terminoID + '\n children:'+ children + '\n indexaciones:' + indexaciones + '\n parent:' + parent + '\n termino:' + termino)
		
		if(children != 0) {
			alert( el_descriptor_tiene_hijos_title );
		}else if (indexaciones > 0){
			alert( el_descriptor_tiene_indexaciones_title );
		}else{
			
			termino = urldecode(termino);
			termino = termino.replace(/(<([^>]+)>)/ig,"");
			
			var r=confirm( seguro_que_quiere_borrar_este_termino_title  + "\n\n" +  termino + "\nID: "+ terminoID + "\n" + hijos_title +': ' + children + "\n\n"  );
			if( r !== true ) return false ;
					
			var divObj 	= $('#'+divContTesauroID) ;
			
			if(divObj==null) {
				alert("delete_term: Element "+ divContTesauroID + " unavalible!");
			}else{				
				//var divObj 	= $('#'+divContTesauroID) ;
				var myURL	= this.trigger_url;
				var accion	= 'deleteTS';
				var mydata	= { 'accion': accion, 'modo': modo, 'terminoID': terminoID, 'children': children, 'top_tipo':page_globals.top_tipo };
				
				$.ajax({					
				  url		: myURL,
				  data		: mydata,
				  type		: "POST",
				  //async		: false,
				  beforeSend: function(){
								//divObj.html('<div id="spinnerDiv"> Building Thesaurus  <br> <img src="../images/spinner.gif" alt="Wait" align="absmiddle" /><br> Please wait</div>');
							},
				  success	: function(received_data){
					  			/**/
								//divObj.html(received_data);							
								switch(received_data) {
				  					// Case tree
				  					case 'ok_tree': divObj.html('<div class=\"ok\"> Deleted ' + termino + ' (' + terminoID +') ok ! </div>');
													//setTimeout('window.location=\"?modo=' + modo + '\"',1000);
													setTimeout( function() {
														divObj.remove();
													},1500 );
													break;

									// Other case (Error mesages)
									default: 		return alert("Error: \n" + received_data);
								}							

								// Elimina las cookies que empiezan por .. (component_autocomplete_ts)
								// Fuerza a actualizar los datos del componente 'component_autocomplete_ts'
								clear_some_local_storage('component_autocomplete_ts');

							},
				  complete	: function(){
								//top.location="?modo="+modo;	
							},	
					  
				});//$.ajax
			}
			
		}//fin if (children != 0)
	};//fin function delete_term



	/*
	* INSERTTS : Petición AJAX insert Tesauro
	*/
	this.insertTS = function(parent) {
		
		//return false; // DESACTIVA	
		//alert('function insertTS \n parent:' + parent  )
		
		var divContTerminoID = 'divCont' + parent ;	
		var div = document.getElementById(divContTerminoID);	
		
		if(div==null){
			
			alert("Element "+ divContTerminoID + " unavalible!")
		
		}else{
			
			var divObj  = $('#'+divContTerminoID) ;
			var myURL	= this.trigger_url
			var accion	= 'insertTS';
			var mydata	= { 'accion': accion, 'modo': modo, 'parent': parent, 'top_tipo':page_globals.top_tipo };		//return(alert(modo))
			
			// borrado ajax (necesita jquery 1.4)
			$.ajax({
			  url		: myURL,
			  data		: mydata,
			  type		: "POST",
			  //async		: false,
			  beforeSend: function(){
							//divObj.html('<div id="spinnerDiv"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /><br> Please wait</div>');
						},
			  success	: function(received_data){
				  						
							divObj.append(received_data);				//alert('1')
							openDivTrack(parent,1);				//if(parent!='ts0' && parent!='tp0') openDivTrack(parent,1);

							// Elimina las cookies que empiezan por .. (component_autocomplete_ts)
							// Fuerza a actualizar los datos del componente 'component_autocomplete_ts'
							clear_some_local_storage('component_autocomplete_ts');		
						}	
				  
			});//$.ajax
		}			
				
	};//end insertTS



	/**
	* saveDescriptor
	*/
	this.saveDescriptorFromList = function(obj, terminoID, termino) {
		
		if(typeof terminoID=='undefined' || terminoID.length <2) return alert("Error on saveDescriptorFromlist. Need a valid terminoID");
		//return alert("delete "+id);
		
		//var ts_lang is global page var
		//if(typeof ts_lang=='undefined' || ts_lang.length <2) return alert("Error on saveDescriptorFromlist. Need a valid ts_lang");
		//return alert(ts_lang)
		
		var myurl 		= this.trigger_url ;
		var div			= $(obj);
		
		var accion 		= 'saveDescriptorFromList';
		var mydata		= { 'accion': accion, 'terminoID': terminoID, 'termino': termino, 'lang': ts_lang, 'top_tipo':page_globals.top_tipo };	
		
		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST",
			beforeSend	: function() {
							div.addClass('spinner');						
						},
			success		: function(data) {						
							//alert(data);
						},
			complete	: function() {
							div.removeClass('spinner');							
						}
		});//fin $.ajax
		
	}//end saveDescriptorFromList



};//end component_ts class









//
// DIVS CARGADOS
//
var loadedDivs = new Array();
remove_localStorage('cookieLoadedDivs');// Reset cookie loaded divs


//
// DIVS ABIERTOS
//
var openDivs = new Array();

if( get_localStorage('cookieOpenDivs')==null || get_localStorage('cookieOpenDivs')==-1 ) {
	//set_localStorage('cookieOpenDivs','',7); 
	remove_localStorage('cookieOpenDivs');// Reset cookie loaded divs
}
	

// COOKIEOPENDIVSSTRING : leemos el valor del cookie que está como string
var cookieOpenDivsString	= get_localStorage('cookieOpenDivs'); 

// COOKIEOPENDIVSARRAY : lo convertimos en array
var cookieOpenDivsArray		= new Array(); if( cookieOpenDivsString ) cookieOpenDivsArray = cookieOpenDivsString.split(',');
	//console.log(cookieOpenDivsArray);

// COOKIEOPENDIVSARRAY : asignamaos sus valores al array openDivs
if (cookieOpenDivsArray instanceof Array) {

	// Remove possible empty values
	cookieOpenDivsArray = cookieOpenDivsArray.filter(function(n){return n});

	openDivs = cookieOpenDivsArray ;
		//console.log(openDivs);
}



/**
* MULTITOOGLE : TESAURO NAV Multi toogle 
*/
function multiToogle(divName,activa,desactiva) {

	div = document.getElementById(divName);		//alert(activa + ' - ' + desactiva  + ' - '+div.style.display); //alert( $('#'+divName).css('class') );
	if(!div || div==null) {
	  alert(' Opss. Sorry: Beta function. ' + div1 +' - '+ activa +' - '+ desactiva );

	} else {
	  if (div.style.display == desactiva || div.style.display == '') {	  
			$(div).slideDown(100, function(){	
				div.style.display = activa ; 
			});
	  } else {
		  $(div).slideUp(100, function(){	
				div.style.display = desactiva ;
			});
	  }
	}
}


/**
* LOADEDDIVTRACK : Tracking de divs cargados (1 cargado, 0 no cargado)
* Lleva un registro mediante cookie de los terminos abiertos
* Al cargar la página se resetea 
*/
function loadedDivTrack(terminoID,accion) {
	
	if(accion==1)	// guardamos en el array "loadedDivs" el div abierto
	{
		loadedDivs.push(terminoID); // añadimnos este terminoID al array de disvs cargados ("loadedDivs")				
		
	}else{		 	// localizamos y eliminamos en el array "loadedDivs" el div cerrado
		
		var index	= loadedDivs.indexOf(terminoID); // Find the index
		if(index!=-1) loadedDivs.splice(index,1); // Remove it if really found!
		
	}
	remove_localStorage('cookieLoadedDivs');
	set_localStorage('cookieLoadedDivs',loadedDivs,7); // actualizamos la cookie "cookieLoadedDivs"
		//alert(" funcion: loadedDivTrack \n array loadedDivs: "+loadedDivs + "\ncookie cookieLoadedDivs: " + get_localStorage('cookieLoadedDivs') + "\naccion: " + accion )
	return true ;
}

/**
* OPENDIVTRACK : Tracking de divs abiertos en el termino (1 abierto, 0 cerrado)
* Lleva un registro mediante cookies de los terminos desplegados
* Al hacer búsquedas se resetea
*/
var resalte
function openDivTrack(terminoID, accion, resaltar) {
	
	//alert("funcion: openDivTrack \n array openDivs: "+openDivs + "\ncookie: " + get_localStorage('cookieOpenDivs') + "\naccion: " + accion + "\n resaltar: " + resaltar)
	
	var r = resaltar;
	
	if(accion==1) {	// guardamos en el array "openDivs" el div abierto
	
		openDivs.push(terminoID); // añadimnos este terminoID al array de disvs abiertos ("openDivs")
		
	}else{		 	// localizamos y eliminamos en el array "openDivs" el div cerrado
		
		var index	= openDivs.indexOf(terminoID); // Find the index
		if(index!=-1) openDivs.splice(index,1); // Remove it if really found!		
	}
	
	// Actualizamos la cookie
	remove_localStorage('cookieOpenDivs');
	set_localStorage('cookieOpenDivs',openDivs,7); // actualizamos la cookie "cookieOpenDivs"
	
	if(accion==1 && r!=null) {		
		resalte = r ;
		setTimeout(function() {
			var parent 				= terminoID,
				current_terminoID 	= resaltar;
			ts.actualizarList(parent, current_terminoID)
		},1);	//alert(r) 		
	}
	return true ;	
}



/**
* ACTUALIZARPOSTAJAX : Actualiza el estado (cargado/abierto) del div recibido
* Tras cargarse mediante ts.load_tree, por ejemplo, queda como cargado y abierto
*/
function actualizarPostAjax(terminoID,cargadoObjeto) {
	
	if(cargadoObjeto==1)
	{		
		var accion = 1		; loadedDivTrack(terminoID,accion) ; // almacena terminoID como cargado en el array "loadedDivs"
		
		var index = openDivs.indexOf(terminoID); // Find the index
		if(index==-1){
			var accion = 1	; openDivTrack(terminoID,accion) ; // almacena terminoID como abierto en el array "openDivs"
		}
					
		var estado = 'open'	; flechasTSestado(terminoID,estado);	// fija el aspecto de las flechas
	}else{
		var accion	= 0		; loadedDivTrack(terminoID,accion) ; // elimina terminoID como cargado en el array "loadedDivs"	
		var index	= openDivs.indexOf(terminoID); // Find the index
		if(index)	var accion 	= 0		; openDivTrack(terminoID,accion) ; // elimina terminoID como abierto en el array "openDivs"
		var estado = 'close'; flechasTSestado(terminoID,estado);	// fija el aspecto de las flechas
	}
}



/**
* FLECHASTSESTADO : Estado de las flechas de apertura/cierre del termino
* Fija su aparuiencia en función del estado (open/close)
*/
function flechasTSestado(terminoID,estado) {
	
	try{
		
		var flechaOpen 	= document.getElementById('fopen'+terminoID)
		var flechaClose = document.getElementById('fclose'+terminoID)
	
		if(estado=='open' && flechaOpen!=null && flechaClose!=null)
		{
			try{
				flechaOpen.style.display	= "none"; 	// ocultamos la flecha de abrir
				flechaClose.style.display	= "block";	// mostramos la flecha de cerrar
			}catch(e){ alert(e) }
		}
		else if(estado == 'close' && flechaOpen!=null && flechaClose!=null)
		{			
			try{
			flechaOpen.style.display	= "block";	// mostramos la flecha de abrir
			flechaClose.style.display	= "none";	// ocultamos la flecha de cerrar
			}catch(e){ alert(e) }
		}
	
	}catch(e){ alert(e) }
}


















/*
function actualizaDivPadre(terminoID){

	alert("actualizaDivPadre ¿no usada?")
	
	var div = $('#divTsIcons'+ terminoID) ; //alert('actualizaDivPadre: ' +terminoID + ' #divCont'+ terminoID );
	var myURL	= "../ts/trigger.Tesauro.php";
	var accion	= 'reload';
	var mydata	= { 'accion': accion, 'terminoID': terminoID };
	
	// actualización ajax (necesita jquery 1.4)
	$.ajax({
	  url		: myURL,
	  data		: mydata,
	  type		: "POST",
	  success	: function(data) {
					div.hide();				
					div.html(data);
					div.slideDown(300);
				}	  
	});
}
*/



/*******************************
* OTRAS FUNCIONES GENERALES
*******************************/




function urldecode (str) {
    // Decodes URL-encoded string  
    // 
    // version: 1008.1718
    // discuss at: http://phpjs.org/functions/urldecode    // +   original by: Philip Peterson
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +      input by: AJ
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   improved by: Brett Zamir (http://brett-zamir.me)    // +      input by: travc
    // +      input by: Brett Zamir (http://brett-zamir.me)
    // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   improved by: Lars Fischer
    // +      input by: Ratheous    // +   improved by: Orlando
    // +      reimplemented by: Brett Zamir (http://brett-zamir.me)
    // +      bugfixed by: Rob
    // %        note 1: info on what encoding functions to use from: http://xkr.us/articles/javascript/encode-compare/
    // %        note 2: Please be aware that this function expects to decode from UTF-8 encoded strings, as found on    // %        note 2: pages served as UTF-8
    // *     example 1: urldecode('Kevin+van+Zonneveld%21');
    // *     returns 1: 'Kevin van Zonneveld!'
    // *     example 2: urldecode('http%3A%2F%2Fkevin.vanzonneveld.net%2F');
    // *     returns 2: 'http://kevin.vanzonneveld.net/'    // *     example 3: urldecode('http%3A%2F%2Fwww.google.nl%2Fsearch%3Fq%3Dphp.js%26ie%3Dutf-8%26oe%3Dutf-8%26aq%3Dt%26rls%3Dcom.ubuntu%3Aen-US%3Aunofficial%26client%3Dfirefox-a');
    // *     returns 3: 'http://www.google.nl/search?q=php.js&ie=utf-8&oe=utf-8&aq=t&rls=com.ubuntu:en-US:unofficial&client=firefox-a'
    
    return decodeURIComponent(str.replace(/\+/g, '%20'));
}

function resetView()
{
	try {
		remove_localStorage('cookieOpenDivs'); 
		//document.location"ts_list.php?modo=list";
	}catch(err){
		if(DEBUG) alert(err)	
	}	
}
// RESET_WINDOW_AND_RELOAD : Elimina las cookies y recarga la página
function reset_window_and_reload() {
	resetView();
	window.location.reload();
}

/*
* Añadir termino en ind_nou.php
*/
function anadirTesauro(terminoID5)
{
	window.opener.linkTS(terminoID5);
	alert("ts_llistat:"+terminoID5)
}

/*
* Relacionar termino ents_edit.php
* Relaciona descriptores entre sí
*/
function relTesauro(terminoID) {
	window.opener.relTS(terminoID);	
}

/*
* Posicionar ventana.
* Al indexar, posicionamos la ventana a la izquierda, arriba
*/
function posicionarVentana() {
	this.window.moveTo(1,1);
	this.window.resizeTo(720,850);
}

/*
* Abrir Pop-up  de formulario cambio orden 
*/
function cambiarNorden(nordenV, terminoID, padre, termino) {
	var myurl = DEDALO_LIB_BASE_URL + '/ts/ts_norden.php?nordenV='+nordenV+"&padre="+padre+"&terminoID="+terminoID+"&termino="+termino ;
	window.open(myurl,'','status=yes,scrollbars=yes,resizable=yes,width=450,height=200');
}


function newLang(val) {
	// nothing to do. Only capture standar call	
	var currentURL = window.location.href; 		//alert(currentURL)
	
	//myregexp = /&ts_lang=/;	
	
	//var ar = currentURL.split("&ts_lang=");
	//window.location.href = ar[0] + '&ts_lang='+val ;
	
	window.location.href = currentURL + '&ts_lang='+val ;
}










