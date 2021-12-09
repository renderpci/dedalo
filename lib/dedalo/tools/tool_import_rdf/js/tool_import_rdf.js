/*
	tool_import_rdf
*/


// tool_import_rdf CLASS
var tool_import_rdf = new function() {

	this.trigger_tool_import_rdf = DEDALO_LIB_BASE_URL + '/tools/tool_import_rdf/trigger.tool_import_rdf.php'

	// properties
	this.data
	this.container



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		// debug
			if(SHOW_DEBUG===true) {
				console.log("->tool_import_rdf init options:",options);
			}
		
		const self = this

		return new Promise(function(resolve){
			
			self.section_tipo	= options.section_tipo
			self.section_id		= options.section_id
			self.component_dato	= options.component_dato
			self.container		= options.container
			self.ontology_tipo 	= options.ontology_tipo

			// checkbox values IRI
			const node =	self.render()
			self.container.appendChild(node)

			resolve(self)
		})
	};//end init



	/**
	* RENDER_COMPONENT_DATO
	* @return
	*/
	this.render_component_dato = function() {

		const self = this
		const component_dato = self.component_dato
		const len 	= component_dato.length

		const checkbox_div = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'component_dato_div'
		})

		for (let i = 0; i < len; i++) {

			const current_component = component_dato[i]
			const checkbox_label = common.create_dom_element({
							element_type	: 'label',
							class_name		: 'component_dato_label',
							inner_html		: current_component.iri,
							parent 			: checkbox_div
			})
			const checkbox_input = common.create_dom_element({
							element_type	: 'input',
							type 			: 'checkbox',
							class_name		: 'component_dato',
							value 			: current_component.iri,
			})
			checkbox_label.prepend(checkbox_input)

		}



		return checkbox_div
	};//end render_component_dato



	/**
	* RENDER
	* @return 
	*/
	this.render = function() {

		const self = this

		const fragment = new DocumentFragment()

		// item wrapper
			const select_data_wrapper = common.create_dom_element({
				element_type	: 'div',
				class_name		: 'select_data_wrapper',
				parent			: fragment
			})

			const view_dd_data_wrapper = common.create_dom_element({
				element_type	: 'div',
				class_name		: 'view_dd_data_wrapper',
				parent			: fragment
			})


			const view_rdf_data_wrapper = common.create_dom_element({
				element_type	: 'div',
				class_name		: 'view_rdf_data_wrapper',
				parent			: fragment
			})

			const component_dato_node = self.render_component_dato()

			select_data_wrapper.appendChild(component_dato_node)

			const btn_validate = common.create_dom_element({
					element_type	: 'button',
					class_name		: 'btn_validate',
					inner_html		: 'ok',
					parent			: select_data_wrapper
			})

			btn_validate.addEventListener('click',()=>{
				const component_dato_value = component_dato_node.querySelectorAll('.component_dato:checked')

				const len = component_dato_value.length
				const ar_values = []
				for (let i = 0; i < len; i++) {
					ar_values.push(component_dato_value[i].value)
				}

				if (ar_values.length){

					// trigger request
						const trigger_url = self.trigger_tool_import_rdf
						const trigger_vars= {
							mode			: 'get_rdf_data',
							ontology_tipo	: self.ontology_tipo,
							ar_values		: ar_values,
							locator	: {
								section_tipo	: self.section_tipo,
								section_id		: self.section_id,
							}
						}; //return console.log("trigger_vars:",trigger_url, trigger_vars);
						const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
							if(SHOW_DEBUG===true) {
								console.log("response:",response);
							}

							const len = ar_values.length
							for (let i = 0; i < len; i++) {
								const current_data = ar_values[i]

								view_rdf_data_wrapper.innerHTML = response.rdf_data[i].ar_rdf_html

								const node = self.render_dd_data(response.rdf_data[i].dd_obj, 'root')

								view_dd_data_wrapper.appendChild(node)
							}

							// update list
								// self.load_section(section_tipo)
						})

				}

			})


			return fragment

	};//end render


	/**
	* RENDER_DD_DATA
	* @return
	*/
	this.render_dd_data = function(dd_obj, curent_tipo) {

		const self = this

		const fragment = new DocumentFragment()

		const ar_current_data = dd_obj.filter(item => item.parent === curent_tipo)

		if(ar_current_data){
			const len = ar_current_data.length
			for (let i = 0; i < len; i++) {

				const data = ar_current_data[i]
				const select_data_wrapper = common.create_dom_element({
						element_type	: 'span',
						class_name		: 'dd_data',
						parent			: fragment,
						inner_html 		: data.section_tipo_label +' → '+ data.component_label +' → '+ data.value +'  '
					})

				const node = self.render_dd_data(dd_obj, data.tipo)
				select_data_wrapper.appendChild(node)
			}

			const dd_data_divisor = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'dd_data_divisor',
						parent			: fragment,
					})

		}

		return fragment
	};//end render_dd_data





};//end tool_import_rdf