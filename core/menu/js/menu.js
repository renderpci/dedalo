// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common,create_source} from '../../common/js/common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {open_window} from '../../common/js/utils/index.js'
	import {quit} from '../../login/js/login.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {render_menu} from './render_menu.js'



export const menu = function(){

	this.id
	this.tipo
	this.mode
	this.model
	this.lang

	this.section_lang
	this.datum
	this.context
	this.data
	this.node
	this.li_nodes
	this.ul_nodes
	this.events_tokens
	this.caller

	this.ar_instances
}//end menu



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	menu.prototype.render				= common.prototype.render
	menu.prototype.destroy				= common.prototype.destroy
	menu.prototype.refresh				= common.prototype.refresh

	// render
	menu.prototype.list					= render_menu.prototype.edit
	menu.prototype.edit					= render_menu.prototype.edit
	menu.prototype.update_section_label	= render_menu.prototype.update_section_label



/**
* INIT
* @param object options
* @return bool
*/
menu.prototype.init = function(options) {

	const self = this

	self.tipo						= options.tipo
	self.model						= options.model
	self.node						= null
	self.li_nodes					= []
	self.ul_nodes					= []
	self.ar_instances				= []
	self.mode						= 'edit'
	self.datum						= options.datum
	self.context					= options.context
	self.data						= options.data
	self.events_tokens				= []
	self.caller						= options.caller || null
	self.update_section_label_n_try	= 0

	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* @param bool autoload
* @return true
*/
menu.prototype.build = async function(autoload=true) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// autoload
		if (autoload===true) {

			const local_db_id = self.build_local_db_id()
			// try to get existing local DB data
			const menu_cache_data = await data_manager.get_local_db_data(
				local_db_id,
				'data'
			)

			if(menu_cache_data){

				// set the result to the datum
					self.datum = menu_cache_data.value

			}else{

				// rqo build
					// const rqo = {
					// 	action			: 'get_menu',
					// 	dd_api			: 'dd_utils_api',
					// 	source			: create_source(self, null),
					// 	prevent_lock	: true
					// }
					const rqo = {
						action	: 'read',
						source	: create_source(self, 'get_data')
					}

				// load data. get context and data
					const api_response = await data_manager.request({
						body : rqo
					})

					// server: wrong response
					if (!api_response) {
						return false
					}
					// server: bad build context
					if(!api_response.result.context.length){
						console.error("Error!!!!, menu without context:", api_response);
						return false
					}

				// set the result to the datum
					self.datum = api_response.result

				// cache
					const menu_cache_data = {
						id		: local_db_id, // id
						value	: self.datum // value
					}
					data_manager.set_local_db_data(
						menu_cache_data,
						'data'
					)
			}
		}

	// set context and data to current instance
		self.context	= self.datum.context.find(element => element.model===self.model && element.tipo===self.tipo);
		self.data		= self.datum.data.find(element => element.model===self.model &&  element.tipo===self.tipo)

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log(`__Time to build ${self.model} [autoload:${autoload}] ms:`, performance.now()-t0);
		}

	// status update
		self.status = 'built'


	return true
}//end build



/**
* OPEN_ONTOLOGY
* Shared function to manage open Ontology window
* from regular menu and mobile menu
* @param event e
* @return void
*/
menu.prototype.open_ontology = function(e) {
	e.stopPropagation()

	open_window({
		url			: DEDALO_CORE_URL + '/ontology/',
		target		: '_blank',
		features	: 'new_tab'
	})
}//end open_ontology



/**
* QUIT_HANDLER
* Shared function to manage quit sequence
* @param object event e
* @return void
*/
menu.prototype.quit_handler = async function(e) {
	e.stopPropagation()

	const self = this

	// local_db_data remove in all langs
		self.delete_menu_local_db_data()

	// exec login quit sequence
		quit({
			caller : self
		})
}//end quit_handler



/**
* DELETE_MENU_LOCAL_DB_DATA
* Shared function to manage quit sequence
* @param object event e
* @return void
*/
menu.prototype.delete_menu_local_db_data = async function() {

	const self = this

	// local_db_data remove in all langs
		const langs			= page_globals.dedalo_application_langs
		const langs_length	= langs.length
		for (let i = 0; i < langs_length; i++) {
			const lang			= langs[i].value
			const local_db_id	= self.build_local_db_id(lang)
			await data_manager.delete_local_db_data(
				local_db_id,
				'data'
			)
		}
}//end delete_menu_local_db_data



/**
* OPEN_TOOL_USER_ADMIN_HANDLER
* Shared function to manage open tool tool_user_admin
* @param object event e
* @return void
*/
menu.prototype.open_tool_user_admin_handler = function(e) {
	e.stopPropagation();

	const self = this

	// tool_user_admin Get the user_admin tool to be fired
		const tool_user_admin = self.context.tools.find(el => el.model==='tool_user_admin')
		if (!tool_user_admin) {
			console.error('Tool user admin is not available in tools:', self.context.tools);
			return
		}

	// open_tool (tool_common)
		open_tool({
			tool_context	: tool_user_admin,
			caller			: self
		})
}//end open_tool_user_admin_handler



/**
* BUILD_LOCAL_DB_ID
* Unifies function to build the id of the stored local DB value
* It used one for each language as menu_dd85_lg-nep
* @param string lang
* 	Optional. Default page_globals.dedalo_application_lang fallback
* @return void
*/
menu.prototype.build_local_db_id = function(lang) {

	const self = this

	return self.model + '_' + self.tipo + '_' + (lang || page_globals.dedalo_application_lang)
}//end build_local_db_id



// @license-end
