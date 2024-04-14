/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {render_stream} from '../../../../common/js/render_common.js'
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
		const value					= self.value || {}
		const current_ontology		= value.current_ontology
		const ontology_db			= value.ontology_db
		const body					= value.body
		const structure_from_server	= value.structure_from_server
		const structure_server_url	= value.structure_server_url
		const structure_server_code	= value.structure_server_code
		const prefix_tipos			= value.prefix_tipos || []
		const confirm_text			= value.confirm_text || 'Sure?'


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
						response.pid,
						response.pfile,
						body_response
					)
				})
			}
		})

	// regenerate_relations
		const regenerate_relations = async (tables) => {

			// counter long process fire
			const response  = await data_manager.request({
				body		: {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'class_request',
					source	: {
						action	: 'regenerate_relations',
					},
					options : {
						background_running	: true, // set run in background CLI
						tables				: tables // string like '*' or 'matrix_hierarchy'
					}
				}
			})

			return response
		}//end regenerate_relations

	// update_process_status
		const update_process_status = function(pid, pfile, container) {

			// get_process_status from API and returns a SEE stream
				data_manager.request_stream({
					body : {
						dd_api		: 'dd_utils_api',
						action		: 'get_process_status',
						update_rate	: 1000, // int milliseconds
						options		: {
							pid		: pid,
							pfile	: pfile
						}
					}
				})
				.then(function(stream){

					// render base nodes and set functions to manage
					// the stream reader events
					const render_stream_response = render_stream({
						container		: container,
						id				: 'process_regenerate_relations',
						pid				: pid,
						pfile			: pfile,
						display_json	: true
					})

					// on_read event (called on every chunk from stream reader)
					const on_read = (sse_response) => {
						// fire update_info_node on every reader read chunk
						render_stream_response.update_info_node(sse_response)
					}

					// on_done event (called once at finish or cancel the stream read)
					const on_done = () => {
						// is triggered at the reader's closing
						render_stream_response.done()
					}

					// read stream. Creates ReadableStream that fire
					// 'on_read' function on each stream chunk at update_rate
					// (1 second default) until stream is done (PID is no longer running)
					data_manager.read_stream(stream, on_read, on_done)
				})
		}//end update_process_status

		// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				'process_regenerate_relations',
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status(
						local_data.value.pid,
						local_data.value.pfile,
						body_response
					)
				}
			})
		}
		check_process_data()

	// button_process
		// const button_process = ui.create_dom_element({
		// 	element_type	: 'button',
		// 	class_name		: 'light button_process',
		// 	inner_html		: self.name,
		// 	parent			: content_data
		// })
		// button_process.addEventListener('click', (e) => {
		// 	e.stopPropagation()

		// 	// blur button
		// 	document.activeElement.blur()

		// 	// regenerate_relations
		// 	regenerate_relations()
		// 	.then(function(response){
		// 		update_process_status(
		// 			response.pid,
		// 			response.pfile,
		// 			body_response
		// 		)
		// 	})
		// })

	// process_response
		// const process_response = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'process_response',
		// 	parent			: content_data
		// })

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit
