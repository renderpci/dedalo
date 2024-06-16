// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, SHOW_DEBUG, SHOW_DEVELOPER */
/* eslint no-undef: "error" */



// imports
	import {
		clone,
		dd_console,
		object_to_url_vars,
		open_window
	} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	// import * as instances from '../../common/js/instances.js'
	import {get_instance} from '../../common/js/instances.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {
		common,
		set_context_vars,
		get_columns_map,
		build_autoload,
		create_source
	} from '../../common/js/common.js'
	import {component_common, init_events_subscription} from '../../component_common/js/component_common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	// import {render_component_portal} from '../../component_portal/js/render_component_portal.js'
	import {render_edit_component_portal} from '../../component_portal/js/render_edit_component_portal.js'
	import {render_list_component_portal} from '../../component_portal/js/render_list_component_portal.js'
	import {render_search_component_portal} from '../../component_portal/js/render_search_component_portal.js'



/**
* COMPONENT_PORTAL
*/
export const component_portal = function() {

	this.id						= null

	// element properties declare
	this.model					= null
	this.tipo					= null
	this.section_tipo			= null
	this.section_id				= null
	this.mode					= null
	this.lang					= null
	this.section_lang			= null
	this.column_id				= null
	this.parent					= null
	this.node					= null
	this.modal					= null
	this.caller					= null
	this.caller_dataframe		= null

	self.standalone				= null

	// context - data
	this.datum					= null
	this.context				= null
	this.data					= null

	// pagination
	this.total					= null
	this.paginator				= null

	// autocomplete service
	this.autocomplete			= null
	this.autocomplete_active	= null

	// rqo
	this.request_config_object	= null
	this.rqo					= null

	this.fixed_columns_map		= null
}//end  component_portal



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// life-cycle
	// component_portal.prototype.init				= component_common.prototype.init
	// component_portal.prototype.build				= component_common.prototype.build
	component_portal.prototype.render				= common.prototype.render
	component_portal.prototype.refresh				= common.prototype.refresh
	component_portal.prototype.destroy				= common.prototype.destroy

	// change data
	component_portal.prototype.save					= component_common.prototype.save
	component_portal.prototype.update_data_value	= component_common.prototype.update_data_value
	component_portal.prototype.update_datum			= component_common.prototype.update_datum
	component_portal.prototype.change_value			= component_common.prototype.change_value
	component_portal.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_portal.prototype.build_rqo_show		= common.prototype.build_rqo_show
	component_portal.prototype.build_rqo_search		= common.prototype.build_rqo_search
	component_portal.prototype.build_rqo_choose		= common.prototype.build_rqo_choose

	// render
	component_portal.prototype.list					= render_list_component_portal.prototype.list
	component_portal.prototype.tm					= render_list_component_portal.prototype.list
	component_portal.prototype.edit					= render_edit_component_portal.prototype.edit
	component_portal.prototype.search				= render_search_component_portal.prototype.search

	component_portal.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
* Fix instance main properties
* @param object options
* @return bool
*/
component_portal.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await component_common.prototype.init.call(self, options);

	// autocomplete. set default values of service autocomplete
		self.autocomplete			= null
		self.autocomplete_active	= false

	// columns
		self.columns_map			= options.columns_map
		self.add_component_info		= false

	// caller_dataframe
		self.caller_dataframe		= options.caller_dataframe

	// request_config
		self.request_config			= options.request_config || null

	// events subscribe
		// initiator_link. Observes user click over list record_
			self.events_tokens.push(
				event_manager.subscribe('initiator_link_' + self.id, fn_initiator_link)
			)
			async function fn_initiator_link(locator) {
				// debug
					if(SHOW_DEBUG===true) {
						console.log('-> event fn_initiator_link locator:', locator);
					}
				// add locator selected
					const result = await self.add_value(locator)
					if (result===false) {
						return
					}
				// modal close
					if (self.modal) {
						self.modal.close()
					}
			}//end fn_initiator_link

		// link_term. Observes thesaurus tree link index button click
			self.events_tokens.push(
				event_manager.subscribe('link_term_' + self.id, fn_link_term)
			)
			function fn_link_term(locator) {

				switch (self.view) {
					case 'indexation': {
						// empty tag_id is allowed too
						// add tag_id. Note that 'self.active_tag' is an object with 3 properties (caller, text_editor and tag)
							const tag_id = self.active_tag && self.active_tag.tag
								? self.active_tag.tag.tag_id || null
								: null
							if (tag_id) {
								// overwrite/set tag_id
								locator.tag_id	= tag_id
							}else{
								if (!confirm(get_label.no_hay_etiqueta_seleccionada ||
									'No tag selected. If you continue, the entire record will be indexed.')) {
									return
								}
							}

						// tag_component_tipo
							const tag_component_tipo = self.context.properties?.config_relation?.tag_component_tipo
							if (tag_component_tipo) {
								locator.tag_component_tipo = tag_component_tipo
							}else{
								console.error('tag_component_tipo is not defined into component properties->config_relation . This is mandatory in v6', self.context.properties);
								return
							}

						// top_locator add
							const top_locator = self.caller.top_locator // property from tool_indexation
							// check active tag is already set
							if (!top_locator) {
								alert("Error. No top_locator exists");
								return
							}
							Object.assign(locator, top_locator)
						break;
					}
					case 'tree':
						// set relation type standard portal (dd151)
						locator.type = DD_TIPOS.DEDALO_RELATION_TYPE_LINK ?? 'dd151'
						break;

					default:
						console.warn('Warning: this view do not have custom manager', self.view);
						break;
				}

				// debug
					if(SHOW_DEBUG===true) {
						console.log("-->> fn_link_term. Set locator to add:", locator);
					}

				// add locator selected
					self.add_value(locator)
					.then(function(result){
						if (result===false) {
							alert("Value already exists! "+ JSON.stringify(locator));
							return
						}
					})
			}//end fn_initiator_link

		// deactivate_component. Observes current component deactivation event
			self.events_tokens.push(
				event_manager.subscribe('deactivate_component', fn_deactivate_component)
			)
			function fn_deactivate_component(component) {
				if (component.id===self.id) {
					if(SHOW_DEBUG===true) {
						console.log('self.autocomplete_active:', self.autocomplete_active);
					}
					if(self.autocomplete_active===true){
						self.autocomplete.destroy(
							true, // bool delete_self
							true, // bool delete_dependencies
							true // bool remove_dom
						)
						self.autocomplete_active	= false
						self.autocomplete			= null
					}
				}
			}

	// render_views
		// Definition of the rendering views that could de used.
		// Tools or another components could add specific views dynamically
		// Sample:
		// {
		// 		view	: 'default',
		// 		mode	: 'edit',
		// 		render	: 'view_default_edit_portal'
		// 		path 	: './view_default_edit_portal.js'
		// }
		self.render_views = [
			{
				view	: 'text',
				mode	: 'edit',
				render	: 'view_text_list_portal'
			},
			{
				view	: 'line',
				mode	: 'edit',
				render	: 'view_line_edit_portal'
			},
			{
				view	: 'tree',
				mode	: 'edit',
				render	: 'view_tree_edit_portal'
			},
			{
				view	: 'mosaic',
				mode	: 'edit',
				render	: 'view_mosaic_edit_portal'
			},
			{
				view	: 'indexation',
				mode	: 'edit',
				render	: 'view_indexation_edit_portal'
			},
			{
				view	: 'content',
				mode	: 'edit',
				render	: 'view_content_edit_portal'
			},
			{
				view	: 'default',
				mode	: 'edit',
				render	: 'view_default_edit_portal',
				path 	: './view_default_edit_portal.js'
			},
			{
				view	: 'line',
				mode	: 'list',
				render	: 'view_line_list_portal'
			},
			{
				view	: 'mini',
				mode	: 'list',
				render	: 'view_mini_portal'
			},
			{
				view	: 'text',
				mode	: 'list',
				render	: 'view_text_list_portal'
			},
			{
				view	: 'default',
				mode	: 'list',
				render	: 'view_default_list_portal'
			}
		]


	return common_init
}//end init



/**
* BUILD
* Load and parse necessary data to create a full ready instance
* @param bool autoload = false
* @return bool
*/
component_portal.prototype.build = async function(autoload=false) {
	// const t0 = performance.now()

	const self = this

	// previous status
		const previous_status = clone(self.status)

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}
		// changed_data. Set as empty array always
		self.data.changed_data = []

	// rqo
		const generate_rqo = async function() {

			if (!self.context) {
				// request_config_object. get the request_config_object from request_config
				self.request_config_object = self.request_config
					? self.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}else{
				// request_config_object. get the request_config_object from context
				self.request_config_object	= self.context && self.context.request_config
					? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}

			// rqo build
			const action	= (self.mode==='search') ? 'resolve_data' : 'get_data'
			const add_show	= false
			self.rqo = self.rqo || await self.build_rqo_show(
				self.request_config_object, // object request_config_object
				action,  // string action like 'get_data' or 'resolve_data'
				add_show // bool add_show
			)
			if(self.mode==='search') {
				self.rqo.source.value = self.data.value || []
			}
		}
		await generate_rqo()

	// debug check
		// if(SHOW_DEBUG===true) {
		// 	// console.log("portal generate_rqo 1 self.request_config_object:", clone(self.request_config_object) );
		// 	// console.log("portal generate_rqo 1 self.rqo:", clone(self.rqo) );
		// 	const ar_used = []
		// 	for(const element of self.datum.data) {

		// 		if (element.matrix_id) { continue; } // skip verification in matrix data

		// 		const index = ar_used.findIndex(item => item.tipo===element.tipo &&
		// 												item.section_tipo===element.section_tipo &&
		// 												item.section_id==element.section_id &&
		// 												item.from_component_tipo===element.from_component_tipo &&
		// 												item.parent_section_id==element.parent_section_id &&
		// 												item.row_section_id==element.row_section_id
		// 												// && (item.matrix_id && item.matrix_id==element.matrix_id)
		// 												// && (item.tag_id && item.tag_id==element.tag_id)
		// 												)
		// 		if (index!==-1) {
		// 			console.error("PORTAL ERROR. self.datum.data contains duplicated elements:", ar_used[index]);
		// 		}else{
		// 			ar_used.push(element)
		// 		}
		// 	}
		// }

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
					console.error("Error!!!!, component without context:", api_response);
					return false
				}

			// destroy dependencies
				await self.destroy(
					false, // bool delete_self
					true, // bool delete_dependencies
					false // bool remove_dom
				)

			// set Context
				// context is only set when it's empty the origin context,
				// if the instance has previous context, it will need to preserve.
				// because the context could be modified by ddo configuration and it can no be changed
				// ddo_map -----> context
				// ex: oh27 define the specific ddo_map for rsc368
				// 		{ mode: list, view: line, children_view: text ... }
				// if you call to API to get the context of the rsc368 the context will be the default config
				// 		{ mode: edit, view: default }
				// but it's necessary to preserve the specific ddo_map configuration in the new context.
				// Context is set and changed in section_record.js to get the ddo_map configuration
				if(!self.context){
					const context = api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context
					}
				}

			// set Data
				const data = api_response.result.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && el.section_id==self.section_id)
				if(!data){
					console.warn("data not found in api_response:",api_response);
				}
				self.data = data || {}

			// Update datum when the component is not standalone, it's dependent of section or others with common datum
				if(!self.standalone){
					await self.update_datum(api_response.result)
				}else{
					self.datum.context	= api_response.result.context
					self.datum.data		= api_response.result.data
				}

			// // context. update instance properties from context (type, label, tools, fields_separator, permissions)
			// 	self.context		= api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)
			// 	self.datum.context	= api_response.result.context

			// force re-assign self.total
				self.total = null

			// rqo regenerate
				await generate_rqo()
				// console.log("portal generate_rqo 2 self.rqo:",self.rqo);

			// update rqo.sqo.limit. Note that it may have been updated from the API response
			// Paginator takes limit from: self.rqo.sqo.limit
				const request_config_item = self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
				if (request_config_item) {
					// Updated self.rqo.sqo.limit. Try sqo and show.sqo_config
					if (request_config_item.sqo &&
						(request_config_item.sqo.limit || request_config_item.sqo.limit==0)) {

						self.rqo.sqo.limit = request_config_item.sqo.limit
					}
					else if (request_config_item.show && request_config_item.show.sqo_config &&
							(request_config_item.show.sqo_config.limit || request_config_item.show.sqo_config.limit==0)) {

						self.rqo.sqo.limit = request_config_item.show.sqo_config.limit
					}
				}
		}//end if (autoload===true)


	// update instance properties from context
		set_context_vars(self, self.context)

	// subscribe to the observer events (important: only once)
		init_events_subscription(self)

	// mode cases
		if (self.mode==='edit' || self.mode==='tm') {
			// pagination vars only in edit mode

			// pagination. update element pagination vars when are used
				if (self.data.pagination && !self.total) {
					self.total			= self.data.pagination.total
					self.rqo.sqo.offset	= self.data.pagination.offset
					self.rqo.sqo.total	= self.data.pagination.total
				}

			// paginator
				if (!self.paginator) {

					// create new one
					self.paginator = new paginator()
					self.paginator.init({
						caller	: self,
						mode	: 'micro'
					})
					await self.paginator.build()

					// paginator_goto_ event
						const fn_paginator_goto = function(offset) {
							// navigate
							self.navigate({
								callback : () => {
									self.rqo.sqo.offset = offset
								}
							})
						}//end fn_paginator_goto
						self.events_tokens.push(
							event_manager.subscribe('paginator_goto_'+self.paginator.id, fn_paginator_goto)
						)//end events push


					// paginator_show_all_
						const fn_paginator_show_all = function() {
							// navigate
							self.navigate({
								callback : async () => {
									// rqo and request_config_object set offset and limit
									self.rqo.sqo.offset	= self.request_config_object.sqo.offset	= 0
									self.rqo.sqo.limit	= self.request_config_object.sqo.limit	= 0 // (limit + 1000)
								}
							})
						}//end fn_paginator_show_all
						self.events_tokens.push(
							event_manager.subscribe('paginator_show_all_'+self.paginator.id, fn_paginator_show_all)
						)//end events push

					// reset_paginator_
						const fn_reset_paginator = function(limit) {
							// navigate
							self.navigate({
								callback : async () => {
									// rqo and request_config_object set offset and limit
									self.rqo.sqo.offset	= self.request_config_object.sqo.offset	= 0
									self.rqo.sqo.limit	= self.request_config_object.sqo.limit	= limit
								}
							})
						}//end fn_reset_paginator
						self.events_tokens.push(
							event_manager.subscribe('reset_paginator_'+self.paginator.id, fn_reset_paginator)
						)//end events push

				}else{
					// refresh existing
					self.paginator.offset = self.rqo.sqo.offset
					self.paginator.total  = self.total
					// self.paginator.refresh()
					// await self.paginator.build()
					// self.paginator.render()
				}

		}else if(self.mode==='search') {

			// active / prepare the autocomplete in search mode

		}// end if(self.mode==="edit")

	// check self.context.request_config
		if (!self.context.request_config) {
			console.error('Error. context.request_config not found. self:', self);
			throw 'Error';
		}

	// target_section
		self.target_section = self.request_config_object && self.request_config_object.sqo
			? self.request_config_object.sqo.section_tipo
			: null

	// reset fixed_columns_map (prevents to apply rebuild_columns_map more than once)
		self.fixed_columns_map = false

	// columns
	// @see common.get_columns_map ddo_map_sequence
	// Note that default ddo_map_sequence is [show], but in search mode is [search,show]
		self.columns_map = get_columns_map({
			context : self.context
		})

	// self.add_component_info. Indicates if exists any ddinfo (value_with_parents) in the ddo_map items list
		// (!) This is used by service_autocomplete to decide whether to add ddinfo or not
		// sample item
		// {
		//	 "tipo": "hierarchy25",
		//	 "parent": "self",
		//	 "section_tipo": "self",
		//	 "value_with_parents": true
		// }
		const show_ddo_map				= self.request_config_object.show?.ddo_map || []
		const ddo_value_with_parents	= show_ddo_map.find(el => el.value_with_parents)
		self.add_component_info			= ddo_value_with_parents
			? ddo_value_with_parents.value_with_parents
			: false

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("/// component_portal build self.datum.data:",self.datum.data);
			// console.log("__Time to build", self.model, " ms:", performance.now()-t0);
			// console.log("component_portal self +++++++++++ :",self);
			//console.log("========= build self.pagination.total:",self.pagination.total);
		}

	// set the server data to preserve the data that is saved in DDBB
		self.db_data = clone(self.data)

	// set fields_separator
		self.context.fields_separator = self.context?.fields_separator
									|| self.request_config_object?.show.fields_separator
									|| ' | '

	// set records_separator
		self.context.records_separator = self.context?.records_separator
									|| self.request_config_object?.show.records_separator
									|| ' | '

	// check if the target section is multiple to remove the add button
		self.show_interface.button_add = (self.target_section?.length > 1)
			? false
			: self.show_interface.button_add ?? true

	// check if the target section is multiple to remove the open_section_list
		self.show_interface.button_list = (self.target_section?.length > 1)
			? false
			: self.show_interface.button_list ?? true

	// self.show_interface is defined in component_comom init()
	// Default source external buttons configuration,
	// if show.interface is defined in properties used the definition, else use this default
		switch (true) {

			case (self.context.properties.source?.mode==='external'):
				self.show_interface.button_add			= false
				self.show_interface.button_link			= false
				self.show_interface.tools				= false
				self.show_interface.button_external		= true
				self.show_interface.button_tree			= false
				self.show_interface.button_list			= self.show_interface.button_list ?? true
				self.show_interface.show_autocomplete	= self.show_interface.show_autocomplete ?? false
				break;

			case (self.caller && self.caller.type==='tool'):
				self.show_interface.button_add		= false
				self.show_interface.button_link		= false
				self.show_interface.tools			= false
				self.show_interface.button_external	= false
				self.show_interface.button_tree		= false
				self.show_interface.button_list		= false
				break;

			default:
				break;
		}


	// status update
		self.status = 'built'


	return true
}//end component_portal.prototype.build



/**
* ADD_VALUE
* Called from service autocomplete when the user selects a datalist option
* Uses component_common function change_value to call API
* @verified 07-09-2023 Paco
* @param object value
* 	(locator)
* @return bool
*/
component_portal.prototype.add_value = async function(value) {

	const self = this

	// current_value. Get the current_value of the component
		const current_value	= self.data.value || []

	// data_limit. Maximum records allowed by this portal
		if (data_limit_reached(self)) {
			// alert and stop the process
			return false
		}

	// exists. Check if value already exists. (!) Note that only current loaded paginated values are available for compare, not the whole portal data
		const exists = current_value.find(item => item.section_tipo===value.section_tipo && item.section_id==value.section_id)
		if (typeof exists!=='undefined') {
			console.log('[add_value] Value already exists (1) !');
			return false
		}

	// adds its own tipo as 'from_component_tipo' to the new locator
		value.from_component_tipo = self.tipo

	// dataframe case
		if(self.model === 'component_dataframe'){
			value.section_id_key	= self.data.section_id_key
			// value.tipo_key			= self.data.tipo_key
		}

	// changed_data
		const key			= self.total || 0
		const changed_data	= [Object.freeze({
			action	: 'insert',
			key		: key,
			value	: value
		})]

	// debug
		if(SHOW_DEBUG===true) {
			console.log("[component_portal.add_value] value:", value, " - changed_data:", changed_data);
		}

	// total_before
		const total_before = clone(self.total)

	// (!) fix pagination limit in data to force server to use it. Important
	// This value is get from API save $data->pagination and set to the component->pagination->limit
	// This is used frequently in component_relation_index like 'rsc860' in Oral History indexation terms
		self.data.pagination = {
			limit : self.paginator
				? self.paginator.limit
				: null
		}

	// api_response : change_value (and save)
		const api_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false // not refresh here (!)
		})

		if (!api_response || !api_response.result) {
			console.error('Invalid API response on add_value:', api_response);
			return false
		}

	// total check (after save)
		const current_data	= api_response.result.data.find(el => el.tipo===self.tipo)
		const total			= current_data
			? current_data.pagination.total
			: 0
		// error on add value case
		if (total===0) {
			console.warn("// add_value api_response.result.data (unexpected total):", api_response.result.data);
			return false
		}
		// value already exists case. Check if value already exist.
		// (!) Note that here, the whole portal data has been compared in server
		if (parseInt(total) <= parseInt(total_before)) {
			// self.update_pagination_values('remove') // remove added pagination value
			console.log("[add_value] Value already exists (2) !");
			return false
		}

	// refresh self component
		await self.refresh({
			build_autoload		: true,
			tmp_api_response	: api_response // pass api_response before build to avoid call API again
		})

	// filter data. check if the caller has tag_id
		if(self.active_tag){
			self.node.classList.add('hide')
			// filter component data by tag_id and re-render content
			self.filter_data_by_tag_id(self.active_tag)
			.then(()=>{
				self.node.classList.remove('hide')
			})
		}

	// mode specifics
		switch(self.mode) {

			case 'search' :
				// publish change. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
				self.node.classList.remove('active')
				break;

			default:

				break;
		}


	return true
}//end add_value



/**
* ADD_NEW_ELEMENT
* Called from button add
* Create an new record in the target section and add the result locator as value to current component
* (Set default project too based on current user privileges and assigned projects)
* @verified 07-09-2023 Paco
* @param string target_section_tipo
* 	Like: rsc197
* @return bool
*/
component_portal.prototype.add_new_element = async function(target_section_tipo) {

	const self = this

	// data_limit. Maximum records allowed by this portal
		if (data_limit_reached(self)) {
			// alert and stop the process
			return false
		}

	// source
		const source = create_source(self, null)

	// data
		const data = clone(self.data)
		data.changed_data = [{
			action	: 'add_new_element',
			key		: null,
			value	: target_section_tipo
		}]

	// rqo
		const rqo = {
			action	: 'save',
			source	: source,
			data	: data
		}

	// data_manager. create new record
		const api_response = await data_manager.request({
			body : rqo
		})
		// add value to current data
		if (api_response.result) {

			// save return the datum of the component
			// to refresh the component, inject this api_response to use as "read" api_response
			// the build process will use it and does not re-call to API.
				await self.refresh({
					destroy				: false,
					build_autoload		: true,
					tmp_api_response	: api_response
				})

		}else{
			console.error('Error on api_response on try to create new row:', api_response);
			return false
		}


	return true
}//end add_new_element



/**
* DATA_LIMIT_REACHED
* @param object self
* 	component  instance
* @return bool
* 	true on reached
*/
const data_limit_reached = function (self) {

	// current_value. Get the current_value of the component
		const current_value	= self.data.value || []

	// data_limit. Maximum records allowed by this portal
	// Check if the component has a data_limit (it could be defined in properties as data_limit with int value)
		const data_limit = self.context.properties.data_limit
		if(data_limit && current_value.length>=data_limit){

			console.log("[data_limit_reached] Data limit is reached!");

			// notify to user about the limit
			const data_limit_label = (
				get_label.exceeded_limit || 'The maximum number of values for this field has been reached. Limit ='
			) + ' ' + data_limit
			window.alert(data_limit_label)

			return true
		}


	return false
}//end data_limit_reached



/**
* UPDATE_PAGINATION_VALUES
* @param string action
* @return bool true
*/
component_portal.prototype.update_pagination_values = function(action) {

	const self = this

	// update self.data.pagination
		switch(action) {
			case 'remove' :
				// update pagination total
				if(self.data.pagination && self.data.pagination.total && self.data.pagination.total>0) {
					// self.data.pagination.total--
					self.total--
				}
				break;
			case 'add' :
				// update self.data.pagination
				if(self.data.pagination && self.data.pagination.total && self.data.pagination.total>=0) {
					// self.data.pagination.total++
					self.total++
				}
				break;
			default:
				// Nothing to add or remove
		}
		// self.total = self.data.pagination.total


	// last_offset
		const last_offset = (()=>{

			const total	= self.total
			const limit	= self.rqo.sqo.limit

			if (total>0 && limit>0) {

				const total_pages = Math.ceil(total / limit)

				return parseInt( limit * (total_pages -1) )
			}

			return 0
		})()

	// self pagination update
		self.rqo.sqo.offset	= last_offset

		if (!self.data.pagination) {
			self.data.pagination = {}
		}
		self.data.pagination.offset	= last_offset
		self.data.pagination.total	= self.total// sync pagination info
	// paginator object update
		self.paginator.offset	= self.rqo.sqo.offset
		self.paginator.total	= self.total

	// paginator content data update (after self update to avoid artifacts (!))
		self.events_tokens.push(
			event_manager.subscribe('render_'+self.id, fn_refresh_paginator)
		)
		function fn_refresh_paginator() {
			// remove the event to prevent multiple equal events
				event_manager.unsubscribe('render_'+self.id)
			// refresh paginator if already exists
				if (self.paginator) {
					self.paginator.refresh()
				}
		}

	// set_local_db_data updated rqo
		// const rqo = self.rqo
		// data_manager.set_local_db_data(
		// 	rqo,
		// 	'rqo'
		// )


	return true
}//end update_pagination_values



/**
* FILTER_DATA_BY_TAG_ID
* Filtered data with the tag clicked by the user
* The portal will show only the locators for the tag selected
* @param object options
* sample
* {
	"tag": {
		"node_name": "img",
		"type": "indexOut",
		"tag_id": "4",
		"state": "d",
		"label": "",
		"data": ""
	}
* }
* @return promise self.render
*/
component_portal.prototype.filter_data_by_tag_id = function(options) {

	const self = this

	// options
		// const caller			= options.caller // not used
		// const text_editor	= options.text_editor // not used
		const tag				= options.tag // object

	// Fix received options from event as 'active_tag'
		self.active_tag = options

	// short vars
		const tag_id = tag?.tag_id

	// get all data from datum because if the user select one tag the portal data is filtered by the tag_id,
	// in the next tag selection by user the data doesn't have all locators and is necessary get the original data
	// the full_data is clone to a new object because need to preserve the datum from these changes.
		const full_data	= self.datum.data.find(el =>
				el.tipo===self.tipo &&
				el.section_tipo===self.section_tipo &&
				el.section_id==self.section_id
		) || {}
		self.data = clone(full_data)

	// the portal will use the filtered data value to render it with the tag_id locators.
		self.data.value = self.data.value
			? self.data.value.filter(el => el.tag_id==tag_id)
			: []

	// reset status to enable re-render
		self.status = 'built'

	// re-render always the content
		return self.render({
			render_level : 'content'
		})
}//end filter_data_by_tag_id



/**
* RESET_FILTER_DATA
* reset filtered data to the original and full server data
* @return promise self.render
*/
component_portal.prototype.reset_filter_data = function() {

	const self = this

	// reset self.active_tag (important)
		self.active_tag = null

	// refresh the data with the full data from datum and render portal.
		self.data = self.datum.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && el.section_id==self.section_id) || {}

	// reset status to able re-render
		self.status = 'built'

	// reset instances status
		// self.ar_instances = null
		// for (let i = 0; i < self.ar_instances.length; i++) {
		// 	self.ar_instances[i].status = 'built'
		// }

	// re-render content
		return self.render({
			render_level : 'content'
		})
}//end reset_filter_data



/**
* GET_SEARCH_VALUE
* @return array new_value
*/
component_portal.prototype.get_search_value = function() {

	const self = this

	const data			= self.data || {}
	const current_value	= data.value || []

	const new_value = [];
	const value_len = current_value.length
	for (let i = 0; i < value_len; i++) {
		new_value.push({
			section_tipo		: current_value[i].section_tipo,
			section_id			: current_value[i].section_id,
			from_component_tipo	: current_value[i].from_component_tipo
		})
	}

	return new_value
}//end get_search_value



/**
* NAVIGATE
* Refresh the portal instance with new sqo params.
* Used to paginate and sort records
* @param object options
* @return bool
*/
component_portal.prototype.navigate = async function(options) {

	const self = this

	// options
		const callback = options.callback

	// callback execute
		if (callback) {
			await callback()
		}

	// container
		const container = self.node.list_body // view table
					   || self.node.content_data // view line

	// loading
		container.classList.add('loading')

	// refresh
		await self.refresh({
			destroy : false // avoid to destroy here to allow component to recover from loosed login scenarios
		})

	// loading
		container.classList.remove('loading')


	return true
}//end navigate



/**
* DELETE_LOCATOR
* @param object locator
* 	Locator complete or partial to match as
* {
*	tag_id	: tag_id,
*	type	: DD_TIPOS.DEDALO_RELATION_TYPE_INDEX_TIPO // dd96
* }
* @param array ar_properties
* 	To compare locators as ['tag_id','type']
* @return promise
* 	resolve object response
*/
component_portal.prototype.delete_locator = function(locator, ar_properties) {

	const self = this

	return data_manager.request({
		body : {
			action	: 'delete_locator',
			dd_api	: 'dd_component_portal_api', // component_portal
			source	: {
				section_tipo	: self.section_tipo, // current component_text_area section_tipo
				section_id		: self.section_id, // component_text_area section_id
				tipo			: self.tipo, // component_text_area tipo
				lang			: self.lang // component_text_area lang
			},
			options : {
				locator			: locator,
				ar_properties	: ar_properties
			}
		}
	})
}//end delete_locator



/**
* SORT_DATA
* Create ad saves new sorted values
* Used by on_drop method
* @see on_drop
* @verified 07-09-2023 Paco
* @param object options
* @return object
*  API request response
*/
component_portal.prototype.sort_data = async function(options) {

	const self = this

	// options
		const value			= options.value
		const source_key	= options.source_key
		const target_key	= options.target_key

	// sort_data
		const changed_data = [Object.freeze({
			action		: 'sort_data',
			source_key	: source_key,
			target_key	: target_key,
			value		: value
		})]

	/* old
		// exec async change_value
			const api_response = await self.change_value({
				changed_data	: changed_data,
				refresh			: true
			})
			*/

	// api_response : change_value (and save)
		const api_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false // not refresh here (!)
		})

	// refresh self component
		await self.refresh({
			destroy				: false,
			build_autoload		: true,
			tmp_api_response	: api_response // pass api_response before build to avoid call API again
		})



	return api_response
}//end sort_data



/**
* GET_TOTAL
* this function is for compatibility with section and paginator
* total is resolved in server and comes in data, so it's not necessary call to server to get it
*
* @return int self.total
*/
component_portal.prototype.get_total = async function() {

	const self = this

	return self.total
}//end get_total



/**
* UNLINK_RECORD
* Remove locator from component
* @verified 07-09-2023 Paco
* @param object options
* {
* 	paginated_key: paginated_key
*	section_id : section_id
* }
* @return bool
*/
component_portal.prototype.unlink_record = async function(options) {

	const self = this

	// options
		const paginated_key	= options.paginated_key
		const row_key		= options.row_key
		const section_id	= options.section_id

	// changed_data
		const changed_data = [Object.freeze({
			action	: 'remove',
			key		: paginated_key,
			value	: null
		})]

	// change_value (implies saves too)
	// remove the remove_dialog it's controlled by the event of the button that call
	// prevent the double confirmation
		const api_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false,
			label			: section_id,
			remove_dialog	: ()=>{
				return true
			}
		})

	// the user has selected cancel from delete dialog
		if (api_response===false || api_response.result===false) {
			console.warn("// unlink_record api_response error ", api_response);
			return false
		}

	/* old
		// update pagination offset
			self.update_pagination_values('remove')

		// refresh
			await self.refresh({
				build_autoload : true // when true, force reset offset
			})
			*/

	// refresh self component
		await self.refresh({
			build_autoload		: true,
			tmp_api_response	: api_response // pass api_response before build to avoid call API again
		})

	// check if the caller has active a tag_id
		if(self.active_tag){
			self.node.classList.add('hide')
			// filter component data by tag_id and re-render content
			self.filter_data_by_tag_id(self.active_tag)
			.then(()=>{
				self.node.classList.remove('hide')
			})
		}

	// event to update the DOM elements of the instance
		event_manager.publish('remove_element_'+self.id, row_key)


	return true
}//end unlink_record



/**
* DELETE_LINKED_RECORD
* Generic section remove in mode 'delete_record'
* @param object options
* {
*	section_tipo : section_tipo,
*	section_id : section_id
* }
* @return bool delete_section_result
*/
component_portal.prototype.delete_linked_record = async function(options) {

	const self = this

	// options
		const section_id		= options.section_id
		const section_tipo		= options.section_tipo
		const caller_dataframe	= options.caller_dataframe || null

	// create the instance of the section called by the row of the portal,
	// section will be in list because it's not necessary get all data, only the instance context to be deleted it.
		const instance_options = {
			model			: 'section',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: 'list',
			lang			: self.lang,
			caller			: self,
			inspector		: false,
			filter			: false
		}
	// get the instance
		const section =	await get_instance(instance_options)

	// create the sqo to be used to find the section will be deleted
		const sqo = {
			section_tipo		: [section_tipo],
			filter_by_locators	: [{
				section_tipo	: section_tipo,
				section_id		: section_id
			}],
			limit				: 1
		}

	// call to the section and delete it
		const delete_section_result = section.delete_section({
			sqo					: sqo,
			delete_mode			: 'delete_record',
			caller_dataframe	: caller_dataframe
		})


	return delete_section_result
}//end delete_linked_record



/**
* EDIT_RECORD_HANDLER
* Unified way to open new window for view/edit
* Event 'button_edit_click' fire this
* On window blur, a event is published
* for dedalo engine sections
* @param object options
* {
* 	section_tipo: oh1
*	section_id : 16
* }
* @return object new_window
*/
component_portal.prototype.edit_record_handler = async function(options) {

	const self = this

	// options
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id

	// engine_request_config. Get current section engine
		const request_config		= self.context.request_config
		const engine_request_config	= request_config.find(el => {
			const sections_tipo = el.sqo.section_tipo.map(item => {
				return item.tipo
			})
			return sections_tipo.includes(section_tipo)
		})
		if (!engine_request_config) {
			// no engine is detected in request_config for section_tipo
			if(SHOW_DEBUG===true) {
				console.warn(')) NO engine_request_config found. edit_record_handler - section_tipo:', section_tipo);
				console.warn(')) edit_record_handler - request_config:', request_config);
			}
			return
		}

	// short vars
		let new_window

	// open window
		if (engine_request_config.api_engine!=='dedalo') {

			// external engines: zenon etc.

			const url = engine_request_config.api_config.ui_base_url + section_id

			// open a new window from external source to view record
			new_window	= open_window({
				url		: url,
				name	: 'external_' + section_id
			})

		}else{

			// dedalo engine

			// open a new window from Dédalo to view/edit record
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: section_tipo,
				section_tipo	: section_tipo,
				id				: section_id,
				mode			: 'edit',
				session_save	: false, // prevent to overwrite current section session
				menu			: false
			})

			const fn_widow_blur = function() {
				// refresh. Get the proper element to refresh based on some criteria.
				// Note that portals in text view are not self refresh able
				function get_edit_caller(instance) {
					if(instance && instance.mode==='edit' && instance.type==='component') {
						return instance
					}
					if(instance.caller && instance.caller.mode==='edit' && instance.caller.type==='component') {
						return instance.caller
					}
					if(instance.caller.caller && instance.caller.caller.mode==='edit' && instance.caller.caller.type==='component') {
						return instance.caller.caller
					}
					// removed 21-12-2023, it create a infinite loop in some cases as component_portal "numisdata77"
					// in numisdata_order_coins tool, when edit the original section
					// else if(instance.caller) {
					// 	return get_edit_caller(instance.caller)
					// }
					return self
				}
				const edit_caller = get_edit_caller(self)
				if (edit_caller) {
					edit_caller.refresh({
						destroy			: false,
						build_autoload	: true
					})
					.then(function(){
						// fire window_bur event
						event_manager.publish('window_bur_'+self.id, self)
					})
				}
			}//end fn_widow_blur
			new_window = open_window({
				url		: url,
				name	: 'record_view_' + section_tipo +'_'+ section_id,
				on_blur : fn_widow_blur
			})
		}

	// button_edit_click event. Subscribed to close current modal if exists (mosaic view case)
		event_manager.publish('button_edit_click', this)


	return new_window
}//end edit_record_handler



/**
* FOCUS_FIRST_INPUT
* Captures ui.component.activate calls
* to prevent default behavior
* @return bool
*/
component_portal.prototype.focus_first_input = function() {

	return true
}//end focus_first_input




// @license-end
