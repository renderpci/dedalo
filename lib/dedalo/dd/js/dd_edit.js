// JavaScript Document

/******** DOM READY ****************/
$(function() {

	loadDescriptorsGrid();
	cargarTSrel(terminoID);
	opcionesND();

	$('#termino_'+id).focus();

});

const descriptors_trigger = DEDALO_LIB_BASE_URL + '/dd/trigger.descriptors_dd.php';

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
	const valSelectEsdescriptor = $('#esdescriptor').val()
	if( valSelectEsdescriptor === 'si' )	{

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

	var myurl 		= DEDALO_LIB_BASE_URL + '/dd/dd_edit_rel.php'
	var div 		= $('#div_rel');
	var mydata		= { 'terminoID': terminoID, 'top_tipo':page_globals.top_tipo};

	//$(div).html('<div class=\"div_spinner_relations\"><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle" /></div>');

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
	.fail(function(jqXHR, textStatus) {
		//alert("cargarTSrel error "+textStatus)
	})
	.always(function() {
	});
}



/**
* LINKTS
*/
function linkTS(terminoID_to_link) {

	var myurl			= DEDALO_LIB_BASE_URL + '/dd/dd_edit_rel.php'
	var div 			= $('#div_rel')
	var accion			= 'linkTS' ;
	var terminoIDactual = terminoID ;
	var mydata			= { 'accion' 			: accion,
							'terminoID' 		: terminoIDactual,
							'terminoID_to_link' : terminoID_to_link,
							'top_tipo' 			: page_globals.top_tipo
						  }

	$(div).html('<div><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle"/></div>');

	$.ajax({
		url			: myurl,
		data		: mydata,
		type		: "POST",
		cache		: false,
		async		: false,
	})
	// DONE
	.done(function(data_response) {
		cargarTSrel(terminoID)
		//redimensionarVentana()
	})
	.fail( function(jqXHR, textStatus) {
		alert("linkTS error "+textStatus)
	})
	.always(function() {
	});
}


function unlinkTS(terminoID_to_unlink, termino) {

	var myurl			= DEDALO_LIB_BASE_URL + '/dd/dd_edit_rel.php'
	var div 			= $('#div_rel') ;
	var accion			= 'unlinkTS' ;
	termino 			= my_urldecode(termino);

	// mensaje de confirmación
  	var r=confirm( seguro_que_quiere_desvincular_title + '\n\n ' + descriptor_title + ': ' + termino + '\n\n' )
  	if (r==true) {

		var mydata		= { 'accion': accion , 'terminoID': terminoID , 'terminoID_to_unlink': terminoID_to_unlink, 'top_tipo':page_globals.top_tipo };
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
							//redimensionarVentana();
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

	var termino 		= $(obj).val();

	if(termino.length<4) return false ;

	var myurl 		= descriptors_trigger;
	var div			= $('#div_keyup') ;
	var mode		= 'codigoKeyUp' ;
	var mydata		= { 'mode': mode, 'termino': termino, 'terminoID': terminoID, 'top_tipo':page_globals.top_tipo };	//alert(terminoID) // var id from page vars

	$.ajax({
		url			: myurl,
		data		: mydata,
		type		: "POST",
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
}

// loadDescriptorsGrid
function loadDescriptorsGrid( id_focus ) {

	// get page global 'terminoID'
	var current_terminoID = terminoID;

	if(typeof id == 'undefined') return alert("global var id is not available : "+id)

	var myurl 		= DEDALO_LIB_BASE_URL + "/dd/dd_descriptors_grid.php" ;
	var div			= $('#tbodyDescriptorsGrid');
	var mode 		= 'loadDescriptorsGrid';
	var mydata		= { 'mode': mode, 'id': id, 'terminoID':current_terminoID, 'top_tipo':page_globals.top_tipo };// var id is set in page
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

		$(div).html(data_response)

		if(SHOW_DEBUG===true) {
			if(typeof id_focus!=='undefined') console.log("->Exec loadDescriptorsGrid id_focus: "+id_focus)
		}
		// RELATIONS : Trigger load relations
		//cargarTSrel(terminoID);

		redimensionarVentana();
	})
	.fail(function(jqXHR, textStatus) {
		//alert("loadDescriptorsGrid error : "+textStatus)
	})
	.always(function() {
		div.removeClass('spinner');
		if(typeof id_focus!=='undefined') $('#termino_'+ id_focus).focus();
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
		var mydata		= { 'mode': mode, 'id': id, 'terminoID': terminoID, 'top_tipo':page_globals.top_tipo };

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

	var parent 	= obj.dataset.parent
	var lang 	= obj.dataset.lang
	var tipo 	= obj.dataset.tipo
	var dato 	= obj.value

	switch(true) {

		case typeof parent === "undefined" :
			return alert(" parent data is not defined! \n Data is not saved! ")

		case typeof lang === "undefined" 	:
			return alert(" lang data is not defined! \n Data is not saved! ")

		case typeof tipo === "undefined" 	:
			return alert(" tipo data is not defined! \n Data is not saved! ")
	}

	// terminoID is a page global. Verify
	if (typeof terminoID === 'undefined') { return alert("Sorry: global terminoID is not defined \n Data is not saved!") }


	var myurl 		= descriptors_trigger //return alert(myurl)
	var div			= $(obj)
	var mode 		= 'saveDescriptor'
	var mydata		= { 'mode'		: mode,
						'parent'	: parent,
						'lang'		: lang,
						'tipo'		: tipo,
						'dato'		: dato,
						'terminoID' : terminoID,
						'top_tipo'	: page_globals.top_tipo
					}

	$.ajax({
		url			: myurl,
		data		: mydata,
		type		: "POST"
	})
	// DONE
	.done(function(data_response) {
		if(data_response) alert(data_response);
		//loadDescriptorsGrid()
		//if(SHOW_DEBUG===true) console.log("->Saved descriptor:" + tipo + " dato:" +dato)
	})
	.fail( function(jqXHR, textStatus) {
		alert("saveDescriptor error : "+textStatus)
	})
	.always(function() {
	});

}//end saveDescriptor



/**
* TS_EDIT_NEW_LANG
*/
function ts_edit_new_lang(terminoID_lang) {

	switch(true) {

		case terminoID_lang=='otro'	: return dd_abrirTSlist('tesauro_rel','lenguaje');
		case terminoID_lang=='' 	: return false;
	}
	//if(terminoID_lang=='otro') return abrirTSlist('tesauro_rel','lenguaje');
	//if(terminoID_lang==-1) return alert(" Error on newLang. Need a valid lang terminoID ");

	var myurl 		= descriptors_trigger
	var div			= $('#tbodyDescriptorsGrid')
	var mode 		= 'newDescriptor'
	var mydata		= { 'mode'			: mode,
						'terminoID'		: terminoID,
						'terminoID_lang': terminoID_lang,
						'top_tipo'		: page_globals.top_tipo
					  }

	$(div).addClass('spinner')

	$.ajax({
		url		: myurl,
		data	: mydata,
		type	: "POST"
	})
	// DONE
	.done(function(data_response) {
		loadDescriptorsGrid(data_response)
		redimensionarVentana()
	})
	.fail( function(jqXHR, textStatus) {
		alert("ts_edit_new_lang error : "+textStatus)
	})
	.always(function() {
		$(div).removeClass('spinner')
	});

}//end ts_edit_new_lang



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

	//$(function() {

		setTimeout( function() {

			 var w = $(window),
			 	 d = $(document),
			 	 b = $('body');

			var h1 = parseInt( b.height() - w.height() );
			var h2 = parseInt( (d.height() - w.height()) );
	//console.log(h1);
	//console.log(h2);
   			window.resizeBy(0, h2);

	   	 }, 100);
	//});
}


/**
* ADD_NEW_LANG
*/
var add_new_lang = function(select_obj) {

	const terminoID_lang = select_obj.value

	switch(true) {
		case (terminoID_lang==='otro') :
			return dd_abrirTSlist('tesauro_rel','lenguaje');
			break;
		case (terminoID_lang==='' || typeof(terminoID_lang)==='undefined') :
			return false;
			break;
	}

	// terminoID es un variable global fijada con anterioridad
	if(typeof terminoID==='undefined') {
		alert("global var terminoID is not available !")
		return false
	}

	const url 			= descriptors_trigger
	const target_div	= document.getElementById("tbodyDescriptorsGrid")
	const mode 			= 'newDescriptor'
	const mydata		= { mode 			: mode,
							terminoID		: terminoID,
							terminoID_lang 	: terminoID_lang,
							top_tipo		: page_globals.top_tipo || null
						  }; //console.log("mydata", url, mydata); // return;

	// Spinner ON
	target_div.classList.add('spinner')

	// AJAX CALL
	$.ajax({
		url		: url,
		data	: mydata,
		type	: "POST"
	})
	.done(function(received_data) {

		// Expected received_data is a int with new id created in table "matrix_descriptors_dd"

		// GRID : Reload descriptors
		loadDescriptorsGrid(received_data);
			//console.log(received_data)
		redimensionarVentana();
	})
	.fail( function(jqXHR, textStatus) {
		console.log("Error:",textStatus);
		alert("Error on add_new_lang");
		//top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " [id_matrix] " + id_matrix + "</span>" + textStatus );
	})
	.always(function() {
		// Spinner OFF
		target_div.classList.remove('spinner')
	});//fin $.ajax

	return true
}//end add_new_lang



/**
* EXPORT_ONTOLOGY
*/
var export_ontology = function(terminoID) {

	const data = {
		mode 		: 'export_ontology',
		terminoID	: terminoID
	}

	// AJAX CALL
	$.ajax({
		url		: descriptors_trigger,
		data	: data,
		type	: "POST"
	})
	.done(function(received_data) {

		console.log("received_data:",received_data);
	})
	.fail( function(jqXHR, textStatus) {
		console.log("Error:",textStatus);
		alert("Error on export_ontology");
	})
	.always(function() {

	});//fin $.ajax

	return true
}//end export_ontology

