// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



// imports
	import {common,create_source} from '../../common/js/common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {open_window} from '../../common/js/utils/index.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {render_menu, render_section_label} from './render_menu.js'



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
	// menu.prototype.refresh			= common.prototype.refresh

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

	// set vars
		self.tipo						= options.tipo || 'dd85'
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
	// event quit
		const quit_handler = () => {
			// local_db_data remove in all langs
			self.delete_menu_local_db_data()
		}
		self.events_tokens.push(
			event_manager.subscribe('quit', quit_handler)
		)

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
					if(!api_response.result.context?.length){
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
* REFRESH
* Deletes the local menu database and call common refresh
* @param object options = {}
* @return bool
*/
menu.prototype.refresh = async function(options={}) {

	const self = this

	// options
		const build_autoload = options.build_autoload ?? true

	// delete local DB data to force re-create the menu
		if (build_autoload===true) {
			await self.delete_menu_local_db_data()
		}

	// call the generic common refresh
		const common_init = await common.prototype.refresh.call(this, options);


	return common_init
}//end refresh



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
		url			: DEDALO_CORE_URL + '/ontology/v5/',
		target		: '_blank',
		features	: 'new_tab'
	})
}//end open_ontology



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
* @return void
*/
menu.prototype.open_tool_user_admin_handler = function() {

	const self = this

	// tool_user_admin Get the user_admin tool to be fired
		const tool_user_admin = self.context.tools.find(el => el.model==='tool_user_admin')
		if (!tool_user_admin) {
			console.error('Tool user admin is not available in tools. Check your user profile tools:', self.context.tools);
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

	// user id. Logged user id
	const user_id = page_globals?.user_id || ''

	// lang cascade fallback
	lang = lang || page_globals?.dedalo_application_lang || ''

	const version = page_globals.dedalo_version || 'unknown'

	// id composition
	const id = `${self.model}_${self.tipo}_${lang}_${version}_${user_id}`


	return id
}//end build_local_db_id



/**
* UPDATE_SECTION_LABEL
* Change the menu section label value
* Is called from section when rendering is finished
* @param object options
* {
*  value : string as 'Oral History',
*  mode : string as 'edit',
*  section_label_on_click : callback function
* }
* @return bool
*/
menu.prototype.update_section_label = function(options) {

	const self = this

	// options
		const value						= options.value || ''
		const mode						= options.mode
		const section_label_on_click	= options.section_label_on_click

	// check availability
		const update_section_label_n_try = self.update_section_label_n_try ?? 0
		if (!self.node) {
			if (update_section_label_n_try>=3) {
				console.warn('Error: menu node is not available.', self);
				return
			}
			self.update_section_label_n_try++
			console.warn('Warning: menu node is not available yet. Trying again ', update_section_label_n_try);
			setTimeout(function(){
				self.update_section_label(options)
			}, 1000)
			return false
		}
		if (!self.node.content_data.section_label) {
			console.warn('Warning: Invalid menu node section_label.', self.node.content_data.section_label);
			return false
		}

	// reset self.update_section_label_n_try
		self.update_section_label_n_try = 0

	// pointers get
		const section_label				= self.node.content_data.section_label
		const button_toggle_inspector	= self.node.content_data.button_toggle_inspector

	// new_section_label
		const new_section_label = render_section_label(self)
		new_section_label.insertAdjacentHTML('afterbegin', value);
		section_label.replaceWith(new_section_label);
		// re-set pointers
		self.node.content_data.section_label = new_section_label

	// toggle inspector view
		if (mode==='edit') {
			if (typeof section_label_on_click==='function') {
				new_section_label.addEventListener('mousedown', section_label_on_click)
			}
			// hide button inspector
			button_toggle_inspector.classList.remove('no_visible')
			// enable section_label user click
			new_section_label.classList.remove('inactive')
		}else{
			// show button inspector
			button_toggle_inspector.classList.add('no_visible')
			// disable section_label user click
			new_section_label.classList.add('inactive')
		}


	return true
}//end update_section_label



/**
* CHANGE_LANG
* Exec API request of selected lang (e.target.value)
* @param object options
* 	{
* 		lang_type	: 'dedalo_data_lang',
*		lang_value	: 'lg-spa'
* 	}
* @return promise
* 	API request response
*/
menu.prototype.change_lang = async function(options) {

	// options
		const lang_type		= options.lang_type
		const lang_value	= options.lang_value

	// api call
		const api_response = await data_manager.request({
			use_worker	: true,
			body		: {
				action	: 'change_lang',
				dd_api	: 'dd_utils_api',
				options	: {
					[lang_type] : lang_value
				}
			}
		})


	return api_response
}//end change_lang



// @license-end
