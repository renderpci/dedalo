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
* When float is defined, it say the precision of the decimals; float:2
* Example with int: input 85,35 | output 85
* Example with float:2 : input 85.3568 | output 85.36
* @return number format_number
*/
const get_format_number = function ( self, number ) {

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
* FIX_NUMBER_FORMAT
* Force unified number format.
* Format used is floating point ( , used in Spanish or other languages are avoided, only . will be valid for decimals)
* Example: Change 17,2 to 17.2
* @param string value
* @return number|null new_number
*/
component_number.prototype.fix_number_format = function( value ) {

	const self = this

	// replace , by .
	const fixed_value = value.replace(/,/g, '.');

	// remove non accepted chars
	const regex		= /[^0-9\.,]/gm;
	const result	= fixed_value.replace(regex, '');
	if (!result.length) {
		return null
	}

	// format the number
	const new_number = get_format_number(self, Number(result) )

	// non number case
	if(isNaN(new_number)) {
		return null
	}

	return Number( new_number )
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
