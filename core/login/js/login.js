// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common, create_source} from '../../common/js/common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
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

	// use_service_worker. default is true
	this.use_service_worker = true
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

	// saml
		const saml_config = self.context?.properties?.saml_config
		if (saml_config) {
			try {
				const {saml} = await import('../saml/js/saml.js')
				self.saml = new saml()
				await self.saml.init({
					caller		: self,
					saml_config	: saml_config
				})
			} catch (error) {
				console.error(error)
			}
		}

	// status update
		self.status = 'built'


	return true
}//end build



/**
* LOGIN
* Exec the login action against the API
* @param object options
* {
* 	username: string
* 	auth: string
* }
* @return object response
*/
login.prototype.login = async function(options) {

	// options
		const username	= options.username
		const auth		= options.auth

	// request
		const api_response = await data_manager.request({
			body : {
				action	: 'login',
				dd_api	: 'dd_utils_api',
				options	: {
					username	: username,
					auth		: auth
				}
			}
		})

	// debug
		if(SHOW_DEBUG===true) {
			console.log('login api_response:', api_response);
		}

	// delete dedalo_files caches (only HTTPS)
		if ('serviceWorker' in navigator) {
			try {

				// delete dedalo_files caches
				await caches.delete('dedalo_files');

			} catch (error) {
				console.error('ServiceWorker delete caches failed:', error);
			}
		}


	return api_response
}//end login



/**
* QUIT
* Close current user session
* (!) Note that quit menu event removes local indexedDB menu data before quit
* @see menu.quit_handler()
* If the service worker is registered (this happens when logging in), his registration
* shall be de-registered and the cache deleted.
* At the end, a page reload/redirection is made
* @param object options = {}
* Sample:
* {
* 	caller : object like: { menu {id: 'menu_dd85_dd85_edit_lg-eng'.. }
* }
* @return void
*/
export const quit = async function(options={}) {

	// set page style as loading
		document.body.classList.add('loading')

	// is_developer. Determine if the user is a developer
		const is_developer = page_globals.is_developer ?? false;

	try {

		// data_manager. Make API call to quit
			const api_response = await data_manager.request({
				body : {
					action	: 'quit',
					dd_api	: 'dd_utils_api',
					options	: {}
				}
			})

		// manage result
			if (api_response.result===true) {

				// reset some user preferences status from local database
				[
					'inspector_time_machine_list',
					'inspector_component_history_block',
					'inspector_relation_list',
					'open_search_panel'
				]
				.map(el => {
					data_manager.delete_local_db_data(el, 'status')
				})

				// unregister serviceWorker
				// Handle service worker unregistration if supported
				// to allow update sw.js file and clean the cache
				if ('serviceWorker' in navigator) {
					try {

						const registration = await navigator.serviceWorker.register(
							DEDALO_ROOT_WEB + '/core/sw.js'
						);

						if (registration) {

							const unregistered = await registration.unregister()
							console.log('Unregistered serviceWorker:', unregistered);

							// delete dedalo_files caches
							await caches.delete('dedalo_files');
						}
					} catch (error) {
						console.error('ServiceWorker unregistration failed:', error);
					}
				}

				// SAML redirection check
				if (api_response.saml_redirect && api_response.saml_redirect.length>2) {

					window.location.href = api_response.saml_redirect

				}else{

					dd_request_idle_callback(
						() => {
							if (is_developer) {
								// reload window to show the login form without loosing the current URL
								window.location.replace(window.location.href);
							}else{
								// redirect to Dédalo base URL to force access to default user section
								window.location.href = DEDALO_ROOT_WEB
							}
						}
					)
				}

			}else{
				console.error('API call failed:', api_response);
				// Remove loading style from body
				document.body.classList.remove('loading');
			}
	} catch (error) {
		console.error('Error in quit function:', error);
		// Remove loading style from body
		document.body.classList.remove('loading');
	}
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

			// short vars
			const user_id				= api_response.result_options?.user_id
			const is_development_server	= typeof DEVELOPMENT_SERVER!=='undefined' && DEVELOPMENT_SERVER===true

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
					// force preload background image
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
							requestAnimationFrame(()=>{
								img.src = bg_image
							})
						})
						.catch((error) => {
							console.error('Error loading image:', bg_image);
							console.error(error);
						});
					})();
					// CSS
					self.node.style.setProperty('--user_login_image', `url('${bg_image}')`);
					if (user_id===-1 && is_development_server===true) {
						self.node.classList.add('raspa_loading')
					}
					// wait for some extra time to allow CSS transitions to be completed
					await (()=>{
						return new Promise(function(resolve){
							setTimeout(function(){
								resolve(true)
							}, 160) // 160
						})
					})();
				}

			// load_finish. Redirects to the proper page after the login
			// Fired by render_files_loader when the worker finishes loading all files.
				const load_finish = () => {

					// api_response.result_options.redirect is set when the user is root or developer and the tools are not registered.
					// It's defined in dd_init_test to force to go to the development area to control the DDBB and ontology version
					if (api_response.result_options?.redirect) {

						dd_request_idle_callback(
							() => {
								window.location.replace( api_response.result_options.redirect )
							}
						)
						return
					}

					// has_tipo in url
						const urlParams	= new URLSearchParams(window.location.search);
						const has_tipo	= urlParams.has('tipo')

					if (api_response.default_section && !has_tipo) {
						// user has defined default_section case in database
						window.location.replace(
							DEDALO_CORE_URL + '/page/?tipo=' + api_response.default_section
						);
					}else{
						// non defined user default_section case
						window.location.reload(false);
					}

				}//end load_finish

			// files loader. Circle with progressive fill draw based on percentage of loaded files by worker (updated by messages info)
				const files_loader = render_files_loader()
				self.node.content_data.top.appendChild(files_loader)

			// handlers
				// ready handler. Fired when ready status is triggered in workers
					const ready_handler = () => {
						// hide things
						if (self.node.content_data.select_lang) {
							self.node.content_data.select_lang.classList.add('hide')
						}
						self.node.content_data.form.classList.add('hide')

						// show things
						self.node.content_data.top.classList.remove('hide')

						// raspa_loading Development local only
						if (user_id===-1) {
							requestAnimationFrame(()=>{
								self.node.classList.add('active')
							})
						}
					}
				// loading handler. Fired when loading status is triggered in workers.
				// Generally, at each file load completion in the list
					const loading_handler = (data) => {
						files_loader.update(data)
					}
				// finish handler. Fired when finish status is triggered in workers
				// Usually when all files are loaded
					const finish_handler = () => {
						// login continue
						dd_request_idle_callback(
							() => {
								load_finish()
							}
						)
					}
			// on_message. Handle worker message events
				const on_message = (event) => {
					switch (event.data.status) {

						case 'ready':
							// set CSS styles and animations to start loading
							ready_handler()
							break;

						case 'loading':
							// send message data to files_loader function
							loading_handler(event.data)
							break;

						case 'finish':
							// The update_files if finish
							// Then, we can continue the login normally
							// reload or redirect the page
							finish_handler()
							break;
					}
				}

			// service worker registry (uses service worker as cache proxy)
				if (!this.use_service_worker) {
					// development server deactivate service worker by default to prevent unwanted caches
					run_worker_cache({
						on_message	: on_message
					})
				}else{
					run_service_worker({
						on_message	: on_message
					})
					.then(function(response){
						// on service worker registration error (not https support for example)
						// fallback to the former method of loading cache files
						if (response===false) {

							// notify error
								const error = location.protocol==='http:'
									? `register_service_worker fails. Protocol '${location.protocol}' is not supported by service workers. Retrying with run_worker_cache.`
									: `register_service_worker fails (${location.protocol}). Retrying with run_worker_cache.`
								console.error(error);

							// launch worker cache (uses regular browser memory cache)
								run_worker_cache({
									on_message	: on_message
								})
						}
					})
				}

		}//end if (api_response.result===true)


	return true
}//end action_dispatch



/**
* RUN_SERVICE_WORKER
* Prepares the service worker to manage the files cache
* and the login sequence (circle animation, etc.)
* @param object options
* {
* 	on_message : function on_message
* }
* @return bool
* 	True if registration succeed, false if fails
*/
export const run_service_worker = async (options) => {

	// options unpack
	const {
		on_message
	} = options

	if ('serviceWorker' in navigator) {
		try {
			// register serviceWorker
			// Once registered, it will be loaded in every page load across the site
			const registration = await navigator.serviceWorker.register(
				DEDALO_ROOT_WEB + '/core/sw.js'
			);

			// debug info about registration status
			switch (registration.installing) {
				case true:
					console.log('Service worker installing');
					break;
				case false:
					if (registration.waiting) {
						console.log('Service worker installed');
					} else if (registration.active) {
						console.log('Service worker active');
					}
					break;
			}

			// serviceWorker is ready. Post message 'update_files' to
			// force serviceWorker to reload the Dédalo main files
			navigator.serviceWorker.ready.then((registration) => {
				console.log('Service worker is ready. Posting message update_files');
				// posting 'update_files' message, tells serviceWorker that cache files
				// must to be updated.
				registration.active.postMessage('update_files')
			});

			// message event listener
			navigator.serviceWorker.addEventListener('message', on_message);

		} catch (error) {
			console.error(`Registration failed with ${error}`);
			return false
		}

		return true
	}

	return false
}//end run_service_worker



/**
* RUN_WORKER_CACHE
* Run worker cache and updates files_loader
* On finish, exec the callback ('load_finish' function)
* Worker cache is used as browser cache proxy, instead the
* default memory cache. This allow improved control about the cached files
* @param object options
* {
* 	on_message : function on_message
* }
* @return void
*/
export const run_worker_cache = (options) => {

	// options unpack
	const {
		on_message
	} = options

	// crate a new worker
	const current_worker = new Worker(DEDALO_CORE_URL + '/page/js/worker_cache.js', {
		type : 'module'
	});

	// posting worker message 'clear_cache'
	current_worker.postMessage({
		action	: 'clear_cache',
		url		: typeof DEDALO_API_URL!=='undefined'
			? DEDALO_API_URL
			: '../../api/v1/json/' // DEDALO_API_URL
	});

	current_worker.addEventListener('message', on_message)
}//end run_worker_cache



// @license-end
