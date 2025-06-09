// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, ts_object */
/*eslint no-undef: "error"*/


// imports
	import {
		common,
		set_context_vars,
		build_autoload
	} from '../../common/js/common.js'
	import {
		clone,
		url_vars_to_object,
		JSON_parse_safely,
		get_tld_from_tipo,
		get_section_id_from_tipo
	} from '../../common/js/utils/index.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {render_node_info} from '../../common/js/utils/notifications.js'
	import {area_common} from '../../area_common/js/area_common.js'
	import {ts_object} from '../../ts_object/js/ts_object.js'
	import {search} from '../../search/js/search.js'
	import {toggle_search_panel} from '../../search/js/render_search.js'
	import {render_area_thesaurus} from './render_area_thesaurus.js'




/**
* AREA_THESAURUS
*/
export const area_thesaurus = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.section_tipo
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.widgets

	this.node
	this.status

	this.filter = null

	this.request_config_object
	this.rqo

	this.build_options = {
		terms_are_model : false //false = the terms are descriptors terms // true = the terms are models (context model of the terms)
	}

	// display mode: string 'default|relation'
	this.thesaurus_mode

	// thesaurus_view_mode: string 'default|model'. Used to allow manage models
	this.thesaurus_view_mode

	// model_value_is_hide : bool default false. Used to store the Ontology model_value hidden status
	// An event to keydown Ctr + m fires the changes in this property and is read by ts_object when render
	// the ts_line (list_thesaurus_element model_value div node)
	self.model_value_is_hide = false

	// search_tipos. Array of tipos to search in the request from URL
	// Usually is added to the URL by Ontology node open in tree button
	self.search_tipos
}//end area_thesaurus



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	area_thesaurus.prototype.refresh		= common.prototype.refresh
	area_thesaurus.prototype.destroy		= common.prototype.destroy
	area_thesaurus.prototype.build_rqo_show	= common.prototype.build_rqo_show
	area_thesaurus.prototype.edit			= render_area_thesaurus.prototype.list
	area_thesaurus.prototype.list			= render_area_thesaurus.prototype.list



/**
* INIT
* @param object options
* @return bool
*/
area_thesaurus.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await area_common.prototype.init.call(this, options);

	// events subscription

		// toggle_search_panel. Triggered by button 'search' placed into section inspector buttons
			const toggle_search_panel_handler = async () => {

				if (self.search_container.children.length===0) {
					// await add_to_container(self.search_container, self.filter)
					await ui.load_item_with_spinner({
						container	: self.search_container,
						label		: 'filter',
						callback	: async () => {
							await self.filter.build()
							return self.filter.render()
						}
					})
				}
				toggle_search_panel(self.filter)
			}
			self.events_tokens.push(
				event_manager.subscribe('toggle_search_panel_'+self.id, toggle_search_panel_handler)
			)

		// render event
			const render_handler = () => {
				// open_search_panel. local DDBB table status
				const status_id			= 'open_search_panel'
				const collapsed_table	= 'status'
				data_manager.get_local_db_data(status_id, collapsed_table, true)
				.then(async function(ui_status){
					// (!) Note that ui_status only exists when element is open
					const is_open = typeof ui_status==='undefined' || ui_status.value===false
						? false
						: true
					if (is_open===true && self.search_container.children.length===0) {
						// add_to_container(self.search_container, self.filter)
						await ui.load_item_with_spinner({
							container	: self.search_container,
							label		: 'filter',
							callback	: async () => {
								await self.filter.build()
								return self.filter.render()
							}
						})
						toggle_search_panel(self.filter)
					}
				})
			}
			self.events_tokens.push(
				event_manager.subscribe('render_'+self.id, render_handler)
			)

		// notifications. Render inspector bubbles into the activity container.
		// Mainly used to inform users that a network error has occurred.
		// @see data_manager render_msg_to_inspector for other uses.
			const notifications_handler = async (options) => {

				// container
					const container	= self.bubbles_notification_container
					if (!container) {
						console.error('bubbles_notification_container is undefined!');
						return
					}

				// render notification bubble
					const node_info = render_node_info(options)

				// prepend node (at top of the list)
					container.prepend(node_info)
			}
			self.events_tokens.push(
				event_manager.subscribe('notification', notifications_handler)
			)

		// key commands
			dd_request_idle_callback(
				() => {
					self.model_value_is_hide = localStorage.getItem('model_value_is_hide') || false
					const keydown_handler = (e) => {
						// control + m keys
						if (e.key==='m' && e.ctrlKey===true) {
							const model_value_list = document.querySelectorAll('.model_value')
							if (self.model_value_is_hide) {
								// already hidden case. Change to display
								[...model_value_list].map((el)=>{
									el.classList.remove('hide')
								})
								localStorage.removeItem("model_value_is_hide");
								self.model_value_is_hide = false
							}else{
								// display case. Change to hide
								[...model_value_list].map((el)=>{
									el.classList.add('hide')
								})
								// save status for persistence
								localStorage.setItem('model_value_is_hide', true);
								self.model_value_is_hide = true
							}
						}
					}
					document.addEventListener('keydown', keydown_handler)
				}
			)

	// URL vars
		const url_vars = url_vars_to_object(window.location.search)

	// linker
		// linker. Get component caller id from url (needed to link terms for DS callers)
		if (url_vars.initiator) {
			const caller_id = JSON.parse(url_vars.initiator)
			self.linker = {
				id		: caller_id,
				caller	: null // passed as null for DS call identification. Indexation callers have value here
			}
		}

	// thesaurus_view_mode: model|default|null
		self.thesaurus_view_mode = options.config?.thesaurus_view_mode // init options case
			|| url_vars.thesaurus_view_mode // page reload case
			|| null

	// search tipos
	// Used by area_ontology to search and hilite terms in the tree
	// e.g. https://localhost/dedalo/core/page/?tipo=dd5&mode=list&search_tipos=oh26,rs14
		if (url_vars.search_tipos) {
			const search_tipos = url_vars.search_tipos.split(',')
			if (Array.isArray(search_tipos)) {
				self.search_tipos = search_tipos
			}
		}


	return common_init
}//end init



/**
* PARSE_SEARCH_TIPOS_FILTER
* Ontology function to create a SQO filter with given search_tipos
* @param array search_tipos
* 	e.g. ['rsc22',rsc89]
* @return object|null filter
*/
const parse_search_tipos_filter = function (search_tipos) {

	if (!Array.isArray(search_tipos)) {
		return null
	}

	const filter_items = []

	const search_tipos_length = search_tipos.length
	for (let i = 0; i < search_tipos_length; i++) {
		const tipo = search_tipos[i]

		const tld			= get_tld_from_tipo(tipo)
		const section_id	= get_section_id_from_tipo(tipo);

		if (!tld || !section_id) {
			console.error('Ignored invalid tipo:', tipo);
			continue;
		}

		const filter_item = {
			"$and": [
				{
					"q": [
						tld
					],
					"q_operator": "=",
					"path": [
						{
							"name": "tld",
							"model": "component_input_text",
							"section_tipo": "ontology1",
							"component_tipo": "ontology7"
						}
					],
					"q_split": false,
					"type": "jsonb"
				},
				{
					"q": [
						section_id
					],
					"path": [
						{
							"name": "Id",
							"model": "component_section_id",
							"section_tipo": "ontology1",
							"component_tipo": "ontology2"
						}
					],
					"q_split": false,
					"type": "jsonb"
				}
			]
		}

		filter_items.push(filter_item)
	}

	// zero items case
	if (filter_items.length<1) {
		return null;
	}

	// filter
	const filter = filter_items.length === 1
		? filter_items[0]
		: {
			"$or" : filter_items
		  }


	return filter
}//end parse_search_tipos_filter



/**
* BUILD
* @param bool autoload = true
* @return bool
*/
area_thesaurus.prototype.build = async function(autoload=true) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// ts_object. Set from global var
		self.ts_object = ts_object
		self.ts_object.mode = self.mode

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || []

	// rqo
		const generate_rqo = async function(){
			// request_config_object. get the request_config_object from context
			self.request_config_object	= (self.context && self.context.request_config)
				? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
				: {}

			// rqo build
			const action	= 'get_data'
			const add_show	= false
			self.rqo = self.rqo || await self.build_rqo_show(self.request_config_object, action, add_show)

			// self.search_tipos. Used in area_ontology to auto-search the given tipos from URL
			// @see init search_tipos
			if (self.model==='area_ontology' && self.search_tipos) {
				const filter = parse_search_tipos_filter(self.search_tipos);
				if (filter) {
					self.rqo.sqo.filter = filter
					self.rqo.sqo.section_tipo = self.search_tipos.map(el => get_tld_from_tipo(el) + '0')
					self.rqo.source.search_action = 'search'
				}
			}

			// self.thesaurus_view_mode
			self.rqo.source.build_options = {
				terms_are_model : (self.thesaurus_view_mode==='model')
			}
		}
		await generate_rqo()

	// load from DDBB
		if (autoload===true) {

			// build_autoload
			// Use unified way to load context and data with
			// errors and not login situation managing
				const api_response = await build_autoload(self)

				// server: wrong response
				if (!api_response) {
					return false
				}
				// server: bad build context
				if(!api_response.result.context.length){
					console.error("Error!!!!, area_thesaurus without context:", api_response);
					return false
				}

			// destroy dependencies
				await self.destroy(
					false, // bool delete_self
					true, // bool delete_dependencies
					false // bool remove_dom
				)

			// set the result to the datum
				self.datum = api_response.result

			// set context and data to current instance
				if(!self.context){
					const context =  self.datum.context.find(element => element.tipo===self.tipo)
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context
					}
				}
				self.data		= self.datum.data.filter(element => element.tipo===self.tipo)
				self.widgets	= self.datum.context.filter(element => element.parent===self.tipo && element.typo==='widget')

			// dd_request
				// self.dd_request.show = self.build_rqo('show', self.context.request_config, 'get_data')

			// rebuild the request_config_object and rqo in the instance
				// request_config_object
				// 	self.request_config_object	= self.context.request_config.find(el => el.api_engine==='dedalo')

			// rqo config
				if(self.context.hierarchy_sections){
					self.rqo.source.hierarchy_sections = self.context.hierarchy_sections
				}
				if(self.context.hierarchy_terms){
					self.rqo.source.hierarchy_terms = self.context.hierarchy_terms
				}
				if(self.context.thesaurus_mode){
					self.rqo.source.thesaurus_mode = self.context.thesaurus_mode
				}
				// limit
				self.rqo.sqo.limit = self.rqo.sqo.limit ?? 30

			// rqo regenerate
				await generate_rqo()
				if(SHOW_DEBUG===true) {
					console.log("AREA self.rqo after load:", clone(self.rqo));
				}
		}//end if (autoload===true)

	// update instance properties from context
		set_context_vars(self, self.context)

	// label
		self.label = self.context.label

	// permissions. calculate and set (used by section records later)
		self.permissions = self.context.permissions || 0

	// section tipo
		self.section_tipo = self.context.section_tipo || null

	// initiator . URL defined var or Caller of parent section
	// this is a param that defined who is calling to the section, sometimes it can be a tool or page or ...,
		// const searchParams = new URLSearchParams(window.location.href);
		// const initiator = searchParams.has("initiator")
		// 	? searchParams.get("initiator")
		// 	: self.caller
		// 		? self.caller.id
		// 		: false
		// // fix initiator
		// 	self.initiator = JSON.parse(initiator)

	// search filter
		if (!self.filter) {
			self.filter = new search()
			self.filter.init({
				caller	: self,
				mode	: self.mode
			})
		}

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("+ Time to build", self.model, " ms:", performance.now()-t0);
		}

	// status update
		self.status = 'built'


	return true
}//end build



/**
* RENDER
* @param object options
*	render_level : level of deep that is rendered (full | content)
* @return promise
*	node first DOM node stored in instance 'node' array
*/
area_thesaurus.prototype.render = async function(options={}) {

	const self = this

	// call generic common render
		const result_node = await common.prototype.render.call(this, options)

	// event publish
		event_manager.publish('render_instance', self)


	return result_node
}//end render



/**
* GET_SECTIONS_SELECTOR_DATA
* Used by search 'sections_selector_data' to draw the typologies and sections list
* @return object|null sections_selector_value
*/
area_thesaurus.prototype.get_sections_selector_data = function() {

	const self = this

	const sections_selector_value = self.data.find(item => item.tipo===self.tipo)

	return sections_selector_value
}//end get_sections_selector_data



/**
* NAVIGATE
* @param object options
* @return bool
*/
area_thesaurus.prototype.navigate = async function(options) {

	const self = this

	// options
		const callback				= options.callback
		const navigation_history	= options.navigation_history!==undefined
			? options.navigation_history
			: false

	// loading
		self.node.content_data.classList.add('loading')

	// callback execute
		if (callback) {
			await callback()

			if(SHOW_DEBUG===true) {
				// console.log("-> Executed section navigate received callback:", callback);
			}
		}

	// refresh
		await self.refresh({
			build_autoload	: true,
			render_level	: 'content',
			destroy			: false
		})

	// loading
		self.node.content_data.classList.remove('loading')


	return true
}//end navigate



// @license-end
