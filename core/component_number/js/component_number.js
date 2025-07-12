// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_number} from '../../component_number/js/render_edit_component_number.js'
	import {render_list_component_number} from '../../component_number/js/render_list_component_number.js'
	import {render_search_component_number} from '../../component_number/js/render_search_component_number.js'



export const component_number = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	// ui
	this.minimum_width_px = 80 // integer pixels
}//end component_number



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_number.prototype.init					= component_common.prototype.init
	component_number.prototype.build				= component_common.prototype.build
	component_number.prototype.render				= common.prototype.render
	component_number.prototype.refresh				= common.prototype.refresh
	component_number.prototype.destroy				= common.prototype.destroy

	// change data
	component_number.prototype.save					= component_common.prototype.save
	component_number.prototype.update_data_value	= component_common.prototype.update_data_value
	component_number.prototype.update_datum			= component_common.prototype.update_datum
	component_number.prototype.change_value			= component_common.prototype.change_value
	component_number.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_number.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_number.prototype.list					= render_list_component_number.prototype.list
	component_number.prototype.tm					= render_list_component_number.prototype.list
	component_number.prototype.edit					= render_edit_component_number.prototype.edit
	component_number.prototype.search				= render_search_component_number.prototype.search

	component_number.prototype.change_mode			= component_common.prototype.change_mode



/**
* GET_FORMAT_NUMBER
* Get number formatted as properties say int || float.
* By default the number is a int
* When float is defined, it say the precision of the decimals as:
*	{
*		"type": "float",
*		"precision": 16
*	}
* Example with int: input 85,35 | output 85
* Example with float:2 : input 85.3568 | output 85.36
* @return number format_number
*/
const get_format_number = function ( self, number ) {

	// If the number is NaN (e.g., "" or just "-")
	// or if the number only contained a minus sign which resulted in 0,
	// then it's not a valid number.
	if (isNaN(number)) {
		console.error('Invalid number (isNaN):', number);
		return null;
	}

	// get properties or default values
	// (!) Note that Ontology previous to 04/07/2024 used a wrong object format like "type":{"float":2}
	const type		= self.context.properties?.type || 'float'
	const precision	= self.context.properties?.precision || 2

	const format_number = (type === 'float')
		? number.toFixed( precision )
		: number.toFixed();

	return Number( format_number )
}//end get_format_number



/**
* CLEAN_VALUE
* Remove and changes non accepted chars.
* Example: Change 17,2 to 17.2
* @param string|number|null value
* @return string|null cleaned
*/
component_number.prototype.clean_value = function( value ) {

	// Ensure the input is treated as a string to prevent errors
	// if value is null, undefined, or a number.
	const string_value = String(value);

	// Replace commas with dots
	const fixed_value = string_value.replace(/,/g, '.');

	// remove non accepted chars
	let cleaned = fixed_value.replace(/[^0-9.-]/g, '');

	if (!cleaned.length) {
		return null;
	}

	// Handling multiple dots: note that the search allows the use of the '...' operator.
	// Do not remove the dots here; do it in 'fix_number_format' instead.

	// Handle minus sign – only allow one at the start
	if (cleaned.includes('-')) {
		cleaned = (cleaned.startsWith('-') ? '-' : '') + cleaned.replace(/-/g, '');
	}


	return cleaned
}//end clean_value



/**
* FIX_NUMBER_FORMAT
* Force unified number format.
* Format used is floating point ( , used in Spanish or other languages are avoided, only . will be valid for decimals)
* Example: Change 17,2 to 17.2
* @param string value
* @return number|null new_number
*/
component_number.prototype.fix_number_format = function( value ) {

	const self = this

	// Initial check for null, undefined, or empty string.
	// Also handles if value is a number 0, which would be falsy but valid.
	// For robust string handling, String(value) is still recommended as in clean_value.
	if (value === null || value === undefined || value === '') {
		return null;
	}

	// 1. Clean the input string using the existing clean_value function.
	//    clean_value is expected to return a cleaned string (e.g., "17.2") or null.
	let cleaned_string = self.clean_value(value);

	// Handle multiple dots - keep only the first one
	const parts = cleaned_string.split('.');
	if (parts.length > 2) {
		cleaned_string = parts[0] + '.' + parts.slice(1).join('');
	}

	// If cleaning resulted in no valid numeric characters, return null.
	if (cleaned_string === null) {
		return null;
	}

	// 2. Convert the cleaned string to a JavaScript number.
	const numeric_value = Number(cleaned_string);

	// If the conversion results in NaN (e.g., cleanedString was "" or just "-")
	// or if the cleanedString only contained a minus sign which resulted in 0,
	// then it's not a valid number.
	if (isNaN(numeric_value)) {
		return null;
	}

	// 3. Apply additional formatting using get_format_number.
    //    Since get_format_number returns a NUMBER, we can directly use its result.
    const final_formatted_number = get_format_number(self, numeric_value);

    // 4. Final check: Ensure that get_format_number itself didn't return NaN.
    //    This is a safety net in case get_format_number has edge cases where it
    //    might produce an invalid number (e.g., if it attempts a division by zero).
    if (isNaN(final_formatted_number)) {
        // Log a warning if get_format_number behaved unexpectedly.
        console.error("get_format_number returned NaN for input:", numeric_value);
        return null;
    }


    return final_formatted_number;
}//end fix_number_format



/**
* GET_STEPS
* @return number steps
*/
component_number.prototype.get_steps = function() {

	const self = this

	// get properties or default values
	const type		= self.context.properties.type || 'float'
	const precision	= self.context.properties.precision || 2

	const base = 0

	const string_steps = (type === 'float')
		? base.toFixed( precision -1 )
		: base.toFixed();

	const steps = string_steps+'1'

	return Number( steps )
}//end get_steps



// @license-end
