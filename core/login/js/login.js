/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	// import * as instances from '../../common/js/instances.js'
	import {common,create_source} from '../../common/js/common.js'
	import {render_login} from './render_login.js'



/**
* LOGIN
*/
export const login = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.node
	this.ar_instances = []

	this.custom_action_dispatch = null

	this.status

	return true
}//end login



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	login.prototype.edit	= render_login.prototype.edit
	login.prototype.render	= common.prototype.render
	login.prototype.destroy	= common.prototype.destroy
	login.prototype.refresh	= common.prototype.refresh



/**
* INIT
* @return bool
*/
login.prototype.init = async function(options) {

	const self = this

	// instance key used vars
	self.model			= options.model
	self.tipo			= options.tipo
	self.mode			= options.mode
	self.lang			= options.lang

	// DOM
	self.node			= null

	self.events_tokens	= []
	self.context		= options.context	|| null
	self.data			= options.data		|| null
	self.datum			= options.datum		|| null

	self.type			= 'login'
	self.label			= null

	// status update
		self.status = 'initiated'


	return true
}//end init



/**
* BUILD
* @param bool autoload = true
* @return promise
*	bool true
*/
login.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// (!) Note that normally login only needs the context to operate and it is injected from page
	// @see page.instantiate_page_element()
	// because this the autoload here is false instead the true option in other components, section ...
		if (autoload===true) {

			// rqo build.
			// Note that get_login_context don't need previous login action as similar call get_element_context
				const rqo = {
					action : 'get_login_context',
					dd_api : 'dd_utils_api',
					source : create_source(self, null)
				}

			// load data. get context and data
				const api_response = await data_manager.request({
					body : rqo
				})

			// set context and data to current instance
				self.context	= api_response.result.find(element => element.model===self.model);
				self.data		= {}
		}

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			// console.log("__Time to build", self.model, " ms:", performance.now()-t0);
		}

	// status update
		self.status = 'built'


	return true
}//end build



/**
* QUIT
* Close user session
* (!) Note that quit menu event removes local indexedDB menu data before quit
* @param options
* Sample:
* {
* 	caller : { menu {id: 'menu_dd85_dd85_edit_lg-eng'.. }
* }
* @return object api_response
*/
export const quit = async function(options) {

	// data_manager API call
		const api_response = await data_manager.request({
			body : {
				action	: 'quit',
				dd_api	: 'dd_utils_api',
				options	: {}
			}
		})

	// manage result
		if (api_response.result===true) {

			// SAML redirection check
			if (typeof api_response.saml_redirect!=="undefined" && api_response.saml_redirect.length>2) {

				window.location.href = api_response.saml_redirect

			}else{

				window.location.reload(false)
			}

		}else{

			console.error(api_response.msg);
		}


	return api_response
}//end quit



/**
* ACTION_DISPATCH
* After API login call, it's possible to go to some different pages,
* the normal behavior will reload the page to go to the section in session or page caller
* when install the login only need to set the section but it's not necessary load any other page.
* @param object api_response
* @return bool
*/
login.prototype.action_dispatch = async function(api_response) {

	const self = this

	// publish event always
		const event_name = api_response.result===true
			? 'login_successful'
			: 'login_failed'
		event_manager.publish(event_name, api_response)

	// custom_action_dispatch. Injected by caller
		if(self.custom_action_dispatch && typeof self.custom_action_dispatch==='function'){
			return self.custom_action_dispatch(api_response)
		}

	// default behavior
		if (api_response.result===true) {
			// result_options is defined when the user is root or developer and the tools are not loaded
			// it's defined in dd_init_test to force to go to the development area to control the DDBB and ontology version
			if (api_response.result_options && api_response.result_options.redirect) {
				setTimeout(function(){
					window.location.replace(api_response.result_options.redirect)
				}, 2000)
			}else{
				window.location.reload(false);
			}
		}

	return true
}//end action_dispatch
