// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/
// (!) DEDALO_ROOT_WEB is used below (line ~93) but is NOT declared in the /*global*/ directive above.
// It is injected at runtime by the PHP environment layer (environment.js.php).
// ESLint's no-undef rule will flag it unless the directive is extended.



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_UNIT_TEST
* Client-side render module for the `unit_test` area-maintenance widget.
*
* This widget is Dédalo's built-in integration-test harness panel. It gives
* maintenance administrators three facilities on a single screen:
*
*   1. Long-process stress test — fires the PHP `long_process_stream` action as a
*      background CLI process, then polls its progress via SSE
*      (`update_process_status`) until completion. An input lets the admin tune
*      the SSE update rate (milliseconds). Any in-flight process from a previous
*      page load is detected and resumed automatically through IndexedDB
*      (`data_manager.get_local_db_data`).
*
*   2. Open JS unit test — a button that opens the Dédalo client-side test suite
*      at `${DEDALO_ROOT_WEB}/test/client/` in a new browser tab. The list of
*      registered test modules is also fetched dynamically (dynamic import) and
*      rendered inline as a formatted JSON `<pre>` block.
*
*   3. Create test record — a confirm-guarded form (wired through
*      `self.caller.init_form`) that truncates `matrix_test` and provisions a
*      fresh known-state row, enabling isolated unit-test runs against a clean
*      dataset.
*
* Widget data flow:
*   widget_common.init() → widget_common.build() → widget_common.render() →
*   render_unit_test.prototype.list(options) →
*   get_content_data_edit(self) →  returns `content_data` <div> →
*   ui.widget.build_wrapper_edit wraps it into the final widget wrapper.
*
* `self.value` shape:
*   No structured server value is required by this widget; `self.value` is
*   normalized to `{}` defensively. All interactive content is built entirely
*   client-side.
*
* `self.caller` shape (the parent `area_maintenance` instance):
*   init_form {Function} — builds and wires a submit `<form>` with a confirm
*                          dialog, spinner, and API trigger; see
*                          area_maintenance.prototype.init_form.
*
* @module render_unit_test
*/



/**
* RENDER_UNIT_TEST
* Constructor stub. No per-instance state is stored here; all render logic lives
* in prototype methods and private module-scope functions.
* @returns {boolean} Always returns true (no-op constructor).
*/
export const render_unit_test = function() {

	return true
}//end render_unit_test



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param {Object} options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @returns {HTMLElement} wrapper
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
* Assembles the full content panel for the unit_test widget:
*   - Long-process stress-test block (via render_long_process).
*   - "Open JS unit test" button that opens the client test runner in a new tab.
*   - Dynamic list of registered test modules rendered as a formatted <pre> block.
*   - Confirm-guarded form that truncates `matrix_test` and seeds a fresh row.
*
* The `body_response` div is intentionally appended last so that the API
* response from the create-test-record form renders below all static content.
*
* @param {Object} self - The unit_test widget instance.
*   self.value    {Object}      — widget payload from the server (unused here; normalized to {}).
*   self.caller   {Object|null} — parent area_maintenance instance; must expose init_form().
* @returns {Promise<HTMLElement>} The assembled content_data <div>.
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div',
			class_name	 : 'content_data'
		})

	// render_long_process
		const long_process_node = render_long_process()
		content_data.appendChild(long_process_node)

	// button_open
	// Opens the Dédalo client-side test runner at /test/client/ in a new tab.
	// (!) DEDALO_ROOT_WEB is a plain JS global injected by environment.js.php
	//     and is NOT listed in the /*global*/ directive above — ESLint will
	//     flag it as an undefined variable.
		const button_open = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light',
			inner_html		: `Open JS unit test`,
			parent			: content_data
		})
		const click_handler = (e) => {
			e.stopPropagation()

			// url
			const url = `${DEDALO_ROOT_WEB}/test/client/`

			window.open(url)
		}
		button_open.addEventListener('click', click_handler)

	// list_of_test
	// Dynamically imports the test registry (test/client/js/list.js) and renders
	// its exported `list_of_test` array as a pretty-printed JSON block so admins
	// can quickly verify which test modules are registered without opening the tab.
		const list_of_test = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'list_of_test',
			parent			: content_data
		})
		import('../../../../../test/client/js/list.js')
		.then(function(module){
			ui.update_node_content(list_of_test, JSON.stringify(module.list_of_test, null, 2))
		})

	// body_response
	// Placeholder div where the API response from the create-test-record form
	// will be injected once the user submits. Appended last so it renders below
	// all static content.
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init new empty test record
	// Wires a confirm-guarded form through the parent area_maintenance caller.
	// On submit, the form calls the server action `create_test_record` which
	// truncates `matrix_test` and inserts a known-state row, giving unit tests a
	// predictable starting dataset. The optional-chaining guard makes this safe
	// in standalone render contexts where `self.caller` may be absent.
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: 'Truncate test table and Create new empty test record',
				confirm_text	: get_label.sure || 'Sure?',
				body_info		: content_data,
				body_response	: body_response,
				trigger : {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'widget_request',
					source	: {
						type	: 'widget',
						model	: 'unit_test',
						action	: 'create_test_record'
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
* Builds the long-process stress-test panel: a "Run long process" button, an
* update-rate input (milliseconds), and a response container where SSE progress
* chunks are rendered as they arrive.
*
* The panel also auto-resumes any in-flight process from a previous page session
* by reading the persisted `{pid, pfile}` from IndexedDB (`local_db_id =
* 'process_test_long_process'` / table `'status'`) on every render. If a record
* is found, `update_process_status` is called immediately to reconnect the SSE
* stream.
*
* When the button is clicked:
*   1. The user is prompted for the number of iterations via `prompt()`.
*   2. `long_process_stream(iterations)` calls the server action
*      `long_process_stream` with `background_running: true`, which forks a CLI
*      process and returns `{pid, pfile}` immediately — before the process
*      finishes. The timeout is set to 1 hour to avoid premature client-side
*      cancellation.
*   3. `update_process_status(local_db_id, pid, pfile, long_process_response)`
*      opens an SSE stream from `dd_utils_api::get_process_status` and updates
*      the response container on each tick until the background process exits.
*
* A static info block explains known Apache/HTTP1.1 SSE buffering issues and
* suggested workarounds.
*
* @returns {HTMLElement} The assembled long_process_container <div>.
*/
const render_long_process = function() {

	const local_db_id = 'process_test_long_process'

	// long_process_container
		const long_process_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'long_process_container'
		})

	// long_process_stream
	// Inner async closure that fires the background CLI process and returns the
	// server response containing {pid, pfile}. Adds a 'loading' CSS class to the
	// button so it is visually locked while waiting for the initial handshake.
		const long_process_stream = async (iterations) => {

			// on-button spinner while the background job is being launched
			button_run_long_process.classList.add('button_spinner')

			// update_rate
			const update_rate = input_update_rate.value
				? parseInt(input_update_rate.value)
				: 1000

			try {
				// counter long process fire
				// Routed through widget_request → unit_test::long_process_stream (the TS
				// engine has no dd_area_maintenance_api::class_request; the PHP one forked
				// a CLI child). The TS action submits an in-process mediaJobs tick job and
				// returns the {pid, pfile} handle update_process_status streams.
				const response  = await data_manager.request({
					body		: {
						dd_api			: 'dd_area_maintenance_api',
						action			: 'widget_request',
						prevent_lock	: true,
						source	: {
							type	: 'widget',
							model	: 'unit_test',
							action	: 'long_process_stream',
						},
						options : {
							background_running	: true, // run as a background job
							iterations			: iterations,
							update_rate			: update_rate // milliseconds
						}
					},
					retries : 1, // one try only
					timeout : 3600 * 1000 // 1 hour waiting response
				})

				return response
			} finally {
				button_run_long_process.classList.remove('button_spinner')
			}
		}//end long_process_stream

		// check process status always
		// Called synchronously on render: if a previous long process stored its
		// {pid, pfile} in IndexedDB before the page was navigated away, reconnect
		// the SSE stream immediately so the response container shows live progress.
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
	// Clicking this button prompts for the iteration count, kicks off the
	// background CLI process, then starts the SSE status stream.
	// (!) `button_run_long_process` is referenced inside `long_process_stream`
	//     (to add the 'loading' class) even though that closure is declared
	//     earlier in the source. This is valid because `long_process_stream` is
	//     only *called* after `button_run_long_process` has been assigned, so
	//     the temporal dead zone is not hit at runtime.
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
		// Container node passed to update_process_status; each SSE chunk updates
		// its innerHTML with the latest process output and status metadata.
		const long_process_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'long_process_response',
			parent			: long_process_container
		})

	// warning
	// Static informational note about known Apache/HTTP 1.1 SSE buffering issues
	// (chunk merging) and the h2+SSL workaround. Rendered as an info_text div.
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
