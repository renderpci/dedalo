

/**
* COMPONENT_RELATION_PARENT
* Class to manage parent relation between section.
* Not store his own data, only manage component_relation_childrens data in 'reverse' mode
*/
var component_relation_parent = new function() {


	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_LIB_BASE_URL + '/component_relation_parent/trigger.component_relation_parent.php';


	/**
	* SAVE
	*//*
	this.Save = function(component_obj) {

		return alert("Only read is available now.")

		this.save_arguments.dato = this.get_dato( component_obj );
			//return 	console.log(this.save_arguments);

		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_relation_parent:Save: Sorry: wrap_div dom element not found")
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
	*/



	/**
	* GET_DATO
	* @return array dato
	*//*
	this.get_dato = function( component_obj ) {
		
		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_relation_parent:get_dato: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_parent_input"]')
	
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
	*/



	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");		
		
		// If only one is present, we focus it on click wrapper
		var ar_input_text = obj_wrap.querySelectorAll('[data-role="component_relation_parent_input"]')
			if (ar_input_text.length==1) {
				var input_text = ar_input_text[0]
				if(input_text) {
					input_text.focus();
				}
			}				
		
		return false;
	}



	/**
	* OPEN_PARENT_SELECTOR_WINDOW
	* @return 
	*/
	var parent_selector_window = null; // Global var
	this.opener_button = null;	// class var
	this.open_parent_selector_window = function( button_obj ) {

		// Fix current button_obj as var
		this.opener_button = button_obj
		
		// context_name
		var context_name = 'select_parent'
		
		var url = DEDALO_LIB_BASE_URL + '/main/?t=' + button_obj.dataset.target_tipo + '&context_name='+context_name+ '&menu=0'
		var strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
			//strWindowFeatures=null
		if(parent_selector_window == null || parent_selector_window.closed) {
			parent_selector_window = window.open(
			    url,
			    "parent_selector_window",
			    strWindowFeatures
			);	
		}else{
			parent_selector_window.focus();
		}
	};//end open_parent_selector_window



	/**
	* ADD_RELATION_FROM_OPENED_WINDOW
	* Triggered from opened window button
	* @return 
	*/
	this.add_relation_from_opened_window = function( button_obj ) {

		var locator = button_obj.dataset.locator
		this.add_parent(locator)		

		// Close opened window
		if(parent_selector_window) parent_selector_window.close();
	};//end add_relation_from_opened_window



	/**
	* ADD_LOCATOR
	* Clone first DOM input element, update value with requested locator and
	* trigger save normally
	*//*
	this.add_locator_DEPRECATED = function(locator) {
		
		if(this.opener_button===null) return alert("Error. Button obj not found: opener_button");

		// From component wrapper
		var wrap_div = find_ancestor(this.opener_button, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(this.opener_button);
				return alert("component_relation_parent:add_locator: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_parent_input"]')
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
				var new_input = new_parent_input_line.querySelector('[data-role="component_relation_parent_input"]')
					new_input.value = locator

				// Add modified element at end of inputs wrapper elements
				first_parent_input_line.parentNode.appendChild(new_parent_input_line); 
			}

			

			// Save normally
			//if(input_elements[0])  this.Save( input_elements[0] )
		}
	};//end add_locator
	*/



	/**
	* REMOVE_LOCATOR
	* @return 
	*//*
	this.remove_locator_DEPRECATED = function( button_obj ) {

		// From component wrapper
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_relation_parent:remove_locator: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_parent_input"]')
		
		if (input_elements.length>1) {
			var input_line = button_obj.parentNode
			if (input_line) {
				input_line.remove()
			}
			// Select again for avoid lose the first element (Important)
			input_elements = wrap_div.querySelectorAll('[data-role="component_relation_parent_input"]')	
		}else{
			// Never removes last input element. Only empty value
			input_elements[0].value = ''
		}		

		// Save normally
		if(input_elements[0]) this.Save( input_elements[0] )
	};//end remove_locator
	*/



	/**
	* ADD_PARENT
	* @param locator
	* NOTE: argument 'locator' is used for standarize the way of send vars from section list selector
	* Inside locator yo can get the section_tipo and section_id needed for this request
	*/
	this.add_parent = function(locator) {

		// Children component data from received locator
		var locator_obj 		  = JSON.parse(locator)
		var children_section_tipo = locator_obj.section_tipo
		var children_section_id   = locator_obj.section_id

		if(this.opener_button===null) return alert("Error. add_parent Button obj not found: opener_button");

		// From component wrapper
		var wrap_div = find_ancestor(this.opener_button, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(this.opener_button);
				return alert("component_relation_children:add_parent: Sorry: wrap_div dom element not found")
			}

		// SAVE
		var trigger_vars = {'mode' 	 				  : 'add_parent',
							'tipo' 	 				  : wrap_div.dataset.tipo,
							'parent'	 			  : wrap_div.dataset.parent,
							'section_tipo' 			  : wrap_div.dataset.section_tipo,
							'children_section_tipo'   : children_section_tipo,
							'children_section_id' 	  : children_section_id,
							'children_component_tipo' : wrap_div.dataset.children_component_tipo
							}
						//return 	console.log(trigger_vars);

		common.get_json_data(this.url_trigger, trigger_vars).then(function(response){

			// Reloads always the component
			component_common.load_component_by_wrapper_id( wrap_div.id );

			// Response is bool value decoded from json trigger response
			if (response===true) {				
				// Inspector msg
				var label = wrap_div.querySelector("label").innerHTML
				var msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
				inspector.show_log_msg(msg);
			}//end if (response===true) {
		})//end promise		
	};//end add_parent



	/**
	* REMOVE_PARENT
	*/
	this.remove_parent = function(button_obj) {

		if (!confirm(get_label.seguro)) {
			return false;
		}

		// From component wrapper
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_relation_children:remove_children: Sorry: wrap_div dom element not found")
			}

		// SAVE
		var trigger_vars = {
						'mode' 	 					: 'remove_parent',
						'tipo' 	 					: wrap_div.dataset.tipo,
						'parent'	 				: wrap_div.dataset.parent,
						'section_tipo' 				: wrap_div.dataset.section_tipo,
						'children_section_tipo' 	: button_obj.dataset.children_section_tipo,
						'children_section_id' 		: button_obj.dataset.children_section_id,
						'children_component_tipo' 	: button_obj.dataset.children_component_tipo
						}
						//return 	console.log(trigger_vars);

		common.get_json_data(this.url_trigger, trigger_vars).then(function(response){

			// Reloads always the component
			component_common.load_component_by_wrapper_id( wrap_div.id );

			// Response is bool value decoded from json trigger response
			if (response===true) {				

				// Inspector msg
				var label = wrap_div.querySelector("label").innerHTML
				var msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
				inspector.show_log_msg(msg);
			}//end if (response===true) {
		})//end promise
		
	};//end remove_parent





}//end component_relation_parent

