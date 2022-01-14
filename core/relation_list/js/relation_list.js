/*

    # FORMAT OF THE JSON GET FROM SERVER
    # the @context is the header of the list, with the columns resolution
    # the data is the rows of the list
    # it can mix some different columns (number, types, name of columns) procedent of different sections

	{
		"context": [
			{
				"section_tipo": "oh1",
				"section_label": "Historia Oral",
				"component_tipo": "id",
				"component_label": "id"
			},
			{
				"section_tipo": "oh1",
				"section_label": "Historia Oral",
				"component_tipo": "oh14",
				"component_label": "codigo"
			},
			{
				"section_tipo": "oh1",
				"section_label": "Historia Oral",
				"component_tipo": "oh22",
				"component_label": "titulo"
			},
			{
				"section_tipo": "pci1",
				"section_label": "Patrimonio Cultural Inmaterial",
				"component_tipo": "id",
				"component_label": "id"
			},
			{
				"section_tipo": "pci1",
				"section_label": "Patrimonio Cultural Inmaterial",
				"component_tipo": "pci32",
				"component_label": "Denominación"
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

/**
* RELATION_LIST
*
*
*
*/
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {render_relation_list} from './render_relation_list.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {paginator} from '../../paginator/js/paginator.js'
	import {search} from '../../search/js/search.js'

/**
*  RELATION_LIST
*
*/
export const relation_list = function() {

	return true
};//end relation_list



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	relation_list.prototype.edit			= render_relation_list.prototype.edit
	relation_list.prototype.render			= common.prototype.render
	relation_list.prototype.refresh			= common.prototype.refresh
	relation_list.prototype.build_rqo_show	= common.prototype.build_rqo_show


/**
* INIT
* @return bool true
*/
relation_list.prototype.init = function(options) {

  const self = this

	self.id				= 'relation_list_' + options.tipo
	self.model			= 'relation_list'
	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.tipo			= options.tipo
	self.mode			= 'edit'
	self.node			= []
	self.context 		= {}
	self.limit			= options.limit || 10
	self.offset			= options.offset || 0
	self.full_count		= options.full_count || false

  // status update
    self.status = 'initiated'

  return true
};//end init


/**
* BUILD
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
		self.data = self.data || []

	const current_data_manager = new data_manager()

	// rqo
		const source = {
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			tipo			: self.tipo,
			mode			: self.mode,
			model 			: self.model
		}
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

		const rqo = {
			action	: 'get_relation_list',
			source	: source,
			sqo		: sqo
		}
		self.rqo = rqo

	// load data if not yet received as an option
		if (autoload===true) {

			const api_response = await current_data_manager.request({body:self.rqo})
				console.log("RELATION_LIST api_response:", self.id, api_response);

			// set the result to the datum
				self.datum = api_response.result
		}

	// status update
		self.status = 'builded'

	return true
};//end build

