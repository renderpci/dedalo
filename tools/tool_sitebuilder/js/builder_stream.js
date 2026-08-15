// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global window*/
/*eslint no-undef: "error"*/



// import
	import { data_manager } from '../../../core/common/js/data_manager.js'
	import {
		normalize_api_error,
		normalize_stream_error,
		normalize_transport_error
	} from '../../../core/common/js/api_error.js'



/**
 * BUILDER_STREAM
 * The wire client for a site-builder agent session's event stream. It POSTs one
 * `session_stream` tool_request RQO to the Dédalo JSON API and consumes the SSE
 * response the engine relays verbatim from the Site Builder daemon.
 *
 * Forked from tool_assistant/js/agent_stream.js — same spec-compliant SSE record parser
 * (buffers across chunks, splits on the blank line, accumulates multi-`data:` lines,
 * reads the `event:` field) and the same JSON-vs-SSE content-type branch (a refusal
 * before the stream opens arrives as a plain JSON envelope). What differs is the RQO
 * (a tool_request, not dd_mcp_api) and the event vocabulary: each `data:` frame is a
 * daemon StoredEvent `{seq, ts, body}`, and `body.type` is one of turn_start | text |
 * tool | file_change | result | error | turn_end.
 *
 * ERROR CONTRACT: every failure — transport, refusal envelope, `event: error`
 * frame — reaches `on_error` as ONE `ApiError` (api_error.js), never a
 * hand-rolled `{code, message}`. The caller dispatches it through
 * `handle_api_error`, so a mid-run `auth.not_logged` raises the relogin overlay
 * instead of a dead message in the chat log.
 *
 * @param {Object}   opts
 * @param {Object}   opts.options    - {session_id, after}
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.on_event] - (stored_event) for every parsed frame
 * @param {Function} [opts.on_error] - (ApiError) terminal on failure
 * @param {Function} [opts.on_done]  - () when the stream ends cleanly
 * @returns {Promise<void>}
 */
export async function builder_stream(opts) {

	const options	= opts.options || {}
	const on_event	= opts.on_event || function() {}
	const on_error	= opts.on_error || function() {}
	const on_done	= opts.on_done || function() {}

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
				dd_api	: 'dd_tools_api',
				action	: 'tool_request',
				source	: { model: 'tool_sitebuilder', action: 'session_stream' },
				options	: options
			})
		})
	} catch(e) {
		if (e && e.name === 'AbortError') return
		on_error(normalize_transport_error(e))
		return
	}

	const content_type = (response.headers.get('Content-Type') || '').toLowerCase()

	// Non-streaming path: a JSON envelope (the tool refused before opening the stream —
	// unconfigured, unreachable, invalid session).
	if (content_type.indexOf('text/event-stream') === -1) {
		let envelope = null
		try { envelope = await response.json() } catch(e) {
			on_error(normalize_transport_error(e)); return
		}
		// ONE normaliser for the refusal: it reads the v2 `{ok:false, error:{code}}`
		// envelope, the COMPAT `{result:false, errors:[token]}` body, and a non-2xx
		// answer that is no envelope at all (client.http_status).
		const api_error = normalize_api_error(response, envelope)
		if (api_error) {
			on_error(api_error)
			return
		}
		if (!envelope || typeof envelope !== 'object') {
			on_error(normalize_transport_error(new Error('empty non-stream answer')))
			return
		}
		on_done()
		return
	}

	// SSE path.
	const reader	= response.body.getReader()
	const decoder	= new TextDecoder()
	let buffer		= ''
	let terminal	= false

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
		if (data_lines.length === 0) return

		// The engine emits `event: error` only if the pass-through itself dies.
		if (event_name === 'error') {
			terminal = true
			let payload = null
			try { payload = JSON.parse(data_lines.join('\n')) } catch(e) { /* ignore */ }
			// The frame's data IS the error body ({code, message}); wrapping it as
			// `{error:…}` is what normalize_stream_error reads. An unparseable frame
			// has nothing to say beyond "the stream broke" → client.bad_response.
			on_error(
				normalize_stream_error({error: payload})
				|| normalize_transport_error(new Error('unparseable stream error frame'))
			)
			return
		}

		let stored = null
		try { stored = JSON.parse(data_lines.join('\n')) } catch(e) { return }
		if (!stored || !stored.body) return
		on_event(stored)
		if (stored.body.type === 'turn_end') terminal = true
	}

	try {
		for (;;) {
			const chunk = await reader.read()
			if (chunk.done) break
			buffer += decoder.decode(chunk.value, { stream: true })
			const records = buffer.split('\n\n')
			buffer = records.pop() || ''
			for (let i = 0; i < records.length; i++) process_record(records[i])
		}
		if (buffer.trim().length > 0) process_record(buffer)
	} catch(e) {
		if (e && e.name === 'AbortError') return
		if (!terminal) on_error(normalize_transport_error(e))
		return
	}

	on_done()
}//end builder_stream
