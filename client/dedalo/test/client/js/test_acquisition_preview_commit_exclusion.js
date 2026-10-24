// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, afterEach */
/*eslint no-undef: "error"*/

/**
 * TEST_ACQUISITION_PREVIEW_COMMIT_EXCLUSION
 * Both acquisition tools (numisdata: commit_lots, bibliography:
 * commit_publications) driven for real on the shared harness
 * (acquisition_harness.js). Preview and a commit EXCLUDE each other, BOTH ways
 * (cross-client review r5, 2026-10).
 *
 * test_acquisition_commit_honesty pins one direction: a commit outstanding →
 * Preview refuses. The other was open: a Preview IN FLIGHT left the old review
 * on screen with its Confirm enabled. A click there started a commit inside the
 * old review; the Preview's answer then rebuilt the result panel — the
 * commit's progress and unknown-outcome panel detached — and drew a NEW,
 * ENABLED Confirm whose click started a SECOND commit beside the first.
 * Now the superseded review leaves at the Preview click, and a Confirm refuses
 * while a Preview is in flight (its handler, not only its node state).
 */

import { tool_bibliography_acquisition } from '../../../tools/tool_bibliography_acquisition/js/tool_bibliography_acquisition.js';
import { tool_numisdata_acquisition } from '../../../tools/tool_numisdata_acquisition/js/tool_numisdata_acquisition.js';
import { mount_acquisition_tool, success_frame, tool_requests } from './acquisition_harness.js';

const dispatched = {
	ok: true,
	request_id: 'zz-req',
	pid: 4242,
	pfile: 'zz_acquisition_job.json',
	data: null,
};

const TOOLS = [
	{
		model: 'tool_numisdata_acquisition',
		tool_constructor: tool_numisdata_acquisition,
		commit_action: 'commit_lots',
		preview_envelope: {
			ok: true,
			request_id: 'zz-req',
			data: {
				auction: null,
				auction_status: null,
				lots: [{ lotNumber: '1', title: '', description: 'Quadrans', images: [] }],
				lots_truncated_by: 0,
			},
		},
		commit_envelope: {
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
				],
				stopped: false,
				lots_total: 1,
			},
		},
	},
	{
		model: 'tool_bibliography_acquisition',
		tool_constructor: tool_bibliography_acquisition,
		commit_action: 'commit_publications',
		preview_envelope: {
			ok: true,
			request_id: 'zz-req',
			data: {
				series: { name: 'Series' },
				series_status: { exists: false },
				publications: [
					{ identifier: 'oai:j:1', title: 'First', authors: ['Ana'], publicationDate: '2001' },
				],
				article_failures: [],
				publications_truncated_by: 0,
			},
		},
		commit_envelope: {
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
		},
	},
];

const click = (node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Holds the NEXT preview_url dispatch before it reaches the harness's scripted
 * server, until release() — the window between a Preview click and its answer.
 * The harness restores the original fetch on unmount, which drops this wrapper.
 */
const hold_next_preview_dispatch = () => {
	const harness_fetch = window.fetch;
	const gate = Promise.withResolvers();
	let armed = true;
	let held = false;
	window.fetch = async (url, init) => {
		let body = null;
		try {
			body = JSON.parse(init?.body);
		} catch (error) {
			body = null;
		}
		if (
			armed &&
			body?.dd_api === 'dd_tools_api' &&
			body?.action === 'tool_request' &&
			body.source?.action === 'preview_url'
		) {
			armed = false;
			held = true;
			await gate.promise;
		}
		return harness_fetch(url, init);
	};
	return { release: () => gate.resolve(), is_held: () => held };
};

describe('ACQUISITION PREVIEW / COMMIT EXCLUSION (no commit starts while a Preview is in flight)', function () {
	this.timeout(20000);

	let mounted = null;
	afterEach(() => {
		if (mounted) mounted.unmount();
		mounted = null;
	});

	for (const spec of TOOLS) {
		const { model, tool_constructor, commit_action } = spec;

		describe(model, () => {
			const preview_button_of = (m) => m.content_data.querySelector('.url_row button');
			const confirm_button_of = (m) =>
				m.content_data.querySelector('.review_container > button.primary');

			it('a Confirm clicked while a Preview is in flight starts nothing; the new review starts exactly one commit', async () => {
				mounted = await mount_acquisition_tool(tool_constructor, model, {
					dispatch: { preview_url: dispatched, [commit_action]: dispatched },
					frames: {
						preview_url: [success_frame(spec.preview_envelope)],
						[commit_action]: [success_frame(spec.commit_envelope)],
					},
				});
				const m = mounted;
				m.content_data.querySelector('.url_input').value = 'https://example.org/zz_catalogue';
				const preview_button = preview_button_of(m);
				await m.run_action(preview_button, 'first preview');
				const old_confirm = confirm_button_of(m);
				assert.isNotNull(old_confirm, 'the first review (and its Confirm) rendered');

				// a second Preview, its dispatch held unanswered
				const hold = hold_next_preview_dispatch();
				click(preview_button);
				await m.wait_until(() => hold.is_held(), 'the second preview dispatch is in flight');
				assert.isTrue(preview_button.classList.contains('loading'), 'Preview is in flight');

				// the old review's Confirm — the activation reaches its handler anyway
				// (a node kept by reference: what a keyboard / a stale focus does)
				old_confirm.disabled = false;
				click(old_confirm);
				await sleep(150);
				assert.strictEqual(
					tool_requests(m.sent, commit_action).length,
					0,
					'NO commit dispatched while a Preview is in flight',
				);
				assert.isFalse(
					m.content_data.contains(old_confirm),
					'the superseded review left at the Preview click',
				);

				// the Preview answers: a new review, whose Confirm starts ONE commit
				hold.release();
				await m.wait_until(
					() => !preview_button.classList.contains('loading') && confirm_button_of(m) !== null,
					'the second review',
				);
				const new_confirm = confirm_button_of(m);
				assert.notStrictEqual(new_confirm, old_confirm);
				assert.isFalse(new_confirm.disabled, 'the new review is armed (nothing is outstanding)');
				await m.run_action(new_confirm, 'the commit');
				assert.strictEqual(
					tool_requests(m.sent, commit_action).length,
					1,
					'exactly one commit job',
				);
				assert.isNotNull(
					m.content_data.querySelector('.commit_result_container .success_message'),
					'its outcome is rendered in the live review',
				);
			});
		});
	}
});

// @license-end
