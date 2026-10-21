// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, afterEach */
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

/**
 * HANG — put LAST in a frames list to script a HALF-OPEN status stream: the
 * frames before it are sent, then the connection neither sends nor closes (a
 * proxy or a NAT that dropped the peer without a FIN).
 */
export const HANG = Symbol('hang');

const sse_response = (frames) =>
	new Response(
		new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				for (const frame of frames) {
					if (frame === HANG) {
						return; // never closed
					}
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
 *	dispatch	{Object<string, Object|Function>} tool action → the dispatch envelope it
 *				answers, or (dispatch_index) => envelope|Response per dispatch
 *	frames		{Object<string, Array|Function>} tool action → the job's status frames,
 *				or (open_index) => frames|Error per opening of its status stream
 *	other		{Function} (body) => envelope|null|Promise — any other request (e.g. a search)
 * @returns {Promise<Object>} {content_data, sent, run_action, unmount}
 */
export const mount_acquisition_tool = async (tool_constructor, model, server) => {
	const sent = [];
	const status_opens = {};
	const dispatch_counts = {};
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
			// a function scripts each DISPATCH of the action (0, 1, …) and may answer
			// a raw Response (an unreadable proxy page) instead of an envelope
			const scripted = server.dispatch[action];
			const dispatch_index = dispatch_counts[action] ?? 0;
			dispatch_counts[action] = dispatch_index + 1;
			const envelope = typeof scripted === 'function' ? scripted(dispatch_index) : scripted;
			if (!envelope) {
				throw new Error('acquisition harness: no scripted dispatch for ' + action);
			}
			if (envelope instanceof Response) {
				return envelope;
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

/** The get_activity answer (dd_utils_api — the job tray's read model) listing `jobs`. */
export const activity_envelope = (jobs) => ({ ok: true, request_id: 'zz-req', data: true, jobs });

/** One of the operator's activity rows (src/core/api/activity.ts ActivityRow). */
export const activity_row = (job_id, status) => ({
	source: 'media',
	job_id: job_id,
	label: job_id,
	record: null,
	status: status,
	progress: null,
	started_at: Date.now(),
	stream: 'job_events',
});

/** A get_process_status options body for a job id (the pfile is `<job id>.json`). */
const status_options_of = (sent) =>
	sent.filter((body) => body?.action === 'get_process_status').map((body) => body.options);

const click = (node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * DESCRIBE_JOB_STATE_HONESTY
 * The ONE job-state contract both acquisition tools share, run against each
 * (cross-client review r2, 2026-10). An action button that starts a background
 * job may be re-armed ONLY when that job's outcome is KNOWN:
 *  - a commit DISPATCH whose outcome is unknown (a transport failure — the
 *    request may have landed and the server runs it to completion — or the
 *    server's own idempotency.in_progress / outcome_unknown) keeps Confirm
 *    disabled. It used to re-arm it, and the operator's second click minted a
 *    NEW idempotency key: a second commit job beside the first;
 *  - "Check my jobs" reads the operator's own jobs (get_activity) and follows a
 *    started one to its end; with none of that kind it offers an EXPLICIT
 *    re-enable — nothing re-arms by itself, and a failed read changes nothing;
 *  - a server REFUSAL is a known outcome: stated, and the button re-arms;
 *  - while a job runs the button is DISABLED (the 'loading' class alone is
 *    pointer-events:none, so the keyboard still fired it) and the handler
 *    refuses a second activation;
 *  - a HALF-OPEN status stream (no frame, no close) is declared lost after the
 *    idle limit — the server sends a frame every update_rate — and "Check again"
 *    reopens the SAME job.
 *
 * @param {Object} spec
 *	tool_constructor	{Function}
 *	model				{string}
 *	commit_action		{string} the commit's tool action ('commit_lots', …)
 *	preview_frames		{Array} a successful preview's frames (a review with rows, no company to resolve)
 *	commit_success_frames {Array} a successful commit's frames (renders .success_message)
 *	renderer			{Object} the renderer MODULE (its set_status_idle_limit_for_test seam)
 */
export const describe_job_state_honesty = function (spec) {
	const { tool_constructor, model, commit_action } = spec;
	const dispatched = {
		ok: true,
		request_id: 'zz-req',
		pid: 4242,
		pfile: 'zz_acquisition_job.json',
		data: null,
	};
	const in_progress = {
		ok: false,
		request_id: 'zz-twin',
		error: {
			code: 'idempotency.in_progress',
			category: 'conflict',
			message: 'The same request is still running.',
			label_key: 'error_idempotency_in_progress',
			retryable: false,
		},
	};
	const unreadable = () =>
		new Response('<html><body>502 Bad Gateway</body></html>', {
			status: 200,
			headers: { 'content-type': 'text/html' },
		});
	const started_job_id = `${model}_${commit_action}_77_3`;

	describe('job state honesty (an action re-arms only on a KNOWN outcome)', function () {
		this.timeout(20000);

		let mounted = null;
		afterEach(function () {
			if (mounted) mounted.unmount();
			mounted = null;
		});
		const mount = async (server) => {
			if (mounted) mounted.unmount();
			mounted = await mount_acquisition_tool(tool_constructor, model, server);
			return mounted;
		};
		const preview_button_of = (m) => m.content_data.querySelector('.url_row button');
		const confirm_button_of = (m) =>
			m.content_data.querySelector('.review_container > button.primary');
		const commit_panel_of = (m) => m.content_data.querySelector('.commit_result_container');
		const preview = async (m) => {
			m.content_data.querySelector('.url_input').value = 'https://example.org/zz_catalogue';
			await m.run_action(preview_button_of(m), 'preview');
			assert.isNotNull(confirm_button_of(m), 'the review (and its Confirm) rendered');
		};

		it('a commit dispatch with an UNREADABLE answer leaves the outcome unknown: Confirm stays disabled, a second activation starts nothing', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched, [commit_action]: unreadable },
				frames: { preview_url: spec.preview_frames },
			});
			await preview(m);
			const confirm = confirm_button_of(m);
			click(confirm);
			const panel = commit_panel_of(m);
			await m.wait_until(() => panel.querySelector('.job_dispatch_unknown') !== null, 'the unknown-outcome line');
			await sleep(50);
			assert.isTrue(confirm.classList.contains('loading'), 'Confirm is not re-armed');
			assert.isTrue(confirm.disabled, 'Confirm is DISABLED, not only styled');
			assert.isNotNull(panel.querySelector('.button_check_jobs'), 'the way out: check my jobs');
			// the keyboard path: an activation that reaches the handler anyway
			confirm.disabled = false;
			click(confirm);
			await sleep(100);
			assert.strictEqual(tool_requests(m.sent, commit_action).length, 1, 'no second commit job');
		});

		it("idempotency.in_progress is unknown too; Check my jobs FOLLOWS the started job to its end (other kinds ignored), and only then Confirm re-arms", async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched, [commit_action]: in_progress },
				frames: { preview_url: spec.preview_frames, [commit_action]: spec.commit_success_frames },
				other: (body) =>
					body?.action === 'get_activity'
						? activity_envelope([
								activity_row(started_job_id, 'running'),
								activity_row(`${model}_preview_url_77_2`, 'done'),
								activity_row('tool_export_export_77_1', 'running'),
							])
						: null,
			});
			await preview(m);
			const confirm = confirm_button_of(m);
			click(confirm);
			const panel = commit_panel_of(m);
			await m.wait_until(() => panel.querySelector('.button_check_jobs') !== null, 'the check button');
			assert.isTrue(confirm.classList.contains('loading'));
			click(panel.querySelector('.button_check_jobs'));
			await m.wait_until(() => panel.querySelector('.button_follow_job') !== null, 'the started job listed');
			assert.strictEqual(panel.querySelectorAll('.job_candidate').length, 1, 'only this action\'s jobs');
			assert.include(panel.querySelector('.job_candidate').textContent, 'running');
			assert.isNull(panel.querySelector('.button_enable_again'), 'no re-enable while one of them runs');
			assert.isTrue(confirm.classList.contains('loading'), 'listing re-arms nothing');
			click(panel.querySelector('.button_follow_job'));
			await m.wait_until(() => !confirm.classList.contains('loading'), 'the followed job settled');
			const opens = status_options_of(m.sent);
			assert.deepEqual(opens.at(-1), { pid: started_job_id, pfile: `${started_job_id}.json` }, 'THAT job');
			assert.isFalse(confirm.disabled);
			assert.isNotNull(panel.querySelector('.success_message'), 'its outcome is rendered');
			assert.strictEqual(tool_requests(m.sent, commit_action).length, 1, 'no second commit job');
		});

		it('Check my jobs: a FAILED read changes nothing; none of this kind offers an EXPLICIT re-enable', async function () {
			let reads = 0;
			const m = await mount({
				dispatch: { preview_url: dispatched, [commit_action]: unreadable },
				frames: { preview_url: spec.preview_frames },
				other: (body) => {
					if (body?.action !== 'get_activity') return null;
					reads++;
					return reads === 1
						? { ok: false, request_id: 'zz-read', error: { code: 'internal.unexpected', category: 'internal', message: 'x', retryable: false } }
						: activity_envelope([activity_row(`${model}_preview_url_77_2`, 'running')]);
				},
			});
			await preview(m);
			const confirm = confirm_button_of(m);
			click(confirm);
			const panel = commit_panel_of(m);
			await m.wait_until(() => panel.querySelector('.button_check_jobs') !== null, 'the check button');
			click(panel.querySelector('.button_check_jobs'));
			await m.wait_until(() => panel.querySelector('.job_check_failed') !== null, 'the failed read, stated');
			assert.strictEqual(reads, 1);
			assert.isNotNull(panel.querySelector('.job_dispatch_unknown'), 'still unknown');
			assert.isNotNull(panel.querySelector('.button_check_jobs'), 'and still checkable');
			assert.isNull(panel.querySelector('.button_enable_again'), 'a failed read is not "none"');
			assert.isTrue(confirm.classList.contains('loading'));
			click(panel.querySelector('.button_check_jobs'));
			await m.wait_until(() => panel.querySelector('.button_enable_again') !== null, 'the explicit re-enable');
			assert.strictEqual(panel.querySelectorAll('.job_candidate').length, 0, 'another action\'s job is not this one');
			assert.isTrue(confirm.classList.contains('loading'), 'still nothing re-armed by itself');
			click(panel.querySelector('.button_enable_again'));
			await m.wait_until(() => !confirm.classList.contains('loading'), 're-enabled');
			assert.isFalse(confirm.disabled);
			assert.strictEqual(tool_requests(m.sent, commit_action).length, 1);
		});

		it('a server REFUSAL of the dispatch is a known outcome: stated, and Confirm re-arms', async function () {
			const m = await mount({
				dispatch: {
					preview_url: dispatched,
					[commit_action]: {
						ok: false,
						request_id: 'zz-refused',
						error: { code: 'request.invalid_options', category: 'caller', message: 'Too many.', label_key: 'error_request_invalid_options', retryable: false },
					},
				},
				frames: { preview_url: spec.preview_frames },
			});
			await preview(m);
			const confirm = confirm_button_of(m);
			await m.run_action(confirm, 'refused commit');
			const panel = commit_panel_of(m);
			assert.isNull(panel.querySelector('.job_dispatch_unknown'), 'a refusal is not unknown');
			assert.include(panel.querySelector('.error_message')?.textContent ?? '', 'Too many.');
			assert.isFalse(confirm.disabled);
		});

		it('while a job runs its button is DISABLED and a second activation starts nothing (Confirm and Preview)', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched, [commit_action]: dispatched },
				frames: {
					preview_url: spec.preview_frames,
					[commit_action]: [running_frame(running_payload(model, commit_action))],
				},
			});
			await preview(m);
			assert.isFalse(preview_button_of(m).disabled, 'a settled Preview is enabled');
			const confirm = confirm_button_of(m);
			click(confirm);
			const panel = commit_panel_of(m);
			await m.wait_until(() => panel.querySelector('.job_status_lost') !== null, 'the lost-status line');
			assert.isTrue(confirm.disabled, 'Confirm DISABLED while its job may run');
			confirm.disabled = false;
			click(confirm);
			await sleep(100);
			assert.strictEqual(tool_requests(m.sent, commit_action).length, 1, 'no second commit job');

			const p = await mount({
				dispatch: { preview_url: dispatched },
				frames: { preview_url: [running_frame(running_payload(model, 'preview_url'))] },
			});
			const preview_button = preview_button_of(p);
			p.content_data.querySelector('.url_input').value = 'https://example.org/zz_catalogue';
			click(preview_button);
			await p.wait_until(() => p.content_data.querySelector('.job_status_lost') !== null, 'the lost preview');
			assert.isTrue(preview_button.disabled, 'Preview DISABLED while its job may run');
			preview_button.disabled = false;
			click(preview_button);
			await sleep(100);
			assert.strictEqual(tool_requests(p.sent, 'preview_url').length, 1, 'no second preview job');
		});

		it('a HALF-OPEN status stream is declared lost after the idle limit; Check again reopens the SAME job', async function () {
			assert.isFunction(spec.renderer.set_status_idle_limit_for_test, 'the idle-limit seam');
			const restore = spec.renderer.set_status_idle_limit_for_test(300);
			try {
				const m = await mount({
					dispatch: { preview_url: dispatched, [commit_action]: dispatched },
					frames: {
						preview_url: spec.preview_frames,
						[commit_action]: (open_index) =>
							open_index === 0
								? [running_frame(running_payload(model, commit_action)), HANG]
								: spec.commit_success_frames,
					},
				});
				await preview(m);
				const opens_before = status_options_of(m.sent).length; // the preview's own
				const confirm = confirm_button_of(m);
				click(confirm);
				const panel = commit_panel_of(m);
				await m.wait_until(() => panel.querySelector('.job_status_lost') !== null, 'the idle stream declared lost', 5000);
				assert.isNotNull(panel.querySelector('.job_status_idle'), 'says WHY: no status for too long');
				assert.isTrue(confirm.classList.contains('loading'), 'Confirm stays disabled');
				click(panel.querySelector('.button_check_job'));
				await m.wait_until(() => !confirm.classList.contains('loading'), 'the reopened job settled');
				const opens = status_options_of(m.sent).slice(opens_before);
				assert.strictEqual(opens.length, 2, 'the commit job opened twice');
				for (const options of opens) {
					assert.deepEqual(options, { pid: 4242, pfile: 'zz_acquisition_job.json' }, 'the SAME job');
				}
				assert.isNotNull(panel.querySelector('.success_message'));
				assert.strictEqual(tool_requests(m.sent, commit_action).length, 1);
			} finally {
				restore();
			}
		});
	});
};

// @license-end
