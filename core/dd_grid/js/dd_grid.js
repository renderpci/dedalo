// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* DD_GRID
* Client-side controller for the dd_grid UI element.
*
* dd_grid is a specialised display unit that renders structured, multi-column grid data
* returned by the Dédalo API. Unlike ordinary components, a dd_grid instance always owns
* its own Request Query Object (`rqo`) and is responsible for fetching, counting, and
* presenting potentially-paginated tabular or card-layout data.
*
* Architecture notes:
* - dd_grid follows the standard Dédalo instance lifecycle:
*     init → build → render (→ refresh cycles) → destroy
* - Lifecycle methods (render, refresh, destroy) are mixed in from `common`.
* - The list renderer (`list`) is mixed in from `render_list_dd_grid` and dispatches to
*   view-specific renderers (view_default, view_table, view_mini, view_indexation,
*   view_descriptors) based on `self.view`.
* - Pagination is driven externally: the paginator calls `get_total()` on init/refresh
*   and `build()` with `autoload=true` when navigating pages.
* - `get_grid_values()` provides a flat list of resolved column values for callers that
*   need programmatic access to the displayed data (e.g. export, copy).
*
* Main exports: {dd_grid}
*/

// imports
	import {clone} from '../../common/js/utils/index.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {render_list_dd_grid} from '../../dd_grid/js/render_list_dd_grid.js'



/**
* DD_GRID
* Constructor for the dd_grid instance.
* Properties are intentionally declared without values here; they are populated
* by `init()` (via `common.prototype.init`) and the custom `init` override below.
*/
export const dd_grid = function(){

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.data_format
	this.lang

	this.rqo

	this.data
	this.node
	this.id

	this.events_tokens = []
}//end dd_grid



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	dd_grid.prototype.render	= common.prototype.render
	dd_grid.prototype.refresh	= common.prototype.refresh
	dd_grid.prototype.destroy	= common.prototype.destroy
	// render
	dd_grid.prototype.list		= render_list_dd_grid.prototype.list



/**
* INIT
* Custom init method.
* Call common init and then add custom properties
* @param {Object} options - Initialization options bag; standard fields are handled by
*   `common.prototype.init`; dd_grid-specific fields are documented below.
* @param {*} [options.data] - Pre-loaded grid data. When provided, `build()` need not
*   be called with `autoload=true`; the data is used directly by the renderer.
* @param {string} [options.column_id] - Identifier of the column driving this grid
*   instance (used by table view for column-mapping).
* @param {string} [options.view] - Which view variant to activate: 'default', 'table',
*   'mini', 'indexation', 'descriptors'. Falls back to `options.context.view` when the
*   caller is a section_record, then to 'default'.
* @param {Object} [options.config] - Arbitrary view configuration object forwarded to
*   the active view renderer (e.g. `config.data_format` in view_table).
* @param {Object} [options.paginator_options={}] - Options forwarded to the paginator
*   widget when this grid is paginatable. Defaults to an empty object.
* @param {Object} [options.totals_group={}] - Configuration for any totals/group-by
*   display rows. Defaults to an empty object.
* @returns {Promise<boolean>} Result from `common.prototype.init` (true on success,
*   false if already initialized).
*/
dd_grid.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await common.prototype.init.call(this, options);

	// set data if exists
		self.data = options.data
	// column_id
		self.column_id = options.column_id
	// view. When caller is section_record, the view is inside context
		self.view = options.view || (options.context ? options.context.view : 'default')
	// set config
		self.config = options.config
	// paginator options
		self.paginator_options = options.paginator_options || {}
	// totals group options
		self.totals_group = options.totals_group || {}


	return common_init
}//end build



/**
* BUILD
* Custom element builder
* @param {boolean} [autoload=false] - When true, fires an API 'read' request using
*   `self.rqo` and stores the response in `self.data`. When false (default), the
*   method only updates the status flags — useful when data was passed directly via
*   `options.data` in `init()`.
* @returns {Promise<boolean>} Always resolves to true.
*/
dd_grid.prototype.build	= async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// api request
		if (autoload===true) {
			const api_response = await data_manager.request({
				body : self.rqo
			})
			self.data = api_response.result || null
		}

	// status update
		self.status = 'built'


	return true
}//end build



/**
* GET_TOTAL
* Called by the paginator when is initiated or refreshed
*
* Returns the total number of matching records for the current rqo filter.
* On first call the count is unknown, so a separate API 'count' request is issued
* with `limit`/`offset`/`total` stripped from the sqo (to avoid double-counting
* side effects). The result is cached on `self.rqo.sqo.total` so subsequent calls
* to get_total() short-circuit without another round-trip.
*
* `prevent_lock` is set on the count rqo so the server skips the advisory record
* lock that would normally be acquired for a 'read' action.
*
* @returns {Promise<number|undefined>} The total record count stored in
*   `self.rqo.sqo.total`, or undefined if the API call fails.
*/
dd_grid.prototype.get_total = async function() {

	const self = this

	// already calculated case
		if (self.rqo.sqo.total || self.rqo.sqo.total===0) {
			return self.rqo.sqo.total
		}

	const rqo_count = clone(self.rqo)

	rqo_count.action = 'count'
	rqo_count.prevent_lock = true
	delete rqo_count.sqo.limit
	delete rqo_count.sqo.offset
	delete rqo_count.sqo.total

	const api_count_response = await data_manager.request({
		body		: rqo_count,
		use_worker	: true
	})

	// API error case
		if ( api_count_response.result===false || api_count_response.errors?.length ) {
			console.error('Error on count total : api_count_response:', api_count_response);
			return
		}

	// set result
		self.rqo.sqo.total = api_count_response.result.total


	return self.rqo.sqo.total
}//end get_total



/**
* GET_GRID_VALUES
* Recursively resolves the given dd_grid data
* @param {Array} data - Grid data tree as returned by the API. Each element is an
*   object with at minimum a `type` string property and optionally:
*   - `value` {Array|string|*} — nested child data or a scalar display value
*   - `type` {string} — node role; only nodes with type === 'column' AND a truthy
*     `cell_type` are included in the output.
*   - `cell_type` {string} — column display type, e.g. 'text', 'img', 'av', 'iri'.
*   - `model` {string} — component model name, e.g. 'component_image'.
*   - `label` {string} — human-readable column label.
*   - `ar_columns_obj` {Array} — column definition objects from the grid config.
* @returns {Array} Flat array of resolved column value objects. Each entry has shape:
*   `{ ar_columns_obj, model, label, value }` where `value` is the raw data to
*   display. Container nodes (type !== 'column' or no cell_type) are not included
*   directly but their children are recursed into.
* 	e.g. [{model:"component_image",label:"obverse",value:"https://domain.org/path/rsc29_rsc170_1381.jpg"}]
*/
dd_grid.prototype.get_grid_values = function(data) {

	const values = []

	const data_len = data.length
	for (let i = 0; i < data_len; i++) {

		const data_item = data[i]

		if (data_item && data_item.type) {

			if(data_item.value){

				// column case add
				if(data_item.type==='column' && data_item.cell_type){

					// values.push(data_item)
					values.push({
						ar_columns_obj	: data_item.ar_columns_obj,
						model			: data_item.model,
						label			: data_item.label,
						value			: data_item.value
					})
				}

				// value. Recursion
				const rec_values = this.get_grid_values(data_item.value)
				values.push(...rec_values)
			}
		}
	}//end for (let i = 0; i < data_len; i++)


	return values
}//end get_grid_values



// @license-end
