





var component_relation_children = new function() {


	this.save_arguments = {} // End save_arguments


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		this.save_arguments.dato = this.get_dato( component_obj );
			//return 	console.log(this.save_arguments);

		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_relation_children:Save: Sorry: wrap_div dom element not found")
			}

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

		jsPromise.then(function(response) {
		  	// Action post save
		  	component_common.load_component_by_wrapper_id(wrap_div.id);
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});
	};



	/**
	* GET_DATO
	* @return array dato
	*/
	this.get_dato = function( component_obj ) {
		
		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_relation_children:get_dato: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_children_input"]')
	
		// DATO. Iterate each input and store their value in the array 'dato'
		var dato = []
		for (var i = 0; i < input_elements.length; i++) {
			var element = input_elements[i]
			if(element.value.length>1) {
				var locator = null;
				try {
				  locator = JSON.parse(element.value)
				} catch (e) {
				  console.log(e.message); // "missing ; before statement"
				  //return alert(e.message) 
				}
				if(locator)	dato.push( locator )
			}
		}

		return dato
	};//end get_dato



	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");		
		
		// If only one is present, we focus it on click wrapper
		var ar_input_text = obj_wrap.querySelectorAll('[data-role="component_relation_children_input"]')
			if (ar_input_text.length==1) {
				var input_text = ar_input_text[0]
				if(input_text) {
					input_text.focus();
				}
			}				
		
		return false;
	}



	/**
	* OPEN_CHILDREN_SELECTOR_WINDOW
	* @return 
	*/
	var children_selector_window = null; // Global var
	this.opener_button = null;	// class var
	this.open_children_selector_window = function( button_obj ) {

		// Fix current button_obj as var
		this.opener_button = button_obj
		
		// context_name
		var context_name = 'select_children'
				
		var url = DEDALO_LIB_BASE_URL + '/main/?t=' + button_obj.dataset.target_tipo + '&context_name='+context_name
		var strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
strWindowFeatures=null
		if(children_selector_window == null || children_selector_window.closed) {
			children_selector_window = window.open(
			    url,
			    "children_selector_window",
			    strWindowFeatures
			);	
		}else{
			children_selector_window.focus();
		}
	};//end open_children_selector_window



	/**
	* ADD_RELATION_FROM_OPENED_WINDOW
	* Triggered from opened window button
	* @return 
	*/
	this.add_relation_from_opened_window = function( button_obj ) {

		var locator = button_obj.dataset.locator
		this.add_locator(locator)		

		// Close opened window
		if(children_selector_window) children_selector_window.close();

	};//end add_relation_from_opened_window



	/**
	* ADD_LOCATOR
	* Clone first DOM input element, update value with requested locator and
	* trigger save normally
	*/
	this.add_locator = function(locator) {
		
		if(this.opener_button===null) return alert("Error. add_locator Button obj not found: opener_button");

		// From component wrapper
		var wrap_div = find_ancestor(this.opener_button, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(this.opener_button);
				return alert("component_relation_children:add_locator: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_children_input"]')
			//console.log(input_elements);

		// Test if already exists requested locator
		for (var i = input_elements.length - 1; i >= 0; i--) {
			var element = input_elements[i]
			if(element.value == locator) {
				console.log("Warning: children locator already exists");
				return false;
			}
		}

		if (input_elements[0]) {

			if (input_elements[0].value.length<1) {

				input_elements[0].value = locator

			}else{

				var first_input = input_elements[0]
				var first_children_input_line = first_input.parentNode
				
				// Duplicate first input line
				var new_parent_input_line = first_children_input_line.cloneNode(true)

				// Changes cloned input element value
				var new_input = new_parent_input_line.querySelector('[data-role="component_relation_children_input"]')
					new_input.value = locator

				// Add modified element at end of inputs wrapper elements
				first_children_input_line.parentNode.appendChild(new_parent_input_line); 
			}

			

			// Save normally
			if(input_elements[0])  this.Save( input_elements[0] )
		}
	};//end add_locator



	/**
	* REMOVE_LOCATOR
	* @return 
	*/
	this.remove_locator = function( button_obj ) {

		// From component wrapper
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_relation_children:remove_locator: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_children_input"]')
		
		if (input_elements.length>1) {
			var input_line = button_obj.parentNode
			if (input_line) {
				input_line.remove()
			}
			// Select again for avoid lose the first element (Important)
			input_elements = wrap_div.querySelectorAll('[data-role="component_relation_children_input"]')	
		}else{
			// Never removes last input element. Only empty value
			input_elements[0].value = ''
		}		

		// Save normally
		if(input_elements[0]) this.Save( input_elements[0] )
	};//end remove_locator



	/**
	* SHOW_COMPONENT_IN_ROW_THESAURUS
	* Show and hide component data in row_thesaurus content_data div
	* @param object button_obj
	*/
	this.show_component_in_row_thesaurus = function(button_obj) {

		var html_data = '...';	//" show_component_in_row_thesaurus here! "
		var role 	  = 'component_relation_children' + '_' + button_obj.dataset.section_tipo + '_' + button_obj.dataset.parent + '_' + button_obj.dataset.tipo

		row_thesaurus.show_list_thesaurus_data(button_obj, html_data, role, function(){

			var my_data = {
				"mode" 			: 'load_component_by_ajax',
				"section_tipo"  : button_obj.dataset.section_tipo,
				"parent"  		: button_obj.dataset.parent,
				"tipo"  		: button_obj.dataset.tipo,
				"modo"  		: button_obj.dataset.modo,
				"lang"  		: button_obj.dataset.lang
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
					console.log("show_component_in_row_thesaurus ajax error (fail)")
				})
				.always(function() {
					
				})
			)//end promise	

			return jsPromise

		})//end row_thesaurus.show_list_thesaurus_data		
	};//end show_component_in_row_thesaurus



	/**
	* LOAD_CHILDRENS
	* Load by ajax rendered childrens of current component (thesaurus) 
	*/
	this.load_childrens = function(button_obj) {

		var start = new Date().getTime()

		var mydata = {
					'mode' 			: 'load_childrens',
					'ar_childrens'	: button_obj.dataset.ar_childrens,
					'top_tipo'		: page_globals.top_tipo
					}
					//return console.log(mydata);

		// From component wrapper
		var wrap_div = find_ancestor(button_obj, 'wrap_row_thesaurus')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_autocomplete:remove_locator: Sorry: wrap_div dom element not found")
			}
		var childrens_container = wrap_div.querySelectorAll('[data-role="childrens_container"]')[0];
			if (childrens_container === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_autocomplete:remove_locator: Sorry: childrens_container dom element not found")
			}
			//return console.log(childrens_container);

		var wrap_inside = childrens_container.querySelectorAll('[data-role="childrens_container"]')[0];
		if (typeof wrap_inside==='undefined') {
			// Begin load childrens from trigger			
		}else{
			// Childrens are loaded. Only show or hide wrapper
			if (childrens_container.style.display==='none') {
				childrens_container.style.display = 'inline-table'
			}else{
				childrens_container.style.display = 'none';
				if (DEBUG) {
					return false; // provisional quitar
				}				
			}		
		}

		// Active loading overlap
		//html_page.loading_content( wrap_div, 1 )
		childrens_container.innerHTML = ''
		childrens_container.style.minHeight = "42px"; // avoid flash on load elements
		childrens_container.classList.add("loading_list_thesaurus_data")				

		// AJAX REQUEST
		$.ajax({
			url		: DEDALO_LIB_BASE_URL + '/section_records/trigger.section_records.php',
			data	: mydata,
			type 	: 'POST'
			//,processData: false//, contentType: "application/x-www-form-urlencoded"
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 ) // Remove loading overlap
			childrens_container.classList.remove("loading_list_thesaurus_data")	
		})
		// DONE
		.done(function(received_data) {

			if (DEBUG) {
				var end  = new Date().getTime()
				var time_ajax = end - start
				//console.log(received_data);		
			}

			// Parse html text as object
			var el = document.createElement('div')
			el.innerHTML = received_data

			var content_obj = el
			var target_obj  = childrens_container

			// Pure javascript option (replace content and exec javascript code inside)
			insertAndExecute(target_obj, content_obj)


			if (DEBUG) {
				var end  = new Date().getTime();
				var time = end - start;
				console.log("->load_childrens: [done] "+" - execution time: " +time+' ms' + ' (ajax:'+time_ajax+')')
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			if (DEBUG) {console.log(error_data)};	
		})	
		
	};//end load_childrens




}//end component_relation_children

