/**
* COMPONENT SEMANTIC NODE CLASS
*
*
*
*/
var component_semantic_node = new function() {


	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_semantic_node/trigger.component_semantic_node.php' ;
	//this.button_obj  = null;


	/**
	* OPEN_TS_WINDOW
	* Abrir listado de tesauro para hacer relaciones
	*/
	this.open_ts_window = function(button_obj) {

		// Fix current element
		component_semantic_node.button_obj = button_obj

		component_semantic_node.wrapper_id = component_common.get_wrapper_id_from_element(button_obj)
		//this.get_wrapper_id_from_element = function(el, sel)

		// Call standar components open ts window
		component_common.open_ts_window(button_obj)
	}//end open_ts_window



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return string dato
	*	json encoded data
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_autocomplete:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const hidden_input = wrapper_obj.querySelector('input[data-role="dato_hidden"]')
		if (typeof(hidden_input)==="undefined" || !hidden_input) {
			console.log("[component_autocomplete:get_dato] Error. Invalid hidden_input");
			return false
		}

		const dato = JSON.parse(hidden_input.value) || null

		return dato
	}//end get_dato
	


	/**
	* LINK_TERM
	* @return promise
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		var new_ds_locator = {
			"section_id" 	: section_id,
			"section_tipo"  : section_tipo
		}

		return this.add_index(new_ds_locator)
	};//end link_term



	/**
	* ADD_INDEX
	* Note that button_obj is in tesaurus, not in portal
	*/
	this.add_index = function(new_locator) {

		const self = this

		const button_obj = component_semantic_node.button_obj
		if(!button_obj) {
			alert("Error on find button_obj")
			return
		}

		const new_ds_locator = {
			type				: "dd151",
			section_id			: new_locator.section_id,
			section_tipo		: new_locator.section_tipo,
			from_component_tipo	: button_obj.dataset.from_component_tipo
		}

		const semantic_wrapper  = document.getElementById(button_obj.dataset.semantic_wrapper_id)
		const component_wrapper = document.getElementById(component_semantic_node.wrapper_id)
		if(!component_wrapper) {
			alert("Error on find component_wrapper")
			return
		}

		const modo			= component_wrapper.dataset.modo
		const tipo			= component_wrapper.dataset.tipo
		const section_tipo	= component_wrapper.dataset.section_tipo

		switch(modo) {

			case 'search':
				const js_promise_search2 = common.get_json_data(this.url_trigger, {
					mode			: 'get_search_html',
					tipo			: tipo,
					section_tipo	: section_tipo,
					row_locator		: '{"ds":['+JSON.stringify(new_ds_locator)+']}'
				})
				.then(function(response) {
					semantic_wrapper.outerHTML = response.result
				})
				return js_promise_search2
				break;

			case 'search_DES':

				// Ajax call
				const js_promise2 = common.get_json_data(this.url_trigger, {
					mode	: 'resolve_term',
					locator	: JSON.stringify(new_ds_locator)
				})
				.then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log("[component_semantic_node.add_index] response",response)
					}

					if (response===null) {
						alert("Error on add_index semantic node")
						return Promise.resolve(true);
					}

					const label = response.result

					// 'ul_valor' is ul element
						const ul_valor = semantic_wrapper.querySelector('.ul_component_semantic_node')

					// clean wrapper
						while (ul_valor.firstChild) {
							ul_valor.removeChild(ul_valor.firstChild);
						}

					// New li element
						const new_li = common.create_dom_element({
							element_type	: 'li',
							parent			: ul_valor
						})

					// button_delete
						const button_delete = common.create_dom_element({
							element_type	: 'div',
							class_name		: 'icon_bs link delete_component_semantic_node',
							title			: 'Delete',
							dataset : {
								semantic_wrapper_id : semantic_wrapper.id
							},
							parent			: new_li
						})
						button_delete.addEventListener('click', function(event){
					  		self.remove_search_index(this,event)
						})

					// label
						common.create_dom_element({
							element_type	: 'span',
							inner_html		: label,
							parent			: new_li
						})

					// hidden_input. Add input for compatibility with fix_dato
						const hidden_input = common.create_dom_element({
							element_type	: 'input',
							type			: 'text',
							class_name		: '',
							dataset	: {
								role : 'dato_hidden'
							},
							parent			: new_li
						})
						const value =  '{"ds":['+JSON.stringify(new_ds_locator)+']}'
						hidden_input.setAttribute('value', value)
							console.log("value:",value);

					// Search component modo case
						component_common.fix_dato(hidden_input,'component_semantic_node')


				}, function(error) {
					semantic_wrapper.innerHTML = JSON.stringify(error)
					console.error("[component_semantic_node.add_index] Failed get_json!", error);
				})


				return js_promise2
				break;

			default:

				const trigger_vars = {
					mode 						: 'add_index',
					component_tipo 				: component_wrapper.dataset.tipo,
					parent 		 				: component_wrapper.dataset.parent,
					section_tipo 				: component_wrapper.dataset.section_tipo,
					portal_locator_section_tipo : button_obj.dataset.portal_locator_section_tipo,
					portal_locator_section_id 	: button_obj.dataset.portal_locator_section_id,
					new_ds_locator				: JSON.stringify(new_ds_locator),
					ds_from_component_tipo 		: button_obj.dataset.from_component_tipo
				}

				semantic_wrapper.innerHTML = "<span class=\"blink\"> Loading.. </span>"

				// Ajax call
				var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
						if(SHOW_DEBUG===true) {
							console.log("[component_semantic_node.add_index] response",response)
						}

						if (response===null) {
							alert("Error on add_index semantic node")
						}else if(response.result) {
							semantic_wrapper.outerHTML = response.result
						}

				}, function(error) {
					semantic_wrapper.innerHTML = JSON.stringify(error)
					console.error("[component_semantic_node.add_index] Failed get_json!", error);
				})

			return js_promise
			break;
		}//end switch

		return false
	}//end add_index



	/**
	* REMOVE_INDEX
	*/
	this.remove_index = function(button_obj) {

		if (!confirm(get_label.seguro)) return false;

		var semantic_wrapper  = document.getElementById(button_obj.dataset.semantic_wrapper_id)
		var component_wrapper = this.selected_wrap_div = find_ancestor(button_obj, 'wrap_component')

		var trigger_vars = {
				mode 						: 'remove_index',
				component_tipo 				: component_wrapper.dataset.tipo,
				parent 		 				: component_wrapper.dataset.parent,
				section_tipo 				: component_wrapper.dataset.section_tipo,
				portal_locator_section_tipo : button_obj.dataset.portal_locator_section_tipo,
				portal_locator_section_id 	: button_obj.dataset.portal_locator_section_id,
				new_ds_locator				: button_obj.dataset.locator_ds,
				ds_from_component_tipo 		: button_obj.dataset.from_component_tipo
			}
		//return console.log("[component_semantic_node.remove_index]",trigger_vars)

		// Ajax call
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_semantic_node.remove_index] response",response)
				}
				
				if (response===null) {
					alert("Error on add_index semantic node")
				}else if(response.result) {
					semantic_wrapper.outerHTML = response.result
				}

		}, function(error) {
				semantic_wrapper.innerHTML = JSON.stringify(error)
				console.error("[component_semantic_node.remove_index] Failed get_json!", error);
		})


		return js_promise		
	}//end remove_index



	/**
	* REMOVE_INDEX
	*/
	this.remove_search_index = function(button_obj) {

		if (!confirm(get_label.seguro)) return false;

		const semantic_wrapper		= document.getElementById(button_obj.dataset.semantic_wrapper_id)
		// const component_wrapper	= this.selected_wrap_div = find_ancestor(button_obj, 'wrap_component')
		const hidden_input			= semantic_wrapper.querySelector('input[data-role="dato_hidden"]')
		const ul_valor				= semantic_wrapper.querySelector('ul.ul_component_semantic_node')

		// update search dato
			component_common.fix_dato(hidden_input,'component_semantic_node')

		// clean wrapper
			while (ul_valor.firstChild) {
				ul_valor.removeChild(ul_valor.firstChild);
			}


		return true
	}//end remove_index




	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* Every component have a specific conversion, but use this common method for fallback on
	* new components or when is not defined.
	* @see search2.js > recursive_groups
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {

		return JSON.stringify(dato)
	}
	


};//end component_semantic_node