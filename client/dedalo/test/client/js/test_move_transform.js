// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

/**
 * TEST_MOVE_TRANSFORM
 * The run flow of the five move_* maintenance widgets
 * (core/area_maintenance/js/move_transform.js): PREVIEW first, then EXECUTE
 * exactly the previewed selection.
 *
 * MEASURED BUG this file pins (OPS-6/PERF-11 review follow-up, 2026-10-01):
 * every move_* widget sent `{background_running, files_selected}` and NO
 * `dry_run`. The server mutates only on `dry_run` EXACTLY false (WC-025), so the
 * panel could only ever preview — and, the preview answering inline, its
 * `update_process_status(response.pid, response.pfile)` got two undefineds and
 * rendered nothing. No control anywhere reached the execute.
 *
 * WHAT IS ASSERTED. The request body carries `dry_run` explicitly; the final
 * frame that clears a preview (dry_run_cleared — a failed run ends with a coded
 * `error`, ERRORS_SPEC §5.3); and the flow: submit → preview job; Execute hidden
 * until the preview ends clean; Execute refuses a selection that changed since
 * the preview, honours a declined confirm, and runs the SNAPSHOT with
 * dry_run:false — once (a new execute needs a new preview).
 *
 * BACKEND-FREE: init_move_transform_form takes its effects (exec, track,
 * confirm, alert) as injected deps; the caller's init_form is a fake that hands
 * back its on_submit.
 */

import {
	dry_run_cleared,
	init_move_transform_form,
	move_transform_request_body,
} from '../../../core/area_maintenance/js/move_transform.js';
import { render_move_lang } from '../../../core/area_maintenance/widgets/move_lang/js/render_move_lang.js';
import { render_move_locator } from '../../../core/area_maintenance/widgets/move_locator/js/render_move_locator.js';
import { render_move_tld } from '../../../core/area_maintenance/widgets/move_tld/js/render_move_tld.js';
import { render_move_to_portal } from '../../../core/area_maintenance/widgets/move_to_portal/js/render_move_to_portal.js';
import { render_move_to_table } from '../../../core/area_maintenance/widgets/move_to_table/js/render_move_to_table.js';
import { ApiError, CLIENT_ERROR } from '../../../core/common/js/api_error.js';
import { update_process_status } from '../../../core/common/js/common.js';
import { data_manager } from '../../../core/common/js/data_manager.js';
import { event_manager } from '../../../core/common/js/event_manager.js';
import { error_text } from '../../../core/common/js/render_api_error.js';

// harness — a fake widget + recorded effects
const make_harness = (confirm_answer = true) => {
	const calls = { exec: [], track: [], confirm: [], alert: [] };
	let form = null;
	const self = {
		caller: {
			init_form: (widget_object) => {
				form = widget_object;
			},
		},
	};
	const files_selected = [];
	const content_data = document.createElement('div');
	const body_response = document.createElement('div');
	const deps = {
		exec: (model, files, dry_run) => {
			calls.exec.push({ model, files: [...files], dry_run });
			return Promise.resolve({
				ok: true,
				pid: 4242,
				pfile: `${model}_${calls.exec.length}.json`,
				dry_run,
			});
		},
		track: (id, pid, pfile, container, on_done) => {
			calls.track.push({ id, pid, pfile, container, on_done });
		},
		confirm: (text) => {
			calls.confirm.push(text);
			return confirm_answer;
		},
		alert: (text) => {
			calls.alert.push(text);
		},
	};
	const { execute_button } = init_move_transform_form(
		self,
		{
			model: 'move_tld',
			submit_label: 'Move TLD terms',
			files_selected: files_selected,
			content_data: content_data,
			body_response: body_response,
			local_db_id: 'process_move_tld',
		},
		deps,
	);

	return { calls, form: () => form, files_selected, execute_button, body_response };
};

const clean_preview_frame = {
	is_running: false,
	data: {
		ok: true,
		dry_run: true,
		msg: 'move_tld (no rollback for locator moves — dry run first)',
		errors: [],
		counts: {},
		sample: [],
	},
	errors: [],
};

describe('MOVE_TRANSFORM (move_* preview → execute)', () => {
	describe('move_transform_request_body', () => {
		it('sends dry_run EXPLICITLY: true for a preview, false for an execute', () => {
			const preview = move_transform_request_body('move_tld', ['a.json'], true);
			const execute = move_transform_request_body('move_tld', ['a.json'], false);
			assert.strictEqual(preview.options.dry_run, true);
			assert.strictEqual(execute.options.dry_run, false);
			assert.strictEqual(Object.hasOwn(preview.options, 'dry_run'), true);
			assert.deepEqual(execute.source, { type: 'widget', model: 'move_tld', action: 'move_tld' });
			assert.strictEqual(execute.dd_api, 'dd_area_maintenance_api');
			assert.strictEqual(execute.action, 'widget_request');
			assert.deepEqual(execute.options.files_selected, ['a.json']);
		});

		it('anything but false is a preview (the server rule, mirrored)', () => {
			assert.strictEqual(
				move_transform_request_body('move_tld', ['a'], undefined).options.dry_run,
				true,
			);
			assert.strictEqual(
				move_transform_request_body('move_tld', ['a'], 'false').options.dry_run,
				true,
			);
		});

		it('copies the selection (a later checkbox change cannot alter a sent body)', () => {
			const files = ['a.json'];
			const body = move_transform_request_body('move_tld', files, true);
			files.push('b.json');
			assert.deepEqual(body.options.files_selected, ['a.json']);
		});
	});

	describe('dry_run_cleared', () => {
		it('a preview that ended clean clears', () => {
			assert.strictEqual(dry_run_cleared(clean_preview_frame), true);
		});

		it('a failed run (coded error), a not-ok report, a still-running frame, an execute frame and no frame do not', () => {
			assert.strictEqual(
				dry_run_cleared({ ...clean_preview_frame, error: { code: 'maintenance.action_failed' } }),
				false,
			);
			assert.strictEqual(
				dry_run_cleared({
					...clean_preview_frame,
					data: { ...clean_preview_frame.data, ok: false },
				}),
				false,
			);
			assert.strictEqual(dry_run_cleared({ ...clean_preview_frame, is_running: true }), false);
			assert.strictEqual(
				dry_run_cleared({
					...clean_preview_frame,
					data: { ...clean_preview_frame.data, dry_run: false },
				}),
				false,
			);
			assert.strictEqual(
				dry_run_cleared({
					...clean_preview_frame,
					data: { ...clean_preview_frame.data, result: true, ok: undefined },
				}),
				false,
			);
			assert.strictEqual(dry_run_cleared(null), false);
		});
	});

	describe('update_process_status (the real tracker the flow uses)', () => {
		it('hands its on_done callback the LAST frame the stream carried', async () => {
			const frames = [
				{ is_running: true, data: { msg: 'running...' }, errors: [] },
				clean_preview_frame,
			];
			const sse = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();
					for (const frame of frames) {
						controller.enqueue(encoder.encode('data:\n' + JSON.stringify(frame) + '\n\n'));
					}
					controller.close();
				},
			});
			const original = window.fetch;
			window.fetch = async () =>
				new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
			try {
				const container = document.createElement('div');
				const last = await new Promise((resolve, reject) => {
					const timer = setTimeout(() => reject(new Error('on_done never fired')), 5000);
					update_process_status(
						'zz_test_move_transform',
						4242,
						'zz_test_move_transform.json',
						container,
						1000,
						(frame) => {
							clearTimeout(timer);
							resolve(frame);
						},
					);
				});
				assert.deepEqual(last, clean_preview_frame);
				assert.isTrue(dry_run_cleared(last));
			} finally {
				window.fetch = original;
			}
		});
	});

	describe('init_move_transform_form', () => {
		it('the submit is a PREVIEW of the checked files; nothing is sent with none checked', async () => {
			const h = make_harness();
			assert.isFunction(h.form()?.on_submit);
			assert.include(h.form().submit_label, 'dry run');
			await h.form().on_submit();
			assert.strictEqual(h.calls.exec.length, 0);
			assert.strictEqual(h.calls.alert.length, 1);
			h.files_selected.push('a.json');
			await h.form().on_submit();
			assert.deepEqual(h.calls.exec, [{ model: 'move_tld', files: ['a.json'], dry_run: true }]);
			// the job is streamed with the server's handle, into body_response
			assert.strictEqual(h.calls.track.length, 1);
			assert.strictEqual(h.calls.track[0].pid, 4242);
			assert.strictEqual(h.calls.track[0].pfile, 'move_tld_1.json');
			assert.strictEqual(h.calls.track[0].container, h.body_response);
		});

		it('Execute is hidden until the preview ends CLEAN; a failed preview never reveals it', async () => {
			const h = make_harness();
			assert.isTrue(h.execute_button.classList.contains('hide'));
			h.files_selected.push('a.json');
			await h.form().on_submit();
			h.calls.track[0].on_done({
				...clean_preview_frame,
				error: { code: 'maintenance.action_failed' },
			});
			assert.isTrue(h.execute_button.classList.contains('hide'));
			await h.form().on_submit();
			h.calls.track[1].on_done(clean_preview_frame);
			assert.isFalse(h.execute_button.classList.contains('hide'));
		});

		it('Execute runs the PREVIEWED snapshot with dry_run:false after a confirm — once', async () => {
			const h = make_harness(true);
			h.files_selected.push('b.json', 'a.json');
			await h.form().on_submit();
			h.calls.track[0].on_done(clean_preview_frame);
			h.execute_button.click();
			await Promise.resolve();
			assert.strictEqual(h.calls.confirm.length, 1);
			assert.deepEqual(h.calls.exec[1], {
				model: 'move_tld',
				files: ['b.json', 'a.json'],
				dry_run: false,
			});
			// a new execute needs a new preview
			assert.isTrue(h.execute_button.classList.contains('hide'));
			h.execute_button.click();
			await Promise.resolve();
			assert.strictEqual(h.calls.exec.length, 2);
		});

		it('Execute REFUSES a selection changed since the preview, and honours a declined confirm', async () => {
			const h = make_harness(false);
			h.files_selected.push('a.json');
			await h.form().on_submit();
			h.calls.track[0].on_done(clean_preview_frame);
			h.files_selected.push('b.json');
			h.execute_button.click();
			await Promise.resolve();
			assert.strictEqual(h.calls.exec.length, 1);
			assert.strictEqual(h.calls.confirm.length, 0);
			assert.strictEqual(h.calls.alert.length, 1);
			// back to the previewed set (order-insensitive): asks, the operator declines
			h.files_selected.splice(1, 1);
			h.execute_button.click();
			await Promise.resolve();
			assert.strictEqual(h.calls.confirm.length, 1);
			assert.strictEqual(h.calls.exec.length, 1);
		});

		it('a new preview hides a previously revealed Execute until it clears', async () => {
			const h = make_harness();
			h.files_selected.push('a.json');
			await h.form().on_submit();
			h.calls.track[0].on_done(clean_preview_frame);
			assert.isFalse(h.execute_button.classList.contains('hide'));
			await h.form().on_submit();
			assert.isTrue(h.execute_button.classList.contains('hide'));
		});

		it('a SUPERSEDED preview cannot reveal Execute: only the latest preview decides', async () => {
			// two previews of the same files in flight; the NEWER one fails first,
			// then the OLDER one ends clean — the operator's latest preview failed,
			// so nothing may be executed on the strength of the stale one
			const h = make_harness();
			h.files_selected.push('a.json');
			await h.form().on_submit();
			await h.form().on_submit();
			assert.strictEqual(h.calls.track.length, 2, 'two previews streaming');
			h.calls.track[1].on_done({
				...clean_preview_frame,
				error: { code: 'maintenance.action_failed' },
			});
			h.calls.track[0].on_done(clean_preview_frame);
			assert.isTrue(
				h.execute_button.classList.contains('hide'),
				'the stale clean preview is ignored',
			);
			h.execute_button.click();
			await Promise.resolve();
			assert.strictEqual(h.calls.exec.length, 2, 'no execute was sent');
			// positive control: the LATEST preview ending clean still reveals it
			await h.form().on_submit();
			h.calls.track[2].on_done(clean_preview_frame);
			assert.isFalse(h.execute_button.classList.contains('hide'));
		});
	});

	// A REFUSED DISPATCH IS STATED IN THE PANEL. The run request itself can be
	// refused (a bad option, a lost session, a missing permission) before any job
	// exists. The flow used to hand that to handle_api_error, whose policy for
	// most codes is a TOAST — and the maintenance area shows no toast surface, so
	// the operator saw nothing (the same hole render_update_ontology.js
	// build_failure documents). The REAL transport runs here (window.fetch
	// scripted): it publishes the ApiError page-wide once (the page's relogin /
	// policy channel), and the panel itself must say what was refused.
	describe('a refused dispatch', () => {
		const refused_harness = () => {
			const calls = { track: [], confirm: [], alert: [] };
			let form = null;
			const files_selected = ['a.json'];
			const content_data = document.createElement('div');
			const body_response = document.createElement('div');
			const { execute_button } = init_move_transform_form(
				{
					caller: {
						init_form: (widget_object) => {
							form = widget_object;
						},
					},
				},
				{
					model: 'move_tld',
					submit_label: 'Move TLD terms',
					files_selected,
					content_data,
					body_response,
					local_db_id: 'process_move_tld',
				},
				{
					// exec: the REAL one (exec_move_transform → data_manager.request)
					track: (...args) => calls.track.push(args),
					confirm: (text) => {
						calls.confirm.push(text);
						return true;
					},
					alert: (text) => calls.alert.push(text),
				},
			);
			return { calls, form: () => form, body_response, execute_button };
		};

		const run_refused = async (error_body, status) => {
			const published = [];
			const token = event_manager.subscribe('api_error', (api_error) => published.push(api_error));
			const original_fetch = window.fetch;
			window.fetch = async () =>
				new Response(JSON.stringify({ ok: false, request_id: 'zz-refused', error: error_body }), {
					status,
					headers: { 'content-type': 'application/json' },
				});
			try {
				const h = refused_harness();
				await h.form().on_submit();
				return { h, published };
			} finally {
				window.fetch = original_fetch;
				event_manager.unsubscribe(token);
			}
		};

		it('renders the label-first refusal in body_response; no job, no generic alert, no Execute', async () => {
			const refused = {
				code: 'request.invalid_options',
				category: 'caller',
				message: 'files_selected names a file outside the move directory.',
				label_key: 'error_request_invalid_options',
				retryable: false,
			};
			const { h, published } = await run_refused(refused, 400);
			assert.strictEqual(h.calls.track.length, 0, 'no job is tracked');
			assert.strictEqual(h.calls.alert.length, 0, "not the generic 'did not start the job' alert");
			assert.isTrue(h.execute_button.classList.contains('hide'), 'Execute stays hidden');
			const text = h.body_response.textContent;
			assert.include(text, error_text(refused), 'the refusal, label-first, IN the panel');
			assert.include(text, refused.message, "and the server's own sentence");
			assert.include(text, 'zz-refused', 'and the request_id');
			assert.isNull(h.body_response.querySelector('img'), 'text only');
			assert.strictEqual(published.length, 1, 'the transport published it page-wide once');
			assert.strictEqual(published[0].code, 'request.invalid_options');
		});

		it('an auth.* refusal is stated in the panel and reaches the page channel (relogin)', async () => {
			const lost = {
				code: 'auth.not_logged',
				category: 'auth',
				message: 'Authentication required',
				label_key: 'error_auth_not_logged',
				retryable: false,
			};
			const { h, published } = await run_refused(lost, 401);
			assert.strictEqual(h.calls.track.length, 0);
			assert.strictEqual(h.calls.alert.length, 0);
			assert.include(h.body_response.textContent, error_text(lost));
			assert.strictEqual(published.length, 1, 'the page relogin channel got it once');
			assert.strictEqual(published[0].code, 'auth.not_logged');
		});
	});

	// AN UNKNOWN OUTCOME IS NOT A REFUSAL (cross-client review r2, 2026-10). The
	// execute door runs with retries:1 and a 60 s deadline; a deadline that fires,
	// or a connection that drops, after the request reached the server leaves a
	// job that may be RUNNING — the engine runs an aborted request to completion.
	// The panel used to render that as a refusal, inviting a re-preview and a
	// second execute of a transform that cannot be undone.
	describe('an execute whose outcome is UNKNOWN', () => {
		const unknown_harness = (execute_answer) => {
			const calls = { exec: [], track: [], alert: [] };
			let form = null;
			const files_selected = ['a.json'];
			const content_data = document.createElement('div');
			const body_response = document.createElement('div');
			const { execute_button } = init_move_transform_form(
				{
					caller: {
						init_form: (widget_object) => {
							form = widget_object;
						},
					},
				},
				{
					model: 'move_tld',
					submit_label: 'Move TLD terms',
					files_selected,
					content_data,
					body_response,
					local_db_id: 'process_move_tld',
				},
				{
					exec: (model, files, dry_run) => {
						calls.exec.push({ model, files: [...files], dry_run });
						return Promise.resolve(
							dry_run
								? { ok: true, pid: 4242, pfile: 'zz_move_tld_preview.json', dry_run }
								: execute_answer,
						);
					},
					track: (...args) => calls.track.push(args),
					confirm: () => true,
					alert: (text) => calls.alert.push(text),
				},
			);
			return { calls, form: () => form, body_response, execute_button };
		};
		const execute = async (h) => {
			await h.form().on_submit();
			h.calls.track[0][4](clean_preview_frame);
			h.execute_button.click();
			await new Promise((resolve) => setTimeout(resolve, 0));
		};

		it('a TIMED-OUT execute says the job may be running — not refused', async () => {
			const timeout = new ApiError({
				code: CLIENT_ERROR.TIMEOUT,
				source: 'transport',
				details: { timeout_ms: 60000 },
			});
			const h = unknown_harness({ ok: false, error: timeout });
			await execute(h);
			assert.strictEqual(h.calls.exec.length, 2, 'the preview, then the execute');
			assert.isNull(
				h.body_response.querySelector('.move_transform_refused'),
				'NOT framed as a refusal',
			);
			const unknown = h.body_response.querySelector('.move_transform_outcome_unknown');
			assert.isNotNull(unknown, 'stated as an unknown outcome');
			assert.include(unknown.textContent, 'may', 'the job may be running');
			assert.include(unknown.textContent, error_text(timeout), 'and the cause, label-first');
			assert.strictEqual(h.calls.track.length, 1, 'no job is tracked (there is no pid)');
			assert.isTrue(h.execute_button.classList.contains('hide'), 'Execute stays hidden');
		});

		it("the server's idempotency.outcome_unknown is unknown too; a real refusal stays a refusal", async () => {
			const twin = new ApiError({
				code: 'idempotency.outcome_unknown',
				source: 'envelope',
				transport: false,
				request_id: 'zz-twin',
			});
			const h = unknown_harness({ ok: false, error: twin });
			await execute(h);
			assert.isNotNull(h.body_response.querySelector('.move_transform_outcome_unknown'));
			assert.include(
				h.body_response.textContent,
				'zz-twin',
				'the request_id, the join key with the log',
			);

			const refused = new ApiError({
				code: 'request.invalid_options',
				source: 'envelope',
				transport: false,
			});
			const r = unknown_harness({ ok: false, error: refused });
			await execute(r);
			assert.isNotNull(r.body_response.querySelector('.move_transform_refused'));
			assert.isNull(r.body_response.querySelector('.move_transform_outcome_unknown'));
		});
	});

	// AN EXECUTE OWNS ITS PANEL UNTIL IT ENDS (cross-client review r7, 2026-10).
	// The form does not lock while a job streams, and both runs used ONE panel
	// and ONE IndexedDB re-attach key. A Preview submitted while an execute job
	// was still running emptied the panel (the execute's live status went on
	// updating detached nodes), overwrote the execute's {pid, pfile} and, at its
	// own end, deleted it: the outcome of an irreversible transform — rolled
	// back, PARTIAL, UNKNOWN — never reached the operator, nor a reload.
	describe('an EXECUTE in flight', () => {
		const wait_until = async (predicate, what, ms = 5000) => {
			const started = Date.now();
			while (!(await predicate())) {
				if (Date.now() - started > ms) throw new Error(`timed out: ${what}`);
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		};

		it('a Preview is REFUSED while the execute streams: its panel and its re-attach entry stay its own (real tracker)', async function () {
			this.timeout(15000);
			const local_db_id = 'zz_process_move_transform_exclusive';
			const execute_db_id = `${local_db_id}_execute`;
			await data_manager.delete_local_db_data(local_db_id, 'status');
			await data_manager.delete_local_db_data(execute_db_id, 'status');
			const exec_calls = [];
			const alerts = [];
			let form = null;
			let execute_stream = null; // the execute job's open SSE controller
			const encoder = new TextEncoder();
			const frame_bytes = (frame) => encoder.encode('data:\n' + JSON.stringify(frame) + '\n\n');
			const files_selected = ['a.json'];
			const content_data = document.createElement('div');
			const body_response = document.createElement('div');
			const original_fetch = window.fetch;
			window.fetch = async (url, init) => {
				const body = JSON.parse(init.body);
				if (body.action !== 'get_process_status') {
					throw new Error('unscripted request ' + JSON.stringify(body));
				}
				const pfile = body.options.pfile;
				return new Response(
					new ReadableStream({
						start(controller) {
							if (pfile.startsWith('zz_execute')) {
								// the execute job: running, its stream left OPEN
								controller.enqueue(
									frame_bytes({ is_running: true, data: { msg: 'moving...' }, errors: [] }),
								);
								execute_stream = controller;
								return;
							}
							controller.enqueue(frame_bytes(clean_preview_frame));
							controller.close();
						},
					}),
					{ status: 200, headers: { 'content-type': 'text/event-stream' } },
				);
			};
			try {
				const { execute_button } = init_move_transform_form(
					{
						caller: {
							init_form: (widget_object) => {
								form = widget_object;
							},
						},
					},
					{
						model: 'move_tld',
						submit_label: 'Move TLD terms',
						files_selected,
						content_data,
						body_response,
						local_db_id,
					},
					{
						// exec scripted; track is the REAL update_process_status
						exec: (model, files, dry_run) => {
							exec_calls.push({ files: [...files], dry_run });
							const pfile = `${dry_run ? 'zz_preview' : 'zz_execute'}_${exec_calls.length}.json`;
							return Promise.resolve({ ok: true, pid: 4242, pfile, dry_run });
						},
						confirm: () => true,
						alert: (text) => alerts.push(text),
					},
				);
				// 1) a clean preview reveals Execute
				await form.on_submit();
				await wait_until(
					() => !execute_button.classList.contains('hide'),
					'the clean preview reveals Execute',
				);
				// 2) the execute starts and streams; it renders its panel
				execute_button.click();
				await wait_until(
					() => execute_stream !== null && body_response.firstElementChild !== null,
					'the execute panel',
				);
				await wait_until(
					async () =>
						(await data_manager.get_local_db_data(execute_db_id, 'status'))?.value?.pfile ===
						'zz_execute_2.json',
					"the execute's re-attach entry under its OWN key",
				);
				const execute_panel = body_response.firstElementChild;
				// 3) a Preview while the execute runs: refused, nothing sent
				await form.on_submit();
				await new Promise((resolve) => setTimeout(resolve, 200));
				assert.strictEqual(exec_calls.length, 2, 'no preview was dispatched');
				assert.strictEqual(alerts.length, 1, 'the operator is told why');
				assert.isTrue(
					body_response.contains(execute_panel),
					"the execute's live panel is still the one shown",
				);
				assert.strictEqual(
					(await data_manager.get_local_db_data(execute_db_id, 'status'))?.value?.pfile,
					'zz_execute_2.json',
					"the execute's re-attach entry is intact",
				);
				// 4) the execute ends: its final frame lands in ITS panel, and the form is free again
				execute_stream.enqueue(
					frame_bytes({
						is_running: false,
						data: { ok: true, dry_run: false, msg: 'zz moved' },
						errors: [],
					}),
				);
				execute_stream.close();
				await wait_until(
					() => body_response.textContent.includes('zz moved'),
					"the execute's outcome is shown",
				);
				await wait_until(
					async () => !(await data_manager.get_local_db_data(execute_db_id, 'status')),
					'the ended execute leaves no re-attach entry',
				);
				await form.on_submit();
				assert.strictEqual(
					exec_calls.length,
					3,
					'positive control: after the execute ended, a preview runs',
				);
				assert.strictEqual(exec_calls[2].dry_run, true);
			} finally {
				window.fetch = original_fetch;
				try {
					execute_stream?.close();
				} catch {
					/* already closed */
				}
				await data_manager.delete_local_db_data(local_db_id, 'status');
				await data_manager.delete_local_db_data(execute_db_id, 'status');
			}
		});

		const reattach_harness = (stored) => {
			const calls = { exec: [], track: [], alert: [], read: [] };
			let form = null;
			init_move_transform_form(
				{
					caller: {
						init_form: (widget_object) => {
							form = widget_object;
						},
					},
				},
				{
					model: 'move_tld',
					submit_label: 'Move TLD terms',
					files_selected: ['a.json'],
					content_data: document.createElement('div'),
					body_response: document.createElement('div'),
					local_db_id: 'process_move_tld',
				},
				{
					exec: (model, files, dry_run) => {
						calls.exec.push({ files: [...files], dry_run });
						return Promise.resolve({
							ok: true,
							pid: 4242,
							pfile: `zz_${calls.exec.length}.json`,
							dry_run,
						});
					},
					track: (id, pid, pfile, container, on_done) =>
						calls.track.push({ id, pid, pfile, on_done }),
					read_local: (id) => {
						calls.read.push(id);
						return Promise.resolve(stored[id] ?? null);
					},
					confirm: () => true,
					alert: (text) => calls.alert.push(text),
				},
			);
			return { calls, form: () => form };
		};

		it('after a RELOAD, a stored execute is re-attached and holds the form until it ends', async () => {
			const h = reattach_harness({
				process_move_tld_execute: {
					id: 'process_move_tld_execute',
					value: { pid: 77, pfile: 'zz_execute_running.json' },
				},
			});
			await h.form().on_submit();
			assert.deepEqual(
				h.calls.track.map((t) => [t.id, t.pfile]),
				[['process_move_tld_execute', 'zz_execute_running.json']],
				're-attached under its own key; no preview dispatched while it runs',
			);
			assert.strictEqual(h.calls.exec.length, 0);
			assert.strictEqual(h.calls.alert.length, 1);
			h.calls.track[0].on_done({ is_running: false, data: { ok: true }, errors: [] });
			await h.form().on_submit();
			assert.strictEqual(h.calls.exec.length, 1, 'free again once the re-attached execute ended');
			assert.strictEqual(
				h.calls.track[1].id,
				'process_move_tld',
				'a preview tracks under the preview key',
			);
		});

		it('a stored PREVIEW is re-attached as before and does not hold the form', async () => {
			const h = reattach_harness({
				process_move_tld: {
					id: 'process_move_tld',
					value: { pid: 78, pfile: 'zz_preview_running.json' },
				},
			});
			await h.form().on_submit();
			assert.deepEqual(
				h.calls.track.map((t) => [t.id, t.pfile]),
				[
					['process_move_tld', 'zz_preview_running.json'],
					['process_move_tld', 'zz_1.json'],
				],
			);
			assert.strictEqual(h.calls.alert.length, 0);
		});

		it('an execute whose outcome is UNKNOWN keeps the form held (its warning stays); a refused execute frees it', async () => {
			const timeout = new ApiError({
				code: CLIENT_ERROR.TIMEOUT,
				source: 'transport',
				details: { timeout_ms: 60000 },
			});
			const files_selected = ['a.json'];
			const body_response = document.createElement('div');
			const calls = { exec: [], alert: [] };
			let form = null;
			const make = (execute_answer) => {
				calls.exec.length = 0;
				calls.alert.length = 0;
				body_response.replaceChildren();
				return init_move_transform_form(
					{
						caller: {
							init_form: (widget_object) => {
								form = widget_object;
							},
						},
					},
					{
						model: 'move_tld',
						submit_label: 'Move TLD terms',
						files_selected,
						content_data: document.createElement('div'),
						body_response,
						local_db_id: 'process_move_tld',
					},
					{
						exec: (model, files, dry_run) => {
							calls.exec.push({ dry_run });
							return Promise.resolve(
								dry_run ? { ok: true, pid: 4242, pfile: 'zz_p.json', dry_run } : execute_answer,
							);
						},
						track: (id, pid, pfile, container, on_done) => on_done(clean_preview_frame),
						read_local: () => Promise.resolve(null),
						confirm: () => true,
						alert: (text) => calls.alert.push(text),
					},
				).execute_button;
			};
			// unknown: the job may be running
			let execute_button = make({ ok: false, error: timeout });
			await form.on_submit();
			execute_button.click();
			await new Promise((resolve) => setTimeout(resolve, 0));
			assert.isNotNull(body_response.querySelector('.move_transform_outcome_unknown'));
			await form.on_submit();
			assert.strictEqual(calls.exec.length, 2, 'no preview over an unconfirmed execute');
			assert.strictEqual(calls.alert.length, 1);
			assert.isNotNull(
				body_response.querySelector('.move_transform_outcome_unknown'),
				'the warning stays',
			);
			// refused: no job exists, the form is free
			const refused = new ApiError({
				code: 'request.invalid_options',
				source: 'envelope',
				transport: false,
			});
			execute_button = make({ ok: false, error: refused });
			await form.on_submit();
			execute_button.click();
			await new Promise((resolve) => setTimeout(resolve, 0));
			assert.isNotNull(body_response.querySelector('.move_transform_refused'));
			await form.on_submit();
			assert.strictEqual(calls.exec.length, 3, 'a refused execute does not hold the form');
		});
	});

	// THE FIVE WIDGETS ARE WIRED TO THE ONE FLOW. The flow above is gated on a
	// harness; this proves each real move_* renderer hands init_move_transform_form
	// ITS OWN model: rendered for real with a fake caller.init_form, a real
	// checkbox change, the real transport (window.fetch scripted), the real job
	// stream. A widget that kept a private submit path, or passed another
	// widget's model, sends the wrong body here.
	describe('the five move_* widgets', () => {
		const widgets = [
			['move_lang', render_move_lang],
			['move_locator', render_move_locator],
			['move_tld', render_move_tld],
			['move_to_portal', render_move_to_portal],
			['move_to_table', render_move_to_table],
		];

		for (const [model, renderer] of widgets) {
			it(`${model}: the submit is a dry-run PREVIEW of ITS model, and a clean end reveals Execute`, async function () {
				this.timeout(10000);
				const file_name = `zz_${model}_test.json`;
				let form = null;
				const self = {
					model: model,
					value: { body: '', files: [{ file_name, content: { zz: true } }] },
					caller: {
						init_form: (widget_object) => {
							form = widget_object;
						},
					},
				};
				const sent = [];
				const original_fetch = window.fetch;
				window.fetch = async (url, init) => {
					const body = JSON.parse(init.body);
					sent.push(body);
					if (body.action === 'widget_request') {
						return new Response(
							JSON.stringify({
								ok: true,
								request_id: 'zz',
								pid: 4242,
								pfile: `${model}_zz.json`,
								dry_run: true,
							}),
							{ status: 200, headers: { 'content-type': 'application/json' } },
						);
					}
					if (body.action === 'get_process_status') {
						const encoder = new TextEncoder();
						return new Response(
							new ReadableStream({
								start(controller) {
									controller.enqueue(
										encoder.encode('data:\n' + JSON.stringify(clean_preview_frame) + '\n\n'),
									);
									controller.close();
								},
							}),
							{ status: 200, headers: { 'content-type': 'text/event-stream' } },
						);
					}
					throw new Error('unscripted request ' + JSON.stringify(body));
				};
				try {
					const content_data = await renderer.prototype.list.call(self, {
						render_level: 'content',
					});
					assert.isFunction(form?.on_submit, 'the widget hands its form to the shared flow');
					assert.include(form.submit_label, 'dry run');
					const checkbox = content_data.querySelector('input[type="checkbox"]');
					checkbox.checked = true;
					checkbox.dispatchEvent(new Event('change'));
					await form.on_submit();
					const runs = sent.filter((body) => body.action === 'widget_request');
					assert.strictEqual(runs.length, 1, 'one run');
					assert.deepEqual(runs[0].source, { type: 'widget', model, action: model }, 'ITS model');
					assert.strictEqual(runs[0].options.dry_run, true, 'a preview');
					assert.deepEqual(runs[0].options.files_selected, [file_name]);
					const execute_button = content_data.querySelector('.button_execute_move');
					assert.isNotNull(execute_button, 'the Execute control is mounted');
					const started = Date.now();
					while (execute_button.classList.contains('hide')) {
						if (Date.now() - started > 5000)
							throw new Error('the clean preview never revealed Execute');
						await new Promise((resolve) => setTimeout(resolve, 20));
					}
				} finally {
					window.fetch = original_fetch;
					await data_manager.delete_local_db_data(`process_${model}`, 'status');
				}
			});
		}
	});
});

// @license-end
