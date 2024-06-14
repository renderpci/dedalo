// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common, create_source} from '../../common/js/common.js'
	import {
		render_login,
		render_files_loader
	} from './render_login.js'



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

	this.custom_action_dispatch
	this.add_select_lang
	this.select_lang

	this.status
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
* @param object options
* @return bool
*/
login.prototype.init = async function(options) {

	const self = this

	// instance key used vars
	self.model					= options.model
	self.tipo					= options.tipo
	self.mode					= options.mode
	self.lang					= options.lang
	self.add_select_lang		= options.add_select_lang ?? true

	// DOM
	self.node					= null

	self.events_tokens			= []
	self.context				= options.context	|| null
	self.data					= options.data		|| null
	self.datum					= options.datum		|| null
	self.custom_action_dispatch	= options.custom_action_dispatch

	self.type					= 'login'
	self.label					= null

	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* @param bool autoload = false
* @return bool
*/
login.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// (!) Note that normally login only needs the context to operate and it is injected from page
	// @see page.instantiate_page_element()
	// because this, the autoload here is false instead the true option in other components, section ...
		if (autoload===true) {

			// rqo build.
			// Note that get_login_context does not need a previous login action as similar call get_element_context
				const rqo = {
					action	: 'get_login_context',
					dd_api	: 'dd_utils_api',
					source	: create_source(self, null)
				}

			// load data. get context and data
				const api_response = await data_manager.request({
					body : rqo
				})
				if(SHOW_DEBUG===true) {
					console.log('login api_response:', api_response);
				}

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

	// set page style as loading
		const main = document.getElementById('main')
		if (main) {
			main.classList.add('loading')
		}

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
			if (typeof api_response.saml_redirect!=='undefined' && api_response.saml_redirect.length>2) {

				window.location.href = api_response.saml_redirect

			}else{

				window.location.reload(false)
			}

		}else{

			console.error(api_response.msg);
		}

	// set page style as loading
		if (main) {
			main.classList.remove('loading')
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
			// stop here !
			return self.custom_action_dispatch(api_response)
		}

	// default behavior
		if (api_response.result===true) {

			// hide component_message OK
				const component_message = self.node.content_data.querySelector('.component_message.ok')
				if (component_message) {
					component_message.classList.add('hide')
				}

			// user image load
				const bg_image = (api_response.result_options && api_response.result_options.user_image)
					? api_response.result_options.user_image
					: DEDALO_ROOT_WEB + '/core/themes/default/icons/dedalo_icon_grey.svg'
				if (bg_image) {
					// force preload image
					await (()=>{
						return new Promise(function(resolve, reject){
							const img = document.createElement('img')
							img.addEventListener('load', function(e) {
								img.remove()
								resolve(true)
							})
							img.addEventListener('error', function(e) {
								reject(false)
							})
							img.src = bg_image
						})
						.catch((error) => {
							console.error('Error loading image:', bg_image);
							console.error(error);
						});
					})();
					// CSS
					self.node.style.setProperty('--user_login_image', `url('${bg_image}')`);
					if (api_response.result_options?.user_id && api_response.result_options?.user_id===-1 && DEVELOPMENT_SERVER===true) {
						self.node.classList.add('raspa_loading')
					}
					await (()=>{
						return new Promise(function(resolve){
							setTimeout(function(){
								resolve(true)
							}, 160) // 160
						})
					})();
				}

			// load_finish. Fired by render_files_loader when worker finish to load all files
				const load_finish = function() {
					// result_options is defined when the user is root or developer and the tools are not loaded
					// it's defined in dd_init_test to force to go to the development area to control the DDBB and ontology version
					if (api_response.result_options && api_response.result_options.redirect) {

						setTimeout(function(){
							window.location.replace( api_response.result_options.redirect )
						}, 3)

					}else{

						// has_tipo in url
							const queryString	= window.location.search
							const urlParams		= new URLSearchParams(queryString);
							const has_tipo		= urlParams.has('tipo')

						if (api_response.default_section && !has_tipo) {
							// user defined default_section case
							window.location.replace( DEDALO_CORE_URL + '/page/?tipo=' + api_response.default_section );
						}else{
							window.location.reload(false);
						}
					}
				}//end load_finish

			// files loader. Circle with progressive fill draw based on percentage of loaded files by worker (by messages info)
				const files_loader = render_files_loader({
					on_load_finish : load_finish
				})
				self.node.content_data.top.appendChild(files_loader)

			// launch worker cache
				const current_worker = new Worker(DEDALO_CORE_URL + '/page/js/worker_cache.js', {
					type : 'module'
				});
				current_worker.postMessage({
					action	: 'clear_cache',
					url		: typeof DEDALO_API_URL!=='undefined'
						? DEDALO_API_URL
						: '../../api/v1/json/' // DEDALO_API_URL
				});
				current_worker.onmessage = function(e) {

					if (e.data.status==='ready') {
						// hide things
						if (self.node.content_data.select_lang) {
							self.node.content_data.select_lang.classList.add('hide')
						}
						self.node.content_data.form.classList.add('hide')
						// self.node.content_data.info_container.classList.add('hide')

						// show things
						self.node.content_data.top.classList.remove('hide')

						// raspa_loading Development local only
						if (api_response.result_options?.user_id && api_response.result_options?.user_id===-1) {
							self.node.classList.add('active')
						}
					}

					// send message data to files_loader function
					files_loader.update(e.data)

					if (e.data.status==='finish') {
						// login continue
						setTimeout(function(){
							load_finish()
						}, 450)
					}
				}
				// load_finish()
		}//end if (api_response.result===true) {


	return true
}//end action_dispatch



// @license-end
