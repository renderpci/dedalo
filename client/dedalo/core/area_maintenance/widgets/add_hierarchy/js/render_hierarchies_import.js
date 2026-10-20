// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label */
/*eslint no-undef: "error"*/

/**
* RENDER_HIERARCHIES_IMPORT
* The hierarchy (thesaurus) import block of the Maintenance › add_hierarchy widget:
* a typology-grouped checkbox list of the vendored hierarchy files, an optional
* live filter, the "Import hierarchies" button and the destructive
* "Reset to seed" button.
*
* Every dynamic string (server paths, labels, TLDs, server sentences) is written
* as TEXT (text_content / textContent), never parsed as HTML.
*
* Both endpoints are the CALLER's (`import_request`, `reset_request`): this module
* owns no API surface of its own and refuses to render without them.
*
* Exported symbols:
*   - render_hierarchies_import_block
*/



	import {request_failed, response_data, response_extension} from '../../../../common/js/api_error.js'
// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {error_text} from '../../../../common/js/render_api_error.js'
	import {ui} from '../../../../common/js/ui.js'



/**
* SERVER_TEXT
* The sentence to print for ONE widget API answer.
*
* A FAILURE is an ApiError on the envelope (envelope v2 carries no `msg` on a
* failure): the ONE renderer resolves it (label → English `message` → code).
* A SUCCESS keeps the action's own `msg` EXTENSION KEY (ERRORS_SPEC §3.0), read
* through response_extension so a failure never falls back onto a compat mirror.
* Arrays are joined.
*
* @param {Object} api_response
* @param {string} [fallback]
* @return {string}
*/
const server_text = function(api_response, fallback) {

	if (request_failed(api_response)) {
		return error_text(api_response.error) || (fallback || '')
	}

	const msg = response_extension(api_response, 'msg')
	if (Array.isArray(msg)) {
		return msg.filter(line => line!==null && line!==undefined).join(' | ')
	}

	return (typeof msg==='string' && msg.length) ? msg : (fallback || '')
}//end server_text



/**
* CREATE_STATUS_MSG
* Creates the status message node (gets ok / error / loading classes).
* @param {HTMLElement|DocumentFragment} parent
* @return {HTMLElement} status_node
*/
const create_status_msg = function(parent) {

	const status_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'msg',
		parent			: parent
	})

	return status_node
}//end create_status_msg



/**
* ADD_SPINNER
* Appends a loading row (animated ring + label) to the given parent and returns
* the wrapper so the caller can remove it in one shot. A dedicated class
* (.hierarchy_import_spinner) so it never inherits the global app `.spinner`
* (general.less: position:absolute).
* @param {HTMLElement} parent
* @param {string} [label] loading text (defaults to a localized "Working…")
* @return {HTMLElement} spinner_wrap
*/
const add_spinner = function(parent, label) {

	const spinner_wrap = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'spinner_wrap',
		parent			: parent
	})
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'hierarchy_import_spinner',
		parent			: spinner_wrap
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'spinner_label',
		text_content	: label || get_label.loading || 'Working…',
		parent			: spinner_wrap
	})

	return spinner_wrap
}//end add_spinner



/**
* API_CALL_WITH_SPINNER
* Performs ONE data_manager request with button lock, spinner and status-node state.
* @param {Object} options
* @param {Object} options.body - the request body, sent verbatim (REQUIRED)
* @param {HTMLElement} [options.status_node]
* @param {HTMLElement} [options.button_node]
* @param {number} [options.timeout=10000]
* @param {string} [options.spinner_label]
* @return {Promise<Object>} api_response
*/
const api_call_with_spinner = async function(options) {

	if (!options || !options.body) {
		throw new Error('api_call_with_spinner: options.body is required')
	}

	const status_node	= options.status_node
	const button_node	= options.button_node
	const timeout		= options.timeout ?? 10 * 1000

	// lock button
	if (button_node) {
		button_node.classList.add('loading')
	}

	// reset status + enter loading state (neutral surface for the spinner row)
	if (status_node) {
		status_node.classList.remove('ok', 'error', 'warning')
		status_node.classList.add('loading')
		status_node.textContent = ''
	}

	// add spinner
	const spinner = status_node
		? add_spinner(status_node, options.spinner_label)
		: null

	// API call
	const api_response = await data_manager.request({
		body	: options.body,
		retries	: 1,
		timeout	: timeout
	})

	// unlock button
	if (button_node) {
		button_node.classList.remove('loading')
	}

	// remove spinner + exit loading state
	if (spinner) {
		spinner.remove()
	}
	if (status_node) {
		status_node.classList.remove('loading')
	}

	return api_response
}//end api_call_with_spinner



/**
* RENDER_HIERARCHIES_IMPORT_BLOCK
* Builds the hierarchy import UI.
*
* Hierarchies are grouped by typology and rendered in the SERVER's order (the
* add_hierarchy payload, hierarchy_meta.ts hierarchyChoiceView: by label in the
* user's language collation — the same order the installer shows; never re-sorted
* here). Each hierarchy is a labelled checkbox; pre-checked items come from
* options.default_checked. Already-installed hierarchies carry an 'installed' chip and
* can still be ticked (import skips them; reset re-seeds them).
*
* Hierarchy objects shape (element of options.hierarchies — the server's client view of
* install/import/hierarchy/hierarchy.json, hierarchy_meta.ts hierarchyChoiceView):
*   {
*     label        : {string},  // human-readable name
*     tld          : {string},  // top-level domain identifier, e.g. 'es', 'ca'
*     typology     : {number},  // groups the entry under a typology header
*     has_data     : {boolean}, // false = an EMPTY thesaurus by design (installs with no terms)
*     dependencies : {Array},   // the THESAURI it declares ({tld, mandatory}); ticking it pre-ticks them
*     type         : {string}   // 'model' entries are skipped (definition templates)
*   }
*
* DECLARED THESAURI ARE A RECOMMENDATION, NEVER A LOCK (owner decision 2026-10-10):
* ticking an entry pre-ticks the thesauri it declares; a row some ticked entry declares
* MANDATORY is marked "strongly recommended by: …" and stays editable; unticking it
* shows the warning that it can be installed later.
*
* On "Import hierarchies" the block posts the ticked TLDs to options.import_request; a
* partial failure (per-item `errors`) shows the first one; full success calls
* options.callback. "Reset to seed" posts the ticked, ALREADY-INSTALLED TLDs to
* options.reset_request.
*
* @param {Object} options
* @param {Array}  options.hierarchies                  - All available hierarchy descriptors
* @param {Object} options.import_request               - Import endpoint ({dd_api, action, source}) — REQUIRED
* @param {Object} options.reset_request                - Reset endpoint ({dd_api, action, source}) — REQUIRED
* @param {Array}  [options.default_checked=[]]         - TLD strings pre-checked by default
* @param {Array}  [options.installed_hierarchies=[]]   - lowercase TLDs already imported (marked "installed"; reset-eligible)
* @param {string} [options.hierarchy_files_dir_path=''] - Server path shown for information
* @param {Function} [options.callback]                 - Called with api_response on a successful import/reset
* @param {Array}  [options.hierarchy_typologies=[]]    - Typology group descriptors ({label, typology})
* @param {boolean} [options.show_filter=false]         - Render a live name/TLD text filter above the list
* @returns {DocumentFragment}
*/
export const render_hierarchies_import_block = function(options) {

	// options
		const import_request			= options.import_request || null
		const reset_request				= options.reset_request || null
		if (!import_request) {
			throw new Error('render_hierarchies_import_block: options.import_request is required')
		}
		if (!reset_request) {
			throw new Error('render_hierarchies_import_block: options.reset_request is required')
		}
		const hierarchies				= options.hierarchies || []
		const default_checked			= options.default_checked || []
		// lowercase TLDs whose term data is already imported (marked "installed" + reset-eligible)
		const installed_hierarchies		= options.installed_hierarchies || []
		const hierarchy_files_dir_path	= options.hierarchy_files_dir_path || ''
		const callback					= options.callback
		const hierarchy_typologies		= options.hierarchy_typologies || []
		const show_filter				= options.show_filter===true

	// DocumentFragment
		const fragment = new DocumentFragment();

	// info
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description info',
			text_content	: get_label.import_hierarchies_description || 'It will be displayed in the thesaurus. Keep in mind that large countries can consume a lot of resources. Don\'t load unnecessary countries. You can always load more countries later',
			parent			: fragment
		})

	// source_files: the label, then the server path as its own text node (the path
	// used to be lost whenever the label resolved)
		const source_files = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description source_files',
			text_content	: get_label.import_hierarchies_directory_description || 'Source files directory: ',
			parent			: fragment
		})
		source_files.appendChild( document.createTextNode(hierarchy_files_dir_path) )

	// filter bar (opt-in). A live text box that shows/hides list rows by name or TLD;
	// wired below once the list (and its total) exists.
		let filter_input	= null
		let filter_count	= null
		if (show_filter) {
			const filter_bar = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'hierarchy_filter',
				parent			: fragment
			})
			filter_input = ui.create_dom_element({
				element_type	: 'input',
				class_name		: 'hierarchy_filter_input',
				parent			: filter_bar
			})
			filter_input.type			= 'search'
			filter_input.placeholder	= get_label.filter || 'Filter by name or TLD…'
			filter_input.setAttribute('aria-label', get_label.filter || 'Filter by name or TLD')
			filter_count = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'hierarchy_filter_count dd_badge mono',
				parent			: filter_bar
			})
		}

	// hierarchies
		const hierarchy_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'hierarchy_container',
			parent			: fragment
		})

		// tld → {hierarchy, checkbox, recommend_node, warning_node}: the declared-thesaurus
		// wiring (pre-tick on tick, "strongly recommended" marks) runs over it after the loop.
		const row_by_tld = new Map()

		// TLDs of every checked checkbox: seeded with default_checked rows, then kept in
		// sync by the change handlers (push on check, splice on uncheck).
		const selected_hierarchies = []
		// Count of importable rows actually rendered — the filter's "of N" denominator.
		let total_hierarchies = 0
		const hierarchy_typologies_length = hierarchy_typologies.length
		for (let i = 0; i < hierarchy_typologies_length; i++) {

			const current_hierarchy_typology = hierarchy_typologies[i]

			// Skip typology groups that have no matching hierarchies in the available list.
			const found_hierarchies = hierarchies.filter(el => el.typology === current_hierarchy_typology.typology)
			if(found_hierarchies.length < 1){
				continue
			}

			// typology_label
			ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'typology_label',
				text_content	: current_hierarchy_typology.label,
				parent			: hierarchy_container
			})

			// list of hierarchies
			const hierarchy_ul = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'hierarchy_ul',
				parent			: hierarchy_container
			})

			const hierarchies_len = found_hierarchies.length
			for (let j = 0; j < hierarchies_len; j++) {

				// hierarchy object
					const current_hierarchy = found_hierarchies[j]
					// Skip model-type entries — definition templates, not importable data files.
					if(current_hierarchy.type==='model'){
						continue
					}

				// default check (a recommended thesaurus is pre-checked, never locked)
					const checked = default_checked.includes(current_hierarchy.tld)

				// li element
					const hierarchy_li = ui.create_dom_element({
						element_type	: 'li',
						parent			: hierarchy_ul
					})
					// searchable key for the filter (name + tld), lowercased once here so
					// the input handler stays a cheap substring test.
					hierarchy_li.dataset.search = (current_hierarchy.label + ' ' + current_hierarchy.tld).toLowerCase()
					total_hierarchies++

				// label (the TLD in brackets disambiguates similar display names)
					const hierarchy_label = ui.create_dom_element({
						element_type	: 'label',
						class_name		: 'hierarchy_label',
						text_content	: current_hierarchy.label + ' [' + current_hierarchy.tld + ']',
						parent			: hierarchy_li
					})
					// an EMPTY thesaurus by design (no data files): it installs with no terms
					if (current_hierarchy.has_data===false) {
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'empty_hierarchy dd_badge',
							text_content	: ' ' + (get_label.empty || 'Empty'),
							parent			: hierarchy_label
						})
					}
					if (installed_hierarchies.includes( current_hierarchy.tld.toLowerCase() )) {
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'installed_hierarchy',
							text_content	: get_label.installed || 'installed',
							parent			: hierarchy_label
						})
					}

				// checkbox
					const hierarchy_checkbox = ui.create_dom_element({
						element_type	: 'input',
						type			: 'checkbox',
						class_name		: 'hierarchy_checkbox'
					})
					hierarchy_label.prepend(hierarchy_checkbox)
					hierarchy_checkbox.checked = checked
					// "strongly recommended by: …" + the declined warning — filled by
					// refresh_recommendations (never a lock: a thesaurus never blocks)
					const recommend_node = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'recommended_hierarchy',
						parent			: hierarchy_label
					})
					const warning_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'hierarchy_field_help warning recommended_declined',
						text_content	: get_label.installation_dependency_recommended_warning || 'Not installed now. This thesaurus is strongly recommended: you can install it later from Maintenance › Install hierarchies.',
						parent			: hierarchy_li
					})
					warning_node.hidden = true
					row_by_tld.set(current_hierarchy.tld, {
						hierarchy		: current_hierarchy,
						checkbox		: hierarchy_checkbox,
						recommend_node	: recommend_node,
						warning_node	: warning_node
					})
					hierarchy_checkbox.addEventListener('change', function() {
						if(hierarchy_checkbox.checked){
							selected_hierarchies.push(current_hierarchy.tld)
							// pre-tick the thesauri this one declares (still editable)
							tick_declared(current_hierarchy)
						}else{
							const index = selected_hierarchies.indexOf(current_hierarchy.tld)
							if (index !== -1) selected_hierarchies.splice(index, 1);
						}
						refresh_recommendations()
					})

				// seed selected_hierarchies with the default-checked rows
					if(checked){
						selected_hierarchies.push(current_hierarchy.tld)
					}
			}
		}

	// declared thesauri wiring (hierarchy60 `main: hierarchy1`, owner decision 2026-10-10)
		// The thesauri an entry declares, as the server's view lists them ({tld, mandatory}).
		function declared_of(hierarchy) {
			return Array.isArray(hierarchy.dependencies) ? hierarchy.dependencies : []
		}
		// Ticking an entry PRE-TICKS what it declares (mandatory and optional alike —
		// transitively, through each row's own change handler). Never a lock.
		function tick_declared(hierarchy) {
			for (const dependency of declared_of(hierarchy)) {
				const row = row_by_tld.get(dependency.tld)
				if (row && !row.checkbox.checked) {
					row.checkbox.checked = true
					row.checkbox.dispatchEvent(new Event('change'))
				}
			}
		}
		// Who declares `tld` MANDATORY right now: every TICKED entry.
		function recommenders_of(tld) {
			const by = []
			for (const [other_tld, row] of row_by_tld) {
				if (!row.checkbox.checked) continue
				const declares = declared_of(row.hierarchy).some(el => el.tld===tld && el.mandatory===true)
				if (declares && !by.includes(other_tld)) by.push(other_tld)
			}
			return by
		}
		// The "strongly recommended by: …" mark of every row, and its declined warning
		// (shown while a recommended row is unticked).
		function refresh_recommendations() {
			for (const [tld, row] of row_by_tld) {
				const by = recommenders_of(tld)
				row.recommend_node.textContent = by.length>0
					? ' — ' + (get_label.installation_hierarchy_recommended_by || 'strongly recommended by:') + ' ' + by.join(', ')
					: ''
				row.warning_node.hidden = by.length===0 || row.checkbox.checked
			}
		}
		// initial state: what the pre-ticked rows declare is pre-ticked too
		for (const row of [...row_by_tld.values()]) {
			if (row.checkbox.checked) tick_declared(row.hierarchy)
		}
		refresh_recommendations()

	// filter wiring (opt-in). Substring-matches each row's data-search (name + tld);
	// hides non-matching rows and any typology group left empty, updates the "X / N"
	// count, and toggles a "no matches" note.
		if (show_filter && filter_input) {
			const no_matches = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'hierarchy_no_matches dd_note',
				text_content	: get_label.no_results || 'No hierarchies match the filter.',
				parent			: hierarchy_container
			})
			no_matches.hidden = true

			const apply_filter = function(raw) {
				const query = (raw || '').trim().toLowerCase()
				let visible = 0
				const groups = hierarchy_container.querySelectorAll('.hierarchy_ul')
				groups.forEach(group => {
					let group_visible = 0
					group.querySelectorAll('li').forEach(li => {
						const match = query==='' || (li.dataset.search || '').indexOf(query) !== -1
						li.hidden = !match
						if (match) { visible++; group_visible++ }
					})
					// hide an emptied group together with its typology heading (prev sibling)
					group.hidden = group_visible===0
					const heading = group.previousElementSibling
					if (heading && heading.classList.contains('typology_label')) {
						heading.hidden = group_visible===0
					}
				})
				filter_count.textContent = query==='' ? String(total_hierarchies) : (visible + ' / ' + total_hierarchies)
				no_matches.hidden = visible!==0
			}

			filter_input.addEventListener('input', () => apply_filter(filter_input.value))
			apply_filter('') // seed the count
		}

	// status msg
		const import_hierarchies_status = create_status_msg(fragment)

	// the shared result contract of import and reset: the action's verdict is the
	// payload; `msg` and `errors[]` are its extension keys. Success only when the
	// verdict is true AND no per-item error was recorded.
		const show_result = function(api_response, failure_fallback) {
			const step_errors	= response_extension(api_response, 'errors')
			const ar_errors		= Array.isArray(step_errors) ? step_errors : []
			const ok			= response_data(api_response)===true && ar_errors.length===0
			if (ok) {
				import_hierarchies_status.classList.add('ok')
				import_hierarchies_status.textContent = server_text(api_response)
			}else{
				console.error('hierarchy import errors:', ar_errors, api_response);
				import_hierarchies_status.classList.add('error')
				import_hierarchies_status.textContent = ar_errors.length>0
					? String(ar_errors[0])
					: server_text(api_response, failure_fallback)
			}
			return ok
		}

	// import button
		const import_hierarchies_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary import_hierarchies_button',
			text_content	: get_label.import_hierarchies_button || 'Import hierarchies',
			parent			: hierarchy_container
		})
		import_hierarchies_button.addEventListener('mouseup', fn_import_hierarchies)
		/**
		* FN_IMPORT_HIERARCHIES
		* Refuses an empty selection, asks for confirmation, then posts the ticked TLDs to
		* import_request. On full success the import button is removed and
		* options.callback is called.
		* @returns {Promise<void>}
		*/
		async function fn_import_hierarchies(){

			// empty selection
				if (selected_hierarchies.length<1) {
					alert( get_label.select_a_file || 'Select one or more items' );
					return
				}

			// confirm action
				const confirm_text = selected_hierarchies.length + ' ' + (get_label.hierarchies || 'hierarchies') + '. ' + (get_label.sure || 'Are you sure?')
				if (!confirm( confirm_text )) {
					return
				}

			// lock container
				hierarchy_container.classList.add('loading')

			// API call with spinner
				const api_response = await api_call_with_spinner({
					status_node	: import_hierarchies_status,
					button_node	: import_hierarchies_button,
					timeout		: 600 * 1000, // hierarchy imports can take minutes
					body		: {
						dd_api			: import_request.dd_api,
						action			: import_request.action,
						prevent_lock	: true,
						source			: import_request.source,
						options			: { hierarchies: [...selected_hierarchies] }
					}
				})

			// manage result
				if (show_result(api_response, 'Hierarchy import failed')) {
					import_hierarchies_button.remove()
					if (typeof callback==='function') {
						callback(api_response)
					}
				}

			// unlock container
				hierarchy_container.classList.remove('loading')
		}

	// reset button. DESTRUCTIVE: re-seeds the ticked hierarchies that are ALREADY
	// installed, discarding local edits. Import skips those same rows; reset is the
	// explicit way to force them back to the vendored seed.
		const reset_hierarchies_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'danger reset_hierarchies_button',
			text_content	: get_label.reset_to_seed || 'Reset to seed',
			parent			: hierarchy_container
		})
		reset_hierarchies_button.addEventListener('mouseup', fn_reset_hierarchies)
		/**
		* FN_RESET_HIERARCHIES
		* Re-seed the ticked hierarchies that are already installed. Only installed TLDs
		* are eligible (a non-installed tick is a plain import, not a reset). Requires a
		* strong confirmation because it deletes and re-copies the terms.
		* @returns {Promise<void>}
		*/
		async function fn_reset_hierarchies(){

			// only ticked hierarchies that are ALREADY installed can be reset
				const to_reset = selected_hierarchies.filter(tld => installed_hierarchies.includes(tld.toLowerCase()))
				if (to_reset.length<1) {
					alert( get_label.reset_pick_installed || 'Tick one or more already-installed hierarchies to reset.' )
					return
				}

			// destructive confirmation (lists the TLDs and warns about data loss)
				const warn = (get_label.reset_warning || 'This DELETES and re-imports from the seed, discarding any local edits')
					+ ':\n\n' + to_reset.join(', ') + '\n\n' + (get_label.sure || 'Are you sure?')
				if (!confirm(warn)) {
					return
				}

			// lock container
				hierarchy_container.classList.add('loading')

			// API call with spinner (reset endpoint; TLDs in options.hierarchies)
				const api_response = await api_call_with_spinner({
					status_node	: import_hierarchies_status,
					button_node	: reset_hierarchies_button,
					timeout		: 600 * 1000,
					body		: {
						dd_api			: reset_request.dd_api,
						action			: reset_request.action,
						prevent_lock	: true,
						source			: reset_request.source,
						options			: { hierarchies: to_reset }
					}
				})

			// manage result (same contract as import)
				if (show_result(api_response, 'Hierarchy reset failed')) {
					if (typeof callback==='function') {
						callback(api_response)
					}
				}

			// unlock container
				hierarchy_container.classList.remove('loading')
		}


	return fragment
}//end render_hierarchies_import_block



// @license-end
