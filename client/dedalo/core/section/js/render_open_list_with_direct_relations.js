// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/


// import
	import { ui } from '../../common/js/ui.js'
	import { is_filter_empty } from '../../search/js/search_utils.js'
	import { data_manager } from '../../common/js/data_manager.js'
	import {
		clone,
		open_records_in_window,
		printf
	} from '../../common/js/utils/index.js'



/**
* BUILD_SCOPED_SQO
* Derives the SQO that read_raw must receive for the chosen scope from the
* caller section's CURRENT view SQO.
*
* The caller's SQO describes what the section is showing right now, which in
* edit mode is NOT what either scope means:
*   - `filter_by_locators` holds an auto-generated single-record pin built from
*     the open section_id (see section.js build_rqo_show / navigate_to_new_section);
*   - `limit`/`offset` hold the record's POSITION inside the found set
*     (record 2 of 3 → limit:1, offset:1);
*   - `filter` holds the user's real search, independent of both.
*
* Sending it verbatim made the 'current' scope return nothing: the pin already
* narrows the search to a single row, so a non-zero offset skipped it and the
* server answered with an empty result — the dialog then opened no window and
* said nothing.
*
* @param {Object} sqo - The caller's Search Query Object. Never mutated: the
*   portal caller hands over its parent section's live object.
* @param {string} scope - 'current' | 'found'.
* @returns {Object} A cloned SQO scoped for the read_raw call.
*/
export const build_scoped_sqo = function(sqo, scope) {

	const scoped_sqo = clone(sqo)

	if (scope==='found') {
		// All found records: drop the single-record pin so the user's own
		// filter (sqo.filter) alone decides the set, and take every row —
		// the opened windows re-paginate on their own.
		scoped_sqo.filter_by_locators	= []
		scoped_sqo.limit				= 0
		scoped_sqo.offset				= 0
	}else{
		// Current record only: the pin already selects exactly one row, so any
		// found-set offset would skip it. (Without a pin — a section that is
		// not in edit mode — this degrades to the first found record, which is
		// the closest meaning 'current' can have there.)
		scoped_sqo.limit	= 1
		scoped_sqo.offset	= 0
	}

	return scoped_sqo
}//end build_scoped_sqo



/**
* RENDER_OPEN_LIST_WITH_DIRECT_RELATIONS
* Builds and displays a small modal dialog that lets the user choose how to
* open the related records that point to (or are pointed at by) the caller
* component or section.
*
* Two orthogonal choices are presented:
*   1. Scope — which records to use as the basis of the relationship query:
*        - "current"  : only the record currently open in the editor.
*        - "found"    : every record in the active search result set.
*   2. Target section — when the caller is the main section (fired from the
*      inspector) and it has more than one target, a radio-button group lets
*      the user pick which target section to open.  When the caller is a
*      component the target is already fixed via rqo_options and no radio
*      group is shown.
*
* After the user confirms, the modal delegates to open_related_data() which
* fires a `read_raw` API call and opens each unique target section_tipo in
* its own browser window (via open_records_in_window).
*
* @param {Object} options - Configuration bag passed in by the caller.
* @param {Object} options.sqo - The caller section's CURRENT view Search Query
*   Object.  Must be non-null; the function returns early with console.error
*   otherwise.  Never sent as-is and never mutated: each scope derives its own
*   clone through build_scoped_sqo().
* @param {Array}  options.target_sections - Array of { tipo, label } objects
*   describing every target section the main section points to.  Empty when the
*   caller is a component (no target selection is shown in that case).
* @param {Object} options.rqo_options - Options forwarded to the `read_raw` API
*   action.  Mutated in place when the user picks a target section radio button.
* @param {string} options.rqo_options.type - Scope of the raw-read: 'section',
*   'component', or 'target_section'.
* @param {string|null} options.rqo_options.section_tipo - Caller section tipo
*   ('oh1', …).  Null when the caller is the main section; populated later by
*   the target-section radio handler.
* @param {string|null} options.rqo_options.tipo - Caller component tipo
*   ('oh25', …).  Null when the caller is the main section.
* @param {string} options.rqo_options.model - Model name of the caller, e.g.
*   'section' or 'component_portal'.
* @param {string} options.label - Human-readable label of the caller field,
*   e.g. 'Images'.  Inserted into the modal body via printf.
* @param {number} options.total - The caller's current record count, shown in
*   the body message.  In edit mode this is 1 (the caller's SQO is pinned to the
*   open record), so it is replaced asynchronously by the real found-set total
*   whenever options.self_caller can compute one.
* @param {string} options.caller_tipo - Ontology tipo of the caller
*   ('oh24', 'oh1', …).
* @param {Object} options.self_caller - Reference to the live caller SECTION
*   instance (`options.self` is accepted as a legacy alias).  Forwarded to
*   open_records_in_window so the opened list window can track its opener, and
*   used to recompute the found-records total via its get_total(sqo).
* @returns {void} The function creates and attaches the modal as a side effect;
*   it does not return the modal element to the caller.
*/
export const render_open_list_with_direct_relations = ( options ) => {

	const sqo				= options.sqo
	const target_sections	= options.target_sections || []
	const rqo_options 		= options.rqo_options
	const caller_label		= options.label
	const total_records		= options.total
	const caller_tipo 		= options.caller_tipo
	// self_caller. Callers disagree on the key name (the inspector passes
	// 'self_caller', older code passed 'self'), so accept both — reading only
	// options.self left the caller undefined on every real call site.
	const self_caller		= options.self_caller ?? options.self

	if (!sqo) {
		console.error('Missing SQO in section in its request config object');
		return;
	}

	// open data selection, by default = current.
	// options: current | found
	// This plain object is mutated by the 'change' listener on the radio buttons
	// so that the selected value is always available when the Open button fires.
	const data_selection = {
		selected_value : 'current'
	};

	// Modal
	// Ask user if want this record or all records
	// by default only current record will used.
	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})

		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			text_node		: get_label.open_relationships || 'Open relationships',
			parent			: header
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content body'
		})

		// Build the body prompt with the caller label interpolated via printf.
		// The translated string accepts two positional placeholders:
		//   {0} → caller label (wrapped in <strong> for visual emphasis)
		//   {1} → total found records count
		const bold_caller_label = `<strong>${caller_label}</strong>`
		const raw_body_label = get_label.open_relationships_of_field || 'Open relationships of {0} from the current record (1) or from all found records ({1})?'
		const body_label = printf(raw_body_label, bold_caller_label, total_records)

		const body_label_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: body_label,
			parent			: body
		})

		// found total.
		// options.total is the caller's CURRENT count, which in edit mode is 1
		// (the section SQO is pinned to the open record) — the prompt then read
		// "…or from all found records (1)?". Recompute it from the found-scope
		// SQO and patch the number in when it resolves; the initial render stays
		// synchronous. Only sections expose get_total.
		if (typeof self_caller?.get_total === 'function') {
			self_caller.get_total( build_scoped_sqo(sqo, 'found') )
			.then(found_total => {
				if (found_total===undefined || found_total===null || found_total===total_records) {
					return
				}
				body_label_node.innerHTML = printf(raw_body_label, bold_caller_label, found_total)
			})
			.catch(error => console.error('Failed to resolve the found records total:', error))
		}

		// current or found records
			// Scope selector is rendered BEFORE the (potentially very long) target
			// section list so it is always visible without scrolling.
			// Stores 'current' or 'found' into data_selection.selected_value
			// whenever the user flips the radio.
			const change_mode_handler = (e)=> {
				data_selection.selected_value = e.target.value
			}

			const radio_button_content = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'radio_button_content',
				parent			: body
			})

			// option current_record
				const current_record_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'current_record_label option_row unselectable',
					text_node		: get_label.current_record || 'Current record',
					parent			: radio_button_content
				})

				const current_record_radio = ui.create_dom_element({
					element_type	: 'input',
					type			: 'radio',
					name			: 'data_selection',
					value 			: 'current'
				})
				// "current" is the default safe choice — avoids accidentally opening
				// a potentially enormous result set from all found records.
				current_record_radio.checked = true
				current_record_radio.addEventListener('change', change_mode_handler)
				current_record_label.prepend(current_record_radio)

			// option found_records
				const found_records_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'found_records_label option_row unselectable',
					text_node		: get_label.found_records || 'All found records',
					parent			: radio_button_content
				})

				const found_records_radio = ui.create_dom_element({
					element_type	: 'input',
					type			: 'radio',
					name			: 'data_selection',
					value 			: 'found'
				})
				found_records_radio.addEventListener('change', change_mode_handler)
				found_records_label.prepend(found_records_radio)

		// button_open (built here, slotted into the modal footer below, so that it
		// stays visible while the target section list scrolls)
			const button_open_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button_open_container footer content'
			})

			const button_cancel = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'secondary',
				inner_html		: get_label.cancel || 'Cancel',
				parent			: button_open_container
			})
			button_cancel.addEventListener('mouseup', () => modal.close())

			const button_open = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'success',
				inner_html		: get_label.open || 'Open',
				parent			: button_open_container
			})

		// target sections

			// if the caller is a component
			// or the main section is not connected with any target section
			// don't show the target sections.
			const target_sections_len = target_sections.length
			if(target_sections_len > 0){

				// No target is pre-selected (picking one for the user would open an
				// arbitrary section), so Open stays disabled until the user chooses.
				// Without this the button silently did nothing — open_related_data()
				// returns early when rqo_options.section_tipo is missing.
				button_open.disabled = true

				// target section selected
				// Mutates rqo_options in place so that when Open is clicked the
				// correct section_tipo and tipo are already set for the API call.
				const change_target_section_handler = (e)=> {
					if (rqo_options) {
						rqo_options.section_tipo	= e.target.value
						rqo_options.tipo			= e.target.value
					}
					button_open.disabled = false
				}

				const target_sections_block = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'target_sections_block',
					parent			: body
				})

				const target_sections_header = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'target_sections_header',
					parent			: target_sections_block
				})

				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'target_sections_title',
					text_node		: `${get_label.sections || 'sections'} (${target_sections_len})`,
					parent			: target_sections_header
				})

				const target_sections_content = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'target_sections_content',
					parent			: target_sections_block
				})

				// ar_target_section_nodes. Used by the filter to show/hide rows
				const ar_target_section_nodes = []

				for (let i = 0; i < target_sections_len; i++) {
					const target_section = target_sections[i]

					const target_section_label = ui.create_dom_element({
						element_type	: 'label',
						class_name		: 'target_section_label option_row unselectable',
						text_node		: target_section.label || '',
						parent			: target_sections_content
					})

					const current_target_section_radio = ui.create_dom_element({
						element_type	: 'input',
						type			: 'radio',
						name			: 'target_section',
						value 			: target_section.tipo
					})
					current_target_section_radio.addEventListener('change', change_target_section_handler)
					// Prepend the radio inside the label so clicking the label text
					// also toggles the radio (standard accessible pattern).
					target_section_label.prepend(current_target_section_radio)

					ar_target_section_nodes.push({
						node		: target_section_label,
						search_text	: (target_section.label || '').toLowerCase()
					})
				}

				// filter. Long target lists (a section can point at dozens of others)
				// are unusable without a way to narrow them down.
				if (target_sections_len > 8) {

					const filter_input = ui.create_dom_element({
						element_type	: 'input',
						type			: 'search',
						class_name		: 'target_sections_filter',
						placeholder		: get_label.search || 'Search',
						parent			: target_sections_header
					})

					// empty state. The dialog keeps its height while filtering, so
					// without this a non-matching search reads as a blank panel.
					const no_matches_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'target_sections_empty hide',
						text_node		: get_label.no_sections_match || 'No sections match your search',
						parent			: target_sections_block
					})

					const filter_handler = () => {
						const search_value = filter_input.value.trim().toLowerCase()
						const nodes_len = ar_target_section_nodes.length
						let matches_len = 0
						for (let i = 0; i < nodes_len; i++) {
							const item = ar_target_section_nodes[i]
							// the already selected row is never hidden: Open would
							// otherwise fire on a choice the user cannot see
							const matches = search_value.length===0
								|| item.search_text.includes(search_value)
								|| item.node.querySelector('input').checked
							item.node.classList.toggle('hide', !matches)
							if (matches===true) {
								matches_len++
							}
						}
						no_matches_node.classList.toggle('hide', matches_len>0)
					}
					filter_input.addEventListener('input', filter_handler)

					// Enter confirms the dialog when a target is already selected
					filter_input.addEventListener('keydown', (e) => {
						if (e.key==='Enter' && button_open.disabled===false) {
							e.preventDefault()
							perform_open_related_data()
						}
					})
				}
			}

		// button_open action
			// Thin wrapper so that the modal reference (created below) is already
			// in scope when the mouseup fires, even though modal is defined after.
			const perform_open_related_data = function(){
				open_related_data({
					rqo_options		: rqo_options,
					sqo				: sqo,
					modal			: modal,
					data_selection	: data_selection,
					caller_label	: caller_label,
					self_caller		: self_caller
				})
			}
			button_open.addEventListener('mouseup', perform_open_related_data)

	// modal
		const modal = ui.attach_to_modal({
			header		: header,
			body		: body,
			footer		: button_open_container,
			size		: 'small', // string size big|normal|small
			minimizable	: false,
			callback	: (dd_modal) => {
				dd_modal.classList.add('open_relations_modal')

				// Freeze the dialog at its natural height once rendered.
				// The modal is centered in the viewport, so without this the whole
				// box moves vertically on every keystroke while the user filters the
				// section list (the content shrinks, the centering re-balances).
				// The CSS max-height still caps it, so a smaller viewport wins.
				if (target_sections_len > 0) {
					requestAnimationFrame(() => {
						const modal_content = dd_modal.get_modal_content()
						if (!modal_content) {
							return
						}
						modal_content.style.height = modal_content.getBoundingClientRect().height + 'px'
					})
				}
			}
		})

}// end render_open_list_with_direct_relations



/**
* OPEN_RELATED_DATA
* Issues a `read_raw` API call to retrieve the raw locators (section_tipo +
* section_id pairs) that represent the relationships stored in the caller
* component or section, then opens each unique target section_tipo in its own
* browser window.
*
* Flow:
*   1. Close the modal.  Done FIRST so that every exit path below — the guard,
*      a cancelled confirm(), an empty result — leaves the dialog gone, and so
*      the confirm() is not stacked on top of it.
*   2. Guard: bail out when rqo_options.section_tipo is missing.  Reached when
*      the main-section caller offered no target-section radio at all, so the
*      user could not pick one (the tipo is required by the server-side read_raw
*      handler).  The user is told rather than left with a silent no-op.
*   3. Filter check: call is_filter_empty() on sqo.filter to determine whether
*      the user has an active search filter.  When 'found' is selected without
*      any filter the result could be the entire database; the user is warned via
*      confirm() before proceeding.
*   4. Scope: derive the request SQO with build_scoped_sqo() — the caller's SQO
*      describes the section's current VIEW (a single-record pin plus the
*      record's position in the found set), which is not what either scope means
*      and must not be mutated.
*   5. API call: sends action:'read_raw' with the caller's rqo_options and the
*      scoped sqo.  The server returns an array of locator objects
*      ({ section_tipo, section_id }).
*   6. Window opening: groups locators by unique section_tipo and calls
*      open_records_in_window once per group, staggering each window 30 px to
*      the right/down so they do not completely overlap.
*      Windows are iterated in reverse order so the first target ends on top.
*      An empty group set is reported to the user, not swallowed.
*
* @see src/core/api/handlers/read_raw.ts — the server-side implementation and
*   the full rqo shape.
* @param {Object} options - Options bag.
* @param {Object} options.sqo - The caller section's current view Search Query
*   Object.  Read only: the request is built from a scoped clone of it.
* @param {Object} options.rqo_options - Forwarded verbatim to the `read_raw`
*   API action.  Must contain a non-null section_tipo or the function returns
*   early.
* @param {string} options.caller_label - Human-readable field label used in the
*   confirm() warning message when the filter is empty and 'found' is chosen.
* @param {Object} options.self_caller - Caller instance forwarded to
*   open_records_in_window as the 'caller' context.
* @param {Object} options.data_selection - Selection state object with shape
*   { selected_value: 'current' | 'found' }.
* @param {HTMLElement} options.modal - The dd_modal element created by
*   render_open_list_with_direct_relations.  Closed before any async work to
*   avoid UI blocking.
* @returns {Promise<void>} Resolves after all windows have been opened (or
*   returns false early on validation/API failures or user cancellation).
*/
const open_related_data = async function( options ){

	const sqo				= options.sqo
	const rqo_options		= options.rqo_options
	const caller_label		= options.caller_label
	const self_caller		= options.self_caller
	const data_selection	= options.data_selection
	const modal				= options.modal

	// check if the filter is empty
	// when the user don't find anything, the result can be huge
	// test the sqo filter
	// sqo.filter may be undefined when no search has been run yet; treat that
	// as "empty" (true) so the safeguard confirm() is triggered correctly.
	const filter_empty = sqo.filter
		? is_filter_empty(sqo.filter)
		: true

	// close modal
	// Closed FIRST so every exit path below leaves the dialog gone: the
	// section_tipo guard used to return before this and left the modal stuck
	// open with no way forward. Also avoids stacking chrome under confirm().
	modal.close()

	// Guard: section_tipo is required by the server read_raw handler.
	// Reached when the caller is the main section and no target section could be
	// selected — the radio group is empty (a section with no portals, e.g. in
	// list mode), so the user has nothing to pick and must be told.
	if(!rqo_options.section_tipo){
		alert(get_label.no_target_sections || 'No related sections available')
		return false
	}

	// when the user select 'found', the API will get data from the selected component in all records found
	if( data_selection.selected_value === 'found' ){
		// warning user before execute when no filter is used
		// in this case it could be huge!
		// (!) confirm() is a blocking call — it freezes the tab until the user
		// responds.  This is intentional as a safety gate against accidentally
		// fetching the entire database.
		if(filter_empty === true){

			const raw_label = get_label.will_open_all_related_records || 'This will open all related data of {0} of all records in a new window without filtering. Are you sure?'
			const label = printf(raw_label, caller_label)
			const warning_label =  (get_label.warning || 'WARNING').toUpperCase()
			const msg = warning_label
			+ '\n' + label
			if (!confirm(msg)){
				return false
			}
		}
	}

	// scoped_sqo
	// The caller's sqo describes the section's current view, not the requested
	// scope (see build_scoped_sqo). Derived on a CLONE: the portal caller passes
	// its parent section's live sqo, which must not be re-paginated behind the
	// user's back.
	const scoped_sqo = build_scoped_sqo(sqo, data_selection.selected_value)

	// read_raw from Dédalo API
	// action:'read_raw' asks the server to return raw locator objects for the
	// components or target sections that match the given sqo.
	const rqo = {
		action	: 'read_raw',
		options	: rqo_options,
		sqo		: scoped_sqo
	}

	// perform the search and get the result
	const api_response = await data_manager.request({
		body : rqo
	})

	if (!api_response?.result) {
		console.error('Failed api response:', api_response);
		return false
	}
	//value is the result as an array of locators
	// Each locator has at minimum { section_tipo, section_id }.
	const value = api_response.result

	// section tipo
	// get the target section tipos in the data
	// Deduplicate section tipos so we open exactly one window per target type,
	// even when multiple components point to the same section.
		const ar_section_tipo			= value.map(el => el?.section_tipo).filter(tipo => tipo !== undefined)
		const unique_ar_section_tipo	= [...new Set(ar_section_tipo)];

	// empty case
	// No locators means there is nothing to open. Say so: the loop below would
	// simply not run and the user would be left with a dialog that closed and
	// did nothing.
		if (unique_ar_section_tipo.length < 1) {
			alert(get_label.no_records || 'No records found')
			return false
		}

	// open every target section in different windows
	// Iterate in reverse so that the first entry's window ends up on top
	// (each successive window.open with the same target name re-focuses it).
		const target_sections_len = unique_ar_section_tipo.length
		for (let i = target_sections_len - 1; i >= 0; i--) {
			const current_section_tipo = unique_ar_section_tipo[i]

			// section_id list
			// Collect only the section_ids that belong to this particular target
			// section_tipo, filtering out any entries without a section_id.
			const ar_section_id = value
				.filter(el => el.section_tipo === current_section_tipo && el.section_id)
				.map(el => el.section_id)

			// Stagger each window 30 px right + 30 px down from the previous one
			// (plus 25 px for the macOS menu bar).  This prevents complete overlap.
			const window_options = {
				caller			: self_caller,
				section_tipo	: current_section_tipo,
				ar_section_id	: ar_section_id,
				target_window	: current_section_tipo,
				left			: i*30,
				top				: (i*30)+25 // macOS menu has 25 pixels
			}

			// open_records_in_window
			open_records_in_window( window_options );
			// open_records_in_window(self, current_section_tipo, ar_section_id, current_section_tipo);
		}
}//end open_related_data



// @license-end
