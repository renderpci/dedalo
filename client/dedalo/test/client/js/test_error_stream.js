// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/
'use strict';

/**
* TEST_ERROR_STREAM
* The streaming half of the transport (data_manager.request_stream /
* request_fetch_stream / read_stream) and normalize_stream_error.
*
* WHY THESE ASSERTIONS. A stream that fails used to be indistinguishable from
* one that ended: a 401 body handed to read_stream found no SSE framing and
* closed cleanly, and a network failure left the promise pending forever. Both
* are asserted to REJECT — with an ApiError whose CODE is the server's
* (`auth.not_logged` mid-job is what finally triggers relogin), or `client.*`
* for a foreign status / network failure / caller abort. read_stream's
* synthetic frame for an unparseable message is asserted to carry a
* `client.bad_response` ApiError under `error` (source 'stream') and to reach
* `on_read`, so a consumer using normalize_stream_error sees it.
*
* NO BACKEND: `fetch` is stubbed on window and restored in `finally`; streams
* are built from ReadableStream + TextEncoder in-page.
*/

import {data_manager, release_stream_reader} from '../../../core/common/js/data_manager.js'
import {ApiError, CLIENT_ERROR, is_api_error, normalize_stream_error} from '../../../core/common/js/api_error.js'



// with_stubbed_fetch — replace window.fetch, run fn, always restore
	const with_stubbed_fetch = async (impl, fn) => {
		const original = window.fetch
		window.fetch = impl
		try {
			await fn()
		} finally {
			window.fetch = original
		}
	}

// sse_stream — a ReadableStream that emits the given SSE messages then closes
	const sse_stream = (messages) => new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder()
			for (const message of messages) {
				controller.enqueue(encoder.encode('data:\n' + message + '\n\n'))
			}
			controller.close()
		}
	})

// read_all — drive read_stream to completion, collecting frames
	const read_all = (stream) => new Promise((resolve) => {
		const frames = []
		let reader = null
		reader = data_manager.read_stream(
			stream,
			(frame) => frames.push(frame),
			() => {
				release_stream_reader(reader)
				resolve(frames)
			}
		)
	})

// expect_rejection — await a promise that MUST reject; return the reason
	const expect_rejection = async (promise) => {
		try {
			await promise
		} catch (reason) {
			return reason
		}
		assert.fail('expected a rejection')
	}



describe('ERROR_STREAM — request_stream / request_fetch_stream failures reject with an ApiError', function() {

	it('a non-2xx envelope answer rejects with the SERVER code (auth.not_logged mid-job)', async function() {
		await with_stubbed_fetch(async () => new Response(JSON.stringify({ok: false, request_id: 'rq-s', error: {code: 'auth.not_logged', message: 'Authentication required'}}), {status: 401, headers: {'content-type': 'application/json'}}), async () => {
			const reason = await expect_rejection(data_manager.request_stream({body: {action: 'follow'}}))
			assert.isTrue(is_api_error(reason))
			assert.equal(reason.code, 'auth.not_logged')
			assert.equal(reason.status, 401)
			assert.equal(reason.request_id, 'rq-s')
			assert.instanceOf(reason, Error, 'legacy .message readers still work')
		})
	})

	it('a non-2xx that is not an envelope rejects with client.http_status', async function() {
		await with_stubbed_fetch(async () => new Response('<html>502</html>', {status: 502, statusText: 'Bad Gateway', headers: {'content-type': 'text/html'}}), async () => {
			const reason = await expect_rejection(data_manager.request_stream({body: {action: 'follow'}}))
			assert.equal(reason.code, CLIENT_ERROR.HTTP_STATUS)
			assert.equal(reason.details.status, 502)
		})
	})

	it('a network failure rejects with client.network; the caller\'s abort rejects with client.aborted', async function() {
		await with_stubbed_fetch(async () => { throw new TypeError('Failed to fetch') }, async () => {
			const reason = await expect_rejection(data_manager.request_stream({body: {action: 'follow'}}))
			assert.equal(reason.code, CLIENT_ERROR.NETWORK)
		})
		await with_stubbed_fetch((url, init) => new Promise((resolve, reject) => {
			init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
		}), async () => {
			const controller = new AbortController()
			const pending = data_manager.request_stream({body: {action: 'follow'}, signal: controller.signal})
			controller.abort()
			const reason = await expect_rejection(pending)
			assert.equal(reason.code, CLIENT_ERROR.ABORTED)
		})
	})

	it('a 2xx resolves the body stream (unchanged contract)', async function() {
		await with_stubbed_fetch(async () => new Response(sse_stream(['{"is_running":true}']), {status: 200, headers: {'content-type': 'text/event-stream'}}), async () => {
			const stream = await data_manager.request_stream({body: {action: 'follow'}})
			assert.instanceOf(stream, ReadableStream)
			await stream.cancel()
		})
	})

	it('request_fetch_stream: envelope code on non-2xx, client.http_status on a status page, client.network on failure', async function() {
		await with_stubbed_fetch(async () => new Response(JSON.stringify({ok: false, error: {code: 'perm.denied'}}), {status: 403, headers: {'content-type': 'application/json'}}), async () => {
			const reason = await expect_rejection(data_manager.request_fetch_stream({body: {action: 'export'}}))
			assert.equal(reason.code, 'perm.denied')
		})
		await with_stubbed_fetch(async () => new Response('nope', {status: 500}), async () => {
			const reason = await expect_rejection(data_manager.request_fetch_stream({body: {action: 'export'}}))
			assert.equal(reason.code, CLIENT_ERROR.HTTP_STATUS)
		})
		await with_stubbed_fetch(async () => { throw new TypeError('Failed to fetch') }, async () => {
			const reason = await expect_rejection(data_manager.request_fetch_stream({body: {action: 'export'}}))
			assert.equal(reason.code, CLIENT_ERROR.NETWORK)
		})
	})
})



describe('ERROR_STREAM — read_stream frames', function() {

	it('a valid frame reaches on_read as parsed; the preface frame comes first', async function() {
		const frames = await read_all(sse_stream(['{"is_running":true,"data":{"msg":"working"}}', '{"is_running":false,"data":{"msg":"done"}}']))
		assert.isAtLeast(frames.length, 3)
		assert.equal(frames[0].data.msg, 'Preparing data...')
		assert.deepEqual(frames[1], {is_running: true, data: {msg: 'working'}})
		assert.isNull(normalize_stream_error(frames[1]))
	})

	it('an unparseable frame becomes a synthetic frame with error = ApiError client.bad_response (source stream)', async function() {
		const frames = await read_all(sse_stream(['{not json at all']))
		const bad = frames.find((frame) => frame.error)
		assert.ok(bad, 'the synthetic frame reached on_read')
		assert.isTrue(is_api_error(bad.error))
		assert.equal(bad.error.code, CLIENT_ERROR.BAD_RESPONSE)
		assert.equal(bad.error.source, 'stream')
		assert.equal(bad.error.details.reason, 'invalid_json')
		assert.isTrue(bad.data_string.startsWith('{not json at all'), 'the raw payload is kept for diagnosis')
		assert.strictEqual(normalize_stream_error(bad), bad.error)
	})

	it('a server end-of-run error frame (v2) normalises to its code; a v1 data.errors frame is ignored', function() {
		const v2 = normalize_stream_error({is_running: false, request_id: 'rq-e', error: {code: 'diffusion.job_failed', message: 'x', label_key: 'error_diffusion_job_failed', retryable: false}})
		assert.equal(v2.code, 'diffusion.job_failed')
		assert.equal(v2.request_id, 'rq-e')
		assert.equal(v2.source, 'stream')
		assert.equal(v2.label_key, 'error_diffusion_job_failed')
		assert.isNull(
			normalize_stream_error({is_running: false, data: {msg: 'Process failed', errors: ['not_logged']}, total_time: '2 sec'}),
			'the v1 frame shape is no longer read (P4)'
		)
	})

	it('a BARE v2 error body (the agent SSE `event: error` data) normalises to its code', function() {
		// ERRORS_SPEC §5.3: the event NAME already says terminal, so the agent stream
		// sends the error BODY itself — no `is_running:false`, no nested `error`
		// (src/core/api/handlers/dd_mcp_api.ts agentErrorFrame).
		const bare = normalize_stream_error({
			code		: 'ai.provider_failed',
			category	: 'unavailable',
			message		: 'The model provider failed',
			label_key	: 'error_ai_provider_failed',
			retryable	: true,
			details		: {hint: 'Retry; the provider may be transient'}
		})
		assert.equal(bare.code, 'ai.provider_failed')
		assert.equal(bare.source, 'stream')
		assert.equal(bare.label_key, 'error_ai_provider_failed')
		assert.isTrue(bare.retryable)
		assert.equal(bare.details.hint, 'Retry; the provider may be transient')
		// the wrapper shapes still win, and a progress frame is still not an error
		assert.isNull(normalize_stream_error({is_running: true, data: {msg: 'working'}}))
		assert.isNull(normalize_stream_error({is_running: false}))
	})

	it('read_stream registers and release_stream_reader forgets the reader (connection is the resource)', async function() {
		const before = page_globals.stream_readers.length
		await read_all(sse_stream(['{"is_running":false}']))
		assert.equal(page_globals.stream_readers.length, before, 'released after on_done')
		const api_error = new ApiError({code: 'x.y'})
		assert.equal(api_error.name, 'ApiError')
	})
})



// @license-end
