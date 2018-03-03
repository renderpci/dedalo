"use strict"
/**
* COMPONENT_RELATION_PARENT
* Class to manage parent relation between section.
* Not store his own data, only manage component_relation_childrens data in 'reverse' mode
*/
var component_relation_parent = new function() {


	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_LIB_BASE_URL + '/component_relation_parent/trigger.component_relation_parent.php';



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
	};//end select_component



	/**
	* OPEN_PARENT_SELECTOR_WINDOW
	* @return 
	*/
	var parent_selector_window = null; // Global var
	this.opener_button = null;	// class var
	this.open_parent_selector_window = function(button_obj) {

		// Fix current button_obj as var
		this.opener_button = button_obj
		
		// context_name
		const context_name = 'select_parent'
		
		const url = DEDALO_LIB_BASE_URL + '/main/?t=' + button_obj.dataset.target_tipo + '&context_name='+context_name+ '&menu=0'
		const strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
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
	this.add_relation_from_opened_window = function(button_obj) {

		const locator = button_obj.dataset.locator
		this.add_parent(locator)	

		// Close opened window
		if(parent_selector_window) parent_selector_window.close();
	};//end add_relation_from_opened_window



	/**
	* ADD_PARENT
	* @param locator
	* NOTE: argument 'locator' is used for standarize the way of send vars from section list selector
	* Inside locator yo can get the section_tipo and section_id needed for this request
	*/
	this.add_parent = function(locator) {

		// Children component data from received locator
		let locator_obj 		  = typeof locator === 'string' ? JSON.parse(locator) : locator
		let children_section_tipo = locator_obj.section_tipo
		let children_section_id   = locator_obj.section_id

		let wrap_div
		if (component_common.selected_wrap_div) {
			// From tree
			wrap_div = component_common.selected_wrap_div
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_common.selected_wrap_div);
				return alert("component_relation_children:add_children: Sorry: wrap_div dom element not found")
			}
		}else{
			// From list
			if(this.opener_button===null) return alert("Error. Button obj not found: opener_button");

			// From component wrapper
			wrap_div = find_ancestor(this.opener_button, 'wrap_component')
				if (wrap_div === null ) {
					if(DEBUG) console.log(this.opener_button);
					return alert("component_relation_related:add_locator: Sorry: wrap_div dom element not found")
				}
		}

		// SAVE
		const trigger_vars = {
				mode 	 				: 'add_parent',
				tipo 	 				: wrap_div.dataset.tipo,
				parent	 			  	: wrap_div.dataset.parent,
				section_tipo 			: wrap_div.dataset.section_tipo,
				children_section_tipo   : children_section_tipo,
				children_section_id 	: children_section_id,
				children_component_tipo : wrap_div.dataset.children_component_tipo
			}
			//return console.log("[component_relation_parent.add_parent] trigger_vars",trigger_vars);

		common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_relation_children:add_parent] response",response)
			}
			
			// Reloads always the component
			component_common.load_component_by_wrapper_id( wrap_div.id );

			// Response is bool value decoded from json trigger response
			if (response && response.result===true) {				
				// Inspector msg
				let label = wrap_div.querySelector("label").innerHTML
				let msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
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
		let wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("[component_relation_children:remove_children] Sorry: wrap_div dom element not found")
			}

		// SAVE
		const trigger_vars = {
				mode 	 				: 'remove_parent',
				tipo 	 				: wrap_div.dataset.tipo,
				parent	 				: wrap_div.dataset.parent,
				section_tipo 			: wrap_div.dataset.section_tipo,
				children_section_tipo 	: button_obj.dataset.children_section_tipo,
				children_section_id 	: button_obj.dataset.children_section_id,
				children_component_tipo : button_obj.dataset.children_component_tipo
			}
			//return 	console.log(trigger_vars);

		common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_relation_children:remove_children] response",response)
			}

			// Reloads always the component
			component_common.load_component_by_wrapper_id( wrap_div.id );

			// Response is bool value decoded from json trigger response
			if (response && response.result===true) {

				// Inspector msg
				let label = wrap_div.querySelector("label").innerHTML
				let msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
				inspector.show_log_msg(msg);
			}//end if (response===true) {
		})//end promise		
	};//end remove_parent



	/**
	* LINK_TERM
	* Se llama aquí desde la ventana flotante del tesauro
	* @param object button_obj
	*	Botón del tesauro desde donde se hace click (contiene los datos su dataset)
	* @param object url_vars
	*	Objecto con las variables que la ventana del tesauro recibe y después vuelve a pasar de forma transparente
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		const locator = {
			"section_id" 	: section_id,
			"section_tipo"  : section_tipo
		}

		return this.add_parent( locator )
	};//end link_term



}//end component_relation_parent