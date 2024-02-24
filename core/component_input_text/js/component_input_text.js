// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {events_subscription} from './events_subscription.js'
	import {render_edit_component_input_text} from '../../component_input_text/js/render_edit_component_input_text.js'
	import {render_list_component_input_text} from '../../component_input_text/js/render_list_component_input_text.js'
	import {render_search_component_input_text} from '../../component_input_text/js/render_search_component_input_text.js'
	// import {render_mini_component_input_text} from '../../component_input_text/js/render_mini_component_input_text.js'
	// import {render_view_text} from '../../component_input_text/js/render_view_text.js'



export const component_input_text = function(){

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

	this.duplicates		= false

	// ui
	this.minimum_width_px = 90 // integer pixels
}//end component_input_text



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_input_text.prototype.init					= component_common.prototype.init
	component_input_text.prototype.build				= component_common.prototype.build
	component_input_text.prototype.render				= common.prototype.render
	component_input_text.prototype.refresh				= common.prototype.refresh
	component_input_text.prototype.destroy				= common.prototype.destroy
	component_input_text.prototype.events_subscription	= events_subscription

	// change data
	component_input_text.prototype.save					= component_common.prototype.save
	component_input_text.prototype.update_data_value	= component_common.prototype.update_data_value
	component_input_text.prototype.update_datum			= component_common.prototype.update_datum
	component_input_text.prototype.change_value			= component_common.prototype.change_value
	component_input_text.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_input_text.prototype.build_rqo			= common.prototype.build_rqo
	// component_input_text.prototype.build_rqo_show	= common.prototype.build_rqo_show
	// component_input_text.prototype.build_rqo_search	= common.prototype.build_rqo_search
	// component_input_text.prototype.build_rqo_choose	= common.prototype.build_rqo_choose

	// render
	component_input_text.prototype.list					= render_list_component_input_text.prototype.list
	component_input_text.prototype.tm					= render_edit_component_input_text.prototype.list
	component_input_text.prototype.edit					= render_edit_component_input_text.prototype.edit
	component_input_text.prototype.search				= render_search_component_input_text.prototype.search

	component_input_text.prototype.change_mode			= component_common.prototype.change_mode

	// output
	// component_input_text.prototype.get_raw_string	= render_view_text.prototype.get_raw_string



/**
* INIT
* @param object options
* @return bool
*/
component_input_text.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await component_common.prototype.init.call(self, options);

	return common_init
}//end init



/**
* IS_UNIQUE
* Check the value of the input_text with the all values in the database
* @result bool
* result:
* 	true : unique value, it not has any record inside the section.
* 	false: the value has almost 1 record inside the database, but it is not unique.
*/
component_input_text.prototype.is_unique = async function(new_value){

	const self = this

	if (new_value.length<1) {
		return false
	}

	// (!) UNFINISHED METHOD. STOP HERE !
	return true


	/* Working here !
	// const unique_config = self.context.properties.unique

	// search item rebuild filter q param and others
		const sqo = self.dd_request.search.find(item => item.typo==='sqo')
		// set limit on sqo
		sqo.limit = 1
		// set skip_projects_filter as true
		sqo.skip_projects_filter = true

		const filter = sqo.filter['$and']

		// filter item (expected one, under '$and' operator)
			const filter_item = filter[0]
			// add received value to filter
			filter_item.q = "=" + new_value
			// set the split words by spaces to false
			filter_item.q_split = false

		// exclude self record of search once
			if (filter.length===1) {
				const new_item_filter = {
					q 	 : '!=' + self.section_id,
					path : [
						{
							component_tipo	: 'section_id',
							model			: 'component_section_id',
							name			: 'Dummy section id',
							section_tipo	: [self.section_tipo]
						}
					]
				}
				filter.push(new_item_filter)
			}
			//console.log("filter_item:",filter_item);
			//console.log("new_item_filter:",new_item_filter);
			// console.log("sqo:",sqo);

	// load data
		const api_response	= await data_manager.read(self.dd_request.search)
		const data			= api_response.result.data

	// record data results from search
		const record = data.find(item => item.tipo===self.tipo)

	// result. If results are found, value is NOT unique
		//const result = (typeof record==="undefined") ? true : false

		if(SHOW_DEBUG===true) {
			console.log("+++++ is_unique api_response data:",data, record);
		}
	// render_views
		// Definition of the rendering views that could de used.
		// Tools or another components could add specific views dynamically
		// Sample:
		// {
		// 		view	: 'default',
		// 		mode	: 'edit',
		// 		render	: 'view_default_edit_portal'
		// 		path 	: './view_default_edit_portal.js'
		// }
		self.render_views = [
			{
				view	: 'text',
				mode	: 'edit',
				render	: 'view_text_input_text'
			},
			{
				view	: 'line',
				mode	: 'edit',
				render	: 'view_line_edit_input_text'
			},
			{
				view	: 'mini',
				mode	: 'edit',
				render	: 'view_mini_input_text'
			},
			{
				view	: 'print',
				mode	: 'edit',
				render	: 'view_default_edit_input_text'
			},
			{
				view	: 'default',
				mode	: 'edit',
				render	: 'view_default_edit_input_text',
				path 	: './view_default_edit_input_text.js'
			},
			{
				view	: 'ip',
				mode	: 'list',
				render	: 'view_ip_list_input_text'
			},
			{
				view	: 'mini',
				mode	: 'list',
				render	: 'view_mini_input_text'
			},
			{
				view	: 'text',
				mode	: 'list',
				render	: 'view_text_input_text'
			},
			{
				view	: 'default',
				mode	: 'list',
				render	: 'view_default_list_input_text'
			}
		]
	return record
	*/
}//end is_unique



/**
* VALIDATE
* Check the value of the input_text with the given regex defined in properties
* @param string value
* @result string safe_value
*/
component_input_text.prototype.validate = function( value ) {

	const self = this

	// empty string case
		if (value.length<1) {
			return value
		}

	// properties validation
	// sample definition in properties:
	//  "validation": {
	//		"mode": "replace",
	//		"regex": "[\\d\\s]",
	//		"options": "g",
	//		"replace": "",
	//		"process": "toLowerCase"
	// }
		const validation = self.context.properties.validation || {}
		if (!validation.mode) {
			console.warn('Undefined context.properties.validation !', self.context.properties );
			return value
		}

	// switch validation mode
	switch (validation.mode) {
		case 'replace': {
			// regex replace
				const re = new RegExp(
					validation.regex,
					validation.options || ''
				)
				const safe_value = value.replace(re, validation.replace)

			// process optional
				if (validation.process) {
					// like 'toLowerCase' to exec str.toLowerCase()
					return safe_value[validation.process]()
				}

			return safe_value
		}
		default:

			break;
	}

	return value
}//end validate




/**
* GET_FALLBACK_VALUE --> MOVED TO COMMON !
* Get the fallback values when the current language version of the data is missing
* @return array values data with fallback
*/
	// component_input_text.prototype.get_fallback_value = (value, fallback_value)=>{

	// 	const fallback		= []
	// 	const value_length	= (value.length===0)
	// 		? 1
	// 		: value.length

	// 	for (let i = 0; i < value_length; i++) {

	// 		if(value[i]){

	// 			fallback.push(value[i])

	// 		}else{

	// 			const marked_value = (fallback_value && fallback_value[i])
	// 				? "<mark>"+fallback_value[i]+"</mark>"
	// 				: ""

	// 			fallback.push(marked_value)
	// 		}
	// 	}

	// 	return fallback
	// }//end get_fallback_value



// @license-end
