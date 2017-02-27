





var component_relation_related = new function() {


	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_LIB_BASE_URL + '/component_relation_related/trigger.component_relation_related.php';



	/**
	* SAVE (Deprecated!)
	*//*
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
				return alert("component_relation_related:get_dato: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_related_input"]')
	
		// DATO. Iterate each input and store their value in the array 'dato'
		var dato = []
		var len  = input_elements.length
		for (var i = len - 1; i >= 0; i--) {
			
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
		var ar_input_text = obj_wrap.querySelectorAll('[data-role="component_relation_related_input"]')
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
		var context_name = 'select_related'
		
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
		var locator_obj 		= typeof locator === 'string' ? JSON.parse(locator) : locator
		var target_section_tipo = locator_obj.section_tipo
		var target_section_id   = locator_obj.section_id
		
		if (component_common.selected_wrap_div) {
			// From tree
			var wrap_div = component_common.selected_wrap_div
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_common.selected_wrap_div);
				return alert("component_relation_children:add_children: Sorry: wrap_div dom element not found")
			}
		}else{
			// From list
			if(this.opener_button===null) return alert("Error. Button obj not found: opener_button");

			// From component wrapper
			var wrap_div = find_ancestor(this.opener_button, 'wrap_component')
				if (wrap_div === null ) {
					if(DEBUG) console.log(this.opener_button);
					return alert("component_relation_related:add_locator: Sorry: wrap_div dom element not found")
				}
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
						//return console.log(trigger_vars);

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
				return alert("component_relation_related:remove_locator: Sorry: wrap_div dom element not found")
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



	/**
	* LINK_TERM
	* Se llama aquí desde la ventana flotante del tesauro
	* @param object button_obj
	*	Botón del tesauro desde donde se hace click (contiene los datos su dataset)
	* @param object url_vars
	*	Objecto con las variables que la ventana del tesauro recibe y después vuelve a pasar de forma transparente
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		var locator = {
			"section_id" 	: section_id,
			"section_tipo"  : section_tipo
		}

		return this.add_locator( locator )
	};//end link_term




}//end component_relation_related

