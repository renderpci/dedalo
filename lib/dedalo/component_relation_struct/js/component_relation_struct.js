"use strict"
/**
* COMPONENT_RELATION_STRUCT
*
*
*/
var component_relation_struct = new function() {


	this.save_arguments = {} // End save_arguments



	/**
	* INIT
	* @return
	*/
	this.init = function(options) {


		return true
	};//end init



	/**
	* GET_DATO
	* @return array dato
	*/
	this.get_dato = function( wrap_div ) {

		let dato = []

		// INPUTS . Select all inputs inside current wrapper
		let input_elements = wrap_div.querySelectorAll('input[data-role="component_relation_struct_input"]')

		// DATO. Iterate each input and store their value in the array 'dato'
		const len  = input_elements.length
		for (let i = len - 1; i >= 0; i--) {

			let element = input_elements[i]
			if(element.value.length>1) {
				let locator = null;
				try {
				  locator = JSON.parse(element.value)
				} catch (e) {
				  console.log(e.message); // "missing ; before statement"
				}
				if(locator)	dato.push( locator )
			}
		}

		return dato
	};//end get_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		let self = this

		// From component wrapper
		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				return alert("component_relation_struct:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato
		let dato = self.get_dato( wrap_div )

		// Set for save
		self.save_arguments.dato = dato

		// Exec general save
		let js_promise = component_common.Save(component_obj, self.save_arguments);

			js_promise.then(function(response) {
			  	// Action post save
			  	component_common.load_component_by_wrapper_id(wrap_div.id);
			}, function(xhrObj) {
			  	console.log(xhrObj);
			});


		return js_promise
	};//end Save



	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");

		// If only one is present, we focus it on click wrapper
		var ar_input_text = obj_wrap.querySelectorAll('[data-role="component_relation_struct_input"]')
			if (ar_input_text.length==1) {
				var input_text = ar_input_text[0]
				if(input_text) {
					input_text.focus();
				}
			}

		return false;
	}//end select_component



	/**
	* OPEN_INDEX_SELECTOR_WINDOW
	* Open a browser window in list mode with current contex_name to select elements
	*/
	var index_selector_window = null; // Global var
	this.opener_button = null;	// class var
	this.open_index_selector_window = function( button_obj ) {

		// Fix current button_obj as var
		this.opener_button = button_obj

		// context_name
		var context_name = 'select_index'

		var url = DEDALO_LIB_BASE_URL + '/main/?t=' + button_obj.dataset.target_tipo + '&context_name='+context_name
		var strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";

		if(index_selector_window == null || index_selector_window.closed) {
			index_selector_window = window.open(
			    url,
			    "index_selector_window",
			    strWindowFeatures
			);
		}else{
			index_selector_window.focus();
		}
	};//end open_index_selector_window



	/**
	* ADD_RELATION_FROM_OPENED_WINDOW
	* Triggered from opened window button
	* @return
	*/
	this.add_relation_from_opened_window = function( button_obj ) {

		var locator = button_obj.dataset.locator
		this.add_locator(locator)

		// Close opened window
		if(index_selector_window) index_selector_window.close();

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
				if(SHOW_DEBUG===true) console.log(this.opener_button);
				return alert("component_relation_struct:add_locator: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_struct_input"]')
			//console.log(input_elements);

		// Test if already exists requested locator
		var len = input_elements.length
		for (var i = len - 1; i >= 0; i--) {
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
				var new_input = new_parent_input_line.querySelector('[data-role="component_relation_struct_input"]')
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
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("component_relation_struct:remove_locator: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_struct_input"]')

		if (input_elements.length>1) {
			var input_line = button_obj.parentNode
			if (input_line) {
				input_line.remove()
			}
			// Select again for avoid lose the first element (Important)
			input_elements = wrap_div.querySelectorAll('[data-role="component_relation_struct_input"]')
		}else{
			// Never removes last input element. Only empty value
			input_elements[0].value = ''
		}

		// Save normally
		if(input_elements[0]) this.Save( input_elements[0] )
	};//end remove_locator




}//end component_relation_struct

