// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_EXPORT_HIERARCHY
* Manages the component's logic and appearance in client side
*/
export const render_export_hierarchy = function() {

	return true
}//end render_export_hierarchy



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
render_export_hierarchy.prototype.list = async function(options) {

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
		const export_hierarchy_path	= value.export_hierarchy_path || null

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// export_hierarchy_node
		const export_hierarchy_node = render_export_hierarchy_node({
			self,
			export_hierarchy_path
		})
		content_data.appendChild(export_hierarchy_node)

	// sync_hierarchy_active_status_node
		const sync_hierarchy_active_status_node = render_sync_hierarchy_active_status_node({
			self
		})
		content_data.appendChild(sync_hierarchy_active_status_node)


	return content_data
}//end get_content_data_edit



/**
* RENDER_EXPORT_HIERARCHY_NODE
* Generates de DOM nodes about Export hierarchies
* @param object options
* {
* 	self : object - Widget instance
* 	export_hierarchy_path: string|null
* }
* @return DocumentFragment
*/
export const render_export_hierarchy_node = function (options) {

	const {
		self,
		export_hierarchy_path
	} = options

	const fragment = new DocumentFragment()

	ui.create_dom_element({
		element_type	: 'h6',
		class_name		: '',
		inner_html		: `Export hierarchies`,
		parent			: fragment
	})

	// export_hierarchy_path check
		if (!export_hierarchy_path) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info_text',
				inner_html		: `To enable exporting, define var EXPORT_HIERARCHY_PATH in the configuration file`,
				parent			: content_data
			})
			return fragment
		}

	// info
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: `Creates files like es1.copy.gz in /install/import/hierarchy (for MASTER toponymy export)`,
			parent			: fragment
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

		// config_grid
			const config_grid = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'config_grid',
				parent			: fragment
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
			// add lines to config_grid container
			add_to_grid('Config:', '')
			add_to_grid('export_hierarchy_path: ', export_hierarchy_path)

	// form init
		self.caller.init_form({
			submit_label	: 'Export hierarchy',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: fragment,
			body_response	: body_response,
			inputs			: [{
				type		: 'text',
				name		: 'section_tipo',
				label		: 'section tipo like es1,es2 or * for all active', // placeholder
				mandatory	: true,
				value		: ''
			}],
			on_submit		: (e, values) => {

				const input			= values.find(el => el.name==='section_tipo')
				const section_tipo	= input?.value // string like '*'

				const form_container = e.target

				// clean
				while (body_response.firstChild) {
					body_response.removeChild(body_response.firstChild);
				}

				// spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner'
				})
				body_response.prepend(spinner)
				form_container.classList.add('lock')

				// API process fire
				self.exec_export_hierarchy(section_tipo)
				.then(function(response){

					form_container.classList.remove('lock')
					spinner.remove()

					const json_node =ui.create_dom_element({
						element_type	: 'pre',
						inner_html		: JSON.stringify(response, null, 2),
						parent			: body_response
					})
					const dblclick_handler = (e) => {
						json_node.remove()
					}
					json_node.addEventListener('dblclick', dblclick_handler)
				})
			}
		})

	// add at end body_response
		fragment.appendChild(body_response)


	return fragment
}//end render_export_hierarchy_node



/**
* RENDER_SYNC_HIERARCHY_ACTIVE_STATUS_NODE
* Generates de DOM nodes about Export hierarchies
* @param object options
* {
* 	self : object - Widget instance
* 	export_hierarchy_path: string|null
* }
* @return DocumentFragment
*/
export const render_sync_hierarchy_active_status_node = function (options) {

	const {
		self
	} = options

	const fragment = new DocumentFragment()

	ui.create_dom_element({
		element_type	: 'h6',
		inner_html		: `Sync Hierarchy status`,
		class_name		: '',
		parent			: fragment
	})

	// info
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: `Sync the 'Active' status with the 'Active in thesaurus' status.`,
		parent			: fragment
	})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		self.caller.init_form({
			submit_label	: 'Sync Hierarchy',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: fragment,
			body_response	: body_response,
			inputs			: [],
			on_submit		: (e, values) => {

				const form_container = e.target

				// clean
					while (body_response.firstChild) {
						body_response.removeChild(body_response.firstChild);
					}

				// spinner
					const spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner'
					})
					body_response.prepend(spinner)
					form_container.classList.add('lock')

				// API process fire
				self.sync_hierarchy_active_status()
				.then(function(response){

					form_container.classList.remove('lock')
					spinner.remove()

					const json_node = ui.create_dom_element({
						element_type	: 'pre',
						inner_html		: JSON.stringify(response, null, 2),
						parent			: body_response
					})
					const dblclick_handler = (e) => {
						json_node.remove()
					}
					json_node.addEventListener('dblclick', dblclick_handler)
				})
			}
		})

	// add at end body_response
		fragment.appendChild(body_response)


	return fragment
}//end render_sync_hierarchy_active_status_node



// @license-end
