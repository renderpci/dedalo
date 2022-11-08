/*global page_globals, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../../../core/common/js/event_manager.js'
	// import {get_instance} from '../../../../core/common/js/instances.js'
	import {clone, dd_console} from '../../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../../core/common/js/data_manager.js'
	import {common, get_columns_map, create_source} from '../../../../core/common/js/common.js'
	import {paginator} from '../../../paginator/js/paginator.js'



/**
* SERVICE_TIME_MACHINE
*   Time machine data logic service. Dot use to render !
*/
export const service_time_machine = function () {

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
}//end service_time_machine



/**
* COMMON FUNCTIONS
* extend element functions from common
*/
// prototypes assign
	service_time_machine.prototype.render			= common.prototype.render
	service_time_machine.prototype.refresh			= common.prototype.refresh
	service_time_machine.prototype.destroy			= common.prototype.destroy
	service_time_machine.prototype.build_rqo_show	= common.prototype.build_rqo_show



/**
* INIT
*/
service_time_machine.prototype.init = async function(options) {
	// console.log("service_time_machine INIT options:",options);

	const self = this

	self.model			= options.model || 'service_time_machine'
	self.tipo			= options.tipo
	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.mode			= options.mode || 'tm'
	self.lang			= options.lang

	self.caller			= options.caller || null

	self.main_element	= options.main_element || null
	self.id_variant		= options.id_variant || self.model

	self.datum			= options.datum || null
	self.context		= options.context
	self.data			= options.data

	self.type			= 'tm'
	self.node			= null

	// columns_map
	self.columns_map	= options.columns_map || []

	self.limit			= options.limit || 10
	self.offset			= options.offset || 0

	self.request_config = await self.build_request_config()

	// status update
	self.status = 'initiated'

	return true
}//end init



/**
* BUILD
* @param bool autoload = false
* @return promise
*	resolve bool true
*/
service_time_machine.prototype.build = async function(autoload=false) {

	const self = this

	console.log("===================== 1 build service_time_machine:",self);

	// console.log("self.prototype:",self);
	// self.build_rqo_show	= common.prototype.build_rqo_show
	// self.get_columns_map	= common.prototype.get_columns_map

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}

	// rqo
		// self.context = await self.build_context()
		const generate_rqo = async function(){

			if (self.context) {
				// rqo_config. get the rqo_config from context
				self.rqo_config	= self.context && self.context.request_config
					? self.context.request_config.find(el => el.api_engine==='dedalo')
					: {}
			}else{
				// rqo_config. get the rqo_config from request_config
				self.rqo_config = self.request_config
					? self.request_config.find(el => el.api_engine==='dedalo')
					: {}
			}

			// rqo build
			const action	= 'search'
			const add_show	= true
			self.rqo = self.rqo || await self.build_rqo_show(self.rqo_config, action, add_show)
		}
		await generate_rqo()

		// console.log("JSON.parse(JSON.stringify(self.rqo)): ----",JSON.parse(JSON.stringify(self.rqo)));

	// load data if is not already received as option
		if (autoload===true) {

			// get context and data
				const api_response = await data_manager.request({
					body : self.rqo
				})
				if(SHOW_DEVELOPER===true) {
					dd_console("service_TIME_MACHINE api_response:", 'DEBUG', [self.id, clone(api_response), api_response.debug ? api_response.debug.real_execution_time : '']);
				}

			// set the result to the datum
				self.datum		= api_response.result
				self.data		= self.datum.data.find(el => el.tipo===self.tipo && el.typo==='sections')
				self.context	= self.datum.context.find(el => el.type==='section')

			// count rows
				if (!self.total) {
					const count_sqo = clone(self.rqo.sqo)
					delete count_sqo.limit
					delete count_sqo.offset
					delete count_sqo.select
					delete count_sqo.generated_time
					const source	= create_source(self, null)
					const rqo_count = {
						action			: 'count',
						sqo				: count_sqo,
						prevent_lock	: true,
						source			: source
					}
					self.total = function() {
						return new Promise(function(resolve){
							data_manager.request({
								body : rqo_count
							})
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

			// event paginator_goto
				const fn_paginator_goto = async function(offset) {
					// loading
						const container = self.node.list_body
					   				   || self.node.content_data
						if (container) {
							container.classList.add('loading')
						}else{
							console.warn('No container found for pagination. Node:', self.node);
						}

					// fix new offset value
						self.rqo.sqo.offset = offset

					// set_local_db_data updated rqo
						// const rqo = self.rqo
						// data_manager.set_local_db_data(
						// 	rqo,
						// 	'rqo'
						// )

					// refresh
						await self.refresh()

					// loading
						if (container) container.classList.remove('loading')
				}
				self.events_tokens.push(
					event_manager.subscribe('paginator_goto_'+self.paginator.id , fn_paginator_goto)
				)
		}//end if (!self.paginator)

	// columns_map. Get the columns_map to use into the list
		self.columns_map = get_columns_map(self.context)

	// status update
		self.status = 'built'

	return true
}//end build



/**
* BUILD_REQUEST_CONFIG
* Build a new service_time_machine custom request config based on caller requirements
* Note that columns 'matrix id', 'modification date' and 'modification user id' are used only for context, not for data
* Data for this elements is calculated always from section in tm mode using a custom method: 'get_tm_ar_subdata'
* @return object context
*/
service_time_machine.prototype.build_request_config = function() {

	const self = this

	// main_element
		const main_element = self.main_element
			? self.main_element
			: null

		const section_tipo		= self.section_tipo
		const section_id		= self.section_id
		const lang				= main_element
			? main_element.lang
			: page_globals.dedalo_data_nolan

	// ddo_map. Note that this ddo_map overwrite the default section request_config show ddo_map (!)
	// It will be coherent with server generated subcontext (section->get_tm_context) to avoid lost columns on render the list
		const ddo_map = main_element && main_element.model==='section'
			? [] // em
			: [
				//  matrix id . tm info -> Id
				{
					tipo			: 'dd1573',
					type			: 'component',
					typo			: 'ddo',
					model			: 'component_section_id',
					section_tipo	: section_tipo,
					parent			: section_tipo,
					label			: 'Matrix id',
					mode			: 'list',
					view			: 'mini'
				},
				// when dd547 (from activity section)
				{
					tipo			: 'dd547',
					type			: 'component',
					typo			: 'ddo',
					model			: 'component_date',
					section_tipo	: section_tipo,
					parent			: section_tipo,
					debug_label		: 'When',
					mode			: 'list',
					view			: 'mini'
				},
				// who dd543 (from activity section)
				{
					tipo			: 'dd543',
					type			: 'component',
					typo			: 'ddo',
					model			: 'component_input_text',
					section_tipo	: section_tipo,
					parent			: section_tipo,
					debug_label		: 'Who',
					mode			: 'list',
					view			: 'mini'
				},
				// where dd546 (from activity section)
				{
					tipo			: 'dd546',
					type			: 'component',
					typo			: 'ddo',
					model			: 'component_input_text',
					section_tipo	: section_tipo,
					parent			: section_tipo,
					debug_label		: 'Where',
					mode			: 'list',
					view			: 'mini'
				}
			  ]

	// sqo
		const sqo = {
			id					: 'tmp',
			mode				: 'tm',
			section_tipo		: [{tipo:section_tipo}],
			limit				: self.limit,
			offset				: 0,
			order				: [{
				direction	: 'DESC',
				path		: [{component_tipo : 'id'}]
			}]
		}

	// component
	// add itself to the ddo_map when the caller set the main_element and set the component show if exists (portals) to ddo_map
		if(main_element){

			if (main_element.model==='section') {

				sqo.parsed = true,
				sqo.filter = {
					and : [
						{
							q_parsed		: "\'deleted\'",
							operator		: "=",
							format			: "column",
							column_name		: "state",
							path			: [
								{
									section_tipo	: section_tipo
								}
							]
						}
					]
				}

			}else{

				ddo_map.push({
					tipo			: main_element.tipo,
					type			: 'component',
					typo			: 'ddo',
					section_tipo	: section_tipo,
					model			: main_element.model,
					parent			: section_tipo,
					label			: main_element.label,
					mode			: 'list',
					view			: 'mini'
				})

				// filter_by_locators
				sqo.filter_by_locators = [{
					section_tipo	: section_tipo,
					section_id		: section_id,
					tipo			: main_element.tipo, // (!) used only in time machine to filter by column tipo
					lang			: lang // (!) used only in time machine to filter by column lang
				}]

				// filter
				// sqo.parsed = true,
				// sqo.filter = {
				// 	'$and' : [
				// 		{
				// 			q_parsed	: `\'${section_tipo}\'`,
				// 			operator	: "=",
				// 			path		: [{}],
				// 			format		: 'column',
				// 			column_name	: 'section_tipo'
				// 		},
				// 		{
				// 			q_parsed	: `${section_id}`,
				// 			operator	: "=",
				// 			path		: [{}],
				// 			format		: 'column',
				// 			column_name	: 'section_id'
				// 		},
				// 		{
				// 			q_parsed	: `\'${section_tipo}\'`,
				// 			operator	: "!=",
				// 			path		: [{}],
				// 			format		: 'column',
				// 			column_name	: 'tipo'
				// 		}
				// 	]
				// }

			}//end if (main_element.model==='section')

			// main_element show . From rqo_config_show
			const element_show = main_element.rqo_config && main_element.rqo_config.show && main_element.rqo_config.show.ddo_map
				? clone(main_element.rqo_config.show.ddo_map)
				: null
			if (element_show) {
				for (let i = 0; i < element_show.length; i++) {
					const item = element_show[i]
						  item.mode = 'list'
						  item.view = 'mini'

					item.section_tipo = Array.isArray(item.section_tipo)
						? item.section_tipo[0]
						: item.section_tipo

					item.parent	= item.section_tipo
					item.type	= 'component'
					item.typo	= 'ddo'

					ddo_map.push(item)
				}
				console.log('ddo_map:', ddo_map);
			}
		}else{

			// fallback (time machine list case) tm info -> Value
				// ddo_map.push({
				// 	tipo			: 'dd1574', // generic tm info ontology item 'Value'
				// 	type			: 'component',
				// 	typo			: 'ddo',
				// 	model			: 'component_input_text',
				// 	section_tipo	: section_tipo,
				// 	parent			: section_tipo,
				// 	debug_label		: 'Value',
				// 	mode			: 'list',
				// 	view			: 'mini'
				// })
			ddo_map.push({
				tipo			: 'dd1574', // generic tm info ontology item 'Value'
				type			: 'dd_grid',
				typo			: 'ddo',
				model			: 'dd_grid', // (!) changed to dd_grid to allow identification
				section_tipo	: section_tipo,
				parent			: section_tipo,
				debug_label		: 'Value',
				mode			: 'list',
				view			: 'mini'
			})

			sqo.filter_by_locators = [{
				section_tipo	: section_tipo,
				section_id		: section_id
				// removed because limit components by lang
				// lang			: lang // (!) used only in time machine to filter by column lang
			}]

			// filter
				// sqo.parsed = true,
				// sqo.filter = {
				// 	'$and' : [
				// 		{
				// 			q_parsed	: `\'${section_tipo}\'`,
				// 			operator	: "=",
				// 			path		: [{}],
				// 			format		: 'column',
				// 			column_name	: 'section_tipo'
				// 		},
				// 		{
				// 			q_parsed	: `${section_id}`,
				// 			operator	: "=",
				// 			path		: [{}],
				// 			format		: 'column',
				// 			column_name	: 'section_id'
				// 		},
				// 		{
				// 			q_parsed	: `\'${section_tipo}\'`,
				// 			operator	: "!=",
				// 			path		: [{}],
				// 			format		: 'column',
				// 			column_name	: 'tipo'
				// 		}
				// 	]
				// }
		}

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			// source	: source,
			sqo			: sqo,
			show		: {
				ddo_map : ddo_map
			}
		}]


	return request_config
}//end build_request_config



/**
* TM (render callback manager)
* Chose the view render module to generate DOM nodes
* @param object options
* @return DOM node wrapper | null
*/
service_time_machine.prototype.tm = async function(options) {

	const self = this

	// view (is injected by the caller)
		const view = self.view || null
		if (!view) {
			console.error("Error. self view is not defined:", self);
			return false
		}

	return self.view(self, options)
}//end tm
