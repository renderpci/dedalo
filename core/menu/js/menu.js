// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common,create_source} from '../../common/js/common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {quit} from '../../login/js/login.js'
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

	self.tipo			= options.tipo
	self.model			= options.model
	self.node			= null
	self.li_nodes		= []
	self.ul_nodes		= []
	self.ar_instances	= []
	self.mode			= 'edit'
	self.datum			= options.datum
	self.context		= options.context
	self.data			= options.data
	self.events_tokens	= []


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

	if (autoload===true) {

		const menu_cache_data = await data_manager.get_local_db_data(self.id, 'data')

		if(menu_cache_data){

			// set the result to the datum
				self.datum = menu_cache_data.value

			// debug
				// const total = (performance.now()-t0).toFixed(3)
				// if (total>20) {
				// 	// console.warn(msg, total, self);
				// 	console.log("__Time [menu.build] returned menu datum from local_db ", self.id, total);
				// }

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

			// set the result to the datum
				self.datum = api_response.result

			// cache
				const menu_cache_data = {
					id		: self.id,
					value	: self.datum
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

	// fix menu instance as global to be available
		window.menu = self

	// status update
		self.status = 'built'


	return true
}//end build



/**
* OPEN_ONTOLOGY
* Shared function to manage open Ontology window
* from regular menu and mobile menu
* @return void
*/
menu.prototype.open_ontology = function() {
	const url = DEDALO_CORE_URL + '/ontology'
	const win = window.open(url, '_blank');
		  win.focus();
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
		const langs			= page_globals.dedalo_application_langs
		const langs_length	= langs.length
		for (let i = 0; i < langs_length; i++) {
			const lang	= langs[i].value
			const regex	= /lg-[a-z]{2,5}$/
			const id	= self.id.replace(regex, lang)
			await data_manager.delete_local_db_data(id, 'data')
		}
	// exec login quit sequence
		quit({
			caller : self
		})
}//end quit_handler



/**
* SECTION_LABEL_HANDLER
* Shared function to manage section_label.on_click execution (from edit mode)
* from regular menu and mobile menu
* @param object event e
* @return void
*/
menu.prototype.section_label_handler = function(e) {
	e.stopPropagation()
	e.preventDefault();

	const section_label = e.target
	if (typeof section_label.on_click==='function') {
		section_label.on_click(e)
	}
}//end section_label_handler



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



// @license-end