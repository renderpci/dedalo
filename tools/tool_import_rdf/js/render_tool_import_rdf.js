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
* (via `self.get_rdf_data`), which WRITES into the record. The import report the
* server returns (written / created / skipped per IRI) is shown below the form.
*
* Exports: render_tool_import_rdf (constructor, prototype.edit assigned by
* tool_import_rdf.js to its own prototype chain).
*
* Data shape consumed:
*   self.main_element.data.entries — Array<{id, iri, lang, title?}>
*     Each entry is an IRI item of the main component_iri component (the v7
*     data envelope keys a component's items as `entries`, never `value`).
*   self.main_element.context.properties.ar_tools_name.tool_import_rdf.external_ontology — string|null
*     Optional ontology tipo override; when absent, null is passed to get_rdf_data.
*   The owning section instance (resolved by model via get_caller_by_model) is
*     refreshed after a successful import.
*/

// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {request_failed, response_data} from '../../../core/common/js/api_error.js'
	import {render_error_inline, error_text} from '../../../core/common/js/render_api_error.js'
	import {when_in_dom} from '../../../core/common/js/events.js'
	import {get_caller_by_model} from '../../../core/common/js/utils/index.js'



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
*      import report (written / created / skipped per IRI) after an import.
*
* The OK button click handler:
*   - Collects all checked radio values (IRI strings).
*   - Shows a spinner and adds 'loading' CSS class while the request is in flight.
*   - Calls self.get_rdf_data(ontology_tipo, ar_values) (defined on tool_import_rdf).
*   - On success, renders the import report (render_rdf_payload) into
*     view_rdf_data_wrapper and calls section.refresh() to show the written data.
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
				// The ANSWER IS READ: data_manager.request RESOLVES a refusal (the
				// envelope carries `error`, it never rejects on one), so a bare await
				// left the selector showing a default language the server never stored
				// and the next import would tag literals with the OLD one.
				// (!) No toast here: the transport already published the ApiError and
				// error_dispatch's deduped_toast rendered it once. What this branch owes
				// is to put the selector back to the language still in force.
				const api_response = await data_manager.request({
					body : {
						action	: 'change_lang',
						dd_api	: 'dd_utils_api',
						options	: {
							dedalo_data_lang		: dedalo_aplication_langs_selector.value,
							dedalo_application_lang	: dedalo_aplication_langs_selector.value
						}
					}
				})
				if (request_failed(api_response)) {
					dedalo_aplication_langs_selector.value = page_globals.dedalo_application_lang
					return false
				}

				return true
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
			// Falls back to null when the property is absent: the server then reads the
			// main component's own configuration, and refuses when there is none.
				const ontology_tipo = self.main_element.context?.properties?.ar_tools_name?.tool_import_rdf?.external_ontology || null

				self.get_rdf_data(ontology_tipo, ar_values)
				.then(function(response){
					if(SHOW_DEBUG===true) {
						console.log("debug response:", response);
					}

					// loading styles
						spinner.remove()
						components_container.classList.remove('loading')

					// check results. Envelope v2: the payload is `{report, errors, rdf,
					// bulk_process_id}` (tools/tool_import_rdf/server/rdf_import_run.ts) —
					// a failed CALL has no payload at all and carries the coded error instead.
						if (request_failed(response)) {
							view_rdf_data_wrapper.innerHTML = ''
							render_error_inline(view_rdf_data_wrapper, response.error)
							return
						}
						render_rdf_payload(view_rdf_data_wrapper, response_data(response) || {})

					// update list
						// self.load_section(section_tipo)

					// Reach the owning section and refresh it so newly imported data
					// appears in the UI. Resolved by MODEL, not by depth: the depth
					// differs by surface (an edit-mode component reaches its section
					// through a section_group, a list cell through a section_record),
					// and get_caller_by_model is cycle-safe — tool_common's window
					// path sets caller.caller = self, which would hang a naive walk.
						const section = get_caller_by_model(self, 'section')
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
* RENDER_RDF_PAYLOAD
* Render a successful get_rdf_data payload into `wrapper` (replacing its content).
*
* The payload is `{report:[{uri, written, created, skipped}], errors:[{uri,error}],
* rdf:[{uri,subjects}], bulk_process_id}` (tools/tool_import_rdf/server/rdf_import_run.ts
* RdfImportResult). One block per IRI:
*   - what the import CREATED (linked records found nowhere, so made),
*   - what it WROTE (component name in the user's language, its language, a
*     short rendering of the value),
*   - what it SKIPPED and why (never overwritten, not writable, not fetched —
*     run again…). An op the engine REFUSED (it carries a registry `code`: a
*     link the ontology maps off target, a write the door refused) is a skipped
*     line too, marked `refused` — never an IRI failure: the rest of that IRI
*     was written,
*   - the parsed RDF subjects, collapsed (the pre-import dump, for checking).
* Each failed URI gets one line: `error_text` (the user's-language label filled
* from `details`, else the public `message`), never log text.
*
* Every value here is remote or record data: it is written as TEXT, never markup.
* The per-URI failures are rendered even when NO URI loaded (the form sends one
* IRI). 'Empty results' is shown only when the payload holds nothing at all.
*
* @param {HTMLElement} wrapper - the result pane (emptied first).
* @param {Object} rdf_payload - the response's `data`.
* @returns {void}
*/
export const render_rdf_payload = function(wrapper, rdf_payload) {

	const ar_report		= Array.isArray(rdf_payload.report) ? rdf_payload.report : []
	const ar_rdf		= Array.isArray(rdf_payload.rdf) ? rdf_payload.rdf : []
	const ar_uri_errors	= Array.isArray(rdf_payload.errors) ? rdf_payload.errors : []

	wrapper.innerHTML = ''
	if (ar_report.length<1 && ar_rdf.length<1 && ar_uri_errors.length<1) {
		wrapper.textContent = 'Empty results'
		return
	}

	// one block per IRI, in the order the server answered (report first, then
	// any IRI that only loaded)
	const uris = []
	const add_uri = function(item) {
		const uri = (item && item.uri) || ''
		if (!uris.includes(uri)) {
			uris.push(uri)
		}
	}
	ar_report.forEach(add_uri)
	ar_rdf.forEach(add_uri)

	for (let i = 0; i < uris.length; i++) {
		const uri		= uris[i]
		const report	= ar_report.find(el => el && el.uri===uri) || null
		const loaded	= ar_rdf.find(el => el && el.uri===uri) || null
		render_uri_block(wrapper, uri, report, loaded)
	}

	if (ar_uri_errors.length>0) {
		const lines = ar_uri_errors.map(function(item) {
			const message = (item && item.error) ? error_text(item.error) : ''
			return ((item && item.uri) || '') + ': ' + message
		})
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'error',
			text_content	: lines.join('\n'),
			parent			: wrapper
		})
	}

	if (rdf_payload.bulk_process_id) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'rdf_bulk_process',
			text_content	: label_of('bulk_process', 'Bulk process') + ': ' + rdf_payload.bulk_process_id,
			parent			: wrapper
		})
	}
}//end render_rdf_payload



/**
* RENDER_URI_BLOCK
* One IRI's block: its heading, its report lists (when it reached the import) and
* its collapsed subject dump (when it loaded).
* @param {HTMLElement} wrapper
* @param {string} uri
* @param {Object|null} report - {written, created, skipped}
* @param {Object|null} loaded - {subjects}
* @returns {HTMLElement} the block
*/
const render_uri_block = function(wrapper, uri, report, loaded) {

	const block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'rdf_report',
		parent			: wrapper
	})
	ui.create_dom_element({
		element_type	: 'h4',
		text_content	: uri,
		parent			: block
	})

	if (report) {
		render_report_list(block, 'created', label_of('created', 'Created'), report.created, created_line)
		render_report_list(block, 'written', label_of('written', 'Written'), report.written, written_line)
		render_report_list(block, 'skipped', label_of('skipped', 'Skipped'), report.skipped, skipped_line, skipped_class)
		const nothing = ['created','written','skipped'].every(key => !Array.isArray(report[key]) || report[key].length<1)
		if (nothing) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'rdf_nothing',
				text_content	: label_of('no_changes', 'No changes'),
				parent			: block
			})
		}
	}

	if (loaded) {
		const details = ui.create_dom_element({
			element_type	: 'details',
			class_name		: 'rdf_dump',
			parent			: block
		})
		ui.create_dom_element({
			element_type	: 'summary',
			text_content	: 'RDF',
			parent			: details
		})
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'rdf_subjects',
			text_content	: JSON.stringify(loaded.subjects, null, 2),
			parent			: details
		})
	}

	return block
}//end render_uri_block



/**
* RENDER_REPORT_LIST
* A titled list of report entries (nothing when the list is empty).
* @param {HTMLElement} parent
* @param {string} class_name - created|written|skipped
* @param {string} title
* @param {Array|undefined} items
* @param {function} line - item => text
* @param {function} [item_class] - item => class name of its line ('' for none)
* @returns {void}
*/
const render_report_list = function(parent, class_name, title, items, line, item_class) {

	if (!Array.isArray(items) || items.length<1) {
		return
	}

	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'rdf_list_title ' + class_name,
		text_content	: title + ' (' + items.length + ')',
		parent			: parent
	})
	const list = ui.create_dom_element({
		element_type	: 'ul',
		class_name		: 'rdf_list ' + class_name,
		parent			: parent
	})
	for (let i = 0; i < items.length; i++) {
		const item = items[i] || {}
		ui.create_dom_element({
			element_type	: 'li',
			class_name		: item_class ? item_class(item) : '',
			text_content	: line(item),
			parent			: list
		})
	}
}//end render_report_list



/**
* CREATED_LINE / WRITTEN_LINE / SKIPPED_LINE
* The text of one report entry. The component (section) name when the server
* resolved it, else its tipo.
*/
const created_line = function(item) {
	const name = item.section_label || item.section_tipo || ''
	return name + ' ' + (item.section_id ?? '') + (item.label ? ' — ' + item.label : '')
}

const written_line = function(item) {
	const name = item.component_label || item.component_tipo || ''
	const lang = (item.lang && item.lang!=='lg-nolan') ? ' [' + item.lang + ']' : ''
	return name + lang + ': ' + (item.value_summary || '') + ' (' + (item.section_tipo || '') + ' ' + (item.section_id ?? '') + ')'
}

const skipped_line = function(item) {
	const name = item.component_label || item.component_tipo || ''
	return (name ? name + ': ' : '') + (item.reason || '') + (item.iri ? ' — ' + item.iri : '')
}

// A skipped op the engine REFUSED carries the refusal's registry code.
const skipped_class = function(item) {
	return item.code ? 'refused' : ''
}



/**
* LABEL_OF
* A program label in the user's language, else the English fallback.
* @param {string} key
* @param {string} fallback
* @returns {string}
*/
const label_of = function(key, fallback) {
	const labels = (typeof get_label!=='undefined' && get_label) ? get_label : {}
	return (typeof labels[key]==='string' && labels[key].length) ? labels[key] : fallback
}//end label_of



/**
* RENDER_COMPONENT_DATO
* Build the IRI radio-button list from the main_element's component_iri data.
*
* Iterates over `self.main_element.data.entries` — the component_iri items
* (`{id, iri, lang, title?}`), one per IRI stored in the linked component.
* For each entry:
*   - A <label> is created. When the iri is missing or empty the label gets the
*     CSS class 'error' and the entry is skipped (no radio rendered).
*   - A radio <input> with name 'radio_selector' and value=iri is prepended into
*     the label so the label click activates the radio (standard accessible markup).
*   - When there is exactly one IRI, its radio is pre-checked so the user can
*     submit immediately without an explicit selection step.
*
* The IRI is caller data: it is written as text, never parsed as HTML.
*
* The returned container is queried by the button click handler via
* `.querySelectorAll('.component_data:checked')` to collect selected IRIs.
*
* @param {Object} self - The tool_import_rdf instance.
* @returns {HTMLElement} source_component_container — <div> holding all radio labels.
*/
export const render_component_dato = function(self) {

	const data				= self.main_element.data || {}
	const component_value	= Array.isArray(data.entries) ? data.entries : []

	const source_component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'source_component_container'
	})

	const component_value_len = component_value.length
	for (let i = 0; i < component_value_len; i++) {

		const iri = component_value[i] ? component_value[i].iri : null

		// Render the label first regardless of whether iri is valid so users can
		// see the error state and understand why a radio button is absent.
		const radio_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'component_data_label' + ((!iri || !iri.length) ? ' error' : ''),
			text_content	: iri || 'IRI value is empty',
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
