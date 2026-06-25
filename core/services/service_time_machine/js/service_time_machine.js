// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG */
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
* Data-logic service for Dédalo's Time Machine feature.
*
* Manages the full lifecycle — init → build → render → refresh — for listing
* historical snapshots of a section or component stored in the matrix time-machine
* table (section_tipo 'dd15', DEDALO_TIME_MACHINE_SECTION_TIPO).
*
* The service is always used as a child instance launched by tool_time_machine or
* the inspector panel; it is never standalone. The owning caller passes a `config`
* object that drives three key behaviours:
*
*   1. MODEL ROUTING — `config.model` selects the SQO filter strategy:
*      - 'section'   → lists deleted sections via a tipo-column filter
*      - 'dd_grid'   → lists all changes to a section record (inspector history)
*      - <component> → lists changes to a single component locator
*
*   2. DDO MAP CONSTRUCTION — build_request_config() assembles the ddo_map that
*      describes which activity columns to display (when, who, where, …).  All ddos
*      force mode='tm' and permissions=1 at build time (see build() inline note) to
*      prevent components from entering edit mode against TM (read-only) data.
*
*   3. PAGINATION — a paginator instance is created during build(); navigation
*      subscribes to 'paginator_goto_<id>' events and calls refresh().
*
* Prototype methods are mixed in from common (lifecycle) and from
* render_service_time_machine_list (list/tm rendering).
*
* Activity-log ontology tipos used for display columns (all from section dd15):
*   dd559  — when     (modification date, component_date)
*   dd578  — who      (modifier user id, component_autocomplete)
*   dd577  — where    (context path, component_input_text)
*   dd1371 — bulk_process_id (batch process number, component_number)
*   dd1574 — tm_value (raw component data column, component_json — debug only)
*   rsc329 — annotations (component_text_area — tool view only, section_tipo rsc832)
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
* Extend instance with shared prototype methods from common / render modules.
*/
// prototypes assign
	service_time_machine.prototype.build_rqo_show	= common.prototype.build_rqo_show
	// life-cycle
	service_time_machine.prototype.destroy			= common.prototype.destroy
	service_time_machine.prototype.refresh			= common.prototype.refresh
	service_time_machine.prototype.render			= common.prototype.render
	// list rendering entry-point (also aliased as 'tm' for back-compat caller resolution)
	service_time_machine.prototype.list				= render_service_time_machine_list.prototype.list
	service_time_machine.prototype.tm				= render_service_time_machine_list.prototype.list



/**
* INIT
* Seeds all instance properties from the options bag and validates the
* duplicate-init guard. Does NOT fetch data — call build() afterwards.
*
* Notable property assignments:
*   - tipo / section_tipo are always set to 'dd15' (the virtual time-machine section)
*   - section_tipo_caller / section_id_caller refer to the ORIGINATING section whose
*     history is being browsed, not the dd15 internal section
*   - mode is fixed to 'list'; type / data_source are fixed to 'tm'
*   - request_config is pre-built synchronously via build_request_config()
*
* @param {Object} options - Initialization bag passed by the owning tool/inspector
* @param {string} [options.model] - Caller model identifier (e.g. 'section', 'dd_grid', or a component model name)
* @param {string} options.section_tipo - section_tipo of the originating section being inspected
* @param {string|number} options.section_id - section_id of the originating record being inspected
* @param {string} [options.view='default'] - View variant: 'default', 'mini', 'tool', 'history'
* @param {string} options.lang - Active language tag (e.g. 'lg-eng')
* @param {string} [options.caller_tipo] - Ontology tipo of the component/section that opened this service
* @param {Object} [options.caller] - Parent instance (tool_time_machine or inspector)
* @param {Array}  [options.columns_map=[]] - Pre-built columns_map; overridden after build()
* @param {Object} [options.config={}] - Extended config object forwarded to build_request_config()
* @param {string} [options.id_variant] - Unique variant suffix to disambiguate multiple TM instances
* @param {Object} [options.datum] - Pre-fetched datum (data + context arrays) if already loaded by caller
* @param {Object} [options.context] - Pre-fetched context object if already available
* @param {Object} [options.data] - Pre-fetched data object if already available
* @param {number} [options.limit=10] - Page size for pagination
* @param {number} [options.offset=0] - Initial pagination offset
* @returns {Promise<boolean>} true on success; false if already initialized
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

	self.model					= options.model || 'service_time_machine'
	// (!) tipo and section_tipo always point to dd15 — the internal virtual section that
	// stores time-machine rows — not to the originating (caller) section.
	self.tipo					= 'dd15'
	self.section_tipo			= 'dd15'
	// Originating section reference. These are the section/record whose history is browsed.
	self.section_tipo_caller 	= options.section_tipo
	self.section_id_caller		= options.section_id
	// mode is always 'list'; individual ddos are later forced to mode='tm' in build()
	self.mode					= 'list' // only allowed 'tm'
	self.view					= options.view || 'default'
	self.lang					= options.lang
	// caller_tipo: the component or section tipo that triggered the TM viewer
	self.caller_tipo			= options.caller_tipo || null

	self.caller			= options.caller || null

	self.ar_instances	= [];

	self.events_tokens	= [];

	self.config			= options.config || {}

	self.id_variant		= options.id_variant || self.model

	self.datum			= options.datum || null
	self.context		= options.context
	self.data			= options.data

	// data_source='tm' instructs create_source() to attach this flag to every
	// RQO source block so the server reads from the time-machine matrix table.
	self.data_source	= 'tm';

	self.type			= 'tm'
	self.node			= null

	// columns_map
	self.columns_map	= options.columns_map || []

	self.limit			= options.limit ?? 10
	self.offset			= options.offset ?? 0

	// Build the full request_config synchronously here so build() can use it immediately.
	self.request_config	= self.build_request_config()

	// status update
	self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* Constructs the RQO, optionally fetches data from the API, creates the paginator,
* and resolves the columns_map ready for rendering.
*
* Workflow:
*   1. Generate the RQO via build_rqo_show() (uses the request_config built in init()).
*   2. Force all ddos in rqo.show.ddo_map to mode='tm' and permissions=1. This is
*      critical: if any ddo kept mode='edit' the component would trigger its default-
*      data save path and overwrite the real record with TM (historical) data.
*   3. If autoload=true, call the API, validate the response, and populate self.datum,
*      self.data, and self.context from the result.
*   4. Create and wire a paginator instance (one-shot guard via `if (!self.paginator)`).
*      The paginator_goto event updates rqo.sqo.offset and calls self.refresh().
*   5. Derive columns_map via get_columns_map() from the resolved context.
*
* @param {boolean} [autoload=false] - When true, fetch context+data from the API during build;
*   when false, data must have been passed as options to init() or loaded externally.
* @returns {Promise<boolean>} true on success; false on API error or destroyed state
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

			if (!self.caller || self.status==='destroyed') {
				return false
			}

			if (self.context) {
				// request_config_object. get the request_config_object from context
				self.request_config_object	= self.context && self.context.request_config
					? self.context.request_config.find(el => el.api_engine==='dedalo')
					: {}
			}else{
				// request_config_object. get the request_config_object from request_config
				// (used on first build before any API response has returned a context)
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
				self.rqo.show.ddo_map.forEach(ddo => {
					// change ddo properties to safe mode and permissions
					ddo.mode		= 'tm'
					ddo.permissions	= 1
				})

			// add component info. For API navigation track info only
			// get tipo from caller (tool_time_machine) caller (component or section)
				self.rqo.options = {
					caller_tipo : self.caller_tipo || self.caller?.caller?.tipo || null
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
					self.status = 'initialized' // do not leave the instance stuck in 'building'
					return false
				}
				// server: bad build context (guard against a missing context array, not just an empty one)
				if(!api_response.result.context || !api_response.result.context.length){
					console.error("Error: service_time_machine context unavailable", api_response);
					self.status = 'initialized' // do not leave the instance stuck in 'building'
					return false
				}

			// set the result to the datum
				self.datum		= api_response.result || []
				// self.data: find the dd15 sections data block within the datum data array
				self.data		= self.datum.data.find(el => el.tipo===self.tipo && el.typo==='sections')
				// self.context: find the root section context descriptor
				self.context	= self.datum.context.find(el => el.type==='section')

			// debug
				if(SHOW_DEBUG===true) {
					console.log('service_time_machine build api_response.result:', api_response.result);
				}

			// count rows. Fire-and-forget (the paginator awaits get_total separately);
			// catch so a rejected count request can't become an unhandled rejection.
				if (!self.total) {
					self.get_total().catch(e => console.error('[service_time_machine] get_total failed:', e))
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
					// ignore overlapping navigation while a refresh is in flight: offset
					// lives on the shared self.rqo.sqo, so two concurrent refreshes could
					// race and render an older page over a newer one.
						if (self._tm_navigating===true) {
							return
						}
						self._tm_navigating = true

					// loading
						const container = self.node.list_body
									   || self.node.content_data
						if (container) {
							container.classList.add('loading')
						}else{
							console.warn('No container found for pagination. Node:', self.node);
						}

					try {
						// fix new offset value
							self.rqo.sqo.offset = offset

						// refresh
							await self.refresh()
					} finally {
						// loading
							if (container) container.classList.remove('loading')
							self._tm_navigating = false
					}
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
*
* Constructs a complete request_config array (Dédalo API engine format) with:
*   - An SQO tailored to one of three model strategies (section / dd_grid / component)
*   - A default_ddo_map with activity columns (bulk_process_id, when, who, where)
*   - Optional extra columns: annotations (tool view + component model only) and a
*     raw-value debug column (SHOW_DEBUG only)
*   - Caller-defined ignore_columns list applied to prune unwanted columns
*   - Extra ddo entries from config.ddo_map merged in (parent/section_tipo normalized to dd15)
*
* SQO model strategy summary:
*   'section'  → filter on section tipo column, ORDER BY section_id ASC (deleted sections)
*   'dd_grid'  → filter_by_locators for the full section record (all-field history)
*   <component>→ filter_by_locators for the specific component locator (lang-aware)
*
* All ddos set section_tipo to 'dd15' (DEDALO_TIME_MACHINE_SECTION_TIPO) because the
* time-machine matrix table stores rows under that virtual section, not the caller's section.
*
* @returns {Array|null} request_config array with one 'dedalo' api_engine entry, or null
*   if config is absent/empty (programming error — logged to console)
*/
service_time_machine.prototype.build_request_config = function() {

	const self = this

	// config. config is an object with basic component/section definitions and preferences (model, tipo, section_tipo, section_id, lang)
		const config = self.config
		if (!config || Object.keys(config).length === 0) {
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
		const section_tipo			= self.section_tipo
		const section_id_caller		= self.section_id_caller
		const section_tipo_caller 	= self.section_tipo_caller

	// sqo
		// common base sqo
		const sqo = config_sqo
			? config_sqo
			: {
				id				: 'time_machine_temporal',
				mode			: 'tm',
				section_tipo	: [{ tipo : section_tipo_caller }],
				limit			: self.limit,
				offset			: 0,
				order			: [{
					direction	: 'DESC',
					path		: [{ component_tipo : 'id' }]
				}],
				skip_projects_filter : true
			  }
		// custom sqo modifier based on config model
		if (!config_sqo) {
			switch (model) {

				case 'section':

					// section case. Usually from Tool Time machine listing deleted sections

					// sqo. filter
					sqo.parsed = false
					sqo.filter = {
						$and : [
							{
								q			: section_tipo_caller,
								operator	: "=",
								format		: "column",
								column_name	: "tipo",
								path		: [{ section_tipo : section_tipo_caller }]
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
						section_tipo	: section_tipo_caller,
						section_id		: section_id_caller
						// removed because limit components by lang
						// lang			: lang // (!) used only in time machine to filter by column lang
					}]
					break;

				default:

					// component case. Usually from tool or inspector component history
					const current_locator =	{
						section_tipo	: section_tipo_caller,
						section_id		: section_id_caller,
						tipo			: tipo, // (!) used only in time machine to filter by column tipo
						lang			: lang, // (!) used only in time machine to filter by column lang
					}

					// sqo. filter_by_locators
					sqo.filter_by_locators = [current_locator]
					break;
			}
		}//end if (!config_sqo)

	// ddo_map
		// default_ddo_map. Note that this ddo_map overwrite the default section request_config show ddo_map (!)
		// It will be coherent with server generated subcontext (section->get_tm_context) to avoid lost columns on render the list
		const default_ddo_map = [
			//  matrix_id . tm info -> Id
			// {
			// 	id				: 'matrix_id',
			// 	tipo			: 'dd1573',
			// 	type			: 'component',
			// 	typo			: 'ddo',
			// 	model			: 'component_section_id',
			// 	section_tipo	: section_tipo,
			// 	parent			: section_tipo,
			// 	label			: 'Matrix id',
			// 	mode			: 'list',
			// 	view			: 'mini'
			// },
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
			// when dd559 (from activity section)
			{
				id				: 'when',
				tipo			: 'dd559',
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
			// who dd578 (from activity section)
			{
				id				: 'who',
				tipo			: 'dd578',
				type			: 'component',
				typo			: 'ddo',
				model			: 'component_autocomplete',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				debug_label		: 'Who',
				mode			: 'tm',
				view			: 'mini'
			},
			// where dd577 (from activity section)
			{
				id				: 'where',
				tipo			: 'dd577',
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

		// tool view case
			if (self.view==='tool' && model?.includes('component')) {
				default_ddo_map.push(
					// annotations rsc329 (section_tipo "rsc832")
					{
						id				: 'annotations',
						tipo			: 'rsc329',
						type			: 'component',
						typo			: 'ddo',
						model			: 'component_text_area',
						section_tipo	: section_tipo,
						parent			: section_tipo,
						debug_label		: 'annotations',
						mode			: 'tm',
						view			: 'mini'
					}
				)
				// Debug value column only in debug mode
				if (SHOW_DEBUG) {
					// component value dd1574 (time machine data column)
					default_ddo_map.push(
						{
							id				: 'tm_value_debug',
							tipo			: 'dd1574',
							type			: 'component',
							typo			: 'ddo',
							model			: 'component_json',
							section_tipo	: section_tipo,
							parent			: section_tipo,
							debug_label		: 'Component raw value - Column "data" (debug)',
							mode			: 'tm',
							view			: 'mini'
						}
					)
				}
			}

		// ignore_columns
		const ignore_columns = config.ignore_columns || []

		// Remove ignore_columns by id defined in callers (tool, inspector, etc)
		const ddo_map = default_ddo_map.filter( el => !ignore_columns.includes(el.id) )

		// config_ddo_map. Additional ddo array
			if (config_ddo_map) {
				const config_ddo_map_length = config_ddo_map.length
				for (let i = 0; i < config_ddo_map_length; i++) {
					const item = config_ddo_map[i]
					// Normalize parent and section_tipo to dd15 so the server
					// resolves the ddo against the time-machine virtual section.
					item.parent 		= section_tipo
					item.section_tipo 	= section_tipo
					ddo_map.push(item)
				}
			}

	// debug
		if(SHOW_DEBUG===true) {
			console.log('service_time_machine build_request_config ddo_map:', ddo_map);
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
* Async API call to count the total number of time-machine rows matching the
* current SQO (excluding limit/offset/select/generated_time).
*
* The count RQO is derived by cloning self.rqo.sqo and stripping pagination fields
* so the server returns a full count. The result is cached in self.total and the
* paginator uses it to calculate the total number of pages.
*
* Guard against concurrent calls: if a count request is already in flight
* (self.loading_total_status === 'resolving') the method re-calls itself after
* 100 ms until the first call has stored self.total.
*
* @returns {Promise<number|undefined>} self.total — the row count from the server,
*   or undefined on API error
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
			// clear the lock so a later call retries the count instead of busy-polling
			// 'resolving' forever (which would also hang the paginator awaiting get_total).
			self.loading_total_status = null
			return
		}

	// set result
		self.total = api_count_response.result.total

	// loading status update
		self.loading_total_status = 'resolved'


	return self.total
}//end get_total



// @license-end
