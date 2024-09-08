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
				sqo				: sqo_count,
				prevent_lock	: true,
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



// @license-end
