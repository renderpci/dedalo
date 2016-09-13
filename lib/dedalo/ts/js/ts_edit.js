// JavaScript Document

/******** DOM READY ****************/
$(function() {
	
	loadDescriptorsGrid();
	//cargarTSrel(terminoID);
	opcionesND();	
	
	$('#termino_'+id).focus();
		
});

var descriptors_trigger = DEDALO_LIB_BASE_URL + '/descriptors/trigger.descriptors.php';

function validar(formObj) {
	
	var termino_id_val = $("#termino_"+id).val();	//alert(termino_id_val )
	
	if (termino_id_val.length < 1) {
     	alert(debe_introducir_el_tesauro_title);
	 	$("#termino_"+id).focus();	  
     	return (false);
  	}
	if (formObj.parent.value.length < 1) {
     	alert(debe_introducir_title + " "+ padre_title + "\n ex. es1" );
	 	formObj.parent.focus();	  
     	return (false);
  	}  
  return true; 
}

function verificarDescriptor(valor) {	
	// Comprobamos si tiene hijos
	if( (nHijos >= 1) && valor == 'no')
	{
		form1.esdescriptor.value= 'si' ;
		form1.esdescriptor.focus();	  
		alert(un_termino_con_hijos_title);		
	}
	// Comprobamos si está relacionado con otros descriptores
	if( (hasRelation == 'si') && valor == 'no')
	{
		form1.esdescriptor.value= 'si' ;
		form1.esdescriptor.focus();	  
		alert(un_termino_con_descriptores_title);		
	}
	// Verificamos que no depende del nivel 0 
	if( (parent=='ts0' || parent=='tp0') && valor == 'no')
	{
		form1.esdescriptor.value= 'si' ;
		form1.esdescriptor.focus();	  
		alert(un_no_descriptor_ha_de_depender_title);		
	}
	
	// actualizamos la visualización
	var valSelectEsdescriptor = $('#esdescriptor').val() ; //alert(valSelectEsdescriptor) 		
	if( valSelectEsdescriptor == 'si' )	{
		
		$(trsND).css('display','table-row');
		redimensionarVentana()
		
	}else{
		
		$(trsND).css('display','none');	
		redimensionarVentana()
	}
	
	return true
}


/*
* Si es NO descriptor, ocultamos las opciones de Términos relacionados
*/
function opcionesND() {	

	if(esdescriptor!='si')	{		
		$(trsND).css('display','none');
		redimensionarVentana()
	}
}




function ToogleTBODYts(divget) {

  div = document.getElementById(divget);
  if(div!=null && div.length>0) {  
  
	if(div.style.display == "none") {
		div.style.display = "table-row-group";
	}else{
	   div.style.display = "none";
	}	
  }
  redimensionarVentana();
}

function closeTesaurus() {
	try{
		if(relwindow){ relwindow.close() };
	}catch(e){ 
		alert(e)
	};
	//return false
}

/********************************
* AJAX TERMINOS RELACIONADOS
********************************/
function cargarTSrel(terminoID) {
	
	var myurl 		= DEDALO_LIB_BASE_URL + "/ts/ts_edit_rel.php" ;
	var div 		= $('#div_rel');
	var mydata		= { 'terminoID' : terminoID,
						'top_tipo'  : page_globals.top_tipo
					 };

	div.html('<div class=\"div_spinner_relations\"><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /></div>');

	// AJAX CALL
	$.ajax({
		url		: myurl,
		data	: mydata,
		type	: "GET"
	})
	// DONE
	.done(function(data_response) {
		$(div).html(data_response);
		redimensionarVentana();
	})			
	.fail( function(jqXHR, textStatus) {
		alert("cargarTSrel error on load TSrel : "+textStatus)
	})
	.always(function() {
	});
}

/**/
function linkTS(terminoID_to_link) {
	
	var myurl			= DEDALO_LIB_BASE_URL + "/ts/ts_edit_rel.php" ;
	var div 			= $('#div_rel') ;
	var accion			= 'linkTS' ;
	var terminoIDactual = terminoID ;
	var mydata			= { 'accion' 			: accion,
							'terminoID'			: terminoIDactual,
							'terminoID_to_link' : terminoID_to_link
						  };
	
	$.ajax({
		url			: myurl,
		data		: mydata,
		type		: "POST",
		cache		: false,
		async		: false,
		beforeSend	: function() {		
						div.html('<div><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /></div>');		
					},
		success		: function(data) {
						cargarTSrel(terminoID);
						redimensionarVentana();	
						//div.html(data);	alert("linkTS \n terminoID_to_link:" + terminoID_to_link + " \n data:" + data);						
					},
		complete	: function() {
					}
	});//fin $.ajax
}


function unlinkTS(terminoID_to_unlink, termino) {

	var myurl			= DEDALO_LIB_BASE_URL + "/ts/ts_edit_rel.php" ;
	var div 			= $('#div_rel') ;
	var accion			= 'unlinkTS' ; 
	termino 			= my_urldecode(termino);	
	
	// mensaje de confirmación	
  	var r=confirm( seguro_que_quiere_desvincular_title + '\n\n ' + descriptor_title + ': ' + termino + '\n\n' )
  	if (r==true) {
		
		var mydata		= { 'accion': accion , 'terminoID': terminoID , 'terminoID_to_unlink': terminoID_to_unlink };
		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: 'POST',
			cache		: false,
			async		: false,
			beforeSend	: function(data) {				
							div.html('<div><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /></div>');		
						},
			success		: function(data) {			
							cargarTSrel(terminoID); 
							redimensionarVentana();	
							//div.html(data);		alert(data);			
						},
			complete	: function() {
						}
		});//fin $.ajax
	}//fin if (r==true) 
}


/*
* TS NOMBRE VERIFY codigoKeyup
*/
function codigoKeyUp(obj) {
	
	var termino = obj.value;	
	
	if(termino.length<3) return false ;
		
	var myurl 		= descriptors_trigger
	var div			= $('#div_keyup')
	var mode		= 'codigoKeyUp'
	var mydata		= { 'mode'		: mode,
						'termino'	: termino,
						'terminoID' : terminoID
					  };
					  return console.log(mydata);
	
	$.ajax({
		url			: myurl,
		data		: mydata,
		type		: "POST"
	})
	// DONE
	.done(function(data_response) {
		//div.html(data);	
		if(data_response>0) {
			div.html(" Warning: <strong>"+termino+"</strong> already exists ");
			div.fadeIn(300);
		}else{
			div.html('');
			div.hide(0);	
		}
	})			
	.fail( function(jqXHR, textStatus) {
		alert("codigoKeyUp error "+textStatus)
	})
	.always(function() {			
	});
		/*
		beforeSend: function(){
						//div.html('<div><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /></div>');
						//div.addClass('spinner');		
					},
		success		: function(data) {
						//div.html(data);	
						if(data>0) {
							div.html(" Warning: <strong>"+termino+"</strong> already exists ");
							div.fadeIn(300);
						}else{
							div.html('');
							div.hide(0);	
						}
					},//success
		complete	: function() {
						//div.removeClass('spinner');	
						//div.html('');			
					}
				

		});//fin $.ajax
		*/
}

// loadDescriptorsGrid
function loadDescriptorsGrid(id_focus) {

	// get page global 'terminoID'
	var current_terminoID = terminoID;

	if(typeof id == 'undefined') return alert("global var id is not available : "+id)	
	
	var myurl 		= DEDALO_LIB_BASE_URL + '/ts/ts_descriptors_grid.php'
	var div			= $('#tbodyDescriptorsGrid')
	var mode 		= 'loadDescriptorsGrid'
	var mydata		= { 'mode' 		: mode,
						'id' 		: id,
						'terminoID' : current_terminoID
					  };// var id is set in page
		//return console.log('id:'+id)		
	
	div.addClass('spinner');

	// AJAX CALL
	$.ajax({
		url		: myurl,
		data	: mydata,
		type	: "GET"
	})
	// DONE
	.done(function(data_response) {

		$(div).html(data_response);
		redimensionarVentana(20);
		if (DEBUG) console.log("->Exec loadDescriptorsGrid id_focus:"+id_focus)
		// RELATIONS : Trigger load relations
		cargarTSrel(terminoID);
	})			
	.fail( function(jqXHR, textStatus) {
		alert("loadDescriptorsGrid error "+textStatus)
	})
	.always(function() {
		div.removeClass('spinner');	
		if(id_focus!=-1) $('#termino_'+ id_focus).focus();
	});
}

// removeDescriptor
function removeDescriptor(id, terminoID) {
	
	if(id<1) return alert("Error on removeDescriptor. Need a valid id");
	//return alert("delete "+id);
	
	var r=confirm( esta_seguro_de_eliminar_registro_1_title )
  	if (r==true) {
	
		var myurl 		= descriptors_trigger ;
		var div			= $('#tbodyDescriptorsGrid');			
		var mode 		= 'removeDescriptor';
		var mydata		= { 'mode': mode, 'id': id, 'terminoID': terminoID };	
		
		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST",
			beforeSend	: function() {
							div.addClass('spinner');						
						},
			success		: function(data) {						
							//div.html(data);
							loadDescriptorsGrid();
							redimensionarVentana();
						},
			complete	: function() {
							div.removeClass('spinner');				
						}
		});//fin $.ajax
	}
}

// saveDescriptor
function saveDescriptor(obj) {
	
	//if (DEBUG) console.log(obj); return false;

	var parent 	= $(obj).data('parent');
	var lang 	= $(obj).data('lang');
	var tipo 	= $(obj).data('tipo');
	var dato 	= $(obj).val();

	switch(true) {

		case typeof(parent) === "undefined" : alert(" parent data is not defined! \n Data is not saved! ");
		case typeof(lang) === "undefined" 	: alert(" lang data is not defined! \n Data is not saved! ");
		case typeof(tipo) === "undefined" 	: alert(" tipo data is not defined! \n Data is not saved! ");

		return false;
	}
	
	// terminoID is a page global. Verify
	if (typeof terminoID =='undefined') { return alert("Sorry: global terminoID is not defined \n Data is not saved!") };

	
	var myurl 		= descriptors_trigger ; //return alert(myurl)
	var div			= $(obj);			
	var mode 		= 'saveDescriptor';
	var mydata		= { 'mode': mode, 'parent': parent, 'lang': lang, 'tipo': tipo, 'dato': dato, 'terminoID': terminoID };		//alert(' mode:'+ mode + ' id:'+ id + ' termino:' + termino + ' def:' + def); return false;
		//return 	console.log(mydata);
		
	$.ajax({
		url			: myurl,
		data		: mydata,
		type		: "POST",
		beforeSend	: function() {
						//div.addClass('spinner');						
					},
		success		: function(data) {						
						if(data) alert(data);
						//loadDescriptorsGrid()
						if (DEBUG) console.log("->Saved descriptor:" + tipo + " dato:" +dato)
					},
		complete	: function() {
						//div.removeClass('spinner');							
					}
	});//fin $.ajax
}


// newLang
function ts_edit_new_lang(terminoID_lang) {
	
	switch(true) {

		case terminoID_lang=='otro'	: return abrirTSlist('tesauro_rel','lenguaje');
		case terminoID_lang=='' 	: return false;	
	}
	//if(terminoID_lang=='otro') return abrirTSlist('tesauro_rel','lenguaje');	
	//if(terminoID_lang==-1) return alert(" Error on newLang. Need a valid lang terminoID ");
	
	var myurl 		= descriptors_trigger ;
	var div			= $('#tbodyDescriptorsGrid');			
	var mode 		= 'newDescriptor';
	var mydata		= { 'mode': mode, 'terminoID': terminoID, 'terminoID_lang': terminoID_lang };	// var terminoID from page vars
	
	//alert('terminoID '+ terminoID + ' terminoID_lang '+ terminoID_lang)
	
	$.ajax({
		url			: myurl,
		data		: mydata,
		type		: "POST",
		beforeSend	: function() {
						div.addClass('spinner');						
					},
		success		: function(data) {
						loadDescriptorsGrid(data);			//alert(data);//alert(" Ok ");
						//$('#termino_'+ data).focus();					
					},
		complete	: function() {
						div.removeClass('spinner');
						redimensionarVentana();						
					}
	});//fin $.ajax
}


function myfocus(obj) {
	$(obj).addClass('inputFocus');
}
function myblur(obj) {
	$(obj).removeClass('inputFocus'); 	//alert("blur")		
}


/**
* REDIMENSIONARVENTANA
* By http://mchernyavska.wordpress.com/2013/05/30/javascript-resizing-a-window-to-fit-the-contents/
*/
function redimensionarVentana() {

	$(function() {	    

		setTimeout( function() {

			 var w = $(window),
			 	 d = $(document),
			 	 b = $('body');

			var h1 = parseInt( b.height() - w.height() );
			var h2 = parseInt( (d.height() - w.height()) );

   			window.resizeBy(0, ((b.height() - w.height()) || d.height() - w.height()));   			

	   	 }, 150);
	});
}


/**
* ADD_NEW_LANG
*/
var add_new_lang = function(select_obj) {

	var terminoID_lang = $(select_obj).val();
		//return console.log(terminoID_lang)
		
	switch(true) {
		case (terminoID_lang=='otro') : 
			return abrirTSlist('tesauro_rel','lenguaje');
			break;
		case (terminoID_lang=='' || typeof(terminoID_lang)=='undefined') :
			return false;
			break;	
	}

	// terminoID es un variable global fijada con anterioridad
	if(typeof terminoID == 'undefined') return alert("global var terminoID is not available : "+terminoID)		
		
	var url 		= this.descriptors_trigger ;
	var target_div	= $('#tbodyDescriptorsGrid');			
	var mode 		= 'newDescriptor';
	var mydata		= { 'mode': mode, 'terminoID': terminoID, 'terminoID_lang': terminoID_lang };	// var terminoID from page vars
	
	//return alert('terminoID '+ terminoID + ' terminoID '+ terminoID)
	target_div.addClass('spinner');
		
	// AJAX CALL
	$.ajax({
		url			: url,
		data		: mydata,
		type		: "POST"
	})
	.done(function(received_data) {
		// GRID : Reload descriptors
		loadDescriptorsGrid(received_data);
			//console.log(received_data)

		target_div.removeClass('spinner');
		redimensionarVentana();
	})
	.fail( function(jqXHR, textStatus) {
		alert("Error on add_new_lang");
		//top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " [id_matrix] " + id_matrix + "</span>" + textStatus );
	})
	.always(function() {				
		//html_page.loading_content( target_obj, 0 );
	});//fin $.ajax

}//end add_new_lang


/*-- GEOREFERENCIACIÓN --*/
/**
* ABRIR_MAPA
* Abre la ventana flotante del mapa (leaflet) para seleccinar coordenadas y asignarlas como valor al campo georeferenciacion
*/
var map_window  ;
function abrir_mapa(georeferenciacion_field_id) {
	georeferenciacion_field_id

	var theUrl = "../ts/ts_map.php?id="+georeferenciacion_field_id ;
	map_window = window.open(theUrl ,'map_window','status=yes,scrollbars=no,resizable=yes,width=720,height=555');

	try{	
		if(window.focus) {			
			screenW = screen.width;
			screenH = screen.height;		
			map_window.moveTo(0,0);	//alert(screenW +" " +screenH)			
			map_window.focus();		 
		}
	}catch(err){
		alert("Error focus window (map_window). \n\nPlease disable 'Block Pop-Up Windows' option in your browser ")
	}
}
/**
* SET_GEOREFERENCIACION
* Asigna el valor seleccionado en la ventana del mapa
* Llamar desde la página del mapa como: window.opener.set_georeferenciacion(georeferenciacion_field_id, georeferenciacion_valor_lat, georeferenciacion_valor_long);
*/
function set_georeferenciacion(georeferenciacion_field_id, georeferenciacion_valor_lat, georeferenciacion_valor_long) {
	//alert(georeferenciacion_valor_lat+","+georeferenciacion_valor_long)
	// Set field value
	$('#'+georeferenciacion_field_id).val(georeferenciacion_valor_lat+','+georeferenciacion_valor_long).focus();
	// Trigger input save event (onchange)
	$('#'+georeferenciacion_field_id).trigger( "onchange" );
}
