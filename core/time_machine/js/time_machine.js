// import
	import {event_manager} from '../../../core/common/js/event_manager.js'
	// import {get_instance} from '../../../core/common/js/instances.js'
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, get_columns_map} from '../../../core/common/js/common.js'
	import {paginator} from '../../paginator/js/paginator.js'



/**
* TIME_MACHINE
* Tool to translate contents from one language to other in any text component
*/
export const time_machine = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.lang				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= []
	this.type				= null

	this.caller				= null

	return true
};//end time_machine



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	time_machine.prototype.refresh			= common.prototype.refresh
	time_machine.prototype.destroy			= common.prototype.destroy
	time_machine.prototype.build_rqo_show	= common.prototype.build_rqo_show
	// time_machine.prototype.get_columns_map	= common.prototype.get_columns_map


/**
* INIT
*/
time_machine.prototype.init = function(options) {
	// console.log("time_machine INIT options:",options);
	
	const self = this

	self.model			= options.model || 'time_machine'
	self.tipo			= options.tipo
	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.mode			= options.mode || 'tm'
	self.lang			= options.lang

	self.caller			= options.caller || null

	self.main_component	= options.main_component || null
	self.id_variant		= options.id_variant || self.model

	self.datum			= options.datum || null
	self.context		= options.context || {}
	self.data			= options.data || {}

	self.type			= 'tm'

	// columns_map
	self.columns_map	= options.columns_map || []

	self.limit			= options.limit || 10
	self.offset			= options.offset || 0

	// status update
	self.status = 'initiated'

	return true
};//end init


/**
* BUILD
* @return promise
*	bool true
*/
time_machine.prototype.build = async function(autoload=false) {

	const self = this

	console.log("self.prototype:",self);
	// self.build_rqo_show	= common.prototype.build_rqo_show
	// self.get_columns_map	= common.prototype.get_columns_map

	// status update
		self.status = 'loading'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}

	const current_data_manager	= new data_manager()

	// rqo
		self.context = await self.build_context()
		const generate_rqo = async function(){
			// rqo_config. get the rqo_config from context
			self.rqo_config	= self.context.request_config
				? self.context.request_config.find(el => el.api_engine==='dedalo')
				: {}

			// rqo build
			const action	= 'search'
			const add_show	= true
			self.rqo = self.rqo || await self.build_rqo_show(self.rqo_config, action, add_show)
		}
		await generate_rqo()

	// load data if is not already received as option
		if (autoload===true) {

			// get context and data
				const api_response = await current_data_manager.request({body:self.rqo})
				if(SHOW_DEVELOPER===true) {
					dd_console("TIME_MACHINE api_response:", 'DEBUG', [self.id, JSON.parse(JSON.stringify(api_response)), api_response.debug.exec_time]);
				}

			// set the result to the datum
				self.datum = api_response.result
				self.data		= self.datum.data.find(el => el.tipo===self.tipo && el.typo==='sections')

			// count rows
				if (!self.total) {
					const count_sqo = clone(self.rqo.sqo)
					delete count_sqo.limit
					delete count_sqo.offset
					delete count_sqo.select
					delete count_sqo.generated_time
					const rqo_count = {
						action			: 'count',
						sqo				: count_sqo,
						prevent_lock	: true
					}
					self.total = function() {
						return new Promise(function(resolve){
							current_data_manager.request({body:rqo_count})
							.then(function(api_count_response){
								self.total = api_count_response.result.total
								resolve(self.total)
							})
						})
					}
				}
		}//end if (autoload===true)

	// paginator
		if (!self.paginator) {

			self.paginator = new paginator()
			self.paginator.init({
				caller	: self,
				mode	: self.mode
			})

			// event paginator_goto_
				// fn_paginator_goto
				const fn_paginator_goto = async function(offset) {
					// loading
						const selector	= self.mode==='list' ? '.list_body' : '.content_data.section'
						const node		= self.node && self.node[0]
							? self.node[0].querySelector(selector)
							: null
						if (node) node.classList.add('loading')

					// fix new offset value
						self.rqo.sqo.offset = offset

					// set_local_db_data updated rqo
						current_data_manager.set_local_db_data(self.rqo, 'rqo')

					// refresh
						await self.caller.refresh()

					// loading
						if (node) node.classList.remove('loading')
				}
				self.events_tokens.push(
					event_manager.subscribe('paginator_goto_'+self.paginator.id , fn_paginator_goto)
				)
		}//end if (!self.paginator)

	// columns_map. Get the columns_map to use into the list
		self.columns_map = get_columns_map(self.context)

	// status update
		self.status = 'loaded'

	return true
};//end build


/**
* build_context
* Build a new time_machine custom request config based on caller requirements
* Note that columns 'matrix id', 'modification date' and 'modification user id' are used only for context, not for data
* Data for this elements is calculated always from section in tm mode using a custom method: 'get_tm_ar_subdata'
*/
time_machine.prototype.build_context = function() {

	const self = this

	// component
		const component = self.main_component
			? self.main_component
			: null

		// const component_tipo	= component.tipo
		const section_tipo		= self.section_tipo
		const section_id		= self.section_id
		const lang				= component.lang || page_globals.dedalo_data_nolan

		// const source = {
		// 	typo			: 'source',
		// 	action			: 'search',
		// 	model			: 'section',
		// 	section_tipo	: section_tipo,
		// 	tipo			: section_tipo,
		// 	section_id		: section_id,
		// 	mode			: 'edit',
		// 	lang			: 'lg-nolan'
		// }

	// ddo_map. Note that this ddo_map overwrite the default section request_config show ddo_map (!)
	// It will be coherent with server generated subcontext (section->get_tm_context) to avoid lost columns on render the list
		const ddo_map = [
			//  matrix id
			{
				tipo			: 'dd784', // fake tipo from projects, only used to allow get tm column id data,
				type			: 'component',
				typo			: 'ddo',
				model			: 'component_section_id',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				label			: 'Matrix id',
				mode			: 'list'
			},
			// modification date DEDALO_SECTION_INFO_MODIFIED_DATE dd201
			{
				tipo			: 'dd201',
				type			: 'component',
				typo			: 'ddo',
				model			: 'component_date',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				label			: 'Modification date',
				mode			: 'list'
			},
			// modification user id DEDALO_SECTION_INFO_MODIFIED_BY_USER dd197
			{
				tipo			: 'dd197',
				type			: 'component',
				typo			: 'ddo',
				model			: 'component_select',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				label			: 'Modification user',
				mode			: 'list'
			}
		]

		// component. add itself to the ddo_map when the caller set the main_component and set the component show if exists (portals) to ddo_map
		if(component){
			ddo_map.push({
				tipo			: component.tipo,
				type			: 'component',
				typo			: 'ddo',
				section_tipo	: section_tipo,
				model			: component.model,
				parent			: section_tipo,
				label			: component.label,
				mode			: 'list'
			})

			// component show . From rqo_config_show
			const component_show = component.rqo_config && component.rqo_config.show && component.rqo_config.show.ddo_map
				? JSON.parse( JSON.stringify(component.rqo_config.show.ddo_map) )
				: null
			if (component_show) {
				for (let i = 0; i < component_show.length; i++) {
					const item = component_show[i]
						  item.mode = 'list'
					ddo_map.push(item)
				}
			}
		}

	const filter_by_locators = (component)
		? [{
				section_tipo	: section_tipo,
				section_id		: section_id,
				tipo			: component.tipo, // (!) used only in time machine to filter by column tipo
				lang			: lang // (!) used only in time machine to filter by column lang
			}]
		: [{
				section_tipo	: section_tipo,
				section_id		: section_id,
				lang			: lang // (!) used only in time machine to filter by column lang
			}]

	// sqo
		const sqo = {
			id					: 'tmp',
			mode				: 'tm',
			section_tipo		: [{tipo:section_tipo}],
			filter_by_locators	: filter_by_locators,
			limit				: self.limit,
			offset				: 0,
			order				: [{
				direction	: 'DESC',
				path		: [{component_tipo : 'id'}]
			}]
		}

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			// source		: source,
			sqo			: sqo,
			show		: {
				ddo_map : ddo_map
			}
		}]

	// // context
		const context = {
			type			: 'tm',
			typo			: 'ddo',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			lang			: lang,
			mode			: 'tm',
			model			: 'time_machine',
			parent			: section_tipo,
			request_config	: request_config
		}

	return context
};//end build_context

