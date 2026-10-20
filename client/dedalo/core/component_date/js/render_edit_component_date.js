// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals */
/*eslint no-undef: "error"*/



/**
* RENDER_EDIT_COMPONENT_DATE
* Edit-mode render helpers and shared UI factory functions for component_date.
*
* This module is NOT a standalone class — it is a prototype-assignment vehicle.
* component_date.prototype.edit is wired to render_edit_component_date.prototype.edit
* (see component_date.js). The constructor itself is a no-op placeholder that exists
* solely so that prototype methods can be attached to it in the standard Dédalo pattern.
*
* In addition to the prototype carrier, the module exports a set of pure factory functions
* that are consumed by the individual view renderers (view_default_edit_date.js,
* view_mini_date.js, view_line_edit_date.js) to build the actual DOM widgets:
*
*   get_content_value_read       — read-only text node for print/read views
*   get_ar_raw_data_value        — produce a flat string array from data.entries (all modes)
*   get_input_date_node          — <input type="text"> + calendar button for a single date field
*   get_input_time_node          — <input type="text"> + clock button for a single time field
*   render_input_element_date    — one date input (mode: 'date')
*   render_input_element_range   — two date inputs separated by '<>' (mode: 'range')
*   render_input_element_time_range — two time inputs separated by '<>' (mode: 'time_range')
*   render_input_element_period  — three numeric inputs: year / month / day (mode: 'period')
*   render_input_element_time    — one time input (mode: 'time')
*   change_handler               — unified 'change' event handler for all input types
*
* Data shape expected on self.data (component_date instance):
*   entries  {Array<Object>}  — one item per stored value; each item shape depends on date_mode:
*     date / range / time_range: { id: number|null, start: dd_date|null, end: dd_date|null }
*     time:                       { id: number|null, start: dd_time|null }
*     period:                     { id: number|null, period: { year, month, day } }
*
*   dd_date shape:   { day?: number, month?: number, year: number, time?: number }
*   dd_time shape:   { hour: number, minute: number, second: number, time?: number }
*   dd_period shape: { year?: number, month?: number, day?: number }
*
* The 'time' unix-epoch property carried on dd_date/dd_time is server-computed and is
* informational only; the client reads day/month/year/hour/minute/second as the source
* of truth when rendering.
*
* Globals consumed (declared above in the /*global*\/ directive):
*   get_label       — localised UI label map (e.g. get_label.year, get_label.sure)
*   page_globals    — application-wide settings (dedalo_date_order: 'dmy'|'mdy'|'ymd')
*
* The calendar/clock pickers are the built-in dd_date components
* (js/calendar_popup.js), warmed by component_date.load_editor() and imported
* on demand by the trigger's activation handler.
*/

// imports
	import {view_default_edit_date} from './view_default_edit_date.js'
	import {view_mini_date} from './view_mini_date.js'
	import {view_line_edit_date} from './view_line_edit_date.js'
	import {ui} from '../../common/js/ui.js'
	import {a11y} from '../../common/js/a11y.js'
	import {render_value} from '../../common/js/utils/render_escape.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {stop_page_shortcuts} from '../../common/js/utils/keyboard.js'
	import {handle_api_error} from '../../common/js/error_dispatch.js'



/**
* RENDER_EDIT_COMPONENT_DATE
* Edit-mode render mixin / prototype carrier for component_date.
* The constructor is intentionally a no-op; its prototype is populated by
* component_date.js so that component_date.prototype.edit resolves here.
*/
export const render_edit_component_date = function() {

	return true
}//end render_edit_component_date



/**
* EDIT
* Render node for use in edit mode.
*
* Dispatches to the appropriate view renderer based on self.context.view.
*
* View routing:
*   'mini'    — compact single-span representation for autocomplete dropdowns
*   'line'    — same layout as 'default' but without the label row
*   'print'   — forces read-only (permissions=1) then falls through to 'default'.
*               The resulting wrapper acquires the 'view_print' CSS class so styling
*               can target this context. (!) self.permissions is mutated on the instance
*               for the lifetime of the render call — no break before 'default'.
*   'default' — full wrapper: label, buttons, content_data with one widget per entry
*
* @param {Object} options - Render options forwarded verbatim to the selected view renderer
* @returns {Promise<HTMLElement>} Resolved component wrapper node
*/
render_edit_component_date.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_date.render(self, options)

		case 'line':
			return view_line_edit_date.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1;

		case 'default':
		default:
			return view_default_edit_date.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_VALUE_READ
* Render a read-only text node for a single date/time/period entry value.
*
* Used in print view and when self.permissions === 1 (viewer cannot edit).
* The display string is produced by self.value_to_string_value(), which respects
* the active date_mode (range, period, time, date) and the locale date-order setting.
*
* @param {number} i - Zero-based index into data.entries (informational; not used internally)
* @param {Object} current_value - A single entry from data.entries. Expected shape depends
*   on date_mode; at minimum: { start?: dd_date, end?: dd_date, period?: dd_period }.
*   Sample (mode: 'date'):
*   {
*       "mode": "date",
*       "start": {
*           "day": 12,
*           "time": 65027145600,
*           "year": 2023,
*           "month": 3
*       }
*   }
* @param {Object} self - Component instance (component_date)
* @returns {HTMLElement} A <div class="content_value read_only"> containing the display string
*/
export const get_content_value_read = (i, current_value, self) => {

	// string_value
		const string_value = self.value_to_string_value(current_value)

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only',
			inner_html		: render_value(string_value, 'text')
		})

	return content_value
}//end get_content_value_read



/**
* GET_AR_RAW_DATA_VALUE
* Produce a flat array of display strings from all entries in self.data.
*
* Iterates over data.entries and converts each item to a human-readable string
* according to the active date_mode. The resulting array is used by export and
* list renderers that need a plain-text representation of all stored values.
*
* Mode mapping:
*   'range'      — "start <> end" date strings, omitting whichever bound is absent
*   'time_range' — "start <> end" datetime strings (date + time combined)
*   'period'     — "N year(s), N month(s), N day(s)" — pluralised via get_label
*   'time'       — time string from current_value.start
*   'date_time'  — date + time combined string from current_value.start
*   'date' (default) — date string from current_value.start
*
* Empty/null entries are skipped with a console.log warning (not an error) so
* that corrupt or partially-migrated data does not break the render.
*
* @param {Object} self - Component instance (component_date)
* @returns {Array<string>} Flat array of display strings, one per valid data.entries item
*/
export const get_ar_raw_data_value = (self) => {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		const date_mode		= self.get_date_mode()
		const ar_raw_value	= []

	// build values
		const inputs_value	= entries
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

			const current_value = inputs_value[i]

			// invalid/empty value case
				if (!current_value) {
					console.log('Ignored component_date empty value:', self.tipo, i, inputs_value);
					console.log('Check this component value:', self);
					continue;
				}

			// date_mode variants
			switch(date_mode) {

				case 'range':{
					if (current_value.start || current_value.end) {

						const ar_text_range = []

						const input_value_start	= (current_value && current_value.start)
							? self.date_to_string(current_value.start)
							: null
							if (input_value_start) {
								ar_text_range.push(input_value_start)
							}

						const input_value_end	= (current_value && current_value.end)
							? self.date_to_string(current_value.end)
							: null
							if (input_value_end) {
								ar_text_range.push(input_value_end)
							}

						// const text_range = input_value_start + ' <> '+ input_value_end
						const text_range = ar_text_range.join(' <> ')

						ar_raw_value.push(text_range)
					}
					break;
				}

				case 'time_range': {
					if (current_value.start || current_value.end) {

						const ar_text_range = []

						const input_value_start	= (current_value && current_value.start)
							? self.date_time_to_string(current_value.start)
							: null
							if (input_value_start) {
								ar_text_range.push(input_value_start)
							}

						const input_value_end	= (current_value && current_value.end)
							? self.date_time_to_string(current_value.end)
							: null
							if (input_value_end) {
								ar_text_range.push(input_value_end)
							}

						// const text_range = input_value_start + ' <> '+ input_value_end
						const text_range = ar_text_range.join(' <> ')

						ar_raw_value.push(text_range)
					}
					break;
				}

				case 'period': {
					const ar_period = []
					const period = (current_value && current_value.period) ? current_value.period : null

					const year	= (period) ? period.year : null
					const month	= (period) ? period.month : null
					const day	= (period) ? period.day : null

					// plural/singular label selection: value > 1 → plural, otherwise singular
					const label_year	= (year && year>1) 		? get_label.years : get_label.year
					const label_month	= (month && month>1) 	? get_label.months : get_label.month
					const label_day		= (day && day>1) 		? get_label.days : get_label.day

					if(year){
						const text_year = year + ' ' +label_year
						ar_period.push(text_year)
					}
					if(month){
						const text_month = month + ' ' +label_month
						ar_period.push(text_month)
					}
					if(day){
						const text_day = day + ' ' +label_day
						ar_period.push(text_day)
					}
					const text_period = ar_period.join(', ')
					ar_raw_value.push(text_period)
					break;
				}

				case 'time': {
					const input_time_value = (current_value)
						? self.time_to_string(current_value.start)
						: ''
					ar_raw_value.push(input_time_value)
					break;
				}

				case 'date_time': {
					const input_time_value = (current_value)
						? self.date_time_to_string(current_value.start)
						: ''
					ar_raw_value.push(input_time_value)
					break;
				}

				case 'date':
				default: {
					const input_date_value = (current_value && current_value.start)
						? self.date_to_string(current_value.start)
						: ''
					ar_raw_value.push(input_date_value)
					break;
				}
			}//end switch
		}//end for


	return ar_raw_value
}//end get_input_element_edit



/**
* ATTACH_INPUT_HANDLERS
* Attaches common event handlers to a date/time/period input element.
* Unifies the event handling pattern across all input types.
*
* Handlers installed:
*   mousedown — activates the component (before the focus moves), then either calls
*               input.focus() (focus_on_mousedown) or stops event propagation to prevent
*               the component wrapper's own mousedown from stealing focus.
*   click     — always stops propagation so clicking inside the field does not collapse/
*               expand a parent section or portal.
*   focus     — activates the component (ui.component.activate) when it is not yet active.
*               This handles the keyboard-Tab navigation case where the mouse is not involved.
*   keydown   — stops propagation so page-level keyboard shortcuts (e.g. search-panel open)
*               do not fire while the user is typing; Tab key deactivates the component
*               (mirrors the behaviour of component_input_text).
*   input     — when input_filter_regex is provided, strips any character that does not
*               match the allowed set so the server-side parser receives a clean string.
*   change    — delegates to change_callback; called after the browser determines the
*               value has actually changed (fires on blur or Enter, not on every keystroke).
*
* @param {HTMLElement} input             - The <input> element to attach handlers to
* @param {Object}      self              - Component instance (component_date)
* @param {Function}    change_callback   - Callback invoked on the native 'change' event
* @param {Object}      [options={}]      - Optional handler configuration
* @param {RegExp|null} [options.input_filter_regex=null]   - Regex of chars to REMOVE on each
*   input event (null skips the input filter handler entirely). Example: /[^0-9-\/\.,]/g
* @param {boolean}     [options.focus_on_mousedown=false]  - When true, explicitly calls
*   input.focus() on mousedown rather than stopping propagation; useful for period fields
*   where a parent container intercepts the event.
* @returns {void}
*/
const attach_input_handlers = function(input, self, change_callback, options={}) {

	const focus_on_mousedown	= options.focus_on_mousedown || false
	const input_filter_regex	= options.input_filter_regex || null

	// mousedown event. Activate here, before the focus moves (the focus handler
	// alone activated too late: see ui.component.deactivate)
		input.addEventListener('mousedown', function(e) {
			if (!self.active) {
				ui.component.activate(self, false)
			}
			if (focus_on_mousedown) {
				input.focus()
			} else {
				e.stopPropagation()
			}
		})
	// click event. Capture event propagation
		input.addEventListener('click', function(e) {
			e.stopPropagation()
		})
	// focus event. Activate the component
		input.addEventListener('focus', function() {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		})
	// keydown event. Prevent to fire page events like open search panel
	// (!) Escape is let through: the page-level handler deactivates the component.
		input.addEventListener('keydown', function(e) {
			stop_page_shortcuts(e)
			if(e.key==='Tab'){
				ui.component.deactivate(self)
				return
			}
		})
	// input event. Filter invalid characters
		if (input_filter_regex) {
			input.addEventListener('input', function() {
				const cleaned = input.value.replace(input_filter_regex, '')
				input.value = cleaned
			})
		}
	// change event
		input.addEventListener('change', change_callback)
}//end attach_input_handlers



/**
* GET_PICKER_LABELS
* The localized strings the built-in calendar/clock pickers draw (see
* js/calendar_popup.js). Existing label keys where the catalog has them;
* short English fallbacks otherwise, so a picker opened in a context where
* get_label is not populated (a bare unit frame) still renders.
* @returns {Object}
*/
const get_picker_labels = () => {

	return {
		calendar	: get_label.calendar || 'Calendar',
		time		: get_label.time || 'Time',
		today		: get_label.today || 'Today',
		year		: get_label.year || 'year',
		month		: get_label.month || 'month',
		day			: get_label.day || 'day',
		years		: get_label.years || 'years',
		previous	: get_label.previous || 'Previous',
		next		: get_label.next || 'Next',
		ce			: get_label.ce || 'CE',
		bce			: get_label.bce || 'BCE',
		hour		: get_label.hour || 'hour',
		minute		: get_label.minute || 'minute',
		second		: get_label.second || 'second'
	}
}//end get_picker_labels



/**
* GET_INPUT_DATE_NODE
* Build a single date input widget composed of a text <input> and a calendar picker button.
*
* The text input accepts free-form typed dates; characters not matching /[0-9-\/\.,]/ are
* filtered out on each keystroke and remain the fast path for every precision. The calendar
* button opens the built-in dd_date picker (js/calendar_popup.js): signed years (BCE
* included), localized month/weekday names, and three committable precisions — year only,
* year+month, or a full date — so the picker produces exactly the partial values the
* component stores. Selecting a date writes to input.value through the component's ONE
* formatter (self.date_to_string) and programmatically fires a 'change' event so that
* change_handler is invoked exactly as if the user had typed the date.
*
* The trigger is a real control: a11y.make_activable gives the icon anchor role=button,
* a tab stop, an accessible name and the SAME activation callback on click and
* Enter/Space. Alt+ArrowDown inside the field opens the picker too (the platform
* convention), and the picker itself is fully keyboard driven once open.
*
* The trigger is a TOGGLE: pressing it while its picker is open closes the picker
* instead of re-opening it. The open/closed decision is taken at pointerdown (the
* press is judged before a native popover's light dismiss closes the picker on
* release, which would otherwise hide the "already open" state from the click).
*
* The input_wrap container (<div class="input-group">) is the node returned; the caller
* appends it to the appropriate content_value container and may append additional controls
* (e.g. a remove button) after the fact.
*
* @param {number}      i           - Zero-based index of the data entry (used in change_handler)
* @param {string}      date_input  - Which date bound this field represents: 'start' or 'end'
* @param {string}      input_value - Pre-populated display string (from self.date_to_string);
*                                    empty string for a new/empty entry
* @param {Object}      self        - Component instance (component_date)
* @returns {HTMLElement} input_wrap — <div class="input-group"> containing the <input> and
*                                     the calendar button container
*/
export const get_input_date_node = (i, date_input, input_value, self) => {

	// input_wrap
		const input_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'input-group'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_date',
			value			: input_value,
			placeholder		: self.get_placeholder_value(),
			parent			: input_wrap
		})
		// attach common input handlers (mousedown, click, focus, keydown, input, change)
			attach_input_handlers(input, self, function() {
				return change_handler({
					self		: self,
					input_value	: input.value,
					key			: i,
					input_wrap	: input_wrap,
					date_input	: date_input,
					type		: 'date'
				})
			}, {
				input_filter_regex : /[^0-9-\/\.,]/g
			})

	// button_calendar. The container goes into the input-group; the INNER
	// <a class="calendar"> is the activable control — its inset:0 hit area
	// (component_date.less) covers the whole ring, so every click on the
	// trigger lands on it.
		const button_calendar_container = render_button_calendar()
		const button_calendar = button_calendar_container.querySelector('a.calendar')

		// The picker THIS field currently has open (the module keeps the global
		// "one picker at a time" rule; this reference is only the toggle state).
		let picker_controller = null
		const is_picker_open = () => Boolean(picker_controller)
		const close_picker = () => {
			if (picker_controller) {
				// focus_back: closing on purpose, the field keeps the focus
				picker_controller.close({ focus_back: true })
				picker_controller = null
			}
		}

		// The trigger is a TOGGLE: a second press on the icon closes the picker
		// instead of re-opening it. The decision must be taken at POINTERDOWN,
		// because a native popover's light dismiss closes the picker on the
		// release, BEFORE the click that reaches activate_calendar — so by click
		// time "already open" is no longer observable.
		let press_started_open = false
		button_calendar.addEventListener('pointerdown', function() {
			press_started_open = is_picker_open()
		})

		// activate: open the built-in dd_date calendar (js/calendar_popup.js).
		// The module is imported on demand; load_editor() has normally warmed it.
		const activate_calendar = async function(e) {

			e.preventDefault()
			e.stopPropagation()

			// toggle. A press that began with the picker open means "close"; it is
			// trusted on the pointer path only (keyboard activation carries no
			// pointerdown), and a stale flag from an aborted press is ignored.
			const from_pointer	= Boolean(e && e.type === 'click')
			const toggle_close	= from_pointer && press_started_open
			press_started_open	= false
			if (toggle_close || is_picker_open()) {
				close_picker()
				return
			}

			const {open_date_picker} = await import('./calendar_popup.js')

			// the input's current value is the calendar's starting point; a
			// partial or BCE value parses (an unparseable one simply opens at
			// today — the calendar is additive, it never overwrites by opening)
			const parsed	= self.parse_string_date(input.value)
			const initial	= (parsed.data && Number.isInteger(parsed.data.year)) ? parsed.data : {}

			picker_controller = open_date_picker({
				anchor			: button_calendar,
				initial			: initial,
				format			: (dd_date) => self.date_to_string(dd_date),
				return_focus	: input,
				labels			: get_picker_labels(),
				// any close path (selection, Escape, light dismiss) clears the
				// toggle state, so the next press opens again
				on_close		: () => { picker_controller = null },
				on_select		: (dd_date) => {
					// ONE formatter: the component's date_to_string writes the
					// value; the native change event keeps the save flowing
					// through change_handler exactly as if it had been typed.
					ui.component.error(false, input_wrap)
					input.value = self.date_to_string(dd_date)
					input.dispatchEvent(new Event('change'))
				}
			})
		}//end activate_calendar

		// keyboard + pointer activation (role, tab stop, name and the same
		// callback for click and Enter/Space) — the ONE chokepoint for
		// non-native controls (client_keyboard_activation_tripwire)
		a11y.make_activable(button_calendar, {
			on_activate	: activate_calendar,
			label		: get_label.calendar || 'Calendar'
		})
		// Don't let the trigger steal focus from the input. Losing focus hides
		// the (focus-revealed) trigger BEFORE the click that opens the picker,
		// so the click would read as dead; also avoids text selection.
		button_calendar.addEventListener('mousedown', function(e) {
			e.preventDefault()
			e.stopPropagation()
		})

		// Alt+ArrowDown opens the picker from the field itself (the platform
		// convention for date inputs; the trigger covers the pointer/screen
		// reader path, this covers a keyboard user already typing)
		input.addEventListener('keydown', function(e) {
			if (e.altKey && e.key === 'ArrowDown') {
				activate_calendar(e)
			}
		})

	// add to input_wrap
		input_wrap.appendChild(button_calendar_container)


	return input_wrap
}//end get_input_date_node



/**
* GET_INPUT_TIME_NODE
* Build a single time input widget composed of a text <input> and a clock picker button.
*
* Analogous to get_input_date_node but configured for time entry.
* The input filter restricts characters to digits and colons (/[^0-9:]/g).
* The clock button opens the built-in time picker (js/calendar_popup.js): three native
* selects — hours / minutes / seconds, 24-hour — which on phones get the OS's own wheel
* UI, and commit through time_to_string + a 'change' event, exactly like typing.
*
* The trigger is a real control (a11y.make_activable: role, tab stop, name; the same
* callback on click and Enter/Space); Alt+ArrowDown in the field opens it too.
* Like the calendar trigger it is a TOGGLE: a second press closes the open picker.
*
* @param {number}      i           - Zero-based index of the data entry (used in change_handler)
* @param {string}      date_input  - Which time bound this field represents: 'start' or 'end'
* @param {string}      input_value - Pre-populated display string (from self.time_to_string or
*                                    self.date_time_to_string); empty string for new entries
* @param {Object}      self        - Component instance (component_date)
* @returns {HTMLElement} input_wrap — <div class="input-group"> containing the <input> and
*                                     the calendar button container
*/
export const get_input_time_node = (i, date_input, input_value, self) => {

	// input_wrap
		const input_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'input-group'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_time',
			value			: input_value,
			placeholder		: self.get_placeholder_value(),
			parent			: input_wrap
		})
		// attach common input handlers (mousedown, click, focus, keydown, input, change)
			attach_input_handlers(input, self, function() {
				change_handler({
					self		: self,
					input_value	: input.value,
					key			: i,
					input_wrap	: input_wrap,
					date_input	: date_input,
					type		: 'time'
				})
			}, {
				input_filter_regex : /[^0-9:]/g
			})

	// button_calendar. The container goes into the input-group; the inner
	// <a class="calendar"> is the activable control (see get_input_date_node).
		const button_calendar_container = render_button_calendar()
		const button_calendar = button_calendar_container.querySelector('a.calendar')

		// Toggle state and its pointerdown judgement — same contract as
		// get_input_date_node (the press is judged at pointerdown, before a
		// native popover's light dismiss closes the picker on release)
		let picker_controller = null
		const is_picker_open = () => Boolean(picker_controller)
		const close_picker = () => {
			if (picker_controller) {
				picker_controller.close({ focus_back: true })
				picker_controller = null
			}
		}
		let press_started_open = false
		button_calendar.addEventListener('pointerdown', function() {
			press_started_open = is_picker_open()
		})

		// activate: open the built-in time picker (js/calendar_popup.js)
		const activate_time = async function(e) {

			e.preventDefault()
			e.stopPropagation()

			// toggle. A press that began with the picker open means "close"
			const from_pointer	= Boolean(e && e.type === 'click')
			const toggle_close	= from_pointer && press_started_open
			press_started_open	= false
			if (toggle_close || is_picker_open()) {
				close_picker()
				return
			}

			const {open_time_picker} = await import('./calendar_popup.js')

			// the input's current time is the picker's starting point; an empty
			// or unparseable value simply starts at the current clock time
			const parsed	= self.parse_string_time(input.value)
			const data		= parsed.data || {}
			const initial	= (Number.isInteger(data.hour) || Number.isInteger(data.minute) || Number.isInteger(data.second))
				? data
				: {}

			picker_controller = open_time_picker({
				anchor			: button_calendar,
				initial			: initial,
				return_focus	: input,
				labels			: get_picker_labels(),
				on_close		: () => { picker_controller = null },
				on_select		: (dd_time) => {
					ui.component.error(false, input_wrap)
					input.value = self.time_to_string(dd_time)
					input.dispatchEvent(new Event('change'))
				}
			})
		}//end activate_time

		a11y.make_activable(button_calendar, {
			on_activate	: activate_time,
			label		: get_label.time || 'Time'
		})
		// keep the input's focus (see get_input_date_node)
		button_calendar.addEventListener('mousedown', function(e) {
			e.preventDefault()
			e.stopPropagation()
		})

		// Alt+ArrowDown opens the picker from the field itself
		input.addEventListener('keydown', function(e) {
			if (e.altKey && e.key === 'ArrowDown') {
				activate_time(e)
			}
		})

	// add to input_wrap
		input_wrap.appendChild(button_calendar_container)


	return input_wrap
}//end get_input_time_node



/**
* RENDER_INPUT_ELEMENT_DATE
* Render a single date input widget for date_mode 'date'.
*
* Reads current_value.start (a dd_date object), converts it to a display string via
* self.date_to_string(), and delegates DOM construction to get_input_date_node.
* Appends a remove button for all entries after the first (i > 0) so the user can
* delete individual entries in multi-value components.
*
* @param {number}      i             - Zero-based entry index in data.entries
* @param {Object|null} current_value - Entry from data.entries; null/empty for a new slot
* @param {Object}      self          - Component instance (component_date)
* @returns {HTMLElement} date_node — <div class="input-group"> ready to be appended to content_value
*/
export const render_input_element_date = (i, current_value, self) => {

	const input_value = (current_value && current_value.start)
		? self.date_to_string(current_value.start)
		: ''

	// date_node
		const date_node = get_input_date_node(i, 'start', input_value, self)

	// button_remove
		if (i>0) {
			date_node.appendChild(
				render_button_remove(self, current_value.id)
			)
		}

	return date_node
}//end render_input_element_date



/**
* RENDER_INPUT_ELEMENT_RANGE
* Render two date input widgets (start and end) separated by a '<>' node for date_mode 'range'.
*
* Both start and end fields use get_input_date_node, which calls change_handler with
* the appropriate date_input value ('start' or 'end') so the correct key on the entry
* object is updated. The remove button is attached to node_end (not node_start) so it
* visually anchors to the right of the pair.
*
* Returns a DocumentFragment so that the two widgets and the separator node can be
* appended to the parent in a single DOM operation without a wrapper element.
*
* @param {number}      i             - Zero-based entry index in data.entries
* @param {Object|null} current_value - Entry from data.entries; shape: { id, start, end }
* @param {Object}      self          - Component instance (component_date)
* @returns {DocumentFragment} Fragment containing: node_start, dates_separator, node_end
*/
export const render_input_element_range = (i, current_value, self) => {

	const fragment = new DocumentFragment()

	const input_value_start	= (current_value && current_value.start)
		? self.date_to_string(current_value.start)
		: ''
	const input_value_end = (current_value && current_value.end)
		? self.date_to_string(current_value.end)
		: ''

	// node_start
		const node_start = get_input_date_node(i, 'start', input_value_start, self)
		fragment.appendChild(node_start)

	// dates_separator node
		fragment.appendChild(
			render_dates_separator()
		)

	// node_end
		const node_end = get_input_date_node(i, 'end', input_value_end, self)
		fragment.appendChild(node_end)

		// button_remove
			if (i>0) {
				node_end.appendChild(
					render_button_remove(self, current_value.id)
				)
			}


	return fragment
}//end render_input_element_range



/**
* RENDER_INPUT_ELEMENT_TIME_RANGE
* Render two time (or datetime) input widgets separated by '<>' for date_mode 'time_range'.
*
* Uses get_input_time_node for both fields. The display string is produced by
* self.date_time_to_string(), which concatenates the date and time parts
* (e.g. "22/07/2023 13:54:00"). The remove button is appended to node_end.
*
* Returns a DocumentFragment; see render_input_element_range for rationale.
*
* @param {number}      i             - Zero-based entry index in data.entries
* @param {Object|null} current_value - Entry from data.entries; shape: { id, start, end }
*   where each bound is a combined dd_date + dd_time object
* @param {Object}      self          - Component instance (component_date)
* @returns {DocumentFragment} Fragment containing: node_start, dates_separator, node_end
*/
export const render_input_element_time_range = (i, current_value, self) => {

	const fragment = new DocumentFragment()

	const input_value_start	= (current_value && current_value.start)
		? self.date_time_to_string(current_value.start)
		: ''
	const input_value_end	= (current_value && current_value.end)
		? self.date_time_to_string(current_value.end)
		: ''

	// start node
		const node_start = get_input_time_node(i, 'start', input_value_start, self)
		fragment.appendChild(node_start)

	// dates_separator node
		fragment.appendChild(
			render_dates_separator()
		)

	// end_node
		const node_end = get_input_time_node(i, 'end', input_value_end, self)
		fragment.appendChild(node_end)

		// button_remove
			if (i>0) {
				node_end.appendChild(
					render_button_remove(self, current_value.id)
				)
			}


	return fragment
}//end render_input_element_time_range



/**
* RENDER_INPUT_ELEMENT_PERIOD
* Render three numeric inputs (year / month / day) for date_mode 'period'.
*
* Period mode represents a time duration rather than a calendar date — for example,
* "2 years, 3 months, 10 days" to express a relative timespan. Each sub-field is an
* independent numeric text input that accepts only digits (/[^0-9]/g filter).
*
* All three inputs share a single call_change_handler closure that reads all three
* input.value properties simultaneously and passes them as a combined object to
* change_handler (type:'period'). This means any change to any individual field
* triggers a save of the full period triple.
*
* ui.fit_input_width_to_value() is called on both initial render (min-width: 2 chars)
* and on each input event so the field shrinks/expands to its content, keeping the
* layout compact.
*
* Label pluralisation: labels are read from get_label at render time based on the
* current stored values. They are NOT updated as the user types; a refresh is needed
* to update labels after saving. This is consistent with all other component_date modes.
*
* @param {number}      i             - Zero-based entry index in data.entries
* @param {Object|null} current_value - Entry from data.entries; shape:
*   { id: number|null, period: { year?: number, month?: number, day?: number } }
* @param {Object}      self          - Component instance (component_date)
* @returns {DocumentFragment} Fragment containing a single <div class="input-group period">
*   with three pair_container <span>s (year, month, day), each holding an <input> and a
*   <label>. A remove button is appended when i > 0.
*/
export const render_input_element_period = (i, current_value, self) => {

	const fragment = new DocumentFragment()

	// period
		const period = (current_value && current_value.period)
			? current_value.period
			: null

	// parts
		const year	= (period) ? period.year : ''
		const month	= (period) ? period.month : ''
		const day	= (period) ? period.day : ''

	// labels
		const label_year	= (year!=='' && year>1)		? get_label.years : get_label.year
		const label_month	= (month!=='' && month>1)	? get_label.months : get_label.month
		const label_day		= (day!=='' && day>1)		? get_label.days : get_label.day

	// call_change_handler. Unified change_handler caller
		const call_change_handler = function(e) {

			// fit input width with value
			ui.fit_input_width_to_value(e.target, e.target.value, 1)

			change_handler({
				self		: self,
				input_value	: {
					day		: input_day.value || null,
					month	: input_month.value || null,
					year	: input_year.value || null
				},
				key			: i,
				input_wrap	: input_wrap,
				mode		: 'period',
				type		: 'period'
			})
		}

	// input-group. create div grouper
		const input_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'input-group period',
			parent			: fragment
		})

		// year
			const year_pair_container = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'pair_container',
				parent			: input_wrap
			})
			const input_year = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'input_period',
				value			: year,
				placeholder		: 'Y',
				parent			: year_pair_container
			})
			// attach common input handlers (mousedown, click, focus, keydown, input, change)
			attach_input_handlers(input_year, self, call_change_handler, {
				focus_on_mousedown : true,
				input_filter_regex : /[^0-9]/g
			})
			// year label
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: label_year,
				parent			: year_pair_container
			})
			// fit input width with value
			ui.fit_input_width_to_value(input_year, input_year.value, 2)

		// month
			const month_pair_container = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'pair_container',
				parent			: input_wrap
			})
			const input_month = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'input_period',
				value			: month,
				placeholder		: 'M',
				parent			: month_pair_container
			})
			// attach common input handlers (mousedown, click, focus, keydown, input, change)
			attach_input_handlers(input_month, self, call_change_handler, {
				focus_on_mousedown : true,
				input_filter_regex : /[^0-9]/g
			})
			// month label
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: label_month,
				parent			: month_pair_container
			})

		// day
			const day_pair_container = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'pair_container',
				parent			: input_wrap
			})
			const input_day = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'input_period',
				value			: day,
				placeholder		: 'D',
				parent			: day_pair_container
			})
			// attach common input handlers (mousedown, click, focus, keydown, input, change)
			attach_input_handlers(input_day, self, call_change_handler, {
				focus_on_mousedown : true,
				input_filter_regex : /[^0-9]/g
			})
			// day label
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: label_day,
				parent			: day_pair_container
			})

	// button_remove
		if (i>0) {
			input_wrap.appendChild(
				render_button_remove(self, current_value.id)
			)
		}

	return fragment
}//end render_input_element_period



/**
* RENDER_INPUT_ELEMENT_TIME
* Render a single time input widget for date_mode 'time'.
*
* Reads current_value.start (a dd_time object), converts it to display string via
* self.time_to_string(), and delegates to get_input_time_node.
* Appends a remove button for entries beyond the first (i > 0).
*
* @param {number}      i             - Zero-based entry index in data.entries
* @param {Object|null} current_value - Entry from data.entries; shape: { id, start: dd_time }
* @param {Object}      self          - Component instance (component_date)
* @returns {HTMLElement} time_node — <div class="input-group"> ready to append to content_value
*/
export const render_input_element_time = (i, current_value, self) => {

	const input_value = (current_value && current_value.start)
		? self.time_to_string(current_value.start)
		: ''

	const time_node = get_input_time_node(i, 'start', input_value, self)

	// button_remove
		if (i>0) {
			time_node.appendChild(
				render_button_remove(self, current_value.id)
			)
		}


	return time_node
}//end render_input_element_time



/**
* CHANGE_HANDLER
* Unified 'change' event callback invoked by every edit-view date/time/period input.
*
* Responsibility chain:
*   1. Dispatches to the appropriate parse method on self based on type:
*        'time'   → self.parse_string_time(input_value)
*        'period' → self.parse_string_period(input_value)
*        default  → self.parse_string_date(input_value)
*      Each parser returns { data: dd_date|{}, error?: [{text, type}] }.
*   2. If the response is null (self is falsy) or missing, logs and returns false.
*   3. If response.error is set (an ApiError from the parser), hands it to
*      handle_api_error — the `validation.*` policy renders it inline in the
*      field wrapper — and marks input_wrap via ui.component.error(). Returns false.
*   4. On success, clears the error style on input_wrap.
*   5. Determines the effective_key ('start', 'end', or 'period') from options.date_input
*      or options.type, then merges the parsed result into the current data entry:
*        - An empty result object ({}) is treated as null (delete the value).
*        - If the entry only has an 'id' key left after clearing effective_key, the whole
*          entry is set to null so the server can handle the removal cleanly.
*   6. Builds a frozen changed_data_item: { action:'update', id, value: data_value }.
*   7. Dispatches via one of two paths:
*        search mode — calls self.update_data_value() then publishes 'change_search_element'
*                      so search form state is updated without a full re-render.
*        edit mode   — calls self.change_value({ changed_data, refresh:false }) which
*                      records the mutation and queues a save without re-rendering.
*
*     Prefer ui.attach_to_modal() in future iterations for non-blocking feedback.
*
* @param {Object}          options             - All parameters are passed as named properties
* @param {Object}          options.self        - Component instance (component_date)
* @param {string|Object}   options.input_value - Raw string value from the input (date/time modes)
*   or an object { year, month, day } (period mode)
* @param {number}          options.key         - Zero-based index of this entry in data.entries
* @param {HTMLElement}     options.input_wrap  - The input-group container; used for error styling
* @param {string}          options.type        - Input type: 'date' | 'time' | 'period'
* @param {string}          [options.date_input] - 'start' or 'end'; takes precedence over type
*   when determining which property of the entry to update. Omit for period and single-value modes.
* @returns {boolean} true on success; false when self is missing, the response is absent,
*   or a validation error is raised by the parser
*/
export const change_handler = function(options) {

	// options
		const self			= options.self // instance
		const input_value	= options.input_value // string|object
		const key			= options.key
		const input_wrap	= options.input_wrap
		const type			= options.type // date|time|period
	// effective_key. Property name used to store the value in the entry item
	// date/time use 'start'|'end' from date_input; period uses 'period'
		const effective_key	= options.date_input || type // 'start'|'end'|'period'

	// parse value
		const response = (()=>{
			if (!self) return null
			switch (type) {
				case 'time':
					return self.parse_string_time(input_value)

				case 'period':
					return self.parse_string_period(input_value)

				default:
					return self.parse_string_date(input_value)
			}
		})()

	// response check
		if (!response) {
			console.error("change_handler: missing response or self", options)
			return false
		}

	// error case
		if(response.error){
			// policy `validation.*` → inline: the message lands inside the field's
			// own wrapper instead of a blocking browser dialog
			handle_api_error(response.error, {wrapper: input_wrap})
			ui.component.error(true, input_wrap)
			return false
		}

	// success format. reset component error styles
		ui.component.error(false, input_wrap)

	// short vars
		const data	= self.data || {}
		const value	= data.entries || []

	// new value. New parsed value
		const result = response.data || {}
		const new_value = (Object.keys(result).length === 0 && result.constructor === Object)
			? null // empty object case
			: result

	// data_value. Current data value for current key
		const data_value = (()=>{
			// item. Current data value for current key
			const item = value[key]
				? JSON.parse(JSON.stringify(value[key]))
				: {}

			// replace value only in current effective_key
			if(new_value){
				item[effective_key] = new_value
			}else{
				// delete effective_key (start|end|period)
				delete item[effective_key]
				// check if only id left
				const item_keys = Object.keys(item)

				// when only the 'id' survives, treat the entry as empty (return null)
				// so the server-side remove path is invoked rather than an update with
				// no meaningful content
				if(item_keys.length===1 && item_keys[0]==='id'){
					return null
				}else if(item_keys.length===0){
					return null
				}
			}
			return item
		})()

	// changed_data_item
	// Search mode applies the delta in memory only (a null value empties the slot
	// of the search instance). Edit mode talks to the save door, which REFUSES a
	// null item (WC-2026-10-03-save-refuses-malformed-value-shape): an emptied
	// date is a remove by id — see build_date_changed_data_item.
		const item_id = value[key]?.id ?? null
		const changed_data_item = self.mode==='search'
			? Object.freeze({
				action	: 'update',
				id		: item_id,
				value	: data_value
			})
			: build_date_changed_data_item(data_value, item_id)

	// nothing stored and nothing typed: there is nothing to save
		if (changed_data_item===null) {
			return true
		}

	if (self.mode==='search') {
		// update the instance data (previous to save)
			self.update_data_value(changed_data_item)
		// set data.changed_data. The change_data to the instance
			// self.data.changed_data = changed_data
		// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)

	}else{

		// change_value
		// remove_dialog: emptying the input IS the user's decision to drop the
		// date — no destructive-delete confirm() on top of it (as the sibling
		// select-family components do for a cleared value).
			self.change_value({
				changed_data	: [changed_data_item],
				refresh			: false,
				remove_dialog	: () => true
			})
	}

	return true
}//end change_handler



/**
* BUILD_DATE_CHANGED_DATA_ITEM
* The edit-mode change for one date slot, in a shape the save door accepts.
*
* - a value item → `update` of that item (id null: the server allocates one);
* - an EMPTIED slot (data_value null) that is stored → `remove` of its id —
*   never `update` with a null value, which the save door refuses (a null is
*   not an item: WC-2026-10-03-save-refuses-malformed-value-shape);
* - an emptied slot that was never stored → null: there is nothing to save.
*
* @param {Object|null} data_value - The slot's new item, or null when emptied
* @param {number|string|null} id - The stored item id of the slot, or null
* @returns {Object|null} A frozen changed_data item, or null for nothing to save
*/
export const build_date_changed_data_item = function(data_value, id) {

	if (data_value!==null) {
		return Object.freeze({
			action	: 'update',
			id		: id,
			value	: data_value
		})
	}

	// the save door's "no id" spellings (namesNoItem in save_component.ts)
	if (id===null || id===undefined || id==='') {
		return null
	}

	return Object.freeze({
		action	: 'remove',
		id		: id,
		value	: null
	})
}//end build_date_changed_data_item



/**
* RENDER_BUTTON_REMOVE
* Build the remove-entry button for multi-value date components.
*
* The button is rendered hidden by default (CSS class 'hidden_button') and is revealed
* by the view layer on hover/focus via CSS. Clicking triggers a browser confirm() dialog;
* if confirmed, builds a frozen changed_data atom (action:'remove') and calls
* self.change_value({ refresh:true }) to trigger a full re-render after the server responds.
*
* document.activeElement.blur() is called first to flush any pending 'change' event on
* the currently focused input, ensuring the remove is applied to the latest value.
*
* (!) alert / confirm are blocking browser dialogs. This is consistent with the rest of
*     the codebase but is noted for future UX improvement.
*
* @param {Object}     self - Component instance (component_date)
* @param {number|null} id  - Server-side entry id from the entry being removed
*   (null for entries not yet persisted to the server)
* @returns {HTMLElement} button_remove_container — <span class="button_container button_remove_container hidden_button">
*   containing the icon button
*/
const render_button_remove = function (self, id) {

	// fn_mousedown manager
		const fn_mousedown = (e) => {
			e.stopPropagation()

			// force possible input change before remove
			document.activeElement.blur()

			if (!confirm(get_label.sure)) {
				return false
			}

			// the ONE remove builder of this component: an unsaved slot (no id)
			// has nothing stored to remove, and an id-less remove is refused
			const remove_item = build_date_changed_data_item(null, id)
			if (remove_item===null) {
				return false
			}
			self.change_value({
				changed_data	: [remove_item],
				label			: null,
				refresh			: true
			})
		}

	// button_remove_container
		const button_remove_container = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_container button_remove_container hidden_button'
		})
		// activation: pointer (mousedown, the timing this surface always used —
		// it flushes the focused input's pending change first) AND Enter/Space,
		// through the ONE a11y chokepoint (a bare mousedown on a span is
		// keyboard-dead: activation keys dispatch click, never mousedown)
		a11y.make_activable(button_remove_container, {
			on_activate		: fn_mousedown,
			label			: get_label.delete || 'Delete',
			pointer_event	: 'mousedown'
		})

	// button_remove
		const button_remove = ui.create_dom_element({
			element_type	: 'span',
			title			: get_label.delete || 'Delete',
			class_name		: 'button remove',
			parent			: button_remove_container
		})
		button_remove.tabIndex = -1;


	return button_remove_container
}//end render_button_remove



/**
* RENDER_BUTTON_CALENDAR
* Build the calendar/clock picker trigger shared by date and time input nodes.
*
* The node returned is the container; the returned `.calendar` <a> inside it is
* the actual control. The container is positioned by CSS (absolute, revealed on
* the field's focus-within — or permanently on coarse pointers), and the caller
* (get_input_date_node / get_input_time_node) attaches activation through
* `a11y.make_activable`: role=button, a tab stop, an accessible name and the same
* callback on click and Enter/Space. The <a> (not the container) owns that
* wiring, its ::after hit area covering the whole container.
*
* @returns {HTMLElement} button_calendar_container — <span class="button_container button_calendar_container hidden_button">
*   containing an <a class="input-group-addon button calendar">
*/
const render_button_calendar = function () {

	// button_calendar_container
		const button_calendar_container = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_container button_calendar_container hidden_button'
		})

	// button_calendar
		const button_calendar = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'input-group-addon button calendar',
			parent			: button_calendar_container
		})


	return button_calendar_container
}//end render_button_calendar



/**
* RENDER_DATES_SEPARATOR
* Build the visual '<>' separator node displayed between start and end inputs
* in range (date range) and time_range modes.
*
* The text content is the literal string '<>' which is also used as the separator
* in the raw text representation produced by get_ar_raw_data_value (joined as ' <> ').
*
* @returns {HTMLElement} dates_separator_node — <span class="dates_separator"> with text '<>'
*/
const render_dates_separator = function () {

	const dates_separator_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dates_separator',
		text_content	: '<>'
	})


	return dates_separator_node
}//end render_dates_separator



// @license-end
