// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_UNIT_TEST
* Manages the component's logic and appearance in client side
*/
export const render_unit_test = function() {

	return true
}//end render_unit_test



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
render_unit_test.prototype.list = async function(options) {

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
		const value = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// render_long_process
		const long_process_node = render_long_process()
		content_data.appendChild(long_process_node)

	// button_open
		const button_open = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light',
			inner_html		: `Open JS unit test`,
			parent			: content_data
		})
		const click_handler = (e) => {
			e.stopPropagation()

			// url
			const url = `${DEDALO_ROOT_WEB}/core/unit_test/`

			window.open(url)
		}
		button_open.addEventListener('click', click_handler)

	// list_of_test
		const list_of_test = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'list_of_test',
			parent			: content_data
		})
		import('../../../../unit_test/js/list.js')
		.then(function(module){
			ui.update_node_content(list_of_test, JSON.stringify(module.list_of_test, null, 2))
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init new empty test record
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: 'Truncate test table and Create new empty test record',
				confirm_text	: get_label.sure || 'Sure?',
				body_info		: content_data,
				body_response	: body_response,
				trigger : {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'class_request',
					source	: {
						action : 'create_test_record'
					},
					options	: {}
				}
			})
		}

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



/**
* RENDER_LONG_PROCESS
* Render button and response container of long process test
* @return HTMLElement long_process_container
*/
const render_long_process = function() {

	const local_db_id = 'process_test_long_process'

	// long_process_container
		const long_process_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'long_process_container'
		})

	// long_process_stream
		const long_process_stream = async (iterations) => {

			// locks the button submit
			button_run_long_process.classList.add('loading')

			// update_rate
			const update_rate = input_update_rate.value
				? parseInt(input_update_rate.value)
				: 1000

			// counter long process fire
			const response  = await data_manager.request({
				body		: {
					dd_api			: 'dd_area_maintenance_api',
					action			: 'class_request',
					prevent_lock	: true,
					source	: {
						action : 'long_process_stream',
					},
					options : {
						background_running	: true, // set run in background CLI
						iterations			: iterations,
						update_rate			: update_rate // milliseconds
					}
				},
				retries : 1, // one try only
				timeout : 3600 * 1000 // 1 hour waiting response
			})

			return response
		}//end long_process_stream

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
						long_process_response
					)
				}
			})
		}
		check_process_data()

	// button_run_long_process
		const button_run_long_process = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_run_long_process',
			inner_html		: 'Run long process',
			parent			: long_process_container
		})
		const click_handler = (e) => {
			e.stopPropagation()

			// prompt
			const iterations = prompt('How many iterations', 10);
			if (iterations===null) {
				// user cancel action case
				return
			}

			// blur button
			document.activeElement.blur()

			// long_process_stream
			long_process_stream(iterations)
			.then(function(response){
				update_process_status(
					local_db_id,
					response.pid,
					response.pfile,
					long_process_response
				)
			})
		}
		button_run_long_process.addEventListener('click', click_handler)

		const label_update_rate = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info_text',
			inner_html		: 'Update rate',
			parent			: long_process_container
		})
		const input_update_rate = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_update_rate',
			value			: 1000,
			title			: 'Milliseconds',
			parent			: long_process_container
		})

		// long_process_response
		const long_process_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'long_process_response',
			parent			: long_process_container
		})

	// warning
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: `Note about SEE problems: <br>
				Apache have issues where small chunks are not sent correctly over HTTP/1.1 <br>
				Sometimes, the Apache server joins some outputs into one message (merge). <br>
				On old versions, you can try this Apache vhosts configuration: <br>
				<b>ProxyPass fcgi://127.0.0.1:9000/dedalo/ enablereuse=on flushpackets=on max=10</b> <br>
				to prevent this behavior, but the problem doesn't disappear completely. <br>
				With h2 protocol and SSL the problem disappear, but it is necessary to be compatibles with HTTP/1.1
			`,
			parent : long_process_container
		})


	return long_process_container
}//end render_long_process



// @license-end
