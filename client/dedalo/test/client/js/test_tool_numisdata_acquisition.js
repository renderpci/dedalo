// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, beforeEach, afterEach */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_NUMISDATA_ACQUISITION
 * The auction-catalogue acquisition tool's client, driven for real: the real
 * constructor and renderer on a fake caller, the real transport, a scripted
 * server (acquisition_harness.js).
 *
 * MEASURED BUG this file pins (cross-client review, 2026-10): the tool read a
 * background job's outcome from `frame.data` only. A failed job ends with its
 * coded error ON THE FRAME (`{is_running:false, error:{…}, data:<last progress
 * payload>}` — ERRORS_SPEC §5.3), so a blocked fetch, a zero-page preview or a
 * refused commit_lots printed "Done." and then called on_success(undefined),
 * which threw inside the stream reader: the operator never saw the typed
 * failure, and a refused commit looked completed.
 *
 * WHAT IS ASSERTED.
 *  - the module/constructor/prototype template;
 *  - the WIRE: preview_url and commit_lots are background tool_requests with the
 *    exact options body (the kept lots, the auction, the company the operator
 *    confirmed, the section), and the job is streamed by its pid/pfile;
 *  - a failed preview / commit renders the coded error, never "Done.", never
 *    the review or the summary; an auth.* failure reaches the relogin overlay;
 *  - a stopped job (no error, no result) is not reported as done;
 *  - error bodies render label-first (error_text), never a bare `.message`;
 *  - the success path still renders, and scraped text renders as TEXT;
 *  - a status stream that ends BEFORE the job's terminal frame (a dropped
 *    connection, a stream that could not open) is not silent: the panel says
 *    the job may still be running, the action button STAYS disabled (a second
 *    click would start a second job beside the first) and "Check again" reopens
 *    the SAME job's status;
 *  - the company picker: a superseded Entity search cannot overwrite the
 *    operator's newer one, a failed search is not "no candidates" (it never
 *    preselects "Create new"), and Confirm refuses while the Entity is unresolved.
 */

import {
	reset_error_dispatch_state,
	set_relogin_renderer_for_test,
} from '../../../core/common/js/error_dispatch.js';
import { error_text } from '../../../core/common/js/render_api_error.js';
import { ENTITY_NAME_TIPO } from '../../../tools/tool_numisdata_acquisition/js/render_tool_numisdata_acquisition.js';
import { tool_numisdata_acquisition } from '../../../tools/tool_numisdata_acquisition/js/tool_numisdata_acquisition.js';
import {
	failed_frame,
	mount_acquisition_tool,
	running_frame,
	running_payload,
	status_line,
	stopped_frame,
	success_frame,
	tool_requests,
} from './acquisition_harness.js';

const MODEL = 'tool_numisdata_acquisition';
const URL_OK = 'https://auctions.example.org/catalogue/12';
const HOSTILE = '<img src=x onerror="window.__acq_num=1">Denarius';

const blocked_fetch_error = {
	code: 'tool.action_failed',
	category: 'internal',
	message: 'No catalogue page could be read from this URL.',
	label_key: 'error_tool_action_failed',
	retryable: false,
};

const dispatched = {
	ok: true,
	request_id: 'zz-req',
	pid: 4242,
	pfile: 'zz_acquisition_job.json',
	data: null,
};

const lot = (number, description) => ({
	lotNumber: number,
	title: '',
	description: description,
	weight: '3.9 g',
	diameter: '18 mm',
});

const preview_envelope = (auction = null) => ({
	ok: true,
	request_id: 'zz-req',
	data: {
		auction: auction,
		auction_status: auction ? { exists: false } : null,
		lots: [lot('1', HOSTILE), lot('2', 'Quadrans')],
		lots_truncated_by: 0,
	},
});

const lot_failed_body = {
	code: 'tool.action_failed',
	category: 'internal',
	message: 'Lot 2 could not be written.',
	label_key: 'error_tool_action_failed',
	retryable: false,
};

const commit_envelope = {
	ok: true,
	request_id: 'zz-req',
	data: {
		results: [
			{
				lot_identifier: '1',
				section_tipo: 'test3',
				section_id: 88,
				skipped: false,
				fields_written: ['weight'],
				auction_section_id: null,
				auction_created: false,
				auction_error: null,
				type_section_id: null,
				type_citation: null,
				type_error: null,
				images_created: null,
				images_error: null,
				images_orphaned: [],
			},
			{ lot_identifier: '2', section_id: null, error: lot_failed_body },
		],
		stopped: false,
		lots_total: 2,
	},
};

const preview_button_of = (content_data) => content_data.querySelector('.url_row button');
const url_input_of = (content_data) => content_data.querySelector('.url_input');
const result_of = (content_data) => content_data.querySelector('.result_container');
const confirm_button_of = (content_data) =>
	content_data.querySelector('.review_container > button.primary');

describe('TOOL_NUMISDATA_ACQUISITION CLIENT TEST', function () {
	this.timeout(20000);

	let mounted = null;
	let restore_renderer = null;
	let relogin_opened = 0;

	beforeEach(function () {
		window.__acq_num = undefined;
		relogin_opened = 0;
		restore_renderer = set_relogin_renderer_for_test(() => {
			relogin_opened++;
			throw new Error('test: no relogin overlay');
		});
	});

	afterEach(function () {
		if (mounted) mounted.unmount();
		mounted = null;
		if (restore_renderer) restore_renderer();
		reset_error_dispatch_state();
		window.__acq_num = undefined;
	});

	const mount = async (server) => {
		mounted = await mount_acquisition_tool(tool_numisdata_acquisition, MODEL, server);
		return mounted;
	};

	const preview = async (m) => {
		url_input_of(m.content_data).value = URL_OK;
		await m.run_action(preview_button_of(m.content_data), 'preview');
	};

	describe('template', function () {
		it('module exports the constructor; construct seeds the instance; prototype is wired', function () {
			assert.equal(typeof tool_numisdata_acquisition, 'function');
			const instance = new tool_numisdata_acquisition();
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
				'commit_lots',
			]) {
				assert.equal(
					typeof tool_numisdata_acquisition.prototype[name],
					'function',
					name + ' wired',
				);
			}
		});
	});

	describe('preview_url (background job)', function () {
		it('sends a background preview_url with the url and the section, and streams that job', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: { preview_url: [success_frame(preview_envelope())] },
			});
			await preview(m);
			const sent = tool_requests(m.sent, 'preview_url');
			assert.strictEqual(sent.length, 1, 'one dispatch');
			assert.strictEqual(sent[0].options.url, URL_OK);
			assert.strictEqual(sent[0].options.section_tipo, 'test3');
			assert.strictEqual(sent[0].options.background_running, true, 'a background job');
			const status = m.sent.find((body) => body?.action === 'get_process_status');
			assert.deepEqual(status.options, { pid: 4242, pfile: 'zz_acquisition_job.json' });
		});

		it('a successful preview renders the review list; scraped text is TEXT', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: { preview_url: [success_frame(preview_envelope())] },
			});
			await preview(m);
			const result = result_of(m.content_data);
			assert.strictEqual(status_line(result), 'Done.');
			const rows = result.querySelectorAll('.review_container .lot_row');
			assert.strictEqual(rows.length, 2, 'one row per lot');
			assert.isNull(
				result.querySelector('.review_container img'),
				'no element is built from a scraped description',
			);
			assert.include(
				rows[0].textContent,
				HOSTILE.slice(0, 40),
				'the description arrives character for character',
			);
			await new Promise((resolve) => setTimeout(resolve, 100));
			assert.strictEqual(window.__acq_num, undefined, 'nothing scraped executed');
		});

		it('a FAILED preview (coded error on the frame) renders the error, not "Done." and not a review', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: {
					preview_url: [
						failed_frame(
							{ msg: 'Fetching page 1 of 3', counter: 1, total: 3 },
							blocked_fetch_error,
						),
					],
				},
			});
			await preview(m);
			const result = result_of(m.content_data);
			assert.notStrictEqual(status_line(result), 'Done.', 'a failed job is not reported done');
			assert.isNull(result.querySelector('.review_container'), 'no review is built from a failure');
			const error_node = result.querySelector('.error_message');
			assert.isNotNull(error_node, 'the failure is rendered');
			assert.include(error_node.textContent, error_text(blocked_fetch_error), 'label-first');
			assert.include(
				error_node.textContent,
				blocked_fetch_error.message,
				"and the server's own sentence",
			);
			assert.strictEqual(relogin_opened, 0);
		});

		it('an auth.* failure on the frame reaches the relogin overlay', async function () {
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

		it('a STOPPED job (no error, no result) is not reported as done', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: { preview_url: [stopped_frame(running_payload(MODEL, 'preview_url'))] },
			});
			await preview(m);
			const result = result_of(m.content_data);
			assert.notStrictEqual(status_line(result), 'Done.');
			assert.isNull(result.querySelector('.review_container'));
		});

		it('a refused DISPATCH renders label-first error text and streams nothing', async function () {
			const refused = {
				code: 'request.invalid_options',
				category: 'caller',
				message: 'Unsupported auction site.',
				label_key: 'error_request_invalid_options',
				retryable: false,
			};
			const m = await mount({
				dispatch: { preview_url: { ok: false, request_id: 'zz-req', error: refused } },
				frames: {},
			});
			await preview(m);
			const error_node = result_of(m.content_data).querySelector('.error_message');
			assert.isNotNull(error_node);
			assert.include(error_node.textContent, error_text(refused), 'label-first');
			assert.include(error_node.textContent, refused.message);
			assert.isUndefined(m.sent.find((body) => body?.action === 'get_process_status'));
		});

		it('a status stream cut BEFORE the terminal frame says so, keeps Preview disabled, and Check again reopens the SAME job', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: {
					preview_url: (open_index) =>
						open_index === 0
							? [running_frame({ msg: 'Fetching page 1 of 3', counter: 1, total: 3 })]
							: [success_frame(preview_envelope())],
				},
			});
			const button = preview_button_of(m.content_data);
			url_input_of(m.content_data).value = URL_OK;
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			const result = result_of(m.content_data);
			await m.wait_until(() => result.querySelector('.job_status_lost') !== null, 'the lost-status line');
			assert.include(result.querySelector('.job_status_lost').textContent, '4242', 'names the job');
			assert.isTrue(button.classList.contains('loading'), 'Preview stays disabled: the job may still run');
			assert.isNull(result.querySelector('.review_container'));
			assert.notStrictEqual(status_line(result), 'Done.');
			// reopen
			result.querySelector('.button_check_job').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await m.wait_until(() => !button.classList.contains('loading'), 'the reopened job settled');
			const opens = m.sent.filter((body) => body?.action === 'get_process_status');
			assert.strictEqual(opens.length, 2, 'the status was opened twice');
			for (const open of opens) {
				assert.deepEqual(open.options, { pid: 4242, pfile: 'zz_acquisition_job.json' }, 'the SAME job');
			}
			assert.strictEqual(tool_requests(m.sent, 'preview_url').length, 1, 'no second job was started');
			assert.strictEqual(status_line(result), 'Done.');
			assert.isNotNull(result.querySelector('.review_container'), 'the reopened stream delivered the result');
			assert.isNull(result.querySelector('.job_status_lost'));
		});

		it('a status stream that cannot be OPENED is stated (with its error) and is not silent', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched },
				frames: {
					preview_url: (open_index) =>
						open_index === 0 ? new TypeError('Failed to fetch') : [success_frame(preview_envelope())],
				},
			});
			const button = preview_button_of(m.content_data);
			url_input_of(m.content_data).value = URL_OK;
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			const result = result_of(m.content_data);
			await m.wait_until(() => result.querySelector('.job_status_lost') !== null, 'the lost-status line');
			assert.isTrue(button.classList.contains('loading'), 'Preview stays disabled');
			assert.isNotNull(result.querySelector('.error_message:not(.job_status_lost)'), 'the open failure is rendered');
			result.querySelector('.button_check_job').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await m.wait_until(() => !button.classList.contains('loading'), 'the reopened job settled');
			assert.isNotNull(result.querySelector('.review_container'));
		});
	});

	describe('commit_lots (background job)', function () {
		it('sends the kept lots, the auction and the CONFIRMED company; a success renders the summary', async function () {
			const auction = { auctionHouse: 'Casa Zeta', auctionNumber: '12' };
			const m = await mount({
				dispatch: { preview_url: dispatched, commit_lots: dispatched },
				frames: {
					preview_url: [success_frame(preview_envelope(auction))],
					commit_lots: [success_frame(commit_envelope)],
				},
				// the company picker's Entity search: no candidates → "create new" preselected
				other: (body) =>
					body?.dd_api === 'dd_core_api' && body?.action === 'read'
						? { ok: true, request_id: 'zz-req', data: { context: [], data: [] } }
						: null,
			});
			await preview(m);
			await m.wait_until(
				() => m.content_data.querySelector('.company_option') !== null,
				'company options',
			);
			m.content_data.querySelectorAll('.lot_row input[type="checkbox"]')[1].checked = false;
			await m.run_action(confirm_button_of(m.content_data), 'commit');
			const sent = tool_requests(m.sent, 'commit_lots');
			assert.strictEqual(sent.length, 1);
			assert.deepEqual(Object.keys(sent[0].options).sort(), [
				'auction',
				'background_running',
				'company_selection',
				'lots',
				'section_tipo',
			]);
			assert.deepEqual(
				sent[0].options.lots,
				[preview_envelope(auction).data.lots[0]],
				'only the kept lot',
			);
			assert.deepEqual(sent[0].options.auction, auction);
			assert.deepEqual(sent[0].options.company_selection, { create: true, name: 'Casa Zeta' });
			assert.strictEqual(sent[0].options.section_tipo, 'test3');
			const summary = m.content_data.querySelector('.commit_result_container .success_message');
			assert.include(summary.textContent, 'Lot #88');
			// a per-lot failure body renders label-first too
			assert.include(summary.textContent, error_text(lot_failed_body));
			assert.include(summary.textContent, lot_failed_body.message);
		});

		it('a FAILED commit renders the error and no success summary', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched, commit_lots: dispatched },
				frames: {
					preview_url: [success_frame(preview_envelope())],
					commit_lots: [
						failed_frame(running_payload(MODEL, 'commit_lots'), {
							code: 'request.invalid_options',
							category: 'caller',
							message: 'Too many lots in one commit.',
							label_key: 'error_request_invalid_options',
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
				'a refused commit is not reported done',
			);
			assert.isNull(commit_result.querySelector('.success_message'), 'no success summary');
			assert.include(
				commit_result.querySelector('.error_message')?.textContent ?? '',
				'Too many lots in one commit.',
			);
		});

		it('a commit whose status stream is cut keeps Confirm disabled: no second commit while the first may run', async function () {
			const m = await mount({
				dispatch: { preview_url: dispatched, commit_lots: dispatched },
				frames: {
					preview_url: [success_frame(preview_envelope())],
					commit_lots: [running_frame(running_payload(MODEL, 'commit_lots'))],
				},
			});
			await preview(m);
			const confirm = confirm_button_of(m.content_data);
			confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			const commit_result = m.content_data.querySelector('.commit_result_container');
			await m.wait_until(() => commit_result.querySelector('.job_status_lost') !== null, 'the lost-status line');
			assert.isTrue(confirm.classList.contains('loading'), 'Confirm stays disabled');
			assert.strictEqual(tool_requests(m.sent, 'commit_lots').length, 1);
			assert.isNull(commit_result.querySelector('.success_message'));
		});
	});

	describe('company picker (Entity resolution)', function () {
		const auction = { auctionHouse: 'Casa Zeta', auctionNumber: '12' };

		// an Entity search answer: rows named by the tool's Entity name component,
		// the shape search_companies reads
		const entities = (rows) => ({
			ok: true,
			request_id: 'zz-req',
			data: {
				context: [],
				data: [
					{ typo: 'sections', entries: rows.map(([id]) => ({ section_id: id })) },
					...rows.map(([id, name]) => ({
						tipo: ENTITY_NAME_TIPO,
						row_section_id: id,
						entries: [{ value: name }],
					})),
				],
			},
		});
		const search_q = (body) => body?.sqo?.filter?.$and?.[0]?.q;
		const is_search = (body) => body?.dd_api === 'dd_core_api' && body?.action === 'read';
		const company_input_of = (content_data) => content_data.querySelector('.company_name_input');
		const company_search_of = (content_data) => content_data.querySelector('.company_resolution > button');
		const checked_label = (content_data) =>
			content_data.querySelector('.company_option input:checked')?.nextSibling?.textContent ?? null;

		it("a SUPERSEDED search's late answer cannot overwrite the operator's newer choice", async function () {
			let release_first = null;
			const m = await mount({
				dispatch: { preview_url: dispatched, commit_lots: dispatched },
				frames: {
					preview_url: [success_frame(preview_envelope(auction))],
					commit_lots: [success_frame(commit_envelope)],
				},
				other: (body) => {
					if (!is_search(body)) return null;
					if (search_q(body) === 'Casa Zeta') {
						// the automatic first search answers LATE, with an exact match
						return new Promise((resolve) => {
							release_first = () => resolve(entities([[501, 'Casa Zeta']]));
						});
					}
					return entities([]);
				},
			});
			await preview(m);
			await m.wait_until(() => release_first !== null, 'the first search in flight');
			company_input_of(m.content_data).value = 'Casa Nueva';
			company_search_of(m.content_data).dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await m.wait_until(() => (checked_label(m.content_data) ?? '').includes('Casa Nueva'), 'the newer answer');
			release_first();
			await new Promise((resolve) => setTimeout(resolve, 150));
			assert.include(checked_label(m.content_data), 'Casa Nueva', 'the stale answer did not repaint');
			assert.isNull(
				[...m.content_data.querySelectorAll('.company_option')].find((row) => row.textContent.includes('#501')) ?? null,
				'no stale candidate row',
			);
			assert.isFalse(company_search_of(m.content_data).classList.contains('loading'));
			await m.run_action(confirm_button_of(m.content_data), 'commit');
			const sent = tool_requests(m.sent, 'commit_lots');
			assert.strictEqual(sent.length, 1);
			assert.deepEqual(sent[0].options.company_selection, { create: true, name: 'Casa Nueva' });
		});

		it('Confirm refuses while the Entity is unresolved (a search still in flight)', async function () {
			let release = null;
			const m = await mount({
				dispatch: { preview_url: dispatched, commit_lots: dispatched },
				frames: { preview_url: [success_frame(preview_envelope(auction))] },
				other: (body) =>
					is_search(body)
						? new Promise((resolve) => {
								release = () => resolve(entities([[501, 'Casa Zeta']]));
							})
						: null,
			});
			await preview(m);
			await m.wait_until(() => release !== null, 'the search in flight');
			confirm_button_of(m.content_data).dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise((resolve) => setTimeout(resolve, 100));
			assert.strictEqual(tool_requests(m.sent, 'commit_lots').length, 0, 'nothing committed');
			assert.isNotNull(
				m.content_data.querySelector('.commit_result_container .company_unresolved'),
				'the refusal is stated',
			);
			// positive control: once resolved, the exact match is picked
			release();
			await m.wait_until(() => (checked_label(m.content_data) ?? '').includes('#501'), 'the exact match');
		});

		it('a FAILED search is stated and never preselects "Create new"', async function () {
			const refused = {
				code: 'perm.denied',
				category: 'permission',
				message: 'No read access to Entities.',
				label_key: 'error_perm_denied',
				retryable: false,
			};
			const m = await mount({
				dispatch: { preview_url: dispatched, commit_lots: dispatched },
				frames: { preview_url: [success_frame(preview_envelope(auction))] },
				other: (body) => (is_search(body) ? { ok: false, request_id: 'zz-req', error: refused } : null),
			});
			await preview(m);
			const results = m.content_data.querySelector('.company_results');
			await m.wait_until(() => results.querySelector('.error_message') !== null, 'the search failure');
			assert.include(results.querySelector('.error_message').textContent, error_text(refused));
			assert.isNull(results.querySelector('.company_option'), 'no option, so no "Create new" preselected');
			assert.isFalse(company_search_of(m.content_data).classList.contains('loading'));
			confirm_button_of(m.content_data).dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise((resolve) => setTimeout(resolve, 100));
			assert.strictEqual(tool_requests(m.sent, 'commit_lots').length, 0, 'nothing committed on a failed search');
		});
	});
});

// @license-end
