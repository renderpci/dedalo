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

		const dato = hidden_input.value
			? JSON.parse(hidden_input.value)
			: null

		return dato
	}//end get_dato



	/**
	* OPEN_TS_WINDOW
	* Abrir listado de tesauro para hacer relaciones
	* @return bool
	*/
	this.open_ts_window = function(button_obj) {

		// Fix current element
			component_semantic_node.button_obj = button_obj
			component_semantic_node.wrapper_id = button_obj.parentNode.id

		// Call standar components open ts window
			const result = component_common.open_ts_window(button_obj)

		return result
	}//end open_ts_window



	/**
	* LINK_TERM
	* alias of add_index to call from thesaurus tree
	* @return promise
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		const new_ds_locator = {
			"section_id" 	: section_id,
			"section_tipo"  : section_tipo
		}

		const result = this.add_index(new_ds_locator, label)

		return result
	};//end link_term



	/**
	* ADD_INDEX
	* Note that button_obj is in tesaurus, not in portal
	*/
	this.add_index = function(new_locator, label) {

		// button add tree term
			const button_obj = component_semantic_node.button_obj // fixed previously
			if(!button_obj) {
				alert("Error on find button_obj. Not fixed (add_index)")
				return
			}

		// component_wrapper
			const component_wrapper = document.getElementById(component_semantic_node.wrapper_id)
			if(!component_wrapper) {
				alert("Error on find component_wrapper (add_index)")
				return
			}

		// new_ds_locator. Build complete new_ds_locator
			const new_ds_locator = {
				type				: "dd151",
				section_id			: new_locator.section_id,
				section_tipo		: new_locator.section_tipo,
				from_component_tipo	: component_wrapper.dataset.from_component_tipo
			}

		// short vars
			const modo			= component_wrapper.dataset.modo
			const tipo			= component_wrapper.dataset.tipo
			const section_tipo	= component_wrapper.dataset.section_tipo
			const parent		= component_wrapper.dataset.parent
			const row_locator	= component_wrapper.dataset.row_locator

		// request
			switch(modo) {

				case 'search':
					const js_promise_search2 = common.get_json_data(this.url_trigger, {
						mode			: 'get_search_html',
						tipo			: tipo,
						section_tipo	: section_tipo,
						locator_ds		: JSON.stringify(new_ds_locator)
						// row_locator	: '{"ds":['+JSON.stringify(new_ds_locator)+']}'
					})
					.then(function(response) {
						component_wrapper.outerHTML = response.result

						// (!) re-select new created DOM item
							const new_component_wrapper = document.getElementById(component_semantic_node.wrapper_id)

						// hidden input select and fix_dato to the preset temp
							const hidden_input = new_component_wrapper.querySelector('input[data-role="dato_hidden"]')
							component_common.fix_dato(hidden_input,'component_semantic_node')
					})
					return js_promise_search2
					break;

				default:

					const trigger_vars = {
						mode			: 'add_index',
						tipo			: tipo,
						section_tipo	: section_tipo,
						parent			: parent,
						locator_ds		: JSON.stringify(new_ds_locator),
						row_locator		: row_locator
					}

					component_wrapper.innerHTML = "<span class=\"blink\"> Loading.. </span>"

					// Ajax call
					const js_promise = common.get_json_data(this.url_trigger, trigger_vars)
					.then(function(response) {
						// debug
							// if(SHOW_DEBUG===true) {
							// 	console.log("[component_semantic_node.add_index] response",response)
							// }

						// error case
							if (response===null || !response.result) {
								alert("Error on add_index semantic node")
								return false
							}

						// overwrite wrapper html with result
							component_wrapper.outerHTML = response.result

					}, function(error) {
						component_wrapper.innerHTML = JSON.stringify(error)
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

		const self = this

		// user confirm
			if (!confirm(get_label.seguro)) {
				return false
			}

		const component_wrapper	= find_ancestor(button_obj, 'wrap_component')
		this.selected_wrap_div	= component_wrapper

		const trigger_vars = {
				mode			: 'remove_index',
				tipo			: component_wrapper.dataset.tipo,
				section_tipo	: component_wrapper.dataset.section_tipo,
				parent			: component_wrapper.dataset.parent, // section_id
				locator_ds		: button_obj.dataset.locator_ds,
				row_locator		: component_wrapper.dataset.row_locator
		}
		//return console.log("[component_semantic_node.remove_index]",trigger_vars)

		// Ajax call
			const js_promise = common.get_json_data(this.url_trigger, trigger_vars)
			.then(function(response) {
				// debug
					// if(SHOW_DEBUG===true) {
					// 	console.log("[component_semantic_node.remove_index] response",response)
					// }

				// trigger error case
					if (response===null || !response.result) {
						alert("Error on remove_index semantic node")
						return false
					}

				// ok. refresh component html from result
					component_wrapper.outerHTML = response.result

			}, function(error) {
				component_wrapper.innerHTML = JSON.stringify(error)
				console.error("[component_semantic_node.remove_index] Failed get_json!", error);
			})


		return js_promise		
	}//end remove_index



	/**
	* REMOVE_INDEX
	*/
	this.remove_search_index = function(button_obj) {

		if (!confirm(get_label.seguro)) return false;

		const component_wrapper	= find_ancestor(button_obj, 'wrap_component')
		const ul_valor			= component_wrapper.querySelector('ul.ul_component_semantic_node')
		const hidden_input		= component_wrapper.querySelector('input[data-role="dato_hidden"]')

		// clean hidden_input value
			hidden_input.value= null

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