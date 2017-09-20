





var component_relation_children = new function() {


	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_LIB_BASE_URL + '/component_relation_children/trigger.component_relation_children.php';


	/**
	* SAVE (Deprecated!)
	*//*
	this.Save = function(component_obj) {
		alert("Deprecated!!")
	
		this.save_arguments.dato 		= this.get_dato( component_obj );
		this.save_arguments.url_trigger = this.url_trigger
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
	*/



	/**
	* GET_DATO
	* Iterate all inputs and get all values as array of locators
	* @return array dato
	*//*
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
	*/



	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");		
		
		// If only one is present, we focus it on click wrapper
		var ar_input_text = obj_wrap.querySelectorAll('[data-role="component_relation_children_input"]')
			if (ar_input_text.length===1) {
				var input_text = ar_input_text[0]
				if(input_text) {
					input_text.focus();
				}
			}
		
		return false;
	}//end select_component



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
				
		var url = DEDALO_LIB_BASE_URL + '/main/?t=' + button_obj.dataset.target_section_tipo + '&context_name='+context_name
		var strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
			//strWindowFeatures=null
		if(children_selector_window === null || children_selector_window.closed) {
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
		this.add_children(locator)

		// Close opened window
		if(children_selector_window) children_selector_window.close();
	};//end add_relation_from_opened_window



	/**
	* ADD_CHILDREN
	* Clone first DOM input element, update value with requested locator and
	* trigger save normally
	*/
	this.add_children = function(locator) {

		// Children component data from received locator
		var locator_obj 		= typeof locator === 'string' ? JSON.parse(locator) : locator
		var target_section_tipo = locator_obj.section_tipo
		var target_section_id   = locator_obj.section_id

		if (component_common.selected_wrap_div) {
			// From tree
			var wrap_div = component_common.selected_wrap_div
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_common.selected_wrap_div);
				return alert("[component_relation_children.add_children] Sorry, wrap_div dom element not found")
			}
		}else{
			// From list
			if(this.opener_button===null) return alert("[component_relation_children.add_children] Error. Button obj not found: opener_button");

			// From component wrapper
			var wrap_div = find_ancestor(this.opener_button, 'wrap_component')
				if (wrap_div === null ) {
					if(DEBUG) console.log(this.opener_button);
					return alert("[component_relation_children.add_children] Sorry, wrap_div dom element not found")
				}
		}		

		// SAVE
		var trigger_vars = {
				mode 	 			: 'add_children',
				tipo 	 			: wrap_div.dataset.tipo,
				parent	 		  	: wrap_div.dataset.parent,
				section_tipo 		: wrap_div.dataset.section_tipo,
				target_section_tipo : target_section_tipo,
				target_section_id   : target_section_id,
			}
			//return console.log("[component_relation_children.add_children] trigger_vars",trigger_vars);
						
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_relation_children.add_children] response",response, wrap_div.id)
				//console.trace()
			}

			// Reloads always the component
			component_common.load_component_by_wrapper_id( wrap_div.id );

			// Response is bool value decoded from json trigger response
			if (response && response.result===true) {
				
				// Inspector msg
				var label = wrap_div.querySelector("label").innerHTML || "no label"
				var msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
				inspector.show_log_msg(msg);
			}//end if (response===true) {
		})//end promise	

		return js_promise	
	};//end add_children



	/**
	* REMOVE_CHILDREN
	*/
	this.remove_children = function( button_obj ) {

		if (!confirm(get_label.seguro)) return false;

		// From component wrapper
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_relation_children:remove_children: Sorry: wrap_div dom element not found")
			}
	
		var trigger_vars = {
			mode 	 			: 'remove_children',
			tipo 	 			: wrap_div.dataset.tipo,
			parent	 			: parseInt(wrap_div.dataset.parent),
			section_tipo 		: wrap_div.dataset.section_tipo,
			target_section_tipo : button_obj.dataset.target_section_tipo,
			target_section_id	: parseInt(button_obj.dataset.target_section_id)
		}
		//return console.log(trigger_vars);

		// SAVE
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_relation_children.remove_children] response",response, wrap_div.id)
				//console.trace()
			}

			// Reloads always the component
			component_common.load_component_by_wrapper_id( wrap_div.id );

			if (response && response.result===true) {
				// Inspector msg
				var label = wrap_div.querySelector("label").innerHTML || "no label"
				var msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
				inspector.show_log_msg(msg);
			}
		})//end promise	

		return js_promise			
	};//end remove_children



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

		return this.add_children( locator )
	};//end link_term




}//end component_relation_children