// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/*

	// FORMAT OF THE JSON GET FROM SERVER
	// the context is the header of the list, with the columns resolution
	// the data is the rows of the list
	// it can mix some different columns (number, types, name of columns) which come from different sections

	{
		"context": [
			{
				"section_tipo": "oh1",
				"section_label": "Oral History",
				"component_tipo": "id",
				"component_label": "id"
			},
			{
				"section_tipo": "oh1",
				"section_label": "Oral History",
				"component_tipo": "oh14",
				"component_label": "code"
			},
			{
				"section_tipo": "oh1",
				"section_label": "Oral History",
				"component_tipo": "oh22",
				"component_label": "title"
			},
			{
				"section_tipo": "pci1",
				"section_label": "Intangible heritage",
				"component_tipo": "id",
				"component_label": "id"
			},
			{
				"section_tipo": "pci1",
				"section_label": "Intangible heritage",
				"component_tipo": "pci32",
				"component_label": "Denomination"
			}
		],
		"data": [
			{
				"section_tipo": "oh1",
				"section_id": 1
			},
			{
				"from_component_tipo": "oh14",
				"value": "eog34"
			},
			{
				"from_component_tipo": "oh22",
				"value": "Interview to cc"
			},
			{
				"section_tipo": "oh1",
				"section_id": 2
			},
			{
				"from_component_tipo": "oh14",
				"value": "eog38"
			},
			{
				"from_component_tipo": "oh22",
				"value": "Interview to jj"
			},
			{
				"section_tipo": "pci1",
				"section_id": 32
			},
			{
				"from_component_tipo": "pci32",
				"value": "h-kold38"
			}
		]
	}
*/



// import
	import {common} from '../../common/js/common.js'
	import {render_relation_list} from './render_relation_list.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {clone, open_records_in_window} from '../../common/js/utils/index.js'



/**
* RELATION_LIST
*
*/
export const relation_list = function() {

	this.id						= null

	// element properties declare
	this.model					= null
	this.type					= null
	this.tipo					= null
	this.section_tipo			= null
	this.section_id				= null
	this.mode					= null
	this.lang					= null

	this.datum					= null
	this.context				= null
	this.data					= null

	this.node					= null
	this.status					= null
	this.filter					= null

	this.request_config_object	= null
	this.rqo					= null

	this.events_tokens			= []

	return true
}//end relation_list



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	relation_list.prototype.destroy			= common.prototype.destroy
	relation_list.prototype.edit			= render_relation_list.prototype.edit
	relation_list.prototype.render			= common.prototype.render
	relation_list.prototype.refresh			= common.prototype.refresh
	relation_list.prototype.build_rqo_show	= common.prototype.build_rqo_show



/**
* INIT
* @param object options
* @return bool true
*/
relation_list.prototype.init = function(options) {

	const self = this

	// safe init double control. To detect duplicated events cases
		if (typeof this.is_init!=='undefined') {
			console.error('Duplicated init for element:', this);
			if(SHOW_DEBUG===true) {
				alert('Duplicated init element');
			}
			return false
		}
		this.is_init = true

	// status update
		self.status = 'initializing'

	self.model			= 'relation_list'
	self.type			= options.type || 'detail'
	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.tipo			= options.tipo
	self.mode			= 'edit'
	self.node			= null
	self.context 		= {}
	self.limit			= options.limit ?? 10
	self.offset			= options.offset ?? 0
	self.total			= options.total ?? null

	// status update
	self.status = 'initialized'

	return true
}//end init



/**
* BUILD
* @param bool autoload = true
* @return bool true
*/
relation_list.prototype.build = async function(autoload=true){

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}

	// source
		const source = {
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			tipo			: self.tipo,
			mode			: self.mode,
			model			: self.model,
			action			: 'get_relation_list'
		}

	// sqo, use the "related" mode to get related sections that call to the current record (current section_tipo and section_id)
		const sqo = {
			section_tipo		: ['all'],
			mode				: 'related',
			limit				: self.limit,
			offset				: self.offset,
			full_count			: self.full_count,
			filter_by_locators	: [{
				section_tipo	: self.section_tipo,
				section_id		: self.section_id
			}]
		}

	// rqo, use the 'get_realtion_list' action from the API
		const rqo = {
			action	: 'read',
			source	: source,
			sqo		: sqo
		}
		self.rqo = rqo

	// load data if not yet received as an option
		if (autoload===true) {

			const api_response = await data_manager.request({
				use_worker	: true,
				body		: self.rqo
			})
			// console.log("RELATION_LIST api_response:", self.id, api_response);

			// set the result to the datum
				self.datum = api_response.result
		}

	// total
	// if the total is calculated and stored previously, don't calculate again.
	// total is the sum of all related sections to this record and don't change with the pagination.
		if(!self.total){

			//sqo, use the related mode to get all sections that call to the current record
			// is created new sqo because the sqo of the instance has offset and limit and total need to be the sum of all related sections
			const sqo_count = {
				section_tipo		: ['all'],
				mode				: 'related',
				filter_by_locators	: [{
					section_tipo	: self.section_tipo,
					section_id		: self.section_id
				}]
			}
			//rqo, use the 'count' action of the API
			const rqo = {
				action			: 'count',
				prevent_lock	: true,
				sqo				: sqo_count,
				source			: source
			}

			// set the response to the self.total
			self.total = await data_manager.request({
				body		: rqo,
				use_worker	: true
			})
			.then(function(response){
				if(response.result !== false){
					return response.result.total
				}
			})
		}

	// status update
		self.status = 'built'

	return true
}//end build



/**
* GET_RELATED_RECORDS
* Used to get unlimited related records for given section
* @param string section_tipo
* @return array ar_section_id
*/
relation_list.prototype.get_related_records = async function(section_tipo) {

	const self = this

	// get full list of records (without limit) from relation_list for this section

	// clone existing rqo
		const rqo = clone(self.rqo)

	// change some custom properties
		rqo.sqo.section_tipo	= [section_tipo]
		rqo.sqo.limit			= 0

	// call API
		const api_response = await data_manager.request({
			body : rqo
		})

	// check response
		if (!api_response.result) {
			console.error('invalid response from API:', api_response);
			return false
		}

	// ar_section_id. Array of section_id used for filter q
		const ar_section_id = api_response.result.data
			.filter(el => el.component_tipo==='id')
			.map(el => el.section_id)

	// debug
		if(SHOW_DEBUG===true) {
			console.log('))) get_related_records ar_section_id:', ar_section_id);
		}


	return ar_section_id
}//end get_related_records



/**
* OPEN_RELATED_RECORDS
* Target section filter is calculated and fixed in server.
* Then, opens a new window to navigate the results
* @param string section_tipo
* @param array ar_section_id
* @param string|null target_window
* @return bool true
*/
relation_list.prototype.open_related_records = async function(section_tipo, ar_section_id, target_window) {

	const self = this

	const window_options = {
		caller			: self,
		section_tipo	: section_tipo,
		ar_section_id	: ar_section_id,
		target_window	: target_window
	}

	return open_records_in_window( window_options )
}//end open_related_records



// @license-end
