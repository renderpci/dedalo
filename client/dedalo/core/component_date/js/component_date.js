// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



/**
* COMPONENT_DATE
* Client-side model for the Dédalo date component (`component_date`).
*
* Responsibilities:
*   - Holds the instance state (tipo, section_id, mode, context, data, …).
*   - Provides the date/time utility layer shared by all render sub-modules:
*       parse/format helpers (`date_to_string`, `parse_string_date`, `time_to_string`,
*       `parse_string_time`, `parse_string_period`, `date_time_to_string`),
*       calendar-library loading (`load_editor`), placeholder generation
*       (`get_placeholder_value`), date-mode inspection (`get_date_mode`), and
*       display value serialisation (`value_to_string_value`).
*   - Delegates lifecycle, save and change-data operations to `component_common`.
*   - Delegates rendering to `render_edit_component_date`, `render_list_component_date`,
*     and `render_search_component_date` via prototype assignment.
*
* Data model summary:
*   The component stores a `dd_date` array under the `lg-nolan` language key (dates are
*   language-independent). Each array entry is an object whose keys depend on `date_mode`:
*
*       date / date_time  →  { start: dd_date }
*       range             →  { start: dd_date, end: dd_date }
*       time / time_range →  { start: dd_date [, end: dd_date] }
*       period            →  { period: { year, month, day } }
*
*   A `dd_date` object may carry any subset of:
*       { year, month, day, hour, minute, second, millisecond, time }
*   where `time` is an absolute-seconds value computed server-side on `save()` —
*   it MUST NOT be authored by hand.
*
* Supported `date_mode` values (from `context.properties.date_mode`):
*   'date' | 'range' | 'period' | 'time' | 'time_range' | 'date_time'
*   Default is 'date'.
*
* Display order (dmy / ymd / mdy) is read from `page_globals.dedalo_date_order`
* and is a global application setting, not a per-component property.
*
* @see docs/core/components/component_date.md  Full data-model and import/export spec.
*/



// imports
	import {common} from '../../common/js/common.js'
	import {load_style} from '../../common/js/utils/index.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {events_subscription} from '../../component_input_text/js/events_subscription.js'
	import {render_edit_component_date} from '../../component_date/js/render_edit_component_date.js'
	import {render_search_component_date} from '../../component_date/js/render_search_component_date.js'
	import {render_list_component_date} from '../../component_date/js/render_list_component_date.js'



/**
* COMPONENT_DATE
* Constructor. Declares all instance properties to null/defaults so that the
* prototype chain can see them from the very beginning and V8 can build a
* stable hidden class for every instance.
*
* Properties are populated by `component_common.prototype.init` (called once
* after instantiation with an `options` bag) and later by `build` + the render
* lifecycle.
*/
export const component_date = function() {

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null

	// separators used when converting dd_date objects to/from display strings
	this.date_separator	= '/'
	this.time_separator	= ':'

	// ui
	this.minimum_width_px = 140 // integer pixels
}//end component_date



/**
* COMMON FUNCTIONS
* Extend component_date with the standard lifecycle, data-mutation, and render
* methods from the shared `component_common` / `common` base classes.
* All dates and time values are always stored under `lg-nolan` regardless of
* the UI language; `save()` additionally runs `add_time()` server-side.
*/



// prototypes assign
	// lifecycle
	component_date.prototype.init					= component_common.prototype.init
	component_date.prototype.build					= component_common.prototype.build
	component_date.prototype.render					= common.prototype.render
	component_date.prototype.refresh				= common.prototype.refresh
	component_date.prototype.destroy				= common.prototype.destroy
	component_date.prototype.events_subscription	= events_subscription

	// change data
	component_date.prototype.save					= component_common.prototype.save
	component_date.prototype.update_data_value		= component_common.prototype.update_data_value
	component_date.prototype.update_datum			= component_common.prototype.update_datum
	component_date.prototype.change_value			= component_common.prototype.change_value
	component_date.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_date.prototype.build_rqo				= common.prototype.build_rqo

	// render — each mode delegates to the appropriate render module.
	// 'tm' (Time Machine read-only mode) intentionally reuses the list renderer.
	component_date.prototype.list					= render_list_component_date.prototype.list
	component_date.prototype.tm						= render_list_component_date.prototype.list
	component_date.prototype.edit					= render_edit_component_date.prototype.edit
	component_date.prototype.search					= render_search_component_date.prototype.search

	component_date.prototype.change_mode			= component_common.prototype.change_mode



/**
* LOAD_EDITOR
* Lazily loads the flatpickr calendar library (JS + CSS) the first time an edit
* or search widget is rendered.  If flatpickr has already been loaded by another
* component instance in the same page, the check short-circuits so the files are
* fetched only once per page lifetime.
*
* The CSS is injected via `load_style`; the JS is imported as a dynamic module.
* Both assets are fetched in parallel through `Promise.all`.
*
* Called from `render_edit_component_date` and `render_search_component_date`
* before constructing the input widget so the `flatpickr` global is guaranteed
* to be defined by the time the calendar button is clicked.
*
* @returns {Promise<boolean>} Resolves to `true` when both assets are ready.
*/
component_date.prototype.load_editor = async function() {


	// flatpickr calendar. load dependencies js/css if not already loaded
		if (typeof flatpickr==='undefined') {

			const load_promises = []

			// css file load
				const lib_css_file = DEDALO_ROOT_WEB + '/lib/flatpickr/dist/flatpickr.min.css'
				load_promises.push( load_style(lib_css_file) )

			// js module import
				const js_file_load = import('../../../lib/flatpickr/dist/flatpickr.min.js') // used minified version for now
				load_promises.push( js_file_load )

			await Promise.all(load_promises)
		}


	return true
}//end load_editor



/**
* DATE_TO_STRING
* Converts a single `dd_date` object into a localised display string using the
* global date order (`page_globals.dedalo_date_order`: 'dmy' | 'ymd' | 'mdy').
*
* Partial dates are supported: a bare year produces `"2022"`, a year+month
* (without day) produces `"04/2022"` (or its locale equivalent).  A date with
* all three parts set follows the full locale-ordered pattern.
*
* Day and month are zero-padded to two digits; year is emitted as-is (may be
* negative for BCE).
*
* (!) The caller must pass the inner `dd_date` container directly (e.g.
* `entry.start` or `entry.end`), NOT the outer entry wrapper `{ start, end }`.
*
* @param {Object} date - A `dd_date` object: `{ year?, month?, day?, hour?, minute?, second?, time? }`.
*                        Only year/month/day are read; time fields are ignored.
* @returns {string} Formatted date string (e.g. `"25/04/2022"`, `"04/2022"`, `"-238"`).
*                   Returns `""` when no recognisable parts can be composed.
*/
component_date.prototype.date_to_string = function (date) {

	const self	= this

	const date_order = page_globals.dedalo_date_order || 'dmy'

	// day. check if the date has defined the day and pad the start with 0 when the day has only 1 digit
		const day = (date.day && date.day>0)
			? `${date.day}`.padStart(2, '0')
			: null
	// month. check if the date has defined the month and pad the start with 0 when the month has only 1 digit
		const month	= (date.month && date.month>0)
			? `${date.month}`.padStart(2, '0')
			: null
	// year. check if the date has defined the year
		const year = (date.year)
			? date.year
			: null

	// use to store the order date, it will be joined with the separator
	const ar_date = []

	// only year, common to all dates order : 2022
	if(!day && !month && year){
		ar_date.push(year)
	}else{
		switch (date_order) {
			case 'mdy':
				// month and year : 04/2022
				if(!day && month && year){
					ar_date.push(month)
					ar_date.push(year)
				}else
				// moth, day, year (USA dates) : 04/25/2022
				if(day && month && year){
					ar_date.push(month)
					ar_date.push(day)
					ar_date.push(year)
				}
				break;
			case 'ymd':
				// year and month  : 2022/04
				if(!day && month && year){
					ar_date.push(year)
					ar_date.push(month)
				}else
				// year, month, date (China, Korean, Japan, Iran dates) : 2022/04/25
				if(day && month && year){
					ar_date.push(year)
					ar_date.push(month)
					ar_date.push(day)
				}
				break;
			case 'dmy':
			default:
				// month and year : 04/2022
				if(!day && month && year){
					ar_date.push(month)
					ar_date.push(year)
				}else
				// day, moth, year (other countries dates) : 25/04/2022
				if(day && month && year){
					ar_date.push(day)
					ar_date.push(month)
					ar_date.push(year)
				}
				break;
		}
	}

	// join the order array of date with the date_separator '/'
	const string_date = ar_date.join(self.date_separator)


	return string_date
}//end date_to_string



/**
* PARSE_STRING_DATE
* Parses a free-text date string typed by the user into a validated `dd_date`
* object, respecting the global date order setting.
*
* Normalisation pipeline:
*   1. Try to split on `this.date_separator` ('/').
*   2. If only one token is found, try alternate separators '-' and '.' —
*      with special handling for negative years: a leading '-' must NOT be
*      treated as a separator.  For example '-200.05.01' should yield
*      `{ year: -200, month: 5, day: 1 }`, not split into `['', '200', '05', '01']`.
*      To achieve this, the code converts all '.' and '-' to '/' first, then
*      re-folds `//` (which arose from the leading '-') back to '/-' before
*      splitting again.
*   3. Token count drives the positional interpretation according to `date_order`:
*       1 token  → year only
*       2 tokens → month+year (or year+month)
*       3 tokens → full day+month+year (or local order variant)
*   4. `check_day` and a month-range guard validate day/month values.
*   5. Errors are accumulated and returned alongside the partial `dd_date`.
*
* (!) If `day_ok` or `month_ok` is `false` (validation failed), the corresponding
* field is stored as `false` in `dd_date` (not `null`), signalling the caller
* that a valid-looking but out-of-range value was found.  The error array entry
* carries the specific field type so the UI can highlight the offending input.
*
* @param {string} string_date - User-entered date string, e.g. `'25/04/2022'`,
*                               `'-200'`, `'2022-04-25'`.
* @returns {Object} Response bag:
*   ```
*   {
*     result : { year?, month?, day? },  // validated dd_date (fields omitted when absent)
*     error? : [{ msg: string, type: 'full'|'day'|'month' }, …]
*   }
*   ```
*   `error` is only present when at least one validation failure occurred.
*/
component_date.prototype.parse_string_date = function(string_date) {

	const self	= this

	const date_order		= page_globals.dedalo_date_order || 'dmy'
	const ar_date_values	= string_date.split(self.date_separator)

	if(ar_date_values.length === 1){
		const check_regex = /[-.]/g;
		const split_option1 = string_date.split(check_regex)
		if(split_option1.length > 1 && split_option1[0] !== ''){
			// replace the other input separators accepted .-
			const regex = /[-.]/g;
			const first_replace = string_date.replace(regex, '/')
			// replace the // with the /- for negative years
			const regex2 = /\/\//g;
			const second_replace = first_replace.replace(regex2, '/-')
			// split as normal date_separator
			const optional_ar_date_values	= second_replace.split(self.date_separator)
			// empty the ar_date_values and push the new values
			ar_date_values.splice(0, ar_date_values.length)
			ar_date_values.push(...optional_ar_date_values)
		}
	}

	// dd_date object
	const date_obj = {}
	// only year, common to all date order
	if(ar_date_values.length === 1){
		date_obj.year = (ar_date_values[0])
			? parseInt(ar_date_values[0])
			: null
	}else{
		switch (date_order) {
			case 'mdy':
				// month and year : 04/2022
				if(ar_date_values.length === 2){
					date_obj.month	= parseInt(ar_date_values[0])
					date_obj.year	= parseInt(ar_date_values[1])
				}else
				// moth, day, year (USA dates) : 04/25/2022
				if(ar_date_values.length === 3){
					date_obj.month	= parseInt(ar_date_values[0])
					date_obj.day	= parseInt(ar_date_values[1])
					date_obj.year	= parseInt(ar_date_values[2])
				}
				break;

			case 'ymd':
				// year and month  : 2022/04
				if(ar_date_values.length === 2){
					date_obj.year	= parseInt(ar_date_values[0])
					date_obj.month	= parseInt(ar_date_values[1])
				}else
				// year, month, date (China, Korean, Japan, Iran dates) : 2022/04/25
				if(ar_date_values.length === 3){
					date_obj.year	= parseInt(ar_date_values[0])
					date_obj.month	= parseInt(ar_date_values[1])
					date_obj.day	= parseInt(ar_date_values[2])
				}
				break;

			case 'dmy':
			default:
				// month and year : 04/2022
				if(ar_date_values.length === 2){
					date_obj.month	= parseInt(ar_date_values[0])
					date_obj.year	= parseInt(ar_date_values[1])
				}else
				// day, moth, year (other countries dates) : 25/04/2022
				if(ar_date_values.length === 3){
					date_obj.day	= parseInt(ar_date_values[0])
					date_obj.month	= parseInt(ar_date_values[1])
					date_obj.year	= parseInt(ar_date_values[2])
				}
				break;
		}
	}

	// date checks

	// check id the day is in valid range 1 <> 31, or 1 <>30 checking the months
	// check if the day in February are 28 or 29 in leap years
		const day_ok = date_obj.day
			? self.check_day(date_obj.day, date_obj.month, date_obj.year)
			: null

		const month_ok = date_obj.month
			? date_obj.month && date_obj.month > 0 && date_obj.month <= 12
				? true
				: false
			: null

	// final dd_date
		const dd_date = {}

		// dd_date.year = date_obj.year
		if(typeof date_obj.year==='number' && !Number.isNaN(date_obj.year) ){
			dd_date.year = date_obj.year
		}
		if(date_obj.month){
			// store the raw month value on success; on failure store false (signals caller)
			dd_date.month = month_ok ? date_obj.month : month_ok
		}
		if(date_obj.day){
			// store the raw day value on success; on failure store false (signals caller)
			dd_date.day = day_ok ? date_obj.day : day_ok
		}

	// errors
		const error = []
		// when the user intro other things than dates
		if(string_date.length >1 && !dd_date.year){
			const error_msg = get_label.error_invalid_date_format || 'Error: Date format is invalid'
				error.push({
					msg	 : error_msg +'. '+ string_date +': '+ date_obj.day,
					type : 'full'
				})
		}
		// if the user introduce days out of valid range (>29, >30, >31 etc)
		if(day_ok === false){
			const error_msg = get_label.error_invalid_date_format || 'Error: Date format is invalid'
			const error_msg_day	= get_label.day || 'day'
			error.push({
				msg	 : error_msg +'. '+ error_msg_day +': '+ date_obj.day,
				type : 'day'
			})
		}

		if(month_ok === false){
			const error_msg = get_label.error_invalid_date_format || 'Error: Date format is invalid'
			const error_msg_month = get_label.month || 'month'
			error.push({
				msg	 : error_msg +'. '+ error_msg_month +': '+ date_obj.month,
				type : 'month'
			})
		}

	// response
		const response = {
			result	: dd_date
		}
		if (error.length>0) {
			response.error = error
		}


	return response
}//end parse_string_date



/**
* CHECK_DAY
* Validates that a given day number is legal for the specified month and year.
* Handles:
*   - Zero / negative day values (always invalid → `false`).
*   - February with leap-year awareness (28 days normally, 29 in a leap year).
*   - Months with 31 days: Jan(1), Mar(3), May(5), Jul(7), Aug(8), Oct(10), Dec(12).
*   - All other months have 30 days.
*
* Used by `parse_string_date` before building the final `dd_date` object.
*
* @param {number} day   - Day number as typed by the user (1–31 range expected).
* @param {number} month - Month number (1–12).
* @param {number} year  - Full year (used only for the February leap-year check).
* @returns {boolean} `true` if the day is within the valid range for that month;
*                    `false` otherwise.
*/
component_date.prototype.check_day = function(day, month, year){

	const self	= this
	// id the day is 0 or negative value the value is a error and return
	if(day <= 0){
		return false
	}
	// get months with 31 days to be checked
	const months_with_31_days = [1,3,5,7,8,10,12]
	let day_ok = false
	if(month===2){
		// check if the year is leap, February will be of 29 days instead 28
		const leap = self.is_leap_year(year)
		if(leap){
			day_ok = day > 29
				? false
				: true
		}else{
			day_ok = day > 28
				? false
				: true
		}

	}else
	// check if the moth has 31 days, if not the month will be 30 days
	if( months_with_31_days.indexOf(month) !== -1){
		day_ok = day > 31
			? false
			: true
	}else{
		day_ok = day > 30
			? false
			: true
	}

	return day_ok
}//end check_day



/**
* IS_LEAP_YEAR
* Returns whether the given year is a leap year under the proleptic Gregorian
* calendar rules:
*   - Divisible by 4   → leap year candidate.
*   - Divisible by 100 → NOT a leap year, UNLESS also divisible by 400.
*
* Works correctly for negative (BCE) year values because the modulo operator in
* JavaScript preserves sign for exact multiples (e.g. -400 % 400 === 0).
*
* @param {number} year - Integer year (may be negative for BCE dates).
* @returns {boolean} `true` if `year` is a leap year; `false` otherwise.
*/
component_date.prototype.is_leap_year = function(year) {

	const is_div_by_4	= year % 4 === 0;
	const is_div_by_100	= year % 100 === 0;
	const is_div_by_400	= year % 400 === 0;

	return is_div_by_4 && (!is_div_by_100 || is_div_by_400);
}//end is_leap_year



/**
* GET_DATE_MODE
* Reads the `date_mode` property from the component's ontology context.
* `date_mode` controls which input widgets are rendered and how `dd_date` data
* is structured and serialised.
*
* Valid values: `'date'` | `'range'` | `'period'` | `'time'` | `'time_range'` | `'date_time'`.
* Falls back to `'date'` when the property is absent (i.e. standard calendar date).
*
* @returns {string} The active date mode, defaulting to `'date'`.
*/
component_date.prototype.get_date_mode = function() {

	const self = this

	const date_mode = self.context.properties && self.context.properties.date_mode
		? self.context.properties.date_mode
		: 'date'

	return date_mode
}//end get_date_mode



/**
* GET_PLACEHOLDER_VALUE
* Builds the `placeholder` attribute string for a date or time input field,
* reflecting both the active `date_mode` and the global date-order setting.
*
* For time-only modes (`'time'`, `'time_range'`) the placeholder is always
* `'HH:MM:SS'` (or the instance's `time_separator` equivalent), regardless of
* `dd_date_format`.  For all date-bearing modes the placeholder tokens (DD, MM,
* YYYY) are re-ordered to match `page_globals.dedalo_date_order`.
*
* Example outputs for `date_separator = '/'`:
*   - `dmy` → `'DD/MM/YYYY'`
*   - `ymd` → `'YYYY/MM/DD'`
*   - `mdy` → `'MM/DD/YYYY'`
*   - time  → `'HH:MM:SS'`
*
* @returns {string} A human-readable input-format hint, e.g. `'DD/MM/YYYY'`.
*                   Returns `''` for an unrecognised `dd_date_format` value.
*/
component_date.prototype.get_placeholder_value = function() {

	const self = this

	const date_mode			= self.get_date_mode()
	const dd_date_format	= page_globals.dedalo_date_order  || 'dmy'

	// placeholder_value
	// set the order of the placeholder by the date_format
		const placeholder_value = (date_mode==='time' || date_mode==='time_range')
			? ''.concat('HH',self.time_separator,'MM',self.time_separator,'SS')
			: (dd_date_format === 'dmy')
				? ''.concat('DD',self.date_separator,'MM',self.date_separator,'YYYY')
				: (dd_date_format === 'ymd')
					? ''.concat('YYYY',self.date_separator,'MM',self.date_separator,'DD')
					: (dd_date_format === 'mdy')
						? ''.concat('MM',self.date_separator,'DD',self.date_separator,'YYYY')
						: ''

	return placeholder_value
}//end get_placeholder_value



/**
* TIME_TO_STRING
* Converts a `dd_date` container that holds clock-time fields into a display
* string of the form `'HH:MM:SS'` (using `this.time_separator`).
*
* Missing or falsy hour/minute/second values are replaced with `'00'` so the
* output always has the full three-part structure (zero-padded).
*
* (!) `time.hour === 0` is falsy in JavaScript, so a midnight hour (0) is
* rendered as `'00'` correctly — but only because the ternary falls through to
* the `'00'` default.  A value of `0` is treated the same as absent.
*
* @param {Object|null} time - A `dd_date` object with optional `{ hour, minute, second }`.
*                             Pass `null` or `undefined` to get an empty string back.
* @returns {string} Clock time string, e.g. `'13:54:00'`.  Returns `''` when
*                   `time` is falsy.
*/
component_date.prototype.time_to_string = function(time) {

	const self	= this

	if (!time) {
		return ''
	}

	const hour		= (time.hour)
		? `${time.hour}`.padStart(2, '0')
		: '00'
	const minute	= (time.minute)
		? `${time.minute}`.padStart(2, '0')
		: '00'
	const second	= (time.second)
		? `${time.second}`.padStart(2, '0')
		: '00'
	// const ms		= (time.ms)
	// 	? `${time.ms}`.padStart(3, '0')
	// 	: '000'

	const ar_time		= [hour, minute, second]
	const string_time	= ar_time.join(self.time_separator)


	return string_time
}//end time_to_string



/**
* DATE_TIME_TO_STRING
* Converts a combined `dd_date` object (holding both calendar-date and clock-time
* fields) into a single display string of the form `'DD/MM/YYYY HH:MM:SS'`
* (separators and order adapt to `date_separator` / `time_separator` and the
* global `dedalo_date_order` setting).
*
* Delegates to `date_to_string` for the date portion and `time_to_string` for
* the time portion, then concatenates them with a single space.
*
* Used by the `'date_time'` and `'time_range'` rendering paths.
*
* @param {Object|null} time - A `dd_date` object that may contain any combination
*   of `{ year, month, day, hour, minute, second }`. Pass `null`/`undefined` to
*   get an empty string.
* @returns {string} Combined date-time string, e.g. `'22/07/2023 13:54:00'`.
*                   Returns `''` when `time` is falsy.
*/
component_date.prototype.date_time_to_string = function(time) {

	const self	= this

	if (!time) {
		return ''
	}

	const string_date	= self.date_to_string(time)
	const string_time	= self.time_to_string(time)


	const string_date_time = string_date + ' ' + string_time


	return string_date_time
}//end date_time_to_string



/**
* PARSE_STRING_TIME
* Parses a free-text time string typed by the user into a validated `dd_date`
* object containing clock-time fields only (`hour`, `minute`, `second`).
*
* Input is split on `this.time_separator` (`:`) and each part is parsed with
* `parseInt`.  Three validation rules are applied:
*   - hour   must be in [0, 23].
*   - minute must be in [0, 59].
*   - second must be in [0, 59].
*
* Special empty-clear case: when the string is empty (or splits into all-null
* tokens), the method returns `{ result: {} }` with no error — this signals
* the caller to delete the existing time value.  This is distinct from the
* "non-empty but unparseable" case which does push a `'full'`-type error.
*
* @param {string} string_time - User-entered time string, e.g. `'13:54:00'`.
* @returns {Object} Response bag:
*   ```
*   {
*     result : { hour?, minute?, second? },  // dd_date with time fields only
*     error? : [{ msg: string, type: 'full'|'hour'|'minute'|'second' }, …]
*   }
*   ```
*   `error` is only present when at least one validation failure occurred.
*   An empty `result` object (all fields absent) indicates a clear-value intent.
*/
component_date.prototype.parse_string_time = function(string_time) {

	const self	= this

	const ar_time_values	= string_time.split(self.time_separator)

	const hour = (ar_time_values[0])
		 ? parseInt(ar_time_values[0])
		 : null

	const minute = (ar_time_values[1])
		 ? parseInt(ar_time_values[1])
		 : null

	const second = (ar_time_values[2])
		 ? parseInt(ar_time_values[2])
		 : null

	// final dd_date
		const dd_date = {}

	// errors
		const error = []

	// check if the user input other things than times
	if(string_time.length >1 && (hour===null && minute===null && second===null)){
		const error_msg = get_label.error_invalid_date_format || 'Error: Date format is invalid'
		error.push({
			msg		: error_msg +'. '+ string_time,
			type	: 'full'
		})
	}
	// if all values are null, the user want delete the date, so return with all values with null to be delete
	if(hour===null && minute===null && second===null){
		// response
		const response = {
			result : {}
		}
		return response
	}

	if(hour!==null && hour>=0 && hour<=23){
		dd_date.hour = hour
	}else{
		const error_msg			= get_label.error_invalid_date_format || 'Error: Date format is invalid'
		const error_msg_hour	= get_label.hour || 'hour'
		error.push({
			msg		: error_msg +'. '+ error_msg_hour +': '+ hour,
			type	: 'hour'
		})
		dd_date.hour = null
	}

	if(minute!==null && minute>=0 && minute<=59){
		dd_date.minute = minute
	}else{
		const error_msg			= get_label.error_invalid_date_format || 'Error: Date format is invalid'
		const error_msg_minute	= get_label.minute || 'minute'
		error.push({
			msg		: error_msg +'. '+ error_msg_minute +': '+ minute,
			type	: 'minute'
		})
		dd_date.minute = null
	}

	if(second!==null && second>=0 && second<=59){
		dd_date.second = second
	}else{
		const error_msg			= get_label.error_invalid_date_format || 'Error: Date format is invalid'
		const error_msg_second	= get_label.second || 'second'
		error.push({
			msg		: error_msg +'. '+ error_msg_second +': '+ second,
			type	: 'second'
		})
		dd_date.second = null
	}

	// response
		const response = {
			result : dd_date
		}
		if (error.length>0) {
			response.error = error
		}


	return response
}//end parse_string_time



/**
* PARSE_STRING_PERIOD
* Parses raw numeric year/month/day values from the period input widget into a
* `dd_date` object suitable for storage in the `period` container
* (`{ period: { year, month, day } }`).
*
* Unlike `parse_string_date`, this method receives an **object** (not a string)
* because the period widget renders three independent `<input>` elements and
* collects them into a plain object before calling this method.
*
* Validation: currently minimal — year/month/day are accepted as-is.  The
* commented-out month (<13) and day (<31) guards were intentionally disabled;
* they are left in the source for future reference if stricter validation of
* period fields is required.
*
* Year: `0` is a legal period duration (zero years), so the guard uses
* `typeof year === 'number'` rather than truthiness to allow it.
*
* @param {Object} values - An object with optional string-or-number fields:
*   `{ year?: string|number, month?: string|number, day?: string|number }`.
*   All inputs are coerced with `parseInt`.
* @returns {Object} Response bag:
*   ```
*   {
*     result : { year?, month?, day? },  // parsed period dd_date
*     error? : []                         // currently always empty (no active checks)
*   }
*   ```
*/
component_date.prototype.parse_string_period = function(values) {

	// values
		const year = values.year
			? parseInt(values.year)
			: null

		const month = values.month
			? parseInt(values.month)
			: null

		const day = values.day
			? parseInt(values.day)
			: null

	// final dd_date
		const dd_date = {}

	// errors
		const error = []

	// month check
		if(month){
			dd_date.month = month
			// if (month<13) {
			// 	dd_date.month = month
			// }else{
			// 	const error_msg			= get_label.error_invalid_date_format || 'Error: Date format is invalid'
			// 	const error_msg_second	= get_label.month || 'month'
			// 	error.push({
			// 		msg		: error_msg +'. '+ error_msg_second +': '+ month,
			// 		type	: 'month'
			// 	})
			// }
		}

	// day check
		if(day){
			dd_date.day = day
			// if (day<31) {
			// 	dd_date.day = day
			// }else{
			// 	const error_msg			= get_label.error_invalid_date_format || 'Error: Date format is invalid'
			// 	const error_msg_second	= get_label.day || 'day'
			// 	error.push({
			// 		msg		: error_msg +'. '+ error_msg_second +': '+ day,
			// 		type	: 'day'
			// 	})
			// }
		}

	// year check
		// allow 0 as value
		if(typeof year==='number'){
			dd_date.year = year
		}

	// response
		const response = {
			result : dd_date
		}
		if (error.length>0) {
			response.error = error
		}


	return response
}//end parse_string_period



/**
* VALUE_TO_STRING_VALUE
* Converts one data entry (a single array slot from `data.entries`) into a
* human-readable string, dispatching on the component's `date_mode`.
*
* Used by `get_content_value_read` (in `render_edit_component_date`) to produce
* read-only / print view output.  Edit mode receives raw `dd_date` objects from
* the server rather than pre-resolved strings (which is what list mode provides),
* so this helper bridges the gap.
*
* Output format per mode:
*   - `'date'`    → `date_to_string(start)`, e.g. `'25/04/2022'`
*   - `'range'`   → `'<start><>< end>'`, e.g. `'01/01/1999<>30/09/2008'`
*                   (!) Uses `'<>'` as a hard-coded separator here, not the
*                   `fields_separator` ontology property used by the server.
*   - `'period'`  → comma-joined label/value pairs using `get_label` plurals,
*                   e.g. `'years: 3, months: 10'`.  Zero values are omitted.
*   - `'time'`    → `time_to_string(start)`, e.g. `'13:54:00'`
*   - anything else (including `'date_time'`, `'time_range'`) falls through to
*                   the `'date'` case via `default`.
*
* @param {Object|null} current_value - One entry from `data.entries`, e.g.:
*   ```
*   { mode: 'range', start: { day:12, year:2023, month:3 }, end: { … } }
*   ```
*   or `null` / `undefined` when the slot is empty.
* @returns {string} Human-readable representation.  Returns `''` for null/empty input.
*/
component_date.prototype.value_to_string_value = function(current_value) {

	const self	= this

	// date mode
	const date_mode	= self.get_date_mode()

	// build date base on date_mode
	switch(date_mode) {

		case 'range': {
			const input_value_start	= (current_value && current_value.start)
				? self.date_to_string(current_value.start)
				: ''
			const input_value_end	= (current_value && current_value.end)
				? self.date_to_string(current_value.end)
				: ''

			return input_value_start +'<>'+ input_value_end
		}

		case 'period': {
			// period
				const period = (current_value && current_value.period)
					? current_value.period
					: {}

			// date values
				const year	= period.year  || 0
				const month	= period.month || 0
				const day	= period.day   || 0

			// pairs — only non-zero durations are emitted; pluralisation via get_label
				const pairs = []
				if (year>0) {
					const label_year	= (year>1) ? get_label.years : get_label.year
					pairs.push(`${label_year}: ${year}`)
				}
				if (month>0) {
					const label_month	= (month>1) ? get_label.months : get_label.month
					pairs.push(`${label_month}: ${month}`)
				}
				if (day>0) {
					const label_day	= (day>1) ? get_label.days : get_label.day
					pairs.push(`${label_day}: ${day}`)
				}

			return  pairs.join(', ')
		}

		case 'time':

			return (current_value)
				? self.time_to_string(current_value.start)
				: ''

		case 'date':
		default:

			return (current_value && current_value.start)
				? self.date_to_string(current_value.start)
				: ''
	}
}//end value_to_string_value



/**
* IS_EMPTY
* Reports whether the component currently holds no meaningful date/time data.
* The check is used by the search-mode UI to highlight the component wrapper
* when the user has entered a filter value (non-empty → highlighted).
*
* An instance is considered empty when:
*   - `data.entries` is absent or an empty array, OR
*   - every entry is falsy, OR
*   - every entry's `start`, `end`, and `period` containers are either absent
*     or themselves contain only `null`, `undefined`, or `''` values.
*
* Note: `has_data` inspects `Object.values` shallowly — nested objects (which do
* not occur in a flat `dd_date`) would be treated as truthy regardless of their
* own content.
*
* @returns {boolean} `true` when all entries are empty; `false` as soon as any
*                    non-empty container is found.
*/
component_date.prototype.is_empty = function() {

	const entries = this.data?.entries || []

	if(entries.length === 0) {
		return true
	}

	// Helper to check if a date/time/period object has at least one set value
	const has_data = (obj) => {
		if (!obj || typeof obj !== 'object') return false
		return Object.values(obj).some(val => val !== null && val !== undefined && val !== '')
	}

	for(const entry of entries) {
		if(entry) {
			if(has_data(entry.start) || has_data(entry.end) || has_data(entry.period)) {
				return false
			}
		}
	}

	return true
}//end is_empty



// @license-end
