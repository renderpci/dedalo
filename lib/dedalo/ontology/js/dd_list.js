/**
* DD CLASS
*
*
*
*/
var dd = new function() {

	'use strict';

	
	this.trigger_url 		 = 'trigger.dd.php'
	this.descriptors_trigger = 'trigger.descriptors_dd.php'

	//this.cookieOpenDivs_dd_name = "cookieOpenDivs_dd_" + page_globals.modo
	

	// DOCUMENT READY
	$(function() {
	  
	   // OPEN COOKIE TRACKED DIVS
		if( cookieOpenDivsArray !== -1 && typeof terminoIDresalte !== 'undefined' ) {
			dd.openTrackedDivs(terminoIDresalte)
		}	
		
		// KEYBOARD FUNCIONS
		$("body").keydown(function(e){
			//console.log(e.ctrlKey, e.keyCode);	
		     
			// CONTROL + M (ctrlKey+77) SHOW/HIDE INSPECTOR
			if (e.ctrlKey===true && e.keyCode===77) { // m=77	 
				// do something
				dd.toggleModelo()
			}

			if (e.ctrlKey===true && e.keyCode===80) { // m=80 (P) 
				// Toggle properties
				dd.toggle_properties()
			}

			if (e.ctrlKey===true && e.keyCode===84) { // t=84	 
				// do something
				$( ".tesauro_button_show_tr" ).each(function( index ) {
				  //console.log( index + ": " + $( this ).text() );
				  const tipo = $(this).data('tipo')
				  multiToogle(tipo,'block','none')
				})     
			}
		});


		// SORT TR ORDER
		const button_show_tr_obj = $('.tesauro_button_show_tr');
		$(document.body).on('click', button_show_tr_obj.selector, function(e){
			
			 $( ".tesauro_tr_sortable" ).sortable({
				update: function( event, ui ) {
					
					// Recorremos los elementos li que contienen los valores
					const ar_childrens 	= $(this).contents().filter('li')			//if(SHOW_DEBUG===true) console.log( ar_childrens );				
					const len			= ar_childrens.length
					const ar_values		= []

					if(ar_childrens && len >0) for(let i=0; i<len ; i++) {
						
						// (SELECT BY NAME[value=i] IS IMPORTANT)
						let current_obj = ar_childrens[i]
						let modelo		= $(current_obj).data('modelo')
						let tipo		= $(current_obj).data('tipo')

						let value		= {}
						value[modelo]	= tipo

						if( value ) ar_values.push( value )
					}					
					
					const current_termino_id = $(this).data('termino_id')
					const dato 				 = ar_values;
					dd.update_tr_order(current_termino_id, dato, $(this))

				}//update
			});
			return false
		});
		

	});//end dom ready

	

	/**
	* validate_form
	*/
	this.validate_form = function() {
		return true
	}
	
	
	/*
	* OPENTRACKEDDIVS
	* Abrimos secuencialmente todos los divs cuyos terminoID estén contenidos en el array "openDivs"
	* Se inicia al cargar la página, tras leer la cookie
	*/
	this.openTrackedDivs = async function(terminoIDresalte) {

		const container = document.getElementById("tsTreeLOAD")
		container.classList.add("hide")

		const spinner = create_dom_element({
			element_type	: 'div',
			class_name		: 'loading_spinner',			
			parent			: container.parentNode
		})


		// Remove duplicates
		openDivs = uniq_fast(openDivs)
			//console.log(openDivs)

		const openDivs_length = (openDivs && openDivs.length)
			? openDivs.length
			: false
		
		// Loop
			if (openDivs_length && openDivs_length>0) {
				for(let x=0; x < openDivs_length ; x++) {
					if( typeof openDivs[x]!=='undefined' && openDivs[x].length>0 ) {

						const terminoID		= openDivs[x]
						const div_destino	= 'div_' + terminoID
						const slide			= 'block'
						
						const current_promise = await dd.load_tree(terminoID, div_destino, modo, slide, terminoIDresalte, null, null, null) // (terminoID, div_destino, modo, slide, terminoIDresalte, target, reloaded, parent)				
					}				
				}//end if(le!=-1) for(var x=0; x < le ; x++)
			}

		spinner.remove()
		container.classList.remove("hide")

		// OLD
			// // Create a deferred object
			// const dfd = $.Deferred()
			
			// // Add handlers to be called when dfd is resolved
			// dfd.done(function() {

			// 	// Loop
			// 	if(le>0) for(let x=0; x < le ; x++) {

			// 		if( typeof openDivs[x] !== 'undefined' && openDivs[x].length>0 ) {

			// 			var terminoID 	= openDivs[x],
			// 				div_destino = 'div_' + terminoID,
			// 				slide 		= 'block'
						
			// 			const current_promise = dd.load_tree(terminoID, div_destino, modo, slide, terminoIDresalte, null, null, null) // (terminoID, div_destino, modo, slide, terminoIDresalte, target, reloaded, parent)				
						
			// 		}							
					
			// 	}//end if(le!=-1) for(var x=0; x < le ; x++)
			// });//end done
			// //console.log(dfd)

			// // Resolve deferred obj
			// dfd.resolve()
	}//end dd.openTrackedDivs



	/**
	* TOGGLE MODELO
	*/
	this.visibleModelo = 0 ;
	this.toggleModelo = function() {
		if(this.visibleModelo==0){
			$('.btnModelo').show()
			this.visibleModelo = 1
		}else{
			$('.btnModelo').hide()
			this.visibleModelo = 0
		}
	};



	/**
	* TOGGLE properties
	*/
	this.visible_properties = 0 ;
	this.toggle_properties = function() {
		if(this.visible_properties==0){
			$('.div_properties').show()
			this.visible_properties = 1
		}else{
			$('.div_properties').hide()
			this.visible_properties = 0
		}
	};
	


	/**
	* EDIT_INLINE . Edit terms inline
	*/
	this.edit_inline = function(button_obj) {
		
		//if(ts_lang!='') return(alert(" Edit inline only in main lang... \n Use the button edit to modify translations.")) 
			
		var termino_span_obj		= $(button_obj),
			terminoID 				= termino_span_obj.attr('alt'),
			termino					= termino_span_obj.text() // extract only text
		
		var isTranslationPreview 	= function() {
			// verifica si el texto que se muestra es un preview para un término no traducido (con estilo <span class='unTranslated'>)
			var string 	= termino_span_obj.html()
			var reg 	= /^<span/
			var reg2 	= /^<mark/
			if(reg.test(string) || reg2.test(string)) {			
				return true
			}else{
				return false
			}
		}
		
		const input_field_html	= '<input class="input_field_inline" type="text" name="input_field_'+terminoID+'" id="input_field_'+terminoID+'" value="'+termino+'" title="To validate changes press enter" >'
		const close_img_html	= '<img   class="close_img_inline"   src="../themes/default/x-icon-orange.png" id="close_img_'+terminoID+'" >'
		
		// hide termino and add input field
		termino_span_obj.hide().after( input_field_html + close_img_html )
		
		const input_field_obj		= $('#input_field_'+terminoID)
		const close_img_obj		= $('#close_img_'+terminoID)
		
		$(input_field_obj, close_img_obj).hide().fadeIn(150).focus()
		
		$(close_img_obj).click(function() { // Close button
			save_sequence(false)
		});
		$(input_field_obj).keypress(function(event) {
			if ( event.which === 13 ) { // Enter ky is pressed				
				save_sequence()
			}
		});		
		$(input_field_obj).blur(function() {						  
			  save_sequence(false)
		});		
		
		function save_sequence(save) {
			
			// set and save content alert . If save id false, only remove input field
			// si el termino del input es igual al original no lo guardamos a menos que sea un preview de traducción	
			if(save!==false && (termino!=input_field_obj.val() || isTranslationPreview()===true) ) {			  
				
				dd.saveDescriptorFromList(input_field_obj, terminoID, input_field_obj.val() )
				
				termino_span_obj.html( input_field_obj.val() )
			}
			
			// remove element
			input_field_obj.remove()
			close_img_obj.remove()
			termino_span_obj.show(150)
		}

		return true		
	};//end edit_inline



	/**
	* MOSTRARINFO
	*/
	this.mostrarInfo = function(div,e,n) {

		const divTexto = document.getElementById("info")
		if(n==='n') divTexto = document.getElementById("infoN")
		
		if(divTexto.style.display==="block") {
			divTexto.style.display = "none"
		}else{
			// capturamos la posición del icono que envia la orden
			const posX = div.x + 18
			const posY = div.y + 15
			
			// posicionamos la caja
			divTexto.style.top 	= posY+'px'
			divTexto.style.left = posX+'px'
			
			divTexto.style.display = "block"
		}

		return true
	};//end mostrarinfo


	
	
	/**
	* LOAD_TREE
	* Carga el arbol jerárquico de Navegación temática
	* Si accion == buildTree lo construye completo
	* Si accion == list construye el primer nivel 
	* Si se llama con la función "dd.openTrackedDivs", construirá como "list" todos los divs almacenados en la cookie de forma recursiva
	*/
	this.last_parent=null;
	this.load_tree = function(terminoID, div_destino, modo, slide, terminoIDresalte, target, reloaded, parent) {

		//return alert('load_tree: \n\n terminoID:'+terminoID + ' \n div_destino:'+div_destino + "\n terminoIDresalte:"+terminoIDresalte+"\n modo:"+ modo+"\n accion:"+ accion+"\n target:"+ target)
		const div 	= document.getElementById(div_destino)
		const time 	= 110

		//console.log(div)
	
		if( !div ) {

			if( typeof terminoID==='undefined' || terminoID.length===0 ) return false
			//
			// Fijamos como cerrado el div actual.
			// Si NO existe el div, paso la orden de eliminarlo del listado de divs abiertos
			//
			actualizarPostAjax(terminoID,0)	//setTimeout("alert('No existe elemento "+terminoID+" ')",1000);

			return new Promise(function(resolve){
				resolve(false)
			})

		}else{
			
			const index = loadedDivs.indexOf(terminoID) // Find the index in array 'loadedDivs'
			
			//
			// asincronico : Por defecto, las cargas ajax serán sincrónicas, es decir, cuando acabe una empieza la siguiente.
			// En caso de abrir manualmente las flechas (target=manual), la haremos asincrónica para que la percepción del usuario sea mas fluida
			//			
			const my_async = (target==='manual') ? true : false
				//console.log("load_tree parent: "+parent);
			
			//
			// Si NO está en el array de loadedDivs, es que NO está cargado y por tanto ejecutamos el ajax
			//
			if(index === -1) {
				//alert(' load_tree 	\n terminoID:'+terminoID +' \n div_destino:'+div_destino + "\n terminoIDresalte:"+terminoIDresalte+"\n modo:"+ modo+"\n index:"+ index  )
			
				const divJQobj 	= $('#'+div_destino); // objeto div reconocible por jquery
				const accion	= 'listadoHijos';
				const mydata	= { 
						accion				: accion,
						modo				: modo,
						terminoID			: terminoID,
						terminoIDresalte 	: terminoIDresalte,
						ts_lang 			: ts_lang,
						type 				: type
					 };
				
				//if(modo==="buildTree") {
					//$(divJQobj)
					// .html('<div id="spinnerDiv"> Building Thesaurus  <br> <img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /><br> Please wait</div>')
				//}else{
					//$(divJQobj)
					 //.html('<div style="margin-left:55px"><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /></div>')
					 //.css({'display':'block'})
				//}

				// AJAX CALL
				//jQuery.ajaxQueue({
				//$.ajaxq ("MyQueue", {
				return $.ajax({
					url		: this.trigger_url,
					data	: mydata,
					type	: 'GET',
					// async	: my_async,
					success : function( data_response ) {
						if(accion==="buildTree") {
							//$(divJQobj).hide();
							$(divJQobj)
								.css({'background-color':'#CCC'})
								.fadeIn(time)
							//$(divJQobj).fadeIn(time);
						}else{
							//$(divJQobj).hide();
							$(divJQobj).html(data_response)

							if(slide==='block'){
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
				// DONE					
					// .done(function(data_response) {
						
					// 	if(accion==="buildTree") {
					// 		//$(divJQobj).hide();
					// 		$(divJQobj)
					// 			.css({'background-color':'#CCC'})
					// 			.fadeIn(time)
					// 		//$(divJQobj).fadeIn(time);
					// 	}else{
					// 		//$(divJQobj).hide();
					// 		$(divJQobj).html(data_response);
					// 		// Fijamos como abierto el div actual
					// 		actualizarPostAjax(terminoID,1);

					// 		if(slide==='block'){
					// 			$(divJQobj).css({'display':'block'}); // se usa sólo al cargar la página
					// 		}else{
					// 			$(divJQobj).slideDown(time, function(){ });
					// 		}
					// 	}//if modo=="list"
					// 	//return 1;
						
					// })
					// .always(function() {
					// });
			
			}//if(index==-1)
			
		}//if(div==null)
	}//end load_tree



	/**
	* ACTUALIZARLIST : Actualiza la rama recibida (desde le parent hacia abajo)
	*/
	this.actualizarList = function(parent, current_terminoID) {
		
		// Reset all resalted termns
		$('.resalte').first().removeClass('resalte')	

		// Set parent and term as not loaded in cookie 'loadedDivTrack' (accion=0)		
		const accion	= 0
		loadedDivTrack(parent,accion) // elimina parent como cargado en el array "loadedDivs"	
		loadedDivTrack(current_terminoID,accion) // elimina terminoID como cargado en el array "loadedDivs"
		
		// Force reset all loaded divs (empty array value)
		/*		
		remove_localStorage('cookieLoadedDivs_dd');// Reset cookie loaded divs
		remove_localStorage('cookieOpenDivs_dd');// Reset cookie loaded divs
		resetView();
		openDivs.length = 0;
		cookieOpenDivsArray.length = 0;
		loadedDivs.length = 0;
		cookieOpenDivsString = null;
		cookieOpenDivsArray.length = 0;
		*/
		loadedDivs.length = 0	//alert("parent:"+parent)

		// TREE : load tree from parent term to update only changed branch
		const div_destino		= 'div_' + parent
		const slide				= ''
		const terminoIDresalte	= current_terminoID
		const target			= 'manual'

		const current_promise = dd.load_tree(parent, div_destino, modo, slide, terminoIDresalte, target, null, parent)	// (terminoID, div_destino, modo, slide, terminoIDresalte, target, reloaded, parent)
	
		return current_promise
	};//end actualizarList



	/**
	* ToggleTS : Gestiona abrir y cerrar los divs a través de las flechas del termino
	*/
	this.ToggleTS = function( terminoID, accion, force, parent ) {

		const div_terminoID = document.getElementById('div_'+terminoID);
		const time 			= 110		
		//alert("ToggleTS \n\n terminoID:"+terminoID + " accion:"+accion + " modo:"+modo +" div_terminoID.style.display:"+ div_terminoID.style.display)

		if ( div_terminoID.style.display === "none" || force === 1 ) {  
			// ABRIMOS MANUALMENTE
				const x = loadedDivs.indexOf(terminoID) ; // buscamos este div en el array de divs cargados. Si existe, su contenido ya fué cargado		
				
				if(accion === 'abrir' && x === -1)	// si no hay cookie (x), cargamos los hijos de este termino
				{
					const div_destino 		= 'div_' + terminoID
					const slide				= ''
					const terminoIDresalte 	= ''
					const target			= 'manual'

					dd.load_tree(terminoID, div_destino, modo, slide, terminoIDresalte, target, null, parent) // (terminoID, div_destino, modo, slide, terminoIDresalte, target, reloaded, parent)		
									
				}else{								// Mostramos el contenido (los hijos) del termino acual (ya fueron cargados previamente, x==1)
					
					$('#div_'+terminoID).slideDown(time, function(){ })
				}
				
				// estado = 'open';
				flechasTSestado(terminoID,'open')
			
		} else {
			// CERRAMOS MANUALMENTE
				$('#div_'+terminoID).slideUp(time, function(){	
					div_terminoID.style.display = "none"								   
				});
				
				openDivTrack(terminoID,0) // Elimina terminoID como abierto en el array "openDivs"
				// estado = 'close';
				flechasTSestado(terminoID,'close') // fija el aspecto de las flechas
		}

		return true
	};//end ToggleTS



	/**
	* ADD_INDEX_COMMON
	*/
	this.add_index_common = function(obj) {
		/*
		console.log(editwindow);
		console.log(top.editwindow);
		console.log(parent.editwindow);
		console.log(window.opener.current_editwindow)		
		return 	
		*/

		// Editando desde tesauro edit términos relacionados		
		const terminoID = obj.dataset.termino_id

		window.opener.linkTS(terminoID)
		//linkTS(terminoID)
		
		return false
	};//end add_index_common



	/**
	* ADD_INDEX_COMMON
	*/
	this.add_index_common__OLD = function(obj) {

		// Editando en dedalo 4 para asignar relaciones
		if ( parent.page_globals.modo.indexOf("tesauro") === -1 ) {	
			// return alert("edit d4")	
			parent.tool_indexation.add_index(obj)

		// Editando desde tesauro edit términos relacionados
		}else{
			var terminoID = $(obj).data('termino_id')
			//return alert('Editando desde tesauro edit térmionos relacionados '+terminoID)
			window.opener.linkTS(terminoID)
		}
		return false;
	};//end add_index_common



	/**
	* UPDATE_TR_ORDER
	*/
	this.update_tr_order = function(terminoID, dato, obj) {
		//return alert( "Dato a pasar: \n"+terminoID+" \n"+JSON.stringify( dato ) )

		const myurl		= this.trigger_url
		const accion	= 'update_tr_order'
		const mydata	= { 
			accion		: accion,
			terminoID	: terminoID,
			dato		: dato,
			top_tipo	: page_globals.top_tipo
		  }

		// AJAX REQUEST
		return $.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST",
			dataType	: "html"
		})
		// DONE
		.done(function(data_response) {
			
			// Search 'error' string in response
			const error_response = /error/i.test(data_response)							

			// If data_response contain 'error' show alert error with (data_response) else reload the page
			if(error_response) {
				// Alert error
				alert("[update_tr_order] Request failed: \n" + data_response + $(data_response).text() )
			}else{			
				//alert("Ok. TR order updated! "+data_response)
				//console.log(obj)
				$(obj).fadeOut(0).fadeIn(150)
			}
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[update_tr_order] Request failed: " + textStatus
			alert( msg )
		})
		// ALWAYS
		.always(function() {
		})
	}//end update_tr_order



	/**
	* OPENTSEDIT : Abre la ventana de edición del termino (ts_edit.php)
	*/
	var editwindow;	
	this.openTSedit = function(terminoID) {

		const host = window.location.hostname
			//console.log(host);
			
		if (host!=='master.render.es' && /^192.168./.test(host)===false) {	// 
			//alert("Warning: You are editing not oficial structure");
			//if(!confirm(" WARNING! \n\nYou are editing a not master structure and the changes made now will be lost after import a new structure data. \n\n Continue? \n")) {
			//	return false
			//}
		}
		
		//alert('terminoID:'+terminoID+' parent:'+parent)	
		const theUrl 	 = "dd_edit.php?terminoID="+terminoID
		const editwindow = window.open(theUrl ,'editwindow','status=yes,scrollbars=no,resizable=yes,width=740,height='+screen.height)
		//if (newwindow) newwindow.moveTo(-10,1);
		
		if (editwindow) {

			const screenW = screen.width
			const screenH = screen.height		
			editwindow.moveTo(screenW-740,0)

			editwindow.focus()
		}else{
			alert("Error focus window (openTSedit). \n\nPlease disable 'Block Pop-Up Windows' option in your browser ")
		}
		
		return true
	}//end opentsedit



	/*
	* GO2TERMINO : Busca el termino seleccionado y recarga la página con la selección
	* Debe abrir todos sus padres secuenciamete y luego remarcar el término
	*/
	this.go2termino = function(terminoID) {
		//alert("go2termino: "+terminoID +"	\n"+modo)
		const myurl 	= this.trigger_url + "?modo="+modo+"&terminoID="+terminoID+"&accion=searchTSform"
		window.location = myurl

		return true
	}//end go2termino



	/*
	* DELETE_TERM : Petición AJAX borrado Tesauro
	*/
	this.delete_term = function(divContTesauroID, terminoID, children, indexaciones, parent, termino) {
		//return alert('function delete_term\n\n divContTesauroID:' + divContTesauroID + '\n terminoID:' + terminoID + '\n children:'+ children + '\n indexaciones:' + indexaciones + '\n parent:' + parent + '\n termino:' + termino)
		
		if(children !== 0) {
			return alert( el_descriptor_tiene_hijos_title )
		}
		if (indexaciones > 0){
			return alert( el_descriptor_tiene_indexaciones_title )
		}
			
		termino = urldecode(termino)
		termino = termino.replace(/(<([^>]+)>)/ig,"")
		
		const r=confirm( seguro_que_quiere_borrar_este_termino_title  + "\n\n" +  termino + "\nID: "+ terminoID + "\n" + hijos_title +': ' + children + "\n\n"  )
		if( r !== true ) return false
				
		const divObj = $('#'+divContTesauroID)
		if ($(divObj).length !== 1) {
			return alert("delete_term: Element "+ divContTesauroID + " unavalible!")
		}		
		
		const mydata = { 
			accion		: 'deleteTS',
			modo		: modo,
			terminoID	: terminoID,
			children	: children,
			top_tipo	: page_globals.top_tipo
		};

		const current_promise = $.ajax({
			url			: this.trigger_url,
			data		: mydata,
			type		: "POST",
			//async		: false
		})
		// DONE
		.done(function(data_response) {
			//divObj.html(received_data);							
			switch(data_response) {
				// Case tree
				case 'ok_tree': divObj.html('<div class=\"ok\"> Deleted ' + termino + ' (' + terminoID +') ok ! </div>')
								//setTimeout('window.location=\"?modo=' + modo + '\"',1000);
								setTimeout( function() {
									divObj.remove()
								},1500 )
								break

				// Other case (Error mesages)
				default: 		return alert("Error: \n" + data_response)
			}
			// Elimina las cookies que empiezan por .. (component_autocomplete_ts)
			// Fuerza a actualizar los datos del componente 'component_autocomplete_ts'
			clear_some_local_storage('component_autocomplete_ts');
		})
		// FAIL ERROR
		.fail(function(jqXHR, textStatus) {
			console.log(textStatus)
		})
		// ALWAYS
		.always(function() {
		})

		return current_promise
	};//fin function delete_term



	/**
	* INSERTTS : Petición AJAX insert Tesauro
	*/
	this.insertTS = function(termino_id, hijosD, parent2) {
		//return false; // DESACTIVA	
		//alert('function insertTS \n parent:' + parent  )
		
		const divContTerminoID 	= 'divCont' + termino_id
		const divObj	 		= document.getElementById('divCont' + termino_id)
		
		if( $(divObj).length!==1 ){			
			return alert("Element "+ divContTerminoID + " unavalible! "+$(divObj).length)		
		}			
			
		const mydata = {
				'accion'	: 'insertTS',
				'modo'		: modo,
				'parent'	: termino_id,
				'top_tipo'	: page_globals.top_tipo
				};//return console.log(modo) 
		
		const current_promise = $.ajax({
			url		: this.trigger_url,
			data	: mydata,
			type	: 'POST',
			//async	: false,	// Important async = false
		})
		// DONE
		.done(function(data_response) {

			const error_response = /error/i.test(data_response)

			if (error_response) {
				// Alert error
				return alert(data_response)
			}else{
				// data_response expected is terminoID like 'dd526'
				const new_terminoID = data_response

				// Open ts edit window
				dd.openTSedit(new_terminoID,termino_id)

				// Update parent (always)
				dd.actualizarList(parent2)
			}
		})
		// FAIL ERROR
		.fail(function(jqXHR, textStatus) {
			console.log(jqXHR)
			alert(textStatus)
		})
		// ALWAYS
		.always(function() {
		})
			
		return current_promise
	};//end insertTS



	/**
	* SAVEDESCRIPTORFROMLIST
	*/
	this.saveDescriptorFromList = function(obj, terminoID, termino) {
		
		if(typeof terminoID==='undefined' || terminoID.length <2) {
			alert("Error on saveDescriptorFromlist. Need a valid terminoID")
			return false
		}

		$(obj).addClass('spinner')

		const descriptors_trigger	= 'trigger.descriptors_dd.php';		
		const dato					= termino
		const lang					= ts_lang // defined as const in ts_list.phtml

		const data	= {
			mode		: 'saveDescriptor',
			parent		: terminoID,
			lang		: lang,
			tipo		: 'termino',
			dato		: dato,
			terminoID	: terminoID,
			top_tipo	: page_globals.top_tipo
		}
		
		const current_promise = $.ajax({
			url		: descriptors_trigger,
			data	: data,
			type	: "POST"
		})
		.done(function(data_response) {			
			if(data_response) alert(data_response);
		})
		.fail( function(jqXHR, textStatus) {
			alert("saveDescriptorFromList error : "+textStatus)
		})
		.always(function() {
			$(obj).removeClass('spinner')
		});

		// OLD CODE
			// const current_div = $(obj)

			// current_div.addClass('spinner')
			
			// const trigger_url = this.trigger_url
			// const mydata = {
			// 	accion		: 'saveDescriptorFromList',
			// 	terminoID	: terminoID,
			// 	termino		: termino,
			// 	ts_lang		: ts_lang,
			// 	top_tipo	: page_globals.top_tipo || null
			// }

			// if(SHOW_DEBUG===true) {
			// 	console.log("saveDescriptorFromList trigger_url, mydata",trigger_url, mydata)
			// }

			// $.ajax({
			// 	url	 : trigger_url,
			// 	data : mydata,
			// 	type : "POST",
			// })
			// // DONE
			// .done(function(data_response) {
			// 	if(SHOW_DEBUG===true) {
			// 		console.log("saveDescriptorFromList data_response:",data_response)
			// 	}
			// })
			// // FAIL ERROR
			// .fail(function(jqXHR, textStatus) {

			// })
			// // ALWAYS
			// .always(function() {
			// 	current_div.removeClass('spinner')
			// })
		
		return current_promise
	}//end saveDescriptorFromList



	/**
	* CAMBIAR_N_ORDEN
	* Abrir Pop-up de formulario cambio orden 
	*/
	this.cambiar_n_orden = function(nordenV, terminoID, padre, termino) {
		const myurl = "dd_norden.php?nordenV="+nordenV+"&padre="+padre+"&terminoID="+terminoID+"&termino="+termino
		window.open(myurl,'','status=yes,scrollbars=yes,resizable=yes,width=450,height=200')

		return true
	}//end cambiar_n_orden



};//end component_dd class









//
// DIVS CARGADOS
//
var loadedDivs = []
remove_localStorage('cookieLoadedDivs_dd') // Reset cookie loaded divs


//
// DIVS ABIERTOS
//
var openDivs = []
if( get_localStorage('cookieOpenDivs_dd')===null || get_localStorage('cookieOpenDivs_dd')===-1 ) {
	//set_localStorage('cookieOpenDivs_dd','',7); 
	remove_localStorage('cookieOpenDivs_dd')// Reset cookie loaded divs
}


	

// COOKIEOPENDIVSSTRING : leemos el valor del cookie que está como string
var cookieOpenDivsString = get_localStorage('cookieOpenDivs_dd')

// COOKIEOPENDIVSARRAY : lo convertimos en array
var cookieOpenDivsArray		= []
if( cookieOpenDivsString!=='undefined'&& cookieOpenDivsString!==null) {
	// String to array
	cookieOpenDivsArray = cookieOpenDivsString.split(',')

	// COOKIEOPENDIVSARRAY : asignamaos sus valores al array openDivs
	if (cookieOpenDivsArray instanceof Array) {

		// Remove possible empty values
		cookieOpenDivsArray = cookieOpenDivsArray.filter(function(n){return n})

		openDivs = cookieOpenDivsArray
			//console.log(openDivs);
	}
}




/**
* MULTITOOGLE : TESAURO NAV Multi toogle 
*/
function multiToogle(divName, activa, desactiva) {

	const div = document.getElementById(divName)
	if(!div) {
	  alert(' Opss. Sorry: Beta function. ' + div1 +' - '+ activa +' - '+ desactiva )

	}else{
	  if (div.style.display === desactiva || div.style.display === '') {	  
			// $(div).slideDown(100, function(){	
				div.style.display = activa
				div.classList.add('activa')	
			// })
	  }else{
			// $(div).slideUp(100, function(){	
				div.style.display = desactiva
				div.classList.remove('activa')	
			// })
	  }
	}
}


/**
* LOADEDDIVTRACK : Tracking de divs cargados (1 cargado, 0 no cargado)
* Lleva un registro mediante cookie de los terminos abiertos
* Al cargar la página se resetea 
*/
function loadedDivTrack(terminoID,accion) {
	
	if(accion===1) {	// guardamos en el array "loadedDivs" el div abierto
	
		loadedDivs.push(terminoID) // añadimnos este terminoID al array de disvs cargados ("loadedDivs")				
		
	}else{		 		// localizamos y eliminamos en el array "loadedDivs" el div cerrado
		
		const index	= loadedDivs.indexOf(terminoID) // Find the index
		if(index!==-1) {
			loadedDivs.splice(index,1) // Remove it if really found!
				//console.log("removed index "+index+ " of terminoID:"+terminoID)
		}
		
	}
	//remove_localStorage('cookieLoadedDivs_dd');
	set_localStorage('cookieLoadedDivs_dd',loadedDivs,7) // actualizamos la cookie "cookieLoadedDivs"
		//alert(" funcion: loadedDivTrack \n array loadedDivs: "+loadedDivs + "\ncookie cookieLoadedDivs: " + get_localStorage('cookieLoadedDivs_dd') + "\naccion: " + accion )
	return true
}



/**
* OPENDIVTRACK : Tracking de divs abiertos en el termino (1 abierto, 0 cerrado)
* Lleva un registro mediante cookies de los terminos desplegados
* Al hacer búsquedas se resetea
*/
var resalte
function openDivTrack(terminoID, accion, resaltar) {
	
	//alert("funcion: openDivTrack \n array openDivs: "+openDivs + "\ncookie: " + get_localStorage('cookieOpenDivs_dd') + "\naccion: " + accion + "\n resaltar: " + resaltar)
	
	const r = resaltar
	
	if(accion==1) {	// guardamos en el array "openDivs" el div abierto
	
		openDivs.push(terminoID) // añadimnos este terminoID al array de divs abiertos ("openDivs")
		
	}else{		 	// localizamos y eliminamos en el array "openDivs" el div cerrado
		
		const index	= openDivs.indexOf(terminoID) // Find the index
		if(index!==-1) {
			openDivs.splice(index,1) // Remove it if really found!
		}	
	}
	
	// Actualizamos la cookie
	//remove_localStorage('cookieOpenDivs_dd');
	set_localStorage('cookieOpenDivs_dd',openDivs,7); // actualizamos la cookie "cookieOpenDivs"
	
	if(accion===1 && r!==null) {		
		resalte = r
		setTimeout(function() {
			const parent 			= terminoID
			const current_terminoID = resaltar

			dd.actualizarList(parent, current_terminoID)
		},25);	//alert(r) 		
	}

	return true ;	
}//end openDivTrack



/**
* ACTUALIZARPOSTAJAX : Actualiza el estado (cargado/abierto) del div recibido
* Tras cargarse mediante dd.load_tree, por ejemplo, queda como cargado y abierto
*/
function actualizarPostAjax(terminoID, cargadoObjeto) {
	
	if(cargadoObjeto===1) {

		loadedDivTrack(terminoID,1) // almacena terminoID como cargado en el array "loadedDivs"
		
		var index = openDivs.indexOf(terminoID) // Find the index
		if(index===-1){
			openDivTrack(terminoID,1) // almacena terminoID como abierto en el array "openDivs"
		}
		
		flechasTSestado(terminoID,'open')	// fija el aspecto de las flechas

	}else{

		loadedDivTrack(terminoID,0) // elimina terminoID como cargado en el array "loadedDivs"	
		
		const index = openDivs.indexOf(terminoID) // Find the index
		if(index!==-1)	{
			openDivTrack(terminoID,0) // elimina terminoID como abierto en el array "openDivs"
		}

		flechasTSestado(terminoID,'close') // fija el aspecto de las flechas
	}

	return true
}//end actualizarPostAjax



/**
* FLECHASTSESTADO : Estado de las flechas de apertura/cierre del termino
* Fija su apariencia en función del estado (open/close)
*/
function flechasTSestado(terminoID, estado) {

	const flechaOpen_name 	= 'fopen' + terminoID
	const flechaClose_name 	= 'fclose'+ terminoID
	
	const flechaOpen 	= document.getElementById(flechaOpen_name)
	const flechaClose 	= document.getElementById(flechaClose_name)

	if (flechaOpen && flechaClose) {
		if(estado==='open') {
		
			flechaOpen.style.display	= "none"; 	// ocultamos la flecha de abrir
			flechaClose.style.display	= "block";	// mostramos la flecha de cerrar		

		}else if(estado==='close') {			
			
			flechaOpen.style.display	= "block";	// mostramos la flecha de abrir
			flechaClose.style.display	= "none";	// ocultamos la flecha de cerrar			
		}else{
			console.warn("[flechasTSestado] invalid estado:",estado);
		}
	}else{
		console.warn("[flechasTSestado] invalid flechaOpen/flechaClose:",flechaOpen_name,flechaClose_name,estado,flechaOpen,flechaClose);
	}	


	return true
}//end flechasTSestado


















/*
function actualizaDivPadre(terminoID){

	alert("actualizaDivPadre ¿no usada?")
	
	var div = $('#divTsIcons'+ terminoID) ; //alert('actualizaDivPadre: ' +terminoID + ' #divCont'+ terminoID );
	var myURL	= "../ts/trigger.Tesauro.php";
	var accion	= 'reload';
	var mydata	= { 'accion': accion, 'terminoID': terminoID, 'top_tipo':page_globals.top_tipo };
	
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
		remove_localStorage('cookieOpenDivs_dd'); 
		//document.location"ts_list.php?modo=list";
	}catch(err){
		if(SHOW_DEBUG===true) alert(err)	
	}	
}
// RESET_WINDOW_AND_RELOAD : Elimina las cookies y recarga la página
function reset_window_and_reload() {
	resetView();
	let currentURL  = window.location.href
		currentURL  = currentURL.split( '&' )[0];
	window.location = currentURL;
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




function newLang(val) {
	// nothing to do. Only capture standar call	
	const currentURL = window.location.href; 		//alert(currentURL)
	
	//myregexp = /&ts_lang=/;	
	
	//var ar = currentURL.split("&ts_lang=");
	//window.location.href = ar[0] + '&ts_lang='+val ;
	
	window.location.href = currentURL + '&ts_lang='+val ;
}



function uniq_fast(a) {
    const seen = {};
    const out = [];
    const len = a.length;
    var j = 0;
    for(let i = 0; i < len; i++) {
         var item = a[i];
         if(seen[item] !== 1) {
               seen[item] = 1;
               out[j++] = item;
         }
    }
    return out;
}




