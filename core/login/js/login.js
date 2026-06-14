// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB, DEDALO_API_URL, DEVELOPMENT_SERVER, page_globals */
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
* Manages the Dédalo authentication lifecycle on the client side.
*
* Responsibilities:
* - Render the login form via the delegated render_login prototype methods.
* - Issue the `login` API call and dispatch results (redirect, files-cache warm-up, SAML flow).
* - Provide the `quit` static method for session teardown (SW deregistration, cache purge,
*   preference reset, and redirect).
* - Orchestrate the post-login file-caching animation via run_service_worker or run_worker_cache.
*
* Instance properties are populated by init() and build() — they remain null/undefined until
* those methods run. build() only performs a remote context fetch when autoload===true; the
* normal path receives an already-resolved context injected by page.instantiate_page_element().
*
* The instance is a prototype-assignment module: render and lifecycle methods are copied from
* render_login and common. The static quit() is called directly on the constructor function,
* not on instances.
*/
export const login = function() {

	this.id = null
	this.model = null
	this.tipo = null
	this.mode = null
	this.lang = null
	this.datum = null
	this.context = null
	this.data = null
	this.node = null
	this.ar_instances = []
	this.custom_action_dispatch = null
	this.add_select_lang = null
	this.select_lang = null
	this.status = null
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
* Initialises the login instance with the supplied options.
* Must be called exactly once per instance. A second call is a programming error and will
* log a console error (and an alert in SHOW_DEBUG mode) before returning false.
*
* Sets instance state (model, tipo, mode, lang, context, data, datum, events_tokens) and
* transitions status: null → 'initializing' → 'initialized'.
*
* @param {Object} options - Initialisation options
* @param {string} options.model - Component model identifier (e.g. 'login')
* @param {string} options.tipo - Structure tipo of the component
* @param {string} options.mode - Display mode (e.g. 'edit')
* @param {string} options.lang - Active language code
* @param {boolean} [options.add_select_lang=true] - Whether to include a language selector in the form
* @param {Object|null} [options.context=null] - Pre-resolved context object (injected by page)
* @param {Object|null} [options.data=null] - Pre-resolved data object (injected by page)
* @param {Object|null} [options.datum=null] - Current datum if available
* @param {Function} [options.custom_action_dispatch] - Optional override for post-login dispatch logic
* @returns {Promise<boolean>} true on success, false if a duplicate init is detected
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
* Prepares the login instance for rendering. Transitions status:
* 'initialized' → 'building' → 'built'.
*
* When autoload===true (rare — used when no page injected context is available),
* issues a `get_login_context` API call via dd_utils_api and populates self.context
* from the result. This is intentionally different from most components, which default
* autoload to true: login usually receives context from page.instantiate_page_element()
* so remote fetching is normally unnecessary.
*
* When the context carries a saml_config property, dynamically imports the SAML module
* and attaches a saml instance to self.saml. Import errors are caught and logged without
* aborting the build.
*
* @param {boolean} [autoload=false] - When true, fetch context from API instead of relying on injected context
* @returns {Promise<boolean>} true on success, false if the autoload API call fails
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
				if (!api_response.result) {
					console.error('Error on get login context. api_response:', api_response);
					return false
				}

			// set context and data to current instance
				self.context	= api_response.result.find(element => element.model===self.model);
				self.data		= {}
		}

	// saml
	// If the login context defines a SAML configuration, dynamically load the SAML module
	// and attach it to this instance so the render layer can activate the SSO flow.
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
*
* Sends credentials to dd_utils_api and returns the raw API response. After a successful
* API call, attempts to delete the 'dedalo_files' service-worker cache so that a fresh
* set of assets can be pulled on the next load. Cache deletion failures are caught and
* logged without aborting the call.
*
* Callers should check api_response.result===true before trusting the rest of the response.
* Use action_dispatch() to handle post-login navigation and file loading.
*
* @param {Object} options - Login credentials
* @param {string} options.username - The user's login name
* @param {string} options.auth - The pre-hashed authentication token
* @returns {Promise<Object>} Raw API response object from data_manager.request()
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
	// Purge the service-worker file cache immediately after login so any
	// updated assets are pulled through the new SW registration below.
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
* @see menu.delete_menu_local_db_data()
* If the service worker is registered (this happens when logging in), his registration
* shall be de-registered and the cache deleted.
* At the end, a page reload/redirection is made
*
* Called as a static method: login.quit(). This means `this` is the login constructor,
* not a login instance — the function does not rely on instance state.
*
* Post-quit navigation rules:
* - SAML sessions: follow api_response.saml_redirect (IdP single-logout endpoint).
* - Developer users: reload the current URL (preserves query string for dev tooling).
* - Normal users: redirect to DEDALO_ROOT_WEB to force the default section landing page.
* - Any API failure: also redirect to DEDALO_ROOT_WEB as a safe fallback.
*
* The 'loading' class on document.body is added at entry and removed in the finally block
* so the loading indicator is always cleaned up even if an exception is thrown.
*
* User preference keys cleared from local-DB on successful quit:
*   inspector_time_machine_list, inspector_component_history_block,
*   inspector_relation_list, open_search_panel
*
* @returns {Promise<void>}
*/
login.quit = async function() {

	const self = this

	// set page style as loading
	document.body.classList.add('loading')

	// Fire quit event
	event_manager.publish('quit', self)

	// is_developer. Determine if the user is a developer
	// page_globals may be absent when quit is called from a minimal page (install, etc.)
	const is_developer = typeof page_globals !== 'undefined' ? (page_globals.is_developer ?? false) : false;

	// Dédalo root web. Main http dir for Dédalo files (usually '/dedalo')
	// DEDALO_ROOT_WEB may be absent in non-standard page contexts; fall back to site root.
	const dedalo_root_web = typeof DEDALO_ROOT_WEB !== 'undefined' ? DEDALO_ROOT_WEB : '/'

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
			// These keys hold panel open/closed state and should not persist across sessions.
			[
				'inspector_time_machine_list',
				'inspector_component_history_block',
				'inspector_relation_list',
				'open_search_panel'
			]
			.forEach(el => {
				data_manager.delete_local_db_data(el, 'status')
			})

			// Check for SAML redirection first
			// When the server signals a SAML single-logout redirect, follow it before
			// doing any SW cleanup — the IdP redirect will navigate away regardless.
			if (api_response.saml_redirect && api_response.saml_redirect.length > 2) {
				window.location.href = api_response.saml_redirect;
			}else{
				// Handle service worker unregistration and cache cleanup
				// Handle service worker unregistration if supported
				// to allow update sw.js file and clean the cache
				if ('serviceWorker' in navigator) {
					try {
						// Get all existing service worker registrations
						const registrations = await navigator.serviceWorker.getRegistrations();
						console.log('registrations:', registrations);
						for (const registration of registrations) {
							const unregistered = await registration.unregister();
							console.log('Unregistered serviceWorker:', unregistered);
						}
						// Delete the cache once after all service workers are unregistered
						await caches.delete('dedalo_files');

					} catch (error) {
						console.error('ServiceWorker unregistration failed:', error);
					}
				}
			}

			dd_request_idle_callback(
				() => {
					if (is_developer) {
						// reload window to show the login form without loosing the current URL
						window.location.replace(window.location.href);
					}else{
						// redirect to Dédalo base URL to force access to default user section
						window.location.href = dedalo_root_web
					}
				}
			);

			}else{
				console.error('API call failed:', api_response);
				// redirect to Dédalo base URL to force access to default user section
				window.location.href = dedalo_root_web
			}
	} catch (error) {
		console.error('Error in quit function:', error);
	} finally {
		// Remove loading style from body
		document.body.classList.remove('loading');
	}
}//end quit



/**
* ACTION_DISPATCH
* After API login call, it's possible to go to some different pages,
* the normal behavior will reload the page to go to the section in session or page caller
* when install the login only need to set the section but it's not necessary load any other page.
*
* Handles three distinct post-login outcomes in priority order:
* 1. custom_action_dispatch: if the caller injected its own handler, delegate entirely and return.
* 2. Successful login (api_response.result===true): warm the file cache (via SW or worker),
*    show the animated progress ring, then navigate to the correct page once the worker reports
*    'finish'. Navigation priority: server-supplied redirect → URL ?tipo param → user
*    default_section → plain reload.
* 3. Failed login: publishes 'login_failed' — the render layer is responsible for showing the
*    error message; this function does not navigate on failure.
*
* The 'raspa_loading' CSS class (added to self.node when user_id===-1 on a development server)
* triggers a decorative loading animation reserved for the superuser (DEDALO_SUPERUSER = -1).
*
* @param {Object} api_response - Raw response object returned by login.prototype.login()
* @param {boolean} api_response.result - true on successful authentication
* @param {Object} [api_response.result_options] - Extra data returned on success
* @param {number} [api_response.result_options.user_id] - Numeric ID of the logged-in user;
*   DEDALO_SUPERUSER (-1) activates the raspa_loading animation
* @param {string} [api_response.result_options.user_image] - URL of the user's avatar; falls
*   back to the default Dédalo icon SVG when absent
* @param {string} [api_response.result_options.redirect] - When present, overrides all other
*   navigation targets (used by dd_init_test to force the maintenance area)
* @param {string} [api_response.default_section] - Tipo string for the user's default section
* @param {string} [api_response.saml_redirect] - SAML SSO redirect URL (handled by quit, not here)
* @returns {Promise<boolean>} Always resolves to true
*/
login.prototype.action_dispatch = async function(api_response) {

	const self = this

	// publish event always
	// Subscribers (e.g. analytics, session monitors) can react to both outcomes.
		const event_name = api_response.result===true
			? 'login_successful'
			: 'login_failed'
		event_manager.publish(event_name, api_response)

	// custom_action_dispatch. Injected by caller
	// When a caller (e.g. an embedded login widget inside another page) needs non-default
	// post-login behaviour, it injects a function here that fully replaces the default flow.
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
			// The render layer may show a success banner; clear it before the transition animation starts.
				const component_message = self.node?.content_data?.querySelector('.component_message.ok')
				if (component_message) {
					component_message.classList.add('hide')
				}

			// user image load
			// Preload the avatar so the CSS transition starts only when the image is ready.
			// Falls back to the bundled grey icon if no user image is available.
				const bg_image = (api_response.result_options && api_response.result_options.user_image)
					? api_response.result_options.user_image
					: DEDALO_ROOT_WEB + '/core/themes/default/icons/dedalo_icon_grey.svg'
				if (bg_image) {
					// force preload background image
					const image_loaded = await new Promise(function(resolve){
						const img = document.createElement('img')
						img.addEventListener('load', function() {
							img.remove()
							resolve(true)
						})
						img.addEventListener('error', function() {
							console.error('Error loading image:', bg_image);
							img.remove()
							resolve(false)
						})
						requestAnimationFrame(()=>{
							img.src = bg_image
						})
					});
					// CSS (only set if image preloaded successfully)
					if (image_loaded) {
						self.node.style.setProperty('--user_login_image', `url('${bg_image}')`);
					}
					if (user_id===-1 && is_development_server===true && self.node) {
						self.node.classList.add('raspa_loading')
					}
					// wait for some extra time to allow CSS transitions to be completed
					await new Promise(function(resolve){
						setTimeout(resolve, 160)
					});
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
					// If the current URL already targets a specific section tipo, reloading
					// (rather than replacing with the default section) preserves that intent.
						const urlParams	= new URLSearchParams(window.location.search);
						const has_tipo	= urlParams.has('tipo')

					if (api_response.default_section && !has_tipo) {
						// user has defined default_section case in database
						window.location.replace(
							DEDALO_CORE_URL + '/page/?tipo=' + api_response.default_section
						);
					}else{
						// non defined user default_section case
						window.location.reload();
					}

				}//end load_finish

			// files loader. Circle with progressive fill draw based on percentage of loaded files by worker (updated by messages info)
				const files_loader = render_files_loader()
				if (self.node?.content_data?.top) {
					self.node.content_data.top.appendChild(files_loader)
				}

			// handlers
				// ready handler. Fired when ready status is triggered in workers
				// Shows the progress ring and hides the login form elements.
					const ready_handler = () => {
						// hide things
						if (self.node?.content_data) {
							if (self.node.content_data.select_lang) {
								self.node.content_data.select_lang.classList.add('hide')
							}
							if (self.node.content_data.form) {
								self.node.content_data.form.classList.add('hide')
							}
						}

						// show things
						self.node?.content_data?.top?.classList.remove('hide')

						// raspa_loading Development local only
						// user_id === -1 is DEDALO_SUPERUSER (the root/superuser account).
						// The 'active' class triggers an additional CSS animation in that case.
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
			// Routes SW / worker message events to the appropriate handler above.
			// The three expected statuses correspond to the worker's lifecycle stages.
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
			// (!) use_service_worker defaults to true; it is set to false on development servers
			// to prevent the SW from masking source changes behind stale caches.
			// The condition is inverted: !use_service_worker → run worker cache (no SW).
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
*
* Registers the Dédalo service worker located at DEDALO_ROOT_WEB + '/core/sw.js'.
* Once registered, posts the 'update_files' message so the SW refreshes its cached
* asset list immediately. Attaches the caller-supplied on_message listener to
* navigator.serviceWorker so worker progress events (ready/loading/finish) reach
* the login animation callbacks.
*
* Returns false in any of these situations:
* - The browser does not support service workers ('serviceWorker' not in navigator).
* - registration.active is null when the ready promise resolves (SW installed but not yet active).
* - Any exception thrown during registration.
*
* Service workers require HTTPS (or localhost). Callers should fall back to
* run_worker_cache() when this function returns false.
*
* @param {Object} options - Options object
* @param {Function} options.on_message - Message event handler for SW messages
* @returns {Promise<boolean>} true if registration succeeded, false otherwise
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
			if (registration.installing) {
				console.log('Service worker installing');
			} else if (registration.waiting) {
				console.log('Service worker installed');
			} else if (registration.active) {
				console.log('Service worker active');
			}

			// serviceWorker is ready. Post message 'update_files' to
			// force serviceWorker to reload the Dédalo main files
			navigator.serviceWorker.ready.then((registration) => {
				if (!registration.active) return;
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
*
* Spawns a module Worker from DEDALO_CORE_URL + '/page/js/worker_cache.js' and
* immediately posts a 'clear_cache' action so the worker invalidates its previous
* cache before re-fetching. The api URL is resolved from DEDALO_API_URL when
* available, with a relative fallback for environments where the constant is undefined.
*
* Progress events from the worker ('ready', 'loading', 'finish') are forwarded to the
* on_message handler supplied in options — the same handler shape used by
* run_service_worker — allowing the caller to treat both paths uniformly.
*
* (!) This function does not return the worker instance. The caller cannot terminate
* the worker explicitly; it finishes naturally after posting 'finish'.
*
* @param {Object} options - Options object
* @param {Function} options.on_message - Message event handler receiving worker progress events
* @returns {void}
*/
export const run_worker_cache = (options) => {

	// options unpack
	const {
		on_message
	} = options

	// create a new worker
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
