





var component_filter_records = new function() {


	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_LIB_BASE_URL + '/component_filter_records/trigger.component_filter_records.php';



	/**
	* SAVE (Deprecated!)
	*/
	this.Save = function(component_obj) {

		this.save_arguments.dato = this.get_dato( component_obj );
			console.log(this.save_arguments);

		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_filter_records:Save: Sorry: wrap_div dom element not found")
			}

		// Configure component obj dataset to save in common way
		component_obj.dataset.tipo 			= wrap_div.dataset.tipo
		component_obj.dataset.section_tipo 	= wrap_div.dataset.section_tipo
		component_obj.dataset.parent 		= wrap_div.dataset.parent
		component_obj.dataset.lang 			= wrap_div.dataset.lang
			//return console.log(component_obj.dataset);


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
				return alert("component_filter_records:get_dato: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_filter_records_input"]')
	
		// DATO. Iterate each input and store their value in the array 'dato'
		var dato = {}
		var len  = input_elements.length
		for (var i = 0; i < len; i++) {
			
			var element = input_elements[i]
			if(element.value.length>0) {

				// current_section_tipo
				var current_section_tipo = element.dataset.current_section_tipo

				// ar_value
				var ar_value = this.convert_value_to_ar_data(element.value) 
				
				// add
				dato[current_section_tipo] = ar_value				
			}
		}

		return dato
	};//end get_dato



	/**
	* CONVERT_VALUE_TO_AR_DATA
	* @return 
	*/
	this.convert_value_to_ar_data = function(value) {
		
		var ar_parts = value.split(",");

		var ar_data = []
		var len = ar_parts.length; 	
				
		for (var i = 0; i < len; i++) {
			var current_value = parseInt(ar_parts[i])
			if (ar_data.indexOf(current_value)=== -1 && current_value>0) { // Avoid duplicates
				ar_data.push( current_value )
			}			
		}

		return ar_data
	};//end convert_value_to_ar_data
	


	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");		
		
		// If only one is present, we focus it on click wrapper
		var ar_input_text = obj_wrap.querySelectorAll('[data-role="component_filter_records_input"]')
			if (ar_input_text.length===1) {
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
		var context_name = 'select_record'
		
		var url = DEDALO_LIB_BASE_URL + '/main/?t=' + button_obj.dataset.target_section_tipo + '&context_name='+context_name
		var strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";

		if(related_selector_window === null || related_selector_window.closed) {
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

		// Related component data from received locator
		var locator_obj 		= JSON.parse(locator)
		var target_section_tipo = locator_obj.section_tipo
		var target_section_id   = locator_obj.section_id
		
		if(this.opener_button===null) return alert("Error. Button obj not found: opener_button");

		// From component wrapper
		var wrap_div = find_ancestor(this.opener_button, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(this.opener_button);
				return alert("component_filter_records:add_locator: Sorry: wrap_div dom element not found")
			}

		// SAVE
		var trigger_vars = {
						'mode' 	 			  : 'add_related',
						'tipo' 	 			  : wrap_div.dataset.tipo,
						'parent'	 		  : wrap_div.dataset.parent,
						'section_tipo' 		  : wrap_div.dataset.section_tipo,
						'target_section_tipo' : target_section_tipo,
						'target_section_id'   : target_section_id,
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
	};//end add_locator



	/**
	* REMOVE_LOCATOR
	* @return 
	*/
	this.remove_locator = function( button_obj ) {

		if (!confirm(get_label.seguro)) return false;

		// From component wrapper
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_filter_records:remove_locator: Sorry: wrap_div dom element not found")
			}

		var trigger_vars = {
						'mode' 	 				: 'remove_related',
						'tipo' 	 				: wrap_div.dataset.tipo,
						'parent'	 			: parseInt(wrap_div.dataset.parent),
						'section_tipo' 			: wrap_div.dataset.section_tipo,
						'target_section_tipo' 	: button_obj.dataset.target_section_tipo,
						'target_section_id'		: parseInt(button_obj.dataset.target_section_id)
					}
					//return console.log(trigger_vars);

			// SAVE
			common.get_json_data(this.url_trigger, trigger_vars).then(function(response){

				// Reloads always the component
				component_common.load_component_by_wrapper_id( wrap_div.id );

				if (response===true) {
					// Inspector msg
					var label = wrap_div.querySelector("label").innerHTML
					var msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
					inspector.show_log_msg(msg);
				}
			})//end promise
			/*
			// INPUTS . Select all inputs inside current wrapper
			var input_elements = wrap_div.querySelectorAll('[data-role="component_filter_records_input"]')
			
			if (input_elements.length>1) {
				var input_line = button_obj.parentNode
				if (input_line) {
					input_line.remove()
				}
				// Select again for avoid lose the first element (Important)
				input_elements = wrap_div.querySelectorAll('[data-role="component_filter_records_input"]')	
			}else{
				// Never removes last input element. Only empty value
				input_elements[0].value = ''
			}		

			// Save normally
			if(input_elements[0]) this.Save( input_elements[0] )
			*/
	};//end remove_locator



	/**
	* SHOW_RELATED_TERMS
	* Show and hide related terms data in ts_object content_data div
	*/
	this.show_related_terms = function(button_obj) {
		
		var html_data = " Hi html_data! "
		var role 	  = 'related_terms'

		return ts_object.show_list_thesaurus_data(button_obj, html_data, role)
	};//end show_related_terms



	/**
	* OPEN_REALATED
	*/
	this.open_realated = function(button_obj) {		

		var url = DEDALO_LIB_BASE_URL + '/main/?'
			url += 'm=edit&'
			url += 't=' + button_obj.dataset.section_tipo +'&'
			url += 'id=' + button_obj.dataset.section_id

		var relwindow = window.open(url ,'relwindow');
	};//end open_realated




}//end component_filter_records

