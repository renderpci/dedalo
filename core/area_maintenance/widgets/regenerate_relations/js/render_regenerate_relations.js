// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_regenerate_relations
* Manages the component's logic and appearance in client side
*/
export const render_regenerate_relations = function() {

	return true
}//end render_regenerate_relations



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
render_regenerate_relations.prototype.list = async function(options) {

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
		const value			= self.value || {}
		const body			= value.body
		const confirm_text	= value.confirm_text || 'Sure?'
		const local_db_id	= 'process_regenerate_relations'

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: body,
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: 'Regenerate relations table data',
				confirm_text	: confirm_text,
				body_info		: content_data,
				body_response	: body_response,
				inputs			: [{
					type		: 'text',
					name		: 'tables',
					label		: 'Table name/s like "matrix,matrix_hierarchy" or "*" for all',
					mandatory	: true
				}],
				on_submit	: (e, values) => {

					const input		= values.find(el => el.name==='tables')
					const tables	= input?.value // string like '*'

					// regenerate_relations
					regenerate_relations(tables)
					.then(function(response){
						update_process_status(
							local_db_id,
							response.pid,
							response.pfile,
							body_response
						)
					})
				}
			})
		}

	// regenerate_relations
		const regenerate_relations = async (tables) => {

			// regenerate_relations process fire
			const response = await data_manager.request({
				body : {
					dd_api			: 'dd_area_maintenance_api',
					action			: 'class_request',
					prevent_lock	: true,
					source			: {
						action	: 'regenerate_relations',
					},
					options : {
						background_running	: true, // set run in background CLI
						tables				: tables // string like '*' or 'matrix_hierarchy'
					}
				},
				retries : 1, // one try only
				timeout : 3600 * 1000 // 1 hour waiting response
			})

			return response
		}//end regenerate_relations

		// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				local_db_id,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status(
						local_db_id,
						local_data.value.pid,
						local_data.value.pfile,
						body_response
					)
				}
			})
		}
		check_process_data()

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit


// @license-end
