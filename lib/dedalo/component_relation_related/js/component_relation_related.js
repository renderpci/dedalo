





var component_relation_related = new function() {


	this.save_arguments = {} // End save_arguments


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		this.save_arguments.dato = this.get_dato( component_obj );
			//console.log(this.save_arguments);

		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_relation_related:Save: Sorry: wrap_div dom element not found")
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
				return alert("component_relation_related:get_dato: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_related_input"]')
	
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
		var ar_input_text = obj_wrap.querySelectorAll('[data-role="component_relation_related_input"]')
			if (ar_input_text.length==1) {
				var input_text = ar_input_text[0]
				if(input_text) {
					input_text.focus();
				}
			}				
		
		return false;
	}//end select_component



	/**
	* OPEN_RELATED_SELECTOR_WINDOW
	* @return 
	*/
	var related_selector_window = null; // Global var
	this.opener_button = null;	// class var
	this.open_related_selector_window = function( button_obj ) {

		// Fix current button_obj as var
		this.opener_button = button_obj

		// context_name
		var context_name = 'select_related'
		
		var url = DEDALO_LIB_BASE_URL + '/main/?t=' + button_obj.dataset.target_tipo + '&context_name='+context_name
		var strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";

		if(related_selector_window == null || related_selector_window.closed) {
			related_selector_window = window.open(
			    url,
			    "related_selector_window",
			    strWindowFeatures
			);	
		}else{
			related_selector_window.focus();
		}
	};//end open_related_selector_window



	/**
	* ADD_RELATION_FROM_OPENED_WINDOW
	* Triggered from opened window button
	* @return 
	*/
	this.add_relation_from_opened_window = function( button_obj ) {

		var locator = button_obj.dataset.locator
		this.add_locator(locator)		

		// Close opened window
		if(related_selector_window) related_selector_window.close();

	};//end add_relation_from_opened_window



	/**
	* ADD_LOCATOR
	* Clone first DOM input element, update value with requested locator and
	* trigger save normally
	*/
	this.add_locator = function(locator) {
		
		if(this.opener_button===null) return alert("Error. Button obj not found: opener_button");

		// From component wrapper
		var wrap_div = find_ancestor(this.opener_button, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(this.opener_button);
				return alert("component_relation_related:add_locator: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_related_input"]')
			//console.log(input_elements);

		// Test if already exists requested locator
		for (var i = input_elements.length - 1; i >= 0; i--) {
			var element = input_elements[i]
			if(element.value == locator) {
				console.log("Warning: parent locator already exists");
				return false;
			}
		}

		if (input_elements[0]) {

			if (input_elements[0].value.length<1) {

				input_elements[0].value = locator

			}else{

				var first_input = input_elements[0]
				var first_parent_input_line = first_input.parentNode
				
				// Duplicate first input line
				var new_parent_input_line = first_parent_input_line.cloneNode(true)

				// Changes cloned input element value
				var new_input = new_parent_input_line.querySelector('[data-role="component_relation_related_input"]')
					new_input.value = locator

				// Add modified element at end of inputs wrapper elements
				first_parent_input_line.parentNode.appendChild(new_parent_input_line); 
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
				return alert("component_relation_related:remove_locator: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_related_input"]')
		
		if (input_elements.length>1) {
			var input_line = button_obj.parentNode
			if (input_line) {
				input_line.remove()
			}
			// Select again for avoid lose the first element (Important)
			input_elements = wrap_div.querySelectorAll('[data-role="component_relation_related_input"]')	
		}else{
			// Never removes last input element. Only empty value
			input_elements[0].value = ''
		}		

		// Save normally
		if(input_elements[0]) this.Save( input_elements[0] )
	};//end remove_locator



	/**
	* SHOW_RELATED_TERMS
	* Show and hide related terms data in row_thesaurus content_data div
	*/
	this.show_related_terms = function(button_obj) {
		
		var html_data = " Hi html_data! "
		var role 	  = 'related_terms'

		return row_thesaurus.show_list_thesaurus_data(button_obj, html_data, role)
	};//end show_related_terms



	/**
	* SHOW_COMPONENT_IN_ROW_THESAURUS
	* Show and hide component data in row_thesaurus content_data div
	* @param object button_obj
	*/
	this.show_component_in_row_thesaurus = function(button_obj) {

		var html_data = '...';	//" show_component_in_row_thesaurus here! "
		var role 	  = 'related_terms' + '_' + button_obj.dataset.section_tipo + '_' + button_obj.dataset.parent + '_' + button_obj.dataset.tipo

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




}//end component_relation_related

