// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {build_report, classify_failure} from './transcription_report.js'


/**
* ACTION_LABELS
* The English words behind every remedy key.
*
* A tool label falls back to the KEY when the install's catalog does not carry it,
* and every one of these keys is new: on a live install seeded before this work,
* the remedy button would read `action_repair_model`. A button whose text is an
* identifier is not a remedy, so the fallback is stated here — once, for both the
* report path and the readiness path.
*/
export const ACTION_LABELS = {
	action_repair_model		: 'Repair the model',
	action_download_model	: 'Download the model',
	action_verify_model		: 'Check the model files',
	action_retry_cpu		: 'Run it on the processor instead',
	action_retry			: 'Try again',
	action_lower_quality	: 'Choose a smaller model',
	action_check_media		: "Check this record's audio file",
	action_ask_admin		: 'Ask your administrator'
}

/** The remedies that DO something when pressed; the rest render as a sentence. */
export const PRESSABLE_ACTIONS = [
	'action_repair_model',
	'action_download_model',
	'action_verify_model',
	'action_retry_cpu',
	'action_retry'
]


/**
* ACTION_LABEL
* A remedy's words: the install's own label, else the English fallback, never the
* bare key. Exported because the model picker's own Download / Repair button must
* read the same as the panel's — two spellings of one remedy is how a user learns
* they are two different things.
*
* @param {Object} self - the tool_transcription instance (label source)
* @param {string} key - an ACTION_LABELS key
* @returns {string}
*/
export const action_label = function( self, key ) {

	if (!key) return ''


	return (self && self.get_tool_label(key)) || ACTION_LABELS[key] || key
}//end action_label


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
* @param {Function} options.on_action - called (action_key, action_model) when the
*                                       user presses an offered remedy.
*                                       `action_model` is the model THAT remedy is
*                                       for — absent when the remedy is not about
*                                       one particular model, and the caller then
*                                       falls back to the selected quality model.
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

	/** A remedy's words. Never the bare key: see ACTION_LABELS. */
	const remedy_label = function( key ) {
		return action_label( self, key )
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
	const render_report = function( report, action_key, action_model ) {

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
		if (report.action!=='') {
			if (PRESSABLE_ACTIONS.includes(action_key)) {
				const button = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light status_action',
					parent			: block
				})
				button.textContent = report.action
				button.addEventListener('click', function(e){
					e.stopPropagation()
					button.classList.add('disable')
					// THE MODEL THE REMEDY IS FOR, never "the currently selected
					// one": a Repair offered because the SPEAKER model is damaged
					// used to repair the selected ASR model — a different model
					// that was never broken — and then report success.
					on_action( action_key, action_model )
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
			render_report(
				build_report(input),
				input && input.action_key,
				input && input.action_model
			)
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
					action		: remedy_label(classified.action_key),
					detail		: classified.detail
				}),
				classified.action_key,
				(context || {}).model
			)
		},

		/**
		* The transient line. Not a report: it is overwritten, never stacked.
		*
		* An EMPTY text retires it. A run that ends — completed, refused or failed —
		* must not leave "Processing : 99%" standing above the report that says it
		* stopped; and `clear()` cannot be used for that, because clear() also drops
		* the warnings the run accumulated, which are precisely what has to survive
		* to the end (a CPU fallback, a skipped fragment, speakers not detected).
		*/
		progress : function( text ) {
			const line = typeof text==='string' ? text : ''
			progress_node.textContent = line
			progress_node.classList.toggle('hide', line==='')
			if (line!=='') node.classList.remove('hide')
		},

		/**
		* The pre-run truth.
		*
		* TWO REGISTERS, on purpose. Readiness is read BEFORE anything has gone
		* wrong, and most of what it reports is unremarkable — `unverified` is the
		* normal state of every store seeded before the manifest existed. Rendering
		* every line as a full-width accented block made a healthy install shout
		* three times over a state that is fine, which is how a panel teaches its
		* reader to stop reading it.
		*
		* So: `info` lines join ONE quiet run-on line (`Model: … · Device: … ·
		* Language: …`, the shape the spec asked for), and only a line that
		* actually needs attention — warning or error — breaks out into a row of
		* its own with an accent and its remedy button.
		*
		* @param {Array<Object>} lines - [{severity, text, action_key, action_model}]
		*/
		readiness : function( lines ) {

			readiness_node.replaceChildren()

			const list		= Array.isArray(lines) ? lines : []
			const quiet		= list.filter( line => (line.severity || 'info')==='info' && !line.action_key )
			const notable	= list.filter( line => !quiet.includes(line) )

			// the quiet run-on line
			if (quiet.length>0) {
				const summary = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'readiness_summary',
					parent			: readiness_node
				})
				for (let i = 0; i < quiet.length; i++) {
					const part = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'readiness_part',
						parent			: summary
					})
					part.textContent = quiet[i].text
				}
			}

			// the lines that earn their own row
			for (let i = 0; i < notable.length; i++) {

				const line	= notable[i]
				const row	= ui.create_dom_element({
					element_type	: 'div',
					class_name		: `readiness_line ${line.severity || 'info'}`,
					parent			: readiness_node
				})

				// The text is its OWN element rather than a bare text node: the row
				// is a flex container, and a text node cannot be laid out against
				// the button beside it (which is how the button ended up sitting in
				// the middle of the sentence).
				const text = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'readiness_text',
					parent			: row
				})
				text.textContent = line.text

				if (line.action_key) {
					const button = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'light status_action',
						parent			: row
					})
					button.textContent = remedy_label(line.action_key)
					button.addEventListener('click', function(e){
						e.stopPropagation()
						button.classList.add('disable')
						on_action( line.action_key, line.action_model )
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
