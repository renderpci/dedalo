// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {build_report, classify_failure} from './transcription_report.js'


/**
* RENDER_TRANSCRIPTION_STATUS
* The ONE place the transcription engine speaks to the user.
*
* It replaces a `div` that was one line tall with `overflow:hidden`, centred, and
* — for every failure raised before the run started — still carrying the `hide`
* class its error writer never removed. The result was an engine that failed in
* the console: the archivist saw a button stop responding and nothing else.
*
* THE RULES THIS ENFORCES
*   - a report is never hidden. `report()` un-hides unconditionally, because the
*     defect being fixed is exactly a message written into a hidden node;
*   - warnings ACCUMULATE, progress does not. A run that fell back to the CPU or
*     skipped a fragment must still say so when it finishes, so the transient
*     percentage line is a separate node from the standing messages;
*   - every field is a TEXT NODE. message/cause/action/detail carry recognised
*     speech, server paths and runtime strings (SEC-031 / SEC-XSS-006);
*   - a remedy is a BUTTON, not a sentence. "Ask your administrator" is what we
*     say when there is genuinely nothing the user can press.
*
* @param {Object} options
* @param {Object} options.self - the tool_transcription instance (label source)
* @param {Function} options.on_action - called with an action key when the user
*                                       presses an offered remedy
* @returns {Object} {node, report, fail, progress, readiness, clear}
*/
export const create_status_panel = function( options ) {

	const self		= options.self
	const on_action	= typeof options.on_action==='function' ? options.on_action : function(){}

	/** A tool label, or the key itself — never `undefined` in the DOM. */
	const label = function( key, fallback ) {
		if (!key) return ''
		return self.get_tool_label(key) || fallback || key
	}

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'transcription_status hide'
	})

	// The readiness block: what is true BEFORE the button is pressed.
	const readiness_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'status_readiness hide',
		parent			: node
	})

	// The transient line: percentages and live tokens. Overwritten freely.
	const progress_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'status_progress hide',
		parent			: node
	})

	// Standing messages: warnings and failures, oldest first.
	const messages_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'status_messages',
		parent			: node
	})

	/**
	* RENDER_REPORT
	* One report as a block: message, cause, remedy button, technical detail.
	*/
	const render_report = function( report, action_key ) {

		const block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `status_report ${report.severity}`,
			parent			: messages_node
		})

		const message_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'status_message',
			parent			: block
		})
		message_node.textContent = report.message

		if (report.cause!=='') {
			const cause_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'status_cause',
				parent			: block
			})
			cause_node.textContent = report.cause
		}

		// A remedy the user can PRESS. Keys with no server action behind them
		// (ask_admin, lower_quality, check_media) render as a sentence instead:
		// a button that does nothing is worse than a clear instruction.
		const pressable = ['action_repair_model', 'action_download_model', 'action_verify_model', 'action_retry_cpu', 'action_retry']
		if (report.action!=='') {
			if (pressable.includes(action_key)) {
				const button = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light status_action',
					parent			: block
				})
				button.textContent = report.action
				button.addEventListener('click', function(e){
					e.stopPropagation()
					button.classList.add('disable')
					on_action( action_key )
				})
			} else {
				const action_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'status_action_text',
					parent			: block
				})
				action_node.textContent = report.action
			}
		}

		if (report.detail!=='') {
			const details = ui.create_dom_element({
				element_type	: 'details',
				class_name		: 'status_detail',
				parent			: block
			})
			const summary = ui.create_dom_element({
				element_type	: 'summary',
				parent			: details
			})
			summary.textContent = label('technical_detail', 'Technical detail')
			const pre = ui.create_dom_element({
				element_type	: 'pre',
				parent			: details
			})
			pre.textContent = report.detail
		}

		node.classList.remove('hide')
	}

	return {

		node : node,

		/** Show a report. Never hidden — that is the whole point of this module. */
		report : function( input ) {
			render_report( build_report(input), input && input.action_key )
		},

		/**
		* Classify a raw runtime failure and show it, with its remedy.
		* @param {string} raw_message
		* @param {Object} [context] - {phase, model, device, log}
		*/
		fail : function( raw_message, context ) {
			const classified = classify_failure( raw_message, context )
			// Never lose the raw text: the console keeps its copy for the
			// administrator reading a support request (CONVENTIONS §1).
			console.error('[tool_transcription]', classified.key, classified.detail)
			render_report(
				build_report({
					phase		: classified.phase,
					severity	: 'error',
					message		: label(classified.message_key, 'The transcription failed'),
					cause		: label(classified.cause_key, ''),
					action		: label(classified.action_key, ''),
					detail		: classified.detail
				}),
				classified.action_key
			)
		},

		/** The transient line. Not a report: it is overwritten, never stacked. */
		progress : function( text ) {
			progress_node.classList.remove('hide')
			progress_node.textContent = text
			node.classList.remove('hide')
		},

		/**
		* The pre-run truth.
		* @param {Array<Object>} lines - [{severity, text, action_key}]
		*/
		readiness : function( lines ) {
			readiness_node.replaceChildren()
			const list = Array.isArray(lines) ? lines : []
			for (let i = 0; i < list.length; i++) {
				const line	= list[i]
				const row	= ui.create_dom_element({
					element_type	: 'div',
					class_name		: `readiness_line ${line.severity || 'info'}`,
					parent			: readiness_node
				})
				row.textContent = line.text
				if (line.action_key) {
					const button = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'light status_action',
						parent			: row
					})
					button.textContent = label(line.action_key, '')
					button.addEventListener('click', function(e){
						e.stopPropagation()
						button.classList.add('disable')
						on_action( line.action_key )
					})
				}
			}
			readiness_node.classList.toggle('hide', list.length===0)
			if (list.length>0) node.classList.remove('hide')
		},

		/** Drop the transient line and the standing messages (a new run starts). */
		clear : function() {
			progress_node.replaceChildren()
			progress_node.classList.add('hide')
			messages_node.replaceChildren()
		}
	}
}//end create_status_panel


// @license-end
