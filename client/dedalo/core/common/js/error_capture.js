// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
* ERROR_CAPTURE
* Page-wide JavaScript error buffer.
*
* Side-effect-only module, imported FIRST by core/page/js/index.js so its
* window-level listeners are installed before any other application module
* evaluates. Uncaught runtime errors and unhandled promise rejections are
* pushed onto `window.dedalo_js_errors`, a bounded in-memory array that
* tools (e.g. tool_error_report) may read when the user explicitly asks to
* report a problem.
*
* The buffer NEVER leaves the browser by itself: nothing here transmits,
* stores, or logs — collection stays local until a tool explicitly submits.
*
* Bounds (defensive, so a rendering loop cannot grow memory):
*   - max 50 entries; identical (msg, source, line) repeats collapse into the
*     existing entry's `count` so an error storm cannot evict distinct errors;
*   - per-field truncation: msg 2000, source 1024, stack 6000 chars.
*
* No exports, no imports, and never throws: every handler body is wrapped so
* a defect here can never break the page it is meant to observe.
*/

const MAX_ENTRIES	= 50
const MAX_MSG		= 2000
const MAX_SOURCE	= 1024
const MAX_STACK		= 6000

if (!window.dedalo_js_errors) {

	// buffer. Global by design: readable by any tool without imports.
	window.dedalo_js_errors = []

	/**
	* TRUNCATE
	* Coerce to string and cap the length.
	* @param mixed value
	* @param int max
	* @return string|null
	*/
	const truncate = function(value, max) {
		if (value===null || value===undefined) {
			return null
		}
		const text = String(value)
		return text.length > max
			? text.slice(0, max)
			: text
	}//end truncate

	/**
	* PUSH_ERROR
	* Append one captured entry to the bounded buffer, collapsing repeats
	* of the same (msg, source, line) into the existing entry's count.
	* @param object entry
	* @return void
	*/
	const push_error = function(entry) {
		const buffer	= window.dedalo_js_errors
		const existing	= buffer.find(el =>
			el.msg===entry.msg && el.source===entry.source && el.line===entry.line
		)
		if (existing) {
			existing.count	+= 1
			existing.time	= entry.time
			return
		}
		if (buffer.length >= MAX_ENTRIES) {
			buffer.shift()
		}
		buffer.push(entry)
	}//end push_error

	// uncaught runtime errors. Non-capture listener on purpose: resource
	// load 'error' events (img/script 404s) do not bubble to window, so
	// only real uncaught JS errors arrive here.
	window.addEventListener('error', function(event) {
		try {
			push_error({
				type	: 'error',
				msg		: truncate(event.message, MAX_MSG),
				source	: truncate(event.filename, MAX_SOURCE),
				line	: typeof event.lineno==='number' ? event.lineno : null,
				col		: typeof event.colno==='number' ? event.colno : null,
				stack	: event.error && event.error.stack
					? truncate(event.error.stack, MAX_STACK)
					: null,
				time	: new Date().toISOString(),
				count	: 1
			})
		} catch (e) {
			// never throw from the observer
		}
	})

	// unhandled promise rejections
	window.addEventListener('unhandledrejection', function(event) {
		try {
			const reason = event.reason
			let msg
			let stack = null
			if (reason instanceof Error) {
				msg		= reason.message
				stack	= reason.stack || null
			} else {
				msg = typeof reason==='string'
					? reason
					: (function(){ try { return JSON.stringify(reason) } catch (e) { return String(reason) } })()
			}
			push_error({
				type	: 'unhandledrejection',
				msg		: truncate(msg, MAX_MSG),
				source	: null,
				line	: null,
				col		: null,
				stack	: truncate(stack, MAX_STACK),
				time	: new Date().toISOString(),
				count	: 1
			})
		} catch (e) {
			// never throw from the observer
		}
	})
}

// @license-end
