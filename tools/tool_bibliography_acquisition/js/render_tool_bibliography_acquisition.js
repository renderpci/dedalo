// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/

import { request_failed, response_data } from '../../../core/common/js/api_error.js';
import { data_manager } from '../../../core/common/js/data_manager.js';
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
export const render_tool_bibliography_acquisition = () => true; //end render_tool_bibliography_acquisition

/**
 * EDIT
 * @param {Object} options - options.render_level {string} 'full' | 'content'
 * @returns {Promise<HTMLElement>}
 */
render_tool_bibliography_acquisition.prototype.edit = async function (options) {
	const render_level = options.render_level || 'full';

	const content_data = get_content_data(this);
	if (render_level === 'content') {
		return content_data;
	}

	const wrapper = ui.tool.build_wrapper_edit(this, {
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
const build_publication_row = (publication) => {
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
const get_content_data = (self) => {
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
	html_file_input.addEventListener('change', () => {
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
	const error_body_text = (body) => {
		if (!body || typeof body !== 'object') {
			return String(body ?? '');
		}
		const label = error_text(body);
		return typeof body.message === 'string' && body.message.length && body.message !== label
			? label + ': ' + body.message
			: label;
	};

	const render_error = (response, fallback_message) =>
		ui.create_dom_element({
			element_type: 'div',
			class_name: 'error_message',
			text_content: response.error.message || fallback_message,
		});

	// Drives ONE background job (preview_url or commit_publications) from its
	// initial {pid, pfile} dispatch to its terminal frame, rendering live
	// progress via render_stream in between. on_success(data) gets the
	// unwrapped terminal payload and appends into `container` itself;
	// on_settle() always fires exactly once regardless of outcome.
	const stream_background_job = (options) => {
		const dispatch_promise = options.dispatch_promise;
		const container = options.container;
		const stream_id = options.stream_id;
		const on_success = options.on_success;
		const on_settle = options.on_settle;

		dispatch_promise.then((response) => {
			if (request_failed(response) || typeof response.pid === 'undefined') {
				while (container.firstChild) {
					container.removeChild(container.firstChild);
				}
				container.appendChild(
					render_error(response, self.get_tool_label('request_failed') || 'The request failed.'),
				);
				if (on_settle) on_settle();
				return;
			}

			const pid = response.pid;
			const pfile = response.pfile;

			const render_response = render_stream({
				container: container,
				id: stream_id,
				pid: pid,
				pfile: pfile,
			});

			let final_rendered = false;

			const on_read = (sse_response) => {
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

						// The terminal frame's `data` is the handler's whole envelope, so
						// response_data unwraps it the same as an ordinary response.
						if (request_failed(sse_response.data)) {
							info_node.msg_node.textContent = '';
							container.appendChild(
								render_error(
									sse_response.data,
									self.get_tool_label('request_failed') || 'The request failed.',
								),
							);
							return;
						}

						info_node.msg_node.textContent = self.get_tool_label('job_done') || 'Done.';
						on_success(response_data(sse_response.data));
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

			const on_done = () => {
				render_response.done();
				if (on_settle) on_settle();
			};

			data_manager
				.request_stream({
					body: {
						dd_api: 'dd_utils_api',
						action: 'get_process_status',
						update_rate: 1000,
						options: {
							pid: pid,
							pfile: pfile,
						},
					},
				})
				.then((stream) => {
					data_manager.read_stream(stream, on_read, on_done);
				})
				.catch((error) => {
					if (on_settle) on_settle();
					console.error('[tool_bibliography_acquisition] could not open the status stream:', error);
				});
		});
	}; //end stream_background_job

	// Builds the series status line, publication checklist, and Confirm button
	// from one successful preview response.
	const build_review = (series, series_status, publications, article_failures, truncated_by) => {
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
			article_failures.forEach((failure) => {
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
		const rows = publications.map((publication) => {
			const row = build_publication_row(publication);
			lot_list.appendChild(row);
			return row;
		});

		const update_selection_count = () => {
			const kept_count = rows.filter((row) => row.checkbox.checked).length;
			selection_count_node.textContent = kept_count + ' of ' + rows.length + ' selected';
		};
		rows.forEach((row) => {
			row.checkbox.addEventListener('change', update_selection_count);
		});
		update_selection_count();

		select_all_button.addEventListener('click', (e) => {
			e.stopPropagation();
			rows.forEach((row) => {
				row.checkbox.checked = true;
			});
			update_selection_count();
		});
		deselect_all_button.addEventListener('click', (e) => {
			e.stopPropagation();
			rows.forEach((row) => {
				row.checkbox.checked = false;
			});
			update_selection_count();
		});

		const keyword_matches = (row, keyword) => {
			const authors = Array.isArray(row.publication.authors)
				? row.publication.authors.join(' ')
				: '';
			const haystack = ((row.publication.title || '') + ' ' + authors).toLowerCase();
			return haystack.includes(keyword);
		};
		include_keyword_button.addEventListener('click', (e) => {
			e.stopPropagation();
			const keyword = keyword_input.value.trim().toLowerCase();
			if (!keyword) return;
			rows.forEach((row) => {
				if (keyword_matches(row, keyword)) row.checkbox.checked = true;
			});
			update_selection_count();
		});
		exclude_keyword_button.addEventListener('click', (e) => {
			e.stopPropagation();
			const keyword = keyword_input.value.trim().toLowerCase();
			if (!keyword) return;
			rows.forEach((row) => {
				if (keyword_matches(row, keyword)) row.checkbox.checked = false;
			});
			update_selection_count();
		});

		const year_of = (row) => {
			const match = (row.publication.publicationDate || '').match(/^\d{4}/);
			return match ? Number(match[0]) : null;
		};
		const in_range = (row, from, to) => {
			const year = year_of(row);
			return year !== null && year >= from && year <= to;
		};
		include_range_button.addEventListener('click', (e) => {
			e.stopPropagation();
			const from = Number(range_from_input.value);
			const to = Number(range_to_input.value);
			if (!Number.isFinite(from) || !Number.isFinite(to)) return;
			rows.forEach((row) => {
				if (in_range(row, from, to)) row.checkbox.checked = true;
			});
			update_selection_count();
		});
		exclude_range_button.addEventListener('click', (e) => {
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
		const build_commit_summary = (data) => {
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
			results.forEach((result) => {
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
								.map((item) => {
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

		confirm_button.addEventListener('click', (e) => {
			e.stopPropagation();

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

			confirm_button.classList.add('loading');

			stream_background_job({
				dispatch_promise: self.commit_publications(kept),
				container: commit_result_container,
				stream_id: 'tool_bibliography_acquisition_commit',
				on_success: (data) => {
					commit_result_container.appendChild(build_commit_summary(data));
				},
				on_settle: () => {
					confirm_button.classList.remove('loading');
				},
			});
		});

		return review_container;
	}; //end build_review

	preview_button.addEventListener('click', (e) => {
		e.stopPropagation();

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

		preview_button.classList.add('loading');

		// preview_html is a plain (non-backgrounded) request, so a selected
		// file skips stream_background_job and handles its response directly.
		if (selected_html) {
			self
				.preview_html(url, selected_html)
				.then((response) => {
					preview_button.classList.remove('loading');
					while (result_container.firstChild) {
						result_container.removeChild(result_container.firstChild);
					}
					if (request_failed(response)) {
						result_container.appendChild(
							render_error(
								response,
								self.get_tool_label('request_failed') || 'The request failed.',
							),
						);
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
				.catch((error) => {
					preview_button.classList.remove('loading');
					console.error('[tool_bibliography_acquisition] preview_html failed:', error);
				});
			return;
		}

		stream_background_job({
			dispatch_promise: self.preview_url(url),
			container: result_container,
			stream_id: 'tool_bibliography_acquisition_preview',
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
				preview_button.classList.remove('loading');
			},
		});
	});

	const content_data = ui.tool.build_content_data(self);
	content_data.appendChild(fragment);

	return content_data;
}; //end get_content_data

// @license-end
