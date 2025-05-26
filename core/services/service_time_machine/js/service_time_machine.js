// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../../../core/common/js/event_manager.js'
	import {clone} from '../../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../../core/common/js/data_manager.js'
	import {common, get_columns_map, create_source} from '../../../../core/common/js/common.js'
	import {paginator} from '../../../paginator/js/paginator.js'
	import {render_service_time_machine_list} from './render_service_time_machine_list.js'



/**
* SERVICE_TIME_MACHINE
* Time machine data logic service
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
	this.fixed_columns_map	= null
}//end service_time_machine



/**
* COMMON FUNCTIONS
* extend config functions from common
*/
// prototypes assign
	service_time_machine.prototype.build_rqo_show	= common.prototype.build_rqo_show
	// life-cycle
	service_time_machine.prototype.destroy			= common.prototype.destroy
	service_time_machine.prototype.refresh			= common.prototype.refresh
	service_time_machine.prototype.render			= common.prototype.render
	service_time_machine.prototype.list				= render_service_time_machine_list.prototype.list
	service_time_machine.prototype.tm				= render_service_time_machine_list.prototype.list



/**
* INIT
* @param object options
* @return bool
*/
service_time_machine.prototype.init = async function(options) {

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

	self.model			= options.model || 'service_time_machine'
	self.tipo			= options.section_tipo
	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.mode			= 'tm' // only allowed 'tm'
	self.view			= options.view || 'default'
	self.lang			= options.lang

	self.caller			= options.caller || null

	self.ar_instances	= [];

	self.events_tokens	= [];

	self.config			= options.config || {}

	self.id_variant		= options.id_variant || self.model

	self.datum			= options.datum || null
	self.context		= options.context
	self.data			= options.data

	self.data_source	= 'tm';

	self.type			= 'tm'
	self.node			= null

	// columns_map
	self.columns_map	= options.columns_map || []

	self.limit			= options.limit ?? 10
	self.offset			= options.offset ?? 0

	self.request_config	= self.build_request_config()

	// status update
	self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* @param bool autoload = false
* @return bool
*	resolve bool true
*/
service_time_machine.prototype.build = async function(autoload=false) {

	const self = this

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
				// request_config_object. get the request_config_object from context
				self.request_config_object	= self.context && self.context.request_config
					? self.context.request_config.find(el => el.api_engine==='dedalo')
					: {}
			}else{
				// request_config_object. get the request_config_object from request_config
				self.request_config_object = self.request_config
					? self.request_config.find(el => el.api_engine==='dedalo')
					: {}
			}

			// rqo build
			const action	= 'search'
			const add_show	= true
			self.rqo = self.rqo || await self.build_rqo_show(self.request_config_object, action, add_show)

			// set the ddo_map with mode = list and permissions = 1
			// This change is important because the components could be configured in edit mode
			// if the component is loaded in edit mode it will fire the default data and save the section
			// (!) IT'S A VERY BAD SITUATION, BECAUSE THE SECTION IS SAVED WITH THE TM DATA (OLD DATA)
				self.rqo.show.ddo_map.map(ddo => {
					// change ddo properties to safe mode and permissions
					ddo.mode		= 'tm'
					ddo.permissions	= 1

					return ddo
				})

			// add component info. For API navigation track info only
			// get tipo from caller (tool_time_machine) caller (component or section)
				self.rqo.options = {
					caller_tipo : self.caller.caller.tipo
				}
		}
		await generate_rqo()

	// load data if is not already received as option
		if (autoload===true) {

			// API request. Get context and data
				const api_response = await data_manager.request({
					body		: self.rqo,
					use_worker	: true
				})
				// server: wrong response
				if (!api_response || !api_response.result) {
					console.error('Error: Invalid API response', api_response);
					return false
				}
				// server: bad build context
				if(!api_response.result.context.length){
					console.error("Error: service_time_machine context unavailable", api_response);
					return false
				}

			// set the result to the datum
				self.datum		= api_response.result || []
				self.data		= self.datum.data.find(el => el.tipo===self.tipo && el.typo==='sections')
				self.context	= self.datum.context.find(el => el.type==='section')

			// count rows
				if (!self.total) {
					self.get_total()
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
				const paginator_goto_handler = async (offset) => {
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

					// refresh
						await self.refresh()

					// loading
						if (container) container.classList.remove('loading')
				}
				self.events_tokens.push(
					event_manager.subscribe('paginator_goto_'+self.paginator.id , paginator_goto_handler)
				)
		}//end if (!self.paginator)

	// reset fixed_columns_map (prevents to apply rebuild_columns_map more than once)
		self.fixed_columns_map = false

	// columns_map. Get the columns_map to use into the list
		self.columns_map = get_columns_map({
			context			: self.context,
			datum_context	: self.datum.context
		})

	// status update
		self.status = 'built'


	return true
}//end build



/**
* BUILD_REQUEST_CONFIG
* Build a new service_time_machine custom request config based on caller requirements
* Note that columns 'matrix id', 'modification date' and 'modification user id' are used only for context, not for data
* Data for this config is calculated always from section in tm mode using a custom method: 'get_tm_ar_subdata'
* @return object context
*/
service_time_machine.prototype.build_request_config = function() {

	const self = this

	// config. config is an object with basic component/section definitions and preferences (model, tipo, section_tipo, section_id, lang)
		const config = self.config
		if (!config) {
			console.error('Error. config is mandatory');
			return null
		}

	// config short vars
		const model				= config.model
		const tipo				= config.tipo
		const lang				= config.lang || page_globals.dedalo_data_nolan
		const config_ddo_map	= config.ddo_map || []
		const config_sqo		= config.sqo || null

	// general vars
		const section_tipo	= self.section_tipo
		const section_id	= self.section_id

	// sqo
		// common base sqo
		const sqo = config_sqo
			? config_sqo
			: {
				id				: 'tmp',
				mode			: 'tm',
				section_tipo	: [{ tipo : section_tipo }],
				limit			: self.limit,
				offset			: 0,
				order			: [{
					direction	: 'DESC',
					path		: [{ component_tipo : 'id' }]
				}]
			  }
		// custom sqo modifier based on config model
		if (!config_sqo) {
			switch (model) {

				case 'section':

					// section case. Usually from Tool Time machine listing deleted sections

					// sqo. filter
						sqo.parsed = true,
						sqo.filter = {
							and : [
								{
									q_parsed	: "\'deleted\'",
									operator	: "=",
									format		: "column",
									column_name	: "state",
									path		: [{ section_tipo : section_tipo }]
								}
							]
						}
						sqo.order = [{
							direction	: 'ASC',
							path		: [{ component_tipo : 'section_id' }]
						}]
					break;

				case 'dd_grid':

					// time machine list case. Usually from inspector listing section changes history

					// sqo. filter_by_locators
						sqo.filter_by_locators = [{
							section_tipo	: section_tipo,
							section_id		: section_id
							// removed because limit components by lang
							// lang			: lang // (!) used only in time machine to filter by column lang
						}]
					break;

				default:

					// component case. Usually from tool or inspector component history
					const current_locator =	{
							section_tipo	: section_tipo,
							section_id		: section_id,
							tipo			: tipo, // (!) used only in time machine to filter by column tipo
							lang			: lang, // (!) used only in time machine to filter by column lang
						}

					// sqo. filter_by_locators
						sqo.filter_by_locators = [current_locator]
					break;
			}
		}//end if (!config_sqo)

	// ddo_map
		const ddo_map = []

		// default_ddo_map. Note that this ddo_map overwrite the default section request_config show ddo_map (!)
			// It will be coherent with server generated subcontext (section->get_tm_context) to avoid lost columns on render the list
			const default_ddo_map = [
				//  matrix_id . tm info -> Id
				{
					id				: 'matrix_id',
					tipo			: 'dd1573',
					type			: 'component',
					typo			: 'ddo',
					model			: 'component_section_id',
					section_tipo	: section_tipo,
					parent			: section_tipo,
					label			: 'Matrix id',
					mode			: 'tm',
					view			: 'mini'
				},
				//  bulk_process_id . tm info -> Process
				{
					id				: 'bulk_process_id',
					tipo			: 'dd1371',
					type			: 'component',
					typo			: 'ddo',
					model			: 'component_number',
					section_tipo	: section_tipo,
					parent			: section_tipo,
					debug_label		: 'Bulk process id',
					mode			: 'tm',
					view			: 'mini'
				},
				// when dd547 (from activity section)
				{
					id				: 'when',
					tipo			: 'dd547',
					type			: 'component',
					typo			: 'ddo',
					model			: 'component_date',
					section_tipo	: section_tipo,
					parent			: section_tipo,
					debug_label		: 'When',
					mode			: 'tm',
					view			: 'mini',
					properties		: {
						date_mode : 'date_time'
					}
				},
				// who dd543 (from activity section)
				{
					id				: 'who',
					tipo			: 'dd543',
					type			: 'component',
					typo			: 'ddo',
					model			: 'component_input_text',
					section_tipo	: section_tipo,
					parent			: section_tipo,
					debug_label		: 'Who',
					mode			: 'tm',
					view			: 'mini'
				},
				// where dd546 (from activity section)
				{
					id				: 'where',
					tipo			: 'dd546',
					type			: 'component',
					typo			: 'ddo',
					model			: 'component_input_text',
					section_tipo	: section_tipo,
					parent			: section_tipo,
					debug_label		: 'Where',
					mode			: 'tm',
					view			: 'mini'
				}
			]
			// add defaults
			ddo_map.push(...default_ddo_map)

		// tool view case
			if (self.view==='tool' && model.includes('component')) {
				ddo_map.push(
					// annotations rsc329 (section_tipo "rsc832")
					{
						id				: 'annotations',
						tipo			: 'rsc329',
						type			: 'component',
						typo			: 'ddo',
						model			: 'component_text_area',
						section_tipo	: 'rsc832',
						parent			: section_tipo,
						debug_label		: 'annotations',
						mode			: 'tm',
						view			: 'mini'
					}
				)
			}

		// config_ddo_map. Additional ddo array
			if (config_ddo_map) {
				const config_ddo_map_length = config_ddo_map.length
				for (let i = 0; i < config_ddo_map_length; i++) {
					const item = config_ddo_map[i]
					ddo_map.push(item)
				}
			}

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			type		: 'main',
			sqo			: sqo,
			show		: {
				ddo_map : ddo_map
			}
		}]


	return request_config
}//end build_request_config



/**
* GET_TOTAL
* Exec a async API call to count the current sqo records
* @return int self.total
*/
service_time_machine.prototype.get_total = async function() {

	const self = this

	// debug
		if(SHOW_DEBUG===true) {
			console.warn('service_time_machine get_total self.total:', self.total);
		}

	// already calculated case
		if (self.total || self.total==0) {
			return self.total
		}

	// queue. Prevent double resolution calls to API
		if (self.loading_total_status==='resolving') {
			return new Promise(function(resolve){
				setTimeout(function(){
					resolve( self.get_total() )
				}, 100)
			})
		}

	// loading status update
		self.loading_total_status = 'resolving'

	// API request
		const count_sqo = clone(self.rqo.sqo)
		delete count_sqo.limit
		delete count_sqo.offset
		delete count_sqo.select
		delete count_sqo.generated_time

		const source	= create_source(self, null)
		const rqo_count = {
			action			: 'count',
			prevent_lock	: true,
			sqo				: count_sqo,
			source			: source
		}
		const api_count_response = await data_manager.request({
			body		: rqo_count,
			use_worker	: true,
			retries : 5, // try
			timeout : 10 * 1000 // 10 secs waiting response
		})

	// API error case
		if (!api_count_response.result || api_count_response.error) {
			console.error('Error on count total : api_count_response:', api_count_response);
			return
		}

	// set result
		self.total = api_count_response.result.total

	// loading status update
		self.loading_total_status = 'resolved'


	return self.total
}//end get_total



// @license-end
