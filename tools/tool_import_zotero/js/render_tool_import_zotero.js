// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB Dropzone */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {create_source} from '../../../core/common/js/common.js'



/**
* RENDER_TOOL_IMPORT_ZOTERO
*
* Client-side render module for the Zotero bibliographic import tool.
*
* Exports:
*   render_tool_import_zotero — hollow constructor whose prototype methods are
*     mixed into tool_import_zotero via prototype assignment (see tool_import_zotero.js).
*
* Prototype methods (assigned externally to tool_import_zotero.prototype):
*   edit — builds the full tool wrapper + content area in 'edit' mode.
*
* Internal helpers (module-private, not exported):
*   get_content_data_edit — assembles the file drop-zone, temporary-section
*     component inputs, and the "Import" button; wires the server request.
*   set_import_mode — updates per-file <select> elements in the Dropzone preview
*     to auto-assign target portals based on a filename suffix convention.
*
* Data flow:
*   1. tool_import_zotero.build() constructs service_dropzone (handles file
*      uploads to the server's tmp dir) and service_tmp_section (renders a live
*      edit interface for optional metadata to be applied to every imported
*      record — e.g. project assignment).
*   2. render_tool_import_zotero.prototype.edit (→ get_content_data_edit) renders
*      both services and adds the "Import" button.
*   3. On button click the tool collects self.files_data (populated by
*      service_dropzone) and service_tmp_section.get_components_data(), then
*      issues a dd_tools_api / tool_request RQO to the PHP
*      tool_import_zotero::import_files() action.
*   4. On success the page is reloaded so the user can see the newly imported
*      records.
*
* Key instance properties consumed here (set by tool_import_zotero):
*   self.files_data          {Array}  — File metadata objects accumulated by
*     service_dropzone; each entry has at least { name, previewElement }.
*   self.service_dropzone    {Object} — service_dropzone instance; render() returns
*     an HTMLElement with the Dropzone UI.
*   self.service_tmp_section {Object} — service_tmp_section instance; render()
*     returns component nodes; get_components_data() extracts current values.
*   self.tool_config         {Object} — Registered tool configuration from dd1633;
*     contains ddo_map (component descriptors) and import_mode ('section' | null).
*   self.key_dir             {string} — Temporary upload directory key built from
*     caller.tipo + '_' + caller.section_tipo (e.g. 'oh17_oh1'); tells the
*     server where to find the uploaded files.
*   self.caller              {Object} — The component or section that opened the
*     tool; provides tipo, section_tipo, section_id for the server RQO.
*/
export const render_tool_import_zotero = function() {

	return true
}//end render_tool_import_zotero



/**
* EDIT
* Render node for use in current mode
*
* Builds the full tool wrapper for 'edit' mode. If options.render_level is
* 'content', the raw content_data node is returned immediately without a
* wrapper (used by callers that embed the tool inside another container).
*
* @param {Object} options - Render options
* @param {string} [options.render_level='full'] - 'full' returns the complete
*   wrapper; 'content' returns only the inner content_data node.
* @returns {Promise<HTMLElement>} Resolves to the wrapper (render_level='full')
*   or to the content_data node (render_level='content').
*/
render_tool_import_zotero.prototype.edit = async function(options) {

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
}//end render_tool_import_zotero



/**
* GET_CONTENT_DATA_EDIT
*
* Assembles the content area for the Zotero import tool in edit mode.
*
* The content area contains (in DOM order, appended to a DocumentFragment):
*   1. options_wrapper — reserved container for configuration controls.
*      Currently it may be hidden (class_name_configuration='' | 'hide')
*      depending on whether the tool was opened in 'section' import_mode.
*      (!) class_name_configuration is built but never applied to any node —
*      see flags.
*   2. drop_zone — placeholder div that the service_dropzone template is NOT
*      appended to; both appear side-by-side inside the fragment. (!) The
*      drop_zone element is created but left empty; see flags.
*   3. template_container — receives the rendered service_dropzone node, which
*      carries the actual Dropzone upload UI.
*   4. inputs_container — renders service_tmp_section components (metadata
*      fields the user fills before import) with a localised caption label.
*   5. buttons_bottom_container — holds the "Import" button.
*
* The "Import" button click handler:
*   - Guards against empty files_data (no files uploaded).
*   - Adds a CSS 'loading' class to self.node to block further interaction.
*   - Collects components_temp_data from service_tmp_section.
*   - Builds an RQO targeting dd_tools_api / tool_request / import_files with
*     a 1-hour timeout (Zotero imports can be large).
*   - On success, replaces the loading overlay with a localised result message
*     and installs a click handler on self.node that reloads the page.
*
* @param {Object} self - The tool_import_zotero instance (this-context of the
*   caller, passed explicitly so the closure does not capture the wrong this).
* @returns {Promise<HTMLElement>} Resolves to the content_data div node.
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
		// service_dropzone render
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
			if(self.files_data.length < 1){
				return
			}
			// add loading class to wrapper to block all actions for the user
				self.node.classList.add('loading')

			// get the options from the every file uploaded
			for (let i = self.files_data.length - 1; i >= 0; i--) {
				const current_value = self.files_data[i]
			}
			// get the data from every component used to propagate to every file uploaded
			const components_temp_data = self.service_tmp_section.get_components_data()

			// source. Note that second argument is the name of the function to manage the tool request like 'delete_tag'
			// this generates a call as my_tool_name::my_function_name(options)
				const source = create_source(self, 'import_files')

			// process the images in the server (uploaded previously)
			// rqo
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
						key_dir					: self.key_dir
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
						self.node.classList.remove('loading')
						self.node.content_data.classList.add('loading')
						// get message
						const msg = (response.result===true)
							? self.get_tool_label('upload_done')  || 'Files imported successfully'
							: self.get_tool_label('upload_error') || 'Files no imported!'
						// add the message to wrapper (outside content_data that has loading class)
						const msg_container = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'msg_container',
							inner_html 		: msg,
							parent			: self.node
						})
						// when user click reload the tool
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
*
* Updates the target-portal <select> elements in each Dropzone file-preview
* card based on either a filename-suffix auto-detection pattern or an explicit
* reset to the default portal.
*
* Auto-detect pattern (apply===true):
*   Filenames must match /^(.+)-([a-zA-Z])\.([a-zA-Z]{3,4})$/ — e.g.
*   "record-A.jpg" → suffix letter "A" (uppercased) → matched against
*   tool_config.ddo_map entries where role==='component_option' and
*   map_name===suffix. When a matching portal descriptor is found, its
*   tipo value is written into the file card's .option_component_select element.
*
* Reset (apply!==true):
*   Selects either the ddo_map entry flagged with default:true or falls back
*   to the first <option> in the select widget.
*
* This function is module-private; it is not exported and is not currently
* called from within this module. It appears to be a utility intended for
* external callers (e.g. service_dropzone event handlers) that have access
* to the tool instance.
*
* (!) The function is declared but not invoked anywhere in this file. If no
* external caller uses it either, it is dead code — flag for review.
*
* @param {Object} self  - The tool_import_zotero instance; provides
*   self.files_data (array of Dropzone file objects with previewElement) and
*   self.tool_config.ddo_map (array of component descriptor objects).
* @param {boolean} apply - When true, attempt auto-detection from the filename
*   suffix; when false (or any falsy value), reset to the default portal.
* @returns {boolean} Always returns true.
*/
const set_import_mode = function (self, apply) {

	const files_data		= self.files_data || []
	const files_data_length	= files_data.length
	for (let i = 0; i < files_data_length; i++) {

		const current_value = files_data[i]

		if(apply===true){
			const regex = /^(.+)-([a-zA-Z])\.([a-zA-Z]{3,4})$/;
			// const name = current_value.name; //`123 85-456 fd-a.jpg`;
			const map_name = regex.exec(current_value.name)
			if ( map_name!==null && map_name[2]!==null ) {

				const map_name_upper	= map_name[2].toUpperCase();
				const target_portal		= self.tool_config.ddo_map.find(el => el.role==='component_option' && el.map_name===map_name_upper)
				if (target_portal) {
					current_value.previewElement.querySelector(".option_component_select").value = target_portal.tipo;
				}
			}
		}else{
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
