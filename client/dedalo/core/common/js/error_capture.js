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
* It also RAISES THE PAGE-WIDE ERROR SIGNAL (window event
* 'dedalo_error_signal', declared in common/js/error_dispatch.js) so the error-report
* launcher tab can unfold itself the moment something breaks. The signal
* carries no payload beyond a coarse origin: the buffer stays local.
*
* It also records `console.error` calls (type 'console'): the client CATCHES
* most of its failures and logs them, so without this a report of real
* breakage reads "0 errors". Cost contract (hot callers exist — per-row list
* errors, subscriber throws in render loops):
*   - the original console.error runs FIRST, untouched;
*   - collapse BEFORE any expensive work: a repeat (same first-arg key) only
*     bumps `count` — no stack, no serialization;
*   - only a NEW key pays for the stack (8 frames, 2000 chars);
*   - rate limit: at most 20 new console entries/s, the rest are counted in
*     `window.dedalo_js_errors_dropped`;
*   - args are NEVER deep-stringified (instances/DOM are circular and may
*     hold record data): first string (or Error message) + type tags, 500 chars.
* Console entries do NOT raise the error signal: ~780 call sites, many benign.
* Known price: DevTools attributes every console.error line to this file; the
* real caller is the next frame of the logged stack.
*
* No exports, no imports, and never throws: every handler body is wrapped so
* a defect here can never break the page it is meant to observe. That is why
* the event name is a LITERAL here instead of the imported ERROR_SIGNAL
* constant — test/unit/client_error_signal.test.ts refuses the two to drift.
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
	const push_error = function(entry, signal=true) {
		if (signal) {
		// raise the page-wide signal (see the header: literal by necessity).
		// Repeats signal too: a storm the user is watching is still news.
		try {
			window.dispatchEvent(new CustomEvent('dedalo_error_signal', {
				detail: {origin:'js', code: entry.type || null}
			}))
		} catch (e) {
			// never throw from the observer
		}
		}
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

	// console.error calls. See header for the cost contract.
	const MAX_CONSOLE_MSG	= 500
	const MAX_CONSOLE_STACK	= 2000
	const RATE_PER_SECOND	= 20
	window.dedalo_js_errors_dropped = 0
	let in_capture		= false
	let window_start	= 0
	let window_count	= 0

	/**
	* DESCRIBE_ARG
	* Cheap, shallow, private description of one console argument.
	* @param mixed arg
	* @return string
	*/
	const describe_arg = function(arg) {
		if (typeof arg==='string') {
			return arg
		}
		if (arg instanceof Error) {
			return (arg.name || 'Error') + ': ' + arg.message
		}
		if (arg===null || arg===undefined || typeof arg==='number' || typeof arg==='boolean') {
			return String(arg)
		}
		if (typeof Node!=='undefined' && arg instanceof Node) {
			return '<' + arg.nodeName + (arg.id ? '#' + arg.id : '') + '>'
		}
		return Object.prototype.toString.call(arg)
	}//end describe_arg

	const original_console_error = console.error
	console.error = function(...args) {
		original_console_error.apply(console, args)
		if (in_capture) {
			return
		}
		in_capture = true
		try {
			// cheap key first: repeats stop here
			const key = truncate(describe_arg(args[0]), MAX_CONSOLE_MSG)
			const buffer = window.dedalo_js_errors
			for (let i = buffer.length - 1; i >= 0; i--) {
				const el = buffer[i]
				if (el.type==='console' && el.key===key) {
					el.count	+= 1
					el.time		= new Date().toISOString()
					return
				}
			}
			// rate limit new entries
			const now = Date.now()
			if (now - window_start >= 1000) {
				window_start	= now
				window_count	= 0
			}
			if (++window_count > RATE_PER_SECOND) {
				window.dedalo_js_errors_dropped++
				return
			}
			// new entry: now pay for message + stack
			const msg = truncate(args.map(describe_arg).join(' '), MAX_CONSOLE_MSG)
			const error_arg = args.find(el => el instanceof Error)
			let stack = error_arg && error_arg.stack ? error_arg.stack : null
			if (!stack) {
				const limit = Error.stackTraceLimit
				Error.stackTraceLimit = 8
				stack = new Error().stack || null
				Error.stackTraceLimit = limit
			}
			push_error({
				type	: 'console',
				key		: key,
				msg		: msg,
				source	: null,
				line	: null,
				col		: null,
				stack	: truncate(stack, MAX_CONSOLE_STACK),
				time	: new Date(now).toISOString(),
				count	: 1
			}, false)
		} catch (e) {
			// never throw from the observer
		} finally {
			in_capture = false
		}
	}

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
