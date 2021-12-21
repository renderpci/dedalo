// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'



/**
* render_tool_import_rdf
* Manages the component's logic and apperance in client side
*/
export const render_tool_import_rdf = function() {

	return true
};//end render_tool_import_rdf



/**
* render_tool_import_rdf
* Render node for use like button
* @return DOM node
*/
render_tool_import_rdf.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null)
		modal.on_close = () => {
			self.destroy(true, true, true)
		}


	return wrapper
};//end render_tool_import_rdf



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()


	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		})

	// source component
		const source_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'source_component_container',
			parent 			: components_container
		})

		// source default value check
			// if (source_select_lang.value) {
			// 	add_component(self, source_component_container, source_select_lang.value)
			// }

			const iri_node = render_component_dato(self)

			source_component_container.appendChild(iri_node)



	// target component
		const target_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'target_component_container',
			parent 			: components_container
		})

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: components_container
		})

		const btn_validate = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'btn btn-success btn_validate',
					inner_html		: 'ok',
					parent			: buttons_container
			})


		const view_rdf_data_wrapper = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'view_rdf_data_wrapper',
				parent			: fragment
			})


		btn_validate.addEventListener('click',()=>{
				const component_data_value = source_component_container.querySelectorAll('.component_data:checked')

				const spinner = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'spinner',
					parent			: view_rdf_data_wrapper
			})

				const len = component_data_value.length
				const ar_values = []
				for (let i = 0; i < len; i++) {
					ar_values.push(component_data_value[i].value)
				}

				if (ar_values.length){

					const ontology_tipo = self.main_component.context.properties.ar_tools_name.tool_import_rdf.external_ontology
						? self.main_component.context.properties.ar_tools_name.tool_import_rdf.external_ontology
						: null


					const result = self.get_rdf_data(ontology_tipo, ar_values).then(function(response){
							if(SHOW_DEBUG===true) {
								console.log("response:",response);
							}
							spinner.remove()

							const len = ar_values.length
							for (let i = 0; i < len; i++) {
								const current_data = ar_values[i]

								view_rdf_data_wrapper.innerHTML = response.rdf_data[i].ar_rdf_html

								// const node = self.render_dd_data(response.rdf_data[i].dd_obj, 'root')

								view_dd_data_wrapper.appendChild(node)
							}

							// update list
								// self.load_section(section_tipo)
						})

				}

			})


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit




/**
* ADD_COMPONENT
*/
export const add_component = async (self, component_container, value) => {

	// user select blank value case
		if (!value) {
			while (component_container.firstChild) {
				// remove node from dom (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	const component = await self.load_component(value)
	const node 		= await component.render()

	// clean container
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}

	// append node
		component_container.appendChild(node)


	return true
};//end add_component





/**
* RENDER_COMPONENT_DATO
* @return
*/
const render_component_dato = function(self) {

	const component_data	= self.main_component.data.value
	const len				= component_data.length

	const radio_button_div = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'component_data_div'
	})

	for (let i = 0; i < len; i++) {

		const current_component = component_data[i]

		const radio_label = ui.create_dom_element({
						element_type	: 'label',
						class_name		: 'component_data_label',
						inner_html		: current_component.iri,
						parent 			: radio_button_div
		})

		const radio_input = ui.create_dom_element({
						element_type	: 'input',
						type 			: 'radio',
						class_name		: 'component_data',
						name			: 'radio_selector',
						value 			: current_component.iri,
		})

		radio_label.prepend(radio_input)
	}

	return radio_button_div
};//end render_component_dato













// tool_import_rdf CLASS
const tool_import_rdf_v5 = new function() {

	// this.trigger_tool_import_rdf = DEDALO_LIB_BASE_URL + '/tools/tool_import_rdf/trigger.tool_import_rdf.php'

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

		const component_dato	= self.component_dato
		const len				= component_dato.length

		const radio_button_div = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'component_dato_div'
		})

		for (let i = 0; i < len; i++) {

			const current_component = component_dato[i]

			const radio_label = common.create_dom_element({
							element_type	: 'label',
							class_name		: 'component_dato_label',
							inner_html		: current_component.iri,
							parent 			: radio_button_div
			})

			const radio_input = common.create_dom_element({
							element_type	: 'input',
							type 			: 'radio',
							class_name		: 'component_dato',
							name			: 'radio_selector',
							value 			: current_component.iri,
			})

			radio_label.prepend(radio_input)
		}



		return radio_button_div
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
					class_name		: 'btn btn-success btn_validate',
					inner_html		: 'ok',
					parent			: select_data_wrapper
			})


			btn_validate.addEventListener('click',()=>{
				const component_dato_value = component_dato_node.querySelectorAll('.component_dato:checked')

				const spinner = common.create_dom_element({
					element_type	: 'span',
					class_name		: 'spinner',
					parent			: view_rdf_data_wrapper
			})

				const len = component_dato_value.length
				const ar_values = []
				for (let i = 0; i < len; i++) {
					ar_values.push(component_dato_value[i].value)
				}

				if (ar_values.length){

					// trigger request
						// const trigger_url = self.trigger_tool_import_rdf
						// const trigger_vars= {
						// 	mode			: 'get_rdf_data',
						// 	ontology_tipo	: self.ontology_tipo,
						// 	ar_values		: ar_values,
						// 	locator	: {
						// 		section_tipo	: self.section_tipo,
						// 		section_id		: self.section_id,
						// 	}
						// }; //return console.log("trigger_vars:",trigger_url, trigger_vars);
						// const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
						// 	if(SHOW_DEBUG===true) {
						// 		console.log("response:",response);
						// 	}
						// 	spinner.remove()

						// 	const len = ar_values.length
						// 	for (let i = 0; i < len; i++) {
						// 		const current_data = ar_values[i]

						// 		view_rdf_data_wrapper.innerHTML = response.rdf_data[i].ar_rdf_html

						// 		// const node = self.render_dd_data(response.rdf_data[i].dd_obj, 'root')

						// 		view_dd_data_wrapper.appendChild(node)
						// 	}

						// 	// update list
						// 		// self.load_section(section_tipo)
						// })

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
};//end tool_import_rdf_v5