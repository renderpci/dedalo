// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB Dropzone */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {create_source} from '../../../core/common/js/common.js'



/**
* RENDER_TOOL_IMPORT_ZOTERO
* Manages the component's logic and appearance in client side
*/
export const render_tool_import_zotero = function() {

	return true
}//end render_tool_import_zotero



/**
* EDIT
* Render node for use in current mode
* @param object options
* @return HTMLElement wrapper
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
* @param object self
* @return HTMLElement content_data
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
						body : rqo
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
* @param object self
* @param bool apply
* @return bool
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
