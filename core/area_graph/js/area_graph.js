// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, ts_object */
/*eslint no-undef: "error"*/


// imports
	import {
		common,
		build_autoload
	} from '../../common/js/common.js'
	import {clone, url_vars_to_object} from '../../common/js/utils/index.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {area_common} from '../../area_common/js/area_common.js'
	import {search} from '../../search/js/search.js'
	import {ui} from '../../common/js/ui.js'
	import {toggle_search_panel} from '../../search/js/render_search.js'
	import {render_area_graph} from './render_area_graph.js'
	import {ts_object} from '../../ts_object/js/ts_object.js'



/**
* area_graph
*/
export const area_graph = function() {

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

	// display mode: 'default' | 'relation'
	this.thesaurus_mode
}//end area_graph



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	area_graph.prototype.refresh		= common.prototype.refresh
	area_graph.prototype.destroy		= common.prototype.destroy
	area_graph.prototype.build_rqo_show	= common.prototype.build_rqo_show
	area_graph.prototype.edit			= render_area_graph.prototype.list
	area_graph.prototype.list			= render_area_graph.prototype.list



/**
* INIT
* @pram object options
* @return bool
*/
area_graph.prototype.init = async function(options) {

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

	// linker
		const url_vars = url_vars_to_object(window.location.search)
		// linker. Get component caller id from url (needed to link terms for DS callers)
		if (url_vars.initiator) {
			const caller_id = JSON.parse(url_vars.initiator)
			self.linker = {
				id		: caller_id,
				caller	: null // passed as null for DS call identification. Indexation callers have value here
			}
		}


	return common_init
}//end init



/**
* BUILD
* @param bool autoload = true
* @return bool
*/
area_graph.prototype.build = async function(autoload=true) {
	const t0 = performance.now()

	const self = this

	// call the generic common build
		// const common_build = await area_common.prototype.build.call(this, options);

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
					console.error("Error!!!!, area_graph without context:", api_response);
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
				// console.log("-----------------------self.dd_request.show", self.dd_request.show);

			// rebuild the request_config_object and rqo in the instance
				// // request_config_object
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
				console.log("AREA self.rqo after load:", clone(self.rqo));
		}//end if (autoload===true)

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

	// filter
		if (!self.filter) {
			self.filter = new search()
			self.filter.init({
				caller	: self,
				mode	: self.mode
			})
			// self.filter.build()
		}

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("+ Time to build", self.model, " ms:", performance.now()-t0);
			//load_section_data_debug(self.section_tipo, self.request_config, load_section_data_promise)
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
area_graph.prototype.render = async function(options={}) {

	const self = this

	// call generic common render
		const result_node = await common.prototype.render.call(this, options)

	// event publish
		event_manager.publish('render_instance', self)


	return result_node
}//end render



/**
* GET_SECTIONS_SELECTOR_DATA
* @return array of objects sections_selector_data
*/
area_graph.prototype.get_sections_selector_data = function() {

	const self = this

	const sections_selector_data	= self.data.find(item => item.tipo===self.tipo)
	const sections_selector_value	= sections_selector_data
		? sections_selector_data.value
		: null

	return sections_selector_value
}//end get_sections_selector_data



/**
* NAVIGATE
* @param object options
* @return bool
*/
area_graph.prototype.navigate = async function(options) {

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
}//end get_sections_selector_data



// @license-end
