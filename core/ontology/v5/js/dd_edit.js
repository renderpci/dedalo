/*global page_globals, SHOW_DEBUG, data_manager, terminoID, id */
/*eslint no-undef: "error"*/

/******** DOM READY ****************/
$(function() {

	loadDescriptorsGrid();
	cargarTSrel(terminoID);
	opcionesND();

	$('#termino_'+id).focus();
});



const descriptors_trigger = 'trigger.descriptors_dd.php';


// JSON editors. Filled in page html
	var propiedades_editor	= null
	var properties_editor	= null



/**
* EDIT_ts
* Save form data using trigger.dd.php
*/
function edit_ts(formObj, e) {
	e.preventDefault();

	// descriptors check main value
		const input_term_descriptors = document.getElementById('termino_' + id)
		if (input_term_descriptors.value.length < 1) {
			alert(debe_introducir_el_tesauro_title);
			$("#termino_"+id).focus();
			return false
		}

	// parent input check value
		if (formObj.parent.value.length < 1) {
			alert(debe_introducir_title + " "+ padre_title + "\n ex. es1" );
			formObj.parent.focus();
			return false
		}

	// JSON editors check valid values (null is a valid value)
		const json_editors = ['propiedades','properties']
		for (let i = 0; i < json_editors.length; i++) {
			const editor_name	= json_editors[i] +'_editor'
			const editor		= window[editor_name]
			if (!editor) {
				console.error("JSON editor not found:", editor_name);
				alert("Error. JSON editor not found")
				return false;
			}
			try {
				editor.validate()
				editor.get()
			}catch(error){
				formObj.parentNode.classList.add("bg_error")
				console.warn("error:",error);
				setTimeout(function(){
					alert("The JSON editor value is invalid and will not be saved. Name: "+editor_name+" \n"+error);
					formObj.parentNode.classList.remove("bg_error")
				}, 150)
				return false;
			}
		}

	// form_data
		const formData		= new FormData(formObj);
		const form_data		= {}
		for (const pair of formData.entries()) {
			if (json_editors.includes(pair[0])) {
				// JSON editors. get value as JSON, not as text
				try {
					const editor = window[pair[0] +'_editor']
					form_data[pair[0]] = editor.get()
				}catch(error){
					form_data[pair[0]] = null // will be changed by
					console.warn("error:",error);
					alert("The JSON editor value is invalid and will not be saved. Name: " + pair[0] +"_editor \n" + error);
					return false;
				}
			}else{
				form_data[pair[0]] = pair[1]
			}
		}

	formObj.classList.add("loading")

	// request to trigger using JSON format
		data_manager.request({
			url		: 'trigger.dd.php',
			body	: {
				mode		: 'edit_ts',
				form_data	: form_data
			}
		})
		.then(function(response){
			console.log('---- edit_ts response ',response)

			formObj.classList.remove("loading")

			if (response.result!==true) {
				// error case
				console.warn("response:",response);
				alert(response.msg || 'Undefined error');
			}else{
				// OK
				// window.opener actions
					if (window.opener) {
						const form_data = response.form_data
						if (form_data.esdescriptor==='no') {
							window.opener.openDivTrack(form_data.parent, 1, form_data.parent);
						}else if(form_data.parent!==form_data.parentInicial) {
							// metemos en la cookie que abra el nuevo parent y luego recargaremos.
							// Actualiza la antigua ubicación
							window.opener.openDivTrack(form_data.parentInicial, 1, form_data.terminoID);
							// Actualiza la nueva ubicación
							window.opener.openDivTrack(form_data.parent, 1, form_data.terminoID);
							// location.reload();
						}else if (form_data.parent===form_data.prefix+'0'){
							window.opener.location.reload();
							// window.close();
							// history.back()
						}else{
							// Reload only de parent div
							window.opener.openDivTrack(form_data.parent, 1, form_data.terminoID);
							// window.close();
							// history.back()
						}
					}
				// update window_docu if is opened
					if (typeof window_docu!=='undefined') {
						window_docu.location.reload()
					}
			}
		})
		.catch((error) => {
			formObj.classList.remove("loading")
			console.error('Error:', error);
		});


	return false;
}//end edit_ts



/**
* VERIFICARDESCRIPTOR
*/
function verificarDescriptor(valor) {

	// Comprobamos si tiene hijos
	if( (nHijos >= 1) && valor == 'no')	{
		form1.esdescriptor.value= 'si' ;
		form1.esdescriptor.focus();
		alert(un_termino_con_hijos_title);
	}
	// Comprobamos si está relacionado con otros descriptores
	if( (hasRelation == 'si') && valor == 'no')	{
		form1.esdescriptor.value= 'si' ;
		form1.esdescriptor.focus();
		alert(un_termino_con_descriptores_title);
	}
	// Verificamos que no depende del nivel 0
	if( (parent=='ts0' || parent=='tp0') && valor == 'no') {
		form1.esdescriptor.value= 'si' ;
		form1.esdescriptor.focus();
		alert(un_no_descriptor_ha_de_depender_title);
	}

	// actualizamos la visualización
		const valSelectEsdescriptor = $('#esdescriptor').val()
		if( valSelectEsdescriptor === 'si')	{
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
	const div_rel			= document.getElementById("div_rel")
	const accion			= 'linkTS'
	const terminoIDactual	= terminoID
	const mydata			= {
		accion				: accion,
		terminoID			: terminoIDactual,
		terminoID_to_link	: terminoID_to_link,
		top_tipo			: page_globals.top_tipo
	}

	div_rel.innerHTML = '<div><img src="../themes/default/spinner.gif" alt="Wait" align="absmiddle"/></div>'

	$.ajax({
		url		: myurl,
		data	: mydata,
		type	: "POST",
		cache	: false,
		async	: false
	})
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
			top_tipo			: page_globals.top_tipo
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
	const current_terminoID = terminoID;

	if(typeof id==='undefined') {
		alert("global var id is not available : "+id)
		return false
	}

	// DescriptorsGrid
		const tbodyDescriptorsGrid = document.getElementById('tbodyDescriptorsGrid')
		tbodyDescriptorsGrid.classList.add('spinner');

	const data	= {
		mode		: 'loadDescriptorsGrid',
		id			: id, // is set in page
		terminoID	: current_terminoID,
		top_tipo	: page_globals.top_tipo
	}
	// AJAX CALL
	const js_promise = $.ajax({
		url		: "trigger.descriptors_dd.php",
		data	: data,
		type	: "GET"
	})
	.done(function(response) {

		const html = response

		// Clean target_node
			while (tbodyDescriptorsGrid.firstChild) {
				tbodyDescriptorsGrid.removeChild(tbodyDescriptorsGrid.firstChild);
			}
			tbodyDescriptorsGrid.insertAdjacentHTML('afterbegin', html)

		if(SHOW_DEBUG===true) {
			if(typeof id_focus!=='undefined') {
				console.log("->Exec loadDescriptorsGrid id_focus: "+id_focus)
			}
		}

		// RELATIONS : Trigger load relations
		//cargarTSrel(terminoID);

		// redimensionarVentana();
	})
	.fail(function(jqXHR, textStatus) {
		//alert("loadDescriptorsGrid error : "+textStatus)
	})
	.always(function() {
		tbodyDescriptorsGrid.classList.remove('spinner')
		if(typeof id_focus!=='undefined') {
			const el = document.getElementById('termino_'+ id_focus)
			if (el) {
				el.focus()
			}
		}
	});

	return js_promise
}//end loadDescriptorsGrid



/**
* REMOVEDESCRIPTOR
* @return promise
*/
function removeDescriptor(id, terminoID) {

	// mandatory vars check
		if(!id || id<1 || !terminoID) {
			alert("Error on removeDescriptor. Invalid id or terminoID");
			return false
		}

	// user confirmation
		if(!confirm( esta_seguro_de_eliminar_registro_1_title )) {
			return false
		}

	// spinner lodaing
		const descriptors_node = document.getElementById("tbodyDescriptorsGrid")
			  descriptors_node.classList.add('spinner');

	// trigger vars
		const ajax_data = {
			mode		: 'removeDescriptor',
			id			: id,
			terminoID	: terminoID,
			top_tipo	: page_globals.top_tipo
		}

	// trigger request
		const js_promise = $.ajax({
			url			: descriptors_trigger,
			data		: ajax_data,
			type		: "POST",
			success		: function(response_msg) {
				if (response_msg==='OK') {
					// reload descriptors grid
					loadDescriptorsGrid();
				}else{
					console.warn("response_msg:",response_msg)
					alert(response_msg)
				}
			},
			complete	: function() {
				descriptors_node.classList.remove('spinner');
			}
		});//fin $.ajax

	return js_promise
}//end removeDescriptor



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
	return false;

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
* Get current term and recursive children as JSON object file
* @param HTMLElement button
* @param string terminoID
* @return promise
*/
const export_ontology = function(button, terminoID) {

	button.classList.add('loading')

	const data = {
		mode 		: 'export_ontology',
		terminoID	: terminoID
	}

	// AJAX CALL
	return $.ajax({
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
			obj_to_save	: received_data,
			data_type	: 'json',
			file_name	: 'ontology_' + terminoID,
			mime_type	: 'application/json'
		})
		link_obj.click()

		button.classList.remove('loading')
	})
	.fail( function(jqXHR, textStatus) {
		button.classList.remove('loading')
		console.log("Error:",textStatus);
		alert("Error on export_ontology");
	})
	.always(function() {

	});//fin $.ajax
}//end export_ontology



/**
* EXPORT_ONTOLOGY_CSV
* Get current term and recursive children as CSV file
* @param HTMLElement button
* @param string terminoID
* @return promise
*/
const export_ontology_csv = function(button, terminoID) {

	// columns base
		const columns = [
			'tipo',
			'model',
			'lg-spa', // add always Spanish
			// 'lg-eng',
			// 'lg-deu',
			// 'lg-fra',
			// 'lg-ita',
			// 'lg-ell',
			// 'lg-nep'
		]

	// get available langs list from lang selector
		let prompt_value = localStorage.getItem("export_csv_prompt_value");
		if (!prompt_value) {

			const langs_selector	= document.getElementById('SelectLangList')
			const option_values		= [...langs_selector.options].map(o => o.value)
			const langs				= []
			for (let i = 1; i < option_values.length; i++) {
				const lang = option_values[i].trim()
				if (lang.indexOf('lg-')===0 && lang!=='lg-spa') {
					langs.push(lang)
				}
			}
			prompt_value = langs.join(',')
		}

	// prompt user for output langs
		const langs_string = prompt('Select output langs', prompt_value)
		console.log('langs_string:', langs_string);
		if (!langs_string) {
			// user cancel action case
			return
		}
		// save user selection
		localStorage.setItem("export_csv_prompt_value", langs_string);

		// add selection to columns array
		const langs_selection = langs_string.split(',')
		columns.push(...langs_selection)
		console.log('Final columns:', columns);

	button.classList.add('loading')

	// AJAX CALL
	return $.ajax({
		url		: descriptors_trigger,
		type	: "POST",
		data	: {
			mode		: 'export_ontology',
			terminoID	: terminoID
		}
	})
	.done(function(received_data) {
		//console.log("received_data:",received_data);

		if (typeof received_data === 'string' || received_data instanceof String) {
			received_data = JSON.parse(received_data)
		}

		const csv_string = convert_json_to_csv(
			received_data,
			columns
		)
		// console.log('csv_string:', csv_string);

		const link_obj = build_download_data_link({
			obj_to_save	: csv_string,
			data_type	: 'csv',
			file_name	: 'ontology_' + terminoID,
			mime_type	: 'text/csv'
		})
		link_obj.click()

		button.classList.remove('loading')
	})
	.fail( function(jqXHR, textStatus) {
		button.classList.remove('loading')
		console.log("Error:",textStatus);
		alert("Error on export_ontology_csv");
	})
	.always(function() {

	});//fin $.ajax
}//end export_ontology_csv



/**
* CONVERT_JSON_TO_CSV
* Converts data from export_ontology_csv
* @param object data
* @array columns
* @return string csv_string
*/
const convert_json_to_csv = function(data, columns) {

	const format_value = function(value) {
		const safe_value = value.map(el => {
			return el.replace(/"/g, '""')
		})
		return '"' + safe_value.join('","') + '"'
		// return value.join(',')
	}

	const csv_items = []

	const data_length = data.length
	for (let i = 0; i < data_length; i++) {

		// header
		if(i===0) {
		  csv_items.push(
			format_value(columns)
		  )
		}

		// data item
		const item = data[i]

		const row = []

		// columns
		columns.forEach(column => {
			switch(true) {
			  case (column==='tipo'):
				// tipo
				row.push(item.tipo)
				break;
			  case (column.indexOf('lg-')===0):
				// lang
				const element = item.descriptors.find(el => el.lang===column && el.type==='term')
				const value = element
				  ? element.value
				  : ''
				row.push(value)
				break;
			  default: {
				const value = item[column] || ''
				row.push(value)
				break;
			  }
			}
		})
		csv_items.push(
			format_value(row)
		)
	}//end for

	// data_container DOM print
	const csv_string = csv_items.join('\n')


	return csv_string
}//end convert_json_to_csv



/**
* BUILD_DOWNLOAD_DATA_LINK
* @param object options
* @return HTMLElement link_obj
*/
const build_download_data_link = function(options) {

	// Options vars
	const obj_to_save	= options.obj_to_save
	const data_type		= options.data_type || 'json'
	const file_name		= options.file_name || 'download_file'
	const mime_type		= options.mime_type || 'application/json'

	// Label
	const label = file_name

	// content
	let content
	switch (data_type) {
		case 'csv':
			content = [obj_to_save]
			break;

		case 'json':
		default:
			content = [JSON.stringify(obj_to_save, null, 2)]
			break;
	}

	// Blob data
	const data = new Blob(content, {
		type	: mime_type,
		name	: 'file.' + data_type
	})

	// Build href from data
	const href = URL.createObjectURL(data)

	// link_obj
	const link_obj		= document.createElement("a")
	link_obj.href		= href
	link_obj.download	= file_name


	return link_obj
}//end build_download_data_link


