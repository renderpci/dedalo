// JavaScript Document

/*******************************
* OTRAS FUNCIONES GENERALES
*******************************/


// fake page_globals
	var page_globals = {
		modo		: 'tesauro_edit',
		top_tipo	: null
	}
	var SHOW_DEBUG = true;


/*
* GETVALUE : Recoge el valor GET dado al pasarle el nombre de la variable.
* Si no hay variable, devuelve 'null'
*/
function getValue(name) {
	var resultado ;
	try{
		name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
		var regexS = "[\\?&]"+name+"=([^&#]*)";
		var regex = new RegExp( regexS );
		var results = regex.exec( window.location.href );
		if( results == null )
			resultado = null ;
		else
			resultado = results[1];
	}catch(e){
		alert(e)
	}

	return resultado ;
}


/**
* ISARRAY
*/
function isArray(obj) {

	return obj.constructor == Array;
}



/*
* DD_ABRIRTSLIST
* Abrir listado de tesauro para hacer relaciones
*/
let relations_window = null;
function dd_abrirTSlist(modo,type) {

	// Already open
	if (relations_window) {
		if (relations_window.closed===false) {
			relations_window.focus()
			return false;
		}
	}

	const theUrl		= 'dd_list.php?menu=0&modo=' + modo +'&type=' + type ;
	const screenW		= screen.width
	const screenH		= screen.height
	const content_width	= 920;
	const left			= 0

	relations_window = window.open(theUrl ,'relations_window',`popup=yes,width=${content_width},left=${left},height=${screenH}`)
	if (relations_window) {
		relations_window.focus()
	}else{
		alert("Error focus window (openTSedit). \n\nPlease disable 'Block Pop-Up Windows' option in your browser ")
	}


	return relations_window
}//end dd_abrirTSlist



/**
* CREATE_DOM_ELEMENT
* Builds a DOM node baased on received options
*/
function create_dom_element(element_options){

	const element_type			= element_options.element_type
	const parent				= element_options.parent
	const class_name			= element_options.class_name
	const style					= element_options.style
	let data_set				= element_options.data_set
		if (typeof data_set==="undefined" && typeof element_options.dataset!=="undefined") data_set = element_options.dataset

	const custom_function_events= element_options.custom_function_events
	const title_label			= element_options.title_label
	const text_node				= element_options.text_node
	const text_content			= element_options.text_content
	const inner_html			= element_options.inner_html
	const id 					= element_options.id
	const draggable				= element_options.draggable
	const value					= element_options.value
	const src					= element_options.src
	const type					= element_options.type
	const name					= element_options.name
	const href					= element_options.href

	const element = document.createElement(element_type);

	// Add id property to element
	if(id){
		element.id = id;
	}

	// A element. Add href property to element
	if(element_type === 'a'){
		element.href = 'javascript:;';
	}

	// Add id property to element
	if(href){
		element.href = href;
	}

	// Class name. Add css classes property to element
	if(class_name){
		element.className = class_name
	}

	// Style. Add css style property to element
	if(style){
		for(let key in style) {
			element.style[key] = style[key]
			//element.setAttribute("style", key +":"+ style[key]+";");
		}
	}

	// Title . Add title attribute to element
	if(title_label){
		element.title = title_label
	}

	// Dataset Add dataset values to element
	if(data_set){
		for (let key in data_set) {
			element.dataset[key] = data_set[key]
		}
	}

	// Value
	if(value){
		element.value = value
	}

	// Click event attached to element
	if(custom_function_events){
		const len = custom_function_events.length
		for (let i = 0; i < len; i++) {
			let function_name 		= custom_function_events[i].name
			let event_type			= custom_function_events[i].type
			let function_arguments	= custom_function_events[i].function_arguments

			// Create event caller
			this.create_custom_events(element, event_type, function_name, function_arguments)
		}
		/*
			//element.onclick = function () { eval(click_event) };
			var function_name = click_event;	//'ts_object.test_name2'
			element.addEventListener("click", function(e){
				call_custom_function(function_name,this)
			}, false);
			}*/
	}//end if(custom_function_events){

	// Text content
	if(text_node){
		//element.appendChild(document.createTextNode(TextNode));
		// Parse html text as object
		if (element_type==='span') {
			element.textContent = text_node
		}else{
			let el = document.createElement('span')
				el.innerHTML = " "+text_node // Note that prepend a space to span for avoid Chrome bug on selection
			element.appendChild(el)
		}
	}else if(text_content) {
		element.textContent = text_content
	}else if(inner_html) {
		element.innerHTML = inner_html
	}


	// Append created element to parent
	if (parent) {
		parent.appendChild(element)
	}

	// Dragable
	if(draggable){
		element.draggable = draggable;
	}

	// Add id property to element
	if(src){
		element.src = src;
	}

	if (type) {
		element.type = type;
	}

	if (name) {
		element.name = name;
	}


	return element;
}//end create_dom_element



/**
* SAVE_DESCRIPTOR
* Used by list save term inline too
*/
function save_descriptor(input_node) {

	// input values
		const parent	= input_node.dataset.parent
		const lang		= input_node.dataset.lang
		const tipo		= input_node.dataset.tipo
		const dato		= input_node.value

	// check mandatory vars
		switch(true) {
			case typeof parent==="undefined" :
				alert(" parent data is not defined! \n Data is not saved! ")
				return Promise.resolve(false);
				break;

			case typeof lang==="undefined" 	:
				alert(" lang data is not defined! \n Data is not saved! ")
				return Promise.resolve(false);
				break;

			case typeof tipo==="undefined" 	:
				alert(" tipo data is not defined! \n Data is not saved! ")
				return Promise.resolve(false);
				break;
		}

	// terminoID is a page global. Verify
		if (typeof terminoID==='undefined') {
			alert("Sorry: global terminoID is not defined \n Data is not saved!")
			return Promise.resolve(false);
		}

	// form lock
		const form = document.getElementById("form1")
		if (form) {
			form.classList.add("loading")
		}

	return new Promise(function(resolve){

		// request to trigger using JSON format
		data_manager.request({
			url		: 'trigger.dd.php',
			body	: {
				mode		: 'save_descriptor',
				parent		: parent,
				lang		: lang,
				tipo		: tipo,
				dato		: dato,
				terminoID	: terminoID,
				top_tipo	: page_globals.top_tipo
			}
		})
		.then(function(response){
			console.log('---- dd_common save_descriptor response ',response)

			// form unlock
				if (form) {
					form.classList.remove("loading")
				}

			if (response.result!==true) {
				// ERROR case
					console.warn("response:",response)
					alert(response.msg || 'Undefined error')
			}else{
				// SUCCESS case
				// refresh tree from parent if opener
					if (window.opener && form.parent) {
						const parent_term = form.parent.value
						// Reload only de parent div
						window.opener.openDivTrack(parent_term, 1, terminoID)
					}

				// update window_docu if is opened
					if (typeof window_docu!=='undefined') {
						window_docu.location.reload()
					}
			}

			resolve(response)
		})
	})
}//end save_descriptor
