// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_TOOL_IMPORT_RDF
* Client-side render layer for the tool_import_rdf tool.
*
* Provides the `edit` render view for tool_import_rdf: a UI panel that lets
* the user select an IRI value stored in a component_iri field, choose the
* target import language, and trigger the server-side RDF-to-Dédalo mapping
* (via `self.get_rdf_data`). The server response HTML dump is shown in a
* dedicated result area below the form.
*
* Exports: render_tool_import_rdf (constructor, prototype.edit assigned by
* tool_import_rdf.js to its own prototype chain).
*
* Data shape consumed:
*   self.main_element.data.value — Array<{iri: string}>
*     Each entry is an IRI object from the main component_iri component.
*   self.main_element.context.properties.ar_tools_name.tool_import_rdf.external_ontology — string|null
*     Optional ontology tipo override; when absent, null is passed to get_rdf_data.
*   self.caller.caller.caller — section instance to refresh after a successful import.
*/

// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {when_in_dom} from '../../../core/common/js/events.js'



/**
* RENDER_TOOL_IMPORT_RDF
* Constructor. Used only as a prototype carrier — all render methods are
* assigned to tool_import_rdf.prototype via the prototype chain in tool_import_rdf.js.
* @returns {boolean} Always true (Dédalo constructor convention).
*/
export const render_tool_import_rdf = function() {

	return true
}//end render_tool_import_rdf



/**
* EDIT
* Build the full edit-mode wrapper for tool_import_rdf.
*
* When render_level is 'content', returns the inner content_data node only
* (used when re-rendering a panel in place without rebuilding the outer chrome).
* For 'full' (the default), wraps content_data in the standard tool wrapper
* produced by ui.tool.build_wrapper_edit.
*
* @param {Object} options - Render configuration.
* @param {string} [options.render_level='full'] - 'full' builds the complete wrapper;
*   'content' returns only the inner content_data HTMLElement.
* @returns {Promise<HTMLElement>} Resolves to the wrapper (full) or content_data (content).
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
* Assemble the main content area for the tool's edit view.
*
* Builds three sub-areas inside a DocumentFragment and stitches them into a
* content_data container via ui.tool.build_content_data:
*   1. components_container — holds the IRI radio-list and the language selector.
*   2. buttons_container (child of components_container) — the OK/validate button.
*   3. view_rdf_data_wrapper — empty div appended below the form; receives the
*      EasyRdf HTML dump returned by the server after a successful import.
*
* The OK button click handler:
*   - Collects all checked radio values (IRI strings).
*   - Shows a spinner and adds 'loading' CSS class while the request is in flight.
*   - Calls self.get_rdf_data(ontology_tipo, ar_values) (defined on tool_import_rdf).
*   - On success, writes response.result[i].ar_rdf_html into view_rdf_data_wrapper
*     and calls section.refresh() to update the parent section.
*
* (!) view_rdf_data_wrapper is declared after the button's click listener but
* accessed inside it.  This works because the closure captures the binding at
* the time the listener fires (after get_content_data_edit has returned), not at
* the time the listener is registered.  Do NOT hoist the declaration above the
* buttons block without understanding this temporal dependency.
*
* @param {Object} self - The tool_import_rdf instance (has main_element, caller chain).
* @returns {Promise<HTMLElement>} content_data wrapper containing the assembled UI.
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
		// The label falls back to a hardcoded English string when get_label has not
		// yet populated the key — this can happen if the label map loads lazily.
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'default_lang',
			inner_html		: self.get_tool_label('default_lang_of_file_to_import') || 'Default language of the file to import. Data without specified language will be imported in:',
			parent			: components_container
		})
		// page_globals.dedalo_projects_default_langs — Array of lang codes for the
		// current installation; used to populate the <select> options.
		const lang_datalist						= page_globals.dedalo_projects_default_langs
		const dedalo_aplication_langs_selector	= ui.build_select_lang({
			name		: 'dedalo_aplication_langs_selector',
			langs		: lang_datalist,
			selected	: page_globals.dedalo_application_lang,
			class_name	: 'dedalo_aplication_langs_selector',
			// Persist the selected language server-side so subsequent imports use it
			// as the default for language-untagged RDF literals.
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

			// Collect the IRI values from whichever radio buttons are checked.
			// The radio group name 'radio_selector' ensures only one can be checked
			// at a time per HTML spec, but the code is defensive and collects all
			// checked inputs inside iri_node in case the markup ever changes.
				const ar_values = []
				const component_data_values	= iri_node.querySelectorAll('.component_data:checked')
				const len					= component_data_values.length
				for (let i = 0; i < len; i++) {
					ar_values.push(component_data_values[i].value)
				}
				// (!) alert() is intentional here: this tool is used exclusively by
				// administrators and the native alert is acceptable for a quick guard.
				// Do NOT replace with console.warn — the message must block the user.
				if (ar_values.length < 1){
					alert("Nothing selected");
					return
				}

			// Clear the result area and show a spinner while the request is in flight.
				while (view_rdf_data_wrapper.firstChild) {
					view_rdf_data_wrapper.removeChild(view_rdf_data_wrapper.firstChild)
				}
				const spinner = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'spinner',
					parent			: view_rdf_data_wrapper
				})
				components_container.classList.add('loading')

			// Read the external_ontology tipo from the main_element's context properties.
			// This tipo identifies the Dédalo ontology node that defines the RDF namespace
			// mappings and class/property correspondence for the import.
			// Falls back to null when the property is absent (ontology_tipo=null tells
			// the server to skip external-ontology resolution).
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

					// Render the EasyRdf HTML dump for each imported URI.
					// response.result[i].ar_rdf_html is the raw HTML produced by
					// EasyRdf\Graph::dump('html') on the server side. Each iteration
					// overwrites the previous innerHTML, so only the last result is visible
					// when ar_values contains more than one URI. This is a known limitation.
						const response_result_len = response.result.length
						for (let i = 0; i < response_result_len; i++) {

							// const current_data = ar_values[i]
							view_rdf_data_wrapper.innerHTML = response.result[i].ar_rdf_html

							// const node = self.render_dd_data(response.rdf_data[i].dd_obj, 'root')
							// view_dd_data_wrapper.appendChild(node)
						}

					// update list
						// self.load_section(section_tipo)

					// Walk up the caller chain three levels to reach the parent section
					// instance and trigger a refresh so newly imported data appears in the UI.
					// Caller chain: tool → component → portal/section → section.
						const section = self.caller.caller.caller
						if (section) {
							section.refresh()
						}
				})
		})//end btn_validate.addEventListener('click')
		// Auto-focus the OK button once it enters the DOM so keyboard users can
		// trigger the import without a mouse click. The 150 ms delay gives the
		// browser time to complete the layout pass before programmatic focus.
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

	// Wrap the assembled fragment in the standard tool content_data container
	// (adds CSS class and role attributes expected by tool-level CSS rules).
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* RENDER_COMPONENT_DATO
* Build the IRI radio-button list from the main_element's component_iri data.
*
* Iterates over `self.main_element.data.value` — an Array<{iri: string}> where
* each entry represents one IRI stored in the linked component_iri component.
* For each entry:
*   - A <label> is created. When the iri is missing or empty the label gets the
*     CSS class 'error' and the entry is skipped (no radio rendered).
*   - A radio <input> with name 'radio_selector' and value=iri is prepended into
*     the label so the label click activates the radio (standard accessible markup).
*   - When there is exactly one IRI, its radio is pre-checked so the user can
*     submit immediately without an explicit selection step.
*
* The returned container is queried by the button click handler via
* `.querySelectorAll('.component_data:checked')` to collect selected IRIs.
*
* @param {Object} self - The tool_import_rdf instance.
* @returns {HTMLElement} source_component_container — <div> holding all radio labels.
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

		// Render the label first regardless of whether iri is valid so users can
		// see the error state and understand why a radio button is absent.
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
