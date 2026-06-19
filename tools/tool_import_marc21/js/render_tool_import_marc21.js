// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB Dropzone */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {create_source} from '../../../core/common/js/common.js'



/**
* RENDER_TOOL_IMPORT_MARC21
*
* Client-side render layer for the MARC 21 bulk-import tool.
*
* This module provides the `edit` render prototype that is mixed into
* `tool_import_marc21` (tool_import_marc21.js). It owns the entire UI
* construction lifecycle for the tool's interactive view:
*
*   1. Builds a DOM fragment containing:
*      - A drop-zone area (rendered by `service_dropzone`) where the user
*        drags or selects one or more `.mrc` (MARC 21 binary) files. Each
*        file uploaded populates `self.files_data` via the service's
*        `addedfile` event handler.
*      - A temporary section panel (rendered by `service_tmp_section`) that
*        exposes `input_component` entries from `tool_config.ddo_map`. These
*        components carry per-import metadata values (e.g. project, language)
*        that are propagated to every record created/updated during the import.
*      - An "IMPORT" trigger button.
*
*   2. When the user clicks IMPORT it:
*      - Guards against an empty upload queue (`self.files_data`).
*      - Adds a `.loading` CSS class to `self.node` to block further user
*        interaction while the long-running server call is in flight.
*      - Collects component metadata via `service_tmp_section.get_components_data()`.
*      - Builds an `rqo` (request-query object) and dispatches it through
*        `data_manager.request` to `dd_tools_api::tool_request`, which
*        delegates to `tool_import_marc21::import_files()` on the server.
*      - Displays a success/error message overlay and wires a full page reload
*        to the next user click.
*
* Timeout:  3 600 000 ms (1 hour). MARC 21 files can contain thousands of
* bibliographic records; the server parse/insert loop is intentionally slow.
*
* Main exports:
*   render_tool_import_marc21 — constructor stub (prototype carrier only).
*   render_tool_import_marc21.prototype.edit — async render entry-point.
*/
export const render_tool_import_marc21 = function() {

	return true
}//end render_tool_import_marc21



/**
* EDIT
* Builds and returns the full edit-mode DOM wrapper for the MARC 21 import tool.
*
* Delegates DOM construction to `get_content_data_edit`. When `options.render_level`
* is `'content'` only the inner content fragment is returned (used by partial
* refreshes). Otherwise, `ui.tool.build_wrapper_edit` wraps the content in the
* standard tool chrome (header, close button, etc.) and the wrapper is returned.
*
* The returned wrapper node is assigned back to `self.node` by `tool_common.render`.
* A direct reference to `content_data` is stored on `wrapper.content_data` so that
* the import click handler can later access it to add the `.loading` class.
*
* @param {Object} options - Render options passed by `tool_common.render`.
*   @param {string} [options.render_level='full'] - `'content'` returns only the
*     inner content_data node; `'full'` (default) returns the full wrapper.
* @returns {Promise<HTMLElement>} Resolves to the wrapper (full) or content_data node (content).
*/
render_tool_import_marc21.prototype.edit = async function(options) {

	const self = this

	// options
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
		wrapper.content_data	= content_data


	return wrapper
}//end render_tool_import_marc21



/**
* GET_CONTENT_DATA_EDIT
* Builds the interactive content DOM fragment for the MARC 21 import tool's edit view.
*
* Constructs and wires the following UI regions inside a DocumentFragment:
*
*   options_wrapper      — container for configuration controls. Hidden when the tool
*                          is invoked from a component context (`import_mode !== 'section'`);
*                          visible when opened in standalone section mode.
*
*   drop_zone            — placeholder div; the actual Dropzone widget is injected by
*                          `self.service_dropzone.render()` into `template_container`.
*                          As the user uploads files, `service_dropzone` appends entries
*                          to `self.files_data` (each entry: {name, previewElement, size}).
*
*   template_container   — hosts the rendered `service_dropzone` template (Dropzone preview
*                          rows, progress bars, per-file controls).
*
*   inputs_container     — hosts the `service_tmp_section` component panel. A "Values"
*                          caption labels the group. The section's `input_component`
*                          entries let users fill metadata (project, language, etc.) that
*                          will be copied into every imported record.
*
*   buttons_bottom_container / button_process_import
*                        — "IMPORT" button; click handler is documented inline below.
*
* All regions are assembled into a `content_data` div via `ui.tool.build_content_data`.
*
* @param {Object} self - The `tool_import_marc21` instance (provides `tool_config`,
*   `service_dropzone`, `service_tmp_section`, `files_data`, `key_dir`, `caller`, `node`).
* @returns {Promise<HTMLElement>} Resolves to the populated content_data HTMLElement.
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// options container
		const options_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'component options',
			parent 			: fragment
		})

	// file name control
		// hide the options when the tool is caller by components, the import_mode is defined in preferences.
			const class_name_configuration = (self.tool_config.import_mode && self.tool_config.import_mode==='section')
				? ''
				: ' hide'

	// components container
		const drop_zone = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'drop_zone',
			parent			: fragment
		})

	// template_container
		const template_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'template_container',
			parent			: fragment
		})
		// service_dropzone
		const template = await self.service_dropzone.render()
		template_container.appendChild(template)

		// inputs components container label
		const inputs_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inputs_container',
			parent			: fragment
		})

		const inputs_container_caption = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inputs_container_caption',
			inner_html		: get_label.values || 'Values',
			parent			: inputs_container
		})
		// service_tmp_section
		const inputs_nodes = await self.service_tmp_section.render()
		inputs_container.appendChild(inputs_nodes)

	// buttons_bottom_container
		const buttons_bottom_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_bottom_container success',
			parent			: fragment
		})

	// button process import
		const button_process_import = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'processing_import success',
			inner_html		: get_label.import || 'IMPORT',
			parent			: buttons_bottom_container
		})
		button_process_import.addEventListener('click', function(){
			// Guard: do nothing if the user clicks before uploading any file.
			if(self.files_data.length < 1){
				return
			}
			// add loading class to wrapper to block all actions for the user
				self.node.classList.add('loading')

			// get the options from the every file uploaded
			// (!) The loop body only declares `current_value` but does not use it.
			// This appears to be a stub left for future per-file option extraction.
			for (let i = self.files_data.length - 1; i >= 0; i--) {
				const current_value = self.files_data[i]
			}
			// get the data from every component used to propagate to every file uploaded
			// Returns an array of component `.data` objects from the tmp_section child instances.
			const components_temp_data = self.service_tmp_section.get_components_data()

			// source. Note that second argument is the name of the function to manage the tool request like 'delete_tag'
			// this generates a call as my_tool_name::my_function_name(options)
				const source = create_source(self, 'import_files')

			// process the images in the server (uploaded previously)
			// rqo
			// Dispatches to dd_tools_api::tool_request → tool_import_marc21::import_files() (PHP).
			// `key_dir` identifies the server-side temp upload folder: `{tipo}_{section_tipo}`.
			// Timeout is intentionally set to 1 hour because a large MARC 21 file can hold
			// thousands of bibliographic records that are parsed and inserted serially.
				const rqo = {
					dd_api	: 'dd_tools_api',
					action	: 'tool_request',
					source	: source,
					options	: {
						tipo					: self.caller.tipo,
						section_tipo			: self.caller.section_tipo,
						section_id				: self.caller.section_id,
						tool_config				: self.tool_config,
						files_data				: self.files_data,
						components_temp_data	: components_temp_data,
						key_dir					: self.key_dir,
					}
				}

			// call to the API, fetch data and get response
				return new Promise(function(resolve){

					data_manager.request({
						body : rqo,
						retries : 1, // one try only
						timeout : 3600 * 1000 // 3600 secs waiting response
					})
					.then(function(response){

						if(SHOW_DEBUG===true) {
							console.warn("-> API response:",response);
						}
						// change the loading to content_data to show message
						// Shift the loading indicator from the full wrapper to the inner content_data,
						// freeing `self.node` to display the result message node appended below.
						self.node.classList.remove('loading')
						self.node.content_data.classList.add('loading')
						// get message
						// `get_tool_label` reads localised strings registered in the tool's register.json.
						const msg = (response.result===true)
							? self.get_tool_label('upload_done') || 'Files imported successfully'
							: self.get_tool_label('upload_error') || 'Error: Files not imported!'
						// add the message to wrapper (outside content_data that has loading class)
						const msg_container = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'msg_container',
							inner_html 		: msg,
							parent			: self.node
						})
						// when user click reload the tool
						// (!) A full page reload is used intentionally: the tool has no
						// incremental refresh path after a completed batch import.
						self.node.addEventListener('click',function(){
							window.location.reload();
						})
						resolve(response)
					})
				})
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* SET_IMPORT_MODE
* Updates the per-file target-portal selector in the Dropzone preview UI
* based on an auto-detection heuristic or resets it to the configured default.
*
* This function is designed to run after files have been added to the drop-zone
* (i.e. `self.files_data` is populated). It iterates every queued file and
* either:
*
*   apply === true  — Attempts to detect the intended target portal from the
*     file name. The expected naming convention is:
*       `<base>-<letter>.<ext>`  (e.g. "record-A.jpg", "scan-B.tif")
*     The trailing letter (captured as group [2] by the regex) is upper-cased
*     and matched against `tool_config.ddo_map` entries that have
*     `role === 'component_option'` and a matching `map_name`. When found the
*     per-file `<select class="option_component_select">` is set to that entry's
*     `tipo` value.
*
*   apply === false — Resets every file's selector to the default portal,
*     determined by the first `ddo_map` entry that has
*     `role === 'component_option' && default === true`. If no default entry
*     exists, the first `<option>` in the selector is selected.
*
* The function mutates DOM elements inside `previewElement` of each Dropzone
* file object. The selector `.option_component_select` is rendered by the
* Dropzone per-file preview template in `service_dropzone`.
*
* Note: this function is defined in this module but is NOT referenced from
* `get_content_data_edit`. It appears to be a utility intended for callers
* that wire up an "auto-detect" toggle control. Its presence here is
* intentional — do not remove.
*
* @param {Object} self  - The `tool_import_marc21` instance. Requires:
*   `self.files_data`   — {Array<{name: string, previewElement: HTMLElement}>}
*                         Populated by `service_dropzone` as files are added.
*   `self.tool_config.ddo_map` — Array of ddo configuration objects, each with
*                         `role`, optional `map_name`, optional `default`, and
*                         `tipo` properties.
* @param {boolean} apply - `true` to auto-detect target from file name;
*   `false` to reset to the configured default.
* @returns {boolean} Always `true`.
*/
const set_import_mode = function (self, apply) {

	const files_data		= self.files_data || []
	const files_data_length	= files_data.length
	for (let i = 0; i < files_data_length; i++) {

		const current_value = files_data[i]

		if(apply===true){
			// Regex captures the letter suffix from filenames like "record-A.jpg" or "scan-b.tif".
			// Group [1]: base name, group [2]: letter code, group [3]: extension.
			const regex = /^(.+)-([a-zA-Z])\.([a-zA-Z]{3,4})$/;
			// const name = current_value.name; //`123 85-456 fd-a.jpg`;
			const map_name = regex.exec(current_value.name)
			if ( map_name!==null && map_name[2]!==null ) {

				// Upper-case for case-insensitive comparison against ddo_map.map_name.
				const map_name_upper = map_name[2].toUpperCase();
				const target_portal = self.tool_config.ddo_map.find(el => el.role==='component_option' && el.map_name===map_name_upper)
				if (target_portal) {
					current_value.previewElement.querySelector(".option_component_select").value = target_portal.tipo;
				}
			}
		}else{
			// Reset path: find the default portal, or fall back to the first <option>.
			const default_target_portal = self.tool_config.ddo_map.find(el => el.role === 'component_option' && el.default === true)
			if(default_target_portal){
				current_value.previewElement.querySelector(".option_component_select").value = default_target_portal.tipo;
			}else{
				current_value.previewElement.querySelector(".option_component_select").options[0].selected = true ;
			}
		}
	}

	return true
}//end set_import_mode



// @license-end
