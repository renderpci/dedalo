// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, afterEach */
/*eslint no-undef: "error"*/

/**
 * TEST_ACQUISITION_COMMIT_HONESTY
 * Both acquisition tools (numisdata: commit_lots, bibliography:
 * commit_publications) driven for real on the shared harness
 * (acquisition_harness.js — real constructor + renderer + transport, scripted
 * server). One rule, three holes it closes (cross-client review r3, 2026-10):
 * a COMMIT — the step that writes heritage records — re-arms only on a KNOWN
 * outcome or on the operator's EXPLICIT decision.
 *
 *  1. TOOL-SCOPED, not node-scoped. While a commit's outcome is not known, a
 *     new Preview rebuilt the result panel: the disabled Confirm and the
 *     unknown-outcome panel were destroyed and a NEW, ENABLED Confirm drawn,
 *     whose click started a second commit beside the first. Preview is now
 *     disabled (and its handler refuses) until that commit settles.
 *  2. AN END THAT DOES NOT SAY WHAT IT DID IS NOT KNOWN. An interrupted job
 *     (its server process died), a started job that was stopped, a pfile the
 *     server no longer finds: each ends with no coded `error`, no result and an
 *     `errors[]` line (src/core/media/jobs.ts, src/core/api/process_status.ts).
 *     The panel printed "ended without a result" and re-armed Confirm by
 *     itself. Now the lines are stated and re-arming is explicit. A job stopped
 *     BEFORE it started (no line: nothing ran) still settles.
 *  3. NO "IT DID NOT START" WHILE AN ENDED JOB OF THIS KIND IS LISTED. "Check
 *     my jobs" offered that re-enable whenever nothing was live, even beside a
 *     job of this kind that had just FINISHED — possibly the very attempt whose
 *     dispatch went unanswered. Now that job must be followed; the blind
 *     re-enable is offered only when nothing of this kind is listed, worded as
 *     what the server can actually say (nothing in its recency window).
 */

import { tool_bibliography_acquisition } from '../../../tools/tool_bibliography_acquisition/js/tool_bibliography_acquisition.js';
import { tool_numisdata_acquisition } from '../../../tools/tool_numisdata_acquisition/js/tool_numisdata_acquisition.js';
import {
	activity_envelope,
	activity_row,
	mount_acquisition_tool,
	running_payload,
	success_frame,
	tool_requests,
} from './acquisition_harness.js';

const dispatched = {
	ok: true,
	request_id: 'zz-req',
	pid: 4242,
	pfile: 'zz_acquisition_job.json',
	data: null,
};

const unreadable = () =>
	new Response('<html><body>502 Bad Gateway</body></html>', {
		status: 200,
		headers: { 'content-type': 'text/html' },
	});

/** A terminal frame that says nothing about what the job did, with its server lines. */
const uncoded_end_frame = (progress, errors) => ({
	pid: 4242,
	pfile: 'zz_acquisition_job.json',
	is_running: false,
	data: progress,
	errors: errors,
	total_time: 12,
});

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

describe('ACQUISITION COMMIT HONESTY (a commit re-arms only on a known outcome or an explicit decision)', function () {
	this.timeout(20000);

	let mounted = null;
	afterEach(() => {
		if (mounted) mounted.unmount();
		mounted = null;
	});

	for (const spec of TOOLS) {
		const { model, tool_constructor, commit_action } = spec;

		describe(model, () => {
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
			const preview_frames = [success_frame(spec.preview_envelope)];

			it('an outcome-unknown commit keeps PREVIEW disabled: a forced Preview starts nothing, and the disabled Confirm and its panel survive', async () => {
				const m = await mount({
					dispatch: { preview_url: dispatched, [commit_action]: unreadable },
					frames: { preview_url: preview_frames },
					other: (body) => (body?.action === 'get_activity' ? activity_envelope([]) : null),
				});
				await preview(m);
				const preview_button = preview_button_of(m);
				const confirm = confirm_button_of(m);
				click(confirm);
				const panel = commit_panel_of(m);
				await m.wait_until(
					() => panel.querySelector('.job_dispatch_unknown') !== null,
					'the unknown-outcome line',
				);
				assert.isTrue(preview_button.disabled, 'Preview DISABLED while the commit is outstanding');

				// the keyboard path: an activation that reaches the handler anyway
				preview_button.disabled = false;
				click(preview_button);
				await sleep(150);
				assert.strictEqual(tool_requests(m.sent, 'preview_url').length, 1, 'no second preview job');
				assert.isTrue(
					m.content_data.contains(confirm),
					"the outstanding commit's Confirm was not replaced",
				);
				assert.isTrue(confirm.disabled, 'and it is still disabled');
				assert.isNotNull(
					panel.querySelector('.job_dispatch_unknown'),
					'its unknown-outcome panel survives',
				);

				// the explicit way out re-arms BOTH: the commit's outcome is now the operator's call
				click(panel.querySelector('.button_check_jobs'));
				await m.wait_until(
					() => panel.querySelector('.button_enable_again') !== null,
					'the explicit re-enable',
				);
				click(panel.querySelector('.button_enable_again'));
				await m.wait_until(() => !confirm.classList.contains('loading'), 're-enabled');
				assert.isFalse(confirm.disabled);
				assert.isFalse(preview_button.disabled, 'Preview re-arms with the settled commit');
				assert.strictEqual(tool_requests(m.sent, commit_action).length, 1);
			});

			it('an INTERRUPTED commit (an errors[] line, no coded error, no result) is not a known outcome: stated, nothing re-arms until the explicit re-enable', async () => {
				const line = 'interrupted: owning server process died (boot reconcile)';
				const m = await mount({
					dispatch: { preview_url: dispatched, [commit_action]: dispatched },
					frames: {
						preview_url: preview_frames,
						[commit_action]: [uncoded_end_frame(running_payload(model, commit_action), [line])],
					},
				});
				await preview(m);
				const preview_button = preview_button_of(m);
				const confirm = confirm_button_of(m);
				click(confirm);
				const panel = commit_panel_of(m);
				await m.wait_until(
					() => panel.querySelector('.job_ended_unknown') !== null,
					'the ended-unknown statement',
				);
				await sleep(100);
				assert.include(
					panel.querySelector('.job_end_line')?.textContent ?? '',
					line,
					"the server's own line is shown",
				);
				assert.isTrue(confirm.classList.contains('loading'), 'Confirm is not re-armed by itself');
				assert.isTrue(confirm.disabled);
				assert.isTrue(preview_button.disabled, 'nor is Preview');
				confirm.disabled = false;
				click(confirm);
				await sleep(100);
				assert.strictEqual(tool_requests(m.sent, commit_action).length, 1, 'no second commit job');

				click(panel.querySelector('.button_enable_again'));
				await m.wait_until(() => !confirm.classList.contains('loading'), 're-enabled');
				assert.isFalse(confirm.disabled);
				assert.isFalse(preview_button.disabled);
				assert.isNotNull(panel.querySelector('.job_ended_unknown'), 'what happened stays stated');
			});

			it('a commit stopped BEFORE it started (no line: nothing ran) is a known outcome and settles', async () => {
				const m = await mount({
					dispatch: { preview_url: dispatched, [commit_action]: dispatched },
					frames: {
						preview_url: preview_frames,
						[commit_action]: [uncoded_end_frame(running_payload(model, commit_action), [])],
					},
				});
				await preview(m);
				const confirm = confirm_button_of(m);
				await m.run_action(confirm, 'never-started commit');
				assert.isFalse(confirm.disabled);
				assert.isNull(commit_panel_of(m).querySelector('.job_ended_unknown'));
				assert.isFalse(preview_button_of(m).disabled);
			});

			it('Check my jobs listing an ENDED job of this kind offers no blind re-enable: following it is the way on', async () => {
				const ended_job_id = `${model}_${commit_action}_77_3`;
				const m = await mount({
					dispatch: { preview_url: dispatched, [commit_action]: unreadable },
					frames: {
						preview_url: preview_frames,
						[commit_action]: [success_frame(spec.commit_envelope)],
					},
					other: (body) =>
						body?.action === 'get_activity'
							? activity_envelope([activity_row(ended_job_id, 'done')])
							: null,
				});
				await preview(m);
				const confirm = confirm_button_of(m);
				click(confirm);
				const panel = commit_panel_of(m);
				await m.wait_until(
					() => panel.querySelector('.button_check_jobs') !== null,
					'the check button',
				);
				click(panel.querySelector('.button_check_jobs'));
				await m.wait_until(
					() => panel.querySelector('.button_follow_job') !== null,
					'the ended job listed',
				);
				assert.isNull(
					panel.querySelector('.button_enable_again'),
					'no "it did not start" beside a job that ended',
				);
				assert.isNotNull(panel.querySelector('.job_candidates_ended'), 'says why: follow it first');
				assert.isTrue(confirm.classList.contains('loading'), 'listing re-arms nothing');
				click(panel.querySelector('.button_follow_job'));
				await m.wait_until(
					() => !confirm.classList.contains('loading'),
					'the followed job settled',
				);
				assert.isFalse(confirm.disabled);
				assert.isNotNull(panel.querySelector('.success_message'), 'what it did is rendered');
				assert.strictEqual(tool_requests(m.sent, commit_action).length, 1, 'no second commit job');
			});
		});
	}
});

// @license-end
