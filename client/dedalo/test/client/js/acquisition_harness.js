// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/

/**
 * ACQUISITION HARNESS
 * Shared by test_tool_bibliography_acquisition and test_tool_numisdata_acquisition:
 * mounts a REAL acquisition tool panel (real constructor, real renderer) on a fake
 * caller and answers its network with a FAKE SERVER at `window.fetch`, so the
 * whole client path runs for real — data_manager.request (the envelope → ApiError
 * normalisation), data_manager.request_stream + read_stream (the SSE framing),
 * render_stream — and only the server is scripted.
 *
 * The background jobs are scripted by their TERMINAL FRAME, in the exact shape
 * the engine emits (src/core/media/jobs.ts frameOf):
 *   success  {is_running:false, data:<the handler's ok() envelope>, errors:[]}
 *   failure  {is_running:false, data:<the LAST progress payload>, errors:[…], error:{code,…}}
 *   stopped  {is_running:false, data:<the LAST progress payload>, errors:[…]}
 * (a failed job's `data` is NOT an envelope: background.ts publishes progress
 * first, and recordFailure never rewrites it — ERRORS_SPEC §5.3).
 *
 * Backend-free: nothing here reaches the server; the original fetch is restored
 * after every run.
 */

/** A progress payload, as background.ts publishes it before the handler runs. */
export const running_payload = (model, method) => ({
	msg: `Running ${model}::${method}`,
	is_running: true,
});

/** The terminal frame of a job whose handler returned `envelope`. */
export const success_frame = (envelope) => ({
	pid: 4242,
	pfile: 'zz_acquisition_job.json',
	is_running: false,
	data: envelope,
	errors: [],
	total_time: 12,
});

/** The terminal frame of a job whose handler THREW `error_body`. */
export const failed_frame = (progress, error_body) => ({
	pid: 4242,
	pfile: 'zz_acquisition_job.json',
	is_running: false,
	data: progress,
	errors: [error_body.message],
	error: error_body,
	total_time: 12,
});

/** The terminal frame of a job the operator stopped (no coded error, no result). */
export const stopped_frame = (progress) => ({
	pid: 4242,
	pfile: 'zz_acquisition_job.json',
	is_running: false,
	data: progress,
	errors: ['stopped'],
	total_time: 12,
});

const json_response = (body, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

const sse_response = (frames) =>
	new Response(
		new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				for (const frame of frames) {
					controller.enqueue(encoder.encode('data:\n' + JSON.stringify(frame) + '\n\n'));
				}
				controller.close();
			},
		}),
		{ status: 200, headers: { 'content-type': 'text/event-stream' } },
	);

const wait_until = async (predicate, what, timeout_ms = 8000) => {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeout_ms) {
			throw new Error('timed out waiting for: ' + what);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
};

/**
 * MOUNT_ACQUISITION_TOOL
 * @param {Function} tool_constructor - the tool's exported constructor
 * @param {string} model - its model name
 * @param {Object} server - the scripted server:
 *	dispatch	{Object<string, Object>} tool action → the dispatch envelope it answers
 *	frames		{Object<string, Array|Function>} tool action → the job's status frames,
 *				or (open_index) => frames|Error per opening of its status stream
 *	other		{Function} (body) => envelope|null|Promise — any other request (e.g. a search)
 * @returns {Promise<Object>} {content_data, sent, run_action, unmount}
 */
export const mount_acquisition_tool = async (tool_constructor, model, server) => {
	const sent = [];
	const status_opens = {};
	let last_tool_action = null;
	const original_fetch = window.fetch;

	window.fetch = async (url, init) => {
		let body = null;
		try {
			body = JSON.parse(init?.body);
		} catch (error) {
			body = null;
		}
		sent.push(body);
		if (body?.dd_api === 'dd_tools_api' && body?.action === 'tool_request') {
			const action = body.source?.action;
			last_tool_action = action;
			const envelope = server.dispatch[action];
			if (!envelope) {
				throw new Error('acquisition harness: no scripted dispatch for ' + action);
			}
			return json_response(envelope, envelope.ok === false ? 400 : 200);
		}
		if (body?.dd_api === 'dd_utils_api' && body?.action === 'get_process_status') {
			const scripted = server.frames[last_tool_action];
			// a function scripts each OPENING of the job's status stream (0, 1, …):
			// a reopened stream ("Check again") gets its own frames
			const open_index = status_opens[last_tool_action] ?? 0;
			status_opens[last_tool_action] = open_index + 1;
			const frames = typeof scripted === 'function' ? scripted(open_index) : scripted;
			if (!frames) {
				throw new Error('acquisition harness: no scripted frames for ' + last_tool_action);
			}
			// an Error scripts a stream that cannot be opened (the fetch rejects)
			if (frames instanceof Error) {
				throw frames;
			}
			return sse_response(frames);
		}
		// `other` may answer late (a Promise): a slow search racing a newer one
		const other = typeof server.other === 'function' ? await server.other(body) : null;
		if (other) {
			return json_response(other);
		}
		throw new Error('acquisition harness: unscripted request ' + JSON.stringify(body));
	};

	const instance = new tool_constructor();
	instance.id = model + '_test_' + Date.now();
	instance.model = model;
	instance.type = 'tool';
	instance.mode = 'edit';
	instance.tipo = model;
	instance.section_tipo = 'test3';
	instance.section_id = 1;
	instance.lang = 'lg-nolan';
	instance.context = { css: {} };
	instance.caller = { model: 'section', tipo: 'test3', section_tipo: 'test3', section_id: 1 };
	// every label falls back to the renderer's own English sentence
	instance.get_tool_label = () => null;

	const host = document.createElement('div');
	document.body.appendChild(host);
	const content_data = await instance.edit({ render_level: 'content' });
	host.appendChild(content_data);

	/**
	 * RUN_ACTION
	 * Clicks `button` and waits for the job it starts to SETTLE (the button's
	 * own 'loading' class is cleared by on_settle, which fires exactly once
	 * whatever the outcome).
	 */
	const run_action = async (button, what) => {
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await wait_until(() => !button.classList.contains('loading'), what + ' settled');
		// let any late consumer work (an on_success append) land
		await new Promise((resolve) => setTimeout(resolve, 50));
	};

	const unmount = () => {
		window.fetch = original_fetch;
		host.remove();
	};

	return { instance, content_data, sent, run_action, unmount, wait_until };
};

/** The tool_request bodies the client sent, by tool action. */
export const tool_requests = (sent, action) =>
	sent.filter(
		(body) =>
			body?.dd_api === 'dd_tools_api' &&
			body?.action === 'tool_request' &&
			body.source?.action === action,
	);

/** A frame of a job still running (what a stream cut mid-job last carried). */
export const running_frame = (progress) => ({
	pid: 4242,
	pfile: 'zz_acquisition_job.json',
	is_running: true,
	data: progress,
	errors: [],
	total_time: 3,
});

/** The text of a job panel's status line (render_stream's info_node msg_node). */
export const status_line = (container) =>
	container.querySelector('.process_status_node .info_node .msg_node')?.textContent ?? null;

// @license-end
