// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/

import {
	normalize_stream_error,
	request_failed,
	response_data,
} from '../../../core/common/js/api_error.js';
import { data_manager, release_stream_reader } from '../../../core/common/js/data_manager.js';
import { handle_api_error, outcome_unknown } from '../../../core/common/js/error_dispatch.js';
import { error_text } from '../../../core/common/js/render_api_error.js';
import { render_stream } from '../../../core/common/js/render_common.js';
// imports
import { ui } from '../../../core/common/js/ui.js';
import { escape_html } from '../../../core/common/js/utils/render_escape.js';

/**
 * RENDER_TOOL_BIBLIOGRAPHY_ACQUISITION
 * preview_url/commit_publications both run as background jobs (server/index.ts)
 * and stream progress via stream_background_job below: 1) Preview builds a
 * review list (checkbox per publication, nothing written yet), 2) Confirm
 * import runs commit_publications and shows the per-record result.
 * @module render_tool_bibliography_acquisition
 */
export const render_tool_bibliography_acquisition = function () {
	return true;
}; //end render_tool_bibliography_acquisition

/**
 * STATUS_UPDATE_RATE_MS
 * How often get_process_status sends a job frame — one every update_rate,
 * changed or not, until the terminal one (src/core/api/process_status.ts).
 */
const STATUS_UPDATE_RATE_MS = 1000;

/**
 * How long a job's status stream may stay SILENT before it is declared lost
 * (the idle watchdog in stream_background_job): 15 missed frames. Long enough
 * for a busy event loop, short enough that a half-open connection does not
 * freeze the panel for good.
 */
let status_idle_limit_ms = 15 * STATUS_UPDATE_RATE_MS;

/**
 * SET_STATUS_IDLE_LIMIT_FOR_TEST
 * TEST SEAM (acquisition_harness.js describe_job_state_honesty): shortens the
 * idle limit so a half-open stream is declared lost within the test's budget.
 * @param {number} ms
 * @returns {Function} restore
 */
export const set_status_idle_limit_for_test = function (ms) {
	const previous = status_idle_limit_ms;
	status_idle_limit_ms = ms;
	return () => {
		status_idle_limit_ms = previous;
	};
}; //end set_status_idle_limit_for_test

/**
 * SET_BUSY
 * An action button's in-flight state. `disabled` is what stops a second
 * activation from EVERY input: the 'loading' class (the spinner) alone is
 * pointer-events:none, and Enter/Space on the focused button still clicked it —
 * a second job beside the first. The click handlers ALSO refuse while busy
 * (is_busy): a disabled attribute is page state that anything can clear.
 * @param {HTMLElement} button
 * @param {boolean} busy
 */
const set_busy = function (button, busy) {
	button.disabled = busy;
	button.classList.toggle('loading', busy);
}; //end set_busy

/** Whether an action button's job is in flight (set_busy). */
const is_busy = (button) => button.classList.contains('loading');

/**
 * JOB_ROW_OF_KIND
 * Whether one row of dd_utils_api::get_activity (src/core/api/activity.ts
 * ActivityRow) is a job of `job_kind` (`<tool>_<action>`, the kind
 * src/core/tools/background.ts submits). "Check my jobs" lists only these, and
 * an EMPTY list is what offers the operator a new attempt — so a rule that
 * stopped matching would offer a second commit beside a running first one.
 * ActivityRow carries no kind field today (job_id is documented opaque), so
 * this reads the job manager's id grammar `<kind>_<pid>_<counter>`
 * (media/jobs.ts nextId). Not a convention trusted on faith: the gate
 * test/unit/acquisition_job_activity_native.test.ts runs REAL background jobs
 * through scheduleBackground and feeds their rows to THIS function — a server
 * rename turns it red.
 * @param {Object} row - one get_activity row
 * @param {string} job_kind
 * @returns {boolean}
 */
export const job_row_of_kind = function (row, job_kind) {
	if (row?.source !== 'media' || typeof row.job_id !== 'string') {
		return false;
	}
	const pattern = new RegExp(
		'^' + String(job_kind).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_\\d+_\\d+$',
	);
	return pattern.test(row.job_id);
}; //end job_row_of_kind

/**
 * JOB_ROW_FOLLOW_HANDLE
 * The get_process_status handle of one get_activity job row: the pfile is
 * `<job id>.json` (background.ts); the pid is only a label on that wire
 * (process_status.ts reads the pfile). Gated with job_row_of_kind.
 * @param {Object} row - one get_activity row (job_row_of_kind true)
 * @returns {{pid: string, pfile: string}}
 */
export const job_row_follow_handle = function (row) {
	return { pid: row.job_id, pfile: row.job_id + '.json' };
}; //end job_row_follow_handle

/**
 * EDIT
 * @param {Object} options - options.render_level {string} 'full' | 'content'
 * @returns {Promise<HTMLElement>}
 */
render_tool_bibliography_acquisition.prototype.edit = async function (options) {
	const self = this;

	const render_level = options.render_level || 'full';

	const content_data = get_content_data(self);
	if (render_level === 'content') {
		return content_data;
	}

	const wrapper = ui.tool.build_wrapper_edit(self, {
		content_data: content_data,
	});

	return wrapper;
}; //end edit

/**
 * BUILD_PUBLICATION_ROW
 * One review-list row: an include checkbox (checked by default) plus a short
 * label. Returns the row with `.checkbox`/`.publication` attached so the
 * Confirm handler can read back the kept publications directly.
 * @param {Object} publication - one ExtractedPublication
 * @returns {HTMLElement}
 */
const build_publication_row = function (publication) {
	const row = ui.create_dom_element({
		element_type: 'div',
		class_name: 'lot_row',
	});

	const checkbox = ui.create_dom_element({
		element_type: 'input',
		type: 'checkbox',
		parent: row,
	});
	checkbox.checked = true;

	const authors = Array.isArray(publication.authors) ? publication.authors.join('; ') : '';
	const label_text =
		(publication.title || '(untitled)') +
		(authors ? ' — ' + authors : '') +
		(publication.publicationDate ? ' (' + publication.publicationDate + ')' : '') +
		(publication.pages ? ', pp. ' + publication.pages : '');

	ui.create_dom_element({
		element_type: 'label',
		text_content: label_text,
		parent: row,
	});

	row.checkbox = checkbox;
	row.publication = publication;

	return row;
}; //end build_publication_row

/**
 * GET_CONTENT_DATA
 * Builds the tool body: URL input + Preview, the HTML-upload fallback, and
 * the result container.
 * @param {Object} self - the tool_bibliography_acquisition instance
 * @returns {HTMLElement}
 */
const get_content_data = function (self) {
	const fragment = new DocumentFragment();

	const url_row = ui.create_dom_element({
		element_type: 'div',
		class_name: 'url_row',
		parent: fragment,
	});
	const url_input = ui.create_dom_element({
		element_type: 'input',
		type: 'text',
		class_name: 'url_input',
		placeholder:
			self.get_tool_label('url_placeholder') ||
			"Paste a journal's OAI-PMH URL (or a normal OJS article/journal URL)",
		parent: url_row,
	});
	const preview_button = ui.create_dom_element({
		element_type: 'button',
		class_name: 'primary',
		inner_html: escape_html(self.get_tool_label('preview') || 'Preview'),
		parent: url_row,
	});

	// A COMMIT whose outcome is not KNOWN yet — in flight, status lost, its
	// dispatch unanswered — is TOOL state, not the state of one Confirm node.
	// A new Preview rebuilds result_container, which holds the review, its
	// disabled Confirm and the commit's own unknown-outcome panel: before this
	// flag, re-running Preview while a commit was outstanding destroyed that
	// panel and rendered a NEW, ENABLED Confirm, whose click started a second
	// commit beside the first. Set when a commit dispatches; cleared only by
	// that commit's on_settle (a known outcome, or the operator's explicit
	// re-enable). While set, Preview is disabled and its handler refuses.
	let commit_outstanding = false;
	const set_commit_outstanding = function (value) {
		commit_outstanding = value;
		preview_button.disabled = value || is_busy(preview_button);
	};
	// Preview's own job settled: it re-arms, unless a commit is outstanding.
	const release_preview = function () {
		set_busy(preview_button, false);
		preview_button.disabled = commit_outstanding;
	};
	// Preview and a commit EXCLUDE each other, both ways. Preview refuses while
	// a commit is outstanding (above); a Confirm refuses while this is true —
	// a commit outstanding (from any review) OR a Preview in flight, whose
	// answer rebuilds result_container: a commit started inside that window
	// had its panel detached and a new, ENABLED Confirm drawn beside it.
	const action_in_flight = () => commit_outstanding || is_busy(preview_button);

	// Manual-fetch fallback for a source that blocks this tool's own automated
	// fetch (server/index.ts previewHtml — confirmed live: OJS article landing
	// pages sit behind a Cloudflare challenge). The operator saves the OAI-PMH
	// XML response themselves and picks the file here; read client-side via
	// FileReader, never written to disk anywhere in this pipeline.
	const html_upload_row = ui.create_dom_element({
		element_type: 'div',
		class_name: 'html_upload_row',
		parent: fragment,
	});
	ui.create_dom_element({
		element_type: 'label',
		class_name: 'html_file_label',
		text_content:
			self.get_tool_label('html_file_label') ||
			'Or upload a saved OAI-PMH response (for sources that block automated fetching) — URL above still required:',
		parent: html_upload_row,
	});
	const html_file_input = ui.create_dom_element({
		element_type: 'input',
		type: 'file',
		accept: '.xml,.html,.htm,text/xml,application/xml,text/html',
		class_name: 'html_file_input',
		parent: html_upload_row,
	});
	let selected_html = null;
	html_file_input.addEventListener('change', function () {
		const file = html_file_input.files && html_file_input.files[0];
		if (!file) {
			selected_html = null;
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			selected_html = typeof reader.result === 'string' ? reader.result : null;
		};
		reader.onerror = () => {
			selected_html = null;
			console.error('[tool_bibliography_acquisition] could not read the selected file.');
		};
		reader.readAsText(file);
	});

	const result_container = ui.create_dom_element({
		element_type: 'div',
		class_name: 'result_container',
		parent: fragment,
	});

	// One readable sentence from an error wire body ({code, message, label_key, ...}):
	// the translated label via error_text, plus the server's own message when it says
	// more (e.g. the real OAI-PMH reason behind a generic 'not found' label). Always
	// rendered as text_content, never markup.
	const error_body_text = function (body) {
		if (!body || typeof body !== 'object') {
			return String(body ?? '');
		}
		const label = error_text(body);
		return typeof body.message === 'string' && body.message.length && body.message !== label
			? label + ': ' + body.message
			: label;
	};

	// One failure line: the ApiError (or wire body) label-first via error_body_text,
	// the tool's generic sentence only when there is nothing coded to say.
	const render_error = function (api_error) {
		return ui.create_dom_element({
			element_type: 'div',
			class_name: 'error_message',
			text_content:
				error_body_text(api_error) ||
				self.get_tool_label('request_failed') ||
				'The request failed.',
		});
	};

	// Drives ONE background job (preview_url or commit_publications) from its initial
	// {pid, pfile} dispatch to its terminal frame, rendering live progress via
	// render_stream in between. on_success(data) gets the unwrapped terminal
	// payload and appends into `container` itself; on_settle() fires exactly
	// once, when the job's outcome is KNOWN (a dispatch the server REFUSED, or a
	// terminal frame read) or on the operator's EXPLICIT re-enable — never by
	// itself while the job may still run or may have run: not on a lost
	// status (render_status_lost), not on a dispatch whose own outcome is
	// unknown (render_dispatch_unknown). `job_kind` is the server's job kind
	// (`<tool>_<action>`, src/core/tools/background.ts) — how the operator's own
	// jobs of THIS action are told apart in get_activity.
	// `unknown_on_uncoded_end` (a job that WRITES): a terminal frame with no
	// coded `error`, no result envelope and an `errors[]` line — an interrupted
	// job (its server process died), a stopped one that had started, a pfile
	// the server no longer finds — ended WITHOUT saying what it did; it may
	// have done part of its work. That is not a known outcome: the frame is
	// stated and re-arming is the operator's EXPLICIT decision, never
	// automatic. (A job stopped before it started ends with no line: nothing
	// ran, it settles.) A read-only job (Preview) leaves it off: running it
	// again changes nothing.
	const stream_background_job = function (options) {
		const dispatch_promise = options.dispatch_promise;
		const container = options.container;
		const stream_id = options.stream_id;
		const job_kind = options.job_kind;
		const unknown_on_uncoded_end = options.unknown_on_uncoded_end === true;
		const on_success = options.on_success;
		const on_settle = options.on_settle;

		// The job ENDED but said nothing about what it did (see
		// unknown_on_uncoded_end): its own lines, a way to check, and an
		// explicit re-enable.
		const render_ended_unknown = function (lines) {
			ui.create_dom_element({
				element_type: 'div',
				class_name: 'error_message job_ended_unknown',
				text_content:
					self.get_tool_label('job_ended_unknown') ||
					'The job ended without saying what it did; it may have done part of its work. Check the records before starting it again.',
				parent: container,
			});
			for (const line of lines) {
				ui.create_dom_element({
					element_type: 'div',
					class_name: 'error_message job_end_line',
					text_content: line,
					parent: container,
				});
			}
			const enable_button = ui.create_dom_element({
				element_type: 'button',
				class_name: 'button_enable_again',
				text_content:
					self.get_tool_label('job_enable_after_unknown_end') ||
					'I have checked: allow a new attempt',
				parent: container,
			});
			enable_button.type = 'button';
			enable_button.addEventListener('click', function (e) {
				e.stopPropagation();
				enable_button.remove();
				if (on_settle) on_settle();
			});
		};

		// Follows ONE job — by the handle its dispatch answered, or one the
		// operator picked from their own jobs — to its terminal frame.
		const track_job = function (pid, pfile) {
			// The status stream ended BEFORE the job's terminal frame (it was
			// cut, could not be opened, or went silent past the idle limit): the
			// server job may still be running. The action button stays disabled —
			// on_settle is NOT called — because a second click would start a
			// SECOND job beside the first (a duplicate commit). "Check again"
			// reopens the SAME job's status; the server always ends a job's stream
			// with a terminal frame, including for a vanished or interrupted job
			// (src/core/api/process_status.ts), so the operator always has a way
			// out that does not guess.
			const render_status_lost = function (error, idle) {
				ui.create_dom_element({
					element_type: 'div',
					class_name: 'error_message job_status_lost',
					text_content: (
						self.get_tool_label('job_status_lost') ||
						'Lost the job status; the job may still be running (process {pid}).'
					).replace('{pid}', pid),
					parent: container,
				});
				if (idle) {
					ui.create_dom_element({
						element_type: 'div',
						class_name: 'error_message job_status_idle',
						text_content: (
							self.get_tool_label('job_status_idle') ||
							'The server sent no status for {seconds} seconds.'
						).replace('{seconds}', String(Math.round(status_idle_limit_ms / 1000))),
						parent: container,
					});
				}
				if (error) {
					container.appendChild(render_error(error));
				}
				const check_button = ui.create_dom_element({
					element_type: 'button',
					class_name: 'button_check_job',
					text_content: self.get_tool_label('job_check_again') || 'Check again',
					parent: container,
				});
				check_button.type = 'button';
				check_button.addEventListener('click', function (e) {
					e.stopPropagation();
					follow_job();
				});
			};

			// Opens the job's status stream and reads it to its terminal frame
			// (render_stream resets the container on every opening).
			const follow_job = function () {
				const render_response = render_stream({
					container: container,
					id: stream_id,
					pid: pid,
					pfile: pfile,
				});

				let final_rendered = false;
				// the terminal frame's errors[] lines when it ended without saying
				// what it did (unknown_on_uncoded_end); null for a known end
				let ended_unknown = null;

				// THE IDLE WATCHDOG. get_process_status sends a frame every
				// update_rate, changed or not, until the terminal one — so silence
				// past status_idle_limit_ms is a dead connection, not a quiet job: a
				// HALF-OPEN socket (a proxy or a NAT that dropped the peer without a
				// FIN) never ends the read, and without this the panel waited
				// forever with no "status lost" and no way out. On expiry the fetch
				// is aborted (still connecting) or the reader released (mid-body);
				// either way the one terminal path below reports the loss.
				const stream_abort = new AbortController();
				let stream_reader = null;
				let idle_timer = null;
				let idle_expired = false;
				const stop_watchdog = () => {
					clearTimeout(idle_timer);
					idle_timer = null;
				};
				const arm_watchdog = () => {
					clearTimeout(idle_timer);
					idle_timer = setTimeout(() => {
						idle_expired = true;
						stream_abort.abort();
						if (stream_reader) {
							release_stream_reader(stream_reader, 'job status stream idle');
						}
					}, status_idle_limit_ms);
				};

				const on_read = (sse_response) => {
					arm_watchdog();
					render_response.update_info_node(sse_response, (info_node) => {
						const is_running = sse_response?.is_running ?? true;

						if (is_running === false && final_rendered === false) {
							final_rendered = true;

							if (!info_node.msg_node) {
								info_node.msg_node = ui.create_dom_element({
									element_type: 'div',
									class_name: 'msg_node done',
									parent: info_node,
								});
							}

							// A FAILED job ends with its coded error ON THE FRAME
							// ({is_running:false, error:{code,…}} — ERRORS_SPEC §5.3,
							// media/jobs.ts frameOf); its `data` is then the last progress
							// payload, never an envelope. Read the frame first.
							const frame_error = normalize_stream_error(sse_response);
							if (frame_error) {
								info_node.msg_node.textContent = '';
								container.appendChild(render_error(frame_error));
								// a session that died mid-job must reach the relogin
								// overlay, not a dead line of text (as render_stream does)
								if (frame_error.code.startsWith('auth.')) {
									handle_api_error(frame_error);
								}
								return;
							}

							// A success ends with the handler's ok() envelope as `data`.
							// Anything else (a stopped job: no error, no result) has
							// nothing to render — and is not "Done.".
							const envelope = sse_response.data;
							const result = envelope && envelope.ok === true ? response_data(envelope) : null;
							if (!result || typeof result !== 'object') {
								info_node.msg_node.textContent =
									self.get_tool_label('job_no_result') || 'The job ended without a result.';
								const lines = Array.isArray(sse_response.errors)
									? sse_response.errors.filter((line) => typeof line === 'string' && line !== '')
									: [];
								if (unknown_on_uncoded_end && lines.length > 0) {
									ended_unknown = lines;
								}
								return;
							}

							info_node.msg_node.textContent = self.get_tool_label('job_done') || 'Done.';
							on_success(result);
							return;
						}

						const frame_msg = sse_response?.data?.msg;
						if (!info_node.msg_node) {
							info_node.msg_node = ui.create_dom_element({
								element_type: 'div',
								class_name: 'msg_node',
								parent: info_node,
							});
						}
						info_node.msg_node.textContent =
							typeof frame_msg === 'string' && frame_msg
								? frame_msg +
									(sse_response.data.total
										? ' (' + sse_response.data.counter + ' of ' + sse_response.data.total + ')'
										: '')
								: self.get_tool_label('job_working') || 'Working…';
					});
				};

				// The stream ended. With the terminal frame read, the job is over:
				// settle. WITHOUT it (a dropped connection, a proxy cut, an idle
				// stream the watchdog released) the job may still be running — say
				// so, not nothing.
				const on_done = () => {
					stop_watchdog();
					render_response.done();
					if (final_rendered) {
						if (ended_unknown !== null) {
							render_ended_unknown(ended_unknown);
							return;
						}
						if (on_settle) on_settle();
						return;
					}
					render_status_lost(null, idle_expired);
				};

				arm_watchdog();
				data_manager
					.request_stream({
						signal: stream_abort.signal,
						body: {
							dd_api: 'dd_utils_api',
							action: 'get_process_status',
							update_rate: STATUS_UPDATE_RATE_MS,
							options: {
								pid: pid,
								pfile: pfile,
							},
						},
					})
					.then(function (stream) {
						stream_reader = data_manager.read_stream(stream, on_read, on_done);
					})
					.catch(function (error) {
						stop_watchdog();
						render_response.done();
						// the watchdog's own abort is the idle loss, not a second error
						render_status_lost(idle_expired ? null : error, idle_expired);
					});
			};

			follow_job();
		}; //end track_job

		// The DISPATCH failed in a way that leaves its outcome UNKNOWN
		// (outcome_unknown: a transport failure — the request may have landed,
		// and the server runs an aborted request to completion — or the server's
		// own idempotency "do not know"). The job may have STARTED, so the action
		// button stays disabled: re-arming it here let the operator's second
		// click mint a NEW idempotency key and start a second job beside the
		// first. The way out reads the server's facts — the operator's own jobs
		// of this kind (find_started_jobs) — instead of guessing.
		const render_dispatch_unknown = function (error, note) {
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
			ui.create_dom_element({
				element_type: 'div',
				class_name: 'error_message job_dispatch_unknown',
				text_content:
					self.get_tool_label('job_dispatch_unknown') ||
					'The server did not confirm whether the job started; it may be running. Check your jobs before starting it again.',
				parent: container,
			});
			if (error) {
				container.appendChild(render_error(error));
			}
			if (note) {
				ui.create_dom_element({
					element_type: 'div',
					class_name: 'error_message job_check_failed',
					text_content: note,
					parent: container,
				});
			}
			const check_button = ui.create_dom_element({
				element_type: 'button',
				class_name: 'button_check_jobs',
				text_content: self.get_tool_label('job_check_mine') || 'Check my jobs',
				parent: container,
			});
			check_button.type = 'button';
			check_button.addEventListener('click', function (e) {
				e.stopPropagation();
				find_started_jobs(error);
			});
		};

		// Reads the operator's own jobs (dd_utils_api::get_activity — live ones,
		// and those that ended in the last minutes) and lists the ones of THIS
		// action. Each can be followed to its end (that, and only that, settles).
		// While one of them is listed — live, or ended recently — nothing else is
		// offered: following it is the answer. With none listed, an EXPLICIT
		// re-enable — the operator's decision on the server's facts, never
		// automatic. A read that fails is not "none": it changes nothing.
		const find_started_jobs = function (dispatch_error) {
			data_manager
				.request({
					body: {
						dd_api: 'dd_utils_api',
						action: 'get_activity',
						options: {},
					},
				})
				.then(function (response) {
					const jobs =
						!request_failed(response) && Array.isArray(response?.jobs) ? response.jobs : null;
					if (jobs === null) {
						render_dispatch_unknown(
							dispatch_error,
							(self.get_tool_label('job_check_failed') || 'Could not read your jobs: {reason}').replace(
								'{reason}',
								error_body_text(response?.error),
							),
						);
						return;
					}
					render_job_candidates(jobs.filter(is_job_of_this_kind));
				});
		};

		// A row of the operator's jobs is one of THIS action's (job_row_of_kind).
		const is_job_of_this_kind = (row) => job_row_of_kind(row, job_kind);

		const render_job_candidates = function (rows) {
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
			ui.create_dom_element({
				element_type: 'div',
				class_name: 'job_candidates_note',
				text_content:
					rows.length > 0
						? self.get_tool_label('job_candidates') || 'Your jobs of this kind (newest first):'
						: self.get_tool_label('job_candidates_none') ||
							'None of your jobs of this kind is running, and none ended in the last minutes.',
				parent: container,
			});
			for (const row of rows) {
				const candidate = ui.create_dom_element({
					element_type: 'div',
					class_name: 'job_candidate',
					text_content:
						String(row.status) +
						' — ' +
						(Number.isFinite(row.started_at) ? new Date(row.started_at).toLocaleTimeString() : '?') +
						' ',
					parent: container,
				});
				const follow_button = ui.create_dom_element({
					element_type: 'button',
					class_name: 'button_follow_job',
					text_content: self.get_tool_label('job_follow') || 'Show this job',
					parent: candidate,
				});
				follow_button.type = 'button';
				follow_button.addEventListener('click', function (e) {
					e.stopPropagation();
					const handle = job_row_follow_handle(row);
					track_job(handle.pid, handle.pfile);
				});
			}
			if (rows.some((row) => row.status === 'running' || row.status === 'queued')) {
				return;
			}
			// A job of this kind ENDED recently: it may be the very attempt whose
			// dispatch went unanswered, and it may have done its work. Following
			// it (above) is the way on — its end settles, or asks — never a
			// blind "it did not start".
			if (rows.length > 0) {
				ui.create_dom_element({
					element_type: 'div',
					class_name: 'job_candidates_ended',
					text_content:
						self.get_tool_label('job_candidates_ended') ||
						'A job of this kind ended recently. Show it to see what it did before starting another.',
					parent: container,
				});
				return;
			}
			// Nothing of this kind is live or ended inside get_activity's recency
			// window. That is all the server can say — not that it "did not
			// start" — so the sentence claims no more, and the decision is the
			// operator's.
			const enable_button = ui.create_dom_element({
				element_type: 'button',
				class_name: 'button_enable_again',
				text_content:
					self.get_tool_label('job_enable_none_recent') ||
					'No job of this kind is running or ended in the last minutes: allow a new attempt anyway',
				parent: container,
			});
			enable_button.type = 'button';
			enable_button.addEventListener('click', function (e) {
				e.stopPropagation();
				while (container.firstChild) {
					container.removeChild(container.firstChild);
				}
				if (on_settle) on_settle();
			});
		};

		dispatch_promise.then(function (response) {
			// (an auth.* refusal here already reached the relogin overlay: the
			// transport publishes every failed request's ApiError page-wide)
			const dispatch_error = request_failed(response) ? response.error : null;
			if (dispatch_error && outcome_unknown(dispatch_error)) {
				render_dispatch_unknown(dispatch_error, null);
				return;
			}
			if (dispatch_error || typeof response?.pid === 'undefined') {
				while (container.firstChild) {
					container.removeChild(container.firstChild);
				}
				container.appendChild(render_error(dispatch_error));
				if (on_settle) on_settle();
				return;
			}

			track_job(response.pid, response.pfile);
		});
	}; //end stream_background_job

	// Builds the series status line, publication checklist, and Confirm button
	// from one successful preview response.
	const build_review = function (
		series,
		series_status,
		publications,
		article_failures,
		truncated_by,
	) {
		const review_container = ui.create_dom_element({
			element_type: 'div',
			class_name: 'review_container',
		});

		if (truncated_by) {
			ui.create_dom_element({
				element_type: 'div',
				class_name: 'error_message',
				text_content: (
					self.get_tool_label('publications_truncated') ||
					'Only the first {count} articles are shown ({more} more were found and left out).'
				)
					.replace('{count}', publications.length)
					.replace('{more}', truncated_by),
				parent: review_container,
			});
		}

		// One {article_id, error} per article whose metadata could not be fetched;
		// error is the whole wire body (server: ojs_oai/error_summary.ts).
		if (Array.isArray(article_failures) && article_failures.length) {
			const failures_node = ui.create_dom_element({
				element_type: 'div',
				class_name: 'error_message',
				text_content: (
					self.get_tool_label('article_failures') ||
					'{failed} article(s) could not be fetched — showing the {count} publications that were.'
				)
					.replace('{failed}', article_failures.length)
					.replace('{count}', publications.length),
				parent: review_container,
			});
			article_failures.forEach(function (failure) {
				ui.create_dom_element({
					element_type: 'div',
					text_content: (self.get_tool_label('article_failure') || 'Article {id}: {reason}')
						.replace('{id}', failure && failure.article_id ? failure.article_id : '?')
						.replace('{reason}', error_body_text(failure ? failure.error : null)),
					parent: failures_node,
				});
			});
		}

		const series_line_text =
			series && series.name
				? (self.get_tool_label('series_prefix') || 'Series: ') +
					series.name +
					(series_status && series_status.exists
						? (
								self.get_tool_label('series_existing') ||
								' (existing record #{id}, will link to it)'
							).replace('{id}', series_status.section_id)
						: self.get_tool_label('series_new') || ' (new — will be created)')
				: self.get_tool_label('series_none') || 'No series info found for this URL.';
		ui.create_dom_element({
			element_type: 'div',
			class_name: 'auction_status',
			text_content: series_line_text,
			parent: review_container,
		});

		// Bulk selection: select all/none, a keyword filter, and a publication
		// YEAR range [from, to] (parsed from publicationDate).
		const selection_toolbar = ui.create_dom_element({
			element_type: 'div',
			class_name: 'selection_toolbar',
			parent: review_container,
		});

		const bulk_group = ui.create_dom_element({
			element_type: 'div',
			class_name: 'toolbar_group bulk_group',
			parent: selection_toolbar,
		});
		const select_all_button = ui.create_dom_element({
			element_type: 'button',
			inner_html: escape_html(self.get_tool_label('select_all') || 'Select all'),
			parent: bulk_group,
		});
		const deselect_all_button = ui.create_dom_element({
			element_type: 'button',
			inner_html: escape_html(self.get_tool_label('deselect_all') || 'Deselect all'),
			parent: bulk_group,
		});

		const keyword_group = ui.create_dom_element({
			element_type: 'div',
			class_name: 'toolbar_group keyword_group',
			parent: selection_toolbar,
		});
		const keyword_input = ui.create_dom_element({
			element_type: 'input',
			type: 'text',
			placeholder: self.get_tool_label('keyword_placeholder') || 'Keyword…',
			parent: keyword_group,
		});
		const include_keyword_button = ui.create_dom_element({
			element_type: 'button',
			inner_html: escape_html(self.get_tool_label('include_matching') || 'Include matching'),
			parent: keyword_group,
		});
		const exclude_keyword_button = ui.create_dom_element({
			element_type: 'button',
			inner_html: escape_html(self.get_tool_label('exclude_matching') || 'Exclude matching'),
			parent: keyword_group,
		});

		const range_group = ui.create_dom_element({
			element_type: 'div',
			class_name: 'toolbar_group range_group',
			parent: selection_toolbar,
		});
		const range_from_input = ui.create_dom_element({
			element_type: 'input',
			type: 'number',
			placeholder: self.get_tool_label('year_from') || 'Year from',
			parent: range_group,
		});
		const range_to_input = ui.create_dom_element({
			element_type: 'input',
			type: 'number',
			placeholder: self.get_tool_label('year_to') || 'to (included)',
			parent: range_group,
		});
		const include_range_button = ui.create_dom_element({
			element_type: 'button',
			inner_html: escape_html(self.get_tool_label('include_range') || 'Include range'),
			parent: range_group,
		});
		const exclude_range_button = ui.create_dom_element({
			element_type: 'button',
			inner_html: escape_html(self.get_tool_label('exclude_range') || 'Exclude range'),
			parent: range_group,
		});

		const selection_count_node = ui.create_dom_element({
			element_type: 'div',
			class_name: 'selection_count',
			parent: selection_toolbar,
		});

		const lot_list = ui.create_dom_element({
			element_type: 'div',
			class_name: 'lot_list',
			parent: review_container,
		});
		if (publications.length === 0) {
			ui.create_dom_element({
				element_type: 'div',
				text_content:
					self.get_tool_label('no_publications_found') || 'No publications found at this URL.',
				parent: lot_list,
			});
		}
		const rows = publications.map(function (publication) {
			const row = build_publication_row(publication);
			lot_list.appendChild(row);
			return row;
		});

		const update_selection_count = function () {
			const kept_count = rows.filter((row) => row.checkbox.checked).length;
			selection_count_node.textContent = kept_count + ' of ' + rows.length + ' selected';
		};
		rows.forEach(function (row) {
			row.checkbox.addEventListener('change', update_selection_count);
		});
		update_selection_count();

		select_all_button.addEventListener('click', function (e) {
			e.stopPropagation();
			rows.forEach((row) => {
				row.checkbox.checked = true;
			});
			update_selection_count();
		});
		deselect_all_button.addEventListener('click', function (e) {
			e.stopPropagation();
			rows.forEach((row) => {
				row.checkbox.checked = false;
			});
			update_selection_count();
		});

		const keyword_matches = function (row, keyword) {
			const authors = Array.isArray(row.publication.authors)
				? row.publication.authors.join(' ')
				: '';
			const haystack = ((row.publication.title || '') + ' ' + authors).toLowerCase();
			return haystack.includes(keyword);
		};
		include_keyword_button.addEventListener('click', function (e) {
			e.stopPropagation();
			const keyword = keyword_input.value.trim().toLowerCase();
			if (!keyword) return;
			rows.forEach((row) => {
				if (keyword_matches(row, keyword)) row.checkbox.checked = true;
			});
			update_selection_count();
		});
		exclude_keyword_button.addEventListener('click', function (e) {
			e.stopPropagation();
			const keyword = keyword_input.value.trim().toLowerCase();
			if (!keyword) return;
			rows.forEach((row) => {
				if (keyword_matches(row, keyword)) row.checkbox.checked = false;
			});
			update_selection_count();
		});

		const year_of = function (row) {
			const match = (row.publication.publicationDate || '').match(/^\d{4}/);
			return match ? Number(match[0]) : null;
		};
		const in_range = function (row, from, to) {
			const year = year_of(row);
			return year !== null && year >= from && year <= to;
		};
		include_range_button.addEventListener('click', function (e) {
			e.stopPropagation();
			const from = Number(range_from_input.value);
			const to = Number(range_to_input.value);
			if (!Number.isFinite(from) || !Number.isFinite(to)) return;
			rows.forEach((row) => {
				if (in_range(row, from, to)) row.checkbox.checked = true;
			});
			update_selection_count();
		});
		exclude_range_button.addEventListener('click', function (e) {
			e.stopPropagation();
			const from = Number(range_from_input.value);
			const to = Number(range_to_input.value);
			if (!Number.isFinite(from) || !Number.isFinite(to)) return;
			rows.forEach((row) => {
				if (in_range(row, from, to)) row.checkbox.checked = false;
			});
			update_selection_count();
		});

		const confirm_button = ui.create_dom_element({
			element_type: 'button',
			class_name: 'primary',
			inner_html: escape_html(self.get_tool_label('confirm_import') || 'Confirm import'),
			parent: review_container,
		});

		const commit_result_container = ui.create_dom_element({
			element_type: 'div',
			class_name: 'commit_result_container',
			parent: review_container,
		});

		// One summary line per publication result. Series/Author resolution and
		// PDF import are all best-effort (server/index.ts) — a failure there is
		// surfaced here rather than rolling back the record itself.
		const build_commit_summary = function (data) {
			const summary = ui.create_dom_element({
				element_type: 'div',
				class_name: 'success_message',
			});
			const results = Array.isArray(data.results) ? data.results : [];
			if (data.stopped) {
				ui.create_dom_element({
					element_type: 'div',
					class_name: 'error_message',
					text_content: (
						self.get_tool_label('commit_stopped') ||
						'Stopped after {done} of {total} publications — the rest were not imported.'
					)
						.replace('{done}', results.length)
						.replace('{total}', data.publications_total || results.length),
					parent: summary,
				});
			}
			results.forEach(function (result) {
				// section_id is null only when the whole publication failed before
				// anything was created (its own transaction rolled back) - review item C1.
				// Each *_error is the error system's wire body ({code, message, ...} — see
				// server/index.ts's toErrorBody(toDedaloError(...)), review item E2), never a
				// bare string, so every read below goes through error_body_text.
				if (result.section_id === null) {
					ui.create_dom_element({
						element_type: 'div',
						class_name: 'error_message',
						text_content: (
							self.get_tool_label('pub_not_imported') || 'Publication {pub} NOT imported: {reason}'
						)
							.replace('{pub}', result.publication_identifier || '?')
							.replace('{reason}', error_body_text(result.error)),
						parent: summary,
					});
					return;
				}
				if (result.skipped) {
					ui.create_dom_element({
						element_type: 'div',
						text_content: (
							self.get_tool_label('pub_skipped') || 'Publication #{id} — already imported, skipped'
						).replace('{id}', result.section_id),
						parent: summary,
					});
					return;
				}
				const series_bit = result.series_section_id
					? (self.get_tool_label('pub_series_linked') || ' — series #{id} ({status})')
							.replace('{id}', result.series_section_id)
							.replace(
								'{status}',
								result.series_created
									? self.get_tool_label('created') || 'created'
									: self.get_tool_label('reused') || 'reused',
							)
					: result.series_error
						? (
								self.get_tool_label('pub_series_not_linked') || ' — series NOT linked: {reason}'
							).replace('{reason}', error_body_text(result.series_error))
						: '';
				const authors_bit =
					result.author_section_ids && result.author_section_ids.length
						? (self.get_tool_label('pub_authors_linked') || ' — authors #{ids}').replace(
								'{ids}',
								result.author_section_ids.join(', #'),
							)
						: result.author_errors && result.author_errors.length
							? (
									self.get_tool_label('pub_authors_not_linked') ||
									' — authors NOT linked: {reasons}'
								).replace('{reasons}', result.author_errors.map(error_body_text).join('; '))
							: '';
				const document_bit = result.document_imported
					? self.get_tool_label('pub_pdf_imported') || ' — PDF imported'
					: result.document_error
						? (
								self.get_tool_label('pub_pdf_not_imported') || ' — PDF NOT imported: {reason}'
							).replace('{reason}', error_body_text(result.document_error))
						: '';
				// Abstract variants the server did NOT write (abstract_skipped): a language the
				// install does not declare, or a second variant for an already-taken slot.
				const abstract_skipped = Array.isArray(result.abstract_skipped)
					? result.abstract_skipped
					: [];
				const abstract_bit = abstract_skipped.length
					? (
							self.get_tool_label('pub_abstract_skipped') || ' — abstract NOT written in: {langs}'
						).replace(
							'{langs}',
							abstract_skipped
								.map(function (item) {
									const reason =
										item.reason === 'duplicate_language'
											? self.get_tool_label('abstract_duplicate_language') ||
												'language already written'
											: self.get_tool_label('abstract_language_not_installed') ||
												'language not installed';
									return (
										(item.lang || self.get_tool_label('abstract_untagged') || 'untagged') +
										' (' +
										reason +
										')'
									);
								})
								.join(', '),
						)
					: '';
				const line =
					(self.get_tool_label('pub_imported') || 'Publication #{id} (fields: {fields})')
						.replace('{id}', result.section_id)
						.replace('{fields}', result.fields_written.join(', ')) +
					series_bit +
					authors_bit +
					document_bit +
					abstract_bit;
				ui.create_dom_element({
					element_type: 'div',
					text_content: line,
					parent: summary,
				});
			});
			return summary;
		};

		confirm_button.addEventListener('click', function (e) {
			e.stopPropagation();
			// its job is in flight (or its outcome is unknown): never a second one.
			// And never while ANOTHER action is: a commit outstanding from an
			// earlier review, or a Preview in flight — its answer replaces this
			// review, the commit's panel with it, and draws a NEW, enabled Confirm
			// (see action_in_flight).
			if (is_busy(confirm_button) || action_in_flight()) {
				return;
			}

			const kept = rows.filter((row) => row.checkbox.checked).map((row) => row.publication);
			if (kept.length === 0) {
				while (commit_result_container.firstChild) {
					commit_result_container.removeChild(commit_result_container.firstChild);
				}
				commit_result_container.appendChild(
					document.createTextNode(
						self.get_tool_label('nothing_kept') ||
							'Every publication is excluded — nothing to import.',
					),
				);
				return;
			}

			set_busy(confirm_button, true);
			set_commit_outstanding(true);

			stream_background_job({
				dispatch_promise: self.commit_publications(kept),
				container: commit_result_container,
				stream_id: 'tool_bibliography_acquisition_commit',
				job_kind: self.model + '_commit_publications',
				// a commit WRITES: an end that does not say what it did is not a
				// known outcome (see stream_background_job)
				unknown_on_uncoded_end: true,
				on_success: (data) => {
					commit_result_container.appendChild(build_commit_summary(data));
				},
				on_settle: () => {
					set_busy(confirm_button, false);
					set_commit_outstanding(false);
				},
			});
		});

		return review_container;
	}; //end build_review

	preview_button.addEventListener('click', function (e) {
		e.stopPropagation();
		// its own job is in flight, or a commit's outcome is not known yet (a
		// new review would replace that commit's disabled Confirm)
		if (is_busy(preview_button) || commit_outstanding) {
			return;
		}

		const url = url_input.value.trim();
		if (!url) {
			while (result_container.firstChild) {
				result_container.removeChild(result_container.firstChild);
			}
			result_container.appendChild(
				document.createTextNode(self.get_tool_label('url_missing') || 'Paste a URL first.'),
			);
			return;
		}

		set_busy(preview_button, true);
		// The review on screen is SUPERSEDED from this click: it leaves now, not
		// when the answer arrives — no stale Confirm stays offered meanwhile
		// (its handler refuses anyway: action_in_flight).
		while (result_container.firstChild) {
			result_container.removeChild(result_container.firstChild);
		}

		// preview_html is a plain (non-backgrounded) request, so a selected
		// file skips stream_background_job and handles its response directly.
		if (selected_html) {
			self
				.preview_html(url, selected_html)
				.then(function (response) {
					release_preview();
					while (result_container.firstChild) {
						result_container.removeChild(result_container.firstChild);
					}
					if (request_failed(response)) {
						result_container.appendChild(render_error(response.error));
						return;
					}
					const data = response_data(response);
					const publications = Array.isArray(data.publications) ? data.publications : [];
					result_container.appendChild(
						build_review(
							data.series || null,
							data.series_status || null,
							publications,
							Array.isArray(data.article_failures) ? data.article_failures : [],
							data.publications_truncated_by || 0,
						),
					);
				})
				.catch(function (error) {
					release_preview();
					console.error('[tool_bibliography_acquisition] preview_html failed:', error);
				});
			return;
		}

		stream_background_job({
			dispatch_promise: self.preview_url(url),
			container: result_container,
			stream_id: 'tool_bibliography_acquisition_preview',
			job_kind: self.model + '_preview_url',
			on_success: (data) => {
				const publications = Array.isArray(data.publications) ? data.publications : [];
				result_container.appendChild(
					build_review(
						data.series || null,
						data.series_status || null,
						publications,
						Array.isArray(data.article_failures) ? data.article_failures : [],
						data.publications_truncated_by || 0,
					),
				);
			},
			on_settle: () => {
				release_preview();
			},
		});
	});

	const content_data = ui.tool.build_content_data(self);
	content_data.appendChild(fragment);

	return content_data;
}; //end get_content_data

// @license-end
