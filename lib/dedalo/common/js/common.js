//"use strict";
// JavaScript Document
//document.write('<scr'+'ipt src="'+DEDALO_LIB_BASE_URL+'/common/js/detectBrowser.js" async="async" type="text/javascript"></scr'+'ipt>');

//======================================================//
// multi browser compatibility - not all support console
//======================================================//
var dummyConsole = [];
var console = console || {};
if (!console.log) {
	console.log = function (message) {
		dummyConsole.push(message);
		//if (SHOW_DEBUG===true) console.log(message)
	}
}
/** @define {boolean} 
//var SHOW_DEBUG ;
if (typeof(SHOW_DEBUG)==="undefined") {
	var SHOW_DEBUG = false;
}
*/
function dump(message, name) {
	try{
		if (name) {
			console.log("-- "+name+":")
		}
		console.log(message)
	}catch(e){

	}
}



/**
* GET_INSTANCE
* @return 
*/
var instances;
var get_instance = function(object_data) {

	const name 			= object_data.name
	const id_wrapper 	= object_data.id_wrapper
	const data 			= object_data.init
	instances 			= []
	instances.push({id:0})

		console.log("name", name);
		console.log("id_wrapper", id_wrapper);

	var current_instance =  instances.filter(function(instance){
		if(instance.id == id_wrapper){
			return instance
		}else{
			return false
		}
	});
	if(current_instance === false){
		//current_instance = Object.create(name,{ id: { value: id_wrapper } })
			current_instance = Object.create(window[name],{ id: { value: id_wrapper } })
			instances.push(current_instance);
			current_instance.init(data);
	}

	console.log("instances",instances );
	console.log("current_instance", current_instance);
return current_instance;	
};//end get_instance



/**
* COMMON
*/
var common = new function() {


	this.trigger_url = DEDALO_LIB_BASE_URL + '/common/trigger.common.php';


	// TEST IF IS STRING
	this.isString = function (o) {
		return typeof o === "string" || (typeof o === "object" && o.constructor === String);
	}
	// TEST IF VALUE IS IN ARRAY
	this.inArray = function (  elem, array ) {
		return jQuery.inArray(elem, array);
	}
	// LOADJSCSSFILE
	/*
	this.loadjscssfile = function(filename, filetype) {
		if (filetype==="js"){ //if filename is a external JavaScript file
			var fileref=document.createElement('script')
			fileref.setAttribute("src", filename)
			fileref.setAttribute("type","text/javascript")
			fileref.setAttribute("charset","utf-8")
		}
		else if (filetype==="css"){ //if filename is an external CSS file
			var fileref=document.createElement("link")
			fileref.setAttribute("rel", "stylesheet")
			fileref.setAttribute("href", filename)
			fileref.setAttribute("type", "text/css")
			fileref.setAttribute("media", "screen")
		}
		if (typeof fileref!=="undefined")
			document.getElementsByTagName("head")[0].appendChild(fileref)
	}

	// CHECKLOADJSCSSFILE
	var filesadded=""; //list of files already added
	this.checkloadjscssfile = function(filename, filetype) {
	 if (filesadded.indexOf("["+filename+"]")==-1){
	  this.loadjscssfile(filename, filetype)
	  filesadded+="["+filename+"]" //List of files added in the form "[filename1],[filename2],etc"
	 }
	 else
	  if(SHOW_DEBUG===true) console.log("file already added!")
	}
	*/


	/**
	* JUMP_SELECT_LANG
	*/
	this.jump_select_lang = function(select_obj) {

		const type_of_lang 	= select_obj.dataset.type_of_lang
		const new_lang 		= select_obj.value

		var dedalo_application_lang = null
		var dedalo_data_lang 		= null
		if (type_of_lang==='dedalo_application_lang') {
			// Changes data and application langs synchronized
			dedalo_application_lang 	= new_lang;
			dedalo_data_lang 			= new_lang;
		}else if (type_of_lang==='dedalo_data_lang'){
			// DATA : Only change data lang and leave unsync application lang
			dedalo_data_lang 			= new_lang;
		}
		
		const trigger_url  = this.trigger_url
		const trigger_vars = {
				mode 					: 'change_lang',
				top_tipo				: page_globals.top_tipo,
				dedalo_application_lang : dedalo_application_lang,
				dedalo_data_lang 		: dedalo_data_lang
			  }		

		//return console.log("trigger_vars",trigger_vars,this.trigger_url);
		const html_page_wrap = document.getElementById("html_page_wrap")
		html_page.loading_content(html_page_wrap, 1)

		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(
			function(response){
				if(SHOW_DEBUG===true) {				
					console.log(response)
				}

				location.reload(false)

			},
			function(error) {
				//console.error("Failed search!", error);
				console.log(error);

				inspector.show_log_msg("<span class='error'>Error when jump_select_lang</span>");

				// Remove loading overlap
				html_page.loading_content(html_page_wrap, 0)
			})

		return js_promise		
	}//end jump_select_lang



	/**
	* GET_INNER_HTML
	* Get first div element and return only his content html (used for load bits of dom by ajax)
	*/
	this.get_inner_html = function( html_string ) {

		// DOM. Convert received html string to dom objects array
		var html 		  = $.parseHTML( html_string ),
			inner_content = null

		// Gather the parsed HTML's node names
		$.each( html, function( i, el ) {
			//console.log(el.nodeName);

			if (el.nodeName!=='DIV') return true;  // Skip nodes no div

			var contents 		= $(el).contents()		//console.log( contents );
				inner_content 	= $(contents.context).html()

			return false; // Stop loop
		});

		return inner_content
	}//end get_inner_html



	/**
	* SAFE_TIPO
	* @return string $tipo
	*/
	this.safe_tipo = function( tipo ) {

		const regex = /^[a-z]+[0-9]+$/gm;

		const m = regex.exec(tipo)
		if (!m) {
			return null
		}

		return tipo
	}//end safe_tipo


	/**
	* DD_EVENTSOURCE
	* @param object data
	*//*
	this.dd_EventSource = function( data ) {
		console.log(data);

		var vars_get='';
		for (var key in data.vars) {
		   if (data.vars.hasOwnProperty(key)) {
			  console.log(key, data.vars[key]);
			  vars_get += "&"+key+"="+data.vars[key];
		   }
		}
		var response_div = data.response_div

		var source = new EventSource( data.url + '?' + vars_get );
			//console.log(data.url + '?' + vars_get);

		// message
		source.addEventListener('message', function(e) {
					//console.log(e);

					msg = JSON.parse(e.data);
					//console.log(msg);

					// Notification msg ok
					response_div.innerHtml = msg;

					// END SCRIPT
					if(/ok/i.test(msg)) { //data_percent >= 100 ||
						// Close connection
						source.close();

						// Remove paginator div from edit window
						//paginator_div.remove()

						// Remove spinner
						//html_page.loading_content( wrap_div_tool, 0 );
					}

				}, false);

		// error
		source.addEventListener('error', function(e) {
			//console.log(e);

			// Close connection
			source.close();

			// Remove spinner
			//html_page.loading_content( wrap_div_tool, 0 );

			//alert("EventSource failed. "+ e );
			response_div.innerHtml = "<div class='error'>Sorry. Error on proccess data</div>";

		}, false);
	}//end dd_EventSource
	*//*
	this.dd_EventSource({
			"url":"http..",
			"vars":{"id":45},
			"stop":"ok",
			"response_div": document.getElementById('tool_replace_component_data_response'),
			"done":function(e){
						console.log(e);
					},
			"fail": function(e) {
						console.log(e);
					},
			"always": function(e) {
						console.log(e);
					}
			})
	*/



	/**
	* GET_PAGE_HEIGHT
	* Calculate max document height (window height + scroll)
	* @return int page_height
	*/
	this.get_page_height = function() {

		var body 		= document.body,
			html 		= document.documentElement,
			page_height = Math.max( body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight );

		return page_height;
	}



	/**
	* PRINT_RESPONSE
	*/
	this.print_response = function( response ) {

		return '<div class=\"log_messages_response\">'+response+'</div>';
	}



	/**
	* STOP_ALL_VIDEOS
	* Stop possible downloading videos on paginate, etc.
	* From https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Using_HTML5_audio_and_video
	*/
	this.stop_all_videos = function() {

		const ar_html5_videos = document.getElementsByTagName("video")
		if (ar_html5_videos) {
			const len = ar_html5_videos.length
			for (let i = len - 1; i >= 0; i--) {
				ar_html5_videos[i].pause();
				ar_html5_videos[i].src='';
				ar_html5_videos[i].removeAttribute("src");				
					//console.log("stoped video "+i);
			}
		}
	};//end stop_all_videos



	/**
	* GET_JSON
	* XMLHttpRequest to trigger
	* @return Promise
	*/
	this.get_json_data = function(trigger_url, trigger_vars, async, content_type) {
		
		const url = trigger_url;	//?mode=get_childrens_data';
		
		// ASYNC
		if (typeof async==="undefined" || async!==false) {
			async = true
		}
		
		const data_send = JSON.stringify(trigger_vars)
		//console.log("[get_json_data] data_send:",data_send); 
	
		// Create new promise with the Promise() constructor;
		// This has as its argument a function
		// with two parameters, resolve and reject
		return new Promise(function(resolve, reject) {
			// Standard XHR to load an image
			const request = new XMLHttpRequest();
				
				// Open connection as post					
					request.open("POST", url, async);

				//request.timeout = 30 * 1000 * 60 ; // time in milliseconds
				//request.ontimeout = function () {
				//    console.error("The request for " + url + " timed out.");
				//};
	
				// codification of the header for POST method, in GET no is necesary
					if (typeof content_type==="undefined") {
						content_type = "application/json"
					}
					request.setRequestHeader("Content-type", content_type); // application/json OR application/x-www-form-urlencoded				

				request.responseType = 'json';
				// When the request loads, check whether it was successful
				request.onload = function(e) {
				  if (request.status === 200) {
					// If successful, resolve the promise by passing back the request response
					resolve(request.response);
				  }else{
					// If it fails, reject the promise with a error message
					reject(Error('Reject error don\'t load successfully; error code: ' + request.statusText));
				  }
				};
				request.onerror = function(e) {			
				  // Also deal with the case when the entire request fails to begin with
				  // This is probably a network error, so reject the promise with an appropriate message
				  reject(Error('There was a network error. data_send: '+url+"?"+ data_send + "statusText:" + request.statusText));
				};

				// Send the request
				request.send(data_send);
		});
	};//end get_json



	/**
	* URLDECODE
	* Equivalent function to PHP urldecode in Javascript
	* @return string decoded_url
	*/
	this.urldecode = function(url) {
		let decoded_url = decodeURIComponent(url.replace(/\+/g, ' '))
		return decoded_url
	};//end urldecode



	this.addslashes = function (str) {
		return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
	}



	this.build_modal_dialog = function( options ) {		

		// modal_dialog
		let modal_dialog = document.createElement("div")
			modal_dialog.classList.add('modal-dialog')
			// Add options.modal_dialog_class
			if (typeof options.modal_dialog_class!=="undefined") {
				for (let i = options.modal_dialog_class.length - 1; i >= 0; i--) {
					modal_dialog.classList.add(options.modal_dialog_class[i])
				}
			}		
			modal_dialog.setAttribute("role", "document")
			// Add
			// div_note_wrapper.appendChild(modal_dialog)

		// modal_content
		let modal_content = document.createElement("div")
			modal_content.classList.add('modal-content')
			// Add
			modal_dialog.appendChild(modal_content)

			// modal_header
			let modal_header = document.createElement("div")
				modal_header.classList.add('modal-header')
				// Add
				modal_content.appendChild(modal_header)

				// modal_header <button type="button" class="close" data-dismiss="modal" aria-label="Close">
				let close = document.createElement("button")
					close.classList.add('close')
					close.dataset.dismiss = "modal"
					close.setAttribute("aria-label", "Close")
					// Add
					modal_header.appendChild(close)

				let span = document.createElement("span")
					span.setAttribute("aria-hidden", "true")
					let t = document.createTextNode("x")					 
					
					// Add
					span.appendChild(t)
					// Add
					close.appendChild(span)
				
				// Add options.header
				if (typeof options.header!=="undefined" && options.header) {
					modal_header.appendChild(options.header)
				}

			// modal_body
			let modal_body = document.createElement("div")
				modal_body.classList.add('modal-body')
				// Add
				modal_content.appendChild(modal_body)

				// Add options.body
				if (typeof options.body!=="undefined") {
					modal_body.appendChild(options.body)
				}

			// modal_footer	
			if (typeof options.footer!=="undefined" && options.footer) {		
			let modal_footer = document.createElement("div")
				modal_footer.classList.add('modal-footer')
				// Add
				modal_content.appendChild(modal_footer)

				// Add options.footer
				modal_footer.appendChild(options.footer)	
			}
	
		// modal_div	
		let modal_div = document.createElement("div")
			modal_div.id = options.id
			modal_div.setAttribute("role", "dialog")
			modal_div.setAttribute("tabindex", "-1")
			
			if (typeof options.animation!=="undefined" && options.animation===false) {			
				modal_div.classList.add('modal')
			}else{
				modal_div.classList.add('modal','fade') // default
			}						

			// Add
			modal_div.appendChild(modal_dialog)

		return modal_div
	}//end build_modal_dialog



	/**
	* IS_JSON
	* @return bool
	*/
	this.is_json = function(str) {
		try {
			JSON.parse(str);
		} catch (e) {
			return false;
		}
		return true;
	};//end is_json



	/**
	* CREATE_DOM_ELEMENT
	* Builds a DOM node baased on received options
	*/
	this.create_dom_element = function(element_options){

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
		const contenteditable		= element_options.contenteditable
		
		const element = document.createElement(element_type);
	
		// Add id property to element
		if(id){
			element.id = id;
		}

		// A element. Add href property to element
		if(element_type==='a'){
			element.href = 'javascript:;';
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

		if (contenteditable) {
			element.contentEditable = contenteditable;
		}

		return element;
	};//end create_dom_element



	/**
	* CREATE_CUSTOM_EVENTS
	*/
	this.create_custom_events = function(element, event_type, function_name, function_arguments){

		// If empty arguments, creates empty array
		if (typeof function_arguments==='undefined') {
			function_arguments = []
		}
		// Reserve array keys 0 and 1 to use with object and event later
		function_arguments.unshift(null)
		function_arguments.unshift(null)
					
		return element.addEventListener(event_type, function(event){

			// Override arguments key 0 with actual DOM object
			function_arguments[0] = this

			// Override arguments key 1 with actual event
			function_arguments[1] = event

			call_custom_function(function_name, function_arguments)
		}, false);
	};//end create_custom_events



	/**
	* UNIQ
	*/ 
	this.uniq = function(a) {

		var prims = {"boolean":{}, "number":{}, "string":{}}, objs = [];

		return a.filter(function(item) {
			var type = typeof item;
			if(type in prims)
				return prims[type].hasOwnProperty(item) ? false : (prims[type][item] = true);
			else
				return objs.indexOf(item) >= 0 ? false : objs.push(item);
		});
	};//end uniq



	/**
	* EXPORT_STR
	*/
	this.export_str = function(button_obj, wrap_obj) {

		if( !confirm('\nAre you sure to EXPORT and overwrite structure data in file \n "dedalo4_development_str.custom.backup" ?\n') ) {
			return false
		}
			//window.open(DEDALO_LIB_BASE_URL + "/backup/trigger.db_utils.php?action=export",'Export','width=1000,height=800');

		const trigger = DEDALO_LIB_BASE_URL + "/backup/trigger.db_utils.php"
		const trigger_vars = {
				mode : 'export_str'
		}

		if (!wrap_obj) {
			wrap_obj = document.getElementById('log_messages')
			wrap_obj.classList.add('show_str_data')
			wrap_obj.addEventListener("dblclick",function(){
				this.innerHTML = ""
				this.classList.remove('show_str_data')
			})
		}

		if (wrap_obj) {	
			wrap_obj.innerHTML = "Loading.."	
			html_page.loading_content( wrap_obj, 1 );
		}

		// HTTPX Request
		let js_promise = common.get_json_data(trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[common.export_str] response: "+trigger_vars.mode, response);
			}

			if (!response) {
				console.log("[common.export_str] Error. null response");
			}else{
				
				if (wrap_obj) {
					wrap_obj.innerHTML = response.msg
				}else{
					console.log("[common.export_str] ", response.msg);
					alert("[common.export_str] Error. wrap_obj not found")
				}
			}			

			if (wrap_obj) {
				html_page.loading_content( wrap_obj, 0 );
			}
		})

		return js_promise		
	};//end export_str



	/**
	* LOAD_SCRIPT
	* @return js_promise
	*/
	this.load_script = function(url, options) {
		
		const js_promise = new Promise(function(resolve, reject) {

			const is_loaded = common.is_loaded_component_script(url, "script")				
			if (true===is_loaded) {
				
				resolve(url);
			
			}else{

				// DOM tag
				const element = document.createElement("script")
					if(options!==undefined){
						for(var e in options) {
							element[e] = options[e]
						}
					}else{
						// Default async true
						element.async = true
					}
					element.src = url;

				element.onload = function() {
					resolve(url);
				};
				element.onerror = function() {
					reject(url);
				};

				document.getElementsByTagName("head")[0].appendChild(element);
			}
			
		});

		return js_promise
	};//end load_script



	/**
	* LOAD_SCRIPT
	* @return js_promise
	*/
	this.load_style = function(url) {
			
		const js_promise = new Promise(function(resolve, reject) {

			const is_loaded = common.is_loaded_component_script(url, "link")				
			if (true===is_loaded) {
				
				resolve(url);
			
			}else{

				// DOM tag
				const element = document.createElement("link")
					  element.rel  = "stylesheet"
					  element.href = url;					

				element.onload = function() {
					resolve(url);
				};
				element.onerror = function() {
					reject(url);
				};

				document.getElementsByTagName("head")[0].appendChild(element);
			}
			
		});

		return js_promise
	};//end load_style



	/**
	* IS_LOADED_COMPONENT_SCRIPT
	* @return bool
	*/
	this.is_loaded_component_script = function(src, type) {
		
		if(type==="link") {

			const links 	= document.getElementsByTagName("link");
			const links_len = links.length
			for (let i = links_len - 1; i >= 0; i--) {
				if(links[i].getAttribute('href') === src) return true;
			}

		}else{

			const scripts 	  = document.getElementsByTagName("script");
			const scripts_len = scripts.length
			for (let i = scripts_len - 1; i >= 0; i--) {
				if(scripts[i].getAttribute('src') === src) return true;
			}
		}
		
		
		return false;
	};//end is_loaded_component_script



	/**
	* EXECUTE_FUNCTION_BY_NAME
	* Exec a function using only name, context (like window) and arguments (optional)
	* Example:  execute_function_by_name("My.Namespace.functionName", window, arguments)
	* Example2: execute_function_by_name("Namespace.functionName", component_common, arguments)
	*/
	this.execute_function_by_name = function(functionName, context /*, args */) {
			console.log("functionName:",functionName);
			console.log("context:",context.module);
	  const args 		= Array.prototype.slice.call(arguments, 2);
	  const namespaces 	= functionName.split(".");
	  const func = namespaces.pop();
	  for(let i = 0; i < namespaces.length; i++) {
		context = context[namespaces[i]];
	  }

	  if (typeof context[func]==="undefined") {
		console.warn("Error: ignored function ", functionName, " not found in context ",context);
		return false
	  }	 

	  return context[func].apply(context, args);
	}//end execute_function_by_name


	/**
	* CREATE_NEW_CSS_SHEET
	* create new css file and add to the page
	* return the stylesheet that the components can change with you own needs.
	* use: 
	*	// create the new stylesheet
	*	let new_CSS_sheet = common.create_new_CSS_sheet()
	*	// inset the rule into the stylesheet
	*	new_CSS_sheet.insertRule(".relation_grid{display: grid;grid-template-columns: repeat(4, 1fr);}");
	*/
	this.create_new_CSS_style_sheet = function() {
		// Create the <style> tag
		let style = document.createElement("style");

		// Add a media (and/or media query)
		// style.setAttribute("media", "screen")
		// style.setAttribute("media", "only screen and (max-width : 1024px)")

		// Add the <style> element to the page
		document.head.appendChild(style);

		return style.sheet;
	};//end create_new_CSS_sheet


	/**
	* GET_LOCALE_FROM_CODE
	* @return string locale
	*	Like 'en-EN' from lg-eng
	*/
	this.get_locale_from_code = function(lang_code){

		let locale
		switch (lang_code) {
			case 'lg-eng':	locale='en-US'; 	break;
			case 'lg-spa':	locale='es-ES'; 	break;
			case 'lg-cat':	locale='ca'; 		break;
			
			default:
				locale = lang_code.substring(3) + "-" + lang_code.substring(3).toUpperCase()
				break;
		}
		return locale;
	}



	/**
	* SAFE_NUMBER
	* @return in | float number
	*/
	this.safe_number = function(current_number) {

		let safe_number 	= current_number;
		const reg_float 	= new RegExp('^[+-]?\\d+([\.,]\\d+)$');
		const reg_int 		= new RegExp('^[+-]?\\d+$');
		if(reg_float.test(safe_number)) {
				safe_number = safe_number.replace(/,/g, '.') // Fix php / js float notation  dissonance
				safe_number = parseFloat(safe_number)
					//console.log("++ parseFloat safe_number:",current_number," , out: ",safe_number);
		}else{
			if(reg_int.test(safe_number)) {
				safe_number = parseInt(safe_number)
					//console.log("++ parseInt safe_number:",current_number," , out: ",safe_number);
			}
		}

		return safe_number
	};//end safe@RETURN OBJECT



	/**
	* GROUP_BY_KEY
	* Group an array of objects by object property (key)
	* @param array list
	*	Array of objects
	* @param string key
	*	String like "section_id"
	* @return array group
	*/
	this.group_by_key = function(list, key) {

		function groupBy(list, keyGetter) {
			const map = new Map();
			list.forEach((item) => {
				const key = keyGetter(item);
				const collection = map.get(key);
				if (!collection) {
					map.set(key, [item]);
				}else{
					collection.push(item);
				}
			});
			return map;
		}

		const group = Array.from( groupBy(list, item => item[key]).values() )

		return group;
	};//end group_by_key



	/**
	* ADDSLASHES
	* @param string str
	* @return string
	*/
	this.addslashes = function(str) {
	
		return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');	
	};//end addslashes



}//end common class





function ready(fn) {
  if (document.readyState !== 'loading'){
  //if (document.readyState === 'complete'){
	fn();
  } else {
	document.addEventListener('DOMContentLoaded', fn);
  }
}




/**
* ALERT : ALERT OVERRIDE STANDAR JAVASCRIPT ALERT

var alert = function (msg,title,callback) {
	if( typeof title == 'undefined') title = 'Alert';
	$('<div class="dd_alert_msg">'+ msg + '</div>').dialog({
		modal: true,
		title: title,
		buttons: {
			Ok: function() {
				$( this ).dialog( "close" );
			}
		},
		close: function(event, ui) {
			// Callback optional
			if (callback && typeof(callback) === "function") {
				callback();
			}
		}
	});
}*/
/**
* CONFIRM :  CONFIRM OVERRIDE STANDAR JAVASCRIPT ALERT
*//*
var confirm__DES__ = function (msg, callback, title) {

	if( typeof title == 'undefined') title = 'Alert';	//return alert(callback)

	var dfd = new $.Deferred();

	// create and/or show the dialog box here
	// but in "OK" do 'def.resolve()'
	// and in "cancel" do 'def.reject()'
	$('<div class="dd_alert_msg">'+ msg + '</div>').dialog({
		modal: true,
		title: title,

		buttons: {
			"Ok": function () {
				
				// Callback optional
				//if (callback && typeof(callback) === "function") {
				//	return callback();
				//}			
				dfd.resolve('Success!');
				$(this).dialog("close");
			},
			"Cancel": function () {
				
				// Callback optional
				//if (callback && typeof(callback) === "function") {
				//	callback(false);
				//}			
				dfd.reject('Uh-oh!');
				$(this).dialog("close");
			}
		}
	});

	dfd.then(function() {
		// perform next action when user clicks proceed
		alert('then')
	});

	dfd.fail(function() {
		// perform some action when the user clicks cancel
		alert('fail')
	});
}
*/

// GOTO (URL)
var goto_url = function(url) {
	return window.location = url;
}
// HTML2TEXT
function html2text(html) {
	return html.replace(/<(?:.|\n)*?>/gm, '');
}
// REPLACEALL
function replaceAll(find, replace, str) {
	if(typeof str === 'undefined') return null;
	return str.replace(new RegExp(find, 'g'), replace);
}

/**
* TEST_OBJECT_VARS
* Verify all object vars for 'undefined'.
* If found any value is undefined, alert error msg and return false
*/
var test_object_vars = function(obj_vars, function_name) {

	var last 	= Object.keys(obj_vars).length ;
	var n 		= 0;

	// Verify vars values
	for (var key in obj_vars) {
		//console.log(key, obj_vars[key]);
		if(typeof(obj_vars[key])==='undefined') {
			alert("["+function_name+"] Error : undefined "+key, 'Error');
			//console.log("->test_object_vars: false (one var is undefined)")
			return false;
		}
		++n;
		//console.log("n:"+n+" last:"+last)
		if(n===last) {
			//console.log("->test_object_vars: true (all vars are ok)")
			return true;
		}
	}//for (var key in obj_vars)
}

// GET CALLER FUNCTION NAME. Use as getFunctionName() inside funtion and  return his name
function getFunctionName() {
	var re = /function (.*?)\(/
	var s = getFunctionName.caller.toString();
	var m = re.exec( s )
	return m[1];
}
// GET CURRENT URL VARS
function get_current_url_vars() {
	var vars = {};
	var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
		vars[key] = value;
	});
	return vars;
}
// GET_PARAMETER_VALUE
function get_parameter_value(url, name) {
	name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
	var regexS = "[\\?&]"+name+"=([^&#]*)";
	var regex = new RegExp( regexS );
	var results = regex.exec( url );
	if( results === null ) return "";
	else return results[1];
}
// CHANGE_URL_VARIABLE
function change_url_variable(url, keyString, replaceString) {
	//var query = window.location.search.substring(1);
	var query = url;
	var vars  = query.split("&");
	var len   = vars.length
	for (var i = len - 1; i >= 0; i--) {		
		var pair = vars[i].split("=");
		if (pair[0] == keyString) {
			vars[i] = pair[0] + "=" + replaceString ;
		}
	}
	
	return vars.join("&");
}
// REMOVE_URL_VARIABLE
function remove_url_variable(key, sourceURL) {
	var rtn = sourceURL.split("?")[0],
		param,
		params_arr = [],
		queryString = (sourceURL.indexOf("?") !== -1) ? sourceURL.split("?")[1] : "";
	if (queryString !== "") {
		params_arr 	= queryString.split("&");
		var len 	= params_arr.length
		for (var i = len - 1; i >= 0; i -= 1) {
			param = params_arr[i].split("=")[0];
			if (param === key) {
				params_arr.splice(i, 1);
			}
		}
		rtn = rtn + "?" + params_arr.join("&");
	}
	return rtn;
}
// BUILD_URL_ARGUMENTS_FROM_VARS
function build_url_arguments_from_vars( vars_obj ) {

	var pairs = []
	for (var key in vars_obj) {
		var current_value = vars_obj[key]

		pairs.push( key+'='+current_value )
	}
	
	return pairs.join("&")
}

/**
* CACHED SCRIPT
* Se usa para forzar la recarga de ficheros js desde la cache del navegador
* Por ejemplo si queremos renovar los "handlers" de un componente
*//*
jQuery.cachedScript = function(url, options) {

  // allow user to set any option except for dataType, cache, and url
  options = $.extend(options || {}, {
	dataType: "script",
	cache: true,
	url: url
  });

  // Use $.ajax() since it is more flexible than $.getScript
  // Return the jqXHR object so we can chain callbacks
  return jQuery.ajax(options);
};*/



function includeStyle( url ) {
	document.write( "<link rel='stylesheet' href='" + url + "'>" );
}
function includeScript( url ) {
  document.write( "<script src='" + url + "'></script>" );
}



/**
* tryParseJSON
*/
function tryParseJSON (jsonString){
	try {
		var o = JSON.parse(jsonString);

		// Handle non-exception-throwing cases:
		// Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
		// but... JSON.parse(null) returns 'null', and typeof null === "object",
		// so we must check for that, too.
		if (o && typeof o === "object" && o !== null) {
			return o;
		}
	}
	catch (e) { }

	return false;
}


/**
* TOOGLE_HEIGHT
* Toogle element height from initial to expanded and viceversa
*/
function toogle_height( element, clipped_height ) {

	var real_height 	= element.scrollHeight
	var current_height	= element.offsetHeight

	if (real_height > current_height*3) {
		//element.height = real_height
		$(element).height(real_height)
		element.style.overflow = 'visible'
		element.style.cursor = 'n-resize'
	}else{
		//element.height = clipped_height
		$(element).height(clipped_height)
		element.style.overflow ='hidden'
		element.style.cursor = 's-resize'			
	}
	//console.log(real_height+" - "+current_height);
}


function resizeIframe(obj) {
		
	setTimeout(function(){
		obj.style.height = obj.contentWindow.document.body.scrollHeight + 'px';
	},10)
	
	return true
}



/**
* EXEC_SCRIPTS_INSIDE
* @return js promise
*/
function exec_scripts_inside( element ) {

	const scripts = Array.prototype.slice.call(element.getElementsByTagName("script"))
	
	const js_promise = new Promise((resolve, reject) => {

		const start 			= new Date().getTime()
		const scripts_length 	= scripts.length
		for (let i = 0; i < scripts_length; i++) {

			if(SHOW_DEBUG===true) {
				var partial_in = new Date().getTime()
			}

			if (scripts[i].src !== "") {
				let tag = document.createElement("script")
					tag.src = scripts[i].src
				document.getElementsByTagName("head")[0].appendChild(tag)
			}
			else {
				//eval(scripts[i].innerHTML);
				//console.log(scripts[i].innerHTML);

				// Encapsulate code in a function and execute as well
				let my_func = new Function(scripts[i].innerHTML)

					my_func() // Exec
			}

			if(SHOW_DEBUG===true) {
				const end  	= new Date().getTime()
				const time 	= end - start
				const partial = end - partial_in
				//console.log("->insertAndExecute: [done] "+" - script time: " +time+' ms' + ' (partial:'+ partial +')')
			}
		}
	
	});//end js_promise

	
	return js_promise;
}//end exec_scripts_inside



/**
* INSERTANDEXECUTE
* Insert html code as text inside DOM element gived
* Later, exec all script code inside html text
* @return bool
*/
function insertAndExecute(element, content_obj) {
		
	if (content_obj) {

		new Promise(function(resolve, reject) {

			// Clean element
			//while (element.firstChild) {
			//	element.removeChild(element.firstChild);
			//}
	
			// Add childrens
			//if ( element.appendChild( content_obj.getElementsByTagName("div")[0] ) ) {
			if ( element.innerHTML = content_obj.innerHTML ) {
				resolve("DOM updated!");
			}else{
				reject(Error("Error on append child"));
			}

		}).then(function(result) {
			
			// Run scripts after dom changes are finish
			exec_scripts_inside( element )

		}, function(err) {
			console.log("[insertAndExecute] error ",err);
		});	

		return true
	}else{
		console.error("[common.insertAndExecute] ERROR content_obj is null")

		return false
	}	
}//end insertAndExecute



/**
* FIND_ANCESTOR
* For browsers that do not support closest()
*/
function find_ancestor(el, cls) {
	while ((el = el.parentElement) && !el.classList.contains(cls)) {
		// console.log("el:",el);
	}
	return el;
}



/**
* PROPAGATE_URL_VAR
* This function propagates a url var to all menu links href
* @return bool
*/
var propagate_url_var = function( url_var_name, element ) {
	if(!element) return false;
	// Look var url_var_value in current page url
	var url_var_value = get_parameter_value(window.location.href , url_var_name)
	// If exits, add to all menu links
	if ( url_var_value.length>0 ) {
		var element_links = element.getElementsByTagName('a')
		var len = element_links.length
			for (var i = len - 1; i >= 0; i--) {
				// Look for already existing url var url_var_value in link href
				var link_url_var_value = get_parameter_value(element_links[i].href, url_var_name)
					// In not already inserted, add var
					if ( link_url_var_value.length<1 ) {
						element_links[i].href = element_links[i].href + '&' + url_var_name + '=' + url_var_value
					}
			}
		return true
	}
	return false
};//end propagate_url_var



/**
* CALL_CUSTOM_FUNCTION
* Utility to call functions with string name and optional array of arguments
* @see ts_object.
*/
function call_custom_function(function_name, function_arguments) {
	var objects = function_name.split(".");
	var obj = this;
	
	const len = objects.length
	//for (var i = 0, len; i < len && obj; i++) {
	for (let i = 0; i < len; i++) {
		obj = obj[objects[i]];
	}

	if (typeof obj === "function") {
		obj.apply( this, function_arguments );
		//obj(arguments);
	}
}//end call_custom_function


/*
Array.prototype.move = function(from, to) {
	this.splice(to, 0, this.splice(from, 1)[0]);
};
*/
Array.prototype.move = function(pos1, pos2) {
	// local variables
	var i, tmp;
	// cast input parameters to integers
	pos1 = parseInt(pos1, 10);
	pos2 = parseInt(pos2, 10);
	// if positions are different and inside array
	if (pos1 !== pos2 && 0 <= pos1 && pos1 <= this.length && 0 <= pos2 && pos2 <= this.length) {
	  // save element from position 1
	  tmp = this[pos1];
	  // move element down and shift other elements up
	  if (pos1 < pos2) {
		for (i = pos1; i < pos2; i++) {
		  this[i] = this[i + 1];
		}
	  }
	  // move element up and shift other elements down
	  else {
		for (i = pos1; i > pos2; i--) {
		  this[i] = this[i - 1];
		}
	  }
	  // put element from position 1 to destination
	  this[pos2] = tmp;
	}
 }


function cloneDeep (o) {
  let newO
  let i

  if (typeof o !== 'object') return o

  if (!o) return o

  if (Object.prototype.toString.apply(o) === '[object Array]') {
	newO = []
	for (i = 0; i < o.length; i += 1) {
	  newO[i] = cloneDeep(o[i])
	}
	return newO
  }

  newO = {}
  for (i in o) {
	if (o.hasOwnProperty(i)) {
	  newO[i] = cloneDeep(o[i])
	}
  }
  return newO
}

/**
* is_obj_equal
* Compare two objects for equal check
*/
function is_obj_equal (obj1, obj2) {
	// return true if 2 obj are equal.
	// equal here means deep compare enumerable properties of object

	// http://xahlee.info/js/js_comparison_equality_test_objects.html
	// version 2016-04-20

	var keys1 = Object.keys(obj1).sort();
	var keys2 = Object.keys(obj2).sort();

	if ( keys1.length !== keys2.length  ) {
		return false;
	}

	// first make sure have same keys. may save time
	if ( ! keys1.every( function(k, i) { return (k === keys2[i]); } ) ) {
		return false;
	}

	// check if any value is not equal
	return keys1.every (function(kk) {
		var v1 = obj1[kk];
		var v2 = obj2[kk];
		if ( Array.isArray(v1) )  {
			return xah_is_array_equal(v1,v2);
		} else if ( typeof v1 === "object" && v1 !== null) {
			return xah_is_obj_equal(v1,v2);
		} else {
			return  v1 === v2;
		}
	} );
}




