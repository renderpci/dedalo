// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label */
/*eslint no-undef: "error"*/

/**
* MOVE_TRANSFORM
* The ONE run flow of the five move_* maintenance widgets (move_lang,
* move_locator, move_tld, move_to_portal, move_to_table): PREVIEW first, then
* EXECUTE the very selection that was previewed.
*
* WHY. The server runs a move_* transform only when `dry_run` is EXACTLY false
* (WC-025); anything else is a dry run. The widgets used to send no `dry_run`
* at all, so the panel could only ever preview — no control reached the
* execute. Both runs are server JOBS answering `{pid, pfile}` at once
* (WC-2026-09-30-move-transform-execute-job); the job stream renders here.
*
* THE FLOW.
*  1. The form's submit runs the PREVIEW (dry_run: true) of the checked files
*     and streams its job.
*  2. Only a preview that ENDED CLEAN (no coded error, report ok, a dry run —
*     dry_run_cleared) reveals the Execute button, bound to a SNAPSHOT of the
*     files that were previewed.
*  3. Execute refuses when the checked files changed since the preview (the
*     operator must preview what runs), asks for an explicit confirm, then runs
*     the snapshot with dry_run: false and streams that job. The button is
*     hidden again: a new execute needs a new preview.
*
* Backend-free gate: client/dedalo/test/client/js/test_move_transform.js.
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {update_process_status} from '../../common/js/common.js'
	import {request_failed} from '../../common/js/api_error.js'
	import {handle_api_error} from '../../common/js/error_dispatch.js'



/**
* MOVE_TRANSFORM_REQUEST_BODY
* The widget_request body of one run. `dry_run` is ALWAYS sent explicitly:
* true = preview, false = execute (the server mutates only on exactly false).
* @param {string} model - widget id, e.g. 'move_tld' (also the action name)
* @param {Array<string>} files_selected - definition file names
* @param {boolean} dry_run
* @returns {Object} body
*/
export const move_transform_request_body = function(model, files_selected, dry_run) {

	return {
		dd_api			: 'dd_area_maintenance_api',
		action			: 'widget_request',
		prevent_lock	: true,
		source			: {
			type	: 'widget',
			model	: model,
			action	: model
		},
		options : {
			background_running	: true, // the server answers {pid, pfile}: both runs are jobs
			files_selected		: [...files_selected],
			dry_run				: dry_run === false ? false : true
		}
	}
}//end move_transform_request_body



/**
* EXEC_MOVE_TRANSFORM
* Fire one run. Resolves to the API response ({pid, pfile, dry_run} on success).
* @param {string} model
* @param {Array<string>} files_selected
* @param {boolean} dry_run
* @returns {Promise<Object>} api_response
*/
export const exec_move_transform = async function(model, files_selected, dry_run) {

	return data_manager.request({
		body	: move_transform_request_body(model, files_selected, dry_run),
		retries	: 1, // one try only: a run may already be submitted
		timeout	: 60 * 1000 // the door only submits the job
	})
}//end exec_move_transform



/**
* DRY_RUN_CLEARED
* Whether a job's FINAL frame is a preview that ended clean: not running, no
* coded `error` (a failed run ends with one — ERRORS_SPEC §5.3), the report
* `ok`, and a dry run.
* @param {Object|null} frame - the last get_process_status frame
* @returns {boolean}
*/
export const dry_run_cleared = function(frame) {

	if (!frame || frame.is_running !== false || frame.error) {
		return false
	}
	const data = frame.data || {}

	return data.ok === true && data.dry_run === true
}//end dry_run_cleared



/**
* SAME_SELECTION
* Order-insensitive equality of two file-name lists.
* @param {Array<string>} a
* @param {Array<string>} b
* @returns {boolean}
*/
const same_selection = function(a, b) {

	if (a.length !== b.length) {
		return false
	}
	const sorted_b = [...b].sort()

	return [...a].sort().every((name, i) => name === sorted_b[i])
}//end same_selection



/**
* INIT_MOVE_TRANSFORM_FORM
* Wire the preview form + the execute control into a move_* widget body.
* @param {Object} self - the widget instance (self.caller.init_form)
* @param {Object} options
*	model			{string} widget id
*	submit_label	{string} what the run does, e.g. 'Move TLD terms'
*	files_selected	{Array<string>} the LIVE checked-files array (mutated by the checkboxes)
*	content_data	{HTMLElement} form container (body_info)
*	body_response	{HTMLElement} job stream container
*	local_db_id		{string} IndexedDB key of the running job, e.g. 'process_move_tld'
* @param {Object} [deps] - injectable effects (the backend-free gate):
*	exec			{Function} (model, files, dry_run) => Promise<api_response>
*	track			{Function} (local_db_id, pid, pfile, container, on_done(frame))
*	confirm			{Function} (text) => boolean
*	alert			{Function} (text) => void
* @returns {Object} {execute_button} - the execute control node
*/
export const init_move_transform_form = function(self, options, deps={}) {

	// options
		const model				= options.model
		const submit_label		= options.submit_label
		const files_selected	= options.files_selected
		const content_data		= options.content_data
		const body_response		= options.body_response
		const local_db_id		= options.local_db_id

	// deps
		const exec		= deps.exec || exec_move_transform
		const track		= deps.track || ((id, pid, pfile, container, on_done) => {
			update_process_status(id, pid, pfile, container, 1000, on_done)
		})
		const ask		= deps.confirm || ((text) => window.confirm(text))
		const notify	= deps.alert || ((text) => window.alert(text))

	// previewed: the snapshot of the files the last CLEAN preview ran on
		let previewed = null

	// run: fire one run and stream its job; on_done gets the final frame
		const run = (files, dry_run, on_done) => {
			return exec(model, files, dry_run)
			.then(function(api_response){
				if (request_failed(api_response)) {
					handle_api_error(api_response.error, {wrapper: body_response})
					return
				}
				if (!api_response || api_response.pid === undefined || !api_response.pfile) {
					notify('Error: the server did not start the job')
					return
				}
				track(local_db_id, api_response.pid, api_response.pfile, body_response, on_done)
			})
		}

	// execute_button. Hidden until a preview ends clean.
		const execute_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning button_execute_move hide',
			text_content	: `Execute: ${submit_label}`
		})
		execute_button.type = 'button'
		execute_button.addEventListener('click', function(e) {
			e.stopPropagation()
			if (previewed === null) {
				return
			}
			if (!same_selection(previewed, files_selected)) {
				notify('The selected files changed since the preview. Run the preview again.')
				return
			}
			const text = `Execute ${model} on ${previewed.join(', ')}?\n`
				+ 'This rewrites stored data. A locator move cannot be undone.'
			if (!ask(text)) {
				return
			}
			const files = previewed
			previewed = null
			execute_button.classList.add('hide')
			run(files, false, null)
		})

	// form: the submit is the PREVIEW
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: `Preview: ${submit_label} (dry run)`,
				confirm_text	: 'Run the preview (dry run)? It writes nothing.',
				body_info		: content_data,
				body_response	: body_response,
				on_submit		: () => {
					if (!files_selected.length) {
						notify('Error: no files are selected')
						return
					}
					const snapshot = [...files_selected]
					previewed = null
					execute_button.classList.add('hide')
					return run(snapshot, true, (frame) => {
						if (!dry_run_cleared(frame)) {
							return
						}
						previewed = snapshot
						execute_button.classList.remove('hide')
					})
				}
			})
		}
		content_data.appendChild(execute_button)


	return {
		execute_button
	}
}//end init_move_transform_form



// @license-end
