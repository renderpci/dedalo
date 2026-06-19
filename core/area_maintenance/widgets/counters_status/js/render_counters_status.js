// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {open_window, object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_COUNTERS_STATUS
* Client-side render layer for the counters_status area_maintenance widget.
*
* This module owns the visual representation of the PostgreSQL matrix_counter
* audit report produced by counter::check_counters() (PHP). It renders one row
* per section tipo showing:
*   - The ontology tipo identifier (clickable link to open that section in list mode)
*   - The human-readable section label
*   - The current counter value persisted in matrix_counter
*   - The actual highest section_id found in the live data matrix table
*   - A "Fix counter" action button (visible only when the two values diverge —
*     calls consolidate_counter() server-side via counter_action='fix')
*   - A "Reset counter" action button on every data row (calls delete_counter()
*     server-side via counter_action='reset'; requires two confirmation steps
*     because the operation cannot be undone)
*
* Data shape consumed from self.value (populated by counters_status PHP class
* via counter::check_counters()):
* {
*   datalist: Array<{
*     section_tipo:   string   — ontology tipo, e.g. 'oh1'
*     label:          string   — human-readable section name
*     counter_value:  number   — last-issued section_id stored in matrix_counter
*     last_section_id: number  — actual maximum section_id in the data matrix table
*                                (0 when the table is empty or unreachable)
*   }>
*   errors: Array<string>    — diagnostic messages from non-section tipo rows or
*                              DB failures (rendered in a pre block at the top)
* }
*
* A mismatch between counter_value and last_section_id means the counter has
* drifted — typically after a bulk import that bypassed update_counter(). The
* "Fix counter" button calls self.modify_counter() (counters_status.js) which
* posts counter_action='fix' to the server, triggering consolidate_counter().
*
* Exports:
*   render_counters_status  — constructor (prototype used by counters_status.js)
*/



/**
* RENDER_COUNTERS_STATUS
* Constructor for the render prototype. counters_status.js assigns the render
* methods onto the counters_status prototype via prototype delegation so that
* each counters_status instance uses these render functions directly.
* The constructor itself is a no-op; the real work happens in list().
* @returns {boolean} Always true
*/
export const render_counters_status = function() {

	return true
}//end render_counters_status



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param {Object} options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @returns {HTMLElement} wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_counters_status.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* Builds the full audit-report DOM tree for the counters_status widget.
*
* Renders three sections inside a container div:
*   1. A counters_total headline showing the number of matrix_counter rows audited.
*   2. An errors_container (only when self.value.errors is non-empty) showing each
*      error string in a <pre> block. Errors represent non-section tipo counter rows
*      or DB access failures found by counter::check_counters().
*   3. A datalist_container with one row per audited section, prepended by a header
*      row. Each data row shows section_tipo (link), label, counter_value, and
*      last_section_id. When counter_value !== last_section_id the last_section_id
*      cell is decorated with the 'out_of_sync' CSS class and a "Fix counter" button
*      appears. A "Reset counter" button is present on every data row regardless of
*      sync state.
*
* The body_response div is created here and passed into both fn_fix_counter and
* fn_reset_counter closures so that API operation status messages can be written
* into it by modify_counter() (counters_status.js). It is appended to content_data
* at the end of this function after the datalist is fully built.
*
* @param {Object} self - The counters_status instance. Must have self.value (set
*   by get_value API call before render) and self.modify_counter() method
*   (inherited from counters_status.prototype).
* @returns {HTMLElement} content_data - The fully-built widget content node
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value		= self.value || {}
		const datalist	= value.datalist || []
		const errors	= value.errors

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// counters_total
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'counters_total',
			inner_html		: 'Counters total: ' + datalist.length,
			parent			: content_data
		})

	// errors
		if (errors && errors.length>0) {
			const errors_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'errors_container',
				inner_html		: 'Some errors found',
				parent			: content_data
			})
			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'error_pre',
				inner_html		: errors.join('\n'),
				parent			: errors_container
			})
		}

	// body_response
	// Created early so that fn_fix_counter and fn_reset_counter closures can
	// reference it via closure capture. Appended to content_data at the end of
	// this function, after the datalist is built, so it appears below the rows.
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// datalist
		const datalist_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'datalist_container',
			parent			: content_data
		})
		// header

		// list
		// Prepend a synthetic header item so the header row is rendered by the
		// same loop as the data rows, avoiding duplicated DOM-building code.
		// The header item uses type='header' to skip click listeners and action buttons.
			const full_list = [{
				type			: 'header',
				section_tipo	: 'Section tipo',
				label			: 'Section name',
				counter_value	: 'Counter value',
				last_section_id	: 'Last section_id'
			}, ...datalist]
			const full_list_length = full_list.length
			for (let i = 0; i < full_list_length; i++) {

				const item = full_list[i]

				// last_section_id falls back to 'empty' for sections whose data
				// matrix table is empty or could not be read (check_counters returns 0
				// for both; the header item carries the string 'Last section_id').
				const last_section_id	= item.last_section_id || 'empty'
				// out_of_sync: true when the stored counter value diverges from the
				// actual highest section_id in the data table. This drives the
				// 'out_of_sync' CSS class on the last_section_id cell and the
				// visibility of the "Fix counter" button.
				const out_of_sync		= last_section_id!=='empty' && item.counter_value!==last_section_id
				const class_type		= item.type
					? ' ' + item.type
					: ''

				// datalist_item_container
					const ctn_class = item.type==='header' ? ' header' : ''
					const datalist_item_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'datalist_item_container' + ctn_class,
						parent			: datalist_container
					})

				// section_tipo
				// Data rows get a 'link' class and a click listener that opens the
				// section in list mode in a new window named 'section_view'.
					const section_tipo_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column' + class_type,
						inner_html		: item.section_tipo,
						parent			: datalist_item_container
					})
					if (item.type!=='header') {
						section_tipo_node.classList.add('link')
						section_tipo_node.addEventListener('click', function(e) {
							// open a new window
							const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
								tipo	: item.section_tipo,
								mode	: 'list',
								menu	: false
							})
							const new_window = open_window({
								url		: url,
								name	: 'section_view'
							})
						})
					}

				// section_name
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column' + class_type,
						inner_html		: item.label,
						parent			: datalist_item_container
					})

				// counter_value
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column right' + class_type,
						inner_html		: item.counter_value,
						parent			: datalist_item_container
					})

				// last_section_id
				// The 'out_of_sync' CSS class highlights cells where the stored counter
				// value no longer matches the highest section_id in the data matrix.
					const lsid_class = item.type!=='header' && out_of_sync===true
						? ' out_of_sync' + class_type
						: class_type
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column right' + lsid_class,
						inner_html		: last_section_id,
						parent			: datalist_item_container
					})

				// fix_counter_container
				// The "Fix counter" button is shown only on out_of_sync data rows.
				// It calls self.modify_counter() with counter_action='fix', which
				// invokes counter::consolidate_counter() on the server to re-sync the
				// matrix_counter row with the real maximum section_id.
					const fix_counter_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column right fix_counter_container' + class_type,
						parent			: datalist_item_container
					})
					if (item.type==='header') {
						fix_counter_container.insertAdjacentHTML('afterbegin', 'Fix counter')
					}else if(out_of_sync) {
						const button_fix = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'light button_action fix_counter',
							inner_html		: 'Fix counter',
							parent			: fix_counter_container
						})
						button_fix.addEventListener('click', fn_fix_counter)
						async function fn_fix_counter(e) {
							e.stopPropagation()

							// confirm action
								if (!confirm( get_label.sure || 'Sure?' )) {
									return false;
								}

							// lock
								content_data.classList.add('lock')

							// spinner
								const spinner = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'spinner'
								})
								body_response.prepend(spinner)

							// modify_counter
								await self.modify_counter({
									counter_action	: 'fix',
									section_tipo	: item.section_tipo,
									body_response	: body_response
								})

							// lock
								content_data.classList.remove('lock')
								spinner.remove()
						}//end fn_fix_counter
					}

				// reset_counter_container
				// The "Reset counter" button is shown on every data row (regardless of
				// sync state). It calls self.modify_counter() with counter_action='reset',
				// which invokes counter::delete_counter() on the server — permanently
				// removing the matrix_counter row so the sequence restarts from 1.
				// (!) This is destructive: if existing records have section_ids above 1,
				// the next insert will collide. Two confirmation dialogs guard this action.
					const reset_counter_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column right reset_counter_container' + class_type,
						parent			: datalist_item_container
					})
					if (item.type==='header') {
						reset_counter_container.insertAdjacentHTML('afterbegin', 'Reset counter')
					}else{
						const button_reset_counter = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'warning button_action reset_counter',
							inner_html		: 'Reset counter',
							parent			: reset_counter_container
						})
						button_reset_counter.addEventListener('click', fn_reset_counter)
						async function fn_reset_counter(e) {
							e.stopPropagation()

							// confirm action
							// Two-step confirmation: the first dialog explains the
							// irreversibility and names the affected tipo; the second is a
							// generic 'Sure?' guard. Both must be accepted to proceed.
								if (!confirm( 'Warning! \nReset counter will delete this section ['+item.section_tipo+'] counter. \nThis action cannot be undone.' )) {
									return false;
								}
								if (!confirm( get_label.sure || 'Sure?' )) {
									return false;
								}

							// lock
								content_data.classList.add('lock')

							// spinner
								const spinner = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'spinner'
								})
								body_response.prepend(spinner)

							// modify_counter
								await self.modify_counter({
									counter_action	: 'reset',
									section_tipo	: item.section_tipo,
									body_response	: body_response
								})

							// lock
								content_data.classList.remove('lock')
								spinner.remove()
						}//end fn_reset_counter
					}

			}//end for (let i = 0; i < full_list_length; i++)

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
