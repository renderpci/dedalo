// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

/**
 * TEST_TOOL_SITEBUILDER
 * THE STREAM DOOR, CLIENT HALF (WIRE-MAP, WC-2026-10-11-site-builder-turn-error-frames).
 *
 * A turn's relayed error record carries the ONE converter's body (`body.error`: code, label_key,
 * message, retryable) and no daemon prose; `render_event('error')` renders the code's text
 * (`error_text(body.error)`) — never `body.message`, which the relayed frames no longer carry
 * (a revert prints "✖ undefined" for every turn error). An agent that exited non-zero adds its
 * own words (`agent_output`) as their own `sb_agent_output` line, never as the error.
 *
 * The controller is driven on a bare chat log: render_event and append_line need nothing else.
 */

import { is_api_error } from '../../../core/common/js/api_error.js';
import { error_text } from '../../../core/common/js/render_api_error.js';
import { builder_stream } from '../../../tools/tool_sitebuilder/js/builder_stream.js';
import { sitebuilder_controller } from '../../../tools/tool_sitebuilder/js/sitebuilder_controller.js';

describe('TOOL_SITEBUILDER CLIENT TEST', () => {
	/** A controller over a detached chat log, and the lines it rendered. */
	const controller = () => {
		const self = Object.create(sitebuilder_controller.prototype);
		self.chat_log = document.createElement('div');
		const lines = () =>
			[...self.chat_log.children].map((node) => ({
				cls: [...node.classList].filter((name) => name !== 'sb_line').join(' '),
				text: node.textContent,
			}));
		return { self, lines };
	};

	/** The converter's body as the relay sends it (toErrorBody's keys). */
	const converted = (code) => ({
		code,
		category: 'unavailable',
		label_key: code.replace('.', '_'),
		message: 'ZZ the registry message of ' + code,
		retryable: true,
	});

	it('render_event is wired on the controller prototype', () => {
		assert.equal(typeof sitebuilder_controller.prototype.render_event, 'function');
	});

	it('an error record renders error_text(body.error) — the code’s text, never body.message', () => {
		const { self, lines } = controller();
		const error = converted('site_builder.turn_timeout');
		self.render_event({ type: 'error', error });
		const rendered = lines();
		assert.deepEqual(rendered, [{ cls: 'sb_error', text: '✖ ' + error_text(error) }]);
		assert.notInclude(
			rendered[0].text,
			'undefined',
			'the relayed frame carries no message: a body.message read prints undefined',
		);
		assert.isAbove(error_text(error).length, 0);
	});

	it('a daemon message that rides along is never what renders (the code is the message)', () => {
		const { self, lines } = controller();
		const error = converted('site_builder.failed');
		self.render_event({ type: 'error', error, message: 'ZZ_DAEMON_PROSE_c41 /srv/secret' });
		assert.notInclude(lines()[0].text, 'ZZ_DAEMON_PROSE');
	});

	it('agent_output renders as its OWN sb_agent_output line; an error without it renders one line', () => {
		const { self, lines } = controller();
		const error = converted('site_builder.agent_failed');
		self.render_event({ type: 'error', error, agent_output: 'ZZ the agent said this on stderr' });
		assert.deepEqual(lines(), [
			{ cls: 'sb_error', text: '✖ ' + error_text(error) },
			{ cls: 'sb_agent_output', text: 'ZZ the agent said this on stderr' },
		]);
		const bare = controller();
		bare.self.render_event({ type: 'error', error });
		assert.equal(bare.lines().length, 1);
	});
});

/**
 * G3 — THE WIRE CLIENT ITSELF (builder_stream): the request it sends and what it does with the
 * relayed bytes. Before, only render_event was driven; the fetch + SSE-parse path that feeds it
 * (records split across reads, comments, the `event: error` frame, the refusal envelope) had no
 * client gate at all. `fetch` is stubbed on window and restored in `finally`; the responses are
 * built in-page.
 */
describe('TOOL_SITEBUILDER builder_stream — the session stream, end to end in the page', () => {
	const with_stubbed_fetch = async (impl, fn) => {
		const original = window.fetch;
		window.fetch = impl;
		try {
			await fn();
		} finally {
			window.fetch = original;
		}
	};

	/** A text/event-stream Response whose body arrives in exactly these chunks. */
	const sse_response = (chunks) =>
		new Response(
			new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();
					for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
					controller.close();
				},
			}),
			{ status: 200, headers: { 'Content-Type': 'text/event-stream' } },
		);

	/** Run builder_stream to its end; what each callback received. */
	const run = (options = { session_id: 'zz-s1', after: -1 }) =>
		new Promise((resolve) => {
			const seen = { events: [], errors: [], done: 0 };
			builder_stream({
				options,
				on_event: (stored) => seen.events.push(stored),
				on_error: (error) => {
					seen.errors.push(error);
					resolve(seen);
				},
				on_done: () => {
					seen.done++;
					resolve(seen);
				},
			});
		});

	const record = (stored) => 'id: ' + stored.seq + '\ndata: ' + JSON.stringify(stored) + '\n\n';

	it('POSTs ONE session_stream tool_request, and parses records split ACROSS reads (comments skipped)', async () => {
		const text = { seq: 0, ts: 't', body: { type: 'text', text: 'ZZ hello' } };
		const error = {
			seq: 1,
			ts: 't',
			body: {
				type: 'error',
				error: {
					code: 'site_builder.turn_timeout',
					label_key: 'site_builder_turn_timeout',
					retryable: true,
				},
			},
		};
		const end = { seq: 2, ts: 't', body: { type: 'turn_end', state: 'idle' } };
		const bytes = ': ping\n\n' + record(text) + record(error) + record(end);
		// every record cut mid-way: no read holds one whole
		const chunks = [];
		for (let at = 0; at < bytes.length; at += 7) chunks.push(bytes.slice(at, at + 7));
		let sent = null;
		await with_stubbed_fetch(
			async (url, init) => {
				sent = init;
				return sse_response(chunks);
			},
			async () => {
				const seen = await run({ session_id: 'zz-s1', after: 4 });
				assert.deepEqual(seen.events, [text, error, end]);
				assert.deepEqual({ errors: seen.errors.length, done: seen.done }, { errors: 0, done: 1 });
			},
		);
		assert.equal(sent.method, 'POST');
		assert.equal(sent.headers.Accept, 'text/event-stream');
		assert.deepEqual(JSON.parse(sent.body), {
			dd_api: 'dd_tools_api',
			action: 'tool_request',
			source: { model: 'tool_sitebuilder', action: 'session_stream' },
			options: { session_id: 'zz-s1', after: 4 },
		});
	});

	it('a TRAILING record with no blank line after it is still delivered', async () => {
		const end = { seq: 0, ts: 't', body: { type: 'turn_end', state: 'idle' } };
		await with_stubbed_fetch(
			async () => sse_response(['data: ' + JSON.stringify(end)]),
			async () => {
				const seen = await run();
				assert.deepEqual(seen.events, [end]);
			},
		);
	});

	it('an `event: error` frame is ONE ApiError carrying the frame’s code — never an event, never on_done', async () => {
		const body = {
			code: 'site_builder.stream_lost',
			category: 'unavailable',
			label_key: 'site_builder_stream_lost',
			message: 'x',
			retryable: true,
		};
		await with_stubbed_fetch(
			async () => sse_response(['event: error\ndata: ' + JSON.stringify(body) + '\n\n']),
			async () => {
				const seen = await run();
				assert.deepEqual(
					{ events: seen.events.length, done: seen.done, errors: seen.errors.length },
					{ events: 0, done: 0, errors: 1 },
				);
				assert.isTrue(is_api_error(seen.errors[0]));
				assert.equal(seen.errors[0].code, 'site_builder.stream_lost');
			},
		);
	});

	it('a refusal BEFORE the stream opens (a JSON envelope) is ONE ApiError with the server’s code', async () => {
		const envelope = {
			ok: false,
			error: {
				code: 'site_builder.not_session_owner',
				category: 'forbidden',
				label_key: 'site_builder_not_session_owner',
				message: 'x',
				retryable: false,
			},
		};
		await with_stubbed_fetch(
			async () =>
				new Response(JSON.stringify(envelope), {
					status: 403,
					headers: { 'Content-Type': 'application/json' },
				}),
			async () => {
				const seen = await run();
				assert.deepEqual(
					{ events: seen.events.length, done: seen.done, errors: seen.errors.length },
					{ events: 0, done: 0, errors: 1 },
				);
				assert.equal(seen.errors[0].code, 'site_builder.not_session_owner');
			},
		);
	});

	it('a transport failure is a client.* ApiError (never a hung promise, never a thrown error)', async () => {
		await with_stubbed_fetch(
			async () => {
				throw new TypeError('Failed to fetch');
			},
			async () => {
				const seen = await run();
				assert.equal(seen.errors.length, 1);
				assert.equal(seen.errors[0].code, 'client.network');
			},
		);
	});
});

// @license-end
