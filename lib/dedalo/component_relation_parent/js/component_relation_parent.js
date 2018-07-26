"use strict"
/**
* COMPONENT_RELATION_PARENT
* Class to manage parent relation between section.
* Not store his own data, only manage component_relation_childrens data in 'reverse' mode
*/
var component_relation_parent = new function() {


	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_LIB_BASE_URL + '/component_relation_parent/trigger.component_relation_parent.php';

	// autocomplete_trigger_url . For service autocomplete
	this.autocomplete_trigger_url = DEDALO_LIB_BASE_URL + '/component_autocomplete_hi/trigger.component_autocomplete_hi.php';



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		const self = this

		const wrapper = document.getElementById('wrapper_' + options.uid)
			if (!wrapper) {
				alert("Error on get component wrapper from uid: " + options.uid); return false
			}
		const autocomplete_wrapper = document.getElementById('aw_' + options.uid)
			if (!autocomplete_wrapper) {
				alert("Error on get component autocomplete_wrapper from uid: " + options.uid); return false
			}

		// Init autocomplete service
		service_autocomplete.init({
			component_js  		 : self,
			autocomplete_wrapper : autocomplete_wrapper
		})


		return true
	}//end init



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
	}//end select_component



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
	}//end open_parent_selector_window



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
	}//end add_relation_from_opened_window



	/**
	* ADD_LOCATOR
	* Alias of add_parent for unified interface
	* @return 
	*/
	this.add_locator = function(locator, wrap_div) {

		return this.add_parent(locator, wrap_div)
	}//end add_locator



	/**
	* ADD_PARENT
	* @param locator
	* NOTE: argument 'locator' is used for standarize the way of send vars from section list selector
	* Inside locator yo can get the section_tipo and section_id needed for this request
	*//*
	this.add_parent = function(locator, wrap_div, refresh_component) {

		// Children component data from received locator
		let locator_obj 		  = typeof locator === 'string' ? JSON.parse(locator) : locator
		let children_section_tipo = locator_obj.section_tipo
		let children_section_id   = locator_obj.section_id

		// WRAP_DIV
		if (typeof wrap_div==="undefined" || !wrap_div) {

			if (component_common.selected_wrap_div) {
				// From tree
				wrap_div = component_common.selected_wrap_div
				if (wrap_div === null ) {
					if(SHOW_DEBUG===true) console.log(component_common.selected_wrap_div);
					return alert("component_relation_parent:add_parent: Sorry: wrap_div dom element not found")
				}
			}else{
				// From list
				if(this.opener_button===null) return alert("Error. Button obj not found: opener_button");

				// From component wrapper
				wrap_div = find_ancestor(this.opener_button, 'wrap_component')
					if (wrap_div === null ) {
						if(SHOW_DEBUG===true) console.log(this.opener_button);
						return alert("component_relation_related:add_locator: Sorry: wrap_div dom element not found")
					}
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
			}; //return console.log("[component_relation_parent.add_parent] trigger_vars",trigger_vars);

		common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_relation_parent:add_parent] response",response)
			}
			
			// Reloads always the component
			if (refresh_component===true) {
				 component_common.load_component_by_wrapper_id( wrap_div.id );
			}			

			// Response is bool value decoded from json trigger response
			if (response && response.result===true) {				
				// Inspector msg
				let label = wrap_div.querySelector("label").innerHTML
				let msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
				inspector.show_log_msg(msg);
			}//end if (response===true) {
		})//end promise		
	}//end add_parent
	*/



	/**
	* REMOVE_PARENT
	*//*
	this.remove_parent = function(btn_obj) {

		if (!confirm(get_label.seguro)) {
			return false;
		}

		// From component wrapper
		const wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("[component_relation_parent:remove_children] Sorry: wrap_div dom element not found")
			}
	
		const locator_to_delete 		= JSON.parse(btn_obj.dataset.current_value)
		const children_section_tipo 	= locator_to_delete.section_tipo
		const children_section_id 		= locator_to_delete.section_id
		const children_component_tipo 	= locator_to_delete.component_tipo

		// SAVE
		const trigger_vars = {
				mode 	 				: 'remove_parent',
				tipo 	 				: wrap_div.dataset.tipo,
				parent	 				: wrap_div.dataset.parent,
				section_tipo 			: wrap_div.dataset.section_tipo,
				children_section_tipo 	: children_section_tipo, //btn_obj.dataset.children_section_tipo,
				children_section_id 	: children_section_id, //btn_obj.dataset.children_section_id,
				children_component_tipo : children_component_tipo //btn_obj.dataset.children_component_tipo
			}
			//return console.log(trigger_vars);

		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_relation_parent:remove_children] response",response)
			}

			// Reloads always the component
			// component_common.load_component_by_wrapper_id( wrap_div.id );

			// Response is bool value decoded from json trigger response
			if (response && response.result===true) {

				// Inspector msg
				let label = wrap_div.querySelector("label").innerHTML
				let msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
				inspector.show_log_msg(msg);
			}//end if (response===true) {

		})//end promise

		return js_promise	
	}//end remove_parent
	*/


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

		const ui = {
			item : {
				label    : label,
				original : label
			}
		}

		return this.add_locator(locator, null, ui, true)
		//return this.add_parent( locator, null, true )
	}//end link_term



	// NEXT . Only for search mode for the moment (NOT for edit) ! ///////////////////////////////////////


		/**
		* ADD_LOCATOR
		*
		* Alias of add_parent for unified interface
		* @return 
		*/
		this.add_locator = function(locator, wrap_div, ui, refresh_component) {

			const self = this

			// Children component data from received locator
			const locator_obj 		  = (typeof locator==='string') ? JSON.parse(locator) : locator
			const children_section_tipo = locator_obj.section_tipo
			const children_section_id   = locator_obj.section_id

			if (typeof refresh_component==="undefined") {
				refresh_component = true; // True by default
			}

			// WRAP_DIV
			if (typeof wrap_div==="undefined" || !wrap_div) {

				if (component_common.selected_wrap_div) {
					// From tree
					wrap_div = component_common.selected_wrap_div
					if (wrap_div === null ) {
						if(SHOW_DEBUG===true) console.log(component_common.selected_wrap_div);
						return alert("[component_relation_parent.add_parent] Sorry, wrap_div dom element not found")
					}
				}else{
					// From list
					if(self.opener_button===null) return alert("[component_relation_parent.add_parent] Error. Button obj not found: opener_button");

					// From component wrapper
					wrap_div = find_ancestor(self.opener_button, 'wrap_component')
						if (wrap_div === null ) {
							if(SHOW_DEBUG===true) console.log(self.opener_button);
							return alert("[component_relation_parent.add_parent] Sorry, wrap_div dom element not found")
						}
				}
			}
			

			const hidden_input = wrap_div.querySelector("input.relation_parent_dato_hidden")
			if (!hidden_input) {
				alert("[component_relation_parent.add_locator] Error on get hidden_input")
				return false
			}

			// Get current hidden input value
			const current_input_value = hidden_input.value || '[]';
			//console.log(current_input_value); return;

			// parse josn string value to object
			const current_val = JSON.parse( current_input_value ) || []
				
				// check if value already exits
				for (let key in current_val) {
					if(JSON.stringify(current_val[key]) === JSON.stringify(locator)){
						console.log("[component_relation_parent.add_locator] Value already exits. Ignored value: "+JSON.stringify(locator)+" => ", ui.item.label);
						return false
					}
				}

			// Limit (optional, defined in 'propiedades' and set on init)
			const limit = parseInt(hidden_input.dataset.limit)							
			if(limit>0 && parseInt(current_val.length)>=limit) {
				// Warning. Limit reached
				alert("[component_relation_parent.add_locator] Limit reached ("+limit+"). Skipped term !!");
				return false
			}else{
				// Add value to current object
				current_val.push(locator)
			}
		
			// Set modified value to component input as text
			const value_string = JSON.stringify(current_val)
			hidden_input.value = value_string
			hidden_input.setAttribute("value", value_string)
			
			const ul_valor = wrap_div.querySelector('.css_relation_parent_valor')				
			
			// New li element
			const new_li = document.createElement('li')
			// button_delete
			const new_li_button_delete = document.createElement('div')
				new_li_button_delete.classList.add('icon_bs','link','css_relation_parent_button_delete')
				new_li_button_delete.dataset.current_value = JSON.stringify(locator)
				new_li_button_delete.addEventListener('click', function(event){
					component_relation_parent.delete(this)
				}, false);
			// label
			const new_li_label = document.createElement('span')
				new_li_label.innerHTML = ui.item.original // label

				new_li.appendChild(new_li_button_delete)
				new_li.appendChild(new_li_label)

			// Add created li to ul
			ul_valor.appendChild(new_li)

			// modo cases
			switch(wrap_div.dataset.modo) {
				case "edit":
					// SAVE
					const trigger_url  = this.url_trigger
					const trigger_vars = {
							mode 	 				: 'add_parent',
							tipo 	 				: wrap_div.dataset.tipo,
							parent	 			  	: wrap_div.dataset.parent,
							section_tipo 			: wrap_div.dataset.section_tipo,
							children_section_tipo   : children_section_tipo,
							children_section_id 	: children_section_id,
							children_component_tipo : wrap_div.dataset.children_component_tipo
						}; //return console.log("[component_relation_parent.add_parent] trigger_vars",trigger_vars);

					common.get_json_data(trigger_url, trigger_vars).then(function(response){
						if(SHOW_DEBUG===true) {
							console.log("[component_relation_parent:add_parent] response",response)
						}
						
						// Reloads always the component
						if (refresh_component===true) {
							 component_common.load_component_by_wrapper_id( wrap_div.id );
						}			

						// Response is bool value decoded from json trigger response
						if (response && response.result===true) {				
							// Inspector msg
							let label = wrap_div.querySelector("label").innerHTML
							let msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
							inspector.show_log_msg(msg);
						}//end if (response===true) {
					})//end promise	
					break;
				case "search":
					component_common.fix_dato(hidden_input,'component_relation_parent')
					break;
				default:
					console.log("[component_relation_parent.add_locator] Ignored invalid add locator mode:",wrap_div.dataset.modo);
			}

			return true;
		}//end add_locator



		/**
		* DELETE
		*
		*/
		this.delete = function(btn_obj) {

			const self = this

			// Component wrapper		
			const wrap_div = find_ancestor(btn_obj, 'wrap_component')
				if (wrap_div === null ) {
					if(SHOW_DEBUG===true) console.log("[component_relation_parent:delete] btn_obj",btn_obj);
					return alert("[component_relation_parent:delete] Sorry: wrap_div dom element not found")
				}

			if (wrap_div.dataset.modo==="edit" && !confirm(get_label.seguro)) {
				return false;
			}
		
			// value_to_remove
			const value_to_remove = JSON.parse(btn_obj.dataset.current_value)

			// Set value to component hidden dato input		
			const input_text_hide = wrap_div.querySelector('input.relation_parent_dato_hidden')
		
			// Hidden value
			let current_value = JSON.parse(input_text_hide.value)			

			// Remove current value from array
			const len = current_value.length
			for(let i = len - 1; i >= 0; i--) {
				///console.log(current_value[i]); console.log(value_to_remove);
				if( JSON.stringify(current_value[i]) === JSON.stringify(value_to_remove) ) {			
					current_value.splice(i, 1);
					if(SHOW_DEBUG===true) {
						console.log("[component_relation_parent:delete] deleted locator i:"+i+" "+JSON.stringify(value_to_remove)) ;
					}
				}
			}					

			// Save when edit
			//if (page_globals.modo==='edit') {		
			//	this.Save(input_text_hide);
			//}
			
			// modo cases
			switch(wrap_div.dataset.modo) {
				case "edit":

					const locator_to_delete 		= JSON.parse(btn_obj.dataset.current_value)
					
					const children_section_tipo 	= locator_to_delete.section_tipo
					const children_section_id 		= locator_to_delete.section_id
					const children_component_tipo 	= locator_to_delete.from_component_tipo

					// SAVE
					const trigger_url  = this.url_trigger
					const trigger_vars = {
							mode 	 				: 'remove_parent',
							tipo 	 				: wrap_div.dataset.tipo,
							parent	 				: wrap_div.dataset.parent,
							section_tipo 			: wrap_div.dataset.section_tipo,
							children_section_tipo 	: children_section_tipo, //btn_obj.dataset.children_section_tipo,
							children_section_id 	: children_section_id, //btn_obj.dataset.children_section_id,
							children_component_tipo : children_component_tipo //btn_obj.dataset.children_component_tipo
						}; //console.log(trigger_vars);

					common.get_json_data(trigger_url, trigger_vars).then(function(response){
						if(SHOW_DEBUG===true) {
							console.log("[component_relation_parent:delete] response",response)
						}
						// Reloads always the component
						// component_common.load_component_by_wrapper_id( wrap_div.id );

						// Response is bool value decoded from json trigger response
						if (response && response.result===true) {

							// Inspector msg
							let label = wrap_div.querySelector("label").innerHTML
							let msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
							inspector.show_log_msg(msg);

							// Update input value
							input_text_hide.value = JSON.stringify(current_value)
							// Update showed text. Remove li element
							btn_obj.parentNode.remove()
						}//end if (response===true) {

					})//end promise					
					break;
				case "search":
					// Update input value
					input_text_hide.value = JSON.stringify(current_value)
					// Update showed text. Remove li element
					btn_obj.parentNode.remove();

					component_common.fix_dato(input_text_hide,'component_relation_parent')					
					break;
				default:
					console.log("[component_relation_parent.add_locator] Ignored invalid add locator mode:",wrap_div.dataset.modo);
			}

			return true;
		}//end delete



		/**
		* GET_DATO . Only for search mode for the moment (NOT for edit) !
		* @param DOM object wrapper_obj
		* @return string dato
		*	json encoded data
		*/
		this.get_dato = function(wrapper_obj) {

			if (page_globals.modo!=='list') {
				console.log("Only for search mode for the moment");
				return false;
			}
	
			if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
				console.log("[component_relation_parent:get_dato] Error. Invalid wrapper_obj");
				return false
			}

			const component_obj = wrapper_obj.querySelector('input.relation_parent_dato_hidden')
			if (typeof(component_obj)==="undefined" || !component_obj) {
				console.log("[component_relation_parent:get_dato] Error. Invalid component_obj");
				return false
			}

			let dato = []
			if (component_obj.value && component_obj.value.length>0) {
				dato = JSON.parse(component_obj.value) || []
			}
			

			return dato
		};//end get_dato



}//end component_relation_parent