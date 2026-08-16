// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals*/
/*eslint no-undef: "error"*/



// import
	import { data_manager } from '../../../core/common/js/data_manager.js'
	import {
		normalize_api_error,
		normalize_stream_error,
		normalize_transport_error
	} from '../../../core/common/js/api_error.js'



/**
 * AGENT_STREAM
 * The wire client for the server-driven assistant chat: POSTs one
 * `agent_chat_stream` RQO to the Dédalo JSON API and consumes the SSE
 * response incrementally.
 *
 * Contract (server: src/core/api/handlers/dd_mcp_api.ts):
 *   event: start        data: {model, mode, egress}
 *   event: thinking     data: {state: 'start'|'stop'}          (indicator only)
 *   event: text         data: {delta}
 *   event: tool_use     data: {id, name, summary}
 *   event: tool_result  data: {id, name, ok, code}
 *   event: iteration    data: {n, max}
 *   event: final        data: {answer, stop, change_plan, history,
 *                              transcript_summary, usage, turns, model}
 *   event: error        data: {code, category, message, label_key, retryable,
 *                              details?, hint?}                    (terminal)
 *                       The DATA is the error BODY itself — the event name
 *                       already says terminal, so there is no `is_running:false`
 *                       wrapper (ERRORS_SPEC §5.3, dd_mcp_api agentErrorFrame).
 *   `: ping` comment heartbeats are ignored. Unknown events are no-ops.
 *
 * Content negotiation: when the server refuses BEFORE the stream opens
 * (master switch off, validation failure) the response is a plain JSON
 * envelope — parsed and routed to on_error. When the server answers with a
 * plain agent_chat-shaped JSON success (a non-streaming server), the data is
 * routed to on_final, so this client works against both surfaces.
 *
 * The SSE parser here is deliberately NOT data_manager.read_stream: that
 * parser drops earlier messages when two SSE records arrive in one network
 * chunk (data_manager.js `read_stream`) and hard-codes the PHP `data:\n…`
 * framing. This one buffers across chunks, splits records on the blank line,
 * accumulates multi-`data:` lines, and reads the `event:` field per the SSE
 * spec.
 *
 * @module agent_stream
 */



/**
 * LIFT_HINT
 * `hint` is the one field the wire carries that the error model has no column
 * for, so it moves into `details` — the ONE place an ApiError keeps per-code
 * scalars, and where a renderer may read it — instead of being dropped.
 *
 * @param {Object} body - an envelope-v2 error body
 * @returns {Object}
 */
const lift_hint = function(body) {

	return (typeof body.hint === 'string' && body.hint.length)
		? {...body, details: {...(body.details || {}), hint: body.hint}}
		: body
}//end lift_hint



/**
 * ERROR_FRAME
 * The `event: error` payload, hint lifted, SHAPE PRESERVED.
 *
 * Two shapes reach here and both stay legal: today's BARE body (`{code,
 * category, message, label_key, retryable, details?, hint?}` — the event name
 * already says terminal, so the server sends no wrapper) and the older
 * `toStreamFrame` wrapper `{is_running:false, error:{…}}`. This function does
 * not choose between them: it lifts the hint wherever it sits and hands the
 * frame to `normalize_stream_error`, which is THE place that decides.
 *
 * @param {Object|null} data - the parsed frame payload
 * @returns {Object|null}
 */
const error_frame = function(data) {

	if (!data || typeof data !== 'object') {
		return null
	}
	// COMPAT: the wrapped frame carries the body one level down
	if (data.error && typeof data.error === 'object') {
		return {...data, error: lift_hint(data.error)}
	}
	return lift_hint(data)
}//end error_frame



/**
 * AGENT_STREAM
 * Send one chat turn and consume the streamed reply.
 *
 * @param {Object}   opts
 * @param {Object}   opts.options       - The agent_chat_stream options payload
 *   {question, history, context, model, mode, images}
 * @param {AbortSignal} [opts.signal]   - Abort signal (stop button)
 * @param {Function} [opts.on_start]    - ({model, mode, egress})
 * @param {Function} [opts.on_thinking] - ({state})
 * @param {Function} [opts.on_delta]    - (text_fragment)
 * @param {Function} [opts.on_tool_use] - ({id, name, summary})
 * @param {Function} [opts.on_tool_result] - ({id, name, ok, code})
 * @param {Function} [opts.on_final]    - (final_data)  terminal on success
 * @param {Function} [opts.on_error]    - (ApiError) terminal on failure. ONE error
 *   model for every failure class — transport, refusal envelope, `event: error`
 *   frame, truncated stream — so the caller dispatches it through
 *   `handle_api_error` and a mid-turn `auth.not_logged` reaches the relogin
 *   overlay instead of a dead line in the transcript.
 * @returns {Promise<void>} resolves when the stream is fully consumed
 */
export async function agent_stream(opts) {

	const options		= opts.options || {}
	const on_start		= opts.on_start || function() {}
	const on_thinking	= opts.on_thinking || function() {}
	const on_delta		= opts.on_delta || function() {}
	const on_tool_use	= opts.on_tool_use || function() {}
	const on_tool_result= opts.on_tool_result || function() {}
	const on_final		= opts.on_final || function() {}
	const on_error		= opts.on_error || function() {}

	// headers: JSON body out, SSE in, per-session CSRF (SEC-008 pattern —
	// mirrors data_manager.request_stream, data_manager.js request_stream)
	const headers = {
		'Content-Type'	: 'application/json',
		'Accept'		: 'text/event-stream'
	}
	if (typeof window !== 'undefined' && window.page_globals && window.page_globals.csrf_token) {
		headers['X-Dedalo-Csrf-Token'] = window.page_globals.csrf_token
	}

	let response
	try {
		response = await fetch(data_manager.url, {
			method		: 'POST',
			credentials	: 'same-origin',
			headers		: headers,
			signal		: opts.signal || null,
			body		: JSON.stringify({
				action	: 'agent_chat_stream',
				dd_api	: 'dd_mcp_api',
				options	: options
			})
		})
	} catch(e) {
		if (e && e.name === 'AbortError') return // user stop — caller renders it
		on_error(normalize_transport_error(e))
		return
	}

	const content_type = (response.headers.get('Content-Type') || '').toLowerCase()

	// Non-streaming path: a JSON envelope (refusal, or a plain agent_chat-style
	// success from a server without the stream action).
	if (content_type.indexOf('text/event-stream') === -1) {
		let envelope = null
		try {
			envelope = await response.json()
		} catch(e) {
			on_error(normalize_transport_error(e))
			return
		}
		// ONE normaliser: v2 `{ok:false, error:{code}}`, the COMPAT
		// `{result:false, errors:[token]}` body, and a non-2xx that is no envelope
		// at all (client.http_status) all resolve here, code intact.
		const api_error = normalize_api_error(response, envelope)
		if (api_error) {
			on_error(api_error)
			return
		}
		if (envelope && envelope.data) {
			on_final(envelope.data)
			return
		}
		on_error(normalize_transport_error(new Error('empty non-stream answer')))
		return
	}

	// SSE path — incremental, spec-compliant record parsing.
	const reader	= response.body.getReader()
	const decoder	= new TextDecoder()
	let buffer		= ''
	let terminal	= false

	const dispatch = function(event_name, data_text) {
		let data = null
		try {
			data = JSON.parse(data_text)
		} catch(e) {
			return // tolerate a malformed frame; the terminal frames re-sync state
		}
		switch (event_name) {
			case 'start'		: on_start(data); break
			case 'thinking'		: on_thinking(data); break
			case 'text'			: on_delta(data.delta || ''); break
			case 'tool_use'		: on_tool_use(data); break
			case 'tool_result'	: on_tool_result(data); break
			case 'final'		: terminal = true; on_final(data); break
			// the frame goes to normalize_stream_error AS IT CAME: that one function
			// recognises the bare v2 body AND the older {is_running:false, error:{…}}
			// wrapper, so this client keeps working against either server without a
			// shape test of its own. `hint` has been lifted into `details` first.
			case 'error'		: terminal = true; on_error(
									normalize_stream_error(error_frame(data))
									|| normalize_transport_error(new Error('unparseable stream error frame'))
								); break
			default				: break // unknown events are no-ops (forward compat)
		}
	}

	const process_record = function(record) {
		let event_name	= 'message'
		const data_lines= []
		const lines		= record.split('\n')
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			if (line.length === 0 || line[0] === ':') continue // comment/heartbeat
			const colon	= line.indexOf(':')
			const field	= colon === -1 ? line : line.slice(0, colon)
			let value	= colon === -1 ? '' : line.slice(colon + 1)
			if (value[0] === ' ') value = value.slice(1)
			if (field === 'event') event_name = value
			else if (field === 'data') data_lines.push(value)
		}
		if (data_lines.length > 0) {
			dispatch(event_name, data_lines.join('\n'))
		}
	}

	try {
		for (;;) {
			const chunk = await reader.read()
			if (chunk.done) break
			buffer += decoder.decode(chunk.value, { stream: true })
			// records are separated by a blank line; keep the unfinished tail
			const records = buffer.split('\n\n')
			buffer = records.pop() || ''
			for (let i = 0; i < records.length; i++) {
				process_record(records[i])
			}
		}
		if (buffer.trim().length > 0) {
			process_record(buffer)
		}
	} catch(e) {
		if (e && e.name === 'AbortError') return // user stop
		if (!terminal) {
			on_error(normalize_transport_error(e))
		}
		return
	}

	if (!terminal) {
		// the connection closed cleanly but the run never landed: the answer we
		// would show is unreadable, which is exactly client.bad_response
		on_error(normalize_transport_error(new Error('stream ended without a final frame')))
	}
}//end agent_stream
