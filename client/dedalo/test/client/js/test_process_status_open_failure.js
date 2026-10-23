// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, beforeEach, afterEach, page_globals */
/*eslint no-undef: "error"*/
'use strict';

/**
* TEST_PROCESS_STATUS_OPEN_FAILURE
* `update_process_status` (common.js) streams a long job's status into a panel
* and calls the caller's `callback` once when the stream ends. When the stream
* could not be OPENED at all — fetch rejected, a non-2xx answer, a 2xx with no
* body — it used to log and return: the callback never ran, so a caller gating
* on it (move_* preview → execute, update_code's track) waited forever, and the
* panel kept whatever it showed before (often nothing).
*
* Asserted per failure:
*   - the callback runs EXACTLY ONCE, with a terminal frame
*     (`is_running:false`) whose `normalize_stream_error` is the CODED failure
*     (the server's code on an envelope, `client.*` otherwise);
*   - the failure is stated IN the container, panel-local (data-code), never
*     the full-page panel and never `page_globals.page_error` (0d7040e52d);
*   - no reader is left in `page_globals.stream_readers`.
* A clean stream is the positive control (callback once, with its last frame).
*
* NO BACKEND: `fetch` is stubbed on window and restored after each case.
*/

import {update_process_status} from '../../../core/common/js/common.js'
import {CLIENT_ERROR, normalize_stream_error} from '../../../core/common/js/api_error.js'



// settle_window — how long a case waits for the callback before calling it lost,
// and how long it keeps listening after the first call for a second one
	const SETTLE_TIMEOUT_MS	= 4000
	const REPEAT_WINDOW_MS	= 300

// track — run update_process_status with a stubbed fetch; resolve with every
// callback call observed (empty when the callback never ran)
	const track = (fetch_impl) => new Promise((resolve) => {
		const calls		= []
		const container	= document.createElement('div')
		container.appendChild(document.createTextNode('previous panel content'))
		const original	= window.fetch
		window.fetch	= fetch_impl
		let timer = null
		const finish = () => {
			window.fetch = original
			resolve({calls, container})
		}
		timer = setTimeout(finish, SETTLE_TIMEOUT_MS)
		update_process_status('test_process_status_open_failure', 1, 'test_pfile_open_failure', container, 1000, (frame) => {
			calls.push(frame)
			if (calls.length===1) {
				clearTimeout(timer)
				timer = setTimeout(finish, REPEAT_WINDOW_MS)
			}
		})
	})

// sse_response — a 2xx SSE answer carrying the given frames
	const sse_response = (frames) => new Response(new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder()
			for (const frame of frames) {
				controller.enqueue(encoder.encode('data:\n' + JSON.stringify(frame) + '\n\n'))
			}
			controller.close()
		}
	}), {status: 200, headers: {'content-type': 'text/event-stream'}})

// open_failure — checks the shared contract of every open failure and returns
// the coded failure the callback received (each case asserts its code)
	const open_failure = (result, readers_before) => {
		const {calls, container} = result
		assert.equal(calls.length, 1, 'the callback runs exactly once (it never ran before the fix)')
		const frame = calls[0]
		assert.isFalse(frame?.is_running, 'a terminal frame')
		const api_error = normalize_stream_error(frame)
		assert.isNotNull(api_error, 'the frame carries a coded failure')

		const node = container.querySelector('[data-code]')
		assert.isNotNull(node, 'the failure is stated in the panel')
		assert.equal(node.dataset.code, api_error.code, 'the panel names the same code')
		assert.notInclude(container.textContent, 'previous panel content', 'the panel no longer shows the stale content')
		assert.isNull(container.querySelector('.page_error_container'), 'panel-local: never the full-page panel')
		assert.isNull(page_globals.page_error ?? null, 'never the page slot')
		assert.equal(page_globals.stream_readers.length, readers_before, 'no dangling reader')

		return api_error
	}



describe('PROCESS STATUS — a stream that cannot be opened settles the caller', function() {

	this.timeout(15000)

	let original_page_error
	let readers_before

	beforeEach(() => {
		original_page_error		= page_globals.page_error
		page_globals.page_error	= null
		readers_before			= page_globals.stream_readers.length
	})
	afterEach(() => {
		page_globals.page_error = original_page_error ?? null
	})

	it('fetch rejects (network) → callback once with client.network, panel-local', async function() {
		const result = await track(async () => { throw new TypeError('Failed to fetch') })
		assert.equal(open_failure(result, readers_before).code, CLIENT_ERROR.NETWORK)
	})

	it('403 envelope → callback once with the server code (perm.denied), no page_error', async function() {
		const result = await track(async () => new Response(
			JSON.stringify({ok: false, request_id: 'rq-ps-403', error: {code: 'perm.denied', message: 'Access denied'}}),
			{status: 403, headers: {'content-type': 'application/json'}}
		))
		assert.equal(open_failure(result, readers_before).code, 'perm.denied')
		assert.include(result.container.textContent, 'rq-ps-403', 'the request_id joins the server log')
	})

	it('500 with a non-envelope body → callback once with client.http_status', async function() {
		const result = await track(async () => new Response('<html>Internal Server Error</html>', {status: 500}))
		assert.equal(open_failure(result, readers_before).code, CLIENT_ERROR.HTTP_STATUS)
	})

	it('2xx with no body → callback once with client.bad_response', async function() {
		const result = await track(async () => new Response(null, {status: 200}))
		assert.equal(open_failure(result, readers_before).code, CLIENT_ERROR.BAD_RESPONSE)
	})

	it('CONTROL: a clean stream → callback once with its last frame, no failure', async function() {
		const last = {is_running: false, data: {msg: 'Process finished ok'}}
		const result = await track(async () => sse_response([{is_running: true, data: {msg: 'Working step 1'}}, last]))
		assert.equal(result.calls.length, 1, 'the callback runs exactly once')
		assert.deepEqual(result.calls[0], last, 'with the last frame read')
		assert.isNull(normalize_stream_error(result.calls[0]), 'no failure on a clean run')
		assert.isNull(result.container.querySelector('[data-code]'), 'no failure node')
		assert.equal(page_globals.stream_readers.length, readers_before, 'the reader was released')
	})
})



// @license-end
