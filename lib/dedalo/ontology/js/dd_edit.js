// JavaScript Document

/******** DOM READY ****************/
$(function() {

	loadDescriptorsGrid();
	cargarTSrel(terminoID);
	opcionesND();

	$('#termino_'+id).focus();

});



const descriptors_trigger = 'trigger.descriptors_dd.php';



/**
* VALIDAR
*/
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
}//end validar



/**
* VERIFICARDESCRIPTOR
*/
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
}//end verificarDescriptor



/**
* OPCIONESND
* Si es NO descriptor, ocultamos las opciones de Términos relacionados
*/
function opcionesND() {
	if(esdescriptor!='si')	{
		$(trsND).css('display','none');
		redimensionarVentana()
	}
}//end opcionesND



/**
* TOOGLETBODYTS
*/
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
}//end ToogleTBODYts



/**
* CLOSETESAURUS
*/
function closeTesaurus() {
	try{
		if(relwindow){ relwindow.close() };
	}catch(e){
		alert(e)
	};
	//return false
}//end closeTesaurus



/**
* CARGARTSREL
* ajax terminos relacionados
*/
function cargarTSrel(terminoID) {

	const myurl		= 'dd_edit_rel.php'
	const div		= $('#div_rel');
	const mydata	= { 'terminoID': terminoID, 'top_tipo':page_globals.top_tipo};

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
}//end cargarTSrel



/**
* LINKTS
*/
function linkTS(terminoID_to_link) {

	const myurl				= 'dd_edit_rel.php'
	const div				= $('#div_rel')
	const accion			= 'linkTS'
	const terminoIDactual	= terminoID
	const mydata			= {
		accion				: accion,
		terminoID			: terminoIDactual,
		terminoID_to_link	: terminoID_to_link,
		top_tipo			: page_globals.top_tipo
	}

	$(div).html('<div><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle"/></div>');

	$.ajax({
		url		: myurl,
		data	: mydata,
		type	: "POST",
		cache	: false,
		async	: false
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
}//end linkTS



/**
* UNLINKTS
*/
function unlinkTS(terminoID_to_unlink, termino) {

	const myurl		= 'dd_edit_rel.php'
	const div		= $('#div_rel') ;
	const accion	= 'unlinkTS' ;
	termino			= my_urldecode(termino);

	// mensaje de confirmación
  	const r = confirm( seguro_que_quiere_desvincular_title + '\n\n ' + descriptor_title + ': ' + termino + '\n\n' )
  	if (r==true) {

		const mydata = {
			accion				: accion,
			terminoID			: terminoID,
			terminoID_to_unlink	: terminoID_to_unlink,
			top_tipo			:page_globals.top_tipo
		}
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
}//end unlinkTS



/**
* TS NOMBRE VERIFY codigoKeyup
*/
function codigoKeyUp(obj) {

	const termino = $(obj).val();

	if(termino.length<4) return false ;

	const myurl		= descriptors_trigger;
	const div		= $('#div_keyup') ;
	const mode		= 'codigoKeyUp' ;
	const mydata	= {
		mode		: mode,
		termino		: termino,
		terminoID	: terminoID,
		top_tipo	: page_globals.top_tipo
	}

	$.ajax({
		url			: myurl,
		data		: mydata,
		type		: "POST",
		beforeSend	: function(){
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
}//end codigoKeyUp



/**
* LOADDESCRIPTORSGRID
*/
function loadDescriptorsGrid( id_focus ) {

	// get page global 'terminoID'
	var current_terminoID = terminoID;

	if(typeof id == 'undefined') return alert("global var id is not available : "+id)

	var myurl 		= "dd_descriptors_grid.php" ;
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
}//end loadDescriptorsGrid



/**
* removeDescriptor
*/
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
}//end removeDescriptor



/**
* SAVEDESCRIPTOR
*/
function saveDescriptor(obj) {

	const parent	= obj.dataset.parent
	const lang		= obj.dataset.lang
	const tipo		= obj.dataset.tipo
	const dato		= obj.value

	// check vars
		switch(true) {

			case typeof parent === "undefined" :
				return alert(" parent data is not defined! \n Data is not saved! ")
				break;

			case typeof lang === "undefined" 	:
				return alert(" lang data is not defined! \n Data is not saved! ")
				break;

			case typeof tipo === "undefined" 	:
				return alert(" tipo data is not defined! \n Data is not saved! ")
				break;
		}

	// terminoID is a page global. Verify
		if (typeof terminoID === 'undefined') {
			return alert("Sorry: global terminoID is not defined \n Data is not saved!")
		}

	// form lock
		const form = document.getElementById("form1")
		form.classList.add("loading")

	// request
		return new Promise(function(resolve, reject){

			const data	= {
				mode		: 'saveDescriptor',
				parent		: parent,
				lang		: lang,
				tipo		: tipo,
				dato		: dato,
				terminoID	: terminoID,
				top_tipo	: page_globals.top_tipo
			}
			$.ajax({
				url		: descriptors_trigger,
				data	: data,
				type	: "POST"
			})
			.done(function(data_response) {
				
				if(data_response) alert(data_response);

				// update window_docu if is opened
					if (window_docu) {
						window_docu.location.reload()
					}

				resolve(data_response)
			})
			.fail( function(jqXHR, textStatus) {
				alert("saveDescriptor error : " + textStatus)
				reject(textStatus)
			})
			.always(function() {
				form.classList.remove("loading")				
			});
	})
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

	const myurl		= descriptors_trigger
	const div		= $('#tbodyDescriptorsGrid')
	const mode		= 'newDescriptor'
	const mydata	= { 
		mode			: mode,
		terminoID		: terminoID,
		terminoID_lang	: terminoID_lang,
		top_tipo		: page_globals.top_tipo
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
}//end redimensionarVentana



/**
* ADD_NEW_LANG
*/
const add_new_lang = function(select_obj) {

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
const export_ontology = function(terminoID) {

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
		//console.log("received_data:",received_data);

		if (typeof received_data === 'string' || received_data instanceof String) {
			received_data = JSON.parse(received_data)
		}

		const link_obj = build_download_data_link({
			obj_to_save : received_data,
			data_type   : 'json',
			file_name   : 'ontology_' + terminoID
		})
		link_obj.click()
	})
	.fail( function(jqXHR, textStatus) {
		console.log("Error:",textStatus);
		alert("Error on export_ontology");
	})
	.always(function() {

	});//fin $.ajax

	return true
}//end export_ontology



/**
* BUILD_DOWNLOAD_DATA_LINK
*/
const build_download_data_link = function(options) {

	const self = this

	// Options vars
	const obj_to_save 	= options.obj_to_save
	const data_type 	= options.data_type || 'json'
	const file_name 	= options.file_name || 'download_file'

	// Label
	const label = file_name	
	// Mime
	const mime_type = 'application/json'
	// Blob data
	const data = new Blob([JSON.stringify(obj_to_save, null, 2)], {
	    type: mime_type,
		name: 'file.json'
	})		
	
	// Build href from data
	const href = URL.createObjectURL(data)

	// link_obj
	const link_obj = document.createElement("a")
		link_obj.href 	   = href
		link_obj.download  = file_name	
	

	return link_obj
}//end build_download_data_link


