// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {request_failed, response_data} from '../../../core/common/js/api_error.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {render_stream} from '../../../core/common/js/render_common.js'



/**
* RENDER_TOOL_BIBLIOGRAPHY_ACQUISITION
* preview_url/commit_publications both run as background jobs (server/index.ts)
* and stream progress via stream_background_job below: 1) Preview builds a
* review list (checkbox per publication, nothing written yet), 2) Confirm
* import runs commit_publications and shows the per-record result.
* @module render_tool_bibliography_acquisition
*/
export const render_tool_bibliography_acquisition = function() {

	return true
}//end render_tool_bibliography_acquisition



/**
* EDIT
* @param {Object} options - options.render_level {string} 'full' | 'content'
* @returns {Promise<HTMLElement>}
*/
render_tool_bibliography_acquisition.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	const content_data = get_content_data(self)
	if (render_level==='content') {
		return content_data
	}

	const wrapper = ui.tool.build_wrapper_edit(self, {
		content_data : content_data
	})

	return wrapper
}//end edit



/**
* BUILD_PUBLICATION_ROW
* One review-list row: an include checkbox (checked by default) plus a short
* label. Returns the row with `.checkbox`/`.publication` attached so the
* Confirm handler can read back the kept publications directly.
* @param {Object} publication - one ExtractedPublication
* @returns {HTMLElement}
*/
const build_publication_row = function(publication) {

	const row = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'lot_row'
	})

	const checkbox = ui.create_dom_element({
		element_type	: 'input',
		type			: 'checkbox',
		parent			: row
	})
	checkbox.checked = true

	const authors = Array.isArray(publication.authors) ? publication.authors.join('; ') : ''
	const label_text = (publication.title || '(untitled)') +
		(authors ? ' — ' + authors : '') +
		(publication.publicationDate ? ' (' + publication.publicationDate + ')' : '') +
		(publication.pages ? ', pp. ' + publication.pages : '')

	ui.create_dom_element({
		element_type	: 'label',
		text_content	: label_text,
		parent			: row
	})

	row.checkbox		= checkbox
	row.publication		= publication

	return row
}//end build_publication_row



/**
* GET_CONTENT_DATA
* Builds the tool body: URL input + Preview, the HTML-upload fallback, and
* the result container.
* @param {Object} self - the tool_bibliography_acquisition instance
* @returns {HTMLElement}
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()

		const url_row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'url_row',
			parent			: fragment
		})
		const url_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'url_input',
			placeholder		: self.get_tool_label('url_placeholder') || "Paste a journal's OAI-PMH URL (or a normal OJS article/journal URL)",
			parent			: url_row
		})
		const preview_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			inner_html		: self.get_tool_label('preview') || 'Preview',
			parent			: url_row
		})

	// Manual-fetch fallback for a source that blocks this tool's own automated
	// fetch (server/index.ts previewHtml — confirmed live: OJS article landing
	// pages sit behind a Cloudflare challenge). The operator saves the OAI-PMH
	// XML response themselves and picks the file here; read client-side via
	// FileReader, never written to disk anywhere in this pipeline.
		const html_upload_row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'html_upload_row',
			parent			: fragment
		})
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'html_file_label',
			text_content	: self.get_tool_label('html_file_label') ||
				'Or upload a saved OAI-PMH response (for sources that block automated fetching) — URL above still required:',
			parent			: html_upload_row
		})
		const html_file_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'file',
			accept			: '.xml,.html,.htm,text/xml,application/xml,text/html',
			class_name		: 'html_file_input',
			parent			: html_upload_row
		})
		let selected_html = null
		html_file_input.addEventListener('change', function() {
			const file = html_file_input.files && html_file_input.files[0]
			if (!file) {
				selected_html = null
				return
			}
			const reader = new FileReader()
			reader.onload = () => {
				selected_html = typeof reader.result==='string' ? reader.result : null
			}
			reader.onerror = () => {
				selected_html = null
				console.error('[tool_bibliography_acquisition] could not read the selected file.')
			}
			reader.readAsText(file)
		})

		const result_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'result_container',
			parent			: fragment
		})

		const render_error = function(response, fallback_message) {
			return ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'error_message',
				text_content	: response.error.message || fallback_message
			})
		}

	// Drives ONE background job (preview_url or commit_publications) from its
	// initial {pid, pfile} dispatch to its terminal frame, rendering live
	// progress via render_stream in between. on_success(data) gets the
	// unwrapped terminal payload and appends into `container` itself;
	// on_settle() always fires exactly once regardless of outcome.
		const stream_background_job = function(options) {

			const dispatch_promise	= options.dispatch_promise
			const container			= options.container
			const stream_id			= options.stream_id
			const on_success		= options.on_success
			const on_settle			= options.on_settle

			dispatch_promise.then(function(response) {

				if (request_failed(response) || typeof response.pid==='undefined') {
					while (container.firstChild) {
						container.removeChild(container.firstChild)
					}
					container.appendChild(render_error(response, 'The request failed.'))
					if (on_settle) on_settle()
					return
				}

				const pid	= response.pid
				const pfile	= response.pfile

				const render_response = render_stream({
					container	: container,
					id			: stream_id,
					pid			: pid,
					pfile		: pfile
				})

				let final_rendered = false

				const on_read = (sse_response) => {
					render_response.update_info_node(sse_response, (info_node) => {

						const is_running = sse_response?.is_running ?? true

						if (is_running===false && final_rendered===false) {
							final_rendered = true

							if (!info_node.msg_node) {
								info_node.msg_node = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'msg_node done',
									parent			: info_node
								})
							}

							// The terminal frame's `data` is the handler's whole envelope, so
							// response_data unwraps it the same as an ordinary response.
							if (request_failed(sse_response.data)) {
								info_node.msg_node.textContent = ''
								container.appendChild(render_error(sse_response.data, 'The request failed.'))
								return
							}

							info_node.msg_node.textContent = 'Done.'
							on_success(response_data(sse_response.data))
							return
						}

						const frame_msg = sse_response?.data?.msg
						if (!info_node.msg_node) {
							info_node.msg_node = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'msg_node',
								parent			: info_node
							})
						}
						info_node.msg_node.textContent = (typeof frame_msg==='string' && frame_msg)
							? frame_msg + (sse_response.data.total ? ' (' + sse_response.data.counter + ' of ' + sse_response.data.total + ')' : '')
							: 'Working…'
					})
				}

				const on_done = () => {
					render_response.done()
					if (on_settle) on_settle()
				}

				data_manager.request_stream({
					body : {
						dd_api		: 'dd_utils_api',
						action		: 'get_process_status',
						update_rate	: 1000,
						options		: {
							pid		: pid,
							pfile	: pfile
						}
					}
				})
				.then(function(stream) {
					data_manager.read_stream(stream, on_read, on_done)
				})
				.catch(function(error) {
					if (on_settle) on_settle()
					console.error('[tool_bibliography_acquisition] could not open the status stream:', error)
				})
			})
		}//end stream_background_job

	// Builds the series status line, publication checklist, and Confirm button
	// from one successful preview response.
		const build_review = function(series, series_status, publications, partial_error) {

			const review_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'review_container'
			})

				if (partial_error) {
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'error_message',
						text_content	: 'The journal stopped responding partway through (' + partial_error + ') — showing the ' + publications.length + ' publications fetched before that happened.',
						parent			: review_container
					})
				}

				const series_line_text = series && series.name
					? 'Series: ' + series.name +
						(series_status && series_status.exists
							? ' (existing record rsc212 #' + series_status.section_id + ', will link to it)'
							: ' (new — will be created)')
					: 'No series info found for this URL.'
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'auction_status',
					text_content	: series_line_text,
					parent			: review_container
				})

			// Bulk selection: select all/none, a keyword filter, and a publication
			// YEAR range [from, to] (parsed from publicationDate).
				const selection_toolbar = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'selection_toolbar',
					parent			: review_container
				})

				const bulk_group = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'toolbar_group bulk_group',
					parent			: selection_toolbar
				})
				const select_all_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('select_all') || 'Select all',
					parent			: bulk_group
				})
				const deselect_all_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('deselect_all') || 'Deselect all',
					parent			: bulk_group
				})

				const keyword_group = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'toolbar_group keyword_group',
					parent			: selection_toolbar
				})
				const keyword_input = ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					placeholder		: self.get_tool_label('keyword_placeholder') || 'Keyword…',
					parent			: keyword_group
				})
				const include_keyword_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('include_matching') || 'Include matching',
					parent			: keyword_group
				})
				const exclude_keyword_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('exclude_matching') || 'Exclude matching',
					parent			: keyword_group
				})

				const range_group = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'toolbar_group range_group',
					parent			: selection_toolbar
				})
				const range_from_input = ui.create_dom_element({
					element_type	: 'input',
					type			: 'number',
					placeholder		: self.get_tool_label('year_from') || 'Year from',
					parent			: range_group
				})
				const range_to_input = ui.create_dom_element({
					element_type	: 'input',
					type			: 'number',
					placeholder		: self.get_tool_label('year_to') || 'to (included)',
					parent			: range_group
				})
				const include_range_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('include_range') || 'Include range',
					parent			: range_group
				})
				const exclude_range_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('exclude_range') || 'Exclude range',
					parent			: range_group
				})

				const selection_count_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'selection_count',
					parent			: selection_toolbar
				})

				const lot_list = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'lot_list',
					parent			: review_container
				})
				if (publications.length === 0) {
					ui.create_dom_element({
						element_type	: 'div',
						text_content	: 'No publications found at this URL.',
						parent			: lot_list
					})
				}
				const rows = publications.map(function(publication) {
					const row = build_publication_row(publication)
					lot_list.appendChild(row)
					return row
				})

				const update_selection_count = function() {
					const kept_count = rows.filter((row) => row.checkbox.checked).length
					selection_count_node.textContent = kept_count + ' of ' + rows.length + ' selected'
				}
				rows.forEach(function(row) {
					row.checkbox.addEventListener('change', update_selection_count)
				})
				update_selection_count()

				select_all_button.addEventListener('click', function(e) {
					e.stopPropagation()
					rows.forEach((row) => { row.checkbox.checked = true })
					update_selection_count()
				})
				deselect_all_button.addEventListener('click', function(e) {
					e.stopPropagation()
					rows.forEach((row) => { row.checkbox.checked = false })
					update_selection_count()
				})

				const keyword_matches = function(row, keyword) {
					const authors = Array.isArray(row.publication.authors) ? row.publication.authors.join(' ') : ''
					const haystack = ((row.publication.title || '') + ' ' + authors).toLowerCase()
					return haystack.includes(keyword)
				}
				include_keyword_button.addEventListener('click', function(e) {
					e.stopPropagation()
					const keyword = keyword_input.value.trim().toLowerCase()
					if (!keyword) return
					rows.forEach((row) => {
						if (keyword_matches(row, keyword)) row.checkbox.checked = true
					})
					update_selection_count()
				})
				exclude_keyword_button.addEventListener('click', function(e) {
					e.stopPropagation()
					const keyword = keyword_input.value.trim().toLowerCase()
					if (!keyword) return
					rows.forEach((row) => {
						if (keyword_matches(row, keyword)) row.checkbox.checked = false
					})
					update_selection_count()
				})

				const year_of = function(row) {
					const match = (row.publication.publicationDate || '').match(/^\d{4}/)
					return match ? Number(match[0]) : null
				}
				const in_range = function(row, from, to) {
					const year = year_of(row)
					return year !== null && year >= from && year <= to
				}
				include_range_button.addEventListener('click', function(e) {
					e.stopPropagation()
					const from = Number(range_from_input.value)
					const to = Number(range_to_input.value)
					if (!Number.isFinite(from) || !Number.isFinite(to)) return
					rows.forEach((row) => {
						if (in_range(row, from, to)) row.checkbox.checked = true
					})
					update_selection_count()
				})
				exclude_range_button.addEventListener('click', function(e) {
					e.stopPropagation()
					const from = Number(range_from_input.value)
					const to = Number(range_to_input.value)
					if (!Number.isFinite(from) || !Number.isFinite(to)) return
					rows.forEach((row) => {
						if (in_range(row, from, to)) row.checkbox.checked = false
					})
					update_selection_count()
				})

				const confirm_button = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'primary',
					inner_html		: self.get_tool_label('confirm_import') || 'Confirm import',
					parent			: review_container
				})

				const commit_result_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'commit_result_container',
					parent			: review_container
				})

			// One summary line per publication result. Series/Author resolution and
			// PDF import are all best-effort (server/index.ts) — a failure there is
			// surfaced here rather than rolling back the record itself.
				const build_commit_summary = function(data) {
					const summary = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'success_message'
					})
					const results = Array.isArray(data.results) ? data.results : []
					results.forEach(function(result) {
						if (result.skipped) {
							ui.create_dom_element({
								element_type	: 'div',
								text_content	: 'rsc205 #' + result.section_id + ' — already imported, skipped',
								parent			: summary
							})
							return
						}
						const series_bit = result.series_section_id
							? ' — series rsc212 #' + result.series_section_id +
								(result.series_created ? ' (created)' : ' (reused)')
							: result.series_error
								? ' — series NOT linked: ' + result.series_error
								: ''
						const authors_bit = result.author_section_ids && result.author_section_ids.length
							? ' — authors rsc197 #' + result.author_section_ids.join(', #')
							: result.author_errors && result.author_errors.length
								? ' — authors NOT linked: ' + result.author_errors.join('; ')
								: ''
						const document_bit = result.document_imported
							? ' — PDF imported'
							: result.document_error
								? ' — PDF NOT imported: ' + result.document_error
								: ''
						const line = 'rsc205 #' + result.section_id +
							' (fields: ' + result.fields_written.join(', ') + ')' +
							series_bit + authors_bit + document_bit
						ui.create_dom_element({
							element_type	: 'div',
							text_content	: line,
							parent			: summary
						})
					})
					return summary
				}

				confirm_button.addEventListener('click', function(e) {
					e.stopPropagation()

					const kept = rows
						.filter((row) => row.checkbox.checked)
						.map((row) => row.publication)
					if (kept.length === 0) {
						while (commit_result_container.firstChild) {
							commit_result_container.removeChild(commit_result_container.firstChild)
						}
						commit_result_container.appendChild(
							document.createTextNode('Every publication is excluded — nothing to import.')
						)
						return
					}

					confirm_button.classList.add('loading')

					stream_background_job({
						dispatch_promise	: self.commit_publications(kept),
						container			: commit_result_container,
						stream_id			: 'tool_bibliography_acquisition_commit',
						on_success			: (data) => {
							commit_result_container.appendChild(build_commit_summary(data))
						},
						on_settle			: () => {
							confirm_button.classList.remove('loading')
						}
					})
				})

			return review_container
		}//end build_review

		preview_button.addEventListener('click', function(e) {
			e.stopPropagation()

			const url = url_input.value.trim()
			if (!url) {
				while (result_container.firstChild) {
					result_container.removeChild(result_container.firstChild)
				}
				result_container.appendChild(document.createTextNode('Paste a URL first.'))
				return
			}

			preview_button.classList.add('loading')

			// preview_html is a plain (non-backgrounded) request, so a selected
			// file skips stream_background_job and handles its response directly.
			if (selected_html) {
				self.preview_html(url, selected_html).then(function(response) {
					preview_button.classList.remove('loading')
					while (result_container.firstChild) {
						result_container.removeChild(result_container.firstChild)
					}
					if (request_failed(response)) {
						result_container.appendChild(render_error(response, 'The request failed.'))
						return
					}
					const data = response_data(response)
					const publications = Array.isArray(data.publications) ? data.publications : []
					result_container.appendChild(build_review(data.series || null, data.series_status || null, publications, data.partial_error || null))
				}).catch(function(error) {
					preview_button.classList.remove('loading')
					console.error('[tool_bibliography_acquisition] preview_html failed:', error)
				})
				return
			}

			stream_background_job({
				dispatch_promise	: self.preview_url(url),
				container			: result_container,
				stream_id			: 'tool_bibliography_acquisition_preview',
				on_success			: (data) => {
					const publications = Array.isArray(data.publications) ? data.publications : []
					result_container.appendChild(build_review(data.series || null, data.series_status || null, publications, data.partial_error || null))
				},
				on_settle			: () => {
					preview_button.classList.remove('loading')
				}
			})
		})

		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)

	return content_data
}//end get_content_data



// @license-end
