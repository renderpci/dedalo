// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {request_failed, response_data} from '../../../core/common/js/api_error.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {render_stream} from '../../../core/common/js/render_common.js'



/**
* RENDER_TOOL_NUMISDATA_ACQUISITION
* preview_url/commit_lots both run as background jobs (server/index.ts) and
* stream progress via stream_background_job below: 1) Preview builds a
* review list (checkbox per lot, nothing written yet), 2) Confirm import
* runs commit_lots and shows the per-lot result.
* @module render_tool_numisdata_acquisition
*/
export const render_tool_numisdata_acquisition = function() {

	return true
}//end render_tool_numisdata_acquisition



/**
* EDIT
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
* One review-list row: an include checkbox (checked by default) plus a short
* label. Returns the row with `.checkbox`/`.lot` attached so the Confirm
* handler can read back the kept lots directly.
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
* DETECT_URL_FROM_HTML
* Best-effort: a saved page's own URL, read from <link rel="canonical">,
* <meta property="og:url">, or <base href> (in that order) — all things a
* browser's "Save As… Webpage, HTML only" preserves — so preview_html's
* manual-upload path doesn't need the operator to retype it. Null if none
* are present.
* @param {string} html
* @returns {string|null}
*/
const detect_url_from_html = function(html) {

	let doc
	try {
		doc = new DOMParser().parseFromString(html, 'text/html')
	} catch (error) {
		return null
	}

	const canonical = doc.querySelector('link[rel="canonical"]')
	const canonical_href = canonical ? canonical.getAttribute('href') : null
	if (canonical_href) return canonical_href

	const og_url = doc.querySelector('meta[property="og:url"]')
	const og_url_content = og_url ? og_url.getAttribute('content') : null
	if (og_url_content) return og_url_content

	const base = doc.querySelector('base[href]')
	const base_href = base ? base.getAttribute('href') : null
	if (base_href) return base_href

	return null
}//end detect_url_from_html



/**
* SEARCH_COMPANIES
* Searches real rsc106 (Entity) records by name through the engine's normal
* read/search API — the same picker mechanism the ontology's own autocomplete
* widgets use (dd_core_api / action:'read' / source.action:'search') — rather
* than trusting the auction house name scraped off the page as free text.
* Runs with the CALLING user's session, so it only sees Entities they can
* read (server/index.ts's own dedup check runs the equivalent SQO with the
* same principal).
* @param {string} name - the name to search for (contains-match)
* @returns {Promise<Array<{section_id:number, name:string}>>}
*/
const search_companies = async function(name) {

	const rqo = {
		dd_api	: 'dd_core_api',
		action	: 'read',
		source	: {
			action			: 'search',
			model			: 'section',
			tipo			: 'rsc106',
			section_tipo	: 'rsc106',
			mode			: 'list',
			lang			: page_globals.dedalo_data_lang
		},
		// Explicit ddo_map: rsc106 has no ontology-configured search view of its
		// own, and without this the response would carry matched section_ids
		// with no name to show for them.
		show : {
			ddo_map : [{ tipo: 'rsc116', parent: 'self', section_tipo: 'self' }]
		},
		sqo : {
			section_tipo	: ['rsc106'],
			limit			: 10,
			filter			: {
				$and : [{
					q		: name,
					path	: [{ section_tipo: 'rsc106', component_tipo: 'rsc116' }]
				}]
			}
		}
	}

	const api_response = await data_manager.request({ body: rqo })
	if (request_failed(api_response)) {
		console.error('[tool_numisdata_acquisition] company search failed:', api_response)
		return []
	}

	// The read envelope is a FLAT array: one 'sections' entry naming every
	// matched section_id (in order), then one entry per (row, shown component)
	// pair — correlated back to its row via row_section_id (confirmed against
	// a real captured list-mode search response, test/parity/fixtures/
	// oracle_harvest/sqo_differential.json).
	const data = response_data(api_response)
	const rows = Array.isArray(data && data.data) ? data.data : []

	const sections_entry = rows.find((item) => item && item.typo==='sections')
	const row_ids = (sections_entry && Array.isArray(sections_entry.entries))
		? sections_entry.entries.map((entry) => entry.section_id)
		: []

	const name_by_row_id = new Map()
	rows.forEach(function(item) {
		if (!item || item.tipo!=='rsc116' || item.row_section_id===undefined) return
		const first = Array.isArray(item.entries) ? item.entries[0] : null
		if (first && typeof first.value==='string' && first.value!=='') {
			name_by_row_id.set(item.row_section_id, first.value)
		}
	})

	return row_ids
		.map((section_id) => ({ section_id: section_id, name: name_by_row_id.get(section_id) || '' }))
		.filter((entry) => Number.isInteger(entry.section_id) && entry.name!=='')
}//end search_companies



/**
* GET_CONTENT_DATA
* Builds the tool body: URL input + Preview, the HTML-upload fallback, and
* the result container.
* @param {Object} self - the tool_numisdata_acquisition instance
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
			placeholder		: self.get_tool_label('url_placeholder') || 'Paste an auction URL (jesusvico.com, biddr.com, aureo.com, numisbids.com, or sixbid.com)',
			parent			: url_row
		})
		const preview_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			inner_html		: self.get_tool_label('preview') || 'Preview',
			parent			: url_row
		})

	// Manual-fetch fallback for a source that blocks this tool's own automated
	// fetch (server/index.ts previewHtml — e.g. numisbids.com). The operator
	// saves the page themselves and picks the file here; read client-side via
	// FileReader, never written to disk anywhere in this pipeline.
		const html_upload_row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'html_upload_row',
			parent			: fragment
		})
		const html_file_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'html_file_label',
			text_content	: self.get_tool_label('html_file_label') ||
				'Or upload a saved HTML page (for sources that block automated fetching) — URL above still required:',
			parent			: html_upload_row
		})
		const html_file_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'file',
			accept			: '.html,.htm,text/html',
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
				// Only fills an EMPTY url_input — never overwrites what's already typed.
				if (selected_html && url_input.value.trim()==='') {
					const detected_url = detect_url_from_html(selected_html)
					if (detected_url) {
						url_input.value = detected_url
					}
				}
			}
			reader.onerror = () => {
				selected_html = null
				console.error('[tool_numisdata_acquisition] could not read the selected file.')
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

	// Drives ONE background job (preview_url or commit_lots) from its initial
	// {pid, pfile} dispatch to its terminal frame, rendering live progress via
	// render_stream in between. on_success(data) gets the unwrapped terminal
	// payload and appends into `container` itself; on_settle() always fires
	// exactly once regardless of outcome.
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
					container.appendChild(render_error(response, self.get_tool_label('request_failed') || 'The request failed.'))
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

							info_node.msg_node.textContent = self.get_tool_label('job_done') || 'Done.'
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
							: (self.get_tool_label('job_working') || 'Working…')
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

	// Builds the auction status line, lot checklist, and Confirm button from
	// one successful preview response.
		const build_review = function(auction, auction_status, lots) {

			const review_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'review_container'
			})

				const auction_line_text = auction
					? (self.get_tool_label('auction_prefix') || 'Auction: ') + (auction.auctionHouse || '?') + ' #' + (auction.auctionNumber || '?') +
						(auction_status && auction_status.exists
							? (self.get_tool_label('auction_existing') || ' (existing record #{id}, will link to it)').replace('{id}', auction_status.section_id)
							: (self.get_tool_label('auction_new') || ' (new — will be created)'))
					: (self.get_tool_label('auction_none') || 'No auction info found for this URL.')
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'auction_status',
					text_content	: auction_line_text,
					parent			: review_container
				})

			// Company resolution: numisdata228 is a REAL relation to rsc106
			// (Entity), not free text — a scraped house name is a guess, an
			// Entity is an authority, so the operator confirms it here rather
			// than the tool silently writing the scraped string (review item 9).
			// `current_company_selection` feeds commit_lots; left null when there
			// is no house name at all (server/index.ts skips Company entirely
			// in that case, same as before).
				let current_company_selection = null
				if (auction && auction.auctionHouse) {

					const company_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'company_resolution',
						parent			: review_container
					})
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'company_resolution_label',
						text_content	: self.get_tool_label('company_label') || 'Company (links the auction to an Entity):',
						parent			: company_container
					})
					const company_name_input = ui.create_dom_element({
						element_type	: 'input',
						type			: 'text',
						class_name		: 'company_name_input',
						parent			: company_container
					})
					company_name_input.value = auction.auctionHouse
					const company_search_button = ui.create_dom_element({
						element_type	: 'button',
						inner_html		: self.get_tool_label('company_search') || 'Search',
						parent			: company_container
					})
					const company_results = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'company_results',
						parent			: company_container
					})

					// One radio option row: label + change listener + optional
					// preselection. Shared by both the candidate loop and the
					// "create new" row below, which otherwise built the identical
					// row/radio/label structure twice.
					const add_company_option = function(radio_name, label_text, preselected, on_select) {
						const option_row = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'company_option',
							parent			: company_results
						})
						const radio = ui.create_dom_element({
							element_type	: 'input',
							type			: 'radio',
							name			: radio_name,
							parent			: option_row
						})
						ui.create_dom_element({
							element_type	: 'label',
							text_content	: label_text,
							parent			: option_row
						})
						radio.addEventListener('change', function() {
							if (radio.checked) on_select()
						})
						if (preselected) {
							radio.checked = true
							on_select()
						}
					}

					// Renders one radio per candidate Entity plus an always-present
					// "create new" option — never auto-picks a candidate unless its
					// name matches exactly (case/accent-loose), matching the
					// server's own exact-match dedup so the preselection and the
					// eventual write agree.
					const render_company_options = function(name, candidates) {
						while (company_results.firstChild) {
							company_results.removeChild(company_results.firstChild)
						}
						const radio_name = 'company_choice_' + Date.now()
						const normalized = name.trim().toLowerCase()
						const exact_match = candidates.find((c) => c.name.trim().toLowerCase()===normalized)

						candidates.forEach(function(candidate) {
							add_company_option(
								radio_name,
								candidate.name + ' (Entity #' + candidate.section_id + ')',
								exact_match!==undefined && candidate.section_id===exact_match.section_id,
								function() { current_company_selection = { section_id: candidate.section_id } }
							)
						})

						add_company_option(
							radio_name,
							(self.get_tool_label('company_create') || 'Create new Entity') + ' "' + name + '"',
							exact_match===undefined,
							function() { current_company_selection = { create: true, name: name } }
						)
					}

					const run_company_search = function() {
						const name = company_name_input.value.trim()
						if (!name) return
						company_search_button.classList.add('loading')
						search_companies(name).then(function(candidates) {
							company_search_button.classList.remove('loading')
							render_company_options(name, candidates)
						})
					}

					company_search_button.addEventListener('click', function(e) {
						e.stopPropagation()
						run_company_search()
					})

					// Auto-run once with the scraped name, so the operator sees a
					// resolved state immediately instead of an empty picker.
					run_company_search()
				}

			// Bulk selection: select all/none, a keyword filter, and a lot-NUMBER
			// range [from, to) — the scraped lot number, not row position.
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
					placeholder		: self.get_tool_label('lot_from') || 'Lot # from',
					parent			: range_group
				})
				const range_to_input = ui.create_dom_element({
					element_type	: 'input',
					type			: 'number',
					placeholder		: self.get_tool_label('lot_to') || 'to (excluded)',
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
				if (lots.length === 0) {
					ui.create_dom_element({
						element_type	: 'div',
						text_content	: self.get_tool_label('no_lots_found') || 'No lots found at this URL.',
						parent			: lot_list
					})
				}
				const rows = lots.map(function(lot) {
					const row = build_lot_row(lot)
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

			// One summary line per lot result. Type only ever links to an EXISTING
			// numisdata3 record (server/index.ts findExistingType never creates
			// one) — a citation found but unmatched is still surfaced so the
			// operator can add it manually if it's worth it.
				const build_commit_summary = function(data) {
					const summary = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'success_message'
					})
					const results = Array.isArray(data.results) ? data.results : []
					results.forEach(function(result) {
						// section_id is null only when the whole lot failed before anything
						// was created (its own transaction rolled back) - review item C1.
						// Each *_error is the error system's wire body ({code, message, ...} — see
						// server/index.ts's toErrorBody(toDedaloError(...)), review item E2), never a
						// bare string, so every read below is `.message`.
						if (result.section_id===null) {
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'error_message',
								text_content	: 'Lot ' + (result.lot_identifier || '?') + ' NOT imported: ' + result.error.message,
								parent			: summary
							})
							return
						}
						const auction_bit = result.auction_section_id
							? ' — auction #' + result.auction_section_id +
								(result.auction_created ? ' (created)' : ' (reused)')
							: result.auction_error
								? ' — auction NOT linked: ' + result.auction_error.message
								: ''
						const type_bit = result.type_section_id
							? ' — type #' + result.type_section_id + ' (' + result.type_citation + ')'
							: result.type_citation
								? ' — type "' + result.type_citation + '" not found in catalog'
								: result.type_error
									? ' — type NOT linked: ' + result.type_error.message
									: ''
						const line = 'Lot #' + result.section_id +
							' (fields: ' + result.fields_written.join(', ') + ')' + auction_bit + type_bit +
							(result.images_created
								? ' — images: ' + result.images_created.join(', ')
								: result.images_error
									? ' — images NOT imported: ' + result.images_error.message
									: '')
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
						.map((row) => row.lot)
					if (kept.length === 0) {
						while (commit_result_container.firstChild) {
							commit_result_container.removeChild(commit_result_container.firstChild)
						}
						commit_result_container.appendChild(
							document.createTextNode(self.get_tool_label('nothing_kept') || 'Every lot is excluded — nothing to import.')
						)
						return
					}

					confirm_button.classList.add('loading')

					stream_background_job({
						dispatch_promise	: self.commit_lots(kept, auction, current_company_selection),
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

		preview_button.addEventListener('click', function(e) {
			e.stopPropagation()

			const url = url_input.value.trim()
			if (!url) {
				while (result_container.firstChild) {
					result_container.removeChild(result_container.firstChild)
				}
				result_container.appendChild(document.createTextNode(
					selected_html
						? (self.get_tool_label('url_not_detected') || "Could not detect this page's URL from the saved file — paste it above manually.")
						: (self.get_tool_label('url_missing') || 'Paste a URL first.')
				))
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
					const lots = Array.isArray(data.lots) ? data.lots : []
					result_container.appendChild(build_review(data.auction || null, data.auction_status || null, lots))
				}).catch(function(error) {
					preview_button.classList.remove('loading')
					console.error('[tool_numisdata_acquisition] preview_html failed:', error)
				})
				return
			}

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

		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)

	return content_data
}//end get_content_data



// @license-end
