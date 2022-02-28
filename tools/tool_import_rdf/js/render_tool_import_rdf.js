/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'



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

	// get the component_iri data
	const iri_node = render_component_dato(self)

	components_container.appendChild(iri_node)

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: components_container
		})

		const btn_validate = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'success button_apply',
			inner_html		: 'ok',
			parent			: buttons_container
		})

		const view_rdf_data_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'view_rdf_data_wrapper',
			parent			: fragment
		})

		// when user click the button do the import of the data.
		btn_validate.addEventListener('click',()=>{
				const component_data_value = iri_node.querySelectorAll('.component_data:checked')

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

				if (ar_values.length > 0){

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

								view_rdf_data_wrapper.innerHTML = response.result[i].ar_rdf_html

								// const node = self.render_dd_data(response.rdf_data[i].dd_obj, 'root')

								view_dd_data_wrapper.appendChild(node)
							}

							// update list
								// self.load_section(section_tipo)
						})

				}else{
					// spinner.remove()
				}

			})


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit



/**
* RENDER_COMPONENT_DATO
* @return
*/
const render_component_dato = function(self) {

	const component_data	= self.main_component.data.value
	const len				= component_data.length

	const source_component_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'source_component_container'
	})

	for (let i = 0; i < len; i++) {

		const current_component = component_data[i]

		const radio_label = ui.create_dom_element({
						element_type	: 'label',
						class_name		: 'component_data_label',
						inner_html		: current_component.iri,
						parent 			: source_component_container
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

	return source_component_container
};//end render_component_dato

