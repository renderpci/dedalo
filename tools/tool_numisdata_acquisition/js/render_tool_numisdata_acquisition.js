// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {request_failed, response_data} from '../../../core/common/js/api_error.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {render_stream} from '../../../core/common/js/render_common.js'



/**
* RENDER_TOOL_NUMISDATA_ACQUISITION
* Client-side render module for tool_numisdata_acquisition. The single
* prototype method `edit` is mixed into the tool via wire_tool() in
* tool_numisdata_acquisition.js.
*
* Two-step body, BOTH steps BACKGROUND JOBS (server/index.ts declares both
* preview_url and commit_lots backgroundRunnable — a multi-page listing
* fetch and a multi-lot commit are each easily 30s-minutes, too slow for one
* synchronous request; observed live, both blew the client's retry window
* and collided with the idempotency lock on the still-running attempt):
*   1. Preview streams live "page X of Y" progress, then builds a REVIEW
*      LIST — one row per lot found, each with an include checkbox, plus an
*      Auction status line (existing vs. will-be-created). Nothing is
*      created by Preview alone.
*   2. Confirm import streams live "record N of TOTAL" progress while
*      commit_lots creates one record per kept lot, then shows the per-lot
*      result.
* Both streams reuse the same data_manager.request_stream + render_stream +
* data_manager.read_stream mechanism tool_import_files' own background
* import job uses (render_tool_import_files.js update_process_status) — see
* stream_background_job below, a minimal shared version of that: no rolling
* time estimate, no IndexedDB resumption, just live progress text and the
* result once the job finishes.
*
* @module render_tool_numisdata_acquisition
*/
export const render_tool_numisdata_acquisition = function() {

	return true
}//end render_tool_numisdata_acquisition



/**
* EDIT
* Entry point for the edit-mode render pipeline. Wired onto the tool prototype
* by wire_tool() in tool_numisdata_acquisition.js.
* @param {Object} options - options.render_level {string} 'full' | 'content'
* @returns {Promise<HTMLElement>}
*/
render_tool_numisdata_acquisition.prototype.edit = async function(options) {

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
* BUILD_LOT_ROW
* One row of the review list: an include checkbox (checked by default) plus
* a short label built from whatever fields the lot actually has. Returns the
* row node with `.checkbox` and `.lot` attached, so the Confirm handler can
* read back which lots stayed checked without a separate lookup table.
* @param {Object} lot - one ExtractedLot
* @returns {HTMLElement}
*/
const build_lot_row = function(lot) {

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

	const snippet = (lot.description || lot.title || '').slice(0, 90)
	const label_text = 'Lot ' + (lot.lotNumber || '?') +
		(lot.weight ? ' — ' + lot.weight : '') +
		(lot.diameter ? ' / ' + lot.diameter : '') +
		(snippet ? ' — ' + snippet : '')

	// TEXT only (DS-1): lot fields are scraped third-party content.
	ui.create_dom_element({
		element_type	: 'label',
		text_content	: label_text,
		parent			: row
	})

	row.checkbox	= checkbox
	row.lot			= lot

	return row
}//end build_lot_row



/**
* GET_CONTENT_DATA
* Builds the tool body: a URL input, a Preview button, and a result container
* the Preview click handler fills with the review list (or an error message,
* via api_error.js's request_failed/response_data — the same accessors every
* other tool client uses).
* @param {Object} self - the tool_numisdata_acquisition instance
* @returns {HTMLElement}
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	// url_input
		const url_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'url_input',
			placeholder		: self.get_tool_label('url_placeholder') || 'Paste an auction URL (jesusvico.com for now)',
			parent			: fragment
		})

	// preview_button
		const preview_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			inner_html		: self.get_tool_label('preview') || 'Preview',
			parent			: fragment
		})

	// result_container
		const result_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'result_container',
			parent			: fragment
		})

	// render_error: shared by every background job's failure paths.
		const render_error = function(response, fallback_message) {
			// error message text: TEXT only (DS-1) — response.error.message is
			// registry/log English, not yet routed through label_key i18n; fine
			// for this v1 diagnostic dump, worth revisiting once this tool has
			// real UI copy.
			return ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'error_message',
				text_content	: response.error.message || fallback_message
			})
		}

	// stream_background_job: drives ONE background tool action (preview_url
	// or commit_lots) from its initial {pid, pfile} dispatch through to its
	// terminal frame — live progress text in between. `on_success(data)` is
	// handed the unwrapped terminal payload and must itself append whatever
	// it wants into `container`; `on_settle()` always fires exactly once,
	// however the job ends (success, failure, or a transport error opening
	// the stream), so callers use it for button-loading cleanup.
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

				// render_stream clears `container` itself and builds its own
				// spinner/progress panel inside it.
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

							// The TERMINAL frame's `data` is the handler's whole envelope
							// (src/core/tools/background.ts — "the RETURN VALUE becomes the
							// final SSE frame's data"), so response_data unwraps it exactly
							// like an ordinary tool_request response — same accessor,
							// same contract, just one frame deep instead of one HTTP call.
							if (request_failed(sse_response.data)) {
								info_node.msg_node.textContent = ''
								container.appendChild(render_error(sse_response.data, 'The request failed.'))
								return
							}

							info_node.msg_node.textContent = 'Done.'
							on_success(response_data(sse_response.data))
							return
						}

						// live progress — sse_response.data is the raw payload
						// publishProgress sent: {msg, counter, total}.
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
					console.error('[tool_numisdata_acquisition] could not open the status stream:', error)
				})
			})
		}//end stream_background_job

	// build_review: assembles the auction status line, the lot checklist, and
	// the Confirm import button, from one successful preview response. Kept
	// as its own function (not inline in the click handler) so the Confirm
	// button's own handler can close over `rows`/`auction` cleanly.
		const build_review = function(auction, auction_status, lots) {

			const review_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'review_container'
			})

			// auction_line
				const auction_line_text = auction
					? 'Auction: ' + (auction.auctionHouse || '?') + ' #' + (auction.auctionNumber || '?') +
						(auction_status && auction_status.exists
							? ' (existing record numisdata224 #' + auction_status.section_id + ', will link to it)'
							: ' (new — will be created)')
					: 'No auction info found for this URL.'
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'auction_status',
					text_content	: auction_line_text,
					parent			: review_container
				})

			// selection_toolbar: bulk selection controls for a review list that can
			// run into the hundreds — hand-clicking every checkbox doesn't scale.
			// Three independent tools, each operating on the already-built `rows`
			// (below): select all / none, a keyword filter (include or exclude
			// every lot whose description/title matches), and a lot-NUMBER range
			// (jesusvico's own scraped number, not row position — those aren't
			// the same thing, per the 24→14799 conversation) — [from, to), the
			// upper bound excluded, matching "191...260, don't include 260".
				const selection_toolbar = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'selection_toolbar',
					parent			: review_container
				})

				const select_all_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('select_all') || 'Select all',
					parent			: selection_toolbar
				})
				const deselect_all_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('deselect_all') || 'Deselect all',
					parent			: selection_toolbar
				})

				const keyword_input = ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					placeholder		: self.get_tool_label('keyword_placeholder') || 'Keyword…',
					parent			: selection_toolbar
				})
				const include_keyword_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('include_matching') || 'Include matching',
					parent			: selection_toolbar
				})
				const exclude_keyword_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('exclude_matching') || 'Exclude matching',
					parent			: selection_toolbar
				})

				const range_from_input = ui.create_dom_element({
					element_type	: 'input',
					type			: 'number',
					placeholder		: self.get_tool_label('lot_from') || 'Lot # from',
					parent			: selection_toolbar
				})
				const range_to_input = ui.create_dom_element({
					element_type	: 'input',
					type			: 'number',
					placeholder		: self.get_tool_label('lot_to') || 'to (excluded)',
					parent			: selection_toolbar
				})
				const include_range_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('include_range') || 'Include range',
					parent			: selection_toolbar
				})
				const exclude_range_button = ui.create_dom_element({
					element_type	: 'button',
					inner_html		: self.get_tool_label('exclude_range') || 'Exclude range',
					parent			: selection_toolbar
				})

				const selection_count_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'selection_count',
					parent			: selection_toolbar
				})

			// lot_list
				const lot_list = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'lot_list',
					parent			: review_container
				})
				if (lots.length === 0) {
					ui.create_dom_element({
						element_type	: 'div',
						text_content	: 'No lots found at this URL.',
						parent			: lot_list
					})
				}
				const rows = lots.map(function(lot) {
					const row = build_lot_row(lot)
					lot_list.appendChild(row)
					return row
				})

			// update_selection_count: refreshed after every bulk action and on
			// every individual checkbox toggle, so the count is never stale on a
			// list this size.
				const update_selection_count = function() {
					const kept_count = rows.filter((row) => row.checkbox.checked).length
					selection_count_node.textContent = kept_count + ' of ' + rows.length + ' selected'
				}
				rows.forEach(function(row) {
					row.checkbox.addEventListener('change', update_selection_count)
				})
				update_selection_count()

			// click: select all / deselect all
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

			// keyword filter — matches against description + title, case-insensitive.
				const keyword_matches = function(row, keyword) {
					const haystack = ((row.lot.description || '') + ' ' + (row.lot.title || '')).toLowerCase()
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

			// lot-number range — [from, to), matching the SCRAPED lot number
			// (row.lot.lotNumber), not the row's position in the list.
				const lot_number_of = function(row) {
					const n = Number(row.lot.lotNumber)
					return Number.isFinite(n) ? n : null
				}
				const in_range = function(row, from, to) {
					const n = lot_number_of(row)
					return n !== null && n >= from && n < to
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

			// confirm_button
				const confirm_button = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'primary',
					inner_html		: self.get_tool_label('confirm_import') || 'Confirm import',
					parent			: review_container
				})

			// commit_result_container
				const commit_result_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'commit_result_container',
					parent			: review_container
				})

			// build_commit_summary: one line per lot result, plus its own
			// Auction outcome — each lot resolves its OWN Auction against a
			// batch-shared cache server-side (server/index.ts
			// resolveAuctionCached), so the outcome is read per result, not
			// once for the whole response.
				const build_commit_summary = function(data) {
					const summary = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'success_message'
					})
					const results = Array.isArray(data.results) ? data.results : []
					results.forEach(function(result) {
						const auction_bit = result.auction_section_id
							? ' — auction numisdata224 #' + result.auction_section_id +
								(result.auction_created ? ' (created)' : ' (reused)')
							: result.auction_error
								? ' — auction NOT linked: ' + result.auction_error
								: ''
						const line = 'numisdata4 #' + result.section_id +
							' (fields: ' + result.fields_written.join(', ') + ')' + auction_bit +
							(result.images_created
								? ' — images: ' + result.images_created.join(', ')
								: result.images_error
									? ' — images NOT imported: ' + result.images_error
									: '')
						ui.create_dom_element({
							element_type	: 'div',
							text_content	: line,
							parent			: summary
						})
					})
					return summary
				}

			// click: confirm import — the only place anything gets written.
				confirm_button.addEventListener('click', function(e) {
					e.stopPropagation()

					const kept = rows
						.filter((row) => row.checkbox.checked)
						.map((row) => row.lot)
					if (kept.length === 0) {
						while (commit_result_container.firstChild) {
							commit_result_container.removeChild(commit_result_container.firstChild)
						}
						commit_result_container.appendChild(
							document.createTextNode('Every lot is excluded — nothing to import.')
						)
						return
					}

					confirm_button.classList.add('loading')

					stream_background_job({
						dispatch_promise	: self.commit_lots(kept, auction),
						container			: commit_result_container,
						stream_id			: 'tool_numisdata_acquisition_commit',
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

	// click: preview — fetches and builds the review list; writes nothing.
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

			stream_background_job({
				dispatch_promise	: self.preview_url(url),
				container			: result_container,
				stream_id			: 'tool_numisdata_acquisition_preview',
				on_success			: (data) => {
					const lots = Array.isArray(data.lots) ? data.lots : []
					result_container.appendChild(build_review(data.auction || null, data.auction_status || null, lots))
				},
				on_settle			: () => {
					preview_button.classList.remove('loading')
				}
			})
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)

	return content_data
}//end get_content_data



// @license-end
