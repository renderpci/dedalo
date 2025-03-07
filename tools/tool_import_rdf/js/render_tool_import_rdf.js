// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {when_in_dom} from '../../../core/common/js/events.js'



/**
* RENDER_TOOL_IMPORT_RDF
* Manages the component's logic and appearance in client side
*/
export const render_tool_import_rdf = function() {

	return true
}//end render_tool_import_rdf



/**
* RENDER_TOOL_IMPORT_RDF
* Render node for use like button
* @param object options = {render_level:'full'}
* @return HTMLElement wrapper
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


	return wrapper
}//end render_tool_import_rdf



/**
* GET_CONTENT_DATA_EDIT
* Retrieves content data for editing, including components, language selector, and buttons.
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_container',
			parent			: fragment
		})

	// get the component_iri data
		const iri_node = render_component_dato(self)
		components_container.appendChild(iri_node)

	// application lang selector
		// default_lang_of_file_to_import
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'default_lang',
			inner_html		: get_label.default_lang_of_file_to_import || 'Default language of the file to import. Data without specified language will be imported in:',
			parent			: components_container
		})
		const lang_datalist						= page_globals.dedalo_projects_default_langs
		const dedalo_aplication_langs_selector	= ui.build_select_lang({
			name		: 'dedalo_aplication_langs_selector',
			langs		: lang_datalist,
			selected	: page_globals.dedalo_application_lang,
			class_name	: 'dedalo_aplication_langs_selector',
			action		: async function() { // change event action
				await data_manager.request({
					body : {
						action	: 'change_lang',
						dd_api	: 'dd_utils_api',
						options	: {
							dedalo_data_lang		: dedalo_aplication_langs_selector.value,
							dedalo_application_lang	: dedalo_aplication_langs_selector.value
						}
					}
				})
			}
		})
		components_container.appendChild(dedalo_aplication_langs_selector)

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: components_container
		})

		const btn_validate = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'success button_apply',
			inner_html		: 'OK',
			parent			: buttons_container
		})
		// click event. When user click the button do the import of the data.
		btn_validate.addEventListener('click', () => {

			// component values from radio buttons selection
				const ar_values = []
				const component_data_values	= iri_node.querySelectorAll('.component_data:checked')
				const len					= component_data_values.length
				for (let i = 0; i < len; i++) {
					ar_values.push(component_data_values[i].value)
				}
				if (ar_values.length < 1){
					alert("Nothing selected");
					return
				}

			// loading styles
				while (view_rdf_data_wrapper.firstChild) {
					view_rdf_data_wrapper.removeChild(view_rdf_data_wrapper.firstChild)
				}
				const spinner = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'spinner',
					parent			: view_rdf_data_wrapper
				})
				components_container.classList.add('loading')

			// get_rdf_data
				const ontology_tipo = self.main_element.context.properties.ar_tools_name.tool_import_rdf.external_ontology
					? self.main_element.context.properties.ar_tools_name.tool_import_rdf.external_ontology
					: null

				self.get_rdf_data(ontology_tipo, ar_values)
				.then(function(response){
					if(SHOW_DEBUG===true) {
						console.log("debug response:", response);
					}

					// loading styles
						spinner.remove()
						components_container.classList.remove('loading')

					// check results
						if (!response || !response.result || response.result.length<1) {
							view_rdf_data_wrapper.innerHTML = 'Empty results';
							return
						}

					// print result in view_rdf_data_wrapper
						const response_result_len = response.result.length
						for (let i = 0; i < response_result_len; i++) {

							// const current_data = ar_values[i]
							view_rdf_data_wrapper.innerHTML = response.result[i].ar_rdf_html

							// const node = self.render_dd_data(response.rdf_data[i].dd_obj, 'root')
							// view_dd_data_wrapper.appendChild(node)
						}

					// update list
						// self.load_section(section_tipo)

					// refresh section
						const section = self.caller.caller.caller
						if (section) {
							section.refresh()
						}
				})
		})//end btn_validate.addEventListener('click')
		// focus button
		when_in_dom(btn_validate, () => {
			setTimeout(function(){
				btn_validate.focus()
			}, 150)
		})

	// view_rdf_data_wrapper. Result will be added here
		const view_rdf_data_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'view_rdf_data_wrapper',
			parent			: fragment
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* RENDER_COMPONENT_DATO
* Create a radio button for each component value
* @param object self
* @return HTMLElement source_component_container
*/
const render_component_dato = function(self) {

	const data				= self.main_element.data || {}
	const component_value	= data.value || []

	const source_component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'source_component_container'
	})

	const component_value_len = component_value.length
	for (let i = 0; i < component_value_len; i++) {

		const iri = component_value[i].iri

		const radio_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'component_data_label' + ((!iri || !iri.length) ? ' error' : ''),
			inner_html		: iri || 'IRI value is empty',
			parent			: source_component_container
		})

		if (!iri || !iri.length) {
			continue
		}

		const radio_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			class_name		: 'component_data',
			name			: 'radio_selector',
			value			: iri
		})
		radio_label.prepend(radio_input)

		// check default if only one
		if (component_value_len===1 && i===0) {
			radio_input.checked = 'checked'
		}
	}


	return source_component_container
}//end render_component_dato



// @license-end
