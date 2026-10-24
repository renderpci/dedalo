// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, beforeEach, afterEach */
/*eslint no-undef: "error"*/

/**
 * TEST_TOOL_BIBLIOGRAPHY_ACQUISITION
 * The OAI-PMH journal acquisition tool's client, driven for real: the real
 * constructor and renderer on a fake caller, the real transport, a scripted
 * server (acquisition_harness.js).
 *
 * MEASURED BUG this file pins (cross-client review, 2026-10): the tool read a
 * background job's outcome from `frame.data` only. A failed job ends with its
 * coded error ON THE FRAME (`{is_running:false, error:{…}, data:<last progress
 * payload>}` — ERRORS_SPEC §5.3), so an unsupported URL or a refused commit
 * printed "Done." and then called on_success(undefined), which threw inside the
 * stream reader: the registered public sentence ('Only OAI-PMH journal/
 * repository URLs are supported right now.') never reached the operator, and a
 * failed commit_publications looked like a success.
 *
 * WHAT IS ASSERTED.
 *  - the module/constructor/prototype template;
 *  - the WIRE: preview_url and commit_publications are background tool_requests
 *    with the exact options body, and the job is streamed by its pid/pfile;
 *  - a failed preview / commit renders the coded error (label + the server's
 *    sentence), never "Done.", never the review or the summary;
 *  - an auth.* failure on the frame reaches the relogin overlay;
 *  - a stopped job (no error, no result) is not reported as done;
 *  - a dispatch refusal renders label-first text;
 *  - the success path still renders, and scraped text renders as TEXT;
 *  - a status stream that ends BEFORE the job's terminal frame (a dropped
 *    connection, a stream that could not open) is not silent: the panel says
 *    the job may still be running, the action button STAYS disabled (a second
 *    click would start a second job beside the first) and "Check again" reopens
 *    the SAME job's status.
 */

import {
	reset_error_dispatch_state,
	set_relogin_renderer_for_test,
} from '../../../core/common/js/error_dispatch.js';
import { error_text } from '../../../core/common/js/render_api_error.js';
import * as renderer_module from '../../../tools/tool_bibliography_acquisition/js/render_tool_bibliography_acquisition.js';
import { tool_bibliography_acquisition } from '../../../tools/tool_bibliography_acquisition/js/tool_bibliography_acquisition.js';
import {
	describe_job_state_honesty,
	failed_frame,
	mount_acquisition_tool,
	running_frame,
	running_payload,
	status_line,
	stopped_frame,
	success_frame,
	tool_requests,
} from './acquisition_harness.js';

const MODEL = 'tool_bibliography_acquisition';
const URL_OK = 'https://journal.example.org/index.php/j/oai';
const HOSTILE = '<img src=x onerror="window.__acq_bib=1">Title';

const PUBLIC_SENTENCE = 'Only OAI-PMH journal/repository URLs are supported right now.';
const invalid_url_error = {
	code: 'request.invalid_options',
	category: 'caller',
	message: PUBLIC_SENTENCE,
	label_key: 'error_request_invalid_options',
	retryable: false,
};

const dispatched = {
	ok: true,
	request_id: 'zz-req',
	pid: 4242,
	pfile: 'zz_acquisition_job.json',
	data: null,
};

const preview_envelope = {
	ok: true,
	request_id: 'zz-req',
	data: {
		series: { name: 'Series <b>bold</b>' },
		series_status: { exists: false },
		publications: [
			{ identifier: 'oai:j:1', title: HOSTILE, authors: ['Ana'], publicationDate: '2001' },
			{ identifier: 'oai:j:2', title: 'Second', authors: ['Bea'], publicationDate: '2005' },
		],
		article_failures: [],
		publications_truncated_by: 0,
	},
};

const commit_envelope = {
	ok: true,
	request_id: 'zz-req',
	data: {
		results: [
			{
				publication_identifier: 'oai:j:1',
				section_tipo: 'test3',
				section_id: 77,
				skipped: false,
				fields_written: ['title'],
				abstract_skipped: [],
				series_section_id: null,
				series_created: false,
				series_error: null,
				author_section_ids: [],
				author_errors: [],
				document_imported: false,
				document_error: null,
			},
		],
		stopped: false,
		publications_total: 1,
	},
};

const preview_button_of = (content_data) => content_data.querySelector('.url_row button');
const url_input_of = (content_data) => content_data.querySelector('.url_input');
const result_of = (content_data) => content_data.querySelector('.result_container');

describe('TOOL_BIBLIOGRAPHY_ACQUISITION CLIENT TEST', function () {
	this.timeout(20000);

	let mounted = null;
	let restore_renderer = null;
	let relogin_opened = 0;

	beforeEach(() => {
		window.__acq_bib = undefined;
		relogin_opened = 0;
		restore_renderer = set_relogin_renderer_for_test(() => {
			relogin_opened++;
			throw new Error('test: no relogin overlay');
		});
	});

	afterEach(() => {
		if (mounted) mounted.unmount();
		mounted = null;
		if (restore_renderer) restore_renderer();
		reset_error_dispatch_state();
		window.__acq_bib = undefined;
	});

	const mount = async (server) => {
		mounted = await mount_acquisition_tool(tool_bibliography_acquisition, MODEL, server);
		return mounted;
	};

	const preview = async (m) => {
		url_input_of(m.content_data).value = URL_OK;
		await m.run_action(preview_button_of(m.content_data), 'preview');
	};

	describe('template', () => {
		it('module exports the constructor; construct seeds the instance; prototype is wired', () => {
			assert.equal(typeof tool_bibliography_acquisition, 'function');
			const instance = new tool_bibliography_acquisition();
			assert.strictEqual(instance.caller, null);
			assert.strictEqual(instance.langs, null);
			for (const name of [
				'init',
				'build',
				'render',
				'edit',
				'destroy',
				'tool_request',
				'preview_url',
				'preview_html',
				'commit_publications',
			]) {
				assert.equal(
					typeof tool_bibliography_acquisition.prototype[name],
					'function',
					name + ' wired',
				);
			}
		});
	});

	describe('preview_url (background job)', () => {
		it('sends a background preview_url with the url and the section, and streams that job', async () => {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: { preview_url: [success_frame(preview_envelope)] },
			});
			await preview(m);
			const sent = tool_requests(m.sent, 'preview_url');
			assert.strictEqual(sent.length, 1, 'one dispatch');
			assert.strictEqual(sent[0].options.url, URL_OK);
			assert.strictEqual(sent[0].options.section_tipo, 'test3');
			assert.strictEqual(sent[0].options.background_running, true, 'a background job');
			const status = m.sent.find((body) => body?.action === 'get_process_status');
			assert.deepEqual(
				status.options,
				{ pid: 4242, pfile: 'zz_acquisition_job.json' },
				'the job streamed is the one dispatched',
			);
		});

		it('a successful preview renders the review list; scraped text is TEXT', async () => {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: { preview_url: [success_frame(preview_envelope)] },
			});
			await preview(m);
			const result = result_of(m.content_data);
			assert.strictEqual(status_line(result), 'Done.');
			const rows = result.querySelectorAll('.review_container .lot_row');
			assert.strictEqual(rows.length, 2, 'one row per publication');
			assert.isNull(
				result.querySelector('.review_container img'),
				'no element is built from a scraped title',
			);
			assert.include(rows[0].textContent, HOSTILE, 'the title arrives character for character');
			assert.isNull(
				result.querySelector('.review_container b'),
				'no element is built from a scraped series name',
			);
			await new Promise((resolve) => setTimeout(resolve, 100));
			assert.strictEqual(window.__acq_bib, undefined, 'nothing scraped executed');
		});

		it('a FAILED preview (coded error on the frame) renders the error, not "Done." and not a review', async () => {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: {
					preview_url: [failed_frame(running_payload(MODEL, 'preview_url'), invalid_url_error)],
				},
			});
			await preview(m);
			const result = result_of(m.content_data);
			assert.notStrictEqual(status_line(result), 'Done.', 'a failed job is not reported done');
			assert.isNull(result.querySelector('.review_container'), 'no review is built from a failure');
			const error_node = result.querySelector('.error_message');
			assert.isNotNull(error_node, 'the failure is rendered');
			assert.include(error_node.textContent, error_text(invalid_url_error), 'label-first');
			assert.include(
				error_node.textContent,
				PUBLIC_SENTENCE,
				"the server's public sentence reaches the operator",
			);
			assert.strictEqual(relogin_opened, 0, 'a caller error is not a session loss');
		});

		it('an auth.* failure on the frame reaches the relogin overlay', async () => {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: {
					preview_url: [
						failed_frame(running_payload(MODEL, 'preview_url'), {
							code: 'auth.not_logged',
							category: 'auth',
							message: 'Authentication required',
							label_key: 'error_auth_not_logged',
							retryable: false,
						}),
					],
				},
			});
			await preview(m);
			assert.isNotNull(
				result_of(m.content_data).querySelector('.error_message'),
				'stated inline too',
			);
			assert.strictEqual(relogin_opened, 1, 'the session loss opens the relogin overlay');
		});

		it('a STOPPED job (no error, no result) is not reported as done', async () => {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: {
					preview_url: [stopped_frame({ msg: 'Fetching page 1 of 3', counter: 1, total: 3 })],
				},
			});
			await preview(m);
			const result = result_of(m.content_data);
			assert.notStrictEqual(status_line(result), 'Done.');
			assert.isNull(result.querySelector('.review_container'), 'no review without a result');
		});

		it('a refused DISPATCH renders label-first error text and streams nothing', async () => {
			const m = await mount({
				dispatch: { preview_url: { ok: false, request_id: 'zz-req', error: invalid_url_error } },
				frames: {},
			});
			await preview(m);
			const error_node = result_of(m.content_data).querySelector('.error_message');
			assert.isNotNull(error_node);
			assert.include(error_node.textContent, error_text(invalid_url_error), 'label-first');
			assert.include(error_node.textContent, PUBLIC_SENTENCE);
			assert.isUndefined(
				m.sent.find((body) => body?.action === 'get_process_status'),
				'no job stream for a refused dispatch',
			);
		});

		it('a status stream cut BEFORE the terminal frame says so, keeps Preview disabled, and Check again reopens the SAME job', async () => {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: {
					preview_url: (open_index) =>
						open_index === 0
							? [running_frame(running_payload(MODEL, 'preview_url'))]
							: [success_frame(preview_envelope)],
				},
			});
			const button = preview_button_of(m.content_data);
			url_input_of(m.content_data).value = URL_OK;
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			const result = result_of(m.content_data);
			await m.wait_until(
				() => result.querySelector('.job_status_lost') !== null,
				'the lost-status line',
			);
			assert.include(result.querySelector('.job_status_lost').textContent, '4242', 'names the job');
			assert.isTrue(
				button.classList.contains('loading'),
				'Preview stays disabled: the job may still run',
			);
			assert.isNull(result.querySelector('.review_container'));
			result
				.querySelector('.button_check_job')
				.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await m.wait_until(() => !button.classList.contains('loading'), 'the reopened job settled');
			const opens = m.sent.filter((body) => body?.action === 'get_process_status');
			assert.strictEqual(opens.length, 2, 'the status was opened twice');
			for (const open of opens) {
				assert.deepEqual(
					open.options,
					{ pid: 4242, pfile: 'zz_acquisition_job.json' },
					'the SAME job',
				);
			}
			assert.strictEqual(
				tool_requests(m.sent, 'preview_url').length,
				1,
				'no second job was started',
			);
			assert.isNotNull(
				result.querySelector('.review_container'),
				'the reopened stream delivered the result',
			);
			assert.isNull(result.querySelector('.job_status_lost'));
		});

		it('a status stream that cannot be OPENED is stated (with its error) and is not silent', async () => {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: {
					preview_url: (open_index) =>
						open_index === 0 ? new TypeError('Failed to fetch') : [success_frame(preview_envelope)],
				},
			});
			const button = preview_button_of(m.content_data);
			url_input_of(m.content_data).value = URL_OK;
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			const result = result_of(m.content_data);
			await m.wait_until(
				() => result.querySelector('.job_status_lost') !== null,
				'the lost-status line',
			);
			assert.isTrue(button.classList.contains('loading'), 'Preview stays disabled');
			assert.isNotNull(
				result.querySelector('.error_message:not(.job_status_lost)'),
				'the open failure is rendered',
			);
			result
				.querySelector('.button_check_job')
				.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await m.wait_until(() => !button.classList.contains('loading'), 'the reopened job settled');
			assert.isNotNull(result.querySelector('.review_container'));
		});
	});

	describe('commit_publications (background job)', () => {
		const confirm_button_of = (content_data) =>
			content_data.querySelector('.review_container > button.primary');

		it('sends the kept publications and the section; a success renders the summary', async () => {
			const m = await mount({
				dispatch: { preview_url: dispatched, commit_publications: dispatched },
				frames: {
					preview_url: [success_frame(preview_envelope)],
					commit_publications: [success_frame(commit_envelope)],
				},
			});
			await preview(m);
			// exclude the second publication
			m.content_data.querySelectorAll('.lot_row input[type="checkbox"]')[1].checked = false;
			await m.run_action(confirm_button_of(m.content_data), 'commit');
			const sent = tool_requests(m.sent, 'commit_publications');
			assert.strictEqual(sent.length, 1);
			assert.deepEqual(
				Object.keys(sent[0].options).sort(),
				['background_running', 'publications', 'section_tipo'],
				'the commit body is exactly {publications, section_tipo} (+ the background flag)',
			);
			assert.deepEqual(
				sent[0].options.publications,
				[preview_envelope.data.publications[0]],
				'only the kept one',
			);
			assert.strictEqual(sent[0].options.section_tipo, 'test3');
			const commit_result = m.content_data.querySelector('.commit_result_container');
			assert.include(
				commit_result.querySelector('.success_message').textContent,
				'Publication #77',
			);
		});

		it('a FAILED commit renders the error and no success summary', async () => {
			const m = await mount({
				dispatch: { preview_url: dispatched, commit_publications: dispatched },
				frames: {
					preview_url: [success_frame(preview_envelope)],
					commit_publications: [
						failed_frame(running_payload(MODEL, 'commit_publications'), {
							code: 'tool.action_failed',
							category: 'internal',
							message: 'The tool action could not be completed',
							label_key: 'error_tool_action_failed',
							retryable: false,
						}),
					],
				},
			});
			await preview(m);
			await m.run_action(confirm_button_of(m.content_data), 'commit');
			const commit_result = m.content_data.querySelector('.commit_result_container');
			assert.notStrictEqual(
				status_line(commit_result),
				'Done.',
				'a failed commit is not reported done',
			);
			assert.isNull(commit_result.querySelector('.success_message'), 'no success summary');
			assert.isNotNull(commit_result.querySelector('.error_message'), 'the failure is rendered');
		});
	});

	describe_job_state_honesty({
		tool_constructor: tool_bibliography_acquisition,
		model: MODEL,
		commit_action: 'commit_publications',
		preview_frames: [success_frame(preview_envelope)],
		commit_success_frames: [success_frame(commit_envelope)],
		renderer: renderer_module,
	});
});

// @license-end
