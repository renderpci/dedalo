// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_ontology_processes
* Manages the component's logic and appearance in client side
*/
export const render_ontology_processes = function() {

	return true
}//end render_ontology_processes



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_ontology_processes.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value					= self.value || {}
		const current_ontology		= value.current_ontology
		const ontology_db			= value.ontology_db
		const structure_from_server	= value.structure_from_server
		const structure_server_url	= value.structure_server_url
		const structure_server_code	= value.structure_server_code
		const prefix_tipos			= value.prefix_tipos || []
		const confirm_text			= value.confirm_text || 'Sure?'

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info_text
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: `Current Ontology version: <b>${current_ontology}</b>`,
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// dedalo_entity check
		if (ontology_db) {
			// message development
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info_text warning',
				inner_html		: 'Disabled update Ontology. You are using config ONTOLOGY_DB !',
				parent			: content_data
			})
		}else{
			// config_grid
				const config_grid = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'config_grid',
					parent			: content_data
				})
				const add_to_grid = (label, value) => {
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html		: label,
						parent			: config_grid
					})
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'value',
						inner_html		: value,
						parent			: config_grid
					})
				}
				// structure_from_server
					add_to_grid('Config:', '')
					add_to_grid('STRUCTURE_FROM_SERVER', structure_from_server)
					add_to_grid('STRUCTURE_SERVER_URL', structure_server_url)
					add_to_grid('STRUCTURE_SERVER_CODE', structure_server_code)
					add_to_grid('DEDALO_PREFIX_TIPOS', prefix_tipos.join(', '))

			// form init
				if (self.caller?.init_form) {
					self.caller.init_form({
						submit_label	: 'Update Dédalo Ontology to the latest version',
						confirm_text	: confirm_text,
						body_info		: content_data,
						body_response	: body_response,
						inputs			: [{
							type		: 'text',
							name		: 'dedalo_prefix_tipos',
							label		: 'TLD list to update',
							mandatory	: true,
							value		: prefix_tipos
						}],
						// trigger : {
						// 	dd_api	: 'dd_area_maintenance_api',
						// 	action	: 'ontology_processes',
						// 	options	: null
						// },
						// on_done : (api_response) => {
						// 	console.log('api_response:', api_response);
						// },
						on_submit	: async (e, values) => {

							// clean body_response nodes
								while (body_response.firstChild) {
									body_response.removeChild(body_response.firstChild);
								}

							// loading add
								e.target.classList.add('lock')
								const spinner = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'spinner'
								})
								body_response.prepend(spinner)

							// ar_dedalo_prefix_tipos
								// sample value:
								// [{
								// 	name : "dedalo_prefix_tipos",
								// 	value : "dd,rsc,hierarchy,actv,aup,dmm"
								// }]
								const dedalo_prefix_tipos		= values[0]?.value
								const ar_dedalo_prefix_tipos	= dedalo_prefix_tipos.split(',')
									.map(el => el.trim())
									.filter(el => el.length>1)

								if (!ar_dedalo_prefix_tipos.length) {
									alert("Error: no prefix are selected");
									return
								}

							// API call
								const api_response = await data_manager.request({
									body		: {
										dd_api	: 'dd_area_maintenance_api',
										action	: 'class_request',
										source	: {
											action	: 'jer_dd_to_matrix_ontology',
										},
										options : {
											ar_dedalo_prefix_tipos	: ar_dedalo_prefix_tipos
										}
									}
								})

							// loading  remove
								spinner.remove()
								e.target.classList.remove('lock')

							// remove annoying rqo_string from object
								if (api_response && api_response.debug && api_response.debug.rqo_string) {
									delete api_response.debug.rqo_string
								}

							// response_node pre JSON response
								if (api_response) {

									// version compatibility check
										const required_version = api_response.root_info?.properties?.version
										if (!required_version) {
											api_response.errors.push('Unable to get required_version from Ontology')
										}else{
											const version_is_supported = self.supported_code_version(required_version)
											if (!version_is_supported) {
												ui.create_dom_element({
													element_type	: 'h3',
													class_name		: 'warning',
													inner_html		: `
														Warning.
														Your Dédalo code version is too old to work with current Ontology.
														You need code version >= ${required_version}
														Please update Dédalo code ASAP to prevent incompatibility issues!
													`,
													parent			: body_response
												})
											}
										}

									// errors node
										if (api_response.errors.length>0) {
											ui.create_dom_element({
												element_type	: 'div',
												class_name		: 'error',
												inner_html		: api_response.errors.join('<br />'),
												parent			: body_response
											})
										}

									// message
										const msg = api_response.msg.replace(/\n/g, '<br />');
										ui.create_dom_element({
											element_type	: 'div',
											class_name		: 'response_node msg',
											inner_html		: msg,
											parent			: body_response
										})

									// JSON response PRE
										const response_string = JSON.stringify(api_response, null, 2)
											.replace(/\\n/g, '<br />');
										ui.create_dom_element({
											element_type	: 'pre',
											class_name		: 'response_node_json',
											inner_html		: response_string,
											parent			: body_response
										})
								}
						}
					})
				}
		}//end if (ontology_db)

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
