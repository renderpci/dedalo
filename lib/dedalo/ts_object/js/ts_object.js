/*

	TS_OBJECT
	Manage a single thesaurus row element

*/
var ts_object = new function() {


	this.trigger_url 		= DEDALO_LIB_BASE_URL + '/ts_object/trigger.ts_object.php'
	// Set on update element in DOM (refresh)
	this.element_to_hilite 	= null;

	/**
	* PARSE_TS_OBJECT
	* Get the JSON data from the server using promise
	*/
	var start = null
	this.parse_ts_object = function( object ) {
		//console.log(object);
		if (DEBUG) {
			start = new Date().getTime()
		}
		/*var ar_childrens = object.dataset.ar_childrens;
		childrens= JSON.parse(ar_childrens);			
		if (childrens == null) {
			return false;
		}*/
		switch(object.dataset.type) {

			case 'hierarchy_root':
				var wrap = object.parentNode.parentNode;
					if(!wrap) return console.log("[add_children_from_hierarchy] Error on find wrap");
				var parent_section_id 	= wrap.dataset.section_id
				var parent_section_tipo = wrap.dataset.section_tipo
				var parent_node_type 	= wrap.dataset.type

				// main_div is the chilndrens container inside current ts_object
				var main_div 			= object;
				break;
			
			default:
				var wrap 				= object.parentNode.parentNode				
				var parent_section_id 	= wrap.dataset.section_id
				var parent_section_tipo = wrap.dataset.section_tipo
				var parent_node_type 	= wrap.dataset.type || null
				
				// main_div is the chilndrens container inside current ts_object
				var main_div 			= wrap.querySelector('[data-role="childrens_container"]');
				/*
				var nodes 				= wrap.childNodes
				var len = nodes.length
				for (var i = len - 1; i >= 0; i--) {
					if (nodes[i].dataset.role === 'childrens_container'){
						main_div = nodes[i];
						break;
					}
				}
				*/
				break;
		}//end switch(object.dataset.type) 

		
		if (!main_div) {
			console.log(object);
			return alert("Error on find main_div!")
		}
		if (!parent_section_tipo || typeof parent_section_tipo=='undefined') {
			return 	console.log(parent_section_tipo);
		}
		//console.log(main_div);		
		
		// JSON GET CALL
		var trigger_vars = {
			'mode' 			: 'get_childrens_data',
			'section_id' 	: parent_section_id,
			'section_tipo' 	: parent_section_tipo,
			'node_type' 	: parent_node_type
			}
			//console.log(trigger_vars);
		return ts_object.get_json(trigger_vars).then(function(response) {
				
				switch(object.dataset.type) {

					case 'hierarchy_root':
						// Nothing is needed
						break;
					
					default:
						if (object && object.firstChild && object.dataset.type) {							
							object.firstChild.classList.remove('arrow_spinner');
						}						
						// dom_parse_from_object
						ts_object.dom_parse_from_object(response, main_div);
				}				

				if (DEBUG) {
					var end  = new Date().getTime();
					var time = end - start;
					//console.log("->parse_ts_object: [done] "+" - execution time: " +time+' ms' +')')
					start = new Date().getTime()
				}

			}, function(error) {
				console.error("Failed get_json!", error);
			});
	};//end parse_ts_object



	/**
	* GET_JSON
	* XMLHttpRequest to trigger
	* @return Promise
	*/
	this.get_json = function(trigger_vars) {
		
		var	url		= this.trigger_url;	//?mode=get_childrens_data';

		// Return a promise of XMLHttpRequest
		return common.get_json_data(url, trigger_vars)
		/*
		// Iterate trigger and create a string request like a http GET, from received trigger vars object
		var ar_vars = [];
			for(var key in trigger_vars) {
				ar_vars.push( key + '=' + trigger_vars[key])
			}
		var data_send = ar_vars.join('&')	

		// Create new promise with the Promise() constructor;
		// This has as its argument a function
		// with two parameters, resolve and reject
		return new Promise(function(resolve, reject) {
			// Standard XHR to load an image
			var request = new XMLHttpRequest();
			request.open('POST', url);
			//codification of the header for POST method, in GET no is necesary
			request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
			request.responseType = 'json';
			// When the request loads, check whether it was successful
			request.onload = function() {
			  if (request.status === 200) {
				// If successful, resolve the promise by passing back the request response
				resolve(request.response);
			  } else {
				// If it fails, reject the promise with a error message
				reject(Error('Reject error don\'t load successfully; error code:' + request.statusText));
			  }
			};
			request.onerror = function() {
			// Also deal with the case when the entire request fails to begin with
			// This is probably a network error, so reject the promise with an appropriate message
			reject(Error('There was a network error.'));
		  };

		  // Send the request
		  request.send(data_send);
		});
		*/
	};//end get_json



	/**
	* DOM_PARSE_FROM_OBJECT
	*/
	this.dom_parse_from_object = function(ar_childrens_data, main_div){
		//console.log(ar_childrens_data);

		if (!ar_childrens_data) {
			console.log("dom_parse_from_object-> No ar_childrens_data received. Nothing is parsed");
			return false;
		}

		main_div.innerHTML = ''		
		
		var len = ar_childrens_data.length
		for (var i = 0; i < len; i++) {
			//ar_childrens_data[i]

			// ts_object wrapper
			var dataset 			= {'section_tipo':ar_childrens_data[i].section_tipo, 'section_id':ar_childrens_data[i].section_id}
			//var event_function 		= [{'type':'mouseenter','name':'ts_object.show_edit_options'},{'type':'mouseout','name':'ts_object.hide_edit_options'}];
			var event_function 		= [{'type':'dragstart','name':'ts_object.on_dragstart'}];
			var wrap_ts_object 		= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: main_div,
																	class_name 				: 'wrap_ts_object',
																	data_set 				: dataset,
																	draggable				: true,
																	custom_function_events	: event_function,
																})
			// id column content

			var id_colum_content 	= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: wrap_ts_object,
																	class_name 				: 'id_column_content',
																})
			// elements container
			var elements_container 	= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: wrap_ts_object,
																	class_name 				: 'elements_container',
																})
			// elements data container
			var dataset = {'role' :'data_container'}
			var data_container 		= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: wrap_ts_object,
																	class_name 				: 'data_container',
																	data_set 				: dataset,
																})
			// childrens container
			var dataset = {'role' :'childrens_container'}

			var childrens_container = this.create_dom_element({
																	element_type			: 'div',
																	parent 					: wrap_ts_object,
																	class_name 				: 'childrens_container js_first_load',
																	data_set 				: dataset,
																})
			// button add element
			var event_function 		= [{'type':'click','name':'ts_object.add_children'}];

			var link_add 			= this.create_dom_element({
																	element_type			: 'a',
																	parent 					: id_colum_content,
																	class_name 				: 'id_column_link ts_object_add',
																	custom_function_events 	: event_function,
																	title_label 			: 'add',
																})

			var add_icon 			= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: link_add,
																	class_name 				: 'ts_object_add_icon',
																})

			// button drag element
			var event_function 		= [{'type':'mousedown','name':'ts_object.on_drag_mousedown'}];

			var link_drag 			= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: id_colum_content,
																	class_name 				: 'id_column_link ts_object_drag',
																	custom_function_events 	: event_function,
																	title_label 			: 'drag',
																})

			var drag_icon 			= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: link_drag,
																	class_name 				: 'ts_object_drag_icon',
																})

			// button delete element
			var event_function 		= [{'type':'click','name':'ts_object.delete'}];
			var link_delete 		= this.create_dom_element({
																	element_type			: 'a',
																	parent 					: id_colum_content,
																	class_name 				: 'id_column_link ts_object_delete',
																	custom_function_events 	: event_function,
																	title_label 			: 'delete',
																})

			var delete_icon 		= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: link_delete,
																	class_name 				: 'ts_object_delete_icon',
																})
			// button edit element
			var event_function 		= [{'type':'click','name':'ts_object.edit'}];
			var link_edit 			= this.create_dom_element({
																	element_type			: 'a',
																	parent 					: id_colum_content,
																	class_name 				: 'id_column_link ts_object_edit',
																	custom_function_events 	: event_function,
																	title_label 			: 'edit',
																})
			var section_id_number 	= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: link_edit,
																	class_name 				: 'ts_object_section_id_number',
																	text_node 				: ar_childrens_data[i].section_id,
																})
			var edit_icon 			= this.create_dom_element({
																	element_type			: 'div',
																	parent 					: link_edit,
																	class_name 				: 'ts_object_edit_icon',
																})


			// Custom elements (buttons, etc)
			var ch_len = ar_childrens_data[i].ar_elements.length
			for (var j = 0; j < ch_len; j++) {			
			
				var class_for_all = 'list_thesaurus_element';
				var children_dataset = {
					'tipo' 			: ar_childrens_data[i].ar_elements[j].tipo,
					'type' 			: ar_childrens_data[i].ar_elements[j].type					
					//'section_tipo'	: ar_childrens_data[i].section_tipo,
					//'section_id' 	: ar_childrens_data[i].section_id,					
					//'modo' 			: ar_childrens_data[i].modo,
					//'lang' 			: ar_childrens_data[i].lang,					
				}
				//console.log(ar_childrens_data[i].ar_elements[j].tipo);

				switch(true) {
					
					case (ar_childrens_data[i].ar_elements[j].tipo==='hierarchy42') :
						// Skip element
						break;
					case (ar_childrens_data[i].ar_elements[j].tipo==='hierarchy49' && ar_childrens_data[i].ar_elements[j].type==='link'):
						// Case link open childrens (arrow)	
						var event_function	= [{'type':'click','name':'ts_object.toggle_view_childrens'}];

						var element 		= this.create_dom_element({
																			element_type			: 'div',
																			parent 					: elements_container,
																			class_name 				: class_for_all,
																			data_set 				: children_dataset,
																			custom_function_events 	: event_function,
																		})
						var arrow_icon 		= this.create_dom_element({
																			element_type			: 'div',
																			parent 					: element,
																			class_name 				: 'ts_object_childrens_arrow_icon',
																		})
						break;

					case (ar_childrens_data[i].ar_elements[j].tipo == 'hierarchy40'):
						// Case indexations
						// Build button
						var event_function 	= [{'type':'click',
												'name':'ts_object.show_indexations',
												'function_arguments':[ar_childrens_data[i].section_tipo]}]
						var element 		= this.create_dom_element({
																			element_type			: 'div',
																			parent 					: elements_container,
																			class_name 				: class_for_all,
																			data_set 				: children_dataset,
																			custom_function_events 	: event_function,
																			text_node 				: ar_childrens_data[i].ar_elements[j].value,
																		})
						// Build indexactions container
						var id = 'u'+ar_childrens_data[i].section_tipo;
						var indexations_container 	= this.create_dom_element({
																			element_type			: 'div',
																			parent 					: wrap_ts_object,
																			class_name 				: 'indexations_container',
																			id 						: id,
																		})
						break;

					case (ar_childrens_data[i].ar_elements[j].type==='term'):
						// Overwrite dataset (we need section_id and section_tipo to select when content is updated)
						children_dataset.section_tipo = ar_childrens_data[i].section_tipo
						children_dataset.section_id   = ar_childrens_data[i].section_id
						var event_function 	= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];

						var element 		= this.create_dom_element({
																			element_type			: 'div',
																			parent 					: elements_container,
																			class_name 				: class_for_all,
																			data_set 				: children_dataset,
																			custom_function_events 	: event_function,
																			text_node 				: ar_childrens_data[i].ar_elements[j].value,
																		})
						if (element && ts_object.element_to_hilite) {
							if(element.dataset.section_id == ts_object.element_to_hilite.section_id && element.dataset.section_tipo == ts_object.element_to_hilite.section_tipo) {
								// Hilite element
								// element.classList.add("element_hilite");
								ts_object.hilite_element(element)
							}
							//console.log(element); console.log(ts_object.element_to_hilite); console.log(ar_childrens_data[i].section_tipo); console.log(ar_childrens_data[i].section_id);													
						}

						break;

					default:
						// Case common buttons and links
						var event_function 	= [{'type':'click','name':'ts_object.show_component_in_ts_object'}];
						var element 		= this.create_dom_element({
																			element_type			: 'div',
																			parent 					: elements_container,
																			class_name 				: class_for_all,
																			data_set 				: children_dataset,
																			custom_function_events 	: event_function,
																			text_node 				: ar_childrens_data[i].ar_elements[j].value,
																		})
						break;
				}			
				/*
				if(ar_childrens_data[i].ar_elements[j].tipo==='hierarchy49' && ar_childrens_data[i].ar_elements[j].type==='link'){
					
				}else{
					
				}
				if(ar_childrens_data[i].ar_elements[j].tipo == 'hierarchy40'){
					
				}
				*/

			}//end for (var j = 0; j < ch_len; j++) {
		}//for (var i = 0; i < len; i++) {

		//console.log(main_div);
		//console.log(ar_childrens_data.ar_childrens[0]);
	};//end dom_parse_from_object



	/**
	* CREATE_DOM_ELEMENT
	*/
	this.create_dom_element = function(element_options){

		var element_type			= element_options.element_type
		var parent					= element_options.parent
		var class_name				= element_options.class_name
		var data_set				= element_options.data_set
		var custom_function_events	= element_options.custom_function_events
		var title_label				= element_options.title_label
		var text_node				= element_options.text_node
		var id 						= element_options.id
		var draggable				= element_options.draggable
		
		var element = document.createElement(element_type);

		// Add id property to element
		if(id){
			element.id = id;
		}

		// A element. Add href property to element
		if(element_type =='a'){
			element.href = 'javascript:;';
		}
		
		// Class name. Add css classes property to element
		element.className = class_name;

		// Title . Add title attribute to element
		if(title_label){
			element.title = title_label;
		}
	
		// Dataset Add dataset values to element
		if(data_set){
			for (var key in data_set) {
				element.dataset[key] = data_set[key];
			}
		}

		// Click event attached to element
		if(custom_function_events){
			var len = custom_function_events.length;					
			for (var i = 0; i < len; i++) {
				var function_name 		= custom_function_events[i].name;
				var event_type	  		= custom_function_events[i].type;
				var function_arguments	= custom_function_events[i].function_arguments;
					

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
			var el = document.createElement('span')
				el.innerHTML = text_node
			element.appendChild(el);			
		}

		// Append created element to parent
		parent.appendChild(element);


		// Dragable
		if(draggable){
			element.draggable = draggable;
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

			// Oveventrride arguments key 0 with actual DOM object
			function_arguments[0] = this

			// Oveventrride arguments key 1 with actual event
			function_arguments[1] = event

			call_custom_function(function_name, function_arguments)
		}, false);
	};



	/** 
	* ON_DRAG_MOUSEDOWN
	*/
	var target = false;
	var handle = '';
	this.on_drag_mousedown = function(obj, event) {		
		console.log('mouse down');

		target = event.target;
		handle = event;
	};


	/**
	* ON_DRAGSTART
	*/
	this.on_dragstart = function(obj, event) {
		console.log('mouse on_dragstart');
			console.log(obj);
			console.log(event);
		
		if (handle.contains(target)) {
			event.dataTransfer.setData('text/plain', 'handle');
		} else {
			event.preventDefault();
		}
	};	
	


	/**
	* TOGGLE_VIEW_CHILDRENS
	* @return 
	*/
	this.toggle_view_childrens = function(object) {
		
		var wrap 	= object.parentNode.parentNode
		var nodes 	= wrap.childNodes
		var len 	= nodes.length
				
		for (var i = len - 1; i >= 0; i--) {
			if (nodes[i].dataset.role === 'childrens_container'){
				//node selected
				var current_css_classes = nodes[i].classList
				//if is the first time that the childrens are loaded, remove the first class selector and send the query for get the childrens
				if(current_css_classes.contains('js_first_load')){
					current_css_classes.remove('js_first_load');					
					object.firstChild.classList.add('ts_object_childrens_arrow_icon_open', 'arrow_spinner');
					// Load element by ajax
					ts_object.parse_ts_object(object);
					break;
				}
				//the toggle view state with the class
				if(current_css_classes.contains('js_childrens_container_remove_view')){
					current_css_classes.remove('js_childrens_container_remove_view');
					object.firstChild.classList.add('ts_object_childrens_arrow_icon_open');
				}else{
					current_css_classes.add('js_childrens_container_remove_view');
					object.firstChild.classList.remove('ts_object_childrens_arrow_icon_open');
				}
				break;
			}
		}
	};//end toggle_view_childrens



	/**
	* REFRESH_ELEMENT
	* Reload selected element/s wrap in DOM 
	*/
	this.refresh_element = function( section_tipo, section_id ) {

		// Locate all term elements
		var type 	= 'term';
		var matches = document.querySelectorAll('.list_thesaurus_element[data-type="'+type+'"][data-section_tipo="'+section_tipo+'"][data-section_id="'+section_id+'"]');
		var len 	= matches.length;
		for (var i = len - 1; i >= 0; i--) {
			var term =  matches[i]//element_hilite
				//term.classList.add("arrow_spinner");
				ts_object.element_to_hilite = {'section_tipo' : section_tipo, 'section_id' : section_id}
			if(matches[i].parentNode.parentNode) {
				ts_object.parse_ts_object( matches[i].parentNode.parentNode );
			}
			//ts_object.parse_ts_object(matches[i]);
		}

		return len;		
	};//end refresh_element



	/**
	* HILITE_ELEMENT
	* section_tipo, section_id
	* element.dataset.section_tipo, lement.dataset.section_id
	* @param dom object element
	* @return int len
	*/
	this.hilite_element = function( element ) {
		
		// Locate all term elements
		// var type 	= 'term'; // [data-type="'+type+'"]
		// var matches = document.querySelectorAll('.list_thesaurus_element[data-section_tipo="'+section_tipo+'"][data-section_id="'+section_id+'"]');
		
		// Remove current hilite elements
		var matches = document.querySelectorAll('.element_hilite');
		var len 	= matches.length;
		for (var i = len - 1; i >= 0; i--) {
			//var term =  matches[i];	// element_hilite			
			matches[i].classList.remove("element_hilite");
		}
		
		// Hilite only current element
		// element.classList.add("element_hilite");

		// Hilite all apperances of current component (can appears more than once)
		var matches = document.querySelectorAll('.list_thesaurus_element[data-type="'+element.dataset.type+'"][data-section_tipo="'+element.dataset.section_tipo+'"][data-section_id="'+element.dataset.section_id+'"]');
		var len = matches.length;
		for (var i = len - 1; i >= 0; i--) {		
			matches[i].classList.add("element_hilite");
		}

		return len
	};//end hilite_element



	/**
	* EDIT
	* section_id is optional. If not get, the function uses button_obj dataset section_id
	*/
	var edit_window = null; // Global var
	this.edit = function(button_obj, event, section_id, section_tipo) {

		var wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[edit] Error on find wrap");
			}
		
		var section_tipo 		= section_tipo || wrap.dataset.section_tipo
		var section_id 			= section_id || wrap.dataset.section_id
		var url 				= DEDALO_LIB_BASE_URL + '/main/?t='+section_tipo+'&id='+section_id+'&menu=no'
		var strWindowFeatures 	= "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
			//strWindowFeatures 	= null
			//console.log(url);	

		if(edit_window == null || edit_window.closed) { //  || edit_window.location.href!=url
	
			edit_window = window.open(
				url,
				"edit_window",
				strWindowFeatures
			);
			edit_window.addEventListener("beforeunload", function(e){
				// Refresh element after close edit window
				console.log("Edit window is closed for record : "+section_id +". Called refresh_element section_tipo:"+section_tipo+" section_id:"+section_id);
				ts_object.refresh_element(section_tipo, section_id)

			}, false);	
		}else{
			edit_window.focus();
		}
	};//end edit



	/**
	* ADD_CHILDREN
	* @param object button_obj
	*/
	this.add_children = function(button_obj) {

		var wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[add_children] Error on find wrap");
			}
		
		var trigger_vars = {
			'mode' 		 	: 'add_children',
			'section_id' 	: wrap.dataset.section_id,
			'section_tipo' 	: wrap.dataset.section_tipo,
			'node_type' 	: wrap.dataset.type || null,
			}
			//return 	console.log(trigger_vars);

		// JSON GET CALL
		ts_object.get_json(trigger_vars).then(function(response) {
				//console.log(response)
				
				// Refresh childrens container 
				var update_childrens_promise = ts_object.parse_ts_object(button_obj)

					// On childrens refresh is done, trigger edit button
					update_childrens_promise.then(function() {
						console.log("update_childrens_promise done");
						//console.log(response);
						// Open edit window
						var new_section_id = response
						ts_object.edit(button_obj, null, new_section_id, wrap.dataset.section_tipo)
					})

			}, function(error) {
				console.error("Failed get_json!", error);
			});
	};//end add_children


			
	/**
	* ADD_CHILDREN_FROM_HIERARCHY
	* @return 
	*/
	this.add_children_from_hierarchy = function(button_obj) {
		
		var wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[add_children_from_hierarchy] Error on find wrap");
			}
		
		var trigger_vars = {
			'mode' 		 			: 'add_children_from_hierarchy',
			'section_id' 			: wrap.dataset.section_id,
			'section_tipo' 			: wrap.dataset.section_tipo,
			'target_section_tipo' 	: wrap.dataset.target_section_tipo,
			}
			//return 	console.log(trigger_vars);

		// JSON GET CALL
		ts_object.get_json(trigger_vars).then(function(response) {
				//console.log(response);
				
				// Refresh childrens container 
				var update_childrens_promise = ts_object.parse_ts_object(button_obj)

					// On childrens refresh is done, trigger edit button
					update_childrens_promise.then(function() {
						console.log("update_childrens_promise done from add_children_from_hierarchy");
						//console.log(response);

						// Open edit window
						var new_section_id = response
						ts_object.edit(button_obj, null, new_section_id, wrap.dataset.target_section_tipo)
					})

			}, function(error) {
				console.error("Failed get_json!", error);
			});
	};//end add_children_from_hierarchy	
	


	/**
	* DELETE
	*/
	this.delete = function(button_obj) {

		if (!confirm("You are sure to delete current element?")) return false;

		var wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				return console.log("[delete] Error on find wrap");
			}

		// Get all wrap_ts_object wraps whit this section_tipo, section_id
		// Find wrap of wrap and inside, button list_thesaurus_element
		var ar_wrap_ts_object = document.querySelectorAll('.wrap_ts_object[data-section_id="'+wrap.dataset.section_id+'"][data-section_tipo="'+wrap.dataset.section_tipo+'"]')	//
		// return console.log(wrap.dataset.section_tipo); console.log(wrap.dataset.section_id); console.log(ar_wrap_ts_object);
			
		var trigger_vars = {
			'mode' 		 	: 'delete',
			'section_id' 	: wrap.dataset.section_id,
			'section_tipo' 	: wrap.dataset.section_tipo,
			'node_type' 	: wrap.dataset.type || null,
			}
			//return 	console.log(trigger_vars);

		// JSON GET CALL
		ts_object.get_json(trigger_vars).then(function(response) {				
				//console.log(response);
				
				if (response===false) {
					alert("Sorry. You can't delete a element with childrens. Please, remove all childrens before delete.")
				}else{
					// Remove all DOM apperances of current wrap_ts_object
					/*
					var len = ar_wrap_ts_object.length
					for (var i = 0; i < ar_wrap_ts_object.length; i++) {
						ar_wrap_ts_object[i].parentNode.removeChild(ar_wrap_ts_object[i])
					}
					*/
					ts_object.refresh_element(wrap.dataset.section_tipo, wrap.dataset.section_id)
				}
				/*
				// Refresh childrens container 
				var update_childrens_promise = ts_object.parse_ts_object(button_obj).then(function() {	
						// On childrens refresh is done, trigger edit button						
						console.log("update_childrens_promise done");
					})
				*/
			}, function(error) {
				console.error("Failed get_json!", error);
			});
	};//end delete


	
	/**
	* SHOW_component_editor
	* Open component editor bellow ts_object elements to edit current data
	*/
	this.show_component_editor = function(button_obj, html_data, role, callback) {

		// Locate current ts_object container
		// var wrap_ts_object = find_ancestor(button_obj, 'wrap_ts_object')
		var wrap_ts_object = button_obj.parentNode.parentNode;
			//console.log(wrap_ts_object);

		// Locate data_container
		// var data_container = wrap_ts_object.getElementsByClassName('data_container')[0]
		var nodes = wrap_ts_object.childNodes;
		for (var i = nodes.length - 1; i >= 0; i--) {
			if (nodes[i].dataset.role === 'data_container'){
				var data_container = nodes[i];
				break;
			}
		}
		//console.log(data_container);
		if (typeof data_container==='undefined' ) {
			console.log("Error on locate data_container div");
			return false;
		}
		//data_container.style.minHeight = "42px"; // avoid flash on load elements			

		// Locate current element_data_div 
		var element_data_div = data_container.querySelectorAll('[data-role="'+role+'"]')[0]
			//console.log(element_data_div);

		if (element_data_div) {
			//console.log("Founded!!");

			if (element_data_div.style.display=='none') {
				// Hide all
				var all_element_data_div = data_container.childNodes; var len = all_element_data_div.length
					for (var i = len - 1; i >= 0; i--) {
						all_element_data_div[i].style.display = 'none'
					}					
				// Show current
				element_data_div.style.display='table-cell'
			}else{
				element_data_div.style.display='none'
			}

		}else{
			//console.log("Not found");

			data_container.classList.add("loading_list_thesaurus_data")	

			element_data_div 			  = document.createElement("div");
			element_data_div.dataset.role = role;	//'related_terms'
			element_data_div.style.display='table-cell'

			// Hide all
			var all_element_data_div = data_container.childNodes; var len = all_element_data_div.length;
				for (var i = len - 1; i >= 0; i--) {
					all_element_data_div[i].style.display = 'none'
				}

			// Callback optional
			if (callback && typeof(callback) === "function") {			

				// Exec callback
				var jsPromise = callback();

					jsPromise.then(function(response) {
						//console.log(response);

						// Parse html text as object
						var el = document.createElement('div')
						el.innerHTML = response

						// Pure javascript option (replace content and exec javascript code inside)
						insertAndExecute(element_data_div, el)

						data_container.classList.remove("loading_list_thesaurus_data")	

						// Add element to DOM
						data_container.appendChild(element_data_div);

					}, function(xhrObj) {
						console.log(xhrObj);
					});				

			}else{

				// Parse html text as object
				var el = document.createElement('div')
				el.innerHTML = html_data

				// Pure javascript option (replace content and exec javascript code inside)
				insertAndExecute(element_data_div, el)

				// Add element to DOM
				data_container.appendChild(element_data_div);

			}//end if (callback && typeof(callback) === "function")
			
		}//end if (element_data_div)
	};//end show_component_editor



	/**
	* SHOW_EDIT_OPTIONS
	*//*
	this.show_edit_options = function(object){
		return false;		
		//var parent_wrap = object.parentNode.parentNode.querySelectorAll('.id_column_content')[0]
		var parent_wrap = document.querySelectorAll('.id_column_content')
		var len = parent_wrap.length
		for (var i = len - 1; i >= 0; i--) {
			parent_wrap[i].classList.remove('visible_element')
		}
		//parent_wrap.classList.remove('visible_element')
			//console.log(parent_wrap);
		

		var id_column_content = object.querySelectorAll('.id_column_content')[0];		
		id_column_content.classList.add('visible_element')
			//console.log('entrar');
	};//show_edit_options
	*/


	/**
	* HIDE_EDIT_OPTIONS
	*//*
	this.hide_edit_options = function(object){
		return false;
		var id_column_content = object.querySelectorAll('.id_column_content')[0];		
		id_column_content.classList.remove('visible_element')
			//console.log('salir');
	};//hide_edit_options
	*/



	/**
	* SHOW_COMPONENT_IN_ts_object
	* Show and hide component data in ts_object content_data div
	* @param object button_obj
	*/
	this.show_component_in_ts_object = function(button_obj) {

		var wrap 	  	= button_obj.parentNode.parentNode
		var section_tipo= wrap.dataset.section_tipo
		var section_id 	= wrap.dataset.section_id
		var tipo 		= button_obj.dataset.tipo
		var modo 		= 'edit'
		var lang 		= page_globals.dedalo_data_lang
		var html_data 	= '...';	//" show_component_in_ts_object here! "
		var role 	  	= 'component_input_text' + '_' + section_tipo + '_' + section_id + '_' + tipo

		ts_object.show_component_editor(button_obj, html_data, role, function(){

			var my_data = {
				"mode" 			: 'load_component_by_ajax',
				"section_tipo"  : section_tipo,
				"parent"  		: section_id,
				"tipo"  		: tipo,
				"modo"  		: modo,
				"lang"  		: lang
			}
			//return console.log(my_data);

			var jsPromise = Promise.resolve(
				$.ajax({
					url 	: component_common.url_trigger,
					type 	: 'POST',
					data 	: my_data,
				})
				.done(function( received_data ) {
					return received_data
				})
				.fail(function() {
					console.log("show_component_in_ts_object ajax error (fail)")
				})
				.always(function() {
					
				})
			)//end promise	

			return jsPromise
		})//end ts_object.show_component_editor		
	};//end show_component_in_ts_object



	/**
	* SHOW_INDEXATIONS : Carga el listado de fragmentos indexados 
	*/
	this.show_indexations = function(button_obj, event, terminoID, termino, nIndexaciones) {
		//console.log(button_obj); console.log(event); console.log(terminoID);

		var target_div  = document.getElementById('u'+terminoID);
			if (!target_div) {
				return alert('show_indexations. Target div not exist for terminoID: '+terminoID+' !');
			}
		
		//termino = urldecode(termino);
		termino 	  = ''
		nIndexaciones = ''

		var visible_display_mode = 'inline-table'
		
		if(target_div.style.display == visible_display_mode) {
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
			target_div.style.display = visible_display_mode
			
			// AJAX CALL
			$.ajax({
				url			: DEDALO_LIB_BASE_URL + '/ts/trigger.Tesauro.php',
				data		: mydata,
				type		: "POST"
			})
			.done(function(received_data) {
				
				target_div.style.display = 'none'
				target_div.innerHTML = received_data				
				//target_div.slideDown(300);
				target_div.style.display = visible_display_mode
			})
			.fail( function(jqXHR, textStatus) {					
				alert("Error on show_indexations");
				//top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " [id_matrix] " + id_matrix + "</span>" + textStatus );
			})
			.always(function() {				
				//html_page.loading_content( target_obj, 0 );
			});//fin $.ajax			
			
		}//if (target_div.style.display == visible_display_mode)			
	};//end if (target_div.css( 'display') == visible_display_mode)




}//end ts_object