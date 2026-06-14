// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, Promise, page_globals */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../common/js/data_manager.js'
	import {clone} from '../../../common/js/utils/index.js'
	import {common, get_columns_map} from '../../../common/js/common.js'
	import {view_default_autocomplete} from './view_default_autocomplete.js'
	import {
		render_column_component_info
	} from '../../../component_portal/js/render_edit_component_portal.js'



/**
* SERVICE_AUTOCOMPLETE
* Pop-up search-and-select service wired to relation components and portals.
*
* Responsibilities:
*   - Accepts a typed search string from the caller UI and dispatches it to an
*     underlying search engine (Dédalo internal API or the external Zenon API).
*   - Builds and manages the Search Query Object (SQO) used for each request,
*     merging caller-supplied filters (filter_free), fixed ontology filters
*     (fixed_filter), and optional list-restriction filters (filter_by_list).
*   - Delegates all DOM rendering to view_default_autocomplete.
*   - Exposes keyboard navigation (ArrowDown/Up/Enter) for the result datalist.
*
* Consumers: component_portal, component_relation_parent, component_relation_children,
*   component_relation_related (formerly also the retired component_autocomplete /
*   component_autocomplete_hi).
*
* Lifecycle: init → build → render → [autocomplete_search …] → destroy
*
* Main exports:
*   service_autocomplete (constructor)
*/
export const service_autocomplete = function() {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.lang			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= []
	this.type			= null
	this.caller			= null
	this.search_cache	= {}
	this.limit			= 30
}//end service_autocomplete



/**
* COMMON FUNCTIONS
* extend config functions from common
*/
// prototypes assign
	// life-cycle
	service_autocomplete.prototype._parent_destroy = common.prototype.destroy
	// others
	service_autocomplete.prototype.hide		= view_default_autocomplete.hide
	service_autocomplete.prototype.show		= view_default_autocomplete.show



/**
* INIT
* Mandatory initial life-cycle function. Sets the service basic properties and state.
*
* Seeds all instance properties from `options` so that downstream lifecycle methods
* (build, render, autocomplete_search) can rely on their existence. Registers the
* instance on `window.page_globals.service_autocomplete` for debug inspection.
*
* A duplicate-call guard (`is_init`) prevents accidental double-initialisation.
* When SHOW_DEBUG is true a browser alert is fired in addition to the console error,
* making the error visible during development sessions.
*
* @param {Object} options - Initialization options
* @param {Object} options.caller - The component instance that owns this service
* @param {string} [options.view='text'] - View mode for the autocomplete renderer
* @param {string} [options.children_view] - View mode forwarded to child instances
* @param {Object} [options.properties={}] - Component properties sourced from the ontology
* @param {string} options.tipo - Structure tipo (ontology ID) of the host component
* @param {string} options.section_tipo - Section tipo that contains the host component
* @param {Array} options.request_config - Array of request-config objects (cloned internally)
* @param {string} [options.lang] - Language code; falls back to page_globals.dedalo_data_lang then 'lg-eng'
* @param {string} [options.id_variant] - Custom variant ID; defaults to 'service_autocomplete'
* @returns {Promise<boolean>} Resolves to true on success, false if already initialised
*/
service_autocomplete.prototype.init = async function(options) {

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

	// options
		self.caller			= options.caller
		self.view			= options.view || 'text'
		self.children_view	= options.children_view || null
		self.properties		= options.properties || {}
		self.tipo			= options.tipo
		self.section_tipo	= options.section_tipo
		self.request_config	= clone(options.request_config)
		self.lang			= options.lang || (typeof page_globals!=='undefined' ? page_globals.dedalo_data_lang : 'lg-eng')

	// id_base. Used for localStorage keys (filter state persistence)
	self.id_base = self.section_tipo + '_' + self.tipo

	// set properties
		self.model			= 'service_autocomplete'
		self.mode			= 'search'
		self.id_variant		= options.id_variant || self.model
		self.context		= {
			tipo			: self.tipo,
			section_tipo	: self.section_tipo,
			model			: self.model,
			lang			: self.lang,
			view			: self.view,
			children_view	: self.children_view,
			request_config	: self.request_config,
			mode			: self.mode,
			type			: 'autocomplete'
		}
		self.filter_free_nodes = []

	// DOM and instances
		self.node			= null
		self.ar_instances	= []

	// Set service instance as global (for debug only)
		window.page_globals.service_autocomplete = self

	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* Main build life-cycle function. Prepares the service search configurations,
* filters, operators, and columns mapping based on request_config.
*
* Implements a concurrency guard: if a build is already in progress the same
* Promise (`_build_waiter`) is returned so callers can safely await it without
* triggering a second build. If already built, returns true immediately.
*
* Key decisions made here:
*   - Locates the 'main' dedalo request_config entry that drives all searches.
*   - Resolves the boolean operator ($and/$or) from the config: search.sqo_config
*     takes priority over show.sqo_config; falls back to '$and'.
*   - Calls caller.build_rqo_search() to get the base SQO, ensuring project/language
*     scope matches the host component.
*   - Builds columns_map from the 'choose'→'search'→'show' ddo_map cascade.
*   - Registers a render callback for the optional 'ddinfo' info-panel column.
*   - Reads the persisted result limit from localStorage ('service_autocomplete_limit').
*
* (!) To change the operator default value, edit the request_config adding "sqo_config"
*     to "show" or "search":
*     {
*       "show": {
*         "sqo_config": { "operator": "$or" },
*         "ddo_map": [...]
*       }
*     }
*
* @param {Object} [options={}] - Build options
* @param {Object} [options.request_config_object] - Force a specific request-config entry,
*   bypassing the automatic lookup for type==='main' && api_engine==='dedalo'
* @returns {Promise<boolean>} Resolves to true on success, false when the required
*   request_config_object or rqo_search cannot be determined
*/
service_autocomplete.prototype.build = async function(options={}) {

	const self = this

	// check status to prevent concurrent builds
	switch (self.status) {
		case 'building':
			return self._build_waiter;
		case 'built':
			return true;
	}

	self.status = 'building'
	self._build_waiter = (async () => {

		// options vars
		self.request_config_object = (options.request_config_object)
			? options.request_config_object
			: self.request_config.find(el => el.api_engine === 'dedalo' && el.type === 'main')

		if (!self.request_config_object) {
			console.error('Error: Unable to find main dedalo request_config_object', self.request_config);
			self.status = 'initialized' // Reset status
			return false
		}

		// reset search options
		self.sqo				= {}
		self.ar_filter_by_list	= []
		self.ar_instances		= []
		self.list_name			= 's_' + Date.now()
		self.search_fired		= false

		// operator.
		// (!) To change the operator default value, edit the request_config adding "sqo_config" to "show":
		// {
		// 	"show": {
		// 		"sqo_config": {
		// 			"operator": "$or"
		// 		},
		// 		"ddo_map": [...]
		// 	}
		// }
		self.operator = self.request_config_object.search && self.request_config_object.search.sqo_config && self.request_config_object.search.sqo_config.operator
			? self.request_config_object.search.sqo_config.operator
			: self.request_config_object.show && self.request_config_object.show.sqo_config && self.request_config_object.show.sqo_config.operator
				? self.request_config_object.show.sqo_config.operator
				: '$and'

		// engine. get the search_engine sent or set the default value
		self.search_engine = self.request_config_object.api_engine || 'dedalo'

		// rqo_search, it's necessary do it by caller, because rqo is dependent of the source.
		// API get rqo to do the search as the caller.
		const rqo_search = await self.caller.build_rqo_search(self.request_config_object, 'search')
		if (!rqo_search || !rqo_search.sqo) {
			console.error('Error: Unable to build rqo_search from caller', self.caller);
			self.status = 'initialized'
			return false
		}
		self.rqo_search = rqo_search

		// set the section_tipo to be searched
		self.ar_search_section_tipo = self.rqo_search.sqo.section_tipo

		// columns_map
		// use the rqo_search as request_config, and the columns of rqo_search as columns_maps
		self.columns_map = get_columns_map({
			context				: self.context,
			ddo_map_sequence	: ['choose', 'search', 'show'] // array ddo_map_source
		}) || []

		// column component_info
		const has_ddinfo = self.columns_map.find(el => el.id === 'ddinfo')
		if (has_ddinfo) {
			has_ddinfo.callback = render_column_component_info
		}

		// limit. Get from localStorage if exists
		const service_autocomplete_limit = localStorage.getItem('service_autocomplete_limit')
		if (service_autocomplete_limit) {
			const limit = parseInt(service_autocomplete_limit)
			if (limit > 0) {
				self.limit = limit
			}
		}

		// status update
		self.status = 'built'

		return true
	})()

	return self._build_waiter
}//end build



/**
* DESTROY
* Tears down the service instance, removing DOM-level event listeners before
* delegating to the common base destructor.
*
* Removes the document-level 'keydown' listener that was registered to support
* keyboard navigation inside the datalist. Without this cleanup the handler
* would keep firing after the service is closed, leaking both memory and
* unintended keyboard side-effects.
*
* @param {boolean} [delete_self=true] - When true, delete self instance events,
*   paginator, services, inspector, filter and instance
* @param {boolean} [delete_dependencies=false] - When true, call destroy on all
*   associated child instances (ar_instances)
* @param {boolean} [remove_dom=false] - When true, remove the instance DOM node
* @returns {Promise<Object>} Result object from common.prototype.destroy:
*   { delete_dependencies: boolean, delete_self: boolean }
*/
service_autocomplete.prototype.destroy = async function(delete_self=true, delete_dependencies=false, remove_dom=false) {

	const self = this

	// remove document keydown listener if stored
	if (self._fn_keydown) {
		document.removeEventListener('keydown', self._fn_keydown, false)
		self._fn_keydown = null
	}

	return self._parent_destroy(delete_self, delete_dependencies, remove_dom)
}//end destroy



/**
* SERVICE_AUTOCOMPLETE_KEYS
* Handles keyboard navigation (ArrowDown, ArrowUp, Enter) within the autocomplete datalist.
* This method is called from the keydown event listener when the component is active.
*
* Supports both modern key-name strings ('ArrowDown') and legacy numeric keyCodes (40)
* for broad browser compatibility.
*
* ArrowDown/ArrowUp move the '.selected' CSS class between sibling list items.
* Enter clicks the currently selected item, triggering its selection handler.
* All three keys call e.preventDefault() to prevent default browser behaviour
* (e.g. scrolling the page, submitting a form).
*
* @param {KeyboardEvent} e - The keyboard event object
* @returns {boolean} true when the event was handled; false when there is no datalist
*/
service_autocomplete.prototype.service_autocomplete_keys = function(e) {

	const self = this
	if (!self.datalist) {
		return false
	}

	// Stop event propagation to avoid conflicts with other UI elements
	e.stopPropagation()

	const key = e.key || e.which

	// down arrow
	if (key === 'ArrowDown' || key === 40) {
		e.preventDefault()

		const selected_node = self.datalist.querySelector('.selected')
		if (selected_node) {
			selected_node.classList.remove('selected')
			if (selected_node.nextElementSibling) {
				selected_node.nextElementSibling.classList.add('selected')
			}
		} else {
			// select the first one if nothing is selected
			const first_child = self.datalist.firstElementChild
			if (first_child) {
				first_child.classList.add('selected')
			}
		}
	}
	// up arrow
	else if (key === 'ArrowUp' || key === 38) {
		e.preventDefault()

		const selected_node = self.datalist.querySelector('.selected')
		if (selected_node) {
			selected_node.classList.remove('selected')
			if (selected_node.previousElementSibling) {
				selected_node.previousElementSibling.classList.add('selected')
			}
		}
	}
	// enter
	else if (key === 'Enter' || key === 13) {
		const selected_node = self.datalist.querySelector('.selected')
		if (selected_node) {
			e.preventDefault()
			selected_node.click()
		}
	}

	return true
}//end service_autocomplete_keys



/**
* RENDER
* Delegates the DOM generation to the view render module (view_default_autocomplete)
* based on the current service.view value.
*
* The view variable is captured locally to allow future per-view dispatch;
* all rendering logic currently lives in view_default_autocomplete.render.
*
* @param {Object} [options={}] - Render options forwarded to view_default_autocomplete
* @param {string} [options.render_level='full'] - Level of depth to render;
*   'full' builds wrapper + content, 'content' rebuilds inner content only
* @returns {Promise<HTMLElement>} The generated wrapper node (or content node on 'content' level)
*/
service_autocomplete.prototype.render = async function(options={}) {

	const self = this

	// view
		const view	= self.view

	// wrapper
		return view_default_autocomplete.render(self, options)
}//end render



/**
* AUTOCOMPLETE_SEARCH
* Orchestrates the autocomplete search process by calling the appropriate
* engine method (dedalo_engine, zenon_engine, …) defined by `self.search_engine`.
*
* The engine name is resolved dynamically: self.search_engine + '_engine' must
* be a function on this prototype. If the requested engine method does not exist
* a console error is logged and an error result is returned without throwing.
*
* Guard: if no searchable section tipos are configured (ar_search_section_tipo is
* empty) the user is alerted via get_label.select_search_section and search is
* aborted. This prevents sending a malformed SQO to the API.
*
* (!) The alert() call here is intentional UX for misconfigured deployments where
*     the operator has not yet selected a search section from the UI.
*
* @returns {Promise<Object>} A promise resolving to the API response object:
*   { result: { data: Array } } on success, { result: false } on configuration error
*/
service_autocomplete.prototype.autocomplete_search = async function() {

	const self = this

	// debug
		if(SHOW_DEBUG===true) {
			// console.log('[service_autocomplete.autocomplete_search] search_engine:', self.search_engine)
			// console.log('self.request_config_object', self.request_config_object);
		}

	// engine name
		const engine = self.search_engine + '_engine'

	// check valid function name (defined in component properties search_engine)
		if (typeof self[engine]!=='function') {
			console.error('ERROR. Received search_engine function not exists. Review your component properties source->request_config->search_engine :', self.search_engine);
			return {
				result: false
			}
		}

	// check valid filters_selector
		if ((self.ar_search_section_tipo?.length || 0)<1) {
			const label = get_label.select_search_section || 'Select a search section'
			alert(label);
			return {
				result: false
			}
		}

	// exec search self.search_engine = dedalo_engine || zenon_engine, the method that will called
		const js_promise = self[engine]()


	return js_promise
}//end autocomplete_search



/**
* REBUILD_SEARCH_QUERY_OBJECT
* Re-combines filter fields and section filters into a single search_query_object (SQO).
*
* Takes the base RQO built during build() and reconstructs its `sqo.filter` from
* three sources that are merged under a top-level $and:
*   1. filter_free  — per-field query terms entered by the user.  Each item's `q`
*      value is checked; empty items are skipped.  The operator ($and/$or) is
*      remapped to self.operator so the user can override the default.
*      If after filtering all items are empty, null is returned to signal "nothing
*      to search" (caller should skip the API call).
*   2. fixed_filter — static clauses injected from the ontology config; always
*      applied regardless of user input.
*   3. filter_by_list — optional list-restriction clauses (e.g. restricts search to
*      records already related to a given locator).  Wrapped in $or.
*
* Side-effects:
*   - Deletes rqo_search.sqo_options from the cloned RQO (server does not need it).
*   - Sets sqo.allow_sub_select_by_id = true to enable deep field matching.
*   - Sets sqo.limit from self.limit.
*   - Sets sqo.skip_projects_filter = true because autocomplete is read-only and
*     must not restrict the user to their project scope.
*
* (!) `rqo_search` is mutated in place. The caller (dedalo_engine) always passes
*     a fresh clone(self.rqo_search) so the canonical baseline is never corrupted.
*
* @param {Object} options - Configuration options
* @param {Object} options.rqo_search - The base Request Query Object (will be mutated)
* @param {Array} [options.search_sections=[]] - Section tipo IDs to search within;
*   returns null immediately if empty (no section selected)
* @param {Array|null} [options.filter_by_list=null] - Optional list of filter clauses
*   to restrict the result set to a pre-selected set of records
* @returns {Promise<Object|null>} The updated RQO ready to send to data_manager.request,
*   or null when filter_free resolves to empty (nothing to search)
*/
service_autocomplete.prototype.rebuild_search_query_object = async function(options) {

	const self = this

	// options
		const rqo_search		= options.rqo_search
		const search_sections	= options.search_sections || []
		const filter_by_list	= options.filter_by_list || null

	// no section selected case
		if(search_sections.length===0){
			return null
		}

		const sqo			= rqo_search.sqo
		const sqo_options	= rqo_search.sqo_options
		const fixed_filter	= sqo_options.fixed_filter //self.request_config_object.find((current_item)=> current_item.typo==='fixed_filter')
		const filter_free	= sqo_options.filter_free	//self.request_config_object.find((current_item)=> current_item.typo==='filter_free')

	// delete the sqo_options to the final rqo_options
		delete rqo_search.sqo_options

	// sqo filter
		sqo.filter = {
			$and : []
		}

		// rebuild the filter with the user inputs
			const filter_free_parse	= {}

			// Iterate current filter
			for (let operator in filter_free) {

				// set the operator with the user selection or the default operator defined in the config_sqo (it comes in the config_rqo)
				const new_operator				= self.operator || operator
				filter_free_parse[new_operator]	= []

				// get the array of the filters objects, they have the default operator
				const current_filter		= filter_free[operator]
				const current_filter_length	= current_filter.length
				for (let i = 0; i < current_filter_length; i++) {

					const filter_item = current_filter[i]

					const q = filter_item.q

					if(!q || q==='') {
						continue
					}

					filter_item.q = q
					filter_item.q_split = true

					// create the filter with the operator selected by the user
					filter_free_parse[new_operator].push(filter_item)
				}

				const filter_empty = filter_free_parse[new_operator].length === 0
				if(filter_empty) {
					return null
				}
			}

			sqo.filter.$and.push(filter_free_parse)

		// fixed_filter
			if (fixed_filter) {
				for (let i = 0; i < fixed_filter.length; i++) {
					sqo.filter.$and.push(fixed_filter[i])
				}
			}

			if(filter_by_list && filter_by_list.length > 0) {
				sqo.filter.$and.push({
					$or:[...filter_by_list]
					// $and:[...filter_by_list] // filter_by_list_inverse case
				})
			}

	// allow_sub_select_by_id set to false to allow select deep fields
		sqo.allow_sub_select_by_id = true

	// limit
		sqo.limit = self.limit

	// filter. Note that no project filter should be applied here. The user can
	// select any target record as read. Only editing has project restriction
		sqo.skip_projects_filter = true


	return rqo_search
}//end rebuild_search_query_object



/**
* DEDALO_ENGINE
* Executes a search against the Dédalo internal API using a fully constructed RQO.
*
* Flow:
*   1. Clones self.rqo_search to avoid mutating the canonical baseline.
*   2. Applies the current ar_search_section_tipo to sqo.section_tipo.
*   3. Evaluates filter_by_list optimisation: when the user has selected every
*      entry in the available datalist, the list filter is redundant and is dropped
*      (filter_by_list_fast = []) to produce a simpler, faster query.
*   4. Calls rebuild_search_query_object to compose the final SQO.
*   5. If rebuild_search_query_object returns null (empty filter_free), returns an
*      empty-data result immediately without hitting the network.
*   6. Sets source.mode = 'list' to enable language fallback for list views.
*   7. Sets source.config.read_only = true as a forward-compatibility hint for a
*      planned server-side autocomplete dispatcher. Note: the server currently does
*      NOT grant elevated read access based on this flag; users without direct read
*      permission on the target section will still be denied.
*   8. Issues the request through data_manager with use_worker = true (off main thread).
*
* An experimental filter_by_list_inverse block (commented out) explored inverting
* the list filter to exclude already-linked records. Left in place for future reference.
*
* @returns {Promise<Object>} A promise resolving to the API response from data_manager.request:
*   { result: { context: Array, data: Array }, msg: string }
*   or { result: { data: [] }, msg: 'Empty result' } when filter_free is empty
*/
service_autocomplete.prototype.dedalo_engine = async function() {

	const self = this

	// search_query_object base stored in wrapper dataset
		const rqo_search = clone(self.rqo_search)

		// const rqo_search		= clone(original_rqo_search)
		// self.rqo_search		= rqo_search
		// self.sqo				= rqo_search.sqo

	// search_sections. Mandatory. Always are defined, in a custom ul/li list or as default using wrapper dataset 'search_sections'
		const search_sections = self.ar_search_section_tipo

		rqo_search.sqo.section_tipo	= search_sections

	// filter_by_list, modify by user
		const filter_by_list = self.ar_filter_by_list.map(item => item.value)
		// filter_by_list optimized version.
		// A full selection of the list is equivalent to none. Remove useless list from search in these cases
		const datalist = self.rqo_search.sqo_options.filter_by_list && self.rqo_search.sqo_options.filter_by_list[0]
			? self.rqo_search.sqo_options.filter_by_list[0].datalist
			: []
		const filter_by_list_fast = filter_by_list.length === datalist.length
			? []
			: filter_by_list

		// filter_by_list_inverse (experimental)
			// const context = self.rqo_search.sqo_options.filter_by_list && self.rqo_search.sqo_options.filter_by_list[0]
			// 	? self.rqo_search.sqo_options.filter_by_list[0].context
			// 	: null
			// const component_tipo = context.tipo

			// const filter_by_list_inverse	= []
			// const datalist_length			= datalist.length
			// for (let i = 0; i < datalist_length; i++) {

			// 	const item	= datalist[i]

			// 	const q = '"' + component_tipo +'_'+ item.value.section_tipo +'_'+ item.value.section_id + '"'

			// 	const found = filter_by_list.find(el => {
			// 		return el.q ===  q
			// 	})
			// 	if (!found) {
			// 		const path = [{
			// 			section_tipo	: context.section_tipo,
			// 			component_tipo	: component_tipo
			// 		}]
			// 		filter_by_list_inverse.push({
			// 			q				: q,
			// 			q_operator		: '!*',
			// 			path			: path,
			// 			format			: 'function',
			// 			use_function	: 'relations_flat_fct_st_si'
			// 		})
			// 	}
			// }

	// rqo
		const rqo = await self.rebuild_search_query_object({
			rqo_search		: rqo_search,
			search_sections	: search_sections,
			filter_by_list	: filter_by_list_fast
		})

	// empty filter_free values case. Nothing to search
		if(rqo===null){
			return {
				result : {
					data : []
				},
				msg	: 'Empty result'
			}
		}

	// const rqo = await options.rqo
		rqo.prevent_lock = true

	// source
		const source = rqo.source
		// make sure source is in list mode to allow lang fallback
		source.mode = 'list'
		// config. set config options like read_only to allow custom server behaviors
		// NOTE: server no longer trusts source.config.read_only as a permission shortcut
		// (was a privilege bypass). Users without direct read on the autocomplete target
		// section will now be denied. The flag is preserved here for forward-compat with
		// a future server-side autocomplete dispatcher that sets security::$read_only_scope.
		source.config = {
			read_only : true
		}

	// API read request
		const load_section_data_promise	= data_manager.request({
			body		: rqo,
			use_worker	: true
		})

	// render section on load data
		const api_response = load_section_data_promise
		if(SHOW_DEBUG===true) {
			// api_response.then(function(response){
			// 	console.log('[service_autocomplete.dedalo_engine] api_response:', api_response);
			// })
		}

	return api_response
}//end dedalo_engine



/**
* SPLIT_Q
* Splits a search string on the pipe (|) character to support multi-field inputs.
*
* Used by callers that want to distribute sub-terms across separate search fields
* (e.g. "Picasso | 1937" to search name in one field and date in another).
* When no pipe is present the whole string is returned as a single-element array
* and divisor is false.
*
* The regex `/[^|]+/g` captures each pipe-delimited segment.  The zero-width-match
* guard (`regex.lastIndex++`) is standard boilerplate to prevent infinite loops
* when a zero-length match occurs.
*
* @param {string} q - The raw search string typed by the user
* @returns {Object} Result object:
*   { ar_q: Array<string>, divisor: string|boolean }
*   ar_q    — array of trimmed sub-terms
*   divisor — '|' if the input contained a pipe, false otherwise
*/
service_autocomplete.prototype.split_q = function(q) {

	const ar_q = []

	const regex = /[^|]+/g // /"[^"]+"|'[^']+'|[^|\s]+|[^\s|]+/ug;
	const str 	= q
	let m;

	while ((m = regex.exec(str)) !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		// The result can be accessed through the `m`-variable.
		ar_q.push(m[0].trim())
	}

	const divisor = (q.indexOf('|')!==-1) ? '|' : false

	const result = {
		ar_q 	: ar_q,
		divisor : divisor
	}

	return result
}//end split_q



/**
* ZENON_ENGINE
* Executes a search against the external Zenon bibliographic API (DAI).
*
* Zenon uses a different REST API (VuFind-based) that returns bibliographic records
* with fields like 'authors', 'title', 'urls', 'publicationDates'.  This engine
* translates Dédalo's internal request configuration into a Zenon URL query, fetches
* the results via XMLHttpRequest, then normalises the response into Dédalo's standard
* API response shape { result: { context, data } }.
*
* Flow:
*   1. Clones self.rqo_search for read access to the ddo_map (field definitions).
*   2. Extracts the `q` value from filter_free; returns empty-data if filter_free
*      is absent or all q values are empty.
*   3. Builds a Zenon query URL from api_config.api_url_search (or the hardcoded
*      DAI default) plus parameters (lookfor, type, sort, limit, lng, field[]).
*   4. Issues a POST request via XMLHttpRequest wrapped in a Promise.
*   5. On success, passes the raw JSON response through format_data(), which maps
*      Zenon record fields to component_data entries in Dédalo's data-layer format.
*
* format_data() internal structure:
*   - Iterates records × fields from the ddo_map.
*   - The 'authors' field gets special handling: primary/secondary/corporate author
*     groups are each joined by ' - ' and then concatenated.
*   - Array fields are joined with ', '; string fields are used directly.
*   - Produces a `section` entry (locators) plus one `record_data` entry per
*     record×field combination, mirroring the server-side component data shape.
*
* (!) When q is empty, the placeholder string 'ñññññññ---!!!!!' is used to prevent
*     Zenon from returning its first 10 records as a default result set.
*
* (!) This engine ignores the Dédalo project filter (skip_projects_filter is
*     not applicable to external APIs). Records returned are not restricted to
*     any user-specific scope.
*
* @param {Object|null} options - Optional configuration overrides (currently unused;
*   all config is read from self.request_config_object and self.rqo_search)
* @returns {Promise<Object>} A promise resolving to the normalised API response:
*   { result: { context: Array, data: Array }, msg: string }
*   or { result: { data: [] }, msg: 'No filter_free defined' } on config error
*/
service_autocomplete.prototype.zenon_engine = async function(options) {

	const self = this

	// dd_request
		const rqo_search = clone(self.rqo_search)

	// rqo
		// const generate_rqo = async function(){
		// 	// request_config_object. get the request_config_object from context
		// 	// rqo build
		// 	// const action	= (self.mode==='search') ? 'resolve_data' : 'get_data'
		// 	const add_show	= true
		// 	const zenon_rqo	= await self.caller.build_rqo_show(dd_request, 'get_data', add_show)
		// 	self.rqo_search	= self.caller.build_rqo_search(zenon_rqo, 'search')
		// }
		// generate_rqo()

	// debug
		if(SHOW_DEBUG===true) {
			// console.log('[zenon_engine] rqo:',rqo);
			console.log('[zenon_engine] dd_request:', rqo_search);
			// console.log('self.caller-----------------:',self.caller);
		}

	// const request_ddo			= dd_request.find(item => item.typo === 'request_ddo').value
	// const ar_selected_fields		= self.caller.datum.context.filter(el => el.model === 'component_external')
	// const ar_fields				= ar_selected_fields.map(field => field.properties.fields_map[0].remote)

	// fields of Zenon 'title' for zenon4
		const fields		= rqo_search.show.ddo_map
		const fields_length	= fields.length

	// section_tipo of Zenon zenon1
		const section_tipo	= fields[0].section_tipo

	// format data function
		const format_data = function(data) {
			if(SHOW_DEBUG===true) {
				console.log('[zenon_engine] format_data data 1:',data);
				//console.log('+++ dd_request 1:',dd_request);
				//console.log('+++ source 1:',source);
			}
			const section_data		= []
			const components_data	= []
			const records			= data.records || []
			const records_length	= records.length
			const separator = ' - '
			for (let i = 0; i < records_length; i++) {

				const record = records[i]

				for (let j = 0; j < fields_length; j++) {

					const field = fields[j].fields_map[0].remote
					const ar_value 	= []
					const authors_ar_value	= []

					switch(field) {

						case 'authors':
							if (!record[field]) {
								break;
							}
							if (record[field].primary && Object.keys(record[field].primary).length > 0) {
								authors_ar_value.push(Object.keys(record[field].primary).join(separator))
							}
							if (record[field].secondary && Object.keys(record[field].secondary).length > 0) {
								authors_ar_value.push(Object.keys(record[field].secondary).join(separator))
							}
							if (record[field].corporate && Object.keys(record[field].corporate).length > 0) {
								authors_ar_value.push(Object.keys(record[field].corporate).join(separator))
							}
							ar_value.push(authors_ar_value.join(separator))
							break;

						default:
							if (record[field] == null) {
								break;
							}
							if (Array.isArray(record[field])) {
								if (record[field].length>0) {
									ar_value.push(record[field].join(', '))
								}
							}else if (typeof record[field]==='string') {
								if (record[field].length>0) {
									ar_value.push(record[field])
								}
							}
							break;
					}

					// value
						// const fields_separator = self.caller.fields_separator || ' | '
						const value = ar_value

					// record_data
						const record_data = {
							section_tipo	: section_tipo,
							section_id		: record['id'],
							type			: 'dd687',
							tipo			: fields[j].tipo,
							mode			: 'list',
							entries			: value
						}

					// insert formatted item
						components_data.push(record_data)
				}//end iterate fields

				// locator
					const locator = {
						section_tipo	: section_tipo,
						section_id		: record['id']
					}

				// insert formatted locator
				section_data.push(locator)
			}//end iterate records

			// create the section and your data
			const section = {
				section_tipo	: section_tipo,
				tipo			: self.caller.tipo,
				entries			: section_data,
				typo			: 'sections'
			}

			// mix the section and component_data
			const data_formatted = [section, ...components_data]

			const response = {
				msg		: 'OK. Request done',
				result 	: {
					context	: fields,
					data	: data_formatted
				}
			}

			if(SHOW_DEBUG===true) {
				console.log('+++ format_data response:', response);
			}

			return response
		}//end format_data function

	// trigger vars

		// Iterate current filter
		let q = ''
		const filter_free = rqo_search.sqo_options?.filter_free
		if (!filter_free) {
			return {
				result : {
					data : []
				},
				msg : 'No filter_free defined'
			}
		}
		for (let operator in filter_free) {

			// set the operator with the user selection or the default operator defined in the config_sqo (it comes in the config_rqo)
			const new_operator = self.operator || operator

			// get the array of the filters objects, they have the default operator
			const current_filter = filter_free[operator]
			const current_filter_length = current_filter.length
			for (let i = 0; i < current_filter_length; i++) {

				const filter_item = current_filter[i]

				const q_check =  filter_item.q

				if( !q_check || q_check === "" ){
					continue
				}
				// wildcards
					q = q_check
			}
		}

		// trigger
		const url_trigger	= self.request_config_object.api_config.api_url_search || 'https://zenon.dainst.org/api/v1/search'
		const trigger_vars	= {
			lookfor		: (q==='') ? 'ñññññññ---!!!!!' : q, // when the q is empty, Zenon get the first 10 records of your DDBB, in that case we change the empty with a nonsense q
			type		: "AllFields", // search in all fields
			sort		: "relevance",
			limit		: 20,
			prettyPrint	: false,
			lng			: "de"
		};

		const pairs = []
		for (let key in trigger_vars) {
			pairs.push( key+'='+trigger_vars[key] )
		}
		let url_arguments =  pairs.join("&")
		// const fields   = ["id","authors","title","urls","publicationDates"]
		for (let i = 0; i < fields_length; i++) {
			const field_map_remote = fields[i].fields_map[0].remote
			url_arguments += "&field[]=" + field_map_remote
		}


	// XMLHttpRequest promise
		return new Promise(function(resolve, reject) {

			const request = new XMLHttpRequest();

				// ready state change event
					// request.onreadystatechange = function() {
					// 	if (request.readyState == 4 && request.status == 200) {
					// 		//console.dir(request.response)
					// 		//console.dir(request.responseText);
					// 	}
					// }

				// open xmlhttprequest
					//request.open("POST", "https://zenon.dainst.org/api/v1/search?type=AllFields&sort=relevance&page=1&limit=20&prettyPrint=false&lng=de&lookfor=david", true);
					request.responseType = 'json';
					request.open('POST', url_trigger + '?' + url_arguments, true);

				// onload event
					request.onload = function() {
						if (request.status === 200) {

							// data format
								const data = format_data(request.response)

							// If successful, resolve the promise by passing back the request response
								resolve(data);

						}else{
							// If it fails, reject the promise with a error message
							reject(Error('Reject error don\'t load successfully; error code: ' + request.statusText));
						}
					};

				// request error
					request.onerror = function() {
						// Also deal with the case when the entire request fails to begin with
						// This is probably a network error, so reject the promise with an appropriate message
						reject(Error('There was a network error. data_send: '+url_trigger+"?"+ url_arguments + "statusText:" + request.statusText));
					};

			// send the request
				request.send();

		})//end Promise
}//end zenon_engine



/**
* GET_TOTAL
* Returns the current result limit as a surrogate for the total record count.
*
* Exists solely for compatibility with paginator components that expect every
* section-like service to expose a get_total() method. The returned value is
* self.limit (default 30, overridable via localStorage 'service_autocomplete_limit'),
* not the actual count of search results from the last query.
*
* (!) This is a stub — the autocomplete does not implement true pagination.
*     The returned number is the maximum page size, not the real result count.
*
* @returns {number} The configured result limit for this service instance
*/
service_autocomplete.prototype.get_total = function() {

	const self = this

	const total = self.limit

	return total
}//end get_total



// @license-end
